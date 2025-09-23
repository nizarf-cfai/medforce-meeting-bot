// Hybrid Teams Bot - ACS + Microsoft Graph API Integration
// This combines the existing ACS functionality with Graph API capabilities

import { CallClient, LocalAudioStream } from "@azure/communication-calling";
import { AzureCommunicationTokenCredential } from "@azure/communication-common";

// Global variables
let callClient, callAgent, deviceManager, currentCall;
let socket, chatSessionId, isChatActive = false;
let isInMeeting = false;
let useGraphAPI = false; // Toggle between ACS and Graph API
let isRecording = false;
let mediaRecorder, recordedChunks = [];

// Real-time processing variables
let isRealtimeActive = false;
let realtimeStream, realtimeAudioContext, realtimeAnalyser, realtimeGainNode;
let speechDetectionInterval, speechBuffer = [];
let isProcessingSpeech = false;
let speechThreshold = 0.01; // Adjust this value for sensitivity
let silenceTimeout = null;
let questionBuffer = []; // Buffer to store multiple audio chunks for full question
let maxQuestionChunks = 5; // Maximum number of chunks to combine for a question

// Wake word detection
let wakeWordDetected = false;
let wakeWordTimeout = null;
let isListeningForWakeWord = true;
let wakeWordPhrases = ['medforce ai', 'medforceai', 'med force ai', 'med-force ai']; // Case insensitive

// New workflow states
let isWaitingForQuestion = false;
let questionRecording = null;
let questionChunks = [];
let questionTimeout = null;

// Gemini Live states
let geminiSessionId = null;
let isGeminiLiveActive = false;
let geminiAudioContext = null;
let geminiMediaRecorder = null;
let geminiSocket = null;

// UI elements
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const voiceTestBtn = document.getElementById('voiceTestBtn');
const transcriptionBtn = document.getElementById('transcriptionBtn');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatContainer = document.getElementById('chatContainer');
const chatSection = document.getElementById('chatSection');
const logElement = document.getElementById('log');
const meetingLinkInput = document.getElementById('meetingLink');
const apiToggleBtn = document.getElementById('apiToggleBtn');
const micPermissionBtn = document.getElementById('micPermissionBtn');

// Real-time UI elements
const realtimeBtn = document.getElementById('realtimeBtn');
const stopRealtimeBtn = document.getElementById('stopRealtimeBtn');

// Logging function
function log(message) {
  console.log(message);
  const logDiv = document.createElement('div');
  logDiv.textContent = new Date().toLocaleTimeString() + ': ' + message;
  logElement.appendChild(logDiv);
  logElement.scrollTop = logElement.scrollHeight;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  log('🚀 Hybrid Teams Bot initialized');
  log('💡 This version supports both ACS and Microsoft Graph API approaches');
  log('🔄 Use the toggle button to switch between ACS and Graph API modes');
  
  // Check for existing chat session in URL
  checkForExistingChat();
  
  // Initialize Socket.IO connection
  initializeSocket();
  
  // Update UI based on current mode
  updateUIMode();
});

// Initialize Socket.IO connection
function initializeSocket() {
  socket = io();
  
  socket.on('connect', () => {
    log('✅ Connected to chat server');
  });
  
  socket.on('chatMessage', (message) => {
    displayChatMessage(message);
  });
  
  socket.on('chatHistory', (messages) => {
    messages.forEach(msg => displayChatMessage(msg));
  });
  
  socket.on('disconnect', () => {
    log('❌ Disconnected from chat server');
  });
}

// Toggle between ACS and Graph API modes
function toggleAPIMode() {
  useGraphAPI = !useGraphAPI;
  updateUIMode();
  
  if (useGraphAPI) {
    log('🔄 Switched to Microsoft Graph API mode');
    log('💡 Graph API mode provides full meeting integration (voice + transcription)');
  } else {
    log('🔄 Switched to Azure Communication Services mode');
    log('💡 ACS mode provides basic meeting join functionality');
  }
}

// Request microphone permission
async function requestMicrophonePermission() {
  try {
    log('🔐 Requesting microphone permission...');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      log('❌ getUserMedia not supported in this browser');
      return false;
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } 
    });
    
    log('✅ Microphone permission granted!');
    log('🎤 You can now use voice features in meetings');
    
    // Stop the stream immediately as we just needed permission
    stream.getTracks().forEach(track => track.stop());
    
    return true;
    
  } catch (error) {
    log(`❌ Microphone permission denied: ${error.message}`);
    
    if (error.name === 'NotAllowedError') {
      log('💡 Please click "Allow" when the browser asks for microphone permission');
    } else if (error.name === 'NotFoundError') {
      log('💡 No microphone found. Please connect a microphone and try again');
    } else if (error.name === 'NotSupportedError') {
      log('💡 Microphone access not supported in this browser');
    }
    
    return false;
  }
}

// Update UI based on current mode
function updateUIMode() {
  if (useGraphAPI) {
    apiToggleBtn.textContent = 'Switch to ACS Mode';
    apiToggleBtn.style.background = '#8764b8';
    joinBtn.textContent = 'Join Meeting (Graph API)';
    log('🎯 Current mode: Microsoft Graph API');
  } else {
    apiToggleBtn.textContent = 'Switch to Graph API Mode';
    apiToggleBtn.style.background = '#0078d4';
    joinBtn.textContent = 'Join Meeting (ACS)';
    log('🎯 Current mode: Azure Communication Services');
  }
}

// Join meeting (handles both ACS and Graph API)
async function joinMeeting() {
  const meetingLink = meetingLinkInput.value.trim();
  
  if (!meetingLink) {
    log('❌ Please enter a Teams meeting link');
    return;
  }
  
  if (!meetingLink.includes('teams.microsoft.com')) {
    log('❌ Please enter a valid Teams meeting link');
    return;
  }
  
  try {
    if (useGraphAPI) {
      await joinMeetingWithGraphAPI(meetingLink);
    } else {
      await joinMeetingWithACS(meetingLink);
    }
  } catch (error) {
    log(`❌ Error joining meeting: ${error.message}`);
  }
}

