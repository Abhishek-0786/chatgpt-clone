const Redis = require('ioredis');

// Load Redis configuration from environment variables
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  lazyConnect: false
};

// Create a single shared Redis instance
const redisClient = new Redis(redisConfig);

// Error handling and logging
redisClient.on('error', (error) => {
  console.error('❌ [Redis] Connection error:', error.message);
});

redisClient.on('connect', () => {
  console.log('🔌 [Redis] Connecting to Redis server...');
});

redisClient.on('ready', () => {
  console.log('✅ [Redis] Connected and ready to use');
});

redisClient.on('close', () => {
  console.log('🔴 [Redis] Connection closed');
});

redisClient.on('reconnecting', (delay) => {
  console.log(`🔄 [Redis] Reconnecting in ${delay}ms...`);
});

// Handle connection errors with retry
redisClient.on('end', () => {
  console.log('⚠️ [Redis] Connection ended');
});

// Export the shared Redis instance
module.exports = redisClient;

