const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { syncDatabase } = require('./models');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const chargerRoutes = require('./routes/charger');
const { createWebSocketServer } = require('./websocket-server');

const app = express();
const PORT = process.env.PORT || 3000;
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 9000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/charger', chargerRoutes);

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve reset password page
app.get('/reset-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
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

// Start server
const startServer = async () => {
  try {
    await syncDatabase();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`✅ Express server running on http://localhost:${PORT}`);
      console.log('Make sure to set up your .env file with database credentials and OpenAI API key');
    });
    
    // Start WebSocket server
    createWebSocketServer(WEBSOCKET_PORT);
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
