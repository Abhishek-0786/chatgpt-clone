/**
 * RabbitMQ Connection Manager
 * Manages connection, channels, reconnection, and queue setup
 */

const amqp = require('amqplib');
const {
  EXCHANGE_NAME,
  EXCHANGE_TYPE,
  QUEUES,
  QUEUE_CONFIGS,
  ROUTING_KEYS,
  DLQ_NAME,
  DLQ_EXCHANGE
} = require('./queues');

let connection = null;
let channel = null;
let isConnecting = false;
let reconnectTimeout = null;

// Connection configuration
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Initialize RabbitMQ connection and set up exchanges/queues
 */
async function initializeRabbitMQ() {
  if (isConnecting) {
    console.log('⏳ RabbitMQ connection already in progress...');
    return;
  }

  if (connection && channel) {
    console.log('✅ RabbitMQ already connected');
    return;
  }

  isConnecting = true;

  try {
    console.log('🔌 Connecting to RabbitMQ...');
    console.log(`📍 URL: ${RABBITMQ_URL.replace(/:[^:@]+@/, ':***@')}`); // Hide password in logs

    // Connect to RabbitMQ
    connection = await amqp.connect(RABBITMQ_URL);
    
    connection.on('error', (err) => {
      console.error('❌ RabbitMQ connection error:', err.message);
      handleReconnection();
    });

    connection.on('close', () => {
      console.warn('⚠️ RabbitMQ connection closed');
      handleReconnection();
    });

    // Create channel
    channel = await connection.createChannel();

    // Set prefetch to process one message at a time (for message ordering)
    await channel.prefetch(1);

    // Declare exchange
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, {
      durable: true
    });
    console.log(`✅ Exchange declared: ${EXCHANGE_NAME}`);

    // Declare Dead Letter Exchange and Queue
    await channel.assertExchange(DLQ_EXCHANGE, 'direct', { durable: true });
    await channel.assertQueue(DLQ_NAME, { durable: true });
    await channel.bindQueue(DLQ_NAME, DLQ_EXCHANGE, '');
    console.log(`✅ Dead Letter Queue set up: ${DLQ_NAME}`);

    // Declare all queues
    for (const [queueName, config] of Object.entries(QUEUE_CONFIGS)) {
      const queueOptions = {
        durable: config.durable,
        arguments: {
          ...config.arguments,
          'x-dead-letter-exchange': DLQ_EXCHANGE,
          'x-dead-letter-routing-key': ''
        }
      };

      await channel.assertQueue(queueName, queueOptions);
      console.log(`✅ Queue declared: ${queueName} (durable: ${config.durable})`);
    }

    // Bind queues to exchange with appropriate routing keys
    // Note: ocpp_messages and notifications are bound by their consumers
    // These queues are for auditing/analytics and don't have active consumers
    
    // Bind charging_commands queue
    await channel.bindQueue(QUEUES.CHARGING_COMMANDS, EXCHANGE_NAME, ROUTING_KEYS.COMMAND_REMOTE_START);
    await channel.bindQueue(QUEUES.CHARGING_COMMANDS, EXCHANGE_NAME, ROUTING_KEYS.COMMAND_REMOTE_STOP);
    await channel.bindQueue(QUEUES.CHARGING_COMMANDS, EXCHANGE_NAME, ROUTING_KEYS.COMMAND_CHANGE_CONFIG);
    await channel.bindQueue(QUEUES.CHARGING_COMMANDS, EXCHANGE_NAME, ROUTING_KEYS.COMMAND_RESET);
    // New queue-based microservice routing keys
    await channel.bindQueue(QUEUES.CHARGING_COMMANDS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_REMOTE_START);
    await channel.bindQueue(QUEUES.CHARGING_COMMANDS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_REMOTE_STOP);
    console.log(`✅ Bound queue ${QUEUES.CHARGING_COMMANDS} to exchange with routing keys: command.*, charging.remote.*`);

    // Bind charging_events queue
    await channel.bindQueue(QUEUES.CHARGING_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_STARTED);
    await channel.bindQueue(QUEUES.CHARGING_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_STOPPED);
    await channel.bindQueue(QUEUES.CHARGING_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_UPDATED);
    await channel.bindQueue(QUEUES.CHARGING_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_FAILED);
    // New queue-based microservice response routing keys
    await channel.bindQueue(QUEUES.CHARGING_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_REMOTE_START_RESPONSE);
    await channel.bindQueue(QUEUES.CHARGING_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CHARGING_REMOTE_STOP_RESPONSE);
    console.log(`✅ Bound queue ${QUEUES.CHARGING_EVENTS} to exchange with routing keys: charging.*`);

    // Bind cms_events queue
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_STATION_CREATED);
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_STATION_UPDATED);
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_STATION_DELETED);
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_POINT_CREATED);
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_POINT_UPDATED);
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_POINT_DELETED);
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_TARIFF_CREATED);
    await channel.bindQueue(QUEUES.CMS_EVENTS, EXCHANGE_NAME, ROUTING_KEYS.CMS_TARIFF_UPDATED);
    console.log(`✅ Bound queue ${QUEUES.CMS_EVENTS} to exchange with routing keys: cms.*`);

    // Bind analytics queue
    await channel.bindQueue(QUEUES.ANALYTICS, EXCHANGE_NAME, ROUTING_KEYS.ANALYTICS_SESSION);
    await channel.bindQueue(QUEUES.ANALYTICS, EXCHANGE_NAME, ROUTING_KEYS.ANALYTICS_REVENUE);
    await channel.bindQueue(QUEUES.ANALYTICS, EXCHANGE_NAME, ROUTING_KEYS.ANALYTICS_ENERGY);
    console.log(`✅ Bound queue ${QUEUES.ANALYTICS} to exchange with routing keys: analytics.*`);

    // Bind payment.completed queue
    await channel.bindQueue(QUEUES.PAYMENT_COMPLETED, EXCHANGE_NAME, ROUTING_KEYS.PAYMENT_COMPLETED);
    console.log(`✅ Bound queue ${QUEUES.PAYMENT_COMPLETED} to exchange with routing key: ${ROUTING_KEYS.PAYMENT_COMPLETED}`);

    isConnecting = false;
    console.log('✅ RabbitMQ initialized successfully');

  } catch (error) {
    isConnecting = false;
    console.error('❌ Failed to initialize RabbitMQ:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure RabbitMQ server is running:');
      console.error('   Windows: Check RabbitMQ service status');
      console.error('   Linux: sudo systemctl status rabbitmq-server');
      console.error('   macOS: brew services list | grep rabbitmq');
    }
    
    throw error;
  }
}

