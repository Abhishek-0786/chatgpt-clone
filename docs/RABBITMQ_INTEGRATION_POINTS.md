# RabbitMQ Integration Points in Your Project

This document shows **exactly where** RabbitMQ will be integrated in your existing codebase, with specific file paths, line numbers, and code sections.

---

## 📁 Project Structure Overview

```
chatgpt-clone/
├── websocket-server.js          ⚠️ PRIMARY INTEGRATION POINT
├── server.js                    ⚠️ INTEGRATION POINT
├── routes/
│   ├── charger.js              ⚠️ INTEGRATION POINT
│   └── customer.js             ⚠️ INTEGRATION POINT
├── services/                   ✨ NEW FOLDER TO CREATE
│   └── rabbitmq/              ✨ NEW FOLDER TO CREATE
└── workers/                    ✨ NEW FOLDER TO CREATE
```

---

## 🎯 Integration Point #1: WebSocket Server (`websocket-server.js`)

**File:** `websocket-server.js`  
**Purpose:** This is where OCPP messages from chargers are received. Currently, all processing happens here. With RabbitMQ, we'll publish messages instead.

### Location 1: Message Reception Handler
**Lines:** 164-195 (approximately)

**Current Code:**
```javascript
ws.on('message', async (data) => {
  const previousPromise = messageProcessingLocks.get(deviceId);
  const currentPromise = (async () => {
    await previousPromise;
    
    console.log(`📩 Message received from ${deviceId}`);
    // ... parsing logic ...
    let parsed = parseIncoming(rawStr);
    
    // CURRENT: Direct processing happens here
    // ... business logic ...
  })();
  messageProcessingLocks.set(deviceId, currentPromise);
});
```

**RabbitMQ Integration:**
- **After line 195** (after parsing): Publish message to RabbitMQ
- **Remove:** Direct business logic processing (lines 260-670)
- **Keep:** WebSocket connection management, immediate responses (Heartbeat, BootNotification)

**What to Add:**
```javascript
// After parsing (around line 195)
const { publishOCPPMessage } = require('./services/rabbitmq/producer');

// Instead of processing directly, publish to RabbitMQ
await publishOCPPMessage({
  deviceId,
  chargerId: currentCharger.id,
  messageType: parsed.action || parsed.kind,
  payload: parsed.payload || parsed,
  rawData: rawStr,
  timestamp: new Date(),
  parsedMessage: parsed
});
```

### Location 2: BootNotification Handler
**Lines:** 260-336

**Current Behavior:**
- Updates charger metadata
- Sends response
- Stores message
- Sends ChangeConfiguration

**RabbitMQ Integration:**
- **Keep:** Immediate response (charger needs it)
- **Move to RabbitMQ:** Metadata update, message storage
- **Keep:** ChangeConfiguration (can stay or move to RabbitMQ)

**What Changes:**
```javascript
// Line 260-336: Keep immediate response, publish to RabbitMQ
if (parsed.action === 'BootNotification') {
  // Send immediate response (keep this)
  const payload = { status: 'Accepted', ... };
  ws.send(JSON.stringify(toOcppCallResult(parsed.id, payload)));
  
  // NEW: Publish to RabbitMQ instead of processing directly
  await publishOCPPMessage({
    deviceId,
    chargerId: currentCharger.id,
    messageType: 'BootNotification',
    payload: parsed.payload,
    rawData: rawStr,
    needsMetadataUpdate: true  // Flag for processor
  });
  
  // Keep ChangeConfiguration (or move to RabbitMQ)
}
```

### Location 3: StartTransaction Handler
**Lines:** 337-387

**Current Behavior:**
- Stores incoming message
- Sends response with transactionId
- Stores outgoing response

**RabbitMQ Integration:**
- **Keep:** Immediate response (charger needs transactionId)
- **Move to RabbitMQ:** Message storage, session creation logic

**What Changes:**
```javascript
// Line 337-387: Keep response, publish to RabbitMQ
if (parsed.action === 'StartTransaction') {
  // Send immediate response (keep this)
  const transactionId = Date.now() % 10000000;
  const payload = { idTagInfo: {...}, transactionId };
  ws.send(JSON.stringify(toOcppCallResult(parsed.id, payload)));
  
  // NEW: Publish to RabbitMQ
  await publishOCPPMessage({
    deviceId,
    chargerId: currentCharger.id,
    messageType: 'StartTransaction',
    payload: { ...parsed.payload, transactionId },
    rawData: rawStr,
    transactionId: transactionId
  });
}
```

