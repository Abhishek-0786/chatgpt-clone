# RabbitMQ Code Structure Examples

This file shows the code structure and examples for RabbitMQ integration **without implementing** them in your codebase.

---

## 1. Connection Manager (`services/rabbitmq/connection.js`)

```javascript
const amqp = require('amqplib');

let connection = null;
let channels = new Map();

async function getConnection() {
  if (connection) {
    return connection;
  }
  
  const url = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  connection = await amqp.connect(url);
  
  connection.on('error', (err) => {
    console.error('RabbitMQ connection error:', err);
    connection = null;
  });
  
  connection.on('close', () => {
    console.log('RabbitMQ connection closed');
    connection = null;
    channels.clear();
  });
  
  return connection;
}

async function getChannel(queueName) {
  if (channels.has(queueName)) {
    return channels.get(queueName);
  }
  
  const conn = await getConnection();
  const channel = await conn.createChannel();
  
  // Make queue durable
  await channel.assertQueue(queueName, { durable: true });
  
  channels.set(queueName, channel);
  return channel;
}

module.exports = { getConnection, getChannel };
```

---

## 2. Producer Service (`services/rabbitmq/producer.js`)

```javascript
const { getChannel } = require('./connection');
const { QUEUES, EXCHANGES } = require('./queues');

async function publishOCPPMessage(messageData) {
  try {
    const channel = await getChannel(QUEUES.OCPP_MESSAGES);
    
    const message = JSON.stringify({
      deviceId: messageData.deviceId,
      chargerId: messageData.chargerId,
      messageType: messageData.messageType,
      payload: messageData.payload,
      timestamp: new Date().toISOString(),
      rawData: messageData.rawData
    });
    
    // Publish with persistence
    channel.sendToQueue(QUEUES.OCPP_MESSAGES, Buffer.from(message), {
      persistent: true
    });
    
    console.log(`📤 Published OCPP message: ${messageData.messageType} from ${messageData.deviceId}`);
  } catch (error) {
    console.error('Error publishing OCPP message:', error);
    throw error;
  }
}

async function publishNotification(notificationData) {
  try {
    const channel = await getChannel(QUEUES.NOTIFICATIONS);
    const exchange = EXCHANGES.EVENTS;
    
    // Assert topic exchange
    await channel.assertExchange(exchange, 'topic', { durable: true });
    
    const routingKey = `notification.${notificationData.type}`;
    const message = JSON.stringify(notificationData);
    
    channel.publish(exchange, routingKey, Buffer.from(message), {
      persistent: true
    });
    
    console.log(`📤 Published notification: ${routingKey}`);
  } catch (error) {
    console.error('Error publishing notification:', error);
    throw error;
  }
}

module.exports = {
  publishOCPPMessage,
  publishNotification
};
```

---

## 3. Queue Definitions (`services/rabbitmq/queues.js`)

```javascript
module.exports = {
  QUEUES: {
    OCPP_MESSAGES: 'ocpp_messages',
    NOTIFICATIONS: 'notifications',
    CHARGING_EVENTS: 'charging_events',
    ANALYTICS: 'analytics',
    DEAD_LETTER: 'dead_letter_queue'
  },
  
  EXCHANGES: {
    OCPP: 'ocpp_exchange',
    EVENTS: 'events_exchange'
  },
  
  ROUTING_KEYS: {
    // OCPP Messages
    STATUS_NOTIFICATION: 'ocpp.message.StatusNotification',
    METER_VALUES: 'ocpp.message.MeterValues',
    START_TRANSACTION: 'ocpp.message.StartTransaction',
    STOP_TRANSACTION: 'ocpp.message.StopTransaction',
    
    // Notifications
    CHARGING_STARTED: 'notification.charging.started',
    CHARGING_STOPPED: 'notification.charging.stopped',
    CHARGER_STATUS_CHANGED: 'notification.charger.status.changed',
    ERROR_OCCURRED: 'notification.error.occurred'
  }
};
```

---

## 4. Base Consumer Class (`services/rabbitmq/consumer.js`)

```javascript
const { getConnection } = require('./connection');
const { QUEUES } = require('./queues');

class BaseConsumer {
  constructor(queueName, options = {}) {
    this.queueName = queueName;
    this.options = {
      prefetch: options.prefetch || 1,
      durable: true,
      ...options
    };
    this.channel = null;
    this.connection = null;
  }
  
  async connect() {
    this.connection = await getConnection();
    this.channel = await this.connection.createChannel();
    
    // Set prefetch count
    await this.channel.prefetch(this.options.prefetch);
    
    // Assert queue
    await this.channel.assertQueue(this.queueName, {
      durable: this.options.durable
    });
    
    console.log(`✅ Consumer connected to queue: ${this.queueName}`);
  }
  
  async consume(handler) {
    if (!this.channel) {
      await this.connect();
    }
    
    await this.channel.consume(this.queueName, async (msg) => {
      if (!msg) return;
      
      try {
        const content = JSON.parse(msg.content.toString());
        
        // Process message
        await handler(content);
        
        // Acknowledge message
        this.channel.ack(msg);
      } catch (error) {
        console.error(`Error processing message from ${this.queueName}:`, error);
        
        // Reject and requeue (or send to dead letter queue)
        this.channel.nack(msg, false, false);
      }
    }, {
      noAck: false
    });
    
    console.log(`👂 Listening to queue: ${this.queueName}`);
  }
  
  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}

module.exports = BaseConsumer;
```

