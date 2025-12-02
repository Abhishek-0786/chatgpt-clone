# Debug Logging Issue - Step by Step Guide

## 🔍 IMMEDIATE CHECKS

### Step 1: Check Environment Variables
Create `.env.ocpp` file in the `websocket` directory (or root) with:
```bash
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### Step 2: Verify RabbitMQ is Running
```bash
# Check if RabbitMQ is running
docker ps | grep rabbitmq
# OR
# Check if port 5672 is listening
netstat -an | findstr 5672
```

### Step 3: Run Diagnostic Test
```bash
cd websocket
node test-logging.js
```

**Expected Output:**
```
✅ RabbitMQ initialized successfully
✅ Queue declared: ocpp.logs
RabbitMQ Connected: true
✅ Successfully published test message to queue!
```

### Step 4: Check WebSocket Service Console
When you start the WebSocket service, you should see:
```
✅ Loaded environment from .env.ocpp
🔌 Connecting to RabbitMQ...
✅ Exchange declared: ev_charging_events
✅ Queue declared: ocpp.logs (durable: true)
✅ RabbitMQ initialized successfully
🐰 RabbitMQ: Enabled
```

**If you see:**
- `⚠️ RabbitMQ: Disabled` → Check `ENABLE_RABBITMQ=true` in `.env.ocpp`
- `❌ Failed to initialize RabbitMQ` → Check RabbitMQ is running and URL is correct

### Step 5: Send Test Message from Charger
When charger sends BootNotification, check WebSocket console for:

**Expected logs:**
```
📥 Received: BootNotification from DEV617IUVZV
📝 [LOG] Publishing log BEFORE charger validation: BootNotification from DEV617IUVZV
📝 [storeLog] ========== START ==========
📝 [storeLog] Called: BootNotification from DEV617IUVZV (direction: Incoming)
🔄 [storeLog] Attempting to publish to queue: ocpp.logs
🔄 [storeLog] Queue constant value: ocpp.logs
🔄 [storeLog] RabbitMQ connected: true
🔄 [storeLog] publishQueue returned: true
✅ [storeLog] Successfully published log to RabbitMQ: BootNotification from DEV617IUVZV
📝 [storeLog] ========== SUCCESS ==========
```

**If you see:**
- `⏭️ Skipping log for {messageType}` → Message type is not in ALLOWED_LOG_TYPES
- `🔄 [storeLog] RabbitMQ connected: false` → RabbitMQ not initialized
- `⚠️ RabbitMQ not connected, skipping queue publish` → Connection issue
- `❌ [storeLog] CRITICAL ERROR` → Check error message and stack trace

### Step 6: Check RabbitMQ Management UI
1. Open: `http://localhost:15672` (guest/guest)
2. Go to: Queues → `ocpp.logs`
3. Check:
   - **Ready**: Should show messages waiting to be consumed
   - **Consumers**: Should show 1 (backend consumer)
   - **Message rates**: Should show incoming messages

### Step 7: Check Backend Consumer
Backend console should show:
```
📥 Received log from queue: BootNotification from DEV617IUVZV
✅ Stored log in database: BootNotification from DEV617IUVZV (id: XXX)
```

**If you don't see this:**
- Check backend consumer is running
- Check backend has `ENABLE_RABBITMQ=true`
- Check backend console for errors

---

## 🚨 COMMON ISSUES & FIXES

### Issue 1: "RabbitMQ: Disabled"
**Fix:**
1. Create `.env.ocpp` file in `websocket` directory
2. Add: `ENABLE_RABBITMQ=true`
3. Restart WebSocket service

### Issue 2: "RabbitMQ not connected"
**Fix:**
1. Check RabbitMQ is running: `docker ps` or check service
2. Check `RABBITMQ_URL` is correct
3. Check firewall/network settings
4. Restart WebSocket service

### Issue 3: "⏭️ Skipping log for {messageType}"
**Fix:**
- This is expected for Heartbeat
- For other messages, check `ALLOWED_LOG_TYPES` array includes the message type

### Issue 4: Messages in queue but not consumed
**Fix:**
1. Check backend consumer is running
2. Check backend console for errors
3. Verify backend has `ENABLE_RABBITMQ=true` in `.env`

### Issue 5: No logs in WebSocket console
**Fix:**
1. Check charger is actually sending messages
2. Check WebSocket connection is established
3. Check for parse errors in console

---

## 📊 VERIFICATION CHECKLIST

- [ ] `.env.ocpp` exists with `ENABLE_RABBITMQ=true`
- [ ] RabbitMQ is running
- [ ] WebSocket service shows "RabbitMQ: Enabled"
- [ ] WebSocket service shows "✅ RabbitMQ initialized successfully"
- [ ] Test script (`test-logging.js`) passes
- [ ] Charger connects successfully
- [ ] WebSocket console shows `📝 [LOG] Publishing log BEFORE charger validation`
- [ ] WebSocket console shows `✅ [storeLog] Successfully published log to RabbitMQ`
- [ ] RabbitMQ Management UI shows messages in `ocpp.logs` queue
- [ ] Backend console shows `📥 Received log from queue`
- [ ] Database has log entries
- [ ] CMS UI displays logs

---

## 🔧 QUICK FIX COMMANDS

```bash
# 1. Create .env.ocpp if missing
cd websocket
echo ENABLE_RABBITMQ=true > .env.ocpp
echo RABBITMQ_URL=amqp://guest:guest@localhost:5672 >> .env.ocpp

# 2. Test RabbitMQ connection
node test-logging.js

# 3. Restart WebSocket service
# Stop current service (Ctrl+C)
npm run websocket

# 4. Check RabbitMQ queue
# Open http://localhost:15672 → Queues → ocpp.logs
```

---

## 📝 NEXT STEPS

1. **Run the diagnostic test**: `node websocket/test-logging.js`
2. **Check WebSocket console** when charger sends messages
3. **Share the console output** so we can identify the exact issue

The enhanced logging will show exactly where the flow is breaking!

