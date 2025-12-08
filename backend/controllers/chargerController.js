const chargerService = require('../services/chargerService');

/**
 * Test if data file exists
 */
exports.testFile = async (req, res) => {
  try {
    const result = await chargerService.testFile();
    res.json(result);
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Sync charger data from JSON file
 */
exports.syncData = async (req, res) => {
  try {
    const targetDeviceId = (req.query.deviceId || '').trim();
    if (!targetDeviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required. Example: /api/charger/sync?deviceId=CP001'
      });
    }

    const result = await chargerService.syncChargerDataFromFile(targetDeviceId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('❌ Sync error:', error);
    if (error.message === 'Data file not found') {
      res.status(404).json({
        success: false,
        error: 'Data file not found',
        message: 'Please place charger-data.json in the data folder'
      });
    } else if (error.message.includes('Invalid JSON file')) {
      res.status(500).json({
        success: false,
        error: 'Invalid JSON file',
        details: error.message.replace('Invalid JSON file: ', '')
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to sync data',
        details: error.message
      });
    }
  }
};

/**
 * Get charger data with pagination and filtering
 */
exports.getChargerData = async (req, res) => {
  try {
    const filters = {
      deviceId: req.query.deviceId,
      messageType: req.query.messageType,
      direction: req.query.direction,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      connectorId: req.query.connectorId
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };

    const result = await chargerService.getChargerData(filters, pagination);
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching charger data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch charger data',
      details: error.message
    });
  }
};

/**
 * Get all chargers
 */
exports.getAllChargers = async (req, res) => {
  try {
    const result = await chargerService.getAllChargers();
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching chargers:', error);
    console.error('Full error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chargers',
      details: error.message
    });
  }
};

/**
 * Get charger data by deviceId
 */
exports.getChargerDataByDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const filters = {
      messageType: req.query.messageType,
      direction: req.query.direction,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      connectorId: req.query.connectorId
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    };

    const result = await chargerService.getChargerDataByDevice(deviceId, filters, pagination);
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching charger data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch charger data',
      details: error.message
    });
  }
};

/**
 * Get log by ID
 */
exports.getLogById = async (req, res) => {
  try {
    const { logId } = req.params;
    const result = await chargerService.getLogById(logId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching log details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch log details',
      details: error.message
    });
  }
};

/**
 * Purge all chargers except specified deviceId
 */
exports.purgeChargers = async (req, res) => {
  try {
    const exceptId = (req.query.except || '').trim();
    const confirm = (req.query.confirm || '').trim();

    if (!exceptId) {
      return res.status(400).json({ success: false, error: 'Query param "except" is required' });
    }
    if (confirm !== 'YES') {
      return res.status(400).json({ success: false, error: 'Add confirm=YES to proceed' });
    }

    const result = await chargerService.purgeChargers(exceptId);
    res.json(result);
  } catch (error) {
    console.error('❌ Purge error:', error);
    res.status(500).json({ success: false, error: 'Failed to purge', details: error.message });
  }
};

