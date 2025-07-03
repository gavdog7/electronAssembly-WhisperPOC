const { app, BrowserWindow, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const AudioCapture = require('./audio-capture');
const SystemMonitor = require('./system-monitor');
const TranscriptionWorker = require('./transcription-worker');

// Disable sandbox for testing (not recommended for production)
app.commandLine.appendSwitch('no-sandbox');

let mainWindow;
let audioCapture;
let systemMonitor;
let transcriptionWorker;
let isTranscribing = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  mainWindow.loadFile('renderer.html');
  
  // Initialize components
  audioCapture = new AudioCapture();
  systemMonitor = new SystemMonitor();
  transcriptionWorker = new TranscriptionWorker();
  
  // Request permissions and start monitoring
  requestPermissions();
  startSystemMonitoring();
}

async function requestPermissions() {
  console.log('=== CHECKING PERMISSIONS ===');
  
  // Check microphone permission
  const micStatus = systemPreferences.getMediaAccessStatus('microphone');
  console.log('Microphone status:', micStatus);
  
  if (micStatus !== 'granted') {
    console.log('Requesting microphone permission...');
    try {
      const result = await systemPreferences.askForMediaAccess('microphone');
      console.log('Microphone permission request result:', result);
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
    }
  }
  
  // Check screen recording permission (needed for system audio on newer macOS)
  const screenStatus = systemPreferences.getMediaAccessStatus('screen');
  console.log('Screen recording status:', screenStatus);
}

function startSystemMonitoring() {
  // Start system monitoring and send updates to renderer
  systemMonitor.start((stats) => {
    mainWindow.webContents.send('system-stats', stats);
  });
}

app.whenReady().then(createWindow);

// IPC handlers for live transcription
ipcMain.handle('start-transcription', async (event, selectedModel) => {
  try {
    console.log('=== STARTING LIVE TRANSCRIPTION ===');
    console.log('Selected model:', selectedModel);
    
    // Check permissions
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log('Current permissions - Mic:', micStatus, 'Screen:', screenStatus);
    
    if (micStatus !== 'granted') {
      return { success: false, error: 'Microphone permission required' };
    }
    
    // Initialize transcription worker with selected model
    await transcriptionWorker.initialize(selectedModel);
    
    // Start audio capture with streaming
    const result = audioCapture.startStreaming((audioChunk) => {
      // Send audio chunk to transcription worker
      transcriptionWorker.processAudioChunk(audioChunk);
    });
    
    if (result) {
      isTranscribing = true;
      
      // Set up transcription result handler
      transcriptionWorker.onTranscriptionResult((transcriptionData) => {
        mainWindow.webContents.send('transcription-result', transcriptionData);
      });
      
      return { success: true, model: selectedModel };
    } else {
      return { success: false, error: 'Failed to start audio capture' };
    }
  } catch (error) {
    console.error('Transcription start error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-transcription', async () => {
  try {
    console.log('=== STOPPING LIVE TRANSCRIPTION ===');
    
    if (audioCapture) {
      audioCapture.stopStreaming();
    }
    
    if (transcriptionWorker) {
      await transcriptionWorker.stop();
    }
    
    isTranscribing = false;
    return { success: true };
  } catch (error) {
    console.error('Stop transcription error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('switch-model', async (event, newModel) => {
  try {
    console.log('=== SWITCHING MODEL ===');
    console.log('New model:', newModel);
    
    // Stop current transcription if running
    if (isTranscribing) {
      audioCapture.stopStreaming();
    }
    
    // Switch model
    await transcriptionWorker.switchModel(newModel);
    
    // Restart transcription if it was running
    if (isTranscribing) {
      audioCapture.startStreaming((audioChunk) => {
        transcriptionWorker.processAudioChunk(audioChunk);
      });
    }
    
    return { success: true, model: newModel };
  } catch (error) {
    console.error('Model switch error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-available-models', async () => {
  return {
    models: [
      { id: 'tiny.en', name: 'Tiny (English)', size: '~39MB', speed: 'Fastest', accuracy: 'Basic' },
      { id: 'tiny', name: 'Tiny (Multilingual)', size: '~39MB', speed: 'Fastest', accuracy: 'Basic' },
      { id: 'base.en', name: 'Base (English)', size: '~74MB', speed: 'Fast', accuracy: 'Good' },
      { id: 'base', name: 'Base (Multilingual)', size: '~74MB', speed: 'Fast', accuracy: 'Good' },
      { id: 'small.en', name: 'Small (English)', size: '~244MB', speed: 'Medium', accuracy: 'Better' },
      { id: 'small', name: 'Small (Multilingual)', size: '~244MB', speed: 'Medium', accuracy: 'Better' },
      { id: 'medium.en', name: 'Medium (English)', size: '~769MB', speed: 'Slow', accuracy: 'Very Good' },
      { id: 'medium', name: 'Medium (Multilingual)', size: '~769MB', speed: 'Slow', accuracy: 'Very Good' },
      { id: 'large-v3', name: 'Large v3 (Multilingual)', size: '~1550MB', speed: 'Slowest', accuracy: 'Excellent' }
    ]
  };
});

// Add permission check IPC handler
ipcMain.handle('check-permissions', async () => {
  const micStatus = systemPreferences.getMediaAccessStatus('microphone');
  const screenStatus = systemPreferences.getMediaAccessStatus('screen');
  
  return {
    microphone: micStatus,
    screen: screenStatus
  };
});

// Handle system resource requests
ipcMain.handle('get-system-info', async () => {
  return systemMonitor.getSystemInfo();
});

app.on('window-all-closed', () => {
  if (systemMonitor) {
    systemMonitor.stop();
  }
  if (transcriptionWorker) {
    transcriptionWorker.cleanup();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});