// server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { CommunicationIdentityClient } from "@azure/communication-identity";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Store active chat sessions
const chatSessions = new Map();


const connectionString = process.env.ACS_CONNECTION_STRING;
if (!connectionString) {
  console.error("Missing ACS_CONNECTION_STRING in .env");
  process.exit(1);
}
const identityClient = new CommunicationIdentityClient(connectionString);

// Issues a fresh ACS user token for the browser (VOIP scope)
app.post("/token", async (_req, res) => {
  try {
    const user = await identityClient.createUser();
    const { token, expiresOn } = await identityClient.getToken(user, ["voip"]);
    res.json({ token, expiresOn, user: { id: user.communicationUserId } });
  } catch (e) {
    console.error("Failed to issue token:", e);
    res.status(500).json({ error: "Failed to issue token" });
  }
});

// Chat streaming endpoints
app.post('/chat/start', (req, res) => {
  const { meetingId, botName = "Meeting Bot" } = req.body;
  const sessionId = uuidv4();
  
  chatSessions.set(sessionId, {
    meetingId,
    botName,
    messages: [],
    participants: new Set(),
    createdAt: new Date()
  });
  
  res.json({ sessionId, botName });
});

app.post('/chat/send', (req, res) => {
  const { sessionId, message, sender = "Bot" } = req.body;
  
  if (!chatSessions.has(sessionId)) {
    return res.status(404).json({ error: "Chat session not found" });
  }
  
  const session = chatSessions.get(sessionId);
  const chatMessage = {
    id: uuidv4(),
    text: message,
    sender,
    timestamp: new Date(),
    type: 'message'
  };
  
  session.messages.push(chatMessage);
  
  // Broadcast to all connected clients in this session
  io.to(sessionId).emit('chatMessage', chatMessage);
  
  res.json({ success: true, messageId: chatMessage.id });
});

app.get('/chat/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  
  if (!chatSessions.has(sessionId)) {
    return res.status(404).json({ error: "Chat session not found" });
  }
  
  const session = chatSessions.get(sessionId);
  res.json({ messages: session.messages });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('joinChat', (sessionId) => {
    if (chatSessions.has(sessionId)) {
      socket.join(sessionId);
      const session = chatSessions.get(sessionId);
      session.participants.add(socket.id);
      
      // Send existing messages to the new participant
      socket.emit('chatHistory', session.messages);
      
      // Notify others about new participant
      socket.to(sessionId).emit('participantJoined', {
        participantId: socket.id,
        timestamp: new Date()
      });
      
      console.log(`Client ${socket.id} joined chat session ${sessionId}`);
    } else {
      socket.emit('error', { message: 'Chat session not found' });
    }
  });
  
  socket.on('sendMessage', (data) => {
    const { sessionId, message, sender } = data;
    
    if (!chatSessions.has(sessionId)) {
      socket.emit('error', { message: 'Chat session not found' });
      return;
    }
    
    const session = chatSessions.get(sessionId);
    const chatMessage = {
      id: uuidv4(),
      text: message,
      sender: sender || 'Participant',
      timestamp: new Date(),
      type: 'message'
    };
    
    session.messages.push(chatMessage);
    
    // Broadcast to all participants in the session
    io.to(sessionId).emit('chatMessage', chatMessage);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove from all sessions
    chatSessions.forEach((session, sessionId) => {
      if (session.participants.has(socket.id)) {
        session.participants.delete(socket.id);
        socket.to(sessionId).emit('participantLeft', {
          participantId: socket.id,
          timestamp: new Date()
        });
      }
    });
  });
});


// Serve the built client and static files
app.use(express.static(path.join(__dirname, "public")));

// OpenAI Q&A endpoint
import fetch from 'node-fetch';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/openai-qa', async (req, res) => {
  const { question } = req.body;
  console.log('Received Q&A request:', question);
  if (!OPENAI_API_KEY) {
    console.error('Missing OpenAI API key');
    return res.status(500).json({ error: 'Missing OpenAI API key' });
  }
  if (!question) {
    console.error('Missing question in request');
    return res.status(400).json({ error: 'Missing question' });
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: question }],
        max_tokens: 256
      })
    });
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || 'No answer.';
    console.log('OpenAI response:', answer);
    res.json({ answer });
  } catch (e) {
    console.error('OpenAI request failed:', e);
    res.status(500).json({ error: 'OpenAI request failed' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready for chat streaming`);
});
