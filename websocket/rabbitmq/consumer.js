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
      maxRetries: options.maxRetries || 3,
      routingKeys: options.routingKeys || [],
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
      if (this.options.routingKeys && Array.isArray(this.options.routingKeys) && this.options.routingKeys.length > 0) {
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
            const content = JSON.parse(msg.content.toString());
            const processed = await this.processMessage(content, msg);

            if (processed) {
              // Acknowledge message
              this.channel.ack(msg);
            } else {
              // Reject and requeue
              this.channel.nack(msg, false, true);
            }
          } catch (error) {
            console.error(`❌ Error processing message from ${this.queueName}:`, error.message);
            console.error(`❌ Error stack:`, error.stack);

            // Check retry count
            const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) + 1;

            if (retryCount < this.options.maxRetries) {
              // Reject and requeue with retry count
              this.channel.nack(msg, false, true);
              console.log(`🔄 Requeuing message (retry ${retryCount}/${this.options.maxRetries})`);
            } else {
              // Max retries reached - reject without requeue (send to DLQ)
              console.error(`❌ Max retries reached for message - sending to DLQ`);
              this.channel.nack(msg, false, false);
            }
          }
        },
        {
          noAck: this.options.noAck
        }
      );

      this.consumerTag = consumeResult.consumerTag;
      this.isConsuming = true;
      console.log(`✅ Started consuming from queue: ${this.queueName} (consumerTag: ${this.consumerTag})`);
    } catch (error) {
      console.error(`❌ Failed to start consumer for ${this.queueName}:`, error.message);
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
      if (this.channel) {
        await this.channel.cancel(this.consumerTag);
        console.log(`✅ Stopped consuming from queue: ${this.queueName}`);
      }
      this.isConsuming = false;
      this.consumerTag = null;
    } catch (error) {
      console.error(`❌ Error stopping consumer for ${this.queueName}:`, error.message);
      throw error;
    }
  }

  /**
   * Process a message (to be implemented by subclasses)
   * @param {Object} content - Message content
   * @param {Object} msg - Raw RabbitMQ message
   * @returns {Promise<boolean>} - true if processed successfully
   */
  async processMessage(content, msg) {
    throw new Error('processMessage must be implemented by subclass');
  }
}

module.exports = BaseConsumer;
