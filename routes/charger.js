const express = require('express');
const router = express.Router();
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const fs = require('fs');
const path = require('path');

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
    
    // Filter by specific device ID (you can change this)
    const targetDeviceId = '1CEVCHAC31506'; // Change this to your device ID
    
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
    
    // First, ensure charger exists (findOrCreate to avoid deletion)
    console.log(`🏗️ Ensuring charger exists for device: ${targetDeviceId}`);
    let [charger, created] = await Charger.findOrCreate({
      where: { deviceId: targetDeviceId },
      defaults: {
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
        energyConsumption: 'Unknown'
      }
    });
    
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
      
      // Check if record already exists (proper duplicate check)
      const existingRecord = await ChargerData.findOne({
        where: {
          deviceId: record.deviceId,
          messageId: record.messageId,
          message: record.message
        }
      });
      
      if (existingRecord) {
        skippedCount++;
        console.log(`⏭️ Skipping existing record ${processedCount}/${externalData.length}: ${record.message} (${record.messageId})`);
      } else {
        syncedCount++;
        console.log(`📝 Creating record ${processedCount}/${externalData.length}: ${record.message} (${record.messageId})`);
        
        // Create charger data record
        await ChargerData.create({
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
        });

        // Update charger errorCode from StatusNotification messages
        if (record.message === 'StatusNotification' && record.messageData) {
          const errorCode = record.messageData.errorCode;
          if (errorCode !== undefined && errorCode !== null) {
            await charger.update({ errorCode: errorCode.toString() });
            console.log(`🔧 Updated errorCode: ${errorCode}`);
          }
        }
        
        syncedCount++;
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

// Get charger data with pagination
router.get('/data', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100; // Much higher limit
        const offset = (page - 1) * limit;
        
        // Get total count for specific device only
        const targetDeviceId = '1CEVCHAC31506'; // Target this device
        const totalCount = await ChargerData.count({
            where: { deviceId: targetDeviceId }
        });
        
        // Get paginated data for specific device only (most recent first)
        const data = await ChargerData.findAll({
            where: { deviceId: targetDeviceId },
            include: [{
                model: Charger,
                as: 'charger',
                attributes: ['name', 'location', 'vendor', 'model']
            }],
            order: [['timestamp', 'DESC']],
            limit: limit,
            offset: offset
        });
    
    res.json({
      success: true,
      data: data,
      pagination: {
        page: page,
        limit: limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
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
    const chargers = await Charger.findAll({
      order: [['lastSeen', 'DESC']]
    });
    
    res.json({
      success: true,
      data: chargers
    });
    
  } catch (error) {
    console.error('❌ Error fetching chargers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chargers',
      details: error.message
    });
  }
});

// Get specific charger data
router.get('/data/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get total count for this device
    const totalCount = await ChargerData.count({
      where: { deviceId: deviceId }
    });
    
    // Get paginated data for this device
    const data = await ChargerData.findAll({
      where: { deviceId: deviceId },
      include: [{
        model: Charger,
        as: 'charger',
        attributes: ['name', 'location', 'vendor', 'model']
      }],
      order: [['timestamp', 'DESC']],
      limit: limit,
      offset: offset
    });
    
    res.json({
      success: true,
      data: data,
      pagination: {
        page: page,
        limit: limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
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

module.exports = router;
