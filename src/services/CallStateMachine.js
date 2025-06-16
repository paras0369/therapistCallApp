/**
 * CallStateMachine - Enhanced with better event queue management
 */

// Call States - comprehensive and mutually exclusive
export const CALL_STATES = {
  // Initial state
  IDLE: 'idle',

  // Outgoing call states
  INITIATING: 'initiating', // User started a call, getting media
  CALLING: 'calling', // Call request sent, waiting for response

  // Incoming call states
  RINGING: 'ringing', // Receiving incoming call

  // Active call states
  CONNECTING: 'connecting', // Call accepted, establishing WebRTC
  CONNECTED: 'connected', // WebRTC connected, audio flowing

  // Ending states
  DISCONNECTING: 'disconnecting', // Call being ended
  ENDED: 'ended', // Call finished, brief transition state

  // Error states
  FAILED: 'failed', // Call failed to connect
  REJECTED: 'rejected', // Call was rejected
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
  CALL_CANCELLED: 'CALL_CANCELLED',
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

  [CALL_STATES.INITIATING]: {
    [CALL_EVENTS.MEDIA_ACQUIRED]: CALL_STATES.CALLING,
    [CALL_EVENTS.MEDIA_FAILED]: CALL_STATES.FAILED,
    [CALL_EVENTS.END_CALL]: CALL_STATES.IDLE,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },

  [CALL_STATES.CALLING]: {
    [CALL_EVENTS.CALL_ACCEPTED]: CALL_STATES.CONNECTING,
    [CALL_EVENTS.CALL_REJECTED]: CALL_STATES.REJECTED,
    [CALL_EVENTS.CONNECTION_FAILED]: CALL_STATES.FAILED,
    [CALL_EVENTS.TIMEOUT]: CALL_STATES.FAILED,
    [CALL_EVENTS.END_CALL]: CALL_STATES.IDLE,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },

  [CALL_STATES.RINGING]: {
    [CALL_EVENTS.ACCEPT_CALL]: CALL_STATES.CONNECTING,
    [CALL_EVENTS.REJECT_CALL]: CALL_STATES.REJECTED,
    [CALL_EVENTS.CALL_CANCELLED]: CALL_STATES.ENDED,
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.ENDED,
    [CALL_EVENTS.TIMEOUT]: CALL_STATES.FAILED,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },

  [CALL_STATES.CONNECTING]: {
    [CALL_EVENTS.WEBRTC_CONNECTED]: CALL_STATES.CONNECTED,
    [CALL_EVENTS.WEBRTC_FAILED]: CALL_STATES.FAILED,
    [CALL_EVENTS.CONNECTION_FAILED]: CALL_STATES.FAILED,
    [CALL_EVENTS.TIMEOUT]: CALL_STATES.FAILED,
    [CALL_EVENTS.END_CALL]: CALL_STATES.DISCONNECTING,
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.ENDED,
    [CALL_EVENTS.CALL_ACCEPTED]: CALL_STATES.CONNECTING, // Idempotent - stay in connecting
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },

  [CALL_STATES.CONNECTED]: {
    [CALL_EVENTS.END_CALL]: CALL_STATES.DISCONNECTING,
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.ENDED,
    [CALL_EVENTS.WEBRTC_DISCONNECTED]: CALL_STATES.DISCONNECTING,
    [CALL_EVENTS.WEBRTC_FAILED]: CALL_STATES.FAILED,
    [CALL_EVENTS.CONNECTION_FAILED]: CALL_STATES.FAILED,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },

  [CALL_STATES.DISCONNECTING]: {
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.ENDED,
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },

  // Terminal states
  [CALL_STATES.ENDED]: {
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },
  [CALL_STATES.FAILED]: {
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },
  [CALL_STATES.REJECTED]: {
    [CALL_EVENTS.RESET]: CALL_STATES.IDLE,
  },
  
  // Handle stale events when already in IDLE
  [CALL_STATES.IDLE]: {
    [CALL_EVENTS.START_CALL]: CALL_STATES.INITIATING,
    [CALL_EVENTS.CALL_REQUEST_RECEIVED]: CALL_STATES.RINGING,
    // Gracefully ignore stale events from previous calls
    [CALL_EVENTS.CALL_ACCEPTED]: CALL_STATES.IDLE, // Idempotent - stay idle
    [CALL_EVENTS.CALL_ENDED]: CALL_STATES.IDLE, // Idempotent - stay idle
    [CALL_EVENTS.CALL_CANCELLED]: CALL_STATES.IDLE, // Idempotent - stay idle
    [CALL_EVENTS.CALL_REJECTED]: CALL_STATES.IDLE, // Idempotent - stay idle
  },
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

// Priority levels for events (higher number = higher priority)
const EVENT_PRIORITY = {
  [CALL_EVENTS.RESET]: 100,
  [CALL_EVENTS.END_CALL]: 90,
  [CALL_EVENTS.CALL_ENDED]: 85,
  [CALL_EVENTS.WEBRTC_FAILED]: 80,
  [CALL_EVENTS.CONNECTION_FAILED]: 80,
  [CALL_EVENTS.MEDIA_FAILED]: 80,
  [CALL_EVENTS.TIMEOUT]: 75,
  [CALL_EVENTS.CALL_REJECTED]: 70,
  [CALL_EVENTS.CALL_CANCELLED]: 70,
  [CALL_EVENTS.REJECT_CALL]: 65,
  [CALL_EVENTS.WEBRTC_CONNECTED]: 60,
  [CALL_EVENTS.WEBRTC_DISCONNECTED]: 55,
  [CALL_EVENTS.CALL_ACCEPTED]: 50,
  [CALL_EVENTS.ACCEPT_CALL]: 45,
  [CALL_EVENTS.WEBRTC_CONNECTING]: 40,
  [CALL_EVENTS.MEDIA_ACQUIRED]: 35,
  [CALL_EVENTS.CALL_REQUEST_RECEIVED]: 30,
  [CALL_EVENTS.START_CALL]: 20,
};

class CallStateMachine {
  constructor() {
    this.currentState = CALL_STATES.IDLE;
    this.previousState = null;
    this.listeners = new Set();
    this.eventQueue = [];
    this.isProcessing = false;
    this.autoResetTimer = null;
    this.stateHistory = [];
    this.maxHistorySize = 20; // Reduced from 50 to save memory
    this.eventDedupeWindow = 500; // ms
    this.recentEvents = new Map();
    this.maxEventQueueSize = 50; // Prevent unbounded queue growth
    
    // Periodic cleanup for memory management
    this.cleanupInterval = setInterval(() => {
      this.cleanupRecentEvents();
    }, 10000); // Cleanup every 10 seconds

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
    if (data.participantId !== undefined)
      this.participantId = data.participantId;
    if (data.participantName !== undefined)
      this.participantName = data.participantName;
    if (data.callType !== undefined) this.callType = data.callType;
    if (data.startTime !== undefined) this.startTime = data.startTime;
    if (data.endTime !== undefined) this.endTime = data.endTime;
  }

  /**
   * Check if transition is valid for an event
   */
  canTransition(event) {
    const transitions = STATE_TRANSITIONS[this.currentState];
    return transitions && transitions.hasOwnProperty(event);
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
   * Transition to new state based on event
   */
  transition(event, metadata = {}) {
    const transitions = STATE_TRANSITIONS[this.currentState];
    if (!transitions || !transitions[event]) {
      console.warn(
        `CallStateMachine: Invalid event ${event} for state ${this.currentState}`,
      );
      return false;
    }

    const toState = transitions[event];

    if (this.currentState === toState) {
      console.log(`CallStateMachine: Already in state ${toState}`);
      return true;
    }

    console.log(
      `CallStateMachine: ${this.currentState} → ${toState} (event: ${event})`,
      metadata,
    );

    // Store previous state
    this.previousState = this.currentState;

    // Update state history
    this.stateHistory.push({
      from: this.currentState,
      to: toState,
      event,
      timestamp: Date.now(),
      metadata,
    });

    // Keep history size manageable - remove multiple old entries at once for efficiency
    if (this.stateHistory.length > this.maxHistorySize) {
      const excessCount = this.stateHistory.length - this.maxHistorySize;
      this.stateHistory.splice(0, excessCount);
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
          this.handleEvent(CALL_EVENTS.RESET, { reason: 'auto_reset' });
        }, 1000);
        break;

      case CALL_STATES.IDLE:
        // Clear all call metadata
        this.clearCallData();
        // Clear event queue when returning to idle
        this.eventQueue = [];
        this.recentEvents.clear();
        break;
    }
  }

  /**
   * Check if event is duplicate within time window
   */
  isDuplicateEvent(event, metadata) {
    const eventKey = `${event}_${JSON.stringify(metadata)}`;
    const lastEventTime = this.recentEvents.get(eventKey);
    const now = Date.now();

    if (lastEventTime && now - lastEventTime < this.eventDedupeWindow) {
      console.log(`CallStateMachine: Ignoring duplicate event ${event}`);
      return true;
    }

    this.recentEvents.set(eventKey, now);

    // Clean up old entries
    for (const [key, time] of this.recentEvents) {
      if (now - time > this.eventDedupeWindow * 2) {
        this.recentEvents.delete(key);
      }
    }

    return false;
  }

  /**
   * Handle incoming events and transition accordingly
   */
  async handleEvent(event, metadata = {}) {
    console.log(
      `CallStateMachine: Handling event ${event} in state ${this.currentState}`,
      metadata,
    );

    // Check for duplicate events
    if (event !== CALL_EVENTS.RESET && this.isDuplicateEvent(event, metadata)) {
      return { success: true, state: this.currentState };
    }

    // Add event to queue for processing
    return new Promise(resolve => {
      const priority = EVENT_PRIORITY[event] || 0;

      // Check queue size to prevent unbounded growth
      if (this.eventQueue.length >= this.maxEventQueueSize) {
        console.warn('CallStateMachine: Event queue full, dropping lowest priority event');
        // Find and remove the lowest priority event
        let lowestPriorityIndex = 0;
        let lowestPriority = this.eventQueue[0].priority;
        
        for (let i = 1; i < this.eventQueue.length; i++) {
          if (this.eventQueue[i].priority < lowestPriority) {
            lowestPriority = this.eventQueue[i].priority;
            lowestPriorityIndex = i;
          }
        }
        
        const droppedEvent = this.eventQueue.splice(lowestPriorityIndex, 1)[0];
        droppedEvent.resolve({ success: false, error: 'Event queue full' });
      }

      // Insert event in queue based on priority using binary search for efficiency
      const eventItem = {
        event,
        metadata,
        resolve,
        priority,
        timestamp: Date.now(),
      };

      // Binary search to find insertion point
      let left = 0;
      let right = this.eventQueue.length;
      
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (this.eventQueue[mid].priority >= eventItem.priority) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }
      
      this.eventQueue.splice(left, 0, eventItem);

      this.processEventQueue();
    });
  }

  /**
   * Process events in queue
   */
  async processEventQueue() {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const { event, metadata, resolve, timestamp } = this.eventQueue.shift();

      // Skip stale events (older than 5 seconds) except RESET
      if (event !== CALL_EVENTS.RESET && Date.now() - timestamp > 5000) {
        console.log(`CallStateMachine: Skipping stale event ${event}`);
        resolve({ success: false, error: 'Event expired' });
        continue;
      }

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

    // Check if transition is valid
    if (!this.canTransition(event)) {
      console.warn(
        `CallStateMachine: Cannot handle event ${event} in state ${this.currentState}`,
      );
      return { success: false, error: 'Invalid event for current state' };
    }

    // Handle special event logic
    const preprocessResult = await this.preprocessEvent(event, metadata);
    if (!preprocessResult.success) {
      return preprocessResult;
    }

    // Attempt transition
    const success = this.transition(event, metadata);

    return {
      success,
      state: this.currentState,
      previousState: this.previousState,
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

      case CALL_EVENTS.ACCEPT_CALL:
        // Ensure we're in ringing state
        if (this.currentState !== CALL_STATES.RINGING) {
          return { success: false, error: 'No incoming call to accept' };
        }
        break;

      case CALL_EVENTS.END_CALL:
        // Can only end active calls
        if (!this.isInActiveCall()) {
          return { success: false, error: 'No active call to end' };
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

    // Clear timers
    if (this.autoResetTimer) {
      clearTimeout(this.autoResetTimer);
      this.autoResetTimer = null;
    }
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear event queue
    this.eventQueue.forEach(item => {
      item.resolve({ success: false, error: 'State machine reset' });
    });
    this.eventQueue = [];
    this.isProcessing = false;
    this.recentEvents.clear();

    // Record the reset
    this.stateHistory.push({
      from: this.currentState,
      to: CALL_STATES.IDLE,
      event: CALL_EVENTS.RESET,
      timestamp: Date.now(),
      metadata: { forced: true },
    });

    // Reset state
    this.previousState = this.currentState;
    this.currentState = CALL_STATES.IDLE;

    // Clear call data
    this.clearCallData();

    // Notify listeners
    this.notifyListeners(CALL_STATES.IDLE, this.previousState, {
      forced: true,
    });
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
   * Cleanup expired events from recent events map
   */
  cleanupRecentEvents() {
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, timestamp] of this.recentEvents.entries()) {
      if (now - timestamp > this.eventDedupeWindow) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.recentEvents.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      console.log(`CallStateMachine: Cleaned up ${expiredKeys.length} expired events from dedupe map`);
    }
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
      queuedEvents: this.eventQueue.map(e => ({
        event: e.event,
        priority: e.priority,
      })),
      listenerCount: this.listeners.size,
      hasAutoResetTimer: !!this.autoResetTimer,
      recentEventsCount: this.recentEvents.size,
      stateHistory: this.getStateHistory().slice(-10), // Last 10 transitions
    };
  }
}

export default CallStateMachine;
