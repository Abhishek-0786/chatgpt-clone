# RabbitMQ Complete Integration List - Backend + Frontend

This document lists **ALL** RabbitMQ integration points (backend + frontend) with their status and **WHY** RabbitMQ is necessary at each location.

---

## 📊 **Summary**

- **Total Integration Points:** 56
- **Backend (Publishing to RabbitMQ):** 17 points
- **Frontend (Subscribing to Socket.io from RabbitMQ):** 39 points
- **Completed:** 10/17 backend (59%)
- **Pending:** 7/17 backend (41%)
- **Frontend:** All pending (needs Socket.io subscription implementation)

---

## 🔵 **BACKEND INTEGRATION POINTS** (Publishing to RabbitMQ)

### **Category 1: Core Infrastructure** ✅ DONE

| # | File | Status | Why RabbitMQ is Necessary |
|---|------|--------|---------------------------|
| 1 | `services/rabbitmq/connection.js` | ✅ DONE | **Foundation** - Manages connection, reconnection, queue setup. Without this, nothing works. |
| 2 | `services/rabbitmq/queues.js` | ✅ DONE | **Configuration** - Defines queues, exchanges, routing keys. Centralized configuration prevents errors. |
| 3 | `services/rabbitmq/producer.js` | ✅ DONE | **Publishing Functions** - Provides standardized functions to publish messages. Ensures consistent message format. |
| 4 | `services/rabbitmq/consumer.js` | ✅ DONE | **Base Consumer** - Handles retry logic, acknowledgments, error handling. Prevents message loss. |

---

### **Category 2: Message Processing Services** ✅ DONE

| # | File | Status | Why RabbitMQ is Necessary |
|---|------|--------|---------------------------|
| 5 | `services/ocpp-message-processor.js` | ✅ DONE | **Async Processing** - Processes OCPP messages asynchronously. Prevents WebSocket blocking, enables scaling. |
| 6 | `services/notification-service.js` | ✅ DONE | **Real-time Broadcasting** - Consumes notifications and broadcasts via Socket.io. Enables real-time frontend updates. |

---

### **Category 3: Server Initialization** ✅ DONE

| # | File | Status | Why RabbitMQ is Necessary |
|---|------|--------|---------------------------|
| 7 | `server.js` - RabbitMQ Init | ✅ DONE | **Startup** - Initializes RabbitMQ connection on server start. Required for all RabbitMQ operations. |
| 8 | `server.js` - OCPP Processor Start | ✅ DONE | **Message Processing** - Starts OCPP message processor. Required to process queued messages. |
| 9 | `server.js` - Notification Service Start | ✅ DONE | **Real-time Updates** - Starts notification service. Required for Socket.io broadcasting. |
| 10 | `server.js` - Socket.io Setup | ✅ DONE | **Frontend Communication** - Sets up Socket.io server. Required for real-time frontend updates. |

---

### **Category 4: WebSocket Server - OCPP Message Publishing** ✅ DONE

| # | File | Message Type | Status | Why RabbitMQ is Necessary |
|---|------|--------------|--------|---------------------------|
| 11 | `websocket-server.js` | BootNotification | ✅ DONE | **Async Processing** - Charger metadata updates can be slow. RabbitMQ prevents WebSocket blocking. |
| 12 | `websocket-server.js` | StartTransaction | ✅ DONE | **Session Creation** - Session creation involves database writes. RabbitMQ ensures messages aren't lost if DB is slow. |
| 13 | `websocket-server.js` | StopTransaction | ✅ DONE | **Billing Calculation** - Billing calculations can be complex. RabbitMQ allows async processing without blocking. |
| 14 | `websocket-server.js` | StatusNotification | ✅ DONE | **Real-time Updates** - Status changes need to be broadcast to frontend. RabbitMQ enables decoupled notifications. |
| 15 | `websocket-server.js` | MeterValues | ✅ DONE | **High Frequency** - Meter values arrive frequently. RabbitMQ buffers and processes them efficiently. |
| 16 | `websocket-server.js` | CALL_RESULT | ✅ DONE | **Message Storage** - Response messages need to be stored. RabbitMQ ensures they're not lost. |
| 17 | `websocket-server.js` | CALL_ERROR | ✅ DONE | **Error Tracking** - Error messages need logging. RabbitMQ ensures error tracking doesn't block WebSocket. |

