import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  BackHandler,
  AppState,
} from 'react-native';
import { Button, Avatar, LoadingSpinner } from './common';
import { useCall, useCallState, useAuth, CALL_STATES } from '../context';
import theme from '../theme';
import { sanitizeForDisplay } from '../utils/InputValidator';

// Safely import InCallManager with fallback
let InCallManager = null;
try {
  const InCallManagerModule = require('react-native-incall-manager');
  InCallManager = InCallManagerModule.default || InCallManagerModule;
} catch (error) {
  console.warn('InCallManager not available:', error.message);
}

const CallScreen = ({ navigation }) => {
  const { userType } = useAuth();
  const { callData, incomingCall, error, endCall, clearError } = useCall();

  const { callState, isInCall, isConnecting } = useCallState();

  // Audio controls state
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);

  // Call duration state
  const [callDuration, setCallDuration] = useState(0);
  const [showError, setShowError] = useState(false);

  // Refs for cleanup
  const intervalRef = useRef(null);
  const navigationTimeoutRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const isNavigatingRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const audioManagerInitializedRef = useRef(false);

  // Reset states when component mounts (optimized to avoid unnecessary re-renders)
  useEffect(() => {
    console.log('CallScreen mounted with state:', callState);
    setCallDuration(0);
    setIsMuted(false);
    setIsSpeakerOn(false);
    isNavigatingRef.current = false;

    return () => {
      console.log('CallScreen unmounting');
      cleanupTimers();
      cleanupAudio();
    };
  }, [cleanupTimers, cleanupAudio]); // Added dependencies for completeness

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription?.remove();
    };
  }, []);

  const handleAppStateChange = useCallback(
    nextAppState => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App came to foreground during call');
        // Re-initialize audio if needed
        if (isInCall && InCallManager) {
          InCallManager.setKeepScreenOn(true);
        }
      }
      appStateRef.current = nextAppState;
    },
    [isInCall],
  );

  // Cleanup all timers with proper ordering
  const cleanupTimers = useCallback(() => {
    // Clear timers in reverse order of creation to prevent race conditions
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup audio manager
  const cleanupAudio = useCallback(() => {
    if (InCallManager && audioManagerInitializedRef.current) {
      try {
        InCallManager.stop();
        audioManagerInitializedRef.current = false;
        console.log('CallScreen: Audio manager stopped');
      } catch (error) {
        console.warn('CallScreen: Error stopping audio manager:', error);
      }
    }
  }, []);

  // Get call participant info (memoized for performance)
  const participant = useMemo(() => {
    if (userType === 'therapist') {
      const rawName = incomingCall?.participantName || callData?.participantName || 'User';
      return {
        name: sanitizeForDisplay(rawName),
        emoji: '👤',
      };
    } else {
      const rawName = callData?.participantName || 'Therapist';
      return {
        name: sanitizeForDisplay(rawName),
        emoji: '👨‍⚕️',
      };
    }
  }, [userType, incomingCall?.participantName, callData?.participantName]);

  // Define handleEndCall before it's used in dependency arrays
  const handleEndCall = useCallback(async () => {
    try {
      console.log('CallScreen: Ending call');
      await endCall();
    } catch (error) {
      console.error('CallScreen: Error ending call:', error);
    }
  }, [endCall]);

  // Handle back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        // Prevent going back during an active call
        if (
          callState === CALL_STATES.CONNECTED ||
          callState === CALL_STATES.CONNECTING
        ) {
          Alert.alert('End Call', 'Are you sure you want to end the call?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'End Call', style: 'destructive', onPress: handleEndCall },
          ]);
          return true; // Prevent default back action
        }
        return false; // Allow default back action
      },
    );

    return () => backHandler.remove();
  }, [callState, handleEndCall]);

  // Initialize audio management
  useEffect(() => {
    if (
      InCallManager &&
      (callState === CALL_STATES.CONNECTED ||
        callState === CALL_STATES.CONNECTING) &&
      !audioManagerInitializedRef.current
    ) {
      try {
        console.log('CallScreen: Initializing audio manager');
        InCallManager.start({ media: 'audio', auto: true, ringback: '' });
        InCallManager.setKeepScreenOn(true);
        audioManagerInitializedRef.current = true;
      } catch (error) {
        console.warn('CallScreen: Failed to initialize audio manager:', error);
      }
    }

    // Cleanup audio when call ends
    if (
      audioManagerInitializedRef.current &&
      (callState === CALL_STATES.IDLE ||
        callState === CALL_STATES.ENDED ||
        callState === CALL_STATES.FAILED ||
        callState === CALL_STATES.REJECTED)
    ) {
      cleanupAudio();
    }
  }, [callState, cleanupAudio]);

  // Call duration timer
  useEffect(() => {
    console.log('CallScreen timer effect - callState:', callState);

    // Always clear existing timer first
    if (intervalRef.current) {
      console.log('Clearing existing timer');
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (callState === CALL_STATES.CONNECTED) {
      console.log('Starting call duration timer');
      // Reset duration when call connects
      setCallDuration(0);

      intervalRef.current = setInterval(() => {
        setCallDuration(prev => {
          const newDuration = prev + 1;
          return newDuration;
        });
      }, 1000);
    } else if (callState === CALL_STATES.IDLE) {
      console.log('Resetting call duration to 0');
      setCallDuration(0);
    }

    return () => {
      if (intervalRef.current) {
        console.log('Cleanup: clearing timer');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [callState]);

  // Navigate back to appropriate dashboard
  const navigateBack = useCallback(() => {
    // Prevent multiple navigation calls
    if (isNavigatingRef.current) {
      console.log('CallScreen: Navigation already in progress, ignoring');
      return;
    }

    isNavigatingRef.current = true;

    // Cleanup before navigation
    cleanupTimers();
    cleanupAudio();

    const targetScreen =
      userType === 'therapist' ? 'TherapistDashboard' : 'UserDashboard';
    console.log('CallScreen: Navigating to', targetScreen);

    try {
      // Use reset to prevent navigation stack issues
      navigation.reset({
        index: 0,
        routes: [{ name: targetScreen }],
      });
    } catch (error) {
      console.error('CallScreen: Navigation error:', error);
      // Reset navigation flag on error
      isNavigatingRef.current = false;
    }
  }, [navigation, userType, cleanupTimers, cleanupAudio]);

  // Handle navigation based on call state
  useEffect(() => {
    if (
      callState === CALL_STATES.ENDED ||
      callState === CALL_STATES.FAILED ||
      callState === CALL_STATES.REJECTED
    ) {
      // Clear any existing timeout
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }

      // Navigate back after a short delay
      navigationTimeoutRef.current = setTimeout(() => {
        console.log(
          'CallScreen: Navigating back due to call end state:',
          callState,
        );
        navigateBack();
        navigationTimeoutRef.current = null; // Clear ref after navigation
      }, 1500);
    } else if (callState === CALL_STATES.IDLE && !isNavigatingRef.current) {
      // For IDLE state, navigate back immediately
      console.log('CallScreen: Navigating back due to IDLE state');
      navigateBack();
    }

    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    };
  }, [callState, navigateBack]);

  // Handle errors
  useEffect(() => {
    if (error) {
      setShowError(true);

      // Clear any existing error timeout
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }

      // Auto-hide error after 5 seconds
      errorTimeoutRef.current = setTimeout(() => {
        setShowError(false);
        clearError();
        errorTimeoutRef.current = null; // Clear ref after timeout
      }, 5000);
    }

    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = null;
      }
    };
  }, [error, clearError]);

  const handleToggleMute = useCallback(() => {
    if (InCallManager && isInCall) {
      try {
        const newMuteState = !isMuted;
        InCallManager.setMicrophoneMute(newMuteState);
        setIsMuted(newMuteState);
      } catch (error) {
        console.error('CallScreen: Error toggling mute:', error);
        setIsMuted(!isMuted); // Still update UI state
      }
    } else {
      setIsMuted(!isMuted);
    }
  }, [isMuted, isInCall]);

  const handleToggleSpeaker = useCallback(() => {
    if (InCallManager && isInCall) {
      try {
        const newSpeakerState = !isSpeakerOn;
        InCallManager.setSpeakerphoneOn(newSpeakerState);
        setIsSpeakerOn(newSpeakerState);
      } catch (error) {
        console.error('CallScreen: Error toggling speaker:', error);
        setIsSpeakerOn(!isSpeakerOn); // Still update UI state
      }
    } else {
      setIsSpeakerOn(!isSpeakerOn);
    }
  }, [isSpeakerOn, isInCall]);

  const handleDismissError = useCallback(() => {
    setShowError(false);
    clearError();
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, [clearError]);

  // Format duration as MM:SS
  const formatDuration = useCallback(seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }, []);

  // Get call status info (memoized for performance)
  const statusInfo = useMemo(() => {
    switch (callState) {
      case CALL_STATES.IDLE:
        return { text: 'Preparing...', color: theme.colors.textSecondary };
      case CALL_STATES.INITIATING:
        return { text: 'Initiating...', color: theme.colors.warning };
      case CALL_STATES.CALLING:
        return { text: 'Calling...', color: theme.colors.warning };
      case CALL_STATES.RINGING:
        return { text: 'Ringing...', color: theme.colors.warning };
      case CALL_STATES.CONNECTING:
        return { text: 'Connecting...', color: theme.colors.warning };
      case CALL_STATES.CONNECTED:
        return { text: 'Connected', color: theme.colors.success };
      case CALL_STATES.DISCONNECTING:
        return { text: 'Ending...', color: theme.colors.error };
      case CALL_STATES.ENDED:
        return { text: 'Call Ended', color: theme.colors.textSecondary };
      case CALL_STATES.FAILED:
        return { text: 'Connection Error', color: theme.colors.error };
      case CALL_STATES.REJECTED:
        return { text: 'Call Rejected', color: theme.colors.error };
      default:
        return { text: 'Preparing...', color: theme.colors.textSecondary };
    }
  }, [callState]);

  const isCallActive = useMemo(() => callState === CALL_STATES.CONNECTED, [callState]);
  const canControl = useMemo(() => callState === CALL_STATES.CONNECTED, [callState]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
      />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.sessionTitle}>Therapy Session</Text>
        <View style={styles.statusContainer}>
          <View
            style={[styles.statusDot, { backgroundColor: statusInfo.color }]}
          />
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.text}
          </Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <Avatar
            size="xxxxl"
            emoji={participant.emoji}
            backgroundColor={theme.colors.primaryLight}
            style={[styles.avatar, isCallActive && styles.avatarActive]}
          />
          <Text style={styles.participantName}>{participant.name}</Text>
          {isConnecting && (
            <View style={styles.loadingContainer}>
              <LoadingSpinner size="small" color={theme.colors.primary} />
            </View>
          )}
        </View>

        {/* Duration Section */}
        <View style={styles.durationSection}>
          <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
          {isCallActive && <Text style={styles.rateText}>6 coins/min</Text>}
        </View>

        {/* Error Display */}
        {showError && error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {error.message || error.error || 'An error occurred'}
            </Text>
            <Button
              title="Dismiss"
              variant="secondary"
              size="small"
              onPress={handleDismissError}
              style={styles.dismissButton}
            />
          </View>
        )}

        {/* Controls Section */}
        <View style={styles.controlsSection}>
          <View style={styles.audioControls}>
            <Button
              title={isMuted ? 'Unmute' : 'Mute'}
              variant={isMuted ? 'danger' : 'secondary'}
              size="medium"
              onPress={handleToggleMute}
              disabled={!canControl}
              style={styles.controlButton}
            />

            <Button
              title={isSpeakerOn ? 'Speaker' : 'Earpiece'}
              variant={isSpeakerOn ? 'primary' : 'secondary'}
              size="medium"
              onPress={handleToggleSpeaker}
              disabled={!canControl}
              style={styles.controlButton}
            />
          </View>

          <Button
            title="End Call"
            variant="danger"
            size="large"
            onPress={handleEndCall}
            style={styles.endCallButton}
            disabled={
              callState === CALL_STATES.DISCONNECTING ||
              callState === CALL_STATES.ENDED
            }
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  header: {
    alignItems: 'center',
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  sessionTitle: {
    fontSize: theme.fonts.sizes.xl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.white,
    marginBottom: theme.spacing.md,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing.xs,
  },
  statusText: {
    fontSize: theme.fonts.sizes.md,
    fontWeight: theme.fonts.weights.medium,
  },
  content: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.borderRadius.xxxl,
    borderTopRightRadius: theme.borderRadius.xxxl,
    paddingTop: theme.spacing.xxxxxl,
    paddingHorizontal: theme.spacing.screenPadding,
    justifyContent: 'space-between',
  },
  avatarSection: {
    alignItems: 'center',
  },
  avatar: {
    marginBottom: theme.spacing.xl,
  },
  avatarActive: {
    transform: [{ scale: 1.05 }],
  },
  participantName: {
    fontSize: theme.fonts.sizes.xxl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  loadingContainer: {
    marginTop: theme.spacing.md,
  },
  durationSection: {
    alignItems: 'center',
    marginVertical: theme.spacing.xxxl,
  },
  duration: {
    fontSize: theme.fonts.sizes.display3,
    fontWeight: theme.fonts.weights.light,
    color: theme.colors.textPrimary,
    letterSpacing: 3,
    marginBottom: theme.spacing.sm,
  },
  rateText: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  errorContainer: {
    backgroundColor: theme.colors.errorLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginVertical: theme.spacing.md,
    alignItems: 'center',
  },
  errorText: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  dismissButton: {
    minWidth: 80,
  },
  controlsSection: {
    paddingBottom: theme.spacing.xxxl,
  },
  audioControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.xxxl,
  },
  controlButton: {
    minWidth: 120,
  },
  endCallButton: {
    marginHorizontal: theme.spacing.xxxl,
  },
});

export default React.memo(CallScreen);
