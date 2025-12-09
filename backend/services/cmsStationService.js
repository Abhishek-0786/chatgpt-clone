const { Station, ChargingPoint, Connector, Tariff, ChargingSession } = require('../models');
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const Customer = require('../models/Customer');
const cacheController = require('../libs/redis/cacheController');
const { statusKey } = require('../libs/redis/keyNaming');
const redisClient = require('../libs/redis/redisClient');
const { extractMeterValue } = require('../libs/ocpp');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishCMSEvent = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../libs/rabbitmq/producer');
    publishCMSEvent = producer.publishCMSEvent;
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
}

/**
 * Helper function to get system customer ID (cached for performance)
 */
let systemCustomerIdCache = null;
async function getSystemCustomerId() {
  if (systemCustomerIdCache !== null) {
    return systemCustomerIdCache;
  }
  try {
    const systemCustomer = await Customer.findOne({
      where: { email: 'system@cms.admin' },
      attributes: ['id']
    });
    systemCustomerIdCache = systemCustomer ? systemCustomer.id : null;
    return systemCustomerIdCache;
  } catch (error) {
    console.error('Error getting system customer ID:', error);
    return null;
  }
}

/**
 * Generate unique stationId
 */
async function generateUniqueStationId() {
  let stationId;
  let existingStation;
  do {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    stationId = `STN-${timestamp}-${randomStr}`;
    existingStation = await Station.findOne({ where: { stationId } });
  } while (existingStation);
  return stationId;
}

/**
 * Calculate session statistics for a device
 * CRITICAL: Also count ChargingSession records (for web app sessions)
 * This ensures sessions started from web app are included even if OCPP logs are missing/delayed
 * Exclude system customer sessions
 */
