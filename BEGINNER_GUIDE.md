# Complete Beginner's Guide to Running the ChatGPT Clone

This guide is designed for complete beginners who have never used Node.js or Express.js before.

## What You Need to Install First

### 1. Install Node.js
Node.js is like a translator that lets you run JavaScript on your computer (not just in web browsers).

**Download and Install:**
1. Go to https://nodejs.org/
2. Download the **LTS version** (Long Term Support) - it's the stable version
3. Run the installer and follow the installation wizard
4. **Important**: Make sure to check "Add to PATH" during installation

**Verify Installation:**
1. Open Command Prompt (Windows) or Terminal (Mac/Linux)
2. Type: `node --version`
3. You should see something like `v18.17.0` or similar
4. Type: `npm --version`
5. You should see something like `9.6.7` or similar

### 2. Install PostgreSQL Database
PostgreSQL is where we'll store all the chat data and user information.

**For Windows:**
1. Go to https://www.postgresql.org/download/windows/
2. Download the installer
3. Run it and follow the setup wizard
4. **Remember the password** you set for the `postgres` user
5. Keep the default port `5432`

**For Mac:**
1. Go to https://www.postgresql.org/download/macosx/
2. Download and install PostgreSQL.app
3. Or use Homebrew: `brew install postgresql`

**For Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### 3. Get a Gemini API Key
1. Go to https://aistudio.google.com/
2. Sign in with your Google account
3. Click "Get API Key" in the left sidebar
4. Click "Create API Key"
5. Copy the generated key (it looks like: `AIzaSyC...`)

## Step-by-Step Setup

### Step 1: Open Command Prompt/Terminal
- **Windows**: Press `Win + R`, type `cmd`, press Enter
- **Mac**: Press `Cmd + Space`, type `Terminal`, press Enter
- **Linux**: Press `Ctrl + Alt + T`

### Step 2: Navigate to Your Project Folder
```bash
cd C:\Users\massi\Downloads\chatgpt-clone
```

### Step 3: Install Project Dependencies
This downloads all the code libraries your project needs:
```bash
npm install
```
Wait for it to finish (it might take 1-2 minutes).

### Step 4: Set Up the Database
1. Open PostgreSQL (search for "pgAdmin" or "psql" in your Start menu)
2. Create a new database:
   - Open pgAdmin
   - Right-click on "Databases" → "Create" → "Database"
   - Name it: `chatgpt_clone`
   - Click "Save"

### Step 5: Create Your Environment File
1. In your project folder, copy the example file:
   ```bash
   copy env.example .env
   ```
   (On Mac/Linux: `cp env.example .env`)

2. Open the `.env` file in any text editor (Notepad, VS Code, etc.)

3. Fill in your information:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=chatgpt_clone
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password_here

   # JWT Secret (generate a random string)
   JWT_SECRET=my_super_secret_jwt_key_2024_very_long_and_secure_12345

   # Google Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key_here

   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

### Step 6: Run the Application
```bash
npm run dev
```

You should see:
```
Server running on http://localhost:3000
Database connection established successfully.
Database synchronized successfully.
```

### Step 7: Open Your Browser
Go to: http://localhost:3000

## What Each Part Does

### Node.js
- **What it is**: A runtime that lets you run JavaScript on your computer
- **Why we need it**: Our server is written in JavaScript, and Node.js runs it

### Express.js
- **What it is**: A web framework that makes it easy to create web servers
- **Why we need it**: It handles HTTP requests (like when someone visits your website)

### PostgreSQL
- **What it is**: A database that stores information
- **Why we need it**: Stores user accounts, chat messages, and chat history

### npm (Node Package Manager)
- **What it is**: A tool that downloads and manages code libraries
- **Why we need it**: Our project uses many libraries (like Express, PostgreSQL driver, etc.)

## Common Issues and Solutions

### Issue 1: "node is not recognized"
**Solution**: Node.js isn't installed or not in PATH
1. Reinstall Node.js from https://nodejs.org/
2. Make sure to check "Add to PATH" during installation
3. Restart your Command Prompt

### Issue 2: "npm is not recognized"
**Solution**: Same as above - reinstall Node.js

### Issue 3: "Database connection failed"
**Solution**: PostgreSQL isn't running or wrong credentials
1. Make sure PostgreSQL is running
2. Check your database credentials in `.env`
3. Make sure the database `chatgpt_clone` exists

### Issue 4: "Module not found"
**Solution**: Dependencies aren't installed
```bash
npm install
```

### Issue 5: "Port 3000 already in use"
**Solution**: Another program is using port 3000
1. Change the PORT in your `.env` file to 3001
2. Or close the other program using port 3000

## How to Use the Application

1. **Register**: Click "Register" and create an account
2. **Login**: Use your email and password to login
3. **Start Chatting**: Click "New Chat" and start talking to the AI
4. **View History**: All your chats are saved in the left sidebar

## Stopping the Application

To stop the server:
- Press `Ctrl + C` in the Command Prompt/Terminal

## Starting Again

To run the application again:
1. Open Command Prompt/Terminal
2. Navigate to your project folder: `cd C:\Users\massi\Downloads\chatgpt-clone`
3. Run: `npm run dev`

## File Structure Explained

```
chatgpt-clone/
├── server.js          # Main server file (starts the application)
├── package.json       # Lists all dependencies
├── .env              # Your secret configuration (database passwords, API keys)
├── models/           # Database models (User, Chat, Message)
├── routes/           # API endpoints (authentication, chat)
├── public/           # Frontend files (HTML, CSS, JavaScript)
└── config/           # Database configuration
```

## What Happens When You Run `npm run dev`

1. **Starts the server**: Creates a web server on port 3000
2. **Connects to database**: Links to your PostgreSQL database
3. **Creates tables**: Automatically creates User, Chat, and Message tables
4. **Serves the website**: Makes your app available at http://localhost:3000

## Next Steps After Getting It Running

1. **Test registration**: Create a new account
2. **Test login**: Login with your account
3. **Test chat**: Start a new chat and send a message
4. **Check database**: Your data should be saved in PostgreSQL

## Getting Help

If you get stuck:
1. Check the error messages in the Command Prompt
2. Make sure all steps above are completed
3. Verify your `.env` file has the correct information
4. Try running `npm install` again

Remember: This is a learning process! Don't worry if it takes a few tries to get everything working.
