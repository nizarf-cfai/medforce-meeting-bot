import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { BotFrameworkAdapter } from "botbuilder";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import TeamsGraphBot from "./bot-graph.js";

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

// Bot Framework adapter
const adapter = new BotFrameworkAdapter({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD,
});

// Create bot instance
const bot = new TeamsGraphBot();

// Error handling for bot framework
adapter.onTurnError = async (context, error) => {
  console.error(`Bot error: ${error}`);
  await context.sendActivity('Sorry, I encountered an error. Please try again.');
};

app.use(cors());
app.use(express.json());

// Store active chat sessions
const chatSessions = new Map();

// Bot Framework endpoints
app.post('/api/messages', (req, res) => {
  adapter.process(req, res, async (context) => {
    await bot.run(context);
  });
});

// Bot Framework call endpoints
app.post('/api/calls', (req, res) => {
  adapter.process(req, res, async (context) => {
    await bot.run(context);
  });
});

// Microsoft Graph API endpoints
app.post('/api/graph/join-meeting', async (req, res) => {
  try {
    const { meetingLink, accessToken } = req.body;
    
    if (!meetingLink || !accessToken) {
      return res.status(400).json({ error: 'Meeting link and access token are required' });
    }

    // Initialize Graph client with access token
    await bot.initializeGraphClient(accessToken);
    
    // Join the meeting
    await bot.joinMeetingWithGraph(meetingLink);
    
    res.json({ 
      success: true, 
      message: 'Successfully joined meeting via Microsoft Graph API',
      callId: bot.currentCall?.id 
    });
    
  } catch (error) {
    console.error('Error joining meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/leave-meeting', async (req, res) => {
  try {
    if (!bot.isInCall) {
      return res.status(400).json({ error: 'Not currently in a meeting' });
    }

    // Leave the meeting
    await bot.handleLeaveMeeting({ sendActivity: (msg) => console.log(msg) });
    
    res.json({ 
      success: true, 
      message: 'Successfully left meeting' 
    });
    
  } catch (error) {
    console.error('Error leaving meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/test-voice', async (req, res) => {
  try {
    if (!bot.isInCall) {
      return res.status(400).json({ error: 'Not currently in a meeting' });
    }

    // Test voice
    await bot.handleTestVoice({ sendActivity: (msg) => console.log(msg) });
    
    res.json({ 
      success: true, 
      message: 'Voice test completed' 
    });
    
  } catch (error) {
    console.error('Error testing voice:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/start-transcription', async (req, res) => {
  try {
    if (!bot.isInCall) {
      return res.status(400).json({ error: 'Not currently in a meeting' });
    }

    // Start transcription
    await bot.handleStartTranscription({ sendActivity: (msg) => console.log(msg) });
    
    res.json({ 
      success: true, 
      message: 'Audio transcription started' 
    });
    
  } catch (error) {
    console.error('Error starting transcription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Chat streaming endpoints (keeping existing functionality)
app.post('/chat/start', (req, res) => {
  const sessionId = uuidv4();
  const { meetingId } = req.body;
  
  chatSessions.set(sessionId, {
    id: sessionId,
    meetingId: meetingId || 'default-meeting',
    messages: [],
    createdAt: new Date()
  });
  
  res.json({ 
    sessionId, 
    botName: 'Meeting Bot (Graph API)' 
  });
});

app.post('/chat/send', (req, res) => {
  const { sessionId, message, sender = 'User' } = req.body;
  
  if (!chatSessions.has(sessionId)) {
    return res.status(404).json({ error: 'Chat session not found' });
  }
  
  const session = chatSessions.get(sessionId);
  const chatMessage = {
    id: uuidv4(),
    sender,
    message,
    timestamp: new Date().toISOString()
  };
  
  session.messages.push(chatMessage);
  
  // Broadcast to all connected clients in this session
  io.to(sessionId).emit('chatMessage', chatMessage);
  
  res.json({ success: true, message: chatMessage });
});

app.get('/chat/:sessionId/messages', (req, res) => {
  const { sessionId } = req.params;
  
  if (!chatSessions.has(sessionId)) {
    return res.status(404).json({ error: 'Chat session not found' });
  }
  
  const session = chatSessions.get(sessionId);
  res.json({ messages: session.messages });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('joinChat', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined chat session ${sessionId}`);
    
    // Send chat history
    if (chatSessions.has(sessionId)) {
      const session = chatSessions.get(sessionId);
      socket.emit('chatHistory', session.messages);
    }
  });
  
  socket.on('sendMessage', (data) => {
    const { sessionId, message, sender } = data;
    
    if (chatSessions.has(sessionId)) {
      const session = chatSessions.get(sessionId);
      const chatMessage = {
        id: uuidv4(),
        sender: sender || 'User',
        message,
        timestamp: new Date().toISOString()
      };
      
      session.messages.push(chatMessage);
      
      // Broadcast to all clients in this session
      io.to(sessionId).emit('chatMessage', chatMessage);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready for chat streaming`);
  console.log(`Bot Framework adapter ready for Teams integration`);
  console.log(`Microsoft Graph API endpoints available at /api/graph/*`);
});

