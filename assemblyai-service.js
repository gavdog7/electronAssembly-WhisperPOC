const { RealtimeTranscriber } = require('assemblyai');
const { EventEmitter } = require('events');
const config = require('./config');

class AssemblyAIService extends EventEmitter {
  constructor() {
    super();
    this.rt = null;
    this.isConnected = false;
    this.isRecording = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.currentModel = 'universal-streaming';
    this.sessionId = null;
    this.lastTranscript = '';
    this.connectionStartTime = null;
    this.audioDataCount = 0;
    this.averageLatency = 0;
    this.latencyReadings = [];
    this.maxLatencyReadings = 10;
  }

  async connect() {
    try {
      if (!config.isAssemblyAIConfigured()) {
        throw new Error('AssemblyAI API key not configured');
      }

      this.emit('status', 'connecting');
      console.log('Connecting to AssemblyAI with RealtimeTranscriber...');
      console.log('Using API key:', config.assemblyAI.apiKey ? `${config.assemblyAI.apiKey.substring(0, 8)}...` : 'NOT SET');

      // Create RealtimeTranscriber instance
      this.rt = new RealtimeTranscriber({
        apiKey: config.assemblyAI.apiKey,
        sampleRate: config.assemblyAI.sampleRate,
        encoding: config.assemblyAI.encoding
      });

      // Set up event listeners
      this.rt.on('open', ({ id, expires_at }) => {
        console.log('AssemblyAI RealtimeTranscriber connected');
        console.log('Session ID:', id, 'Expires at:', new Date(expires_at * 1000).toISOString());
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.connectionStartTime = Date.now();
        this.sessionId = id;
        
        this.emit('status', 'connected');
        this.emit('connected');
        this.emit('sessionStarted', { sessionId: id });
      });

      this.rt.on('transcript', (transcript) => {
        this.handleTranscript(transcript);
      });

      this.rt.on('close', (code, reason) => {
        console.log(`AssemblyAI RealtimeTranscriber closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.emit('status', 'disconnected');
        
        // Handle specific error codes
        if (code === 4003) {
          const error = new Error(`AssemblyAI Streaming requires billing setup. Code: ${code} - ${reason}`);
          this.emit('error', error);
          this.emit('disconnected', { code, reason, requiresBilling: true });
          return;
        }
        
        this.emit('disconnected', { code, reason });
        
        if (this.isRecording && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });

      this.rt.on('error', (error) => {
        console.error('AssemblyAI RealtimeTranscriber error:', error);
        this.emit('error', error);
        this.emit('status', 'error');
      });

      // Connect to AssemblyAI
      await this.rt.connect();

    } catch (error) {
      console.error('Error connecting to AssemblyAI:', error);
      this.emit('error', error);
      this.emit('status', 'error');
    }
  }

  handleTranscript(transcript) {
    const timestamp = Date.now();
    
    if (transcript.text && transcript.text.trim()) {
      const latency = timestamp - (transcript.created || timestamp);
      this.updateLatencyMetrics(latency);
      
      // Check if this is a final transcript
      if (transcript.message_type === 'FinalTranscript') {
        this.lastTranscript = transcript.text;
        this.emit('finalTranscript', {
          text: transcript.text,
          confidence: transcript.confidence || 0.9,
          timestamp: timestamp,
          latency: latency,
          words: transcript.words || [],
          messageType: transcript.message_type
        });
      } else {
        // Partial transcript
        this.emit('partialTranscript', {
          text: transcript.text,
          confidence: transcript.confidence || 0.9,
          timestamp: timestamp,
          latency: latency,
          messageType: transcript.message_type || 'PartialTranscript'
        });
      }
    }
  }

  updateLatencyMetrics(latency) {
    this.latencyReadings.push(latency);
    if (this.latencyReadings.length > this.maxLatencyReadings) {
      this.latencyReadings.shift();
    }
    
    const sum = this.latencyReadings.reduce((a, b) => a + b, 0);
    this.averageLatency = Math.round(sum / this.latencyReadings.length);
  }

  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Scheduling AssemblyAI reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      if (this.isRecording && !this.isConnected) {
        this.connect();
      }
    }, delay);
  }

  startRecording() {
    if (!this.isConnected) {
      throw new Error('Not connected to AssemblyAI');
    }

    console.log('Starting AssemblyAI recording...');
    this.isRecording = true;
    this.audioDataCount = 0;
    this.latencyReadings = [];
    this.averageLatency = 0;
    
    this.emit('status', 'recording');
    this.emit('recordingStarted');
  }

  stopRecording() {
    console.log('Stopping AssemblyAI recording...');
    this.isRecording = false;
    
    // RealtimeTranscriber automatically handles ending the session
    // No need to send explicit end message
    
    this.emit('status', 'connected');
    this.emit('recordingStopped');
  }

  sendAudio(audioData) {
    if (!this.isConnected || !this.isRecording || !this.rt) {
      return false;
    }

    try {
      // Send audio data directly to RealtimeTranscriber
      this.rt.sendAudio(audioData);
      
      this.audioDataCount++;
      return true;
    } catch (error) {
      console.error('Error sending audio to AssemblyAI:', error);
      this.emit('error', error);
      return false;
    }
  }

  setModel(model) {
    this.currentModel = model;
    console.log('AssemblyAI model set to:', model);
    this.emit('modelChanged', model);
  }

  async disconnect() {
    console.log('Disconnecting from AssemblyAI...');
    this.isRecording = false;
    this.isConnected = false;
    
    if (this.rt) {
      try {
        await this.rt.close();
      } catch (error) {
        console.error('Error closing RealtimeTranscriber:', error);
      }
      this.rt = null;
    }
    
    this.sessionId = null;
    this.emit('status', 'disconnected');
    this.emit('disconnected');
  }

  getConnectionInfo() {
    return {
      isConnected: this.isConnected,
      isRecording: this.isRecording,
      sessionId: this.sessionId,
      currentModel: this.currentModel,
      reconnectAttempts: this.reconnectAttempts,
      audioDataCount: this.audioDataCount,
      averageLatency: this.averageLatency,
      uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
    };
  }

  getStatus() {
    if (!this.isConnected) {
      return 'disconnected';
    }
    if (this.isRecording) {
      return 'recording';
    }
    return 'connected';
  }

  // Utility method to convert audio format if needed
  static convertAudioFormat(audioBuffer, fromFormat = 'float32', toFormat = 'int16') {
    if (fromFormat === 'float32' && toFormat === 'int16') {
      // Convert 32-bit float to 16-bit PCM
      const output = new Int16Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer[i]));
        output[i] = sample * 32767;
      }
      return output;
    }
    return audioBuffer;
  }
}

module.exports = AssemblyAIService;