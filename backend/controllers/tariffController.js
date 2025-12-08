const tariffService = require('../services/tariffService');

/**
 * Get all tariffs with pagination and filters
 */
exports.getAllTariffs = async (req, res) => {
  try {
    const filters = {
      search: req.query.search || '',
      status: req.query.status
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };

    const result = await tariffService.getAllTariffs(filters, pagination);
    
    if (!result || !result.tariffs) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch tariffs',
        error: 'Invalid response from service'
      });
    }
    
    res.status(200).json({
      success: true,
      tariffs: result.tariffs,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages
    });
  } catch (error) {
    console.error('Error fetching tariffs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tariffs',
      error: error.message
    });
  }
};

/**
 * Get all active tariffs for dropdown
 */
exports.getTariffsDropdown = async (req, res) => {
  try {
    const result = await tariffService.getTariffsDropdown();
    
    if (!result || !result.tariffs) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch tariffs',
        error: 'Invalid response from service'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        tariffs: result.tariffs
      }
    });
  } catch (error) {
    console.error('Error fetching tariffs for dropdown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tariffs',
      error: error.message
    });
  }
};

/**
 * Get single tariff by tariffId
 */
exports.getTariffById = async (req, res) => {
  try {
    const { tariffId } = req.params;
    
    if (!tariffId || tariffId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'tariffId is required'
      });
    }

    const result = await tariffService.getTariffById(tariffId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Tariff not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        tariff: result
      }
    });
  } catch (error) {
    console.error('Error fetching tariff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tariff',
      error: error.message
    });
  }
};

/**
 * Create new tariff
 */
exports.createTariff = async (req, res) => {
  try {
    const { tariffName, currency, baseCharges, tax, status, createdBy } = req.body;

    const tariffData = {
      tariffName,
      currency,
      baseCharges,
      tax,
      status,
      createdBy
    };

    const result = await tariffService.createTariff(tariffData);
    
    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create tariff',
        error: 'Invalid response from service'
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'Tariff created successfully',
      data: {
        tariff: result
      }
    });
  } catch (error) {
    console.error('Error creating tariff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tariff',
      error: error.message
    });
  }
};

/**
 * Update tariff
 */
exports.updateTariff = async (req, res) => {
  try {
    const { tariffId } = req.params;
    const updateData = req.body;

    if (!tariffId || tariffId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'tariffId is required'
      });
    }

    const result = await tariffService.updateTariff(tariffId, updateData);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Tariff not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Tariff updated successfully',
      data: {
        tariff: result
      }
    });
  } catch (error) {
    console.error('Error updating tariff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tariff',
      error: error.message
    });
  }
};

/**
 * Soft delete tariff
 */
exports.deleteTariff = async (req, res) => {
  try {
    const { tariffId } = req.params;

    if (!tariffId || tariffId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'tariffId is required'
      });
    }

    const result = await tariffService.deleteTariff(tariffId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Tariff not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Tariff deleted successfully',
      data: {
        tariffId: result.tariffId
      }
    });
  } catch (error) {
    console.error('Error deleting tariff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tariff',
      error: error.message
    });
  }
};

