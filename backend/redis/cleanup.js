const redisClient = require('./redisClient');
const { 
  statusKey, 
  meterKey, 
  heartbeatKey, 
  ocppListKey, 
  eventsKey, 
  meterHistoryKey, 
  metadataKey 
} = require('./keyNaming');

/**
 * Clean up all Redis keys for a specific charger device
 * @param {string} deviceId - Charger device ID
 * @returns {Promise<number>} Number of keys deleted
 */
async function cleanupChargerKeys(deviceId) {
  if (!deviceId) {
    console.warn('⚠️ [Cleanup] No deviceId provided, skipping cleanup');
    return 0;
  }

  try {
    const keysToDelete = [
      statusKey(deviceId),
      meterKey(deviceId),
      heartbeatKey(deviceId),
      ocppListKey(deviceId),
      eventsKey(deviceId),
      meterHistoryKey(deviceId),
      metadataKey(deviceId)
    ];

    // Delete all keys
    const deletedCount = await redisClient.del(...keysToDelete);
    
    console.log(`✅ [Cleanup] Deleted ${deletedCount} Redis keys for charger ${deviceId}`);
    return deletedCount;
  } catch (error) {
    console.error(`❌ [Cleanup] Error cleaning up Redis keys for ${deviceId}:`, error.message);
    return 0;
  }
}

/**
 * Clean up Redis keys for chargers that have been offline for more than specified days
 * @param {number} daysOffline - Number of days offline threshold (default: 30)
 * @returns {Promise<{cleaned: number, errors: number, total: number}>} Cleanup statistics
 */
async function cleanupInactiveChargers(daysOffline = 30) {
  try {
    const Charger = require('../models/Charger');
    const { Op } = require('sequelize');
    
    // Calculate threshold date
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysOffline);
    
    console.log(`🧹 [Cleanup] Starting cleanup for chargers offline since ${thresholdDate.toISOString()}`);
    
    // Find chargers that haven't been seen for more than specified days
    const inactiveChargers = await Charger.findAll({
      where: {
        lastSeen: {
          [Op.lt]: thresholdDate
        }
      },
      attributes: ['deviceId', 'lastSeen']
    });
    
    console.log(`📊 [Cleanup] Found ${inactiveChargers.length} inactive chargers (offline > ${daysOffline} days)`);
    
    let cleaned = 0;
    let errors = 0;
    
    // Clean up Redis keys for each inactive charger
    for (const charger of inactiveChargers) {
      try {
        const deletedCount = await cleanupChargerKeys(charger.deviceId);
        if (deletedCount > 0) {
          cleaned++;
        }
      } catch (error) {
        console.error(`❌ [Cleanup] Error cleaning up charger ${charger.deviceId}:`, error.message);
        errors++;
      }
    }
    
    console.log(`✅ [Cleanup] Completed: ${cleaned} chargers cleaned, ${errors} errors`);
    
    return { cleaned, errors, total: inactiveChargers.length };
  } catch (error) {
    console.error('❌ [Cleanup] Error in cleanupInactiveChargers:', error.message);
    throw error;
  }
}

module.exports = {
  cleanupChargerKeys,
  cleanupInactiveChargers
};

