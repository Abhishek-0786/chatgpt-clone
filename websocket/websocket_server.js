/**
 * OCPP WebSocket Server
 * Main entry point for OCPP WebSocket communication
 * Refactored to separate protocol, business logic, and storage concerns
 */

const connectionManager = require('./protocol/connection_manager');
const messageParser = require('./protocol/message_parser');
const messageSender = require('./protocol/message_sender');
const chargerManager = require('./business_logic/charger_manager');
const sessionManager = require('./business_logic/session_manager');
const messageStorage = require('./utils/message_storage');
const rabbitmqProducer = require('./rabbitmq/producer');
const { QUEUES } = require('./rabbitmq/queues');
const apiClient = require('./utils/api_client');
const { MESSAGE_TYPE } = require('./utils/ocpp');
const listManager = require('../backend/libs/redis/listManager');
const updater = require('../backend/libs/redis/updater');

// Socket.io instance (will be set by server.js)
let ioInstance = null;

/**
 * Set Socket.io instance for notifications
 * @param {Object} io - Socket.io instance
 */
function setSocketIO(io) {
  ioInstance = io;
}

/**
 * Handle incoming OCPP message
 * @param {string} deviceId - Device identifier
 * @param {WebSocket} ws - WebSocket connection
 * @param {string|Buffer} rawData - Raw message data
 */
