const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class TranscriptionWorker extends EventEmitter {
  constructor() {
    super();
    this.pythonShell = null;
    this.currentModel = 'tiny.en';
    this.isInitialized = false;
    this.audioQueue = [];
    this.isProcessing = false;
    this.tempDir = './temp_audio';
    this.chunkCounter = 0;
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async initialize(model = 'tiny.en') {
    try {
      console.log('Initializing transcription worker with model:', model);
      this.currentModel = model;
      
      // Create Python shell for transcription
      const options = {
        mode: 'text',
        pythonPath: './venv/bin/python3', // Use virtual environment Python
        pythonOptions: ['-u'], // Unbuffered output
        scriptPath: '.',
        args: [model]
      };
      
      // Start the Python transcription service
      this.pythonShell = new PythonShell('whisper_service.py', options);
      
      // Handle Python shell messages
      this.pythonShell.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleTranscriptionResult(data);
        } catch (error) {
          console.log('Python message:', message);
        }
      });
      
      this.pythonShell.on('error', (error) => {
        console.error('Python shell error:', error);
        this.emit('error', error);
      });
      
      this.pythonShell.on('close', () => {
        console.log('Python shell closed');
        this.isInitialized = false;
      });
      
      // Wait for initialization confirmation
      await this.waitForInitialization();
      
      this.isInitialized = true;
      console.log('Transcription worker initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize transcription worker:', error);
      throw error;
    }
  }

  async waitForInitialization() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Transcription worker initialization timeout'));
      }, 30000); // 30 second timeout
      
      const checkInit = () => {
        if (this.pythonShell) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkInit, 100);
        }
      };
      
      checkInit();
    });
  }

  async switchModel(newModel) {
    try {
      console.log('Switching to model:', newModel);
      
      if (this.pythonShell) {
        // Send model switch command
        this.pythonShell.send(JSON.stringify({
          command: 'switch_model',
          model: newModel
        }));
        
        this.currentModel = newModel;
        console.log('Model switched to:', newModel);
      } else {
        throw new Error('Transcription worker not initialized');
      }
    } catch (error) {
      console.error('Failed to switch model:', error);
      throw error;
    }
  }

  processAudioChunk(audioBuffer) {
    if (!this.isInitialized) {
      console.warn('Transcription worker not initialized, skipping audio chunk');
      return;
    }
    
    try {
      // Save audio chunk to temporary file
      const chunkFilename = `chunk_${this.chunkCounter++}_${Date.now()}.wav`;
      const chunkPath = path.join(this.tempDir, chunkFilename);
      
      fs.writeFileSync(chunkPath, audioBuffer);
      
      // Add to processing queue
      this.audioQueue.push({
        filename: chunkFilename,
        path: chunkPath,
        timestamp: Date.now()
      });
      
      // Process queue if not already processing
      if (!this.isProcessing) {
        this.processQueue();
      }
      
    } catch (error) {
      console.error('Error processing audio chunk:', error);
    }
  }

  async processQueue() {
    if (this.audioQueue.length === 0 || this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      while (this.audioQueue.length > 0) {
        const audioChunk = this.audioQueue.shift();
        
        // Send transcription request to Python
        if (this.pythonShell) {
          this.pythonShell.send(JSON.stringify({
            command: 'transcribe',
            audio_file: audioChunk.path,
            timestamp: audioChunk.timestamp
          }));
        }
        
        // Clean up old temp files (keep last 10)
        this.cleanupTempFiles();
      }
    } catch (error) {
      console.error('Error processing transcription queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  cleanupTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      const audioFiles = files.filter(f => f.endsWith('.wav')).sort();
      
      // Keep only the last 10 files
      if (audioFiles.length > 10) {
        const filesToDelete = audioFiles.slice(0, audioFiles.length - 10);
        filesToDelete.forEach(file => {
          const filePath = path.join(this.tempDir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
    } catch (error) {
      console.error('Error cleaning up temp files:', error);
    }
  }

  handleTranscriptionResult(data) {
    try {
      if (data.type === 'transcription') {
        // Emit transcription result
        this.emit('transcription', {
          text: data.text,
          timestamp: data.timestamp,
          confidence: data.confidence,
          model: this.currentModel,
          processingTime: data.processing_time
        });
      } else if (data.type === 'error') {
        console.error('Transcription error:', data.message);
        this.emit('error', new Error(data.message));
      } else if (data.type === 'status') {
        console.log('Transcription status:', data.message);
        this.emit('status', data.message);
      }
    } catch (error) {
      console.error('Error handling transcription result:', error);
    }
  }

  onTranscriptionResult(callback) {
    this.on('transcription', callback);
  }

  onError(callback) {
    this.on('error', callback);
  }

  onStatus(callback) {
    this.on('status', callback);
  }

  async stop() {
    try {
      console.log('Stopping transcription worker');
      
      if (this.pythonShell) {
        // Send stop command
        this.pythonShell.send(JSON.stringify({
          command: 'stop'
        }));
        
        // Wait a bit then terminate
        setTimeout(() => {
          if (this.pythonShell) {
            this.pythonShell.terminate();
            this.pythonShell = null;
          }
        }, 1000);
      }
      
      // Clear audio queue
      this.audioQueue = [];
      this.isProcessing = false;
      this.isInitialized = false;
      
      console.log('Transcription worker stopped');
    } catch (error) {
      console.error('Error stopping transcription worker:', error);
    }
  }

  cleanup() {
    try {
      // Clean up all temp files
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        files.forEach(file => {
          const filePath = path.join(this.tempDir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
      
      // Stop Python shell
      if (this.pythonShell) {
        this.pythonShell.terminate();
        this.pythonShell = null;
      }
    } catch (error) {
      console.error('Error cleaning up transcription worker:', error);
    }
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      currentModel: this.currentModel,
      queueLength: this.audioQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

module.exports = TranscriptionWorker;