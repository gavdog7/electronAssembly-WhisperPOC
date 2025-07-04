# Dual Transcription: Whisper vs AssemblyAI

Real-time side-by-side transcription comparison between OpenAI's Whisper (local) and AssemblyAI (cloud) services.

## 🚀 Quick Start

### Prerequisites
- macOS (tested on M3 MacBook 2023)
- Node.js 18+ and npm
- Python 3.9+
- Xcode Command Line Tools: `xcode-select --install`

### Installation
```bash
# Clone the repository
git clone https://github.com/gavdog7/electronAssembly-WhisperPOC.git
cd electronAssembly-WhisperPOC

# Install dependencies
npm install

# Set up Python environment
npm run setup-python

# Configure AssemblyAI API key
cp .env.example .env
# Edit .env and add your AssemblyAI API key

# Build native modules
npm run rebuild

# Start the application
npm start
```

## ⚠️ AssemblyAI Streaming Requirements

**Important**: AssemblyAI's real-time streaming transcription requires a **paid plan** even though they offer free credits. You'll need to:

1. **Sign up** at [AssemblyAI](https://app.assemblyai.com/)
2. **Add a credit card** to enable streaming features
3. **Get free credits** ($50 worth) to start testing

### Costs
- **Streaming**: $0.47/hour of audio (reduced from $0.75/hour)
- **Free credits**: $50 on signup (≈106 hours of streaming)

### Alternative: Whisper-Only Mode
If you don't want to set up billing, the app will automatically fall back to **Whisper-only mode**:
- ✅ **Local Whisper transcription** works perfectly
- ✅ **WAV recording** still functions
- ✅ **System monitoring** continues
- ❌ **AssemblyAI panel** shows billing message

## 🎯 Features

### Dual Transcription
- **Left Panel**: Whisper (local) with models from tiny.en to large-v3
- **Right Panel**: AssemblyAI (cloud) with best/nano models
- **Side-by-side comparison** in real-time

### Recording & Storage
- **Continuous WAV recording** for each session
- **Persistent transcript storage** with session management
- **Export options**: JSON, TXT, CSV formats

### Performance Monitoring
- **Real-time system resources** (CPU, RAM, GPU)
- **Latency tracking** for both services
- **Connection status** indicators

## 🛠️ Usage

1. **Grant permissions** for microphone and screen recording
2. **Select models** for both Whisper and AssemblyAI
3. **Start recording** - both services transcribe simultaneously
4. **Compare results** in real-time
5. **Export transcripts** for analysis

## 📁 Generated Files

```
recordings/
├── recording_2024-01-15T10-30-00-000Z.wav
└── ...

transcripts/
├── session_2024-01-15T10-30-00-000Z.json
└── ...
```

## 🔧 Troubleshooting

### AssemblyAI Connection Issues
- **Error 4003**: Billing required - add credit card at app.assemblyai.com
- **Connection failed**: Check API key in `.env` file
- **No credits**: Add billing to get $50 free credits

### Whisper Issues
- **Model loading slow**: Use smaller model (tiny.en, base.en)
- **High CPU usage**: Switch to smaller model
- **Python errors**: Ensure virtual environment activated

### Audio Capture Issues
- **No system audio**: Check screen recording permission
- **Silent recordings**: Verify audio routing and permissions

## 📊 Model Comparison

### Whisper (Local)
| Model | Size | Speed | Memory | Accuracy |
|-------|------|-------|---------|----------|
| tiny.en | 39MB | Fastest | Low | Basic |
| small.en | 244MB | Medium | High | Better |
| large-v3 | 1.5GB | Slowest | Maximum | Best |

### AssemblyAI (Cloud)
| Model | Speed | Accuracy | Cost |
|-------|-------|----------|------|
| nano | Fastest | Good | $0.47/hour |
| best | Slower | Highest | $0.47/hour |

## 🎯 Perfect For

- **Accuracy comparison** between local and cloud transcription
- **Latency testing** of different approaches
- **Model evaluation** across different audio types
- **Research and development** of transcription systems

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Note**: This is a proof-of-concept for comparing transcription services. For production use, consider the costs and accuracy requirements of your specific use case.