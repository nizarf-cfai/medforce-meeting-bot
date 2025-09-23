#!/bin/bash

echo "Starting Gemini Live with Python WebSocket Server..."
echo

echo "Installing Python dependencies..."
pip install -r requirements.txt

echo
echo "Starting Python WebSocket Server in background..."
python gemini-live-server.py &
PYTHON_PID=$!

echo
echo "Waiting for Python server to start..."
sleep 3

echo
echo "Starting Node.js Proxy Server..."
npm run start-gemini-python

# Cleanup on exit
trap "kill $PYTHON_PID" EXIT
