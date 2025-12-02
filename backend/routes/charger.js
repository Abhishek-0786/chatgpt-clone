const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const ChargingSession = require('../models/ChargingSession');
const ChargingPoint = require('../models/ChargingPoint');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const fs = require('fs');
const path = require('path');
const { sendOcppCall, connections } = require('../utils/websocket_client');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishChargingCommand = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../services/rabbitmq/producer');
    publishChargingCommand = producer.publishChargingCommand;
    console.log('✅ [RABBITMQ] Charger routes configured to use RabbitMQ for command publishing');
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
} else {
  console.log('ℹ️ [LEGACY] Charger routes using direct processing (ENABLE_RABBITMQ=false)');
}

// Helper function to extract meter value from ChargerData
function extractMeterValue(meterValuesLog) {
  try {
    if (!meterValuesLog || !meterValuesLog.messageData) {
      return null;
    }

    const messageData = meterValuesLog.messageData;
    
    // Check if meterValue is directly in messageData
    if (messageData.meterValue && Array.isArray(messageData.meterValue) && messageData.meterValue.length > 0) {
      const meterValue = messageData.meterValue[0];
      if (meterValue.sampledValue && Array.isArray(meterValue.sampledValue)) {
        for (const sampledValue of meterValue.sampledValue) {
          if (sampledValue.measurand === 'Energy.Active.Import.Register' || 
              sampledValue.measurand === 'Energy.Active.Import.Interval' ||
              sampledValue.measurand === 'Energy.Active.Import.Export') {
            const value = parseFloat(sampledValue.value);
            if (!isNaN(value)) {
              return value;
            }
          }
        }
      }
    }

    // Check raw OCPP message format
    if (meterValuesLog.raw && Array.isArray(meterValuesLog.raw) && meterValuesLog.raw.length > 2) {
      const payload = meterValuesLog.raw[2];
      if (payload && payload.meterValue && Array.isArray(payload.meterValue) && payload.meterValue.length > 0) {
        const meterValue = payload.meterValue[0];
        if (meterValue.sampledValue && Array.isArray(meterValue.sampledValue)) {
          for (const sampledValue of meterValue.sampledValue) {
            if (sampledValue.measurand === 'Energy.Active.Import.Register' || 
                sampledValue.measurand === 'Energy.Active.Import.Interval' ||
                sampledValue.measurand === 'Energy.Active.Import.Export') {
              const value = parseFloat(sampledValue.value);
              if (!isNaN(value)) {
                return value;
              }
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting meter value:', error);
    return null;
  }
}

// Helper function to get or create wallet
async function getOrCreateWallet(customerId) {
  let wallet = await Wallet.findOne({
    where: { customerId }
  });

  if (!wallet) {
    wallet = await Wallet.create({
      customerId,
      balance: 0.00,
      currency: 'INR'
    });
  }

  return wallet;
}

// JSON file path
const DATA_FILE_PATH = path.join(__dirname, '..', 'data', 'charger-data.json');

// Test endpoint to check file
router.get('/test-file', (req, res) => {
  try {
    console.log(`📁 Checking file: ${DATA_FILE_PATH}`);
    
    if (!fs.existsSync(DATA_FILE_PATH)) {
      return res.json({
        success: false,
        error: 'File not found',
        path: DATA_FILE_PATH
      });
    }
    
    const stats = fs.statSync(DATA_FILE_PATH);
    const fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf8');
    
    res.json({
      success: true,
      path: DATA_FILE_PATH,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      firstChars: fileContent.substring(0, 100),
      lastChars: fileContent.substring(fileContent.length - 100)
    });
    
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Import data from JSON file
router.get('/sync', async (req, res) => {
  try {
    console.log('🔄 Starting data import from JSON file...');
    
    // Check if file exists
    if (!fs.existsSync(DATA_FILE_PATH)) {
      return res.status(404).json({
        success: false,
        error: 'Data file not found',
        message: 'Please place charger-data.json in the data folder'
      });
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
      return res.status(500).json({
        success: false,
        error: 'Invalid JSON file',
        details: parseError.message
      });
    }
    
    // Require deviceId via query to avoid hardcoded imports
    const targetDeviceId = (req.query.deviceId || '').trim();
    if (!targetDeviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required. Example: /api/charger/sync?deviceId=CP001'
      });
    }
    
    // Don't delete existing charger record - just update it
    console.log(`🔄 Will update existing charger record for device: ${targetDeviceId}`);
    
    const externalData = allData.filter(record => record.deviceId === targetDeviceId);
    console.log(`🎯 Filtered to ${externalData.length} records for device: ${targetDeviceId}`);
    
    // If no data found for this device, return early
    if (externalData.length === 0) {
      return res.json({
        success: true,
        message: `No data found for device: ${targetDeviceId}`,
        syncedRecords: 0,
        chargerUpdated: false,
        totalRecords: 0,
        processedRecords: 0
      });
    }
    
    let syncedCount = 0;
    let skippedCount = 0;
    let chargerUpdated = false;
    let processedCount = 0;
    
    // First, ensure charger exists (avoid selecting non-existent columns)
    console.log(`🏗️ Ensuring charger exists for device: ${targetDeviceId}`);
    let charger = await Charger.findOne({
      where: { deviceId: targetDeviceId },
      attributes: { exclude: ['chargerStatus'] }
    });
    let created = false;
    if (!charger) {
      await Charger.create({
        deviceId: targetDeviceId,
        name: `Charger ${targetDeviceId}`,
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
      charger = await Charger.findOne({ where: { deviceId: targetDeviceId }, attributes: { exclude: ['chargerStatus'] } });
      created = true;
    }
    
    if (created) {
      console.log(`🏗️ Created new charger for device: ${targetDeviceId}`);
    } else {
      console.log(`🔄 Found existing charger for device: ${targetDeviceId}`);
    }
    
    // Update charger metadata if we have new data
    const bootNotification = externalData.find(item => 
      item.message === 'BootNotification' && 
      item.deviceId === targetDeviceId
    );
    
    if (bootNotification) {
      console.log(`📋 BootNotification found, updating charger metadata`);
      
      // Extract power/energy data from MeterValues
      const meterValues = externalData.find(item => 
        item.message === 'MeterValues' && 
        item.deviceId === targetDeviceId
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
      
      console.log(`✅ Updated charger metadata: ${targetDeviceId}`);
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
    
    res.json({
      success: true,
      message: `Import completed successfully`,
      syncedRecords: syncedCount,
      skippedRecords: skippedCount,
      chargerUpdated: chargerUpdated,
      totalRecords: externalData.length,
      processedRecords: processedCount
    });
    
  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync data',
      details: error.message
    });
  }
});

// Get charger data with pagination and filtering
router.get('/data', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50; // Default to 50 for better performance
        const offset = (page - 1) * limit;
        
        // Get filters from query parameters
        const deviceId = req.query.deviceId;
        const messageType = req.query.messageType; // Filter by message type
        const direction = req.query.direction; // Filter by direction (Incoming/Outgoing)
        const fromDate = req.query.fromDate; // Date range start
        const toDate = req.query.toDate; // Date range end
        const connectorId = req.query.connectorId; // Filter by connector ID
        
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
    
        res.json({
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
        });
    
    } catch (error) {
        console.error('❌ Error fetching charger data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch charger data',
            details: error.message
        });
    }
});

// Get charger metadata
router.get('/chargers', async (req, res) => {
  try {
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
    
    res.json({
      success: true,
      data: sortedChargers
    });
    
  } catch (error) {
    console.error('❌ Error fetching chargers:', error);
    console.error('Full error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chargers',
      details: error.message
    });
  }
});

// Get specific charger data
// Get specific charger data (legacy endpoint - uses same filtering as /data)
router.get('/data/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    // Use the same logic as /data endpoint but with deviceId from params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    // Get filters from query parameters
    const messageType = req.query.messageType;
    const direction = req.query.direction;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const connectorId = req.query.connectorId;
    
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
    
    res.json({
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
    });
  } catch (error) {
    console.error('❌ Error fetching charger data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch charger data',
      details: error.message
    });
  }
});

// Get full log details by ID
router.get('/data/log/:logId', async (req, res) => {
  try {
    const { logId } = req.params;
    
    const log = await ChargerData.findByPk(logId, {
      include: [{
        model: Charger,
        as: 'charger',
        attributes: { exclude: ['chargerStatus'] }
      }]
    });
    
    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Log not found'
      });
    }
    
    res.json({
      success: true,
      log: log
    });
  } catch (error) {
    console.error('❌ Error fetching log details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch log details',
      details: error.message
    });
  }
});

