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

const StartCallModal = ({
  visible,
  therapistName,
  therapistSpecialization,
  coinCost = 6,
  userCoins = 0,
  isStarting = false,
  onConfirm,
  onCancel,
  onDismiss,
}) => {
  const scaleAnimation = useRef(new Animated.Value(0)).current;
  const coinAnimation = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      // Start scale animation
      Animated.spring(scaleAnimation, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();

      // Start coin bounce animation
      const coinLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(coinAnimation, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(coinAnimation, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      coinLoop.start();

      return () => coinLoop.stop();
    } else {
      scaleAnimation.setValue(0);
      coinAnimation.setValue(1);
    }
  }, [visible]);

  const hasEnoughCoins = userCoins >= coinCost;

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
            <Text style={styles.headerText}>Start Call</Text>
          </View>

          {/* Therapist Info */}
          <View style={styles.therapistSection}>
            <Avatar
              size="xxl"
              emoji="👨‍⚕️"
              backgroundColor={theme.colors.primary}
              style={styles.avatar}
            />
            
            <Text style={styles.therapistName}>{therapistName || 'Therapist'}</Text>
            {therapistSpecialization && (
              <Text style={styles.therapistSpecialization}>{therapistSpecialization}</Text>
            )}
          </View>

          {/* Cost Information */}
          <View style={styles.costSection}>
            <View style={styles.costCard}>
              <Animated.Text 
                style={[
                  styles.costIcon,
                  {
                    transform: [{ scale: coinAnimation }],
                  }
                ]}
              >
                💰
              </Animated.Text>
              <View style={styles.costInfo}>
                <Text style={styles.costAmount}>{coinCost} coins/min</Text>
                <Text style={styles.costDescription}>Call cost per minute</Text>
              </View>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Your balance:</Text>
              <Text style={[
                styles.balanceAmount,
                { color: hasEnoughCoins ? theme.colors.secondary : '#FF4444' }
              ]}>
                {userCoins} coins
              </Text>
            </View>

            {!hasEnoughCoins && (
              <View style={styles.warningContainer}>
                <Text style={styles.warningIcon}>⚠️</Text>
                <Text style={styles.warningText}>
                  Insufficient coins. You need at least {coinCost} coins to start a call.
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.8}
              disabled={isStarting}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton, 
                styles.confirmButton,
                (!hasEnoughCoins || isStarting) && styles.disabledButton
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
              disabled={!hasEnoughCoins || isStarting}
            >
              <Text style={[
                styles.confirmText,
                (!hasEnoughCoins || isStarting) && styles.disabledText
              ]}>
                {isStarting ? 'Starting...' : 'Start Call'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Call Features */}
          <View style={styles.featuresSection}>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>🎙️</Text>
              <Text style={styles.featureText}>High Quality Audio</Text>
            </View>
            
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>🔒</Text>
              <Text style={styles.featureText}>Private & Secure</Text>
            </View>
            
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>⏱️</Text>
              <Text style={styles.featureText}>Real-time Billing</Text>
            </View>
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
    width: Math.min(screenWidth - 40, 380),
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
    fontSize: theme.fonts.sizes.xxl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
  },
  therapistSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxxl,
  },
  avatar: {
    marginBottom: theme.spacing.md,
    borderWidth: 3,
    borderColor: theme.colors.primaryLight,
  },
  therapistName: {
    fontSize: theme.fonts.sizes.xl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  therapistSpecialization: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontWeight: theme.fonts.weights.medium,
  },
  costSection: {
    marginBottom: theme.spacing.xxxl,
  },
  costCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight,
    borderRadius: 16,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  costIcon: {
    fontSize: 32,
    marginRight: theme.spacing.md,
  },
  costInfo: {
    flex: 1,
  },
  costAmount: {
    fontSize: theme.fonts.sizes.xl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  costDescription: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  balanceLabel: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
  balanceAmount: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.bold,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3F3',
    borderRadius: 12,
    padding: theme.spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: '#FF4444',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: theme.spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: theme.fonts.sizes.sm,
    color: '#CC0000',
    fontWeight: theme.fonts.weights.medium,
    lineHeight: 18,
  },
  actionSection: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl,
  },
  actionButton: {
    flex: 1,
    paddingVertical: theme.spacing.lg,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.border,
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
  },
  disabledButton: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.6,
  },
  cancelText: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.semibold,
    color: theme.colors.textSecondary,
  },
  confirmText: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.semibold,
    color: theme.colors.surface,
  },
  disabledText: {
    color: theme.colors.textSecondary,
  },
  featuresSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.lg,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  featureIcon: {
    fontSize: 16,
    marginRight: theme.spacing.sm,
    width: 20,
  },
  featureText: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fonts.weights.medium,
  },
});

export default StartCallModal;