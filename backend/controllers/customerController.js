const customerService = require('../services/customerService');

/**
 * Register customer
 */
async function register(req, res) {
  try {
    const { fullName, email, phone, password } = req.body;
    const result = await customerService.registerCustomer(fullName, email, phone, password);
    res.status(201).json(result);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Login customer
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const result = await customerService.loginCustomer(email, password);
    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Get current customer
 */
async function getCurrentCustomer(req, res) {
  try {
    const result = await customerService.getCurrentCustomer(req.customer.id);
    res.json(result);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Update customer profile
 */
async function updateProfile(req, res) {
  try {
    const { fullName, email, phone } = req.body;
    const result = await customerService.updateCustomerProfile(req.customer.id, { fullName, email, phone });
    res.json(result);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update profile'
    });
  }
}

/**
 * Change customer password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await customerService.changeCustomerPassword(req.customer.id, currentPassword, newPassword);
    res.json(result);
  } catch (error) {
    console.error('Change password error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to change password'
    });
  }
}

/**
 * Forgot password
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const result = await customerService.forgotPassword(email);
    res.json(result);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Reset password
 */
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;
    const result = await customerService.resetPassword(token, password);
    res.json(result);
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Get customer vehicles
 */
async function getVehicles(req, res) {
  try {
    const result = await customerService.getCustomerVehicles(req.customer.id);
    res.json(result);
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch vehicles'
    });
  }
}

/**
 * Get customer vehicle by ID
 */
async function getVehicleById(req, res) {
  try {
    const { vehicleId } = req.params;
    const result = await customerService.getCustomerVehicleById(req.customer.id, vehicleId);
    res.json(result);
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(404).json({
      success: false,
      error: error.message || 'Vehicle not found'
    });
  }
}

/**
 * Create customer vehicle
 */
async function createVehicle(req, res) {
  try {
    const result = await customerService.createCustomerVehicle(req.customer.id, req.body);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating vehicle:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create vehicle'
    });
  }
}

/**
 * Update customer vehicle
 */
async function updateVehicle(req, res) {
  try {
    const { vehicleId } = req.params;
    const result = await customerService.updateCustomerVehicle(req.customer.id, vehicleId, req.body);
    res.json(result);
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update vehicle'
    });
  }
}

/**
 * Delete customer vehicle
 */
async function deleteVehicle(req, res) {
  try {
    const { vehicleId } = req.params;
    const result = await customerService.deleteCustomerVehicle(req.customer.id, vehicleId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to delete vehicle'
    });
  }
}

module.exports = {
  register,
  login,
  getCurrentCustomer,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle
};