---

## 5. OCPP Message Processor (`services/ocpp-message-processor.js`)

```javascript
const BaseConsumer = require('./rabbitmq/consumer');
const { QUEUES } = require('./rabbitmq/queues');
const { publishNotification } = require('./rabbitmq/producer');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const ChargingSession = require('../models/ChargingSession');

class OCPPMessageProcessor extends BaseConsumer {
  constructor() {
    super(QUEUES.OCPP_MESSAGES, { prefetch: 10 });
  }
  
  async processMessage(messageData) {
    const { deviceId, chargerId, messageType, payload } = messageData;
    
    console.log(`🔄 Processing ${messageType} from ${deviceId}`);
    
    switch (messageType) {
      case 'StatusNotification':
        await this.handleStatusNotification(deviceId, chargerId, payload);
        break;
        
      case 'MeterValues':
        await this.handleMeterValues(deviceId, chargerId, payload);
        break;
        
      case 'StartTransaction':
        await this.handleStartTransaction(deviceId, chargerId, payload);
        break;
        
      case 'StopTransaction':
        await this.handleStopTransaction(deviceId, chargerId, payload);
        break;
        
      default:
        console.log(`Unknown message type: ${messageType}`);
    }
    
    // Store message in database
    await this.storeMessage(messageData);
  }
  
  async handleStatusNotification(deviceId, chargerId, payload) {
    // Update charger status
    await Charger.update(
      { 
        status: payload.status,
        lastSeen: new Date()
      },
      { where: { deviceId } }
    );
    
    // Publish notification
    await publishNotification({
      type: 'charger.status.changed',
      chargerId,
      deviceId,
      status: payload.status,
      connectorId: payload.connectorId
    });
  }
  
  async handleMeterValues(deviceId, chargerId, payload) {
    // Process meter values
    // Update charging session
    // Calculate energy consumed
    
    // Publish notification for real-time updates
    await publishNotification({
      type: 'meter.values.updated',
      chargerId,
      deviceId,
      connectorId: payload.connectorId,
      values: payload.meterValue
    });
  }
  
  async handleStartTransaction(deviceId, chargerId, payload) {
    // Create charging session
    const session = await ChargingSession.create({
      chargerId,
      connectorId: payload.connectorId,
      idTag: payload.idTag,
      timestamp: new Date(payload.timestamp),
      meterStart: payload.meterStart
    });
    
    // Publish notification
    await publishNotification({
      type: 'charging.started',
      chargerId,
      deviceId,
      sessionId: session.id,
      connectorId: payload.connectorId
    });
  }
  
  async handleStopTransaction(deviceId, chargerId, payload) {
    // Update charging session
    const session = await ChargingSession.findOne({
      where: { transactionId: payload.transactionId }
    });
    
    if (session) {
      await session.update({
        meterStop: payload.meterStop,
        stopReason: payload.reason,
        stopTimestamp: new Date(payload.timestamp)
      });
      
      // Publish notification
      await publishNotification({
        type: 'charging.stopped',
        chargerId,
        deviceId,
        sessionId: session.id
      });
    }
  }
  
  async storeMessage(messageData) {
    // Store in ChargerData table (existing logic)
    // This is where your current storeMessage() logic goes
  }
}

// Start processor
async function startOCPPProcessor() {
  const processor = new OCPPMessageProcessor();
  await processor.consume((messageData) => processor.processMessage(messageData));
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down OCPP processor...');
    await processor.close();
    process.exit(0);
  });
}

module.exports = { OCPPMessageProcessor, startOCPPProcessor };
```

---

## 6. Notification Service (`services/notification-service.js`)

