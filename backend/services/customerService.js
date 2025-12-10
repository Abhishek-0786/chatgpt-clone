const jwt = require('jsonwebtoken');
const { Customer, Wallet, Vehicle } = require('../models');
const { Op } = require('sequelize');
const { getOrCreateWallet } = require('./walletService');
const { sendPasswordResetEmail } = require('../libs/email');
const crypto = require('crypto');

/**
 * Register a new customer
 */
async function registerCustomer(fullName, email, phone, password) {
  // Check if customer already exists
  const existingCustomer = await Customer.findOne({
    where: {
      [Op.or]: [{ email }, { phone }]
    }
  });

  if (existingCustomer) {
    throw new Error('Customer with this email or phone number already exists');
  }

  // Create new customer
  const customer = await Customer.create({
    fullName,
    email,
    phone,
    password
  });

  // Auto-create wallet for new customer
  await Wallet.create({
    customerId: customer.id,
    balance: 0.00,
    currency: 'INR'
  });

  // Generate JWT token
  const token = jwt.sign(
    { customerId: customer.id, email: customer.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    message: 'Customer registered successfully',
    token,
    user: customer.toJSON()
  };
}

/**
 * Login customer
 */
async function loginCustomer(email, password) {
  // Find customer by email
  const customer = await Customer.findOne({ where: { email } });
  if (!customer) {
    throw new Error('Invalid credentials');
  }

  // Validate password
  const isValidPassword = await customer.validatePassword(password);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
  }

  // Generate JWT token
  const token = jwt.sign(
    { customerId: customer.id, email: customer.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    message: 'Login successful',
    token,
    user: customer.toJSON()
  };
}

/**
 * Get current customer
 */
async function getCurrentCustomer(customerId) {
  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  return {
    success: true,
    user: customer.toJSON()
  };
}

/**
 * Update customer profile
 */
async function updateCustomerProfile(customerId, updateData) {
  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  const { fullName, email, phone } = updateData;

  // Check if email is being changed and if it's already taken
  if (email && email !== customer.email) {
    const existingCustomer = await Customer.findOne({
      where: { email, id: { [Op.ne]: customer.id } }
    });
    if (existingCustomer) {
      throw new Error('Email is already registered');
    }
  }

  // Check if phone is being changed and if it's already taken
  if (phone && phone !== customer.phone) {
    const existingCustomer = await Customer.findOne({
      where: { phone, id: { [Op.ne]: customer.id } }
    });
    if (existingCustomer) {
      throw new Error('Phone number is already registered');
    }
  }

  // Update customer
  const updateFields = {};
  if (fullName) updateFields.fullName = fullName;
  if (email) updateFields.email = email;
  if (phone) updateFields.phone = phone;

  await customer.update(updateFields);

  return {
    success: true,
    message: 'Profile updated successfully',
    user: customer.toJSON()
  };
}

/**
 * Change customer password
 */
async function changeCustomerPassword(customerId, currentPassword, newPassword) {
  const customer = await Customer.findByPk(customerId);
  if (!customer) {
    throw new Error('Customer not found');
  }

  // Verify current password
  const isValidPassword = await customer.validatePassword(currentPassword);
  if (!isValidPassword) {
    throw new Error('Current password is incorrect');
  }

  // Check if new password is same as current password
  const isSamePassword = await customer.validatePassword(newPassword);
  if (isSamePassword) {
    throw new Error('New password must be different from current password');
  }

  // Update password
  customer.password = newPassword;
  await customer.save();

  return {
    success: true,
    message: 'Password changed successfully'
  };
}

/**
 * Forgot password - send reset email
 */
async function forgotPassword(email, requestHost = '') {
  // Find customer
  const customer = await Customer.findOne({ where: { email } });
  
  // Always return success for security (don't reveal if email exists)
  if (!customer) {
    return {
      success: true,
      message: 'If that email exists, we\'ve sent a password reset link.'
    };
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

  // Save token to database
  await customer.update({
    resetPasswordToken: resetToken,
    resetPasswordExpires: resetTokenExpires
  });

  // Generate reset link - detect production domain from request host or use FRONTEND_URL
  const getFrontendUrl = () => {
    // First, check if FRONTEND_URL is explicitly set
    if (process.env.FRONTEND_URL) {
      return process.env.FRONTEND_URL;
    }
    
    // Check request host header to detect production domain
    if (requestHost && requestHost.includes('genx.1charging.com')) {
      return 'https://genx.1charging.com';
    }
    
    // Check NODE_ENV as fallback
    if (process.env.NODE_ENV === 'production') {
      return 'https://genx.1charging.com';
    }
    
    // Default to localhost only in development
    return 'http://localhost:3000';
  };
  const resetLink = `${getFrontendUrl()}/user-panel/reset-password.html?token=${resetToken}`;
  
  // Log the reset link for development
  console.log(`Password reset link for ${email}: ${resetLink}`);
  
  // Send email with reset link
  try {
    const emailSent = await sendPasswordResetEmail(email, resetLink);
    
    if (!emailSent) {
      console.log('⚠️ Email not sent, showing reset link in console for testing');
    }
  } catch (emailError) {
    console.error('❌ Error during email sending:', emailError);
    console.log('📧 Reset link (copy this):', resetLink);
  }

  return {
    success: true,
    message: 'If that email exists, we\'ve sent a password reset link.'
  };
}

/**
 * Reset password with token
 */
async function resetPassword(token, password) {
  // Find customer with valid reset token
  const customer = await Customer.findOne({
    where: {
      resetPasswordToken: token,
      resetPasswordExpires: {
        [Op.gt]: new Date() // Token not expired
      }
    }
  });

  if (!customer) {
    throw new Error('Invalid or expired reset token');
  }

  // Update password and clear reset token
  await customer.update({
    password: password, // This will be hashed by the hook
    resetPasswordToken: null,
    resetPasswordExpires: null
  });

  return {
    success: true,
    message: 'Password reset successful. You can now login with your new password.'
  };
}

/**
 * Get customer vehicles
 */
async function getCustomerVehicles(customerId) {
  const vehicles = await Vehicle.findAll({
    where: { customerId },
    order: [['createdAt', 'DESC']]
  });

  return {
    success: true,
    vehicles: vehicles.map(v => v.toJSON())
  };
}

/**
 * Get customer vehicle by ID
 */
async function getCustomerVehicleById(customerId, vehicleId) {
  const vehicle = await Vehicle.findOne({
    where: {
      id: vehicleId,
      customerId: customerId
    }
  });

  if (!vehicle) {
    throw new Error('Vehicle not found');
  }

  return {
    success: true,
    vehicle: vehicle.toJSON()
  };
}

/**
 * Create customer vehicle
 */
async function createCustomerVehicle(customerId, vehicleData) {
  const vehicle = await Vehicle.create({
    customerId,
    ...vehicleData
  });

  return {
    success: true,
    message: 'Vehicle added successfully',
    vehicle: vehicle.toJSON()
  };
}

/**
 * Update customer vehicle
 */
async function updateCustomerVehicle(customerId, vehicleId, updateData) {
  const vehicle = await Vehicle.findOne({
    where: {
      id: vehicleId,
      customerId: customerId
    }
  });

  if (!vehicle) {
    throw new Error('Vehicle not found');
  }

  await vehicle.update(updateData);

  return {
    success: true,
    message: 'Vehicle updated successfully',
    vehicle: vehicle.toJSON()
  };
}

/**
 * Delete customer vehicle
 */
async function deleteCustomerVehicle(customerId, vehicleId) {
  const vehicle = await Vehicle.findOne({
    where: {
      id: vehicleId,
      customerId: customerId
    }
  });

  if (!vehicle) {
    throw new Error('Vehicle not found');
  }

  await vehicle.destroy();

  return {
    success: true,
    message: 'Vehicle deleted successfully'
  };
}

module.exports = {
  registerCustomer,
  loginCustomer,
  getCurrentCustomer,
  updateCustomerProfile,
  changeCustomerPassword,
  forgotPassword,
  resetPassword,
  getCustomerVehicles,
  getCustomerVehicleById,
  createCustomerVehicle,
  updateCustomerVehicle,
  deleteCustomerVehicle
};

