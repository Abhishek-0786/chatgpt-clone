const cmsStationService = require('../services/cmsStationService');

/**
 * Get all stations with pagination and filters
 */
exports.getAllStations = async (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      status: req.query.status,
      organization: req.query.organization
    };
    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };

    const result = await cmsStationService.getAllStations(filters, pagination);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations'
    });
  }
};

/**
 * Get all active stations for dropdown (no pagination)
 */
exports.getStationsDropdown = async (req, res) => {
  try {
    const result = await cmsStationService.getStationsDropdown();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching stations for dropdown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stations'
    });
  }
};

/**
 * Get single station by stationId
 */
exports.getStationById = async (req, res) => {
  try {
    const { stationId } = req.params;
    const result = await cmsStationService.getStationById(stationId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch station'
    });
  }
};

/**
 * Create new station
 */
exports.createStation = async (req, res) => {
  try {
    const stationData = req.body;
    const result = await cmsStationService.createStation(stationData);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create station'
    });
  }
};

/**
 * Update station
 */
exports.updateStation = async (req, res) => {
  try {
    const { stationId } = req.params;
    const updateData = req.body;
    const result = await cmsStationService.updateStation(stationId, updateData);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error updating station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update station'
    });
  }
};

/**
 * Delete station (soft delete)
 */
exports.deleteStation = async (req, res) => {
  try {
    const { stationId } = req.params;
    const result = await cmsStationService.deleteStation(stationId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Station not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete station'
    });
  }
};

