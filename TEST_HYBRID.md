# Hybrid Teams Bot - Test Guide

## 🚀 What's New

I've created a **hybrid version** that combines both approaches:

1. **Azure Communication Services (ACS)** - Your existing working setup
2. **Microsoft Graph API** - Full meeting integration (simulated for now)

## 🎯 How to Test

### 1. Start the Hybrid Server
```bash
npm run start-hybrid
```

### 2. Open the Hybrid Interface
Go to: `http://localhost:3000/index-hybrid.html`

### 3. Test Both Modes

**ACS Mode (Default):**
- ✅ Join meeting via ACS (your existing working method)
- ✅ Local TTS (text-to-speech)
- ✅ Simulated transcription
- ✅ Web-based chat interface

**Graph API Mode (Toggle):**
- 🔄 Click "Switch to Graph API Mode"
- ✅ Simulated Graph API meeting join
- ✅ Simulated voice responses
- ✅ Simulated audio transcription
- ✅ Same chat interface

## 🔧 Key Features

### Mode Toggle
- **Toggle Button**: Switch between ACS and Graph API modes
- **Visual Indicator**: Mode badge shows current approach
- **Status Updates**: Clear logging of which mode is active

### ACS Mode (Working Now)
- Uses your existing Azure Communication Services setup
- Bot joins meetings via ACS
- Local TTS plays in your browser
- Simulated transcription for testing

### Graph API Mode (Simulated)
- Simulates Microsoft Graph API calls
- Shows what full integration would look like
- Ready for real Graph API implementation
- Same chat interface and user experience

## 🎤 Voice & Transcription Testing

### ACS Mode:
1. Join a meeting
2. Click "Test Voice" - TTS plays locally
3. Click "Start Transcription" - Simulated transcription starts
4. Check chat for transcription messages

### Graph API Mode:
1. Switch to Graph API mode
2. Join a meeting (simulated)
3. Click "Test Voice" - Simulated voice response
4. Click "Start Transcription" - Simulated transcription
5. Check chat for transcription messages

## 🔄 Next Steps for Real Graph API

To enable real Microsoft Graph API integration:

1. **Configure Azure AD App** with required permissions
2. **Update token acquisition** in `getAccessToken()` function
3. **Replace simulated calls** with real Graph API calls
4. **Test with real meeting audio streams**

## 📁 Files Created

- `server-hybrid.js` - Hybrid server with both ACS and Graph API endpoints
- `client/main-hybrid.js` - Hybrid client with mode switching
- `public/index-hybrid.html` - Hybrid interface
- `build-hybrid.mjs` - Build script for hybrid version

## 🧪 Test Results Expected

**ACS Mode:**
- ✅ Bot joins meeting successfully
- ✅ Local TTS works
- ✅ Chat interface appears
- ✅ Simulated transcription works

**Graph API Mode:**
- ✅ Mode switching works
- ✅ Simulated Graph API responses
- ✅ Same chat interface
- ✅ Ready for real implementation

This hybrid approach lets you test both methods and see the difference between current ACS limitations and future Graph API capabilities!

