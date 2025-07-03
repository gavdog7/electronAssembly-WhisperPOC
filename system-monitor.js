const si = require('systeminformation');
const osUtils = require('node-os-utils');
const pidusage = require('pidusage');
const os = require('os');

class SystemMonitor {
  constructor() {
    this.monitoringInterval = null;
    this.updateCallback = null;
    this.processStats = new Map();
    this.historySize = 60; // Keep 60 data points (1 minute at 1 second intervals)
    this.history = {
      cpu: [],
      memory: [],
      gpu: [],
      timestamp: []
    };
  }

  start(callback) {
    this.updateCallback = callback;
    this.startMonitoring();
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  startMonitoring() {
    // Update every second
    this.monitoringInterval = setInterval(async () => {
      try {
        const stats = await this.collectSystemStats();
        this.updateHistory(stats);
        
        if (this.updateCallback) {
          this.updateCallback({
            ...stats,
            history: this.history
          });
        }
      } catch (error) {
        console.error('System monitoring error:', error);
      }
    }, 1000);
  }

  async collectSystemStats() {
    const stats = {};
    
    // CPU Information
    try {
      const cpuLoad = await si.currentLoad();
      const cpuTemp = await si.cpuTemperature();
      
      stats.cpu = {
        usage: Math.round(cpuLoad.currentLoad * 100) / 100,
        cores: cpuLoad.cpus.map(core => ({
          usage: Math.round(core.load * 100) / 100
        })),
        temperature: cpuTemp.main || 0,
        model: os.cpus()[0].model
      };
    } catch (error) {
      console.error('CPU stats error:', error);
      stats.cpu = { usage: 0, cores: [], temperature: 0, model: 'Unknown' };
    }

    // Memory Information
    try {
      const memInfo = await si.mem();
      const processMemory = process.memoryUsage();
      
      stats.memory = {
        total: Math.round(memInfo.total / 1024 / 1024), // MB
        used: Math.round(memInfo.used / 1024 / 1024), // MB
        free: Math.round(memInfo.free / 1024 / 1024), // MB
        usage: Math.round((memInfo.used / memInfo.total) * 100),
        process: {
          rss: Math.round(processMemory.rss / 1024 / 1024), // MB
          heapTotal: Math.round(processMemory.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024), // MB
          external: Math.round(processMemory.external / 1024 / 1024) // MB
        }
      };
    } catch (error) {
      console.error('Memory stats error:', error);
      stats.memory = { total: 0, used: 0, free: 0, usage: 0, process: {} };
    }

    // GPU Information (Apple Silicon)
    try {
      const graphics = await si.graphics();
      const gpuInfo = graphics.controllers.find(gpu => 
        gpu.vendor.toLowerCase().includes('apple') || 
        gpu.model.toLowerCase().includes('apple')
      );
      
      if (gpuInfo) {
        stats.gpu = {
          model: gpuInfo.model || 'Apple GPU',
          vendor: gpuInfo.vendor || 'Apple',
          vram: gpuInfo.vram || 0,
          utilization: gpuInfo.utilizationGpu || 0,
          memoryUsage: gpuInfo.memoryUsed || 0,
          temperature: gpuInfo.temperatureGpu || 0
        };
      } else {
        stats.gpu = {
          model: 'Apple Silicon GPU',
          vendor: 'Apple',
          vram: 0,
          utilization: 0,
          memoryUsage: 0,
          temperature: 0
        };
      }
    } catch (error) {
      console.error('GPU stats error:', error);
      stats.gpu = { model: 'Unknown', vendor: 'Unknown', vram: 0, utilization: 0 };
    }

    // Process-specific stats
    try {
      const processStats = await pidusage(process.pid);
      stats.process = {
        cpu: Math.round(processStats.cpu * 100) / 100,
        memory: Math.round(processStats.memory / 1024 / 1024), // MB
        pid: process.pid,
        uptime: Math.round(process.uptime())
      };
    } catch (error) {
      console.error('Process stats error:', error);
      stats.process = { cpu: 0, memory: 0, pid: process.pid, uptime: 0 };
    }

    // System Load
    try {
      const load = os.loadavg();
      stats.system = {
        load1: Math.round(load[0] * 100) / 100,
        load5: Math.round(load[1] * 100) / 100,
        load15: Math.round(load[2] * 100) / 100,
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      };
    } catch (error) {
      console.error('System load error:', error);
      stats.system = { load1: 0, load5: 0, load15: 0 };
    }

    // Add timestamp
    stats.timestamp = Date.now();

    return stats;
  }

  updateHistory(stats) {
    const timestamp = new Date().toLocaleTimeString();
    
    // Add new data points
    this.history.cpu.push(stats.cpu.usage);
    this.history.memory.push(stats.memory.usage);
    this.history.gpu.push(stats.gpu.utilization);
    this.history.timestamp.push(timestamp);
    
    // Keep only the last N data points
    if (this.history.cpu.length > this.historySize) {
      this.history.cpu.shift();
      this.history.memory.shift();
      this.history.gpu.shift();
      this.history.timestamp.shift();
    }
  }

  async getSystemInfo() {
    try {
      const systemInfo = await si.system();
      const cpuInfo = await si.cpu();
      const memInfo = await si.mem();
      const osInfo = await si.osInfo();
      
      return {
        system: {
          manufacturer: systemInfo.manufacturer || 'Unknown',
          model: systemInfo.model || 'Unknown',
          serial: systemInfo.serial || 'Unknown'
        },
        cpu: {
          manufacturer: cpuInfo.manufacturer || 'Unknown',
          brand: cpuInfo.brand || 'Unknown',
          family: cpuInfo.family || 'Unknown',
          model: cpuInfo.model || 'Unknown',
          cores: cpuInfo.cores || 0,
          physicalCores: cpuInfo.physicalCores || 0,
          processors: cpuInfo.processors || 0,
          speed: cpuInfo.speed || 0
        },
        memory: {
          total: Math.round(memInfo.total / 1024 / 1024 / 1024), // GB
          swapTotal: Math.round(memInfo.swaptotal / 1024 / 1024 / 1024) // GB
        },
        os: {
          platform: osInfo.platform || 'Unknown',
          distro: osInfo.distro || 'Unknown',
          release: osInfo.release || 'Unknown',
          arch: osInfo.arch || 'Unknown',
          hostname: osInfo.hostname || 'Unknown'
        }
      };
    } catch (error) {
      console.error('System info error:', error);
      return {
        system: { manufacturer: 'Unknown', model: 'Unknown' },
        cpu: { brand: 'Unknown', cores: 0 },
        memory: { total: 0 },
        os: { platform: 'Unknown', distro: 'Unknown' }
      };
    }
  }

  getResourceWarnings(stats) {
    const warnings = [];
    
    // CPU warnings
    if (stats.cpu.usage > 90) {
      warnings.push({
        type: 'cpu',
        level: 'critical',
        message: 'CPU usage is very high (>90%)'
      });
    } else if (stats.cpu.usage > 70) {
      warnings.push({
        type: 'cpu',
        level: 'warning',
        message: 'CPU usage is high (>70%)'
      });
    }
    
    // Memory warnings
    if (stats.memory.usage > 90) {
      warnings.push({
        type: 'memory',
        level: 'critical',
        message: 'Memory usage is very high (>90%)'
      });
    } else if (stats.memory.usage > 80) {
      warnings.push({
        type: 'memory',
        level: 'warning',
        message: 'Memory usage is high (>80%)'
      });
    }
    
    // Temperature warnings
    if (stats.cpu.temperature > 85) {
      warnings.push({
        type: 'temperature',
        level: 'critical',
        message: 'CPU temperature is very high (>85°C)'
      });
    } else if (stats.cpu.temperature > 75) {
      warnings.push({
        type: 'temperature',
        level: 'warning',
        message: 'CPU temperature is high (>75°C)'
      });
    }
    
    return warnings;
  }
}

module.exports = SystemMonitor;