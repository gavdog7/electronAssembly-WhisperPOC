const { ipcRenderer } = require('electron');

// UI Elements
const elements = {
  // Recording controls
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  statusIndicator: document.getElementById('statusIndicator'),
  recordingIndicator: document.getElementById('recordingIndicator'),
  transcriptionStats: document.getElementById('transcriptionStats'),
  
  // Whisper panel
  whisperModelSelect: document.getElementById('whisperModelSelect'),
  whisperStatus: document.getElementById('whisperStatus'),
  whisperTranscriptionDisplay: document.getElementById('whisperTranscriptionDisplay'),
  
  // AssemblyAI panel
  assemblyaiModelSelect: document.getElementById('assemblyaiModelSelect'),
  assemblyaiStatus: document.getElementById('assemblyaiStatus'),
  assemblyaiTranscriptionDisplay: document.getElementById('assemblyaiTranscriptionDisplay'),
  
  // Permissions
  checkPermBtn: document.getElementById('checkPermBtn'),
  micStatus: document.getElementById('micStatus'),
  screenStatus: document.getElementById('screenStatus'),
  
  // System monitoring
  cpuValue: document.getElementById('cpuValue'),
  memoryValue: document.getElementById('memoryValue'),
  gpuValue: document.getElementById('gpuValue'),
  processValue: document.getElementById('processValue'),
  resourceWarnings: document.getElementById('resourceWarnings'),
  platformInfo: document.getElementById('platformInfo'),
  currentWhisperModel: document.getElementById('currentWhisperModel'),
  currentAssemblyAIModel: document.getElementById('currentAssemblyAIModel'),
  resourceChart: document.getElementById('resourceChart')
};

// Application state
let isRecording = false;
let currentSession = null;
let whisperModel = 'tiny.en';
let assemblyaiModel = 'best';

// Transcription counters
let whisperCount = 0;
let assemblyaiCount = 0;

// Continuous transcripts
let whisperTranscript = '';
let assemblyaiTranscript = '';

// System stats history for charts
let systemStatsHistory = {
  cpu: [],
  memory: [],
  gpu: [],
  timestamps: []
};

// Chart context
const chartCtx = elements.resourceChart.getContext('2d');

// Model information
const whisperModels = {
  'tiny.en': { name: 'Tiny (English)', size: '~39MB', speed: 'Fastest', memory: 'Low' },
  'base.en': { name: 'Base (English)', size: '~74MB', speed: 'Fast', memory: 'Medium' },
  'small.en': { name: 'Small (English)', size: '~244MB', speed: 'Medium', memory: 'High' },
  'medium.en': { name: 'Medium (English)', size: '~769MB', speed: 'Slow', memory: 'Very High' },
  'large-v3': { name: 'Large-v3', size: '~1550MB', speed: 'Slowest', memory: 'Maximum' }
};

const assemblyaiModels = {
  'best': { name: 'Best', accuracy: 'Highest', speed: 'Slower' },
  'nano': { name: 'Nano', accuracy: 'Good', speed: 'Fastest' }
};

// Initialize the application
function initialize() {
  setupEventListeners();
  checkPermissions();
  loadSystemInfo();
  updateModelDisplay();
  clearBothPanels();
}

function setupEventListeners() {
  // Model selection
  elements.whisperModelSelect.addEventListener('change', (e) => {
    whisperModel = e.target.value;
    updateModelDisplay();
    
    if (isRecording) {
      ipcRenderer.invoke('switch-whisper-model', whisperModel);
    }
  });
  
  elements.assemblyaiModelSelect.addEventListener('change', (e) => {
    assemblyaiModel = e.target.value;
    updateModelDisplay();
    
    if (isRecording) {
      ipcRenderer.invoke('switch-assemblyai-model', assemblyaiModel);
    }
  });
  
  // Control buttons
  elements.startBtn.addEventListener('click', startRecording);
  elements.stopBtn.addEventListener('click', stopRecording);
  elements.clearBtn.addEventListener('click', clearBothPanels);
  elements.checkPermBtn.addEventListener('click', checkPermissions);
  
  // IPC listeners
  setupIpcListeners();
}

