# 🧪 Complete Testing Guide - RabbitMQ Integration

## ✅ **What's Already Tested**

1. ✅ **Charger Routes** - Remote Start/Stop (Tested)
2. ✅ **Auto-Stop on Disconnect** (Tested)
3. ✅ **RabbitMQ Queue Bindings** (Working)
4. ✅ **OCPP Message Processing** (Working)

---

## 🎯 **What to Test Next**

### **Test 1: Customer Routes - Charging Start/Stop** ⭐ HIGH PRIORITY

**Purpose:** Test charging events published to RabbitMQ when users start/stop charging from the user panel.

#### **Test 1.1: Start Charging (User Panel)**

**Steps:**
1. Login to User Panel: http://localhost:3000/user-panel.html
2. Select a station and charging point
3. Enter amount and start charging
4. Check server logs for:
   ```
   📤 [RABBITMQ] Published charging.started event for session XXX
   ```
5. Check RabbitMQ:
   - Queue: `charging_events`
   - Routing key: `charging.started`
   - Message should contain: `sessionId`, `customerId`, `deviceId`, `connectorId`

**Expected Result:**
- ✅ API returns success
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `charging_events` queue
- ✅ Notification sent to frontend (if Socket.io connected)

---

#### **Test 1.2: Stop Charging (User Panel)**

**Steps:**
1. While charging is active, click "Stop Charging" in user panel
2. Check server logs for:
   ```
   📤 [RABBITMQ] Published charging.stopped event for session XXX
   ```
3. Check RabbitMQ:
   - Queue: `charging_events`
   - Routing key: `charging.stopped`
   - Message should contain: `energyConsumed`, `finalAmount`, `refundAmount`

**Expected Result:**
- ✅ API returns success
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `charging_events` queue
- ✅ Notification sent to frontend

---

### **Test 2: CMS Routes - Station Management** ⭐ MEDIUM PRIORITY

**Purpose:** Test CMS events published to RabbitMQ when admin creates/updates stations.

#### **Test 2.1: Create Station**

**Steps:**
1. Login to CMS: http://localhost:3000/cms.html
2. Go to "Charging Stations" → "Add Station"
3. Fill in station details and create
4. Check server logs for:
   ```
   📤 [RABBITMQ] Published cms.station.created event for STATION-XXX
   ```
5. Check RabbitMQ:
   - Queue: `cms_events`
   - Routing key: `cms.station.created`
   - Message should contain: `stationId`, `stationName`, `organization`

**Expected Result:**
- ✅ Station created successfully
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `cms_events` queue

---

#### **Test 2.2: Update Station**

**Steps:**
1. In CMS, edit an existing station
2. Update any field (e.g., station name)
3. Save changes
4. Check server logs for:
   ```
   📤 [RABBITMQ] Published cms.station.updated event for STATION-XXX
   ```
5. Check RabbitMQ:
   - Queue: `cms_events`
   - Routing key: `cms.station.updated`

**Expected Result:**
- ✅ Station updated successfully
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `cms_events` queue

---

### **Test 3: CMS Routes - Charging Point Management** ⭐ MEDIUM PRIORITY

#### **Test 3.1: Create Charging Point**

**Steps:**
1. In CMS, go to "Charging Points" → "Add Point"
2. Fill in point details (deviceId, station, tariff)
3. Create point
4. Check server logs for:
   ```
   📤 [RABBITMQ] Published cms.point.created event for CP-XXX
   ```
5. Check RabbitMQ:
   - Queue: `cms_events`
   - Routing key: `cms.point.created`

**Expected Result:**
- ✅ Point created successfully
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `cms_events` queue

---

#### **Test 3.2: Update Charging Point**

**Steps:**
1. In CMS, edit an existing charging point
2. Update any field
3. Save changes
4. Check server logs for:
   ```
   📤 [RABBITMQ] Published cms.point.updated event for CP-XXX
   ```
5. Check RabbitMQ:
   - Queue: `cms_events`
   - Routing key: `cms.point.updated`

**Expected Result:**
- ✅ Point updated successfully
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `cms_events` queue

---

### **Test 4: CMS Routes - Tariff Management** ⭐ MEDIUM PRIORITY

#### **Test 4.1: Create Tariff**

**Steps:**
1. In CMS, go to "Tariff Management" → "Add Tariff"
2. Fill in tariff details (name, base charges, tax)
3. Create tariff
4. Check server logs for:
   ```
   📤 [RABBITMQ] Published cms.tariff.created event for TAR-XXX
   ```
5. Check RabbitMQ:
   - Queue: `cms_events`
   - Routing key: `cms.tariff.created`

**Expected Result:**
- ✅ Tariff created successfully
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `cms_events` queue

