/**
 * Redis Key Naming Utilities
 * Centralizes Redis key naming to avoid mistakes and ensure consistent keys
 */

/**
 * Get status key for a charging point
 * @param {string} cpId - Charging point device ID
 * @returns {string} Redis key: status:<cpId>
 */
function statusKey(cpId) {
  return `status:${cpId}`;
}

/**
 * Get meter key for a charging point
 * @param {string} cpId - Charging point device ID
 * @returns {string} Redis key: meter:<cpId>
 */
function meterKey(cpId) {
  return `meter:${cpId}`;
}

/**
 * Get heartbeat key for a charging point
 * @param {string} cpId - Charging point device ID
 * @returns {string} Redis key: heartbeat:<cpId>
 */
function heartbeatKey(cpId) {
  return `heartbeat:${cpId}`;
}

/**
 * Get OCPP list key for a charging point
 * @param {string} cpId - Charging point device ID
 * @returns {string} Redis key: ocpp:list:<cpId>
 */
function ocppListKey(cpId) {
  return `ocpp:list:${cpId}`;
}

/**
 * Get events key for a charging point
 * @param {string} cpId - Charging point device ID
 * @returns {string} Redis key: events:<cpId>
 */
function eventsKey(cpId) {
  return `events:${cpId}`;
}

/**
 * Get meter history key for a charging point
 * @param {string} cpId - Charging point device ID
 * @returns {string} Redis key: meterHistory:<cpId>
 */
function meterHistoryKey(cpId) {
  return `meterHistory:${cpId}`;
}

/**
 * Get metadata key for a charging point
 * @param {string} cpId - Charging point device ID
 * @returns {string} Redis key: metadata:<cpId>
 */
function metadataKey(cpId) {
  return `metadata:${cpId}`;
}

/**
 * Get charging points list key for a station
 * @param {string|number} stationId - Station ID
 * @returns {string} Redis key: station:points:<stationId>
 */
function stationChargingPointsKey(stationId) {
  return `station:points:${stationId}`;
}

/**
 * Get dashboard stats key
 * @returns {string} Redis key: dashboard:stats
 */
function dashboardStatsKey() {
  return 'dashboard:stats';
}

/**
 * Get dashboard charts key
 * @returns {string} Redis key: dashboard:charts
 */
function dashboardChartsKey() {
  return 'dashboard:charts';
}

module.exports = {
  statusKey,
  meterKey,
  heartbeatKey,
  ocppListKey,
  eventsKey,
  meterHistoryKey,
  metadataKey,
  stationChargingPointsKey,
  dashboardStatsKey,
  dashboardChartsKey
};

