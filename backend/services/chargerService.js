const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { cleanupChargerKeys } = require('../libs/redis/cleanup');

// JSON file path
const DATA_FILE_PATH = path.join(__dirname, '..', 'data', 'charger-data.json');

/**
 * Test if data file exists
 */
async function testFile() {
  try {
    console.log(`📁 Checking file: ${DATA_FILE_PATH}`);
    
    if (!fs.existsSync(DATA_FILE_PATH)) {
      return {
        success: false,
        error: 'File not found',
        path: DATA_FILE_PATH
      };
    }
    
    const stats = fs.statSync(DATA_FILE_PATH);
    const fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    
    return {
      success: true,
      path: DATA_FILE_PATH,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      firstChars: fileContent.substring(0, 100),
      lastChars: fileContent.substring(fileContent.length - 100)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sync charger data from JSON file
 */
async function syncChargerDataFromFile(deviceId) {
  try {
    console.log('🔄 Starting data import from JSON file...');
    
    // Check if file exists
    if (!fs.existsSync(DATA_FILE_PATH)) {
      throw new Error('Data file not found');
    }
    
    // Read JSON file
    console.log(`📁 Reading file: ${DATA_FILE_PATH}`);
    const fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    console.log(`📄 File size: ${(fileContent.length / 1024 / 1024).toFixed(2)} MB`);
    
    console.log('🔄 Parsing JSON...');
    let allData;
    try {
      allData = JSON.parse(fileContent);
      console.log(`📥 Loaded ${allData.length} records from JSON file`);
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError.message);
      throw new Error(`Invalid JSON file: ${parseError.message}`);
    }
    
    // Filter data for target device
    const externalData = allData.filter(record => record.deviceId === deviceId);
    console.log(`🎯 Filtered to ${externalData.length} records for device: ${deviceId}`);
    
    // If no data found for this device, return early
    if (externalData.length === 0) {
      return {
        success: true,
        message: `No data found for device: ${deviceId}`,
        syncedRecords: 0,
        chargerUpdated: false,
        totalRecords: 0,
        processedRecords: 0
      };
    }
    
    let syncedCount = 0;
    let skippedCount = 0;
    let chargerUpdated = false;
    let processedCount = 0;
    
    // First, ensure charger exists
    console.log(`🏗️ Ensuring charger exists for device: ${deviceId}`);
    let charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: { exclude: ['chargerStatus'] }
    });
    let created = false;
    if (!charger) {
      await Charger.create({
        deviceId: deviceId,
        name: `Charger ${deviceId}`,
        status: 'Available',
        vendor: 'Unknown',
        model: 'Unknown',
        serialNumber: 'Unknown',
        firmwareVersion: 'Unknown',
        powerRating: 'Unknown',
        voltage: 'Unknown',
        current: 'Unknown',
        energyConsumption: 'Unknown',
        lastSeen: new Date()
      }, {
        fields: ['deviceId','name','status','vendor','model','serialNumber','firmwareVersion','powerRating','voltage','current','energyConsumption','lastSeen'],
        returning: false
      });
      charger = await Charger.findOne({ where: { deviceId: deviceId }, attributes: { exclude: ['chargerStatus'] } });
      created = true;
    }
    
    if (created) {
      console.log(`🏗️ Created new charger for device: ${deviceId}`);
    } else {
      console.log(`🔄 Found existing charger for device: ${deviceId}`);
    }
    
    // Update charger metadata if we have new data
    const bootNotification = externalData.find(item => 
      item.message === 'BootNotification' && 
      item.deviceId === deviceId
    );
    
    if (bootNotification) {
      console.log(`📋 BootNotification found, updating charger metadata`);
      
      // Extract power/energy data from MeterValues
      const meterValues = externalData.find(item => 
        item.message === 'MeterValues' && 
        item.deviceId === deviceId
      );
      
      console.log(`⚡ MeterValues found:`, meterValues ? 'YES' : 'NO');
      
      const metadata = bootNotification?.messageData || {};
      console.log(`📊 Extracted metadata:`, metadata);
      
      // Extract power/energy data from MeterValues
      let powerData = {};
      if (meterValues && meterValues.messageData && meterValues.messageData.meterValue) {
        const meterValue = meterValues.messageData.meterValue[0];
        if (meterValue && meterValue.sampledValue) {
          meterValue.sampledValue.forEach(sample => {
            if (sample.measurand === 'Voltage') {
              powerData.voltage = `${sample.value}${sample.unit}`;
            } else if (sample.measurand === 'Current.Import') {
              powerData.current = `${sample.value}${sample.unit}`;
            } else if (sample.measurand === 'Power.Active.Import') {
              powerData.powerRating = `${sample.value}${sample.unit}`;
            } else if (sample.measurand === 'Energy.Active.Import.Register') {
              powerData.energyConsumption = `${sample.value}${sample.unit}`;
            }
          });
        }
      }
      
      console.log(`⚡ Extracted power data:`, powerData);
      
      // Update existing charger with new metadata
      await charger.update({
        vendor: metadata.chargePointVendor || charger.vendor,
        model: metadata.chargePointModel || charger.model,
        serialNumber: metadata.chargePointSerialNumber || charger.serialNumber,
        chargeBoxSerialNumber: metadata.chargeBoxSerialNumber || charger.chargeBoxSerialNumber,
        meterType: metadata.meterType || charger.meterType,
        firmwareVersion: metadata.firmwareVersion || charger.firmwareVersion,
        meterSerialNumber: metadata.meterSerialNumber || charger.meterSerialNumber,
        powerRating: powerData.powerRating || charger.powerRating,
        voltage: powerData.voltage || charger.voltage,
        current: powerData.current || charger.current,
        energyConsumption: powerData.energyConsumption || charger.energyConsumption,
        vendorId: metadata.chargePointVendor || charger.vendorId,
        errorCode: null, // Will be updated from StatusNotification messages
        installationDate: charger.installationDate || new Date(), // Set to current date if not set
        lastSeen: new Date()
      });
      
      console.log(`✅ Updated charger metadata: ${deviceId}`);
      chargerUpdated = true;
    }
    
    // Now process all records for the device
    console.log(`🔄 Processing ${externalData.length} records...`);
    
    for (const record of externalData) {
      processedCount++;
      
      // Show progress every 1000 records
      if (processedCount % 1000 === 0) {
        console.log(`📊 Progress: ${processedCount}/${externalData.length} records processed (${Math.round((processedCount/externalData.length)*100)}%)`);
      }
      
      // Parse date safely
      let recordDate;
      try {
        if (record.createdAt && record.createdAt.$date) {
          recordDate = new Date(record.createdAt.$date);
        } else if (record.createdAt) {
          recordDate = new Date(record.createdAt);
        } else {
          recordDate = new Date();
        }
        
        // Validate date
        if (isNaN(recordDate.getTime())) {
          console.log(`⚠️ Invalid date for record ${processedCount}, using current date`);
          recordDate = new Date();
        }
      } catch (dateError) {
        console.log(`⚠️ Date parsing error for record ${processedCount}, using current date`);
        recordDate = new Date();
      }
      
      // Use findOrCreate to prevent true duplicates (same message with same messageId and timestamp)
      const [chargerDataRecord, created] = await ChargerData.findOrCreate({
        where: {
          deviceId: record.deviceId,
          messageId: record.messageId,
          message: record.message,
          timestamp: recordDate
        },
        defaults: {
          chargerId: charger.id,
          deviceId: record.deviceId,
          type: record.type,
          connectorId: record.connectorId,
          messageId: record.messageId,
          message: record.message,
          messageData: record.messageData,
          raw: record.raw,
          direction: record.direction,
          timestamp: recordDate
        }
      });
      
      if (created) {
        syncedCount++;
      } else {
        skippedCount++;
        // Only log every 100 skipped records to reduce console spam
        if (skippedCount % 100 === 0) {
          console.log(`⏭️ Skipped ${skippedCount} duplicate records so far...`);
        }
      }

      // Update charger errorCode from StatusNotification messages
      if (record.message === 'StatusNotification' && record.messageData) {
        const errorCode = record.messageData.errorCode;
        if (errorCode !== undefined && errorCode !== null) {
          await charger.update({ errorCode: errorCode.toString() });
          console.log(`🔧 Updated errorCode: ${errorCode}`);
        }
      }
    }
    
    console.log(`🎉 Import completed: ${syncedCount} new records, ${chargerUpdated ? 'charger updated' : 'no charger updates'}`);
    
    return {
      success: true,
      message: `Import completed successfully`,
      syncedRecords: syncedCount,
      skippedRecords: skippedCount,
      chargerUpdated: chargerUpdated,
      totalRecords: externalData.length,
      processedRecords: processedCount
    };
  } catch (error) {
    console.error('❌ Sync error:', error);
    throw error;
  }
}