async function handleIncomingMessage(deviceId, ws, rawData) {
  console.log(`🔵 [handleIncomingMessage] ENTRY - deviceId: ${deviceId}, data length: ${rawData.length || rawData.toString().length}`);
  try {
    // Parse message FIRST (before any blocking checks) so we can log it
    console.log(`🔵 [handleIncomingMessage] About to parse message...`);
    const parseResult = messageParser.parseMessage(rawData);
    console.log(`🔵 [handleIncomingMessage] Parse result success: ${parseResult.success}`);
    if (!parseResult.success) {
      console.error(`❌ Parse error for ${deviceId}:`, parseResult.error);
      return;
    }

    const { parsed, rawStr } = parseResult;
    console.log(`🔵 [handleIncomingMessage] Message parsed successfully, type: ${parsed.kind || 'unknown'}`);

    // LOG MESSAGE IMMEDIATELY (even if charger is not ready) - NON-BLOCKING
    // This ensures logs are always published to RabbitMQ, independent of backend/charger state
    console.log(`🔵 [handleIncomingMessage] About to check message type for logging...`);
    
    // Fire and forget logging - don't block message processing
    const logMessage = async () => {
      try {
        if (messageParser.isCall(parsed)) {
          const action = messageParser.getAction(parsed);
          console.log(`🔵 [handleIncomingMessage] Is CALL, action: ${action}`);
          
          // Log incoming message (if it's in allowed types)
          if (action !== 'Heartbeat') { // Heartbeat is excluded from logs
            console.log(`📝 [LOG] ========== LOGGING ${action} ==========`);
            console.log(`📝 [LOG] Publishing log BEFORE charger validation: ${action} from ${deviceId}`);
            console.log(`📝 [LOG] Payload:`, JSON.stringify(parsed.payload || {}));
            try {
              // Don't await - let it run in background
              storeLog(deviceId, action, parsed.payload || {}, 'Incoming', rawStr, parsed.id).catch(err => {
                console.error(`❌ [LOG] Background storeLog error:`, err.message);
                console.error(`❌ [LOG] Error stack:`, err.stack);
              });
            } catch (logError) {
              console.error(`❌ [LOG] Error in storeLog:`, logError.message);
              console.error(`❌ [LOG] Error stack:`, logError.stack);
            }
          } else {
            console.log(`⏭️ [LOG] Skipping Heartbeat (excluded from logs)`);
          }
        } else if (messageParser.isResponse(parsed)) {
          console.log(`🔵 [handleIncomingMessage] Is RESPONSE`);
          // Log response messages
          const responseType = parsed.kind === 'CALL_RESULT' ? 'Response' : 'Error';
          try {
            // Don't await - let it run in background
            storeLog(deviceId, responseType, parsed.payload || parsed.error || {}, 'Incoming', rawStr, parsed.id).catch(err => {
              console.error(`❌ [LOG] Background storeLog error:`, err.message);
            });
          } catch (logError) {
            console.error(`❌ [LOG] Error in storeLog for response:`, logError.message);
          }
        } else {
          console.log(`⚠️ [handleIncomingMessage] Unknown message type: ${parsed.kind || 'undefined'}`);
        }
      } catch (logError) {
        console.error(`❌ [LOG] Critical error in logging section:`, logError.message);
      }
    };
    
    // Start logging in background (non-blocking)
    logMessage();

    // NOW ensure charger exists (for business logic, but logging already happened)
    const charger = await chargerManager.ensureCharger(deviceId);
    if (!charger || !charger.id) {
      console.warn(`⚠️ Charger not ready for ${deviceId} - logging already done, but business logic skipped`);
      // Still send basic responses even if charger not ready
      if (messageParser.isCall(parsed)) {
        const action = messageParser.getAction(parsed);
        if (action === 'BootNotification') {
          const payload = { status: 'Accepted', currentTime: new Date().toISOString(), interval: 30 };
          messageSender.sendCallResult(ws, parsed.id, payload);
        } else if (action === 'Heartbeat') {
          const payload = { currentTime: new Date().toISOString() };
          messageSender.sendCallResult(ws, parsed.id, payload);
        } else {
          // Send empty response for other actions
          messageSender.sendCallResult(ws, parsed.id, {});
        }
      }
      return;
    }

    // Handle CALL_RESULT or CALL_ERROR (responses to our calls)
    if (messageParser.isResponse(parsed)) {
      connectionManager.resolvePendingRequest(parsed.id, parsed.payload);
      if (parsed.kind === 'CALL_ERROR') {
        connectionManager.rejectPendingRequest(parsed.id, parsed.error);
      }
      
      // Response messages are already logged in handleIncomingMessage above
      // No need to log again via storeMessageWithFallback (would cause duplicates)
      
      return;
    }

    // Handle CALL (requests from charger)
    if (messageParser.isCall(parsed)) {
      const action = messageParser.getAction(parsed);
      
      // Handle Heartbeat (quick response, no logging - excluded from logs)
      if (action === 'Heartbeat') {
        const payload = { currentTime: new Date().toISOString() };
        messageSender.sendCallResult(ws, parsed.id, payload);
        await chargerManager.updateLastSeen(deviceId);
        console.log(`💓 Replied Heartbeat for ${deviceId}`);
        // Update heartbeat in Redis
        updater(deviceId, { heartbeat: true }).catch(err => {
          console.error(`❌ [Updater] Error updating heartbeat for ${deviceId}:`, err.message);
        });
        // Heartbeat is not logged (excluded from ALLOWED_LOG_TYPES)
        return;
      }

      // Prepare message for storage
      const allowedActions = ['BootNotification', 'StatusNotification', 'ChangeConfiguration', 
                            'StartTransaction', 'StopTransaction', 'MeterValues'];
      let messageForStorage = null;
      
      if (allowedActions.includes(action)) {
        messageForStorage = {
          ocpp: true,
          type: MESSAGE_TYPE.CALL,
          id: parsed.id,
          action: action,
          payload: parsed.payload,
          direction: 'Incoming',
          raw: [MESSAGE_TYPE.CALL, parsed.id, action, parsed.payload || {}]
        };
      }

      // Handle specific actions
      await handleOcppAction(deviceId, ws, charger, action, parsed, messageForStorage, rawStr);
      
      // Update charger metadata
      await chargerManager.updateChargerMetadataFromOcpp(deviceId, charger, parsed);
    }

  } catch (error) {
    console.error(`❌ Error handling incoming message for ${deviceId}:`, error.message);
  }
}

/**
 * Handle specific OCPP actions
 * @param {string} deviceId - Device identifier
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} charger - Charger instance
 * @param {string} action - OCPP action name
 * @param {Object} parsed - Parsed message
 * @param {Object} messageForStorage - Message object for storage
 * @param {string} rawStr - Raw message string
 */
