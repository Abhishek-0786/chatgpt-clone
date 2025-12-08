const redisClient = require('./redisClient');

/**
 * Cache Controller for static or semi-static data
 * Used for: Stations list, Charging points list, Connector metadata,
 * Tariffs, Customer profiles, Dashboard summary data
 */

/**
 * Get a value from cache
 * @param {string} key - Cache key
 * @returns {Promise<*|null>} Parsed JSON value or null if key doesn't exist
 */
async function get(key) {
  try {
    const value = await redisClient.get(key);
    
    if (value === null) {
      return null;
    }
    
    return JSON.parse(value);
  } catch (error) {
    console.error(`❌ [Cache] Error getting key "${key}":`, error.message);
    return null;
  }
}

/**
 * Set a value in cache with optional TTL
 * @param {string} key - Cache key
 * @param {*} value - Value to cache (will be JSON stringified)
 * @param {number} [ttl] - Time to live in seconds (optional)
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
async function set(key, value, ttl = null) {
  try {
    const stringValue = JSON.stringify(value);
    
    if (ttl && ttl > 0) {
      await redisClient.setex(key, ttl, stringValue);
    } else {
      await redisClient.set(key, stringValue);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ [Cache] Error setting key "${key}":`, error.message);
    return false;
  }
}

/**
 * Delete a key from cache
 * @param {string} key - Cache key to delete
 * @returns {Promise<boolean>} True if key was deleted, false otherwise
 */
async function del(key) {
  try {
    const result = await redisClient.del(key);
    return result > 0;
  } catch (error) {
    console.error(`❌ [Cache] Error deleting key "${key}":`, error.message);
    return false;
  }
}

module.exports = {
  get,
  set,
  del
};

