# RabbitMQ Integration - Testing Guide

## ✅ **Backend Implementation Complete**

All 17 backend tasks are now complete:
- ✅ Foundation: 10/10 (100%)
- ✅ High Priority: 2/2 (100%) - Customer routes
- ✅ Medium Priority: 2/2 (100%) - Charger routes
- ✅ Low Priority: 6/6 (100%) - CMS routes

**Total Backend: 17/17 (100%) ✅**

---

## 🧪 **Testing Instructions**

### **Prerequisites**

1. **RabbitMQ Server Running**
   ```bash
   # Check if RabbitMQ is running
   docker ps | grep rabbitmq
   
   # Or start it
   docker-compose up -d
   ```

2. **Environment Variable Set**
   ```env
   ENABLE_RABBITMQ=true
   RABBITMQ_URL=amqp://guest:guest@localhost:5672
   ```

3. **Backend Server Running**
   ```bash
   node server.js
   ```

---

## 📋 **Test Checklist**

### **Test 1: Verify RabbitMQ Connection**

**What to Check:**
- Server logs should show: `✅ RabbitMQ initialized successfully`
- Server logs should show: `✅ OCPP Message Processor started`
- Server logs should show: `✅ Notification Service started`

**Expected Logs:**
```
🔌 Connecting to RabbitMQ...
📍 URL: amqp://guest:***@localhost:5672
✅ Exchange declared: ev_charging_events
✅ Dead Letter Queue set up: ev_charging_dlq
✅ Queue declared: ocpp_messages (durable: true)
✅ Queue declared: charging_commands (durable: true)
✅ Queue declared: charging_events (durable: true)
✅ Queue declared: notifications (durable: false)
✅ Queue declared: cms_events (durable: true)
✅ Queue declared: analytics (durable: true)
✅ RabbitMQ initialized successfully
✅ OCPP Message Processor started
✅ Notification Service started
```

**If Failed:**
- Check RabbitMQ is running: `docker ps`
- Check RabbitMQ Management UI: http://localhost:15672 (guest/guest)
- Check `.env` file has `ENABLE_RABBITMQ=true`

---

### **Test 2: Test Charger Routes - Command Publishing**

#### **Test 2.1: Remote Start Transaction**

**Endpoint:** `POST /api/charger/remote-start`

**Request:**
```json
{
  "deviceId": "DEVN0IBHDNZ",
  "connectorId": 1,
  "idTag": "ADMIN"
}
```

**What to Check:**
1. **API Response:** Should return `success: true`
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published RemoteStartTransaction command for DEVN0IBHDNZ
   ```
3. **RabbitMQ Management UI:**
   - Go to: http://localhost:15672
   - Navigate to: Queues → `charging_commands`
   - Check: Message count should increase
   - Click on queue → Get messages → Should see the command message

**Expected Message in Queue:**
```json
{
  "deviceId": "DEVN0IBHDNZ",
  "command": "RemoteStartTransaction",
  "payload": {
    "idTag": "ADMIN",
    "connectorId": 1
  },
  "timestamp": "2025-01-18T...",
  "sentViaWebSocket": true
}
```

---

#### **Test 2.2: Remote Stop Transaction**

**Endpoint:** `POST /api/charger/remote-stop`

**Request:**
```json
{
  "deviceId": "DEVN0IBHDNZ",
  "transactionId": 1234567
}
```

**What to Check:**
1. **API Response:** Should return `success: true`
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published RemoteStopTransaction command for DEVN0IBHDNZ
   ```
3. **RabbitMQ Management UI:**
   - Check `charging_commands` queue for new message

---

### **Test 3: Test Customer Routes - Charging Events**

#### **Test 3.1: Start Charging**

**Endpoint:** `POST /api/user/charging/start`

**Request:**
```json
{
  "deviceId": "DEVN0IBHDNZ",
  "connectorId": 1,
  "amount": 100,
  "chargingPointId": "CP-..."
}
```

**Headers:**
```
Authorization: Bearer <customer_token>
```

**What to Check:**
1. **API Response:** Should return `success: true` with session data
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published charging.started event for session <sessionId>
   📤 Published charging event: charging.started for session <sessionId>
   📤 Published notification: charging.started
   ```
3. **RabbitMQ Management UI:**
   - Check `charging_events` queue → Should have `charging.started` message
   - Check `notifications` queue → Should have notification message

**Expected Event in Queue:**
```json
{
  "type": "charging.started",
  "sessionId": "...",
  "customerId": 1,
  "deviceId": "DEVN0IBHDNZ",
  "connectorId": 1,
  "timestamp": "2025-01-18T...",
  "amountDeducted": 100,
  "chargingPointId": "CP-..."
}
```

---

#### **Test 3.2: Stop Charging**

**Endpoint:** `POST /api/user/charging/stop`

**Request:**
```json
{
  "deviceId": "DEVN0IBHDNZ",
  "connectorId": 1,
  "transactionId": "1234567"
}
```

**Headers:**
```
Authorization: Bearer <customer_token>
```

**What to Check:**
1. **API Response:** Should return `success: true` with session data (energy, cost, refund)
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published charging.stopped event for session <sessionId>
   📤 Published charging event: charging.stopped for session <sessionId>
   📤 Published notification: charging.stopped
   ```
