@echo off
echo Starting ChatGPT Clone...
echo.
echo Make sure you have:
echo 1. Node.js installed
echo 2. PostgreSQL running
echo 3. .env file configured
echo.
pause
echo.
echo Installing dependencies...
npm install
echo.
echo Starting the server...
npm run dev
pause
