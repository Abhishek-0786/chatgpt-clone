# Logging Flow Fixes - Complete Summary

## ✅ FIXES APPLIED

### 1. **Removed Blocking Logic in `handleIncomingMessage`**
   - **Problem**: Early return when charger not ready was blocking ALL logging
   - **Fix**: Moved message parsing and logging BEFORE charger validation
   - **Result**: Messages are now logged even if charger is not ready or backend is offline

### 2. **Enhanced Debug Logging**
   - Added detailed console logs at every step:
     - `📝 [LOG] Publishing log BEFORE charger validation`
     - `📝 [storeLog] Called: {messageType} from {deviceId}`
     - `🔄 [storeLog] Attempting to publish to queue: ocpp.logs`
     - `✅ [storeLog] Successfully published log to RabbitMQ`

### 3. **Fixed Outgoing Response Logging**
   - Updated `handleBootNotification` and `handleStatusNotification` to log outgoing responses
   - Responses are now logged via `storeLog()` directly, independent of charger state

### 4. **Verified Configuration**
   - ✅ `ALLOWED_LOG_TYPES` includes: `BootNotification`, `StatusNotification`, `Response`, etc.
   - ✅ Queue name is correct: `ocpp.logs`
   - ✅ RabbitMQ producer function `publishQueue()` is correctly implemented

---

## 🔍 VERIFICATION CHECKLIST

### Step 1: Check Environment Variables
Verify `.env.ocpp` or `.env` file contains:
```bash
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### Step 2: Restart WebSocket Service
```bash
cd websocket
npm run websocket
# OR
node index.js
```

**Expected output:**
```
✅ Loaded environment from .env.ocpp
🔌 Connecting to RabbitMQ...
✅ RabbitMQ initialized successfully
✅ Queue declared: ocpp.logs (durable: true)
🚀 Starting OCPP WebSocket Service...
✅ OCPP WebSocket Service started successfully
🐰 RabbitMQ: Enabled
```

### Step 3: Connect Charger/Simulator
Connect to: `ws://localhost:9000/ws/ocpp/16/DEV617IUVZV`

### Step 4: Send BootNotification
**Expected WebSocket Console Output:**
```
📥 Received: BootNotification from DEV617IUVZV
📝 [LOG] Publishing log BEFORE charger validation: BootNotification from DEV617IUVZV
📝 [storeLog] Called: BootNotification from DEV617IUVZV (direction: Incoming)
🔄 [storeLog] Attempting to publish to queue: ocpp.logs
🔄 [storeLog] Log data: {"deviceId":"DEV617IUVZV","messageType":"BootNotification",...}
📤 Published log to queue ocpp.logs: BootNotification from DEV617IUVZV
✅ [storeLog] Successfully published log to RabbitMQ: BootNotification from DEV617IUVZV
✅ Replied BootNotification for DEV617IUVZV
```

### Step 5: Check RabbitMQ Queue
1. Open RabbitMQ Management UI: `http://localhost:15672`
2. Navigate to: Queues → `ocpp.logs`
3. **Expected**: Messages should appear in the queue (Ready count > 0, then consumed)

### Step 6: Check Backend Consumer
**Expected Backend Console Output:**
```
📥 Received log from queue: BootNotification from DEV617IUVZV
✅ Stored log in database: BootNotification from DEV617IUVZV (id: XXX)
```

### Step 7: Verify Database
Run SQL query:
```sql
SELECT id, "deviceId", message, direction, timestamp
FROM "ChargerData" 
WHERE "deviceId" = 'DEV617IUVZV' 
ORDER BY timestamp DESC 
LIMIT 10;
```

**Expected**: Should see BootNotification and StatusNotification entries

### Step 8: Check CMS UI
1. Open: `http://localhost:3000/cms.html`
2. Navigate to: Charging Points → Select charger → Logs tab
3. **Expected**: Logs should appear in the UI

---

## 🚨 TROUBLESHOOTING

### Issue: "⚠️ RabbitMQ not connected"
**Solution:**
1. Check RabbitMQ is running: `docker ps` (if using Docker)
2. Check `ENABLE_RABBITMQ=true` in `.env.ocpp`
3. Check `RABBITMQ_URL` is correct
4. Restart WebSocket service

### Issue: "⏭️ Skipping log for {messageType}"
**Solution:**
- This is expected for Heartbeat messages
- If other messages are skipped, check `ALLOWED_LOG_TYPES` array

### Issue: Messages in queue but not consumed
**Solution:**
1. Check backend consumer is running
2. Check backend console for errors
3. Verify backend has `ENABLE_RABBITMQ=true`

### Issue: No logs in CMS UI
**Solution:**
1. Check database has entries (Step 7)
2. Check browser console for API errors
3. Verify API endpoint: `GET /api/charger/data?deviceId=DEV617IUVZV`

---

## 📊 COMPLETE FLOW (After Fixes)

```
Charger sends BootNotification
  ↓
WebSocket receives message
  ↓
Parse message FIRST (before any checks)
  ↓
📝 storeLog() called IMMEDIATELY (even if charger not ready)
  ↓
publishQueue('ocpp.logs', logData) → RabbitMQ
  ↓
✅ Message published to queue (independent of backend state)
  ↓
Backend Consumer receives from queue
  ↓
Stores in ChargerData table
  ↓
CMS UI displays logs
```

---

## ✅ KEY CHANGES SUMMARY

1. **Logging happens BEFORE charger validation** - No more blocking
2. **Enhanced debug logging** - Easy to trace issues
3. **Outgoing responses are logged** - Complete message flow
4. **Independent of backend state** - Logs even if backend is offline
5. **RabbitMQ is primary, REST API is fallback** - Microservice architecture

---

## 🎯 NEXT STEPS

1. Restart WebSocket service
2. Connect charger/simulator
3. Send BootNotification and StatusNotification
4. Verify logs appear in:
   - WebSocket console (publishing logs)
   - RabbitMQ queue (messages in queue)
   - Backend console (consumer logs)
   - Database (stored records)
   - CMS UI (displayed logs)

If any step fails, check the console logs for the detailed debug messages added in this fix.

