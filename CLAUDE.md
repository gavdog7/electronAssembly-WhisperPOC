# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Live Whisper Transcription Electron app.

## Project Overview

This is an Electron-based application that captures system audio on macOS and performs real-time transcription using OpenAI's Whisper models. The app features a comprehensive system resource monitoring dashboard and supports all major Whisper models with selectable quality/performance tradeoffs.

## Quick Setup for M3 MacBook

### Prerequisites
- macOS (tested on M3 MacBook 2023)
- Node.js 18+ and npm
- Python 3.9+
- Xcode Command Line Tools: `xcode-select --install`

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

# 3. Build native audio capture module
npm run rebuild

# 4. Start the application
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

### Troubleshooting
```bash
# Check audio devices
node check-audio-devices.js

# Verify native module build
ls -la build/Release/audio_capture.node

# Test Python Whisper installation
source venv/bin/activate && python -c "import whisper; print('Whisper installed successfully')"
```

## Architecture

### Core Components
- **Main Process** (`main.js`): Electron app management, IPC coordination
- **System Monitor** (`system-monitor.js`): Real-time resource monitoring (CPU, RAM, GPU)
- **Transcription Worker** (`transcription-worker.js`): Python bridge for Whisper integration
- **Audio Capture** (`audio-capture.js`): Enhanced streaming audio capture
- **Whisper Service** (`whisper_service.py`): Python service for model management and transcription
- **Renderer Process** (`renderer.js`, `renderer.html`): UI with live transcription and resource dashboard

### System Resource Monitoring
The app provides real-time monitoring of:
- **CPU Usage**: System-wide and per-process
- **Memory Usage**: Total system memory and app-specific usage
- **GPU Utilization**: Apple Silicon GPU usage
- **Temperature**: CPU temperature monitoring
- **Resource Warnings**: Color-coded alerts for high resource usage

### Whisper Model Support
| Model | Size | Speed | Memory Usage | Best For |
|-------|------|-------|--------------|----------|
| tiny.en | ~39MB | Fastest | Low (~200MB) | Quick demos, low-power devices |
| tiny | ~39MB | Fastest | Low (~200MB) | Multilingual quick transcription |
| base.en | ~74MB | Fast | Medium (~300MB) | Balanced English transcription |
| base | ~74MB | Fast | Medium (~300MB) | Balanced multilingual |
| small.en | ~244MB | Medium | High (~500MB) | Better English accuracy |
| small | ~244MB | Medium | High (~500MB) | Better multilingual accuracy |
| medium.en | ~769MB | Slow | Very High (~1GB) | High-quality English |
| medium | ~769MB | Slow | Very High (~1GB) | High-quality multilingual |
| large-v3 | ~1550MB | Slowest | Maximum (~2GB) | Best possible accuracy |

## macOS Permissions

### Required Permissions
1. **Microphone Access**: Required for all audio recording
2. **Screen Recording Access**: Required for system audio capture on newer macOS versions

### Permission Setup
- App will automatically request permissions on first run
- Manual setup: System Preferences → Security & Privacy → Privacy
- May require app bundle for proper permission dialogs

### System Audio vs Microphone
- **System Audio**: Computer's output (music, videos, calls)
- **Microphone**: External microphone input
- Test: Play music, mute microphone, start recording - if music appears = success

## Performance Optimization

### M3 MacBook Optimizations
- Uses Apple's Metal Performance Shaders when available
- GPU acceleration for compatible Whisper models
- Optimized memory management for large models
- Real-time resource monitoring prevents system overload

### Resource Management
- **Model Loading**: Models cached in memory for faster switching
- **Audio Buffering**: 2-second chunks for optimal transcription
- **Memory Cleanup**: Automatic cleanup of temporary audio files
- **Process Monitoring**: Real-time monitoring prevents resource exhaustion

### Performance Recommendations
- Start with `tiny.en` or `base.en` for testing
- Monitor resource usage before switching to larger models
- Use `small.en` for balanced performance/accuracy
- Reserve `large-v3` for final production transcription

## Testing & Verification

### Basic Functionality Test
1. Grant microphone and screen recording permissions
2. Select `tiny.en` model (fastest)
3. Click "Start Transcription"
4. Play audio (YouTube, music, etc.)
5. Verify transcription appears in real-time
6. Check resource monitoring shows reasonable usage

### Performance Testing
1. Test each model size with system monitoring
2. Verify resource warnings appear appropriately
3. Test model switching during transcription
4. Monitor temperature and memory usage

### Expected Resource Usage (M3 MacBook)
- **tiny.en**: <10% CPU, <500MB RAM
- **base.en**: 10-20% CPU, <800MB RAM  
- **small.en**: 20-40% CPU, <1.2GB RAM
- **medium.en**: 40-70% CPU, <2GB RAM
- **large-v3**: 70-90% CPU, <3GB RAM

## Common Issues

### Build Problems
- **Missing Xcode tools**: Run `xcode-select --install`
- **Python version conflicts**: Use Python 3.9+ in virtual environment
- **Node-gyp errors**: Update to latest Node.js LTS

### Audio Capture Issues
- **No system audio**: Check screen recording permission
- **Silent recordings**: Verify audio routing and permissions
- **Mock mode**: Native module not built - run `npm run rebuild`

### Transcription Issues
- **Python errors**: Ensure virtual environment activated
- **Model loading fails**: Check available memory and disk space
- **Slow transcription**: Use smaller model or check system resources

### Performance Issues
- **High CPU usage**: Switch to smaller model (tiny.en, base.en)
- **Memory warnings**: Close other applications or use smaller model
- **Temperature warnings**: Reduce transcription duration or model size

## Development Guidelines

### Adding New Features
1. Use TodoWrite tool for task planning
2. Follow existing patterns in codebase
3. Test with system resource monitoring
4. Document performance impact

### Code Patterns
- IPC communication between main and renderer processes
- Event-driven architecture for real-time updates
- Graceful fallbacks for missing native modules
- Resource monitoring integration

### Testing Approach
- Test on actual M3 hardware when possible
- Monitor resource usage during development
- Verify permissions handling
- Test model switching scenarios

## Deployment Notes

### For End Users
- Package includes all native modules and Python dependencies
- Self-contained installation (no external Python required)
- Automatic permission request flow
- Resource monitoring helps users understand system impact

### Distribution
- Use `npm run build` for distributable packages
- Include proper macOS code signing for Gatekeeper
- Bundle Python virtual environment if needed
- Document minimum system requirements

## Next Steps

### Potential Enhancements
1. **Voice Activity Detection**: Only transcribe when speech detected
2. **Speaker Diarization**: Identify different speakers
3. **Export Features**: Save transcriptions to file
4. **Live Editing**: Edit transcriptions in real-time
5. **Meeting Integration**: Calendar integration for automatic recording
6. **Custom Models**: Support for fine-tuned Whisper models

### Performance Improvements
1. **Streaming Optimization**: Reduce latency with smaller chunks
2. **Model Caching**: Pre-load models for instant switching
3. **GPU Acceleration**: Leverage Apple Silicon GPU fully
4. **Background Processing**: Improve UI responsiveness