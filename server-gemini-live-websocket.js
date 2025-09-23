import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import WebSocket from 'ws';

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
      
      // Initialize Gemini Live WebSocket connection
      await initializeGeminiLiveWebSocket(socket, sessionId);
      
    } catch (error) {
      console.error('❌ Failed to join Gemini Live session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  });
  
  socket.on('audio-data', async (data) => {
    try {
      const { sessionId, audioData } = data;
      console.log(`🎤 Received audio data for session: ${sessionId}`);
      
      // Send audio to Gemini Live WebSocket
      await sendAudioToGeminiLive(socket, sessionId, audioData);
      
    } catch (error) {
      console.error('❌ Failed to process audio:', error);
      socket.emit('error', { message: 'Failed to process audio' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Gemini Live WebSocket disconnected:', socket.id);
  });
});

async function initializeGeminiLiveWebSocket(socket, sessionId) {
  try {
    console.log(`🤖 Initializing Gemini Live WebSocket for session: ${sessionId}`);
    
    // Create WebSocket connection to Gemini Live API
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const geminiWs = new WebSocket(wsUrl);
    
    // Store WebSocket in session
    const session = geminiLiveSessions.get(sessionId);
    if (session) {
      session.geminiWebSocket = geminiWs;
      session.status = 'ready';
    }
    
    geminiWs.on('open', () => {
      console.log(`✅ Gemini Live WebSocket connected for session: ${sessionId}`);
      socket.emit('gemini-ready', { 
        sessionId, 
        message: 'Gemini Live WebSocket is ready to process audio' 
      });
    });
    
    geminiWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log(`💬 Gemini Live response: ${JSON.stringify(message, null, 2)}`);
        
        // Save all responses for debugging
        const responseDir = path.join(process.cwd(), 'gemini-responses');
        if (!fs.existsSync(responseDir)) {
          fs.mkdirSync(responseDir, { recursive: true });
        }
        
        const rawFileName = `gemini-raw-${Date.now()}.json`;
        const rawPath = path.join(responseDir, rawFileName);
        
        try {
          fs.writeFileSync(rawPath, JSON.stringify(message, null, 2));
          console.log(`💾 Raw response saved to: ${rawPath}`);
        } catch (error) {
          console.error(`❌ Failed to save raw response: ${error.message}`);
        }
        
        // Extract text from different response types
        let responseText = '';
        
        // Handle setupComplete response
        if (message.setupComplete) {
          console.log(`✅ Setup completed for session: ${sessionId}`);
          session.setupComplete = true;
          socket.emit('gemini-ready', { 
            sessionId, 
            message: 'Gemini Live setup completed, ready for audio' 
          });
          return;
        }
        
        // Handle actual responses
        if (message.serverContent && message.serverContent.modelTurn) {
          const parts = message.serverContent.modelTurn.parts;
          console.log(`🔍 Processing ${parts ? parts.length : 0} response parts`);
          
          if (parts && parts.length > 0) {
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              console.log(`📋 Part ${i}:`, JSON.stringify(part, null, 2));
              
              if (part.text) {
                responseText += part.text;
                console.log(`📝 Text part found: "${part.text}"`);
              }
              // Handle audio responses
              if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                console.log(`🎵 Received audio response from Gemini Live (${part.inlineData.mimeType})`);
                
                // Save audio to file for debugging
                const audioDir = path.join(process.cwd(), 'gemini-responses');
                if (!fs.existsSync(audioDir)) {
                  fs.mkdirSync(audioDir, { recursive: true });
                }
                
                const audioFileName = `gemini-audio-${Date.now()}.${part.inlineData.mimeType.split('/')[1]}`;
                const audioPath = path.join(audioDir, audioFileName);
                
                try {
                  const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
                  fs.writeFileSync(audioPath, audioBuffer);
                  console.log(`💾 Audio saved to: ${audioPath}`);
                } catch (error) {
                  console.error(`❌ Failed to save audio: ${error.message}`);
                }
                
                // Send audio response back to client
                socket.emit('gemini-audio-response', {
                  sessionId,
                  audioData: part.inlineData.data,
                  mimeType: part.inlineData.mimeType,
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
        
        if (responseText) {
          console.log(`📝 Extracted text: ${responseText}`);
          
          // Save text response to file for debugging
          const responseDir = path.join(process.cwd(), 'gemini-responses');
          if (!fs.existsSync(responseDir)) {
            fs.mkdirSync(responseDir, { recursive: true });
          }
          
          const textFileName = `gemini-text-${Date.now()}.txt`;
          const textPath = path.join(responseDir, textFileName);
          
          try {
            fs.writeFileSync(textPath, responseText);
            console.log(`💾 Text saved to: ${textPath}`);
          } catch (error) {
            console.error(`❌ Failed to save text: ${error.message}`);
          }
          
          // Send response back to client
          socket.emit('gemini-response', {
            sessionId,
            text: responseText,
            timestamp: new Date().toISOString()
          });
        } else {
          console.log(`📋 No text found in response, full message: ${JSON.stringify(message)}`);
          
          // Save full message for debugging
          const responseDir = path.join(process.cwd(), 'gemini-responses');
          if (!fs.existsSync(responseDir)) {
            fs.mkdirSync(responseDir, { recursive: true });
          }
          
          const debugFileName = `gemini-debug-${Date.now()}.json`;
          const debugPath = path.join(responseDir, debugFileName);
          
          try {
            fs.writeFileSync(debugPath, JSON.stringify(message, null, 2));
            console.log(`💾 Debug message saved to: ${debugPath}`);
          } catch (error) {
            console.error(`❌ Failed to save debug message: ${error.message}`);
          }
        }
        
      } catch (error) {
        console.error('❌ Failed to parse Gemini response:', error);
        console.error('Raw data:', data.toString());
      }
    });
    
    geminiWs.on('error', (error) => {
      console.error(`❌ Gemini Live WebSocket error for session ${sessionId}:`, error);
      socket.emit('error', { message: 'Gemini Live WebSocket error' });
    });
    
    geminiWs.on('close', () => {
      console.log(`🔌 Gemini Live WebSocket closed for session: ${sessionId}`);
    });
    
  } catch (error) {
    console.error('❌ Failed to initialize Gemini Live WebSocket:', error);
    socket.emit('error', { message: 'Failed to initialize Gemini Live WebSocket' });
  }
}

async function sendAudioToGeminiLive(socket, sessionId, audioData) {
  try {
    const session = geminiLiveSessions.get(sessionId);
    if (!session || !session.geminiWebSocket) {
      socket.emit('error', { message: 'Gemini Live WebSocket not ready' });
      return;
    }
    
    console.log(`🎵 Sending audio to Gemini Live WebSocket for session: ${sessionId}`);
    
    // Convert base64 audio to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Create message for Gemini Live API
    const message = {
      setup: {
        model: "models/gemini-2.0-flash-live-001",
        generationConfig: {
          responseModalities: ["TEXT"]
        },
        systemInstruction: {
          parts: [
            {
              text: "You are MedForce AI, a helpful meeting assistant. Respond naturally to questions and provide helpful information. Always respond in English."
            }
          ]
        }
      }
    };
    
    // Only send setup message once per session
    if (!session.setupSent) {
      session.geminiWebSocket.send(JSON.stringify(message));
      session.setupSent = true;
      console.log(`📤 Setup message sent for session: ${sessionId}`);
      
      // Wait for setup to complete before sending audio
      return;
    }
    
    // Only send audio after setup is complete
    if (!session.setupComplete) {
      console.log(`⏳ Waiting for setup to complete for session: ${sessionId}`);
      return;
    }
    
    // Send audio after setup is complete
    const audioMessage = {
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/pcm;rate=16000",
                data: audioBuffer.toString('base64')
              }
            }
          ]
        }
      }
    };
    
    session.geminiWebSocket.send(JSON.stringify(audioMessage));
    console.log(`📤 Audio message sent for session: ${sessionId}`);
    
    console.log(`📤 Audio sent to Gemini Live WebSocket for session: ${sessionId}`);
    
  } catch (error) {
    console.error('❌ Failed to send audio to Gemini Live:', error);
    socket.emit('error', { message: 'Failed to send audio to Gemini Live' });
  }
}

app.post('/api/gemini/live/end', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (sessionId && geminiLiveSessions.has(sessionId)) {
      const session = geminiLiveSessions.get(sessionId);
      if (session.geminiWebSocket) {
        session.geminiWebSocket.close();
      }
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
  console.log(`Gemini Live WebSocket server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready for Gemini Live streaming`);
  console.log(`Test page: http://localhost:${PORT}/gemini-test.html`);
});
