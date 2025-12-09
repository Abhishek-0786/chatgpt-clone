const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
// Always use .env from backend directory, regardless of where server is started
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { syncDatabase } = require('./models');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customer');
const chatRoutes = require('./routes/chat');
const chargerRoutes = require('./routes/charger');
const cmsRoutes = require('./routes/cms');
const logsRoutes = require('./routes/logs');

// RabbitMQ integration (optional - controlled by feature flag)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let rabbitmqInitialized = false;


let io = null; // Socket.io instance

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io
io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`🌐 [Socket.io] Browser client connected: ${socket.id} (for real-time UI updates)`);

  // Handle room joining for targeted notifications
  socket.on('join-room', (room) => {
    socket.join(room);
    console.log(`👤 [Socket.io] Client ${socket.id} joined room: ${room}`);
  });

  socket.on('disconnect', () => {
    console.log(`🌐 [Socket.io] Browser client disconnected: ${socket.id}`);
  });
});

// Configure EJS view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Special handling for Razorpay webhook - needs raw body for signature verification
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', customerRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/charger', chargerRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/logs', logsRoutes);

// Payment webhook route (needs to be at app level for simpler path)
// Import webhook handler from customer routes
const { handlePaymentWebhook } = require('./routes/customer');
app.post('/api/payment/webhook', handlePaymentWebhook);

// Config endpoint - Expose ENABLE_RABBITMQ to frontend
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    ENABLE_RABBITMQ: ENABLE_RABBITMQ
  });
});

// Serve the home page
app.get('/', (req, res) => {
  res.render('home');
});

// Chat page - client-side auth handled in app.js
app.get('/chat', (req, res) => {
  res.render('chat');
});

// CMS charging stations detail routes - handle /cms/charging-stations/:stationId/:tab?
// MUST come before /cms/:module? to avoid route conflicts
app.get('/cms/charging-stations/:stationId/:tab?', (req, res) => {
  const module = 'charging-stations';
  res.render('cms', { initialModule: module });
});

// CMS charging points detail routes - handle /cms/charging-points/:pointId/:tab?
// MUST come before /cms/:module? to avoid route conflicts
app.get('/cms/charging-points/:pointId/:tab?', (req, res) => {
  const module = 'charging-points';
  res.render('cms', { initialModule: module });
});

// CMS customers detail routes - handle /cms/customers/:customerId/:tab?
// MUST come before /cms/:module? to avoid route conflicts
app.get('/cms/customers/:customerId/:tab?', (req, res) => {
  const module = 'customers';
  res.render('cms', { initialModule: module });
});

// CMS page with clean URLs - client-side auth handled in cms.js
app.get('/cms/:module?', (req, res) => {
  // Support both clean URLs (/cms/dashboard) and query params (/cms?module=dashboard)
  const module = req.params.module || req.query.module || 'dashboard';
  res.render('cms', { initialModule: module });
});

// User Panel vehicles routes - handle /user/vehicles and /user/vehicles/add
// MUST come before /user/:tab? to avoid route conflicts
app.get('/user/vehicles/:action?', (req, res) => {
  const action = req.params.action;
  // If action is "add", set tab to "vehicles" with action "add"
  // Otherwise, set tab to "vehicles"
  const tab = action === 'add' ? 'vehicles-add' : 'vehicles';
  res.render('user', { initialTab: tab });
});

// User Panel page with clean URLs - client-side auth handled in user-panel/app.js
app.get('/user/:tab?', (req, res) => {
  // Support both clean URLs (/user/stations) and the base URL (/user)
  // Also treat "home" as the Home tab
  const tabParam = req.params.tab;
  const tab = !tabParam || tabParam === 'home' ? 'home' : tabParam;
  res.render('user', { initialTab: tab });
});

app.get('/user-panel', (req, res) => {
  res.render('user', { initialTab: 'home' });
});

// Customer Reset Password page - public
app.get('/user-panel/reset-password', (req, res) => {
  res.render('user-panel-reset-password');
});

// Serve static files (after routes to avoid index.html interference)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false // Disable automatic index.html serving
}));

// Reset password page - public
app.get('/reset-password', (req, res) => {
  res.render('reset-password');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing connections...');
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    await syncDatabase();
    
    // Initialize RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ) {
      try {
        const { initializeRabbitMQ } = require('./libs/rabbitmq/connection');
        await initializeRabbitMQ();
        rabbitmqInitialized = true;
        console.log('✅ RabbitMQ initialized successfully');

        // Small delay to ensure connection is fully ready
        await new Promise(resolve => setTimeout(resolve, 500));

        // Start OCPP Message Processor
        try {
          const { startOCPPMessageProcessor } = require('./services/ocpp-message-processor');
          await startOCPPMessageProcessor();
          console.log('✅ OCPP Message Processor started');
        } catch (processorError) {
          console.warn('⚠️ Failed to start OCPP Message Processor:', processorError.message);
        }

        // Start Notification Service (requires Socket.io)
        try {
          const { startNotificationService } = require('./services/notification-service');
          await startNotificationService(io);
          console.log('✅ Notification Service started');
        } catch (notificationError) {
          console.warn('⚠️ Failed to start Notification Service:', notificationError.message);
        }

        // Start OCPP Logs Consumer
        try {
          const OCPPLogsConsumer = require('./services/ocpp-logs-consumer');
          const logsConsumer = new OCPPLogsConsumer();
          await logsConsumer.start();
          console.log('✅ OCPP Logs Consumer started');
        } catch (logsError) {
          console.warn('⚠️ Failed to start OCPP Logs Consumer:', logsError.message);
        }

        // Start Charging Responses Consumer (for queue-based remote start/stop)
        try {
          const { startChargingResponsesConsumer } = require('./services/charging-responses-consumer');
          await startChargingResponsesConsumer();
          console.log('✅ Charging Responses Consumer started');
        } catch (chargingError) {
          console.warn('⚠️ Failed to start Charging Responses Consumer:', chargingError.message);
        }

        // Start Payment Consumer (for Razorpay webhook processing)
        try {
          const PaymentConsumer = require('./services/payment-consumer');
          const paymentConsumer = new PaymentConsumer();
          await paymentConsumer.start();
          console.log('✅ Payment Consumer started');
        } catch (paymentError) {
          console.warn('⚠️ Failed to start Payment Consumer:', paymentError.message);
        }
      } catch (rabbitmqError) {
        console.warn('⚠️ RabbitMQ initialization failed:', rabbitmqError.message);
        console.warn('⚠️ Continuing without RabbitMQ. Set ENABLE_RABBITMQ=false to disable this warning.');
        rabbitmqInitialized = false;
        // Don't exit - continue without RabbitMQ
      }
    } else {
      console.log('ℹ️ RabbitMQ is disabled (set ENABLE_RABBITMQ=true in .env to enable)');
    }

    
    // Start HTTP server (with Socket.io)
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Express server running on http://localhost:${PORT}`);
      console.log(`✅ Socket.io server ready for real-time updates`);
      console.log('Make sure to set up your .env file with database credentials and OpenAI API key');
      if (rabbitmqInitialized) {
        console.log('✅ RabbitMQ is connected and ready');
        console.log('✅ All RabbitMQ services are running');
      }
      console.log('ℹ️  WebSocket service should be started separately via: npm run websocket');
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Export Socket.io instance for use in other modules
module.exports = { io: () => io };
