const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const config = require('./config');

class RecordingManager extends EventEmitter {
  constructor() {
    super();
    this.isRecording = false;
    this.currentRecordingFile = null;
    this.audioBuffer = [];
    this.sampleRate = 16000;
    this.channels = 1;
    this.bitDepth = 16;
    this.bytesPerSample = 2;
    this.totalSamples = 0;
    this.recordingStartTime = null;
    this.recordingDuration = 0;
    this.tempFileName = null;
    this.finalFileName = null;
  }

  startRecording() {
    if (this.isRecording) {
      console.warn('Recording already in progress');
      return false;
    }

    try {
      console.log('Starting WAV recording...');
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.tempFileName = `recording_${timestamp}_temp.wav`;
      this.finalFileName = `recording_${timestamp}.wav`;
      
      this.currentRecordingFile = config.getRecordingPath(this.tempFileName);
      
      // Initialize recording state
      this.isRecording = true;
      this.audioBuffer = [];
      this.totalSamples = 0;
      this.recordingStartTime = Date.now();
      this.recordingDuration = 0;
      
      // Create WAV file header placeholder
      this.createWavFileHeader();
      
      this.emit('recordingStarted', {
        filename: this.finalFileName,
        path: this.currentRecordingFile,
        timestamp: this.recordingStartTime
      });
      
      console.log(`Recording started: ${this.currentRecordingFile}`);
      return true;
      
    } catch (error) {
      console.error('Error starting recording:', error);
      this.emit('error', error);
      return false;
    }
  }

