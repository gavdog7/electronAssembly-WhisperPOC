# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Dual Transcription Electron app.

## Project Overview

This is an Electron-based application that provides **side-by-side real-time transcription comparison** between OpenAI's Whisper (local) and AssemblyAI (cloud) services. The app captures system audio, records it as WAV files, and provides dual live transcription with persistent storage for later analysis.

## Key Features

### Dual Transcription System
- **Left Panel**: Whisper local transcription with all model options (tiny.en to large-v3)
- **Right Panel**: AssemblyAI cloud transcription with streaming WebSocket API
- **Side-by-side comparison** in real-time
- **Synchronized audio capture** - both services receive identical audio stream

### Audio Recording & Storage
- **Continuous WAV recording** for each session
- **Persistent transcript storage** with session management
- **Export capabilities** (JSON, TXT, CSV formats)
- **Automatic file naming** with timestamps

### Performance Monitoring
- **Real-time system resource monitoring** (CPU, RAM, GPU)
- **Latency tracking** for both services
- **Connection status** indicators
- **Error handling and reconnection** logic

## Quick Setup

### Prerequisites
- macOS (tested on M3 MacBook 2023)
- Node.js 18+ and npm
- Python 3.9+
- Xcode Command Line Tools: `xcode-select --install`
- **AssemblyAI API Key** (configured in environment)

### Installation Steps
```bash
# 1. Install Node.js dependencies
npm install

# 2. Set up Python virtual environment and install Whisper
npm run setup-python
# OR manually:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Configure AssemblyAI API key
cp .env.example .env
# Edit .env and add your AssemblyAI API key

# 4. Build native audio capture module
npm run rebuild

# 5. Start the application
npm start
```

## Essential Commands

### Development
```bash
# Start the app
npm start

# Rebuild native modules (after updates)
npm run rebuild

# Set up Python environment
npm run setup-python

# Build distributable
npm run build
```

### Configuration
```bash
# Check configuration
cat .env

# Verify API key
grep ASSEMBLYAI_API_KEY .env
```

## Architecture

### Core Components
- **Main Process** (`main.js`): Service coordination and IPC management
- **Dual UI** (`renderer.js`, `renderer.html`): Side-by-side transcription interface
- **Whisper Service** (`whisper_service.py`): Local Whisper model management
- **AssemblyAI Service** (`assemblyai-service.js`): WebSocket streaming to AssemblyAI
- **Recording Manager** (`recording-manager.js`): WAV file recording and storage
- **Transcript Storage** (`transcript-storage.js`): Session-based transcript persistence
- **Audio Capture** (`audio-capture.js`): Unified audio streaming to both services
- **System Monitor** (`system-monitor.js`): Real-time resource monitoring

### Service Integration
```
Audio Input → Audio Capture
            ├─ Whisper (Local)      → Transcript Storage → UI Left Panel
            ├─ AssemblyAI (Cloud)   → Transcript Storage → UI Right Panel
            └─ WAV Recording        → File Storage
```

### Data Flow
1. **Audio Capture**: System audio captured via native module
2. **Dual Streaming**: Same audio sent to both Whisper and AssemblyAI
3. **Recording**: Continuous WAV file recording
4. **Transcription**: Real-time results from both services
5. **Storage**: Persistent session storage with metadata
6. **UI Updates**: Live updates to dual-panel interface

## Model Support

### Whisper Models (Local)
| Model | Size | Speed | Memory Usage | Best For |
|-------|------|-------|--------------|----------|
| tiny.en | ~39MB | Fastest | Low (~200MB) | Quick demos, low-power devices |
| base.en | ~74MB | Fast | Medium (~300MB) | Balanced English transcription |
| small.en | ~244MB | Medium | High (~500MB) | Better English accuracy |
| medium.en | ~769MB | Slow | Very High (~1GB) | High-quality English |
| large-v3 | ~1550MB | Slowest | Maximum (~2GB) | Best possible accuracy |

### AssemblyAI Models (Cloud)
| Model | Accuracy | Speed | Best For |
|-------|----------|-------|----------|
| best | Highest | Slower | Maximum accuracy transcription |
| nano | Good | Fastest | Real-time streaming applications |

## Configuration

### Environment Variables (.env)
```bash
# Required: AssemblyAI API Key
ASSEMBLYAI_API_KEY=your_api_key_here

# Optional: Model Configuration
ASSEMBLYAI_MODEL=best
ASSEMBLYAI_LANGUAGE_CODE=en

# Optional: Storage Paths
RECORDING_SAVE_PATH=./recordings
TRANSCRIPT_SAVE_PATH=./transcripts
```

### Configuration Management
- **API Key**: Stored securely in `.env` file
- **Model Selection**: Configurable per session
- **Storage Paths**: Customizable via environment variables
- **Validation**: Automatic configuration validation on startup

## Usage Workflow

### Basic Operation
1. **Grant Permissions**: Microphone and screen recording access
2. **Select Models**: Choose Whisper and AssemblyAI models
3. **Start Recording**: Click "Start Recording & Transcription"
4. **Compare Results**: View side-by-side transcription in real-time
5. **Stop Recording**: Click "Stop Recording" to save session