3. **RabbitMQ Management UI:**
   - Check `charging_events` queue → Should have `charging.stopped` message
   - Check `notifications` queue → Should have notification message

**Expected Event in Queue:**
```json
{
  "type": "charging.stopped",
  "sessionId": "...",
  "customerId": 1,
  "deviceId": "DEVN0IBHDNZ",
  "connectorId": 1,
  "timestamp": "2025-01-18T...",
  "energyConsumed": 5.5,
  "finalAmount": 80.5,
  "refundAmount": 19.5,
  "amountDeducted": 100,
  "startTime": "...",
  "endTime": "...",
  "stopReason": "Remote"
}
```

---

### **Test 4: Test CMS Routes - CMS Events**

#### **Test 4.1: Create Station**

**Endpoint:** `POST /api/cms/stations`

**Request:**
```json
{
  "stationName": "Test Station",
  "organization": "massive_mobility",
  "gridPhase": "Three Phase",
  "country": "India"
}
```

**What to Check:**
1. **API Response:** Should return `success: true` with station data
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published cms.station.created event for STN-...
   📤 Published CMS event: cms.station.created
   ```
3. **RabbitMQ Management UI:**
   - Check `cms_events` queue → Should have `cms.station.created` message

---

#### **Test 4.2: Update Station**

**Endpoint:** `PUT /api/cms/stations/:stationId`

**Request:**
```json
{
  "stationName": "Updated Station Name"
}
```

**What to Check:**
1. **API Response:** Should return `success: true`
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published cms.station.updated event for STN-...
   ```
3. **RabbitMQ Management UI:**
   - Check `cms_events` queue → Should have `cms.station.updated` message

---

#### **Test 4.3: Create Charging Point**

**Endpoint:** `POST /api/cms/charging-points`

**Request:**
```json
{
  "deviceName": "Test Charger",
  "chargingStation": 1,
  "tariff": 1,
  "chargerType": "AC",
  "powerCapacity": 7.4,
  "phase": "Single Phase",
  "connectors": [
    {
      "connectorId": 1,
      "connectorType": "Type 2",
      "power": 7.4
    }
  ]
}
```

**What to Check:**
1. **API Response:** Should return `success: true` with point data
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published cms.point.created event for CP-...
   ```
3. **RabbitMQ Management UI:**
   - Check `cms_events` queue → Should have `cms.point.created` message

---

#### **Test 4.4: Update Charging Point**

**Endpoint:** `PUT /api/cms/charging-points/:chargingPointId`

**Request:**
```json
{
  "deviceName": "Updated Charger Name"
}
```

**What to Check:**
1. **API Response:** Should return `success: true`
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published cms.point.updated event for CP-...
   ```
3. **RabbitMQ Management UI:**
   - Check `cms_events` queue → Should have `cms.point.updated` message

---

#### **Test 4.5: Create Tariff**

**Endpoint:** `POST /api/cms/tariffs`

**Request:**
```json
{
  "tariffName": "Test Tariff",
  "currency": "INR",
  "baseCharges": 10,
  "tax": 18,
  "status": "Active"
}
```

