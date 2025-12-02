/**
 * OCPP Message Parser
 * Handles parsing of incoming OCPP messages
 * Protocol layer - no business logic
 */

const { parseIncoming, MESSAGE_TYPE } = require('../utils/ocpp');

/**
 * Parse incoming WebSocket message
 * @param {string|Buffer} rawData - Raw message data
 * @returns {Object} Parsed message object
 */
function parseMessage(rawData) {
  const rawStr = typeof rawData === 'string' ? rawData : rawData.toString();
  
  if (!rawStr || rawStr.trim() === '') {
    throw new Error('Empty message received');
  }

  try {
    const parsed = parseIncoming(rawStr);
    return {
      success: true,
      parsed,
      rawStr
    };
  } catch (parseError) {
    return {
      success: false,
      error: parseError.message,
      rawStr
    };
  }
}

/**
 * Check if message is a CALL_RESULT or CALL_ERROR (response to our CALL)
 */
function isResponse(parsed) {
  return parsed.kind === 'CALL_RESULT' || parsed.kind === 'CALL_ERROR';
}

/**
 * Check if message is a CALL (request from charger)
 */
function isCall(parsed) {
  return parsed.kind === 'CALL';
}

/**
 * Get action from parsed message
 */
function getAction(parsed) {
  return parsed.action || null;
}

module.exports = {
  parseMessage,
  isResponse,
  isCall,
  getAction,
  MESSAGE_TYPE
};

