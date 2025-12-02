/**
 * WebSocket Service Client
 * Communicates with WebSocket service via HTTP API
 */

const axios = require('axios');

const WEBSOCKET_API_URL = process.env.WEBSOCKET_API_URL || 'http://localhost:9001';

/**
 * Check if charger is connected
 * @param {string} deviceId - Device identifier
 * @returns {Promise<boolean>} True if connected
 */
async function isChargerConnected(deviceId) {
  try {
    const response = await axios.get(`${WEBSOCKET_API_URL}/api/charger/${deviceId}/connection`, {
      timeout: 5000
    });
    return response.data.success && response.data.connected;
  } catch (error) {
    console.warn(`⚠️ Failed to check charger connection for ${deviceId}:`, error.message);
    return false;
  }
}

/**
 * Get charger connection (for compatibility)
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object|null>} Connection object or null
 */
async function getChargerConnection(deviceId) {
  const isConnected = await isChargerConnected(deviceId);
  return isConnected ? { readyState: 1 } : null;
}

/**
 * Send OCPP call to charger
 * @param {string} deviceId - Device identifier
 * @param {string} action - OCPP action
 * @param {Object} payload - Action payload
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} Response
 */
async function sendOcppCall(deviceId, action, payload = {}, timeoutMs = 60000) {
  try {
    const response = await axios.post(
      `${WEBSOCKET_API_URL}/api/charger/${deviceId}/ocpp-call`,
      { action, payload, timeoutMs },
      { timeout: timeoutMs + 5000 }
    );
    
    if (response.data.success) {
      return response.data.response;
    } else {
      throw new Error(response.data.error || 'Unknown error');
    }
  } catch (error) {
    if (error.response && error.response.data) {
      throw new Error(error.response.data.error || error.message);
    }
    throw error;
  }
}

/**
 * Get all connected chargers
 * @returns {Promise<Array>} List of connected device IDs
 */
async function getConnectedChargers() {
  try {
    const response = await axios.get(`${WEBSOCKET_API_URL}/api/chargers/connected`, {
      timeout: 5000
    });
    return response.data.success ? response.data.chargers : [];
  } catch (error) {
    console.warn('⚠️ Failed to get connected chargers:', error.message);
    return [];
  }
}

/**
 * Get connection count
 * @returns {Promise<number>} Number of connected chargers
 */
async function getConnectionCount() {
  try {
    const response = await axios.get(`${WEBSOCKET_API_URL}/api/chargers/connected`, {
      timeout: 5000
    });
    return response.data.success ? response.data.count : 0;
  } catch (error) {
    console.warn('⚠️ Failed to get connection count:', error.message);
    return 0;
  }
}

// Create a connections Map-like object for compatibility
const connections = {
  get: async (deviceId) => {
    const isConnected = await isChargerConnected(deviceId);
    return isConnected ? { readyState: 1 } : null;
  }
};

module.exports = {
  sendOcppCall,
  getChargerConnection,
  getConnectedChargers,
  getConnectionCount,
  connections,
  isChargerConnected
};

