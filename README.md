# Teams Bot with Gemini Live Integration

A Microsoft Teams bot application that integrates with Gemini 2.0 Flash Live API for voice-to-voice conversations.

## Features

- **Teams Meeting Integration**: Join Microsoft Teams meetings using Azure Communication Services (ACS)
- **Gemini Live API**: Real-time voice-to-voice conversations with Gemini 2.0 Flash Live
- **Audio Processing**: Record meeting audio, transcribe with OpenAI Whisper, and generate responses
- **Multiple Modes**: ACS mode for basic functionality, Graph API simulation for advanced features
- **Web Interface**: Easy-to-use web interface for testing and control

## Project Structure

```
├── client/                    # Client-side JavaScript files
│   ├── main.js               # Original ACS client
│   ├── main-hybrid.js        # Hybrid client with mode switching
│   └── main-graph.js         # Graph API client
├── public/                   # Static web files
│   ├── index.html            # Main interface
│   ├── index-hybrid.html     # Hybrid interface
│   ├── gemini-test.html      # Gemini Live test page
│   └── bot_voice.wav        # Bot voice audio file
├── server.js                 # Main server
├── server-hybrid.js          # Hybrid server with OpenAI integration
├── server-gemini-live-websocket.js  # Gemini Live WebSocket server
├── gemini-live-audio.py      # Python Gemini Live audio server
└── requirements.txt          # Python dependencies
```

## Setup

### Prerequisites

- Node.js (v18+)
- Python 3.11+
- Microsoft Teams meeting link
- Azure Communication Services connection string
- OpenAI API key
- Gemini API key

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd teams_app/bot_with_cursor
   ```

2. **Install Node.js dependencies**:
   ```bash
   npm install
   ```

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**:
   Create a `.env` file with:
   ```
   ACS_CONNECTION_STRING=your_acs_connection_string
   OPENAI_API_KEY=your_openai_api_key
   GEMINI_API_KEY=your_gemini_api_key
   ```

## Usage

### Basic Teams Bot (ACS Mode)

```bash
npm run dev
```

Open `http://localhost:3000` and join a Teams meeting.

### Hybrid Mode (ACS + OpenAI)

```bash
npm run dev-hybrid
```

Open `http://localhost:3000/index-hybrid.html` for the hybrid interface.

### Gemini Live Integration

1. **Start Python Gemini Live server**:
   ```bash
   python gemini-live-audio.py
   ```

2. **Start Node.js proxy**:
   ```bash
   npm run start-gemini-audio
   ```

3. **Test Gemini Live**:
   Open `http://localhost:3000/gemini-test.html`

## Available Scripts

- `npm run dev` - Start basic ACS server
- `npm run dev-hybrid` - Start hybrid server with OpenAI
- `npm run start-gemini-ws` - Start Gemini Live WebSocket server
- `npm run start-gemini-audio` - Start Gemini Live audio proxy
- `npm run start-gemini-python` - Start Python Gemini Live server

## Features by Mode

### ACS Mode
- Join Teams meetings
- Basic audio injection
- Chat simulation
- Voice test functionality

### Hybrid Mode
- All ACS features
- OpenAI Whisper transcription
- OpenAI GPT response generation
- OpenAI TTS voice responses
- Real-time wake word detection
- Audio recording and saving

### Gemini Live Mode
- Direct voice-to-voice with Gemini
- Real-time audio streaming
- Natural conversation flow
- Audio response playback

## Troubleshooting

### Common Issues

1. **Microphone Permission Denied**
   - Ensure browser allows microphone access
   - Check browser permissions for localhost

2. **Audio Not Playing in Meeting**
   - Verify ACS connection string
   - Check audio device permissions
   - Try different audio formats

3. **Gemini Live Not Responding**
   - Verify Gemini API key
   - Check Python server is running
   - Ensure proper audio format (16kHz, mono, PCM)

### Debug Files

The system creates debug files in the `gemini-responses/` directory:
- `gemini-raw-*.json` - Raw Gemini API responses
- `gemini-text-*.txt` - Text responses
- `gemini-audio-*.wav` - Audio responses

## API Keys Required

- **Azure Communication Services**: For Teams meeting integration
- **OpenAI**: For Whisper transcription, GPT responses, and TTS
- **Gemini**: For Live API voice-to-voice conversations

## License

This project is for educational and development purposes.