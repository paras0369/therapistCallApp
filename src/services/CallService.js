import io from 'socket.io-client';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { SOCKET_URL } from '../config/api';
import AuthService from './AuthService';

class CallService {
  constructor() {
    this.socket = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isConnected = false;
    this.currentCallId = null;
    this.callStartTime = null;
    this.iceCandidateQueue = [];
    this.isNegotiating = false;
    this.disconnectionTimeout = null;
    this.callEndedByUser = false;
    
    // Reconnection properties
    this.reconnectionAttempts = 0;
    this.maxReconnectionAttempts = 5;
    this.reconnectionDelay = 1000; // Start with 1 second
    this.maxReconnectionDelay = 30000; // Max 30 seconds
    this.reconnectionTimer = null;
    this.isReconnecting = false;
    this.authData = null; // Store auth data for reconnection
    
    // Connection monitoring
    this.connectionCheckInterval = null;
    this.lastHeartbeat = null;
    this.heartbeatInterval = 30000; // 30 seconds
    
    // Callbacks for reconnection events
    this.onReconnecting = null;
    this.onReconnected = null;
    this.onReconnectionFailed = null;
  }

  async initialize() {
    const token = await AuthService.getAuthToken();
    const userId = await AuthService.getUserId();
    const userType = await AuthService.getUserType();

    // Store auth data for reconnection
    this.authData = {
      token,
      userId,
      userType,
    };

    this.socket = io(SOCKET_URL, {
      auth: this.authData,
      autoConnect: true,
      reconnection: false, // We'll handle reconnection manually
    });

    this.setupSocketListeners();
    this.setupPeerConnection();
    this.startConnectionMonitoring();
  }

  setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to signaling server');
      this.isConnected = true;
      this.lastHeartbeat = Date.now();
      
