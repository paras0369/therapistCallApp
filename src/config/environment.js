/**
 * Environment Configuration
 * 
 * Manages environment-specific configuration values.
 * In production, these should be set via environment variables or build-time configuration.
 */

// Get environment from build or default to development
const ENV = __DEV__ ? 'development' : 'production';

// Default configuration for each environment
const config = {
  development: {
    API_BASE_URL: 'http://192.168.29.45:3000/api',
    SOCKET_URL: 'http://192.168.29.45:3000',
    DEBUG_LOGGING: true,
    CALL_TIMEOUT: 30000,
    CONNECTION_TIMEOUT: 15000,
  },
  staging: {
    API_BASE_URL: 'https://api-staging.therapistcall.com/api',
    SOCKET_URL: 'https://api-staging.therapistcall.com',
    DEBUG_LOGGING: true,
    CALL_TIMEOUT: 30000,
    CONNECTION_TIMEOUT: 15000,
  },
  production: {
    API_BASE_URL: 'https://api.therapistcall.com/api',
    SOCKET_URL: 'https://api.therapistcall.com',
    DEBUG_LOGGING: false,
    CALL_TIMEOUT: 30000,
    CONNECTION_TIMEOUT: 15000,
  },
};

// Get current environment config
const currentConfig = config[ENV] || config.development;

// Allow environment variable overrides (for build-time configuration)
export const Environment = {
  API_BASE_URL: currentConfig.API_BASE_URL,
  SOCKET_URL: currentConfig.SOCKET_URL,
  DEBUG_LOGGING: currentConfig.DEBUG_LOGGING,
  CALL_TIMEOUT: currentConfig.CALL_TIMEOUT,
  CONNECTION_TIMEOUT: currentConfig.CONNECTION_TIMEOUT,
  ENV,
};

// Helper function to log configuration (only in development)
if (__DEV__) {
  console.log('Environment Configuration:', {
    ENV,
    API_BASE_URL: Environment.API_BASE_URL,
    SOCKET_URL: Environment.SOCKET_URL,
    DEBUG_LOGGING: Environment.DEBUG_LOGGING,
  });
}

export default Environment;