const { ChargingPoint, Station, Connector, Tariff, ChargingSession } = require('../models');
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const Customer = require('../models/Customer');
const cacheController = require('../libs/redis/cacheController');
const { statusKey } = require('../libs/redis/keyNaming');
const redisClient = require('../libs/redis/redisClient');
const { cleanupChargerKeys } = require('../libs/redis/cleanup');
const cmsStationService = require('./cmsStationService'); // For calculateSessionStats

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
 * Map OCPP status to Online/Offline
 */
function mapOCPPStatusToOnlineOffline(ocppStatus) {
  if (!ocppStatus) return 'Offline';
  
  const onlineStatuses = ['Available', 'Charging', 'Preparing', 'Finishing'];
  const offlineStatuses = ['Faulted', 'Unavailable', 'Offline'];
  
  if (onlineStatuses.includes(ocppStatus)) {
    return 'Online';
  } else if (offlineStatuses.includes(ocppStatus)) {
    return 'Offline';
  }
  
  // Default to checking if it's a valid status that indicates online
  return 'Offline';
}

/**
 * Helper function to enhance cached responses with real-time status from Redis
 */
async function enhanceWithRealTimeStatus(items, deviceIdField = 'deviceId') {
  if (!Array.isArray(items)) {
    return items;
  }

  // Batch read all status keys for better performance
  const statusPromises = items
    .filter(item => item[deviceIdField])
    .map(item => {
      const key = statusKey(item[deviceIdField]);
      return redisClient.get(key).then(value => ({
        deviceId: item[deviceIdField],
        statusData: value ? JSON.parse(value) : null
      })).catch(() => ({
        deviceId: item[deviceIdField],
        statusData: null
      }));
    });

  const statusResults = await Promise.all(statusPromises);
  const statusMap = new Map();
  statusResults.forEach(result => {
    if (result.statusData) {
      statusMap.set(result.deviceId, result.statusData);
    }
  });

  // Batch read lastSeen for fallback
  const allDeviceIds = items.map(item => item[deviceIdField]).filter(Boolean);
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

  // Enhance items with real-time status
  const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  // Check for active transactions to determine C.STATUS correctly
  const activeSessionsMap = new Map();
  if (allDeviceIds.length > 0) {
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const activeSessionsWhere = {
      deviceId: { [Op.in]: allDeviceIds },
      status: ['pending', 'active'],
      endTime: null
    };
    if (systemCustomerId !== null) {
      activeSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const activeSessions = await ChargingSession.findAll({
      where: activeSessionsWhere,
      attributes: ['deviceId']
    });
    activeSessions.forEach(session => {
      activeSessionsMap.set(session.deviceId, true);
    });
  }

  return items.map(item => {
    if (!item[deviceIdField]) {
      return item;
    }

    const realTimeStatusData = statusMap.get(item[deviceIdField]);
    let finalStatus = item.status; // Default to cached status
    let cStatus = item.cStatus || 'Unavailable'; // Default to cached C.STATUS

    if (realTimeStatusData && realTimeStatusData.status) {
      // Map OCPP status to Online/Offline
      finalStatus = mapOCPPStatusToOnlineOffline(realTimeStatusData.status);
      
      // Determine C.STATUS: if there's an active session, it should be "Charging"
      // Otherwise use the OCPP status
      if (activeSessionsMap.has(item[deviceIdField])) {
        cStatus = 'Charging';
      } else {
        cStatus = realTimeStatusData.status;
      }
    } else {
      // Fallback to lastSeen check
      const lastSeen = chargerDataMap.get(item[deviceIdField]);
      if (lastSeen) {
        const lastActiveTime = new Date(lastSeen);
        const now = new Date();
        const timeDiff = now - lastActiveTime;
        if (timeDiff <= OFFLINE_THRESHOLD) {
          finalStatus = 'Online';
          // Check if there's an active session
          if (activeSessionsMap.has(item[deviceIdField])) {
            cStatus = 'Charging';
          } else if (!cStatus || cStatus === 'Unavailable') {
            cStatus = 'Available';
          }
        } else {
          finalStatus = 'Offline';
          cStatus = 'Unavailable';
        }
      } else {
        finalStatus = 'Offline';
        cStatus = 'Unavailable';
      }
    }

    return {
      ...item,
      status: finalStatus,
      cStatus: cStatus
    };
  });
}

/**
 * Check if charging point has active transaction
 */
async function hasActiveTransaction(deviceId) {
  try {
    if (!deviceId) {
      return false;
    }

    // CRITICAL: Check Redis status first - if it shows "Available", charging is definitely stopped
    try {
      const statusValue = await redisClient.get(statusKey(deviceId));
      if (statusValue) {
        const statusData = JSON.parse(statusValue);
        if (statusData && statusData.status) {
          // If Redis shows "Available", charging is definitely stopped
          if (statusData.status === 'Available' || statusData.status === 'available') {
            console.log(`✅ [hasActiveTransaction] Redis status shows "Available" for ${deviceId} - charging is stopped`);
            return false;
          }
          // If Redis shows "Charging", charging is definitely active
          if (statusData.status === 'Charging' || statusData.status === 'charging') {
            console.log(`✅ [hasActiveTransaction] Redis status shows "Charging" for ${deviceId} - charging is active`);
            return true;
          }
        }
      }
    } catch (redisErr) {
      // If Redis check fails, continue with database check
      console.warn(`⚠️ [hasActiveTransaction] Redis check failed for ${deviceId}:`, redisErr.message);
    }

    // First, check for active ChargingSession records (most reliable)
    const activeSession = await ChargingSession.findOne({
      where: {
        deviceId: deviceId,
        status: ['pending', 'active'],
        endTime: null
      },
      order: [['createdAt', 'DESC']]
    });

    if (activeSession) {
      return true;
    }

    // Get all recent logs for this device (more comprehensive check)
    const allLogs = await ChargerData.findAll({
      where: {
        deviceId: deviceId
      },
      order: [['timestamp', 'DESC'], ['id', 'DESC']],
      limit: 2000
    });

    if (allLogs.length === 0) {
      return false;
    }

    // Check for recent RemoteStopTransaction accepted response (within last 2 minutes)
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    // First, find all RemoteStopTransaction commands (outgoing) within last 2 minutes
    const remoteStopCommands = allLogs.filter(log => {
      if (log.message !== 'RemoteStopTransaction' || log.direction !== 'Outgoing') {
        return false;
      }
      const logTime = new Date(log.timestamp || log.createdAt).getTime();
      return logTime >= twoMinutesAgo.getTime();
    });
    
    // Then find their corresponding accepted responses
    const remoteStopResponses = [];
    for (const command of remoteStopCommands) {
      const response = allLogs.find(log => 
        log.message === 'Response' && 
        log.direction === 'Incoming' &&
        log.messageId === command.messageId
      );
      
      if (response) {
        // Check if response status is "Accepted"
        let status = null;
        if (response.messageData && response.messageData.status) {
          status = response.messageData.status;
        } else if (response.raw && Array.isArray(response.raw) && response.raw[2] && response.raw[2].status) {
          status = response.raw[2].status;
        }
        if (status === 'Accepted') {
          remoteStopResponses.push(response);
        }
      }
    }

    if (remoteStopResponses.length > 0) {
      // Remote stop was accepted recently - check if there's a StatusNotification confirming it
      const latestRemoteStop = remoteStopResponses[0];
      const remoteStopTime = new Date(latestRemoteStop.timestamp || latestRemoteStop.createdAt).getTime();
      
      // Check for StatusNotification with "Available" or "Finishing" after remote stop
      const statusAfterStop = allLogs.find(log => {
        if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
          return false;
        }
        const logTime = new Date(log.timestamp || log.createdAt).getTime();
        if (logTime < remoteStopTime) {
          return false;
        }
        let status = null;
        if (log.messageData && log.messageData.status) {
          status = log.messageData.status;
        } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
          status = log.raw[2].status;
        }
        return status === 'Available' || status === 'Finishing';
      });

      if (statusAfterStop) {
        // Remote stop was accepted and StatusNotification confirms it - charging is stopped
        console.log(`✅ [hasActiveTransaction] Remote stop accepted and StatusNotification confirms charging stopped for ${deviceId}`);
        return false;
      }
      
      // Even without StatusNotification, if RemoteStopTransaction was accepted recently, consider charging stopped
      const responseTime = new Date(latestRemoteStop.timestamp || latestRemoteStop.createdAt).getTime();
      const timeSinceStop = Date.now() - responseTime;
      if (timeSinceStop < 30 * 1000) { // Within last 30 seconds
        console.log(`✅ [hasActiveTransaction] Remote stop accepted recently (${Math.round(timeSinceStop/1000)}s ago) for ${deviceId} - considering charging stopped`);
        return false;
      }
    }

    // Check for recent StatusNotification with "Charging" status (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const chargingStatusNotifications = allLogs.filter(log => {
      if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
        return false;
      }
      const logTime = new Date(log.timestamp || log.createdAt).getTime();
      if (logTime < fiveMinutesAgo.getTime()) {
        return false;
      }
      // Check if status is "Charging"
      let status = null;
      if (log.messageData && log.messageData.status) {
        status = log.messageData.status;
      } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
        status = log.raw[2].status;
      }
      return status === 'Charging';
    });

    if (chargingStatusNotifications.length > 0) {
      // Check if there's a more recent StatusNotification with "Available" or "Finishing"
      const latestStatus = chargingStatusNotifications[0];
      const latestStatusTime = new Date(latestStatus.timestamp || latestStatus.createdAt).getTime();
      
      const laterStatusNotifications = allLogs.filter(log => {
        if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
          return false;
        }
        const logTime = new Date(log.timestamp || log.createdAt).getTime();
        return logTime > latestStatusTime;
      });

      // If there's a later StatusNotification, check if it's "Available" or "Finishing"
      if (laterStatusNotifications.length > 0) {
        const laterStatus = laterStatusNotifications[0];
        let status = null;
        if (laterStatus.messageData && laterStatus.messageData.status) {
          status = laterStatus.messageData.status;
        } else if (laterStatus.raw && Array.isArray(laterStatus.raw) && laterStatus.raw[2] && laterStatus.raw[2].status) {
          status = laterStatus.raw[2].status;
        }
        // If later status is "Available" or "Finishing", charging has stopped
        if (status === 'Available' || status === 'Finishing') {
          console.log(`✅ [hasActiveTransaction] StatusNotification shows charging stopped (${status}) for ${deviceId}`);
          return false;
        } else {
          // Later status is still "Charging" or other, so charging is active
          return true;
        }
      } else {
        // No later status notification, so charging is likely still active
        return true;
      }
    }

    // Find all StartTransaction messages (incoming from charger)
    const startTransactions = allLogs.filter(log => 
      log.message === 'StartTransaction' && log.direction === 'Incoming'
    );

    if (startTransactions.length === 0) {
      return false;
    }

    // Get the latest StartTransaction (by timestamp first, then by id)
    const latestStart = startTransactions.reduce((latest, current) => {
      const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
      const currentTime = new Date(current.timestamp || current.createdAt).getTime();
      if (currentTime > latestTime) return current;
      if (currentTime < latestTime) return latest;
      // If same time, use ID
      const latestId = latest.id || 0;
      const currentId = current.id || 0;
      return currentId > latestId ? current : latest;
    });

    // Check if StartTransaction is recent (within last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
    if (startTime < twoHoursAgo.getTime()) {
      return false; // Transaction is too old, consider it inactive
    }

    // Find the response to this StartTransaction (outgoing from server, same messageId)
    const startResponse = allLogs.find(log => 
      log.message === 'Response' && 
      log.messageId === latestStart.messageId &&
      log.direction === 'Outgoing'
    );

    // Get transactionId - first try from response, then from StartTransaction itself
    let transactionId = null;
    if (startResponse) {
      if (startResponse.messageData && startResponse.messageData.transactionId) {
        transactionId = startResponse.messageData.transactionId;
      } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
        transactionId = startResponse.raw[2].transactionId;
      }
    }

    // If not found in response, try to get from StartTransaction message itself
    if (!transactionId && latestStart.messageData && latestStart.messageData.transactionId) {
      transactionId = latestStart.messageData.transactionId;
    } else if (!transactionId && latestStart.raw && Array.isArray(latestStart.raw)) {
      // Try to extract from raw OCPP message
      const payload = latestStart.raw[2];
      if (payload && payload.transactionId) {
        transactionId = payload.transactionId;
      }
    }

    if (!transactionId) {
      return false;
    }

    // Check for StopTransaction with same transactionId in all logs
    const stopTransaction = allLogs.find(log => 
      log.message === 'StopTransaction' && 
      log.direction === 'Incoming' &&
      (
        (log.messageData && log.messageData.transactionId === transactionId) || 
        (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
      )
    );

    // If no StopTransaction found, transaction is active
    if (!stopTransaction) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error checking active transaction for deviceId:', deviceId, error);
    return false;
  }
}

