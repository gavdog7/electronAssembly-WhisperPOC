const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const config = require('./config');

class TranscriptStorage extends EventEmitter {
  constructor() {
    super();
    this.currentSession = null;
    this.transcripts = {
      whisper: [],
      assemblyai: []
    };
    this.sessionStartTime = null;
    this.sessionId = null;
  }

  startSession() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.sessionId = `session_${timestamp}`;
    this.sessionStartTime = Date.now();
    
    this.currentSession = {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      endTime: null,
      whisperModel: null,
      assemblyaiModel: null,
      recordingFile: null,
      whisperTranscripts: [],
      assemblyaiTranscripts: [],
      metadata: {
        totalWhisperSegments: 0,
        totalAssemblyAISegments: 0,
        averageWhisperConfidence: 0,
        averageAssemblyAIConfidence: 0,
        whisperLatency: [],
        assemblyaiLatency: [],
        errors: []
      }
    };

    // Reset current transcripts
    this.transcripts.whisper = [];
    this.transcripts.assemblyai = [];

    console.log(`Transcript session started: ${this.sessionId}`);
    this.emit('sessionStarted', { sessionId: this.sessionId });

    return this.sessionId;
  }

  endSession() {
    if (!this.currentSession) {
      console.warn('No active transcript session to end');
      return null;
    }

    this.currentSession.endTime = Date.now();
    this.currentSession.whisperTranscripts = [...this.transcripts.whisper];
    this.currentSession.assemblyaiTranscripts = [...this.transcripts.assemblyai];

    // Calculate final metadata
    this.calculateSessionMetadata();

    // Save session to file
    const savedSession = this.saveSession(this.currentSession);

    console.log(`Transcript session ended: ${this.sessionId}`);
    this.emit('sessionEnded', { sessionId: this.sessionId, session: savedSession });

    // Reset current session
    const completedSession = { ...this.currentSession };
    this.currentSession = null;
    this.sessionId = null;
    this.sessionStartTime = null;

    return completedSession;
  }

  addWhisperTranscript(data) {
    if (!this.currentSession) {
      console.warn('No active session for Whisper transcript');
      return false;
    }

    const transcript = {
      id: `whisper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      text: data.text,
      confidence: data.confidence || null,
      type: data.type || 'final', // 'partial' or 'final'
      model: data.model || this.currentSession.whisperModel,
      latency: data.latency || null,
      metadata: data.metadata || {}
    };

    this.transcripts.whisper.push(transcript);
    this.currentSession.metadata.totalWhisperSegments++;

    if (transcript.latency) {
      this.currentSession.metadata.whisperLatency.push(transcript.latency);
    }

    this.emit('whisperTranscriptAdded', transcript);
    return transcript;
  }

  addAssemblyAITranscript(data) {
    if (!this.currentSession) {
      console.warn('No active session for AssemblyAI transcript');
      return false;
    }

    const transcript = {
      id: `assemblyai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      text: data.text,
      confidence: data.confidence || null,
      type: data.type || 'final', // 'partial' or 'final'
      model: data.model || this.currentSession.assemblyaiModel,
      latency: data.latency || null,
      messageId: data.messageId || null,
      words: data.words || [],
      metadata: data.metadata || {}
    };

    this.transcripts.assemblyai.push(transcript);
    this.currentSession.metadata.totalAssemblyAISegments++;

    if (transcript.latency) {
      this.currentSession.metadata.assemblyaiLatency.push(transcript.latency);
    }

    this.emit('assemblyaiTranscriptAdded', transcript);
    return transcript;
  }

  setModels(whisperModel, assemblyaiModel) {
    if (this.currentSession) {
      this.currentSession.whisperModel = whisperModel;
      this.currentSession.assemblyaiModel = assemblyaiModel;
    }
  }

  setRecordingFile(filename) {
    if (this.currentSession) {
      this.currentSession.recordingFile = filename;
    }
  }

  addError(service, error) {
    if (this.currentSession) {
      this.currentSession.metadata.errors.push({
        timestamp: Date.now(),
        service: service,
        error: error.message || error.toString(),
        stack: error.stack || null
      });
    }
  }

  calculateSessionMetadata() {
    if (!this.currentSession) return;

    const whisperConfidences = this.transcripts.whisper
      .filter(t => t.confidence !== null)
      .map(t => t.confidence);
    
    const assemblyaiConfidences = this.transcripts.assemblyai
      .filter(t => t.confidence !== null)
      .map(t => t.confidence);

    // Calculate average confidences
    if (whisperConfidences.length > 0) {
      this.currentSession.metadata.averageWhisperConfidence = 
        whisperConfidences.reduce((a, b) => a + b, 0) / whisperConfidences.length;
    }

    if (assemblyaiConfidences.length > 0) {
      this.currentSession.metadata.averageAssemblyAIConfidence = 
        assemblyaiConfidences.reduce((a, b) => a + b, 0) / assemblyaiConfidences.length;
    }

    // Add duration
    this.currentSession.metadata.duration = this.currentSession.endTime - this.currentSession.startTime;

    // Add transcript lengths
    this.currentSession.metadata.whisperTotalLength = this.transcripts.whisper
      .reduce((total, t) => total + (t.text ? t.text.length : 0), 0);
    
    this.currentSession.metadata.assemblyaiTotalLength = this.transcripts.assemblyai
      .reduce((total, t) => total + (t.text ? t.text.length : 0), 0);
  }

  saveSession(session) {
    try {
      const filename = `${session.sessionId}.json`;
      const filepath = config.getTranscriptPath(filename);
      
      const sessionData = {
        ...session,
        savedAt: Date.now(),
        version: '1.0'
      };

      fs.writeFileSync(filepath, JSON.stringify(sessionData, null, 2));
      
      console.log(`Session saved: ${filepath}`);
      this.emit('sessionSaved', { sessionId: session.sessionId, filepath });
      
      return sessionData;
    } catch (error) {
      console.error('Error saving session:', error);
      this.emit('error', error);
      return null;
    }
  }

  loadSession(sessionId) {
    try {
      const filename = `${sessionId}.json`;
      const filepath = config.getTranscriptPath(filename);
      
      if (!fs.existsSync(filepath)) {
        throw new Error(`Session file not found: ${filename}`);
      }

      const sessionData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      
      console.log(`Session loaded: ${sessionId}`);
      this.emit('sessionLoaded', { sessionId, session: sessionData });
      
      return sessionData;
    } catch (error) {
      console.error('Error loading session:', error);
      this.emit('error', error);
      return null;
    }
  }

  listSessions() {
    try {
      const transcriptsDir = config.app.transcriptSavePath;
      if (!fs.existsSync(transcriptsDir)) {
        return [];
      }

      const files = fs.readdirSync(transcriptsDir)
        .filter(file => file.endsWith('.json'))
        .map(file => {
          const filePath = path.join(transcriptsDir, file);
          const stats = fs.statSync(filePath);
          const sessionId = file.replace('.json', '');
          
          // Try to read basic session info
          try {
            const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return {
              sessionId,
              filename: file,
              path: filePath,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
              startTime: sessionData.startTime,
              endTime: sessionData.endTime,
              duration: sessionData.metadata?.duration || null,
              whisperModel: sessionData.whisperModel,
              assemblyaiModel: sessionData.assemblyaiModel,
              recordingFile: sessionData.recordingFile,
              transcriptCounts: {
                whisper: sessionData.whisperTranscripts?.length || 0,
                assemblyai: sessionData.assemblyaiTranscripts?.length || 0
              }
            };
          } catch (error) {
            // If we can't read the session, return basic file info
            return {
              sessionId,
              filename: file,
              path: filePath,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
              error: 'Unable to read session data'
            };
          }
        })
        .sort((a, b) => (b.startTime || b.created) - (a.startTime || a.created));

      return files;
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }

  deleteSession(sessionId) {
    try {
      const filename = `${sessionId}.json`;
      const filepath = config.getTranscriptPath(filename);
      
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        console.log(`Session deleted: ${sessionId}`);
        this.emit('sessionDeleted', { sessionId, filepath });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting session:', error);
      this.emit('error', error);
      return false;
    }
  }

  exportSession(sessionId, format = 'json') {
    try {
      const session = this.loadSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      let exportData;
      let exportFilename;
      let exportPath;

      switch (format.toLowerCase()) {
        case 'json':
          exportData = JSON.stringify(session, null, 2);
          exportFilename = `${sessionId}_export.json`;
          break;

        case 'txt':
          exportData = this.formatSessionAsText(session);
          exportFilename = `${sessionId}_export.txt`;
          break;

        case 'csv':
          exportData = this.formatSessionAsCSV(session);
          exportFilename = `${sessionId}_export.csv`;
          break;

        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      exportPath = config.getTranscriptPath(exportFilename);
      fs.writeFileSync(exportPath, exportData);

      console.log(`Session exported: ${exportPath}`);
      this.emit('sessionExported', { sessionId, format, filepath: exportPath });

      return { filepath: exportPath, filename: exportFilename };
    } catch (error) {
      console.error('Error exporting session:', error);
      this.emit('error', error);
      return null;
    }
  }

  formatSessionAsText(session) {
    let text = `Transcript Session: ${session.sessionId}\n`;
    text += `Date: ${new Date(session.startTime).toLocaleString()}\n`;
    text += `Duration: ${((session.endTime - session.startTime) / 1000).toFixed(2)}s\n`;
    text += `Whisper Model: ${session.whisperModel || 'N/A'}\n`;
    text += `AssemblyAI Model: ${session.assemblyaiModel || 'N/A'}\n`;
    text += `Recording File: ${session.recordingFile || 'N/A'}\n\n`;

    text += `=== WHISPER TRANSCRIPTION ===\n`;
    session.whisperTranscripts.forEach((t, i) => {
      text += `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.text}\n`;
    });

    text += `\n=== ASSEMBLYAI TRANSCRIPTION ===\n`;
    session.assemblyaiTranscripts.forEach((t, i) => {
      text += `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.text}\n`;
    });

    return text;
  }

  formatSessionAsCSV(session) {
    let csv = 'Service,Timestamp,Type,Text,Confidence,Latency\n';
    
    session.whisperTranscripts.forEach(t => {
      csv += `Whisper,${t.timestamp},${t.type},"${(t.text || '').replace(/"/g, '""')}",${t.confidence || ''},${t.latency || ''}\n`;
    });
    
    session.assemblyaiTranscripts.forEach(t => {
      csv += `AssemblyAI,${t.timestamp},${t.type},"${(t.text || '').replace(/"/g, '""')}",${t.confidence || ''},${t.latency || ''}\n`;
    });
    
    return csv;
  }

  getCurrentSession() {
    return this.currentSession;
  }

  getCurrentTranscripts() {
    return {
      whisper: [...this.transcripts.whisper],
      assemblyai: [...this.transcripts.assemblyai]
    };
  }

  clearCurrentTranscripts() {
    this.transcripts.whisper = [];
    this.transcripts.assemblyai = [];
    
    if (this.currentSession) {
      this.currentSession.metadata.totalWhisperSegments = 0;
      this.currentSession.metadata.totalAssemblyAISegments = 0;
    }
    
    this.emit('transcriptsCleared');
  }
}

module.exports = TranscriptStorage;