async function calculateSessionStats(deviceId, chargingPoint) {
  try {
    const systemCustomerId = await getSystemCustomerId();
    const chargingSessionsWhere = {
      deviceId: deviceId,
      status: {
        [Op.in]: ['stopped', 'completed']
      },
      endTime: {
        [Op.ne]: null
      }
    };
    if (systemCustomerId !== null) {
      chargingSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const chargingSessions = await ChargingSession.findAll({
      where: chargingSessionsWhere,
      attributes: ['id', 'transactionId', 'energyConsumed', 'finalAmount', 'startTime', 'endTime']
    });

    // Get all StartTransaction messages for this device
    const startTransactions = await ChargerData.findAll({
      where: {
        deviceId: deviceId,
        message: 'StartTransaction',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Get all StopTransaction messages for this device
    const stopTransactions = await ChargerData.findAll({
      where: {
        deviceId: deviceId,
        message: 'StopTransaction',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Create a map of transactionId -> StopTransaction
    const stopTransactionMap = new Map();
    stopTransactions.forEach(stop => {
      let transactionId = null;
      if (stop.messageData && stop.messageData.transactionId) {
        transactionId = stop.messageData.transactionId;
      } else if (stop.raw && Array.isArray(stop.raw) && stop.raw[2] && stop.raw[2].transactionId) {
        transactionId = stop.raw[2].transactionId;
      }
      if (transactionId) {
        stopTransactionMap.set(transactionId.toString(), stop);
      }
    });

    // Create a set of processed session IDs from ChargingSession records to avoid double counting
    const processedSessionIds = new Set();
    let totalSessions = 0;
    let totalEnergy = 0;
    let totalBilledAmount = 0;
    const processedTransactionIds = new Set();

    // Create a map of transactionIds from ChargingSession records to avoid double counting
    const chargingSessionTransactionIds = new Set();
    
    // First, count sessions from ChargingSession records (web app sessions)
    for (const session of chargingSessions) {
      processedSessionIds.add(session.id);
      totalSessions++;
      
      // Use session data if available, otherwise calculate from meter readings
      if (session.energyConsumed) {
        totalEnergy += parseFloat(session.energyConsumed);
      }
      if (session.finalAmount) {
        totalBilledAmount += parseFloat(session.finalAmount);
      }
      
      // Track transactionId if available to avoid double counting with OCPP logs
      if (session.transactionId) {
        chargingSessionTransactionIds.add(session.transactionId.toString());
      }
    }

    // Get tariff details
    const tariff = chargingPoint.tariff;
    const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
    const tax = tariff ? parseFloat(tariff.tax) : 0;

    for (const start of startTransactions) {
      // Get transactionId from StartTransaction response
      let transactionId = null;
      const startResponse = await ChargerData.findOne({
        where: {
          message: 'Response',
          messageId: start.messageId,
          direction: 'Outgoing'
        }
      });

      if (startResponse) {
        if (startResponse.messageData && startResponse.messageData.transactionId) {
          transactionId = startResponse.messageData.transactionId;
        } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
          transactionId = startResponse.raw[2].transactionId;
        }
      }

      // Fallback: try to get from StartTransaction itself
      if (!transactionId && start.messageData && start.messageData.transactionId) {
        transactionId = start.messageData.transactionId;
      } else if (!transactionId && start.raw && Array.isArray(start.raw)) {
        const payload = start.raw[2];
        if (payload && payload.transactionId) {
          transactionId = payload.transactionId;
        }
      }

      if (!transactionId || processedTransactionIds.has(transactionId.toString())) {
        continue;
      }

      // Skip if this transactionId is already counted from ChargingSession records (avoid double counting)
      if (chargingSessionTransactionIds.has(transactionId.toString())) {
        continue;
      }

      // Check if there's a StopTransaction for this transactionId
      const stop = stopTransactionMap.get(transactionId.toString());
      if (!stop) {
        continue; // No stop transaction, skip (it's active or incomplete)
      }

      processedTransactionIds.add(transactionId.toString());

      const startTime = new Date(start.timestamp || start.createdAt);
      const endTime = new Date(stop.timestamp || stop.createdAt);

      // Get meter_start from first MeterValues after StartTransaction
      let meterStart = null;
      const startMeterValues = await ChargerData.findOne({
        where: {
          deviceId: deviceId,
          message: 'MeterValues',
          direction: 'Incoming',
          timestamp: {
            [Op.gte]: startTime,
            [Op.lte]: endTime
          }
        },
        order: [['timestamp', 'ASC']],
        limit: 1
      });

      if (startMeterValues) {
        meterStart = extractMeterValue(startMeterValues);
      }

      // Get meter_end from last MeterValues before StopTransaction
      let meterEnd = null;
      const endMeterValues = await ChargerData.findOne({
        where: {
          deviceId: deviceId,
          message: 'MeterValues',
          direction: 'Incoming',
          timestamp: {
            [Op.gte]: startTime,
            [Op.lte]: endTime
          }
        },
        order: [['timestamp', 'DESC']],
        limit: 1
      });

      if (endMeterValues) {
        meterEnd = extractMeterValue(endMeterValues);
      }

      // Calculate energy: (meter_end - meter_start) / 1000
      let energy = 0;
      if (meterStart !== null && meterEnd !== null && meterEnd >= meterStart) {
        energy = (meterEnd - meterStart) / 1000;
        if (energy < 0) energy = 0; // Prevent negative values
      }

      // Calculate billed amount: (Energy × Base Charge) × (1 + Tax/100)
      const baseAmount = energy * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      const billedAmount = baseAmount * taxMultiplier;

      totalSessions++;
      totalEnergy += energy;
      totalBilledAmount += billedAmount;
    }

    return {
      sessions: totalSessions,
      energy: parseFloat(totalEnergy.toFixed(2)),
      billedAmount: parseFloat(totalBilledAmount.toFixed(2))
    };
  } catch (error) {
    console.error(`Error calculating session stats for deviceId ${deviceId}:`, error);
    return {
      sessions: 0,
      energy: 0,
      billedAmount: 0
    };
  }
}

/**
 * Calculate real-time status for a station based on charging points
 */
async function calculateStationRealTimeStatus(stationId) {
  try {
    const station = await Station.findOne({
      where: {
        stationId,
        deleted: false
      }
    });

    if (!station) {
      return null;
    }

    const ChargingPoint = require('../models/ChargingPoint');
    
    // Get all charging points for this station
    const chargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: station.id,
        deleted: false
      },
      attributes: ['id', 'deviceId']
    });

    let onlineCPs = 0;
    const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    if (chargingPoints.length > 0) {
      // Check each charging point's online status
      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          const charger = await Charger.findOne({
            where: { deviceId: cp.deviceId },
            attributes: ['lastSeen']
          });

          if (charger && charger.lastSeen) {
            const lastActiveTime = new Date(charger.lastSeen);
            const now = new Date();
            const timeDiff = now - lastActiveTime;
            const isOnline = timeDiff <= OFFLINE_THRESHOLD;
            
            if (isOnline) {
              onlineCPs++;
            }
          }
        }
      }
    }

    // Determine station status: Online if at least 1 CP is online, otherwise Offline
    const stationStatus = onlineCPs >= 1 ? 'Online' : 'Offline';

    return {
      status: stationStatus,
      onlineCPs,
      totalCPs: chargingPoints.length
    };
  } catch (error) {
    console.error(`Error calculating real-time status for station ${stationId}:`, error);
    return null;
  }
}

/**
 * Calculate session statistics for a station
 */
async function calculateStationSessionStats(stationId) {
  try {
    const station = await Station.findOne({
      where: {
        stationId,
        deleted: false
      }
    });

    if (!station) {
      return null;
    }

    const chargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: station.id,
        deleted: false
      },
      include: [
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
        }
      ],
      attributes: ['id', 'deviceId']
    });

    let totalSessions = 0;
    let totalEnergy = 0;
    let totalBilledAmount = 0;

    for (const cp of chargingPoints) {
      if (cp.deviceId) {
        const sessionStats = await calculateSessionStats(cp.deviceId, cp);
        totalSessions += sessionStats.sessions;
        totalEnergy += sessionStats.energy;
        totalBilledAmount += sessionStats.billedAmount;
      }
    }

    return {
      sessions: totalSessions,
      energy: parseFloat(totalEnergy.toFixed(2)),
      billedAmount: parseFloat(totalBilledAmount.toFixed(2))
    };
  } catch (error) {
    console.error(`Error calculating session stats for station ${stationId}:`, error);
    return {
      sessions: 0,
      energy: 0,
      billedAmount: 0
    };
  }
}

