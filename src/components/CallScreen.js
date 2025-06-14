import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import CallService from '../services/CallService';
import AuthService from '../services/AuthService';

// Safely import InCallManager with fallback
let InCallManager = null;
try {
  const InCallManagerModule = require('react-native-incall-manager');
  InCallManager = InCallManagerModule.default || InCallManagerModule;
} catch (error) {
  console.warn('InCallManager not available:', error.message);
  console.warn(
    'To enable speaker functionality, run: npm install && npm run android',
  );
}

const CallScreen = ({ navigation }) => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting');

  const navigateBack = async () => {
    try {
      const userType = await AuthService.getUserType();
      if (userType === 'therapist') {
        navigation.navigate('TherapistDashboard');
      } else {
        navigation.navigate('UserDashboard');
      }
    } catch (error) {
      console.error('Error getting user type:', error);
      navigation.navigate('UserDashboard');
    }
  };

  useEffect(() => {
    // Initialize audio management if available
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
    } else {
      console.warn(
        'InCallManager not available - speaker functionality will be limited',
      );
    }

    // Initialize CallService if not already done
    if (!CallService.isConnected) {
      CallService.initialize().catch(error => {
        console.error('Failed to initialize CallService:', error);
        Alert.alert('Connection Error', 'Failed to initialize calling service');
        navigateBack();
      });
    }

    CallService.setOnCallEnded(() => {
      setIsCallActive(false);
      setConnectionState('disconnected');
      navigateBack();
    });

    CallService.setOnRemoteStreamReceived(() => {
      console.log('Remote stream received, activating call');
      setIsCallActive(true);
      setConnectionState('connected');
    });

    // Add connection state monitoring
    CallService.setOnIceConnectionStateChange(state => {
      console.log('ICE connection state:', state);
      setConnectionState(state);
      if (state === 'connected' || state === 'completed') {
        setIsCallActive(true);
      } else if (state === 'failed' || state === 'disconnected') {
        setIsCallActive(false);
        Alert.alert('Connection Lost', 'The call connection was lost');
      }
    });

    return () => {
      // Cleanup audio management
      if (InCallManager) {
        try {
          InCallManager.stop();
        } catch (error) {
          console.warn('Error stopping InCallManager:', error);
        }
      }
    };
  }, [navigation]);

  // Separate useEffect for timer to avoid recreation
  useEffect(() => {
    let interval;

    if (isCallActive) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isCallActive]);

  const formatDuration = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    Alert.alert('End Call', 'Are you sure you want to end this call?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Call',
        style: 'destructive',
        onPress: () => {
          CallService.endCall();
          setIsCallActive(false);
          navigateBack();
        },
      },
    ]);
  };

  const toggleMute = () => {
    if (CallService.localStream) {
      const audioTrack = CallService.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleSpeaker = async () => {
    const newSpeakerState = !isSpeakerOn;

    if (InCallManager) {
      try {
        console.log(
          'Attempting to toggle speaker to:',
          newSpeakerState ? 'ON' : 'OFF',
        );

        // Identical speaker functionality for both users and therapists
        if (newSpeakerState) {
          // Turn speaker ON - same logic for all users
          await InCallManager.setSpeakerphoneOn(true);
          await InCallManager.setForceSpeakerphoneOn(true);

          // Try all possible speaker routes
          const speakerRoutes = ['SPEAKER', 'SPEAKER_PHONE', 'BLUETOOTH_SCO'];
          let routeSet = false;
          for (const route of speakerRoutes) {
            try {
              await InCallManager.chooseAudioRoute(route);
              console.log(`Successfully set audio route to ${route}`);
              routeSet = true;
              break;
            } catch (routeError) {
              console.log(`Audio route ${route} failed, trying next option`);
            }
          }

          // Enhanced audio session management for all user types
          try {
            await InCallManager.start({
              media: 'audio',
              auto: false,
              ringback: '',
            });
            await InCallManager.setKeepScreenOn(true);
            console.log('Audio session configured for speaker mode');
          } catch (sessionError) {
            console.log('Audio session fallback completed');
          }
        } else {
          // Turn speaker OFF - same logic for all users
          await InCallManager.setSpeakerphoneOn(false);
          await InCallManager.setForceSpeakerphoneOn(false);

          // Try all possible earpiece routes
          const earRoutes = [
            'EARPIECE',
            'WIRED_HEADSET',
            'PHONE',
            'BLUETOOTH_SCO',
          ];
          let routeSet = false;
          for (const route of earRoutes) {
            try {
              await InCallManager.chooseAudioRoute(route);
              console.log(`Successfully set audio route to ${route}`);
              routeSet = true;
              break;
            } catch (routeError) {
              console.log(`Audio route ${route} failed, trying next option`);
            }
          }
        }

        setIsSpeakerOn(newSpeakerState);
        console.log(
          `Speaker successfully toggled to ${newSpeakerState ? 'ON' : 'OFF'}`,
        );

        // Simple confirmation without user type distinction
      } catch (error) {
        console.error('Error toggling speaker:', error);
        // Always update visual state and provide feedback
        setIsSpeakerOn(newSpeakerState);
      }
    } else {
      // Fallback for when InCallManager is not available
      setIsSpeakerOn(newSpeakerState);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.callStatus}>
          <Text style={styles.title}>Therapy Session</Text>
          <View style={styles.statusContainer}>
            {isCallActive && <View style={styles.statusDot} />}
            <Text style={styles.status}>
              {isCallActive
                ? 'Connected'
                : `${
                    connectionState.charAt(0).toUpperCase() +
                    connectionState.slice(1)
                  }...`}
            </Text>
          </View>
        </View>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.callInfo}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <View style={styles.avatarRing}>
                <Text style={styles.avatarText}>👤</Text>
              </View>
            </View>
          </View>

          <Text style={styles.duration}>{formatDuration(callDuration)}</Text>

          <Text style={styles.callSubtext}>
            {isCallActive ? 'Session in progress' : 'Connecting...'}
          </Text>
        </View>

        <View style={styles.controlsContainer}>
          <View style={styles.topControls}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.mutedButton]}
              onPress={toggleMute}
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
              onPress={toggleSpeaker}
            >
              <Text style={styles.controlButtonText}>
                {isSpeakerOn ? '🔊' : '🔈'}
              </Text>
              <Text style={styles.controlButtonLabel}>
                {isSpeakerOn ? 'Speaker' : 'Speaker'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.endCallButton}
            onPress={handleEndCall}
          >
            <View style={styles.endCallButtonInner}>
              <Text style={styles.endCallButtonText}>📞</Text>
            </View>
            <Text style={styles.endCallLabel}>End Call</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.costCard}>
          <Text style={styles.costIcon}>💰</Text>
          <View>
            <Text style={styles.costAmount}>6 coins/minute</Text>
            <Text style={styles.costLabel}>Session rate</Text>
          </View>
        </View>
        {callDuration >= 10 && (
          <View style={styles.bonusCard}>
            <Text style={styles.bonusIcon}>🎉</Text>
            <Text style={styles.bonusText}>Bonus rate active!</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  callStatus: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
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
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  status: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  callInfo: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  avatarContainer: {
    marginBottom: 40,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#FFF4F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FF6B35',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  avatarText: {
    fontSize: 80,
  },
  duration: {
    fontSize: 48,
    fontWeight: '300',
    color: '#2C2C2C',
    marginBottom: 12,
    letterSpacing: 2,
  },
  callSubtext: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '500',
  },
  controlsContainer: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  topControls: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: 40,
  },
  controlButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F0F0F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  mutedButton: {
    backgroundColor: '#FFE8E8',
    borderColor: '#FF6B6B',
  },
  speakerOnButton: {
    backgroundColor: '#FFF4F0',
    borderColor: '#FF6B35',
  },
  controlButtonText: {
    fontSize: 32,
    marginBottom: 4,
  },
  controlButtonLabel: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '600',
    textAlign: 'center',
  },
  endCallButton: {
    alignItems: 'center',
  },
  endCallButtonInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  endCallButtonText: {
    fontSize: 32,
    transform: [{ rotate: '135deg' }],
  },
  endCallLabel: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#F8F9FA',
    gap: 12,
  },
  costCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  costIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  costAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B35',
  },
  costLabel: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
  },
  bonusCard: {
    backgroundColor: '#E8F7ED',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  bonusIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  bonusText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
});

export default CallScreen;
