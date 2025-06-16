import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Button } from './index';
import theme from '../../theme';

/**
 * CallErrorBoundary - Specialized error boundary for call-related components
 * 
 * Catches and handles errors that occur during call flows, providing
 * graceful fallbacks and recovery options.
 */
class CallErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('CallErrorBoundary: Caught error:', error);
    console.error('Error info:', errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Report error to monitoring service if available
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    const newRetryCount = this.state.retryCount + 1;
    
    // Limit retry attempts
    if (newRetryCount > 3) {
      console.warn('CallErrorBoundary: Maximum retry attempts reached');
      if (this.props.onMaxRetriesReached) {
        this.props.onMaxRetriesReached();
      }
      return;
    }

    console.log(`CallErrorBoundary: Retry attempt ${newRetryCount}`);
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: newRetryCount,
    });

    // Call retry callback if provided
    if (this.props.onRetry) {
      this.props.onRetry(newRetryCount);
    }
  };

  handleFallback = () => {
    console.log('CallErrorBoundary: Using fallback action');
    
    if (this.props.onFallback) {
      this.props.onFallback();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI can be provided via props
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry, this.handleFallback);
      }

      // Default fallback UI
      return (
        <View style={styles.container}>
          <View style={styles.errorCard}>
            <Text style={styles.title}>Call Error</Text>
            <Text style={styles.message}>
              {this.getErrorMessage()}
            </Text>
            
            <View style={styles.buttonContainer}>
              <Button
                title="Try Again"
                variant="primary"
                size="medium"
                onPress={this.handleRetry}
                disabled={this.state.retryCount >= 3}
                style={styles.button}
              />
              
              {this.props.showFallbackButton && (
                <Button
                  title={this.props.fallbackButtonText || "Go Back"}
                  variant="secondary"
                  size="medium"
                  onPress={this.handleFallback}
                  style={styles.button}
                />
              )}
            </View>
            
            {this.state.retryCount > 0 && (
              <Text style={styles.retryCount}>
                Retry attempts: {this.state.retryCount}/3
              </Text>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }

  getErrorMessage() {
    const { error } = this.state;
    
    if (!error) {
      return 'An unexpected error occurred during the call.';
    }

    // Provide user-friendly messages for common errors
    if (error.message?.includes('network') || error.message?.includes('connection')) {
      return 'Network connection lost. Please check your internet connection and try again.';
    }
    
    if (error.message?.includes('permission') || error.message?.includes('media')) {
      return 'Camera or microphone access is required. Please check your permissions.';
    }
    
    if (error.message?.includes('timeout')) {
      return 'The call timed out. Please try again.';
    }
    
    if (error.message?.includes('WebRTC') || error.message?.includes('webrtc')) {
      return 'Unable to establish call connection. Please try again.';
    }

    // Fallback to generic message for other errors
    return 'An error occurred during the call. Please try again.';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.screenPadding,
  },
  errorCard: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    maxWidth: 400,
    width: '100%',
    alignItems: 'center',
    shadowColor: theme.colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: theme.fonts.sizes.xl,
    fontWeight: theme.fonts.weights.bold,
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    lineHeight: theme.fonts.sizes.md * 1.4,
    marginBottom: theme.spacing.xl,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  button: {
    minWidth: 120,
    marginHorizontal: theme.spacing.xs,
  },
  retryCount: {
    fontSize: theme.fonts.sizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
});

export default CallErrorBoundary;