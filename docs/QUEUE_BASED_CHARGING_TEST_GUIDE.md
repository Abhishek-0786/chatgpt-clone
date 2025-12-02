# Queue-Based Remote Start/Stop Testing Guide

This guide will help you test the new microservice-based queue flow for remote start and stop charging commands.

## 📋 Prerequisites

### 1. RabbitMQ Running
```bash
# Check if RabbitMQ is running
# Windows: Check Services or run:
rabbitmqctl status

# If not running, start RabbitMQ:
# Windows: Start from Services or:
rabbitmq-server start
```

### 2. Environment Variables

**Backend `.env`:**
```env
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
PORT=3000
```

**WebSocket `.env.ocpp` (or `.env`):**
```env
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
BACKEND_API_URL=http://localhost:3000
WEBSOCKET_PORT=9000
```

### 3. Database Setup
- Ensure database is migrated and synced
- Have at least one charger registered
- Have a customer account with wallet balance

## 🚀 Step 1: Start Services

### Terminal 1: Backend Service
```bash
cd backend
npm start
# OR
node server.js
```

**Expected Output:**
```
✅ RabbitMQ initialized successfully
✅ OCPP Message Processor started
✅ Notification Service started
✅ OCPP Logs Consumer started
✅ Charging Responses Consumer started  ← NEW!
✅ Express server running on http://localhost:3000
```

### Terminal 2: WebSocket Service
```bash
cd websocket
npm start
# OR
node index.js
```

**Expected Output:**
```
✅ Loaded environment from .env.ocpp
✅ RabbitMQ initialized successfully
✅ Charging Commands Consumer started  ← NEW!
✅ OCPP WebSocket Service started successfully
📡 Port: 9000
```

### Terminal 3: Charger Simulator (Optional)
If you have a charger simulator, connect it to `ws://localhost:9000`

## 🧪 Step 2: Test Remote Start Flow

### 2.1. Check Initial State
1. Open browser: `http://localhost:3000/user-panel.html`
2. Login with customer account
3. Check wallet balance (should have sufficient funds)
4. Note: No active sessions should exist

### 2.2. Start Charging Session
1. Navigate to a charging station
2. Select a connector
3. Enter amount (e.g., ₹100)
4. Click "Start Charging"

### 2.3. Monitor Queue Flow

**Backend Terminal - Should Show:**
```
📤 [Queue] Publishing remote start command for session <sessionId>
✅ [Queue] Remote start command published for session <sessionId>
📤 Published charging command: RemoteStartTransaction for <deviceId>
```

**WebSocket Terminal - Should Show:**
```
📥 [Queue] Received charging command: charging.remote.start for session <sessionId>
🚀 [Queue] Executing RemoteStartTransaction for session <sessionId>
📤 [Queue] Sending RemoteStartTransaction to <deviceId>: { idTag: '...', connectorId: ... }
📥 [Queue] Received RemoteStartTransaction response from <deviceId>: { status: 'Accepted' }
📤 [Queue] Publishing remote start response: { sessionId: '...', status: 'Accepted', ... }
✅ [Queue] Published remote start response for session <sessionId>
```

**Backend Terminal - Response Processing:**
```
📥 [Queue] Received charging response: charging.remote.response for session <sessionId>
🚀 [Queue] Processing remote start response for session <sessionId>: Accepted
✅ [Queue] Session <sessionId> activated successfully
```

### 2.4. Verify Results
1. **Frontend:** Session should show as "pending" initially, then "active" after charger responds
2. **Database:** Check `ChargingSession` table:
   ```sql
   SELECT id, sessionId, status, startTime, transactionId 
   FROM "ChargingSessions" 
   WHERE sessionId = '<sessionId>';
   ```
   - `status` should be `'active'`
   - `startTime` should be set
   - `transactionId` should be populated (if charger provided it)

## 🛑 Step 3: Test Remote Stop Flow

### 3.1. Stop Active Session
1. In user panel, find the active session
2. Click "Stop Charging"

### 3.2. Monitor Queue Flow

**Backend Terminal - Should Show:**
```
📤 [Queue] Publishing remote stop command for session <sessionId>
✅ [Queue] Remote stop command published for session <sessionId>
📤 Published charging command: RemoteStopTransaction for <deviceId>
```

**WebSocket Terminal - Should Show:**
```
📥 [Queue] Received charging command: charging.remote.stop for session <sessionId>
🛑 [Queue] Executing RemoteStopTransaction for session <sessionId>
📤 [Queue] Sending RemoteStopTransaction to <deviceId>: { transactionId: ... }
📥 [Queue] Received RemoteStopTransaction response from <deviceId>: { status: 'Accepted' }
📤 [Queue] Publishing remote stop response: { sessionId: '...', status: 'Accepted', ... }
✅ [Queue] Published remote stop response for session <sessionId>
```

