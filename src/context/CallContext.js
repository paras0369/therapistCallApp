/**
 * CallContext - Enhanced call context using the new calling system
 * 
 * This context provides a clean React interface to the CallManager system,
 * with better state management and error handling.
 */

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import CallManager, { CALL_MANAGER_EVENTS, ERROR_TYPES } from '../services/CallManager';
import { CALL_STATES } from '../services/CallStateMachine';
import { useAuth } from './AuthContext';

const CallContext = createContext();

// Action types for the reducer
const CALL_ACTIONS = {
  SET_MANAGER_STATE: 'SET_MANAGER_STATE',
  SET_CALL_DATA: 'SET_CALL_DATA',
  SET_INCOMING_CALL: 'SET_INCOMING_CALL',
  CLEAR_INCOMING_CALL: 'CLEAR_INCOMING_CALL',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_LOADING: 'SET_LOADING',
  SET_INITIALIZATION_STATE: 'SET_INITIALIZATION_STATE',
  SET_CONNECTION_STATUS: 'SET_CONNECTION_STATUS',
  SET_DEBUG_INFO: 'SET_DEBUG_INFO',
};

// Initial state
const initialState = {
  // Core call state
  callState: CALL_STATES.IDLE,
  callData: {
    callId: null,
    participantId: null,
    participantName: null,
    callType: null,
    startTime: null,
    endTime: null,
  },
  
  // Incoming call state
  incomingCall: null,
  
  // Manager state
  isInitialized: false,
  isInitializing: false,
  
  // Connection status
  connectionStatus: {
    socketConnected: false,
    webrtcReady: false,
    currentOperation: null,
  },
  
  // UI state
  loading: false,
  error: null,
  
  // Debug info (development only)
  debugInfo: null,
};

// Derived state helpers
const getDerivedState = (state) => ({
  ...state,
  isCallActive: [
    CALL_STATES.INITIATING,
    CALL_STATES.CALLING,
    CALL_STATES.RINGING,
    CALL_STATES.CONNECTING,
    CALL_STATES.CONNECTED,
    CALL_STATES.DISCONNECTING,
  ].includes(state.callState),
  
  isInCall: state.callState === CALL_STATES.CONNECTED,
  
  canStartCall: state.callState === CALL_STATES.IDLE && 
                state.isInitialized && 
                state.connectionStatus.socketConnected,
                
  canAcceptCall: state.callState === CALL_STATES.RINGING && 
                 state.incomingCall !== null,
                 
  isConnecting: [
    CALL_STATES.INITIATING,
    CALL_STATES.CALLING,
    CALL_STATES.CONNECTING,
  ].includes(state.callState),
  
  hasError: state.error !== null,
});

// Reducer
const callReducer = (state, action) => {
  switch (action.type) {
    case CALL_ACTIONS.SET_MANAGER_STATE:
      return {
        ...state,
        callState: action.payload.newState,
        callData: action.payload.callData || state.callData,
      };
      
    case CALL_ACTIONS.SET_CALL_DATA:
      return {
        ...state,
        callData: { ...state.callData, ...action.payload },
      };
      
    case CALL_ACTIONS.SET_INCOMING_CALL:
      return {
        ...state,
        incomingCall: action.payload,
      };
      
    case CALL_ACTIONS.CLEAR_INCOMING_CALL:
      return {
        ...state,
        incomingCall: null,
      };
      
    case CALL_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
      
    case CALL_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };
      
    case CALL_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };
      
    case CALL_ACTIONS.SET_INITIALIZATION_STATE:
      return {
        ...state,
        isInitialized: action.payload.isInitialized,
        isInitializing: action.payload.isInitializing,
      };
      
    case CALL_ACTIONS.SET_CONNECTION_STATUS:
      return {
        ...state,
        connectionStatus: { ...state.connectionStatus, ...action.payload },
      };
      
    case CALL_ACTIONS.SET_DEBUG_INFO:
      return {
        ...state,
        debugInfo: action.payload,
      };
      
    default:
      return state;
  }
};

