/**
 * Charger Manager
 * Handles charger-related business logic
 * TODO: Move this to ChargerMicroservice when implemented
 * 
 * Now uses REST API and RabbitMQ instead of direct database access
 */

const apiClient = require('../utils/api_client');
const rabbitmqProducer = require('../rabbitmq/producer');

// Per-device charger cache to reduce API calls
const chargerCache = new Map(); // deviceId -> { charger, timestamp }

const CACHE_TTL = 60000; // 1 minute cache

/**
 * Ensure charger exists (create if not exists)
 * Uses REST API to communicate with backend
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object>} Charger object (with id field)
 */
async function ensureCharger(deviceId) {
  // Check cache first
  const cached = chargerCache.get(deviceId);
  if (cached && cached.charger && cached.charger.id && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.charger;
  }

  try {
    // Try to get existing charger
    let charger = await apiClient.getCharger(deviceId);

    // If not found (404 is expected for new chargers), create it
    if (!charger || !charger.id) {
      console.log(`📝 Charger not found, creating new charger: ${deviceId}`);
      charger = await apiClient.createOrUpdateCharger(deviceId, {
        name: deviceId,
        status: 'Available', // Use 'Available' instead of 'offline' (valid ENUM value)
        vendor: 'Unknown',
        model: 'Unknown',
        serialNumber: 'Unknown',
        firmwareVersion: 'Unknown',
        connectorCount: 0,
        powerRating: 0
      });

      if (charger && charger.id) {
        console.log(`✅ Created new charger via API: ${deviceId} (id: ${charger.id})`);
      }
    }

    // Cache the charger
    if (charger && charger.id) {
      chargerCache.set(deviceId, { charger, timestamp: Date.now() });
    }

    return charger;
  } catch (error) {
    console.error(`❌ Error ensuring charger ${deviceId}:`, error.message);
    // Return minimal object to prevent crashes
    return { id: null, deviceId };
  }
}

/**
 * Update charger's last seen timestamp
 * Uses REST API or RabbitMQ event
 * @param {string} deviceId - Device identifier
 */
async function updateLastSeen(deviceId) {
  try {
    // Try REST API first
    const success = await apiClient.updateChargerLastSeen(deviceId);
    if (!success) {
      // Fallback to RabbitMQ event
      await rabbitmqProducer.publishOCPPMessage({
        deviceId,
        messageType: 'charger.lastSeen',
        payload: { deviceId, lastSeen: new Date() },
        timestamp: new Date()
      }, 3);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to update lastSeen for ${deviceId}:`, error.message);
  }
}

/**
 * Update charger status
 * Uses REST API or RabbitMQ event
 * @param {string} deviceId - Device identifier
 * @param {string} status - New status
 */
async function updateChargerStatus(deviceId, status) {
  try {
    // Invalidate cache
    chargerCache.delete(deviceId);

    // Try REST API first
    const success = await apiClient.updateChargerStatus(deviceId, status);
    if (!success) {
      // Fallback to RabbitMQ event
      await rabbitmqProducer.publishOCPPMessage({
        deviceId,
        messageType: 'charger.statusUpdate',
        payload: { deviceId, status },
        timestamp: new Date()
      }, 5);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to update charger status for ${deviceId}:`, error.message);
  }
}

/**
 * Update charger metadata from OCPP messages
 * Publishes events to RabbitMQ for backend to process
 * @param {string} deviceId - Device identifier
 * @param {Object} charger - Charger object (may be minimal)
 * @param {Object} parsed - Parsed OCPP message
 */
