/**
 * OCPP Logs Consumer
 * Consumes logs from RabbitMQ queue "ocpp.logs" and stores them in database
 */

const BaseConsumer = require('../libs/rabbitmq/consumer');
const { QUEUES } = require('../libs/rabbitmq/queues');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const { Op } = require('sequelize');

class OCPPLogsConsumer extends BaseConsumer {
  constructor() {
    super(QUEUES.OCPP_LOGS, {
      prefetch: 10, // Process multiple logs at once (logs are less critical than real-time messages)
      maxRetries: 3
    });
  }

  /**
   * Process log message from queue
   * @param {Object} content - Log content from RabbitMQ
   * @param {Object} msg - Raw RabbitMQ message
   * @returns {Promise<boolean>} - true if successful
   */
  async processMessage(content, msg) {
    try {
      console.log(`📥 Received log from queue: ${content.messageType} from ${content.deviceId}`);
      const { deviceId, messageType, payload, direction, rawMessage, timestamp, messageId: logMessageId } = content;

      if (!deviceId || !messageType) {
        console.warn('⚠️ Invalid log message: missing deviceId or messageType');
        return true; // Acknowledge invalid messages to prevent infinite retries
      }

      // Find or create charger
      let charger = await Charger.findOne({
        where: { deviceId },
        attributes: { exclude: ['chargerStatus'] }
      });

      if (!charger) {
        // Create charger if it doesn't exist
        charger = await Charger.create({
          deviceId,
          name: deviceId,
          status: 'Available',
          vendor: 'Unknown',
          model: 'Unknown',
          serialNumber: 'Unknown',
          firmwareVersion: 'Unknown',
          connectorCount: 0,
          powerRating: 0
        });
        console.log(`✅ Created charger for log: ${deviceId}`);
      }

      // Extract connectorId from payload
      let connectorId = 0;
      if (payload && typeof payload.connectorId !== 'undefined') {
        connectorId = payload.connectorId || 0;
      }

      // Extract messageId from payload or generate one
      let messageId = null;
      if (logMessageId) {
        messageId = logMessageId.toString();
      } else if (payload && payload.id) {
        messageId = payload.id.toString();
      } else if (payload && payload.transactionId) {
        messageId = payload.transactionId.toString();
      }

      // Create preview (compact summary)
      const preview = this.createPreview(messageType, payload, direction);

      // Store log in database
      const logRecord = await ChargerData.create({
        chargerId: charger.id,
        deviceId,
        type: 'OCPP',
        connectorId,
        messageId,
        message: messageType,
        messageData: payload || {},
        raw: rawMessage || JSON.stringify(payload || {}),
        direction: direction || 'Incoming',
        timestamp: timestamp ? new Date(timestamp) : new Date()
      });

      console.log(`✅ Stored log in database: ${messageType} from ${deviceId} (id: ${logRecord.id})`);
      return true;
    } catch (error) {
      console.error('❌ Error processing OCPP log:', error.message);
      // Don't throw for duplicate key errors or validation errors
      if (error.name === 'SequelizeUniqueConstraintError' || 
          error.name === 'SequelizeValidationError') {
        console.warn('⚠️ Skipping duplicate or invalid log entry');
        return true; // Acknowledge to prevent infinite retries
      }
      throw error; // Re-throw other errors to trigger retry logic
    }
  }

  /**
   * Create a compact preview of the log message
   * @param {string} messageType - Message type
   * @param {Object} payload - Message payload
   * @param {string} direction - Direction (Incoming/Outgoing)
   * @returns {string} Preview string
   */
  createPreview(messageType, payload, direction) {
    const parts = [messageType];
    
    if (payload && payload.connectorId !== undefined) {
      parts.push(`Connector ${payload.connectorId}`);
    }
    
    if (payload && payload.status) {
      parts.push(`Status: ${payload.status}`);
    }
    
    if (payload && payload.transactionId) {
      parts.push(`TxID: ${payload.transactionId}`);
    }

    return `${direction}: ${parts.join(' | ')}`;
  }
}

module.exports = OCPPLogsConsumer;