// Danger: purge all chargers except a specific deviceId (local cleanup helper)
// Usage: DELETE /api/charger/purge?except=DEVICE_ID&confirm=YES
router.delete('/purge', async (req, res) => {
  try {
    const exceptId = (req.query.except || '').trim();
    const confirm = (req.query.confirm || '').trim();

    if (!exceptId) {
      return res.status(400).json({ success: false, error: 'Query param "except" is required' });
    }
    if (confirm !== 'YES') {
      return res.status(400).json({ success: false, error: 'Add confirm=YES to proceed' });
    }

    console.log(`⚠️ Purging all chargers except: ${exceptId}`);

    // Delete charger_data for all other deviceIds
    const deletedData = await ChargerData.destroy({ where: { deviceId: { [Op.ne]: exceptId } } });

    // Delete chargers except the one specified
    const deletedChargers = await Charger.destroy({ where: { deviceId: { [Op.ne]: exceptId } } });

    console.log(`🗑️ Deleted ${deletedData} charger_data rows and ${deletedChargers} chargers (kept ${exceptId})`);

    res.json({ success: true, kept: exceptId, deletedData, deletedChargers });
  } catch (error) {
    console.error('❌ Purge error:', error);
    res.status(500).json({ success: false, error: 'Failed to purge', details: error.message });
  }
});

