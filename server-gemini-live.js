import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

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

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Gemini Live sessions
const geminiLiveSessions = new Map();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Gemini Live API endpoints
app.post('/api/gemini/live/start', async (req, res) => {
  try {
    console.log('🚀 Starting Gemini Live session...');
    
    const sessionId = uuidv4();
    
    // Store session info
    geminiLiveSessions.set(sessionId, {
      id: sessionId,
      status: 'starting',
      createdAt: new Date()
    });
    
    console.log(`✅ Gemini Live session created: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId: sessionId,
      message: 'Gemini Live session created. Use WebSocket for real-time communication.'
    });
    
  } catch (error) {
    console.error('❌ Failed to start Gemini Live session:', error);
    res.status(500).json({ error: 'Failed to start Gemini Live session' });
  }
});

// WebSocket endpoint for Gemini Live
io.of('/gemini-live').on('connection', (socket) => {
  console.log('🔌 Gemini Live WebSocket connected:', socket.id);
  
  socket.on('join-session', async (sessionId) => {
    try {
      console.log(`📱 Client ${socket.id} joining Gemini Live session: ${sessionId}`);
      
      const session = geminiLiveSessions.get(sessionId);
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }
      
      // Join the session room
      socket.join(sessionId);
      session.status = 'active';
      session.socketId = socket.id;
      
      socket.emit('session-joined', { sessionId, status: 'active' });
      
      // Initialize Gemini Live connection
      await initializeGeminiLiveSession(socket, sessionId);
      
    } catch (error) {
      console.error('❌ Failed to join Gemini Live session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  });
  
  socket.on('audio-data', async (data) => {
    try {
      const { sessionId, audioData } = data;
      console.log(`🎤 Received audio data for session: ${sessionId}`);
      
      // Process audio with Gemini Live
      await processGeminiLiveAudio(socket, sessionId, audioData);
      
    } catch (error) {
      console.error('❌ Failed to process audio:', error);
      socket.emit('error', { message: 'Failed to process audio' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Gemini Live WebSocket disconnected:', socket.id);
  });
});

async function initializeGeminiLiveSession(socket, sessionId) {
  try {
    console.log(`🤖 Initializing Gemini Live for session: ${sessionId}`);
    
    // Use the correct Live API model
    const model = "gemini-2.0-flash-live-001";
    
    // Store the model in the session
    const session = geminiLiveSessions.get(sessionId);
    if (session) {
      session.model = model;
      session.status = 'ready';
    }
    
    socket.emit('gemini-ready', { 
      sessionId, 
      message: 'Gemini Live is ready to process audio' 
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize Gemini Live:', error);
    socket.emit('error', { message: 'Failed to initialize Gemini Live' });
  }
}

async function processGeminiLiveAudio(socket, sessionId, audioData) {
  try {
    const session = geminiLiveSessions.get(sessionId);
    if (!session || !session.model) {
      socket.emit('error', { message: 'Session not ready' });
      return;
    }
    
    console.log(`🎵 Processing audio with Gemini Live for session: ${sessionId}`);
    
    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Use the correct Live API model
    const model = genAI.getGenerativeModel({ 
      model: session.model
    });
    
    // Send audio to Gemini Live with proper format
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "audio/pcm;rate=16000", // Correct format for Live API
          data: audioBuffer.toString('base64')
        }
      }
    ]);
    
    const response = result.response;
    const text = response.text();
    
    console.log(`💬 Gemini Live response: ${text}`);
    
    // Send response back to client
    socket.emit('gemini-response', {
      sessionId,
      text: text,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Failed to process audio with Gemini Live:', error);
    socket.emit('error', { message: 'Failed to process audio with Gemini Live' });
  }
}

app.post('/api/gemini/live/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (sessionId && geminiLiveSessions.has(sessionId)) {
      geminiLiveSessions.delete(sessionId);
      console.log(`✅ Gemini Live session ended: ${sessionId}`);
    }
    
    res.json({
      success: true,
      message: 'Gemini Live session ended successfully'
    });
    
  } catch (error) {
    console.error('❌ Failed to end Gemini Live session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Gemini Live server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready for Gemini Live streaming`);
  console.log(`Test page: http://localhost:${PORT}/gemini-test.html`);
});
