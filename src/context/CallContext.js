import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import CallService from '../services/CallService';
import { useAuth } from './AuthContext';

const CallContext = createContext();

// Action types
const CALL_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_CALL_STATE: 'SET_CALL_STATE',
  SET_CONNECTION_STATE: 'SET_CONNECTION_STATE',
  SET_CALL_DURATION: 'SET_CALL_DURATION',
  SET_AUDIO_STATE: 'SET_AUDIO_STATE',
  SET_INCOMING_CALL: 'SET_INCOMING_CALL',
  CLEAR_INCOMING_CALL: 'CLEAR_INCOMING_CALL',
  SET_CURRENT_THERAPIST: 'SET_CURRENT_THERAPIST',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  RESET_CALL: 'RESET_CALL',
};

// Call states
export const CALL_STATES = {
  IDLE: 'idle',
  INITIATING: 'initiating',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDING: 'ending',
  ENDED: 'ended',
  ERROR: 'error',
};

// Connection states
export const CONNECTION_STATES = {
  NEW: 'new',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  FAILED: 'failed',
  CLOSED: 'closed',
};

// Initial state
const initialState = {
  callState: CALL_STATES.IDLE,
  connectionState: CONNECTION_STATES.NEW,
  callDuration: 0,
  isCallActive: false,
  isMuted: false,
  isSpeakerOn: false,
  incomingCall: null,
  currentCallId: null,
  currentTherapist: null,
  loading: false,
  error: null,
  isProcessingCall: false, // Prevent multiple call requests
  lastIncomingCallId: null, // Track last incoming call to prevent duplicates
  hasActiveIncomingCall: false, // Flag to prevent multiple incoming calls
};

// Reducer
const callReducer = (state, action) => {
  switch (action.type) {
    case CALL_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
      };
    case CALL_ACTIONS.SET_CALL_STATE:
      return {
        ...state,
        callState: action.payload,
        isCallActive: action.payload === CALL_STATES.ACTIVE,
        isProcessingCall: action.payload === CALL_STATES.INITIATING || action.payload === CALL_STATES.ENDING,
      };
    case CALL_ACTIONS.SET_CONNECTION_STATE:
      return {
        ...state,
        connectionState: action.payload,
      };
    case CALL_ACTIONS.SET_CALL_DURATION:
      return {
        ...state,
        callDuration: action.payload,
      };
    case CALL_ACTIONS.SET_AUDIO_STATE:
      return {
        ...state,
        isMuted: action.payload.isMuted !== undefined ? action.payload.isMuted : state.isMuted,
        isSpeakerOn: action.payload.isSpeakerOn !== undefined ? action.payload.isSpeakerOn : state.isSpeakerOn,
      };
    case CALL_ACTIONS.SET_INCOMING_CALL:
      return {
        ...state,
        incomingCall: action.payload,
        lastIncomingCallId: action.payload?.callId,
        hasActiveIncomingCall: true,
      };
    case CALL_ACTIONS.CLEAR_INCOMING_CALL:
      return {
        ...state,
        incomingCall: null,
        hasActiveIncomingCall: false,
      };
    case CALL_ACTIONS.SET_CURRENT_THERAPIST:
      return {
        ...state,
        currentTherapist: action.payload,
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
    case CALL_ACTIONS.RESET_CALL:
      return {
        ...initialState,
        // Clear lastIncomingCallId after call ends to allow fresh calls
        lastIncomingCallId: null,
      };
    default:
      return state;
  }
};