/**
 * Check if charging point has fault
 */
async function hasFault(deviceId) {
  try {
    // First check Charger table status
    const charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: ['status']
    });

    if (charger && charger.status) {
      const statusLower = charger.status.toLowerCase();
      if (statusLower === 'faulted' || statusLower === 'fault') {
        return true;
      }
    }

    // Also check for recent StatusNotification with errorCode
    const recentStatus = await ChargerData.findOne({
      where: {
        deviceId: deviceId,
        message: 'StatusNotification',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 1
    });

    if (recentStatus && recentStatus.messageData) {
      const errorCode = recentStatus.messageData.errorCode;
      // If errorCode exists and is not 'NoError', consider it a fault
      if (errorCode && errorCode !== 'NoError' && errorCode !== null && errorCode !== '') {
        return true;
      }
      
      // Also check connectorStatus for fault
      const connectorStatus = recentStatus.messageData.connectorStatus;
      if (connectorStatus) {
        const statusLower = connectorStatus.toLowerCase();
        if (statusLower === 'faulted' || statusLower === 'unavailable') {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking fault:', error);
    return false;
  }
}

/**
 * Calculate real-time status for a charging point
 */
async function calculateChargingPointRealTimeStatus(deviceId) {
  try {
    if (!deviceId) {
      return 'Offline';
    }

    // Check Redis for real-time status first
    const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    try {
      const key = statusKey(deviceId);
      const statusValue = await redisClient.get(key);
      if (statusValue) {
        const statusData = JSON.parse(statusValue);
        if (statusData && statusData.status) {
          // Map OCPP status to Online/Offline
          return mapOCPPStatusToOnlineOffline(statusData.status);
        }
      }
    } catch (error) {
      // If Redis read fails, fallback to lastSeen
    }

    // Fallback to lastSeen check
    const chargerData = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: ['lastSeen']
    });

    if (chargerData && chargerData.lastSeen) {
      const lastActiveTime = new Date(chargerData.lastSeen);
      const now = new Date();
      const timeDiff = now - lastActiveTime;
      const isOnline = timeDiff <= OFFLINE_THRESHOLD;
      return isOnline ? 'Online' : 'Offline';
    }

    return 'Offline';
  } catch (error) {
    console.error(`Error calculating real-time status for deviceId ${deviceId}:`, error);
    return 'Offline';
  }
}