async function handleOcppAction(deviceId, ws, charger, action, parsed, messageForStorage, rawStr) {
  try {
    switch (action) {
      case 'BootNotification':
        await handleBootNotification(deviceId, ws, charger, parsed, messageForStorage, rawStr);
        break;
      
      case 'StartTransaction':
        // NOTE: Incoming StartTransaction is already logged via storeLog() in handleIncomingMessage
        // Don't call storeMessageWithFallback here to avoid duplicates
        // Only handle the response
        await handleStartTransaction(deviceId, ws, charger, parsed, null, rawStr);
        break;
      
      case 'StopTransaction':
        // NOTE: Incoming StopTransaction is already logged via storeLog() in handleIncomingMessage
        // Don't call storeMessageWithFallback here to avoid duplicates
        // Only handle the response
        await handleStopTransaction(deviceId, ws, charger, parsed, null, rawStr);
        break;
      
      case 'StatusNotification':
        await handleStatusNotification(deviceId, ws, charger, parsed, messageForStorage, rawStr);
        break;
      
      case 'MeterValues':
        await handleMeterValues(deviceId, ws, charger, parsed, messageForStorage, rawStr);
        break;
      
      default:
        // Send empty response for unknown actions
        messageSender.sendCallResult(ws, parsed.id, {});
        if (messageForStorage) {
          await storeMessageWithFallback(deviceId, charger.id, messageForStorage, rawStr);
        }
    }
  } catch (error) {
    console.error(`❌ Error handling ${action} for ${deviceId}:`, error.message);
  }
}

/**
 * Handle BootNotification
 */
async function handleBootNotification(deviceId, ws, charger, parsed, messageForStorage, rawStr) {
  const payload = {
    status: 'Accepted',
    currentTime: new Date().toISOString(),
    interval: 30
  };
  messageSender.sendCallResult(ws, parsed.id, payload);
  console.log(`✅ Replied BootNotification for ${deviceId}`);

  // Store messages (incoming already logged in handleIncomingMessage, but log outgoing response)
  const responseRawStr = JSON.stringify([MESSAGE_TYPE.CALL_RESULT, parsed.id, payload]);
  // Log outgoing response (non-blocking to avoid slowing down message processing)
  storeLog(deviceId, 'Response', payload, 'Outgoing', responseRawStr, parsed.id).catch(err => {
    console.error(`❌ [LOG] Error logging outgoing response:`, err.message);
  });
  
  // Note: Incoming message already logged in handleIncomingMessage
  // storeMessageWithFallback is no longer needed for logging (would cause duplicates)
  // It's kept only for OCPP message queue publishing if needed

  // Auto-send ChangeConfiguration after BootNotification
  setTimeout(async () => {
    try {
      const currentCharger = await chargerManager.getCharger(deviceId);
      if (currentCharger && currentCharger.id) {
        await sendOcppCall(deviceId, 'ChangeConfiguration', {
          key: 'MeterValueSampleInterval',
          value: '30'
        }, 10000);
        console.log(`✅ Auto-sent ChangeConfiguration to ${deviceId}: MeterValueSampleInterval = 30`);
      }
    } catch (configError) {
      console.error(`❌ Failed to auto-send ChangeConfiguration to ${deviceId}:`, configError.message);
    }
  }, 500);
}

/**
 * Handle StartTransaction
 */
async function handleStartTransaction(deviceId, ws, charger, parsed, messageForStorage, rawStr) {
  const connectorId = parsed.payload?.connectorId || 0;
  const idTag = parsed.payload?.idTag || '';
  const transactionId = Date.now() % 10000000;

  const payload = {
    idTagInfo: {
      status: 'Accepted',
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    },
    transactionId: transactionId
  };
  
  messageSender.sendCallResult(ws, parsed.id, payload);
  console.log(`✅ Replied StartTransaction for ${deviceId} with transactionId: ${transactionId}`);

  // Store messages
  // NOTE: StartTransaction is already logged in handleIncomingMessage via storeLog()
  // We only need to store the response, not the incoming message again (would cause duplicates)
  // The incoming StartTransaction is already in ocpp.logs queue and will be stored by backend consumer
  
  // Log outgoing response (non-blocking to avoid slowing down message processing)
  const responseRawStr = JSON.stringify([MESSAGE_TYPE.CALL_RESULT, parsed.id, payload]);
  storeLog(deviceId, 'Response', payload, 'Outgoing', responseRawStr, parsed.id).catch(err => {
    console.error(`❌ [LOG] Error logging outgoing response:`, err.message);
  });
  
  // Store outgoing response to ocpp_messages queue for processing (if needed)
  // Note: This is separate from logging - it's for business logic processing
  await storeMessageWithFallback(deviceId, charger.id, {
    ocpp: true,
    type: MESSAGE_TYPE.CALL_RESULT,
    id: parsed.id,
    payload: payload,
    action: 'Response',
    direction: 'Outgoing',
    raw: [MESSAGE_TYPE.CALL_RESULT, parsed.id, payload]
  }, responseRawStr);
}