// In-memory map to track recent RemoteStartTransaction requests (prevent duplicates)
const recentRemoteStartRequests = new Map(); // deviceId -> timestamp

// Remote Start Transaction
router.post('/remote-start', async (req, res) => {
  try {
    const { deviceId, connectorId, idTag } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }
    
    if (connectorId === undefined || connectorId === null) {
      return res.status(400).json({
        success: false,
        error: 'connectorId is required'
      });
    }
    
    if (!idTag) {
      return res.status(400).json({
        success: false,
        error: 'idTag is required'
      });
    }
    
    // Find charger
    const charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: { exclude: ['chargerStatus'] }
    });
    
    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }
    
    // Check if charger is connected
    const ws = await connections.get(deviceId);
    if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
      return res.status(400).json({
        success: false,
        error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
      });
    }
    
    // CRITICAL: Check if charger is already charging (has active transaction) - CHECK THIS FIRST!
    // This prevents sending RemoteStartTransaction if charging is already active
    // This is the main protection against periodic/automatic retry requests
    try {
      // Check for any active StartTransaction (not stopped) - look back 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      
      const recentData = await ChargerData.findAll({
        where: { 
          deviceId: deviceId,
          createdAt: {
            [Op.gte]: tenMinutesAgo
          }
        },
        order: [['id', 'DESC']],
        limit: 200
      });
      
      // Find latest StartTransaction
      const startTransactions = recentData.filter(log => 
        log.message === 'StartTransaction' && log.direction === 'Incoming'
      );
      
      if (startTransactions.length > 0) {
        // Get latest StartTransaction (by timestamp, then ID)
        const latestStart = startTransactions.reduce((latest, current) => {
          const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
          const currentTime = new Date(current.timestamp || current.createdAt).getTime();
          if (currentTime > latestTime) return current;
          if (currentTime < latestTime) return latest;
          return (current.id || 0) > (latest.id || 0) ? current : latest;
        });
        
        // Get transactionId from StartTransaction response
        const startResponse = recentData.find(log => 
          log.message === 'Response' && 
          log.messageId === latestStart.messageId &&
          log.direction === 'Outgoing'
        );
        
        let transactionId = null;
        if (startResponse) {
          if (startResponse.messageData && startResponse.messageData.transactionId) {
            transactionId = startResponse.messageData.transactionId;
          } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
            transactionId = startResponse.raw[2].transactionId;
          }
        }
        
        if (transactionId) {
          // Check if there's a StopTransaction for this transactionId
          const stopTransaction = recentData.find(log => 
            log.message === 'StopTransaction' && 
            log.direction === 'Incoming' &&
            (
              (log.messageData && log.messageData.transactionId === transactionId) || 
              (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
            )
          );
          
          // If no StopTransaction found, charging is still active - BLOCK the request
          if (!stopTransaction) {
            const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
            const timeSinceStart = Math.round((Date.now() - startTime) / 1000);
            console.warn(`⚠️ [BLOCKED] RemoteStartTransaction request for ${deviceId} rejected - charger is already charging (Transaction ${transactionId}, started ${timeSinceStart}s ago)`);
            
            // Don't record this in rate limit map - it's a different error (already charging)
            // Just return the error directly
            return res.status(400).json({
              success: false,
              error: `Charger ${deviceId} is already charging (Transaction ${transactionId}). Please stop the current charging session first.`
            });
          }
        }
      }
    } catch (checkError) {
      // If check fails, log warning but continue (don't block the request)
      console.warn(`⚠️ Error checking active transaction for ${deviceId}:`, checkError.message);
    }
    
    // CRITICAL: Check if a RemoteStartTransaction was already sent for this device recently
    // This prevents duplicate API calls from creating multiple RemoteStartTransaction commands
    // BUT only if charging is NOT already active (checked above)
    // ALSO: If charging has stopped (no active transaction), clear the rate limit to allow new requests
    const lastRequestTime = recentRemoteStartRequests.get(deviceId);
    if (lastRequestTime) {
      const timeSinceLastRequest = Date.now() - lastRequestTime;
      // Increased to 2 minutes to prevent periodic requests during charging
      if (timeSinceLastRequest < 120000) { // 2 minutes (was 5 seconds)
        // IMPORTANT: Double-check if charging has actually stopped (StopTransaction exists)
        // If charging has stopped, clear rate limit and allow the request
        try {
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const recentData = await ChargerData.findAll({
            where: { 
              deviceId: deviceId,
              createdAt: {
                [Op.gte]: tenMinutesAgo
              }
            },
            order: [['id', 'DESC']],
            limit: 200
          });
          
          const startTransactions = recentData.filter(log => 
            log.message === 'StartTransaction' && log.direction === 'Incoming'
          );
          
          let hasActiveTransaction = false;
          if (startTransactions.length > 0) {
            const latestStart = startTransactions.reduce((latest, current) => {
              const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
              const currentTime = new Date(current.timestamp || current.createdAt).getTime();
              if (currentTime > latestTime) return current;
              if (currentTime < latestTime) return latest;
              return (current.id || 0) > (latest.id || 0) ? current : latest;
            });
            
            const startResponse = recentData.find(log => 
              log.message === 'Response' && 
              log.messageId === latestStart.messageId &&
              log.direction === 'Outgoing'
            );
            
            let transactionId = null;
            if (startResponse) {
              if (startResponse.messageData && startResponse.messageData.transactionId) {
                transactionId = startResponse.messageData.transactionId;
              } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
                transactionId = startResponse.raw[2].transactionId;
              }
            }
            
            if (transactionId) {
              const stopTransaction = recentData.find(log => 
                log.message === 'StopTransaction' && 
                log.direction === 'Incoming' &&
                (
                  (log.messageData && log.messageData.transactionId === transactionId) || 
                  (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
                )
              );
              
              // If no StopTransaction found, charging is still active
              if (!stopTransaction) {
                hasActiveTransaction = true;
              }
            }
          }
          
          // If charging has stopped (no active transaction), clear rate limit and allow request
          if (!hasActiveTransaction) {
            console.log(`✅ [RATE LIMIT] Charging stopped for ${deviceId}, clearing rate limit to allow new request`);
            recentRemoteStartRequests.delete(deviceId);
            // Continue to allow the request - don't block it
          } else {
            // Charging still active - block the request
            const minutesLeft = Math.ceil((120000 - timeSinceLastRequest) / 60000);
            console.warn(`⚠️ [DUPLICATE PREVENTED] RemoteStartTransaction request for ${deviceId} rejected - duplicate request within 2 minutes (${minutesLeft} minute(s) ago) while charging is active`);
            return res.status(429).json({
              success: false,
              error: `A RemoteStartTransaction request was already sent for ${deviceId} recently. Please wait ${minutesLeft} minute(s) before trying again.`
            });
          }
        } catch (rateLimitCheckError) {
          // If check fails, apply rate limit (safer to block than allow)
          console.warn(`⚠️ Error checking active transaction for rate limit: ${rateLimitCheckError.message}`);
          const minutesLeft = Math.ceil((120000 - timeSinceLastRequest) / 60000);
          console.warn(`⚠️ [DUPLICATE PREVENTED] RemoteStartTransaction request for ${deviceId} rejected - duplicate request within 2 minutes (${minutesLeft} minute(s) ago)`);
          return res.status(429).json({
            success: false,
            error: `A RemoteStartTransaction request was already sent for ${deviceId} recently. Please wait ${minutesLeft} minute(s) before trying again.`
          });
        }
      }
    }
    
    // Record this request (will be cleared after 2 minutes automatically)
    recentRemoteStartRequests.set(deviceId, Date.now());
    // Auto-cleanup after 2 minutes
    setTimeout(() => {
      recentRemoteStartRequests.delete(deviceId);
    }, 120000); // 2 minutes
    
    // Send RemoteStartTransaction
    try {
      const payload = {
        idTag: idTag,
        connectorId: connectorId
      };
      
      // Increase timeout to 60 seconds for live chargers (they may respond slower)
      const response = await sendOcppCall(deviceId, 'RemoteStartTransaction', payload, 60000);
      
      if (response.status === 'Accepted') {
        // Publish command to RabbitMQ for auditing (if enabled)
        if (ENABLE_RABBITMQ && publishChargingCommand) {
          try {
            await publishChargingCommand({
              deviceId: deviceId,
              command: 'RemoteStartTransaction',
              payload: payload,
              timestamp: new Date(),
              sentViaWebSocket: true
            });
            console.log(`📤 [RABBITMQ] Published RemoteStartTransaction command for ${deviceId}`);
          } catch (rabbitmqError) {
            console.warn('⚠️ [RABBITMQ] Failed to publish RemoteStartTransaction command:', rabbitmqError.message);
            // Don't fail the request if RabbitMQ fails
          }
        }

        res.json({
          success: true,
          message: 'Remote start transaction sent successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: `Remote start transaction rejected: ${response.status}`
        });
      }
    } catch (error) {
      // Check if error is due to connection
      if (error.message && error.message.includes('not connected')) {
        console.error('❌ Error sending RemoteStartTransaction:', error);
        return res.status(400).json({
          success: false,
          error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
        });
      }
      
      // Check if error is due to timeout
      if (error.message && error.message.includes('timeout')) {
        // Timeout is expected for slow chargers - log as warning, not error
        console.warn(`⚠️ RemoteStartTransaction timeout for ${deviceId} (60s). Charging may still start.`);
        return res.status(408).json({
          success: false,
          error: `Charger ${deviceId} did not respond within 60 seconds. The charger may be offline, busy, or experiencing communication issues. Note: Charging may still start even if this timeout occurs.`
        });
      }
      
      // Other errors - log as error
      console.error('❌ Error sending RemoteStartTransaction:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send remote start transaction'
      });
    }
    
  } catch (error) {
    console.error('❌ Error in remote-start endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process remote start request',
      details: error.message
    });
  }
});

