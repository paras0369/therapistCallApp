/**
 * CallManager - High-level call orchestration service
 *
 * This service orchestrates all call operations by coordinating between
 * CallStateMachine, WebRTCService, and SocketService. It provides a clean
 * API for React components and handles all the complex coordination logic.
 */

import CallStateMachine, { CALL_STATES, CALL_EVENTS } from './CallStateMachine';
import WebRTCService, { WEBRTC_EVENTS } from './WebRTCService';
import SocketService, { SOCKET_EVENTS } from './SocketService';
import AuthService from './AuthService';

// Call Manager Events
export const CALL_MANAGER_EVENTS = {
  STATE_CHANGED: 'state_changed',
  CALL_DATA_CHANGED: 'call_data_changed',
  INCOMING_CALL: 'incoming_call',
  CALL_CONNECTED: 'call_connected',
  CALL_ENDED: 'call_ended',
  ERROR: 'error',
  DEBUG: 'debug',
};

// Error types
export const ERROR_TYPES = {
  INITIALIZATION_FAILED: 'initialization_failed',
  CONNECTION_FAILED: 'connection_failed',
  MEDIA_FAILED: 'media_failed',
  CALL_FAILED: 'call_failed',
  INVALID_STATE: 'invalid_state',
  NETWORK_ERROR: 'network_error',
  PERMISSION_DENIED: 'permission_denied',
  TIMEOUT: 'timeout',
};

class CallManager {
  constructor() {
    // Core services
    this.stateMachine = new CallStateMachine();
    this.webrtcService = new WebRTCService();
    this.socketService = new SocketService();

    // State
    this.isInitialized = false;
    this.currentOperation = null;
    this.operationTimeout = null;
    this.webrtcInitTimeout = null;
    this.listeners = new Map();

    // Operation timeouts (in milliseconds)
    this.timeouts = {
      initialization: 15000,
      callSetup: 30000,
      webrtcConnection: 20000,
      operationDefault: 10000,
    };

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.cleanup = this.cleanup.bind(this);
    this.startCall = this.startCall.bind(this);
    this.acceptCall = this.acceptCall.bind(this);
    this.rejectCall = this.rejectCall.bind(this);
    this.endCall = this.endCall.bind(this);
  }

  /**
   * Initialize the call manager and all services
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('CallManager: Already initialized');
      return { success: true };
    }

    try {
      console.log('CallManager: Initializing...');
      this.emit(CALL_MANAGER_EVENTS.DEBUG, {
        message: 'Starting initialization',
      });

      // Set operation timeout
      this.setOperationTimeout('initialization', this.timeouts.initialization);

      // Initialize services in order
      const socketResult = await this.socketService.connect();
      if (!socketResult.success) {
        throw new Error(`Socket connection failed: ${socketResult.error}`);
      }

      const webrtcResult = await this.webrtcService.initialize();
      if (!webrtcResult.success) {
        throw new Error(`WebRTC initialization failed: ${webrtcResult.error}`);
      }

      // Setup service event listeners
      this.setupServiceListeners();

      // Clear timeout
      this.clearOperationTimeout();

      this.isInitialized = true;
      console.log('CallManager: Initialized successfully');
      this.emit(CALL_MANAGER_EVENTS.DEBUG, {
        message: 'Initialization complete',
      });

      return { success: true };
    } catch (error) {
      console.error('CallManager: Initialization failed:', error);
      this.clearOperationTimeout();
      await this.cleanup();

      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.INITIALIZATION_FAILED,
        message: error.message,
        error,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Setup event listeners for all services
   */
  setupServiceListeners() {
    // State machine listeners
    this.stateMachine.addListener(
      (newState, previousState, callData, metadata) => {
        console.log(
          `CallManager: State changed: ${previousState} → ${newState}`,
          metadata,
        );

        this.emit(CALL_MANAGER_EVENTS.STATE_CHANGED, {
          newState,
          previousState,
          callData,
          metadata,
        });

        this.emit(CALL_MANAGER_EVENTS.CALL_DATA_CHANGED, callData);

        // Handle state-specific logic
        this.handleStateChange(newState, previousState, callData, metadata);
      },
    );

    // Socket service listeners
    this.socketService.on(SOCKET_EVENTS.CALL_REQUEST, data => {
      this.handleIncomingCall(data);
    });

    this.socketService.on(SOCKET_EVENTS.CALL_ACCEPTED, data => {
      this.handleCallAccepted(data);
    });

    this.socketService.on(SOCKET_EVENTS.CALL_REJECTED, data => {
      this.handleCallRejected(data);
    });

    this.socketService.on(SOCKET_EVENTS.CALL_ENDED, data => {
      this.handleCallEnded(data);
    });

    this.socketService.on(SOCKET_EVENTS.OFFER, data => {
      this.handleWebRTCOffer(data);
    });

    this.socketService.on(SOCKET_EVENTS.ANSWER, data => {
      this.handleWebRTCAnswer(data);
    });

    this.socketService.on(SOCKET_EVENTS.ICE_CANDIDATE, data => {
      this.handleWebRTCIceCandidate(data);
    });

    this.socketService.on('error', error => {
      this.handleSocketError(error);
    });

    this.socketService.on('disconnected', data => {
      this.handleSocketDisconnected(data);
    });

    // WebRTC service listeners
    this.webrtcService.on(WEBRTC_EVENTS.ICE_CANDIDATE, candidate => {
      this.handleLocalIceCandidate(candidate);
    });

    this.webrtcService.on(WEBRTC_EVENTS.REMOTE_STREAM, stream => {
      this.handleRemoteStream(stream);
    });

    this.webrtcService.on(WEBRTC_EVENTS.STATE_CHANGED, state => {
      this.handleWebRTCStateChange(state);
    });

    this.webrtcService.on(WEBRTC_EVENTS.ICE_STATE_CHANGED, state => {
      this.handleWebRTCIceStateChange(state);
    });

    this.webrtcService.on(WEBRTC_EVENTS.ERROR, error => {
      this.handleWebRTCError(error);
    });
  }

