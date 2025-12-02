# Testing Instructions - Logging Flow

## ✅ IMPORTANT: Will it work on already connected charger?

**YES, but you MUST restart the WebSocket service first!**

### Why?
- If the charger was already connected BEFORE you made code changes, the WebSocket service is still running the OLD code
- The new logging code only takes effect after restarting the service
- Once restarted, ANY charger (already connected or newly connected) will use the new logging code

---

## 🔄 Step-by-Step Testing

### Option 1: Test with Already Connected Charger

1. **Restart WebSocket Service** (CRITICAL!)
   ```bash
   # Stop current service (Ctrl+C)
   cd websocket
   npm run websocket
   ```

2. **Wait for charger to send next message**
   - The charger will automatically send BootNotification, StatusNotification, etc.
   - You don't need to disconnect/reconnect
   - Just wait for the next message

3. **Check WebSocket Console**
   You should see:
   ```
   📥 Received: BootNotification from DEV617IUVZV
   📝 [LOG] Publishing log BEFORE charger validation: BootNotification from DEV617IUVZV
   📝 [storeLog] ========== START ==========
   🔄 [storeLog] RabbitMQ connected: true
   📤 Published log to queue ocpp.logs: BootNotification from DEV617IUVZV
   ✅ [storeLog] Successfully published log to RabbitMQ
   ```

### Option 2: Test with New Charging Point

1. **Add new charging point** via CMS UI
   - Get the `deviceId` (e.g., `DEV617IUVZV`)

2. **Connect charger/simulator** using that deviceId
   - URL: `ws://localhost:9000/ws/ocpp/16/DEV617IUVZV`

3. **Charger will send BootNotification automatically**
   - Check WebSocket console for logs

---

## 🔍 Verification Checklist

### Step 1: Verify WebSocket Service is Running New Code
Check console output when starting:
```
✅ Loaded environment from .env.ocpp
🔌 Connecting to RabbitMQ...
✅ RabbitMQ initialized successfully
✅ Queue declared: ocpp.logs (durable: true)
🚀 WebSocket server started on port 9000
```

### Step 2: Wait for Charger Message
- If charger is already connected, wait for next StatusNotification or BootNotification
- If using simulator, it will send messages automatically

### Step 3: Check WebSocket Console
Look for these logs (in order):
```
📥 Received: {MessageType} from {deviceId}
📝 [LOG] Publishing log BEFORE charger validation: {MessageType} from {deviceId}
📝 [storeLog] ========== START ==========
📝 [storeLog] Called: {MessageType} from {deviceId}
🔄 [storeLog] RabbitMQ connected: true
🔄 [storeLog] publishQueue returned: true
✅ [storeLog] Successfully published log to RabbitMQ
```

### Step 4: Check RabbitMQ Queue
1. Open: `http://localhost:15672` (guest/guest)
2. Go to: Queues → `ocpp.logs`
3. Check: **Ready** count should increase when messages are published

### Step 5: Check Backend Consumer
Backend console should show:
```
📥 Received log from queue: {MessageType} from {deviceId}
✅ Stored log in database: {MessageType} from {deviceId} (id: XXX)
```

### Step 6: Check Database
```sql
SELECT id, "deviceId", message, direction, timestamp
FROM "ChargerData" 
WHERE "deviceId" = 'DEV617IUVZV' 
ORDER BY timestamp DESC 
LIMIT 10;
```

### Step 7: Check CMS UI
1. Open: `http://localhost:3000/cms.html`
2. Navigate to: Charging Points → Select charger → Logs tab
3. Logs should appear

---

## 🚨 Troubleshooting

### Issue: No logs in WebSocket console
**Possible causes:**
1. WebSocket service not restarted → **Restart it!**
2. Charger not sending messages → Wait or trigger manually
3. Wrong deviceId → Check charger connection logs

### Issue: "RabbitMQ connected: false"
**Fix:**
1. Check `ENABLE_RABBITMQ=true` in `.env.ocpp`
2. Check RabbitMQ is running
3. Restart WebSocket service

### Issue: "⏭️ Skipping log for {messageType}"
**This is normal for:**
- Heartbeat messages (excluded by design)
- Unknown message types

### Issue: Messages in queue but not consumed
**Fix:**
1. Check backend consumer is running
2. Check backend console for errors
3. Verify backend has `ENABLE_RABBITMQ=true`

---

## 📝 Quick Test Commands

```bash
# 1. Test RabbitMQ connection
cd websocket
node test-logging.js

# 2. Restart WebSocket service
# Stop current (Ctrl+C)
npm run websocket

# 3. Monitor logs in real-time
# Watch WebSocket console for incoming messages
```

---

## ✅ Summary

- **Works with already connected charger** ✅ (after restart)
- **Works with new charging point** ✅
- **Must restart WebSocket service** ⚠️ (critical!)
- **No need to disconnect/reconnect charger** ✅
- **Just wait for next message** ✅

**The key is: RESTART THE WEBSOCKET SERVICE!**

