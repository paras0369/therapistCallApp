import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';

const { width, height } = Dimensions.get('window');

const UserTypeSelection = ({ navigation }) => {
  const handleUserTypeSelection = (userType) => {
    navigation.navigate('Login', { userType });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundGradient}>
        <View style={styles.topSection}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Text style={styles.logoEmoji}>🧠</Text>
            </View>
            <Text style={styles.brandName}>TherapyCall</Text>
            <Text style={styles.tagline}>Connect • Heal • Grow</Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Choose Your Journey</Text>
          <Text style={styles.subtitle}>Select how you'd like to get started</Text>
          
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.userButton]}
              onPress={() => handleUserTypeSelection('user')}
            >
              <View style={styles.buttonIcon}>
                <Text style={styles.iconText}>👤</Text>
              </View>
              <Text style={styles.buttonText}>I'm a User</Text>
              <Text style={styles.buttonSubtext}>Looking for therapy sessions</Text>
              <View style={styles.arrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.therapistButton]}
              onPress={() => handleUserTypeSelection('therapist')}
            >
              <View style={styles.buttonIcon}>
                <Text style={styles.iconText}>👨‍⚕️</Text>
              </View>
              <Text style={styles.buttonText}>I'm a Therapist</Text>
              <Text style={styles.buttonSubtext}>Providing therapy services</Text>
              <View style={styles.arrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Secure • Private • Professional</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backgroundGradient: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topSection: {
    flex: 0.4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  logoEmoji: {
    fontSize: 60,
  },
  brandName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#2C2C2C',
    marginBottom: 8,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '500',
    letterSpacing: 1,
  },
  content: {
    flex: 0.5,
    paddingHorizontal: 30,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#2C2C2C',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666666',
    fontWeight: '400',
  },
  buttonContainer: {
    gap: 20,
  },
  button: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#F5F5F5',
  },
  userButton: {
    borderLeftWidth: 6,
    borderLeftColor: '#FF6B35',
  },
  therapistButton: {
    borderLeftWidth: 6,
    borderLeftColor: '#FF8C42',
  },
  buttonIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF4F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconText: {
    fontSize: 24,
  },
  buttonText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 4,
  },
  buttonSubtext: {
    flex: 1,
    fontSize: 14,
    color: '#666666',
    fontWeight: '400',
  },
  arrow: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 20,
    color: '#FF6B35',
    fontWeight: '600',
  },
  footer: {
    flex: 0.1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 30,
  },
  footerText: {
    fontSize: 14,
    color: '#999999',
    fontWeight: '500',
    letterSpacing: 1,
  },
});

export default UserTypeSelection;