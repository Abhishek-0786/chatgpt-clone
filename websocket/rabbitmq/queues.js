/**
 * RabbitMQ Queue Configuration
 * Defines all queues, exchanges, and routing keys used in the system
 */

// Exchange name
const EXCHANGE_NAME = 'ev_charging_events';
const EXCHANGE_TYPE = 'topic'; // Topic exchange for flexible routing

// Queue names
const QUEUES = {
  OCPP_MESSAGES: 'ocpp_messages',
  OCPP_LOGS: 'ocpp.logs',
  CHARGING_COMMANDS: 'charging_commands',
  CHARGING_EVENTS: 'charging_events',
  NOTIFICATIONS: 'notifications',
  CMS_EVENTS: 'cms_events',
  ANALYTICS: 'analytics'
};

// Routing keys
const ROUTING_KEYS = {
  // OCPP Messages
  OCPP_BOOT_NOTIFICATION: 'ocpp.bootnotification',
  OCPP_START_TRANSACTION: 'ocpp.starttransaction',
  OCPP_STOP_TRANSACTION: 'ocpp.stoptransaction',
  OCPP_STATUS_NOTIFICATION: 'ocpp.statusnotification',
  OCPP_METER_VALUES: 'ocpp.metervalues',
  OCPP_RESPONSE: 'ocpp.response',
  OCPP_ERROR: 'ocpp.error',
  
  // Charging Commands
  COMMAND_REMOTE_START: 'command.remotestart',
  COMMAND_REMOTE_STOP: 'command.remotestop',
  COMMAND_CHANGE_CONFIG: 'command.changeconfig',
  COMMAND_RESET: 'command.reset',
  
  // Charging Events
  CHARGING_STARTED: 'charging.started',
  CHARGING_STOPPED: 'charging.stopped',
  CHARGING_UPDATED: 'charging.updated',
  CHARGING_FAILED: 'charging.failed',
  
  // Remote Start/Stop Commands (Queue-based microservice flow)
  CHARGING_REMOTE_START: 'charging.remote.start',
  CHARGING_REMOTE_START_RESPONSE: 'charging.remote.response',
  CHARGING_REMOTE_STOP: 'charging.remote.stop',
  CHARGING_REMOTE_STOP_RESPONSE: 'charging.remote.stop.response',
  
  // Notifications
  NOTIFICATION_STATION: 'notification.station',
  NOTIFICATION_CHARGER: 'notification.charger',
  NOTIFICATION_SESSION: 'notification.session',
  NOTIFICATION_CUSTOMER: 'notification.customer',
  
  // CMS Events
  CMS_STATION_CREATED: 'cms.station.created',
  CMS_STATION_UPDATED: 'cms.station.updated',
  CMS_STATION_DELETED: 'cms.station.deleted',
  CMS_POINT_CREATED: 'cms.point.created',
  CMS_POINT_UPDATED: 'cms.point.updated',
  CMS_POINT_DELETED: 'cms.point.deleted',
  CMS_TARIFF_CREATED: 'cms.tariff.created',
  CMS_TARIFF_UPDATED: 'cms.tariff.updated',
  
  // Analytics
  ANALYTICS_SESSION: 'analytics.session',
  ANALYTICS_REVENUE: 'analytics.revenue',
  ANALYTICS_ENERGY: 'analytics.energy'
};

// Queue configurations with priority, durability, and TTL
const QUEUE_CONFIGS = {
  [QUEUES.OCPP_MESSAGES]: {
    durable: true,
    arguments: {
      'x-max-priority': 10, // High priority queue
      'x-message-ttl': undefined // No TTL - must process all
    }
  },
  [QUEUES.OCPP_LOGS]: {
    durable: true,
    arguments: {
      'x-max-priority': 5, // Medium priority
      'x-message-ttl': undefined // No TTL - must process all logs
    }
  },
  [QUEUES.CHARGING_COMMANDS]: {
    durable: true,
    arguments: {
      'x-max-priority': 5, // Medium priority
      'x-message-ttl': 300000 // 5 minutes TTL
    }
  },
  [QUEUES.CHARGING_EVENTS]: {
    durable: true,
    arguments: {
      'x-max-priority': 10, // High priority
      'x-message-ttl': undefined
    }
  },
  [QUEUES.NOTIFICATIONS]: {
    durable: false, // Transient - if server restarts, notifications can be lost
    arguments: {
      'x-max-priority': 5,
      'x-message-ttl': 60000 // 1 minute TTL
    }
  },
  [QUEUES.CMS_EVENTS]: {
    durable: true,
    arguments: {
      'x-max-priority': 3, // Low priority
      'x-message-ttl': 3600000 // 1 hour TTL
    }
  },
  [QUEUES.ANALYTICS]: {
    durable: true,
    arguments: {
      'x-max-priority': 1, // Lowest priority
      'x-message-ttl': 86400000 // 24 hours TTL
    }
  }
};

// Dead Letter Queue configuration
const DLQ_NAME = 'ev_charging_dlq';
const DLQ_EXCHANGE = 'ev_charging_dlq_exchange';

module.exports = {
  EXCHANGE_NAME,
  EXCHANGE_TYPE,
  QUEUES,
  ROUTING_KEYS,
  QUEUE_CONFIGS,
  DLQ_NAME,
  DLQ_EXCHANGE
};


