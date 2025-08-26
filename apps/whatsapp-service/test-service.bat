@echo off
cd /d "C:\Users\admin\Desktop\LeadsAgent\apps\whatsapp-service"

echo Starting WhatsApp service in background...
start /B npx tsx src/index.ts

echo Waiting 8 seconds for service to start...
ping localhost -n 9 > nul

echo Running route tests...
node test-routes.js

echo Stopping service...
taskkill /f /im node.exe >nul 2>&1

echo Test complete!
pause
