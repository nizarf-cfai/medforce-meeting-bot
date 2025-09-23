// client/main.js
import { CallClient } from "@azure/communication-calling";
import { AzureCommunicationTokenCredential } from "@azure/communication-common";

const logBox = document.getElementById("log");
const log = (...a) => { logBox.textContent += a.join(" ") + "\n"; console.log(...a); };

const joinBtn   = document.getElementById("joinBtn");
const leaveBtn  = document.getElementById("leaveBtn");
const muteBtn   = document.getElementById("muteBtn");
const unmuteBtn = document.getElementById("unmuteBtn");
const micSelect = document.getElementById("micSelect");


let callClient, callAgent, deviceManager, currentCall;
let socket, chatSessionId, isChatActive = false;
let audioContext, analyser, microphone, transcriptionActive = false;

// Voice Q&A elements
const voiceQnABtn = document.createElement('button');
voiceQnABtn.textContent = 'Ask by Voice';
document.body.appendChild(voiceQnABtn);

// Voice test button
const voiceTestBtn = document.createElement('button');
voiceTestBtn.textContent = 'Test Voice in Meeting';
voiceTestBtn.style.marginLeft = '8px';
document.body.appendChild(voiceTestBtn);

// Transcription toggle button
const transcriptionBtn = document.createElement('button');
transcriptionBtn.textContent = 'Start Audio Transcription';
transcriptionBtn.style.marginLeft = '8px';
document.body.appendChild(transcriptionBtn);

const synth = window.speechSynthesis;
let recognition;
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
}

function speak(text) {
  if (!synth) return;
  const utter = new SpeechSynthesisUtterance(text);
  synth.speak(utter);
}

// Test voice in meeting
async function testVoiceInMeeting() {
  if (!currentCall) {
    log('❌ Not in a meeting. Please join a meeting first.');
    return;
  }
  
  log('🎤 Testing voice in meeting...');
  
  // Test message to speak
  const testMessage = "Hello! This is a voice test from the bot. I can speak in the meeting!";
  
  // For now, we'll use local TTS and send a message to chat
  // In a real implementation, you would need to use the meeting's audio stream
  speak(testMessage);
  
  // Send to chat if available
  if (isChatActive) {
    await sendChatMessage(`🎤 Voice test: ${testMessage}`, 'Bot');
  }
  
  log('✅ Voice test completed.');
  log('💡 Note: TTS is playing locally. To send audio to meeting, you need to use the meeting\'s audio stream.');
  log('💡 Current limitation: ACS doesn\'t support sending TTS audio directly to Teams meetings.');
}

// Audio transcription functionality
async function toggleTranscription() {
  if (!currentCall) {
    log('❌ Not in a meeting. Please join a meeting first.');
    return;
  }
  
  if (!transcriptionActive) {
    await startTranscription();
  } else {
    stopTranscription();
  }
}

async function startTranscription() {
  try {
    log('🎤 Starting audio transcription...');
    
    // For now, we'll simulate transcription without accessing microphone
    // In a real implementation, you would need to access the meeting's audio stream
    transcriptionActive = true;
    transcriptionBtn.textContent = 'Stop Audio Transcription';
    
    // Start simulated transcription monitoring
    startSimulatedTranscription();
    
    log('✅ Audio transcription started. Simulating meeting audio monitoring...');
    log('💡 Note: This is simulated transcription. Real implementation would access meeting audio stream.');
    
  } catch (error) {
    log('❌ Failed to start transcription:', error.message);
  }
}

function stopTranscription() {
  transcriptionActive = false;
  transcriptionBtn.textContent = 'Start Audio Transcription';
  
  if (audioContext) {
    audioContext.close();
  }
  
  log('🛑 Audio transcription stopped.');
}

function startSimulatedTranscription() {
  if (!transcriptionActive) return;
  
  // Simulate receiving transcription every 5-10 seconds
  const delay = Math.random() * 5000 + 5000; // 5-10 seconds
  
  setTimeout(() => {
    if (transcriptionActive) {
      simulateTranscription();
      startSimulatedTranscription(); // Continue the cycle
    }
  }, delay);
}

