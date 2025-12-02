/**
 * Backend API Client
 * Communicates with backend via REST API
 * TODO: Replace with service-to-service gRPC when implemented
 */

const axios = require('axios');

const BACKEND_API_URL = process.env.BACKEND_API_URL || process.env.OCPP_BACKEND_API_URL || 'http://localhost:3000';

/**
 * Make API request to backend
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request data
 * @param {Object} headers - Additional headers
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(method, endpoint, data = null, headers = {}) {
  try {
    const url = `${BACKEND_API_URL}${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000 // 10 second timeout
    };

    if (data) {
      if (method === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }
    }

    const response = await axios(config);
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    // Don't log 404 errors as critical - they're expected when resources don't exist yet
    const statusCode = error.response?.status;
    if (statusCode === 404) {
      // 404 is expected for "charger not found" - will be created automatically
      return {
        success: false,
        error: error.message,
        data: error.response?.data || null,
        statusCode: 404
      };
    }
    
    // Log other errors as they're unexpected
    console.error(`❌ API request failed: ${method} ${endpoint}`, error.message);
    return {
      success: false,
      error: error.message,
      data: error.response?.data || null,
      statusCode: statusCode
    };
  }
}

/**
 * Get charger by device ID
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object|null>} Charger object
 */
async function getCharger(deviceId) {
  const result = await apiRequest('GET', `/api/charger/by-device/${deviceId}`);
  if (result.success && result.data && result.data.success) {
    return result.data.charger;
  }
  // 404 is expected when charger doesn't exist yet - will be created automatically
  // Don't treat it as an error
  if (result.statusCode === 404) {
    return null; // Charger not found - this is normal for new chargers
  }
  return null;
}

/**
 * Create or update charger
 * @param {string} deviceId - Device identifier
 * @param {Object} chargerData - Charger data
 * @returns {Promise<Object|null>} Charger object
 */
async function createOrUpdateCharger(deviceId, chargerData) {
  const result = await apiRequest('POST', `/api/charger/ensure`, {
    deviceId,
    ...chargerData
  });
  if (result.success && result.data && result.data.success) {
    return result.data.charger;
  }
  return null;
}

/**
 * Update charger status
 * @param {string} deviceId - Device identifier
 * @param {string} status - New status
 * @returns {Promise<boolean>} Success status
 */
async function updateChargerStatus(deviceId, status) {
  const result = await apiRequest('PATCH', `/api/charger/${deviceId}/status`, { status });
  return result.success && result.data && result.data.success;
}

/**
 * Update charger last seen
 * @param {string} deviceId - Device identifier
 * @returns {Promise<boolean>} Success status
 */
async function updateChargerLastSeen(deviceId) {
  const result = await apiRequest('PATCH', `/api/charger/${deviceId}/last-seen`);
  return result.success && result.data && result.data.success;
}

/**
 * Get active sessions for device
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Array>} Active sessions
 */
async function getActiveSessions(deviceId) {
  const result = await apiRequest('GET', `/api/charger/${deviceId}/active-sessions`);
  if (result.success && result.data && result.data.success) {
    return result.data.sessions || [];
  }
  return [];
}

/**
 * Stop session
 * @param {string} sessionId - Session ID
 * @param {Object} sessionData - Session update data
 * @returns {Promise<boolean>} Success status
 */
async function stopSession(sessionId, sessionData) {
  const result = await apiRequest('PATCH', `/api/charging-session/${sessionId}/stop`, sessionData);
  return result.success && result.data && result.data.success;
}

/**
 * Process refund
 * @param {number} customerId - Customer ID
 * @param {number} refundAmount - Refund amount
 * @param {string} sessionId - Session ID
 * @param {Object} refundData - Refund data
 * @returns {Promise<Object|null>} Refund transaction
 */
async function processRefund(customerId, refundAmount, sessionId, refundData) {
  const result = await apiRequest('POST', `/api/wallet/refund`, {
    customerId,
    refundAmount,
    sessionId,
    ...refundData
  });
  if (result.success && result.data && result.data.success) {
    return result.data.transaction;
  }
  return null;
}

/**
 * Store OCPP message
 * @param {string} deviceId - Device identifier
 * @param {Object} messageData - Message data
 * @returns {Promise<boolean>} Success status
 */
async function storeOCPPMessage(deviceId, messageData) {
  const result = await apiRequest('POST', `/api/charger/${deviceId}/ocpp-message`, messageData);
  return result.success && result.data && result.data.success;
}

module.exports = {
  apiRequest,
  getCharger,
  createOrUpdateCharger,
  updateChargerStatus,
  updateChargerLastSeen,
  getActiveSessions,
  stopSession,
  processRefund,
  storeOCPPMessage
};

