import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  BackHandler,
} from 'react-native';
import { Button, Avatar, LoadingSpinner } from './common';
import { useCall, useAuth, CALL_STATES } from '../context';
import theme from '../theme';

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
  const {
    callState,
    isMuted,
    isSpeakerOn,
    currentTherapist,
    incomingCall,
    error,
    toggleMute,
    toggleSpeaker,
    endCall,
    clearError,
  } = useCall();

  const [callDuration, setCallDuration] = useState(0);
  const [showError, setShowError] = useState(false);
  const intervalRef = useRef(null);
  const navigationTimeoutRef = useRef(null);

  // Reset call duration when component mounts
  useEffect(() => {
    console.log('CallScreen mounted with state:', callState);
    setCallDuration(0);
    
    return () => {
      console.log('CallScreen unmounting');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, []);

  // Get call participant info
  const getParticipantInfo = useCallback(() => {
    if (userType === 'therapist') {
      return {
        name: incomingCall?.userName || 'User',
        emoji: '👤',
      };
    } else {
      return {
        name: currentTherapist?.name || 'Therapist',
        emoji: '👨‍⚕️',
      };
    }
  }, [userType, incomingCall, currentTherapist]);

  const participant = getParticipantInfo();

  // Handle back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Prevent going back during an active call
      if (callState === CALL_STATES.ACTIVE || callState === CALL_STATES.CONNECTING) {
        Alert.alert(
          'End Call',
          'Are you sure you want to end the call?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'End Call', style: 'destructive', onPress: handleEndCall },
          ]
        );
        return true; // Prevent default back action
      }
      return false; // Allow default back action
    });

    return () => backHandler.remove();
  }, [callState]);

  // Initialize audio management
  useEffect(() => {
    if (InCallManager && (callState === CALL_STATES.ACTIVE || callState === CALL_STATES.CONNECTING)) {
      try {
        InCallManager.start({ media: 'audio', auto: true, ringback: '' });
        InCallManager.setKeepScreenOn(true);
      } catch (error) {
        console.warn('Failed to initialize InCallManager:', error);
      }
    }

    return () => {
      if (InCallManager) {
        try {
          InCallManager.stop();
        } catch (error) {
          console.warn('Error stopping InCallManager:', error);
        }
      }
    };
  }, [callState]);

  // Call duration timer
  useEffect(() => {
    console.log('CallScreen timer effect - callState:', callState);
    
    if (callState === CALL_STATES.ACTIVE) {
      console.log('Starting call duration timer');
      // Clear any existing interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      intervalRef.current = setInterval(() => {
        setCallDuration(prev => {
          const newDuration = prev + 1;
          console.log('Call duration updated:', newDuration);
          return newDuration;
        });
      }, 1000);
    } else {
      console.log('Clearing call duration timer, state:', callState);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (callState === CALL_STATES.IDLE) {
        console.log('Resetting call duration to 0');
        setCallDuration(0);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [callState]);

  // Handle navigation based on call state
  useEffect(() => {
    if (callState === CALL_STATES.ENDED) {
      // Clear any existing timeout
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }

      // Navigate back to appropriate dashboard after a short delay
      navigationTimeoutRef.current = setTimeout(() => {
        console.log('CallScreen: Navigating back due to ENDED state');
        navigateBack();
      }, 1000);
    } else if (callState === CALL_STATES.IDLE) {
      // For IDLE state, navigate back immediately (this shouldn't happen in CallScreen)
      console.log('CallScreen: Navigating back due to IDLE state');
      navigateBack();
    }

    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, [callState, navigateBack]);

  // Handle errors
  useEffect(() => {
    if (error) {
      setShowError(true);
      // Auto-hide error after 5 seconds
      const errorTimeout = setTimeout(() => {
        setShowError(false);
        clearError();
      }, 5000);

      return () => clearTimeout(errorTimeout);
    }
  }, [error]);

  const navigateBack = useCallback(() => {
    const targetScreen = userType === 'therapist' ? 'TherapistDashboard' : 'UserDashboard';
    navigation.replace(targetScreen);
  }, [navigation, userType]);

  const handleEndCall = useCallback(() => {
    endCall();
  }, [endCall]);

  const handleToggleSpeaker = useCallback(() => {
    if (InCallManager) {
      try {
        const newSpeakerState = !isSpeakerOn;
        InCallManager.setSpeakerphoneOn(newSpeakerState);
        toggleSpeaker();
      } catch (error) {
        console.error('Error toggling speaker:', error);
        toggleSpeaker(); // Still update state
      }
    } else {
      toggleSpeaker();
    }
  }, [isSpeakerOn, toggleSpeaker]);

  const handleDismissError = useCallback(() => {
    setShowError(false);
    clearError();
  }, [clearError]);

  // Format duration as MM:SS
  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Get call status info
  const getCallStatusInfo = () => {
    switch (callState) {
      case CALL_STATES.IDLE:
        return { text: 'Preparing...', color: theme.colors.textSecondary };
      case CALL_STATES.INITIATING:
        return { text: 'Initiating...', color: theme.colors.warning };
      case CALL_STATES.RINGING:
        return { text: 'Ringing...', color: theme.colors.warning };
      case CALL_STATES.CONNECTING:
        return { text: 'Connecting...', color: theme.colors.warning };
      case CALL_STATES.ACTIVE:
        return { text: 'Connected', color: theme.colors.success };
      case CALL_STATES.ENDING:
        return { text: 'Ending...', color: theme.colors.error };
      case CALL_STATES.ENDED:
        return { text: 'Call Ended', color: theme.colors.textSecondary };
      case CALL_STATES.ERROR:
        return { text: 'Connection Error', color: theme.colors.error };
      default:
        return { text: 'Preparing...', color: theme.colors.textSecondary };
    }
  };

  const statusInfo = getCallStatusInfo();
  const isCallActive = callState === CALL_STATES.ACTIVE;
  const canControl = callState === CALL_STATES.ACTIVE;
  const isConnecting = callState === CALL_STATES.CONNECTING || callState === CALL_STATES.INITIATING;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.sessionTitle}>Therapy Session</Text>
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
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
            style={[
              styles.avatar,
              isCallActive && styles.avatarActive
            ]}
          />
          <Text style={styles.participantName}>
            {participant.name}
          </Text>
          {isConnecting && (
            <View style={styles.loadingContainer}>
              <LoadingSpinner size="small" color={theme.colors.primary} />
            </View>
          )}
        </View>

        {/* Duration Section */}
        <View style={styles.durationSection}>
          <Text style={styles.duration}>
            {formatDuration(callDuration)}
          </Text>
          {isCallActive && (
            <Text style={styles.rateText}>6 coins/min</Text>
          )}
        </View>

        {/* Error Display */}
        {showError && error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
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
              onPress={toggleMute}
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
            disabled={callState === CALL_STATES.ENDING}
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