  /**
   * Start a call to a therapist
   */
  async startCall(therapistId, therapistName, callType = 'voice') {
    try {
      console.log(
        `CallManager: Starting call to ${therapistName} (${therapistId})`,
      );

      if (!this.isInitialized) {
        throw new Error('CallManager not initialized');
      }

      // Validate that only users can start calls
      const userType = await AuthService.getUserType();
      if (userType !== 'user') {
        throw new Error('Only users can initiate calls to therapists');
      }

      // Check if we can start a new call
      if (!this.stateMachine.canStartNewCall()) {
        throw new Error(
          `Cannot start call - current state: ${this.stateMachine.getState()}`,
        );
      }

      // Set operation timeout
      this.setOperationTimeout('call_start', this.timeouts.callSetup);
      this.currentOperation = 'starting_call';

      // Start the call process
      const result = await this.stateMachine.handleEvent(
        CALL_EVENTS.START_CALL,
        {
          participantId: therapistId,
          participantName: therapistName,
          callType,
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      // Get local media
      const mediaResult = await this.webrtcService.getLocalStream();
      if (!mediaResult.success) {
        await this.stateMachine.handleEvent(CALL_EVENTS.MEDIA_FAILED, {
          error: mediaResult.error,
        });
        throw new Error(mediaResult.error);
      }

      // Media acquired successfully
      await this.stateMachine.handleEvent(CALL_EVENTS.MEDIA_ACQUIRED);

      // Send call initiation to server
      const initiateResult = this.socketService.initiateCall(
        therapistId,
        callType,
      );
      if (!initiateResult.success) {
        await this.stateMachine.handleEvent(CALL_EVENTS.CONNECTION_FAILED, {
          error: initiateResult.error,
        });
        throw new Error(initiateResult.error);
      }

      console.log('CallManager: Call initiation sent');
      return { success: true };
    } catch (error) {
      console.error('CallManager: Start call failed:', error);
      this.clearOperationTimeout();
      this.currentOperation = null;

      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.CALL_FAILED,
        message: `Failed to start call: ${error.message}`,
        error,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Accept an incoming call
   */
  async acceptCall(callId) {
    try {
      console.log(`CallManager: Accepting call ${callId}`);

      if (!this.isInitialized) {
        throw new Error('CallManager not initialized');
      }

      // Set operation timeout
      this.setOperationTimeout('call_accept', this.timeouts.callSetup);
      this.currentOperation = 'accepting_call';

      // Accept the call in state machine
      const result = await this.stateMachine.handleEvent(
        CALL_EVENTS.ACCEPT_CALL,
        {
          callId,
        },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      // Ensure WebRTC is properly initialized before getting media
      const webrtcStatus = this.webrtcService.getStatus();
      if (!webrtcStatus.hasPeerConnection) {
        console.log('CallManager: Initializing WebRTC for call acceptance');
        const reinitResult = await this.webrtcService.initialize();
        if (!reinitResult.success) {
          await this.stateMachine.handleEvent(CALL_EVENTS.MEDIA_FAILED, {
            error: reinitResult.error,
          });
          throw new Error(reinitResult.error);
        }
      } else {
        console.log(
          'CallManager: WebRTC peer connection already exists for call acceptance',
        );
      }

      // Get local media
      const mediaResult = await this.webrtcService.getLocalStream();
      if (!mediaResult.success) {
        await this.stateMachine.handleEvent(CALL_EVENTS.MEDIA_FAILED, {
          error: mediaResult.error,
        });
        throw new Error(mediaResult.error);
      }

      // Send acceptance to server
      const acceptResult = this.socketService.acceptCall(callId);
      if (!acceptResult.success) {
        await this.stateMachine.handleEvent(CALL_EVENTS.CONNECTION_FAILED, {
          error: acceptResult.error,
        });
        throw new Error(acceptResult.error);
      }

      console.log('CallManager: Call acceptance sent');
      return { success: true };
    } catch (error) {
      console.error('CallManager: Accept call failed:', error);
      this.clearOperationTimeout();
      this.currentOperation = null;

      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.CALL_FAILED,
        message: `Failed to accept call: ${error.message}`,
        error,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Reject an incoming call
   */
  async rejectCall(callId) {
    try {
      console.log(`CallManager: Rejecting call ${callId}`);

      // Reject in state machine
      await this.stateMachine.handleEvent(CALL_EVENTS.REJECT_CALL, { callId });

      // Send rejection to server
      this.socketService.rejectCall(callId);

      console.log('CallManager: Call rejection sent');
      return { success: true };
    } catch (error) {
      console.error('CallManager: Reject call failed:', error);

      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.CALL_FAILED,
        message: `Failed to reject call: ${error.message}`,
        error,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * End the current call
   */
  async endCall() {
    try {
      const callData = this.stateMachine.getCallData();
      console.log(`CallManager: Ending call ${callData.callId}`);

      // Clear any operation timeout since we're ending the call
      this.clearOperationTimeout();
      this.currentOperation = null;

      // End in state machine
      await this.stateMachine.handleEvent(CALL_EVENTS.END_CALL);

      // Calculate duration
      const duration = callData.startTime
        ? Math.ceil((Date.now() - callData.startTime) / 60000)
        : 0;

      // Send end to server (don't wait for response)
      if (callData.callId) {
        this.socketService.endCall(callData.callId, duration);
      }

      // Cleanup WebRTC
      await this.webrtcService.cleanup();

      console.log('CallManager: Call ended successfully');
      return { success: true };
    } catch (error) {
      console.error('CallManager: End call failed:', error);

      // Even if ending fails, try to cleanup
      try {
        await this.webrtcService.cleanup();
      } catch (cleanupError) {
        console.error(
          'CallManager: Cleanup after end call failure:',
          cleanupError,
        );
      }

      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.CALL_FAILED,
        message: `Failed to end call: ${error.message}`,
        error,
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Handle state changes
   */
  handleStateChange(newState, previousState, callData, metadata) {
    switch (newState) {
      case CALL_STATES.CONNECTED:
        this.clearOperationTimeout();
        this.currentOperation = null;
        this.emit(CALL_MANAGER_EVENTS.CALL_CONNECTED, callData);
        break;

      case CALL_STATES.ENDED:
      case CALL_STATES.FAILED:
      case CALL_STATES.REJECTED:
        this.clearOperationTimeout();
        this.currentOperation = null;
        this.emit(CALL_MANAGER_EVENTS.CALL_ENDED, {
          state: newState,
          callData,
          metadata,
        });
        break;

      case CALL_STATES.IDLE:
        // Clean up when returning to idle
        this.webrtcService.cleanup();
        break;
    }
  }

  /**
   * Handle incoming call
   */
  async handleIncomingCall(data) {
    try {
      console.log('CallManager: Handling incoming call:', data);

      // Only therapists should receive call requests
      const userType = await AuthService.getUserType();
      if (userType !== 'therapist') {
        console.log(
          'CallManager: Ignoring call request - user is not a therapist',
        );
        return;
      }

      // Check if we can receive calls
      if (!this.stateMachine.canStartNewCall()) {
        console.log('CallManager: Rejecting incoming call - not in idle state');
        this.socketService.rejectCall(data.callId);
        return;
      }

      // Handle in state machine
      const result = await this.stateMachine.handleEvent(
        CALL_EVENTS.CALL_REQUEST_RECEIVED,
        {
          callId: data.callId,
          participantId: data.userId,
          participantName: data.userName,
          callType: data.callType || 'voice',
        },
      );

      if (result.success) {
        this.emit(CALL_MANAGER_EVENTS.INCOMING_CALL, {
          callId: data.callId,
          participantId: data.userId,
          participantName: data.userName,
          callType: data.callType || 'voice',
        });
      } else {
        console.error(
          'CallManager: Failed to handle incoming call:',
          result.error,
        );
        this.socketService.rejectCall(data.callId);
      }
    } catch (error) {
      console.error('CallManager: Error handling incoming call:', error);
      this.socketService.rejectCall(data.callId);
    }
  }

  /**
   * Handle call accepted
   */
  async handleCallAccepted(data) {
    try {
      console.log('CallManager: Call accepted:', data);

      await this.stateMachine.handleEvent(CALL_EVENTS.CALL_ACCEPTED, {
        callId: data.callId,
      });

      // Only the caller (user) should initiate WebRTC connection
      // The receiver (therapist) should wait for the offer
      const userType = await AuthService.getUserType();
      const webrtcStatus = this.webrtcService.getStatus();
      const callData = this.stateMachine.getCallData();

      // Only users should initiate WebRTC, and only if we haven't already started
      if (
        userType === 'user' &&
        webrtcStatus.connectionState !== 'connecting' &&
        webrtcStatus.connectionState !== 'connected'
      ) {
        console.log(
          'CallManager: User side - initiating WebRTC connection for call',
          data.callId,
        );
        // Small delay to ensure both sides are ready
        this.webrtcInitTimeout = setTimeout(() => {
          this.webrtcInitTimeout = null;
          this.initiateWebRTCConnection();
        }, 100);
      } else {
        console.log(
          'CallManager: Therapist side or WebRTC already active - waiting for offer',
        );
      }
    } catch (error) {
      console.error('CallManager: Error handling call accepted:', error);
      await this.stateMachine.handleEvent(CALL_EVENTS.CONNECTION_FAILED, {
        error: error.message,
      });
    }
  }

  /**
   * Handle call rejected
   */
  async handleCallRejected(data) {
    console.log('CallManager: Call rejected:', data);

    await this.stateMachine.handleEvent(CALL_EVENTS.CALL_REJECTED, {
      callId: data.callId,
      reason: data.message,
    });
  }

  /**
   * Handle call ended
   */
  async handleCallEnded(data) {
    console.log('CallManager: Call ended:', data);

    await this.stateMachine.handleEvent(CALL_EVENTS.CALL_ENDED, {
      callId: data.callId,
      reason: data.reason,
      endedBy: data.endedBy,
    });
  }

  /**
   * Initiate WebRTC connection
   */
  async initiateWebRTCConnection() {
    try {
      console.log('CallManager: Initiating WebRTC connection...');

      // Check if we're already in the process of connecting
      const webrtcStatus = this.webrtcService.getStatus();
      if (
        webrtcStatus.connectionState === 'connecting' ||
        webrtcStatus.connectionState === 'connected'
      ) {
        console.log(
          'CallManager: WebRTC connection already in progress or established, skipping',
        );
        return;
      }

      // Double-check we're still in a valid state for WebRTC initiation
      const currentCallState = this.stateMachine.getState();
      if (currentCallState !== CALL_STATES.CONNECTING) {
        console.log(
          'CallManager: Call state changed, skipping WebRTC initiation. Current state:',
          currentCallState,
        );
        return;
      }

      await this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_CONNECTING);

      // Ensure WebRTC is properly initialized before creating offer
      if (!webrtcStatus.hasPeerConnection) {
        console.log(
          'CallManager: WebRTC peer connection missing, reinitializing',
        );
        const reinitResult = await this.webrtcService.initialize();
        if (!reinitResult.success) {
          throw new Error(reinitResult.error);
        }
      } else {
        console.log(
          'CallManager: WebRTC peer connection already exists, proceeding with offer',
        );
      }

      // Create and send offer
      const offerResult = await this.webrtcService.createOffer();
      if (!offerResult.success) {
        throw new Error(offerResult.error);
      }

      const callData = this.stateMachine.getCallData();
      this.socketService.sendOffer(callData.callId, offerResult.offer);
    } catch (error) {
      console.error('CallManager: WebRTC connection failed:', error);
      await this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_FAILED, {
        error: error.message,
      });
    }
  }

  /**
   * Handle WebRTC offer
   */
  async handleWebRTCOffer(data) {
    try {
      console.log('CallManager: Handling WebRTC offer');

      // Verify we're in the correct state to handle offers
      const currentState = this.stateMachine.getState();
      if (currentState !== CALL_STATES.CONNECTING) {
        console.log(
          'CallManager: Ignoring offer - not in connecting state. Current state:',
          currentState,
        );
        return;
      }

      const answerResult = await this.webrtcService.handleOffer(data.offer);
      if (!answerResult.success) {
        throw new Error(answerResult.error);
      }

      // Only send answer if one was actually created
      if (answerResult.answer) {
        this.socketService.sendAnswer(data.callId, answerResult.answer);
      } else {
        console.log(
          'CallManager: No answer created (offer ignored due to state)',
        );
      }
    } catch (error) {
      console.error('CallManager: Error handling WebRTC offer:', error);
      await this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_FAILED, {
        error: error.message,
      });
    }
  }

  /**
   * Handle WebRTC answer
   */
  async handleWebRTCAnswer(data) {
    try {
      console.log('CallManager: Handling WebRTC answer');

      // Verify we're in the correct state to handle answers
      const currentState = this.stateMachine.getState();
      if (currentState !== CALL_STATES.CONNECTING) {
        console.log(
          'CallManager: Ignoring answer - not in connecting state. Current state:',
          currentState,
        );
        return;
      }

      const result = await this.webrtcService.handleAnswer(data.answer);
      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('CallManager: Error handling WebRTC answer:', error);
      await this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_FAILED, {
        error: error.message,
      });
    }
  }

  /**
   * Handle WebRTC ICE candidate
   */
  async handleWebRTCIceCandidate(data) {
    try {
      await this.webrtcService.addIceCandidate(data.candidate);
    } catch (error) {
      console.error('CallManager: Error handling ICE candidate:', error);
    }
  }

  /**
   * Handle local ICE candidate
   */
  handleLocalIceCandidate(candidate) {
    const callData = this.stateMachine.getCallData();
    if (callData.callId) {
      this.socketService.sendIceCandidate(callData.callId, candidate);
    }
  }

  /**
   * Handle remote stream
   */
  handleRemoteStream(stream) {
    try {
      console.log('CallManager: Remote stream received');
      this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_CONNECTED);
    } catch (error) {
      console.error('CallManager: Error handling remote stream:', error);
      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.CONNECTION_FAILED,
        message: `Failed to handle remote stream: ${error.message}`,
        error,
      });
    }
  }

  /**
   * Handle WebRTC state changes
   */
  handleWebRTCStateChange(state) {
    try {
      console.log('CallManager: WebRTC state changed:', state);

      if (state === 'connected') {
        this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_CONNECTED);
      } else if (state === 'failed') {
        this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_FAILED, {
          error: 'WebRTC connection failed',
        });
      } else if (state === 'disconnected') {
        this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_DISCONNECTED);
      }
    } catch (error) {
      console.error('CallManager: Error handling WebRTC state change:', error);
      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.CONNECTION_FAILED,
        message: `Failed to handle WebRTC state change: ${error.message}`,
        error,
      });
    }
  }

  /**
   * Handle WebRTC ICE state changes
   */
  handleWebRTCIceStateChange(state) {
    try {
      console.log('CallManager: WebRTC ICE state changed:', state);

      if (state === 'connected' || state === 'completed') {
        this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_CONNECTED);
      } else if (state === 'failed') {
        this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_FAILED, {
          error: 'ICE connection failed',
        });
      }
    } catch (error) {
      console.error('CallManager: Error handling WebRTC ICE state change:', error);
      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.CONNECTION_FAILED,
        message: `Failed to handle WebRTC ICE state change: ${error.message}`,
        error,
      });
    }
  }

  /**
   * Handle WebRTC errors
   */
  handleWebRTCError(error) {
    console.error('CallManager: WebRTC error:', error);

    this.emit(CALL_MANAGER_EVENTS.ERROR, {
      type: ERROR_TYPES.CONNECTION_FAILED,
      message: `WebRTC error: ${error.error}`,
      error,
    });

    if (this.stateMachine.isInActiveCall()) {
      this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_FAILED, {
        error: error.error,
      });
    }
  }

  /**
   * Handle socket errors
   */
  handleSocketError(error) {
    console.error('CallManager: Socket error:', error);

    this.emit(CALL_MANAGER_EVENTS.ERROR, {
      type: ERROR_TYPES.NETWORK_ERROR,
      message: `Socket error: ${error.error}`,
      error,
    });
  }

  /**
   * Handle socket disconnection
   */
  handleSocketDisconnected(data) {
    console.warn('CallManager: Socket disconnected:', data);

    // If we're in an active call, end it
    if (this.stateMachine.isInActiveCall()) {
      this.stateMachine.handleEvent(CALL_EVENTS.CONNECTION_FAILED, {
        error: 'Connection lost',
      });
    }
  }

  /**
   * Set operation timeout
   */
  setOperationTimeout(operation, timeout) {
    this.clearOperationTimeout();

    this.operationTimeout = setTimeout(() => {
      console.error(`CallManager: Operation timeout: ${operation}`);

      this.emit(CALL_MANAGER_EVENTS.ERROR, {
        type: ERROR_TYPES.TIMEOUT,
        message: `Operation timeout: ${operation}`,
        operation,
      });

      if (this.stateMachine.isInActiveCall()) {
        this.stateMachine.handleEvent(CALL_EVENTS.TIMEOUT, {
          operation,
        });
      }

      this.currentOperation = null;
    }, timeout);
  }

  /**
   * Clear operation timeout
   */
  clearOperationTimeout() {
    if (this.operationTimeout) {
      clearTimeout(this.operationTimeout);
      this.operationTimeout = null;
    }
  }

  /**
   * Clear WebRTC initialization timeout
   */
  clearWebRTCInitTimeout() {
    if (this.webrtcInitTimeout) {
      clearTimeout(this.webrtcInitTimeout);
      this.webrtcInitTimeout = null;
    }
  }

  /**
   * Get current call state
   */
  getCallState() {
    return this.stateMachine.getState();
  }

  /**
   * Get current call data
   */
  getCallData() {
    return this.stateMachine.getCallData();
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      isInitialized: this.isInitialized,
      callState: this.stateMachine.getState(),
      socketConnected: this.socketService.isConnected(),
      webrtcStatus: this.webrtcService.getStatus(),
      currentOperation: this.currentOperation,
    };
  }

  /**
   * Force reset (emergency reset)
   */
  async forceReset() {
    console.log('CallManager: Force reset');

    this.clearOperationTimeout();
    this.clearWebRTCInitTimeout();
    this.currentOperation = null;

    // Reset state machine
    this.stateMachine.forceReset();

    // Cleanup WebRTC
    await this.webrtcService.cleanup();

    this.emit(CALL_MANAGER_EVENTS.DEBUG, { message: 'Force reset complete' });
  }

  /**
   * Cleanup all services
   */
  async cleanup() {
    console.log('CallManager: Cleaning up...');

    // Clear all timeouts and operations
    this.clearOperationTimeout();
    this.clearWebRTCInitTimeout();
    this.currentOperation = null;

    try {
      // Clean up services in parallel for faster cleanup
      await Promise.all([
        this.webrtcService.cleanup(),
        this.socketService.disconnect(),
      ]);
    } catch (error) {
      console.error('CallManager: Error during service cleanup:', error);
    }

    // Reset state machine
    try {
      this.stateMachine.forceReset();
    } catch (error) {
      console.error('CallManager: Error resetting state machine:', error);
    }

    // Reset initialization state
    this.isInitialized = false;

    // Clear all event listeners
    this.listeners.clear();

    console.log('CallManager: Cleanup complete');
  }

  /**
   * Event listener management
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);

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
          console.error('CallManager: Error in event listener:', error);
        }
      });
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo() {
    return {
      callManager: {
        isInitialized: this.isInitialized,
        currentOperation: this.currentOperation,
        hasOperationTimeout: !!this.operationTimeout,
        listenerCount: Array.from(this.listeners.values()).reduce(
          (sum, set) => sum + set.size,
          0,
        ),
      },
      stateMachine: this.stateMachine.getDebugInfo(),
      webrtc: this.webrtcService.getStatus(),
      socket: this.socketService.getConnectionInfo(),
    };
  }
}

export default CallManager;
