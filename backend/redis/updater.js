const redisClient = require('./redisClient');

/**
 * Updater for real-time keys from charging points
 * Updates ONLY real-time keys and must NOT modify static metadata
 * 
 * @param {string} cpId - Charging point device ID
 * @param {Object} updates - Update object with optional fields
 * @param {string} [updates.status] - Charger status (Available, Charging, Faulted, etc.)
 * @param {number} [updates.meter] - Latest meter value in kWh
 * @param {boolean|number} [updates.heartbeat] - Heartbeat boolean or timestamp
 * @param {string} [updates.errorCode] - Optional error code
 */
async function updater(cpId, updates = {}) {
  try {
    const { status, meter, heartbeat, errorCode } = updates;
    
    // Update status key with TTL of 60 seconds
    if (status !== undefined) {
      const statusKey = `status:${cpId}`;
      const statusValue = errorCode ? { status, errorCode } : { status };
      await redisClient.setex(statusKey, 60, JSON.stringify(statusValue));
    }
    
    // Update meter key with TTL of 30 seconds
    if (meter !== undefined) {
      const meterKey = `meter:${cpId}`;
      await redisClient.setex(meterKey, 30, JSON.stringify({ meter, timestamp: Date.now() }));
    }
    
    // Update heartbeat key with TTL of 60 seconds
    if (heartbeat !== undefined) {
      const heartbeatKey = `heartbeat:${cpId}`;
      const heartbeatValue = typeof heartbeat === 'boolean' 
        ? { heartbeat, timestamp: Date.now() }
        : { heartbeat: true, timestamp: heartbeat };
      await redisClient.setex(heartbeatKey, 60, JSON.stringify(heartbeatValue));
    }
    
    return true;
  } catch (error) {
    console.error(`❌ [Updater] Error updating keys for ${cpId}:`, error.message);
    return false;
  }
}

module.exports = updater;