/**
 * Enhance stations with real-time status from charging points
 */
async function enhanceStationsWithRealTimeStatus(stations) {
  try {
    if (!stations || !Array.isArray(stations) || stations.length === 0) {
      return stations;
    }

    const ChargingPoint = require('../models/ChargingPoint');
    
    // Get all charging points for all stations in one query
    const stationIds = stations.map(s => s.id);
    const allChargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: { [Op.in]: stationIds },
        deleted: false
      },
      attributes: ['id', 'deviceId', 'stationId']
    });

    // Group charging points by station
    const cpByStation = new Map();
    allChargingPoints.forEach(cp => {
      if (!cpByStation.has(cp.stationId)) {
        cpByStation.set(cp.stationId, []);
      }
      cpByStation.get(cp.stationId).push(cp);
    });

    // Get all deviceIds and batch read status from Redis
    const allDeviceIds = allChargingPoints.map(cp => cp.deviceId).filter(Boolean);
    const statusPromises = allDeviceIds.map(deviceId => {
      const key = statusKey(deviceId);
      return redisClient.get(key).then(value => ({
        deviceId,
        statusData: value ? JSON.parse(value) : null
      })).catch(() => ({
        deviceId,
        statusData: null
      }));
    });

    const statusResults = await Promise.all(statusPromises);
    const deviceStatusMap = new Map();
    statusResults.forEach(result => {
      if (result.statusData) {
        deviceStatusMap.set(result.deviceId, result.statusData.status);
      }
    });

    // Batch read lastSeen for fallback
    const chargerDataMap = new Map();
    if (allDeviceIds.length > 0) {
      const chargers = await Charger.findAll({
        where: { deviceId: { [Op.in]: allDeviceIds } },
        attributes: ['deviceId', 'lastSeen']
      });
      chargers.forEach(c => {
        chargerDataMap.set(c.deviceId, c.lastSeen);
      });
    }

    // Enhance stations with real-time status
    const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    const enhancedStations = stations.map(station => {
      const chargingPoints = cpByStation.get(station.id) || [];
      let onlineCPs = 0;

      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          const realTimeStatus = deviceStatusMap.get(cp.deviceId);
          if (realTimeStatus) {
            // Check if OCPP status indicates online
            const onlineStatuses = ['Available', 'Charging', 'Preparing', 'Finishing'];
            if (onlineStatuses.includes(realTimeStatus)) {
              onlineCPs++;
            }
          } else {
            // Fallback to lastSeen check
            const lastSeen = chargerDataMap.get(cp.deviceId);
            if (lastSeen) {
              const lastActiveTime = new Date(lastSeen);
              const now = new Date();
              const timeDiff = now - lastActiveTime;
              if (timeDiff <= OFFLINE_THRESHOLD) {
                onlineCPs++;
              }
            }
          }
        }
      }

      const stationStatus = onlineCPs >= 1 ? 'Online' : 'Offline';
      return {
        ...station,
        status: stationStatus,
        onlineCPs: onlineCPs,
        offlineCPs: chargingPoints.length - onlineCPs,
        onlineCPsPercent: chargingPoints.length > 0 ? Math.round((onlineCPs / chargingPoints.length) * 100) : 0,
        offlineCPsPercent: chargingPoints.length > 0 ? Math.round(((chargingPoints.length - onlineCPs) / chargingPoints.length) * 100) : 0
      };
    });

    // Re-sort stations with updated status
    enhancedStations.sort((a, b) => {
      if (a.status === 'Online' && b.status !== 'Online') return -1;
      if (a.status !== 'Online' && b.status === 'Online') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return enhancedStations;
  } catch (error) {
    console.error('Error enhancing stations with real-time status:', error);
    return stations;
  }
}

