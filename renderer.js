const { ipcRenderer } = require('electron');

// UI Elements
const elements = {
  modelSelect: document.getElementById('modelSelect'),
  modelInfo: document.getElementById('modelInfo'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  checkPermBtn: document.getElementById('checkPermBtn'),
  statusIndicator: document.getElementById('statusIndicator'),
  transcriptionDisplay: document.getElementById('transcriptionDisplay'),
  transcriptionStats: document.getElementById('transcriptionStats'),
  micStatus: document.getElementById('micStatus'),
  screenStatus: document.getElementById('screenStatus'),
  cpuValue: document.getElementById('cpuValue'),
  memoryValue: document.getElementById('memoryValue'),
  gpuValue: document.getElementById('gpuValue'),
  processValue: document.getElementById('processValue'),
  resourceWarnings: document.getElementById('resourceWarnings'),
  platformInfo: document.getElementById('platformInfo'),
  currentModel: document.getElementById('currentModel'),
  resourceChart: document.getElementById('resourceChart')
};

// Application state
let isTranscribing = false;
let transcriptionCount = 0;
let selectedModel = 'tiny.en';
let lastTranscriptionTime = 0;
let continuousTranscript = '';
let systemStatsHistory = {
  cpu: [],
  memory: [],
  gpu: [],
  timestamps: []
};

// Chart context
const chartCtx = elements.resourceChart.getContext('2d');

// Model information
const modelInfo = {
  'tiny.en': { name: 'Tiny (English)', size: '~39MB', speed: 'Fastest', memory: 'Low', accuracy: 'Basic' },
  'small.en': { name: 'Small (English)', size: '~244MB', speed: 'Medium', memory: 'High', accuracy: 'Better' }
};

// Initialize the application
function initialize() {
  setupEventListeners();
  checkPermissions();
  updateModelInfo();
  loadSystemInfo();
}

function setupEventListeners() {
  // Model selection
  elements.modelSelect.addEventListener('change', (e) => {
    selectedModel = e.target.value;
    updateModelInfo();
    
    if (isTranscribing) {
      switchModel(selectedModel);
    }
  });
  
  // Control buttons
  elements.startBtn.addEventListener('click', startTranscription);
  elements.stopBtn.addEventListener('click', stopTranscription);
  elements.clearBtn.addEventListener('click', clearTranscription);
  elements.checkPermBtn.addEventListener('click', checkPermissions);
  
  // Listen for system stats updates
  ipcRenderer.on('system-stats', (event, stats) => {
    updateSystemMonitor(stats);
  });
  
  // Listen for transcription results
  ipcRenderer.on('transcription-result', (event, result) => {
    addTranscriptionResult(result);
  });
}

function updateModelInfo() {
  const info = modelInfo[selectedModel];
  elements.modelInfo.innerHTML = `
    <strong>${info.name}</strong> - Size: ${info.size}, Speed: ${info.speed}, Memory: ${info.memory}, Accuracy: ${info.accuracy}
  `;
  elements.currentModel.textContent = info.name;
}

async function checkPermissions() {
  try {
    const permissions = await ipcRenderer.invoke('check-permissions');
    
    elements.micStatus.textContent = permissions.microphone;
    elements.micStatus.className = `permission-status ${
      permissions.microphone === 'granted' ? 'permission-granted' : 'permission-denied'
    }`;
    
    elements.screenStatus.textContent = permissions.screen;
    elements.screenStatus.className = `permission-status ${
      permissions.screen === 'granted' ? 'permission-granted' : 'permission-denied'
    }`;
    
  } catch (error) {
    console.error('Permission check error:', error);
    updateStatus('Error checking permissions', 'status-ready');
  }
}

async function loadSystemInfo() {
  try {
    const systemInfo = await ipcRenderer.invoke('get-system-info');
    elements.platformInfo.textContent = `${systemInfo.os.platform} ${systemInfo.os.arch}`;
  } catch (error) {
    console.error('System info error:', error);
    elements.platformInfo.textContent = 'Unknown';
  }
}

async function startTranscription() {
  try {
    updateStatus('Initializing...', 'status-processing');
    elements.startBtn.disabled = true;
    
    const result = await ipcRenderer.invoke('start-transcription', selectedModel);
    
    if (result.success) {
      isTranscribing = true;
      elements.startBtn.disabled = true;
      elements.stopBtn.disabled = false;
      updateStatus('Recording & Transcribing', 'status-recording');
      elements.transcriptionStats.textContent = `Model: ${result.model} | Transcriptions: 0`;
    } else {
      elements.startBtn.disabled = false;
      updateStatus(`Error: ${result.error}`, 'status-ready');
    }
  } catch (error) {
    console.error('Start transcription error:', error);
    elements.startBtn.disabled = false;
    updateStatus('Failed to start transcription', 'status-ready');
  }
}

async function stopTranscription() {
  try {
    updateStatus('Stopping...', 'status-processing');
    elements.stopBtn.disabled = true;
    
    const result = await ipcRenderer.invoke('stop-transcription');
    
    if (result.success) {
      isTranscribing = false;
      elements.startBtn.disabled = false;
      elements.stopBtn.disabled = true;
      updateStatus('Ready', 'status-ready');
    } else {
      updateStatus(`Error: ${result.error}`, 'status-ready');
    }
  } catch (error) {
    console.error('Stop transcription error:', error);
    updateStatus('Failed to stop transcription', 'status-ready');
  }
}

async function switchModel(newModel) {
  try {
    updateStatus('Switching model...', 'status-processing');
    
    const result = await ipcRenderer.invoke('switch-model', newModel);
    
    if (result.success) {
      selectedModel = result.model;
      updateStatus('Recording & Transcribing', 'status-recording');
      updateModelInfo();
    } else {
      updateStatus(`Model switch error: ${result.error}`, 'status-recording');
    }
  } catch (error) {
    console.error('Model switch error:', error);
    updateStatus('Model switch failed', 'status-recording');
  }
}

function clearTranscription() {
  elements.transcriptionDisplay.innerHTML = `
    <div style="text-align: center; color: #6c757d; margin-top: 100px;">
      Transcription cleared. ${isTranscribing ? 'Listening...' : 'Click "Start Transcription" to begin'}
    </div>
  `;
  transcriptionCount = 0;
  continuousTranscript = '';
  lastTranscriptionTime = 0;
  updateTranscriptionStats();
}

function addTranscriptionResult(result) {
  transcriptionCount++;
  
  // Clear placeholder text if this is the first transcription
  if (transcriptionCount === 1) {
    elements.transcriptionDisplay.innerHTML = '';
    continuousTranscript = '';
    lastTranscriptionTime = Date.now();
  }
  
  const currentTime = Date.now();
  const timeSinceLastTranscription = (currentTime - lastTranscriptionTime) / 1000; // in seconds
  
  // Add speaker change detection - add line break if gap > 3 seconds
  let speakerBreak = '';
  if (timeSinceLastTranscription > 3 && continuousTranscript.length > 0) {
    speakerBreak = '\n\n';
  }
  
  // Add text to continuous transcript
  const textToAdd = result.text.trim();
  if (textToAdd) {
    continuousTranscript += speakerBreak + textToAdd + ' ';
  }
  
  // Update the display with continuous transcript
  const timestamp = new Date(result.timestamp).toLocaleTimeString();
  const confidence = Math.round(result.confidence * 100);
  
  elements.transcriptionDisplay.innerHTML = `
    <div class="continuous-transcript">
      ${continuousTranscript.replace(/\n/g, '<br>')}
    </div>
    <div class="transcript-metadata">
      <small style="color: #6c757d; font-size: 11px;">
        Latest: ${timestamp} | Model: ${result.model} | Confidence: ${confidence}% | Processing: ${result.processingTime?.toFixed(2)}s
      </small>
    </div>
  `;
  
  // Auto-scroll to bottom
  elements.transcriptionDisplay.scrollTop = elements.transcriptionDisplay.scrollHeight;
  
  lastTranscriptionTime = currentTime;
  updateTranscriptionStats();
}

function updateTranscriptionStats() {
  if (isTranscribing) {
    elements.transcriptionStats.textContent = `Model: ${selectedModel} | Transcriptions: ${transcriptionCount}`;
  } else {
    elements.transcriptionStats.textContent = `Total transcriptions: ${transcriptionCount}`;
  }
}

function updateStatus(message, className) {
  elements.statusIndicator.textContent = message;
  elements.statusIndicator.className = `status-indicator ${className}`;
}

function updateSystemMonitor(stats) {
  // Update current values
  elements.cpuValue.textContent = `${stats.cpu.usage.toFixed(1)}%`;
  elements.memoryValue.textContent = `${stats.memory.usage}%`;
  elements.gpuValue.textContent = `${stats.gpu.utilization}%`;
  elements.processValue.textContent = `${stats.process.cpu.toFixed(1)}%`;
  
  // Update history for chart
  systemStatsHistory.cpu.push(stats.cpu.usage);
  systemStatsHistory.memory.push(stats.memory.usage);
  systemStatsHistory.gpu.push(stats.gpu.utilization);
  systemStatsHistory.timestamps.push(new Date().toLocaleTimeString().slice(-8));
  
  // Keep only last 60 data points
  const maxPoints = 60;
  if (systemStatsHistory.cpu.length > maxPoints) {
    systemStatsHistory.cpu.shift();
    systemStatsHistory.memory.shift();
    systemStatsHistory.gpu.shift();
    systemStatsHistory.timestamps.shift();
  }
  
  // Update chart
  updateResourceChart();
  
  // Update warnings
  updateResourceWarnings(stats);
}

function updateResourceChart() {
  const canvas = elements.resourceChart;
  const ctx = chartCtx;
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Draw grid
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  
  // Horizontal grid lines
  for (let i = 0; i <= 4; i++) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  
  // Draw data lines
  if (systemStatsHistory.cpu.length > 1) {
    drawLine(ctx, systemStatsHistory.cpu, '#007bff', width, height); // CPU - Blue
    drawLine(ctx, systemStatsHistory.memory, '#28a745', width, height); // Memory - Green
    drawLine(ctx, systemStatsHistory.gpu, '#ffc107', width, height); // GPU - Yellow
  }
  
  // Draw legend
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#007bff';
  ctx.fillText('CPU', 5, 15);
  ctx.fillStyle = '#28a745';
  ctx.fillText('RAM', 35, 15);
  ctx.fillStyle = '#ffc107';
  ctx.fillText('GPU', 65, 15);
}

function drawLine(ctx, data, color, width, height) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  data.forEach((value, index) => {
    const x = (width / (data.length - 1)) * index;
    const y = height - (height * value / 100);
    
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
}

function updateResourceWarnings(stats) {
  const warnings = [];
  
  // CPU warnings
  if (stats.cpu.usage > 90) {
    warnings.push({
      level: 'critical',
      message: `CPU usage very high (${stats.cpu.usage.toFixed(1)}%)`
    });
  } else if (stats.cpu.usage > 70) {
    warnings.push({
      level: 'warning',
      message: `CPU usage high (${stats.cpu.usage.toFixed(1)}%)`
    });
  }
  
  // Memory warnings
  if (stats.memory.usage > 90) {
    warnings.push({
      level: 'critical',
      message: `Memory usage very high (${stats.memory.usage}%)`
    });
  } else if (stats.memory.usage > 80) {
    warnings.push({
      level: 'warning',
      message: `Memory usage high (${stats.memory.usage}%)`
    });
  }
  
  // Process warnings
  if (stats.process.cpu > 50) {
    warnings.push({
      level: 'warning',
      message: `App using significant CPU (${stats.process.cpu.toFixed(1)}%)`
    });
  }
  
  // Temperature warnings
  if (stats.cpu.temperature > 85) {
    warnings.push({
      level: 'critical',
      message: `CPU temperature very high (${stats.cpu.temperature}°C)`
    });
  } else if (stats.cpu.temperature > 75) {
    warnings.push({
      level: 'warning',
      message: `CPU temperature high (${stats.cpu.temperature}°C)`
    });
  }
  
  // Update warnings display
  elements.resourceWarnings.innerHTML = '';
  warnings.forEach(warning => {
    const div = document.createElement('div');
    div.className = `resource-${warning.level}`;
    div.textContent = warning.message;
    elements.resourceWarnings.appendChild(div);
  });
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', initialize);