/**
 * Handle StopTransaction
 */
async function handleStopTransaction(deviceId, ws, charger, parsed, messageForStorage, rawStr) {
  const payload = {
    idTagInfo: {
      status: 'Accepted'
    }
  };
  
  messageSender.sendCallResult(ws, parsed.id, payload);
  console.log(`✅ Replied StopTransaction for ${deviceId}`);

  // Update Redis status to "Available" when charging stops
  // This ensures the UI updates immediately even if StatusNotification is delayed
  try {
    await updater(deviceId, { status: 'Available' });
    console.log(`✅ [StopTransaction] Updated Redis status to Available for ${deviceId}`);
  } catch (redisErr) {
    console.error(`❌ [Redis] Error updating status in StopTransaction for ${deviceId}:`, redisErr.message);
  }

  // Update charger status in database
  if (charger && charger.id) {
    try {
      await chargerManager.updateChargerStatus(deviceId, 'Available');
      console.log(`✅ [StopTransaction] Updated charger ${deviceId} status to Available in database`);
    } catch (dbErr) {
      console.error(`❌ [DB] Error updating charger status in StopTransaction for ${deviceId}:`, dbErr.message);
    }
  }

  // Store messages
  // NOTE: StopTransaction is already logged in handleIncomingMessage via storeLog()
  // We only need to store the response, not the incoming message again (would cause duplicates)
  // The incoming StopTransaction is already in ocpp.logs queue and will be stored by backend consumer
  
  // Log outgoing response (non-blocking to avoid slowing down message processing)
  const responseRawStr = JSON.stringify([MESSAGE_TYPE.CALL_RESULT, parsed.id, payload]);
  storeLog(deviceId, 'Response', payload, 'Outgoing', responseRawStr, parsed.id).catch(err => {
    console.error(`❌ [LOG] Error logging outgoing response:`, err.message);
  });
  
  // Store outgoing response to ocpp_messages queue for processing (if needed)
  // Note: This is separate from logging - it's for business logic processing
  await storeMessageWithFallback(deviceId, charger.id, {
    ocpp: true,
    type: MESSAGE_TYPE.CALL_RESULT,
    id: parsed.id,
    payload: payload,
    action: 'Response',
    direction: 'Outgoing',
    raw: [MESSAGE_TYPE.CALL_RESULT, parsed.id, payload]
  }, responseRawStr);
}

/**
 * Handle StatusNotification
 */
async function handleStatusNotification(deviceId, ws, charger, parsed, messageForStorage, rawStr) {
  const connectorId = parsed.payload?.connectorId ?? 0;
  const payload = parsed.payload || {};
  
  messageSender.sendCallResult(ws, parsed.id, {});
  console.log(`✅ Replied StatusNotification for ${deviceId}`);

  // Store messages (incoming already logged in handleIncomingMessage, but log outgoing response)
  const responsePayload = {};
  const responseRawStr = JSON.stringify([MESSAGE_TYPE.CALL_RESULT, parsed.id, {}]);
  // Log outgoing response (non-blocking to avoid slowing down message processing)
  storeLog(deviceId, 'Response', responsePayload, 'Outgoing', responseRawStr, parsed.id).catch(err => {
    console.error(`❌ [LOG] Error logging outgoing response:`, err.message);
  });
  
  // Update Redis with listManager and updater
  try {
    // Push to events list and trim
    await listManager.push(`events:${deviceId}`, payload);
    await listManager.trim(`events:${deviceId}`, 100);
    
    // Update status (include errorCode if status indicates error like Faulted, Unavailable)
    const updateData = { status: payload.status };
    if (payload.status === 'Faulted' || payload.status === 'Unavailable') {
      updateData.errorCode = payload.errorCode || payload.status;
    }
    await updater(deviceId, updateData);
  } catch (err) {
    console.error(`❌ [Redis] Error updating StatusNotification for ${deviceId}:`, err.message);
  }
  
  // Note: Incoming message already logged in handleIncomingMessage
  // storeMessageWithFallback is no longer needed for logging (would cause duplicates)
  // It's kept only for OCPP message queue publishing if needed
}