/**
 * Get all stations with pagination and filters
 */
async function getAllStations(filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  const { search, status, organization } = filters;

  // Build cache key with query params
  const cacheKey = `stations:list:page:${page}:limit:${limit}:search:${search || 'none'}:status:${status || 'all'}:org:${organization || 'all'}`;

  // Try to get from cache
  const cached = await cacheController.get(cacheKey);
  if (cached) {
    // Enhance cached response with real-time status from charging points
    if (cached.stations && Array.isArray(cached.stations)) {
      const enhancedStations = await enhanceStationsWithRealTimeStatus(cached.stations);
      return {
        ...cached,
        stations: enhancedStations
      };
    }
    return cached;
  }

  // Build where clause
  const where = {
    deleted: false // Only show non-deleted stations
  };

  // Add search filter
  if (search) {
    where[Op.or] = [
      { stationId: { [Op.iLike]: `%${search}%` } },
      { stationName: { [Op.iLike]: `%${search}%` } },
      { city: { [Op.iLike]: `%${search}%` } },
      { state: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Add status filter
  if (status) {
    where.status = status;
  }

  // Add organization filter
  if (organization) {
    where.organization = organization;
  }

  // Get total count
  const total = await Station.count({ where });

  // Get ALL stations (without pagination) so we can sort by status globally
  const allStations = await Station.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });

  // Calculate online/offline stats and session statistics for each station
  const stationsWithStats = await Promise.all(allStations.map(async (station) => {
    // Get all charging points for this station with tariff information
    const chargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: station.id,
        deleted: false
      },
      include: [
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
        }
      ],
      attributes: ['id', 'deviceId']
    });

    const totalCPs = chargingPoints.length;
    let onlineCPs = 0;
    let offlineCPs = 0;
    let totalSessions = 0;
    let totalEnergy = 0;
    let totalBilledAmount = 0;

    if (totalCPs > 0) {
      // Check each charging point's online status and calculate session stats
      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          const charger = await Charger.findOne({
            where: { deviceId: cp.deviceId },
            attributes: ['lastSeen']
          });

          if (charger && charger.lastSeen) {
            const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
            const lastActiveTime = new Date(charger.lastSeen);
            const now = new Date();
            const timeDiff = now - lastActiveTime;
            const isOnline = timeDiff <= OFFLINE_THRESHOLD;
            
            if (isOnline) {
              onlineCPs++;
            } else {
              offlineCPs++;
            }
          } else {
            offlineCPs++;
          }

          // Calculate session statistics for this charging point
          const sessionStats = await calculateSessionStats(cp.deviceId, cp);
          totalSessions += sessionStats.sessions;
          totalEnergy += sessionStats.energy;
          totalBilledAmount += sessionStats.billedAmount;
        } else {
          offlineCPs++;
        }
      }
    }

    // Calculate percentages
    const onlineCPsPercent = totalCPs > 0 ? Math.round((onlineCPs / totalCPs) * 100) : 0;
    const offlineCPsPercent = totalCPs > 0 ? Math.round((offlineCPs / totalCPs) * 100) : 0;

    // Determine station status: Online if at least 1 CP is online, otherwise Offline
    const stationStatus = onlineCPs >= 1 ? 'Online' : 'Offline';

    return {
      id: station.id,
      stationId: station.stationId,
      stationName: station.stationName,
      organization: station.organization,
      status: stationStatus,
      city: station.city,
      state: station.state,
      country: station.country,
      chargers: totalCPs,
      sessions: totalSessions,
      billedAmount: parseFloat(totalBilledAmount.toFixed(2)),
      energy: parseFloat(totalEnergy.toFixed(2)),
      onlineCPsPercent: onlineCPsPercent,
      onlineCPs: onlineCPs,
      offlineCPsPercent: offlineCPsPercent,
      offlineCPs: offlineCPs,
      createdAt: station.createdAt,
      updatedAt: station.updatedAt
    };
  }));

  // Sort stations: Online first, then Offline, then by createdAt DESC
  stationsWithStats.sort((a, b) => {
    // First sort by status: Online comes before Offline
    if (a.status === 'Online' && b.status !== 'Online') return -1;
    if (a.status !== 'Online' && b.status === 'Online') return 1;
    // If same status, sort by createdAt DESC (newest first)
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Apply pagination AFTER sorting
  const paginatedStations = stationsWithStats.slice(offset, offset + limit);

  const response = {
    success: true,
    stations: paginatedStations,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };

  // Cache the response
  await cacheController.set(cacheKey, response, 300);

  return response;
}

/**
 * Get all active stations for dropdown (no pagination)
 */
async function getStationsDropdown() {
  const stations = await Station.findAll({
    where: {
      deleted: false,
      status: 'Active' // Only show active stations in dropdown
    },
    attributes: ['id', 'stationId', 'stationName', 'organization'],
    order: [['stationName', 'ASC']]
  });

  return {
    success: true,
    stations: stations.map(station => ({
      id: station.id,
      stationId: station.stationId,
      stationName: station.stationName,
      organization: station.organization
    }))
  };
}

/**
 * Get single station by stationId
 */
async function getStationById(stationId) {
  // Check cache first
  const cacheKey = `station:detail:${stationId}`;
  const cached = await cacheController.get(cacheKey);
  
  if (cached) {
    console.log(`✅ [Cache] Station detail cache hit for ${stationId}`);
    return cached;
  }

  console.log(`❌ [Cache] Station detail cache miss for ${stationId}, fetching from DB`);

  const station = await Station.findOne({
    where: {
      stationId,
      deleted: false
    }
  });

  if (!station) {
    return null;
  }

  // Calculate real-time status based on charging points
  const ChargingPoint = require('../models/ChargingPoint');
  
  // Get all charging points for this station
  const chargingPoints = await ChargingPoint.findAll({
    where: {
      stationId: station.id,
      deleted: false
    },
    attributes: ['id', 'deviceId']
  });

  let onlineCPs = 0;
  const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  if (chargingPoints.length > 0) {
    // Check each charging point's online status
    for (const cp of chargingPoints) {
      if (cp.deviceId) {
        const charger = await Charger.findOne({
          where: { deviceId: cp.deviceId },
          attributes: ['lastSeen']
        });

        if (charger && charger.lastSeen) {
          const lastActiveTime = new Date(charger.lastSeen);
          const now = new Date();
          const timeDiff = now - lastActiveTime;
          const isOnline = timeDiff <= OFFLINE_THRESHOLD;
          
          if (isOnline) {
            onlineCPs++;
          }
        }
      }
    }
  }

  // Determine station status: Online if at least 1 CP is online, otherwise Offline
  const stationStatus = onlineCPs >= 1 ? 'Online' : 'Offline';

  const result = {
    success: true,
    station: {
      id: station.id,
      stationId: station.stationId,
      stationName: station.stationName,
      organization: station.organization,
      status: stationStatus, // Return real-time calculated status (Online/Offline) for display
      storedStatus: station.status || 'Active', // Store the original status (Active/Inactive/Maintenance) for editing
      powerCapacity: station.powerCapacity ? parseFloat(station.powerCapacity) : null,
      gridPhase: station.gridPhase,
      pinCode: station.pinCode,
      city: station.city,
      state: station.state,
      country: station.country || null, // Ensure country is returned even if null
      latitude: station.latitude ? parseFloat(station.latitude) : null,
      longitude: station.longitude ? parseFloat(station.longitude) : null,
      fullAddress: station.fullAddress,
      openingTime: station.openingTime,
      closingTime: station.closingTime,
      open24Hours: station.open24Hours,
      workingDays: Array.isArray(station.workingDays) ? station.workingDays : [], // Ensure it's always an array
      allDays: station.allDays,
      contactNumber: station.contactNumber,
      inchargeName: station.inchargeName,
      ownerName: station.ownerName,
      ownerContact: station.ownerContact,
      sessionStartStopSMS: station.sessionStartStopSMS,
      amenities: Array.isArray(station.amenities) ? station.amenities : [], // Ensure it's always an array
      createdBy: station.createdBy,
      createdAt: station.createdAt,
      updatedAt: station.updatedAt
    }
  };

  // Cache the result for 5 minutes (300 seconds)
  // Note: Status is real-time, so shorter TTL ensures status updates reasonably quickly
  await cacheController.set(cacheKey, result, 300);
  console.log(`✅ [Cache] Station detail cached for ${stationId} (TTL: 300s)`);

  return result;
}

/**
 * Helper function to invalidate all stations list cache entries
 * This ensures the list is refreshed immediately after create/update/delete operations
 */
async function invalidateStationsListCache() {
  try {
    // Get all cache keys matching the stations:list pattern
    const keys = await redisClient.keys('stations:list:*');
    if (keys && keys.length > 0) {
      await Promise.all(keys.map(key => cacheController.del(key)));
      console.log(`✅ [Cache] Invalidated ${keys.length} stations list cache entries`);
    }
  } catch (error) {
    console.warn('⚠️ [Cache] Failed to invalidate stations list cache:', error.message);
    // Don't fail the operation if cache invalidation fails
  }
}

/**
 * Helper function to invalidate station detail cache
 * This ensures the detail view is refreshed immediately after update/delete operations
 */
async function invalidateStationDetailCache(stationId) {
  try {
    const cacheKey = `station:detail:${stationId}`;
    await cacheController.del(cacheKey);
    console.log(`✅ [Cache] Invalidated station detail cache for ${stationId}`);
  } catch (error) {
    console.warn(`⚠️ [Cache] Failed to invalidate station detail cache for ${stationId}:`, error.message);
    // Don't fail the operation if cache invalidation fails
  }
}

/**
 * Create new station
 */
async function createStation(stationData) {
  const {
    stationName,
    organization,
    status,
    powerCapacity,
    gridPhase,
    pinCode,
    city,
    state,
    country,
    latitude,
    longitude,
    fullAddress,
    openingTime,
    closingTime,
    open24Hours,
    workingDays,
    allDays,
    contactNumber,
    inchargeName,
    ownerName,
    ownerContact,
    sessionStartStopSMS,
    amenities,
    createdBy
  } = stationData;

  // Generate unique stationId
  const stationId = await generateUniqueStationId();

  // Create station
  const station = await Station.create({
    stationId,
    stationName,
    organization,
    status: status || 'Active',
    powerCapacity: powerCapacity ? parseFloat(powerCapacity) : null,
    gridPhase,
    pinCode: pinCode || null,
    city: city || null,
    state: state || null,
    country,
    latitude: latitude ? parseFloat(latitude) : null,
    longitude: longitude ? parseFloat(longitude) : null,
    fullAddress: fullAddress || null,
    openingTime: openingTime || null,
    closingTime: closingTime || null,
    open24Hours: open24Hours || false,
    workingDays: Array.isArray(workingDays) ? workingDays : [],
    allDays: allDays || false,
    contactNumber: contactNumber || null,
    inchargeName: inchargeName || null,
    ownerName: ownerName || null,
    ownerContact: ownerContact || null,
    sessionStartStopSMS: sessionStartStopSMS || false,
    amenities: Array.isArray(amenities) ? amenities : [],
    createdBy: createdBy || null,
    deleted: false
  });

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.station.created',
        data: {
          stationId: station.stationId,
          id: station.id,
          stationName: station.stationName,
          organization: station.organization,
          createdBy: createdBy
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.station.created event for ${station.stationId}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.station.created event:', rabbitmqError.message);
      // Don't fail the request if RabbitMQ fails
    }
  }

  // Invalidate stations list cache so the new station appears immediately
  await invalidateStationsListCache();

  return {
    success: true,
    message: 'Station created successfully',
    station: {
      id: station.id,
      stationId: station.stationId,
      stationName: station.stationName,
      organization: station.organization,
      status: station.status,
      createdAt: station.createdAt
    }
  };
}

