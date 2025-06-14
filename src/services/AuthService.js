import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_ENDPOINTS } from '../config/api';

class AuthService {
  async sendOTP(phoneNumber) {
    try {
      console.log('Sending OTP to:', phoneNumber);
      const response = await axios.post(API_ENDPOINTS.SEND_OTP, {
        phoneNumber,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data || 'Failed to send OTP');
    }
  }

  async verifyOTP(phoneNumber, otp) {
    try {
      const response = await axios.post(API_ENDPOINTS.VERIFY_OTP, {
        phoneNumber,
        otp,
      });

      if (response.data.success) {
        await AsyncStorage.setItem('userToken', response.data.token);
        await AsyncStorage.setItem('userType', 'user');
        await AsyncStorage.setItem('userId', response.data.userId.toString());
      }

      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Invalid OTP');
    }
  }

  async therapistLogin(phoneNumber) {
    try {
      const response = await axios.post(API_ENDPOINTS.THERAPIST_LOGIN, {
        phoneNumber,
      });

      if (response.data.success) {
        await AsyncStorage.setItem('userToken', response.data.token);
        await AsyncStorage.setItem('userType', 'therapist');
        await AsyncStorage.setItem(
          'therapistId',
          response.data.therapistId.toString(),
        );
      }

      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || 'Invalid phone number');
    }
  }

  async logout() {
    try {
      await AsyncStorage.multiRemove([
        'userToken',
        'userType',
        'userId',
        'therapistId',
      ]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  async isAuthenticated() {
    try {
      const token = await AsyncStorage.getItem('userToken');
      return !!token;
    } catch (error) {
      return false;
    }
  }

  async getUserType() {
    try {
      return await AsyncStorage.getItem('userType');
    } catch (error) {
      return null;
    }
  }

  async getUserId() {
    try {
      const userType = await this.getUserType();
      if (userType === 'user') {
        return await AsyncStorage.getItem('userId');
      } else if (userType === 'therapist') {
        return await AsyncStorage.getItem('therapistId');
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async getAuthToken() {
    try {
      return await AsyncStorage.getItem('userToken');
    } catch (error) {
      return null;
    }
  }
}

export default new AuthService();
