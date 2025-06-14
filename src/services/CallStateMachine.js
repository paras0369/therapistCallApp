/**
 * CallStateMachine - Manages call state transitions with strict validation
 * 
 * This state machine ensures that call states can only transition in valid ways,
 * preventing race conditions and inconsistent states that cause multiple call bugs.
 */

// Call States - comprehensive and mutually exclusive
export const CALL_STATES = {
  // Initial state
  IDLE: 'idle',
  
  // Outgoing call states
  INITIATING: 'initiating',     // User started a call, getting media
  CALLING: 'calling',           // Call request sent, waiting for response
  
  // Incoming call states  
  RINGING: 'ringing',           // Receiving incoming call
  
  // Active call states
  CONNECTING: 'connecting',     // Call accepted, establishing WebRTC
  CONNECTED: 'connected',       // WebRTC connected, audio flowing
  
  // Ending states
  DISCONNECTING: 'disconnecting', // Call being ended
  ENDED: 'ended',               // Call finished, brief transition state
  
  // Error states
  FAILED: 'failed',             // Call failed to connect
  REJECTED: 'rejected',         // Call was rejected
};

// Events that can trigger state transitions
export const CALL_EVENTS = {
  // User initiated events
  START_CALL: 'START_CALL',
  ACCEPT_CALL: 'ACCEPT_CALL', 
  REJECT_CALL: 'REJECT_CALL',
  END_CALL: 'END_CALL',
  
  // System events
  CALL_REQUEST_RECEIVED: 'CALL_REQUEST_RECEIVED',
  CALL_ACCEPTED: 'CALL_ACCEPTED',
  CALL_REJECTED: 'CALL_REJECTED',
  CALL_ENDED: 'CALL_ENDED',
  
  // WebRTC events
  MEDIA_ACQUIRED: 'MEDIA_ACQUIRED',
  WEBRTC_CONNECTING: 'WEBRTC_CONNECTING',
  WEBRTC_CONNECTED: 'WEBRTC_CONNECTED',
  WEBRTC_FAILED: 'WEBRTC_FAILED',
  WEBRTC_DISCONNECTED: 'WEBRTC_DISCONNECTED',
  
  // Error events
  MEDIA_FAILED: 'MEDIA_FAILED',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  TIMEOUT: 'TIMEOUT',
  
  // Reset events
  RESET: 'RESET',
};

// Valid state transitions - prevents invalid state changes
const STATE_TRANSITIONS = {
  [CALL_STATES.IDLE]: [
    CALL_STATES.INITIATING,  // User starts call
    CALL_STATES.RINGING,     // Incoming call received
  ],
  
  [CALL_STATES.INITIATING]: [
    CALL_STATES.CALLING,     // Media acquired, sending request
    CALL_STATES.FAILED,      // Media acquisition failed
    CALL_STATES.IDLE,        // User cancelled
  ],
  
  [CALL_STATES.CALLING]: [
    CALL_STATES.CONNECTING,  // Call accepted
    CALL_STATES.REJECTED,    // Call rejected
    CALL_STATES.FAILED,      // Call failed
    CALL_STATES.IDLE,        // User cancelled
  ],
  
  [CALL_STATES.RINGING]: [
    CALL_STATES.CONNECTING,  // Call accepted
    CALL_STATES.REJECTED,    // Call rejected
    CALL_STATES.ENDED,       // Call ended by caller
  ],
  
  [CALL_STATES.CONNECTING]: [
    CALL_STATES.CONNECTED,   // WebRTC connected
    CALL_STATES.FAILED,      // Connection failed
    CALL_STATES.DISCONNECTING, // Call ended during connection
  ],
  
  [CALL_STATES.CONNECTED]: [
    CALL_STATES.DISCONNECTING, // Call ended by local user
    CALL_STATES.ENDED,       // Call ended by remote party
    CALL_STATES.FAILED,      // Connection lost
    CALL_STATES.REJECTED,    // Call rejected after connection (edge case)
  ],
  
  [CALL_STATES.DISCONNECTING]: [
    CALL_STATES.ENDED,       // Disconnect complete
  ],
  
  // Terminal states can only go to IDLE
  [CALL_STATES.ENDED]: [CALL_STATES.IDLE],
  [CALL_STATES.FAILED]: [CALL_STATES.IDLE],
  [CALL_STATES.REJECTED]: [CALL_STATES.IDLE],
};