**What to Check:**
1. **API Response:** Should return `success: true` with tariff data
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published cms.tariff.created event for TAR-...
   ```
3. **RabbitMQ Management UI:**
   - Check `cms_events` queue → Should have `cms.tariff.created` message

---

#### **Test 4.6: Update Tariff**

**Endpoint:** `PUT /api/cms/tariffs/:tariffId`

**Request:**
```json
{
  "tariffName": "Updated Tariff Name",
  "baseCharges": 12
}
```

**What to Check:**
1. **API Response:** Should return `success: true`
2. **Server Logs:** Should show:
   ```
   📤 [RABBITMQ] Published cms.tariff.updated event for TAR-...
   ```
3. **RabbitMQ Management UI:**
   - Check `cms_events` queue → Should have `cms.tariff.updated` message

---

### **Test 5: Test OCPP Message Publishing (Already Working)**

**What to Check:**
- Connect a charger via WebSocket
- Charger sends BootNotification, StartTransaction, etc.
- **Server Logs:** Should show:
  ```
  📤 Published OCPP message: BootNotification from DEVN0IBHDNZ to ocpp.bootnotification
  📤 Published OCPP message: StartTransaction from DEVN0IBHDNZ to ocpp.starttransaction
  ```
- **RabbitMQ Management UI:**
  - Check `ocpp_messages` queue → Should have messages
  - Messages should be consumed by OCPP Message Processor

---

## 🔍 **How to Verify Messages in RabbitMQ**

### **Method 1: RabbitMQ Management UI**

1. **Open:** http://localhost:15672
2. **Login:** guest / guest
3. **Navigate to:** Queues tab
4. **Select Queue:** e.g., `charging_events`
5. **Click:** "Get messages" button
6. **Check:** Messages should appear with JSON content

### **Method 2: Check Server Logs**

Look for these log patterns:
- `📤 [RABBITMQ] Published ...` - Message published successfully
- `📤 Published ...` - Generic publish confirmation
- `⚠️ [RABBITMQ] Failed to publish ...` - Publishing failed (check RabbitMQ connection)

### **Method 3: Check Queue Depths**

In RabbitMQ Management UI:
- **Queue Depth:** Should increase when messages are published
- **Message Rate:** Should show messages/sec
- **Consumer Count:** Should show active consumers

---

## ✅ **Success Criteria**

### **All Tests Pass If:**

1. ✅ **RabbitMQ Connection:** Server starts without errors
2. ✅ **Command Publishing:** Charger routes publish to `charging_commands` queue
3. ✅ **Event Publishing:** Customer routes publish to `charging_events` queue
4. ✅ **Notification Publishing:** Notifications published to `notifications` queue
5. ✅ **CMS Event Publishing:** CMS routes publish to `cms_events` queue
6. ✅ **OCPP Messages:** WebSocket publishes to `ocpp_messages` queue
7. ✅ **Message Consumption:** OCPP processor consumes and processes messages
8. ✅ **Notification Broadcasting:** Notification service broadcasts via Socket.io

---

## 🐛 **Troubleshooting**

### **Issue 1: "RabbitMQ not connected"**

**Solution:**
- Check RabbitMQ is running: `docker ps`
- Check `.env` has `ENABLE_RABBITMQ=true`
- Check `RABBITMQ_URL` is correct
- Restart backend server

### **Issue 2: "Failed to publish" messages**

**Solution:**
- Check RabbitMQ connection in Management UI
- Check queue exists (should be auto-created)
- Check server logs for connection errors
- Verify RabbitMQ container is healthy: `docker ps`

### **Issue 3: Messages not appearing in queues**

**Solution:**
- Check if `ENABLE_RABBITMQ=true` in `.env`
- Check server logs for `[RABBITMQ]` tags
- Verify RabbitMQ Management UI shows queues
- Check if messages are being consumed immediately (queue depth = 0 is normal if consumer is fast)

### **Issue 4: "LEGACY" tags in logs**

**Solution:**
- Set `ENABLE_RABBITMQ=true` in `.env`
- Restart backend server
- Should see `[RABBITMQ]` tags instead of `[LEGACY]`

---

## 📊 **Expected Queue Status**

After running tests, check RabbitMQ Management UI:

| Queue | Expected Status |
|-------|----------------|
| `ocpp_messages` | Messages consumed (depth may be 0 if processor is fast) |
| `charging_commands` | Messages present (if commands sent) |
| `charging_events` | Messages present (if charging started/stopped) |
| `notifications` | Messages consumed quickly (transient queue) |
| `cms_events` | Messages present (if CMS operations performed) |
| `analytics` | Empty (not used yet) |
| `ev_charging_dlq` | Empty (only has failed messages) |

---

## 🎯 **Quick Test Script**

Run these commands in order:

```bash
# 1. Start RabbitMQ
docker-compose up -d

# 2. Start backend (with ENABLE_RABBITMQ=true)
node server.js

# 3. In another terminal, test charger route
curl -X POST http://localhost:3000/api/charger/remote-start \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"DEVN0IBHDNZ","connectorId":1,"idTag":"TEST"}'

# 4. Check RabbitMQ Management UI
# Open: http://localhost:15672
# Check: charging_commands queue should have 1 message
```

---

## ✅ **Verification Checklist**

- [ ] RabbitMQ server running
- [ ] Backend server starts without errors
- [ ] All queues created in RabbitMQ
- [ ] OCPP Message Processor started
- [ ] Notification Service started
- [ ] Charger routes publish commands
- [ ] Customer routes publish events
- [ ] CMS routes publish events
- [ ] Messages visible in RabbitMQ Management UI
- [ ] No errors in server logs

---

**Last Updated:** After completing all 17 backend tasks
**Status:** Ready for testing

