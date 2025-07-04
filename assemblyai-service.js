const WebSocket = require('ws');
const { EventEmitter } = require('events');
const config = require('./config');

class AssemblyAIService extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.isConnected = false;
    this.isRecording = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // Longer delay for connection stability
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
      console.log('Connecting to AssemblyAI WebSocket...');

      const wsUrl = config.assemblyAI.websocketUrl;
      
      console.log('Connecting to:', wsUrl);
      console.log('Using API key:', config.assemblyAI.apiKey ? `${config.assemblyAI.apiKey.substring(0, 8)}...` : 'NOT SET');
      
      this.ws = new WebSocket(wsUrl, [], {
        headers: {
          'Authorization': config.assemblyAI.apiKey,
          'Content-Type': 'application/json'
        }
      });

      this.ws.on('open', () => {
        console.log('AssemblyAI WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.connectionStartTime = Date.now();
        
        // Send session begin message for v3 API
        const beginMessage = {
          type: 'Begin',
          sample_rate: config.assemblyAI.sampleRate,
          encoding: config.assemblyAI.encoding
        };
        
        this.ws.send(JSON.stringify(beginMessage));
        console.log('Sent Begin message:', beginMessage);
        
        this.emit('status', 'connected');
        this.emit('connected');
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing AssemblyAI message:', error);
          console.error('Raw message data:', data.toString());
          this.emit('error', error);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`AssemblyAI WebSocket closed: ${code} - ${reason}`);
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

      this.ws.on('error', (error) => {
        console.error('AssemblyAI WebSocket error:', error);
        this.emit('error', error);
        this.emit('status', 'error');
      });

    } catch (error) {
      console.error('Error connecting to AssemblyAI:', error);
      this.emit('error', error);
      this.emit('status', 'error');
    }
  }

  handleMessage(message) {
    const timestamp = Date.now();
    
    // Handle different message types for v3 API
    if (message.type === 'Begin') {
      this.sessionId = message.id;
      console.log('AssemblyAI v3 session started:', this.sessionId);
      console.log('Session expires at:', new Date(message.expires_at * 1000).toISOString());
      this.emit('sessionStarted', { sessionId: this.sessionId });
      return;
    }
    
    // Handle transcription messages
    if (message.text !== undefined) {
      const latency = timestamp - (message.created || timestamp);
      this.updateLatencyMetrics(latency);
      
      if (message.text && message.text.trim()) {
        // Check if this is a final transcript (end of turn)
        if (message.end_of_turn) {
          this.lastTranscript = message.text;
          this.emit('finalTranscript', {
            text: message.text,
            confidence: message.confidence || 0.9, // v3 doesn't always provide confidence
            timestamp: timestamp,
            latency: latency,
            turnOrder: message.turn_order,
            endOfTurn: message.end_of_turn,
            words: message.words || []
          });
        } else {
          // Partial transcript
          this.emit('partialTranscript', {
            text: message.text,
            confidence: message.confidence || 0.9,
            timestamp: timestamp,
            latency: latency,
            turnOrder: message.turn_order,
            endOfTurn: false
          });
        }
      }
      return;
    }
    
    // Handle error messages
    if (message.error) {
      console.error('AssemblyAI error message:', message.error);
      this.emit('error', new Error(message.error));
      return;
    }
    
    // Unknown message type
    console.log('Unknown AssemblyAI v3 message:', message);
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
    
    if (this.ws && this.isConnected) {
      // Send end message for v3 API
      this.ws.send(JSON.stringify({
        type: 'End'
      }));
    }
    
    this.emit('status', 'connected');
    this.emit('recordingStopped');
  }

  sendAudio(audioData) {
    if (!this.isConnected || !this.isRecording) {
      return false;
    }

    try {
      // For v3 API, send audio data as base64 string directly
      const base64Audio = Buffer.from(audioData).toString('base64');
      
      this.ws.send(base64Audio);
      
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

  disconnect() {
    console.log('Disconnecting from AssemblyAI...');
    this.isRecording = false;
    this.isConnected = false;
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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