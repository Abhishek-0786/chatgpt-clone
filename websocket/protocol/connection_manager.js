/**
 * WebSocket Connection Manager
 * Manages WebSocket connections, pending requests, and connection state
 * Protocol layer - no business logic
 */

const WebSocket = require('ws');

// Store active WebSocket connections
const connections = new Map(); // deviceId -> WebSocket
const pendingRequests = new Map(); // messageId -> { deviceId, resolve, reject, timeout }
const intervals = new Map(); // deviceId -> periodic trigger intervalId
const keepAliveIntervals = new Map(); // deviceId -> keepalive ping intervalId
const heartbeatIntervals = new Map(); // deviceId -> heartbeat intervalId
const heartbeatConfigured = new Set(); // deviceIds we attempted ChangeConfiguration
const messageSequences = new Map(); // deviceId -> sequence counter
const messageQueues = new Map(); // deviceId -> queue data

/**
 * Create WebSocket server
 * @param {number} port - Port to listen on
 * @param {Object} options - Additional options
 * @returns {WebSocket.Server}
 */
function createWebSocketServer(port = 9000, options = {}) {
  const wss = new WebSocket.Server({
    port,
    handleProtocols: (protocols, request) => {
      const protocolsList = Array.isArray(protocols) ? protocols : Array.from(protocols || []);
      if (protocolsList.includes('ocpp1.6')) {
        return 'ocpp1.6';
      }
      return protocolsList.length > 0 ? protocolsList[0] : false;
    },
    ...options
  });

  return wss;
}

/**
 * Register a WebSocket connection for a device
 * @param {string} deviceId - Device identifier
 * @param {WebSocket} ws - WebSocket connection
 */
function registerConnection(deviceId, ws) {
  connections.set(deviceId, ws);
}

/**
 * Unregister a WebSocket connection
 * @param {string} deviceId - Device identifier
 */
function unregisterConnection(deviceId) {
  connections.delete(deviceId);
  clearIntervals(deviceId);
  clearPendingRequests(deviceId);
  messageSequences.delete(deviceId);
  messageQueues.delete(deviceId);
}

/**
 * Get WebSocket connection for a device
 * @param {string} deviceId - Device identifier
 * @returns {WebSocket|null}
 */
function getConnection(deviceId) {
  return connections.get(deviceId) || null;
}

/**
 * Check if device is connected
 * @param {string} deviceId - Device identifier
 * @returns {boolean}
 */
function isConnected(deviceId) {
  const ws = connections.get(deviceId);
  return ws && ws.readyState === WebSocket.OPEN;
}

/**
 * Get all connected device IDs
 * @returns {Array<string>}
 */
function getConnectedDevices() {
  return Array.from(connections.keys());
}

/**
 * Get connection count
 * @returns {number}
 */
function getConnectionCount() {
  return connections.size;
}

/**
 * Register a pending request (for async OCPP calls)
 * @param {string} messageId - Message ID
 * @param {Object} requestData - Request data
 */
function registerPendingRequest(messageId, requestData) {
  pendingRequests.set(messageId, requestData);
}

/**
 * Resolve a pending request
 * @param {string} messageId - Message ID
 * @param {Object} payload - Response payload
 */
function resolvePendingRequest(messageId, payload) {
  const pending = pendingRequests.get(messageId);
  if (pending) {
    pendingRequests.delete(messageId);
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    if (pending.resolve) {
      pending.resolve(payload || {});
    }
  }
}

/**
 * Reject a pending request
 * @param {string} messageId - Message ID
 * @param {Object} error - Error object
 */
function rejectPendingRequest(messageId, error) {
  const pending = pendingRequests.get(messageId);
  if (pending) {
    pendingRequests.delete(messageId);
    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }
    if (pending.reject) {
      pending.reject(error || { errorCode: 'InternalError' });
    }
  }
}

/**
 * Clear all pending requests for a device
 * @param {string} deviceId - Device identifier
 */
function clearPendingRequests(deviceId) {
  const toDelete = [];
  for (const [messageId, pending] of pendingRequests.entries()) {
    if (pending.deviceId === deviceId) {
      toDelete.push(messageId);
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
  }
  toDelete.forEach(id => pendingRequests.delete(id));
}

/**
 * Set interval for a device
 * @param {string} deviceId - Device identifier
 * @param {string} type - Interval type ('periodic', 'keepalive', 'heartbeat')
 * @param {number} intervalId - Interval ID
 */
function setInterval(deviceId, type, intervalId) {
  const map = {
    periodic: intervals,
    keepalive: keepAliveIntervals,
    heartbeat: heartbeatIntervals
  }[type];
  
  if (map) {
    map.set(deviceId, intervalId);
  }
}

/**
 * Clear intervals for a device
 * @param {string} deviceId - Device identifier
 */
function clearIntervals(deviceId) {
  const intervalId = intervals.get(deviceId);
  if (intervalId) {
    clearInterval(intervalId);
    intervals.delete(deviceId);
  }
  
  const keepAliveId = keepAliveIntervals.get(deviceId);
  if (keepAliveId) {
    clearInterval(keepAliveId);
    keepAliveIntervals.delete(deviceId);
  }
  
  const heartbeatId = heartbeatIntervals.get(deviceId);
  if (heartbeatId) {
    clearInterval(heartbeatId);
    heartbeatIntervals.delete(deviceId);
  }
}

/**
 * Get next message sequence for a device
 * @param {string} deviceId - Device identifier
 * @returns {number}
 */
function getNextSequence(deviceId) {
  if (!messageSequences.has(deviceId)) {
    messageSequences.set(deviceId, 1);
  }
  const seq = messageSequences.get(deviceId);
  messageSequences.set(deviceId, seq + 1);
  return seq;
}

/**
 * Get message queue data for a device
 * @param {string} deviceId - Device identifier
 * @returns {Object}
 */
function getMessageQueue(deviceId) {
  if (!messageQueues.has(deviceId)) {
    messageQueues.set(deviceId, {
      queue: [],
      processing: false,
      nextSequence: 1,
      processingPromise: Promise.resolve()
    });
  }
  return messageQueues.get(deviceId);
}

/**
 * Mark heartbeat as configured for a device
 * @param {string} deviceId - Device identifier
 */
function markHeartbeatConfigured(deviceId) {
  heartbeatConfigured.add(deviceId);
}

/**
 * Check if heartbeat is configured for a device
 * @param {string} deviceId - Device identifier
 * @returns {boolean}
 */
function isHeartbeatConfigured(deviceId) {
  return heartbeatConfigured.has(deviceId);
}

module.exports = {
  createWebSocketServer,
  registerConnection,
  unregisterConnection,
  getConnection,
  isConnected,
  getConnectedDevices,
  getConnectionCount,
  registerPendingRequest,
  resolvePendingRequest,
  rejectPendingRequest,
  clearPendingRequests,
  setInterval,
  clearIntervals,
  getNextSequence,
  getMessageQueue,
  markHeartbeatConfigured,
  isHeartbeatConfigured,
  connections // Export for backward compatibility
};

