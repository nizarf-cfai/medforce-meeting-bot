var App = (() => {
  // client/main-graph.js
  var socket;
  var chatSessionId;
  var isChatActive = false;
  var currentCall = null;
  var isInMeeting = false;
  var joinBtn = document.getElementById("joinBtn");
  var leaveBtn = document.getElementById("leaveBtn");
  var voiceTestBtn = document.getElementById("voiceTestBtn");
  var transcriptionBtn = document.getElementById("transcriptionBtn");
  var chatInput = document.getElementById("chatInput");
  var sendChatBtn = document.getElementById("sendChatBtn");
  var chatContainer = document.getElementById("chatContainer");
  var chatSection = document.getElementById("chatSection");
  var logElement = document.getElementById("log");
  function log(message) {
    console.log(message);
    const logDiv = document.createElement("div");
    logDiv.textContent = (/* @__PURE__ */ new Date()).toLocaleTimeString() + ": " + message;
    logElement.appendChild(logDiv);
    logElement.scrollTop = logElement.scrollHeight;
  }
  document.addEventListener("DOMContentLoaded", () => {
    log("\u{1F680} Microsoft Graph API Teams Bot initialized");
    log("\u{1F4A1} This version uses Bot Framework + Microsoft Graph API for full meeting integration");
    checkForExistingChat();
    initializeSocket();
  });
  function initializeSocket() {
    socket = io();
    socket.on("connect", () => {
      log("\u2705 Connected to chat server");
    });
    socket.on("chatMessage", (message) => {
      displayChatMessage(message);
    });
    socket.on("chatHistory", (messages) => {
      messages.forEach((msg) => displayChatMessage(msg));
    });
    socket.on("disconnect", () => {
      log("\u274C Disconnected from chat server");
    });
  }
  async function joinMeeting() {
    const meetingLink = document.getElementById("meetingLink").value.trim();
    if (!meetingLink) {
      log("\u274C Please enter a Teams meeting link");
      return;
    }
    if (!meetingLink.includes("teams.microsoft.com")) {
      log("\u274C Please enter a valid Teams meeting link");
      return;
    }
    try {
      log("\u{1F916} Joining meeting via Microsoft Graph API...");
      const accessToken = await getAccessToken();
      if (!accessToken) {
        log("\u274C Failed to get access token. Please check your app registration.");
        return;
      }
      const response = await fetch("/api/graph/join-meeting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          meetingLink,
          accessToken
        })
      });
      const result = await response.json();
      if (result.success) {
        log("\u2705 Successfully joined meeting via Microsoft Graph API!");
        log("\u{1F3A4} Bot is now in the meeting and can provide voice responses");
        isInMeeting = true;
        currentCall = result.callId;
        joinBtn.disabled = true;
        leaveBtn.disabled = false;
        voiceTestBtn.disabled = false;
        transcriptionBtn.disabled = false;
        await startChatSession(meetingLink);
        setTimeout(() => {
          testVoiceInMeeting();
        }, 2e3);
      } else {
        log(`\u274C Failed to join meeting: ${result.error}`);
      }
    } catch (error) {
      log(`\u274C Error joining meeting: ${error.message}`);
    }
  }
  async function leaveMeeting() {
    if (!isInMeeting) {
      log("\u274C Not currently in a meeting");
      return;
    }
    try {
      log("\u{1F6AA} Leaving meeting...");
      const response = await fetch("/api/graph/leave-meeting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const result = await response.json();
      if (result.success) {
        log("\u2705 Successfully left the meeting");
        isInMeeting = false;
        currentCall = null;
        joinBtn.disabled = false;
        leaveBtn.disabled = true;
        voiceTestBtn.disabled = true;
        transcriptionBtn.disabled = true;
        stopChatSession();
      } else {
        log(`\u274C Failed to leave meeting: ${result.error}`);
      }
    } catch (error) {
      log(`\u274C Error leaving meeting: ${error.message}`);
    }
  }
  async function testVoiceInMeeting() {
    if (!isInMeeting) {
      log("\u274C Not currently in a meeting");
      return;
    }
    try {
      log("\u{1F3A4} Testing voice in meeting...");
      const response = await fetch("/api/graph/test-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const result = await response.json();
      if (result.success) {
        log("\u2705 Voice test completed! Check if you can hear the bot in the meeting.");
        if (isChatActive) {
          await sendChatMessage("\u{1F3A4} Voice test: Hello! I can speak in the meeting!", "Bot");
        }
      } else {
        log(`\u274C Voice test failed: ${result.error}`);
      }
    } catch (error) {
      log(`\u274C Error testing voice: ${error.message}`);
    }
  }
  async function startTranscription() {
    if (!isInMeeting) {
      log("\u274C Not currently in a meeting");
      return;
    }
    try {
      log("\u{1F3A4} Starting audio transcription...");
      const response = await fetch("/api/graph/start-transcription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const result = await response.json();
      if (result.success) {
        log("\u2705 Audio transcription started! Bot will now transcribe meeting audio.");
        transcriptionBtn.textContent = "Stop Transcription";
        if (isChatActive) {
          await sendChatMessage("\u{1F3A4} Audio transcription started. I will now transcribe the meeting audio.", "Bot");
        }
      } else {
        log(`\u274C Failed to start transcription: ${result.error}`);
      }
    } catch (error) {
      log(`\u274C Error starting transcription: ${error.message}`);
    }
  }
  async function stopTranscription() {
    try {
      log("\u{1F6D1} Stopping audio transcription...");
      transcriptionBtn.textContent = "Start Transcription";
      log("\u2705 Audio transcription stopped.");
      if (isChatActive) {
        await sendChatMessage("\u{1F6D1} Audio transcription stopped.", "Bot");
      }
    } catch (error) {
      log(`\u274C Error stopping transcription: ${error.message}`);
    }
  }
  async function toggleTranscription() {
    if (transcriptionBtn.textContent.includes("Start")) {
      await startTranscription();
    } else {
      await stopTranscription();
    }
  }
  async function getAccessToken() {
    try {
      log("\u{1F511} Getting access token...");
      return null;
    } catch (error) {
      log(`\u274C Error getting access token: ${error.message}`);
      return null;
    }
  }
  async function startChatSession(meetingId) {
    try {
      log("\u{1F504} Starting chat session...");
      const response = await fetch("/chat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId })
      });
      const data = await response.json();
      chatSessionId = data.sessionId;
      isChatActive = true;
      socket.emit("joinChat", chatSessionId);
      showChatInterface();
      await sendChatMessage("\u{1F916} Bot has joined the meeting via Microsoft Graph API!", "Bot");
      await sendChatMessage("\u{1F3A4} I can now provide voice responses and audio transcription!", "Bot");
      log("\u2705 Chat session started successfully");
    } catch (error) {
      log(`\u274C Failed to start chat session: ${error.message}`);
    }
  }
  function displayChatMessage(message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${message.sender === "Bot" ? "bot-message" : "user-message"}`;
    const header = document.createElement("div");
    header.className = "message-header";
    header.innerHTML = `<strong>${message.sender}</strong> <span class="timestamp">${new Date(message.timestamp).toLocaleTimeString()}</span>`;
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message.message;
    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  async function sendChatMessage(message, sender = "User") {
    if (!isChatActive || !chatSessionId) return;
    try {
      const response = await fetch("/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: chatSessionId, message, sender })
      });
      if (response.ok) {
        log(`Message sent to chat: ${message}`);
      }
    } catch (error) {
      log(`\u274C Failed to send chat message: ${error.message}`);
    }
  }
  function stopChatSession() {
    if (isChatActive && chatSessionId) {
      socket.emit("leaveChat", chatSessionId);
      isChatActive = false;
      chatSessionId = null;
      hideChatInterface();
      log("\u{1F6D1} Chat session stopped");
    }
  }
  function showChatInterface() {
    chatSection.style.display = "block";
  }
  function hideChatInterface() {
    chatSection.style.display = "none";
  }
  function checkForExistingChat() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatParam = urlParams.get("chat");
    if (chatParam) {
      log(`\u{1F517} Found existing chat session: ${chatParam}`);
      chatSessionId = chatParam;
      isChatActive = true;
      showChatInterface();
      socket.emit("joinChat", chatSessionId);
    }
  }
  joinBtn.onclick = () => joinMeeting();
  leaveBtn.onclick = () => leaveMeeting();
  voiceTestBtn.onclick = () => testVoiceInMeeting();
  transcriptionBtn.onclick = () => toggleTranscription();
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendChatInput();
    }
  });
  sendChatBtn.onclick = sendChatInput;
  function sendChatInput() {
    const message = chatInput.value.trim();
    if (message && isChatActive) {
      sendChatMessage(message);
      chatInput.value = "";
    }
  }
})();
//# sourceMappingURL=app-graph.js.map
