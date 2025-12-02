#!/usr/bin/env node
/**
 * OCPP WebSocket Service - Standalone Entry Point
 * 
 * This is the main entry point for running the OCPP service as a standalone microservice.
 * 
 * Usage:
 *   node websocket/index.js
 *   OR
 *   npm run websocket
 * 
 * Environment:
 *   - Loads .env.ocpp if it exists, otherwise falls back to .env
 *   - Uses BACKEND_API_URL for REST API communication
 *   - Uses RABBITMQ_URL for message queue communication
 */

// Load environment variables from .env.ocpp first, then fallback to .env
const fs = require('fs');
const path = require('path');

const envOcppPath = path.join(__dirname, '.env.ocpp');
const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envOcppPath)) {
  require('dotenv').config({ path: envOcppPath });
  console.log('✅ Loaded environment from .env.ocpp');
} else if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('⚠️ Loaded environment from .env (consider creating .env.ocpp for microservice)');
} else {
  console.warn('⚠️ No .env.ocpp or .env file found. Using system environment variables.');
}

// Initialize RabbitMQ if enabled (before loading websocket server)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
if (ENABLE_RABBITMQ) {
  const { initializeRabbitMQ } = require('./rabbitmq/connection');
  initializeRabbitMQ().then(async () => {
    // Start charging commands consumer after RabbitMQ is initialized
    try {
      const { startChargingCommandsConsumer } = require('./services/charging-commands-consumer');
      await startChargingCommandsConsumer();
    } catch (err) {
      console.warn('⚠️ Failed to start Charging Commands Consumer:', err.message);
    }
  }).catch(err => {
    console.warn('⚠️ Failed to initialize RabbitMQ:', err.message);
  });
}

// Now load the WebSocket server
const { createWebSocketServer } = require('./websocket_server');

const PORT = process.env.PORT || process.env.WEBSOCKET_PORT || 9000;

console.log('🚀 Starting OCPP WebSocket Service as standalone microservice...');
console.log(`📡 Port: ${PORT}`);
console.log(`🔗 Backend API: ${process.env.BACKEND_API_URL || process.env.OCPP_BACKEND_API_URL || 'http://localhost:3000'}`);
console.log(`🐰 RabbitMQ: ${process.env.ENABLE_RABBITMQ === 'true' ? 'Enabled' : 'Disabled'}`);

// Create and start WebSocket server
try {
  const server = createWebSocketServer(PORT);
  console.log('✅ OCPP WebSocket Service started successfully');
  
  // Start HTTP API server for backend communication
  const { startAPIServer } = require('./api_server');
  startAPIServer();
  
  console.log('📝 Press Ctrl+C to stop');
} catch (error) {
  console.error('❌ Failed to start OCPP WebSocket Service:', error.message);
  process.exit(1);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down OCPP WebSocket Service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down OCPP WebSocket Service...');
  process.exit(0);
});

