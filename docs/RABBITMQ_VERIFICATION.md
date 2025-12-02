# How to Verify RabbitMQ is Being Used

## Quick Check: Look for These Log Tags

### ✅ **RabbitMQ is Active** (What you should see):
```
✅ [RABBITMQ] WebSocket server configured to use RabbitMQ for message processing
📤 [RABBITMQ] Published StatusNotification to RabbitMQ for DEVN0IBHDNZ
📤 [RABBITMQ] Published StartTransaction to RabbitMQ for DEVN0IBHDNZ
```

### ❌ **Old Method is Active** (What you DON'T want to see):
```
ℹ️ [LEGACY] WebSocket server using old enqueueMessage method (ENABLE_RABBITMQ=false)
📦 [LEGACY] StatusNotification (Incoming) enqueued using old method for DEVN0IBHDNZ
```

### ⚠️ **Fallback (RabbitMQ Failed)**:
```
⚠️ [RABBITMQ FAILED] Failed to publish StatusNotification to RabbitMQ: ...
🔄 [FALLBACK] StatusNotification stored using old method (RabbitMQ failed)
```

## Step-by-Step Verification

### 1. Check Server Startup Logs
When you start the server, you should see:
```
✅ [RABBITMQ] WebSocket server configured to use RabbitMQ for message processing
✅ RabbitMQ initialized successfully
✅ OCPP Message Processor started
```

If you see this instead, RabbitMQ is **DISABLED**:
```
ℹ️ [LEGACY] WebSocket server using old enqueueMessage method (ENABLE_RABBITMQ=false)
```

### 2. Check Your .env File
Make sure you have:
```env
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

### 3. When Messages Arrive
**With RabbitMQ (CORRECT):**
```
📤 [RABBITMQ] Published StatusNotification to RabbitMQ for DEVN0IBHDNZ
📤 [RABBITMQ] Published Response to RabbitMQ for DEVN0IBHDNZ
💾 Stored message: StatusNotification (Incoming) from DEVN0IBHDNZ
```

**Without RabbitMQ (OLD METHOD):**
```
📦 [LEGACY] StatusNotification (Incoming) enqueued using old method for DEVN0IBHDNZ
💾 Enqueued StatusNotification (Incoming) for DEVN0IBHDNZ
```

### 4. Verify in RabbitMQ Management UI
1. Open: http://localhost:15672
2. Login: `guest` / `guest`
3. Go to **Queues** → `ocpp_messages`
4. Check:
   - **Consumers**: Should be `1` (not `0`)
   - **Message rates**: Should show publish/consume activity
   - **Ready**: Should be `0` (messages consumed quickly)

### 5. Run Verification Script
```bash
node check-rabbitmq.js
```

Expected output:
```
✅ Connected to RabbitMQ
📊 Queue Status:
   Queue Name: ocpp_messages
   Messages Ready: 0
   Consumers: 1  ← This confirms RabbitMQ consumer is running
```

## Summary

| Log Tag | Meaning | Status |
|---------|---------|--------|
| `[RABBITMQ]` | Using RabbitMQ | ✅ **GOOD** |
| `[LEGACY]` | Using old method | ❌ **BAD** (RabbitMQ disabled) |
| `[RABBITMQ FAILED]` | RabbitMQ error | ⚠️ **WARNING** (check connection) |
| `[FALLBACK]` | RabbitMQ failed, using old method | ⚠️ **WARNING** (check RabbitMQ) |

## Quick Test

1. **Restart your server** and check startup logs
2. **Send a test message** from a charger
3. **Look for `[RABBITMQ]` tags** in the logs
4. If you see `[LEGACY]` tags, check your `.env` file has `ENABLE_RABBITMQ=true`