---

### **Category 5: Charger Routes - Command Publishing** ❌ PENDING

| # | File | Endpoint | Status | Why RabbitMQ is Necessary |
|---|------|----------|--------|---------------------------|
| 18 | `routes/charger.js` | `POST /api/charger/remote-start` | ❌ PENDING | **Command Auditing** - Log all commands sent to chargers for audit trail. **Optional but recommended.** |
| 19 | `routes/charger.js` | `POST /api/charger/remote-stop` | ❌ PENDING | **Command Auditing** - Track all stop commands for debugging and audit. **Optional but recommended.** |
| 20 | `routes/charger.js` | `POST /api/charger/change-configuration` | ❌ PENDING | **Command Auditing** - Log configuration changes. **Optional - only if endpoint exists.** |
| 21 | `routes/charger.js` | `POST /api/charger/reset` | ❌ PENDING | **Command Auditing** - Track reset commands. **Optional - only if endpoint exists.** |

**Note:** These are **optional** - they add command auditing but system works without them.

---

### **Category 6: Customer Routes - Charging Event Publishing** ❌ PENDING

| # | File | Endpoint | Status | Why RabbitMQ is Necessary |
|---|------|----------|--------|---------------------------|
| 22 | `routes/customer.js` | `POST /api/user/charging/start` | ❌ PENDING | **Real-time Updates** - Frontend needs immediate notification when charging starts. **HIGH PRIORITY** |
| 23 | `routes/customer.js` | `POST /api/user/charging/stop` | ❌ PENDING | **Real-time Updates** - Frontend needs immediate notification when charging stops. **HIGH PRIORITY** |

**Note:** These are **HIGH PRIORITY** - they enable real-time frontend updates without polling.

---

### **Category 7: CMS Routes - CMS Event Publishing** ❌ PENDING (OPTIONAL)

| # | File | Endpoint | Status | Why RabbitMQ is Necessary |
|---|------|----------|--------|---------------------------|
| 24 | `routes/cms.js` | `POST /api/cms/stations` | ❌ PENDING | **Audit Trail** - Track station creation. **OPTIONAL - only if you need real-time CMS updates.** |
| 25 | `routes/cms.js` | `PUT /api/cms/stations/:id` | ❌ PENDING | **Audit Trail** - Track station updates. **OPTIONAL.** |
| 26 | `routes/cms.js` | `POST /api/cms/points` | ❌ PENDING | **Audit Trail** - Track charging point creation. **OPTIONAL.** |
| 27 | `routes/cms.js` | `PUT /api/cms/points/:id` | ❌ PENDING | **Audit Trail** - Track charging point updates. **OPTIONAL.** |
| 28 | `routes/cms.js` | `POST /api/cms/tariffs` | ❌ PENDING | **Audit Trail** - Track tariff creation. **OPTIONAL.** |
| 29 | `routes/cms.js` | `PUT /api/cms/tariffs/:id` | ❌ PENDING | **Audit Trail** - Track tariff updates. **OPTIONAL.** |

**Note:** These are **OPTIONAL** - only needed if you want real-time CMS dashboard updates or audit trails.

---

## 🟢 **FRONTEND INTEGRATION POINTS** (Subscribing to Socket.io from RabbitMQ)

