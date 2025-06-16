import Environment from './environment';

const API_BASE_URL = Environment.API_BASE_URL;

export const API_ENDPOINTS = {
  SEND_OTP: `${API_BASE_URL}/auth/send-otp`,
  VERIFY_OTP: `${API_BASE_URL}/auth/verify-otp`,
  THERAPIST_LOGIN: `${API_BASE_URL}/auth/therapist-login`,
  GET_AVAILABLE_THERAPISTS: `${API_BASE_URL}/therapists/available`,
  UPDATE_THERAPIST_STATUS: `${API_BASE_URL}/therapists/status`,
  GET_USER_PROFILE: `${API_BASE_URL}/users/profile`,
  GET_THERAPIST_PROFILE: `${API_BASE_URL}/therapists/profile`,
  GET_CALL_HISTORY: `${API_BASE_URL}/calls/history`,
  START_CALL: `${API_BASE_URL}/calls/start`,
  END_CALL: `${API_BASE_URL}/calls/end`,
};

export const SOCKET_URL = Environment.SOCKET_URL;
