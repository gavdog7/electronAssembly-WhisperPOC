const path = require('path');
const fs = require('fs');

let nativeModule;
try {
  nativeModule = require('./build/Release/audio_capture');
} catch (error) {
  console.warn('Native audio capture module not available, using mock implementation');
  nativeModule = null;
}

// Mock implementation for testing when native module is not available
class MockAudioCapture {
  constructor() {
    this.isRecording = false;
    this.currentFile = null;
    this.isStreaming = false;
    this.streamCallback = null;
    this.streamInterval = null;
  }
  
  start(outputPath = './recording.wav') {
    if (this.isRecording) {
      throw new Error('Already recording');
    }
    
    // Create a mock WAV file
    const wavHeader = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x24, 0x00, 0x00, 0x00, // File size - 8
      0x57, 0x41, 0x56, 0x45, // "WAVE"
      0x66, 0x6D, 0x74, 0x20, // "fmt "
      0x10, 0x00, 0x00, 0x00, // Subchunk1Size = 16
      0x01, 0x00,             // AudioFormat = 1 (PCM)
      0x02, 0x00,             // NumChannels = 2
      0x44, 0xAC, 0x00, 0x00, // SampleRate = 44100
      0x10, 0xB1, 0x02, 0x00, // ByteRate = 176400
      0x04, 0x00,             // BlockAlign = 4
      0x10, 0x00,             // BitsPerSample = 16
      0x64, 0x61, 0x74, 0x61, // "data"
      0x00, 0x00, 0x00, 0x00  // Subchunk2Size = 0
    ]);
    
    fs.writeFileSync(outputPath, wavHeader);
    this.isRecording = true;
    this.currentFile = outputPath;
    
    console.log('Mock recording started:', outputPath);
    return true;
  }
  
  stop() {
    if (!this.isRecording) {
      return false;
    }
    
    this.isRecording = false;
    const filePath = this.currentFile;
    this.currentFile = null;
    
    console.log('Mock recording stopped:', filePath);
    return filePath;
  }
  
  startStreaming(callback) {
    if (this.isStreaming) {
      throw new Error('Already streaming');
    }
    
    this.isStreaming = true;
    this.streamCallback = callback;
    
    // Generate mock audio chunks every 2 seconds
    this.streamInterval = setInterval(() => {
      if (this.streamCallback) {
        // Create a mock audio chunk with some dummy data
        const mockAudioChunk = this.generateMockAudioChunk();
        this.streamCallback(mockAudioChunk);
      }
    }, 2000);
    
    console.log('Mock streaming started');
    return true;
  }
  
  stopStreaming() {
    if (!this.isStreaming) {
      return false;
    }
    
    this.isStreaming = false;
    this.streamCallback = null;
    
    if (this.streamInterval) {
      clearInterval(this.streamInterval);
      this.streamInterval = null;
    }
    
    console.log('Mock streaming stopped');
    return true;
  }
  
  generateMockAudioChunk() {
    // Generate a mock WAV file with some basic audio data
    const sampleRate = 44100;
    const duration = 2; // 2 seconds
    const numSamples = sampleRate * duration;
    const numChannels = 2;
    
    // Create WAV header
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + numSamples * numChannels * 2, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20);
    wavHeader.writeUInt16LE(numChannels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * numChannels * 2, 28);
    wavHeader.writeUInt16LE(numChannels * 2, 32);
    wavHeader.writeUInt16LE(16, 34);
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(numSamples * numChannels * 2, 40);
    
    // Create mock audio data (sine wave)
    const audioData = Buffer.alloc(numSamples * numChannels * 2);
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1; // 440Hz sine wave
      const value = Math.round(sample * 32767);
      
      // Write stereo samples
      audioData.writeInt16LE(value, i * 4);
      audioData.writeInt16LE(value, i * 4 + 2);
    }
    
    return Buffer.concat([wavHeader, audioData]);
  }
}

class AudioCapture {
  constructor() {
    if (nativeModule) {
      this.isRecording = false;
      this.currentFile = null;
      this.isStreaming = false;
      this.streamCallback = null;
    } else {
      // Use mock implementation
      this.mock = new MockAudioCapture();
    }
  }
  
  start(outputPath = './recording.wav') {
    if (this.mock) {
      return this.mock.start(outputPath);
    }
    
    if (!nativeModule) {
      throw new Error('Native audio module not available');
    }
    
    if (this.isRecording) {
      throw new Error('Already recording');
    }
    
    const success = nativeModule.startRecording(outputPath);
    if (success) {
      this.isRecording = true;
      this.currentFile = outputPath;
      return true;
    }
    
    throw new Error('Failed to start recording');
  }
  
  stop() {
    if (this.mock) {
      return this.mock.stop();
    }
    
    if (!nativeModule || !this.isRecording) {
      return false;
    }
    
    nativeModule.stopRecording();
    this.isRecording = false;
    
    const filePath = this.currentFile;
    this.currentFile = null;
    
    return filePath;
  }
  
  startStreaming(callback) {
    if (this.mock) {
      return this.mock.startStreaming(callback);
    }
    
    if (!nativeModule) {
      throw new Error('Native audio module not available');
    }
    
    if (this.isStreaming) {
      throw new Error('Already streaming');
    }
    
    this.isStreaming = true;
    this.streamCallback = callback;
    
    // Check if native module supports streaming
    if (nativeModule.startStreaming) {
      // Use native streaming with callback
      const success = nativeModule.startStreaming((audioData) => {
        if (this.streamCallback) {
          this.streamCallback(audioData);
        }
      });
      
      if (success) {
        return true;
      } else {
        this.isStreaming = false;
        this.streamCallback = null;
        throw new Error('Failed to start native streaming');
      }
    } else {
      // Fallback: use chunked recording approach
      this.startChunkedRecording();
      return true;
    }
  }
  
  stopStreaming() {
    if (this.mock) {
      return this.mock.stopStreaming();
    }
    
    if (!this.isStreaming) {
      return false;
    }
    
    this.isStreaming = false;
    this.streamCallback = null;
    
    if (nativeModule.stopStreaming) {
      nativeModule.stopStreaming();
    } else {
      // Stop chunked recording
      this.stopChunkedRecording();
    }
    
    return true;
  }
  
  startChunkedRecording() {
    // Fallback method: record chunks and process them
    const chunkDuration = 2000; // 2 seconds
    let chunkCounter = 0;
    
    const recordChunk = () => {
      if (!this.isStreaming) return;
      
      const chunkFilename = `./temp_chunk_${chunkCounter++}_${Date.now()}.wav`;
      
      try {
        // Start recording this chunk
        const success = nativeModule.startRecording(chunkFilename);
        if (success) {
          // Stop recording after duration
          setTimeout(() => {
            if (this.isStreaming) {
              nativeModule.stopRecording();
              
              // Read the chunk file and send to callback
              if (fs.existsSync(chunkFilename)) {
                const chunkData = fs.readFileSync(chunkFilename);
                if (this.streamCallback) {
                  this.streamCallback(chunkData);
                }
                
                // Clean up chunk file
                fs.unlinkSync(chunkFilename);
              }
              
              // Schedule next chunk
              setTimeout(recordChunk, 100); // Small gap between chunks
            }
          }, chunkDuration);
        }
      } catch (error) {
        console.error('Chunk recording error:', error);
      }
    };
    
    // Start first chunk
    recordChunk();
  }
  
  stopChunkedRecording() {
    // Stop any ongoing recording
    if (nativeModule && this.isRecording) {
      nativeModule.stopRecording();
      this.isRecording = false;
    }
  }
}

module.exports = AudioCapture;