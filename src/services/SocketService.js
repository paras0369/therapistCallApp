/**
 * SocketService - Clean Socket.IO signaling service
 * 
 * This service handles only socket communication for call signaling,
 * completely separated from WebRTC and state management.
 */

import io from 'socket.io-client';
import { SOCKET_URL } from '../config/api';
import AuthService from './AuthService';
import { validateCallId, validateObjectKey } from '../utils/InputValidator';

// Socket connection states
export const SOCKET_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  FAILED: 'failed',
};

// Socket events
export const SOCKET_EVENTS = {
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
  RECONNECT_ERROR: 'reconnect_error',
  
  // Call signaling events
  INITIATE_CALL: 'initiate-call',
  CALL_REQUEST: 'call-request',
  ACCEPT_CALL: 'accept-call',
  CALL_ACCEPTED: 'call-accepted',
  REJECT_CALL: 'reject-call',
  CALL_REJECTED: 'call-rejected',
  CANCEL_CALL: 'cancel-call',
  CALL_CANCELLED: 'call-cancelled',
  END_CALL: 'end-call',
  CALL_ENDED: 'call-ended',
  
  // WebRTC signaling events
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice-candidate',
  
  // Status events
  USER_STATUS: 'user-status',
  THERAPIST_STATUS: 'therapist-status',
};

class SocketService {
  constructor() {
    this.socket = null;
    this.connectionState = SOCKET_STATES.DISCONNECTED;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.listenersSetup = false; // Track if listeners are already setup
    
    // Connection options
    this.connectionOptions = {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      forceNew: true,
    };
    
    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.emit = this.emit.bind(this);
    this.isConnected = this.isConnected.bind(this);
  }

