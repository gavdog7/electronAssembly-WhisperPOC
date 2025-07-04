const { app, BrowserWindow, ipcMain, systemPreferences } = require('electron');
const path = require('path');
const AudioCapture = require('./audio-capture');
const SystemMonitor = require('./system-monitor');
const TranscriptionWorker = require('./transcription-worker');
const AssemblyAIService = require('./assemblyai-service');
const RecordingManager = require('./recording-manager');
const TranscriptStorage = require('./transcript-storage');
const config = require('./config');

// Disable sandbox for testing (not recommended for production)
app.commandLine.appendSwitch('no-sandbox');

let mainWindow;
let audioCapture;
let systemMonitor;
let transcriptionWorker;
let assemblyAIService;
let recordingManager;
let transcriptStorage;

// State management
let isRecording = false;
let currentSession = null;
let whisperModel = 'tiny.en';
let assemblyaiModel = 'best';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  
  mainWindow.loadFile('renderer.html');
  
  // Initialize all services
  initializeServices();
  
  // Request permissions and start monitoring
  requestPermissions();
  startSystemMonitoring();
}

function initializeServices() {
  console.log('=== INITIALIZING DUAL TRANSCRIPTION SERVICES ===');
  
  // Initialize core services
  audioCapture = new AudioCapture();
  systemMonitor = new SystemMonitor();
  transcriptionWorker = new TranscriptionWorker();
  assemblyAIService = new AssemblyAIService();
  recordingManager = new RecordingManager();
  transcriptStorage = new TranscriptStorage();
  
  // Set up service event handlers
  setupServiceEventHandlers();
  
  console.log('Configuration:', {
    assemblyAIConfigured: config.isAssemblyAIConfigured(),
    recordingPath: config.app.recordingSavePath,
    transcriptPath: config.app.transcriptSavePath
  });
}