---

#### **Test 4.2: Update Tariff**

**Steps:**
1. In CMS, edit an existing tariff
2. Update any field (e.g., base charges)
3. Save changes
4. Check server logs for:
   ```
   📤 [RABBITMQ] Published cms.tariff.updated event for TAR-XXX
   ```
5. Check RabbitMQ:
   - Queue: `cms_events`
   - Routing key: `cms.tariff.updated`

**Expected Result:**
- ✅ Tariff updated successfully
- ✅ Server logs show RabbitMQ publishing
- ✅ Message appears in `cms_events` queue

---

### **Test 5: Frontend Socket.io Integration** ⭐ HIGH PRIORITY (Future)

**Purpose:** Test real-time frontend updates via Socket.io notifications.

**Note:** This requires frontend implementation. Currently, notifications are published to RabbitMQ but frontend needs to subscribe to Socket.io.

**What to Test (When Frontend is Ready):**
1. Open User Panel
2. Start charging session
3. Frontend should receive real-time notification via Socket.io
4. UI should update without page refresh

**Expected Result:**
- ✅ Frontend receives `charging.started` notification
- ✅ UI updates in real-time
- ✅ No polling needed

---

## 📋 **Quick Test Checklist**

### **Backend Tests (All Should Work Now):**

- [ ] **Test 1.1:** User Panel - Start Charging
- [ ] **Test 1.2:** User Panel - Stop Charging
- [ ] **Test 2.1:** CMS - Create Station
- [ ] **Test 2.2:** CMS - Update Station
- [ ] **Test 3.1:** CMS - Create Charging Point
- [ ] **Test 3.2:** CMS - Update Charging Point
- [ ] **Test 4.1:** CMS - Create Tariff
- [ ] **Test 4.2:** CMS - Update Tariff

### **Verification Points:**

For each test, verify:
1. ✅ API returns success
2. ✅ Server logs show `📤 [RABBITMQ] Published...`
3. ✅ Message appears in correct RabbitMQ queue
4. ✅ Routing key is correct
5. ✅ Message payload contains expected data

---

## 🔍 **How to Check RabbitMQ Messages**

1. Open: http://localhost:15672
2. Login: guest / guest
3. Go to: **Queues** tab
4. Click on queue name (e.g., `charging_events`)
5. Click: **"Get messages"** button
6. Enter: `1` (to get 1 message)
7. Click: **"Get Message(s)"**
8. Review message content

---

## 🐛 **Troubleshooting**

### **Issue: No messages in queue**

**Check:**
1. Is `ENABLE_RABBITMQ=true` in `.env`?
2. Are server logs showing `[RABBITMQ]` messages?
3. Is RabbitMQ server running?
4. Are queues bound to exchange correctly?

### **Issue: Messages in queue but not consumed**

**Check:**
1. For `ocpp_messages` and `notifications` - consumers should be running
2. Check server logs for consumer startup messages
3. For audit queues (`charging_commands`, `cms_events`) - no consumers needed (they're for auditing)

### **Issue: Frontend not receiving notifications**

**Check:**
1. Is Socket.io connected? (Check browser console)
2. Is Notification Service running? (Check server logs)
3. Are notifications being published? (Check RabbitMQ `notifications` queue)

---

## 📊 **Test Results Template**

```
Test Date: ___________
Tester: ___________

### Test 1: Customer Routes
- [ ] Start Charging: ✅ / ❌
- [ ] Stop Charging: ✅ / ❌

### Test 2: CMS Routes - Stations
- [ ] Create Station: ✅ / ❌
- [ ] Update Station: ✅ / ❌

### Test 3: CMS Routes - Points
- [ ] Create Point: ✅ / ❌
- [ ] Update Point: ✅ / ❌

### Test 4: CMS Routes - Tariffs
- [ ] Create Tariff: ✅ / ❌
- [ ] Update Tariff: ✅ / ❌

### RabbitMQ Verification
- [ ] All messages appear in correct queues: ✅ / ❌
- [ ] Routing keys are correct: ✅ / ❌
- [ ] Message payloads are valid: ✅ / ❌
```

---

## 🎯 **Next Steps After Testing**

1. **If all tests pass:** ✅ Backend integration is complete!
2. **If tests fail:** Check server logs and RabbitMQ Management UI
3. **Frontend integration:** Start implementing Socket.io subscriptions in frontend modules

---

## 💡 **Tips**

- **Use Postman/Thunder Client** for API testing if UI is not available
- **Check server logs** in real-time while testing
- **Keep RabbitMQ Management UI open** to monitor queues
- **Test one feature at a time** to isolate issues

---

**Happy Testing! 🚀**