async function updateChargerMetadataFromOcpp(deviceId, charger, parsed) {
  if (!parsed || parsed.kind !== 'CALL') return;
  const action = parsed.action;
  const payload = parsed.payload || {};

  const updates = {};

  // BootNotification: Extract vendor, model, serialNumber, firmwareVersion
  if (action === 'BootNotification') {
    if (payload.chargePointVendor) {
      updates.vendor = payload.chargePointVendor;
    }
    if (payload.chargePointModel) {
      updates.model = payload.chargePointModel;
    }
    if (payload.chargePointSerialNumber) {
      updates.serialNumber = payload.chargePointSerialNumber;
    }
    if (payload.firmwareVersion) {
      updates.firmwareVersion = payload.firmwareVersion;
    }

    if (Object.keys(updates).length > 0) {
      // Publish to RabbitMQ for backend to process
      await rabbitmqProducer.publishOCPPMessage({
        deviceId,
        messageType: 'charger.metadataUpdate',
        payload: { deviceId, ...updates },
        timestamp: new Date()
      }, 5);
      console.log(`✅ Published charger metadata update for ${deviceId}:`, updates);
    }
    return;
  }

  // StatusNotification: Track connector count
  if (action === 'StatusNotification') {
    const connectorId = Number(payload.connectorId);
    if (!Number.isNaN(connectorId) && connectorId > 0) {
      await rabbitmqProducer.publishOCPPMessage({
        deviceId,
        messageType: 'charger.connectorCountUpdate',
        payload: { deviceId, connectorId },
        timestamp: new Date()
      }, 5);
      console.log(`🔧 Published connectorCount update for ${deviceId} → ${connectorId}`);
    }
    return;
  }

  // MeterValues: Infer power rating
  if (action === 'MeterValues') {
    const meterValue = Array.isArray(payload.meterValue) ? payload.meterValue : [];
    let inferredKw = undefined;

    for (const mv of meterValue) {
      const sv = Array.isArray(mv.sampledValue) ? mv.sampledValue : [];
      // Prefer direct power measurand
      const powerSv = sv.find(x => (x.measurand === 'Power.Active.Import' || x.measurand === 'Power.Active.Export'));
      if (powerSv && powerSv.value != null) {
        const unit = (powerSv.unit || '').toLowerCase();
        const val = Number(powerSv.value);
        if (!Number.isNaN(val)) {
          if (unit === 'w' || unit === '') inferredKw = val / 1000;
          else if (unit === 'kw') inferredKw = val;
        }
      }
      // If no direct power, try Voltage × Current
      if (inferredKw === undefined) {
        const vSv = sv.find(x => x.measurand === 'Voltage');
        const cSv = sv.find(x => x.measurand === 'Current.Import' || x.measurand === 'Current.Export' || x.measurand === 'Current');
        const v = vSv ? Number(vSv.value) : NaN;
        const c = cSv ? Number(cSv.value) : NaN;
        if (!Number.isNaN(v) && !Number.isNaN(c)) {
          inferredKw = (v * c) / 1000; // simple single-phase estimate
        }
      }
      if (inferredKw !== undefined) break;
    }

    if (inferredKw !== undefined && inferredKw > 0) {
      await rabbitmqProducer.publishOCPPMessage({
        deviceId,
        messageType: 'charger.powerRatingUpdate',
        payload: { deviceId, powerRating: inferredKw },
        timestamp: new Date()
      }, 3);
      console.log(`⚡ Published powerRating update for ${deviceId} → ${inferredKw.toFixed(2)} kW`);
    }
  }
}

/**
 * Get charger by device ID
 * Uses REST API with caching
 * @param {string} deviceId - Device identifier
 * @returns {Promise<Object|null>} Charger object
 */
async function getCharger(deviceId) {
  // Check cache first
  const cached = chargerCache.get(deviceId);
  if (cached && cached.charger && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.charger;
  }

  try {
    const charger = await apiClient.getCharger(deviceId);
    if (charger && charger.id) {
      chargerCache.set(deviceId, { charger, timestamp: Date.now() });
    }
    return charger;
  } catch (error) {
    console.error(`❌ Error getting charger ${deviceId}:`, error.message);
    return null;
  }
}

module.exports = {
  ensureCharger,
  updateLastSeen,
  updateChargerStatus,
  updateChargerMetadataFromOcpp,
  getCharger
};
