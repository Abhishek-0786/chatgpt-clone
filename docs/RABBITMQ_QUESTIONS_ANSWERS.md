# 📋 RabbitMQ Integration - Questions & Answers

## 1️⃣ **What We Done in Notification Service**

### **Purpose:**
The Notification Service (`services/notification-service.js`) is a **RabbitMQ Consumer** that:
- Consumes notifications from the `notifications` queue
- Broadcasts these notifications to frontend clients via **Socket.io**

### **How It Works:**

1. **Consumes from RabbitMQ:**
   - Listens to `notifications` queue
   - Processes messages with routing keys: `notification.station`, `notification.charger`, `notification.session`, `notification.customer`

2. **Broadcasts via Socket.io:**
   - Sends notifications to all connected clients: `io.emit('notification', {...})`
   - Sends to specific customer rooms: `io.to('customer:123').emit('notification', {...})`
   - Sends to CMS rooms: `io.to('cms:dashboard').emit('notification', {...})`

3. **Room-Based Targeting:**
   - **Customer rooms:** `customer:{customerId}` - For user-specific notifications
   - **CMS rooms:** `cms:dashboard`, `cms:stations`, `cms:points`, `cms:sessions` - For admin notifications

### **Example Flow:**
```
Charging Started → routes/customer.js publishes to RabbitMQ
                → Notification Service consumes
                → Broadcasts via Socket.io to customer:123 room
                → Frontend receives real-time update
```

---

## 2️⃣ **Multiple Customers - Session Isolation**

### **Current Implementation:**
✅ **Already implemented in notification service!**

The notification service uses **Socket.io rooms** to ensure customers only see their own sessions:

```javascript
// In notification-service.js (lines 42-50)
if (recipients && recipients.length > 0) {
  recipients.forEach(recipientId => {
    // Send to customer-specific room
    this.io.to(`customer:${recipientId}`).emit('notification', {...});
  });
}
```

### **How It Works:**

1. **Backend Publishing:**
   - When charging starts/stops, `routes/customer.js` publishes notification with `recipients: [customer.id]`
   - Example:
     ```javascript
     await publishNotification({
       type: 'charging.started',
       data: { sessionId, customerId: 123, ... },
       recipients: [123]  // Only this customer ID
     });
     ```

2. **Frontend Must Join Room:**
   - When customer logs in, frontend must call: `socket.emit('join-room', 'customer:123')`
   - This ensures customer only receives notifications for their room

3. **Result:**
   - Customer A (ID: 123) joins `customer:123` room → Only receives notifications for customer 123
   - Customer B (ID: 456) joins `customer:456` room → Only receives notifications for customer 456
   - **No cross-contamination!** ✅

### **What We Need to Add:**
- Frontend Socket.io service that automatically joins customer room on login
- Example:
  ```javascript
  // In frontend socket service
  socket.on('connect', () => {
    const customerId = getCurrentCustomerId(); // From auth token
    socket.emit('join-room', `customer:${customerId}`);
  });
  ```

---

## 3️⃣ **Conditional Polling - RabbitMQ vs API Polling**

### **Current Situation:**
- Many modules use `setInterval` for API polling (every 10 seconds, 5 seconds, etc.)
- Examples:
  - `charging-points.js`: Refreshes every 10 seconds
  - `charging-stations.js`: Refreshes every 10 seconds
  - `active-session.js`: Refreshes every 1 second
  - `charging-point-detail-view.js`: Refreshes logs every 3 seconds

### **Requirement:**
- **If `ENABLE_RABBITMQ=true`:** Disable API polling, use Socket.io real-time updates
- **If `ENABLE_RABBITMQ=false`:** Use API polling as fallback

### **Implementation Strategy:**

1. **Create Environment Check Utility:**
   ```javascript
   // public/utils/config.js
   export const ENABLE_RABBITMQ = window.ENABLE_RABBITMQ === 'true' || false;
   ```

2. **Backend Must Expose Config:**
   ```javascript
   // In server.js or route
   app.get('/api/config', (req, res) => {
     res.json({ ENABLE_RABBITMQ: process.env.ENABLE_RABBITMQ === 'true' });
   });
   ```

3. **Conditional Polling Logic:**
   ```javascript
   // In each module
   import { ENABLE_RABBITMQ } from '../utils/config.js';
   
   if (ENABLE_RABBITMQ) {
     // Use Socket.io subscriptions
     socket.on('notification', handleNotification);
   } else {
     // Use API polling
     refreshInterval = setInterval(() => {
       loadData();
     }, 10000);
   }
   ```

### **Modules That Need This:**
- ✅ `charging-points.js` - 10 second polling
- ✅ `charging-stations.js` - 10 second polling
- ✅ `active-session.js` - 1 second polling
- ✅ `charging-point-detail-view.js` - 3 second polling
- ✅ `station-detail-view.js` - 3 second polling
- ✅ Any other module with `setInterval` for data refresh