// Provider component
export const CallProvider = ({ children }) => {
  const [state, dispatch] = useReducer(callReducer, initialState);
  const { isAuthenticated } = useAuth();
  const stateRef = useRef(state);

  // Update ref whenever state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize CallService when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      initializeCallService();
    } else {
      // Clean up when not authenticated
      CallService.disconnect();
      dispatch({ type: CALL_ACTIONS.RESET_CALL });
    }

    return () => {
      // Cleanup on unmount
      CallService.disconnect();
    };
  }, [isAuthenticated]);

  const initializeCallService = useCallback(async () => {
    try {
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: true });
      
      if (!CallService.isConnected) {
        await CallService.initialize();
      }
      
      setupCallServiceListeners();
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
    } catch (error) {
      console.error('Failed to initialize CallService:', error);
      dispatch({
        type: CALL_ACTIONS.SET_ERROR,
        payload: 'Failed to initialize calling service',
      });
    }
  }, []);

  const setupCallServiceListeners = useCallback(() => {
    // Incoming call listener
    CallService.setOnIncomingCall((data) => {
      const currentState = stateRef.current;
      
      // Prevent duplicate incoming calls
      if (currentState.hasActiveIncomingCall || currentState.lastIncomingCallId === data.callId) {
        console.log('Ignoring duplicate incoming call:', data.callId);
        return;
      }

      // Only accept incoming calls if we're in idle state or just ended a call
      if (currentState.callState !== CALL_STATES.IDLE && currentState.callState !== CALL_STATES.ENDED) {
        console.log('Rejecting incoming call - already in call state:', currentState.callState);
        CallService.rejectCall(data.callId);
        return;
      }

      // If we're in ENDED state, reset first before accepting incoming call
      if (currentState.callState === CALL_STATES.ENDED) {
        console.log('Resetting state before accepting incoming call');
        dispatch({ type: CALL_ACTIONS.RESET_CALL });
      }

      dispatch({
        type: CALL_ACTIONS.SET_INCOMING_CALL,
        payload: data,
      });
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.RINGING });
    });

    // Call accepted listener
    CallService.setOnCallAccepted((data) => {
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.CONNECTING });
    });

    // Call rejected listener
    CallService.setOnCallRejected((data) => {
      console.log('Call rejected event received:', data);
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ENDED });
      // Reset immediately to prevent blocking subsequent calls
      setTimeout(() => {
        console.log('Resetting call state after rejection');
        dispatch({ type: CALL_ACTIONS.RESET_CALL });
      }, 100);
    });

    // Call ended listener - ensures both parties are disconnected
    CallService.setOnCallEnded((data) => {
      console.log('Call ended event received:', data);
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ENDED });
      dispatch({ type: CALL_ACTIONS.SET_CONNECTION_STATE, payload: CONNECTION_STATES.DISCONNECTED });
      // Auto reset after call ends - reduced timeout to match rejection handling
      setTimeout(() => {
        console.log('Resetting call state after call ended');
        dispatch({ type: CALL_ACTIONS.RESET_CALL });
      }, 1000);
    });

    // Remote stream received listener
    CallService.setOnRemoteStreamReceived(() => {
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ACTIVE });
      dispatch({ type: CALL_ACTIONS.SET_CONNECTION_STATE, payload: CONNECTION_STATES.CONNECTED });
    });

    // ICE connection state change listener
    CallService.setOnIceConnectionStateChange((connectionState) => {
      dispatch({ type: CALL_ACTIONS.SET_CONNECTION_STATE, payload: connectionState });
      
      if (connectionState === CONNECTION_STATES.CONNECTED) {
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ACTIVE });
      } else if (connectionState === CONNECTION_STATES.FAILED || connectionState === CONNECTION_STATES.DISCONNECTED) {
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ERROR });
      }
    });
  }, []);

  // Actions
  const startCall = async (therapistId, therapistName) => {
    console.log('StartCall called with state:', state.callState, 'isProcessingCall:', state.isProcessingCall);
    
    // Allow calls when state is IDLE, ENDED, or ERROR - but prevent multiple simultaneous calls
    if (state.isProcessingCall && state.callState === CALL_STATES.INITIATING) {
      console.log('Call already in progress, ignoring request');
      return { success: false, error: 'Call already in progress' };
    }

    try {
      const wasEnded = state.callState === CALL_STATES.ENDED;
      const wasError = state.callState === CALL_STATES.ERROR;
      
      // Always reset call state if coming from ENDED or ERROR state
      if (wasEnded || wasError || state.callState !== CALL_STATES.IDLE) {
        console.log('Resetting call state before new call attempt');
        dispatch({ type: CALL_ACTIONS.RESET_CALL });
        // Wait a bit for the reset to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Clear any previous errors and set therapist info first  
      dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
      dispatch({ 
        type: CALL_ACTIONS.SET_CURRENT_THERAPIST, 
        payload: { id: therapistId, name: therapistName } 
      });
      
      // Then set call state to initiating
      console.log('Setting call state to INITIATING');
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.INITIATING });
      
      const result = await CallService.startCall(therapistId);
      
      if (result.success) {
        console.log('Call started successfully, setting state to RINGING');
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.RINGING });
        return { success: true, wasReset: wasEnded || wasError };
      } else {
        console.log('Call start failed:', result.error);
        dispatch({
          type: CALL_ACTIONS.SET_ERROR,
          payload: result.error || 'Failed to start call',
        });
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ERROR });
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Start call error:', error);
      dispatch({
        type: CALL_ACTIONS.SET_ERROR,
        payload: 'An unexpected error occurred while starting the call',
      });
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ERROR });
      return { success: false, error: error.message };
    }
  };

  const acceptCall = async (callId) => {
    try {
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: true });
      dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
      
      const result = await CallService.acceptCall(callId);
      
      if (result.success) {
        dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.CONNECTING });
        dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
        return { success: true };
      } else {
        dispatch({
          type: CALL_ACTIONS.SET_ERROR,
          payload: result.error || 'Failed to accept call',
        });
        return { success: false, error: result.error };
      }
    } catch (error) {
      console.error('Accept call error:', error);
      dispatch({
        type: CALL_ACTIONS.SET_ERROR,
        payload: 'An unexpected error occurred while accepting the call',
      });
      return { success: false, error: error.message };
    }
  };

  const rejectCall = (callId) => {
    CallService.rejectCall(callId);
    dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
    dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ENDED });
  };

  const endCall = () => {
    // Prevent multiple end call requests
    if (state.callState === CALL_STATES.ENDING || state.callState === CALL_STATES.ENDED) {
      return;
    }

    console.log('Ending call, setting state to ENDING');
    dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ENDING });
    CallService.endCall();
    
    // Don't reset here - let the socket handler manage the state transition
    // The CallService.setOnCallEnded listener will handle the reset
  };

  const toggleMute = () => {
    if (CallService.localStream) {
      const audioTrack = CallService.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        dispatch({
          type: CALL_ACTIONS.SET_AUDIO_STATE,
          payload: { isMuted: !audioTrack.enabled },
        });
      }
    }
  };

  const toggleSpeaker = async () => {
    // This would be implemented in CallService
    const newSpeakerState = !state.isSpeakerOn;
    // await CallService.toggleSpeaker(newSpeakerState);
    dispatch({
      type: CALL_ACTIONS.SET_AUDIO_STATE,
      payload: { isSpeakerOn: newSpeakerState },
    });
  };

  const updateCallDuration = (duration) => {
    dispatch({ type: CALL_ACTIONS.SET_CALL_DURATION, payload: duration });
  };

  const clearError = () => {
    dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
  };

  const resetCall = () => {
    dispatch({ type: CALL_ACTIONS.RESET_CALL });
  };

  const value = {
    ...state,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    updateCallDuration,
    clearError,
    resetCall,
    initializeCallService,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
    </CallContext.Provider>
  );
};

// Hook to use call context
export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};

export default CallContext;