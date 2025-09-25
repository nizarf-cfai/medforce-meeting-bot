import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { CommunicationIdentityClient } from "@azure/communication-identity";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import WebSocket from "ws";

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

// Conversation server connection
const CONVERSATION_WS_URL = 'ws://localhost:8767';
let conversationWs = null;
const conversationSessions = new Map();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for large audio files
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Connect to conversation server
async function connectToConversationServer() {
  try {
    console.log('💬 Connecting to Python conversation server...');
    conversationWs = new WebSocket(CONVERSATION_WS_URL);
    
    conversationWs.on('open', () => {
      console.log('✅ Connected to Python conversation server');
    });
    
    conversationWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('💬 Conversation server response:', message);
        
        if (message.type === 'welcome') {
          // Handle welcome message
          console.log(`💬 Conversation server ready: ${message.client_id}`);
        } else if (message.type === 'text_response') {
          // Forward text response to client
          for (const [sessionId, session] of conversationSessions.entries()) {
            if (session.conversationWs === conversationWs) {
              session.socket.emit('conversation-response', {
                sessionId,
                message: message.message,
                timestamp: message.timestamp
              });
              break;
            }
          }
        } else if (message.type === 'audio_response') {
          // Forward audio response to client
          for (const [sessionId, session] of conversationSessions.entries()) {
            if (session.conversationWs === conversationWs) {
              session.socket.emit('conversation-audio-response', {
                sessionId,
                message: message.message,
                timestamp: message.timestamp
              });
              break;
            }
          }
        } else if (message.type === 'conversation_history') {
          // Forward conversation history to client
          for (const [sessionId, session] of conversationSessions.entries()) {
            if (session.conversationWs === conversationWs) {
              session.socket.emit('conversation-history', {
                sessionId,
                history: message.history,
                timestamp: message.timestamp
              });
              break;
            }
          }
        } else if (message.type === 'error') {
          // Forward error to client
          for (const [sessionId, session] of conversationSessions.entries()) {
            if (session.conversationWs === conversationWs) {
              session.socket.emit('conversation-error', {
                sessionId,
                message: message.message
              });
              break;
            }
          }
        }
      } catch (error) {
        console.error('❌ Error parsing conversation server message:', error);
      }
    });
    
    conversationWs.on('close', () => {
      console.log('🔌 Conversation server connection closed');
      setTimeout(connectToConversationServer, 3000); // Attempt to reconnect
    });
    
    conversationWs.on('error', (error) => {
      console.error('❌ Conversation server connection error:', error);
      conversationWs.close(); // Close to trigger reconnect
    });

  } catch (error) {
    console.error('❌ Failed to connect to conversation server:', error);
    setTimeout(connectToConversationServer, 3000); // Attempt to reconnect
  }
}

// Serve static files from recordings directory
app.use('/recordings', express.static(path.join(__dirname, 'recordings')));