/**
 * Get charger data with pagination and filtering
 */
async function getChargerData(filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 50;
  const offset = (page - 1) * limit;
  
  const { deviceId, messageType, direction, fromDate, toDate, connectorId } = filters;
  
  // Valid OCPP message types to show (filter out internal system messages)
  const validOcppMessages = [
    'BootNotification',
    'StatusNotification',
    'ChangeConfiguration',
    'RemoteStartTransaction',
    'RemoteStopTransaction',
    'StartTransaction',
    'StopTransaction',
    'MeterValues',
    'Heartbeat',
    'GetConfiguration',
    'Reset',
    'UnlockConnector',
    'Response' // OCPP responses
  ];
  
  // Build where clause
  const whereClause = {
    // Filter out internal system messages - only show valid OCPP messages
    message: {
      [Op.in]: validOcppMessages
    }
  };
  
  if (deviceId) {
    whereClause.deviceId = deviceId;
  }
  
  // Filter by message type if provided
  if (messageType) {
    whereClause.message = messageType; // Override the Op.in filter
  }
  
  // Filter by direction if provided
  if (direction) {
    whereClause.direction = direction;
  }
  
  // Filter by connector ID if provided
  if (connectorId !== undefined && connectorId !== null && connectorId !== '') {
    whereClause.connectorId = parseInt(connectorId);
  }
  
  // Date range filtering (only apply if filters are provided)
  if (fromDate || toDate) {
    whereClause.timestamp = {};
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0); // Start of day
      whereClause.timestamp[Op.gte] = from;
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999); // End of day
      whereClause.timestamp[Op.lte] = to;
    }
  }
  // If no date filters provided, show all logs (no timestamp restriction)
  
  // Get total count with filters
  const totalCount = await ChargerData.count({
    where: whereClause
  });
  
  // Get paginated data (newest first - latest at top)
  const data = await ChargerData.findAll({
    where: whereClause,
    include: [{
      model: Charger,
      as: 'charger',
      attributes: { exclude: ['chargerStatus'] }
    }],
    // Sort by timestamp DESC (newest first) then by id DESC for tie-breaking
    order: [['timestamp', 'DESC'], ['id', 'DESC']],
    limit: limit,
    offset: offset,
    // Include messageData and raw for transaction detection
    attributes: ['id', 'deviceId', 'connectorId', 'message', 'messageId', 'direction', 'timestamp', 'createdAt', 'updatedAt', 'messageData', 'raw']
  });

  return {
    success: true,
    data: data,
    pagination: {
      page: page,
      limit: limit,
      total: totalCount,
      pages: Math.ceil(totalCount / limit)
    },
    filters: {
      deviceId: deviceId || null,
      messageType: messageType || null,
      direction: direction || null,
      fromDate: fromDate || null,
      toDate: toDate || null,
      connectorId: connectorId || null
    }
  };
}