/**
 * Calculate C.STATUS (Connector Status) for a charging point
 */
async function calculateChargingPointCStatus(deviceId) {
  try {
    if (!deviceId) {
      return 'Unavailable';
    }

    // First check real-time status
    const realTimeStatus = await calculateChargingPointRealTimeStatus(deviceId);
    
    if (realTimeStatus === 'Offline') {
      return 'Unavailable';
    }

    // Check for faults first
    const hasFaultStatus = await hasFault(deviceId);
    if (hasFaultStatus) {
      return 'Faulted';
    }

    // Check for active charging
    const isCharging = await hasActiveTransaction(deviceId);
    if (isCharging) {
      return 'Charging';
    }

    return 'Available';
  } catch (error) {
    console.error(`Error calculating C.STATUS for deviceId ${deviceId}:`, error);
    return 'Unavailable';
  }
}

/**
 * Generate unique chargingPointId
 */
async function generateUniqueChargingPointId() {
  let chargingPointId;
  let existingPoint;
  do {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    chargingPointId = `CP-${timestamp}-${randomStr}`;
    existingPoint = await ChargingPoint.findOne({ where: { chargingPointId } });
  } while (existingPoint);
  return chargingPointId;
}

/**
 * Ensure charger exists from BootNotification data
 */
async function ensureChargerFromBootNotification(deviceId, bootNotificationData) {
  try {
    if (!deviceId || !bootNotificationData) {
      return null;
    }

    // Find existing charger
    let charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: ['id', 'vendor', 'model', 'serialNumber', 'firmwareVersion', 'meterSerialNumber']
    });

    if (!charger) {
      // Create new Charger record from BootNotification
      charger = await Charger.create({
        deviceId: deviceId,
        name: `Charger ${deviceId}`,
        status: 'Available',
        vendor: bootNotificationData.chargePointVendor || 'Unknown',
        model: bootNotificationData.chargePointModel || 'Unknown',
        serialNumber: bootNotificationData.chargePointSerialNumber || 'Unknown',
        firmwareVersion: bootNotificationData.firmwareVersion || 'Unknown',
        meterSerialNumber: bootNotificationData.chargeBoxSerialNumber || null,
        lastSeen: new Date()
      });
      console.log(`✅ Created Charger record from BootNotification for device: ${deviceId}`);
      return charger;
    } else {
      // Update existing charger if it has "Unknown" values
      const needsUpdate = !charger.vendor || charger.vendor === 'Unknown' ||
                         !charger.model || charger.model === 'Unknown' ||
                         !charger.serialNumber || charger.serialNumber === 'Unknown' ||
                         !charger.firmwareVersion || charger.firmwareVersion === 'Unknown';
      
      if (needsUpdate) {
        const updates = {};
        
        // Update vendor if missing or Unknown
        if (bootNotificationData.chargePointVendor && (!charger.vendor || charger.vendor === 'Unknown')) {
          updates.vendor = bootNotificationData.chargePointVendor;
        }
        
        // Update model if missing or Unknown
        if (bootNotificationData.chargePointModel && (!charger.model || charger.model === 'Unknown')) {
          updates.model = bootNotificationData.chargePointModel;
        }
        
        // Update serialNumber if missing or Unknown
        if (bootNotificationData.chargePointSerialNumber && (!charger.serialNumber || charger.serialNumber === 'Unknown')) {
          updates.serialNumber = bootNotificationData.chargePointSerialNumber;
        }
        
        // Update firmwareVersion if missing or Unknown
        if (bootNotificationData.firmwareVersion && (!charger.firmwareVersion || charger.firmwareVersion === 'Unknown')) {
          updates.firmwareVersion = bootNotificationData.firmwareVersion;
        }
        
        // Update meterSerialNumber if available
        if (bootNotificationData.chargeBoxSerialNumber && (!charger.meterSerialNumber || charger.meterSerialNumber === 'Unknown')) {
          updates.meterSerialNumber = bootNotificationData.chargeBoxSerialNumber;
        }
        
        // Apply updates if any
        if (Object.keys(updates).length > 0) {
          await charger.update(updates);
          // Reload to get updated values
          await charger.reload();
          console.log(`✅ Updated Charger table from BootNotification for device: ${deviceId}`);
        }
      }
      
      return charger;
    }
  } catch (error) {
    console.error(`Error ensuring charger from BootNotification for deviceId ${deviceId}:`, error);
    return null;
  }
}