// Join meeting using Microsoft Graph API
async function joinMeetingWithGraphAPI(meetingLink) {
  log('🤖 Joining meeting via Microsoft Graph API...');
  
  // Get access token (you'll need to implement this based on your app registration)
  const accessToken = await getAccessToken();
  
  if (!accessToken) {
    log('❌ Failed to get access token. Please check your app registration.');
    log('💡 For now, using simulated Graph API response');
    
    // Simulate Graph API call
    const response = await fetch('/api/graph/join-meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingLink, accessToken: 'simulated-token' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Successfully joined meeting via Microsoft Graph API (simulated)!');
      log('🎤 Bot is now in the meeting and can provide voice responses');
      
      isInMeeting = true;
      
      // Update UI
      joinBtn.disabled = true;
      leaveBtn.disabled = false;
      voiceTestBtn.disabled = false;
      transcriptionBtn.disabled = false;
      log('🔘 Recording button enabled');
      log(`🔍 Button element found: ${transcriptionBtn ? 'Yes' : 'No'}`);
      
      // Start chat session
      await startChatSession(meetingLink);
      
      // Send initial bot messages
      await sendChatMessage("🤖 Bot has joined the meeting via Microsoft Graph API (simulated)!", 'Bot');
      await sendChatMessage("🎤 I can now provide voice responses and audio transcription!", 'Bot');
      
      // Auto-play welcome message
      setTimeout(() => {
        testVoiceInMeeting();
      }, 2000);
      
    } else {
      log(`❌ Failed to join meeting: ${result.error}`);
    }
  } else {
    // Real Graph API implementation would go here
    log('🔑 Access token available - implementing real Graph API call...');
    // TODO: Implement real Graph API call when access token is available
  }
}

// Join meeting using Azure Communication Services
async function joinMeetingWithACS(meetingLink) {
  log('🤖 Joining meeting via Azure Communication Services...');
  
  try {
    // Get ACS token
    const token = await fetchToken();
    if (!token) {
      log('❌ Failed to get ACS token');
      return;
    }
    
    // Initialize calling
    await initCalling(token);
    
    // Join meeting
    log("Joining meeting…");
    const locator = { meetingLink };
    currentCall = await callAgent.join(locator, {});
    
    currentCall.on("stateChanged", async () => {
      log("Call state:", currentCall.state);
      
      if (currentCall.state === "Connected" && !isChatActive) {
        log('🔄 Call connected - auto-starting chat session...');
        
        // Enable buttons when connected
        voiceTestBtn.disabled = false;
        transcriptionBtn.disabled = false;
        realtimeBtn.disabled = false;
        geminiLiveBtn.disabled = false;
        log('🔘 Recording and real-time buttons enabled (ACS mode)');
        log(`🔍 Button element found: ${transcriptionBtn ? 'Yes' : 'No'}`);
        
        try {
          const meetingId = meetingLink.split('/').pop() || 'meeting-' + Date.now();
          const sessionId = await startChatSession(meetingId);
          
          // Send initial bot messages
          await sendChatMessage("🤖 Bot has joined the meeting via ACS!");
          await sendChatMessage("💡 This is the ACS version with limited meeting integration");
          
          // Auto voice test
          setTimeout(async () => {
            log('🎤 Auto voice test starting...');
            try {
              await injectAudioIntoMeeting("Hello everyone! I'm the meeting bot via ACS!");
            } catch (error) {
              log('🔄 Falling back to local TTS...');
              speak("Hello everyone! I'm the meeting bot via ACS!");
            }
          }, 3000);
          
        } catch (error) {
          log('❌ Failed to start chat session:', error.message);
        }
      }
    });
    
    currentCall.on("callEnded", (e) => {
      log("Call ended:", JSON.stringify(e));
      stopChatSession();
    });
    
    isInMeeting = true;
    joinBtn.disabled = true;
    leaveBtn.disabled = false;
    voiceTestBtn.disabled = false;
    transcriptionBtn.disabled = false;
    log('🔘 Recording button enabled (Graph API mode)');
    
    log('Join requested. Check Teams roster for "ACS Web Agent".');
    
  } catch (error) {
    log(`❌ Error joining meeting with ACS: ${error.message}`);
  }
}

// Leave meeting
async function leaveMeeting() {
  if (!isInMeeting) {
    log('❌ Not currently in a meeting');
    return;
  }
  
  try {
    if (useGraphAPI) {
      // Leave via Graph API
      const response = await fetch('/api/graph/leave-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      if (result.success) {
        log('✅ Successfully left the meeting (Graph API)');
      }
    } else {
      // Leave via ACS
      if (currentCall) {
        await currentCall.hangUp();
        log('✅ Successfully left the meeting (ACS)');
      }
    }
    
    isInMeeting = false;
    currentCall = null;
    
    // Update UI
    joinBtn.disabled = false;
    leaveBtn.disabled = true;
    voiceTestBtn.disabled = true;
    transcriptionBtn.disabled = true;
    
    // Stop chat session
    stopChatSession();
    
  } catch (error) {
    log(`❌ Error leaving meeting: ${error.message}`);
  }
}

// Test voice in meeting
async function testVoiceInMeeting() {
  if (!isInMeeting) {
    log('❌ Not currently in a meeting');
    return;
  }
  
  try {
    log('🎤 Testing voice in meeting...');
    
    if (useGraphAPI) {
      // Test voice via Graph API
      const response = await fetch('/api/graph/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      if (result.success) {
        log('✅ Voice test completed via Graph API!');
        log('💡 In real implementation, this would play audio in the meeting');
        
        // Send to chat if available
        if (isChatActive) {
          await sendChatMessage('🎤 Voice test completed via Graph API!', 'Bot');
        }
      }
    } else {
      // Test voice via ACS - inject audio into meeting
      const testMessage = "Hello! This is a voice test from the ACS bot! I can speak in the meeting!";
      
      try {
        // Try to inject audio into the meeting
        await injectAudioIntoMeeting(testMessage);
        log('✅ Voice test completed via ACS - audio injected into meeting');
        log('💡 Audio should now be heard by other meeting participants');
        
        // Send to chat if available
        if (isChatActive) {
          await sendChatMessage(`🎤 Voice test: ${testMessage}`, 'Bot');
        }
      } catch (error) {
        log(`❌ Failed to inject audio: ${error.message}`);
        log('🔄 Falling back to local TTS...');
        speak(testMessage);
        log('✅ Voice test completed via ACS (local TTS fallback)');
      }
    }
    
  } catch (error) {
    log(`❌ Error testing voice: ${error.message}`);
  }
}

// Start audio transcription
async function startTranscription() {
  if (!isInMeeting) {
    log('❌ Not currently in a meeting');
    return;
  }
  
  try {
    log('🎤 Starting audio transcription...');
    
    if (useGraphAPI) {
      // Start transcription via Graph API
      const response = await fetch('/api/graph/start-transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      if (result.success) {
        log('✅ Audio transcription started via Graph API!');
        log('💡 In real implementation, this would access meeting audio streams');
        transcriptionBtn.textContent = 'Stop Transcription';
        
        // Send to chat if available
        if (isChatActive) {
          await sendChatMessage('🎤 Audio transcription started via Graph API!', 'Bot');
        }
      }
    } else {
      // Simulate transcription for ACS
      log('✅ Audio transcription started (simulated for ACS)');
      log('💡 ACS doesn\'t support real-time audio access');
      transcriptionBtn.textContent = 'Stop Transcription';
      
      // Start simulated transcription
      startSimulatedTranscription();
      
      // Send to chat if available
      if (isChatActive) {
        await sendChatMessage('🎤 Audio transcription started (simulated for ACS)!', 'Bot');
      }
    }
    
  } catch (error) {
    log(`❌ Error starting transcription: ${error.message}`);
  }
}

