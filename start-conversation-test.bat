@echo off
echo Starting Conversation Testing System...
echo.
echo 1. Starting Python Conversation Server...
start "Python Conversation Server" python conversation-server.py
echo.
echo 2. Waiting 3 seconds for Python server to start...
timeout /t 3 /nobreak > nul
echo.
echo 3. Starting Node.js Hybrid Server...
start "Node.js Hybrid Server" npm run dev-hybrid
echo.
echo Both servers are starting...
echo.
echo Test page: http://localhost:3000/index-hybrid.html
echo.
echo Use the "Conversation Testing" section to test the Python server
echo.
pause