function setupIpcListeners() {
  // System monitoring
  ipcRenderer.on('system-stats', (event, stats) => {
    updateSystemMonitor(stats);
  });
  
  // Whisper transcription results
  ipcRenderer.on('whisper-transcription', (event, result) => {
    addWhisperTranscription(result);
  });
  
  // AssemblyAI transcription results
  ipcRenderer.on('assemblyai-transcription', (event, result) => {
    addAssemblyAITranscription(result);
  });
  
  // Service status updates
  ipcRenderer.on('whisper-status', (event, status) => {
    updateWhisperStatus(status);
  });
  
  ipcRenderer.on('assemblyai-status', (event, status) => {
    updateAssemblyAIStatus(status);
  });
  
  // Recording status updates
  ipcRenderer.on('recording-status', (event, status) => {
    updateRecordingStatus(status);
  });
  
  // Session updates
  ipcRenderer.on('session-started', (event, sessionInfo) => {
    currentSession = sessionInfo;
    console.log('Session started:', sessionInfo.sessionId);
  });
  
  ipcRenderer.on('session-ended', (event, sessionInfo) => {
    console.log('Session ended:', sessionInfo.sessionId);
    currentSession = null;
  });
  
  // Error handling
  ipcRenderer.on('error', (event, error) => {
    console.error('Application error:', error);
    updateStatus(`Error: ${error.message}`, 'status-ready');
  });
}