### **Category 8: User Panel - Active Session Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 30 | Active Session | `public/user-panel/modules/active-session.js` | Meter Values | ❌ PENDING | **Real-time Energy Display** - User needs live energy consumption updates. Without this, user must refresh page. **HIGH PRIORITY** |
| 31 | Active Session | `public/user-panel/modules/active-session.js` | Session Status | ❌ PENDING | **Session Completion** - User needs to know immediately when charging stops. Without this, user doesn't know when to leave. **HIGH PRIORITY** |
| 32 | Active Session | `public/user-panel/modules/active-session.js` | Cost Updates | ❌ PENDING | **Real-time Cost** - User needs live cost calculation. Without this, cost is outdated. **HIGH PRIORITY** |

**Why RabbitMQ:** These updates come from `MeterValues` OCPP messages processed via RabbitMQ → Notification Service → Socket.io

---

### **Category 9: User Panel - Dashboard Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 33 | Dashboard | `public/user-panel/modules/dashboard.js` | Wallet Balance | ❌ PENDING | **Real-time Balance** - After top-up or charging, balance updates immediately. Without this, user must refresh. **HIGH PRIORITY** |
| 34 | Dashboard | `public/user-panel/modules/dashboard.js` | Session Events | ❌ PENDING | **Session Notifications** - User sees charging started/stopped notifications. Without this, no real-time feedback. **HIGH PRIORITY** |
| 35 | Dashboard | `public/user-panel/modules/dashboard.js` | Active Session Status | ❌ PENDING | **Session Banner** - Active session banner updates in real-time. Without this, banner shows stale data. **MEDIUM PRIORITY** |

**Why RabbitMQ:** These updates come from charging events published to RabbitMQ → Notification Service → Socket.io

---

### **Category 10: User Panel - Stations List Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 36 | Stations List | `public/user-panel/modules/stations-list.js` | Charger Availability | ❌ PENDING | **Real-time Availability** - User sees which chargers are available/occupied. Without this, user sees outdated availability. **MEDIUM PRIORITY** |
| 37 | Stations List | `public/user-panel/modules/stations-list.js` | Station Status | ❌ PENDING | **Online/Offline Status** - User sees which stations are online. Without this, user doesn't know if station is operational. **MEDIUM PRIORITY** |

**Why RabbitMQ:** These updates come from `StatusNotification` OCPP messages processed via RabbitMQ → Notification Service → Socket.io

---

### **Category 11: User Panel - Charger Detail Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 38 | Charger Detail | `public/user-panel/modules/charger-detail.js` | Charger Status | ❌ PENDING | **Real-time Status** - User sees current charger status (Available/Charging/Faulted). Without this, status is outdated. **MEDIUM PRIORITY** |
| 39 | Charger Detail | `public/user-panel/modules/charger-detail.js` | Connector Status | ❌ PENDING | **Connector Availability** - User sees which connectors are available. Without this, user doesn't know availability. **MEDIUM PRIORITY** |

**Why RabbitMQ:** These updates come from `StatusNotification` OCPP messages processed via RabbitMQ → Notification Service → Socket.io

---

### **Category 12: User Panel - Wallet Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 40 | Wallet | `public/user-panel/modules/wallet.js` | Wallet Balance | ❌ PENDING | **Real-time Balance** - After top-up, balance updates immediately. Without this, user must refresh. **HIGH PRIORITY** |
| 41 | Wallet | `public/user-panel/modules/wallet.js` | Transaction Updates | ❌ PENDING | **New Transactions** - New transactions appear in real-time. Without this, user must refresh. **MEDIUM PRIORITY** |

**Why RabbitMQ:** These updates come from wallet events published to RabbitMQ → Notification Service → Socket.io

---

### **Category 13: User Panel - Sessions Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 42 | Sessions | `public/user-panel/modules/sessions.js` | New Session | ❌ PENDING | **New Session Appears** - Completed session appears in list immediately. Without this, user must refresh. **LOW PRIORITY** (can use polling) |
| 43 | Sessions | `public/user-panel/modules/sessions.js` | Session Updates | ❌ PENDING | **Session Status Changes** - Session status updates in real-time. **LOW PRIORITY** (can use polling) |

**Why RabbitMQ:** These updates come from charging events published to RabbitMQ → Notification Service → Socket.io

