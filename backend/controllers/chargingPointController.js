const chargingPointService = require('../services/chargingPointService');

/**
 * Get all charging points with pagination and filters
 */
exports.getAllChargingPoints = async (req, res) => {
  try {
    // Handle stationId - can be integer (DB ID) or string (stationId like STN-...)
    let stationId = null;
    if (req.query.stationId) {
      const stationIdParam = req.query.stationId;
      // If it's a string starting with "STN-", look up the station
      if (typeof stationIdParam === 'string' && stationIdParam.startsWith('STN-')) {
        const Station = require('../models/Station');
        const station = await Station.findOne({
          where: { stationId: stationIdParam, deleted: false },
          attributes: ['id']
        });
        if (!station) {
          return res.status(400).json({
            success: false,
            message: 'Station not found'
          });
        }
        stationId = station.id;
      } else {
        // Try to parse as integer
        const parsed = parseInt(stationIdParam);
        if (!isNaN(parsed) && parsed > 0) {
          stationId = parsed;
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid stationId. Must be a valid station ID or station ID string (STN-...)'
          });
        }
      }
    }

    // Normalize status to match expected values
    let status = req.query.status;
    if (status) {
      const statusLower = status.toLowerCase();
      if (statusLower === 'active') {
        status = 'Online'; // Map active to Online
      } else if (statusLower === 'inactive') {
        status = 'Offline'; // Map inactive to Offline
      } else if (statusLower === 'online') {
        status = 'Online';
      } else if (statusLower === 'offline') {
        status = 'Offline';
      } else if (statusLower === 'faulted') {
        status = 'Faulted';
      }
    }

    const filters = {
      search: req.query.search,
      status: status, // Use normalized status
      stationId: stationId
    };
    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };

    const result = await chargingPointService.getAllChargingPoints(filters, pagination);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching charging points:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch charging points',
      error: error.message || 'An unexpected error occurred'
    });
  }
};

/**
 * Get single charging point by chargingPointId
 */
exports.getChargingPointById = async (req, res) => {
  try {
    const { chargingPointId } = req.params;

    const result = await chargingPointService.getChargingPointByChargingPointId(chargingPointId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Charging point not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching charging point:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch charging point',
      error: error.message
    });
  }
};

/**
 * Create new charging point with connectors
 */
exports.createChargingPoint = async (req, res) => {
  try {
    const chargingPointData = {
      deviceName: req.body.deviceName,
      chargingStation: req.body.chargingStation,
      tariff: req.body.tariff,
      chargerType: req.body.chargerType,
      powerCapacity: req.body.powerCapacity,
      firmwareVersion: req.body.firmwareVersion,
      oemList: req.body.oemList,
      phase: req.body.phase,
      connectors: req.body.connectors,
      createdBy: req.body.createdBy
    };

    const result = await chargingPointService.createChargingPoint(chargingPointData);

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating charging point:', error);
    
    // Handle specific validation errors
    if (error.message === 'Invalid charging station. Please select a valid station.' ||
        error.message === 'Tariff not found' ||
        error.message === 'Station not found') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create charging point',
      error: error.message
    });
  }
};

/**
 * Update charging point
 */
exports.updateChargingPoint = async (req, res) => {
  try {
    const { chargingPointId } = req.params;
    const updateData = req.body;

    const result = await chargingPointService.updateChargingPoint(chargingPointId, updateData);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Charging point not found'
      });
    }

    // Handle specific validation errors
    if (result.error) {
      return res.status(400).json({
        success: false,
        message: result.error,
        error: result.error
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error updating charging point:', error);
    
    // Handle specific validation errors
    if (error.message === 'Invalid charging station. Please select a valid station.' ||
        error.message === 'Invalid tariff. Please select a valid tariff.' ||
        error.message === 'Station not found' ||
        error.message === 'Tariff not found') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update charging point',
      error: error.message
    });
  }
};

/**
 * Delete charging point (soft delete)
 */
exports.deleteChargingPoint = async (req, res) => {
  try {
    const { chargingPointId } = req.params;

    const result = await chargingPointService.deleteChargingPoint(chargingPointId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Charging point not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting charging point:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete charging point',
      error: error.message
    });
  }
};

