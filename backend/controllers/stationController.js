const stationService = require('../services/stationService');

/**
 * Get all stations
 */
async function getAllStations(req, res) {
  try {
    const { location, sortBy } = req.query;
    const result = await stationService.getAllStations(location, sortBy);
    res.json(result);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch stations'
    });
  }
}

/**
 * Get station by ID
 */
async function getStationById(req, res) {
  try {
    const { stationId } = req.params;
    const result = await stationService.getStationById(stationId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching station:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch station'
    });
  }
}

module.exports = {
  getAllStations,
  getStationById
};

