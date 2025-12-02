# Project Refactoring Summary - Two Separate Services

## ✅ Completed Refactoring

The project has been successfully refactored into two separate services:

### 📁 Structure

```
/
├── backend/              # Backend service (HTTP API, Socket.io, Database)
│   ├── config/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── public/
│   ├── server.js
│   └── package.json
│
└── websocket/           # WebSocket service (OCPP communication)
    ├── protocol/
    ├── business_logic/
    ├── rabbitmq/
    ├── utils/
    ├── websocket_server.js
    ├── api_server.js    # HTTP API for backend communication
    ├── index.js         # Entry point
    └── package.json
```

## 🔄 Communication Methods

### Backend → WebSocket Service
- **HTTP API** (port 9001): For synchronous operations
  - Check charger connection
  - Send OCPP commands (RemoteStart, RemoteStop)
  - Get connected chargers

### WebSocket Service → Backend
- **REST API**: For data operations
  - Get/create charger
  - Get active sessions
  - Stop sessions
  - Process refunds
  - Store OCPP messages

- **RabbitMQ**: For asynchronous events
  - OCPP message storage
  - Charger metadata updates
  - Charging events

## 🚀 How to Run

### Option 1: Run Separately

```bash
# Terminal 1: Start Backend
npm run backend
# OR
cd backend && npm run dev

# Terminal 2: Start WebSocket Service
npm run websocket
# OR
cd websocket && node index.js
```

### Option 2: Run Both Together

```bash
npm run dev:all
```

## 📝 Environment Files

### Backend
- Uses `backend/.env` (copied from root `.env`)

### WebSocket Service
- Uses `websocket/.env.ocpp` (or `websocket/.env` as fallback)
- Copy `env.ocpp.example` to `websocket/.env.ocpp`

## ✅ Changes Made

1. **Moved backend code** to `/backend`
   - All models, routes, services, utils, public files
   - Updated all relative import paths

2. **Moved OCPP service** to `/websocket`
   - Entire `ocpp_service/` content moved
   - Updated all relative import paths
   - Copied `utils/ocpp.js` to websocket

3. **Removed WebSocket startup from backend**
   - Removed `createWebSocketServer` import
   - Removed WebSocket server initialization
   - Backend now only runs HTTP server

4. **Created HTTP API in WebSocket service**
   - `websocket/api_server.js` - REST API on port 9001
   - Endpoints for backend to communicate with WebSocket service

5. **Created WebSocket client in backend**
   - `backend/utils/websocket_client.js` - HTTP client
   - Replaces direct function calls with HTTP requests

6. **Updated package.json**
   - Root package.json with scripts for both services
   - Separate package.json for each service

## 🔌 API Endpoints

### WebSocket Service API (port 9001)
- `GET /api/charger/:deviceId/connection` - Check connection
- `POST /api/charger/:deviceId/ocpp-call` - Send OCPP command
- `GET /api/chargers/connected` - Get all connected chargers
- `GET /api/health` - Health check

### Backend API (port 3000)
- All existing endpoints remain unchanged
- Uses WebSocket client to communicate with WebSocket service

## ⚙️ Configuration

### Backend `.env`
```env
PORT=3000
DB_HOST=...
DB_NAME=...
# ... other backend config
```

### WebSocket `.env.ocpp`
```env
PORT=9000
API_PORT=9001
BACKEND_API_URL=http://localhost:3000
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

## ✅ Verification

- ✅ Backend runs independently via `npm run backend`
- ✅ WebSocket service runs independently via `npm run websocket`
- ✅ No direct imports between services
- ✅ Communication via HTTP API and RabbitMQ only
- ✅ All import paths updated correctly

## 📦 Installation

```bash
# Install root dependencies (concurrently)
npm install

# Install backend dependencies
cd backend && npm install

# Install websocket dependencies
cd ../websocket && npm install

# Or install all at once
npm run install:all
```

## 🎯 Next Steps

1. **Test both services separately**
2. **Verify API communication works**
3. **Update deployment scripts** if needed
4. **Add health checks** for monitoring
5. **Configure environment variables** for production