  stopRecording() {
    if (!this.isRecording) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      console.log('Stopping WAV recording...');
      
      this.isRecording = false;
      this.recordingDuration = Date.now() - this.recordingStartTime;
      
      // Finalize the WAV file
      this.finalizeWavFile();
      
      // Move from temp to final filename
      const finalPath = config.getRecordingPath(this.finalFileName);
      fs.renameSync(this.currentRecordingFile, finalPath);
      
      const recordingInfo = {
        filename: this.finalFileName,
        path: finalPath,
        duration: this.recordingDuration,
        sampleRate: this.sampleRate,
        channels: this.channels,
        bitDepth: this.bitDepth,
        totalSamples: this.totalSamples,
        fileSize: fs.statSync(finalPath).size,
        startTime: this.recordingStartTime,
        endTime: Date.now()
      };
      
      this.emit('recordingStopped', recordingInfo);
      
      console.log(`Recording saved: ${finalPath}`);
      console.log(`Duration: ${(this.recordingDuration / 1000).toFixed(2)}s`);
      console.log(`Samples: ${this.totalSamples}`);
      
      // Reset state
      this.resetRecordingState();
      
      return recordingInfo;
      
    } catch (error) {
      console.error('Error stopping recording:', error);
      this.emit('error', error);
      return null;
    }
  }

  addAudioData(audioData) {
    if (!this.isRecording) {
      return false;
    }

    try {
      // Convert audio data to 16-bit PCM if needed
      let pcmData;
      if (audioData instanceof Float32Array) {
        pcmData = this.convertFloat32ToPCM16(audioData);
      } else if (audioData instanceof Int16Array) {
        pcmData = audioData;
      } else {
        // Assume it's already in the correct format
        pcmData = new Int16Array(audioData);
      }

      // Add to buffer for potential processing
      this.audioBuffer.push(pcmData);
      
      // Write directly to file for continuous recording
      const buffer = Buffer.from(pcmData.buffer);
      fs.appendFileSync(this.currentRecordingFile, buffer);
      
      this.totalSamples += pcmData.length;
      
      // Emit progress updates periodically
      if (this.totalSamples % (this.sampleRate * 5) === 0) { // Every 5 seconds
        this.emit('recordingProgress', {
          duration: Date.now() - this.recordingStartTime,
          samples: this.totalSamples,
          fileSize: fs.statSync(this.currentRecordingFile).size
        });
      }
      
      return true;
      
    } catch (error) {
      console.error('Error adding audio data to recording:', error);
      this.emit('error', error);
      return false;
    }
  }

  createWavFileHeader() {
    // Create initial WAV header with placeholder values
    const header = Buffer.alloc(44);
    
    // RIFF header
    header.write('RIFF', 0);
    header.writeUInt32LE(36, 4); // Placeholder file size
    header.write('WAVE', 8);
    
    // fmt chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // PCM format
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(this.sampleRate * this.channels * this.bytesPerSample, 28); // byte rate
    header.writeUInt16LE(this.channels * this.bytesPerSample, 32); // block align
    header.writeUInt16LE(this.bitDepth, 34);
    
    // data chunk
    header.write('data', 36);
    header.writeUInt32LE(0, 40); // Placeholder data size
    
    fs.writeFileSync(this.currentRecordingFile, header);
  }

  finalizeWavFile() {
    try {
      const stats = fs.statSync(this.currentRecordingFile);
      const fileSize = stats.size;
      const dataSize = fileSize - 44;
      
      // Update file size in header
      const fd = fs.openSync(this.currentRecordingFile, 'r+');
      
      // Update RIFF chunk size
      const riffSizeBuffer = Buffer.alloc(4);
      riffSizeBuffer.writeUInt32LE(fileSize - 8, 0);
      fs.writeSync(fd, riffSizeBuffer, 0, 4, 4);
      
      // Update data chunk size
      const dataSizeBuffer = Buffer.alloc(4);
      dataSizeBuffer.writeUInt32LE(dataSize, 0);
      fs.writeSync(fd, dataSizeBuffer, 0, 4, 40);
      
      fs.closeSync(fd);
      
      console.log(`WAV file finalized: ${fileSize} bytes, ${dataSize} bytes of audio data`);
      
    } catch (error) {
      console.error('Error finalizing WAV file:', error);
      throw error;
    }
  }

  convertFloat32ToPCM16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = sample * 32767;
    }
    return int16Array;
  }

  resetRecordingState() {
    this.currentRecordingFile = null;
    this.audioBuffer = [];
    this.totalSamples = 0;
    this.recordingStartTime = null;
    this.recordingDuration = 0;
    this.tempFileName = null;
    this.finalFileName = null;
  }

  getRecordingInfo() {
    if (!this.isRecording) {
      return null;
    }

    return {
      isRecording: this.isRecording,
      filename: this.tempFileName,
      path: this.currentRecordingFile,
      duration: Date.now() - this.recordingStartTime,
      totalSamples: this.totalSamples,
      sampleRate: this.sampleRate,
      channels: this.channels,
      bitDepth: this.bitDepth,
      fileSize: fs.existsSync(this.currentRecordingFile) ? fs.statSync(this.currentRecordingFile).size : 0
    };
  }

  listRecordings() {
    try {
      const recordingsDir = config.app.recordingSavePath;
      if (!fs.existsSync(recordingsDir)) {
        return [];
      }

      const files = fs.readdirSync(recordingsDir)
        .filter(file => file.endsWith('.wav') && !file.includes('_temp'))
        .map(file => {
          const filePath = path.join(recordingsDir, file);
          const stats = fs.statSync(filePath);
          return {
            filename: file,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
        .sort((a, b) => b.created - a.created);

      return files;
    } catch (error) {
      console.error('Error listing recordings:', error);
      return [];
    }
  }

  deleteRecording(filename) {
    try {
      const filePath = config.getRecordingPath(filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Recording deleted: ${filename}`);
        this.emit('recordingDeleted', { filename, path: filePath });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting recording:', error);
      this.emit('error', error);
      return false;
    }
  }

  // Static utility methods
  static getWavFileInfo(filePath) {
    try {
      const buffer = fs.readFileSync(filePath, { start: 0, end: 44 });
      
      if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Invalid WAV file format');
      }
      
      const fileSize = buffer.readUInt32LE(4) + 8;
      const channels = buffer.readUInt16LE(22);
      const sampleRate = buffer.readUInt32LE(24);
      const bitDepth = buffer.readUInt16LE(34);
      const dataSize = buffer.readUInt32LE(40);
      
      const duration = dataSize / (sampleRate * channels * (bitDepth / 8));
      
      return {
        fileSize,
        channels,
        sampleRate,
        bitDepth,
        dataSize,
        duration
      };
    } catch (error) {
      console.error('Error reading WAV file info:', error);
      return null;
    }
  }
}

module.exports = RecordingManager;