**Note:** These are **LOW PRIORITY** - session history can use API polling instead of real-time updates.

---

### **Category 14: CMS - Dashboard Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 44 | CMS Dashboard | `public/modules/dashboard.js` | Station Status | ❌ PENDING | **Real-time Station Count** - Online/offline station count updates. Without this, admin must refresh. **MEDIUM PRIORITY** |
| 45 | CMS Dashboard | `public/modules/dashboard.js` | Charger Status | ❌ PENDING | **Real-time Charger Count** - Online/offline charger count updates. Without this, admin must refresh. **MEDIUM PRIORITY** |
| 46 | CMS Dashboard | `public/modules/dashboard.js` | Session Events | ❌ PENDING | **New Sessions** - New sessions appear in recent sessions list. Without this, admin must refresh. **LOW PRIORITY** |
| 47 | CMS Dashboard | `public/modules/dashboard.js` | Revenue Updates | ❌ PENDING | **Revenue Changes** - Revenue updates when sessions complete. Without this, revenue is outdated. **LOW PRIORITY** |

**Why RabbitMQ:** These updates come from OCPP messages and charging events processed via RabbitMQ → Notification Service → Socket.io

---

### **Category 15: CMS - Charging Stations Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 48 | CMS Stations | `public/modules/charging-stations.js` | Station Status | ❌ PENDING | **Real-time Status** - Station status (Active/Inactive) updates. Without this, admin must refresh. **MEDIUM PRIORITY** |
| 49 | CMS Stations | `public/modules/charging-stations.js` | Station Updates | ❌ PENDING | **Station Changes** - When station is updated, list refreshes. **LOW PRIORITY** (can use polling) |

**Why RabbitMQ:** These updates come from CMS events published to RabbitMQ → Notification Service → Socket.io

---

### **Category 16: CMS - Charging Points Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 50 | CMS Points | `public/modules/charging-points.js` | Charger Status | ❌ PENDING | **Real-time Status** - Charger status (Online/Offline/Charging) updates. Without this, admin must refresh. **HIGH PRIORITY** |
| 51 | CMS Points | `public/modules/charging-points.js` | Charger Availability | ❌ PENDING | **Availability Updates** - Connector availability updates. Without this, admin sees outdated data. **HIGH PRIORITY** |
| 52 | CMS Points | `public/modules/charging-points.js` | Point Updates | ❌ PENDING | **Point Changes** - When point is updated, list refreshes. **LOW PRIORITY** (can use polling) |

**Why RabbitMQ:** These updates come from `StatusNotification` OCPP messages processed via RabbitMQ → Notification Service → Socket.io

---

### **Category 17: CMS - Charging Sessions Module** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 53 | CMS Sessions | `public/modules/charging-sessions.js` | New Session | ❌ PENDING | **New Sessions** - New sessions appear in list immediately. Without this, admin must refresh. **MEDIUM PRIORITY** |
| 54 | CMS Sessions | `public/modules/charging-sessions.js` | Session Updates | ❌ PENDING | **Session Status** - Session status (active/stopped) updates. Without this, admin sees outdated status. **MEDIUM PRIORITY** |
| 55 | CMS Sessions | `public/modules/charging-sessions.js` | Meter Values | ❌ PENDING | **Energy Updates** - Energy consumption updates for active sessions. Without this, energy is outdated. **MEDIUM PRIORITY** |

**Why RabbitMQ:** These updates come from `StartTransaction`, `StopTransaction`, and `MeterValues` OCPP messages processed via RabbitMQ → Notification Service → Socket.io

---

### **Category 18: CMS - Charging Point Detail View** ❌ PENDING

