import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import Avatar from './Avatar';
import theme from '../../theme';

const { width: screenWidth } = Dimensions.get('window');

const IncomingCallModal = ({
  visible,
  callerName,
  callerInfo,
  onAccept,
  onDecline,
  onDismiss,
}) => {
  const scaleAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Start scale animation
      Animated.spring(scaleAnimation, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();

      // Start pulse animation for incoming call effect
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      return () => pulseLoop.stop();
    } else {
      scaleAnimation.setValue(0);
      pulseAnimation.setValue(1);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnimation }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerText}>Incoming Call</Text>
          </View>

          {/* Caller Info */}
          <View style={styles.callerSection}>
            <Animated.View
              style={[
                styles.avatarContainer,
                {
                  transform: [{ scale: pulseAnimation }],
                },
              ]}
            >
              <Avatar
                size="xxxl"
                emoji="👤"
                backgroundColor={theme.colors.primary}
                style={styles.avatar}
              />
              <View style={styles.onlineIndicator} />
            </Animated.View>

            <Text style={styles.callerName}>{callerName || 'Unknown Caller'}</Text>
            {callerInfo && (
              <Text style={styles.callerInfo}>{callerInfo}</Text>
            )}
            <Text style={styles.callType}>Voice Call</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton]}
              onPress={onDecline}
              activeOpacity={0.8}
            >
              <View style={styles.declineButtonIcon}>
                <Text style={styles.declineIcon}>✕</Text>
              </View>
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.acceptButton]}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <View style={styles.acceptButtonIcon}>
                <Text style={styles.acceptIcon}>✓</Text>
              </View>
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.quickAction}>
              <Text style={styles.quickActionIcon}>💬</Text>
              <Text style={styles.quickActionText}>Message</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.quickAction}>
              <Text style={styles.quickActionIcon}>⏰</Text>
              <Text style={styles.quickActionText}>Remind</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
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
    paddingHorizontal: theme.spacing.xl,
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    width: Math.min(screenWidth - 40, 360),
    paddingVertical: theme.spacing.xxxl,
    paddingHorizontal: theme.spacing.xl,
    ...theme.shadows.lg,
    elevation: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  headerText: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.semibold,
    color: theme.colors.textSecondary,
  },
  callerSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxxl,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: theme.spacing.lg,
  },
  avatar: {
    borderWidth: 4,
    borderColor: theme.colors.primaryLight,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    borderWidth: 3,
    borderColor: theme.colors.surface,
  },
  callerName: {
    fontSize: theme.fonts.sizes.xxl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  callerInfo: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  callType: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.fonts.weights.medium,
    textAlign: 'center',
  },
  actionSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  actionButton: {
    alignItems: 'center',
    minWidth: 80,
  },
  declineButton: {},
  acceptButton: {},
  declineButtonIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  acceptButtonIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  declineIcon: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  acceptIcon: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  declineText: {
    fontSize: theme.fonts.sizes.md,
    fontWeight: theme.fonts.weights.medium,
    color: '#FF4444',
  },
  acceptText: {
    fontSize: theme.fonts.sizes.md,
    fontWeight: theme.fonts.weights.medium,
    color: '#4CAF50',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  quickAction: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  quickActionIcon: {
    fontSize: 20,
    marginBottom: theme.spacing.xs,
  },
  quickActionText: {
    fontSize: theme.fonts.sizes.xs,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
});

export default IncomingCallModal;