import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Avatar, Button, LoadingSpinner } from '../common';
import { useCall, useAuth, CALL_STATES, CONNECTION_STATES } from '../../context';
import theme from '../../theme';
import CallService from '../../services/CallService';

// Safely import InCallManager with fallback
let InCallManager = null;
try {
  const InCallManagerModule = require('react-native-incall-manager');
  InCallManager = InCallManagerModule.default || InCallManagerModule;
} catch (error) {
  console.warn('InCallManager not available:', error.message);
}

// Memoized components for better performance
const CallHeader = React.memo(({ onBack, callState, connectionState }) => {
  const statusText = useMemo(() => {
    if (callState === CALL_STATES.ACTIVE) {
      return 'Connected';
    }
    return `${connectionState.charAt(0).toUpperCase() + connectionState.slice(1)}...`;
  }, [callState, connectionState]);

  const showStatusDot = callState === CALL_STATES.ACTIVE;

  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>←</Text>
      </TouchableOpacity>
      <View style={styles.callStatus}>
        <Text style={styles.title}>Therapy Session</Text>
        <View style={styles.statusContainer}>
          {showStatusDot && <View style={styles.statusDot} />}
          <Text style={[styles.status, { color: showStatusDot ? theme.colors.connected : theme.colors.connecting }]}>
            {statusText}
          </Text>
        </View>
      </View>
      <View style={styles.placeholder} />
    </View>
  );
});

const CallAvatar = React.memo(({ callState }) => {
  const ringStyle = useMemo(() => {
    return [
      styles.avatarRing,
      callState === CALL_STATES.ACTIVE && styles.avatarRingActive,
    ];
  }, [callState]);

  return (
    <View style={styles.avatarContainer}>
      <View style={styles.avatar}>
        <View style={ringStyle}>
          <Avatar size="xxxl" emoji="👤" />
        </View>
      </View>
    </View>
  );
});

const CallDuration = React.memo(({ duration, callState }) => {
  const formattedDuration = useMemo(() => {
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [duration]);

  const subtextText = useMemo(() => {
    return callState === CALL_STATES.ACTIVE ? 'Session in progress' : 'Connecting...';
  }, [callState]);

  return (
    <>
      <Text style={styles.duration}>{formattedDuration}</Text>
      <Text style={styles.callSubtext}>{subtextText}</Text>
    </>
  );
});

const CallControls = React.memo(({ 
  isMuted, 
  isSpeakerOn, 
  onToggleMute, 
  onToggleSpeaker, 
  onEndCall 
}) => {
  return (
    <View style={styles.controlsContainer}>
      <View style={styles.topControls}>
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.mutedButton]}
          onPress={onToggleMute}
        >
          <Text style={styles.controlButtonText}>
            {isMuted ? '🔇' : '🎤'}
          </Text>
          <Text style={styles.controlButtonLabel}>
            {isMuted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            isSpeakerOn && styles.speakerOnButton,
          ]}
          onPress={onToggleSpeaker}
        >
          <Text style={styles.controlButtonText}>
            {isSpeakerOn ? '🔊' : '🔈'}
          </Text>
          <Text style={styles.controlButtonLabel}>Speaker</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.endCallButton}
        onPress={onEndCall}
      >
        <View style={styles.endCallButtonInner}>
          <Text style={styles.endCallButtonText}>📞</Text>
        </View>
        <Text style={styles.endCallLabel}>End Call</Text>
      </TouchableOpacity>
    </View>
  );
});

const CallFooter = React.memo(({ callDuration }) => {
  const showBonus = callDuration >= 10;

  return (
    <View style={styles.footer}>
      <View style={styles.costCard}>
        <Text style={styles.costIcon}>💰</Text>
        <View>
          <Text style={styles.costAmount}>6 coins/minute</Text>
          <Text style={styles.costLabel}>Session rate</Text>
        </View>
      </View>
      {showBonus && (
        <View style={styles.bonusCard}>
          <Text style={styles.bonusIcon}>🎉</Text>
          <Text style={styles.bonusText}>Bonus rate active!</Text>
        </View>
      )}
    </View>
  );
});

