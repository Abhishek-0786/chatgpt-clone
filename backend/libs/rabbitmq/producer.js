/**
 * RabbitMQ Producer Service
 * Functions to publish messages to RabbitMQ queues
 */

const { getChannel, isConnected } = require('./connection');
const {
  EXCHANGE_NAME,
  QUEUES,
  ROUTING_KEYS
} = require('./queues');

/**
 * Publish OCPP message to RabbitMQ
 * @param {Object} messageData - OCPP message data
 * @param {string} messageData.deviceId - Charger device ID
 * @param {number} messageData.chargerId - Charger database ID
 * @param {string} messageData.messageType - OCPP message type (BootNotification, StartTransaction, etc.)
 * @param {Object} messageData.payload - Message payload
 * @param {string} messageData.rawData - Raw message string
 * @param {Date} messageData.timestamp - Message timestamp
 * @param {Object} messageData.parsedMessage - Parsed message object
 * @param {number} [priority=5] - Message priority (1-10, higher = more important)
 */
async function publishOCPPMessage(messageData, priority = 5) {
  if (!isConnected()) {
    console.warn('⚠️ RabbitMQ not connected, skipping OCPP message publish');
    return false;
  }

  try {
    const channel = getChannel();
    
    // Determine routing key based on message type
    let routingKey = ROUTING_KEYS.OCPP_RESPONSE; // Default
    
    switch (messageData.messageType) {
      case 'BootNotification':
        routingKey = ROUTING_KEYS.OCPP_BOOT_NOTIFICATION;
        break;
      case 'StartTransaction':
        routingKey = ROUTING_KEYS.OCPP_START_TRANSACTION;
        break;
      case 'StopTransaction':
        routingKey = ROUTING_KEYS.OCPP_STOP_TRANSACTION;
        break;
      case 'StatusNotification':
        routingKey = ROUTING_KEYS.OCPP_STATUS_NOTIFICATION;
        break;
      case 'MeterValues':
        routingKey = ROUTING_KEYS.OCPP_METER_VALUES;
        break;
      case 'Response':
        routingKey = ROUTING_KEYS.OCPP_RESPONSE;
        break;
      case 'CALL_ERROR':
        routingKey = ROUTING_KEYS.OCPP_ERROR;
        break;
    }

    const message = {
      deviceId: messageData.deviceId,
      chargerId: messageData.chargerId,
      messageType: messageData.messageType,
      payload: messageData.payload,
      rawData: messageData.rawData,
      timestamp: messageData.timestamp || new Date(),
      parsedMessage: messageData.parsedMessage
    };

    const published = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true, // Make message persistent
        priority: Math.min(Math.max(priority, 1), 10), // Clamp between 1-10
        timestamp: Date.now()
      }
    );

    if (published) {
      console.log(`📤 Published OCPP message: ${messageData.messageType} from ${messageData.deviceId} to ${routingKey}`);
      return true;
    } else {
      console.warn(`⚠️ Failed to publish OCPP message: ${messageData.messageType} (channel buffer full)`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error publishing OCPP message:`, error.message);
    return false;
  }
}

/**
 * Publish charging command to RabbitMQ
 * @param {Object} commandData - Charging command data
 * @param {string} commandData.deviceId - Charger device ID
 * @param {string} commandData.command - Command type (RemoteStartTransaction, RemoteStopTransaction, etc.)
 * @param {Object} commandData.payload - Command payload
 * @param {Date} commandData.timestamp - Command timestamp
 * @param {boolean} commandData.sentViaWebSocket - Whether command was sent via WebSocket
 */
async function publishChargingCommand(commandData) {
  if (!isConnected()) {
    console.warn('⚠️ RabbitMQ not connected, skipping command publish');
    return false;
  }

  try {
    const channel = getChannel();
    
    // Determine routing key based on command type
    let routingKey = ROUTING_KEYS.COMMAND_REMOTE_START; // Default
    
    switch (commandData.command) {
      case 'RemoteStartTransaction':
        // Use new queue-based routing key for microservice flow
        routingKey = commandData.useQueueFlow ? ROUTING_KEYS.CHARGING_REMOTE_START : ROUTING_KEYS.COMMAND_REMOTE_START;
        break;
      case 'RemoteStopTransaction':
        // Use new queue-based routing key for microservice flow
        routingKey = commandData.useQueueFlow ? ROUTING_KEYS.CHARGING_REMOTE_STOP : ROUTING_KEYS.COMMAND_REMOTE_STOP;
        break;
      case 'ChangeConfiguration':
        routingKey = ROUTING_KEYS.COMMAND_CHANGE_CONFIG;
        break;
      case 'Reset':
        routingKey = ROUTING_KEYS.COMMAND_RESET;
        break;
    }

    const message = {
      deviceId: commandData.deviceId,
      command: commandData.command,
      payload: commandData.payload,
      timestamp: commandData.timestamp || new Date(),
      sentViaWebSocket: commandData.sentViaWebSocket || false,
      // Include session info for queue-based flow
      sessionId: commandData.sessionId,
      customerId: commandData.customerId,
      connectorId: commandData.connectorId,
      idTag: commandData.idTag,
      transactionId: commandData.transactionId
    };

    const published = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        priority: 5,
        timestamp: Date.now()
      }
    );

    if (published) {
      console.log(`📤 Published charging command: ${commandData.command} for ${commandData.deviceId}`);
      return true;
    } else {
      console.warn(`⚠️ Failed to publish charging command: ${commandData.command}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error publishing charging command:`, error.message);
    return false;
  }
}

/**
 * Publish charging event to RabbitMQ
 * @param {Object} eventData - Charging event data
 * @param {string} eventData.type - Event type (charging.started, charging.stopped, etc.)
 * @param {string} eventData.sessionId - Charging session ID
 * @param {number} eventData.customerId - Customer ID
 * @param {string} eventData.deviceId - Charger device ID
 * @param {number} eventData.connectorId - Connector ID
 * @param {Object} eventData.additionalData - Any additional event data
 */
async function publishChargingEvent(eventData) {
  if (!isConnected()) {
    console.warn('⚠️ RabbitMQ not connected, skipping event publish');
    return false;
  }

  try {
    const channel = getChannel();
    
    // Use the event type as routing key (e.g., charging.started, charging.stopped)
    const routingKey = eventData.type || ROUTING_KEYS.CHARGING_STARTED;

    const message = {
      type: eventData.type,
      sessionId: eventData.sessionId,
      customerId: eventData.customerId,
      deviceId: eventData.deviceId,
      connectorId: eventData.connectorId,
      timestamp: new Date(),
      ...eventData.additionalData
    };

    const published = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        priority: 10, // High priority for charging events
        timestamp: Date.now()
      }
    );

    if (published) {
      console.log(`📤 Published charging event: ${eventData.type} for session ${eventData.sessionId}`);
      return true;
    } else {
      console.warn(`⚠️ Failed to publish charging event: ${eventData.type}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error publishing charging event:`, error.message);
    return false;
  }
}

/**
 * Publish notification to RabbitMQ
 * @param {Object} notificationData - Notification data
 * @param {string} notificationData.type - Notification type
 * @param {Object} notificationData.data - Notification payload
 * @param {string[]} notificationData.recipients - Recipient IDs (customer IDs, etc.)
 */
async function publishNotification(notificationData) {
  if (!isConnected()) {
    console.warn('⚠️ RabbitMQ not connected, skipping notification publish');
    return false;
  }

  try {
    const channel = getChannel();
    
    // Determine routing key based on notification type
    let routingKey = ROUTING_KEYS.NOTIFICATION_SESSION; // Default
    
    if (notificationData.type.includes('station')) {
      routingKey = ROUTING_KEYS.NOTIFICATION_STATION;
    } else if (notificationData.type.includes('charger')) {
      routingKey = ROUTING_KEYS.NOTIFICATION_CHARGER;
    } else if (notificationData.type.includes('session')) {
      routingKey = ROUTING_KEYS.NOTIFICATION_SESSION;
    } else if (notificationData.type.includes('customer')) {
      routingKey = ROUTING_KEYS.NOTIFICATION_CUSTOMER;
    }

    const message = {
      type: notificationData.type,
      data: notificationData.data,
      recipients: notificationData.recipients || [],
      timestamp: new Date()
    };

    const published = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: false, // Notifications are transient
        priority: 5,
        timestamp: Date.now(),
        expiration: '60000' // 1 minute TTL
      }
    );

    if (published) {
      console.log(`📤 Published notification: ${notificationData.type}`);
      return true;
    } else {
      console.warn(`⚠️ Failed to publish notification: ${notificationData.type}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error publishing notification:`, error.message);
    return false;
  }
}

/**
 * Publish CMS event to RabbitMQ
 * @param {Object} eventData - CMS event data
 * @param {string} eventData.type - Event type (cms.station.created, etc.)
 * @param {Object} eventData.data - Event data
 */
async function publishCMSEvent(eventData) {
  if (!isConnected()) {
    console.warn('⚠️ RabbitMQ not connected, skipping CMS event publish');
    return false;
  }

  try {
    const channel = getChannel();
    
    // Use the event type as routing key
    const routingKey = eventData.type;

    const message = {
      type: eventData.type,
      data: eventData.data,
      timestamp: new Date()
    };

    const published = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true,
        priority: 3, // Low priority for CMS events
        timestamp: Date.now()
      }
    );

    if (published) {
      console.log(`📤 Published CMS event: ${eventData.type}`);
      return true;
    } else {
      console.warn(`⚠️ Failed to publish CMS event: ${eventData.type}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error publishing CMS event:`, error.message);
    return false;
  }
}

/**
 * Publish payment event to RabbitMQ
 * @param {Object} paymentData - Payment event data
 * @param {string} paymentData.type - Payment type (wallet.topup, etc.)
 * @param {Object} paymentData.payload - Full webhook payload from Razorpay
 * @param {Date} paymentData.timestamp - Event timestamp
 */
async function publishPayment(paymentData) {
  if (!isConnected()) {
    console.warn('⚠️ RabbitMQ not connected, skipping payment publish');
    return false;
  }

  try {
    const channel = getChannel();
    
    // Use payment.completed routing key
    const routingKey = ROUTING_KEYS.PAYMENT_COMPLETED;

    const message = {
      type: paymentData.type || 'wallet.topup',
      payload: paymentData.payload,
      timestamp: paymentData.timestamp || new Date()
    };

    const published = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      {
        persistent: true, // Make message persistent - critical for payments
        priority: 10, // High priority - payments are critical
        timestamp: Date.now()
      }
    );

    if (published) {
      console.log(`📤 Published payment event: ${paymentData.type} to ${routingKey}`);
      return true;
    } else {
      console.warn(`⚠️ Failed to publish payment event: ${paymentData.type} (channel buffer full)`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error publishing payment event:`, error.message);
    return false;
  }
}

module.exports = {
  publishOCPPMessage,
  publishChargingCommand,
  publishChargingEvent,
  publishNotification,
  publishCMSEvent,
  publishPayment
};