/**
 * Handle MeterValues
 */
async function handleMeterValues(deviceId, ws, charger, parsed, messageForStorage, rawStr) {
  const payload = parsed.payload || {};
  
  messageSender.sendCallResult(ws, parsed.id, {});
  console.log(`✅ Replied MeterValues for ${deviceId}`);

  // Store messages
  await storeMessageWithFallback(deviceId, charger.id, messageForStorage, rawStr);
  await storeMessageWithFallback(deviceId, charger.id, {
    ocpp: true,
    type: MESSAGE_TYPE.CALL_RESULT,
    id: parsed.id,
    payload: {},
    action: 'Response',
    direction: 'Outgoing',
    raw: [MESSAGE_TYPE.CALL_RESULT, parsed.id, {}]
  }, JSON.stringify([MESSAGE_TYPE.CALL_RESULT, parsed.id, {}]));
  
  // Update Redis with listManager and updater
  try {
    // Push to OCPP list and trim
    await listManager.push(`ocpp:list:${deviceId}`, payload);
    await listManager.trim(`ocpp:list:${deviceId}`, 200);
    
    // Extract latest meter value (kWh)
    let latestMeterValue = null;
    if (payload.meterValue && Array.isArray(payload.meterValue) && payload.meterValue.length > 0) {
      const sampledValues = payload.meterValue[0].sampledValue;
      if (sampledValues && Array.isArray(sampledValues)) {
        const energySample = sampledValues.find(sample => 
          sample.measurand === 'Energy.Active.Import.Register' || 
          sample.measurand === 'energy' ||
          sample.measurand === 'Energy'
        );
        if (energySample && energySample.value) {
          // Convert Wh to kWh
          latestMeterValue = parseFloat(energySample.value) / 1000;
        }
      }
    }
    
    // Update meter if we have a value
    if (latestMeterValue !== null) {
      await updater(deviceId, { meter: latestMeterValue });
    }
  } catch (err) {
    console.error(`❌ [Redis] Error updating MeterValues for ${deviceId}:`, err.message);
  }
}

/**
 * Allowed OCPP message types for logging
 * Only meaningful OCPP events are logged (Heartbeat is excluded)
 */
const ALLOWED_LOG_TYPES = [
  'BootNotification',
  'StatusNotification',
  'RemoteStartTransaction',
  'RemoteStopTransaction',
  'ChangeConfiguration',
  'StartTransaction',
  'StopTransaction',
  'MeterValues',
  'Response'
];

/**
 * Store log to RabbitMQ queue or REST API fallback
 * This is the microservice-based logging flow
 */
