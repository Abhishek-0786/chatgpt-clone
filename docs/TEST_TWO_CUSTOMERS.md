# Test: Two Customers Starting Charging Simultaneously

## ✅ What's Implemented

The system now checks if a charger/connector is already in use by another customer **BEFORE** deducting money. This prevents race conditions.

## 🧪 How to Test

### Prerequisites
1. **Two customer accounts** with wallet balance (e.g., Customer ID: 1 and 2)
2. **One charger** connected and online (e.g., `DEVAFGKV1UW`)
3. **Same connector** on that charger (e.g., connector 1)
4. **Two browser windows/tabs** or use Postman/curl

### Test Steps

#### Method 1: Using Browser (User Panel)

**Step 1: Prepare Customer 1**
1. Open browser window 1
2. Go to `http://localhost:3000/user-panel.html`
3. Login as Customer 1 (e.g., ID: 1)
4. Make sure wallet has balance (e.g., ₹100)
5. Navigate to a station with the charger
6. **DO NOT click "Start Charging" yet**

**Step 2: Prepare Customer 2**
1. Open browser window 2 (or incognito)
2. Go to `http://localhost:3000/user-panel.html`
3. Login as Customer 2 (e.g., ID: 2)
4. Make sure wallet has balance (e.g., ₹100)
5. Navigate to the **SAME station and charger**
6. Select the **SAME connector** (e.g., connector 1)
7. **DO NOT click "Start Charging" yet**

**Step 3: Test Simultaneous Start**
1. **Quickly click "Start Charging" in BOTH windows at the same time**
   - Or click Customer 1 first, then immediately click Customer 2 (within 1-2 seconds)

**Expected Results:**
- ✅ **Customer 1**: Should see "Charging started successfully"
  - Money deducted
  - Session created
  - Charging starts
  
- ❌ **Customer 2**: Should see error message:
  ```
  "This charger connector is currently in use by another customer. 
   Please try a different connector or wait for the current session to end."
  ```
  - **NO money deducted**
  - **NO session created**

#### Method 2: Using API Calls (Postman/curl)

**Step 1: Get Customer 1 Token**
```bash
# Login as Customer 1
curl -X POST http://localhost:3000/api/customer/login \
  -H "Content-Type: application/json" \
  -d '{"email": "customer1@example.com", "password": "password"}'

# Save the token from response (e.g., TOKEN_1)
```

**Step 2: Get Customer 2 Token**
```bash
# Login as Customer 2
curl -X POST http://localhost:3000/api/customer/login \
  -H "Content-Type: application/json" \
  -d '{"email": "customer2@example.com", "password": "password"}'

# Save the token from response (e.g., TOKEN_2)
```

**Step 3: Test Simultaneous Start**
```bash
# Terminal 1: Customer 1 starts charging
curl -X POST http://localhost:3000/api/user/charging/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_1" \
  -d '{
    "deviceId": "DEVAFGKV1UW",
    "connectorId": 1,
    "amount": 50,
    "chargingPointId": "CP-XXXXX"
  }'

# Terminal 2: Customer 2 tries to start on SAME charger/connector (run immediately after)
curl -X POST http://localhost:3000/api/user/charging/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_2" \
  -d '{
    "deviceId": "DEVAFGKV1UW",
    "connectorId": 1,
    "amount": 50,
    "chargingPointId": "CP-XXXXX"
  }'
```

**Expected Results:**
- ✅ **Customer 1 Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Charging started successfully",
    "session": {
      "sessionId": "SESS_...",
      "status": "active",
      ...
    }
  }
  ```

- ❌ **Customer 2 Response (400 Bad Request)**:
  ```json
  {
    "success": false,
    "error": "This charger connector is currently in use by another customer. Please try a different connector or wait for the current session to end."
  }
  ```

### Verification Checklist

After testing, verify:

1. ✅ **Customer 1's wallet**: Money deducted (check wallet balance)
2. ✅ **Customer 1's session**: Active session exists in database
3. ✅ **Customer 2's wallet**: **NO money deducted** (balance unchanged)
4. ✅ **Customer 2's session**: **NO session created** in database
5. ✅ **Server logs**: Should show the check happening before money deduction

### Server Logs to Look For

```
✅ Customer 1:
- "Charging started successfully"
- "Published charging.started event"

❌ Customer 2:
- "This charger connector is currently in use by another customer"
- NO "Charging started successfully" message
```

### What to Test Next

1. **Different Connectors**: Customer 1 on connector 1, Customer 2 on connector 2 → Should both succeed
2. **After Session Ends**: Customer 1 stops charging, then Customer 2 tries → Should succeed
3. **Different Chargers**: Customer 1 on charger A, Customer 2 on charger B → Should both succeed

---

## 🐛 Troubleshooting

**If Customer 2's money is still deducted:**
- Check server logs for the exact timing
- The check might be happening but there's a race condition window
- Try with a small delay (1-2 seconds) between requests

**If both succeed:**
- Make sure you're using the **same deviceId AND connectorId**
- Check that Customer 1's session is actually created before Customer 2's request

**If you get database errors:**
- Make sure database is running
- Check that ChargingSession model is properly set up

