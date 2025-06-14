import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';

// New imports
import { useAuth } from '../context';
import { Button, LoadingState, ErrorBoundary } from './common';
import theme from '../theme';

// Existing imports
import AuthService from '../services/AuthService';

const LoginScreen = ({ navigation, route }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const isTherapist = route.params?.userType === 'therapist';
  const { login } = useAuth();

  const validatePhoneNumber = (phone) => {
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    if (!/^\d{10,15}$/.test(cleaned)) {
      return { isValid: false, message: 'Please enter a valid phone number (10-15 digits)' };
    }
    return { isValid: true, cleaned };
  };

  const handleSendOTP = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      Alert.alert('Error', validation.message);
      return;
    }

    console.log('Sending OTP to:', phoneNumber);

    setLoading(true);
    try {
      await AuthService.sendOTP(phoneNumber);
      setOtpSent(true);
      Alert.alert('Success', 'OTP sent to your phone number');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      Alert.alert('Error', 'Please enter the OTP');
      return;
    }

    setLoading(true);
    try {
      const result = await AuthService.verifyOTP(phoneNumber, otp);
      if (result.success) {
        navigation.replace('UserDashboard');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTherapistLogin = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.isValid) {
      Alert.alert('Error', validation.message);
      return;
    }

    setLoading(true);
    try {
      const result = await AuthService.therapistLogin(phoneNumber);
      if (result.success) {
        navigation.replace('TherapistDashboard');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Button
          title="←"
          variant="ghost"
          size="small"
          style={styles.backButton}
          onPress={() => navigation.navigate('UserTypeSelection')}
          disabled={loading}
        />
        <View style={styles.headerContent}>
          <View style={styles.userTypeIndicator}>
            <Text style={styles.userTypeEmoji}>
              {isTherapist ? '👨‍⚕️' : '👤'}
            </Text>
          </View>
          <Text style={styles.title}>
            {isTherapist ? 'Therapist Login' : 'User Login'}
          </Text>
          <Text style={styles.subtitle}>
            {isTherapist ? 'Access your professional dashboard' : 'Join thousands of users'}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your phone number"
              placeholderTextColor="#999999"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              editable={!loading}
            />
          </View>

          {!isTherapist && otpSent && (
            <View style={styles.inputWrapper}>
              <Text style={styles.inputLabel}>Verification Code</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter 6-digit OTP"
                placeholderTextColor="#999999"
                value={otp}
                onChangeText={setOtp}
                keyboardType="numeric"
                maxLength={6}
                editable={!loading}
              />
            </View>
          )}
        </View>

        <Button
          title={isTherapist ? 'Login' : otpSent ? 'Verify OTP' : 'Send OTP'}
          variant="primary"
          size="large"
          onPress={
            isTherapist
              ? handleTherapistLogin
              : otpSent
              ? handleVerifyOTP
              : handleSendOTP
          }
          loading={loading}
          disabled={loading}
          style={styles.button}
        />

        {!isTherapist && otpSent && (
          <Button
            title="Didn't receive code? Resend"
            variant="ghost"
            size="small"
            onPress={() => {
              setOtpSent(false);
              setOtp('');
            }}
            disabled={loading}
            style={styles.linkButton}
          />
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  backButtonText: {
    fontSize: 20,
    color: '#2C2C2C',
    fontWeight: '600',
  },
  headerContent: {
    alignItems: 'center',
  },
  userTypeIndicator: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  userTypeEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
    color: '#2C2C2C',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666666',
    fontWeight: '400',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  inputContainer: {
    marginBottom: 40,
  },
  inputWrapper: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#F0F0F0',
    color: '#2C2C2C',
    fontWeight: '500',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  button: {
    backgroundColor: '#FF6B35',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
    backgroundColor: '#FF6B35',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginRight: 8,
  },
  buttonArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  linkText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 20,
  },
});

// Error fallback for LoginScreen
const LoginScreenErrorFallback = ({ error, onRetry }) => (
  <SafeAreaView style={styles.container}>
    <LoadingState 
      type="auth" 
      text="Login Error" 
      subtext="Unable to access login. Please try again."
    />
  </SafeAreaView>
);

export default React.memo(function WrappedLoginScreen(props) {
  return (
    <ErrorBoundary fallback={LoginScreenErrorFallback}>
      <LoginScreen {...props} />
    </ErrorBoundary>
  );
});
