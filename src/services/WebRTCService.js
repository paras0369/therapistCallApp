/**
 * WebRTCService - Pure WebRTC connection management
 * 
 * This service handles only WebRTC operations, completely separated from 
 * socket communication and state management for better modularity.
 */

import {
  mediaDevices,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';
import { PermissionsAndroid, Platform, Alert } from 'react-native';

// WebRTC Connection States
export const WEBRTC_STATES = {
  NEW: 'new',
  CONNECTING: 'connecting', 
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  CLOSED: 'closed',
};

// ICE Connection States
export const ICE_STATES = {
  NEW: 'new',
  CHECKING: 'checking',
  CONNECTED: 'connected',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DISCONNECTED: 'disconnected',
  CLOSED: 'closed',
};

// Events emitted by WebRTCService
export const WEBRTC_EVENTS = {
  STATE_CHANGED: 'state_changed',
  ICE_STATE_CHANGED: 'ice_state_changed',
  ICE_CANDIDATE: 'ice_candidate',
  REMOTE_STREAM: 'remote_stream',
  LOCAL_STREAM: 'local_stream',
  ERROR: 'error',
};

class WebRTCService {
  constructor() {
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    
    // Connection state
    this.connectionState = WEBRTC_STATES.NEW;
    this.iceConnectionState = ICE_STATES.NEW;
    
    // ICE candidate queue for early candidates
    this.iceCandidateQueue = [];
    this.isRemoteDescriptionSet = false;
    
    // Event listeners
    this.listeners = new Map();
    
    // Timeouts and intervals
    this.connectionTimeout = null;
    this.connectionLossTimeout = null;
    this.statsInterval = null;
    
    // Configuration
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'balanced',
      rtcpMuxPolicy: 'require',
    };
    
    // Media constraints
    this.mediaConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100,
      },
      video: false, // Voice only for now
    };
    
    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.cleanup = this.cleanup.bind(this);
    this.createOffer = this.createOffer.bind(this);
    this.createAnswer = this.createAnswer.bind(this);
    this.handleOffer = this.handleOffer.bind(this);
    this.handleAnswer = this.handleAnswer.bind(this);
    this.addIceCandidate = this.addIceCandidate.bind(this);
  }

  /**
   * Initialize WebRTC service
   */
  async initialize() {
    try {
      console.log('WebRTCService: Initializing...');
      
      // Clean up any existing connection
      await this.cleanup();
      
      // Create new peer connection
      this.createPeerConnection();
      
      console.log('WebRTCService: Initialized successfully');
      return { success: true };
    } catch (error) {
      console.error('WebRTCService: Initialize failed:', error);
      this.emit(WEBRTC_EVENTS.ERROR, { 
        type: 'initialization_failed', 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Create and configure peer connection
   */
  createPeerConnection() {
    if (this.peerConnection) {
      this.disposePeerConnection();
    }

    console.log('WebRTCService: Creating peer connection');
    this.peerConnection = new RTCPeerConnection(this.config);
    this.setupPeerConnectionListeners();
    
    // Reset state
    this.connectionState = WEBRTC_STATES.NEW;
    this.iceConnectionState = ICE_STATES.NEW;
    this.isRemoteDescriptionSet = false;
    this.iceCandidateQueue = [];
  }

  /**
   * Setup peer connection event listeners
   */
  setupPeerConnectionListeners() {
    if (!this.peerConnection) return;

    // ICE candidate event
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('WebRTCService: ICE candidate generated');
        this.emit(WEBRTC_EVENTS.ICE_CANDIDATE, event.candidate);
      } else {
        console.log('WebRTCService: ICE candidate gathering completed');
      }
    };

    // Remote stream event
    this.peerConnection.ontrack = (event) => {
      console.log('WebRTCService: Remote track received');
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.emit(WEBRTC_EVENTS.REMOTE_STREAM, this.remoteStream);
      }
    };

    // Connection state change
    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const state = this.peerConnection.connectionState;
      console.log('WebRTCService: Connection state changed:', state);
      
      this.connectionState = state;
      this.emit(WEBRTC_EVENTS.STATE_CHANGED, state);
      
      // Handle connection failure
      if (state === 'failed') {
        this.handleConnectionFailure();
      } else if (state === 'connected') {
        this.handleConnectionSuccess();
      }
    };

    // ICE connection state change
    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return;
      
      const state = this.peerConnection.iceConnectionState;
      console.log('WebRTCService: ICE connection state changed:', state);
      
      this.iceConnectionState = state;
      this.emit(WEBRTC_EVENTS.ICE_STATE_CHANGED, state);
      
      // Handle ICE states
      if (state === 'connected' || state === 'completed') {
        this.clearConnectionTimeout();
        console.log('WebRTCService: ICE connection established');
      } else if (state === 'failed') {
        this.handleConnectionFailure();
      } else if (state === 'disconnected') {
        this.handleConnectionLoss();
      }
    };

    // Negotiation needed
    this.peerConnection.onnegotiationneeded = () => {
      console.log('WebRTCService: Negotiation needed');
      // Let the caller handle this explicitly
    };

    // Data channel (not used but good to handle)
    this.peerConnection.ondatachannel = (event) => {
      console.log('WebRTCService: Data channel received');
    };
  }

  /**
   * Check and request microphone permissions
   */
  async checkPermissions() {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'This app needs access to your microphone to make voice calls.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Microphone permission denied');
        }
      } catch (error) {
        console.error('WebRTCService: Permission check failed:', error);
        throw error;
      }
    }
    return true;
  }

  /**
   * Acquire local media stream
   */
  async getLocalStream() {
    try {
      console.log('WebRTCService: Requesting local media...');
      
      // Check permissions
      await this.checkPermissions();
      
      // Stop existing stream
      if (this.localStream) {
        this.stopLocalStream();
      }
      
      // Get new stream
      this.localStream = await mediaDevices.getUserMedia(this.mediaConstraints);
      console.log('WebRTCService: Local media acquired');
      
      // Add tracks to peer connection
      if (this.peerConnection) {
        this.localStream.getTracks().forEach(track => {
          console.log('WebRTCService: Adding track to peer connection:', track.kind);
          this.peerConnection.addTrack(track, this.localStream);
        });
      }
      
      this.emit(WEBRTC_EVENTS.LOCAL_STREAM, this.localStream);
      return { success: true, stream: this.localStream };
      
    } catch (error) {
      console.error('WebRTCService: Failed to get local stream:', error);
      
      let errorMessage = 'Failed to access microphone';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = 'Microphone access denied. Please enable microphone permission.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found on this device.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is already in use by another application.';
      }
      
      this.emit(WEBRTC_EVENTS.ERROR, { 
        type: 'media_failed', 
        error: errorMessage 
      });
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create WebRTC offer
   */
  async createOffer() {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('WebRTCService: Creating offer...');
      
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);
      console.log('WebRTCService: Local description set (offer)');
      
      // Start connection timeout
      this.startConnectionTimeout();
      
      return { success: true, offer };
    } catch (error) {
      console.error('WebRTCService: Create offer failed:', error);
      this.emit(WEBRTC_EVENTS.ERROR, { 
        type: 'offer_creation_failed', 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Create WebRTC answer
   */
  async createAnswer() {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      console.log('WebRTCService: Creating answer...');
      
      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(answer);
      console.log('WebRTCService: Local description set (answer)');
      
      return { success: true, answer };
    } catch (error) {
      console.error('WebRTCService: Create answer failed:', error);
      this.emit(WEBRTC_EVENTS.ERROR, { 
        type: 'answer_creation_failed', 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle incoming offer
   */
  async handleOffer(offer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      // Check if we're already in stable state with a connection established
      if (this.peerConnection.signalingState === 'stable' && 
          this.peerConnection.connectionState === 'connected') {
        console.log('WebRTCService: Ignoring duplicate offer - connection already established');
        return { success: true, answer: null };
      }

      // Handle offer/offer collision (glare condition)
      if (this.peerConnection.signalingState === 'have-local-offer') {
        console.log('WebRTCService: Offer/offer collision detected - ignoring remote offer');
        return { success: true, answer: null };
      }

      // For offers, we can handle them in 'stable' (initial) or 'have-remote-offer' states
      if (this.peerConnection.signalingState !== 'stable' && 
          this.peerConnection.signalingState !== 'have-remote-offer') {
        console.log('WebRTCService: Cannot handle offer in state:', this.peerConnection.signalingState);
        return { success: true, answer: null };
      }

      console.log('WebRTCService: Handling offer...');
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('WebRTCService: Remote description set (offer)');
      
      this.isRemoteDescriptionSet = true;
      await this.processQueuedCandidates();
      
      // Create and return answer
      return await this.createAnswer();
    } catch (error) {
      console.error('WebRTCService: Handle offer failed:', error);
      this.emit(WEBRTC_EVENTS.ERROR, { 
        type: 'offer_handling_failed', 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(answer) {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      // Check if we're already in stable state (connection already established)
      if (this.peerConnection.signalingState === 'stable') {
        console.log('WebRTCService: Ignoring duplicate answer - connection already stable');
        return { success: true };
      }

      // Check if we can accept an answer in current state
      if (this.peerConnection.signalingState !== 'have-local-offer') {
        console.log('WebRTCService: Cannot handle answer in state:', this.peerConnection.signalingState);
        return { success: true }; // Don't error, just ignore
      }

      console.log('WebRTCService: Handling answer...');
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('WebRTCService: Remote description set (answer)');
      
      this.isRemoteDescriptionSet = true;
      await this.processQueuedCandidates();
      
      return { success: true };
    } catch (error) {
      console.error('WebRTCService: Handle answer failed:', error);
      this.emit(WEBRTC_EVENTS.ERROR, { 
        type: 'answer_handling_failed', 
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate) {
    try {
      if (!this.peerConnection) {
        return { success: false, error: 'Peer connection not initialized' };
      }

      if (this.isRemoteDescriptionSet) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('WebRTCService: ICE candidate added');
      } else {
        console.log('WebRTCService: Queuing ICE candidate');
        this.iceCandidateQueue.push(candidate);
      }
      
      return { success: true };
    } catch (error) {
      console.error('WebRTCService: Add ICE candidate failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process queued ICE candidates
   */
  async processQueuedCandidates() {
    if (!this.isRemoteDescriptionSet || this.iceCandidateQueue.length === 0) {
      return;
    }

    console.log(`WebRTCService: Processing ${this.iceCandidateQueue.length} queued ICE candidates`);
    
    const candidates = [...this.iceCandidateQueue];
    this.iceCandidateQueue = [];
    
    for (const candidate of candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('WebRTCService: Queued ICE candidate added');
      } catch (error) {
        console.error('WebRTCService: Failed to add queued ICE candidate:', error);
      }
    }
  }

  /**
   * Start connection timeout
   */
  startConnectionTimeout(timeout = 30000) {
    this.clearConnectionTimeout();
    
    this.connectionTimeout = setTimeout(() => {
      console.error('WebRTCService: Connection timeout');
      this.emit(WEBRTC_EVENTS.ERROR, { 
        type: 'connection_timeout', 
        error: 'Connection timeout' 
      });
    }, timeout);
  }

  /**
   * Clear connection timeout
   */
  clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Clear connection loss timeout
   */
  clearConnectionLossTimeout() {
    if (this.connectionLossTimeout) {
      clearTimeout(this.connectionLossTimeout);
      this.connectionLossTimeout = null;
    }
  }

  /**
   * Handle connection success
   */
  handleConnectionSuccess() {
    console.log('WebRTCService: Connection established successfully');
    this.clearConnectionTimeout();
    
    // Start stats monitoring
    this.startStatsMonitoring();
  }

  /**
   * Handle connection failure
   */
  handleConnectionFailure() {
    console.error('WebRTCService: Connection failed');
    this.clearConnectionTimeout();
    this.stopStatsMonitoring();
    
    this.emit(WEBRTC_EVENTS.ERROR, { 
      type: 'connection_failed', 
      error: 'WebRTC connection failed' 
    });
  }

  /**
   * Handle connection loss
   */
  handleConnectionLoss() {
    console.warn('WebRTCService: Connection lost');
    
    // Clear any existing loss timeout
    if (this.connectionLossTimeout) {
      clearTimeout(this.connectionLossTimeout);
    }
    
    // Give some time for reconnection
    this.connectionLossTimeout = setTimeout(() => {
      // Only emit error if we still have a peer connection (not cleaned up)
      if (this.peerConnection && this.iceConnectionState === 'disconnected') {
        console.error('WebRTCService: Connection lost permanently');
        this.emit(WEBRTC_EVENTS.ERROR, { 
          type: 'connection_lost', 
          error: 'Connection lost' 
        });
      }
    }, 5000);
  }

  /**
   * Start monitoring connection stats
   */
  startStatsMonitoring() {
    if (this.statsInterval || !this.peerConnection) return;
    
    this.statsInterval = setInterval(async () => {
      try {
        const stats = await this.peerConnection.getStats();
        // Process stats if needed - for now just log connection health
        console.log('WebRTCService: Connection stats collected');
      } catch (error) {
        console.error('WebRTCService: Stats collection failed:', error);
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop monitoring connection stats
   */
  stopStatsMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Stop local stream
   */
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('WebRTCService: Stopped local track:', track.kind);
      });
      this.localStream = null;
    }
  }

  /**
   * Stop remote stream
   */
  stopRemoteStream() {
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => {
        track.stop();
      });
      this.remoteStream = null;
    }
  }

  /**
   * Dispose peer connection
   */
  disposePeerConnection() {
    if (this.peerConnection) {
      try {
        // Remove event listeners
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onnegotiationneeded = null;
        this.peerConnection.ondatachannel = null;
        
        // Close connection
        this.peerConnection.close();
        console.log('WebRTCService: Peer connection closed');
      } catch (error) {
        console.error('WebRTCService: Error disposing peer connection:', error);
      }
      
      this.peerConnection = null;
    }
    
    // Clear connection loss timeout since peer connection is gone
    this.clearConnectionLossTimeout();
  }

  /**
   * Complete cleanup
   */
  async cleanup() {
    console.log('WebRTCService: Cleaning up...');
    
    // Clear timeouts and intervals
    this.clearConnectionTimeout();
    this.clearConnectionLossTimeout();
    this.stopStatsMonitoring();
    
    // Stop streams
    this.stopLocalStream();
    this.stopRemoteStream();
    
    // Dispose peer connection
    this.disposePeerConnection();
    
    // Reset state
    this.connectionState = WEBRTC_STATES.NEW;
    this.iceConnectionState = ICE_STATES.NEW;
    this.isRemoteDescriptionSet = false;
    this.iceCandidateQueue = [];
    
    console.log('WebRTCService: Cleanup complete');
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return {
      connectionState: this.connectionState,
      iceConnectionState: this.iceConnectionState,
      hasLocalStream: !!this.localStream,
      hasRemoteStream: !!this.remoteStream,
      hasPeerConnection: !!this.peerConnection,
      queuedCandidates: this.iceCandidateQueue.length,
      isRemoteDescriptionSet: this.isRemoteDescriptionSet,
    };
  }

  /**
   * Event listener management
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);
    
    // Return unsubscribe function
    return () => {
      const eventListeners = this.listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(listener);
      }
    };
  }

  off(event, listener) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  emit(event, data) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('WebRTCService: Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Remove all listeners
   */
  removeAllListeners() {
    this.listeners.clear();
  }
}

export default WebRTCService;