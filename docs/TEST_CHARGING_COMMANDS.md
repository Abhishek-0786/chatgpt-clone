# Testing Start/Stop Charging Commands

## API Endpoints

### 1. Start Charging
**Endpoint:** `POST /api/charger/remote-start`

**Request Body:**
```json
{
  "deviceId": "DEVN0IBHDNZ",
  "connectorId": 1,
  "idTag": "ADMIN"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Remote start transaction sent successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Error message here"
}
```

### 2. Stop Charging
**Endpoint:** `POST /api/charger/remote-stop`

**Request Body:**
```json
{
  "deviceId": "DEVN0IBHDNZ",
  "transactionId": 3494285
}
```

**Note:** You need to get the `transactionId` from the StartTransaction response or from active sessions.

**Response (Success):**
```json
{
  "success": true,
  "message": "Remote stop transaction sent successfully"
}
```

## How to Test

### Option 1: Using cURL (Command Line)

**Start Charging:**
```bash
curl -X POST http://localhost:3000/api/charger/remote-start \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVN0IBHDNZ",
    "connectorId": 1,
    "idTag": "ADMIN"
  }'
```

**Stop Charging:**
```bash
curl -X POST http://localhost:3000/api/charger/remote-stop \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "DEVN0IBHDNZ",
    "transactionId": 3494285
  }'
```

### Option 2: Using Postman or Similar Tool

1. **Start Charging:**
   - Method: `POST`
   - URL: `http://localhost:3000/api/charger/remote-start`
   - Headers: `Content-Type: application/json`
   - Body (JSON):
     ```json
     {
       "deviceId": "DEVN0IBHDNZ",
       "connectorId": 1,
       "idTag": "ADMIN"
     }
     ```

2. **Stop Charging:**
   - Method: `POST`
   - URL: `http://localhost:3000/api/charger/remote-stop`
   - Headers: `Content-Type: application/json`
   - Body (JSON):
     ```json
     {
       "deviceId": "DEVN0IBHDNZ",
       "transactionId": 3494285
     }
     ```

### Option 3: Using Browser Console (JavaScript)

**Start Charging:**
```javascript
fetch('http://localhost:3000/api/charger/remote-start', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    deviceId: 'DEVN0IBHDNZ',
    connectorId: 1,
    idTag: 'ADMIN'
  })
})
.then(res => res.json())
.then(data => console.log('Start Result:', data))
.catch(err => console.error('Error:', err));
```

**Stop Charging:**
```javascript
fetch('http://localhost:3000/api/charger/remote-stop', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    deviceId: 'DEVN0IBHDNZ',
    transactionId: 3494285
  })
})
.then(res => res.json())
.then(data => console.log('Stop Result:', data))
.catch(err => console.error('Error:', err));
```

## What to Watch in Server Logs

### When Starting Charging:
```
📥 Enqueued message for DEVN0IBHDNZ: RemoteStartTransaction (sequence: X)
💾 Stored message: RemoteStartTransaction (Outgoing) from DEVN0IBHDNZ
📩 Message received from DEVN0IBHDNZ: [3, "messageId", {"status": "Accepted"}]
💾 Stored message: Response (Incoming) from DEVN0IBHDNZ
```

### When Stopping Charging:
```
📥 Enqueued message for DEVN0IBHDNZ: RemoteStopTransaction (sequence: X)
💾 Stored message: RemoteStopTransaction (Outgoing) from DEVN0IBHDNZ
📩 Message received from DEVN0IBHDNZ: [3, "messageId", {"status": "Accepted"}]
💾 Stored message: Response (Incoming) from DEVN0IBHDNZ
```

## Getting Transaction ID

To stop charging, you need the `transactionId`. You can get it from:

1. **StartTransaction response** - When charger sends StartTransaction, it includes a transactionId
2. **Active sessions API** - Check active charging sessions
3. **Charger logs** - Look in the database for recent StartTransaction messages

## Common Errors

1. **"Charger is not connected"**
   - Make sure your charger simulator/client is connected via WebSocket
   - Check WebSocket connection on port 9000

2. **"Charger is already charging"**
   - Stop the current charging session first
   - Or wait for it to complete

3. **"transactionId is required"**
   - You need to provide the transactionId from the StartTransaction

## Testing Flow

1. **Connect Charger** (via WebSocket to port 9000)
2. **Start Charging:**
   ```bash
   POST /api/charger/remote-start
   {
     "deviceId": "DEVN0IBHDNZ",
     "connectorId": 1,
     "idTag": "ADMIN"
   }
   ```
3. **Wait for StartTransaction** from charger (check logs)
4. **Get transactionId** from the StartTransaction message
5. **Stop Charging:**
   ```bash
   POST /api/charger/remote-stop
   {
     "deviceId": "DEVN0IBHDNZ",
     "transactionId": <transactionId from step 4>
   }
   ```

## Notes

- Commands are sent directly via WebSocket (not through RabbitMQ yet)
- Responses from charger are processed through RabbitMQ
- Commands have a 60-second timeout
- Duplicate requests are prevented (2-minute cooldown)

