/**
 * Redis Cleanup Job
 * Runs periodically to clean up Redis keys for inactive chargers
 * 
 * Usage:
 * - Run manually: node backend/scripts/redis-cleanup-job.js
 * - Schedule with cron: 0 2 * * * (runs daily at 2 AM)
 * - Or integrate with your task scheduler
 * 
 * This script finds chargers that have been offline for more than 30 days
 * and removes their Redis keys (ocpp:list, events, status, meter, heartbeat, etc.)
 */

const { cleanupInactiveChargers } = require('../redis/cleanup');

async function runCleanup() {
  try {
    console.log('🚀 [Cleanup Job] Starting Redis cleanup job...');
    const daysOffline = parseInt(process.env.REDIS_CLEANUP_DAYS || '30');
    const result = await cleanupInactiveChargers(daysOffline);
    console.log('✅ [Cleanup Job] Job completed:', result);
    process.exit(0);
  } catch (error) {
    console.error('❌ [Cleanup Job] Job failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runCleanup();
}

module.exports = { runCleanup };