async function storeLog(deviceId, messageType, payload, direction, rawMessage, messageId = null) {
  try {
    // Only log meaningful OCPP events
    if (!ALLOWED_LOG_TYPES.includes(messageType)) {
      console.log(`⏭️ [storeLog] Skipping log for ${messageType} (not in allowed list)`);
      console.log(`⏭️ [storeLog] Allowed types:`, ALLOWED_LOG_TYPES.join(', '));
      return; // Skip irrelevant messages
    }

    console.log(`📝 [storeLog] ========== START ==========`);
    console.log(`📝 [storeLog] Called: ${messageType} from ${deviceId} (direction: ${direction})`);
    console.log(`📝 [storeLog] Payload:`, JSON.stringify(payload).substring(0, 100));

    const logData = {
      deviceId,
      messageType,
      payload: payload || {},
      direction: direction || 'Incoming',
      rawMessage: rawMessage || '',
      messageId: messageId || null,
      timestamp: new Date()
    };

    // ALWAYS try RabbitMQ queue first (even if backend is offline)
    console.log(`🔄 [storeLog] Attempting to publish to queue: ${QUEUES.OCPP_LOGS}`);
    console.log(`🔄 [storeLog] Queue constant value:`, QUEUES.OCPP_LOGS);
    console.log(`🔄 [storeLog] Log data:`, JSON.stringify(logData).substring(0, 200));
    
    // Check RabbitMQ connection status
    const { isConnected } = require('./rabbitmq/connection');
    const rabbitmqConnected = isConnected();
    console.log(`🔄 [storeLog] RabbitMQ connected: ${rabbitmqConnected}`);
    
    if (!rabbitmqConnected) {
      console.warn(`⚠️ [storeLog] RabbitMQ not connected! Will try REST API fallback...`);
    }
    
    const published = await rabbitmqProducer.publishQueue(QUEUES.OCPP_LOGS, logData);
    console.log(`🔄 [storeLog] publishQueue returned: ${published}`);

    if (published) {
      console.log(`✅ [storeLog] Successfully published log to RabbitMQ: ${messageType} from ${deviceId}`);
      console.log(`📝 [storeLog] ========== SUCCESS ==========`);
    } else {
      console.warn(`⚠️ [storeLog] Failed to publish to RabbitMQ, trying REST API fallback...`);
      // Fallback to REST API if RabbitMQ is disabled or failed
      try {
        console.log(`📤 [storeLog] Fallback: Publishing log via REST API for ${messageType}`);
        const result = await apiClient.apiRequest('POST', '/api/logs/store', logData);
        if (result && result.success) {
          console.log(`✅ [storeLog] Successfully stored log via REST API fallback: ${messageType}`);
          console.log(`📝 [storeLog] ========== SUCCESS (REST) ==========`);
        } else {
          console.error(`❌ [storeLog] REST API fallback failed:`, result ? result.error : 'No result');
          console.log(`📝 [storeLog] ========== FAILED ==========`);
        }
      } catch (error) {
        console.error(`❌ [storeLog] Failed to store log via REST API fallback: ${error.message}`);
        console.error(`❌ [storeLog] Error stack:`, error.stack);
        console.log(`📝 [storeLog] ========== FAILED ==========`);
      }
    }
  } catch (error) {
    console.error(`❌ [storeLog] CRITICAL ERROR in storeLog function:`, error.message);
    console.error(`❌ [storeLog] Error stack:`, error.stack);
    console.log(`📝 [storeLog] ========== ERROR ==========`);
  }
}

/**
 * Store message with RabbitMQ fallback (for backward compatibility)
 * @deprecated Use storeLog() for new logging flow
 */
async function storeMessageWithFallback(deviceId, chargerId, message, rawStr) {
  if (!message) return;

  const messageType = message.action || 'Unknown';
  const direction = message.direction || 'Incoming';

  // NOTE: storeLog is now called directly in handleIncomingMessage and handler functions
  // This function is kept for backward compatibility but doesn't log to avoid duplicates
  // Only publish to OCPP messages queue for processing (not for logging)

  // Also publish to OCPP messages queue for processing (if needed)
  const published = await rabbitmqProducer.publishOCPPMessage({
    deviceId,
    chargerId,
    messageType: messageType,
    payload: message.payload || {},
    rawData: rawStr || '',
    timestamp: new Date(),
    parsedMessage: message
  }, 5);

  // Fallback to local storage if RabbitMQ not available or failed
  if (!published) {
    await messageStorage.enqueueMessage(deviceId, chargerId, message);
  }
}

/**
 * Send OCPP CALL and await response
 * @param {string} deviceId - Device identifier
 * @param {string} action - OCPP action name
 * @param {Object} payload - Action payload
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} Response payload
 */
async function sendOcppCall(deviceId, action, payload = {}, timeoutMs = 10000) {
  const ws = connectionManager.getConnection(deviceId);
  if (!ws || !messageSender.isWebSocketOpen(ws)) {
    throw new Error(`Charger ${deviceId} not connected`);
  }

  const messageId = messageSender.createMessageId();
  const charger = await chargerManager.getCharger(deviceId);
  
  // Store outgoing message
  if (charger && charger.id) {
    try {
      await messageStorage.enqueueMessage(deviceId, charger.id, {
        ocpp: true,
        type: MESSAGE_TYPE.CALL,
        id: messageId,
        action: action,
        payload: payload,
        direction: 'Outgoing',
        raw: [MESSAGE_TYPE.CALL, messageId, action, payload]
      });
    } catch (storeErr) {
      console.warn(`⚠️ Failed to store outgoing ${action}:`, storeErr.message);
    }
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      connectionManager.rejectPendingRequest(messageId, { errorCode: 'Timeout' });
      reject(new Error(`OCPP timeout for ${action}`));
    }, timeoutMs);

    connectionManager.registerPendingRequest(messageId, {
      deviceId,
      resolve: (response) => {
        clearTimeout(timeout);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      timeout
    });

    messageSender.sendCall(ws, action, payload, messageId);
  });
}