// Event to state mappings
const EVENT_STATE_MAP = {
  [CALL_EVENTS.START_CALL]: CALL_STATES.INITIATING,
  [CALL_EVENTS.CALL_REQUEST_RECEIVED]: CALL_STATES.RINGING,
  [CALL_EVENTS.MEDIA_ACQUIRED]: CALL_STATES.CALLING,
  [CALL_EVENTS.ACCEPT_CALL]: CALL_STATES.CONNECTING,
  [CALL_EVENTS.CALL_ACCEPTED]: CALL_STATES.CONNECTING,
  [CALL_EVENTS.WEBRTC_CONNECTING]: CALL_STATES.CONNECTING,
  [CALL_EVENTS.WEBRTC_CONNECTED]: CALL_STATES.CONNECTED,
  [CALL_EVENTS.END_CALL]: CALL_STATES.DISCONNECTING,
  [CALL_EVENTS.CALL_ENDED]: CALL_STATES.ENDED,
  [CALL_EVENTS.REJECT_CALL]: CALL_STATES.REJECTED,
  [CALL_EVENTS.CALL_REJECTED]: CALL_STATES.REJECTED,
  [CALL_EVENTS.WEBRTC_FAILED]: CALL_STATES.FAILED,
  [CALL_EVENTS.CONNECTION_FAILED]: CALL_STATES.FAILED,
  [CALL_EVENTS.MEDIA_FAILED]: CALL_STATES.FAILED,
  [CALL_EVENTS.TIMEOUT]: CALL_STATES.FAILED,
  [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
};

// States that should automatically transition to IDLE after a delay
const AUTO_RESET_STATES = [
  CALL_STATES.ENDED,
  CALL_STATES.FAILED, 
  CALL_STATES.REJECTED,
];

// States that indicate an active call (prevents new calls)
const ACTIVE_CALL_STATES = [
  CALL_STATES.INITIATING,
  CALL_STATES.CALLING,
  CALL_STATES.RINGING,
  CALL_STATES.CONNECTING,
  CALL_STATES.CONNECTED,
  CALL_STATES.DISCONNECTING,
];

class CallStateMachine {
  constructor() {
    this.currentState = CALL_STATES.IDLE;
    this.previousState = null;
    this.listeners = new Set();
    this.eventQueue = [];
    this.isProcessing = false;
    this.autoResetTimer = null;
    this.stateHistory = [];
    this.maxHistorySize = 50;
    
    // Call metadata
    this.callId = null;
    this.participantId = null;
    this.participantName = null;
    this.callType = null;
    this.startTime = null;
    this.endTime = null;
    
    // Bind methods
    this.transition = this.transition.bind(this);
    this.canTransition = this.canTransition.bind(this);
    this.handleEvent = this.handleEvent.bind(this);
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Get call metadata
   */
  getCallData() {
    return {
      callId: this.callId,
      participantId: this.participantId,
      participantName: this.participantName,
      callType: this.callType,
      startTime: this.startTime,
      endTime: this.endTime,
      currentState: this.currentState,
      previousState: this.previousState,
    };
  }

  /**
   * Set call metadata
   */
  setCallData(data) {
    if (data.callId !== undefined) this.callId = data.callId;
    if (data.participantId !== undefined) this.participantId = data.participantId;
    if (data.participantName !== undefined) this.participantName = data.participantName;
    if (data.callType !== undefined) this.callType = data.callType;
    if (data.startTime !== undefined) this.startTime = data.startTime;
    if (data.endTime !== undefined) this.endTime = data.endTime;
  }

  /**
   * Check if transition is valid
   */
  canTransition(toState) {
    const validTransitions = STATE_TRANSITIONS[this.currentState] || [];
    return validTransitions.includes(toState);
  }

  /**
   * Check if currently in an active call state
   */
  isInActiveCall() {
    return ACTIVE_CALL_STATES.includes(this.currentState);
  }

  /**
   * Check if can start a new call
   */
  canStartNewCall() {
    return this.currentState === CALL_STATES.IDLE;
  }

  /**
   * Transition to new state with validation
   */
  transition(toState, metadata = {}) {
    if (this.currentState === toState) {
      console.log(`CallStateMachine: Already in state ${toState}`);
      return true;
    }

    if (!this.canTransition(toState)) {
      console.error(`CallStateMachine: Invalid transition from ${this.currentState} to ${toState}`);
      return false;
    }

    console.log(`CallStateMachine: ${this.currentState} → ${toState}`, metadata);

    // Store previous state
    this.previousState = this.currentState;
    
    // Update state history
    this.stateHistory.push({
      from: this.currentState,
      to: toState,
      timestamp: Date.now(),
      metadata,
    });
    
    // Keep history size manageable
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // Update current state
    this.currentState = toState;

    // Handle state-specific logic
    this.handleStateEntry(toState, metadata);

    // Notify listeners
    this.notifyListeners(toState, this.previousState, metadata);

    return true;
  }

  /**
   * Handle state entry logic
   */
  handleStateEntry(state, metadata) {
    // Clear any existing auto-reset timer
    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
      this.autoResetTimer = null;
    }

    switch (state) {
      case CALL_STATES.INITIATING:
        this.startTime = Date.now();
        break;
        
      case CALL_STATES.CONNECTED:
        // Mark actual connection time
        if (!this.startTime) {
          this.startTime = Date.now();
        }
        break;
        
      case CALL_STATES.ENDED:
      case CALL_STATES.FAILED:
      case CALL_STATES.REJECTED:
        this.endTime = Date.now();
        // Auto-reset to IDLE after delay
        this.autoResetTimer = setTimeout(() => {
          this.transition(CALL_STATES.IDLE, { reason: 'auto_reset' });
        }, 1000);
        break;
        
      case CALL_STATES.IDLE:
        // Clear all call metadata
        this.clearCallData();
        break;
    }
  }

  /**
   * Handle incoming events and transition accordingly
   */
  async handleEvent(event, metadata = {}) {
    console.log(`CallStateMachine: Handling event ${event} in state ${this.currentState}`, metadata);

    // Add event to queue for processing
    return new Promise((resolve) => {
      this.eventQueue.push({ event, metadata, resolve });
      this.processEventQueue();
    });
  }

  /**
   * Process events in queue to prevent race conditions
   */
  async processEventQueue() {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const { event, metadata, resolve } = this.eventQueue.shift();
      
      try {
        const result = await this.processEvent(event, metadata);
        resolve(result);
      } catch (error) {
        console.error('CallStateMachine: Error processing event:', error);
        resolve({ success: false, error: error.message });
      }
    }

    this.isProcessing = false;
  }

  /**
   * Process individual event
   */
  async processEvent(event, metadata = {}) {
    // Handle RESET event specially - always allowed
    if (event === CALL_EVENTS.RESET) {
      this.forceReset();
      return { success: true };
    }

    // Get target state for this event
    const targetState = EVENT_STATE_MAP[event];
    
    if (!targetState) {
      console.warn(`CallStateMachine: No target state defined for event ${event}`);
      return { success: false, error: 'Unknown event' };
    }

    // Handle special event logic
    const preprocessResult = await this.preprocessEvent(event, metadata);
    if (!preprocessResult.success) {
      return preprocessResult;
    }

    // Attempt transition
    const success = this.transition(targetState, { ...metadata, event });
    
    return { 
      success, 
      state: this.currentState,
      previousState: this.previousState 
    };
  }

  /**
   * Handle special event preprocessing
   */
  async preprocessEvent(event, metadata) {
    switch (event) {
      case CALL_EVENTS.START_CALL:
        // Prevent multiple calls
        if (this.isInActiveCall()) {
          return { success: false, error: 'Call already in progress' };
        }
        // Set call metadata
        this.setCallData({
          participantId: metadata.participantId,
          participantName: metadata.participantName,
          callType: metadata.callType || 'voice',
        });
        break;

      case CALL_EVENTS.CALL_REQUEST_RECEIVED:
        // Only accept incoming calls when idle
        if (this.currentState !== CALL_STATES.IDLE) {
          return { success: false, error: 'Cannot receive call - not idle' };
        }
        // Set call metadata
        this.setCallData({
          callId: metadata.callId,
          participantId: metadata.participantId,
          participantName: metadata.participantName,
          callType: metadata.callType || 'voice',
        });
        break;

      case CALL_EVENTS.CALL_ACCEPTED:
        // Set call ID when call is accepted
        if (metadata.callId) {
          this.setCallData({ callId: metadata.callId });
        }
        break;
    }

    return { success: true };
  }

  /**
   * Force reset to IDLE state (emergency reset)
   */
  forceReset() {
    console.log('CallStateMachine: Force reset to IDLE');
    
    // Clear timer
    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
      this.autoResetTimer = null;
    }
    
    // Clear event queue
    this.eventQueue = [];
    this.isProcessing = false;
    
    // Record the reset
    this.stateHistory.push({
      from: this.currentState,
      to: CALL_STATES.IDLE,
      timestamp: Date.now(),
      metadata: { event: 'FORCE_RESET' },
    });
    
    // Reset state
    this.previousState = this.currentState;
    this.currentState = CALL_STATES.IDLE;
    
    // Clear call data
    this.clearCallData();
    
    // Notify listeners
    this.notifyListeners(CALL_STATES.IDLE, this.previousState, { forced: true });
  }

  /**
   * Clear all call metadata
   */
  clearCallData() {
    this.callId = null;
    this.participantId = null;
    this.participantName = null;
    this.callType = null;
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Add state change listener
   */
  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   */
  notifyListeners(newState, previousState, metadata) {
    const callData = this.getCallData();
    this.listeners.forEach(listener => {
      try {
        listener(newState, previousState, callData, metadata);
      } catch (error) {
        console.error('CallStateMachine: Error in listener:', error);
      }
    });
  }

  /**
   * Get state history for debugging
   */
  getStateHistory() {
    return [...this.stateHistory];
  }

  /**
   * Get detailed state info for debugging
   */
  getDebugInfo() {
    return {
      currentState: this.currentState,
      previousState: this.previousState,
      callData: this.getCallData(),
      isProcessing: this.isProcessing,
      queueLength: this.eventQueue.length,
      listenerCount: this.listeners.size,
      hasAutoResetTimer: !!this.autoResetTimer,
      stateHistory: this.getStateHistory().slice(-10), // Last 10 transitions
    };
  }
}

export default CallStateMachine;