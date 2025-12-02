function pseudoUuid() {
  // Lightweight unique id without external deps
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${Date.now().toString(16)}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

// OCPP 1.6 message types
const MESSAGE_TYPE = {
  CALL: 2,
  CALL_RESULT: 3,
  CALL_ERROR: 4
};

function createMessageId() {
  return pseudoUuid();
}

function toOcppCall(action, payload, messageId = createMessageId()) {
  return [MESSAGE_TYPE.CALL, messageId, action, payload || {}];
}

function toOcppCallResult(messageId, payload) {
  return [MESSAGE_TYPE.CALL_RESULT, messageId, payload || {}];
}

function toOcppCallError(messageId, errorCode, errorDescription, errorDetails) {
  return [
    MESSAGE_TYPE.CALL_ERROR,
    messageId,
    errorCode || 'InternalError',
    errorDescription || '',
    errorDetails || {}
  ];
}

function parseIncoming(raw) {
  // Returns a normalized object: { kind: 'CALL'|'CALL_RESULT'|'CALL_ERROR'|'JSON', data: ..., id?, action?, payload?, error? }
  try {
    const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(msg) && msg.length >= 3) {
      const [type, id] = msg;
      if (type === MESSAGE_TYPE.CALL && msg.length >= 4) {
        const action = msg[2];
        const payload = msg[3];
        return { kind: 'CALL', id, action, payload, data: msg };
      }
      if (type === MESSAGE_TYPE.CALL_RESULT && msg.length >= 3) {
        const payload = msg[2];
        return { kind: 'CALL_RESULT', id, payload, data: msg };
      }
      if (type === MESSAGE_TYPE.CALL_ERROR && msg.length >= 5) {
        const errorCode = msg[2];
        const errorDescription = msg[3];
        const errorDetails = msg[4];
        return { kind: 'CALL_ERROR', id, error: { errorCode, errorDescription, errorDetails }, data: msg };
      }
    }
    // Fallback to JSON message
    return { kind: 'JSON', data: msg };
  } catch (e) {
    return { kind: 'JSON', data: { raw, parseError: e.message } };
  }
}

module.exports = {
  MESSAGE_TYPE,
  createMessageId,
  toOcppCall,
  toOcppCallResult,
  toOcppCallError,
  parseIncoming
};


