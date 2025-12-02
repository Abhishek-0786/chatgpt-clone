/**
 * OCPP Message Sender
 * Handles sending OCPP messages via WebSocket
 * Protocol layer - no business logic
 */

const { toOcppCall, toOcppCallResult, toOcppCallError, createMessageId, MESSAGE_TYPE } = require('../utils/ocpp');

/**
 * Send OCPP CALL message
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} action - OCPP action name
 * @param {Object} payload - Action payload
 * @param {string} messageId - Optional message ID (auto-generated if not provided)
 * @returns {string} Message ID used
 */
function sendCall(ws, action, payload = {}, messageId = null) {
  if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
    throw new Error('WebSocket is not open');
  }

  const msgId = messageId || createMessageId();
  const call = toOcppCall(action, payload, msgId);
  ws.send(JSON.stringify(call));
  
  return msgId;
}

/**
 * Send OCPP CALL_RESULT message
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} messageId - Original message ID
 * @param {Object} payload - Response payload
 */
function sendCallResult(ws, messageId, payload = {}) {
  if (!ws || ws.readyState !== 1) {
    throw new Error('WebSocket is not open');
  }

  const result = toOcppCallResult(messageId, payload);
  ws.send(JSON.stringify(result));
}

/**
 * Send OCPP CALL_ERROR message
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} messageId - Original message ID
 * @param {string} errorCode - Error code
 * @param {string} errorDescription - Error description
 * @param {Object} errorDetails - Optional error details
 */
function sendCallError(ws, messageId, errorCode = 'InternalError', errorDescription = '', errorDetails = {}) {
  if (!ws || ws.readyState !== 1) {
    throw new Error('WebSocket is not open');
  }

  const error = toOcppCallError(messageId, errorCode, errorDescription, errorDetails);
  ws.send(JSON.stringify(error));
}

/**
 * Check if WebSocket is open
 * @param {WebSocket} ws - WebSocket connection
 * @returns {boolean}
 */
function isWebSocketOpen(ws) {
  return ws && ws.readyState === 1; // WebSocket.OPEN = 1
}

module.exports = {
  sendCall,
  sendCallResult,
  sendCallError,
  isWebSocketOpen,
  createMessageId,
  MESSAGE_TYPE
};