  /**
   * Validate incoming socket data
   */
  validateSocketData(data, requiredFields = []) {
    if (!data || typeof data !== 'object') {
      console.debug('SocketService: Validation failed - data is not an object:', typeof data);
      return { isValid: false, error: 'Invalid data format' };
    }

    // Check for dangerous keys
    for (const key in data) {
      const keyValidation = validateObjectKey(key);
      if (!keyValidation.isValid) {
        console.debug('SocketService: Validation failed - dangerous key detected:', key);
        return { isValid: false, error: `Invalid key: ${key}` };
      }
    }

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in data)) {
        console.debug('SocketService: Validation failed - missing required field:', field, 'Available fields:', Object.keys(data));
        return { isValid: false, error: `Missing required field: ${field}` };
      }
    }

    // Validate callId if present (but don't require it unless explicitly in requiredFields)
    if (data.callId) {
      const callIdValidation = validateCallId(data.callId);
      if (!callIdValidation.isValid) {
        console.debug('SocketService: Validation failed - invalid callId format:', data.callId);
        return { isValid: false, error: `Invalid callId: ${callIdValidation.error}` };
      } else {
        console.debug(`SocketService: CallId validated as ${callIdValidation.format} format:`, data.callId);
      }
    }

    console.debug('SocketService: Validation passed for data:', Object.keys(data));
    return { isValid: true };
  }

  /**
   * Connect to socket server
   */
  async connect() {
    try {
      console.log('SocketService: Connecting...');
      
      // Get authentication data
      const token = await AuthService.getAuthToken();
      const userId = await AuthService.getUserId();
      const userType = await AuthService.getUserType();

      if (!token || !userId || !userType) {
        throw new Error('Authentication data not available');
      }

      // Disconnect existing connection
      if (this.socket) {
        await this.disconnect();
      }

      // Update state
      this.connectionState = SOCKET_STATES.CONNECTING;
      this.emitToListeners('state_changed', this.connectionState);

      // Create socket connection
      this.socket = io(SOCKET_URL, {
        ...this.connectionOptions,
        auth: { token, userId, userType },
      });

      // Setup listeners
      this.setupSocketListeners();

      // Connect
      this.socket.connect();

      // Wait for connection
      await this.waitForConnection();
      
      console.log('SocketService: Connected successfully');
      return { success: true };
      
    } catch (error) {
      console.error('SocketService: Connection failed:', error);
      this.connectionState = SOCKET_STATES.FAILED;
      this.emitToListeners('state_changed', this.connectionState);
      this.emitToListeners('error', { type: 'connection_failed', error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for socket connection
   */
  waitForConnection(timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (this.isConnected()) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Connection timeout'));
      }, timeout);

      const onConnect = () => {
        cleanup();
        resolve();
      };

      const onError = (error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (this.socket) {
          this.socket.off('connect', onConnect);
          this.socket.off('connect_error', onError);
        }
      };

      if (this.socket) {
        this.socket.on('connect', onConnect);
        this.socket.on('connect_error', onError);
      } else {
        cleanup();
        reject(new Error('Socket not initialized'));
      }
    });
  }

  /**
   * Setup socket event listeners
   */
  setupSocketListeners() {
    if (!this.socket || this.listenersSetup) return;
    
    this.listenersSetup = true;

    // Connection events
    this.socket.on('connect', () => {
      console.log('SocketService: Connected to server');
      this.connectionState = SOCKET_STATES.CONNECTED;
      this.reconnectAttempts = 0;
      this.emitToListeners('state_changed', this.connectionState);
      this.emitToListeners('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('SocketService: Disconnected from server:', reason);
      this.connectionState = SOCKET_STATES.DISCONNECTED;
      this.emitToListeners('state_changed', this.connectionState);
      this.emitToListeners('disconnected', { reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('SocketService: Connection error:', error);
      this.connectionState = SOCKET_STATES.FAILED;
      this.emitToListeners('state_changed', this.connectionState);
      this.emitToListeners('error', { type: 'connection_error', error: error.message });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('SocketService: Reconnected after', attemptNumber, 'attempts');
      this.connectionState = SOCKET_STATES.CONNECTED;
      this.reconnectAttempts = 0;
      this.emitToListeners('state_changed', this.connectionState);
      this.emitToListeners('reconnected', { attemptNumber });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('SocketService: Reconnect attempt', attemptNumber);
      this.connectionState = SOCKET_STATES.RECONNECTING;
      this.reconnectAttempts = attemptNumber;
      this.emitToListeners('state_changed', this.connectionState);
      this.emitToListeners('reconnecting', { attemptNumber });
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('SocketService: Reconnect error:', error);
      this.emitToListeners('error', { type: 'reconnect_error', error: error.message });
    });

    this.socket.on('reconnect_failed', () => {
      console.error('SocketService: Reconnect failed');
      this.connectionState = SOCKET_STATES.FAILED;
      this.emitToListeners('state_changed', this.connectionState);
      this.emitToListeners('error', { type: 'reconnect_failed', error: 'Failed to reconnect' });
    });

    // Call signaling events - forward to listeners with validation
    this.socket.on(SOCKET_EVENTS.CALL_REQUEST, (data) => {
      console.log('SocketService: Call request received:', data);
      const validation = this.validateSocketData(data, ['callId']); // Only require callId
      if (!validation.isValid) {
        console.error('SocketService: Invalid call request data:', validation.error);
        return;
      }
      
      // Normalize field names - server might use different conventions
      if (data.userName && !data.participantName) {
        data.participantName = data.userName;
        console.debug('SocketService: Normalized userName to participantName');
      }
      
      if (data.userId && !data.participantId) {
        data.participantId = data.userId;
        console.debug('SocketService: Normalized userId to participantId');
      }
      
      // Warn if no participant identifier is available
      if (!data.participantName && !data.userName) {
        console.warn('SocketService: Call request missing participant name information');
      }
      
      this.emitToListeners(SOCKET_EVENTS.CALL_REQUEST, data);
    });

    this.socket.on(SOCKET_EVENTS.CALL_ACCEPTED, (data) => {
      console.log('SocketService: Call accepted:', data);
      const validation = this.validateSocketData(data, []); // callId is recommended but not required
      if (!validation.isValid) {
        console.error('SocketService: Invalid call accepted data:', validation.error);
        return;
      }
      
      // Warn about missing callId but don't block
      if (!data.callId) {
        console.warn('SocketService: Call accepted event missing callId - this may cause issues');
      }
      
      this.emitToListeners(SOCKET_EVENTS.CALL_ACCEPTED, data);
    });

    this.socket.on(SOCKET_EVENTS.CALL_REJECTED, (data) => {
      console.log('SocketService: Call rejected:', data);
      const validation = this.validateSocketData(data, []); // callId is optional for rejected calls
      if (!validation.isValid) {
        console.error('SocketService: Invalid call rejected data:', validation.error);
        return;
      }
      
      // Warn about missing callId but don't block
      if (!data.callId) {
        console.warn('SocketService: Call rejected event missing callId - this may cause issues');
      }
      
      this.emitToListeners(SOCKET_EVENTS.CALL_REJECTED, data);
    });

    this.socket.on(SOCKET_EVENTS.CALL_ENDED, (data) => {
      console.log('SocketService: Call ended:', data);
      const validation = this.validateSocketData(data, []); // callId is optional for ended calls
      if (!validation.isValid) {
        console.error('SocketService: Invalid call ended data:', validation.error);
        return;
      }
      
      // Warn about missing callId but don't block
      if (!data.callId) {
        console.warn('SocketService: Call ended event missing callId - this may cause issues');
      }
      
      this.emitToListeners(SOCKET_EVENTS.CALL_ENDED, data);
    });

    this.socket.on(SOCKET_EVENTS.CALL_CANCELLED, (data) => {
      console.log('SocketService: Call cancelled:', data);
      const validation = this.validateSocketData(data, []); // callId is optional for cancelled calls
      if (!validation.isValid) {
        console.error('SocketService: Invalid call cancelled data:', validation.error);
        return;
      }
      
      this.emitToListeners(SOCKET_EVENTS.CALL_CANCELLED, data);
    });

    // WebRTC signaling events
    this.socket.on(SOCKET_EVENTS.OFFER, (data) => {
      console.log('SocketService: Offer received');
      const validation = this.validateSocketData(data, ['offer']);
      if (!validation.isValid) {
        console.error('SocketService: Invalid offer data:', validation.error);
        return;
      }
      this.emitToListeners(SOCKET_EVENTS.OFFER, data);
    });

    this.socket.on(SOCKET_EVENTS.ANSWER, (data) => {
      console.log('SocketService: Answer received');
      const validation = this.validateSocketData(data, ['answer']);
      if (!validation.isValid) {
        console.error('SocketService: Invalid answer data:', validation.error);
        return;
      }
      this.emitToListeners(SOCKET_EVENTS.ANSWER, data);
    });

    this.socket.on(SOCKET_EVENTS.ICE_CANDIDATE, (data) => {
      console.log('SocketService: ICE candidate received');
      const validation = this.validateSocketData(data, ['candidate']);
      if (!validation.isValid) {
        console.error('SocketService: Invalid ICE candidate data:', validation.error);
        return;
      }
      this.emitToListeners(SOCKET_EVENTS.ICE_CANDIDATE, data);
    });

    // Status events
    this.socket.on(SOCKET_EVENTS.USER_STATUS, (data) => {
      this.emitToListeners(SOCKET_EVENTS.USER_STATUS, data);
    });

    this.socket.on(SOCKET_EVENTS.THERAPIST_STATUS, (data) => {
      this.emitToListeners(SOCKET_EVENTS.THERAPIST_STATUS, data);
    });
  }

  /**
   * Disconnect from socket server
   */
  async disconnect() {
    if (!this.socket) {
      return { success: true };
    }

    console.log('SocketService: Disconnecting...');
    
    try {
      // Remove all socket listeners
      this.socket.removeAllListeners();
      
      // Disconnect
      this.socket.disconnect();
      this.socket = null;
      
      // Clear internal listeners to prevent memory leaks
      this.listeners.clear();
      
      // Reset listeners setup flag
      this.listenersSetup = false;
      
      // Update state
      this.connectionState = SOCKET_STATES.DISCONNECTED;
      this.reconnectAttempts = 0;
      
      console.log('SocketService: Disconnected successfully');
      return { success: true };
      
    } catch (error) {
      console.error('SocketService: Disconnect error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected() {
    return this.socket?.connected === true;
  }

  /**
   * Get connection state
   */
  getConnectionState() {
    return this.connectionState;
  }

  /**
   * Get connection info
   */
  getConnectionInfo() {
    return {
      state: this.connectionState,
      isConnected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      socketId: this.socket?.id,
    };
  }

  /**
   * Emit event to server
   */
  emit(event, data = {}) {
    if (!this.isConnected()) {
      console.warn('SocketService: Cannot emit - not connected:', event);
      return { success: false, error: 'Not connected' };
    }

    try {
      console.log('SocketService: Emitting event:', event, data);
      this.socket.emit(event, data);
      return { success: true };
    } catch (error) {
      console.error('SocketService: Emit error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Call signaling methods
   */
  
  // Initiate a call
  initiateCall(therapistId, callType = 'voice') {
    return this.emit(SOCKET_EVENTS.INITIATE_CALL, {
      therapistId,
      callType,
      timestamp: Date.now(),
    });
  }

  // Accept an incoming call
  acceptCall(callId) {
    return this.emit(SOCKET_EVENTS.ACCEPT_CALL, {
      callId,
      timestamp: Date.now(),
    });
  }

  // Reject an incoming call
  rejectCall(callId) {
    return this.emit(SOCKET_EVENTS.REJECT_CALL, {
      callId,
      timestamp: Date.now(),
    });
  }

  // End an active call
  endCall(callId, duration = 0) {
    return this.emit(SOCKET_EVENTS.END_CALL, {
      callId,
      duration,
      timestamp: Date.now(),
    });
  }

  /**
   * WebRTC signaling methods
   */
  
  // Send WebRTC offer
  sendOffer(callId, offer) {
    return this.emit(SOCKET_EVENTS.OFFER, {
      callId,
      offer,
      timestamp: Date.now(),
    });
  }

  // Send WebRTC answer
  sendAnswer(callId, answer) {
    return this.emit(SOCKET_EVENTS.ANSWER, {
      callId,
      answer,
      timestamp: Date.now(),
    });
  }

  // Send ICE candidate
  sendIceCandidate(callId, candidate) {
    return this.emit(SOCKET_EVENTS.ICE_CANDIDATE, {
      callId,
      candidate,
      timestamp: Date.now(),
    });
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

  // Internal emit for forwarding events to listeners
  emitToListeners(event, data) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('SocketService: Error in event listener:', error);
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

  /**
   * Force reconnection
   */
  async forceReconnect() {
    console.log('SocketService: Force reconnect');
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return this.connect();
  }

  /**
   * Update authentication (for token refresh)
   */
  async updateAuth() {
    if (!this.socket) {
      return { success: false, error: 'Socket not initialized' };
    }

    try {
      const token = await AuthService.getAuthToken();
      const userId = await AuthService.getUserId();
      const userType = await AuthService.getUserType();

      if (!token || !userId || !userType) {
        throw new Error('Authentication data not available');
      }

      // Update socket auth
      this.socket.auth = { token, userId, userType };
      
      return { success: true };
    } catch (error) {
      console.error('SocketService: Update auth failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get socket statistics
   */
  getStats() {
    if (!this.socket) {
      return null;
    }

    return {
      connected: this.socket.connected,
      disconnected: this.socket.disconnected,
      id: this.socket.id,
      transport: this.socket.io.engine?.transport?.name,
      reconnectAttempts: this.reconnectAttempts,
      connectionState: this.connectionState,
    };
  }
}

export default SocketService;