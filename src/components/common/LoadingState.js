import React from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LoadingSpinner } from './index';
import theme from '../../theme';

const LoadingState = ({
  type = 'default',
  text,
  subtext,
  style,
  ...props
}) => {
  const animatedValue = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();

    return () => animation.stop();
  }, [animatedValue]);

  const renderLoadingContent = () => {
    switch (type) {
      case 'call':
        return (
          <View style={styles.callLoading}>
            <Animated.View
              style={[
                styles.callIcon,
                {
                  transform: [
                    {
                      rotate: animatedValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={styles.callIconText}>📞</Text>
            </Animated.View>
            <Text style={styles.callLoadingText}>
              {text || 'Connecting call...'}
            </Text>
            {subtext && <Text style={styles.callLoadingSubtext}>{subtext}</Text>}
          </View>
        );

      case 'auth':
        return (
          <View style={styles.authLoading}>
            <View style={styles.authIcon}>
              <Text style={styles.authIconText}>🔐</Text>
            </View>
            <LoadingSpinner size="large" color={theme.colors.primary} />
            <Text style={styles.authLoadingText}>
              {text || 'Authenticating...'}
            </Text>
          </View>
        );

      case 'data':
        return (
          <View style={styles.dataLoading}>
            <Animated.View
              style={[
                styles.dataIcon,
                {
                  opacity: animatedValue.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.3, 1, 0.3],
                  }),
                },
              ]}
            >
              <Text style={styles.dataIconText}>📊</Text>
            </Animated.View>
            <Text style={styles.dataLoadingText}>
              {text || 'Loading data...'}
            </Text>
          </View>
        );

      case 'network':
        return (
          <View style={styles.networkLoading}>
            <View style={styles.networkBars}>
              {[0, 1, 2].map((index) => (
                <Animated.View
                  key={index}
                  style={[
                    styles.networkBar,
                    {
                      height: animatedValue.interpolate({
                        inputRange: [0, 1],
                        outputRange: [8, 24],
                      }),
                      opacity: animatedValue.interpolate({
                        inputRange: [0, 0.3 * (index + 1), 1],
                        outputRange: [0.3, 1, 0.3],
                      }),
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.networkLoadingText}>
              {text || 'Connecting to network...'}
            </Text>
          </View>
        );

      default:
        return (
          <View style={styles.defaultLoading}>
            <LoadingSpinner 
              size="large" 
              color={theme.colors.primary}
              text={text || 'Loading...'}
            />
            {subtext && <Text style={styles.defaultSubtext}>{subtext}</Text>}
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, style]} {...props}>
      {renderLoadingContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.screenPadding,
    backgroundColor: theme.colors.background,
  },

  // Call loading styles
  callLoading: {
    alignItems: 'center',
  },
  callIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    ...theme.shadows.primary,
  },
  callIconText: {
    fontSize: 40,
  },
  callLoadingText: {
    fontSize: theme.fonts.sizes.xl,
    fontWeight: theme.fonts.weights.semibold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  callLoadingSubtext: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },

  // Auth loading styles
  authLoading: {
    alignItems: 'center',
  },
  authIcon: {
    marginBottom: theme.spacing.xl,
  },
  authIconText: {
    fontSize: 64,
  },
  authLoadingText: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.medium,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },

  // Data loading styles
  dataLoading: {
    alignItems: 'center',
  },
  dataIcon: {
    marginBottom: theme.spacing.xl,
  },
  dataIconText: {
    fontSize: 64,
  },
  dataLoadingText: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.medium,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },

  // Network loading styles
  networkLoading: {
    alignItems: 'center',
  },
  networkBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xl,
  },
  networkBar: {
    width: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
  },
  networkLoadingText: {
    fontSize: theme.fonts.sizes.lg,
    fontWeight: theme.fonts.weights.medium,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },

  // Default loading styles
  defaultLoading: {
    alignItems: 'center',
  },
  defaultSubtext: {
    fontSize: theme.fonts.sizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.lg,
  },
});

export default LoadingState;