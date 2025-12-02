# RabbitMQ Integration Guide for GenX EV Charging System

## Table of Contents
1. [Why RabbitMQ?](#why-rabbitmq)
2. [Architecture Overview](#architecture-overview)
3. [Installation & Setup](#installation--setup)
4. [Integration Points](#integration-points)
5. [Use Cases](#use-cases)
6. [Code Structure](#code-structure)
7. [Implementation Steps](#implementation-steps)
8. [Best Practices](#best-practices)

---

## Why RabbitMQ?

### Current Architecture Issues:
- **Direct WebSocket Communication**: Your `websocket-server.js` handles OCPP messages directly, which can become a bottleneck
- **Synchronous Processing**: All message processing happens in sequence, blocking other operations
- **No Message Persistence**: If the server crashes, in-flight messages are lost
- **Scalability**: Hard to scale horizontally with multiple server instances
- **Decoupling**: Business logic is tightly coupled with WebSocket handling

### Benefits of RabbitMQ:
1. **Message Persistence**: Messages survive server restarts
2. **Decoupling**: Separate producers (WebSocket handlers) from consumers (business logic)
3. **Scalability**: Multiple worker processes can consume messages
4. **Reliability**: Built-in acknowledgments and retry mechanisms
5. **Load Balancing**: Distribute work across multiple consumers
6. **Event-Driven Architecture**: Enable real-time notifications across services

---

## Architecture Overview

### Current Flow:
```
Charger Device → WebSocket Server → Direct Processing → Database
```

### Proposed Flow with RabbitMQ:
```
Charger Device → WebSocket Server → RabbitMQ Queue → Worker Processes → Database
                                              ↓
                                    Notification Service
                                              ↓
                                    Frontend (Socket.io)
```

### Components:

1. **Producer** (`websocket-server.js`):
   - Receives OCPP messages from chargers
   - Publishes messages to RabbitMQ queues
   - Doesn't process business logic

2. **RabbitMQ Server**:
   - Manages queues and exchanges
   - Routes messages based on routing keys
   - Handles message persistence and delivery

3. **Consumers** (Worker Processes):
   - `ocpp-message-processor.js`: Processes OCPP messages
   - `notification-service.js`: Sends real-time updates
   - `analytics-processor.js`: Handles analytics and reporting

4. **Notification Service**:
   - Publishes events to frontend via Socket.io
   - Updates dashboard in real-time

---

## Installation & Setup

### 1. Install RabbitMQ Server

**Windows:**
```bash
# Download and install from: https://www.rabbitmq.com/download.html
# Or use Chocolatey:
choco install rabbitmq
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install rabbitmq-server
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server
```

**macOS:**
```bash
brew install rabbitmq
brew services start rabbitmq
```

### 2. Enable Management Plugin
```bash
rabbitmq-plugins enable rabbitmq_management
```

Access management UI at: `http://localhost:15672`
- Default username: `guest`
- Default password: `guest`

### 3. Install Node.js Client Library
```bash
npm install amqplib
```

### 4. Environment Variables
Add to your `.env` file:
```env
# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_USERNAME=guest
RABBITMQ_PASSWORD=guest
RABBITMQ_VHOST=/

# Queue Names
RABBITMQ_QUEUE_OCPP_MESSAGES=ocpp_messages
RABBITMQ_QUEUE_NOTIFICATIONS=notifications
RABBITMQ_QUEUE_ANALYTICS=analytics
RABBITMQ_QUEUE_CHARGING_EVENTS=charging_events

# Exchange Names
RABBITMQ_EXCHANGE_OCPP=ocpp_exchange
RABBITMQ_EXCHANGE_EVENTS=events_exchange
```

---

## Integration Points

### 1. WebSocket Server (`websocket-server.js`)

**Current Code Location:**
- Line 164-195: Message receiving and parsing
- Line 196-670: Message processing logic
- Line 765-829: Message queuing for sequential storage

**Changes Needed:**
- Instead of processing messages directly, publish them to RabbitMQ
- Keep WebSocket connection management (connection/disconnection)
- Remove business logic processing

**Example Integration:**
```javascript
// In websocket-server.js
const { publishOCPPMessage } = require('./services/rabbitmq-producer');

ws.on('message', async (data) => {
  // Parse message (keep existing parsing logic)
  const parsed = parseIncoming(rawStr);
  
  // Publish to RabbitMQ instead of processing directly
  await publishOCPPMessage({
    deviceId,
    chargerId: currentCharger.id,
    message: parsed,
    timestamp: new Date(),
    rawData: rawStr
  });
  
  // Send acknowledgment back to charger if needed
  // (keep existing response logic)
});
```

### 2. Message Processor (New File)

**Create:** `services/ocpp-message-processor.js`
- Consumes messages from `ocpp_messages` queue
- Processes OCPP business logic
- Stores data in database
- Publishes events to notification queue

### 3. Notification Service (New File)

**Create:** `services/notification-service.js`
- Consumes from `notifications` queue
- Publishes to Socket.io for real-time frontend updates
- Handles different notification types (charging started, stopped, errors, etc.)

### 4. Analytics Processor (Optional)

**Create:** `services/analytics-processor.js`
- Consumes from `analytics` queue
- Processes analytics data
- Generates reports
- Updates statistics

---

## Use Cases

### 1. OCPP Message Processing
**Queue:** `ocpp_messages`
**Routing Key:** `ocpp.message.{messageType}` (e.g., `ocpp.message.StatusNotification`)

**Message Format:**
```json
{
  "deviceId": "CHARGER_001",
  "chargerId": 123,
  "messageType": "StatusNotification",
  "payload": { ... },
  "timestamp": "2024-01-15T10:30:00Z",
  "rawData": "[2, \"msg-id\", \"StatusNotification\", {...}]"
}
```

**Benefits:**
- Process messages asynchronously
- Handle high message volumes
- Retry failed messages automatically
- Scale processing with multiple workers

### 2. Real-Time Notifications
**Queue:** `notifications`
**Exchange:** `events_exchange` (Topic Exchange)

**Event Types:**
- `charging.started` - When charging session begins
- `charging.stopped` - When charging session ends
- `charger.status.changed` - When charger status changes
- `transaction.completed` - When transaction is finalized
- `error.occurred` - When errors happen

**Routing Keys:**
- `notification.charging.started`
- `notification.charger.status.changed`
- `notification.error.occurred`

### 3. Charging Session Events
**Queue:** `charging_events`
**Use Cases:**
- Start/Stop charging commands
- Meter value updates
- Transaction management
- Billing calculations

### 4. Analytics & Reporting
**Queue:** `analytics`
**Use Cases:**
- Aggregate charging statistics
- Generate hourly/daily reports
- Update dashboard metrics
- Calculate revenue

---

## Code Structure

### Recommended File Structure:
```
services/
├── rabbitmq/
│   ├── connection.js          # RabbitMQ connection manager
│   ├── producer.js            # Message publisher
│   ├── consumer.js             # Base consumer class
│   └── queues.js               # Queue/exchange definitions
├── ocpp-message-processor.js   # OCPP message consumer
├── notification-service.js     # Notification consumer
└── analytics-processor.js      # Analytics consumer (optional)

workers/
├── ocpp-worker.js              # Worker process for OCPP messages
├── notification-worker.js     # Worker process for notifications
└── analytics-worker.js        # Worker process for analytics
```

### 1. Connection Manager (`services/rabbitmq/connection.js`)
```javascript
// Manages RabbitMQ connection
// Handles reconnection logic
// Singleton pattern
```

### 2. Producer (`services/rabbitmq/producer.js`)
```javascript
// Functions to publish messages:
// - publishOCPPMessage()
// - publishNotification()
// - publishChargingEvent()
// - publishAnalytics()
```

### 3. Consumer Base Class (`services/rabbitmq/consumer.js`)
```javascript
// Base class for all consumers
// Handles connection, channel creation
// Error handling and retry logic
// Message acknowledgment
```

### 4. Queue Definitions (`services/rabbitmq/queues.js`)
```javascript
// Queue names
// Exchange names
// Routing keys
// Queue configuration (durable, persistent, etc.)
```

---

## Implementation Steps

### Phase 1: Setup & Infrastructure
1. ✅ Install RabbitMQ server
2. ✅ Install `amqplib` package
3. ✅ Add environment variables
4. ✅ Create connection manager
5. ✅ Create queue/exchange definitions
6. ✅ Test connection

### Phase 2: Producer Integration
1. ✅ Create producer service
2. ✅ Modify `websocket-server.js` to publish messages
3. ✅ Keep WebSocket connection handling
4. ✅ Test message publishing

### Phase 3: Consumer Implementation
1. ✅ Create base consumer class
2. ✅ Implement OCPP message processor
3. ✅ Move business logic from `websocket-server.js`
4. ✅ Test message consumption

### Phase 4: Notification System
1. ✅ Create notification service
2. ✅ Integrate with Socket.io
3. ✅ Publish events from processors
4. ✅ Test real-time updates

### Phase 5: Advanced Features
1. ✅ Implement message retry logic
2. ✅ Add dead letter queues
3. ✅ Implement priority queues
4. ✅ Add monitoring and logging

### Phase 6: Worker Processes
1. ✅ Create separate worker processes
2. ✅ Use PM2 or similar for process management
3. ✅ Implement graceful shutdown
4. ✅ Add health checks

---

## Best Practices

### 1. Message Design
- **Keep messages small**: Only include necessary data
- **Use JSON**: Easy to parse and debug
- **Include metadata**: deviceId, timestamp, messageId
- **Version messages**: Include version field for future compatibility

### 2. Queue Configuration
- **Durable queues**: Survive server restarts
- **Persistent messages**: Use `persistent: true`
- **Prefetch count**: Limit unacknowledged messages per consumer
- **TTL**: Set message time-to-live if needed

### 3. Error Handling
- **Dead Letter Queues**: Route failed messages
- **Retry Logic**: Implement exponential backoff
- **Logging**: Log all errors with context
- **Monitoring**: Track queue lengths and processing times

### 4. Performance
- **Connection Pooling**: Reuse connections
- **Batch Processing**: Process multiple messages together
- **Async Processing**: Don't block the event loop
- **Monitoring**: Track message rates and latency

### 5. Security
- **Authentication**: Use credentials from environment
- **VHost Isolation**: Separate environments
- **SSL/TLS**: Use encrypted connections in production
- **Access Control**: Limit queue permissions

### 6. Testing
- **Unit Tests**: Test producers and consumers separately
- **Integration Tests**: Test full message flow
- **Load Tests**: Test under high message volumes
- **Mock RabbitMQ**: Use `amqp-connection-manager` for testing

---

## Example Message Flow

### Scenario: Charger Status Update

1. **Charger sends StatusNotification via WebSocket**
   ```
   Charger → WebSocket Server
   ```

2. **WebSocket Server publishes to RabbitMQ**
   ```javascript
   await publishOCPPMessage({
     deviceId: "CHARGER_001",
     messageType: "StatusNotification",
     payload: { connectorId: 1, status: "Available" }
   });
   ```

3. **OCPP Processor consumes message**
   ```
   RabbitMQ Queue → OCPP Message Processor
   ```

4. **Processor updates database**
   ```javascript
   await ChargerData.create({ ... });
   await Charger.update({ status: "Available" });
   ```

5. **Processor publishes notification**
   ```javascript
   await publishNotification({
     type: "charger.status.changed",
     chargerId: 123,
     status: "Available"
   });
   ```

6. **Notification Service sends to frontend**
   ```
   Notification Service → Socket.io → Frontend Dashboard
   ```

---

## Monitoring & Management

### RabbitMQ Management UI
- URL: `http://localhost:15672`
- Monitor queues, connections, exchanges
- View message rates and consumers
- Manage users and permissions

### Key Metrics to Monitor:
- **Queue Length**: Number of unprocessed messages
- **Message Rate**: Messages per second
- **Consumer Count**: Active consumers
- **Acknowledgment Rate**: Successfully processed messages
- **Error Rate**: Failed messages

### Health Checks:
```javascript
// Check RabbitMQ connection health
async function checkRabbitMQHealth() {
  try {
    const connection = await getConnection();
    const channel = await connection.createChannel();
    await channel.checkQueue('ocpp_messages');
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}
```

---

## Migration Strategy

### Step-by-Step Migration:

1. **Keep existing code running**
   - Don't remove current WebSocket processing immediately
   - Run both systems in parallel initially

2. **Add RabbitMQ alongside**
   - Publish messages to RabbitMQ
   - Keep processing in WebSocket server
   - Compare results

3. **Gradually move processing**
   - Move one message type at a time
   - Start with non-critical messages
   - Test thoroughly

4. **Switch over**
   - Once confident, remove old processing
   - Keep WebSocket server as producer only
   - Monitor for issues

5. **Optimize**
   - Fine-tune queue configurations
   - Add more consumers if needed
   - Implement advanced features

---

## Troubleshooting

### Common Issues:

1. **Connection Refused**
   - Check RabbitMQ server is running
   - Verify connection URL
   - Check firewall settings

2. **Messages Not Consumed**
   - Check consumer is running
   - Verify queue name matches
   - Check routing keys

3. **High Memory Usage**
   - Reduce prefetch count
   - Process messages faster
   - Add more consumers

4. **Message Loss**
   - Enable message persistence
   - Use durable queues
   - Implement acknowledgments

---

## Next Steps

1. Review this guide
2. Install RabbitMQ server
3. Set up development environment
4. Create connection manager
5. Implement producer for one message type
6. Test end-to-end flow
7. Gradually migrate other message types

---

## Additional Resources

- [RabbitMQ Documentation](https://www.rabbitmq.com/documentation.html)
- [amqplib Documentation](https://www.squaremobius.net/amqp.node/)
- [RabbitMQ Patterns](https://www.rabbitmq.com/getstarted.html)
- [Message Queue Best Practices](https://www.cloudamqp.com/blog/part1-rabbitmq-for-beginners-what-is-rabbitmq.html)

---

**Note:** This is a planning document. Implementation should be done incrementally with thorough testing at each step.