// Stop audio transcription
async function stopTranscription() {
  try {
    log('🛑 Stopping audio transcription...');
    transcriptionBtn.textContent = 'Start Transcription';
    log('✅ Audio transcription stopped.');
    
    // Send to chat if available
    if (isChatActive) {
      await sendChatMessage('🛑 Audio transcription stopped.', 'Bot');
    }
    
  } catch (error) {
    log(`❌ Error stopping transcription: ${error.message}`);
  }
}

// Simulated transcription for ACS mode
function startSimulatedTranscription() {
  // Simulate receiving transcription every 5-10 seconds
  const delay = Math.random() * 5000 + 5000; // 5-10 seconds
  
  setTimeout(() => {
    if (transcriptionBtn.textContent.includes('Stop')) {
      simulateTranscription();
      startSimulatedTranscription(); // Continue the cycle
    }
  }, delay);
}

function simulateTranscription() {
  const sampleTranscriptions = [
    "Hello everyone, welcome to the meeting.",
    "I think we should discuss the project timeline.",
    "Can you hear me clearly?",
    "Let's review the agenda for today.",
    "I have a question about the budget.",
    "That sounds like a good idea.",
    "Thank you for joining the call."
  ];
  
  const randomText = sampleTranscriptions[Math.floor(Math.random() * sampleTranscriptions.length)];
  const timestamp = new Date().toLocaleTimeString();
  
  log(`📝 [${timestamp}] Transcription: ${randomText}`);
  
  // Send to chat if available
  if (isChatActive) {
    sendChatMessage(`📝 [${timestamp}] ${randomText}`, 'Transcription');
  }
}

// Toggle transcription/recording
async function toggleTranscription() {
  if (transcriptionBtn.textContent.includes('Start')) {
    await startAudioRecording();
  } else {
    await stopAudioRecording();
  }
}

// Get access token for Graph API
async function getAccessToken() {
  try {
    log('🔑 Getting access token for Graph API...');
    
    // This is a placeholder - you'll need to implement actual token acquisition
    // based on your Azure AD app registration
    
    // For now, return null to indicate token acquisition is needed
    return null;
    
  } catch (error) {
    log(`❌ Error getting access token: ${error.message}`);
    return null;
  }
}

// ACS functions (keeping existing functionality)
async function fetchToken() {
  try {
    log('Requesting ACS token…');
    const response = await fetch('/api/acs/token', { method: 'POST' });
    const data = await response.json();
    log(`Got token for user: ${data.userId}`);
    return data.token;
  } catch (error) {
    log(`Error getting token: ${error.message}`);
    return null;
  }
}

async function initCalling(token) {
  callClient = new CallClient();
  const tokenCredential = new AzureCommunicationTokenCredential(token);
  callAgent = await callClient.createCallAgent(tokenCredential, { displayName: "ACS Web Agent" });
  
  deviceManager = await callClient.getDeviceManager();
  
  // Don't ask for microphone permission - we'll use speech audio only
  log('🎤 Using speech audio only (no microphone input)');
}

function speak(text) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const utter = new SpeechSynthesisUtterance(text);
  synth.speak(utter);
}

// Inject audio into the meeting by using the microphone
async function injectAudioIntoMeeting(text) {
  try {
    log('🎤 Attempting to inject audio into meeting...');
    
    // Check if we have a current call
    if (!currentCall) {
      throw new Error('No active call to inject audio into');
    }
    
    // Create audio context for synthetic audio generation
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    
    // Create TTS audio and connect it to destination
    const ttsAudio = await createTTSAudio(text, audioContext);
    ttsAudio.connect(destination);
    
    // Start playing the audio file
    ttsAudio.mediaElement.play();
    
    // Create LocalAudioStream from our synthetic audio
    const localAudioStream = new LocalAudioStream(destination.stream);
    
    // Start audio with the synthetic stream
    await currentCall.startAudio(localAudioStream);
    
    log('✅ Audio successfully injected into meeting');
    
    // Clean up after the audio file actually finishes playing
    ttsAudio.mediaElement.addEventListener('ended', () => {
      ttsAudio.disconnect();
      audioContext.close();
      log('🧹 Audio injection cleanup completed');
    });
    
    // Fallback cleanup in case the 'ended' event doesn't fire
    setTimeout(() => {
      if (!ttsAudio.mediaElement.ended) {
        ttsAudio.mediaElement.pause();
        ttsAudio.disconnect();
        audioContext.close();
        log('🧹 Audio injection cleanup completed (timeout fallback)');
      }
    }, 120000); // 2 minute fallback timeout to allow full audio playback
    
  } catch (error) {
    log(`❌ Audio injection failed: ${error.message}`);
    
    // Provide more specific error messages
    if (error.name === 'NotAllowedError') {
      log('💡 Audio injection permission denied.');
    } else if (error.name === 'NotSupportedError') {
      log('💡 Audio injection not supported in this browser.');
    } else if (error.message.includes('raw media stream')) {
      log('💡 ACS requires a proper MediaStream object for audio injection.');
    }
    
    throw error;
  }
}

// Create TTS audio from bot_voice.wav file
async function createTTSAudio(text, audioContext) {
  return new Promise((resolve, reject) => {
    try {
      // Load the bot_voice.wav file
      const audioFile = new Audio('/bot_voice.wav');
      
      // Create a MediaElementAudioSourceNode from the audio file
      const source = audioContext.createMediaElementSource(audioFile);
      
      // Set up the audio file to play
      audioFile.preload = 'auto';
      audioFile.volume = 0.8; // Adjust volume as needed
      
      // When the audio is loaded, resolve with the source
      audioFile.addEventListener('canplaythrough', () => {
        resolve(source);
      });
      
      // Handle loading errors
      audioFile.addEventListener('error', (error) => {
        reject(new Error(`Failed to load bot_voice.wav: ${error.message}`));
      });
      
      // Start loading the audio file
      audioFile.load();
      
    } catch (error) {
      reject(error);
    }
  });
}