### Location 4: StopTransaction Handler
**Lines:** 388-450 (approximately)

**Current Behavior:**
- Stores incoming message
- Sends response
- Stores outgoing response

**RabbitMQ Integration:**
- **Keep:** Immediate response
- **Move to RabbitMQ:** Message storage, session update, billing calculation

### Location 5: StatusNotification Handler
**Lines:** 450-550 (approximately)

**Current Behavior:**
- Updates charger status
- Stores message

**RabbitMQ Integration:**
- **Move to RabbitMQ:** Status update, message storage, notification publishing

### Location 6: MeterValues Handler
**Lines:** 550-650 (approximately)

**Current Behavior:**
- Processes meter values
- Updates charging session
- Stores message

**RabbitMQ Integration:**
- **Move to RabbitMQ:** All processing (meter value extraction, session update, billing)

### Location 7: Message Storage Function
**Lines:** 832-953 (`storeMessage` function)

**Current Behavior:**
- Stores messages in ChargerData table
- Updates charger lastSeen
- Handles duplicates

**RabbitMQ Integration:**
- **Move Entire Function:** This entire function moves to `services/ocpp-message-processor.js`
- **Keep Logic:** All the duplicate checking, formatting logic stays the same

### Location 8: Message Queue Functions
**Lines:** 765-829 (`enqueueMessage`, `processMessageQueue`)

**Current Behavior:**
- Queues messages for sequential storage
- Maintains message order

**RabbitMQ Integration:**
- **Replace:** These functions are replaced by RabbitMQ queues
- **RabbitMQ handles:** Message ordering, persistence, retry

---

## 🎯 Integration Point #2: Charger Routes (`routes/charger.js`)

**File:** `routes/charger.js`  
**Purpose:** API endpoints that send commands to chargers (RemoteStartTransaction, RemoteStopTransaction, etc.)

### Location 1: RemoteStartTransaction Endpoint
**Lines:** ~600-700 (approximately)

**Current Behavior:**
- Sends OCPP call via WebSocket
- Stores command in database
- Returns response

**RabbitMQ Integration:**
- **Keep:** WebSocket sending (charger needs immediate command)
- **Add:** Publish command to RabbitMQ for logging/auditing
- **Optional:** Use RabbitMQ to queue commands if charger is offline

**What to Add:**
```javascript
// After sending OCPP call (around line 650)
const { publishChargingCommand } = require('../services/rabbitmq/producer');

// Publish command to RabbitMQ for processing
await publishChargingCommand({
  deviceId,
  command: 'RemoteStartTransaction',
  payload: { connectorId, idTag },
  timestamp: new Date(),
  sentViaWebSocket: true
});
```

### Location 2: RemoteStopTransaction Endpoint
**Lines:** ~800-900 (approximately)

**Same as above** - publish command to RabbitMQ after sending

### Location 3: ChangeConfiguration Endpoint
**Lines:** ~1000-1100 (approximately)

**Same as above** - publish command to RabbitMQ

### Location 4: Reset Endpoint
**Lines:** ~1100-1200 (approximately)

**Same as above** - publish command to RabbitMQ

---

## 🎯 Integration Point #3: Customer Routes (`routes/customer.js`)

**File:** `routes/customer.js`  
**Purpose:** Customer-facing API endpoints for starting/stopping charging

### Location 1: Start Charging Endpoint
**Lines:** 2519-2714 (`POST /api/user/charging/start`)

**Current Behavior:**
- Checks wallet balance
- Deducts amount
- Creates charging session
- Sends RemoteStartTransaction to charger
- Creates wallet transaction

**RabbitMQ Integration:**
- **Keep:** Wallet operations (must be synchronous)
- **Add:** Publish charging event to RabbitMQ
- **Add:** Publish notification for real-time updates

**What to Add:**
```javascript
// After creating charging session (around line 2629)
const { publishChargingEvent, publishNotification } = require('../services/rabbitmq/producer');

// Publish charging started event
await publishChargingEvent({
  type: 'charging.started',
  sessionId: sessionId,
  customerId: customer.id,
  deviceId: deviceId,
  connectorId: connectorId,
  amount: amountValue
});

// Publish notification for real-time dashboard update
await publishNotification({
  type: 'charging.started',
  customerId: customer.id,
  sessionId: sessionId,
  deviceId: deviceId
});
```

