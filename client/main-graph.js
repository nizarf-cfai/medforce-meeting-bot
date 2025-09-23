// Microsoft Graph API Teams Bot Integration
// This client integrates with the Bot Framework and Microsoft Graph API

// Global variables
let socket, chatSessionId, isChatActive = false;
let currentCall = null;
let isInMeeting = false;

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
  log('🚀 Microsoft Graph API Teams Bot initialized');
  log('💡 This version uses Bot Framework + Microsoft Graph API for full meeting integration');
  
  // Check for existing chat session in URL
  checkForExistingChat();
  
  // Initialize Socket.IO connection
  initializeSocket();
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

// Join meeting using Microsoft Graph API
async function joinMeeting() {
  const meetingLink = document.getElementById('meetingLink').value.trim();
  
  if (!meetingLink) {
    log('❌ Please enter a Teams meeting link');
    return;
  }
  
  if (!meetingLink.includes('teams.microsoft.com')) {
    log('❌ Please enter a valid Teams meeting link');
    return;
  }
  
  try {
    log('🤖 Joining meeting via Microsoft Graph API...');
    
    // Get access token (you'll need to implement this based on your app registration)
    const accessToken = await getAccessToken();
    
    if (!accessToken) {
      log('❌ Failed to get access token. Please check your app registration.');
      return;
    }
    
    // Join meeting via Graph API
    const response = await fetch('/api/graph/join-meeting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meetingLink: meetingLink,
        accessToken: accessToken
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Successfully joined meeting via Microsoft Graph API!');
      log('🎤 Bot is now in the meeting and can provide voice responses');
      
      isInMeeting = true;
      currentCall = result.callId;
      
      // Update UI
      joinBtn.disabled = true;
      leaveBtn.disabled = false;
      voiceTestBtn.disabled = false;
      transcriptionBtn.disabled = false;
      
      // Start chat session
      await startChatSession(meetingLink);
      
      // Auto-play welcome message
      setTimeout(() => {
        testVoiceInMeeting();
      }, 2000);
      
    } else {
      log(`❌ Failed to join meeting: ${result.error}`);
    }
    
  } catch (error) {
    log(`❌ Error joining meeting: ${error.message}`);
  }
}

// Leave meeting
async function leaveMeeting() {
  if (!isInMeeting) {
    log('❌ Not currently in a meeting');
    return;
  }
  
  try {
    log('🚪 Leaving meeting...');
    
    const response = await fetch('/api/graph/leave-meeting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Successfully left the meeting');
      
      isInMeeting = false;
      currentCall = null;
      
      // Update UI
      joinBtn.disabled = false;
      leaveBtn.disabled = true;
      voiceTestBtn.disabled = true;
      transcriptionBtn.disabled = true;
      
      // Stop chat session
      stopChatSession();
      
    } else {
      log(`❌ Failed to leave meeting: ${result.error}`);
    }
    
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
    
    const response = await fetch('/api/graph/test-voice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Voice test completed! Check if you can hear the bot in the meeting.');
      
      // Send to chat if available
      if (isChatActive) {
        await sendChatMessage('🎤 Voice test: Hello! I can speak in the meeting!', 'Bot');
      }
    } else {
      log(`❌ Voice test failed: ${result.error}`);
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
    
    const response = await fetch('/api/graph/start-transcription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      log('✅ Audio transcription started! Bot will now transcribe meeting audio.');
      transcriptionBtn.textContent = 'Stop Transcription';
      
      // Send to chat if available
      if (isChatActive) {
        await sendChatMessage('🎤 Audio transcription started. I will now transcribe the meeting audio.', 'Bot');
      }
    } else {
      log(`❌ Failed to start transcription: ${result.error}`);
    }
    
  } catch (error) {
    log(`❌ Error starting transcription: ${error.message}`);
  }
}

// Stop audio transcription
async function stopTranscription() {
  try {
    log('🛑 Stopping audio transcription...');
    
    // For now, we'll just update the UI
    // In a real implementation, you'd call the Graph API to stop transcription
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

// Toggle transcription
async function toggleTranscription() {
  if (transcriptionBtn.textContent.includes('Start')) {
    await startTranscription();
  } else {
    await stopTranscription();
  }
}

// Get access token (you'll need to implement this based on your app registration)
async function getAccessToken() {
  try {
    // This is a placeholder - you'll need to implement actual token acquisition
    // based on your Azure AD app registration
    
    // For now, return a placeholder token
    // In practice, you'd use MSAL or similar to get the token
    log('🔑 Getting access token...');
    
    // You can implement this using:
    // 1. MSAL.js for client-side token acquisition
    // 2. Server-side token acquisition using client credentials
    // 3. Interactive token acquisition
    
    // For now, return null to indicate token acquisition is needed
    return null;
    
  } catch (error) {
    log(`❌ Error getting access token: ${error.message}`);
    return null;
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
    
    // Send initial messages
    await sendChatMessage('🤖 Bot has joined the meeting via Microsoft Graph API!', 'Bot');
    await sendChatMessage('🎤 I can now provide voice responses and audio transcription!', 'Bot');
    
    log('✅ Chat session started successfully');
    
  } catch (error) {
    log(`❌ Failed to start chat session: ${error.message}`);
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

// Chat input handling
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatInput();
  }
});

sendChatBtn.onclick = sendChatInput;

function sendChatInput() {
  const message = chatInput.value.trim();
  if (message && isChatActive) {
    sendChatMessage(message);
    chatInput.value = '';
  }
}