// Store active chat sessions
const chatSessions = new Map();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ACS Token endpoint (keeping existing functionality)
app.post('/api/acs/token', async (req, res) => {
  try {
    const connectionString = process.env.ACS_CONNECTION_STRING;
    if (!connectionString) {
      console.error("Missing ACS_CONNECTION_STRING in .env");
      return res.status(500).json({ error: 'ACS connection string not configured' });
    }
    
    const identityClient = new CommunicationIdentityClient(connectionString);
    const user = await identityClient.createUser();
    const tokenResponse = await identityClient.getToken(user, ["voip"]);
    
    res.json({
      token: tokenResponse.token,
      userId: user.communicationUserId
    });
  } catch (error) {
    console.error('Error generating ACS token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// OpenAI Q&A endpoint (keeping existing functionality)
app.post('/api/openai/ask', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }
    
    // Simple response for now - you can integrate with OpenAI API later
    const response = `I received your question: "${question}". This is a placeholder response.`;
    
    res.json({ answer: response });
  } catch (error) {
    console.error('Error processing question:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// Microsoft Graph API endpoints (new functionality)
app.post('/api/graph/join-meeting', async (req, res) => {
  try {
    const { meetingLink, accessToken } = req.body;
    
    if (!meetingLink || !accessToken) {
      return res.status(400).json({ error: 'Meeting link and access token are required' });
    }

    // For now, we'll simulate the Graph API call
    // In a real implementation, you'd use the Microsoft Graph client
    console.log('Simulating Graph API join meeting:', meetingLink);
    
    // Simulate successful join
    const callId = uuidv4();
    
    res.json({ 
      success: true, 
      message: 'Successfully joined meeting via Microsoft Graph API (simulated)',
      callId: callId,
      note: 'This is a simulated response. Configure your Azure AD app to enable real Graph API integration.'
    });
    
  } catch (error) {
    console.error('Error joining meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/leave-meeting', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Successfully left meeting (simulated)' 
    });
  } catch (error) {
    console.error('Error leaving meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/test-voice', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Voice test completed (simulated)',
      note: 'In real implementation, this would play audio in the meeting via Graph API'
    });
  } catch (error) {
    console.error('Error testing voice:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/start-screen-share', async (req, res) => {
  try {
    const { url } = req.body;
    res.json({ 
      success: true, 
      message: 'Screen sharing started (simulated)',
      url: url || 'http://localhost:3001/',
      note: 'In real implementation, this would start screen sharing in the meeting via Graph API'
    });
  } catch (error) {
    console.error('Error starting screen share:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/stop-screen-share', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Screen sharing stopped (simulated)',
      note: 'In real implementation, this would stop screen sharing in the meeting via Graph API'
    });
  } catch (error) {
    console.error('Error stopping screen share:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/graph/start-transcription', async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Audio transcription started (simulated)',
      note: 'In real implementation, this would access meeting audio streams via Graph API'
    });
  } catch (error) {
    console.error('Error starting transcription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Recording save endpoint
app.post('/api/save-recording', async (req, res) => {
  try {
    console.log('📥 Received recording save request');
    const { filename, audioData } = req.body;
    
    console.log(`📝 Filename: ${filename}`);
    console.log(`📊 Audio data length: ${audioData ? audioData.length : 'undefined'}`);
    
    if (!filename || !audioData) {
      console.log('❌ Missing filename or audio data');
      return res.status(400).json({ error: 'Filename and audio data are required' });
    }
    
    // Create recordings directory if it doesn't exist
    const recordingsDir = path.join(__dirname, 'recordings');
    console.log(`📁 Recordings directory: ${recordingsDir}`);
    
    if (!fs.existsSync(recordingsDir)) {
      console.log('📁 Creating recordings directory...');
      fs.mkdirSync(recordingsDir, { recursive: true });
    }
    
    // Save the audio file
    const filePath = path.join(recordingsDir, filename);
    console.log(`💾 Saving to: ${filePath}`);
    
    const buffer = Buffer.from(audioData, 'base64');
    fs.writeFileSync(filePath, buffer);
    
    console.log(`✅ Recording saved successfully: ${filePath}`);
    console.log(`📊 File size: ${buffer.length} bytes`);
    
    res.json({
      success: true,
      message: 'Recording saved successfully',
      filePath: filePath,
      filename: filename
    });
    
  } catch (error) {
    console.error('❌ Error saving recording:', error);
    res.status(500).json({ error: 'Failed to save recording' });
  }
});

// OpenAI Audio Processing endpoints
app.post('/api/openai/transcribe-audio', async (req, res) => {
  try {
    const { filename } = req.body;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }
    
    const filePath = path.join(__dirname, 'recordings', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found' });
    }
    
    console.log(`🎤 Transcribing audio: ${filePath}`);
    
    // Transcribe audio using OpenAI Whisper (force English)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
      language: "en", // Force English
      prompt: "This is a meeting conversation in English. The wake word is MedForce AI. Please transcribe everything in English only. Do not translate to other languages."
    });
    
    console.log(`📝 Transcription: ${transcription.text}`);
    
    // Check file size to ensure it's not too short
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;
    const fileSizeInSeconds = fileSizeInBytes / (44100 * 2 * 2); // Rough calculation for WAV
    
    if (fileSizeInSeconds < 0.1) {
      console.log(`⚠️ Audio file too short (${fileSizeInSeconds.toFixed(3)}s), skipping transcription`);
      transcription.text = 'Audio too short';
    } else if (!transcription.text || transcription.text.trim() === '') {
      console.log('⚠️ Empty transcription received, using fallback');
      transcription.text = 'No speech detected';
    }
    
    res.json({
      success: true,
      transcription: transcription.text,
      filename: filename
    });
    
  } catch (error) {
    console.error('Error transcribing audio:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

app.post('/api/openai/generate-response', async (req, res) => {
  try {
    const { transcription, context = "You are a helpful meeting assistant bot." } = req.body;
    
    if (!transcription) {
      return res.status(400).json({ error: 'Transcription is required' });
    }
    
    console.log(`🤖 Generating response for: ${transcription}`);
    
    // Generate response using OpenAI GPT (force English)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `${context}\n\nIMPORTANT: Always respond in English only. Do not use any other language.`
        },
        {
          role: "user",
          content: transcription
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });
    
    const response = completion.choices[0].message.content;
    console.log(`💬 Generated response: ${response}`);
    
    res.json({
      success: true,
      response: response,
      transcription: transcription
    });
    
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.post('/api/openai/generate-structured-response', async (req, res) => {
  try {
    const { transcription, user_prompt, context } = req.body;
    const inputText = user_prompt || transcription;
    
    if (!inputText) {
      return res.status(400).json({ error: 'Input text is required' });
    }
    
    console.log(`🤖 Generating structured response for: ${inputText}`);
    
    // Fetch patient data to include in context
    let patientDataContext = "";
    try {
      const patientResponse = await fetch('http://localhost:3001/api/patient-data');
      const patientData = await patientResponse.json();
      
      if (patientData.success) {
        console.log('📋 Patient data retrieved:', patientData.data);
        patientDataContext = `\n\nCurrent Patient Data:\n${JSON.stringify(patientData.data, null, 2)}`;
      } else {
        console.warn('⚠️ Failed to fetch patient data:', patientData.message);
        patientDataContext = "\n\nPatient data unavailable.";
      }
    } catch (error) {
      console.error('❌ Error fetching patient data:', error.message);
      patientDataContext = "\n\nPatient data unavailable due to connection error.";
    }
    
    // Combine context with patient data
    const enhancedContext = (context || "You are a helpful meeting assistant bot.") + patientDataContext;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: enhancedContext
        },
        {
          role: "user",
          content: inputText
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    const responseText = completion.choices[0].message.content;
    let structuredResponse;
    
    try {
      structuredResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse JSON response:', parseError);
      // Fallback to simple response
      structuredResponse = {
        answer: responseText,
        operation: {
          mode: "none",
          target_id: null
        }
      };
    }
    
    console.log(`📋 Structured response: ${JSON.stringify(structuredResponse)}`);
    
    res.json({
      success: true,
      answer: structuredResponse.answer,
      operation: structuredResponse.operation,
      transcription: inputText
    });
    
  } catch (error) {
    console.error('Error generating structured response:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/openai/classify-input', async (req, res) => {
  try {
    const { transcription, context } = req.body;
    
    if (!transcription) {
      return res.status(400).json({ error: 'Transcription is required' });
    }
    
    console.log(`🔍 Classifying input: ${transcription}`);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: context || "Classify the user input as either a question or a task."
        },
        {
          role: "user",
          content: transcription
        }
      ],
      max_tokens: 100,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });
    
    const responseText = completion.choices[0].message.content;
    let classification;
    
    try {
      classification = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse classification JSON:', parseError);
      classification = {
        question: false,
        task: "canvas"
      };
    }
    
    console.log(`📋 Classification result: ${JSON.stringify(classification)}`);
    
    res.json({
      success: true,
      question: classification.question,
      task: classification.task
    });
    
  } catch (error) {
    console.error('Error classifying input:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/openai/generate-question-response', async (req, res) => {
  try {
    const { transcription, context } = req.body;
    
    if (!transcription) {
      return res.status(400).json({ error: 'Transcription is required' });
    }
    
    console.log(`❓ Generating question response for: ${transcription}`);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: context || "You are a helpful meeting assistant bot."
        },
        {
          role: "user",
          content: transcription
        }
      ],
      max_tokens: 200,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    const responseText = completion.choices[0].message.content;
    let questionResponse;
    
    try {
      questionResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse question response JSON:', parseError);
      questionResponse = {
        answer: responseText,
        operation: {
          mode: "none",
          item_id: null
        }
      };
    }
    
    console.log(`❓ Question response: ${JSON.stringify(questionResponse)}`);
    
    res.json({
      success: true,
      answer: questionResponse.answer,
      operation: questionResponse.operation
    });
    
  } catch (error) {
    console.error('Error generating question response:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/openai/generate-process-response', async (req, res) => {
  try {
    const { transcription, context } = req.body;
    
    if (!transcription) {
      return res.status(400).json({ error: 'Transcription is required' });
    }
    
    console.log(`⚙️ Generating process response for: ${transcription}`);
    // Fetch patient data to include in context
    let patientDataContext = "";
    try {
      const patientResponse = await fetch('http://localhost:3001/api/patient-data');
      const patientData = await patientResponse.json();
      
      if (patientData.success) {
        console.log('📋 Patient data retrieved:', patientData.data);
        patientDataContext = `\n\nCurrent Patient Data:\n${JSON.stringify(patientData.data, null, 2)}`;
      } else {
        console.warn('⚠️ Failed to fetch patient data:', patientData.message);
        patientDataContext = "\n\nPatient data unavailable.";
      }
    } catch (error) {
      console.error('❌ Error fetching patient data:', error.message);
      patientDataContext = "\n\nPatient data unavailable due to connection error.";
    }

    // Combine context with patient data
    const enhancedContext = (context || "You are a helpful meeting assistant bot.") + patientDataContext;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: enhancedContext
        },
        {
          role: "user",
          content: transcription
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });
    
    const responseText = completion.choices[0].message.content;
    let processResponse;
    
    try {
      processResponse = JSON.parse(responseText);
      
      // Validate todo list structure
      if (processResponse.result.title && processResponse.result.description && processResponse.result.todo_list) {
        console.log(`📋 Todo list generated: ${processResponse.result.title}`);
        console.log(`📝 Description: ${processResponse.result.description}`);
        console.log(`✅ Tasks: ${processResponse.result.todo_list.length} items`);
      }
      
    } catch (parseError) {
      console.error('Failed to parse process response JSON:', parseError);
    }
    
    console.log(`⚙️ Process response: ${JSON.stringify(processResponse)}`);
    
    res.json({
      success: true,
      answer: processResponse.answer,
      operation: "process",
      mode: processResponse.result.mode,
      todo_data: {
        title: processResponse.result.title,
        description: processResponse.result.description,
        todo_list: processResponse.result.todo_list
      }
    });
    
  } catch (error) {
    console.error('Error generating process response:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/openai/text-to-speech', async (req, res) => {
  try {
    const { text, voice = "alloy" } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    console.log(`🔊 Converting to speech: ${text.substring(0, 100)}...`);
    
    // Convert text to speech using OpenAI TTS (force English)
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice: voice,
      input: text,
      response_format: "mp3"
    });
    
    // Save the audio file
    const filename = `response_${Date.now()}.mp3`;
    const filePath = path.join(__dirname, 'recordings', filename);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    
    console.log(`💾 TTS audio saved: ${filePath}`);
    
    res.json({
      success: true,
      filename: filename,
      filePath: filePath,
      text: text
    });
    
  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).json({ error: 'Failed to generate speech' });
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
    botName: 'Meeting Bot (Hybrid ACS + Graph API)' 
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
  
  // Conversation server events
  socket.on('start-conversation', async (data) => {
    const sessionId = `conversation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    conversationSessions.set(sessionId, { socket, conversationWs: null });
    console.log(`💬 Starting conversation session: ${sessionId}`);
    
    // Ensure conversation connection is established
    if (!conversationWs || conversationWs.readyState !== WebSocket.OPEN) {
      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (conversationWs && conversationWs.readyState === WebSocket.OPEN) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }

    conversationSessions.get(sessionId).conversationWs = conversationWs;
    socket.emit('conversation-session-started', { sessionId });
    console.log(`💬 Conversation session started: ${sessionId}`);
  });

  socket.on('send-message', (data) => {
    const { sessionId, message } = data;
    const session = conversationSessions.get(sessionId);
    if (session && session.conversationWs && session.conversationWs.readyState === WebSocket.OPEN) {
      session.conversationWs.send(JSON.stringify({ 
        type: 'text_message', 
        message: message 
      }));
      console.log(`💬 Message sent to conversation server: ${message}`);
    } else {
      console.warn(`⚠️ No active conversation session for ${sessionId}`);
    }
  });

  socket.on('send-audio', (data) => {
    const { sessionId, audioData } = data;
    const session = conversationSessions.get(sessionId);
    if (session && session.conversationWs && session.conversationWs.readyState === WebSocket.OPEN) {
      session.conversationWs.send(JSON.stringify({ 
        type: 'audio_message', 
        audio_data: audioData 
      }));
      console.log(`💬 Audio sent to conversation server`);
    } else {
      console.warn(`⚠️ No active conversation session for ${sessionId}`);
    }
  });

  socket.on('get-conversation-history', (data) => {
    const { sessionId } = data;
    const session = conversationSessions.get(sessionId);
    if (session && session.conversationWs && session.conversationWs.readyState === WebSocket.OPEN) {
      session.conversationWs.send(JSON.stringify({ 
        type: 'get_history' 
      }));
      console.log(`💬 Requesting conversation history for ${sessionId}`);
    } else {
      console.warn(`⚠️ No active conversation session for ${sessionId}`);
    }
  });

  socket.on('stop-conversation', (data) => {
    const { sessionId } = data;
    conversationSessions.delete(sessionId);
    console.log(`💬 Conversation session stopped: ${sessionId}`);
  });
  
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

// Gemini Live API endpoints - WebSocket based
const geminiLiveSessions = new Map();

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
      message: 'Gemini Live session created. Use WebSocket for real-time communication.',
      websocketUrl: `ws://localhost:${PORT}/gemini-live/${sessionId}`
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
    const model = "gemini-2.0-flash-live-001"; // Correct model from the repository example
    
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
    
    // Use the correct Live API model - no generation config needed
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
  console.log(`Hybrid server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready for chat streaming`);
  console.log(`ACS endpoints available at /api/acs/*`);
  console.log(`Graph API endpoints available at /api/graph/* (simulated)`);
  console.log(`💡 To enable real Graph API integration, configure your Azure AD app and update the endpoints`);
  // connectToConversationServer(); // Connect to Python conversation server (optional)
});