### Location 2: Stop Charging Endpoint
**Lines:** 2729-3215 (`POST /api/user/charging/stop`)

**Current Behavior:**
- Finds charging session
- Sends RemoteStopTransaction
- Calculates energy consumed
- Updates session
- Processes refund
- Creates wallet transactions

**RabbitMQ Integration:**
- **Keep:** Critical operations (wallet, session update)
- **Add:** Publish events for analytics
- **Add:** Publish notifications

**What to Add:**
```javascript
// After updating session (around line 3147)
const { publishChargingEvent, publishNotification } = require('../services/rabbitmq/producer');

// Publish charging stopped event
await publishChargingEvent({
  type: 'charging.stopped',
  sessionId: session.sessionId,
  customerId: customer.id,
  energyConsumed: energyConsumed,
  finalAmount: finalAmount,
  refundAmount: refundAmount
});

// Publish notification
await publishNotification({
  type: 'charging.stopped',
  customerId: customer.id,
  sessionId: session.sessionId
});
```

---

## 🎯 Integration Point #4: Server Initialization (`server.js`)

**File:** `server.js`  
**Purpose:** Application startup and service initialization

### Location 1: Server Startup
**Lines:** 77-96 (`startServer` function)

**Current Behavior:**
- Syncs database
- Starts Express server
- Starts WebSocket server

**RabbitMQ Integration:**
- **Add:** Initialize RabbitMQ connection
- **Add:** Start notification service (Socket.io)
- **Add:** Start worker processes (optional, can be separate)

**What to Add:**
```javascript
// After line 79 (after syncDatabase)
const { initializeRabbitMQ } = require('./services/rabbitmq/connection');
const { startNotificationService } = require('./services/notification-service');
const { Server } = require('socket.io');
const http = require('http');

// Create HTTP server for Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Initialize RabbitMQ
await initializeRabbitMQ();
console.log('✅ RabbitMQ connected');

// Start notification service
await startNotificationService(io);
console.log('✅ Notification service started');

// Change app.listen to server.listen (line 82)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Express server running on http://localhost:${PORT}`);
});
```

---

## ✨ New Files to Create

### 1. RabbitMQ Connection Manager
**File:** `services/rabbitmq/connection.js`  
**Purpose:** Manages RabbitMQ connection, channels, reconnection

**Integration Points:**
- Called from `server.js` during startup
- Used by all producers and consumers

### 2. RabbitMQ Producer
**File:** `services/rabbitmq/producer.js`  
**Purpose:** Functions to publish messages to RabbitMQ

**Integration Points:**
- Imported in `websocket-server.js` (line ~195)
- Imported in `routes/charger.js` (multiple endpoints)
- Imported in `routes/customer.js` (start/stop charging)

**Functions:**
- `publishOCPPMessage()` - For OCPP messages from chargers
- `publishChargingCommand()` - For commands sent to chargers
- `publishChargingEvent()` - For charging session events
- `publishNotification()` - For real-time notifications

### 3. RabbitMQ Queue Definitions
**File:** `services/rabbitmq/queues.js`  
**Purpose:** Queue names, exchange names, routing keys

**Integration Points:**
- Used by all producers and consumers

### 4. OCPP Message Processor
**File:** `services/ocpp-message-processor.js`  
**Purpose:** Consumes OCPP messages from RabbitMQ, processes them

**Integration Points:**
- Replaces logic from `websocket-server.js` (lines 260-670)
- Uses `storeMessage()` function (moved from `websocket-server.js` line 832)

**What it does:**
- Consumes from `ocpp_messages` queue
- Processes BootNotification, StartTransaction, StopTransaction, StatusNotification, MeterValues
- Stores messages in database
- Updates charging sessions
- Publishes notifications

### 5. Notification Service
**File:** `services/notification-service.js`  
**Purpose:** Consumes notifications from RabbitMQ, broadcasts to frontend via Socket.io

**Integration Points:**
- Started from `server.js` (line ~88)
- Receives notifications from OCPP processor
- Receives notifications from customer routes

**What it does:**
- Consumes from `notifications` queue
- Broadcasts to frontend via Socket.io
- Handles different notification types

### 6. Base Consumer Class
**File:** `services/rabbitmq/consumer.js`  
**Purpose:** Base class for all RabbitMQ consumers

**Integration Points:**
- Extended by `ocpp-message-processor.js`
- Extended by `notification-service.js`

### 7. Worker Processes (Optional)
**Files:**
- `workers/ocpp-worker.js` - Runs OCPP message processor
- `workers/notification-worker.js` - Runs notification service

**Integration Points:**
- Can run as separate processes
- Started via PM2 or similar

---

## 📊 Message Flow Diagram

### Current Flow (Without RabbitMQ):
```
Charger → WebSocket Server → Direct Processing → Database
                                    ↓
                            Business Logic (synchronous)
