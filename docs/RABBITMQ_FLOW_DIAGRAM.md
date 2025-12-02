# Complete RabbitMQ Flow - How It Works

## 🎯 Overview

When a charger connects and sends messages (BootNotification, StartTransaction, StopTransaction, etc.), here's the complete flow:

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CHARGER (OCPP Device)                           │
│                    Connects via WebSocket (port 9000)                   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                │ 1. WebSocket Connection
                                │    ws://localhost:9000/ws/ocpp/16/{deviceId}
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    websocket-server.js                                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  ws.on('message', async (data) => {                              │  │
│  │    // Receives raw OCPP message from charger                      │  │
│  │    // Example: [2, "msg-id", "BootNotification", {...}]          │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│                                │ 2. Parse Message                       │
│                                │    parsed = parseIncoming(data)       │
│                                │    → kind: 'CALL'                      │
│                                │    → action: 'BootNotification'       │
│                                │    → payload: {...}                    │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  STEP 3: Send Immediate Response (Synchronous)                  │  │
│  │  ──────────────────────────────────────────────────────────────  │  │
│  │  ws.send(JSON.stringify(responseFrame))                          │  │
│  │  → Charger gets instant response (doesn't wait for RabbitMQ)    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│                                │ 4. Publish to RabbitMQ (Asynchronous)   │
│                                │    if (ENABLE_RABBITMQ) {              │
│                                │      await publishOCPPMessage({        │
│                                │        deviceId, chargerId,            │
│                                │        messageType: 'BootNotification',│
│                                │        payload, rawData,               │
│                                │        parsedMessage                   │
│                                │      })                                │
│                                │    }                                    │
│                                ▼                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ 5. Message Published to Exchange
                                │    Exchange: 'ev_charging_events'
                                │    Routing Key: 'ocpp.bootnotification'
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         RABBITMQ SERVER                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Topic Exchange: ev_charging_events                               │  │
│  │  ┌──────────────────────────────────────────────────────────────┐ │  │
│  │  │  Routing Keys:                                               │ │  │
│  │  │  • ocpp.bootnotification → ocpp_messages queue              │ │  │
│  │  │  • ocpp.starttransaction → ocpp_messages queue               │ │  │
│  │  │  • ocpp.stoptransaction → ocpp_messages queue                │ │  │
│  │  │  • ocpp.statusnotification → ocpp_messages queue             │ │  │
│  │  │  • ocpp.metervalues → ocpp_messages queue                    │ │  │
│  │  │  • ocpp.response → ocpp_messages queue                       │ │  │
│  │  └──────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                │                                        │
│                                │ 6. Message Routed to Queue             │
│                                │    Queue: 'ocpp_messages'              │
│                                │    (Durable, Priority-based)            │
│                                ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Queue: ocpp_messages                                            │  │
│  │  ┌──────────────────────────────────────────────────────────────┐ │  │
│  │  │  Messages waiting to be consumed...                         │ │  │
│  │  │  [BootNotification] [StartTransaction] [StopTransaction]...  │ │  │
│  │  └──────────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ 7. Consumer Picks Up Message
                                │    OCPPMessageProcessor.start()
                                │    → Consumes from 'ocpp_messages'
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              services/ocpp-message-processor.js                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  class OCPPMessageProcessor extends BaseConsumer {                │  │
│  │    async processMessage(content, msg) {                           │  │
│  │      // content = {                                                │  │
│  │      //   deviceId, chargerId, messageType,                        │  │
│  │      //   payload, rawData, parsedMessage                          │  │
│  │      // }                                                          │  │
│  │                                                                    │  │
│  │      // STEP 8: Store in Database                                 │  │
│  │      await this.storeMessage(deviceId, chargerId, parsedMessage)   │  │
│  │      → ChargerData.create({                                       │  │
│  │           chargerId, deviceId, type: 'OCPP',                      │  │
│  │           message: 'BootNotification',                            │  │
│  │           messageData: payload,                                   │  │
│  │           direction: 'Incoming',                                 │  │
│  │           raw: [...], timestamp                                   │  │
│  │         })                                                        │  │
│  │                                                                    │  │
│  │      // STEP 9: Process Based on Message Type                    │  │
│  │      switch (messageType) {                                       │  │
│  │        case 'BootNotification':                                   │  │
│  │          await this.handleBootNotification(...)                   │  │
│  │          → Update charger metadata (vendor, model, etc.)         │  │
│  │          → Publish notification                                  │  │
│  │          break;                                                   │  │
│  │        case 'StartTransaction':                                   │  │
│  │          await this.handleStartTransaction(...)                   │  │
│  │          → Create/update charging session                         │  │
│  │          → Publish notification                                  │  │
│  │          break;                                                   │  │
│  │        case 'StopTransaction':                                    │  │
│  │          await this.handleStopTransaction(...)                   │  │
│  │          → Update charging session                               │  │
│  │          → Publish notification                                  │  │
│  │          break;                                                   │  │
│  │      }                                                            │  │
│  │    }                                                               │  │
│  │  }                                                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ 10. Publish Notification (Optional)
                                │     publishNotification({
                                │       type: 'charger.booted',
                                │       data: { deviceId, chargerId }
                                │     })
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              services/notification-service.js                           │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  class NotificationService extends BaseConsumer {                 │  │
│  │    async processMessage(notificationContent) {                   │  │
│  │      // Broadcast via Socket.io                                  │  │
│  │      ioInstance.emit('notification', notificationContent)         │  │
│  │      → Real-time updates to connected clients                     │  │
│  │    }                                                               │  │
│  │  }                                                                 │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ 11. Real-time Update
                                │     Socket.io broadcasts to clients
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Frontend (CMS / User Panel)                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  socket.on('notification', (data) => {                            │  │
│  │    // Update UI in real-time                                      │  │
│  │    // Show charger status, session updates, etc.                  │  │
│  │  })                                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📝 Step-by-Step Flow for Each Message Type

### 1️⃣ **BootNotification Flow**

```
Charger → WebSocket → websocket-server.js
  │
  ├─→ [IMMEDIATE] Send response to charger (synchronous)
  │   ws.send([3, "msg-id", {"status": "Accepted", ...}])
  │
  └─→ [ASYNC] Publish to RabbitMQ
      publishOCPPMessage({
        messageType: 'BootNotification',
        payload: {...},
        routingKey: 'ocpp.bootnotification'
      })
      │
      └─→ RabbitMQ Exchange → ocpp_messages queue
          │
          └─→ OCPPMessageProcessor consumes
              │
              ├─→ Store in ChargerData table
              │   INSERT INTO charger_data (...)
              │
              └─→ handleBootNotification()
                  ├─→ Update charger metadata (vendor, model, etc.)
                  └─→ Publish notification → Socket.io → Frontend
```

### 2️⃣ **StartTransaction Flow**

```
Charger → WebSocket → websocket-server.js
  │
  ├─→ [IMMEDIATE] Send response to charger (synchronous)
  │   ws.send([3, "msg-id", {"transactionId": 123, ...}])
  │
  └─→ [ASYNC] Publish to RabbitMQ
      publishOCPPMessage({
        messageType: 'StartTransaction',
        payload: {connectorId, idTag, ...},
        routingKey: 'ocpp.starttransaction'
      })
      │
      └─→ RabbitMQ Exchange → ocpp_messages queue
          │
          └─→ OCPPMessageProcessor consumes
              │
              ├─→ Store in ChargerData table
              │
              └─→ handleStartTransaction()
                  ├─→ Create/update ChargingSession
                  └─→ Publish notification → Socket.io → Frontend
```

### 3️⃣ **StopTransaction Flow**

```
Charger → WebSocket → websocket-server.js
  │
  ├─→ [IMMEDIATE] Send response to charger (synchronous)
  │   ws.send([3, "msg-id", {"idTagInfo": {...}}])
  │
  └─→ [ASYNC] Publish to RabbitMQ
      publishOCPPMessage({
        messageType: 'StopTransaction',
        payload: {transactionId, ...},
        routingKey: 'ocpp.stoptransaction'
      })
      │
      └─→ RabbitMQ Exchange → ocpp_messages queue
          │
          └─→ OCPPMessageProcessor consumes
              │
              ├─→ Store in ChargerData table
              │
              └─→ handleStopTransaction()
                  ├─→ Update ChargingSession (end time, final amount)
                  └─→ Publish notification → Socket.io → Frontend
```

---

## 🔄 Key Components

### **1. WebSocket Server (websocket-server.js)**
- **Role**: Receives messages from chargers, sends immediate responses
- **What it does**:
  - Parses incoming OCPP messages
  - Sends instant responses to chargers (synchronous)
  - Publishes messages to RabbitMQ (asynchronous)
- **Files**: `websocket-server.js`

### **2. RabbitMQ Producer (services/rabbitmq/producer.js)**
- **Role**: Publishes messages to RabbitMQ queues
- **What it does**:
  - Takes message data
  - Determines routing key based on message type
  - Publishes to exchange with priority
- **Function**: `publishOCPPMessage()`

### **3. RabbitMQ Exchange & Queues**
- **Exchange**: `ev_charging_events` (Topic Exchange)
- **Queue**: `ocpp_messages` (Durable, Priority-based)
- **Routing Keys**:
  - `ocpp.bootnotification`
  - `ocpp.starttransaction`
  - `ocpp.stoptransaction`
  - `ocpp.statusnotification`
  - `ocpp.metervalues`
  - `ocpp.response`
  - `ocpp.error`

### **4. OCPP Message Processor (services/ocpp-message-processor.js)**
- **Role**: Consumes messages from RabbitMQ and processes them
- **What it does**:
  - Consumes from `ocpp_messages` queue
  - Stores messages in database (ChargerData table)
  - Handles specific message types (BootNotification, StartTransaction, etc.)
  - Publishes notifications for real-time updates
- **Class**: `OCPPMessageProcessor extends BaseConsumer`

### **5. Notification Service (services/notification-service.js)**
- **Role**: Broadcasts notifications via Socket.io
- **What it does**:
  - Consumes from `notifications` queue
  - Broadcasts to connected Socket.io clients
  - Enables real-time UI updates

---

## 🎯 Why This Architecture?

### **Benefits:**
1. **Non-blocking**: Charger gets instant response, processing happens async
2. **Scalable**: Can handle high message volume via queues
3. **Reliable**: Messages are persisted in RabbitMQ (durable queues)
4. **Decoupled**: WebSocket server doesn't need to know about database
5. **Resilient**: If database is slow, messages wait in queue
6. **Real-time**: Notifications broadcast to frontend via Socket.io

### **Message Flow Summary:**
```
Charger Message
    ↓
WebSocket Server (immediate response)
    ↓
RabbitMQ Queue (async processing)
    ↓
OCPP Message Processor (database storage)
    ↓
Notification Service (real-time updates)
    ↓
Frontend (UI updates)
```

---

## 📊 Database Storage

All messages are stored in the `charger_data` table with:
- `chargerId`: Database ID of charger
- `deviceId`: Charger device ID
- `message`: Message type (BootNotification, StartTransaction, etc.)
- `messageData`: JSON payload
- `direction`: 'Incoming' (from charger) or 'Outgoing' (to charger)
- `raw`: Raw OCPP array format
- `timestamp`: When message was received
- `messageId`: Unique OCPP message ID (for duplicate detection)

---

## ✅ Current Status

✅ **Working:**
- Charger connects via WebSocket
- Messages received and parsed
- Immediate responses sent to charger
- Messages published to RabbitMQ
- Messages consumed and stored in database
- Notifications broadcast via Socket.io
- Duplicate message detection
- Priority-based message processing

This is the complete flow! 🎉

