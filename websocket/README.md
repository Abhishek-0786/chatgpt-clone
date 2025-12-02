# OCPP WebSocket Service

Standalone microservice for handling OCPP (Open Charge Point Protocol) WebSocket communication with charging stations.

## 🎯 Overview

This service is completely decoupled from the main backend and communicates via:
- **REST API** - For synchronous operations (get charger, stop session, etc.)
- **RabbitMQ** - For asynchronous events and message storage

## 🚀 Quick Start

### 1. Create Environment File

```bash
cp env.ocpp.example .env.ocpp
```

Edit `.env.ocpp` with your configuration:

```env
# Service Configuration
NODE_ENV=production
PORT=9000
WEBSOCKET_HOST=localhost

# Backend API URL
BACKEND_API_URL=http://localhost:3000

# RabbitMQ Configuration
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### 2. Start the Service

```bash
# Using npm script
npm run ocpp:start

# Or directly
node ocpp_service/index.js
```

## 📁 Structure

```
ocpp_service/
├── protocol/              # WebSocket & OCPP protocol handling
│   ├── connection_manager.js
│   ├── message_parser.js
│   └── message_sender.js
├── business_logic/        # Business logic (no DB access)
│   ├── charger_manager.js
│   ├── session_manager.js
│   └── wallet_manager.js
├── rabbitmq/              # RabbitMQ integration
│   ├── producer.js
│   └── consumer.js
├── utils/                 # Utilities
│   ├── api_client.js      # REST API client for backend
│   ├── message_storage.js
│   └── meter_extractor.js
├── websocket_server.js    # Main WebSocket server
└── index.js              # Standalone entry point
```

## 🔌 API Endpoints Required

The backend must provide these REST API endpoints:

### Charger Management
- `GET /api/charger/by-device/:deviceId` - Get charger by device ID
- `POST /api/charger/ensure` - Create or update charger
- `PATCH /api/charger/:deviceId/status` - Update charger status
- `PATCH /api/charger/:deviceId/last-seen` - Update last seen timestamp

### Session Management
- `GET /api/charger/:deviceId/active-sessions` - Get active sessions
- `PATCH /api/charging-session/:sessionId/stop` - Stop a session

### Wallet/Billing
- `POST /api/wallet/refund` - Process refund

### Message Storage
- `POST /api/charger/:deviceId/ocpp-message` - Store OCPP message

## 🐰 RabbitMQ Events

The service publishes these events to RabbitMQ:

- `ocpp.message` - OCPP messages for storage
- `charger.metadataUpdate` - Charger metadata updates
- `charger.statusUpdate` - Charger status changes
- `charger.lastSeen` - Last seen updates
- `charging.stopped` - Session stopped events

## 🔄 Communication Flow

```
Charger (WebSocket)
    ↓
OCPP Service
    ↓
    ├─→ REST API (synchronous)
    └─→ RabbitMQ (asynchronous)
            ↓
        Backend Services
```

## 🧪 Testing

```bash
# Start in development mode (with auto-reload)
npm run ocpp:dev
```

## 📝 Notes

- The service does **NOT** have direct database access
- All data operations go through REST API or RabbitMQ
- The service can run independently on a different server
- Use `.env.ocpp` for service-specific configuration
- Backend must implement the required API endpoints

## 🚧 TODO

- [ ] Implement RabbitMQ consumer for incoming commands
- [ ] Add health check endpoint
- [ ] Add metrics/monitoring
- [ ] Add Docker support
- [ ] Add Kubernetes deployment configs