```

### New Flow (With RabbitMQ):
```
Charger → WebSocket Server → RabbitMQ Queue → OCPP Processor → Database
                                    ↓                              ↓
                            Notification Queue → Notification Service → Socket.io → Frontend
```

---

## 🔄 Specific Code Sections to Modify

### Section 1: `websocket-server.js` - Message Handler
**Lines:** 164-670
**Action:** Replace business logic with RabbitMQ publishing
**Keep:** Connection management, immediate responses

### Section 2: `websocket-server.js` - Message Storage
**Lines:** 832-953
**Action:** Move entire function to `services/ocpp-message-processor.js`
**Keep:** All logic, just change location

### Section 3: `routes/charger.js` - Command Endpoints
**Lines:** ~600-1200
**Action:** Add RabbitMQ publishing after sending commands
**Keep:** WebSocket sending (chargers need immediate commands)

### Section 4: `routes/customer.js` - Charging Endpoints
**Lines:** 2519-3215
**Action:** Add RabbitMQ event publishing
**Keep:** Critical wallet/session operations

### Section 5: `server.js` - Startup
**Lines:** 77-96
**Action:** Add RabbitMQ initialization, Socket.io server
**Keep:** Existing startup logic

---

## 📝 Summary of Changes

### Files to Modify:
1. ✅ `websocket-server.js` - Publish messages instead of processing
2. ✅ `routes/charger.js` - Publish commands to RabbitMQ
3. ✅ `routes/customer.js` - Publish events to RabbitMQ
4. ✅ `server.js` - Initialize RabbitMQ and Socket.io

### Files to Create:
1. ✨ `services/rabbitmq/connection.js`
2. ✨ `services/rabbitmq/producer.js`
3. ✨ `services/rabbitmq/consumer.js`
4. ✨ `services/rabbitmq/queues.js`
5. ✨ `services/ocpp-message-processor.js`
6. ✨ `services/notification-service.js`
7. ✨ `workers/ocpp-worker.js` (optional)
8. ✨ `workers/notification-worker.js` (optional)

### Logic to Move:
- Message storage logic → `services/ocpp-message-processor.js`
- Business logic processing → `services/ocpp-message-processor.js`
- Notification broadcasting → `services/notification-service.js`

### Logic to Keep:
- WebSocket connection management → `websocket-server.js`
- Immediate OCPP responses → `websocket-server.js`
- Wallet operations → `routes/customer.js` (synchronous)
- Command sending → `routes/charger.js` (immediate)

---

## 🚀 Implementation Order

1. **Phase 1:** Create RabbitMQ infrastructure (connection, producer, queues)
2. **Phase 2:** Modify `websocket-server.js` to publish messages
3. **Phase 3:** Create OCPP message processor (move logic from websocket-server)
4. **Phase 4:** Add RabbitMQ publishing to `routes/charger.js` and `routes/customer.js`
5. **Phase 5:** Create notification service, integrate Socket.io
6. **Phase 6:** Test end-to-end flow
7. **Phase 7:** Create worker processes (optional, for scaling)

---

## ⚠️ Important Notes

1. **Keep Immediate Responses:** Chargers need immediate responses (BootNotification, StartTransaction, etc.). Don't move these to RabbitMQ.

2. **Keep Critical Operations:** Wallet operations and session updates that affect user experience should remain synchronous.

3. **Gradual Migration:** Start with one message type (e.g., MeterValues), test thoroughly, then migrate others.

4. **Backward Compatibility:** Keep existing code running in parallel initially, compare results.

5. **Error Handling:** RabbitMQ operations should not block WebSocket responses. Use try-catch and continue even if publishing fails.

---

This document provides the exact integration points. Each section shows where to add code and what to keep/modify.