```javascript
const BaseConsumer = require('./rabbitmq/consumer');
const { QUEUES, EXCHANGES, ROUTING_KEYS } = require('./rabbitmq/queues');
const { getConnection } = require('./rabbitmq/connection');
const { Server } = require('socket.io');

class NotificationService extends BaseConsumer {
  constructor(io) {
    super(QUEUES.NOTIFICATIONS, { prefetch: 20 });
    this.io = io;
  }
  
  async connect() {
    const connection = await getConnection();
    this.channel = await connection.createChannel();
    
    // Assert topic exchange
    await this.channel.assertExchange(EXCHANGES.EVENTS, 'topic', { durable: true });
    
    // Bind queue to exchange
    await this.channel.assertQueue(this.queueName, { durable: true });
    await this.channel.bindQueue(
      this.queueName,
      EXCHANGES.EVENTS,
      'notification.*' // Listen to all notifications
    );
    
    console.log(`✅ Notification service connected`);
  }
  
  async processNotification(notificationData) {
    const { type, chargerId, deviceId, ...data } = notificationData;
    
    console.log(`📢 Broadcasting notification: ${type}`);
    
    // Broadcast to all connected clients
    this.io.emit('notification', {
      type,
      chargerId,
      deviceId,
      data,
      timestamp: new Date().toISOString()
    });
    
    // Also emit specific event types
    switch (type) {
      case 'charging.started':
        this.io.emit('charging:started', { chargerId, ...data });
        break;
      case 'charging.stopped':
        this.io.emit('charging:stopped', { chargerId, ...data });
        break;
      case 'charger.status.changed':
        this.io.emit('charger:status:changed', { chargerId, deviceId, ...data });
        break;
    }
  }
}

// Start notification service
async function startNotificationService(io) {
  const service = new NotificationService(io);
  await service.connect();
  await service.consume((notificationData) => service.processNotification(notificationData));
  
  return service;
}

module.exports = { NotificationService, startNotificationService };
```

---

## 7. Modified WebSocket Server (`websocket-server.js` - Partial)

```javascript
// At the top, add:
const { publishOCPPMessage } = require('./services/rabbitmq/producer');

// In the message handler (around line 164), modify:
ws.on('message', async (data) => {
  const previousPromise = messageProcessingLocks.get(deviceId);
  const currentPromise = (async () => {
    await previousPromise;
    
    console.log(`📩 Message received from ${deviceId}`);
    
    try {
      const currentCharger = await ensureCharger();
      if (!currentCharger || !currentCharger.id) {
        console.error(`❌ Charger not ready for ${deviceId}`);
        return;
      }
      
      const rawStr = data.toString();
      let parsed;
      
      try {
        parsed = parseIncoming(rawStr);
        console.log(`🔍 Parsed: ${parsed.kind}, action=${parsed.action || 'N/A'}`);
      } catch (parseError) {
        console.error(`❌ Parse error:`, parseError.message);
        return;
      }
      
      // PUBLISH TO RABBITMQ INSTEAD OF PROCESSING DIRECTLY
      await publishOCPPMessage({
        deviceId,
        chargerId: currentCharger.id,
        messageType: parsed.action || parsed.kind,
        payload: parsed.payload || parsed,
        rawData: rawStr,
        timestamp: new Date()
      });
      
      // Still handle immediate responses if needed
      if (parsed.kind === 'CALL' && parsed.action === 'BootNotification') {
        // Send immediate response
        const response = toOcppCallResult(parsed.id, {
          status: 'Accepted',
          currentTime: new Date().toISOString(),
          interval: 300
        });
        ws.send(JSON.stringify(response));
      }
      
    } catch (error) {
      console.error(`❌ Error handling message:`, error);
    }
  })();
  
  messageProcessingLocks.set(deviceId, currentPromise);
});
```

---

## 8. Worker Process (`workers/ocpp-worker.js`)

```javascript
const { startOCPPProcessor } = require('../services/ocpp-message-processor');

// Start the processor
startOCPPProcessor().catch((error) => {
  console.error('Failed to start OCPP processor:', error);
  process.exit(1);
});
```

---

## 9. Modified Server.js

```javascript
// Add at the top:
const { startNotificationService } = require('./services/notification-service');
const { Server } = require('socket.io');
const http = require('http');

// Create HTTP server for Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In startServer function:
const startServer = async () => {
  try {
    await syncDatabase();
    
    // Start HTTP server (instead of app.listen)
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Express server running on http://localhost:${PORT}`);
    });
    
    // Start WebSocket server
    createWebSocketServer(WEBSOCKET_PORT);
    
    // Start RabbitMQ notification service
    await startNotificationService(io);
    console.log('✅ Notification service started');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};
```

---

## 10. Package.json Scripts

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "worker:ocpp": "node workers/ocpp-worker.js",
    "worker:notification": "node workers/notification-worker.js",
    "worker:all": "concurrently \"npm run worker:ocpp\" \"npm run worker:notification\""
  }
}
```

---

## Summary

This structure shows:

1. **Separation of Concerns**: WebSocket server only handles connections, RabbitMQ handles message routing
2. **Scalability**: Multiple workers can process messages
3. **Reliability**: Messages are persisted and can be retried
4. **Real-time Updates**: Notification service broadcasts to frontend
5. **Maintainability**: Each component has a single responsibility

**Next Steps:**
1. Review these examples
2. Install RabbitMQ
3. Create the file structure
4. Implement connection manager first
5. Test with one message type
6. Gradually migrate other message types

