/**
 * HTTP API Server for WebSocket Service
 * Provides REST API endpoints for backend to communicate with WebSocket service
 */

const express = require('express');
const cors = require('cors');
const { sendOcppCall, getChargerConnection, getConnectedChargers, getConnectionCount } = require('./websocket_server');

const app = express();
app.use(cors());
app.use(express.json());

const API_PORT = process.env.API_PORT || 9001;

/**
 * Check if charger is connected
 * GET /api/charger/:deviceId/connection
 */
app.get('/api/charger/:deviceId/connection', (req, res) => {
  try {
    const { deviceId } = req.params;
    const ws = getChargerConnection(deviceId);
    const isConnected = ws && ws.readyState === 1; // WebSocket.OPEN = 1
    
    res.json({
      success: true,
      connected: isConnected,
      deviceId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send OCPP call to charger
 * POST /api/charger/:deviceId/ocpp-call
 */
app.post('/api/charger/:deviceId/ocpp-call', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { action, payload, timeoutMs } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'action is required'
      });
    }

    const response = await sendOcppCall(deviceId, action, payload || {}, timeoutMs || 60000);
    
    res.json({
      success: true,
      response,
      deviceId,
      action
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      deviceId: req.params.deviceId
    });
  }
});

/**
 * Get all connected chargers
 * GET /api/chargers/connected
 */
app.get('/api/chargers/connected', (req, res) => {
  try {
    const chargers = getConnectedChargers();
    const count = getConnectionCount();
    
    res.json({
      success: true,
      chargers,
      count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'ocpp-websocket',
    status: 'running',
    timestamp: new Date()
  });
});

function startAPIServer() {
  app.listen(API_PORT, '0.0.0.0', () => {
    console.log(`✅ WebSocket API server started on port ${API_PORT}`);
  });
}

module.exports = {
  startAPIServer,
  app
};

