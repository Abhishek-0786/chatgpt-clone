/**
 * Charging Commands Consumer
 * Consumes remote start/stop commands from RabbitMQ and executes them via WebSocket
 */

const BaseConsumer = require('../rabbitmq/consumer');
const { ROUTING_KEYS } = require('../rabbitmq/queues');
const { EXCHANGE_NAME } = require('../rabbitmq/queues');
const connectionManager = require('../protocol/connection_manager');
const messageSender = require('../protocol/message_sender');
const chargerManager = require('../business_logic/charger_manager');
const rabbitmqProducer = require('../rabbitmq/producer');

// Import storeLog function from websocket_server
// We'll need to access it for logging RemoteStartTransaction
let storeLog = null;
try {
  // Try to get storeLog from websocket_server module
  const websocketServer = require('../websocket_server');
  // storeLog is not exported, so we'll create our own logging function
} catch (err) {
  console.warn('⚠️ Could not import storeLog, will use direct queue publishing');
}

class ChargingCommandsConsumer extends BaseConsumer {
  constructor() {
    // Use CHARGING_COMMANDS queue with routing keys for remote start/stop
    // This queue is already bound to exchange, we just need to bind additional routing keys
    super('charging_commands', {
      prefetch: 1, // Process one command at a time per device
      routingKeys: [
        ROUTING_KEYS.CHARGING_REMOTE_START,
        ROUTING_KEYS.CHARGING_REMOTE_STOP
      ]
    });
  }

  async processMessage(content, msg) {
    try {
      const routingKey = msg.fields.routingKey;
      
      console.log(`📥 [Queue] ========== RECEIVED CHARGING COMMAND ==========`);
      console.log(`📥 [Queue] Routing Key: ${routingKey}`);
      console.log(`📥 [Queue] Content:`, JSON.stringify(content).substring(0, 300));
      
      // Extract data - handle both direct properties and nested payload
      const sessionId = content.sessionId;
      const deviceId = content.deviceId;
      const connectorId = content.connectorId || (content.payload && content.payload.connectorId);
      const customerId = content.customerId;
      const idTag = content.idTag || (content.payload && content.payload.idTag);
      const transactionId = content.transactionId || (content.payload && content.payload.transactionId);

      console.log(`📥 [Queue] Extracted: sessionId=${sessionId}, deviceId=${deviceId}, connectorId=${connectorId}, customerId=${customerId}`);

      if (routingKey === ROUTING_KEYS.CHARGING_REMOTE_START) {
        return await this.handleRemoteStart(sessionId, deviceId, connectorId, customerId, idTag, transactionId);
      } else if (routingKey === ROUTING_KEYS.CHARGING_REMOTE_STOP) {
        return await this.handleRemoteStop(sessionId, deviceId, connectorId, transactionId);
      } else {
        console.warn(`⚠️ [Queue] Unknown routing key: ${routingKey}`);
        return true; // Acknowledge to prevent retries
      }
    } catch (error) {
      console.error(`❌ [Queue] Error processing charging command:`, error.message);
      console.error(`❌ [Queue] Error stack:`, error.stack);
      throw error; // Re-throw to trigger retry logic
    }
  }

