const redisClient = require('./redisClient');

/**
 * List Manager for high-frequency real-time streams from charging points
 * Handles: Raw OCPP messages, Recent charging point events, Meter values history,
 * Heartbeats, Status changes
 * 
 * Key formats:
 * - ocpp:list:<cpId>
 * - events:<cpId>
 * - meterHistory:<cpId>
 */

/**
 * Push a value to the front of a Redis list (LPUSH)
 * @param {string} key - Redis list key (e.g., 'ocpp:list:C1', 'events:C2')
 * @param {*} value - Value to push (will be JSON stringified)
 * @returns {Promise<number>} New length of the list, or -1 on error
 */
async function push(key, value) {
  try {
    const stringValue = JSON.stringify(value);
    const length = await redisClient.lpush(key, stringValue);
    return length;
  } catch (error) {
    console.error(`❌ [ListManager] Error pushing to list "${key}":`, error.message);
    return -1;
  }
}

/**
 * Get the last N items from a Redis list (LRANGE)
 * @param {string} key - Redis list key
 * @param {number} count - Number of items to retrieve (default: 10)
 * @returns {Promise<Array>} Array of parsed JSON values, or empty array on error
 */
async function getLast(key, count = 10) {
  try {
    // LRANGE: 0-based index, -1 means last element
    // To get last N items: start from -(count) to -1
    const start = -count;
    const end = -1;
    const values = await redisClient.lrange(key, start, end);
    
    // Parse JSON strings back to objects
    return values.map(value => {
      try {
        return JSON.parse(value);
      } catch (parseError) {
        console.error(`❌ [ListManager] Error parsing value from list "${key}":`, parseError.message);
        return value; // Return raw string if parsing fails
      }
    });
  } catch (error) {
    console.error(`❌ [ListManager] Error getting last items from list "${key}":`, error.message);
    return [];
  }
}

/**
 * Trim a Redis list to keep only the last N items (LTRIM)
 * @param {string} key - Redis list key
 * @param {number} maxLength - Maximum number of items to keep
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function trim(key, maxLength) {
  try {
    if (maxLength <= 0) {
      // If maxLength is 0 or negative, delete the entire list
      await redisClient.del(key);
      return true;
    }
    
    // LTRIM: keep items from -(maxLength) to -1 (last N items)
    // This removes items from the beginning, keeping only the most recent ones
    const start = -maxLength;
    const end = -1;
    await redisClient.ltrim(key, start, end);
    return true;
  } catch (error) {
    console.error(`❌ [ListManager] Error trimming list "${key}":`, error.message);
    return false;
  }
}

module.exports = {
  push,
  getLast,
  trim
};

