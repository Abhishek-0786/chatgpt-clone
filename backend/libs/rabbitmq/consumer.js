/**
 * Base RabbitMQ Consumer Class
 * Provides common functionality for all RabbitMQ consumers
 * Extend this class to create specific consumers
 */

const { getChannel, isConnected } = require('./connection');
const { EXCHANGE_NAME, QUEUES } = require('./queues');

class BaseConsumer {
  constructor(queueName, options = {}) {
    this.queueName = queueName;
    this.channel = null;
    this.consumerTag = null;
    this.isConsuming = false;
    this.options = {
      prefetch: options.prefetch || 1, // Process one message at a time
      noAck: options.noAck || false, // Require acknowledgment
      ...options
    };
  }

  /**
   * Start consuming messages from the queue
   */
  async start() {
    if (this.isConsuming) {
      console.warn(`⚠️ Consumer for ${this.queueName} is already consuming`);
      return;
    }

    // Wait a bit for connection to be fully ready (retry mechanism)
    let retries = 5;
    let connected = false;
    
    while (retries > 0 && !connected) {
      try {
        if (isConnected()) {
          connected = true;
          break;
        }
      } catch (error) {
        // Connection not ready yet
      }
      
      if (!connected) {
        retries--;
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
      }
    }

    if (!connected) {
      throw new Error('RabbitMQ not connected. Call initializeRabbitMQ() first.');
    }

    try {
      this.channel = getChannel();
      
      // Set prefetch
      await this.channel.prefetch(this.options.prefetch);

      // Queue is already declared in connection.js with all settings
      // We don't need to assert it again - just use it directly
      // If queue doesn't exist, consume() will fail anyway

      // Bind queue to exchange (if routing keys are provided)
      if (this.options.routingKeys && Array.isArray(this.options.routingKeys)) {
        for (const routingKey of this.options.routingKeys) {
          await this.channel.bindQueue(this.queueName, EXCHANGE_NAME, routingKey);
          console.log(`✅ Bound queue ${this.queueName} to exchange with routing key: ${routingKey}`);
        }
      }

      // Start consuming
      const consumeResult = await this.channel.consume(
        this.queueName,
        async (msg) => {
          if (msg === null) {
            // Consumer was cancelled
            return;
          }

          try {
            // Parse message
            const content = JSON.parse(msg.content.toString());
            
            // Process message (implemented by child class)
            const success = await this.processMessage(content, msg);

            // Acknowledge message if processing was successful
            if (success && !this.options.noAck) {
              this.channel.ack(msg);
            } else if (!success && !this.options.noAck) {
              // Reject and requeue if processing failed
              this.channel.nack(msg, false, true);
              console.warn(`⚠️ Message processing failed, requeuing: ${this.queueName}`);
            }
          } catch (error) {
            console.error(`❌ Error processing message in ${this.queueName}:`, error.message);
            console.error(`❌ Error details:`, error.stack);
            
            // Handle error based on retry count
            const retryCount = this.getRetryCount(msg);
            
            if (retryCount < (this.options.maxRetries || 3)) {
              // Requeue for retry
              this.channel.nack(msg, false, true);
              console.log(`🔄 Retrying message (attempt ${retryCount + 1}/${this.options.maxRetries || 3})`);
            } else {
              // Max retries reached - reject and send to DLQ
              this.channel.nack(msg, false, false);
              console.error(`❌ Max retries reached, message sent to DLQ: ${this.queueName}`);
            }
          }
        },
        {
          noAck: this.options.noAck
        }
      );

      this.consumerTag = consumeResult.consumerTag;
      this.isConsuming = true;
      
      console.log(`✅ Started consuming from queue: ${this.queueName} (consumer tag: ${this.consumerTag})`);
    } catch (error) {
      console.error(`❌ Error starting consumer for ${this.queueName}:`, error.message);
      throw error;
    }
  }

  /**
   * Stop consuming messages
   */
  async stop() {
    if (!this.isConsuming || !this.consumerTag) {
      return;
    }

    try {
      await this.channel.cancel(this.consumerTag);
      this.isConsuming = false;
      this.consumerTag = null;
      console.log(`✅ Stopped consuming from queue: ${this.queueName}`);
    } catch (error) {
      console.error(`❌ Error stopping consumer for ${this.queueName}:`, error.message);
      throw error;
    }
  }

  /**
   * Process a message (must be implemented by child class)
   * @param {Object} content - Parsed message content
   * @param {Object} msg - Raw RabbitMQ message object
   * @returns {Promise<boolean>} - true if processing was successful, false otherwise
   */
  async processMessage(content, msg) {
    throw new Error('processMessage() must be implemented by child class');
  }

  /**
   * Get retry count from message headers
   * @param {Object} msg - RabbitMQ message object
   * @returns {number} - Retry count
   */
  getRetryCount(msg) {
    if (msg.properties.headers && msg.properties.headers['x-retry-count']) {
      return msg.properties.headers['x-retry-count'];
    }
    return 0;
  }

  /**
   * Increment retry count in message headers
   * @param {Object} msg - RabbitMQ message object
   * @returns {Object} - Updated headers
   */
  incrementRetryCount(msg) {
    const headers = msg.properties.headers || {};
    headers['x-retry-count'] = (headers['x-retry-count'] || 0) + 1;
    return headers;
  }

  /**
   * Check if consumer is active
   * @returns {boolean}
   */
  isActive() {
    return this.isConsuming && this.channel !== null;
  }
}

module.exports = BaseConsumer;