// Audio recording functionality
async function startAudioRecording() {
  try {
    if (!currentCall) {
      throw new Error('No active call to record from');
    }
    
    if (isRecording) {
      log('⚠️ Recording is already in progress');
      return;
    }
    
    log('🎙️ Starting audio recording from meeting...');
    
    // Request microphone permission to capture audio with higher volume
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        volume: 1.0,
        sampleRate: 44100,
        channelCount: 2
      } 
    });
    
    // Create audio context for volume boosting
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    
    // Boost the volume (2x amplification)
    gainNode.gain.value = 2.0;
    
    // Connect: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(destination);
    
    // Create MediaRecorder to record the boosted audio
    mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    recordedChunks = [];
    
    // Handle data available event
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    // Handle recording stop event
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      saveRecordingAsWAV(blob);
    };
    
    // Start recording
    mediaRecorder.start(1000); // Collect data every second
    isRecording = true;
    
    log('✅ Audio recording started');
    
    // Update UI
    if (transcriptionBtn) {
      transcriptionBtn.textContent = '🛑 Stop Recording';
      transcriptionBtn.disabled = false;
    }
    
    // Show recording status
    const recordingStatus = document.getElementById('recordingStatus');
    const recordingInfo = document.getElementById('recordingInfo');
    if (recordingStatus && recordingInfo) {
      recordingStatus.style.display = 'block';
      recordingInfo.textContent = '🔴 Recording in progress... Click "Stop Recording" to save as WAV file';
    }
    
  } catch (error) {
    log(`❌ Failed to start recording: ${error.message}`);
    if (error.name === 'NotAllowedError') {
      log('💡 Microphone access denied. Please allow microphone access to record meeting audio.');
    }
  }
}