/**
 * Create WebSocket server
 * @param {number} port - Port to listen on
 * @returns {Object} Server object with wss and setSocketIO
 */
function createWebSocketServer(port = 9000) {
  const wss = connectionManager.createWebSocketServer(port);

  const env = process.env.NODE_ENV || 'development';
  const host = process.env.WEBSOCKET_HOST || (env === 'production' ? '13.232.204.219' : 'localhost');
  
  console.log(`🚀 WebSocket server started on port ${port}`);
  console.log(`📡 WebSocket URL: ws://${host}:${port}/ws/ocpp/16/{deviceId}`);

  wss.on('connection', async (ws, req) => {
    console.log('🔌 New WebSocket connection attempt');
    
    try {
      // Extract device ID from URL
      const url = new URL(req.url, `ws://${req.headers.host}`);
      const pathParts = url.pathname.split('/').filter(p => p);
      
      let deviceId = null;
      if (pathParts.length >= 4 && pathParts[1] === 'ocpp') {
        for (let i = pathParts.length - 1; i >= 0; i--) {
          if (pathParts[i] && pathParts[i] !== 'ocpp' && pathParts[i] !== 'ws') {
            deviceId = pathParts[i];
            break;
          }
        }
      }

      if (!deviceId) {
        console.warn('⚠️ No deviceId found in URL, closing connection');
        ws.close();
        return;
      }

      console.log(`✅ Device connected: ${deviceId}`);
      console.log(`🔵 [WS] WebSocket readyState at connection: ${ws.readyState} (1=OPEN, 0=CONNECTING, 2=CLOSING, 3=CLOSED)`);
      
      // CRITICAL: Set up message handler FIRST, before any async operations
      // This prevents messages from being lost if they arrive during setup
      console.log(`🔵 [WS] Setting up message handler IMMEDIATELY for ${deviceId}`);
      
      // Use a queue to process messages sequentially and prevent blocking
      let messageQueue = [];
      let processing = false;
      
      const processMessageQueue = async () => {
        if (processing || messageQueue.length === 0) return;
        processing = true;
        
        while (messageQueue.length > 0) {
          const { data, timestamp } = messageQueue.shift();
          const dataStr = data.toString();
          const messagePreview = dataStr.substring(0, 100);
          
          console.log(`📥 [WS] Processing message from queue (${messageQueue.length} remaining): ${messagePreview}`);
          
          try {
            await handleIncomingMessage(deviceId, ws, data);
            console.log(`✅ [WS] Message processed successfully`);
          } catch (error) {
            console.error(`❌ [WS] Error processing message:`, error.message);
            console.error(`❌ [WS] Error stack:`, error.stack);
          }
        }
        
        processing = false;
      };
      
      // Log ALL WebSocket events to debug - capture EVERY message immediately
      // ATTACH HANDLER FIRST before any async operations!
      ws.on('message', (data) => {
        const dataStr = data.toString();
        const timestamp = Date.now();
        
        // IMMEDIATE log of EVERY message (before queuing)
        console.log(`📥 [WS] ========== RAW MESSAGE RECEIVED ==========`);
        console.log(`📥 [WS] Device: ${deviceId}`);
        console.log(`📥 [WS] Full message: ${dataStr}`);
        console.log(`📥 [WS] Message length: ${dataStr.length}`);
        console.log(`📥 [WS] Timestamp: ${new Date(timestamp).toISOString()}`);
        
        // Quick log without blocking
        console.log(`📥 [WS] Message queued: ${dataStr.substring(0, 100)} (queue size: ${messageQueue.length})`);
        
        // Add to queue
        messageQueue.push({ data, timestamp });
        
        // Process queue (non-blocking)
        processMessageQueue().catch(err => {
          console.error(`❌ [WS] Error in processMessageQueue:`, err.message);
        });
      });
      
      // Ensure charger exists first (creates if doesn't exist)
      const charger = await chargerManager.ensureCharger(deviceId);
      if (!charger || !charger.id) {
        console.warn(`⚠️ Failed to ensure charger for ${deviceId}, continuing anyway...`);
      }
      
      // Register connection
      connectionManager.registerConnection(deviceId, ws);
      await chargerManager.updateChargerStatus(deviceId, 'online');
      await chargerManager.updateLastSeen(deviceId);
      
      console.log(`🔵 [WS] Connection setup complete for ${deviceId}, readyState: ${ws.readyState}`);
      
      // Also log WebSocket events
      ws.on('error', (error) => {
        console.error(`❌ [WS] WebSocket error for ${deviceId}:`, error.message);
        console.error(`❌ [WS] Error stack:`, error.stack);
      });
      
      ws.on('close', (code, reason) => {
        console.log(`🔌 [WS] WebSocket closed for ${deviceId} (code: ${code}, reason: ${reason ? reason.toString() : 'none'})`);
      });
      
      ws.on('open', () => {
        console.log(`✅ [WS] WebSocket opened for ${deviceId}`);
      });
      
      ws.on('ping', (data) => {
        console.log(`🏓 [WS] Ping received from ${deviceId}`);
      });
      
      ws.on('pong', (data) => {
        console.log(`🏓 [WS] Pong received from ${deviceId}`);
      });
      
      // Verify connection is actually ready
      console.log(`🔵 [WS] Message handler attached. WebSocket state: ${ws.readyState}`);
      console.log(`🔵 [WS] WebSocket URL: ${ws.url || 'N/A'}`);
      console.log(`🔵 [WS] WebSocket protocol: ${ws.protocol || 'N/A'}`);

      // Handle disconnection
      ws.on('close', async (code, reason) => {
        console.log(`🔌 Charger disconnected: ${deviceId} (code: ${code}, reason: ${reason || 'none'})`);
        
        await chargerManager.updateChargerStatus(deviceId, 'offline');
        await chargerManager.updateLastSeen(deviceId);
        
        // Stop active sessions
        await sessionManager.stopActiveSessionsOnDisconnect(deviceId, {
          onEvent: async (eventData) => {
            // Publish to RabbitMQ if enabled
            await rabbitmqProducer.publishCharging(eventData);
            await rabbitmqProducer.publishNotif({
              type: eventData.type,
              data: eventData,
              recipients: [eventData.customerId]
            });

            // Also notify via Socket.io (fallback)
            if (ioInstance) {
              ioInstance.to(`customer:${eventData.customerId}`).emit('notification', {
                type: eventData.type,
                data: eventData,
                timestamp: new Date()
              });
              ioInstance.to('cms:dashboard').emit('notification', {
                type: eventData.type,
                data: eventData,
                timestamp: new Date()
              });
            }
          }
        });

        connectionManager.unregisterConnection(deviceId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${deviceId}:`, error.message);
      });

    } catch (error) {
      console.error('❌ Error setting up WebSocket connection:', error.message);
      ws.close();
    }
  });

  return {
    wss,
    setSocketIO
  };
}

// Export functions for backward compatibility
function getConnectedChargers() {
  return connectionManager.getConnectedDevices();
}

function getChargerConnection(deviceId) {
  return connectionManager.getConnection(deviceId);
}

function getConnectionCount() {
  return connectionManager.getConnectionCount();
}

function sendCommand(deviceId, command) {
  const ws = connectionManager.getConnection(deviceId);
  if (!ws || !messageSender.isWebSocketOpen(ws)) {
    console.error(`❌ Charger ${deviceId} is not connected`);
    return false;
  }
  try {
    ws.send(JSON.stringify(command));
    console.log(`📤 Sent command to ${deviceId}:`, command);
    return true;
  } catch (error) {
    console.error(`❌ Error sending command to ${deviceId}:`, error.message);
    return false;
  }
}

module.exports = {
  createWebSocketServer,
  sendOcppCall,
  sendCommand,
  getConnectedChargers,
  getChargerConnection,
  getConnectionCount,
  setSocketIO,
  connections: connectionManager.connections // For backward compatibility
};

