#!/usr/bin/env python3
"""
Gemini Live API WebSocket Server
Based on: https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_LiveAPI.py
"""

import asyncio
import json
import os
import websockets
from websockets.server import WebSocketServerProtocol
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Gemini Live API configuration
GEMINI_API_KEY = ""
GEMINI_WS_URL = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"

class GeminiLiveServer:
    def __init__(self):
        self.clients = set()
        self.gemini_connections = {}
    
    async def register_client(self, websocket: WebSocketServerProtocol):
        """Register a new client connection"""
        self.clients.add(websocket)
        logger.info(f"Client connected: {websocket.remote_address}")
    
    async def unregister_client(self, websocket: WebSocketServerProtocol):
        """Unregister a client connection"""
        self.clients.discard(websocket)
        # Close Gemini connection if exists
        if websocket in self.gemini_connections:
            await self.gemini_connections[websocket].close()
            del self.gemini_connections[websocket]
        logger.info(f"Client disconnected: {websocket.remote_address}")
    
    async def connect_to_gemini(self, websocket: WebSocketServerProtocol):
        """Connect to Gemini Live API WebSocket"""
        try:
            logger.info("Connecting to Gemini Live API...")
            gemini_ws = await websockets.connect(GEMINI_WS_URL)
            self.gemini_connections[websocket] = gemini_ws
            
            # Send setup message
            setup_message = {
                "setup": {
                    "model": "models/gemini-2.0-flash-live-001",
                    "generationConfig": {
                        "responseModalities": ["TEXT"]
                    },
                    "systemInstruction": {
                        "parts": [
                            {
                                "text": "You are MedForce AI, a helpful meeting assistant. Respond naturally to questions and provide helpful information. Always respond in English."
                            }
                        ]
                    }
                }
            }
            
            await gemini_ws.send(json.dumps(setup_message))
            logger.info("Setup message sent to Gemini Live API")
            
            # Wait for setup complete
            setup_response = await gemini_ws.recv()
            setup_data = json.loads(setup_response)
            logger.info(f"Setup response: {setup_data}")
            
            if setup_data.get("setupComplete"):
                await websocket.send(json.dumps({
                    "type": "gemini-ready",
                    "message": "Gemini Live setup completed, ready for audio"
                }))
                logger.info("Gemini Live setup completed")
            
            # Start listening for responses from Gemini
            asyncio.create_task(self.handle_gemini_responses(websocket, gemini_ws))
            
        except Exception as e:
            logger.error(f"Failed to connect to Gemini Live API: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Failed to connect to Gemini Live API: {str(e)}"
            }))
    
    async def handle_gemini_responses(self, websocket: WebSocketServerProtocol, gemini_ws):
        """Handle responses from Gemini Live API"""
        try:
            async for message in gemini_ws:
                try:
                    data = json.loads(message)
                    logger.info(f"Gemini response: {data}")
                    
                    # Extract text from response
                    response_text = ""
                    if "serverContent" in data and "modelTurn" in data["serverContent"]:
                        parts = data["serverContent"]["modelTurn"].get("parts", [])
                        for part in parts:
                            if "text" in part:
                                response_text += part["text"]
                    
                    if response_text:
                        logger.info(f"Extracted text: {response_text}")
                        await websocket.send(json.dumps({
                            "type": "gemini-response",
                            "text": response_text,
                            "timestamp": asyncio.get_event_loop().time()
                        }))
                    else:
                        logger.info(f"No text found in response: {data}")
                        
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse Gemini response: {e}")
                except Exception as e:
                    logger.error(f"Error handling Gemini response: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info("Gemini Live API connection closed")
        except Exception as e:
            logger.error(f"Error in Gemini response handler: {e}")
    
    async def handle_client_message(self, websocket: WebSocketServerProtocol, message: str):
        """Handle message from client"""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "start-gemini":
                await self.connect_to_gemini(websocket)
            elif message_type == "audio-data":
                await self.send_audio_to_gemini(websocket, data.get("audioData"))
            elif message_type == "stop-gemini":
                await self.stop_gemini_connection(websocket)
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse client message: {e}")
        except Exception as e:
            logger.error(f"Error handling client message: {e}")
    
    async def send_audio_to_gemini(self, websocket: WebSocketServerProtocol, audio_data: str):
        """Send audio data to Gemini Live API"""
        if websocket not in self.gemini_connections:
            logger.warning("No Gemini connection for this client")
            return
        
        try:
            gemini_ws = self.gemini_connections[websocket]
            
            # Create audio message
            audio_message = {
                "serverContent": {
                    "modelTurn": {
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": "audio/pcm;rate=16000",
                                    "data": audio_data
                                }
                            }
                        ]
                    }
                }
            }
            
            await gemini_ws.send(json.dumps(audio_message))
            logger.info("Audio sent to Gemini Live API")
            
        except Exception as e:
            logger.error(f"Failed to send audio to Gemini: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Failed to send audio to Gemini: {str(e)}"
            }))
    
    async def stop_gemini_connection(self, websocket: WebSocketServerProtocol):
        """Stop Gemini Live API connection"""
        if websocket in self.gemini_connections:
            await self.gemini_connections[websocket].close()
            del self.gemini_connections[websocket]
            logger.info("Gemini Live API connection closed")
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle client WebSocket connection"""
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
    """Main server function"""
    logger.info("Starting Gemini Live WebSocket Server...")
    logger.info(f"Gemini API Key: {'Set' if GEMINI_API_KEY else 'Not set'}")
    
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY environment variable not set")
        return
    
    # Start WebSocket server
    logger.info("Gemini Live WebSocket Server running on ws://localhost:8765")
    async with websockets.serve(
        server.handle_client,
        "localhost",
        8765,
        ping_interval=20,
        ping_timeout=10
    ):
        logger.info("Server started successfully. Waiting for connections...")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())