### Session Management
- **Automatic Session Creation**: Each recording creates a new session
- **WAV File Storage**: Continuous recording saved with timestamp
- **Transcript Storage**: All transcriptions saved with metadata
- **Export Options**: JSON, TXT, CSV formats available

## File Structure

### Generated Files
```
recordings/
├── recording_2024-01-15T10-30-00-000Z.wav
└── recording_2024-01-15T11-15-30-000Z.wav

transcripts/
├── session_2024-01-15T10-30-00-000Z.json
└── session_2024-01-15T11-15-30-000Z.json
```

### Session Data Structure
```json
{
  "sessionId": "session_2024-01-15T10-30-00-000Z",
  "startTime": 1705318200000,
  "endTime": 1705318500000,
  "whisperModel": "small.en",
  "assemblyaiModel": "best",
  "recordingFile": "recording_2024-01-15T10-30-00-000Z.wav",
  "whisperTranscripts": [...],
  "assemblyaiTranscripts": [...],
  "metadata": {
    "duration": 300000,
    "totalWhisperSegments": 45,
    "totalAssemblyAISegments": 52,
    "averageWhisperConfidence": 0.89,
    "averageAssemblyAIConfidence": 0.92
  }
}
```

## Performance Optimization

### Resource Management
- **Whisper Model Caching**: Models loaded once and reused
- **AssemblyAI Connection Pooling**: WebSocket connection reuse
- **Memory Management**: Automatic cleanup of temporary data
- **Audio Buffer Optimization**: Efficient streaming without dropouts

### Performance Recommendations
- **Start with smaller models**: Use `tiny.en` for initial testing
- **Monitor system resources**: Check CPU and memory usage
- **AssemblyAI latency**: `nano` model for lowest latency
- **Whisper accuracy**: `small.en` or higher for better accuracy

## Testing & Verification

### Basic Functionality Test
1. Grant microphone and screen recording permissions
2. Configure AssemblyAI API key in `.env`
3. Select models (suggested: Whisper `tiny.en`, AssemblyAI `nano`)
4. Click "Start Recording & Transcription"
5. Play audio (YouTube, music, speech)
6. Verify both panels show transcription
7. Check system resource usage is reasonable
8. Stop recording and verify files are saved

### Comparison Testing
1. Use different model combinations
2. Test with various audio types (speech, music, multiple speakers)
3. Compare transcription accuracy between services
4. Measure latency differences
5. Test with long recordings (>5 minutes)

## Troubleshooting

### Common Issues

#### Configuration Problems
- **AssemblyAI API key not set**: Check `.env` file exists and contains valid key
- **Missing dependencies**: Run `npm install` and `npm run setup-python`
- **Native module build errors**: Run `npm run rebuild`

#### Connection Issues
- **AssemblyAI connection failed**: Verify API key and internet connection
- **Whisper model loading slow**: Use smaller model or check available memory
- **Audio capture silent**: Verify permissions and audio routing

#### Performance Issues
- **High CPU usage**: Switch to smaller Whisper model (tiny.en, base.en)
- **Memory warnings**: Close other applications or use smaller models
- **AssemblyAI latency high**: Switch to `nano` model

### Error Handling
- **Automatic reconnection**: AssemblyAI service auto-reconnects on failure
- **Graceful fallbacks**: If one service fails, the other continues
- **Session recovery**: Partial sessions saved even if app crashes
- **Comprehensive logging**: Check console for detailed error information

## Development Guidelines

### Adding New Features
1. Use TodoWrite tool for task planning
2. Follow existing service patterns
3. Test with both services simultaneously
4. Update error handling appropriately
5. Document performance impact

### Code Patterns
- **Event-driven architecture**: Services communicate via events
- **IPC coordination**: Main process coordinates all services
- **Error boundaries**: Each service handles its own errors
- **Resource cleanup**: Proper cleanup on app shutdown

## Deployment Notes

### Distribution
- Bundle includes all native modules and dependencies
- Python virtual environment bundled for Whisper
- AssemblyAI requires internet connection
- Self-contained WAV and transcript storage

### System Requirements
- **Memory**: 2GB minimum, 4GB recommended for larger models
- **Storage**: 1GB for models, additional space for recordings
- **Network**: Internet connection required for AssemblyAI
- **Permissions**: Microphone and screen recording access

## Next Steps

### Potential Enhancements
1. **Batch Analysis**: Compare saved recordings with different models
2. **Real-time Metrics**: Live accuracy and performance comparison
3. **Voice Activity Detection**: Only transcribe when speech detected
4. **Speaker Diarization**: Identify different speakers in transcripts
5. **Custom Model Support**: Integration with fine-tuned models
6. **Advanced Export**: PDF reports with comparison analysis

### Performance Improvements
1. **WebAssembly Whisper**: Faster local processing
2. **Smart Model Selection**: Automatic model recommendation
3. **Adaptive Quality**: Adjust quality based on system resources
4. **Background Processing**: Non-blocking model switching