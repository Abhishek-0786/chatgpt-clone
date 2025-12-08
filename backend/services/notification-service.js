/**
 * Notification Service
 * Consumes notifications from RabbitMQ and broadcasts to frontend via Socket.io
 */

const BaseConsumer = require('../libs/rabbitmq/consumer');
const { QUEUES, ROUTING_KEYS } = require('../libs/rabbitmq/queues');

class NotificationService extends BaseConsumer {
  constructor(io) {
    super(QUEUES.NOTIFICATIONS, {
      prefetch: 10, // Can process multiple notifications concurrently
      routingKeys: [
        ROUTING_KEYS.NOTIFICATION_STATION,
        ROUTING_KEYS.NOTIFICATION_CHARGER,
        ROUTING_KEYS.NOTIFICATION_SESSION,
        ROUTING_KEYS.NOTIFICATION_CUSTOMER
      ],
      maxRetries: 2 // Notifications are less critical, fewer retries
    });
    this.io = io; // Socket.io instance
  }

  /**
   * Process notification from queue
   * @param {Object} content - Notification content
   * @param {Object} msg - Raw RabbitMQ message
   * @returns {Promise<boolean>}
   */
  async processMessage(content, msg) {
    try {
      const { type, data, recipients } = content;

      // Determine if this is customer-specific or public notification
      const isCustomerSpecific = recipients && recipients.length > 0;

      if (isCustomerSpecific) {
        // CUSTOMER-SPECIFIC: Send ONLY to specified customer rooms (no broadcast to all)
        recipients.forEach(recipientId => {
          // Send to customer-specific room
          this.io.to(`customer:${recipientId}`).emit('notification', {
            type,
            data,
            timestamp: new Date()
          });
        });
        console.log(`📢 Sent customer-specific notification: ${type} to ${recipients.length} customer(s)`);
      } else {
        // PUBLIC: Broadcast to all connected clients (charger status, station updates, etc.)
        this.io.emit('notification', {
          type,
          data,
          timestamp: new Date()
        });
        console.log(`📢 Broadcasted public notification: ${type} to all clients`);
      }

      // Also send to type-specific CMS rooms for dashboard/management updates
      // This applies to both public and customer-specific notifications (CMS needs to see everything)
      if (type.includes('station')) {
        this.io.to('cms:dashboard').emit('notification', { type, data, timestamp: new Date() });
        this.io.to('cms:stations').emit('notification', { type, data, timestamp: new Date() });
      } else if (type.includes('charger')) {
        this.io.to('cms:dashboard').emit('notification', { type, data, timestamp: new Date() });
        this.io.to('cms:points').emit('notification', { type, data, timestamp: new Date() });
      } else if (type.includes('session')) {
        this.io.to('cms:dashboard').emit('notification', { type, data, timestamp: new Date() });
        this.io.to('cms:sessions').emit('notification', { type, data, timestamp: new Date() });
        // Customer-specific session notifications are already sent above (no need to duplicate)
      } else if (type.includes('customer')) {
        this.io.to('cms:dashboard').emit('notification', { type, data, timestamp: new Date() });
        this.io.to('cms:customers').emit('notification', { type, data, timestamp: new Date() });
      }

      return true;
    } catch (error) {
      console.error('❌ Error processing notification:', error.message);
      return false;
    }
  }
}

// Singleton instance
let serviceInstance = null;

/**
 * Get or create notification service instance
 * @param {Object} io - Socket.io instance
 */
function getNotificationService(io) {
  if (!serviceInstance) {
    serviceInstance = new NotificationService(io);
  }
  return serviceInstance;
}

/**
 * Start notification service
 * @param {Object} io - Socket.io instance
 */
async function startNotificationService(io) {
  try {
    if (!io) {
      throw new Error('Socket.io instance is required');
    }

    const service = getNotificationService(io);
    await service.start();
    console.log('✅ Notification Service started');
    return service;
  } catch (error) {
    console.error('❌ Failed to start Notification Service:', error.message);
    throw error;
  }
}

/**
 * Stop notification service
 */
async function stopNotificationService() {
  try {
    if (serviceInstance) {
      await serviceInstance.stop();
      serviceInstance = null;
      console.log('✅ Notification Service stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping Notification Service:', error.message);
  }
}

module.exports = {
  NotificationService,
  getNotificationService,
  startNotificationService,
  stopNotificationService
};