function monitorAudioLevels(analyser, dataArray) {
  if (!transcriptionActive) return;
  
  analyser.getByteFrequencyData(dataArray);
  
  // Calculate average audio level
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const average = sum / dataArray.length;
  
  // If audio level is above threshold, simulate transcription
  if (average > 30) {
    simulateTranscription();
  }
  
  // Continue monitoring
  setTimeout(() => monitorAudioLevels(analyser, dataArray), 100);
}

function simulateTranscription() {
  // Simulate receiving transcribed text (in real implementation, this would come from speech-to-text service)
  const simulatedTexts = [
    "Hello, can everyone hear me?",
    "Let's start the meeting",
    "What's the agenda for today?",
    "I have a question about the project",
    "That sounds good to me",
    "Can we schedule the next meeting?",
    "Thank you everyone"
  ];
  
  const randomText = simulatedTexts[Math.floor(Math.random() * simulatedTexts.length)];
  const timestamp = new Date().toLocaleTimeString();
  
  // Display transcription on web interface
  displayTranscription(randomText, timestamp);
  
  // Send to chat if active
  if (isChatActive) {
    sendChatMessage(`🎤 [${timestamp}] ${randomText}`, 'Transcription');
  }
}

function displayTranscription(text, timestamp) {
  // Create transcription display area if it doesn't exist
  let transcriptionArea = document.getElementById('transcriptionArea');
  if (!transcriptionArea) {
    transcriptionArea = document.createElement('div');
    transcriptionArea.id = 'transcriptionArea';
    transcriptionArea.style.cssText = `
      margin-top: 16px;
      padding: 12px;
      background: #f0f8ff;
      border: 1px solid #4a90e2;
      border-radius: 8px;
      max-height: 200px;
      overflow-y: auto;
    `;
    transcriptionArea.innerHTML = '<h4>🎤 Meeting Transcription</h4>';
    document.body.appendChild(transcriptionArea);
  }
  
  // Add new transcription entry
  const entry = document.createElement('div');
  entry.style.cssText = `
    margin: 4px 0;
    padding: 4px 8px;
    background: white;
    border-radius: 4px;
    font-size: 14px;
  `;
  entry.innerHTML = `<strong>[${timestamp}]</strong> ${text}`;
  transcriptionArea.appendChild(entry);
  
  // Auto-scroll to bottom
  transcriptionArea.scrollTop = transcriptionArea.scrollHeight;
}

// Chat streaming functionality
async function startChatSession(meetingId) {
  log('🔄 startChatSession called with meetingId:', meetingId);
  try {
    log('📤 Sending request to /chat/start...');
    const response = await fetch('/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId, botName: "Meeting Bot" })
    });
    
    log('📥 Response received:', response.status, response.statusText);
    if (!response.ok) throw new Error('Failed to start chat session');
    
    const data = await response.json();
    log('📋 Response data:', data);
    const { sessionId } = data;
    chatSessionId = sessionId;
    
    // Initialize WebSocket connection
    socket = io();
    
    socket.on('connect', () => {
      log('Connected to chat server');
      socket.emit('joinChat', sessionId);
    });
    
    socket.on('chatHistory', (messages) => {
      log('Received chat history:', messages.length, 'messages');
      messages.forEach(msg => displayChatMessage(msg));
    });
    
    socket.on('chatMessage', (message) => {
      displayChatMessage(message);
      // Read message aloud if it's from a participant
      if (message.sender !== 'Bot') {
        speak(`New message from ${message.sender}: ${message.text}`);
      }
    });
    
    socket.on('participantJoined', (data) => {
      log('Participant joined chat:', data.participantId);
    });
    
    socket.on('participantLeft', (data) => {
      log('Participant left chat:', data.participantId);
    });
    
    socket.on('error', (error) => {
      log('Chat error:', error.message);
    });
    
    isChatActive = true;
    log('🔄 Attempting to show chat interface...');
    showChatInterface();
    log('✅ Chat session started successfully:', sessionId);
    return sessionId;
  } catch (error) {
    log('Failed to start chat session:', error.message);
    return null;
  }
}

