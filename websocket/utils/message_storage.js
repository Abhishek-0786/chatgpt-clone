/**
 * Message Storage
 * Handles storing OCPP messages
 * TODO: Move this to MessageStorageMicroservice when implemented
 * 
 * Now uses REST API and RabbitMQ instead of direct database access
 */

const { createMessageId, MESSAGE_TYPE } = require('./ocpp');
const connectionManager = require('../protocol/connection_manager');
const apiClient = require('../utils/api_client');
const rabbitmqProducer = require('../rabbitmq/producer');

// In-memory duplicate check (short-term, 5 seconds)
const recentMessages = new Map(); // messageId -> timestamp

/**
 * Queue message for sequential storage
 * @param {string} deviceId - Device identifier
 * @param {number} chargerId - Charger ID (may be null if not available)
 * @param {Object} message - Message object to store
 */
async function enqueueMessage(deviceId, chargerId, message) {
  const queueData = connectionManager.getMessageQueue(deviceId);
  
  // Wait for any ongoing processing to complete before assigning sequence
  await queueData.processingPromise;
  
  const sequence = queueData.nextSequence;
  queueData.nextSequence++;
  
  // Add message to queue with assigned sequence
  queueData.queue.push({
    deviceId,
    chargerId,
    message,
    sequence,
    timestamp: new Date()
  });
  
  console.log(`📥 Enqueued message for ${deviceId}: ${message.action || message.message || 'Unknown'} (sequence: ${sequence})`);
  
  // Process queue immediately and wait for it to complete
  queueData.processingPromise = processMessageQueue(deviceId);
  await queueData.processingPromise;
}

/**
 * Process message queue sequentially
 * @param {string} deviceId - Device identifier
 */
async function processMessageQueue(deviceId) {
  const queueData = connectionManager.getMessageQueue(deviceId);
  
  // If already processing, don't start another process
  if (queueData.processing) {
    // Wait for current processing to complete
    await queueData.processingPromise;
    return;
  }
  
  queueData.processing = true;
  
  try {
    while (queueData.queue.length > 0) {
      const queuedMessage = queueData.queue.shift();
      await storeMessage(
        queuedMessage.deviceId,
        queuedMessage.chargerId,
        queuedMessage.message,
        queuedMessage.sequence
      );
    }
  } catch (error) {
    console.error(`❌ Error processing message queue for ${deviceId}:`, error.message);
  } finally {
    queueData.processing = false;
  }
}

/**
 * Store message via REST API or RabbitMQ
 * @param {string} deviceId - Device identifier
 * @param {number} chargerId - Charger ID (may be null)
 * @param {Object} message - Message object
 * @param {number} assignedSequence - Assigned sequence number
 */
async function storeMessage(deviceId, chargerId, message, assignedSequence) {
  try {
    // Update charger's lastSeen (non-blocking)
    if (chargerId) {
      apiClient.updateChargerLastSeen(deviceId).catch(err => {
        console.warn(`⚠️ Failed to update lastSeen:`, err.message);
      });
    }

    // Determine message type and direction
    const messageType = (message && message.ocpp && message.action)
      ? message.action
      : (message.message || message.messageType || message.type || 'Unknown');
    const direction = message.direction || 'Incoming';

    // Get messageId for duplicate check
    const msgId = message.id || message.messageId;
    
    // Quick in-memory duplicate check (5 seconds)
    if (msgId) {
      const recentKey = `${deviceId}:${msgId}:${messageType}:${direction}`;
      const recentTime = recentMessages.get(recentKey);
      if (recentTime && (Date.now() - recentTime) < 5000) {
        console.warn(`⚠️ Duplicate message detected (in-memory): ${messageType} (${direction}) messageId: ${msgId} from ${deviceId}`);
        return; // Skip storing duplicate
      }
      recentMessages.set(recentKey, Date.now());
      
      // Cleanup old entries (keep last 1000)
      if (recentMessages.size > 1000) {
        const entries = Array.from(recentMessages.entries());
        entries.slice(0, 500).forEach(([key]) => recentMessages.delete(key));
      }
    }
    
    // For RemoteStartTransaction/RemoteStopTransaction, check for very recent duplicates
    if ((messageType === 'RemoteStartTransaction' || messageType === 'RemoteStopTransaction') && direction === 'Outgoing') {
      const recentKey = `${deviceId}:${messageType}:${direction}`;
      const recentTime = recentMessages.get(recentKey);
      if (recentTime && (Date.now() - recentTime) < 5000) {
        console.warn(`⚠️ [DUPLICATE PREVENTED] Duplicate ${messageType} command detected within 5 seconds - skipping storage`);
        return;
      }
      recentMessages.set(recentKey, Date.now());
    }

    // Extract connectorId
    let connectorId = 0;
    if (message.connectorId !== undefined && message.connectorId !== null) {
      connectorId = message.connectorId;
    } else if (message.payload && typeof message.payload.connectorId !== 'undefined') {
      connectorId = message.payload.connectorId;
    }

    // Format messageData
    let messageData = {};
    if (message.payload) {
      if (messageType === 'Response' && Object.keys(message.payload).length === 0) {
        messageData = {};
      } else {
        messageData = message.payload;
      }
    }

    // Format raw array
    let rawArray;
    if (message.raw && Array.isArray(message.raw)) {
      rawArray = message.raw;
    } else {
      const rawMsgId = msgId || createMessageId();
      if (message.type === MESSAGE_TYPE.CALL_RESULT || messageType === 'Response') {
        rawArray = [MESSAGE_TYPE.CALL_RESULT, rawMsgId, message.payload || messageData || {}];
      } else {
        rawArray = [MESSAGE_TYPE.CALL, rawMsgId, message.action || messageType, message.payload || messageData || {}];
      }
    }

    // Use assigned sequence from queue
    const sequence = assignedSequence || 1;
    const timestamp = new Date();
    const finalMsgId = msgId || createMessageId();

    // Prepare message data for storage
    const messageDataForStorage = {
      chargerId: chargerId,
      deviceId: deviceId,
      type: 'OCPP',
      connectorId: connectorId,
      messageId: finalMsgId,
      message: messageType,
      messageData: messageData,
      raw: rawArray,
      direction: direction,
      timestamp: timestamp,
      sequence: sequence
    };

    // Try REST API first
    const stored = await apiClient.storeOCPPMessage(deviceId, messageDataForStorage);
    
    if (!stored) {
      // Fallback to RabbitMQ
      await rabbitmqProducer.publishOCPPMessage({
        deviceId,
        chargerId: chargerId,
        messageType: 'ocpp.message',
        payload: messageDataForStorage,
        timestamp: timestamp
      }, 5);
      console.log(`📤 Published OCPP message to RabbitMQ: ${messageType} (${direction}) from ${deviceId}`);
    } else {
      console.log(`💾 Stored message via API: ${messageType} (${direction}) from ${deviceId} [sequence: ${sequence}, messageId: ${finalMsgId}]`);
    }

  } catch (error) {
    console.error('❌ Error storing message:', error.message);
    // Don't throw - continue processing other messages
  }
}

module.exports = {
  enqueueMessage,
  processMessageQueue,
  storeMessage
};