      // Reset reconnection state on successful connection
      if (this.isReconnecting) {
        console.log('Reconnection successful');
        this.isReconnecting = false;
        this.reconnectionAttempts = 0;
        this.reconnectionDelay = 1000;
        this.clearReconnectionTimer();
        this.onReconnected?.();
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from signaling server:', reason);
      this.isConnected = false;
      
      // Only attempt reconnection if not manually disconnected and during an active call
      if (reason !== 'io client disconnect' && !this.callEndedByUser) {
        this.attemptReconnection(reason);
      }
    });

    // Add heartbeat/ping handling
    this.socket.on('pong', () => {
      this.lastHeartbeat = Date.now();
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      if (!this.isReconnecting) {
        this.attemptReconnection('connection_error');
      }
    });

    this.socket.on('call-request', async data => {
      console.log('Received call-request event:', data);
      
      // Only therapists should receive call-request events
      const userType = await AuthService.getUserType();
      if (userType !== 'therapist') {
        console.log('Ignoring call-request - user is not a therapist');
        return;
      }
      
      this.handleIncomingCall(data);
    });

    this.socket.on('call-accepted', data => {
      this.handleCallAccepted(data);
    });

    this.socket.on('call-rejected', data => {
      this.handleCallRejected(data);
    });

    this.socket.on('call-ended', data => {
      this.handleCallEnded(data);
    });

    this.socket.on('ice-candidate', data => {
      this.handleIceCandidate(data);
    });

    this.socket.on('offer', data => {
      this.handleOffer(data);
    });

    this.socket.on('answer', data => {
      this.handleAnswer(data);
    });
  }

  setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'balanced',
      rtcpMuxPolicy: 'require',
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle ICE candidate events
    this.peerConnection.onicecandidate = event => {
      if (event.candidate && this.socket && this.currentCallId) {
        console.log('Sending ICE candidate');
        this.socket.emit('ice-candidate', {
          candidate: event.candidate,
          callId: this.currentCallId,
        });
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = event => {
      console.log('Received remote track');
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStreamReceived?.(this.remoteStream);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'failed') {
        this.restartIce();
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(
        'ICE connection state:',
        this.peerConnection.iceConnectionState,
      );
      this.onIceConnectionStateChange?.(this.peerConnection.iceConnectionState);

      // Handle different ICE connection states
      if (
        this.peerConnection.iceConnectionState === 'connected' ||
        this.peerConnection.iceConnectionState === 'completed'
      ) {
        console.log('WebRTC connection established successfully');
      } else if (this.peerConnection.iceConnectionState === 'failed') {
        console.log('ICE connection failed, attempting restart');
        this.restartIce();
      } else if (this.peerConnection.iceConnectionState === 'disconnected') {
        console.log('ICE connection disconnected');
        // Set a timeout to trigger connection lost if no proper end call message received
        this.disconnectionTimeout = setTimeout(() => {
          if (this.currentCallId && !this.callEndedByUser) {
            console.log('Connection timeout - no proper end call message received');
            this.onCallEnded?.({ reason: 'Connection lost' });
          }
        }, 3000); // Wait 3 seconds for proper end call message
      }
    };

    // Handle negotiation needed
    this.peerConnection.onnegotiationneeded = async () => {
      console.log('Negotiation needed');
      if (!this.isNegotiating && this.currentCallId) {
        this.isNegotiating = true;
        try {
          // Only create offer if we're the caller (user) and call was accepted
          const userType = await AuthService.getUserType();
          if (userType === 'user') {
            console.log(
              'User detected, will create offer after call acceptance',
            );
          }
        } catch (error) {
          console.error('Negotiation error:', error);
        } finally {
          this.isNegotiating = false;
        }
      }
    };
  }

  async checkPermissions() {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message:
              'This app needs access to your microphone to make voice calls.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Microphone permission denied');
        }

        return true;
      } catch (error) {
        console.error('Permission check failed:', error);
        throw error;
      }
    }
    return true;
  }

  async getLocalStream() {
    try {
      // Check permissions first
      await this.checkPermissions();

      // More specific constraints to prevent crashes
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      };

      console.log('Requesting user media with constraints:', constraints);
      this.localStream = await mediaDevices.getUserMedia(constraints);
      console.log('Successfully got local stream');

      return this.localStream;
    } catch (error) {
      console.error('Error getting local stream:', error);
      if (
        error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError'
      ) {
        Alert.alert(
          'Permission Required',
          'Microphone access is required for voice calls. Please enable microphone permission in your device settings.',
          [{ text: 'OK' }],
        );
      }
      throw error;
    }
  }

  async startCall(therapistId) {
    try {
      console.log('Starting call to therapist:', therapistId);

      // Prevent duplicate calls
      if (this.currentCallId) {
        console.log('Call already in progress, ignoring duplicate request');
        return { success: false, error: 'Call already in progress' };
      }

      // Always ensure we have a fresh peer connection for new calls
      if (!this.peerConnection || this.peerConnection.connectionState === 'closed' || this.peerConnection.connectionState === 'failed') {
        console.log('Setting up fresh peer connection for new call');
        this.setupPeerConnection();
      }

      // Only prepare local stream, don't start peer connection yet
      await this.getLocalStream();

      const callData = {
        therapistId,
        callType: 'voice',
      };

      this.socket.emit('initiate-call', callData);

      return { success: true };
    } catch (error) {
      console.error('Error starting call:', error);
      this.cleanup();
      return { success: false, error: error.message };
    }
  }

  async acceptCall(callId) {
    try {
      console.log('Accepting call:', callId);
      this.currentCallId = callId;
      this.callStartTime = new Date();

      // Get local stream first
      await this.getLocalStream();

      // Now add tracks to peer connection for both parties
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        this.peerConnection.addTrack(track, this.localStream);
      });

      this.socket.emit('accept-call', { callId });

      return { success: true };
    } catch (error) {
      console.error('Error accepting call:', error);
      this.cleanup();
      return { success: false, error: error.message };
    }
  }

  rejectCall(callId) {
    this.socket.emit('reject-call', { callId });
  }

  endCall() {
    if (this.currentCallId) {
      this.callEndedByUser = true; // Mark that user ended the call
      const callDuration = this.callStartTime
        ? Math.ceil((new Date() - this.callStartTime) / 60000)
        : 0;

      this.socket.emit('end-call', {
        callId: this.currentCallId,
        duration: callDuration,
        endedBy: 'user', // Track who ended the call
      });

      this.cleanup();
    }
  }

  async handleIncomingCall(data) {
    this.currentCallId = data.callId;
    this.onIncomingCall?.(data);
  }

  async createAndSendOffer() {
    try {
      console.log('Creating offer for call:', this.currentCallId);
      console.log(
        'Current signaling state:',
        this.peerConnection.signalingState,
      );

      if (this.peerConnection.signalingState !== 'stable') {
        console.log('Cannot create offer - signaling state not stable');
        return;
      }

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log('Set local description (offer)');
      console.log(
        'Local description type:',
        this.peerConnection.localDescription?.type,
      );

      this.socket.emit('offer', {
        offer,
        callId: this.currentCallId,
      });
      console.log('Offer sent to server');
    } catch (error) {
      console.error('Error creating offer:', error);
      throw error;
    }
  }

  async handleCallAccepted(data) {
    try {
      console.log('Call accepted:', data);
      this.currentCallId = data.callId;
      this.callStartTime = new Date();

      // Now add tracks to peer connection for the user (caller)
      const userType = await AuthService.getUserType();
      if (userType === 'user' && this.localStream) {
        this.localStream.getTracks().forEach(track => {
          console.log('Adding track to peer connection:', track.kind);
          this.peerConnection.addTrack(track, this.localStream);
        });
      }

      // Set connection timeout
      this.negotiationTimeout = setTimeout(() => {
        if (
          this.peerConnection?.iceConnectionState !== 'connected' &&
          this.peerConnection?.iceConnectionState !== 'completed'
        ) {
          console.log('Connection timeout - cleaning up');
          this.onCallEnded?.({ reason: 'Connection timeout' });
        }
      }, 30000); // 30 second timeout

      // Only create offer if we're the user (caller)
      if (userType === 'user') {
        // Small delay to ensure both parties have their streams ready
        setTimeout(async () => {
          try {
            await this.createAndSendOffer();
          } catch (error) {
            console.error('Error creating offer:', error);
            this.onCallEnded?.({ reason: 'Failed to establish connection' });
          }
        }, 1000);
      }

      this.onCallAccepted?.(data);
    } catch (error) {
      console.error('Error handling call accepted:', error);
    }
  }

  handleCallRejected(data) {
    console.log('Call rejected, cleaning up service state');
    // Ensure we fully reset the service state
    this.currentCallId = null;
    this.callStartTime = null;
    this.callEndedByUser = false;
    this.cleanup();
    this.onCallRejected?.(data);
  }

  handleCallEnded(data) {
    // Clear the disconnection timeout since we received proper end call message
    if (this.disconnectionTimeout) {
      clearTimeout(this.disconnectionTimeout);
      this.disconnectionTimeout = null;
    }
    this.cleanup();
    this.onCallEnded?.(data);
  }

  async handleOffer(data) {
    try {
      console.log('Handling offer');

      if (this.peerConnection.signalingState !== 'stable') {
        console.log(
          'Signaling state not stable, current state:',
          this.peerConnection.signalingState,
        );
        return;
      }

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.offer),
      );
      console.log('Set remote description (offer)');

      await this.processQueuedCandidates();

      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(answer);
      console.log('Set local description (answer)');

      this.socket.emit('answer', {
        answer,
        callId: data.callId,
      });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }

  async handleAnswer(data) {
    try {
      console.log('Handling answer');

      if (this.peerConnection.signalingState !== 'have-local-offer') {
        console.log(
          'Invalid signaling state for answer:',
          this.peerConnection.signalingState,
        );
        return;
      }

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer),
      );
      console.log('Set remote description (answer)');

      await this.processQueuedCandidates();
      this.isNegotiating = false;
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  async processQueuedCandidates() {
    console.log(
      `Processing ${this.iceCandidateQueue.length} queued ICE candidates`,
    );
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      try {
        if (this.peerConnection.remoteDescription) {
          await this.peerConnection.addIceCandidate(
            new RTCIceCandidate(candidate),
          );
          console.log('Successfully added queued ICE candidate');
        } else {
          console.log('Remote description not set, re-queuing candidate');
          this.iceCandidateQueue.unshift(candidate);
          break;
        }
      } catch (error) {
        console.error('Error adding queued ICE candidate:', error);
      }
    }
  }

  async handleIceCandidate(data) {
    try {
      if (this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(data.candidate),
        );
      } else {
        this.iceCandidateQueue.push(data.candidate);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  restartIce() {
    try {
      console.log('Restarting ICE');
      this.peerConnection.restartIce();
    } catch (error) {
      console.error('Error restarting ICE:', error);
    }
  }

  // Connection monitoring methods
  startConnectionMonitoring() {
    this.connectionCheckInterval = setInterval(() => {
      this.checkConnection();
    }, this.heartbeatInterval);
  }

  stopConnectionMonitoring() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  checkConnection() {
    if (!this.socket || !this.isConnected) {
      return;
    }

    const now = Date.now();
    if (this.lastHeartbeat && (now - this.lastHeartbeat) > this.heartbeatInterval * 2) {
      console.warn('Heartbeat timeout, connection may be lost');
      if (!this.isReconnecting) {
        this.attemptReconnection('heartbeat_timeout');
      }
    } else {
      // Send ping to check connection
      this.socket.emit('ping');
    }
  }

  // Reconnection methods
  attemptReconnection(reason) {
    if (this.isReconnecting || this.reconnectionAttempts >= this.maxReconnectionAttempts) {
      if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
        console.error('Max reconnection attempts reached');
        this.onReconnectionFailed?.('Max reconnection attempts reached');
      }
      return;
    }

    this.isReconnecting = true;
    this.reconnectionAttempts++;
    
    console.log(`Attempting reconnection ${this.reconnectionAttempts}/${this.maxReconnectionAttempts} due to: ${reason}`);
    this.onReconnecting?.(this.reconnectionAttempts, reason);

    this.reconnectionTimer = setTimeout(() => {
      this.performReconnection();
    }, this.reconnectionDelay);

    // Exponential backoff with jitter
    this.reconnectionDelay = Math.min(
      this.reconnectionDelay * 2 + Math.random() * 1000,
      this.maxReconnectionDelay
    );
  }

  async performReconnection() {
    try {
      console.log('Performing reconnection...');
      
      // Disconnect existing socket if it exists
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      }

      // Create new socket connection
      this.socket = io(SOCKET_URL, {
        auth: this.authData,
        autoConnect: true,
        reconnection: false,
        forceNew: true, // Force new connection
      });

      this.setupSocketListeners();
      
      // Wait for connection
      await this.waitForConnection();
      
      console.log('Reconnection successful');
      
    } catch (error) {
      console.error('Reconnection failed:', error);
      
      if (this.reconnectionAttempts < this.maxReconnectionAttempts) {
        // Try again
        this.attemptReconnection('reconnection_failed');
      } else {
        this.isReconnecting = false;
        this.onReconnectionFailed?.(error.message);
      }
    }
  }

  waitForConnection(timeout = 10000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeout);

      const checkConnection = () => {
        if (this.isConnected) {
          clearTimeout(timeoutId);
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  clearReconnectionTimer() {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
  }

  // Enhanced WebRTC reconnection
  async reconnectPeerConnection() {
    if (!this.peerConnection || !this.currentCallId) {
      return;
    }

    try {
      console.log('Attempting to reconnect peer connection...');
      
      // Try ICE restart first
      this.restartIce();
      
      // If ICE restart doesn't work, recreate the connection
      setTimeout(async () => {
        if (this.peerConnection.iceConnectionState === 'failed') {
          console.log('ICE restart failed, recreating peer connection...');
          await this.recreatePeerConnection();
        }
      }, 5000);
      
    } catch (error) {
      console.error('Error reconnecting peer connection:', error);
    }
  }

  async recreatePeerConnection() {
    try {
      const oldConnection = this.peerConnection;
      
      // Setup new peer connection
      this.setupPeerConnection();
      
      // Re-add local stream if available
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }
      
      // Close old connection
      if (oldConnection) {
        oldConnection.close();
      }
      
      console.log('Peer connection recreated successfully');
      
    } catch (error) {
      console.error('Error recreating peer connection:', error);
      throw error;
    }
  }

  // Setter methods for reconnection callbacks
  setOnReconnecting(callback) {
    this.onReconnecting = callback;
  }

  setOnReconnected(callback) {
    this.onReconnected = callback;
  }

  setOnReconnectionFailed(callback) {
    this.onReconnectionFailed = callback;
  }

  cleanup() {
    console.log('Cleaning up call service, currentCallId:', this.currentCallId);

    // Clear any pending timers or intervals
    if (this.negotiationTimeout) {
      clearTimeout(this.negotiationTimeout);
      this.negotiationTimeout = null;
    }
    
    if (this.disconnectionTimeout) {
      clearTimeout(this.disconnectionTimeout);
      this.disconnectionTimeout = null;
    }

    // Clear reconnection timers
    this.clearReconnectionTimer();
    this.stopConnectionMonitoring();
    
    // Reset reconnection state
    this.isReconnecting = false;
    this.reconnectionAttempts = 0;
    this.reconnectionDelay = 1000;

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => {
        track.stop();
      });
      this.remoteStream = null;
    }

    if (this.peerConnection) {
      // Remove all event listeners to prevent memory leaks
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onnegotiationneeded = null;

      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Reset call state
    this.currentCallId = null;
    this.callStartTime = null;
    this.iceCandidateQueue = [];
    this.isNegotiating = false;
    this.callEndedByUser = false;
    
    console.log('Call service cleanup complete');
  }

  disconnect() {
    this.callEndedByUser = true; // Prevent reconnection on manual disconnect
    this.cleanup();
    this.stopConnectionMonitoring();
    this.clearReconnectionTimer();
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.isReconnecting = false;
  }

  setOnIncomingCall(callback) {
    this.onIncomingCall = callback;
  }

  setOnCallAccepted(callback) {
    this.onCallAccepted = callback;
  }

  setOnCallRejected(callback) {
    this.onCallRejected = callback;
  }

  setOnCallEnded(callback) {
    this.onCallEnded = callback;
  }

  setOnRemoteStreamReceived(callback) {
    this.onRemoteStreamReceived = callback;
  }

  setOnIceConnectionStateChange(callback) {
    this.onIceConnectionStateChange = callback;
  }
}

export default new CallService();
