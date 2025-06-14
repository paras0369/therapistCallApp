import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { Button, Avatar } from './common';
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

const MinimalCallScreen = ({ navigation }) => {
  const { userType } = useAuth();
  const {
    callState,
    callDuration,
    isMuted,
    isSpeakerOn,
    currentTherapist,
    toggleMute,
    toggleSpeaker,
    endCall,
  } = useCall();

  const [localCallDuration, setLocalCallDuration] = useState(0);

  // Navigate back to appropriate dashboard
  const navigateBack = useCallback(() => {
    if (userType === 'therapist') {
      navigation.replace('TherapistDashboard');
    } else {
      navigation.replace('UserDashboard');
    }
  }, [navigation, userType]);

  // Handle call end
  const handleEndCall = useCallback(() => {
    endCall();
    navigateBack();
  }, [endCall, navigateBack]);

  // Initialize audio management
  useEffect(() => {
    if (InCallManager) {
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
  }, []);

  // Timer effect
  useEffect(() => {
    let interval;

    if (callState === CALL_STATES.ACTIVE) {
      interval = setInterval(() => {
        setLocalCallDuration(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [callState]);

  // Auto-navigate back if call ends (only once)
  useEffect(() => {
    let timeoutId;
    if (callState === CALL_STATES.ENDED) {
      // Navigate back with appropriate delay based on call duration
      // Shorter delay for rejected calls (0 duration), longer for completed calls
      const delay = localCallDuration > 0 ? 1200 : 600;
      console.log('Call ended, call duration:', localCallDuration, 'navigating back in', delay, 'ms');
      timeoutId = setTimeout(() => {
        console.log('Navigating back to dashboard');
        navigateBack();
      }, delay);
    } else if (callState === CALL_STATES.IDLE && localCallDuration === 0) {
      // Fallback: if stuck in IDLE state for too long, navigate back
      timeoutId = setTimeout(() => {
        console.log('Stuck in IDLE state, navigating back to dashboard');
        navigateBack();
      }, 3000);
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [callState, navigateBack, localCallDuration]);

  // Format duration
  const formatDuration = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Handle speaker toggle
  const handleToggleSpeaker = useCallback(async () => {
    if (InCallManager) {
      try {
        const newSpeakerState = !isSpeakerOn;
        await InCallManager.setSpeakerphoneOn(newSpeakerState);
        toggleSpeaker();
      } catch (error) {
        console.error('Error toggling speaker:', error);
        toggleSpeaker(); // Still update state
      }
    } else {
      toggleSpeaker();
    }
  }, [isSpeakerOn, toggleSpeaker]);

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
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <Avatar
            size="xxxxl"
            emoji={userType === 'therapist' ? '👤' : '👨‍⚕️'}
            backgroundColor={theme.colors.primaryLight}
            style={[
              styles.avatar,
              isCallActive && styles.avatarActive
            ]}
          />
          <Text style={styles.participantName}>
            {userType === 'therapist' ? 'User' : (currentTherapist?.name || 'Therapist')}
          </Text>
        </View>

        {/* Duration */}
        <View style={styles.durationSection}>
          <Text style={styles.duration}>
            {formatDuration(localCallDuration)}
          </Text>
          {isCallActive && (
            <Text style={styles.rateText}>6 coins/min</Text>
          )}
        </View>

        {/* Controls */}
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

export default React.memo(MinimalCallScreen);