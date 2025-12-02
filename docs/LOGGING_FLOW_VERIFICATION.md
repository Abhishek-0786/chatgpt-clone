# Logging Flow Verification Checklist

## ✅ Current Status (from your console logs)

### Backend Service:
- ✅ RabbitMQ initialized
- ✅ Queue `ocpp.logs` declared
- ✅ OCPP Logs Consumer started
- ✅ Consumer tag: `amq.ctag-MVy5TmnSCEnsZVpD4EYt6g`
- ✅ Consuming from queue: `ocpp.logs`

### WebSocket Service:
- ✅ RabbitMQ initialized
- ✅ Queue `ocpp.logs` declared
- ✅ WebSocket server running on port 9000

---

## 🔍 Testing Steps

### Step 1: Connect Charger
When charger connects, you should see in **WebSocket console**:
```
✅ Device connected: DEV0W8VON3X
📝 Charger not found, creating new charger: DEV0W8VON3X
✅ Created new charger via API: DEV0W8VON3X (id: XX)
```

### Step 2: Send BootNotification
When charger sends BootNotification, check **WebSocket console** for:
```
✅ Replied BootNotification for DEV0W8VON3X
📝 storeLog called: BootNotification from DEV0W8VON3X (direction: Incoming)
🔄 Attempting to publish to queue: ocpp.logs
📤 Published log to queue ocpp.logs: BootNotification from DEV0W8VON3X
✅ Successfully published log to RabbitMQ: BootNotification from DEV0W8VON3X
```

### Step 3: Check Backend Consumer
In **Backend console**, you should see:
```
📥 Received log from queue: BootNotification from DEV0W8VON3X
✅ Stored log in database: BootNotification from DEV0W8VON3X (id: XXX)
```

### Step 4: Send StatusNotification
When charger sends StatusNotification, check **WebSocket console**:
```
✅ Replied StatusNotification for DEV0W8VON3X
📝 storeLog called: StatusNotification from DEV0W8VON3X (direction: Incoming)
🔄 Attempting to publish to queue: ocpp.logs
📤 Published log to queue ocpp.logs: StatusNotification from DEV0W8VON3X
✅ Successfully published log to RabbitMQ: StatusNotification from DEV0W8VON3X
```

### Step 5: Verify Database
Run SQL query:
```sql
SELECT 
  id, 
  "deviceId", 
  message, 
  direction, 
  timestamp
FROM "ChargerData" 
WHERE "deviceId" = 'DEV0W8VON3X' 
ORDER BY timestamp DESC 
LIMIT 10;
```

Expected: Should see BootNotification and StatusNotification entries

### Step 6: Check CMS UI
1. Open: http://localhost:3000/cms.html
2. Navigate to: Charging Points → Select charger → Logs tab
3. Verify logs appear

---

## 🚨 Troubleshooting

### If WebSocket shows "⚠️ RabbitMQ not connected":
- Check RabbitMQ is running
- Check `RABBITMQ_URL` in websocket `.env`

### If WebSocket shows "⚠️ Failed to publish to RabbitMQ":
- Check RabbitMQ connection
- Check queue exists: `ocpp.logs`

### If Backend shows no "📥 Received log from queue":
- Check consumer is running: `✅ Started consuming from queue: ocpp.logs`
- Check RabbitMQ Management UI: Queue should have 1 consumer
- Check if messages are in queue (should be 0 if consuming properly)

### If Backend shows "📥 Received log" but no "✅ Stored log":
- Check database connection
- Check for database errors in console
- Check ChargerData table exists

### If logs appear in database but not in CMS:
- Check API endpoint: `GET /api/charger/data?deviceId=DEV0W8VON3X`
- Check browser console for errors
- Check filters are not too restrictive

---

## 📊 Expected Flow Summary

```
Charger sends BootNotification
  ↓
WebSocket receives message
  ↓
handleBootNotification() called
  ↓
storeMessageWithFallback() called
  ↓
storeLog() called
  ↓
publishQueue('ocpp.logs', logData) → RabbitMQ
  ↓
Backend consumer receives from queue
  ↓
processMessage() stores in ChargerData table
  ↓
CMS UI queries database via API
  ↓
Logs displayed in UI
```

---

## ✅ Success Criteria

- [ ] WebSocket publishes logs to `ocpp.logs` queue
- [ ] Backend consumer receives logs from queue
- [ ] Logs stored in `ChargerData` table
- [ ] CMS UI displays logs correctly
- [ ] Heartbeat messages are NOT logged
- [ ] Only meaningful OCPP events are logged

