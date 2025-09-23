# 🎤 Audio Injection Test Guide

## ✅ New Feature: Audio Injection into Meeting

I've implemented audio injection that sends TTS audio directly into the meeting through the microphone input, rather than just playing it locally.

## 🔧 How It Works

### **Audio Injection Process:**
1. **Get Microphone Access** - Requests microphone permission
2. **Create Audio Context** - Sets up Web Audio API for processing
3. **Generate TTS Audio** - Creates synthetic speech-like audio
4. **Mix Audio Streams** - Combines microphone + TTS audio
5. **Inject into Meeting** - Sends mixed audio to the meeting
6. **Cleanup** - Automatically cleans up after audio finishes

### **Fallback System:**
- If audio injection fails → Falls back to local TTS
- If microphone access denied → Falls back to local TTS
- If any error occurs → Falls back to local TTS

## 🧪 How to Test

### **Step 1: Join Meeting (ACS Mode)**
1. Open `http://localhost:3000/index-hybrid.html`
2. Enter a Teams meeting link
3. Click "Join Meeting (ACS)"
4. Wait for bot to join the meeting

### **Step 2: Test Audio Injection**
1. **Auto Test**: Bot automatically tests voice 3 seconds after joining
2. **Manual Test**: Click "Test Voice" button
3. **Check Meeting**: Other participants should hear the bot speaking

### **Step 3: Verify Audio**
- **In Meeting**: Other participants should hear synthetic speech
- **In Browser**: You should see logs about audio injection
- **In Chat**: Messages should appear about voice test

## 🎯 Expected Results

### **Successful Audio Injection:**
```
🎤 Attempting to inject audio into meeting...
✅ Audio successfully injected into meeting
💡 Audio should now be heard by other meeting participants
🧹 Audio injection cleanup completed
```

### **Fallback to Local TTS:**
```
❌ Failed to inject audio: [error message]
🔄 Falling back to local TTS...
✅ Voice test completed via ACS (local TTS fallback)
```

## 🔍 Troubleshooting

### **If Audio Injection Fails:**

1. **Check Microphone Permission**:
   - Browser should ask for microphone access
   - Allow microphone access when prompted

2. **Check Browser Console**:
   - Look for error messages
   - Check if Web Audio API is supported

3. **Check Meeting Audio**:
   - Verify other participants can hear the bot
   - Check if bot appears in meeting roster

### **Common Issues:**

- **Microphone Access Denied**: Falls back to local TTS
- **Web Audio API Not Supported**: Falls back to local TTS
- **No Active Call**: Error message, no fallback
- **Audio Context Issues**: Falls back to local TTS

## 💡 Technical Details

### **Audio Generation:**
- Creates synthetic speech-like audio patterns
- Varies frequency and amplitude to simulate speech
- Duration based on text length

### **Audio Mixing:**
- Combines microphone input with TTS audio
- Uses Web Audio API for real-time processing
- Maintains audio quality and timing

### **Meeting Integration:**
- Uses ACS `startAudio()` method
- Replaces current audio stream with mixed audio
- Automatically cleans up after completion

## 🚀 Next Steps

### **For Production Use:**
1. **Real TTS Service**: Replace synthetic audio with Azure Cognitive Services Speech
2. **Better Audio Quality**: Improve audio generation algorithms
3. **Error Handling**: Add more robust error handling
4. **User Controls**: Add volume and voice selection controls

### **Current Limitations:**
- Uses synthetic audio (not real TTS)
- Limited to basic audio patterns
- Requires microphone permission
- May not work in all browsers

**The audio injection feature is now ready to test! Try joining a meeting and testing the voice functionality.**

