/**
 * Memory Monitoring Utility for 2GB Server
 * 
 * This utility helps monitor memory usage during chapter processing
 * to prevent server crashes and optimize performance.
 */

const os = require('os');

class MemoryMonitor {
  constructor() {
    this.warnings = [];
    this.criticalThreshold = 1800 * 1024 * 1024; // 1.8GB
    this.warningThreshold = 1500 * 1024 * 1024; // 1.5GB
    this.safeThreshold = 1200 * 1024 * 1024; // 1.2GB
  }

  // Get current memory usage
  getMemoryUsage() {
    const used = process.memoryUsage();
    const system = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };

    return {
      process: {
        rss: used.rss, // Resident Set Size
        heapTotal: used.heapTotal, // Total heap allocated
        heapUsed: used.heapUsed, // Heap actually used
        external: used.external, // C++ objects bound to JavaScript
        arrayBuffers: used.arrayBuffers // ArrayBuffers and SharedArrayBuffers
      },
      system: {
        total: system.total,
        free: system.free,
        used: system.used,
        percentage: ((system.used / system.total) * 100).toFixed(2)
      }
    };
  }

  // Check if memory usage is safe
  isMemorySafe() {
    const usage = this.getMemoryUsage();
    const heapUsed = usage.process.heapUsed;
    
    if (heapUsed > this.criticalThreshold) {
      return { safe: false, level: 'critical', usage: heapUsed };
    } else if (heapUsed > this.warningThreshold) {
      return { safe: false, level: 'warning', usage: heapUsed };
    } else if (heapUsed > this.safeThreshold) {
      return { safe: true, level: 'caution', usage: heapUsed };
    } else {
      return { safe: true, level: 'safe', usage: heapUsed };
    }
  }

  // Log memory status
  logMemoryStatus(operation = 'Unknown') {
    const usage = this.getMemoryUsage();
    const status = this.isMemorySafe();
    
    const logData = {
      operation,
      timestamp: new Date().toISOString(),
      status: status.level,
      processHeap: {
        used: `${(usage.process.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        total: `${(usage.process.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(usage.process.external / 1024 / 1024).toFixed(2)}MB`
      },
      system: {
        used: `${(usage.system.used / 1024 / 1024 / 1024).toFixed(2)}GB`,
        free: `${(usage.system.free / 1024 / 1024 / 1024).toFixed(2)}GB`,
        percentage: `${usage.system.percentage}%`
      }
    };

    if (status.level === 'critical') {
      console.error('🚨 CRITICAL MEMORY USAGE:', logData);
    } else if (status.level === 'warning') {
      console.warn('⚠️ HIGH MEMORY USAGE:', logData);
    } else if (status.level === 'caution') {
      console.log('⚠️ MODERATE MEMORY USAGE:', logData);
    } else {
      console.log('✅ MEMORY USAGE OK:', logData);
    }

    return logData;
  }

  // Force garbage collection if available
  forceGarbageCollection() {
    if (global.gc) {
      const before = this.getMemoryUsage();
      global.gc();
      const after = this.getMemoryUsage();
      
      const freed = before.process.heapUsed - after.process.heapUsed;
      console.log(`🗑️ Garbage collection completed: freed ${(freed / 1024 / 1024).toFixed(2)}MB`);
      
      return { freed, before: before.process.heapUsed, after: after.process.heapUsed };
    } else {
      console.warn('⚠️ Garbage collection not available (run with --expose-gc)');
      return null;
    }
  }

  // Wait for memory to become safe
  async waitForSafeMemory(timeout = 30000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = this.isMemorySafe();
      
      if (status.safe) {
        console.log('✅ Memory usage is now safe, continuing...');
        return true;
      }
      
      if (status.level === 'critical') {
        console.log('🚨 Critical memory usage, forcing garbage collection...');
        this.forceGarbageCollection();
      }
      
      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.error('⏰ Timeout waiting for safe memory usage');
    return false;
  }

  // Get memory recommendations
  getRecommendations() {
    const usage = this.getMemoryUsage();
    const heapUsed = usage.process.heapUsed;
    const recommendations = [];
    
    if (heapUsed > this.criticalThreshold) {
      recommendations.push('IMMEDIATE: Force garbage collection');
      recommendations.push('IMMEDIATE: Stop processing new chapters');
      recommendations.push('IMMEDIATE: Consider restarting the process');
    } else if (heapUsed > this.warningThreshold) {
      recommendations.push('URGENT: Force garbage collection');
      recommendations.push('URGENT: Reduce concurrent processing');
      recommendations.push('URGENT: Monitor memory usage closely');
    } else if (heapUsed > this.safeThreshold) {
      recommendations.push('CAUTION: Monitor memory usage');
      recommendations.push('CAUTION: Consider reducing batch sizes');
    }
    
    return recommendations;
  }
}

module.exports = MemoryMonitor; 