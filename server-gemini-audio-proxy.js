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

app.use(express.static('public'));

const PYTHON_WS_URL = 'ws://localhost:8766';
let pythonWs = null;
const geminiSessions = new Map();

async function connectToPythonServer() {
  try {
    console.log('🐍 Connecting to Python Gemini Live Audio server...');
    pythonWs = new WebSocket(PYTHON_WS_URL);
    
    pythonWs.on('open', () => {
      console.log('✅ Connected to Python Gemini Live Audio server');
    });
    
    pythonWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('🐍 Python server response:', message);
        
        if (message.type === 'gemini-ready') {
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
          for (const [sessionId, session] of geminiSessions.entries()) {
            if (session.pythonWs === pythonWs) {
              session.socket.emit('gemini-response', {
                sessionId,
                text: message.text,
                timestamp: message.timestamp
              });
              break;
            }
          }
        } else if (message.type === 'gemini-audio-response') {
          for (const [sessionId, session] of geminiSessions.entries()) {
            if (session.pythonWs === pythonWs) {
              session.socket.emit('gemini-audio-response', {
                sessionId,
                audioData: message.audioData,
                mimeType: message.mimeType,
                timestamp: message.timestamp
              });
              break;
            }
          }
        } else if (message.type === 'error') {
          for (const [sessionId, session] of geminiSessions.entries()) {
            if (session.pythonWs === pythonWs) {
              session.socket.emit('error', {
                sessionId,
                message: message.message
              });
              break;
            }
          }
        }
      } catch (error) {
        console.error('❌ Error parsing Python server message:', error);
      }
    });
    
    pythonWs.on('close', () => {
      console.log('🔌 Python server connection closed');
      setTimeout(connectToPythonServer, 3000); // Attempt to reconnect
    });
    
    pythonWs.on('error', (error) => {
      console.error('❌ Python server connection error:', error);
      pythonWs.close(); // Close to trigger reconnect
    });

  } catch (error) {
    console.error('❌ Failed to connect to Python server:', error);
    setTimeout(connectToPythonServer, 3000); // Attempt to reconnect
  }
}

io.on('connection', (socket) => {
  console.log('📱 Client connected to Gemini Live Audio:', socket.id);

  socket.on('start-gemini', async (data) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    geminiSessions.set(sessionId, { socket, pythonWs: null });
    console.log(`🚀 Starting Gemini Live Audio session: ${sessionId}`);
    
    // Ensure Python connection is established before sending start message
    if (!pythonWs || pythonWs.readyState !== WebSocket.OPEN) {
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (pythonWs && pythonWs.readyState === WebSocket.OPEN) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }

    // Send start message to Python server
    pythonWs.send(JSON.stringify({ type: 'start-gemini', sessionId }));
    geminiSessions.get(sessionId).pythonWs = pythonWs;
    socket.emit('session-joined', { sessionId });
    console.log(`📱 Client ${socket.id} joining Gemini Live Audio session: ${sessionId}`);
  });

  socket.on('audio-data', (data) => {
    const { sessionId, audioData } = data;
    const session = geminiSessions.get(sessionId);
    if (session && session.pythonWs && session.pythonWs.readyState === WebSocket.OPEN) {
      session.pythonWs.send(JSON.stringify({ type: 'audio-data', sessionId, audioData }));
    } else {
      console.warn(`⚠️ No active Python WebSocket for session ${sessionId} or connection not open.`);
    }
  });

  socket.on('stop-gemini', (data) => {
    const { sessionId } = data;
    const session = geminiSessions.get(sessionId);
    if (session && session.pythonWs && session.pythonWs.readyState === WebSocket.OPEN) {
      session.pythonWs.send(JSON.stringify({ type: 'stop-gemini', sessionId }));
    }
    geminiSessions.delete(sessionId);
    console.log(`📱 Client disconnected from Gemini Live Audio: ${socket.id}`);
  });

  socket.on('disconnect', () => {
    console.log(`📱 Client disconnected from Gemini Live Audio: ${socket.id}`);
    // Clean up session on disconnect
    for (const [sessionId, session] of geminiSessions.entries()) {
      if (session.socket.id === socket.id) {
        if (session.pythonWs && session.pythonWs.readyState === WebSocket.OPEN) {
          session.pythonWs.send(JSON.stringify({ type: 'stop-gemini', sessionId }));
        }
        geminiSessions.delete(sessionId);
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log('🚀 Gemini Live Audio Proxy server running on http://localhost:3000');
  console.log('🐍 Test page: http://localhost:3000/gemini-test.html');
  console.log('🔌 WebSocket server ready for Gemini Live Audio streaming');
  connectToPythonServer(); // Initial connection attempt
});