async function stopAudioRecording() {
  try {
    if (!isRecording || !mediaRecorder) {
      log('⚠️ No recording in progress');
      return;
    }
    
    log('🛑 Stopping audio recording...');
    
    mediaRecorder.stop();
    isRecording = false;
    
    // Stop all tracks to release microphone
    if (mediaRecorder.stream) {
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    log('✅ Audio recording stopped');
    
    // Update UI
    if (transcriptionBtn) {
      transcriptionBtn.textContent = '🎙️ Start Recording';
      transcriptionBtn.disabled = false;
    }
    
    // Update recording status
    const recordingInfo = document.getElementById('recordingInfo');
    if (recordingInfo) {
      recordingInfo.textContent = '✅ Recording completed! Converting to WAV format...';
    }
    
  } catch (error) {
    log(`❌ Failed to stop recording: ${error.message}`);
  }
}

async function saveRecordingAsWAV(blob) {
  try {
    log('💾 Converting and saving recording as WAV...');
    
    // Convert WebM to WAV
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Convert to WAV format
    const wavBlob = audioBufferToWav(audioBuffer);
    
    // Save to project directory via server
    const filename = `meeting_recording_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
    
    // Convert blob to base64 for server upload
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1]; // Remove data:audio/wav;base64, prefix
      
      try {
        log('📤 Sending recording to server...');
        const response = await fetch('/api/save-recording', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: filename,
            audioData: base64Data
          })
        });
        
        log(`📡 Server response status: ${response.status}`);
        
        if (response.ok) {
          const result = await response.json();
          log(`✅ Recording saved as WAV file: ${filename}`);
          log(`💾 File saved to project directory: ${result.filePath}`);
          log('🎯 Ready to use for Q&A processing!');
          
          // Automatically process the recorded audio
          log('🤖 Starting AI processing of recorded audio...');
          setTimeout(() => {
            processRecordedAudio(filename);
          }, 1000); // Small delay to ensure file is fully written
        } else {
          const errorText = await response.text();
          log(`❌ Server error: ${errorText}`);
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        log(`❌ Failed to save to server: ${error.message}`);
        log('🔄 Falling back to download...');
        // Fallback to download
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        log('💾 Fallback: File downloaded to your Downloads folder');
      }
    };
    
    reader.readAsDataURL(wavBlob);
    
  } catch (error) {
    log(`❌ Failed to save recording: ${error.message}`);
  }
}

function audioBufferToWav(buffer) {
  try {
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    // Validate buffer
    if (!buffer || length === 0 || !sampleRate) {
      console.warn('Invalid audio buffer provided');
      return null;
    }
    
    // Calculate required buffer size
    const dataSize = length * 2;
    const bufferSize = 44 + dataSize;
    
    // Check if buffer size is reasonable (max 10MB)
    if (bufferSize > 10 * 1024 * 1024) {
      console.warn('Audio buffer too large');
      return null;
    }
    
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length && offset + i < view.byteLength; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    // Write header safely
    writeString(0, 'RIFF');
    if (view.byteLength >= 8) view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    if (view.byteLength >= 20) view.setUint32(16, 16, true);
    if (view.byteLength >= 22) view.setUint16(20, 1, true);
    if (view.byteLength >= 24) view.setUint16(22, 1, true);
    if (view.byteLength >= 28) view.setUint32(24, sampleRate, true);
    if (view.byteLength >= 32) view.setUint32(28, sampleRate * 2, true);
    if (view.byteLength >= 34) view.setUint16(32, 2, true);
    if (view.byteLength >= 36) view.setUint16(34, 16, true);
    writeString(36, 'data');
    if (view.byteLength >= 44) view.setUint32(40, dataSize, true);
    
    // Convert float samples to 16-bit PCM safely
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    
    for (let i = 0; i < length && offset + 1 < view.byteLength; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  } catch (error) {
    console.error('Error in audioBufferToWav:', error);
    return null;
  }
}

// OpenAI Audio Processing Functions
async function processRecordedAudio(filename) {
  try {
    log('🤖 Processing recorded audio with OpenAI...');
    
    // Step 1: Transcribe the audio
    log('🎤 Transcribing audio...');
    const transcriptionResponse = await fetch('/api/openai/transcribe-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename })
    });
    
    if (!transcriptionResponse.ok) {
      throw new Error('Failed to transcribe audio');
    }
    
    const transcriptionData = await transcriptionResponse.json();
    const transcription = transcriptionData.transcription;
    
    log(`📝 Transcription: ${transcription}`);
    
    // Check for empty transcription
    if (!transcription || transcription.trim() === '' || transcription === 'No speech detected') {
      log('⚠️ No speech detected in recording');
      return;
    }
    
    // Step 2: Generate response
    log('🤖 Generating AI response...');
    const responseResponse = await fetch('/api/openai/generate-response', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        transcription,
        context: "You are a helpful meeting assistant bot. Provide concise, helpful responses to meeting participants."
      })
    });
    
    if (!responseResponse.ok) {
      throw new Error('Failed to generate response');
    }
    
    const responseData = await responseResponse.json();
    const aiResponse = responseData.response;
    
    log(`💬 AI Response: ${aiResponse}`);
    
    // Step 3: Convert to speech
    log('🔊 Converting response to speech...');
    const ttsResponse = await fetch('/api/openai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        text: aiResponse,
        voice: "alloy" // You can change this to "nova", "shimmer", "echo", "fable", "onyx"
      })
    });
    
    if (!ttsResponse.ok) {
      throw new Error('Failed to generate speech');
    }
    
    const ttsData = await ttsResponse.json();
    const responseFilename = ttsData.filename;
    
    log(`🎵 TTS audio generated: ${responseFilename}`);
    
    // Step 4: Play the response in the meeting
    log('🎤 Playing AI response in meeting...');
    await playResponseInMeeting(responseFilename);
    
    // Send to chat if available
    if (isChatActive) {
      await sendChatMessage(`🎤 AI Response: ${aiResponse}`, 'Bot');
    }
    
    log('✅ AI processing completed successfully!');
    
  } catch (error) {
    log(`❌ Failed to process audio: ${error.message}`);
  }
}

async function playResponseInMeeting(responseFilename) {
  try {
    if (!currentCall) {
      throw new Error('No active call to play response in');
    }
    
    // Create audio context for synthetic audio generation
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    
    // Load the response audio file
    const responseAudio = new Audio(`/recordings/${responseFilename}`);
    const source = audioContext.createMediaElementSource(responseAudio);
    source.connect(destination);
    
    // Create LocalAudioStream from our synthetic audio
    const localAudioStream = new LocalAudioStream(destination.stream);
    
    // Start audio with the synthetic stream
    await currentCall.startAudio(localAudioStream);
    
    // Start playing the response audio
    responseAudio.play();
    
    log('✅ AI response playing in meeting');
    
    // Clean up after the audio finishes
    responseAudio.addEventListener('ended', () => {
      source.disconnect();
      audioContext.close();
      log('🧹 AI response cleanup completed');
    });
    
  } catch (error) {
    log(`❌ Failed to play response in meeting: ${error.message}`);
  }
}

// Real-time Audio Processing Functions
async function startRealtimeProcessing() {
  try {
    if (!currentCall) {
      throw new Error('No active call for real-time processing');
    }
    
    if (isRealtimeActive) {
      log('⚠️ Real-time processing is already active');
      return;
    }
    
    log('🔄 Starting real-time audio processing...');
    
    // Request microphone permission for real-time monitoring
    realtimeStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        volume: 1.0,
        sampleRate: 44100,
        channelCount: 2
      } 
    });
    
    // Create audio context for real-time analysis
    realtimeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = realtimeAudioContext.createMediaStreamSource(realtimeStream);
    realtimeAnalyser = realtimeAudioContext.createAnalyser();
    realtimeGainNode = realtimeAudioContext.createGain();
    
    // Configure analyser
    realtimeAnalyser.fftSize = 2048;
    realtimeAnalyser.smoothingTimeConstant = 0.8;
    
    // Boost volume for better detection
    realtimeGainNode.gain.value = 2.0;
    
    // Connect audio nodes
    source.connect(realtimeGainNode);
    realtimeGainNode.connect(realtimeAnalyser);
    
    // Start speech detection
    startSpeechDetection();
    
    isRealtimeActive = true;
    
    // Update UI
    realtimeBtn.style.display = 'none';
    stopRealtimeBtn.style.display = 'block';
    stopRealtimeBtn.disabled = false;
    
    // Show real-time status
    const realtimeStatus = document.getElementById('realtimeStatus');
    const realtimeInfo = document.getElementById('realtimeInfo');
    if (realtimeStatus && realtimeInfo) {
      realtimeStatus.style.display = 'block';
      realtimeInfo.textContent = '🔴 Real-time processing active - listening for "MedForce AI"...';
    }
    
    log('✅ Real-time processing started');
    
  } catch (error) {
    log(`❌ Failed to start real-time processing: ${error.message}`);
    if (error.name === 'NotAllowedError') {
      log('💡 Microphone access denied. Please allow microphone access for real-time processing.');
    }
  }
}

async function stopRealtimeProcessing() {
  try {
    if (!isRealtimeActive) {
      log('⚠️ Real-time processing is not active');
      return;
    }
    
    log('🛑 Stopping real-time processing...');
    
    // Stop speech detection
    if (speechDetectionInterval) {
      clearInterval(speechDetectionInterval);
      speechDetectionInterval = null;
    }
    
    // Clear silence timeout
    if (silenceTimeout) {
      clearTimeout(silenceTimeout);
      silenceTimeout = null;
    }
    
    // Stop audio stream
    if (realtimeStream) {
      realtimeStream.getTracks().forEach(track => track.stop());
    }
    
    // Close audio context
    if (realtimeAudioContext) {
      realtimeAudioContext.close();
    }
    
    isRealtimeActive = false;
    isProcessingSpeech = false;
    speechBuffer = [];
    
    // Update UI
    realtimeBtn.style.display = 'block';
    stopRealtimeBtn.style.display = 'none';
    realtimeBtn.disabled = false;
    
    // Update real-time status
    const realtimeInfo = document.getElementById('realtimeInfo');
    if (realtimeInfo) {
      realtimeInfo.textContent = '✅ Real-time processing stopped';
    }
    
    log('✅ Real-time processing stopped');
    
  } catch (error) {
    log(`❌ Failed to stop real-time processing: ${error.message}`);
  }
}

function startSpeechDetection() {
  const bufferLength = realtimeAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  speechDetectionInterval = setInterval(() => {
    if (!isRealtimeActive || isProcessingSpeech) return;
    
    realtimeAnalyser.getByteFrequencyData(dataArray);
    
    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const average = sum / bufferLength;
    const normalizedVolume = average / 255;
    
    // Debug: Show volume level occasionally
    if (Math.random() < 0.01) { // 1% chance to log
      log(`🔊 Volume level: ${normalizedVolume.toFixed(3)} (threshold: ${speechThreshold})`);
    }
    
    // Detect speech
    if (normalizedVolume > speechThreshold) {
      if (!isProcessingSpeech && !isWaitingForQuestion) {
        log(`🎤 Speech detected (volume: ${normalizedVolume.toFixed(3)}) - checking for wake word...`);
        startSpeechProcessing();
      }
      
      // Clear any existing silence timeout
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
      }
      
      // Set new silence timeout
      silenceTimeout = setTimeout(() => {
        if (isProcessingSpeech) {
          log('🔇 Silence detected - processing speech chunk...');
          processSpeechChunk();
        }
      }, 2000); // 2 seconds of silence before processing
    }
  }, 100); // Check every 100ms
}

async function startSpeechProcessing() {
  if (isProcessingSpeech) return;
  
  isProcessingSpeech = true;
  
  // Create a new MediaRecorder for this speech chunk
  const chunkRecorder = new MediaRecorder(realtimeStream, {
    mimeType: 'audio/webm;codecs=opus'
  });
  
  const chunkChunks = [];
  
  chunkRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunkChunks.push(event.data);
    }
  };
  
  chunkRecorder.onstop = async () => {
    const blob = new Blob(chunkChunks, { type: 'audio/webm' });
    await processRealtimeAudio(blob);
    isProcessingSpeech = false;
  };
  
  // Start recording this speech chunk
  chunkRecorder.start(100);
  
  // Store the recorder for later stopping
  speechBuffer.push(chunkRecorder);
}

async function processSpeechChunk() {
  if (speechBuffer.length === 0) return;
  
  // Stop the current recording
  const currentRecorder = speechBuffer.pop();
  if (currentRecorder && currentRecorder.state === 'recording') {
    currentRecorder.stop();
  }
}

async function processRealtimeAudio(blob) {
  try {
    log('🤖 Processing real-time audio chunk...');
    
    // Convert blob to base64 for server processing
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result.split(',')[1];
      const filename = `realtime_${Date.now()}.wav`;
      
      // Save the audio chunk
      const response = await fetch('/api/save-recording', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: filename,
          audioData: base64Data
        })
      });
      
      if (response.ok) {
        log('✅ Real-time audio chunk saved (no download)');
        
        // First, check for wake word
        await checkForWakeWord(filename);
      } else {
        log('❌ Failed to save real-time audio chunk');
      }
    };
    
    reader.readAsDataURL(blob);
    
  } catch (error) {
    log(`❌ Failed to process real-time audio: ${error.message}`);
  }
}

async function checkForWakeWord(filename) {
  try {
    log('🔍 Checking for wake word "MedForce"...');
    
    // Transcribe the audio to check for wake word
    const transcriptionResponse = await fetch('/api/openai/transcribe-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filename })
    });
    
    if (!transcriptionResponse.ok) {
      log('❌ Failed to transcribe audio for wake word detection');
      return;
    }
    
    const transcriptionData = await transcriptionResponse.json();
    let transcription = transcriptionData.transcription.toLowerCase();
    
    // Filter out non-English characters and force English
    transcription = transcription.replace(/[^\x00-\x7F]/g, ''); // Remove non-ASCII characters
    transcription = transcription.replace(/[^\w\s]/g, ' '); // Keep only letters, numbers, spaces
    
    log(`📝 Transcription (English only): "${transcription}"`);
    log(`🔍 Checking for wake word in: "${transcription}"`);
    
    // Check if wake word is present (more flexible matching)
    const containsWakeWord = wakeWordPhrases.some(phrase => {
      const lowerTranscription = transcription.toLowerCase();
      const lowerPhrase = phrase.toLowerCase();
      
      // Check for exact match or partial match
      const exactMatch = lowerTranscription.includes(lowerPhrase);
      const medforceAiMatch = lowerTranscription.includes('medforce ai');
      const medforceaiMatch = lowerTranscription.includes('medforceai');
      const medForceAiMatch = lowerTranscription.includes('med force ai');
      const medForceHyphenAiMatch = lowerTranscription.includes('med-force ai');
      
      // Also check for phonetic matches
      const phoneticMatch = lowerTranscription.includes('med') && 
                           (lowerTranscription.includes('force') || 
                            lowerTranscription.includes('for') ||
                            lowerTranscription.includes('four')) &&
                           lowerTranscription.includes('ai');
      
      const match = exactMatch || medforceAiMatch || medforceaiMatch || medForceAiMatch || medForceHyphenAiMatch || phoneticMatch;
      
      if (match) {
        log(`✅ Wake word match found: "${phrase}" in "${lowerTranscription}"`);
        log(`🔍 Match details: exact=${exactMatch}, medforce ai=${medforceAiMatch}, medforceai=${medforceaiMatch}, med force ai=${medForceAiMatch}, phonetic=${phoneticMatch}`);
      }
      return match;
    });
    
    log(`🔍 Wake word detection result: ${containsWakeWord}`);
    
    if (containsWakeWord) {
      log('🎯 Wake word "MedForce AI" detected! Responding with "I\'m ready"...');
      wakeWordDetected = true;
      
      // Update UI to show wake word detected
      const realtimeInfo = document.getElementById('realtimeInfo');
      if (realtimeInfo) {
        realtimeInfo.textContent = '🎯 Wake word detected - saying "I\'m ready"...';
      }
      
      // Step 1: Respond with "I'm ready" voice
      await playReadyResponse();
      
      // Step 2: Start recording the question
      await startQuestionRecording();
      
      // Reset wake word detection
      wakeWordDetected = false;
      isListeningForWakeWord = true;
      
    } else {
      log('👂 No wake word detected - continuing to listen...');
      // Don't process this audio chunk further
    }
    
  } catch (error) {
    log(`❌ Failed to check for wake word: ${error.message}`);
  }
}

// Chat functionality (keeping existing)
async function startChatSession(meetingId) {
  try {
    log('🔄 Starting chat session...');
    
    const response = await fetch('/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId })
    });
    
    const data = await response.json();
    chatSessionId = data.sessionId;
    isChatActive = true;
    
    // Join the chat room
    socket.emit('joinChat', chatSessionId);
    
    // Show chat interface
    showChatInterface();
    
    log('✅ Chat session started successfully');
    return chatSessionId;
    
  } catch (error) {
    log(`❌ Failed to start chat session: ${error.message}`);
    return null;
  }
}

function displayChatMessage(message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${message.sender === 'Bot' ? 'bot-message' : 'user-message'}`;
  
  const header = document.createElement('div');
  header.className = 'message-header';
  header.innerHTML = `<strong>${message.sender}</strong> <span class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>`;
  
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = message.message;
  
  messageDiv.appendChild(header);
  messageDiv.appendChild(content);
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendChatMessage(message, sender = 'User') {
  if (!isChatActive || !chatSessionId) return;
  
  try {
    const response = await fetch('/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionId, message, sender })
    });
    
    if (response.ok) {
      log(`Message sent to chat: ${message}`);
    }
  } catch (error) {
    log(`❌ Failed to send chat message: ${error.message}`);
  }
}

function stopChatSession() {
  if (isChatActive && chatSessionId) {
    socket.emit('leaveChat', chatSessionId);
    isChatActive = false;
    chatSessionId = null;
    hideChatInterface();
    log('🛑 Chat session stopped');
  }
}

function showChatInterface() {
  chatSection.style.display = 'block';
}

function hideChatInterface() {
  chatSection.style.display = 'none';
}

function checkForExistingChat() {
  const urlParams = new URLSearchParams(window.location.search);
  const chatParam = urlParams.get('chat');
  
  if (chatParam) {
    log(`🔗 Found existing chat session: ${chatParam}`);
    chatSessionId = chatParam;
    isChatActive = true;
    showChatInterface();
    socket.emit('joinChat', chatSessionId);
  }
}

// Event listeners
joinBtn.onclick = () => joinMeeting();
leaveBtn.onclick = () => leaveMeeting();
voiceTestBtn.onclick = () => testVoiceInMeeting();
transcriptionBtn.onclick = () => toggleTranscription();
apiToggleBtn.onclick = () => toggleAPIMode();
micPermissionBtn.onclick = () => requestMicrophonePermission();

// Real-time event listeners
realtimeBtn.onclick = () => startRealtimeProcessing();
stopRealtimeBtn.onclick = () => stopRealtimeProcessing();

// Gemini Live event listeners
const geminiLiveBtn = document.getElementById('geminiLiveBtn');
const stopGeminiLiveBtn = document.getElementById('stopGeminiLiveBtn');

geminiLiveBtn.onclick = () => startGeminiLive();
stopGeminiLiveBtn.onclick = () => stopGeminiLive();

// Chat input handling
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatInput();
  }
});