function displayChatMessage(message) {
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${message.sender === 'Bot' ? 'bot-message' : 'user-message'}`;
  messageDiv.innerHTML = `
    <div class="message-header">
      <strong>${message.sender}</strong>
      <span class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>
    </div>
    <div class="message-content">${message.text}</div>
  `;
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function sendChatMessage(message, sender = 'Bot') {
  if (!chatSessionId || !socket) {
    log('Chat session not active');
    return;
  }
  
  try {
    const response = await fetch('/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionId, message, sender })
    });
    
    if (!response.ok) throw new Error('Failed to send message');
    
    log('Message sent to chat:', message);
  } catch (error) {
    log('Failed to send chat message:', error.message);
  }
}

function stopChatSession() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  chatSessionId = null;
  isChatActive = false;
  hideChatInterface();
  log('Chat session stopped');
}

async function askOpenAI(question) {
  const res = await fetch('/openai-qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question })
  });
  if (!res.ok) throw new Error('OpenAI Q&A failed');
  const data = await res.json();
  return data.answer;
}

voiceQnABtn.onclick = () => {
  if (!recognition) {
    alert('Speech recognition not supported in this browser.');
    return;
  }
  log('Listening for your question...');
  recognition.start();
};

if (recognition) {
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    log('You asked:', transcript);
    
    // Send user question to chat
    if (isChatActive) {
      await sendChatMessage(transcript, 'User');
    }
    
    try {
      const answer = await askOpenAI(transcript);
      log('Bot:', answer);
      speak(answer);
      
      // Send bot answer to chat
      if (isChatActive) {
        await sendChatMessage(answer, 'Bot');
      }
    } catch (e) {
      log('Error:', e.message || e);
      if (isChatActive) {
        await sendChatMessage('Sorry, I encountered an error processing your question.', 'Bot');
      }
    }
  };
  recognition.onerror = (event) => {
    log('Speech recognition error:', event.error);
  };
}

async function fetchToken() {
  const res = await fetch("/token", { method: "POST" });
  if (!res.ok) throw new Error("Failed to get ACS token from server");
  return res.json();
}

async function initCalling(token) {
  callClient = new CallClient();
  const tokenCredential = new AzureCommunicationTokenCredential(token);
  callAgent = await callClient.createCallAgent(tokenCredential, { displayName: "ACS Web Agent" });

  deviceManager = await callClient.getDeviceManager();
  // Don't ask for microphone permission - we'll use speech audio only
  // await deviceManager.askDevicePermission({ audio: true });

  // populate mics (but don't select any)
  const mics = await deviceManager.getMicrophones();
  micSelect.innerHTML = "<option value=''>No Microphone (Speech Audio Only)</option>";
  mics.forEach((m, i) => {
    const opt = document.createElement("option");
    opt.value = m.id; opt.textContent = m.name || `Microphone ${i+1}`;
    micSelect.appendChild(opt);
  });
  // Don't auto-select microphone - use speech audio only
  // if (mics[0]) await deviceManager.selectMicrophone(mics[0]);
}

async function joinMeeting() {
  const meetingLink = document.getElementById("meetingLink").value.trim();
  if (!meetingLink) { alert("Paste the full Teams meeting link."); return; }

  log("Requesting ACS token…");
  const { token, user } = await fetchToken();
  log("Got token for user:", user.id);

  log("Initializing Calling SDK…");
  await initCalling(token);

  // Don't use microphone - speech audio only
  log('🎤 Using speech audio only (no microphone input)');

  log("Joining meeting…");
  const locator = { meetingLink }; // Teams interop join-by-link
  currentCall = await callAgent.join(locator, {});

  currentCall.on("stateChanged", async () => {
    log("Call state:", currentCall.state);
    
    // Auto-start chat session when call connects
    if (currentCall.state === "Connected" && !isChatActive) {
      log('🔄 Call connected - auto-starting chat session...');
      try {
        const meetingId = meetingLink.split('/').pop() || 'meeting-' + Date.now();
        log('📝 Meeting ID:', meetingId);
        
        const sessionId = await startChatSession(meetingId);
        log('✅ Chat session started with ID:', sessionId);
        
        // Send initial bot messages
        await sendChatMessage("🤖 Bot has joined the meeting and is ready to help!");
        
        // Generate shareable chat link
        const chatLink = `${window.location.origin}?chat=${chatSessionId}`;
        await sendChatMessage(`💡 Share this chat link with other participants: ${chatLink}`);
        await sendChatMessage("📝 This is a parallel chat interface that works alongside the Teams meeting!");
        
        // Auto voice test
        setTimeout(() => {
          log('🎤 Auto voice test starting...');
          speak("Hello everyone! I'm the meeting bot and I can speak in this meeting!");
          log('💡 Note: TTS is playing locally. For meeting audio, you need Microsoft Graph API integration.');
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

  // Handle other call events safely - removed problematic event subscription
  log("Call setup complete - chat will start automatically when connected");

  leaveBtn.disabled = false;
  muteBtn.disabled = false;
  unmuteBtn.disabled = false;

  log('Join requested. Check Teams roster for "ACS Web Agent".');
}

async function leaveMeeting() {
  if (currentCall) {
    try { await currentCall.hangUp({ forEveryone: false }); } catch {}
    currentCall = undefined;
  }
  
  // Stop chat session
  stopChatSession();
  
  leaveBtn.disabled = true;
  muteBtn.disabled = true;
  unmuteBtn.disabled = true;
  log("Left the meeting.");
}

async function muteSelf() {
  if (!currentCall) return;
  try { await currentCall.mute(); log("Muted."); } catch (e) { log("Mute error:", e.message || e); }
}

async function unmuteSelf() {
  if (!currentCall) return;
  try { await currentCall.unmute(); log("Unmuted."); } catch (e) { log("Unmute error:", e.message || e); }
}

// Chat input functionality
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatSection = document.getElementById('chatSection');

function showChatInterface() {
  if (chatSection) {
    chatSection.style.display = 'block';
    log('✅ Chat interface is now visible!');
  } else {
    log('❌ Error: Chat section element not found');
  }
}

function hideChatInterface() {
  chatSection.style.display = 'none';
}

async function sendChatInput() {
  const message = chatInput.value.trim();
  if (!message || !isChatActive) return;
  
  chatInput.value = '';
  await sendChatMessage(message, 'User');
}

sendChatBtn.onclick = sendChatInput;
chatInput.onkeypress = (e) => {
  if (e.key === 'Enter') sendChatInput();
};

// Check for existing chat session in URL
function checkForExistingChat() {
  const urlParams = new URLSearchParams(window.location.search);
  const existingChatSessionId = urlParams.get('chat');
  
  if (existingChatSessionId) {
    log('Found existing chat session in URL:', existingChatSessionId);
    // Join the existing chat session
    startChatSession('existing-session').then(() => {
      // Override the session ID with the one from URL
      window.chatSessionId = existingChatSessionId;
      showChatInterface();
      sendChatMessage('👋 Joined existing chat session!');
    });
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Test if chat elements exist
  const chatSection = document.getElementById('chatSection');
  const chatContainer = document.getElementById('chatContainer');
  const chatInput = document.getElementById('chatInput');
  
  if (chatSection && chatContainer && chatInput) {
    log('✅ All chat interface elements found');
  } else {
    log('❌ Missing chat interface elements:', {
      chatSection: !!chatSection,
      chatContainer: !!chatContainer,
      chatInput: !!chatInput
    });
  }
  
  checkForExistingChat();
});

joinBtn.onclick = () => joinMeeting().catch(e => log("Error:", e.message || e));
leaveBtn.onclick = () => leaveMeeting();
muteBtn.onclick = () => muteSelf();
unmuteBtn.onclick = () => unmuteSelf();
voiceTestBtn.onclick = () => testVoiceInMeeting();
transcriptionBtn.onclick = () => toggleTranscription();
