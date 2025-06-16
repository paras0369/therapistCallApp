/**
 * Input Validation Utilities
 * 
 * Provides validation functions for user inputs to prevent XSS and injection attacks
 */

// Phone number validation (Indian format)
export const validatePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, error: 'Phone number is required' };
  }
  
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Check length (10 digits for Indian mobile numbers)
  if (cleaned.length !== 10) {
    return { isValid: false, error: 'Phone number must be 10 digits' };
  }
  
  // Check if starts with valid Indian mobile prefix
  const validPrefixes = ['6', '7', '8', '9'];
  if (!validPrefixes.includes(cleaned[0])) {
    return { isValid: false, error: 'Invalid phone number format' };
  }
  
  return { isValid: true, cleaned };
};

// OTP validation
export const validateOTP = (otp) => {
  if (!otp || typeof otp !== 'string') {
    return { isValid: false, error: 'OTP is required' };
  }
  
  // Remove all non-numeric characters
  const cleaned = otp.replace(/\D/g, '');
  
  // Check length (6 digits)
  if (cleaned.length !== 6) {
    return { isValid: false, error: 'OTP must be 6 digits' };
  }
  
  return { isValid: true, cleaned };
};

// Therapist ID validation
export const validateTherapistId = (id) => {
  if (!id || typeof id !== 'string') {
    return { isValid: false, error: 'Therapist ID is required' };
  }
  
  // Remove whitespace
  const cleaned = id.trim();
  
  // Check length
  if (cleaned.length < 3 || cleaned.length > 20) {
    return { isValid: false, error: 'Therapist ID must be 3-20 characters' };
  }
  
  // Check for alphanumeric characters only
  if (!/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
    return { isValid: false, error: 'Therapist ID can only contain letters, numbers, hyphens, and underscores' };
  }
  
  return { isValid: true, cleaned };
};

// Password validation
export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password is required' };
  }
  
  if (password.length < 6) {
    return { isValid: false, error: 'Password must be at least 6 characters' };
  }
  
  if (password.length > 128) {
    return { isValid: false, error: 'Password must be less than 128 characters' };
  }
  
  return { isValid: true };
};

// Name validation (for display purposes)
export const validateDisplayName = (name) => {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Name is required' };
  }
  
  // Remove extra whitespace
  const cleaned = name.trim().replace(/\s+/g, ' ');
  
  // Check length
  if (cleaned.length < 1 || cleaned.length > 50) {
    return { isValid: false, error: 'Name must be 1-50 characters' };
  }
  
  // Check for valid characters (letters, spaces, some punctuation)
  if (!/^[a-zA-Z\s\-\.\']+$/.test(cleaned)) {
    return { isValid: false, error: 'Name can only contain letters, spaces, hyphens, periods, and apostrophes' };
  }
  
  return { isValid: true, cleaned };
};

// Sanitize string for display (prevent XSS)
export const sanitizeForDisplay = (input) => {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Validate call ID format (supports both UUID v4 and MongoDB ObjectId)
export const validateCallId = (callId) => {
  if (!callId || typeof callId !== 'string') {
    return { isValid: false, error: 'Call ID is required' };
  }
  
  // UUID v4 format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  // MongoDB ObjectId format check (24 character hexadecimal string)
  const objectIdRegex = /^[0-9a-f]{24}$/i;
  
  // Temporary ID format check (for client-generated IDs)
  const tempIdRegex = /^temp_\d+_[0-9a-f]+$/i;
  
  if (uuidRegex.test(callId)) {
    return { isValid: true, format: 'uuid' };
  }
  
  if (objectIdRegex.test(callId)) {
    return { isValid: true, format: 'objectId' };
  }
  
  if (tempIdRegex.test(callId)) {
    return { isValid: true, format: 'temporary' };
  }
  
  return { isValid: false, error: 'Invalid call ID format (expected UUID, ObjectId, or temporary ID)' };
};

// Validate duration (in seconds)
export const validateDuration = (duration) => {
  const num = parseInt(duration, 10);
  
  if (isNaN(num) || num < 0) {
    return { isValid: false, error: 'Duration must be a positive number' };
  }
  
  // Maximum call duration: 4 hours (14400 seconds)
  if (num > 14400) {
    return { isValid: false, error: 'Duration cannot exceed 4 hours' };
  }
  
  return { isValid: true, duration: num };
};

// Generic object key validation (prevent prototype pollution)
export const validateObjectKey = (key) => {
  if (!key || typeof key !== 'string') {
    return { isValid: false, error: 'Key must be a string' };
  }
  
  // Prevent prototype pollution
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  if (dangerousKeys.includes(key.toLowerCase())) {
    return { isValid: false, error: 'Invalid key name' };
  }
  
  return { isValid: true };
};

export default {
  validatePhoneNumber,
  validateOTP,
  validateTherapistId,
  validatePassword,
  validateDisplayName,
  sanitizeForDisplay,
  validateCallId,
  validateDuration,
  validateObjectKey,
};