/**
 * Update station
 */
async function updateStation(stationId, updateData) {
  // Find station
  const station = await Station.findOne({
    where: {
      stationId,
      deleted: false
    }
  });

  if (!station) {
    return null;
  }

  // Prepare update data
  // Helper to convert empty string to null for optional fields
  const toNullIfEmpty = (value) => (value === '' || value === undefined) ? null : value;
  
  const dataToUpdate = {};
  if (updateData.stationName !== undefined) dataToUpdate.stationName = updateData.stationName;
  if (updateData.organization !== undefined) dataToUpdate.organization = updateData.organization;
  if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
  if (updateData.powerCapacity !== undefined) {
    dataToUpdate.powerCapacity = (updateData.powerCapacity === '' || updateData.powerCapacity === null || updateData.powerCapacity === undefined) 
      ? null 
      : parseFloat(updateData.powerCapacity);
  }
  if (updateData.gridPhase !== undefined) dataToUpdate.gridPhase = updateData.gridPhase;
  if (updateData.pinCode !== undefined) dataToUpdate.pinCode = toNullIfEmpty(updateData.pinCode);
  if (updateData.city !== undefined) dataToUpdate.city = toNullIfEmpty(updateData.city);
  if (updateData.state !== undefined) dataToUpdate.state = toNullIfEmpty(updateData.state);
  if (updateData.country !== undefined) {
    // Country should not be empty string - convert to null if empty
    dataToUpdate.country = (updateData.country === '' || updateData.country === null) ? null : updateData.country;
  }
  if (updateData.latitude !== undefined) {
    dataToUpdate.latitude = (updateData.latitude === '' || updateData.latitude === null || updateData.latitude === undefined)
      ? null
      : parseFloat(updateData.latitude);
  }
  if (updateData.longitude !== undefined) {
    dataToUpdate.longitude = (updateData.longitude === '' || updateData.longitude === null || updateData.longitude === undefined)
      ? null
      : parseFloat(updateData.longitude);
  }
  if (updateData.fullAddress !== undefined) dataToUpdate.fullAddress = toNullIfEmpty(updateData.fullAddress);
  if (updateData.openingTime !== undefined) dataToUpdate.openingTime = toNullIfEmpty(updateData.openingTime);
  if (updateData.closingTime !== undefined) dataToUpdate.closingTime = toNullIfEmpty(updateData.closingTime);
  // Boolean fields - explicitly check for boolean type to preserve false values
  if (updateData.open24Hours !== undefined) dataToUpdate.open24Hours = Boolean(updateData.open24Hours);
  if (updateData.workingDays !== undefined) dataToUpdate.workingDays = Array.isArray(updateData.workingDays) ? updateData.workingDays : [];
  if (updateData.allDays !== undefined) dataToUpdate.allDays = Boolean(updateData.allDays);
  if (updateData.contactNumber !== undefined) dataToUpdate.contactNumber = toNullIfEmpty(updateData.contactNumber);
  if (updateData.inchargeName !== undefined) dataToUpdate.inchargeName = toNullIfEmpty(updateData.inchargeName);
  if (updateData.ownerName !== undefined) dataToUpdate.ownerName = toNullIfEmpty(updateData.ownerName);
  if (updateData.ownerContact !== undefined) dataToUpdate.ownerContact = toNullIfEmpty(updateData.ownerContact);
  if (updateData.sessionStartStopSMS !== undefined) dataToUpdate.sessionStartStopSMS = Boolean(updateData.sessionStartStopSMS);
  if (updateData.amenities !== undefined) dataToUpdate.amenities = Array.isArray(updateData.amenities) ? updateData.amenities : [];

  // Update station
  await station.update(dataToUpdate);

  // Reload to get updated data
  await station.reload();

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.station.updated',
        data: {
          stationId: station.stationId,
          id: station.id,
          stationName: station.stationName
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.station.updated event for ${station.stationId}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.station.updated event:', rabbitmqError.message);
      // Don't fail the request if RabbitMQ fails
    }
  }

  // Invalidate caches after update
  await invalidateStationDetailCache(station.stationId);
  await invalidateStationsListCache();

  return {
    success: true,
    message: 'Station updated successfully',
    station: {
      id: station.id,
      stationId: station.stationId,
      stationName: station.stationName,
      organization: station.organization,
      status: station.status,
      createdAt: station.createdAt,
      updatedAt: station.updatedAt
    }
  };
}

/**
 * Delete station (soft delete)
 */
async function deleteStation(stationId) {
  // Find station
  const station = await Station.findOne({
    where: {
      stationId,
      deleted: false
    }
  });

  if (!station) {
    return null;
  }

  // Soft delete
  await station.update({ deleted: true });

  // Invalidate caches after delete
  await invalidateStationDetailCache(station.stationId);
  await invalidateStationsListCache();

  return {
    success: true,
    message: 'Station deleted successfully',
    stationId: station.stationId
  };
}

module.exports = {
  getAllStations,
  getStationsDropdown,
  getStationById,
  createStation,
  updateStation,
  deleteStation,
  generateUniqueStationId,
  calculateStationRealTimeStatus,
  calculateStationSessionStats,
  enhanceStationsWithRealTimeStatus,
  calculateSessionStats
};