/**
 * Get all charging points with pagination and filters
 */
async function getAllChargingPoints(filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  const { search, status, stationId } = filters;

  // Build where clause FIRST (before cache check, since we need it for validation)
  const where = {
    deleted: false // Only show non-deleted charging points
  };

  // Add search filter
  if (search) {
    where[Op.or] = [
      { chargingPointId: { [Op.iLike]: `%${search}%` } },
      { deviceId: { [Op.iLike]: `%${search}%` } },
      { deviceName: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // NOTE: Status filter is NOT applied to database query because "Online"/"Offline" 
  // are calculated dynamically from lastSeen and Redis. We'll filter after calculating real-time status.
  
  // Add station filter
  if (stationId) {
    where.stationId = stationId;
  }

  // Build cache key WITHOUT pagination (since we sort globally)
  const cacheKey = `charging-points:list:all:search:${search || 'none'}:status:${status || 'all'}:stationId:${stationId || 'all'}`;

  // Try to get from cache
  let allCachedPoints = await cacheController.get(cacheKey);
  if (allCachedPoints && allCachedPoints.points && Array.isArray(allCachedPoints.points)) {
    // Verify cache has correct total - if cache total doesn't match DB count, fetch fresh
    const { count: dbCount } = await ChargingPoint.findAndCountAll({
      where,
      distinct: true
    });
    
    // If cached total doesn't match DB count, skip cache and fetch fresh
    if (allCachedPoints.total !== dbCount) {
      console.log(`⚠️ [Cache] Cached total (${allCachedPoints.total}) doesn't match DB count (${dbCount}), fetching fresh data`);
      allCachedPoints = null; // Force fresh fetch
    } else {
      // Enhance cached response with real-time status from Redis
      const enhancedPoints = await enhanceWithRealTimeStatus(allCachedPoints.points, 'deviceId');
      
      // Apply status filter AFTER calculating real-time status (if status filter is provided)
      let filteredPoints = enhancedPoints;
      if (status) {
        filteredPoints = enhancedPoints.filter(point => point.status === status);
      }
      
      // Sort ALL points: Online first, then Offline, then by createdAt DESC
      filteredPoints.sort((a, b) => {
        // First sort by status: Online comes before Offline
        if (a.status === 'Online' && b.status !== 'Online') return -1;
        if (a.status !== 'Online' && b.status === 'Online') return 1;
        // If same status, sort by createdAt DESC (newest first)
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      
      // Apply pagination to sorted results
      const total = filteredPoints.length;
      const paginatedPoints = filteredPoints.slice(offset, offset + limit);
      const totalPages = Math.ceil(total / limit);
      
      return {
        success: true,
        points: paginatedPoints,
        total: total,
        page: page,
        limit: limit,
        totalPages: totalPages
      };
    }
  }

  // Get ALL charging points matching filters (NO pagination yet - we'll sort globally first)
  // Use distinct: true to ensure count is correct when there are multiple connectors per charging point
  const { count, rows: allChargingPoints } = await ChargingPoint.findAndCountAll({
    where,
    include: [
      {
        model: Station,
        as: 'station',
        attributes: ['id', 'stationId', 'stationName']
      },
      {
        model: Tariff,
        as: 'tariff',
        attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
      },
      {
        model: Connector,
        as: 'connectors',
        attributes: ['id', 'connectorId', 'connectorType', 'power']
      }
    ],
    distinct: true // Count distinct charging points, not joined rows
    // NO limit/offset here - we'll fetch all, sort, then paginate
  });
  
  console.log(`✅ [Charging Points] Fetched ${count} total charging points (${allChargingPoints.length} rows)`);

  // Calculate connectors count and max power, and real-time status for ALL points
  const formattedPoints = await Promise.all(allChargingPoints.map(async (point) => {
    const connectors = point.connectors || [];
    const maxPower = Math.max(...connectors.map(c => parseFloat(c.power || 0)), parseFloat(point.powerCapacity || 0));
    
    // Fetch charger data to get lastSeen
    let chargerData = null;
    if (point.deviceId) {
      chargerData = await Charger.findOne({
        where: { deviceId: point.deviceId },
        attributes: ['lastSeen']
      });
    }

    // Check Redis for real-time status first
    let realTimeStatus = point.status || 'Offline';
    const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    if (point.deviceId) {
      try {
        const key = statusKey(point.deviceId);
        const statusValue = await redisClient.get(key);
        if (statusValue) {
          const statusData = JSON.parse(statusValue);
          if (statusData && statusData.status) {
            // Map OCPP status to Online/Offline
            realTimeStatus = mapOCPPStatusToOnlineOffline(statusData.status);
          }
        } else {
          // Fallback to lastSeen check
          if (chargerData && chargerData.lastSeen) {
            const lastActiveTime = new Date(chargerData.lastSeen);
            const now = new Date();
            const timeDiff = now - lastActiveTime;
            const isOnline = timeDiff <= OFFLINE_THRESHOLD;
            realTimeStatus = isOnline ? 'Online' : 'Offline';
          }
        }
      } catch (error) {
        // If Redis read fails, fallback to lastSeen
        if (chargerData && chargerData.lastSeen) {
          const lastActiveTime = new Date(chargerData.lastSeen);
          const now = new Date();
          const timeDiff = now - lastActiveTime;
          const isOnline = timeDiff <= OFFLINE_THRESHOLD;
          realTimeStatus = isOnline ? 'Online' : 'Offline';
        }
      }
    }

    // Calculate C.STATUS (Connector Status)
    let cStatus = 'Unavailable'; // Default
    if (realTimeStatus === 'Offline') {
      cStatus = 'Unavailable';
    } else {
      // Check for faults first
      const hasFaultStatus = await hasFault(point.deviceId);
      if (hasFaultStatus) {
        cStatus = 'Faulted';
      } else {
        // Check for active charging
        const isCharging = await hasActiveTransaction(point.deviceId);
        if (isCharging) {
          cStatus = 'Charging';
        } else {
          cStatus = 'Available';
        }
      }
    }
    
    // Calculate session statistics
    const sessionStats = await cmsStationService.calculateSessionStats(point.deviceId, point);

    return {
      id: point.id,
      chargingPointId: point.chargingPointId,
      deviceId: point.deviceId,
      deviceName: point.deviceName,
      stationName: point.station ? point.station.stationName : 'N/A',
      stationId: point.stationId, // Database ID (integer)
      stationIdString: point.station ? point.station.stationId : null, // Station ID string (e.g., "STN-...")
      tariffId: point.tariffId,
      tariffName: point.tariff ? point.tariff.tariffName : 'N/A',
      chargerType: point.chargerType,
      powerCapacity: parseFloat(point.powerCapacity),
      firmwareVersion: point.firmwareVersion,
      oemList: point.oemList,
      phase: point.phase,
      status: realTimeStatus, // Use calculated real-time status
      cStatus: cStatus, // Use calculated connector status
      connectors: connectors.length,
      maxPower: maxPower,
      sessions: sessionStats.sessions,
      billedAmount: sessionStats.billedAmount,
      energy: sessionStats.energy,
      createdBy: point.createdBy,
      createdAt: point.createdAt,
      chargerLastSeen: chargerData ? chargerData.lastSeen : null
    };
  }));

  // Apply status filter AFTER calculating real-time status (if status filter is provided)
  let filteredPoints = formattedPoints;
  if (status) {
    filteredPoints = formattedPoints.filter(point => point.status === status);
  }

  // Sort ALL points: Online first, then Offline, then by createdAt DESC
  filteredPoints.sort((a, b) => {
    // First sort by status: Online comes before Offline
    if (a.status === 'Online' && b.status !== 'Online') return -1;
    if (a.status !== 'Online' && b.status === 'Online') return 1;
    // If same status, sort by createdAt DESC (newest first)
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Cache ALL sorted points (without pagination)
  await cacheController.set(cacheKey, {
    success: true,
    points: filteredPoints,
    total: filteredPoints.length
  }, 300);

  // Apply pagination to sorted results
  const paginatedPoints = filteredPoints.slice(offset, offset + limit);
  const totalPages = Math.ceil(filteredPoints.length / limit);

  return {
    success: true,
    points: paginatedPoints,
    total: filteredPoints.length, // Use filtered count, not database count
    page,
    limit,
    totalPages
  };
}

/**
 * Get single charging point by chargingPointId
 */
async function getChargingPointByChargingPointId(chargingPointId) {
  const chargingPoint = await ChargingPoint.findOne({
    where: {
      chargingPointId,
      deleted: false
    },
    include: [
      {
        model: Station,
        as: 'station',
        attributes: ['id', 'stationId', 'stationName', 'organization']
      },
      {
        model: Tariff,
        as: 'tariff',
        attributes: ['id', 'tariffId', 'tariffName', 'currency', 'baseCharges', 'tax']
      },
      {
        model: Connector,
        as: 'connectors',
        attributes: ['id', 'connectorId', 'connectorType', 'power'],
        order: [['connectorId', 'ASC']]
      }
    ]
  });

  if (!chargingPoint) {
    return null;
  }

  // Fetch charger data using deviceId
  let chargerData = null;
  if (chargingPoint.deviceId) {
    chargerData = await Charger.findOne({
      where: {
        deviceId: chargingPoint.deviceId
      },
      attributes: ['id', 'vendor', 'model', 'serialNumber', 'meterSerialNumber', 'firmwareVersion', 'lastSeen']
    });
    
    // Find the latest BootNotification from ChargerData to update charger info
    const latestBootNotification = await ChargerData.findOne({
      where: {
        deviceId: chargingPoint.deviceId,
        message: 'BootNotification',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      attributes: ['messageData', 'timestamp']
    });
    
    if (latestBootNotification && latestBootNotification.messageData) {
      const bootData = latestBootNotification.messageData;
      chargerData = await ensureChargerFromBootNotification(chargingPoint.deviceId, bootData);
    }
  }

  // Helper function to normalize "Unknown" values to null
  const normalizeValue = (value) => {
    if (!value || value === 'Unknown' || value === 'unknown' || (typeof value === 'string' && value.trim() === '')) {
      return null;
    }
    return value;
  };

  return {
    success: true,
    point: {
      id: chargingPoint.id,
      chargingPointId: chargingPoint.chargingPointId,
      deviceId: chargingPoint.deviceId,
      deviceName: chargingPoint.deviceName,
      stationId: chargingPoint.stationId,
      stationName: chargingPoint.station ? chargingPoint.station.stationName : null,
      organization: chargingPoint.station ? chargingPoint.station.organization : null,
      tariffId: chargingPoint.tariffId,
      tariffName: chargingPoint.tariff ? chargingPoint.tariff.tariffName : null,
      chargerType: chargingPoint.chargerType,
      powerCapacity: parseFloat(chargingPoint.powerCapacity),
      firmwareVersion: chargingPoint.firmwareVersion,
      oemList: chargingPoint.oemList,
      phase: chargingPoint.phase,
      status: await calculateChargingPointRealTimeStatus(chargingPoint.deviceId), // Calculate real-time status
      cStatus: await calculateChargingPointCStatus(chargingPoint.deviceId), // Calculate real-time C.STATUS
      connectors: chargingPoint.connectors.map(c => ({
        id: c.id,
        connectorId: c.connectorId,
        connectorType: c.connectorType,
        power: parseFloat(c.power)
      })),
      // Charger data from Charger table - normalize "Unknown" values to null
      chargeBoxSerialNumber: chargerData ? normalizeValue(chargerData.meterSerialNumber) : null,
      chargePointModel: chargerData ? normalizeValue(chargerData.model) : null,
      chargePointSerialNumber: chargerData ? normalizeValue(chargerData.serialNumber) : null,
      chargePointVendor: chargerData ? normalizeValue(chargerData.vendor) : null,
      chargerFirmwareVersion: chargerData ? normalizeValue(chargerData.firmwareVersion) : null,
      chargerLastSeen: chargerData ? chargerData.lastSeen : null, // For real-time status
      createdBy: chargingPoint.createdBy,
      createdAt: chargingPoint.createdAt,
      updatedAt: chargingPoint.updatedAt
    }
  };
}

/**
 * Helper function to invalidate all charging points list cache entries
 * This ensures the list is refreshed immediately after create/update/delete operations
 */
async function invalidateChargingPointsListCache() {
  try {
    // Get all cache keys matching the charging-points:list pattern
    const keys = await redisClient.keys('charging-points:list:*');
    if (keys && keys.length > 0) {
      await Promise.all(keys.map(key => cacheController.del(key)));
      console.log(`✅ [Cache] Invalidated ${keys.length} charging points list cache entries`);
    }
  } catch (error) {
    console.warn('⚠️ [Cache] Failed to invalidate charging points list cache:', error.message);
    // Don't fail the operation if cache invalidation fails
  }
}

/**
 * Create new charging point with connectors
 */
async function createChargingPoint(chargingPointData) {
  const {
    deviceName,
    chargingStation,
    tariff,
    chargerType,
    powerCapacity,
    firmwareVersion,
    oemList,
    phase,
    connectors,
    createdBy
  } = chargingPointData;

  // Frontend now sends stationId directly (integer)
  const stationId = parseInt(chargingStation);
  if (isNaN(stationId) || stationId <= 0) {
    throw new Error('Invalid charging station. Please select a valid station.');
  }

  // Verify tariff exists
  const tariffExists = await Tariff.findOne({
    where: {
      id: parseInt(tariff),
      deleted: false
    }
  });

  if (!tariffExists) {
    throw new Error('Tariff not found');
  }

  // Verify station exists
  const stationExists = await Station.findOne({
    where: {
      id: stationId,
      deleted: false
    }
  });

  if (!stationExists) {
    throw new Error('Station not found');
  }

  // Generate unique chargingPointId
  const chargingPointId = await generateUniqueChargingPointId();

  // Generate unique deviceId
  let deviceId;
  let existingDevice;
  do {
    const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
    deviceId = `DEV${randomStr}`;
    existingDevice = await ChargingPoint.findOne({ where: { deviceId } });
  } while (existingDevice);

  // Create charging point
  const chargingPoint = await ChargingPoint.create({
    chargingPointId,
    deviceId,
    deviceName,
    stationId,
    tariffId: parseInt(tariff),
    chargerType,
    powerCapacity: parseFloat(powerCapacity),
    firmwareVersion: firmwareVersion || null,
    oemList: oemList || null,
    phase: phase || null,
    status: 'Offline',
    cStatus: 'Unavailable',
    createdBy: createdBy || null,
    deleted: false
  });

  // Create connectors
  const connectorPromises = connectors.map(connector => {
    return Connector.create({
      chargingPointId: chargingPoint.id,
      connectorId: parseInt(connector.connectorId),
      connectorType: connector.connectorType,
      power: parseFloat(connector.power)
    });
  });

  await Promise.all(connectorPromises);

  // Reload with associations
  await chargingPoint.reload({
    include: [
      {
        model: Station,
        as: 'station',
        attributes: ['id', 'stationId', 'stationName']
      },
      {
        model: Tariff,
        as: 'tariff',
        attributes: ['id', 'tariffId', 'tariffName']
      },
      {
        model: Connector,
        as: 'connectors',
        attributes: ['id', 'connectorId', 'connectorType', 'power']
      }
    ]
  });

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.point.created',
        data: {
          chargingPointId: chargingPoint.chargingPointId,
          id: chargingPoint.id,
          deviceId: chargingPoint.deviceId,
          deviceName: chargingPoint.deviceName,
          stationId: chargingPoint.stationId,
          createdBy: createdBy
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.point.created event for ${chargingPoint.chargingPointId}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.point.created event:', rabbitmqError.message);
      // Don't fail the request if RabbitMQ fails
    }
  }

  // Invalidate charging points list cache so the new charging point appears immediately
  await invalidateChargingPointsListCache();

  return {
    success: true,
    message: 'Charging point created successfully',
    point: {
      id: chargingPoint.id,
      chargingPointId: chargingPoint.chargingPointId,
      deviceId: chargingPoint.deviceId,
      deviceName: chargingPoint.deviceName,
      stationId: chargingPoint.stationId,
      tariffId: chargingPoint.tariffId,
      createdAt: chargingPoint.createdAt
    }
  };
}

/**
 * Update charging point
 */
async function updateChargingPoint(chargingPointId, updateData) {
  // Find charging point
  const chargingPoint = await ChargingPoint.findOne({
    where: {
      chargingPointId,
      deleted: false
    }
  });

  if (!chargingPoint) {
    return null;
  }

  // Handle station update if provided
  if (updateData.chargingStation !== undefined) {
    const stationId = parseInt(updateData.chargingStation);
    if (isNaN(stationId) || stationId <= 0) {
      throw new Error('Invalid charging station. Please select a valid station.');
    }

    // Verify station exists
    const stationExists = await Station.findOne({
      where: {
        id: stationId,
        deleted: false
      }
    });

    if (!stationExists) {
      throw new Error('Station not found');
    }
  }

  // Handle tariff update if provided
  if (updateData.tariff !== undefined) {
    const tariffId = parseInt(updateData.tariff);
    if (isNaN(tariffId) || tariffId <= 0) {
      throw new Error('Invalid tariff. Please select a valid tariff.');
    }

    // Verify tariff exists
    const tariffExists = await Tariff.findOne({
      where: {
        id: tariffId,
        deleted: false
      }
    });

    if (!tariffExists) {
      throw new Error('Tariff not found');
    }
  }

  // Prepare update data
  const dataToUpdate = {};
  if (updateData.deviceName !== undefined) dataToUpdate.deviceName = updateData.deviceName;
  if (updateData.chargingStation !== undefined) dataToUpdate.stationId = parseInt(updateData.chargingStation);
  if (updateData.tariff !== undefined) dataToUpdate.tariffId = parseInt(updateData.tariff);
  if (updateData.chargerType !== undefined) dataToUpdate.chargerType = updateData.chargerType;
  if (updateData.powerCapacity !== undefined) dataToUpdate.powerCapacity = updateData.powerCapacity ? parseFloat(updateData.powerCapacity) : null;
  if (updateData.firmwareVersion !== undefined) dataToUpdate.firmwareVersion = updateData.firmwareVersion || null;
  if (updateData.oemList !== undefined) dataToUpdate.oemList = updateData.oemList || null;
  if (updateData.phase !== undefined) dataToUpdate.phase = updateData.phase || null;
  if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
  if (updateData.cStatus !== undefined) dataToUpdate.cStatus = updateData.cStatus;

  // Update charging point
  await chargingPoint.update(dataToUpdate);

  // Handle connectors update if provided
  if (updateData.connectors && Array.isArray(updateData.connectors)) {
    // Delete existing connectors
    await Connector.destroy({
      where: {
        chargingPointId: chargingPoint.id
      }
    });

    // Create new connectors
    const connectorPromises = updateData.connectors.map(connector => {
      return Connector.create({
        chargingPointId: chargingPoint.id,
        connectorId: parseInt(connector.connectorId),
        connectorType: connector.connectorType,
        power: parseFloat(connector.power)
      });
    });

    await Promise.all(connectorPromises);
  }

  // Reload to get updated data
  await chargingPoint.reload({
    include: [
      {
        model: Station,
        as: 'station',
        attributes: ['id', 'stationId', 'stationName']
      },
      {
        model: Tariff,
        as: 'tariff',
        attributes: ['id', 'tariffId', 'tariffName']
      },
      {
        model: Connector,
        as: 'connectors',
        attributes: ['id', 'connectorId', 'connectorType', 'power']
      }
    ]
  });

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.point.updated',
        data: {
          chargingPointId: chargingPoint.chargingPointId,
          id: chargingPoint.id,
          deviceId: chargingPoint.deviceId,
          deviceName: chargingPoint.deviceName
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.point.updated event for ${chargingPoint.chargingPointId}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.point.updated event:', rabbitmqError.message);
      // Don't fail the request if RabbitMQ fails
    }
  }

  // Invalidate charging points list cache so the updated charging point appears immediately
  await invalidateChargingPointsListCache();

  return {
    success: true,
    message: 'Charging point updated successfully',
    point: {
      id: chargingPoint.id,
      chargingPointId: chargingPoint.chargingPointId,
      deviceId: chargingPoint.deviceId,
      deviceName: chargingPoint.deviceName,
      status: chargingPoint.status,
      cStatus: chargingPoint.cStatus,
      updatedAt: chargingPoint.updatedAt
    }
  };
}

/**
 * Delete charging point (soft delete)
 */
async function deleteChargingPoint(chargingPointId) {
  // Find charging point
  const chargingPoint = await ChargingPoint.findOne({
    where: {
      chargingPointId,
      deleted: false
    }
  });

  if (!chargingPoint) {
    return null;
  }

  // Soft delete
  await chargingPoint.update({ deleted: true });

  // Clean up Redis keys for this charger
  if (chargingPoint.deviceId) {
    try {
      await cleanupChargerKeys(chargingPoint.deviceId);
      console.log(`✅ [Delete Charging Point] Cleaned up Redis keys for device ${chargingPoint.deviceId}`);
    } catch (cleanupError) {
      console.error(`⚠️ [Delete Charging Point] Error cleaning up Redis keys:`, cleanupError.message);
      // Don't fail the request if cleanup fails
    }
  }

  // Invalidate charging points list cache so the deleted charging point disappears immediately
  await invalidateChargingPointsListCache();

  return {
    success: true,
    message: 'Charging point deleted successfully',
    chargingPointId: chargingPoint.chargingPointId
  };
}

module.exports = {
  getAllChargingPoints,
  getChargingPointByChargingPointId,
  createChargingPoint,
  updateChargingPoint,
  deleteChargingPoint,
  generateUniqueChargingPointId,
  calculateChargingPointRealTimeStatus,
  calculateChargingPointCStatus,
  hasActiveTransaction,
  hasFault,
  ensureChargerFromBootNotification,
  mapOCPPStatusToOnlineOffline,
  enhanceWithRealTimeStatus
};