// Remote Stop Transaction
router.post('/remote-stop', async (req, res) => {
  try {
    const { deviceId, transactionId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'transactionId is required'
      });
    }
    
    // Find charger
    const charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: { exclude: ['chargerStatus'] }
    });
    
    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }
    
    // Check if charger is connected
    const ws = await connections.get(deviceId);
    if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
      return res.status(400).json({
        success: false,
        error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
      });
    }
    
    // Send RemoteStopTransaction
    try {
      const payload = {
        transactionId: transactionId
      };
      
      // Increase timeout to 60 seconds for live chargers (they may respond slower)
      const response = await sendOcppCall(deviceId, 'RemoteStopTransaction', payload, 60000);
      
      if (response.status === 'Accepted') {
        // Publish command to RabbitMQ for auditing (if enabled)
        if (ENABLE_RABBITMQ && publishChargingCommand) {
          try {
            await publishChargingCommand({
              deviceId: deviceId,
              command: 'RemoteStopTransaction',
              payload: payload,
              timestamp: new Date(),
              sentViaWebSocket: true
            });
            console.log(`📤 [RABBITMQ] Published RemoteStopTransaction command for ${deviceId}`);
          } catch (rabbitmqError) {
            console.warn('⚠️ [RABBITMQ] Failed to publish RemoteStopTransaction command:', rabbitmqError.message);
            // Don't fail the request if RabbitMQ fails
          }
        }

        // CRITICAL: Clear rate limit when charging stops successfully
        // This allows user to start charging again immediately after stopping
        if (recentRemoteStartRequests.has(deviceId)) {
          console.log(`✅ [RATE LIMIT] Charging stopped for ${deviceId}, clearing rate limit to allow new request`);
          recentRemoteStartRequests.delete(deviceId);
        }
        
        // Update ChargingSession when stopped from CMS
        // Check if there are any active sessions for this deviceId and update them
        try {
          const activeSessions = await ChargingSession.findAll({
            where: {
              deviceId: deviceId,
              status: {
                [Op.in]: ['pending', 'active']
              },
              endTime: null
            },
            include: [
              {
                model: ChargingPoint,
                as: 'chargingPoint',
                include: [
                  {
                    model: require('../models/Tariff'),
                    as: 'tariff'
                  }
                ]
              }
            ],
            order: [['createdAt', 'DESC']]
          });
          
          if (activeSessions.length > 0) {
            // Process each active session with refund calculation
            for (const session of activeSessions) {
              // Get tariff for cost calculation
              const tariff = session.chargingPoint?.tariff;
              const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
              const tax = tariff ? parseFloat(tariff.tax) : 0;

              // Get meter readings
              let meterStart = session.meterStart;
              let meterEnd = null;
              let energyConsumed = 0;

              // Get meter_start if not set
              if (!meterStart && session.startTime) {
                const firstMeterValues = await ChargerData.findOne({
                  where: {
                    deviceId: deviceId,
                    message: 'MeterValues',
                    direction: 'Incoming',
                    createdAt: {
                      [Op.gte]: session.startTime
                    }
                  },
                  order: [['createdAt', 'ASC']],
                  limit: 1
                });

                if (firstMeterValues) {
                  meterStart = extractMeterValue(firstMeterValues);
                }
              }

              // Wait a bit for final meter readings after stop
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds

              // Get latest meter reading
              const lastMeterValues = await ChargerData.findOne({
                where: {
                  deviceId: deviceId,
                  message: 'MeterValues',
                  direction: 'Incoming',
                  createdAt: {
                    [Op.gte]: session.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000)
                  }
                },
                order: [['createdAt', 'DESC']],
                limit: 1
              });

              if (lastMeterValues) {
                meterEnd = extractMeterValue(lastMeterValues);
              }

              // Calculate energy consumed
              if (meterStart !== null && meterEnd !== null && meterEnd >= meterStart) {
                energyConsumed = (meterEnd - meterStart) / 1000; // Convert Wh to kWh
                if (energyConsumed < 0) energyConsumed = 0;
              }

              // Calculate final amount
              let calculatedAmount = 0;
              if (energyConsumed > 0 && baseCharges > 0) {
                const baseAmount = energyConsumed * baseCharges;
                const taxMultiplier = 1 + (tax / 100);
                calculatedAmount = baseAmount * taxMultiplier;
              }

              // Cap finalAmount at amountDeducted
              const amountDeducted = parseFloat(session.amountDeducted);
              let finalAmount = Math.min(calculatedAmount, amountDeducted);

              // Calculate refund
              let refundAmount = 0;
              if (energyConsumed > 0 && calculatedAmount > 0) {
                if (finalAmount < amountDeducted) {
                  refundAmount = amountDeducted - finalAmount;
                }
              } else if (energyConsumed === 0) {
                // No energy consumed - refund full amount
                refundAmount = amountDeducted;
              }

              // Update session with all calculated values
              await session.update({
                status: 'stopped',
                endTime: new Date(),
                stopReason: 'Remote (CMS)',
                energyConsumed: energyConsumed,
                finalAmount: finalAmount,
                refundAmount: refundAmount,
                meterStart: meterStart,
                meterEnd: meterEnd
              });

              console.log(`✅ [Remote Stop] Updated session ${session.sessionId} - Energy: ${energyConsumed.toFixed(3)} kWh, Final: ₹${finalAmount.toFixed(2)}, Refund: ₹${refundAmount.toFixed(2)}`);

              // Update wallet if refund is needed
              if (refundAmount > 0 && session.customerId) {
                try {
                  // Check if refund transaction already exists for this session to prevent duplicates
                  const existingRefund = await WalletTransaction.findOne({
                    where: {
                      customerId: session.customerId,
                      referenceId: session.sessionId,
                      transactionType: 'refund',
                      transactionCategory: 'refund'
                    }
                  });

                  if (!existingRefund) {
                    const wallet = await getOrCreateWallet(session.customerId);
                    const currentBalance = parseFloat(wallet.balance);
                    const newBalance = currentBalance + refundAmount;

                    await wallet.update({ balance: newBalance });

                    // Create refund transaction
                    await WalletTransaction.create({
                      walletId: wallet.id,
                      customerId: session.customerId,
                      transactionType: 'refund',
                      amount: refundAmount,
                      balanceBefore: currentBalance,
                      balanceAfter: newBalance,
                      description: `Refund - Charging Session ${session.sessionId} (Energy: ${energyConsumed.toFixed(2)} kWh, Used: ₹${finalAmount.toFixed(2)}, Refunded: ₹${refundAmount.toFixed(2)})`,
                      referenceId: session.sessionId,
                      status: 'completed',
                      transactionCategory: 'refund'
                    });

                    console.log(`✅ [Remote Stop] Wallet refund processed: ₹${refundAmount} (Balance: ₹${currentBalance} → ₹${newBalance})`);
                  } else {
                    console.log(`✅ [Remote Stop] Refund transaction already exists for session ${session.sessionId}, skipping duplicate`);
                  }
                } catch (walletError) {
                  console.error('⚠️ [Remote Stop] Error updating wallet:', walletError);
                }
              }
            }
          } else {
            console.log(`⚠️ [Remote Stop] No active sessions found for deviceId: ${deviceId}`);
          }
        } catch (sessionError) {
          // Log error but don't fail the request - charger stop was successful
          console.error('⚠️ [Remote Stop] Error updating sessions:', sessionError);
        }
        
        res.json({
          success: true,
          message: 'Remote stop transaction sent successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: `Remote stop transaction rejected: ${response.status}`
        });
      }
    } catch (error) {
      // Check if error is due to connection
      if (error.message && error.message.includes('not connected')) {
        console.error('❌ Error sending RemoteStopTransaction:', error);
        return res.status(400).json({
          success: false,
          error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
        });
      }
      
      // Check if error is due to timeout
      if (error.message && error.message.includes('timeout')) {
        // Timeout is expected for slow chargers - log as warning, not error
        console.warn(`⚠️ RemoteStopTransaction timeout for ${deviceId} (60s). Charging may still stop.`);
        return res.status(408).json({
          success: false,
          error: `Charger ${deviceId} did not respond within 60 seconds. The charger may be offline, busy, or experiencing communication issues. Note: Charging may still stop even if this timeout occurs.`
        });
      }
      
      // Other errors - log as error
      console.error('❌ Error sending RemoteStopTransaction:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send remote stop transaction'
      });
    }
    
  } catch (error) {
    console.error('❌ Error in remote-stop endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process remote stop request',
      details: error.message
    });
  }
});

