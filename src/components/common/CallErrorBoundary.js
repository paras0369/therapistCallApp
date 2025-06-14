import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from './index';
import theme from '../../theme';

const CallErrorFallback = ({ error, errorInfo, onRetry, navigation }) => {
  const handleGoBack = () => {
    if (navigation) {
      navigation.goBack();
    }
  };

  const handleRetryCall = () => {
    if (onRetry) {
      onRetry();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>📞</Text>
          <Text style={styles.errorIcon}>❌</Text>
        </View>
        
        <Text style={styles.title}>Call Error</Text>
        <Text style={styles.message}>
          There was an issue with your call. This could be due to network connectivity or device permissions.
        </Text>

        <View style={styles.buttonContainer}>
          <Button
            title="Try Again"
            onPress={handleRetryCall}
            variant="primary"
            style={styles.button}
          />
          
          <Button
            title="Go Back"
            onPress={handleGoBack}
            variant="secondary"
            style={styles.button}
          />
        </View>

        <Text style={styles.tips}>
          Tips: Check your internet connection and microphone permissions
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.screenPadding,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: theme.spacing.xl,
  },
  icon: {
    fontSize: 64,
  },
  errorIcon: {
    fontSize: 24,
    position: 'absolute',
    bottom: -8,
    right: -8,
  },
  title: {
    fontSize: theme.fonts.sizes.xxl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  message: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.fonts.lineHeights.relaxed * theme.fonts.sizes.md,
    marginBottom: theme.spacing.xxl,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  button: {
    flex: 1,
  },
  tips: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default CallErrorFallback;