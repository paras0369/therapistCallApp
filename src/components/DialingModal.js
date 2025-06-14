import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';

const DialingModal = ({ visible, therapistName, onCancel }) => {
  const [dots, setDots] = useState('');
  const pulseAnim = new Animated.Value(1);

  useEffect(() => {
    let interval;
    if (visible) {
      // Animate dots
      interval = setInterval(() => {
        setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
      }, 500);

      // Pulse animation
      const pulse = () => {
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (visible) pulse();
        });
      };
      pulse();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [visible, pulseAnim]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.callingText}>Connecting{dots}</Text>
              <Text style={styles.subtitle}>Establishing secure connection</Text>
            </View>

            <Animated.View
              style={[styles.avatarContainer, { transform: [{ scale: pulseAnim }] }]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>👨‍⚕️</Text>
              </View>
              <View style={styles.pulseRing1} />
              <View style={styles.pulseRing2} />
            </Animated.View>

            <View style={styles.therapistInfo}>
              <Text style={styles.therapistName}>{therapistName}</Text>
              <Text style={styles.therapistRole}>Licensed Therapist</Text>
            </View>

            <View style={styles.loadingContainer}>
              <ActivityIndicator
                size="large"
                color="#FF6B35"
                style={styles.spinner}
              />
              <Text style={styles.waitingText}>
                Please wait while we connect you securely
              </Text>
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <View style={styles.cancelButtonContent}>
                <Text style={styles.cancelButtonText}>📞</Text>
                <Text style={styles.cancelText}>Cancel Call</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 360,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 25,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  callingText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 8,
    minHeight: 30,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '500',
  },
  avatarContainer: {
    marginBottom: 24,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFF4F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FF6B35',
    zIndex: 3,
  },
  avatarText: {
    fontSize: 60,
  },
  pulseRing1: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(255, 107, 53, 0.3)',
    zIndex: 1,
  },
  pulseRing2: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
    zIndex: 0,
  },
  therapistInfo: {
    alignItems: 'center',
    marginBottom: 32,
  },
  therapistName: {
    fontSize: 20,
    color: '#2C2C2C',
    marginBottom: 4,
    fontWeight: '700',
  },
  therapistRole: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  spinner: {
    marginBottom: 16,
    transform: [{ scale: 1.2 }],
  },
  waitingText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
    maxWidth: 240,
  },
  cancelButton: {
    alignItems: 'center',
  },
  cancelButtonContent: {
    alignItems: 'center',
  },
  cancelButtonText: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF6B35',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 24,
    transform: [{ rotate: '135deg' }],
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 8,
  },
  cancelText: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
  },
});

export default DialingModal;