/**
 * Handle reconnection on connection loss
 */
function handleReconnection() {
  if (reconnectTimeout) {
    return; // Already attempting reconnection
  }

  connection = null;
  channel = null;

  let attempts = 0;

  const attemptReconnect = () => {
    attempts++;
    
    if (attempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please check RabbitMQ server.`);
      reconnectTimeout = null;
      return;
    }

    console.log(`🔄 Attempting to reconnect to RabbitMQ (${attempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    initializeRabbitMQ()
      .then(() => {
        console.log('✅ Reconnected to RabbitMQ successfully');
        reconnectTimeout = null;
      })
      .catch((err) => {
        console.warn(`⚠️ Reconnection attempt ${attempts} failed: ${err.message}`);
        reconnectTimeout = setTimeout(attemptReconnect, RECONNECT_DELAY);
      });
  };

  reconnectTimeout = setTimeout(attemptReconnect, RECONNECT_DELAY);
}

/**
 * Get the current channel (throws if not connected)
 */
function getChannel() {
  if (!channel) {
    throw new Error('RabbitMQ channel not available. Call initializeRabbitMQ() first.');
  }
  return channel;
}

/**
 * Get the current connection
 */
function getConnection() {
  if (!connection) {
    throw new Error('RabbitMQ connection not available. Call initializeRabbitMQ() first.');
  }
  return connection;
}

/**
 * Check if RabbitMQ is connected
 */
function isConnected() {
  try {
    // Check if connection and channel exist
    if (!connection || !channel) {
      return false;
    }
    // Try to access channel to verify it's still valid
    // If channel is closed, this will throw an error
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Close RabbitMQ connection gracefully
 */
async function closeConnection() {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    console.log('✅ RabbitMQ connection closed');
  } catch (error) {
    console.error('❌ Error closing RabbitMQ connection:', error.message);
  }
}

module.exports = {
  initializeRabbitMQ,
  getChannel,
  getConnection,
  isConnected,
  closeConnection
};


