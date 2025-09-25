#!/usr/bin/env python3
"""
Simple WebSocket Conversation Server
For testing conversation with the Teams bot interface
"""

import asyncio
import json
import logging
import websockets
from websockets.server import WebSocketServerProtocol
import uuid
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ConversationServer:
    def __init__(self):
        self.clients = set()
        self.conversations = {}
    
    async def register_client(self, websocket: WebSocketServerProtocol):
        self.clients.add(websocket)
        client_id = str(uuid.uuid4())
        self.conversations[websocket] = {
            'id': client_id,
            'history': [],
            'created_at': datetime.now()
        }
        logger.info(f"Client connected: {client_id}")
        
        # Send welcome message
        await websocket.send(json.dumps({
            "type": "welcome",
            "message": "Connected to conversation server",
            "client_id": client_id
        }))
    
    async def unregister_client(self, websocket: WebSocketServerProtocol):
        self.clients.discard(websocket)
        if websocket in self.conversations:
            del self.conversations[websocket]
        logger.info("Client disconnected")
    
    async def handle_message(self, websocket: WebSocketServerProtocol, message: str):
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "text_message":
                await self.handle_text_message(websocket, data)
            elif message_type == "audio_message":
                await self.handle_audio_message(websocket, data)
            elif message_type == "get_history":
                await self.send_conversation_history(websocket)
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse message: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON format"
            }))
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Server error: {str(e)}"
            }))
    
    async def handle_text_message(self, websocket: WebSocketServerProtocol, data):
        """Handle text messages from client"""
        user_message = data.get("message", "")
        client_id = self.conversations[websocket]['id']
        
        logger.info(f"Received text message from {client_id}: {user_message}")
        
        # Add to conversation history
        self.conversations[websocket]['history'].append({
            "role": "user",
            "message": user_message,
            "timestamp": datetime.now().isoformat()
        })
        
        # Generate response (simple echo for now, can be replaced with AI model)
        response = await self.generate_response(user_message)
        
        # Add response to history
        self.conversations[websocket]['history'].append({
            "role": "assistant",
            "message": response,
            "timestamp": datetime.now().isoformat()
        })
        
        # Send response back to client
        await websocket.send(json.dumps({
            "type": "text_response",
            "message": response,
            "timestamp": datetime.now().isoformat()
        }))
        
        logger.info(f"Sent response to {client_id}: {response}")
    
    async def handle_audio_message(self, websocket: WebSocketServerProtocol, data):
        """Handle audio messages from client"""
        audio_data = data.get("audio_data", "")
        client_id = self.conversations[websocket]['id']
        
        logger.info(f"Received audio message from {client_id}")
        
        # For now, just acknowledge receipt
        # In a real implementation, you would process the audio
        await websocket.send(json.dumps({
            "type": "audio_response",
            "message": "Audio received and processed",
            "timestamp": datetime.now().isoformat()
        }))
    
    async def generate_response(self, user_message: str) -> str:
        """Generate a response to the user message"""
        # Simple response logic - can be replaced with AI model
        user_message_lower = user_message.lower()
        
        if "hello" in user_message_lower or "hi" in user_message_lower:
            return "Hello! How can I help you today?"
        elif "how are you" in user_message_lower:
            return "I'm doing well, thank you for asking! How are you?"
        elif "what is your name" in user_message_lower:
            return "I'm MedForce AI, your meeting assistant. I'm here to help with your meeting needs."
        elif "help" in user_message_lower:
            return "I can help you with meeting assistance, answering questions, and providing information. What would you like to know?"
        elif "bye" in user_message_lower or "goodbye" in user_message_lower:
            return "Goodbye! Have a great day!"
        elif "thank" in user_message_lower:
            return "You're welcome! Is there anything else I can help you with?"
        else:
            return f"I understand you said: '{user_message}'. How can I assist you further?"
    
    async def send_conversation_history(self, websocket: WebSocketServerProtocol):
        """Send conversation history to client"""
        history = self.conversations[websocket]['history']
        await websocket.send(json.dumps({
            "type": "conversation_history",
            "history": history,
            "timestamp": datetime.now().isoformat()
        }))
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle client connection"""
        await self.register_client(websocket)
        try:
            async for message in websocket:
                await self.handle_message(websocket, message)
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            await self.unregister_client(websocket)

# Create server instance
server = ConversationServer()

async def main():
    logger.info("Starting Conversation WebSocket Server...")
    logger.info("Conversation server running on ws://localhost:8767")
    
    async with websockets.serve(
        server.handle_client,
        "localhost",
        8767,
        ping_interval=20,
        ping_timeout=10
    ):
        logger.info("Server started successfully. Waiting for connections...")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())