/**
 * Get all chargers
 */
async function getAllChargers() {
  // Simple query first - get all chargers (exclude chargerStatus if column doesn't exist)
  const chargers = await Charger.findAll({
    attributes: {
      exclude: ['chargerStatus'] // Exclude if column doesn't exist
    }
  });
  
  console.log(`📊 Found ${chargers.length} chargers in database`);
  console.log(`📋 Charger IDs: ${chargers.map(c => c.deviceId).join(', ')}`);
  
  // Filter out any chargers with empty/null deviceId
  const validChargers = chargers.filter(c => c.deviceId && c.deviceId.trim() !== '');
  console.log(`✅ Valid chargers (after filtering empty IDs): ${validChargers.length}`);
  
  if (validChargers.length !== chargers.length) {
    console.warn(`⚠️ Filtered out ${chargers.length - validChargers.length} chargers with empty deviceId`);
  }
  
  // Sort in JavaScript to handle NULLs properly
  const sortedChargers = validChargers.sort((a, b) => {
    const aTime = a.lastSeen ? new Date(a.lastSeen) : new Date(0);
    const bTime = b.lastSeen ? new Date(b.lastSeen) : new Date(0);
    return bTime - aTime; // Most recent first
  });
  
  console.log(`✅ Returning ${sortedChargers.length} sorted chargers`);
  
  return {
    success: true,
    data: sortedChargers
  };
}

/**
 * Get charger data by deviceId (with default 24h filter)
 */