  async handleRemoteStart(sessionId, deviceId, connectorId, customerId, idTag, transactionId) {
    try {
      console.log(`🚀 [Queue] ========== HANDLING REMOTE START ==========`);
      console.log(`🚀 [Queue] Session: ${sessionId}`);
      console.log(`🚀 [Queue] Device: ${deviceId}`);
      console.log(`🚀 [Queue] Connector: ${connectorId}`);
      console.log(`🚀 [Queue] Customer: ${customerId}`);
      console.log(`🚀 [Queue] IdTag: ${idTag}`);

      // Check if charger is connected
      const ws = connectionManager.getConnection(deviceId);
      if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
        console.error(`❌ [Queue] Charger ${deviceId} not connected`);
        
        // Publish rejection response
        await this.publishResponse(sessionId, deviceId, connectorId, 'Rejected', {
          errorCode: 'ConnectionError',
          errorDescription: `Charger ${deviceId} is not connected`
        });
        return true; // Acknowledge - we've handled it
      }

      // Send RemoteStartTransaction via WebSocket
      const payload = {
        idTag: idTag || `CUSTOMER_${customerId}`,
        connectorId: parseInt(connectorId) || 0
      };

      // Prepare a shared messageId so logs and websocket call stay aligned
      const messageId = messageSender.createMessageId();

      // Log outgoing RemoteStartTransaction once (responses are logged centrally)
      await this.logRemoteStartTransaction(deviceId, payload, 'Outgoing', { messageId });

      console.log(`📤 [Queue] Sending RemoteStartTransaction to ${deviceId}:`, payload);

      // Use promise-based approach to wait for response
      const response = await this.sendOcppCallAndWait(deviceId, 'RemoteStartTransaction', payload, 60000, messageId);

      console.log(`📥 [Queue] Received RemoteStartTransaction response from ${deviceId}:`, JSON.stringify(response, null, 2));
      console.log(`📥 [Queue] Response type: ${typeof response}, isArray: ${Array.isArray(response)}`);
      // Response logging handled globally to avoid duplicates

      // Extract status from response (OCPP RemoteStartTransaction response format: { status: "Accepted" | "Rejected" })
      let status = 'Rejected';
      
      // Handle array responses (OCPP format: [CALL_RESULT, messageId, payload])
      if (Array.isArray(response) && response.length >= 3) {
        const payload = response[2];
        if (payload && typeof payload === 'object') {
          if (payload.status) {
            status = payload.status;
          } else if (payload.idTagInfo && payload.idTagInfo.status) {
            status = payload.idTagInfo.status === 'Accepted' ? 'Accepted' : 'Rejected';
          }
        }
      } else if (response && typeof response === 'object') {
        // OCPP response has status field directly
        if (response.status) {
          status = response.status; // 'Accepted' or 'Rejected'
        } else if (response.idTagInfo && response.idTagInfo.status) {
          // Fallback: check idTagInfo.status (some chargers might use this)
          status = response.idTagInfo.status === 'Accepted' ? 'Accepted' : 'Rejected';
        }
      } else if (response === 'Accepted' || response === 'Rejected') {
        // Direct string response
        status = response;
      }

      console.log(`📊 [Queue] Extracted status from response: ${status}`);
      console.log(`📊 [Queue] Full response object keys: ${response && typeof response === 'object' ? Object.keys(response).join(', ') : 'N/A'}`);

      // Publish response to queue
      await this.publishResponse(sessionId, deviceId, connectorId, status, {
        transactionId: (response && response.transactionId) || transactionId,
        errorCode: (response && response.errorCode) || (status === 'Rejected' ? 'UnknownError' : undefined),
        errorDescription: (response && response.errorDescription) || (status === 'Rejected' ? 'Charger rejected the request' : undefined)
      });

      return true; // Acknowledge message
    } catch (error) {
      console.error(`❌ [Queue] Error in handleRemoteStart:`, error.message);
      
      // Publish rejection response (e.g., timeout, charger offline)
      await this.publishResponse(sessionId, deviceId, connectorId, 'Rejected', {
        errorCode: 'InternalError',
        errorDescription: error.message
      }).catch(err => {
        console.error(`❌ [Queue] Failed to publish error response:`, err.message);
      });

      // Acknowledge the message to prevent duplicate retries/refunds
      // Errors are already communicated via response + logs
      return true;
    }
  }

  async handleRemoteStop(sessionId, deviceId, connectorId, transactionId) {
    try {
      console.log(`🛑 [Queue] Executing RemoteStopTransaction for session ${sessionId}, device ${deviceId}, transaction ${transactionId}`);

      // Check if charger is connected
      const ws = connectionManager.getConnection(deviceId);
      if (!ws || ws.readyState !== 1) {
        console.error(`❌ [Queue] Charger ${deviceId} not connected`);
        
        // Publish rejection response
        await this.publishStopResponse(sessionId, deviceId, 'Rejected', {
          errorCode: 'ConnectionError',
          errorDescription: `Charger ${deviceId} is not connected`
        });
        return true; // Acknowledge - we've handled it
      }

      // Send RemoteStopTransaction via WebSocket
      // Validate and parse transactionId - it should be a valid number from the CMS endpoint
      let actualTransactionId = null;
      if (typeof transactionId === 'number') {
        actualTransactionId = transactionId;
      } else if (typeof transactionId === 'string') {
        const parsed = parseInt(transactionId);
        if (!isNaN(parsed) && parsed > 0) {
          actualTransactionId = parsed;
        }
      }
      
      if (!actualTransactionId || actualTransactionId <= 0) {
        console.error(`❌ [Queue] Invalid transactionId received: ${transactionId} (type: ${typeof transactionId})`);
        console.error(`❌ [Queue] The CMS endpoint should resolve the actual OCPP transactionId before sending to queue`);
        await this.publishStopResponse(sessionId, deviceId, 'Rejected', {
          errorCode: 'InvalidTransactionId',
          errorDescription: `Invalid or missing transactionId: ${transactionId}. The backend should resolve the actual OCPP transactionId before sending to queue.`
        });
        return true; // Acknowledge - we've handled it
      }
      
      console.log(`✅ [Queue] Using transactionId: ${actualTransactionId} for RemoteStopTransaction`);
      
      const payload = {
        transactionId: actualTransactionId
      };

      // Prepare messageId for consistent logging + websocket call
      const messageId = messageSender.createMessageId();

      // Log outgoing command once
      await this.logRemoteStopTransaction(deviceId, payload, 'Outgoing', { messageId });

      console.log(`📤 [Queue] Sending RemoteStopTransaction to ${deviceId}:`, payload);

      // Use promise-based approach to wait for response
      const response = await this.sendOcppCallAndWait(deviceId, 'RemoteStopTransaction', payload, 60000, messageId);

      console.log(`📥 [Queue] Received RemoteStopTransaction response from ${deviceId}:`, response);
      // Response logging handled globally

      // Extract status from response (OCPP responses have status field)
      let status = 'Rejected';
      if (response && typeof response === 'object') {
        status = response.status || (response.status === 'Accepted' ? 'Accepted' : 'Rejected');
      } else if (response === 'Accepted') {
        status = 'Accepted';
      }

      // Publish response to queue
      await this.publishStopResponse(sessionId, deviceId, status, {
        errorCode: (response && response.errorCode) || (status === 'Rejected' ? 'UnknownError' : undefined),
        errorDescription: (response && response.errorDescription) || (status === 'Rejected' ? 'Charger rejected the request' : undefined)
      });

      return true; // Acknowledge message
    } catch (error) {
      console.error(`❌ [Queue] Error in handleRemoteStop:`, error.message);
      
      // Publish rejection response
      await this.publishStopResponse(sessionId, deviceId, 'Rejected', {
        errorCode: 'InternalError',
        errorDescription: error.message
      }).catch(err => {
        console.error(`❌ [Queue] Failed to publish error response:`, err.message);
      });

      // Ack to avoid duplicate stop commands/refunds (error already broadcast)
      return true;
    }
  }

  /**
   * Log RemoteStartTransaction to ocpp.logs queue
   */
  async logRemoteStartTransaction(deviceId, payload, direction, options = {}) {
    try {
      const { QUEUES } = require('../rabbitmq/queues');
      const { MESSAGE_TYPE } = require('../utils/ocpp');
      const { originalPayload = null, messageId = null } = options;
      const effectiveMessageId = messageId || messageSender.createMessageId();
      
      // Determine message type based on direction
      const messageType = direction === 'Outgoing' ? 'RemoteStartTransaction' : 'Response';
      
      // Prepare log data
      let logPayload = payload || {};
      let rawMessage = '';
      
      if (direction === 'Outgoing') {
        // Outgoing: [CALL, messageId, action, payload]
        rawMessage = JSON.stringify([MESSAGE_TYPE.CALL, effectiveMessageId, 'RemoteStartTransaction', payload]);
      } else {
        // Incoming response: [CALL_RESULT, messageId, payload]
        rawMessage = JSON.stringify([MESSAGE_TYPE.CALL_RESULT, effectiveMessageId, payload]);
        
        // If this is a response, structure the payload properly
        if (originalPayload) {
          logPayload = {
            status: payload.status || 'Rejected',
            transactionId: payload.transactionId,
            errorCode: payload.errorCode,
            errorDescription: payload.errorDescription,
            originalRequest: originalPayload
          };
        }
      }
      
      const logData = {
        deviceId,
        messageType,
        payload: logPayload,
        direction: direction,
        rawMessage: rawMessage,
        messageId: effectiveMessageId,
        timestamp: new Date()
      };

      console.log(`📝 [Queue] Logging ${messageType} (${direction}) to ocpp.logs for ${deviceId}`);
      console.log(`📝 [Queue] Log payload:`, JSON.stringify(logPayload).substring(0, 200));
      
      const published = await rabbitmqProducer.publishQueue(QUEUES.OCPP_LOGS, logData);
      
      if (published) {
        console.log(`✅ [Queue] Logged ${messageType} (${direction}) to ocpp.logs for ${deviceId}`);
      } else {
        console.warn(`⚠️ [Queue] Failed to log ${messageType} (${direction}) to ocpp.logs for ${deviceId}`);
      }
    } catch (error) {
      console.error(`❌ [Queue] Error logging RemoteStartTransaction:`, error.message);
      console.error(`❌ [Queue] Error stack:`, error.stack);
      // Don't throw - logging failure shouldn't break the flow
    }
  }

  /**
   * Log RemoteStopTransaction to ocpp.logs queue
   */
  async logRemoteStopTransaction(deviceId, payload, direction, options = {}) {
    try {
      const { QUEUES } = require('../rabbitmq/queues');
      const { MESSAGE_TYPE } = require('../utils/ocpp');
      const { originalPayload = null, messageId = null } = options;
      const effectiveMessageId = messageId || messageSender.createMessageId();
      
      // Determine message type based on direction
      const messageType = direction === 'Outgoing' ? 'RemoteStopTransaction' : 'Response';
      
      // Prepare log data
      let logPayload = payload || {};
      let rawMessage = '';
      
      if (direction === 'Outgoing') {
        // Outgoing: [CALL, messageId, action, payload]
        rawMessage = JSON.stringify([MESSAGE_TYPE.CALL, effectiveMessageId, 'RemoteStopTransaction', payload]);
      } else {
        // Incoming response: [CALL_RESULT, messageId, payload]
        rawMessage = JSON.stringify([MESSAGE_TYPE.CALL_RESULT, effectiveMessageId, payload]);
        
        // If this is a response, structure the payload properly
        if (originalPayload) {
          logPayload = {
            status: payload.status || 'Rejected',
            errorCode: payload.errorCode,
            errorDescription: payload.errorDescription,
            originalRequest: originalPayload
          };
        }
      }
      
      const logData = {
        deviceId,
        messageType,
        payload: logPayload,
        direction: direction,
        rawMessage: rawMessage,
        messageId: effectiveMessageId,
        timestamp: new Date()
      };

      console.log(`📝 [Queue] Logging ${messageType} (${direction}) to ocpp.logs for ${deviceId}`);
      
      const published = await rabbitmqProducer.publishQueue(QUEUES.OCPP_LOGS, logData);
      
      if (published) {
        console.log(`✅ [Queue] Logged ${messageType} (${direction}) to ocpp.logs for ${deviceId}`);
      } else {
        console.warn(`⚠️ [Queue] Failed to log ${messageType} (${direction}) to ocpp.logs for ${deviceId}`);
      }
    } catch (error) {
      console.error(`❌ [Queue] Error logging RemoteStopTransaction:`, error.message);
      // Don't throw - logging failure shouldn't break the flow
    }
  }

  /**
   * Send OCPP call and wait for response
   */
  async sendOcppCallAndWait(deviceId, action, payload, timeoutMs = 10000, providedMessageId = null) {
    const ws = connectionManager.getConnection(deviceId);
    if (!ws || ws.readyState !== 1) {
      throw new Error(`Charger ${deviceId} not connected`);
    }

    const messageId = providedMessageId || messageSender.createMessageId();

    console.log(`🔌 [WebSocket] Sending ${action} to charger ${deviceId} with messageId ${messageId}`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        connectionManager.rejectPendingRequest(messageId, { errorCode: 'Timeout' });
        reject(new Error(`OCPP timeout for ${action}`));
      }, timeoutMs);

      connectionManager.registerPendingRequest(messageId, {
        deviceId,
        resolve: (response) => {
          clearTimeout(timeout);
          console.log(`✅ [WebSocket] Received ${action} response from ${deviceId}:`, response);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          console.error(`❌ [WebSocket] ${action} error from ${deviceId}:`, error);
          reject(error);
        },
        timeout
      });

      messageSender.sendCall(ws, action, payload, messageId);
      console.log(`📤 [WebSocket] ${action} sent to charger ${deviceId}`);
    });
  }

  /**
   * Publish remote start response to queue
   */
  async publishResponse(sessionId, deviceId, connectorId, status, additionalData = {}) {
    const responseData = {
      sessionId,
      deviceId,
      connectorId,
      status,
      timestamp: new Date(),
      ...additionalData
    };

    console.log(`📤 [Queue] Publishing remote start response:`, responseData);

    const published = await rabbitmqProducer.publishChargingEvent({
      type: ROUTING_KEYS.CHARGING_REMOTE_START_RESPONSE,
      sessionId,
      deviceId,
      connectorId,
      ...responseData
    });

    if (published) {
      console.log(`✅ [Queue] Published remote start response for session ${sessionId}`);
    } else {
      console.warn(`⚠️ [Queue] Failed to publish remote start response for session ${sessionId}`);
    }
  }

  /**
   * Publish remote stop response to queue
   */
  async publishStopResponse(sessionId, deviceId, status, additionalData = {}) {
    const responseData = {
      sessionId,
      deviceId,
      status,
      timestamp: new Date(),
      ...additionalData
    };

    console.log(`📤 [Queue] Publishing remote stop response:`, responseData);

    const published = await rabbitmqProducer.publishChargingEvent({
      type: ROUTING_KEYS.CHARGING_REMOTE_STOP_RESPONSE,
      sessionId,
      deviceId,
      ...responseData
    });

    if (published) {
      console.log(`✅ [Queue] Published remote stop response for session ${sessionId}`);
    } else {
      console.warn(`⚠️ [Queue] Failed to publish remote stop response for session ${sessionId}`);
    }
  }
}

let consumerInstance = null;

function getChargingCommandsConsumer() {
  if (!consumerInstance) {
    consumerInstance = new ChargingCommandsConsumer();
  }
  return consumerInstance;
}

async function startChargingCommandsConsumer() {
  try {
    const consumer = getChargingCommandsConsumer();
    await consumer.start();
    console.log('✅ Charging Commands Consumer started');
    return consumer;
  } catch (error) {
    console.error('❌ Failed to start Charging Commands Consumer:', error.message);
    throw error;
  }
}

async function stopChargingCommandsConsumer() {
  try {
    if (consumerInstance) {
      await consumerInstance.stop();
      consumerInstance = null;
      console.log('✅ Charging Commands Consumer stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping Charging Commands Consumer:', error.message);
  }
}

module.exports = {
  ChargingCommandsConsumer,
  getChargingCommandsConsumer,
  startChargingCommandsConsumer,
  stopChargingCommandsConsumer
};