// Provider component
export const CallProvider = ({ children }) => {
  const [state, dispatch] = useReducer(callReducer, initialState);
  const { isAuthenticated } = useAuth();
  const callManagerRef = useRef(null);
  const initializationPromiseRef = useRef(null);

  // Initialize CallManager when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      initializeCallManager();
    } else {
      cleanupCallManager();
    }

    return () => {
      cleanupCallManager();
    };
  }, [isAuthenticated]);

  // Initialize CallManager
  const initializeCallManager = useCallback(async () => {
    // Prevent multiple initialization attempts
    if (initializationPromiseRef.current) {
      console.log('CallContext: Initialization already in progress, returning existing promise');
      return initializationPromiseRef.current;
    }

    // Check if already initialized
    if (state.isInitialized && callManagerRef.current) {
      console.log('CallContext: CallManager already initialized');
      return { success: true };
    }

    try {
      console.log('CallContextV2: Initializing CallManager...');
      
      dispatch({
        type: CALL_ACTIONS.SET_INITIALIZATION_STATE,
        payload: { isInitialized: false, isInitializing: true },
      });

      // Clean up existing manager
      if (callManagerRef.current) {
        await callManagerRef.current.cleanup();
      }

      // Create new CallManager
      callManagerRef.current = new CallManager();
      
      // Setup event listeners
      setupCallManagerListeners();

      // Initialize the manager
      const result = await callManagerRef.current.initialize();
      
      if (result.success) {
        console.log('CallContextV2: CallManager initialized successfully');
        dispatch({
          type: CALL_ACTIONS.SET_INITIALIZATION_STATE,
          payload: { isInitialized: true, isInitializing: false },
        });
        updateConnectionStatus();
      } else {
        throw new Error(result.error);
      }

      initializationPromiseRef.current = null;
      return result;

    } catch (error) {
      console.error('CallContextV2: CallManager initialization failed:', error);
      
      dispatch({
        type: CALL_ACTIONS.SET_INITIALIZATION_STATE,
        payload: { isInitialized: false, isInitializing: false },
      });
      
      dispatch({
        type: CALL_ACTIONS.SET_ERROR,
        payload: {
          type: ERROR_TYPES.INITIALIZATION_FAILED,
          message: `Failed to initialize calling service: ${error.message}`,
          error,
        },
      });

      initializationPromiseRef.current = null;
      throw error;
    }
  }, []);

  // Setup CallManager event listeners
  const setupCallManagerListeners = useCallback(() => {
    if (!callManagerRef.current) return;

    const manager = callManagerRef.current;

    // State changes
    manager.on(CALL_MANAGER_EVENTS.STATE_CHANGED, (event) => {
      console.log('CallContextV2: State changed:', event);
      dispatch({
        type: CALL_ACTIONS.SET_MANAGER_STATE,
        payload: event,
      });
      updateConnectionStatus();
    });

    // Call data changes
    manager.on(CALL_MANAGER_EVENTS.CALL_DATA_CHANGED, (callData) => {
      dispatch({
        type: CALL_ACTIONS.SET_CALL_DATA,
        payload: callData,
      });
    });

    // Incoming call
    manager.on(CALL_MANAGER_EVENTS.INCOMING_CALL, (callData) => {
      console.log('CallContextV2: Incoming call:', callData);
      dispatch({
        type: CALL_ACTIONS.SET_INCOMING_CALL,
        payload: callData,
      });
    });

    // Call connected
    manager.on(CALL_MANAGER_EVENTS.CALL_CONNECTED, (callData) => {
      console.log('CallContextV2: Call connected:', callData);
      dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
    });

    // Call ended
    manager.on(CALL_MANAGER_EVENTS.CALL_ENDED, (event) => {
      console.log('CallContextV2: Call ended:', event);
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      updateConnectionStatus();
    });

    // Call cancelled
    manager.on(CALL_MANAGER_EVENTS.CALL_CANCELLED, (event) => {
      console.log('CallContextV2: Call cancelled:', event);
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      
      // Show alert notification for call cancellation
      Alert.alert(
        'Call Cancelled',
        `${event.reason.charAt(0).toUpperCase() + event.reason.slice(1)}`,
        [{ text: 'OK', style: 'default' }]
      );
      
      updateConnectionStatus();
    });

    // Errors
    manager.on(CALL_MANAGER_EVENTS.ERROR, (error) => {
      console.error('CallContextV2: CallManager error:', error);
      dispatch({
        type: CALL_ACTIONS.SET_ERROR,
        payload: error,
      });
      updateConnectionStatus();
    });

    // Debug info (development only)
    if (__DEV__) {
      manager.on(CALL_MANAGER_EVENTS.DEBUG, (debug) => {
        dispatch({
          type: CALL_ACTIONS.SET_DEBUG_INFO,
          payload: debug,
        });
      });
    }
  }, []);

  // Update connection status
  const updateConnectionStatus = useCallback(() => {
    if (!callManagerRef.current) return;

    const status = callManagerRef.current.getConnectionStatus();
    dispatch({
      type: CALL_ACTIONS.SET_CONNECTION_STATUS,
      payload: {
        socketConnected: status.socketConnected,
        webrtcReady: status.webrtcStatus?.hasPeerConnection || false,
        currentOperation: status.currentOperation,
      },
    });
  }, []);

  // Cleanup CallManager
  const cleanupCallManager = useCallback(async () => {
    if (callManagerRef.current) {
      await callManagerRef.current.cleanup();
      callManagerRef.current = null;
    }
    
    initializationPromiseRef.current = null;
    
    dispatch({
      type: CALL_ACTIONS.SET_INITIALIZATION_STATE,
      payload: { isInitialized: false, isInitializing: false },
    });
    
    dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
    dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
  }, []);

  // Action methods
  const startCall = useCallback(async (therapistId, therapistName, callType = 'voice') => {
    if (!callManagerRef.current) {
      throw new Error('CallManager not initialized');
    }

    // Prevent duplicate calls if already loading or in progress
    if (state.loading || state.isCallActive) {
      console.log('CallContext: Ignoring startCall - call already in progress');
      return { success: false, error: 'Call already in progress' };
    }

    try {
      // Set loading state IMMEDIATELY to prevent race conditions
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });

      // Double-check after setting loading state (for race condition protection)
      if (state.isCallActive) {
        console.log('CallContext: Call became active during loading state update');
        dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
        return { success: false, error: 'Call already in progress' };
      }

      const result = await callManagerRef.current.startCall(therapistId, therapistName, callType);
      
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
      throw error;
    }
  }, [state.loading, state.isCallActive]);

  const acceptCall = useCallback(async (callId) => {
    if (!callManagerRef.current) {
      throw new Error('CallManager not initialized');
    }

    try {
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });

      const result = await callManagerRef.current.acceptCall(callId);
      
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
      throw error;
    }
  }, []);

  const rejectCall = useCallback(async (callId) => {
    if (!callManagerRef.current) {
      throw new Error('CallManager not initialized');
    }

    try {
      const result = await callManagerRef.current.rejectCall(callId);
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('CallContextV2: Reject call failed:', error);
      throw error;
    }
  }, []);

  const endCall = useCallback(async () => {
    if (!callManagerRef.current) {
      throw new Error('CallManager not initialized');
    }

    try {
      const result = await callManagerRef.current.endCall();
      
      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      console.error('CallContextV2: End call failed:', error);
      throw error;
    }
  }, []);

  const forceReset = useCallback(async () => {
    if (!callManagerRef.current) {
      return;
    }

    try {
      await callManagerRef.current.forceReset();
      dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      updateConnectionStatus();
    } catch (error) {
      console.error('CallContextV2: Force reset failed:', error);
    }
  }, [updateConnectionStatus]);

  const clearError = useCallback(() => {
    dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
  }, []);

  const retryInitialization = useCallback(async () => {
    if (state.isInitializing) {
      return;
    }

    try {
      await initializeCallManager();
    } catch (error) {
      console.error('CallContextV2: Retry initialization failed:', error);
    }
  }, [state.isInitializing, initializeCallManager]);

  // Get debug information (development only)
  const getDebugInfo = useCallback(() => {
    if (!callManagerRef.current) {
      return null;
    }
    return callManagerRef.current.getDebugInfo();
  }, []);

  // Context value with derived state
  const value = {
    // Core state
    ...getDerivedState(state),
    
    // Actions
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    forceReset,
    clearError,
    retryInitialization,
    
    // Utilities
    getDebugInfo: __DEV__ ? getDebugInfo : null,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
};

// Hook to use the call context
export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};

// Helper hook for call state checks
export const useCallState = () => {
  const { callState, isCallActive, isInCall, canStartCall, canAcceptCall, isConnecting } = useCall();
  
  return {
    callState,
    isIdle: callState === CALL_STATES.IDLE,
    isInitiating: callState === CALL_STATES.INITIATING,
    isCalling: callState === CALL_STATES.CALLING,
    isRinging: callState === CALL_STATES.RINGING,
    isConnecting,
    isConnected: callState === CALL_STATES.CONNECTED,
    isEnding: callState === CALL_STATES.DISCONNECTING,
    isEnded: callState === CALL_STATES.ENDED,
    isFailed: callState === CALL_STATES.FAILED,
    isRejected: callState === CALL_STATES.REJECTED,
    isCallActive,
    isInCall,
    canStartCall,
    canAcceptCall,
  };
};

// Helper hook for connection status
export const useConnectionStatus = () => {
  const { connectionStatus, isInitialized, isInitializing, hasError, error } = useCall();
  
  return {
    ...connectionStatus,
    isInitialized,
    isInitializing,
    isReady: isInitialized && connectionStatus.socketConnected,
    hasError,
    error,
  };
};

export default CallContext;