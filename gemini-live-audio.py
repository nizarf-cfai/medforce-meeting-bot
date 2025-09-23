#!/usr/bin/env python3
"""
Gemini Live Audio Server
Based on the working start_live_api.py example
"""

import asyncio
import base64
import json
import os
import sys
import traceback
import websockets
from websockets.server import WebSocketServerProtocol
import logging

# Add the current directory to Python path to import genai
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from google import genai
except ImportError:
    print("Error: google-genai package not found. Install with: pip install google-genai")
    sys.exit(1)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyAKpwKuinlUKSSJhYdZKHLXuK5-TEgB7Ng")
MODEL = "models/gemini-2.0-flash-live-001"
CONFIG = {"response_modalities": ["AUDIO"]}

class GeminiLiveAudioServer:
    def __init__(self):
        self.clients = set()
        self.gemini_sessions = {}
        
        # Initialize Gemini client
        self.client = genai.Client(
            http_options={"api_version": "v1beta"},
            api_key=GEMINI_API_KEY
        )
    
    async def register_client(self, websocket: WebSocketServerProtocol):
        self.clients.add(websocket)
        logger.info(f"Client connected: {websocket.remote_address}")
    
    async def unregister_client(self, websocket: WebSocketServerProtocol):
        self.clients.discard(websocket)
        if websocket in self.gemini_sessions:
            await self.gemini_sessions[websocket].close()
            del self.gemini_sessions[websocket]
        logger.info(f"Client disconnected: {websocket.remote_address}")
    
    async def start_gemini_session(self, websocket: WebSocketServerProtocol):
        """Start a new Gemini Live session for the client"""
        try:
            logger.info("Starting Gemini Live session...")
            
            # Create Gemini Live session
            session = await self.client.aio.live.connect(
                model=MODEL, 
                config=CONFIG
            )
            
            self.gemini_sessions[websocket] = session
            
            # Send ready message
            await websocket.send(json.dumps({
                "type": "gemini-ready",
                "message": "Gemini Live session started, ready for audio"
            }))
            
            logger.info("Gemini Live session started successfully")
            
            # Start receiving responses from Gemini
            asyncio.create_task(self.handle_gemini_responses(websocket, session))
            
        except Exception as e:
            logger.error(f"Failed to start Gemini Live session: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Failed to start Gemini Live session: {str(e)}"
            }))
    
    async def handle_gemini_responses(self, websocket: WebSocketServerProtocol, session):
        """Handle responses from Gemini Live API"""
        try:
            while True:
                turn = session.receive()
                async for response in turn:
                    # Handle audio responses
                    if data := response.data:
                        logger.info("Received audio response from Gemini")
                        
                        # Send audio response to client
                        await websocket.send(json.dumps({
                            "type": "gemini-audio-response",
                            "audioData": base64.b64encode(data).decode(),
                            "mimeType": "audio/pcm",
                            "timestamp": asyncio.get_event_loop().time()
                        }))
                        continue
                    
                    # Handle text responses
                    if text := response.text:
                        logger.info(f"Received text response from Gemini: {text}")
                        
                        # Send text response to client
                        await websocket.send(json.dumps({
                            "type": "gemini-response",
                            "text": text,
                            "timestamp": asyncio.get_event_loop().time()
                        }))
            
        except Exception as e:
            logger.error(f"Error handling Gemini responses: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Error handling Gemini responses: {str(e)}"
            }))
    
    async def send_audio_to_gemini(self, websocket: WebSocketServerProtocol, audio_data: str):
        """Send audio data to Gemini Live API"""
        if websocket not in self.gemini_sessions:
            logger.warning("No Gemini session for this client")
            return
        
        try:
            session = self.gemini_sessions[websocket]
            
            # Decode base64 audio data
            audio_bytes = base64.b64decode(audio_data)
            
            # Send audio to Gemini
            await session.send(input={
                "data": audio_bytes,
                "mime_type": "audio/pcm"
            })
            
            logger.info("Audio sent to Gemini Live API")
            
        except Exception as e:
            logger.error(f"Failed to send audio to Gemini: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Failed to send audio to Gemini: {str(e)}"
            }))
    
    async def stop_gemini_session(self, websocket: WebSocketServerProtocol):
        """Stop the Gemini Live session"""
        if websocket in self.gemini_sessions:
            await self.gemini_sessions[websocket].close()
            del self.gemini_sessions[websocket]
            logger.info("Gemini Live session stopped")
    
    async def handle_client_message(self, websocket: WebSocketServerProtocol, message: str):
        """Handle messages from client"""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "start-gemini":
                await self.start_gemini_session(websocket)
            elif message_type == "audio-data":
                await self.send_audio_to_gemini(websocket, data.get("audioData"))
            elif message_type == "stop-gemini":
                await self.stop_gemini_session(websocket)
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse client message: {e}")
        except Exception as e:
            logger.error(f"Error handling client message: {e}")
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle client connection"""
        await self.register_client(websocket)
        try:
            async for message in websocket:
                await self.handle_client_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister_client(websocket)

# Create server instance
server = GeminiLiveServer()

async def main():
    logger.info("Starting Gemini Live Audio Server...")
    logger.info(f"Gemini API Key: {'Set' if GEMINI_API_KEY else 'Not set'}")
    
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY environment variable not set")
        return
    
    logger.info("Gemini Live Audio Server running on ws://localhost:8766")
    async with websockets.serve(
        server.handle_client,
        "localhost",
        8766,
        ping_interval=20,
        ping_timeout=10
    ):
        logger.info("Server started successfully. Waiting for connections...")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())
