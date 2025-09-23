import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static('public'));

// Python WebSocket server connection
const PYTHON_WS_URL = 'ws://localhost:8765';
let pythonWs = null;

// Store active sessions
const geminiSessions = new Map();

// Connect to Python WebSocket server
async function connectToPythonServer() {
  try {
    console.log('🐍 Connecting to Python Gemini Live server...');
    pythonWs = new WebSocket(PYTHON_WS_URL);
    
    pythonWs.on('open', () => {
      console.log('✅ Connected to Python Gemini Live server');
    });
    
    pythonWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('🐍 Python server response:', message);
        
        // Forward response to appropriate client
        if (message.type === 'gemini-ready') {
          // Find the client that should receive this
          for (const [sessionId, session] of geminiSessions.entries()) {
            if (session.pythonWs === pythonWs) {
              session.socket.emit('gemini-ready', {
                sessionId,
                message: message.message
              });
              break;
            }
          }
        } else if (message.type === 'gemini-response') {
          // Find the client that should receive this
          for (const [sessionId, session] of geminiSessions.entries()) {
            if (session.pythonWs === pythonWs) {
              session.socket.emit('gemini-response', {
                sessionId,
                text: message.text,
                timestamp: new Date().toISOString()
              });
              break;
            }
          }
        } else if (message.type === 'error') {
          // Forward error to all clients
          for (const [sessionId, session] of geminiSessions.entries()) {
            session.socket.emit('error', {
              message: message.message
            });
          }
        }
      } catch (error) {
        console.error('❌ Failed to parse Python server message:', error);
      }
    });
    
    pythonWs.on('close', () => {
      console.log('🔌 Python server connection closed');
      // Attempt to reconnect after 5 seconds
      setTimeout(connectToPythonServer, 5000);
    });
    
    pythonWs.on('error', (error) => {
      console.error('❌ Python server connection error:', error);
    });
    
  } catch (error) {
    console.error('❌ Failed to connect to Python server:', error);
    // Attempt to reconnect after 5 seconds
    setTimeout(connectToPythonServer, 5000);
  }
}

// Socket.IO namespace for Gemini Live
const geminiLiveNamespace = io.of('/gemini-live');

geminiLiveNamespace.on('connection', (socket) => {
  console.log(`📱 Client connected to Gemini Live: ${socket.id}`);
  
  socket.on('join-session', async (data) => {
    const { sessionId } = data;
    console.log(`📱 Client ${socket.id} joining Gemini Live session: ${sessionId}`);
    
    // Store session
    geminiSessions.set(sessionId, {
      socket,
      pythonWs,
      status: 'connected'
    });
    
    socket.emit('session-joined', { sessionId });
  });
  
  socket.on('start-gemini', async (data) => {
    const { sessionId } = data;
    console.log(`🚀 Starting Gemini Live for session: ${sessionId}`);
    
    if (!pythonWs || pythonWs.readyState !== WebSocket.OPEN) {
      console.log('⏳ Waiting for Python server connection...');
      socket.emit('error', { message: 'Python server not connected' });
      return;
    }
    
    try {
      // Send start message to Python server
      const startMessage = {
        type: 'start-gemini'
      };
      
      pythonWs.send(JSON.stringify(startMessage));
      console.log(`📤 Start message sent to Python server for session: ${sessionId}`);
      
    } catch (error) {
      console.error('❌ Failed to start Gemini Live:', error);
      socket.emit('error', { message: 'Failed to start Gemini Live' });
    }
  });
  
  socket.on('audio-data', async (data) => {
    const { sessionId, audioData } = data;
    console.log(`🎤 Received audio data for session: ${sessionId}`);
    
    if (!pythonWs || pythonWs.readyState !== WebSocket.OPEN) {
      console.log('⏳ Python server not connected');
      return;
    }
    
    try {
      // Send audio data to Python server
      const audioMessage = {
        type: 'audio-data',
        audioData: audioData
      };
      
      pythonWs.send(JSON.stringify(audioMessage));
      console.log(`📤 Audio data sent to Python server for session: ${sessionId}`);
      
    } catch (error) {
      console.error('❌ Failed to send audio to Python server:', error);
    }
  });
  
  socket.on('stop-gemini', async (data) => {
    const { sessionId } = data;
    console.log(`🛑 Stopping Gemini Live for session: ${sessionId}`);
    
    if (!pythonWs || pythonWs.readyState !== WebSocket.OPEN) {
      return;
    }
    
    try {
      // Send stop message to Python server
      const stopMessage = {
        type: 'stop-gemini'
      };
      
      pythonWs.send(JSON.stringify(stopMessage));
      console.log(`📤 Stop message sent to Python server for session: ${sessionId}`);
      
    } catch (error) {
      console.error('❌ Failed to stop Gemini Live:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`📱 Client disconnected from Gemini Live: ${socket.id}`);
    
    // Clean up sessions
    for (const [sessionId, session] of geminiSessions.entries()) {
      if (session.socket === socket) {
        geminiSessions.delete(sessionId);
        break;
      }
    }
  });
});

// API endpoint to start Gemini Live session
app.post('/api/gemini/live/start', async (req, res) => {
  try {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`🚀 Starting Gemini Live session: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId,
      message: 'Gemini Live session created'
    });
    
  } catch (error) {
    console.error('❌ Failed to start Gemini Live session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start Gemini Live session'
    });
  }
});

// API endpoint to end Gemini Live session
app.post('/api/gemini/live/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (sessionId && geminiSessions.has(sessionId)) {
      geminiSessions.delete(sessionId);
      console.log(`🛑 Ended Gemini Live session: ${sessionId}`);
    }
    
    res.json({
      success: true,
      message: 'Gemini Live session ended'
    });
    
  } catch (error) {
    console.error('❌ Failed to end Gemini Live session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end Gemini Live session'
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Gemini Live Python Proxy server running on http://localhost:${PORT}`);
  console.log(`🐍 Test page: http://localhost:${PORT}/gemini-test.html`);
  console.log(`🔌 WebSocket server ready for Gemini Live streaming`);
  
  // Connect to Python server
  connectToPythonServer();
});