| # | Module | File | Subscription | Status | Why RabbitMQ is Necessary |
|---|--------|------|--------------|--------|---------------------------|
| 56 | CMS Point Detail | `public/modules/charging-point-detail-view.js` | Charger Status | ❌ PENDING | **Real-time Status** - Charger status updates in detail view. Without this, admin must refresh. **HIGH PRIORITY** |
| 57 | CMS Point Detail | `public/modules/charging-point-detail-view.js` | Meter Values | ❌ PENDING | **Real-time Energy** - Energy consumption updates for active sessions. Without this, energy is outdated. **HIGH PRIORITY** |
| 58 | CMS Point Detail | `public/modules/charging-point-detail-view.js` | OCPP Messages | ❌ PENDING | **Message Log** - New OCPP messages appear in log. Without this, admin must refresh. **MEDIUM PRIORITY** |

**Why RabbitMQ:** These updates come from OCPP messages processed via RabbitMQ → Notification Service → Socket.io

---

## 🎯 **Priority Summary**

### **HIGH PRIORITY (Must Have)**
- Backend: Customer routes (charging events) - **2 points**
- Frontend: Active Session (meter values, session status) - **3 points**
- Frontend: Dashboard (wallet balance, session events) - **3 points**
- Frontend: Wallet (balance updates) - **1 point**
- Frontend: CMS Points (charger status) - **2 points**
- Frontend: CMS Point Detail (status, meter values) - **2 points**

**Total High Priority:** 13 points

### **MEDIUM PRIORITY (Should Have)**
- Backend: Charger routes (command auditing) - **4 points** (optional)
- Frontend: Stations List (availability) - **2 points**
- Frontend: Charger Detail (status) - **2 points**
- Frontend: CMS Dashboard (status updates) - **2 points**
- Frontend: CMS Sessions (updates) - **3 points**

**Total Medium Priority:** 13 points

### **LOW PRIORITY (Nice to Have)**
- Backend: CMS routes (audit trail) - **6 points** (optional)
- Frontend: Sessions history (updates) - **2 points**
- Frontend: CMS Stations (updates) - **2 points**
- Frontend: CMS Dashboard (revenue) - **2 points**

**Total Low Priority:** 12 points

---

## ✅ **What's Actually Necessary vs Optional**

### **Absolutely Necessary (System Works Without But Poor UX):**
1. ✅ Backend: OCPP message publishing (DONE)
2. ✅ Backend: OCPP message processing (DONE)
3. ❌ Backend: Customer routes - charging events (PENDING - **HIGH PRIORITY**)
4. ❌ Frontend: Active Session - meter values (PENDING - **HIGH PRIORITY**)
5. ❌ Frontend: Active Session - session status (PENDING - **HIGH PRIORITY**)
6. ❌ Frontend: Dashboard - wallet balance (PENDING - **HIGH PRIORITY**)

### **Optional But Recommended:**
- Backend: Charger routes - command auditing
- Frontend: Stations List - availability updates
- Frontend: CMS Points - status updates

### **Completely Optional:**
- Backend: CMS routes - audit trail
- Frontend: Sessions history - real-time updates (can use polling)
- Frontend: CMS Dashboard - revenue updates (can use polling)

---

## 📝 **Current Status**

- **Backend Completed:** 10/17 (59%)
- **Backend Pending:** 7/17 (41%)
- **Frontend Completed:** 0/39 (0%)
- **Frontend Pending:** 39/39 (100%)

**Total Completed:** 10/56 (18%)
**Total Pending:** 46/56 (82%)

---

## 🚀 **Recommended Implementation Order**

1. **Phase 1:** Backend - Customer routes (charging events) - **HIGH PRIORITY**
2. **Phase 2:** Frontend - Active Session subscriptions - **HIGH PRIORITY**
3. **Phase 3:** Frontend - Dashboard subscriptions - **HIGH PRIORITY**
4. **Phase 4:** Frontend - CMS Points subscriptions - **HIGH PRIORITY**
5. **Phase 5:** Backend - Charger routes (optional)
6. **Phase 6:** Frontend - Other modules (medium/low priority)
7. **Phase 7:** Backend - CMS routes (optional)

---

**Last Updated:** Based on current codebase analysis
**Total Integration Points:** 56
**Backend Points:** 17
**Frontend Points:** 39

