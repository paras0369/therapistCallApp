import { Alert } from 'react-native';

class ErrorHandler {
  static handleError(error, context = '') {
    console.error(`Error in ${context}:`, error);
    
    let message = 'An unexpected error occurred';
    
    if (error.response) {
      // API error with response
      message = error.response.data?.message || message;
    } else if (error.message) {
      // JavaScript error
      message = error.message;
    }
    
    // Don't show alert for network errors in production
    if (__DEV__ || !this.isNetworkError(error)) {
      Alert.alert('Error', message);
    }
  }
  
  static isNetworkError(error) {
    return error.code === 'NETWORK_ERROR' || 
           error.message?.includes('Network Error') ||
           error.message?.includes('fetch');
  }
  
  static handleAuthError(error, navigation) {
    console.error('Auth error:', error);
    
    if (error.response?.status === 401) {
      Alert.alert(
        'Session Expired',
        'Please login again',
        [{ text: 'OK', onPress: () => navigation.navigate('UserTypeSelection') }]
      );
    } else {
      this.handleError(error, 'Authentication');
    }
  }
  
  static handleCallError(error) {
    console.error('Call error:', error);
    
    const callErrorMessages = {
      'Permission denied': 'Microphone permission is required for calls',
      'Device busy': 'Your device microphone is being used by another app',
      'Connection failed': 'Unable to connect. Please check your internet connection',
      'Timeout': 'Connection timeout. Please try again'
    };
    
    const message = callErrorMessages[error.message] || 'Call failed';
    Alert.alert('Call Error', message);
  }
}

export default ErrorHandler;