/**
 * PerformanceMonitor - Performance monitoring and optimization utilities
 * 
 * Provides tools for monitoring component render times, memory usage,
 * and identifying performance bottlenecks in the application.
 */

import Environment from '../config/environment';

class PerformanceMonitor {
  constructor() {
    this.renderTimes = new Map();
    this.memorySnapshots = [];
    this.maxMemorySnapshots = 100;
    this.isEnabled = Environment.DEBUG_LOGGING && __DEV__;
    
    if (this.isEnabled) {
      console.log('PerformanceMonitor: Initialized');
    }
  }

  /**
   * Start timing a component render
   */
  startRender(componentName) {
    if (!this.isEnabled) return null;
    
    const startTime = performance.now();
    const timerId = `${componentName}_${Date.now()}_${Math.random()}`;
    
    this.renderTimes.set(timerId, {
      componentName,
      startTime,
      endTime: null,
      duration: null,
    });
    
    return timerId;
  }

  /**
   * End timing a component render
   */
  endRender(timerId) {
    if (!this.isEnabled || !timerId) return;
    
    const renderInfo = this.renderTimes.get(timerId);
    if (!renderInfo) return;
    
    renderInfo.endTime = performance.now();
    renderInfo.duration = renderInfo.endTime - renderInfo.startTime;
    
    if (renderInfo.duration > 16) { // > 1 frame at 60fps
      console.warn(`PerformanceMonitor: Slow render detected - ${renderInfo.componentName}: ${renderInfo.duration.toFixed(2)}ms`);
    }
    
    // Clean up old render times
    if (this.renderTimes.size > 1000) {
      const oldestKey = this.renderTimes.keys().next().value;
      this.renderTimes.delete(oldestKey);
    }
  }

  /**
   * Take a memory snapshot
   */
  takeMemorySnapshot(label = 'default') {
    if (!this.isEnabled) return;
    
    if (typeof performance !== 'undefined' && performance.memory) {
      const snapshot = {
        label,
        timestamp: Date.now(),
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      };
      
      this.memorySnapshots.push(snapshot);
      
      // Keep only recent snapshots
      if (this.memorySnapshots.length > this.maxMemorySnapshots) {
        this.memorySnapshots.shift();
      }
      
      console.log(`PerformanceMonitor: Memory snapshot (${label}):`, {
        used: `${(snapshot.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(snapshot.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(snapshot.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  }

  /**
   * Log component mount/unmount
   */
  logComponentLifecycle(componentName, event, extraData = {}) {
    if (!this.isEnabled) return;
    
    console.log(`PerformanceMonitor: ${componentName} ${event}`, extraData);
    
    if (event === 'mount') {
      this.takeMemorySnapshot(`${componentName}_mount`);
    } else if (event === 'unmount') {
      this.takeMemorySnapshot(`${componentName}_unmount`);
    }
  }

  /**
   * Monitor async operation performance
   */
  async measureAsyncOperation(operationName, operation) {
    if (!this.isEnabled) {
      return await operation();
    }
    
    const startTime = performance.now();
    console.log(`PerformanceMonitor: Starting ${operationName}`);
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      
      console.log(`PerformanceMonitor: ${operationName} completed in ${duration.toFixed(2)}ms`);
      
      if (duration > 1000) {
        console.warn(`PerformanceMonitor: Slow operation detected - ${operationName}: ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error(`PerformanceMonitor: ${operationName} failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    }
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (!this.isEnabled) return null;
    
    const renderSummary = {};
    for (const renderInfo of this.renderTimes.values()) {
      if (renderInfo.duration !== null) {
        if (!renderSummary[renderInfo.componentName]) {
          renderSummary[renderInfo.componentName] = {
            count: 0,
            totalTime: 0,
            maxTime: 0,
            minTime: Infinity,
          };
        }
        
        const summary = renderSummary[renderInfo.componentName];
        summary.count++;
        summary.totalTime += renderInfo.duration;
        summary.maxTime = Math.max(summary.maxTime, renderInfo.duration);
        summary.minTime = Math.min(summary.minTime, renderInfo.duration);
      }
    }
    
    // Calculate averages
    for (const componentName in renderSummary) {
      const summary = renderSummary[componentName];
      summary.avgTime = summary.totalTime / summary.count;
    }
    
    return {
      renderSummary,
      memorySnapshots: this.memorySnapshots.slice(-10), // Last 10 snapshots
      timestamp: Date.now(),
    };
  }

  /**
   * Clear all performance data
   */
  clear() {
    this.renderTimes.clear();
    this.memorySnapshots = [];
    
    if (this.isEnabled) {
      console.log('PerformanceMonitor: Performance data cleared');
    }
  }

  /**
   * Log FPS information (if available)
   */
  logFPS() {
    if (!this.isEnabled) return;
    
    // This is a simplified FPS monitor
    let frameCount = 0;
    let lastTime = performance.now();
    
    const measureFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        
        if (fps < 50) {
          console.warn(`PerformanceMonitor: Low FPS detected: ${fps}fps`);
        }
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    };
    
    requestAnimationFrame(measureFPS);
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

/**
 * React Hook for component performance monitoring
 */
export const usePerformanceMonitor = (componentName) => {
  if (!performanceMonitor.isEnabled) {
    return {
      startRender: () => null,
      endRender: () => {},
      logLifecycle: () => {},
    };
  }
  
  return {
    startRender: () => performanceMonitor.startRender(componentName),
    endRender: (timerId) => performanceMonitor.endRender(timerId),
    logLifecycle: (event, extraData) => 
      performanceMonitor.logComponentLifecycle(componentName, event, extraData),
  };
};

export default performanceMonitor;