function updateModelDisplay() {
  const whisperInfo = whisperModels[whisperModel];
  const assemblyaiInfo = assemblyaiModels[assemblyaiModel];
  
  elements.currentWhisperModel.textContent = whisperInfo.name;
  elements.currentAssemblyAIModel.textContent = assemblyaiInfo.name;
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

async function startRecording() {
  try {
    updateStatus('Initializing...', 'status-processing');
    elements.startBtn.disabled = true;
    
    // Start the dual transcription session
    const result = await ipcRenderer.invoke('start-dual-transcription', {
      whisperModel: whisperModel,
      assemblyaiModel: assemblyaiModel
    });
    
    if (result.success) {
      isRecording = true;
      elements.startBtn.disabled = true;
      elements.stopBtn.disabled = false;
      
      updateStatus('Recording & Transcribing', 'status-recording');
      updateRecordingIndicator('Recording WAV file', 'status-recording');
      
      // Clear transcripts for new session
      whisperCount = 0;
      assemblyaiCount = 0;
      whisperTranscript = '';
      assemblyaiTranscript = '';
      
      // Update initial panel content
      updateTranscriptionPanels();
      updateTranscriptionStats();
      
    } else {
      elements.startBtn.disabled = false;
      updateStatus(`Error: ${result.error}`, 'status-ready');
    }
  } catch (error) {
    console.error('Start recording error:', error);
    elements.startBtn.disabled = false;
    updateStatus('Failed to start recording', 'status-ready');
  }
}

async function stopRecording() {
  try {
    updateStatus('Stopping...', 'status-processing');
    elements.stopBtn.disabled = true;
    
    const result = await ipcRenderer.invoke('stop-dual-transcription');
    
    if (result.success) {
      isRecording = false;
      elements.startBtn.disabled = false;
      elements.stopBtn.disabled = true;
      
      updateStatus('Ready', 'status-ready');
      updateRecordingIndicator('No Recording', 'status-ready');
      
      // Show session summary
      if (result.sessionInfo) {
        showSessionSummary(result.sessionInfo);
      }
      
    } else {
      updateStatus(`Error: ${result.error}`, 'status-ready');
      elements.stopBtn.disabled = false;
    }
  } catch (error) {
    console.error('Stop recording error:', error);
    updateStatus('Failed to stop recording', 'status-ready');
    elements.stopBtn.disabled = false;
  }
}

function clearBothPanels() {
  whisperCount = 0;
  assemblyaiCount = 0;
  whisperTranscript = '';
  assemblyaiTranscript = '';
  
  elements.whisperTranscriptionDisplay.innerHTML = `
    <div style="text-align: center; color: #6c757d; margin-top: 50px;">
      ${isRecording ? 'Listening for audio...' : 'Whisper transcription will appear here'}
    </div>
  `;
  
  elements.assemblyaiTranscriptionDisplay.innerHTML = `
    <div style="text-align: center; color: #6c757d; margin-top: 50px;">
      ${isRecording ? 'Connecting to AssemblyAI...' : 'AssemblyAI transcription will appear here'}
    </div>
  `;
  
  updateTranscriptionStats();
}

function addWhisperTranscription(result) {
  whisperCount++;
  
  if (result.text && result.text.trim()) {
    if (whisperCount === 1) {
      whisperTranscript = '';
    }
    
    // Add text with proper spacing
    const textToAdd = result.text.trim();
    if (textToAdd) {
      whisperTranscript += (whisperTranscript ? ' ' : '') + textToAdd;
    }
  }
  
  updateWhisperPanel(result);
  updateTranscriptionStats();
}

function addAssemblyAITranscription(result) {
  assemblyaiCount++;
  
  if (result.text && result.text.trim()) {
    if (assemblyaiCount === 1) {
      assemblyaiTranscript = '';
    }
    
    // Handle partial vs final transcripts
    if (result.type === 'final') {
      const textToAdd = result.text.trim();
      if (textToAdd) {
        assemblyaiTranscript += (assemblyaiTranscript ? ' ' : '') + textToAdd;
      }
    }
  }
  
  updateAssemblyAIPanel(result);
  updateTranscriptionStats();
}

function updateWhisperPanel(result) {
  const timestamp = new Date(result.timestamp).toLocaleTimeString();
  const confidence = result.confidence ? Math.round(result.confidence * 100) : 'N/A';
  
  let displayText = whisperTranscript;
  
  // For partial results, show them in gray
  if (result.type === 'partial' && result.text) {
    displayText += ` <span style="color: #999; font-style: italic;">${result.text.trim()}</span>`;
  }
  
  elements.whisperTranscriptionDisplay.innerHTML = `
    <div class="continuous-transcript">
      ${displayText || '<em style="color: #6c757d;">Listening for audio...</em>'}
    </div>
    <div class="transcript-metadata">
      <small style="color: #6c757d; font-size: 11px;">
        Latest: ${timestamp} | Model: ${result.model || whisperModel} | Confidence: ${confidence}%
        ${result.processingTime ? ` | Processing: ${result.processingTime.toFixed(2)}s` : ''}
      </small>
    </div>
  `;
  
  // Auto-scroll to bottom
  elements.whisperTranscriptionDisplay.scrollTop = elements.whisperTranscriptionDisplay.scrollHeight;
}

function updateAssemblyAIPanel(result) {
  const timestamp = new Date(result.timestamp).toLocaleTimeString();
  const confidence = result.confidence ? Math.round(result.confidence * 100) : 'N/A';
  
  let displayText = assemblyaiTranscript;
  
  // For partial results, show them in gray
  if (result.type === 'partial' && result.text) {
    displayText += ` <span style="color: #999; font-style: italic;">${result.text.trim()}</span>`;
  }
  
  elements.assemblyaiTranscriptionDisplay.innerHTML = `
    <div class="continuous-transcript">
      ${displayText || '<em style="color: #6c757d;">Connecting to AssemblyAI...</em>'}
    </div>
    <div class="transcript-metadata">
      <small style="color: #6c757d; font-size: 11px;">
        Latest: ${timestamp} | Model: ${result.model || assemblyaiModel} | Confidence: ${confidence}%
        ${result.latency ? ` | Latency: ${result.latency}ms` : ''}
      </small>
    </div>
  `;
  
  // Auto-scroll to bottom
  elements.assemblyaiTranscriptionDisplay.scrollTop = elements.assemblyaiTranscriptionDisplay.scrollHeight;
}

function updateTranscriptionPanels() {
  if (!isRecording) return;
  
  if (whisperCount === 0) {
    elements.whisperTranscriptionDisplay.innerHTML = `
      <div style="text-align: center; color: #6c757d; margin-top: 50px;">
        <em>Listening for audio...</em>
      </div>
    `;
  }
  
  if (assemblyaiCount === 0) {
    elements.assemblyaiTranscriptionDisplay.innerHTML = `
      <div style="text-align: center; color: #6c757d; margin-top: 50px;">
        <em>Connecting to AssemblyAI...</em>
      </div>
    `;
  }
}

function updateTranscriptionStats() {
  if (isRecording) {
    elements.transcriptionStats.textContent = 
      `Whisper: ${whisperCount} segments | AssemblyAI: ${assemblyaiCount} segments`;
  } else {
    elements.transcriptionStats.textContent = 
      `Session total - Whisper: ${whisperCount} | AssemblyAI: ${assemblyaiCount}`;
  }
}

function updateWhisperStatus(status) {
  let statusText = 'Unknown';
  let statusClass = 'whisper';
  
  switch (status.status) {
    case 'ready':
      statusText = 'Ready';
      break;
    case 'loading':
      statusText = 'Loading Model';
      break;
    case 'transcribing':
      statusText = 'Transcribing';
      break;
    case 'error':
      statusText = 'Error';
      statusClass = 'error';
      break;
  }
  
  elements.whisperStatus.textContent = statusText;
  elements.whisperStatus.className = `panel-status ${statusClass}`;
}

function updateAssemblyAIStatus(status) {
  let statusText = 'Unknown';
  let statusClass = 'assemblyai';
  
  switch (status.status) {
    case 'disconnected':
      statusText = 'Disconnected';
      break;
    case 'connecting':
      statusText = 'Connecting';
      break;
    case 'connected':
      statusText = 'Connected';
      break;
    case 'recording':
      statusText = 'Streaming';
      break;
    case 'error':
      statusText = status.message || 'Error';
      statusClass = 'error';
      
      // Show billing message in panel if needed
      if (status.message && status.message.includes('billing')) {
        elements.assemblyaiTranscriptionDisplay.innerHTML = `
          <div style="text-align: center; color: #dc3545; margin-top: 50px;">
            <strong>⚠️ AssemblyAI Streaming Requires Billing</strong><br><br>
            <small style="color: #6c757d;">
              Real-time streaming requires adding a credit card to your AssemblyAI account.<br>
              Visit <a href="https://app.assemblyai.com/" target="_blank">app.assemblyai.com</a> to add billing.<br><br>
              <strong>Whisper transcription will continue normally.</strong>
            </small>
          </div>
        `;
      }
      break;
  }
  
  elements.assemblyaiStatus.textContent = statusText;
  elements.assemblyaiStatus.className = `panel-status ${statusClass}`;
}

function updateRecordingIndicator(message, className) {
  elements.recordingIndicator.textContent = message;
  elements.recordingIndicator.className = `status-indicator ${className}`;
}

function updateStatus(message, className) {
  elements.statusIndicator.textContent = message;
  elements.statusIndicator.className = `status-indicator ${className}`;
}

function showSessionSummary(sessionInfo) {
  const duration = ((sessionInfo.endTime - sessionInfo.startTime) / 1000).toFixed(1);
  
  updateTranscriptionStats();
  
  console.log(`Session completed: ${sessionInfo.sessionId}`);
  console.log(`Duration: ${duration}s`);
  console.log(`Recording: ${sessionInfo.recordingFile || 'N/A'}`);
  console.log(`Whisper segments: ${whisperCount}`);
  console.log(`AssemblyAI segments: ${assemblyaiCount}`);
}

// System monitoring functions (reused from original)
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