**Backend Terminal - Response Processing:**
```
📥 [Queue] Received charging response: charging.remote.stop.response for session <sessionId>
🛑 [Queue] Processing remote stop response for session <sessionId>: Accepted
✅ [Queue] Remote stop accepted for session <sessionId>
```

### 3.3. Verify Results
1. **Frontend:** Session should show as "stopped" or "completed"
2. **Database:** Check `ChargingSession` table:
   - `status` should be `'stopped'` or `'completed'`
   - `endTime` should be set
   - `finalAmount` should be calculated

## 🔍 Step 4: Verify Queue Messages (Optional)

### Using RabbitMQ Management UI
1. Open browser: `http://localhost:15672`
2. Login: `guest` / `guest`
3. Go to **Queues** tab
4. Check:
   - `charging_commands` - Should have messages consumed (0 ready)
   - `charging_events` - Should have messages consumed (0 ready)

### Using RabbitMQ CLI
```bash
# Check queue message counts
rabbitmqctl list_queues name messages messages_ready messages_unacked

# Monitor queue (real-time)
rabbitmqctl list_queues name messages messages_ready messages_unacked | grep charging
```

## 🧪 Step 5: Test Edge Cases

### 5.1. Test with Backend Offline
1. Stop backend service
2. Start charging session (should fail gracefully)
3. **Expected:** Frontend shows error, wallet not deducted

### 5.2. Test with WebSocket Offline
1. Stop WebSocket service
2. Start charging session
3. **Expected:** 
   - Command published to queue
   - Frontend returns success (pending status)
   - When WebSocket restarts, command should be processed

### 5.3. Test Charger Rejection
1. Use simulator to reject RemoteStartTransaction
2. **Expected:**
   - Wallet refunded automatically
   - Session marked as "failed"
   - Frontend shows rejection message

### 5.4. Test Simultaneous Requests
1. Send two start requests for same connector simultaneously
2. **Expected:**
   - Only one should succeed
   - Other should be rejected by charger
   - Wallet refunded for rejected one

## 📊 Step 6: Check Logs

### Backend Logs
Look for these patterns:
- `📤 [Queue] Publishing remote start/stop command`
- `📥 [Queue] Received charging response`
- `✅ [Queue] Session activated/finalized`

### WebSocket Logs
Look for these patterns:
- `📥 [Queue] Received charging command`
- `📤 [Queue] Sending RemoteStartTransaction/RemoteStopTransaction`
- `📥 [Queue] Received ... response`
- `📤 [Queue] Publishing remote ... response`

## 🐛 Troubleshooting

### Issue: "Charging Commands Consumer not started"
**Solution:**
- Check RabbitMQ connection: `ENABLE_RABBITMQ=true`
- Verify RabbitMQ is running: `rabbitmqctl status`
- Check WebSocket service logs for connection errors

### Issue: "Command published but not consumed"
**Solution:**
- Verify queue bindings in RabbitMQ Management UI
- Check routing keys match: `charging.remote.start` / `charging.remote.stop`
- Verify consumer is running (check WebSocket logs)

### Issue: "Response not received by backend"
**Solution:**
- Check `Charging Responses Consumer` is started (backend logs)
- Verify routing keys: `charging.remote.response` / `charging.remote.stop.response`
- Check queue bindings in RabbitMQ

### Issue: "Session not updating"
**Solution:**
- Check database connection
- Verify sessionId matches in queue messages
- Check backend consumer logs for errors

### Issue: "Fallback to direct call"
**Solution:**
- This is expected if `ENABLE_RABBITMQ=false` or RabbitMQ unavailable
- Check environment variables
- Verify RabbitMQ connection

## ✅ Success Criteria

1. ✅ Commands published to queue (not direct API calls)
2. ✅ WebSocket consumer receives and processes commands
3. ✅ Charger receives OCPP messages
4. ✅ Responses published to response queues
5. ✅ Backend consumer updates sessions
6. ✅ Wallet transactions processed correctly
7. ✅ Frontend shows correct session status

## 📝 Notes

- **Queue Flow vs Fallback:** If RabbitMQ is disabled, the system falls back to direct API calls (legacy mode)
- **Asynchronous Processing:** Session status updates happen asynchronously via queue
- **Retry Logic:** Failed messages are retried automatically (up to 3 times)
- **Logging:** All queue operations are logged with `[Queue]` prefix for easy filtering

## 🎯 Quick Test Checklist

- [ ] RabbitMQ running
- [ ] Backend service started with consumer
- [ ] WebSocket service started with consumer
- [ ] Charger connected (or simulator)
- [ ] Customer logged in with wallet balance
- [ ] Start charging → Check queue logs
- [ ] Verify session activated
- [ ] Stop charging → Check queue logs
- [ ] Verify session finalized
- [ ] Check database for correct status

---

**Need Help?** Check the logs for `[Queue]` prefix to trace the entire flow!

