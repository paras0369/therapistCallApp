import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, StyleSheet } from 'react-native';

// Context providers
import { AuthProvider, CallProvider, useAuth } from './src/context';

// Error boundaries and common components
import { ErrorBoundary, LoadingState } from './src/components/common';

// Components
import UserTypeSelection from './src/components/UserTypeSelection';
import LoginScreen from './src/components/LoginScreen';
import UserDashboard from './src/components/UserDashboard';
import TherapistDashboard from './src/components/TherapistDashboard';
import CallScreen from './src/components/CallScreen';

// Theme
import theme from './src/theme';

const Stack = createStackNavigator();

// Error fallback component
const AppErrorFallback = ({ error, onRetry }) => (
  <View style={styles.errorContainer}>
    <LoadingState
      type="network"
      text="App Error Occurred"
      subtext="Please restart the app to continue"
    />
  </View>
);

// Navigation component that uses auth context
const AppNavigator = () => {
  const { isAuthenticated, userType, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingState
          type="auth"
          text="Loading..."
          subtext="Checking authentication status"
        />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          gestureEnabled: false,
        }}
        initialRouteName={
          isAuthenticated
            ? userType === 'therapist'
              ? 'TherapistDashboard'
              : 'UserDashboard'
            : 'UserTypeSelection'
        }
      >
        <Stack.Screen name="UserTypeSelection" component={UserTypeSelection} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="UserDashboard" component={UserDashboard} />
        <Stack.Screen
          name="TherapistDashboard"
          component={TherapistDashboard}
        />
        <Stack.Screen
          name="CallScreen"
          component={CallScreen}
          options={{
            gestureEnabled: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

// Main App component with providers and error boundary
const App = () => {
  return (
    <ErrorBoundary fallback={AppErrorFallback}>
      <AuthProvider>
        <CallProvider>
          <AppNavigator />
        </CallProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});

export default App;