---

## 4️⃣ **Production Deployment - Separating RabbitMQ**

### **Problem:**
- RabbitMQ code is in your repository
- You want to deploy RabbitMQ separately in production
- Don't want RabbitMQ code in GitHub if it's sensitive

### **Solution Options:**

#### **Option 1: Docker Compose (Recommended for Production)**

**Structure:**
```
your-project/
├── docker-compose.yml          # RabbitMQ service
├── docker-compose.prod.yml     # Production config
├── .env.example                # Example env file (safe for GitHub)
├── .env                        # Local env (gitignored)
└── .env.production             # Production env (gitignored)
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  rabbitmq:
    image: rabbitmq:3.12-management
    container_name: ev-charging-rabbitmq
    ports:
      - "5672:5672"      # AMQP port
      - "15672:15672"    # Management UI
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER:-admin}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASS:-secure_password}
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    networks:
      - ev-charging-network
    restart: unless-stopped

volumes:
  rabbitmq_data:

networks:
  ev-charging-network:
    driver: bridge
```

**Deployment:**
```bash
# Production server
docker-compose up -d rabbitmq
```

**Benefits:**
- ✅ RabbitMQ runs in separate container
- ✅ Easy to scale/restart
- ✅ Data persists in Docker volume
- ✅ Can deploy on different server

---

#### **Option 2: Cloud RabbitMQ Service**

**Providers:**
- **AWS:** Amazon MQ (managed RabbitMQ)
- **Azure:** Azure Service Bus (RabbitMQ compatible)
- **CloudAMQP:** Managed RabbitMQ service
- **RabbitMQ Cloud:** Official cloud service

**Configuration:**
```javascript
// .env.production
RABBITMQ_URL=amqp://user:pass@cloud-rabbitmq-host:5672
ENABLE_RABBITMQ=true
```

**Benefits:**
- ✅ Fully managed (no maintenance)
- ✅ High availability
- ✅ Auto-scaling
- ✅ Monitoring included

---

#### **Option 3: Separate Server (Self-Hosted)**

**Setup:**
1. Install RabbitMQ on separate server
2. Configure firewall rules
3. Update connection string in production `.env`

**Production `.env`:**
```bash
RABBITMQ_URL=amqp://user:pass@rabbitmq-server-ip:5672
ENABLE_RABBITMQ=true
```

**Benefits:**
- ✅ Full control
- ✅ No cloud costs
- ✅ Can optimize for your needs

---

### **GitHub Safety - What to Include/Exclude:**

#### **✅ Safe to Include in GitHub:**
- ✅ RabbitMQ connection code (`services/rabbitmq/`)
- ✅ Queue definitions (`services/rabbitmq/queues.js`)
- ✅ Producer/Consumer code
- ✅ `docker-compose.yml` (without passwords)
- ✅ `.env.example` (with placeholder values)

#### **❌ Never Include in GitHub:**
- ❌ `.env` file (with real credentials)
- ❌ `.env.production` (with production credentials)
- ❌ Actual RabbitMQ passwords
- ❌ Production connection strings

**`.gitignore`:**
```
.env
.env.local
.env.production
.env.*.local
```

**`.env.example` (Safe for GitHub):**
```bash
# RabbitMQ Configuration
ENABLE_RABBITMQ=true
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
```

---

### **Production Deployment Checklist:**

1. **✅ Code Repository:**
   - Push RabbitMQ code to GitHub (it's safe, no credentials)
   - Keep `.env` files in `.gitignore`

2. **✅ Production Server Setup:**
   - Deploy RabbitMQ (Docker/Cloud/Separate server)
   - Create production `.env` file with real credentials
   - Set `ENABLE_RABBITMQ=true`

3. **✅ Application Deployment:**
   - Deploy your Node.js app
   - Set environment variables
   - App connects to production RabbitMQ

4. **✅ Monitoring:**
   - Monitor RabbitMQ health
   - Set up alerts for queue buildup
   - Monitor connection status

---

## 📊 **Summary**

| Question | Answer |
|----------|--------|
| **1. Notification Service** | Consumes from RabbitMQ → Broadcasts via Socket.io to rooms |
| **2. Customer Isolation** | ✅ Already implemented using Socket.io rooms. Frontend must join customer room. |
| **3. Conditional Polling** | Check `ENABLE_RABBITMQ` env var. If true → Socket.io, else → API polling |
| **4. Production RabbitMQ** | Deploy separately using Docker/Cloud/Separate server. Keep credentials in `.env` (gitignored) |

---

## 🎯 **Next Steps**

1. **Add environment config endpoint** to expose `ENABLE_RABBITMQ` to frontend
2. **Create conditional polling logic** in all modules
3. **Implement frontend Socket.io service** with room joining
4. **Set up production RabbitMQ** (Docker/Cloud)

---

**Ready to implement these?** 🚀

