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
        currentCallId: action.payload?.callId,
      };
    case CALL_ACTIONS.CLEAR_INCOMING_CALL:
      return {
        ...state,
        incomingCall: null,
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
      
      // Only accept incoming calls if we're in idle state or if we're the ones making the call
      // Don't reject calls when in 'ended' state as this is a transitional state
      if (currentState.callState !== CALL_STATES.IDLE && 
          currentState.callState !== CALL_STATES.ENDED &&
          currentState.callState !== CALL_STATES.INITIATING &&
          currentState.callState !== CALL_STATES.RINGING) {
        console.log('Rejecting incoming call - already in active call:', currentState.callState);
        CallService.rejectCall(data.callId);
        return;
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
      console.log('Call rejected:', data);
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      // Reset immediately for rejected calls to allow new calls - skip ENDED state
      console.log('Resetting call state immediately after rejection');
      dispatch({ type: CALL_ACTIONS.RESET_CALL });
    });

    // Call ended listener
    CallService.setOnCallEnded((data) => {
      console.log('Call ended:', data);
      dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ENDED });
      dispatch({ type: CALL_ACTIONS.SET_CONNECTION_STATE, payload: CONNECTION_STATES.DISCONNECTED });
      setTimeout(() => {
        console.log('Resetting call state after call ended');
        dispatch({ type: CALL_ACTIONS.RESET_CALL });
      }, 500);
    });

    // Remote stream received listener
    CallService.setOnRemoteStreamReceived(() => {
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ACTIVE });
      dispatch({ type: CALL_ACTIONS.SET_CONNECTION_STATE, payload: CONNECTION_STATES.CONNECTED });
    });

    // ICE connection state change listener
    CallService.setOnIceConnectionStateChange((iceState) => {
      const connectionState = mapIceStateToConnectionState(iceState);
      dispatch({ type: CALL_ACTIONS.SET_CONNECTION_STATE, payload: connectionState });
      
      if (iceState === 'connected' || iceState === 'completed') {
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ACTIVE });
      } else if (iceState === 'failed') {
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ERROR });
      }
    });

    // Connection state change listener
    CallService.setOnConnectionStateChange((state) => {
      if (state === 'failed' || state === 'disconnected') {
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ERROR });
      }
    });
  }, []);

  // Helper function to map ICE states to our connection states
  const mapIceStateToConnectionState = (iceState) => {
    switch (iceState) {
      case 'new':
        return CONNECTION_STATES.NEW;
      case 'checking':
        return CONNECTION_STATES.CONNECTING;
      case 'connected':
      case 'completed':
        return CONNECTION_STATES.CONNECTED;
      case 'disconnected':
        return CONNECTION_STATES.DISCONNECTED;
      case 'failed':
        return CONNECTION_STATES.FAILED;
      case 'closed':
        return CONNECTION_STATES.CLOSED;
      default:
        return CONNECTION_STATES.NEW;
    }
  };

  // Actions
  const startCall = async (therapistId, therapistName) => {
    console.log('StartCall called with state:', state.callState);
    
    // Always reset state before starting a new call, regardless of current state
    console.log('Resetting call state before new call, current state:', state.callState);
    
    // Reset both service and context state
    if (CallService.currentCallId) {
      CallService.resetCallState();
    }
    dispatch({ type: CALL_ACTIONS.RESET_CALL });
    
    // Wait for state to properly reset
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Clear any previous errors and set therapist info
      dispatch({ type: CALL_ACTIONS.CLEAR_ERROR });
      dispatch({ 
        type: CALL_ACTIONS.SET_CURRENT_THERAPIST, 
        payload: { id: therapistId, name: therapistName } 
      });
      
      // Set call state to initiating
      dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.INITIATING });
      
      const result = await CallService.startCall(therapistId);
      
      if (result.success) {
        console.log('Call started successfully');
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.RINGING });
        return { success: true };
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
      
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
      
      if (result.success) {
        dispatch({ type: CALL_ACTIONS.CLEAR_INCOMING_CALL });
        dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.CONNECTING });
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
      dispatch({ type: CALL_ACTIONS.SET_LOADING, payload: false });
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
    if (state.callState === CALL_STATES.ENDING || state.callState === CALL_STATES.ENDED) {
      return;
    }

    console.log('Ending call');
    dispatch({ type: CALL_ACTIONS.SET_CALL_STATE, payload: CALL_STATES.ENDING });
    CallService.endCall();
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
    console.log('Manually resetting call state');
    // Also reset the service state
    if (CallService.currentCallId) {
      CallService.resetCallState();
    }
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