// ============================================
// API Endpoints for WebSocket Service
// ============================================

/**
 * Get charger by device ID
 * GET /api/charger/by-device/:deviceId
 */
router.get('/by-device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const charger = await Charger.findOne({
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create or update charger (ensure exists)
 * POST /api/charger/ensure
 */
router.post('/ensure', async (req, res) => {
  try {
    const { deviceId, ...chargerData } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }

    // Remove chargerStatus from data if present (column doesn't exist)
    delete chargerData.chargerStatus;

    let charger = await Charger.findOne({ 
      where: { deviceId }
      // defaultScope will automatically exclude chargerStatus
    });

    if (charger) {
      // Update existing charger - only update valid fields
      const validFields = ['name', 'location', 'vendor', 'model', 'serialNumber', 'firmwareVersion', 
                          'meterSerialNumber', 'connectorCount', 'powerRating', 'voltage', 'current', 
                          'energyConsumption', 'status', 'errorCode', 'vendorId', 'installationDate', 'lastSeen'];
      const updateData = {};
      for (const field of validFields) {
        if (chargerData[field] !== undefined) {
          updateData[field] = chargerData[field];
        }
      }
      if (Object.keys(updateData).length > 0) {
        await charger.update(updateData);
        await charger.reload(); // Reload to get updated data
      }
    } else {
      // Create new charger with default values
      const defaultData = {
        deviceId,
        name: chargerData.name || deviceId,
        status: chargerData.status || 'Available',
        vendor: chargerData.vendor || 'Unknown',
        model: chargerData.model || 'Unknown',
        serialNumber: chargerData.serialNumber || 'Unknown',
        firmwareVersion: chargerData.firmwareVersion || 'Unknown',
        connectorCount: chargerData.connectorCount || 0,
        powerRating: chargerData.powerRating || 0
      };
      
      // Add optional fields if provided
      if (chargerData.location) defaultData.location = chargerData.location;
      if (chargerData.meterSerialNumber) defaultData.meterSerialNumber = chargerData.meterSerialNumber;
      if (chargerData.voltage) defaultData.voltage = chargerData.voltage;
      if (chargerData.current) defaultData.current = chargerData.current;
      if (chargerData.energyConsumption) defaultData.energyConsumption = chargerData.energyConsumption;
      if (chargerData.errorCode) defaultData.errorCode = chargerData.errorCode;
      if (chargerData.vendorId) defaultData.vendorId = chargerData.vendorId;
      if (chargerData.installationDate) defaultData.installationDate = chargerData.installationDate;
      if (chargerData.lastSeen) defaultData.lastSeen = chargerData.lastSeen;
      
      charger = await Charger.create(defaultData);
    }

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    console.error('❌ Error in /api/charger/ensure:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Update charger status
 * PATCH /api/charger/:deviceId/status
 */
router.patch('/:deviceId/status', async (req, res) => {
  try {
    const { deviceId } = req.params;
    let { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required'
      });
    }

    // Map 'online'/'offline' to valid ENUM values
    const statusMap = {
      'online': 'Available',
      'offline': 'Unavailable',
      'connected': 'Available',
      'disconnected': 'Unavailable'
    };
    
    if (statusMap[status]) {
      status = statusMap[status];
    }

    // Validate status is one of the allowed values
    const validStatuses = ['Available', 'Charging', 'Occupied', 'Unavailable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const charger = await Charger.findOne({ 
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    await charger.update({ status });

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    console.error('❌ Error updating charger status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update charger last seen timestamp
 * PATCH /api/charger/:deviceId/last-seen
 */
router.patch('/:deviceId/last-seen', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const charger = await Charger.findOne({ 
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    await charger.update({ lastSeen: new Date() });

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get active sessions for charger
 * GET /api/charger/:deviceId/active-sessions
 */
router.get('/:deviceId/active-sessions', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const sessions = await ChargingSession.findAll({
      where: {
        deviceId,
        status: {
          [Op.in]: ['pending', 'active']
        },
        endTime: null // Only get sessions that haven't ended
      },
      attributes: ['id', 'deviceId', 'connectorId', 'transactionId', 'status', 'startTime', 'endTime', 'createdAt', 'updatedAt'],
      include: [
        {
          model: ChargingPoint,
          as: 'chargingPoint',
          attributes: ['id', 'chargingPointId', 'deviceId', 'deviceName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Store OCPP message
 * POST /api/charger/:deviceId/ocpp-message
 */
router.post('/:deviceId/ocpp-message', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const messageData = req.body;

    const charger = await Charger.findOne({ 
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    // Store message in ChargerData
    // Extract fields from messageData (which may be nested)
    const type = messageData.type || 'OCPP';
    const message = messageData.message || messageData.messageType || messageData.action || 'Unknown';
    const direction = messageData.direction || 'Incoming';
    const connectorId = messageData.connectorId || 0;
    const messageId = messageData.messageId || messageData.id || null;
    const payload = messageData.messageData || messageData.payload || messageData;
    const raw = messageData.raw || null;
    const timestamp = messageData.timestamp ? new Date(messageData.timestamp) : new Date();

    await ChargerData.create({
      chargerId: charger.id,
      deviceId,
      type: type,
      connectorId: connectorId,
      messageId: messageId,
      message: message,
      messageData: payload,
      raw: raw,
      direction: direction,
      timestamp: timestamp
    });

    res.json({
      success: true,
      message: 'OCPP message stored successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
