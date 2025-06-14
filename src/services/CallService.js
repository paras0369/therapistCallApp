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
    this.callEndedByUser = false;
    
    // Simplified timeout handling
    this.connectionTimeout = null;
    this.negotiationTimeout = null;
    
    // Event callbacks
    this.onIncomingCall = null;
    this.onCallAccepted = null;
    this.onCallRejected = null;
    this.onCallEnded = null;
    this.onRemoteStreamReceived = null;
    this.onIceConnectionStateChange = null;
    this.onConnectionStateChange = null;
  }

  async initialize() {
    try {
      const token = await AuthService.getAuthToken();
      const userId = await AuthService.getUserId();
      const userType = await AuthService.getUserType();

      if (!token || !userId || !userType) {
        throw new Error('Authentication data not available');
      }

      this.socket = io(SOCKET_URL, {
        auth: { token, userId, userType },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
        timeout: 10000,
      });

      this.setupSocketListeners();
      this.setupPeerConnection();

      // Wait for connection
      await this.waitForConnection();
      console.log('CallService initialized successfully');
    } catch (error) {
      console.error('Failed to initialize CallService:', error);
      throw error;
    }
  }

  waitForConnection(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeout);

      const onConnect = () => {
        clearTimeout(timeoutId);
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
        resolve();
      };

      const onError = (error) => {
        clearTimeout(timeoutId);
        this.socket.off('connect', onConnect);
        this.socket.off('connect_error', onError);
        reject(error);
      };

      this.socket.on('connect', onConnect);
      this.socket.on('connect_error', onError);
    });
  }

  setupSocketListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to signaling server');
      this.isConnected = true;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from signaling server:', reason);
      this.isConnected = false;
      
      // If we have an active call and it wasn't ended by user, notify about connection loss
      if (this.currentCallId && !this.callEndedByUser) {
        console.log('Connection lost during call');
        this.onConnectionStateChange?.('disconnected');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.isConnected = false;
    });

    this.socket.on('call-request', async (data) => {
      console.log('Received call-request event:', data);
      
      // Only therapists should receive call-request events
      const userType = await AuthService.getUserType();
      if (userType !== 'therapist') {
        console.log('Ignoring call-request - user is not a therapist');
        return;
      }
      
      this.handleIncomingCall(data);
    });

    this.socket.on('call-accepted', (data) => {
      this.handleCallAccepted(data);
    });

    this.socket.on('call-rejected', (data) => {
      this.handleCallRejected(data);
    });

    this.socket.on('call-ended', (data) => {
      this.handleCallEnded(data);
    });

    this.socket.on('ice-candidate', (data) => {
      this.handleIceCandidate(data);
    });

    this.socket.on('offer', (data) => {
      this.handleOffer(data);
    });

    this.socket.on('answer', (data) => {
      this.handleAnswer(data);
    });
  }

  setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'balanced',
      rtcpMuxPolicy: 'require',
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle ICE candidate events
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket?.connected && this.currentCallId) {
        console.log('Sending ICE candidate');
        this.socket.emit('ice-candidate', {
          candidate: event.candidate,
          callId: this.currentCallId,
        });
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track');
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStreamReceived?.(this.remoteStream);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const state = this.peerConnection.connectionState;
      console.log('Connection state:', state);
      this.onConnectionStateChange?.(state);
      
      if (state === 'failed') {
        console.log('Connection failed');
        this.handleConnectionFailure();
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const state = this.peerConnection.iceConnectionState;
      console.log('ICE connection state:', state);
      this.onIceConnectionStateChange?.(state);

      if (state === 'connected' || state === 'completed') {
        console.log('WebRTC connection established successfully');
        this.clearTimeouts();
      } else if (state === 'failed') {
        console.log('ICE connection failed');
        this.handleConnectionFailure();
      } else if (state === 'disconnected') {
        console.log('ICE connection disconnected');
        this.handleConnectionLoss();
      }
    };

    // Handle negotiation needed
    this.peerConnection.onnegotiationneeded = () => {
      console.log('Negotiation needed');
      // Let the call flow handle this explicitly
    };
  }

  handleConnectionFailure() {
    if (this.currentCallId && !this.callEndedByUser) {
      console.log('Connection failed, ending call');
      this.onCallEnded?.({ reason: 'Connection failed' });
    }
  }

  handleConnectionLoss() {
    // Give some time for reconnection
    this.connectionTimeout = setTimeout(() => {
      if (this.currentCallId && !this.callEndedByUser) {
        console.log('Connection lost, ending call');
        this.onCallEnded?.({ reason: 'Connection lost' });
      }
    }, 5000);
  }

  clearTimeouts() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.negotiationTimeout) {
      clearTimeout(this.negotiationTimeout);
      this.negotiationTimeout = null;
    }
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

      // Stop existing stream if any
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      };

      console.log('Requesting user media...');
      this.localStream = await mediaDevices.getUserMedia(constraints);
      console.log('Successfully got local stream');

      return this.localStream;
    } catch (error) {
      console.error('Error getting local stream:', error);
      
      let errorMessage = 'Failed to access microphone';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone access is required for voice calls. Please enable microphone permission in your device settings.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found on this device.';
      }
      
      Alert.alert('Permission Required', errorMessage, [{ text: 'OK' }]);
      throw new Error(errorMessage);
    }
  }

  async startCall(therapistId) {
    try {
      console.log('Starting call to therapist:', therapistId);

      // Always reset state before starting a new call to ensure clean state
      if (this.currentCallId) {
        console.log('Resetting existing call state before new call');
        this.resetCallState();
      }

      // Check socket connection
      if (!this.socket?.connected) {
        return { success: false, error: 'Not connected to server' };
      }

      // Reset any previous state
      this.callEndedByUser = false;
      this.clearTimeouts();

      // Ensure fresh peer connection
      if (!this.peerConnection || 
          this.peerConnection?.connectionState === 'closed' || 
          this.peerConnection?.connectionState === 'failed') {
        console.log('Setting up fresh peer connection');
        this.setupPeerConnection();
      }

      // Get local stream
      await this.getLocalStream();

      // Send call initiation request
      this.socket.emit('initiate-call', {
        therapistId,
        callType: 'voice',
      });

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
      
      if (!this.socket?.connected) {
        return { success: false, error: 'Not connected to server' };
      }

      this.currentCallId = callId;
      this.callStartTime = new Date();
      this.callEndedByUser = false;
      this.clearTimeouts();

      // Ensure fresh peer connection
      if (!this.peerConnection || 
          this.peerConnection?.connectionState === 'closed' || 
          this.peerConnection?.connectionState === 'failed') {
        console.log('Setting up fresh peer connection');
        this.setupPeerConnection();
      }

      // Get local stream
      await this.getLocalStream();

      // Add tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Accept the call
      this.socket.emit('accept-call', { callId });

      return { success: true };
    } catch (error) {
      console.error('Error accepting call:', error);
      this.cleanup();
      return { success: false, error: error.message };
    }
  }

  rejectCall(callId) {
    if (this.socket?.connected) {
      this.socket.emit('reject-call', { callId });
    }
    this.cleanup();
  }

  endCall() {
    if (!this.currentCallId) {
      return;
    }

    console.log('Ending call:', this.currentCallId);
    this.callEndedByUser = true;

    const callDuration = this.callStartTime
      ? Math.ceil((new Date() - this.callStartTime) / 60000)
      : 0;

    if (this.socket?.connected) {
      this.socket.emit('end-call', {
        callId: this.currentCallId,
        duration: callDuration,
        endedBy: 'user',
      });
    }

    this.cleanup();
  }

  async handleIncomingCall(data) {
    console.log('Handling incoming call:', data);
    this.currentCallId = data.callId;
    this.callEndedByUser = false;
    this.onIncomingCall?.(data);
  }

  async createAndSendOffer() {
    try {
      console.log('Creating offer for call:', this.currentCallId);

      if (!this.peerConnection || this.peerConnection.signalingState !== 'stable') {
        console.log('Cannot create offer - peer connection not ready');
        return false;
      }

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log('Set local description (offer)');

      if (this.socket?.connected && this.currentCallId) {
        this.socket.emit('offer', {
          offer,
          callId: this.currentCallId,
        });
        console.log('Offer sent to server');
        return true;
      }

      return false;
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

      // Add tracks to peer connection for the caller
      const userType = await AuthService.getUserType();
      if (userType === 'user' && this.localStream) {
        this.localStream.getTracks().forEach(track => {
          console.log('Adding track to peer connection:', track.kind);
          this.peerConnection.addTrack(track, this.localStream);
        });

        // Create offer after a short delay
        setTimeout(async () => {
          try {
            await this.createAndSendOffer();
          } catch (error) {
            console.error('Error creating offer:', error);
            this.onCallEnded?.({ reason: 'Failed to establish connection' });
          }
        }, 500);
      }

      // Set connection timeout
      this.negotiationTimeout = setTimeout(() => {
        if (this.peerConnection && 
            this.peerConnection.iceConnectionState !== 'connected' &&
            this.peerConnection.iceConnectionState !== 'completed') {
          console.log('Connection timeout');
          this.onCallEnded?.({ reason: 'Connection timeout' });
        }
      }, 30000);

      this.onCallAccepted?.(data);
    } catch (error) {
      console.error('Error handling call accepted:', error);
      this.onCallEnded?.({ reason: 'Error during call setup' });
    }
  }

  handleCallRejected(data) {
    console.log('Call rejected:', data);
    this.resetCallState();
    this.onCallRejected?.(data);
  }

  resetCallState() {
    console.log('Resetting call state only');
    this.currentCallId = null;
    this.callStartTime = null;
    this.callEndedByUser = false;
    this.isNegotiating = false;
    this.iceCandidateQueue = [];
    this.clearTimeouts();
    
    // Stop local stream but keep connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped local track:', track.kind);
      });
      this.localStream = null;
    }
    
    // Close peer connection but keep socket
    if (this.peerConnection) {
      try {
        // Remove event listeners first
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onnegotiationneeded = null;
        
        this.peerConnection.close();
        console.log('Closed peer connection for state reset');
      } catch (error) {
        console.error('Error closing peer connection during reset:', error);
      }
      this.peerConnection = null;
    }
  }

  handleCallEnded(data) {
    console.log('Call ended:', data);
    this.cleanup();
    this.onCallEnded?.(data);
  }

  async handleOffer(data) {
    try {
      console.log('Handling offer');

      if (!this.peerConnection || this.peerConnection.signalingState !== 'stable') {
        console.log('Cannot handle offer - peer connection not ready');
        return;
      }

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      console.log('Set remote description (offer)');

      await this.processQueuedCandidates();

      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(answer);
      console.log('Set local description (answer)');

      if (this.socket?.connected) {
        this.socket.emit('answer', {
          answer,
          callId: data.callId,
        });
      }
    } catch (error) {
      console.error('Error handling offer:', error);
      this.onCallEnded?.({ reason: 'Failed to handle call offer' });
    }
  }

  async handleAnswer(data) {
    try {
      console.log('Handling answer');

      if (!this.peerConnection || this.peerConnection.signalingState !== 'have-local-offer') {
        console.log('Cannot handle answer - invalid state');
        return;
      }

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      console.log('Set remote description (answer)');

      await this.processQueuedCandidates();
      this.isNegotiating = false;
    } catch (error) {
      console.error('Error handling answer:', error);
      this.onCallEnded?.({ reason: 'Failed to handle call answer' });
    }
  }

  async processQueuedCandidates() {
    if (!this.peerConnection?.remoteDescription) {
      return;
    }

    console.log(`Processing ${this.iceCandidateQueue.length} queued ICE candidates`);
    
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Successfully added queued ICE candidate');
      } catch (error) {
        console.error('Error adding queued ICE candidate:', error);
      }
    }
  }

  async handleIceCandidate(data) {
    try {
      if (!this.peerConnection) {
        return;
      }

      if (this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('Added ICE candidate');
      } else {
        console.log('Queuing ICE candidate');
        this.iceCandidateQueue.push(data.candidate);
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  }

  // Setter methods for callbacks
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

  setOnConnectionStateChange(callback) {
    this.onConnectionStateChange = callback;
  }

  cleanup() {
    console.log('Cleaning up call service');

    // Clear timeouts
    this.clearTimeouts();

    // Stop and clean up streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped local track:', track.kind);
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => {
        track.stop();
      });
      this.remoteStream = null;
    }

    // Clean up peer connection
    if (this.peerConnection) {
      try {
        // Remove event listeners to prevent memory leaks
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onnegotiationneeded = null;

        // Close connection
        this.peerConnection.close();
        console.log('Peer connection closed successfully');
      } catch (error) {
        console.error('Error during peer connection cleanup:', error);
      }
      
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
    console.log('Disconnecting call service');
    
    this.callEndedByUser = true;
    this.cleanup();
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
  }
}

export default new CallService();