function setupServiceEventHandlers() {
  // Whisper transcription results
  transcriptionWorker.onTranscriptionResult((result) => {
    // Add to transcript storage
    transcriptStorage.addWhisperTranscript({
      text: result.text,
      confidence: result.confidence,
      type: 'final',
      model: whisperModel,
      latency: result.processingTime ? result.processingTime * 1000 : null,
      metadata: result
    });
    
    // Send to renderer
    mainWindow.webContents.send('whisper-transcription', {
      ...result,
      model: whisperModel,
      timestamp: Date.now()
    });
  });
  
  // AssemblyAI event handlers
  assemblyAIService.on('partialTranscript', (result) => {
    mainWindow.webContents.send('assemblyai-transcription', {
      ...result,
      type: 'partial',
      model: assemblyaiModel
    });
  });
  
  assemblyAIService.on('finalTranscript', (result) => {
    // Add to transcript storage
    transcriptStorage.addAssemblyAITranscript({
      text: result.text,
      confidence: result.confidence,
      type: 'final',
      model: assemblyaiModel,
      latency: result.latency,
      messageId: result.messageId,
      words: result.words,
      metadata: result
    });
    
    // Send to renderer
    mainWindow.webContents.send('assemblyai-transcription', {
      ...result,
      type: 'final',
      model: assemblyaiModel
    });
  });
  
  assemblyAIService.on('status', (status) => {
    mainWindow.webContents.send('assemblyai-status', { status });
  });
  
  assemblyAIService.on('disconnected', (info) => {
    if (info.requiresBilling) {
      mainWindow.webContents.send('assemblyai-status', { 
        status: 'error', 
        message: 'Streaming requires billing setup' 
      });
    }
  });
  
  assemblyAIService.on('error', (error) => {
    console.error('AssemblyAI error:', error);
    transcriptStorage.addError('assemblyai', error);
    
    // Send specific status for billing errors
    if (error.message && error.message.includes('billing')) {
      mainWindow.webContents.send('assemblyai-status', { 
        status: 'error', 
        message: 'Requires billing setup' 
      });
    } else {
      mainWindow.webContents.send('error', { service: 'assemblyai', error });
    }
  });
  
  // Recording manager events
  recordingManager.on('recordingStarted', (info) => {
    console.log('Recording started:', info.filename);
    transcriptStorage.setRecordingFile(info.filename);
    mainWindow.webContents.send('recording-status', { 
      status: 'started', 
      filename: info.filename 
    });
  });
  
  recordingManager.on('recordingStopped', (info) => {
    console.log('Recording stopped:', info.filename);
    console.log('Duration:', (info.duration / 1000).toFixed(2), 'seconds');
    console.log('File size:', (info.fileSize / 1024 / 1024).toFixed(2), 'MB');
    
    mainWindow.webContents.send('recording-status', { 
      status: 'stopped', 
      info 
    });
  });
  
  recordingManager.on('error', (error) => {
    console.error('Recording error:', error);
    transcriptStorage.addError('recording', error);
    mainWindow.webContents.send('error', { service: 'recording', error });
  });
  
  // Transcript storage events
  transcriptStorage.on('sessionStarted', (info) => {
    console.log('Transcript session started:', info.sessionId);
    mainWindow.webContents.send('session-started', info);
  });
  
  transcriptStorage.on('sessionEnded', (info) => {
    console.log('Transcript session ended:', info.sessionId);
    mainWindow.webContents.send('session-ended', info);
  });
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

// IPC handlers for dual transcription
ipcMain.handle('start-dual-transcription', async (event, options) => {
  try {
    console.log('=== STARTING DUAL TRANSCRIPTION ===');
    console.log('Options:', options);
    
    // Validate configuration
    const configValidation = config.validateConfig();
    if (!configValidation.isValid) {
      return { 
        success: false, 
        error: `Configuration error: ${configValidation.issues.join(', ')}` 
      };
    }
    
    // Check permissions
    const micStatus = systemPreferences.getMediaAccessStatus('microphone');
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    console.log('Current permissions - Mic:', micStatus, 'Screen:', screenStatus);
    
    if (micStatus !== 'granted') {
      return { success: false, error: 'Microphone permission required' };
    }
    
    // Update models
    whisperModel = options.whisperModel || whisperModel;
    assemblyaiModel = options.assemblyaiModel || assemblyaiModel;
    
    // Start transcript session
    const sessionId = transcriptStorage.startSession();
    transcriptStorage.setModels(whisperModel, assemblyaiModel);
    currentSession = { sessionId, startTime: Date.now() };
    
    // Initialize Whisper transcription worker
    console.log('Initializing Whisper with model:', whisperModel);
    await transcriptionWorker.initialize(whisperModel);
    mainWindow.webContents.send('whisper-status', { status: 'ready' });
    
    // Initialize AssemblyAI connection
    console.log('Connecting to AssemblyAI with model:', assemblyaiModel);
    assemblyAIService.setModel(assemblyaiModel);
    await assemblyAIService.connect();
    
    // Start WAV recording
    console.log('Starting WAV recording...');
    recordingManager.startRecording();
    
    // Start audio capture with dual streaming (stop first if already running)
    if (audioCapture.isStreaming) {
      audioCapture.stopStreaming();
    }
    
    const result = audioCapture.startStreaming((audioChunk) => {
      try {
        // Send to Whisper
        transcriptionWorker.processAudioChunk(audioChunk);
        
        // Send to recording
        recordingManager.addAudioData(audioChunk);
        
        // Convert and send to AssemblyAI (only if connected and recording)
        if (assemblyAIService.isConnected && assemblyAIService.isRecording) {
          // Convert Float32Array to PCM16 for AssemblyAI
          const pcmData = AssemblyAIService.convertAudioFormat(audioChunk, 'float32', 'int16');
          assemblyAIService.sendAudio(pcmData);
        }
      } catch (error) {
        console.error('Error processing audio chunk:', error);
      }
    });
    
    if (result) {
      isRecording = true;
      
      // Start AssemblyAI recording (only if connected)
      if (assemblyAIService.isConnected) {
        assemblyAIService.startRecording();
      } else {
        console.warn('AssemblyAI not connected - continuing with Whisper only');
        mainWindow.webContents.send('assemblyai-status', { status: 'error', message: 'Connection failed - check API key and billing' });
      }
      
      console.log('Dual transcription started successfully');
      return { 
        success: true, 
        sessionId: sessionId,
        whisperModel: whisperModel,
        assemblyaiModel: assemblyaiModel
      };
    } else {
      return { success: false, error: 'Failed to start audio capture' };
    }
  } catch (error) {
    console.error('Dual transcription start error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-dual-transcription', async () => {
  try {
    console.log('=== STOPPING DUAL TRANSCRIPTION ===');
    
    // Stop audio capture
    if (audioCapture) {
      audioCapture.stopStreaming();
    }
    
    // Stop Whisper transcription
    if (transcriptionWorker) {
      await transcriptionWorker.stop();
      mainWindow.webContents.send('whisper-status', { status: 'ready' });
    }
    
    // Stop AssemblyAI recording and disconnect
    if (assemblyAIService) {
      assemblyAIService.stopRecording();
      // Keep connection open for potential future use
    }
    
    // Stop WAV recording
    const recordingInfo = recordingManager.stopRecording();
    
    // End transcript session
    const sessionInfo = transcriptStorage.endSession();
    
    isRecording = false;
    const endTime = Date.now();
    
    if (currentSession) {
      currentSession.endTime = endTime;
      currentSession.duration = endTime - currentSession.startTime;
    }
    
    console.log('Dual transcription stopped successfully');
    console.log('Session duration:', currentSession ? (currentSession.duration / 1000).toFixed(2) + 's' : 'N/A');
    
    return { 
      success: true, 
      sessionInfo: sessionInfo,
      recordingInfo: recordingInfo,
      duration: currentSession ? currentSession.duration : 0
    };
  } catch (error) {
    console.error('Stop dual transcription error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('switch-whisper-model', async (event, newModel) => {
  try {
    console.log('=== SWITCHING WHISPER MODEL ===');
    console.log('New model:', newModel);
    
    whisperModel = newModel;
    transcriptStorage.setModels(whisperModel, assemblyaiModel);
    
    if (isRecording) {
      mainWindow.webContents.send('whisper-status', { status: 'loading' });
      await transcriptionWorker.switchModel(newModel);
      mainWindow.webContents.send('whisper-status', { status: 'transcribing' });
    }
    
    return { success: true, model: newModel };
  } catch (error) {
    console.error('Whisper model switch error:', error);
    mainWindow.webContents.send('whisper-status', { status: 'error' });
    return { success: false, error: error.message };
  }
});

ipcMain.handle('switch-assemblyai-model', async (event, newModel) => {
  try {
    console.log('=== SWITCHING ASSEMBLYAI MODEL ===');
    console.log('New model:', newModel);
    
    assemblyaiModel = newModel;
    transcriptStorage.setModels(whisperModel, assemblyaiModel);
    
    assemblyAIService.setModel(newModel);
    
    return { success: true, model: newModel };
  } catch (error) {
    console.error('AssemblyAI model switch error:', error);
    return { success: false, error: error.message };
  }
});

// Existing IPC handlers (permissions, system info)
ipcMain.handle('check-permissions', async () => {
  const micStatus = systemPreferences.getMediaAccessStatus('microphone');
  const screenStatus = systemPreferences.getMediaAccessStatus('screen');
  
  return {
    microphone: micStatus,
    screen: screenStatus
  };
});

ipcMain.handle('get-system-info', async () => {
  return systemMonitor.getSystemInfo();
});

// Session management handlers
ipcMain.handle('get-session-list', async () => {
  return transcriptStorage.listSessions();
});

ipcMain.handle('export-session', async (event, sessionId, format) => {
  return transcriptStorage.exportSession(sessionId, format);
});

ipcMain.handle('delete-session', async (event, sessionId) => {
  return transcriptStorage.deleteSession(sessionId);
});

// Recording management handlers
ipcMain.handle('get-recording-list', async () => {
  return recordingManager.listRecordings();
});

ipcMain.handle('delete-recording', async (event, filename) => {
  return recordingManager.deleteRecording(filename);
});

// Configuration handlers
ipcMain.handle('get-config', async () => {
  return {
    assemblyAIConfigured: config.isAssemblyAIConfigured(),
    whisperModels: config.whisper.models,
    assemblyAIModels: config.assemblyAIModels,
    validation: config.validateConfig()
  };
});

// Cleanup on app exit
app.on('window-all-closed', () => {
  console.log('=== APPLICATION CLOSING ===');
  
  // Stop all services
  if (systemMonitor) {
    systemMonitor.stop();
  }
  
  if (transcriptionWorker) {
    transcriptionWorker.cleanup();
  }
  
  if (assemblyAIService) {
    assemblyAIService.disconnect();
  }
  
  if (recordingManager && isRecording) {
    recordingManager.stopRecording();
  }
  
  if (transcriptStorage && currentSession) {
    transcriptStorage.endSession();
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

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  if (mainWindow) {
    mainWindow.webContents.send('error', { 
      service: 'system', 
      error: { message: error.message, stack: error.stack } 
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  if (mainWindow) {
    mainWindow.webContents.send('error', { 
      service: 'system', 
      error: { message: reason.toString() } 
    });
  }
});