sendChatBtn.onclick = sendChatInput;

// New workflow functions
async function playReadyResponse() {
  try {
    log('🔊 Playing "I\'m ready" response...');
    
    // Create a simple "I'm ready" response
    const readyResponse = "I'm ready. Please ask your question.";
    
    // Convert to speech using OpenAI TTS
    const ttsResponse = await fetch('/api/openai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        text: readyResponse,
        voice: "alloy"
      })
    });
    
    if (!ttsResponse.ok) {
      throw new Error('Failed to generate ready response');
    }
    
    const ttsData = await ttsResponse.json();
    log(`💾 Ready response saved: ${ttsData.filename}`);
    
    // Play the response in the meeting
    await playResponseInMeeting(ttsData.filename);
    
    log('✅ Ready response played successfully');
    
  } catch (error) {
    log(`❌ Failed to play ready response: ${error.message}`);
  }
}

async function startQuestionRecording() {
  try {
    log('🎙️ Starting question recording...');
    
    // Update UI
    const realtimeInfo = document.getElementById('realtimeInfo');
    if (realtimeInfo) {
      realtimeInfo.textContent = '🎙️ Recording your question... (speak now)';
    }
    
    // Set state
    isWaitingForQuestion = true;
    questionChunks = [];
    
    // Start recording question
    questionRecording = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        volume: 1.0,
        sampleRate: 44100,
        channelCount: 2
      }
    });
    
    // Create MediaRecorder for question
    const questionMediaRecorder = new MediaRecorder(questionRecording, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    questionMediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        questionChunks.push(event.data);
      }
    };
    
    questionMediaRecorder.onstop = async () => {
      await processQuestionRecording();
    };
    
    // Start recording
    questionMediaRecorder.start();
    
    // Set timeout for question recording (10 seconds max)
    questionTimeout = setTimeout(async () => {
      log('⏰ Question recording timeout - processing...');
      questionMediaRecorder.stop();
    }, 10000);
    
    log('✅ Question recording started');
    
  } catch (error) {
    log(`❌ Failed to start question recording: ${error.message}`);
    isWaitingForQuestion = false;
  }
}

