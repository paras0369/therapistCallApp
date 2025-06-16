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
import { NetworkRetryManager, WebRTCRetryManager, CallRetryManager } from '../utils/RetryManager';

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
    this.webrtcInitMutex = false; // Mutex for WebRTC initialization
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

      // Initialize services in order with retry logic
      const socketResult = await NetworkRetryManager.execute(
        () => this.socketService.connect(),
        'socket connection'
      );
      if (!socketResult.success) {
        throw new Error(`Socket connection failed: ${socketResult.error}`);
      }

      const webrtcResult = await WebRTCRetryManager.execute(
        () => this.webrtcService.initialize(),
        'WebRTC initialization'
      );
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

    this.socketService.on(SOCKET_EVENTS.CALL_CANCELLED, data => {
      this.handleCallCancelled(data);
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

      // Generate a temporary callId for tracking - will be replaced with server's callId when call is accepted
      const tempCallId = `temp_${Date.now()}_${therapistId}`;
      this.stateMachine.setCallData({ callId: tempCallId });

      console.log(
        'CallManager: Call initiation sent with temp callId:',
        tempCallId,
      );
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
      console.log(`CallManager: Current state: ${this.stateMachine.getState()}`);

      if (!this.isInitialized) {
        throw new Error('CallManager not initialized');
      }

      // Validate that we're in ringing state and have valid call data
      const currentState = this.stateMachine.getState();
      if (currentState !== CALL_STATES.RINGING) {
        throw new Error(`Cannot accept call - not in ringing state. Current state: ${currentState}`);
      }

      const callData = this.stateMachine.getCallData();
      if (!callData.callId) {
        throw new Error('Cannot accept call - no valid call to accept');
      }

      if (callData.callId !== callId) {
        throw new Error(`Cannot accept call - callId mismatch. Expected: ${callData.callId}, Received: ${callId}`);
      }

      // Set operation timeout
      this.setOperationTimeout('call_accept', this.timeouts.callSetup);
      this.currentOperation = 'accepting_call';

      // Accept the call in state machine
      console.log(`CallManager: Handling ACCEPT_CALL event for ${callId}`);
      const result = await this.stateMachine.handleEvent(
        CALL_EVENTS.ACCEPT_CALL,
        {
          callId,
        },
      );

      console.log(`CallManager: ACCEPT_CALL result:`, result);
      if (!result.success) {
        console.error(`CallManager: ACCEPT_CALL failed:`, result.error);
        throw new Error(result.error);
      }

      console.log(`CallManager: State after acceptance: ${this.stateMachine.getState()}`);

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
      console.log(`CallManager: Sending acceptance to server for ${callId}`);
      const acceptResult = this.socketService.acceptCall(callId);
      console.log(`CallManager: Server acceptance result:`, acceptResult);
      
      if (!acceptResult.success) {
        console.error(`CallManager: Server acceptance failed:`, acceptResult.error);
        await this.stateMachine.handleEvent(CALL_EVENTS.CONNECTION_FAILED, {
          error: acceptResult.error,
        });
        throw new Error(acceptResult.error);
      }

      console.log('CallManager: Call acceptance sent successfully');
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
      const currentState = this.stateMachine.getState();
      console.log(
        `CallManager: Ending call ${callData.callId} in state ${currentState}`,
      );

      // Clear any operation timeout since we're ending the call
      this.clearOperationTimeout();
      this.currentOperation = null;

      // Calculate duration
      const duration = callData.startTime
        ? Math.ceil((Date.now() - callData.startTime) / 60000)
        : 0;

      // IMPORTANT: Send end to server FIRST before updating state machine
      // This ensures other participants (like therapist) are notified immediately
      if (callData.callId && !callData.callId.startsWith('temp_')) {
        // Real callId - send normal end call
        console.log(
          'CallManager: Notifying server of call end before state change',
        );
        const endResult = this.socketService.endCall(callData.callId, duration);
        if (!endResult.success) {
          console.warn(
            'CallManager: Failed to notify server of call end:',
            endResult.error,
          );
          // Continue anyway since we still want to clean up locally
        }
      } else if (currentState === CALL_STATES.CALLING) {
        // Special case: User ended call while waiting for therapist to accept
        // This includes calls with temp callId (not yet accepted by server)
        console.log(
          'CallManager: Ending call in CALLING state - sending cancellation to server',
        );
        if (callData.participantId) {
          // Since this is a call that was never properly established (still has temp callId),
          // we need to send a cancellation to the server. The server should match this with 
          // the therapist ID to cancel the incoming call request.
          const cancelResult = this.socketService.emit('cancel-call-request', {
            therapistId: callData.participantId,
            reason: 'caller_ended',
            timestamp: Date.now(),
          });
          if (!cancelResult.success) {
            console.warn('CallManager: Failed to send call cancellation:', cancelResult.error);
          } else {
            console.log('CallManager: Call cancellation sent successfully to therapist:', callData.participantId);
          }
        } else {
          console.warn('CallManager: Cannot send cancellation - no participantId available');
        }
      } else {
        console.log(
          'CallManager: No valid callId available, skipping server notification',
        );
      }

      // End in state machine AFTER notifying server
      await this.stateMachine.handleEvent(CALL_EVENTS.END_CALL);

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

      // Update the callId with the real server-provided one (replacing temporary ID)
      if (data.callId) {
        this.stateMachine.setCallData({ callId: data.callId });
        console.log(
          'CallManager: Updated callId from temp to server ID:',
          data.callId,
        );
      }

      await this.stateMachine.handleEvent(CALL_EVENTS.CALL_ACCEPTED, {
        callId: data.callId,
      });

      // Only the caller (user) should initiate WebRTC connection
      // The receiver (therapist) should wait for the offer
      const userType = await AuthService.getUserType();
      const webrtcStatus = this.webrtcService.getStatus();

      // Only users should initiate WebRTC, and only if we haven't already started
      if (
        userType === 'user' &&
        webrtcStatus.connectionState !== 'connecting' &&
        webrtcStatus.connectionState !== 'connected' &&
        !this.webrtcInitMutex // Check mutex to prevent race conditions
      ) {
        console.log(
          'CallManager: User side - initiating WebRTC connection for call',
          data.callId,
        );
        // Set mutex to prevent multiple initialization attempts
        this.webrtcInitMutex = true;
        // Small delay to ensure both sides are ready
        this.webrtcInitTimeout = setTimeout(() => {
          this.webrtcInitTimeout = null;
          // Start WebRTC connection initiation
          this.initiateWebRTCConnectionInternal().finally(() => {
            this.webrtcInitMutex = false; // Release mutex when done
          });
        }, 100);
      } else {
        console.log(
          'CallManager: Therapist side, WebRTC already active, or initialization in progress - waiting for offer',
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

    // If we're in ringing state and call ended, it means the caller hung up before we answered
    const currentState = this.stateMachine.getState();
    if (currentState === CALL_STATES.RINGING) {
      console.log('CallManager: Call ended while ringing - caller hung up before pickup');
    }

    await this.stateMachine.handleEvent(CALL_EVENTS.CALL_ENDED, {
      callId: data.callId,
      reason: data.reason,
      endedBy: data.endedBy,
    });
  }

  /**
   * Handle call cancelled
   */
  async handleCallCancelled(data) {
    console.log('CallManager: Call cancelled:', data);

    // Call was cancelled by the caller before therapist could accept
    const currentState = this.stateMachine.getState();
    if (currentState === CALL_STATES.RINGING) {
      console.log('CallManager: Incoming call was cancelled - clearing call state');
    }

    await this.stateMachine.handleEvent(CALL_EVENTS.CALL_CANCELLED, {
      callId: data.callId,
      reason: data.reason || 'cancelled_by_caller',
      endedBy: 'caller',
    });
  }

  /**
   * Initiate WebRTC connection (internal method without mutex check)
   */
  async initiateWebRTCConnectionInternal() {
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
      console.log('CallManager: Creating WebRTC offer...');
      const offerResult = await this.webrtcService.createOffer();
      if (!offerResult.success) {
        throw new Error(offerResult.error);
      }

      console.log('CallManager: Sending offer to remote peer...');
      const callData = this.stateMachine.getCallData();
      const sendResult = this.socketService.sendOffer(callData.callId, offerResult.offer);
      if (!sendResult.success) {
        throw new Error(sendResult.error);
      }

      console.log('CallManager: WebRTC offer sent successfully');
    } catch (error) {
      console.error('CallManager: WebRTC initiation failed:', error);
      await this.stateMachine.handleEvent(CALL_EVENTS.WEBRTC_FAILED, {
        error: error.message,
      });
    }
  }

  /**
   * Initiate WebRTC connection (public method with mutex check)
   */
  async initiateWebRTCConnection() {
    // Double-check mutex to prevent concurrent calls
    if (this.webrtcInitMutex) {
      console.log('CallManager: WebRTC initialization already in progress, skipping');
      return;
    }

    // Call the internal method which has the actual logic
    return this.initiateWebRTCConnectionInternal();
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
  handleRemoteStream() {
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
      console.error(
        'CallManager: Error handling WebRTC ICE state change:',
        error,
      );
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
      // Clean up services sequentially to prevent race conditions
      // WebRTC first to stop media streams, then socket to close connections
      console.log('CallManager: Cleaning up WebRTC service...');
      await this.webrtcService.cleanup();
      
      console.log('CallManager: Disconnecting socket service...');
      await this.socketService.disconnect();
      
      console.log('CallManager: Services cleanup complete');
    } catch (error) {
      console.error('CallManager: Error during service cleanup:', error);
      // Continue with state machine reset even if service cleanup fails
    }

    // Reset state machine
    try {
      this.stateMachine.forceReset();
    } catch (error) {
      console.error('CallManager: Error resetting state machine:', error);
    }

    // Reset initialization state
    this.isInitialized = false;
    this.webrtcInitMutex = false; // Reset mutex

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
