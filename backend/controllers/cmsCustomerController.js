const cmsCustomerService = require('../services/cmsCustomerService');

/**
 * Get all customers with their statistics
 * GET /api/cms/customers
 */
exports.getAllCustomers = async (req, res) => {
  try {
    const filters = {
      searchTerm: req.query.searchTerm || '',
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    };
    const pagination = {}; // Not used currently, but kept for consistency

    const result = await cmsCustomerService.getAllCustomers(filters, pagination);

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers',
      message: error.message
    });
  }
};

/**
 * Get customer details by ID
 * GET /api/cms/customers/:customerId
 */
exports.getCustomerById = async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);

    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid customer ID'
      });
    }

    const result = await cmsCustomerService.getCustomerById(customerId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer details',
      message: error.message
    });
  }
};

/**
 * Get wallet transactions for a specific customer
 * GET /api/cms/customers/:customerId/wallet-transactions
 */
exports.getCustomerWalletTransactions = async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);

    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid customer ID'
      });
    }

    const filters = {
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    };

    const result = await cmsCustomerService.getCustomerWalletTransactions(customerId, filters);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet transactions',
      message: error.message
    });
  }
};

/**
 * Get charging sessions for a specific customer
 * GET /api/cms/customers/:customerId/sessions
 */
exports.getCustomerSessions = async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId);

    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid customer ID'
      });
    }

    const filters = {
      fromDate: req.query.fromDate,
      toDate: req.query.toDate
    };

    const pagination = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };

    const result = await cmsCustomerService.getCustomerSessions(customerId, filters, pagination);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching customer sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer sessions',
      message: error.message
    });
  }
};

