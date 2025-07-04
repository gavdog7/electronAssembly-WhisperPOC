const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

class Config {
  constructor() {
    this.loadConfig();
  }

  loadConfig() {
    // AssemblyAI Configuration
    this.assemblyAI = {
      apiKey: process.env.ASSEMBLYAI_API_KEY || '',
      model: process.env.ASSEMBLYAI_MODEL || 'universal-streaming',
      languageCode: process.env.ASSEMBLYAI_LANGUAGE_CODE || 'en',
      websocketUrl: 'wss://streaming.assemblyai.com/v3/ws',
      sampleRate: 16000,
      wordBoost: [],
      encoding: 'pcm_s16le'
    };

    // Application Configuration
    this.app = {
      defaultProvider: process.env.DEFAULT_PROVIDER || 'whisper',
      recordingSavePath: process.env.RECORDING_SAVE_PATH || path.join(__dirname, 'recordings'),
      transcriptSavePath: process.env.TRANSCRIPT_SAVE_PATH || path.join(__dirname, 'transcripts')
    };

    // Whisper Configuration (existing)
    this.whisper = {
      models: [
        { value: 'tiny.en', label: 'Tiny (English) - Fastest, Basic accuracy', size: '~39MB', speed: 'Fastest', memory: 'Low' },
        { value: 'base.en', label: 'Base (English) - Fast, Good accuracy', size: '~74MB', speed: 'Fast', memory: 'Medium' },
        { value: 'small.en', label: 'Small (English) - Medium speed, Better accuracy', size: '~244MB', speed: 'Medium', memory: 'High' },
        { value: 'medium.en', label: 'Medium (English) - Slow, High accuracy', size: '~769MB', speed: 'Slow', memory: 'Very High' },
        { value: 'large-v3', label: 'Large-v3 - Slowest, Best accuracy', size: '~1550MB', speed: 'Slowest', memory: 'Maximum' }
      ],
      defaultModel: 'tiny.en'
    };

    // AssemblyAI Model Configuration
    this.assemblyAIModels = [
      { value: 'universal-streaming', label: 'Universal-Streaming - Latest model, ~300ms latency', accuracy: 'High', speed: 'Fast', cost: '$0.15/hour' }
    ];

    // Create necessary directories
    this.createDirectories();
  }

  createDirectories() {
    const dirs = [
      this.app.recordingSavePath,
      this.app.transcriptSavePath
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  isAssemblyAIConfigured() {
    return this.assemblyAI.apiKey && this.assemblyAI.apiKey.length > 0;
  }

  validateConfig() {
    const issues = [];

    if (!this.isAssemblyAIConfigured()) {
      issues.push('AssemblyAI API key is not configured. Please set ASSEMBLYAI_API_KEY in .env file.');
    }

    return {
      isValid: issues.length === 0,
      issues: issues
    };
  }

  getRecordingPath(filename) {
    return path.join(this.app.recordingSavePath, filename);
  }

  getTranscriptPath(filename) {
    return path.join(this.app.transcriptSavePath, filename);
  }
}

module.exports = new Config();