const OptimizedCallScreen = ({ navigation }) => {
  const { userType } = useAuth();
  const {
    callState,
    connectionState,
    callDuration,
    isCallActive,
    isMuted,
    isSpeakerOn,
    loading,
    error,
    toggleMute,
    toggleSpeaker,
    endCall,
    updateCallDuration,
  } = useCall();

  const [localCallDuration, setLocalCallDuration] = useState(0);

  // Memoized navigation function
  const navigateBack = useCallback(async () => {
    try {
      if (userType === 'therapist') {
        navigation.navigate('TherapistDashboard');
      } else {
        navigation.navigate('UserDashboard');
      }
    } catch (error) {
      console.error('Error navigating back:', error);
      navigation.navigate('UserDashboard');
    }
  }, [navigation, userType]);

  // Initialize audio management
  useEffect(() => {
    if (InCallManager) {
      try {
        InCallManager.start({ media: 'audio', auto: true, ringback: '' });
        InCallManager.setForceSpeakerphoneOn(false);
        InCallManager.setSpeakerphoneOn(false);
        InCallManager.setKeepScreenOn(true);
        console.log('InCallManager initialized successfully');
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

    if (isCallActive) {
      interval = setInterval(() => {
        setLocalCallDuration(prev => {
          const newDuration = prev + 1;
          updateCallDuration(newDuration);
          return newDuration;
        });
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCallActive, updateCallDuration]);

  // Memoized handlers
  const handleEndCall = useCallback(() => {
    Alert.alert('End Call', 'Are you sure you want to end this call?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Call',
        style: 'destructive',
        onPress: () => {
          endCall();
          navigateBack();
        },
      },
    ]);
  }, [endCall, navigateBack]);

  const handleToggleMute = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  const handleToggleSpeaker = useCallback(async () => {
    const newSpeakerState = !isSpeakerOn;

    if (InCallManager) {
      try {
        console.log('Attempting to toggle speaker to:', newSpeakerState ? 'ON' : 'OFF');

        if (newSpeakerState) {
          await InCallManager.setSpeakerphoneOn(true);
          await InCallManager.setForceSpeakerphoneOn(true);

          const speakerRoutes = ['SPEAKER', 'SPEAKER_PHONE', 'BLUETOOTH_SCO'];
          for (const route of speakerRoutes) {
            try {
              await InCallManager.chooseAudioRoute(route);
              console.log(`Successfully set audio route to ${route}`);
              break;
            } catch (routeError) {
              console.log(`Audio route ${route} failed, trying next option`);
            }
          }
        } else {
          await InCallManager.setSpeakerphoneOn(false);
          await InCallManager.setForceSpeakerphoneOn(false);

          const earRoutes = ['EARPIECE', 'WIRED_HEADSET', 'PHONE', 'BLUETOOTH_SCO'];
          for (const route of earRoutes) {
            try {
              await InCallManager.chooseAudioRoute(route);
              console.log(`Successfully set audio route to ${route}`);
              break;
            } catch (routeError) {
              console.log(`Audio route ${route} failed, trying next option`);
            }
          }
        }

        toggleSpeaker();
        console.log(`Speaker successfully toggled to ${newSpeakerState ? 'ON' : 'OFF'}`);
      } catch (error) {
        console.error('Error toggling speaker:', error);
        toggleSpeaker(); // Still update state
      }
    } else {
      toggleSpeaker();
    }
  }, [isSpeakerOn, toggleSpeaker]);

  // Show loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingSpinner text="Setting up call..." />
      </SafeAreaView>
    );
  }

  // Show error state
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Go Back" onPress={navigateBack} variant="primary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CallHeader
        onBack={navigateBack}
        callState={callState}
        connectionState={connectionState}
      />

      <View style={styles.content}>
        <View style={styles.callInfo}>
          <CallAvatar callState={callState} />
          <CallDuration duration={localCallDuration} callState={callState} />
        </View>

        <CallControls
          isMuted={isMuted}
          isSpeakerOn={isSpeakerOn}
          onToggleMute={handleToggleMute}
          onToggleSpeaker={handleToggleSpeaker}
          onEndCall={handleEndCall}
        />
      </View>

      <CallFooter callDuration={localCallDuration} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: theme.spacing.screenPadding,
    paddingBottom: theme.spacing.xl,
    backgroundColor: theme.colors.white,
    ...theme.shadows.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: theme.colors.textPrimary,
    fontWeight: theme.fonts.weights.semibold,
  },
  callStatus: {
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fonts.sizes.xl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.connected,
    marginRight: 6,
  },
  status: {
    fontSize: theme.fonts.sizes.md,
    fontWeight: theme.fonts.weights.semibold,
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.screenPadding,
    paddingVertical: theme.spacing.xxxxl,
  },
  callInfo: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  avatarContainer: {
    marginBottom: theme.spacing.xxxxl,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: theme.colors.primary,
    ...theme.shadows.primary,
  },
  avatarRingActive: {
    borderColor: theme.colors.connected,
    shadowColor: theme.colors.connected,
  },
  duration: {
    fontSize: theme.fonts.sizes.display3,
    fontWeight: theme.fonts.weights.light,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
    letterSpacing: 2,
  },
  callSubtext: {
    fontSize: theme.fonts.sizes.lg,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  controlsContainer: {
    alignItems: 'center',
    paddingBottom: theme.spacing.xl,
  },
  topControls: {
    flexDirection: 'row',
    gap: theme.spacing.xxxxl,
    marginBottom: theme.spacing.xxxxl,
  },
  controlButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    ...theme.shadows.md,
  },
  mutedButton: {
    backgroundColor: theme.colors.muted,
    borderColor: theme.colors.mutedBorder,
  },
  speakerOnButton: {
    backgroundColor: theme.colors.speaker,
    borderColor: theme.colors.speakerBorder,
  },
  controlButtonText: {
    fontSize: 32,
    marginBottom: 4,
  },
  controlButtonLabel: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.semibold,
    textAlign: 'center',
  },
  endCallButton: {
    alignItems: 'center',
  },
  endCallButtonInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.primary,
  },
  endCallButtonText: {
    fontSize: 32,
    transform: [{ rotate: '135deg' }],
  },
  endCallLabel: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.primary,
    fontWeight: theme.fonts.weights.semibold,
    marginTop: theme.spacing.sm,
  },
  footer: {
    paddingHorizontal: theme.spacing.screenPadding,
    paddingVertical: theme.spacing.xl,
    backgroundColor: theme.colors.background,
    gap: theme.spacing.md,
  },
  costCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...theme.shadows.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  costIcon: {
    fontSize: 24,
    marginRight: theme.spacing.md,
  },
  costAmount: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.primary,
  },
  costLabel: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  bonusCard: {
    backgroundColor: theme.colors.secondaryLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  bonusIcon: {
    fontSize: 16,
    marginRight: theme.spacing.sm,
  },
  bonusText: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.secondary,
    fontWeight: theme.fonts.weights.semibold,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.screenPadding,
  },
  errorText: {
    fontSize: theme.fonts.sizes.lg,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
});

export default React.memo(OptimizedCallScreen);