async function getChargerDataByDevice(deviceId, filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 50;
  const offset = (page - 1) * limit;
  
  const { messageType, direction, fromDate, toDate, connectorId } = filters;
  
  // Valid OCPP message types
  const validOcppMessages = [
    'BootNotification',
    'StatusNotification',
    'ChangeConfiguration',
    'RemoteStartTransaction',
    'RemoteStopTransaction',
    'StartTransaction',
    'StopTransaction',
    'MeterValues',
    'Heartbeat',
    'GetConfiguration',
    'Reset',
    'UnlockConnector',
    'Response'
  ];
  
  // Build where clause
  const whereClause = {
    deviceId: deviceId,
    message: {
      [Op.in]: validOcppMessages
    }
  };
  
  if (messageType) {
    whereClause.message = messageType;
  }
  if (direction) {
    whereClause.direction = direction;
  }
  if (connectorId !== undefined && connectorId !== null && connectorId !== '') {
    whereClause.connectorId = parseInt(connectorId);
  }
  if (fromDate || toDate) {
    whereClause.timestamp = {};
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      whereClause.timestamp[Op.gte] = from;
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      whereClause.timestamp[Op.lte] = to;
    }
  } else {
    // Default: last 24 hours if no date filters
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    whereClause.timestamp = {
      [Op.gte]: last24Hours
    };
  }
  
  const totalCount = await ChargerData.count({
    where: whereClause
  });
  
  const data = await ChargerData.findAll({
    where: whereClause,
    include: [{
      model: Charger,
      as: 'charger',
      attributes: { exclude: ['chargerStatus'] }
    }],
    order: [['timestamp', 'DESC'], ['id', 'DESC']],
    limit: limit,
    offset: offset,
    // Include messageData and raw for transaction detection
    attributes: ['id', 'deviceId', 'connectorId', 'message', 'messageId', 'direction', 'timestamp', 'createdAt', 'updatedAt', 'messageData', 'raw']
  });
  
  return {
    success: true,
    data: data,
    pagination: {
      page: page,
      limit: limit,
      total: totalCount,
      pages: Math.ceil(totalCount / limit)
    },
    filters: {
      deviceId: deviceId,
      messageType: messageType || null,
      direction: direction || null,
      fromDate: fromDate || null,
      toDate: toDate || null,
      connectorId: connectorId || null
    }
  };
}

/**
 * Get log by ID
 */
async function getLogById(logId) {
  const log = await ChargerData.findByPk(logId, {
    include: [{
      model: Charger,
      as: 'charger',
      attributes: { exclude: ['chargerStatus'] }
    }]
  });
  
  if (!log) {
    return {
      success: false,
      error: 'Log not found'
    };
  }
  
  return {
    success: true,
    log: log
  };
}

/**
 * Purge all chargers except specified deviceId
 */
async function purgeChargers(exceptDeviceId) {
  console.log(`⚠️ Purging all chargers except: ${exceptDeviceId}`);

  // Get all deviceIds that will be deleted (for Redis cleanup)
  const chargersToDelete = await Charger.findAll({
    where: { deviceId: { [Op.ne]: exceptDeviceId } },
    attributes: ['deviceId']
  });
  const deviceIdsToCleanup = chargersToDelete.map(c => c.deviceId);

  // Delete charger_data for all other deviceIds
  const deletedData = await ChargerData.destroy({ where: { deviceId: { [Op.ne]: exceptDeviceId } } });

  // Delete chargers except the one specified
  const deletedChargers = await Charger.destroy({ where: { deviceId: { [Op.ne]: exceptDeviceId } } });

  console.log(`🗑️ Deleted ${deletedData} charger_data rows and ${deletedChargers} chargers (kept ${exceptDeviceId})`);

  // Clean up Redis keys for all deleted chargers
  if (deviceIdsToCleanup.length > 0) {
    try {
      let cleanedCount = 0;
      for (const deviceId of deviceIdsToCleanup) {
        const deleted = await cleanupChargerKeys(deviceId);
        if (deleted > 0) cleanedCount++;
      }
      console.log(`✅ [Purge] Cleaned up Redis keys for ${cleanedCount} chargers`);
    } catch (cleanupError) {
      console.error(`⚠️ [Purge] Error cleaning up Redis keys:`, cleanupError.message);
      // Don't fail the request if cleanup fails
    }
  }

  return {
    success: true,
    kept: exceptDeviceId,
    deletedData,
    deletedChargers
  };
}

module.exports = {
  testFile,
  syncChargerDataFromFile,
  getChargerData,
  getAllChargers,
  getChargerDataByDevice,
  getLogById,
  purgeChargers
};