async function processQuestionRecording() {
  try {
    log('🔄 Processing recorded question...');
    
    // Update UI
    const realtimeInfo = document.getElementById('realtimeInfo');
    if (realtimeInfo) {
      realtimeInfo.textContent = '🔄 Processing your question...';
    }
    
    // Stop recording
    if (questionRecording) {
      questionRecording.getTracks().forEach(track => track.stop());
      questionRecording = null;
    }
    
    // Clear timeout
    if (questionTimeout) {
      clearTimeout(questionTimeout);
      questionTimeout = null;
    }
    
    // Create blob from chunks
    const questionBlob = new Blob(questionChunks, { type: 'audio/webm' });
    
    if (questionBlob.size === 0) {
      log('⚠️ No question audio recorded');
      resetToWakeWordListening();
      return;
    }
    
    // Convert to WAV and save
    const questionFilename = `question_${Date.now()}.wav`;
    await saveQuestionAsWAV(questionBlob, questionFilename);
    
    // Process the question
    await processRecordedAudio(questionFilename);
    
    // Reset to wake word listening
    resetToWakeWordListening();
    
  } catch (error) {
    log(`❌ Failed to process question recording: ${error.message}`);
    resetToWakeWordListening();
  }
}

async function saveQuestionAsWAV(blob, filename) {
  try {
    log(`💾 Saving question audio: ${filename}`);
    
    // Convert to WAV format
    const wavBlob = await audioBufferToWav(blob);
    
    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Audio = reader.result.split(',')[1];
      
      // Save to server
      const saveResponse = await fetch('/api/save-recording', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: filename,
          audioData: base64Audio
        })
      });
      
      if (!saveResponse.ok) {
        throw new Error('Failed to save question recording');
      }
      
      log(`✅ Question saved: ${filename}`);
    };
    
    reader.readAsDataURL(wavBlob);
    
  } catch (error) {
    log(`❌ Failed to save question: ${error.message}`);
  }
}

function resetToWakeWordListening() {
  log('🔄 Resetting to wake word listening...');
  
  // Reset state
  isWaitingForQuestion = false;
  questionChunks = [];
  isListeningForWakeWord = true;
  
  // Update UI
  const realtimeInfo = document.getElementById('realtimeInfo');
  if (realtimeInfo) {
    realtimeInfo.textContent = '🔴 Real-time processing active - listening for "MedForce AI"...';
  }
  
  log('✅ Ready to listen for wake word again');
}

// Gemini Live functions
async function startGeminiLive() {
  try {
    log('🚀 Starting Gemini Live mode...');
    
    // Start Gemini Live session
    const response = await fetch('/api/gemini/live/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to start Gemini Live session');
    }
    
    const data = await response.json();
    geminiSessionId = data.sessionId;
    isGeminiLiveActive = true;
    
    log(`✅ Gemini Live session started: ${geminiSessionId}`);
    
    // Connect to Gemini Live WebSocket
    await connectGeminiLiveWebSocket();
    
    // Start continuous audio processing
    await startGeminiAudioProcessing();
    
    // Update UI
    const realtimeInfo = document.getElementById('realtimeInfo');
    if (realtimeInfo) {
      realtimeInfo.textContent = '🔴 Gemini Live active - listening for "MedForce AI"...';
    }
    
  } catch (error) {
    log(`❌ Failed to start Gemini Live: ${error.message}`);
  }
}

async function connectGeminiLiveWebSocket() {
  try {
    log('🔌 Connecting to Gemini Live WebSocket...');
    
    // Connect to the Gemini Live namespace
    geminiSocket = io('/gemini-live');
    
    geminiSocket.on('connect', () => {
      log('✅ Connected to Gemini Live WebSocket');
      
      // Join the session
      geminiSocket.emit('join-session', geminiSessionId);
    });
    
    geminiSocket.on('session-joined', (data) => {
      log(`✅ Joined Gemini Live session: ${data.sessionId}`);
    });
    
    geminiSocket.on('gemini-ready', (data) => {
      log(`🤖 Gemini Live ready: ${data.message}`);
    });
    
    geminiSocket.on('gemini-response', (data) => {
      log(`💬 Gemini Live response: ${data.text}`);
      
      // Check for wake word in response
      if (data.text.toLowerCase().includes('medforce ai')) {
        log('🎯 Wake word detected in Gemini response!');
        playGeminiTextResponse(data.text);
      }
    });
    
    geminiSocket.on('error', (error) => {
      log(`❌ Gemini Live error: ${error.message}`);
    });
    
    geminiSocket.on('disconnect', () => {
      log('🔌 Gemini Live WebSocket disconnected');
    });
    
  } catch (error) {
    log(`❌ Failed to connect to Gemini Live WebSocket: ${error.message}`);
  }
}

