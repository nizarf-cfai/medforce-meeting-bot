@echo off
echo Starting Gemini Live Audio System...
echo.
echo 1. Starting Python Gemini Live Audio Server...
start "Python Gemini Audio Server" python gemini-live-audio.py
echo.
echo 2. Waiting 3 seconds for Python server to start...
timeout /t 3 /nobreak > nul
echo.
echo 3. Starting Node.js Gemini Audio Proxy...
start "Node.js Gemini Audio Proxy" npm run start-gemini-audio
echo.
echo Both servers are starting...
echo.
echo Test page: http://localhost:3000/gemini-test.html
echo.
pause
