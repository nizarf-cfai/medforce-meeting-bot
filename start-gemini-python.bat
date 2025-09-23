@echo off
echo Starting Gemini Live with Python WebSocket Server...
echo.

echo Installing Python dependencies...
pip install -r requirements.txt

echo.
echo Starting Python WebSocket Server...
start "Python Gemini Server" python gemini-live-server.py

echo.
echo Waiting for Python server to start...
timeout /t 3 /nobreak > nul

echo.
echo Starting Node.js Proxy Server...
npm run start-gemini-python

pause