async function startGeminiAudioProcessing() {
  try {
    // Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        volume: 1.0,
        sampleRate: 44100,
        channelCount: 2
      }
    });
    
    // Create audio context
    geminiAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = geminiAudioContext.createMediaStreamSource(stream);
    const analyser = geminiAudioContext.createAnalyser();
    const gainNode = geminiAudioContext.createGain();
    
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    gainNode.gain.value = 2.0; // Boost volume
    
    source.connect(gainNode);
    gainNode.connect(analyser);
    
    // Start continuous audio monitoring
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const processAudio = () => {
      if (!isGeminiLiveActive) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const normalizedVolume = average / 255;
      
      // Detect speech
      if (normalizedVolume > speechThreshold) {
        log(`🎤 Speech detected (volume: ${normalizedVolume.toFixed(3)}) - processing with Gemini...`);
        processGeminiAudio(stream);
      }
      
      requestAnimationFrame(processAudio);
    };
    
    processAudio();
    
    log('✅ Gemini audio processing started');
    
  } catch (error) {
    log(`❌ Failed to start Gemini audio processing: ${error.message}`);
  }
}

async function processGeminiAudio(stream) {
  try {
    // Create MediaRecorder for audio chunk
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    const chunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      await sendAudioToGemini(blob);
    };
    
    // Record for 3 seconds
    mediaRecorder.start();
    setTimeout(() => {
      mediaRecorder.stop();
    }, 3000);
    
  } catch (error) {
    log(`❌ Failed to process Gemini audio: ${error.message}`);
  }
}

async function sendAudioToGemini(audioBlob) {
  try {
    // Check if the blob is already in WAV format
    if (audioBlob.type === 'audio/wav' || audioBlob.type === 'audio/wave') {
      // Use the blob directly
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Audio = reader.result.split(',')[1];
        
        // Send audio data via WebSocket
        if (geminiSocket && geminiSocket.connected) {
          geminiSocket.emit('audio-data', {
            sessionId: geminiSessionId,
            audioData: base64Audio
          });
          log('📤 Audio data sent to Gemini Live via WebSocket');
        } else {
          log('❌ Gemini Live WebSocket not connected');
        }
      };
      
      reader.readAsDataURL(audioBlob);
      return;
    }
    
    // Convert WebM to PCM format (16-bit, 16kHz, mono) for Live API
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await geminiAudioContext.decodeAudioData(arrayBuffer);
    
    // Convert to PCM format as required by Live API
    const pcmData = convertToPCM(audioBuffer);
    const pcmBlob = new Blob([pcmData], { type: 'audio/pcm' });
    
    // Check if conversion was successful
    if (!pcmBlob || pcmBlob.size === 0) {
      log('⚠️ Audio conversion failed, skipping this chunk');
      return;
    }
    
    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Audio = reader.result.split(',')[1];
      
      // Send audio data via WebSocket
      if (geminiSocket && geminiSocket.connected) {
        geminiSocket.emit('audio-data', {
          sessionId: geminiSessionId,
          audioData: base64Audio
        });
        log('📤 Audio data sent to Gemini Live via WebSocket');
      } else {
        log('❌ Gemini Live WebSocket not connected');
      }
    };
    
    reader.readAsDataURL(pcmBlob);
    
  } catch (error) {
    log(`❌ Failed to send audio to Gemini: ${error.message}`);
  }
}

// Convert AudioBuffer to PCM format (16-bit, 16kHz, mono)
function convertToPCM(audioBuffer) {
  const length = audioBuffer.length;
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;
  
  // Resample to 16kHz if needed
  const targetSampleRate = 16000;
  const ratio = sampleRate / targetSampleRate;
  const newLength = Math.floor(length / ratio);
  
  const pcmData = new Int16Array(newLength);
  const channelData = audioBuffer.getChannelData(0);
  
  for (let i = 0; i < newLength; i++) {
    const sourceIndex = Math.floor(i * ratio);
    const sample = Math.max(-1, Math.min(1, channelData[sourceIndex]));
    pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  
  return pcmData.buffer;
}

async function playGeminiResponse(data) {
  try {
    if (data.audio) {
      await playGeminiAudioResponse(data.audio);
    } else if (data.text) {
      // Convert text to speech using OpenAI TTS
      const ttsResponse = await fetch('/api/openai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: data.text,
          voice: "alloy"
        })
      });
      
      if (ttsResponse.ok) {
        const ttsData = await ttsResponse.json();
        await playResponseInMeeting(ttsData.filename);
      }
    }
  } catch (error) {
    log(`❌ Failed to play Gemini response: ${error.message}`);
  }
}

async function playGeminiAudioResponse(base64Audio) {
  try {
    // Convert base64 to blob
    const audioBlob = new Blob([Buffer.from(base64Audio, 'base64')], { type: 'audio/mp3' });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // Create audio element
    const audio = new Audio(audioUrl);
    
    // Play in meeting
    await injectAudioIntoMeeting(audio);
    
    // Cleanup
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
    };
    
  } catch (error) {
    log(`❌ Failed to play Gemini audio response: ${error.message}`);
  }
}

async function playGeminiTextResponse(text) {
  try {
    // Convert text to speech using OpenAI TTS
    const ttsResponse = await fetch('/api/openai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        voice: "alloy"
      })
    });
    
    if (ttsResponse.ok) {
      const ttsData = await ttsResponse.json();
      await playResponseInMeeting(ttsData.filename);
    }
  } catch (error) {
    log(`❌ Failed to play Gemini text response: ${error.message}`);
  }
}

async function stopGeminiLive() {
  try {
    log('🛑 Stopping Gemini Live...');
    
    isGeminiLiveActive = false;
    
    // Disconnect WebSocket
    if (geminiSocket) {
      geminiSocket.disconnect();
      geminiSocket = null;
    }
    
    // End Gemini session
    if (geminiSessionId) {
      await fetch('/api/gemini/live/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: geminiSessionId })
      });
    }
    
    // Cleanup audio context
    if (geminiAudioContext) {
      await geminiAudioContext.close();
      geminiAudioContext = null;
    }
    
    geminiSessionId = null;
    
    // Update UI
    const realtimeInfo = document.getElementById('realtimeInfo');
    if (realtimeInfo) {
      realtimeInfo.textContent = 'Gemini Live stopped';
    }
    
    log('✅ Gemini Live stopped');
    
  } catch (error) {
    log(`❌ Failed to stop Gemini Live: ${error.message}`);
  }
}

function sendChatInput() {
  const message = chatInput.value.trim();
  if (message && isChatActive) {
    sendChatMessage(message);
    chatInput.value = '';
  }
}
