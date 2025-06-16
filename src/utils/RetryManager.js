/**
 * RetryManager - Handles retry logic with exponential backoff
 * 
 * Provides configurable retry mechanisms for async operations
 * with exponential backoff, jitter, and circuit breaker patterns.
 */

export class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // ms
    this.maxDelay = options.maxDelay || 30000; // ms
    this.backoffFactor = options.backoffFactor || 2;
    this.jitter = options.jitter !== false; // Default true
    this.retryCondition = options.retryCondition || this.defaultRetryCondition;
    
    // Circuit breaker state
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.circuitOpenTime = options.circuitOpenTime || 60000; // 1 minute
    this.failureThreshold = options.failureThreshold || 5;
  }

  /**
   * Execute operation with retry logic
   */
  async execute(operation, context = '') {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error(`Circuit breaker is open for ${context}`);
    }

    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Reset failure count on success
        this.consecutiveFailures = 0;
        this.lastFailureTime = null;
        
        console.log(`RetryManager: Operation succeeded on attempt ${attempt + 1}${context ? ` (${context})` : ''}`);
        return result;
        
      } catch (error) {
        lastError = error;
        
        console.warn(`RetryManager: Attempt ${attempt + 1} failed${context ? ` (${context})` : ''}:`, error.message);
        
        // Check if we should retry this error
        if (!this.retryCondition(error, attempt)) {
          console.log(`RetryManager: Not retrying due to retry condition${context ? ` (${context})` : ''}`);
          break;
        }
        
        // Don't wait after the last attempt
        if (attempt < this.maxRetries) {
          const delay = this.calculateDelay(attempt);
          console.log(`RetryManager: Waiting ${delay}ms before next attempt${context ? ` (${context})` : ''}`);
          await this.sleep(delay);
        }
      }
    }
    
    // All retries failed
    this.recordFailure();
    
    const errorMessage = `Operation failed after ${this.maxRetries + 1} attempts${context ? ` (${context})` : ''}: ${lastError.message}`;
    console.error(`RetryManager: ${errorMessage}`);
    
    throw new Error(errorMessage);
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  calculateDelay(attempt) {
    let delay = this.baseDelay * Math.pow(this.backoffFactor, attempt);
    
    // Apply maximum delay limit
    delay = Math.min(delay, this.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  /**
   * Default retry condition - retry on network and temporary errors
   */
  defaultRetryCondition(error, attempt) {
    // Don't retry after max attempts
    if (attempt >= this.maxRetries) {
      return false;
    }
    
    const message = error.message?.toLowerCase() || '';
    
    // Retry on network errors
    if (message.includes('network') || 
        message.includes('timeout') || 
        message.includes('connection') ||
        message.includes('fetch')) {
      return true;
    }
    
    // Retry on temporary server errors (if we can detect them)
    if (message.includes('server error') || 
        message.includes('service unavailable') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504')) {
      return true;
    }
    
    // Retry on WebRTC temporary failures
    if (message.includes('ice') || 
        message.includes('gathering') ||
        message.includes('candidate')) {
      return true;
    }
    
    // Don't retry on authentication, permission, or validation errors
    if (message.includes('auth') || 
        message.includes('permission') || 
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('invalid') ||
        message.includes('bad request')) {
      return false;
    }
    
    // Default to retry for unknown errors
    return true;
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitOpen() {
    if (this.consecutiveFailures < this.failureThreshold) {
      return false;
    }
    
    if (!this.lastFailureTime) {
      return false;
    }
    
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure < this.circuitOpenTime;
  }

  /**
   * Record a failure for circuit breaker
   */
  recordFailure() {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    
    if (this.consecutiveFailures >= this.failureThreshold) {
      console.warn(`RetryManager: Circuit breaker opened after ${this.consecutiveFailures} consecutive failures`);
    }
  }

  /**
   * Manually reset circuit breaker
   */
  resetCircuit() {
    console.log('RetryManager: Circuit breaker manually reset');
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
  }

  /**
   * Get current state for debugging
   */
  getState() {
    return {
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      isCircuitOpen: this.isCircuitOpen(),
      maxRetries: this.maxRetries,
      baseDelay: this.baseDelay,
    };
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Pre-configured retry managers for common use cases
 */
export const NetworkRetryManager = new RetryManager({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  jitter: true,
});

export const WebRTCRetryManager = new RetryManager({
  maxRetries: 5,
  baseDelay: 500,
  maxDelay: 5000,
  backoffFactor: 1.5,
  jitter: true,
  retryCondition: (error, attempt) => {
    const message = error.message?.toLowerCase() || '';
    
    // More aggressive retry for WebRTC issues
    if (message.includes('ice') || 
        message.includes('webrtc') ||
        message.includes('peer') ||
        message.includes('connection') ||
        message.includes('gathering')) {
      return attempt < 5;
    }
    
    return false;
  },
});

export const CallRetryManager = new RetryManager({
  maxRetries: 2,
  baseDelay: 2000,
  maxDelay: 8000,
  backoffFactor: 2,
  jitter: true,
  failureThreshold: 3,
  circuitOpenTime: 120000, // 2 minutes
});

export default RetryManager;