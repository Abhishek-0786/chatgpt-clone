const express = require('express');
const { body, validationResult, query } = require('express-validator');
const jwt = require('jsonwebtoken');
const { Customer, Station, ChargingPoint, Connector, Tariff, Vehicle, Wallet, WalletTransaction, ChargingSession } = require('../models');
const { authenticateCustomerToken } = require('../middleware/customerAuth');
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const { createOrder, verifyPayment, getPaymentDetails } = require('../utils/razorpay');
const crypto = require('crypto');
const axios = require('axios');

const router = express.Router();

// Register (User Panel)
router.post('/auth/register', [
  body('fullName')
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Full name must be between 1 and 100 characters'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number must be between 10 and 15 characters'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { fullName, email, phone, password } = req.body;

    // Check if customer already exists
    const existingCustomer = await Customer.findOne({
      where: {
        [Op.or]: [{ email }, { phone }]
      }
    });

    if (existingCustomer) {
      return res.status(400).json({ 
        success: false,
        error: 'Customer with this email or phone number already exists' 
      });
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

        res.status(201).json({
          success: true,
          message: 'Customer registered successfully',
          token,
          user: customer.toJSON()
        });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Login (User Panel)
router.post('/auth/login', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find customer by email
    const customer = await Customer.findOne({ where: { email } });
    if (!customer) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    // Validate password
    const isValidPassword = await customer.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid credentials' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { customerId: customer.id, email: customer.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: customer.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Get current customer
router.get('/auth/me', authenticateCustomerToken, async (req, res) => {
  try {
    res.json({ 
      success: true,
      user: req.customer.toJSON() 
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Update customer profile
router.put('/auth/profile', authenticateCustomerToken, [
  body('fullName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Full name must be between 1 and 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('phone')
    .optional()
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number must be between 10 and 15 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const { fullName, email, phone } = req.body;
    const customer = req.customer;

    // Check if email is being changed and if it's already taken
    if (email && email !== customer.email) {
      const existingCustomer = await Customer.findOne({
        where: { email, id: { [Op.ne]: customer.id } }
      });
      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          error: 'Email is already registered'
        });
      }
    }

    // Check if phone is being changed and if it's already taken
    if (phone && phone !== customer.phone) {
      const existingCustomer = await Customer.findOne({
        where: { phone, id: { [Op.ne]: customer.id } }
      });
      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is already registered'
        });
      }
    }

    // Update customer
    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    await customer.update(updateData);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: customer.toJSON()
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// Change Password
router.put('/auth/change-password', authenticateCustomerToken, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const { currentPassword, newPassword } = req.body;
    const customer = req.customer;

    // Verify current password
    const isValidPassword = await customer.validatePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current password
    const isSamePassword = await customer.validatePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'New password must be different from current password'
      });
    }

    // Update password
    customer.password = newPassword;
    await customer.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// Forgot Password
router.post('/auth/forgot-password', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { email } = req.body;

    // Find customer
    const customer = await Customer.findOne({ where: { email } });
    
    // Always return success for security (don't reveal if email exists)
    if (!customer) {
      return res.json({ 
        success: true,
        message: 'If that email exists, we\'ve sent a password reset link.' 
      });
    }

    // Generate reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    // Save token to database
    await customer.update({
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetTokenExpires
    });

    // Generate reset link for CUSTOMER (Web App - separate from CMS)
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/user-panel/reset-password.html?token=${resetToken}`;
    
    // Log the reset link for development
    console.log(`Password reset link for ${email}: ${resetLink}`);
    
    // Send email with reset link
    try {
      const { sendPasswordResetEmail } = require('../utils/email');
      const emailSent = await sendPasswordResetEmail(email, resetLink);
      
      if (!emailSent) {
        console.log('⚠️ Email not sent, showing reset link in console for testing');
      }
    } catch (emailError) {
      console.error('❌ Error during email sending:', emailError);
      console.log('📧 Reset link (copy this):', resetLink);
    }

    res.json({
      success: true,
      message: 'If that email exists, we\'ve sent a password reset link.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Reset Password
router.post('/auth/reset-password', [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: errors.array()[0].msg,
        errors: errors.array()
      });
    }

    const { token, password } = req.body;

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
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or expired reset token' 
      });
    }

    // Update password and clear reset token
    await customer.update({
      password: password, // This will be hashed by the hook
      resetPasswordToken: null,
      resetPasswordExpires: null
    });

    res.json({ 
      success: true,
      message: 'Password reset successful. You can now login with your new password.' 
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// ============================================
// STATIONS API ROUTES
// ============================================

/**
 * Helper function to extract meter value from MeterValues log
 */
function extractMeterValue(meterValuesLog) {
  if (!meterValuesLog || !meterValuesLog.messageData) {
    return null;
  }

  const meterValue = meterValuesLog.messageData.meterValue;
  if (!meterValue || !Array.isArray(meterValue) || meterValue.length === 0) {
    return null;
  }

  const sampledValues = meterValue[0].sampledValue;
  if (!sampledValues || !Array.isArray(sampledValues)) {
    return null;
  }

  // Find Energy.Active.Import.Register
  const energySample = sampledValues.find(sample => 
    sample.measurand === 'Energy.Active.Import.Register' || 
    sample.measurand === 'energy' ||
    sample.measurand === 'Energy'
  );

  if (energySample && energySample.value) {
    return parseFloat(energySample.value);
  }

  return null;
}

/**
 * Helper function to check if charger has active transaction
 */
async function hasActiveTransaction(deviceId) {
  try {
    if (!deviceId) {
      return false;
    }

    // Get all recent logs for this device
    const allLogs = await ChargerData.findAll({
      where: {
        deviceId: deviceId
      },
      order: [['timestamp', 'DESC'], ['id', 'DESC']],
      limit: 2000
    });

    if (allLogs.length === 0) {
      return false;
    }

    // Find all StartTransaction messages (incoming from charger)
    const startTransactions = allLogs.filter(log => 
      log.message === 'StartTransaction' && log.direction === 'Incoming'
    );

    if (startTransactions.length === 0) {
      return false;
    }

    // Get the latest StartTransaction
    const latestStart = startTransactions.reduce((latest, current) => {
      const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
      const currentTime = new Date(current.timestamp || current.createdAt).getTime();
      if (currentTime > latestTime) {
        return current;
      } else if (currentTime === latestTime && current.id > latest.id) {
        return current;
      }
      return latest;
    });

    // Get transactionId from latest StartTransaction response
    let transactionId = null;
    const startResponse = allLogs.find(log => 
      log.message === 'Response' && 
      log.messageId === latestStart.messageId && 
      log.direction === 'Outgoing'
    );

    if (startResponse) {
      if (startResponse.messageData && startResponse.messageData.transactionId) {
        transactionId = startResponse.messageData.transactionId;
      } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
        transactionId = startResponse.raw[2].transactionId;
      }
    }

    // Fallback: try to get from StartTransaction itself
    if (!transactionId && latestStart.messageData && latestStart.messageData.transactionId) {
      transactionId = latestStart.messageData.transactionId;
    } else if (!transactionId && latestStart.raw && Array.isArray(latestStart.raw)) {
      const payload = latestStart.raw[2];
      if (payload && payload.transactionId) {
        transactionId = payload.transactionId;
      }
    }

    if (!transactionId) {
      return false;
    }

    // Check if there's a StopTransaction for this transactionId
    const stopTransaction = allLogs.find(log => 
      log.message === 'StopTransaction' && 
      log.direction === 'Incoming' &&
      (
        (log.messageData && log.messageData.transactionId && log.messageData.transactionId.toString() === transactionId.toString()) ||
        (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId && log.raw[2].transactionId.toString() === transactionId.toString())
      )
    );

    // If no StopTransaction found, transaction is still active
    return !stopTransaction;
  } catch (error) {
    console.error('Error checking active transaction:', error);
    return false;
  }
}

/**
 * Helper function to check if charger has fault
 */
async function hasFault(deviceId) {
  try {
    // First check Charger table status
    const charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: ['status']
    });

    if (charger && charger.status) {
      const statusLower = charger.status.toLowerCase();
      if (statusLower === 'faulted' || statusLower === 'fault') {
        return true;
      }
    }

    // Also check for recent StatusNotification with errorCode
    const recentStatus = await ChargerData.findOne({
      where: {
        deviceId: deviceId,
        message: 'StatusNotification',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 1
    });

    if (recentStatus && recentStatus.messageData) {
      const errorCode = recentStatus.messageData.errorCode;
      // If errorCode exists and is not 'NoError', consider it a fault
      if (errorCode && errorCode !== 'NoError' && errorCode !== null && errorCode !== '') {
        return true;
      }
      
      // Also check connectorStatus for fault
      const connectorStatus = recentStatus.messageData.connectorStatus;
      if (connectorStatus) {
        const statusLower = connectorStatus.toLowerCase();
        if (statusLower === 'faulted' || statusLower === 'unavailable') {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking fault:', error);
    return false;
  }
}

/**
 * Helper function to calculate session statistics for a charging point
 */
async function calculateSessionStats(deviceId, chargingPoint) {
  try {
    // Get all StartTransaction messages for this device
    const startTransactions = await ChargerData.findAll({
      where: {
        deviceId: deviceId,
        message: 'StartTransaction',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Get all StopTransaction messages for this device
    const stopTransactions = await ChargerData.findAll({
      where: {
        deviceId: deviceId,
        message: 'StopTransaction',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Create a map of transactionId -> StopTransaction
    const stopTransactionMap = new Map();
    stopTransactions.forEach(stop => {
      let transactionId = null;
      if (stop.messageData && stop.messageData.transactionId) {
        transactionId = stop.messageData.transactionId;
      } else if (stop.raw && Array.isArray(stop.raw) && stop.raw[2] && stop.raw[2].transactionId) {
        transactionId = stop.raw[2].transactionId;
      }
      if (transactionId) {
        stopTransactionMap.set(transactionId.toString(), stop);
      }
    });

    let totalSessions = 0;
    let totalEnergy = 0;
    let totalBilledAmount = 0;
    const processedTransactionIds = new Set();

    // Get tariff details
    const tariff = chargingPoint.tariff;
    const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
    const tax = tariff ? parseFloat(tariff.tax) : 0;

    for (const start of startTransactions) {
      // Get transactionId from StartTransaction response
      let transactionId = null;
      const startResponse = await ChargerData.findOne({
        where: {
          message: 'Response',
          messageId: start.messageId,
          direction: 'Outgoing'
        }
      });

      if (startResponse) {
        if (startResponse.messageData && startResponse.messageData.transactionId) {
          transactionId = startResponse.messageData.transactionId;
        } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
          transactionId = startResponse.raw[2].transactionId;
        }
      }

      // Fallback: try to get from StartTransaction itself
      if (!transactionId && start.messageData && start.messageData.transactionId) {
        transactionId = start.messageData.transactionId;
      } else if (!transactionId && start.raw && Array.isArray(start.raw)) {
        const payload = start.raw[2];
        if (payload && payload.transactionId) {
          transactionId = payload.transactionId;
        }
      }

      if (!transactionId || processedTransactionIds.has(transactionId.toString())) {
        continue;
      }

      // Check if there's a StopTransaction for this transactionId
      const stop = stopTransactionMap.get(transactionId.toString());
      if (!stop) {
        continue; // No stop transaction, skip (it's active or incomplete)
      }

      processedTransactionIds.add(transactionId.toString());

      const startTime = new Date(start.timestamp || start.createdAt);
      const endTime = new Date(stop.timestamp || stop.createdAt);

      // Get meter_start from first MeterValues after StartTransaction
      let meterStart = null;
      const startMeterValues = await ChargerData.findOne({
        where: {
          deviceId: deviceId,
          message: 'MeterValues',
          direction: 'Incoming',
          timestamp: {
            [Op.gte]: startTime,
            [Op.lte]: endTime
          }
        },
        order: [['timestamp', 'ASC']],
        limit: 1
      });

      if (startMeterValues) {
        meterStart = extractMeterValue(startMeterValues);
      }

      // Get meter_end from last MeterValues before StopTransaction
      let meterEnd = null;
      const endMeterValues = await ChargerData.findOne({
        where: {
          deviceId: deviceId,
          message: 'MeterValues',
          direction: 'Incoming',
          timestamp: {
            [Op.gte]: startTime,
            [Op.lte]: endTime
          }
        },
        order: [['timestamp', 'DESC']],
        limit: 1
      });

      if (endMeterValues) {
        meterEnd = extractMeterValue(endMeterValues);
      }

      // Calculate energy: (meter_end - meter_start) / 1000
      let energy = 0;
      if (meterStart !== null && meterEnd !== null && meterEnd >= meterStart) {
        energy = (meterEnd - meterStart) / 1000;
        if (energy < 0) energy = 0; // Prevent negative values
      }

      // Calculate billed amount: (Energy × Base Charge) × (1 + Tax/100)
      const baseAmount = energy * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      const billedAmount = baseAmount * taxMultiplier;

      totalSessions++;
      totalEnergy += energy;
      totalBilledAmount += billedAmount;
    }

    return {
      sessions: totalSessions,
      energy: parseFloat(totalEnergy.toFixed(2)),
      billedAmount: parseFloat(totalBilledAmount.toFixed(2))
    };
  } catch (error) {
    console.error(`Error calculating session stats for deviceId ${deviceId}:`, error);
    return {
      sessions: 0,
      energy: 0,
      billedAmount: 0
    };
  }
}

/**
 * GET /api/user/stations
 * Get all stations with real-time status and statistics
 * Query params: location (city/state search), sortBy (lastActive, createdAt)
 */
router.get('/stations', async (req, res) => {
  try {
    const { location, sortBy } = req.query;
    
    // Build where clause
    const where = {
      deleted: false
    };
    
    // Add location filter if provided
    if (location && location.trim()) {
      const locationSearch = location.trim();
      where[Op.or] = [
        { city: { [Op.iLike]: `%${locationSearch}%` } },
        { state: { [Op.iLike]: `%${locationSearch}%` } },
        { fullAddress: { [Op.iLike]: `%${locationSearch}%` } }
      ];
    }
    
    // Get all non-deleted stations
    const stations = await Station.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    // Calculate real-time status and stats for each station
    const stationsWithStats = await Promise.all(stations.map(async (station) => {
      // Get all charging points for this station with tariff information
      const chargingPoints = await ChargingPoint.findAll({
        where: {
          stationId: station.id,
          deleted: false
        },
        include: [
          {
            model: Tariff,
            as: 'tariff',
            attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
          },
          {
            model: Connector,
            as: 'connectors',
            attributes: ['id', 'connectorId', 'connectorType', 'power']
          }
        ]
      });

      const totalCPs = chargingPoints.length;
      let onlineCPs = 0;
      let offlineCPs = 0;
      let totalSessions = 0;
      let totalEnergy = 0;
      let totalBilledAmount = 0;
      let minPricePerKwh = null;
      let lastActive = null; // Track the most recent lastSeen from all charging points

      if (totalCPs > 0) {
        // Check each charging point's online status and calculate session stats
        for (const cp of chargingPoints) {
          if (cp.deviceId) {
            const charger = await Charger.findOne({
              where: { deviceId: cp.deviceId },
              attributes: ['lastSeen']
            });

            if (charger && charger.lastSeen) {
              const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
              const lastActiveTime = new Date(charger.lastSeen);
              const now = new Date();
              const timeDiff = now - lastActiveTime;
              const isOnline = timeDiff <= OFFLINE_THRESHOLD;
              
              // Track the most recent lastSeen
              if (!lastActive || lastActiveTime > lastActive) {
                lastActive = lastActiveTime;
              }
              
              if (isOnline) {
                onlineCPs++;
              } else {
                offlineCPs++;
              }
            } else {
              offlineCPs++;
            }

            // Calculate session statistics for this charging point
            const sessionStats = await calculateSessionStats(cp.deviceId, cp);
            totalSessions += sessionStats.sessions;
            totalEnergy += sessionStats.energy;
            totalBilledAmount += sessionStats.billedAmount;

            // Calculate minimum price per kWh
            if (cp.tariff) {
              const baseCharges = parseFloat(cp.tariff.baseCharges) || 0;
              const tax = parseFloat(cp.tariff.tax) || 0;
              const pricePerKwh = baseCharges * (1 + tax / 100);
              if (minPricePerKwh === null || pricePerKwh < minPricePerKwh) {
                minPricePerKwh = pricePerKwh;
              }
            }
          } else {
            offlineCPs++;
          }
        }
      }

      // Calculate percentages
      const onlineCPsPercent = totalCPs > 0 ? Math.round((onlineCPs / totalCPs) * 100) : 0;
      const offlineCPsPercent = totalCPs > 0 ? Math.round((offlineCPs / totalCPs) * 100) : 0;

      // Determine station status: Online if at least 1 CP is online, otherwise Offline
      const stationStatus = onlineCPs >= 1 ? 'Online' : 'Offline';

      // Format organization
      const orgMap = {
        'massive_mobility': 'Massive Mobility',
        '1c_ev_charging': '1C EV Charging'
      };
      const organization = orgMap[station.organization] || station.organization;

      return {
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: organization,
        status: stationStatus,
        city: station.city,
        state: station.state,
        country: station.country,
        fullAddress: station.fullAddress,
        pinCode: station.pinCode,
        latitude: station.latitude ? parseFloat(station.latitude) : null,
        longitude: station.longitude ? parseFloat(station.longitude) : null,
        openingTime: station.openingTime,
        closingTime: station.closingTime,
        open24Hours: station.open24Hours,
        workingDays: station.workingDays || [],
        allDays: station.allDays,
        amenities: station.amenities || [],
        contactNumber: station.contactNumber,
        totalCPs: totalCPs,
        onlineCPs: onlineCPs,
        onlineCPsPercent: onlineCPsPercent,
        offlineCPs: offlineCPs,
        offlineCPsPercent: offlineCPsPercent,
        sessions: totalSessions,
        energy: parseFloat(totalEnergy.toFixed(2)),
        billedAmount: parseFloat(totalBilledAmount.toFixed(2)),
        pricePerKwh: minPricePerKwh ? parseFloat(minPricePerKwh.toFixed(2)) : null,
        lastActive: lastActive ? lastActive.toISOString() : null,
        createdAt: station.createdAt
      };
    }));

    // Sort by lastActive if sortBy is 'lastActive', otherwise keep original order
    if (sortBy === 'lastActive') {
      stationsWithStats.sort((a, b) => {
        // Stations with lastActive come first, sorted by most recent
        if (a.lastActive && b.lastActive) {
          return new Date(b.lastActive) - new Date(a.lastActive);
        }
        if (a.lastActive && !b.lastActive) return -1;
        if (!a.lastActive && b.lastActive) return 1;
        // If neither has lastActive, keep original order
        return 0;
      });
    }

    res.json({
      success: true,
      stations: stationsWithStats
    });
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stations'
    });
  }
});

/**
 * GET /api/user/stations/:stationId
 * Get single station by stationId
 */
router.get('/stations/:stationId', async (req, res) => {
  try {
    const { stationId } = req.params;

    const station = await Station.findOne({
      where: {
        stationId,
        deleted: false
      }
    });

    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    // Get all charging points for this station
    const chargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: station.id,
        deleted: false
      },
      attributes: ['id', 'deviceId']
    });

    let onlineCPs = 0;
    const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

    if (chargingPoints.length > 0) {
      // Check each charging point's online status
      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          const charger = await Charger.findOne({
            where: { deviceId: cp.deviceId },
            attributes: ['lastSeen']
          });

          if (charger && charger.lastSeen) {
            const lastActiveTime = new Date(charger.lastSeen);
            const now = new Date();
            const timeDiff = now - lastActiveTime;
            const isOnline = timeDiff <= OFFLINE_THRESHOLD;
            
            if (isOnline) {
              onlineCPs++;
            }
          }
        }
      }
    }

    // Determine station status: Online if at least 1 CP is online, otherwise Offline
    const stationStatus = onlineCPs >= 1 ? 'Online' : 'Offline';

    // Format organization
    const orgMap = {
      'massive_mobility': 'Massive Mobility',
      '1c_ev_charging': '1C EV Charging'
    };
    const organization = orgMap[station.organization] || station.organization;

    res.json({
      success: true,
      station: {
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: organization,
        status: stationStatus,
        // Specifications
        powerCapacity: station.powerCapacity ? parseFloat(station.powerCapacity) : null,
        gridPhase: station.gridPhase,
        // Location
        pinCode: station.pinCode,
        city: station.city,
        state: station.state,
        country: station.country,
        latitude: station.latitude ? parseFloat(station.latitude) : null,
        longitude: station.longitude ? parseFloat(station.longitude) : null,
        fullAddress: station.fullAddress,
        // General / Other Details
        openingTime: station.openingTime,
        closingTime: station.closingTime,
        open24Hours: station.open24Hours,
        workingDays: station.workingDays || [],
        allDays: station.allDays,
        contactNumber: station.contactNumber,
        inchargeName: station.inchargeName,
        ownerName: station.ownerName,
        ownerContact: station.ownerContact,
        sessionStartStopSMS: station.sessionStartStopSMS,
        // Amenities
        amenities: station.amenities || [],
        // Metadata
        createdBy: station.createdBy,
        createdAt: station.createdAt,
        updatedAt: station.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch station'
    });
  }
});

/**
 * GET /api/user/stations/:stationId/points
 * Get charging points for a station
 */
router.get('/stations/:stationId/points', async (req, res) => {
  try {
    const { stationId } = req.params;

    // Find station by stationId
    const station = await Station.findOne({
      where: {
        stationId,
        deleted: false
      }
    });

    if (!station) {
      return res.status(404).json({
        success: false,
        error: 'Station not found'
      });
    }

    // Get all charging points for this station
    const chargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: station.id,
        deleted: false
      },
      include: [
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
        },
        {
          model: Connector,
          as: 'connectors',
          attributes: ['id', 'connectorId', 'connectorType', 'power']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Format charging points with real-time status
    const formattedPoints = await Promise.all(chargingPoints.map(async (point) => {
      const connectors = point.connectors || [];
      const maxPower = Math.max(...connectors.map(c => parseFloat(c.power || 0)), parseFloat(point.powerCapacity || 0));
      
      // Fetch charger data to get lastSeen
      let chargerData = null;
      if (point.deviceId) {
        chargerData = await Charger.findOne({
          where: { deviceId: point.deviceId },
          attributes: ['lastSeen']
        });
      }

      // Calculate real-time status based on lastSeen
      const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
      let realTimeStatus = point.status || 'Offline';
      if (chargerData && chargerData.lastSeen) {
        const lastActiveTime = new Date(chargerData.lastSeen);
        const now = new Date();
        const timeDiff = now - lastActiveTime;
        const isOnline = timeDiff <= OFFLINE_THRESHOLD;
        realTimeStatus = isOnline ? 'Online' : 'Offline';
      }

      // Calculate C.STATUS (Connector Status)
      let cStatus = 'Unavailable'; // Default
      if (realTimeStatus === 'Offline') {
        cStatus = 'Unavailable';
      } else {
        // Check for faults first
        const hasFaultStatus = await hasFault(point.deviceId);
        if (hasFaultStatus) {
          cStatus = 'Faulted';
        } else {
          // Check for active charging
          const isCharging = await hasActiveTransaction(point.deviceId);
          if (isCharging) {
            cStatus = 'Charging';
          } else {
            cStatus = 'Available';
          }
        }
      }
      
      // Calculate session statistics
      const sessionStats = await calculateSessionStats(point.deviceId, point);

      // Calculate price per kWh
      let pricePerKwh = null;
      if (point.tariff) {
        const baseCharges = parseFloat(point.tariff.baseCharges) || 0;
        const tax = parseFloat(point.tariff.tax) || 0;
        pricePerKwh = baseCharges * (1 + tax / 100);
      }

      return {
        id: point.id,
        chargingPointId: point.chargingPointId,
        deviceId: point.deviceId,
        deviceName: point.deviceName,
        status: realTimeStatus,
        cStatus: cStatus,
        chargerType: point.chargerType,
        powerCapacity: parseFloat(point.powerCapacity),
        maxPower: maxPower,
        connectors: connectors.map(c => ({
          connectorId: c.connectorId,
          connectorType: c.connectorType,
          power: parseFloat(c.power)
        })),
        connectorCount: connectors.length,
        pricePerKwh: pricePerKwh ? parseFloat(pricePerKwh.toFixed(2)) : null,
        tariff: point.tariff ? {
          tariffId: point.tariff.tariffId,
          tariffName: point.tariff.tariffName,
          baseCharges: parseFloat(point.tariff.baseCharges),
          tax: parseFloat(point.tariff.tax),
          currency: point.tariff.currency
        } : null,
        sessions: sessionStats.sessions,
        energy: sessionStats.energy,
        billedAmount: sessionStats.billedAmount,
        createdAt: point.createdAt
      };
    }));

    res.json({
      success: true,
      points: formattedPoints
    });
  } catch (error) {
    console.error('Error fetching station charging points:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch charging points'
    });
  }
});

/**
 * GET /api/user/charging-points/:chargingPointId
 * Get single charging point details by chargingPointId
 */
router.get('/charging-points/:chargingPointId', async (req, res) => {
  try {
    const { chargingPointId } = req.params;

    // Find charging point by chargingPointId
    const chargingPoint = await ChargingPoint.findOne({
      where: {
        chargingPointId,
        deleted: false
      },
      include: [
        {
          model: Station,
          as: 'station',
          attributes: ['id', 'stationId', 'stationName']
        },
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
        },
        {
          model: Connector,
          as: 'connectors',
          attributes: ['id', 'connectorId', 'connectorType', 'power'],
          order: [['connectorId', 'ASC']]
        }
      ]
    });

    if (!chargingPoint) {
      return res.status(404).json({
        success: false,
        error: 'Charging point not found'
      });
    }

    const connectors = chargingPoint.connectors || [];
    const maxPower = Math.max(...connectors.map(c => parseFloat(c.power || 0)), parseFloat(chargingPoint.powerCapacity || 0));
    
    // Fetch charger data to get lastSeen
    let chargerData = null;
    if (chargingPoint.deviceId) {
      chargerData = await Charger.findOne({
        where: { deviceId: chargingPoint.deviceId },
        attributes: ['lastSeen']
      });
    }

    // Calculate real-time status based on lastSeen
    const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    let realTimeStatus = chargingPoint.status || 'Offline';
    if (chargerData && chargerData.lastSeen) {
      const lastActiveTime = new Date(chargerData.lastSeen);
      const now = new Date();
      const timeDiff = now - lastActiveTime;
      const isOnline = timeDiff <= OFFLINE_THRESHOLD;
      realTimeStatus = isOnline ? 'Online' : 'Offline';
    }

    // Calculate C.STATUS (Connector Status)
    let cStatus = 'Unavailable'; // Default
    if (realTimeStatus === 'Offline') {
      cStatus = 'Unavailable';
    } else {
      // Check for faults first
      const hasFaultStatus = await hasFault(chargingPoint.deviceId);
      if (hasFaultStatus) {
        cStatus = 'Faulted';
      } else {
        // Check for active charging
        const isCharging = await hasActiveTransaction(chargingPoint.deviceId);
        if (isCharging) {
          cStatus = 'Charging';
        } else {
          cStatus = 'Available';
        }
      }
    }
    
    // Calculate price per kWh
    let pricePerKwh = null;
    if (chargingPoint.tariff) {
      const baseCharges = parseFloat(chargingPoint.tariff.baseCharges) || 0;
      const tax = parseFloat(chargingPoint.tariff.tax) || 0;
      pricePerKwh = baseCharges * (1 + tax / 100);
    }

    // Format phase for display
    const phaseMap = {
      'phase_r': 'Phase R',
      'phase_y': 'Phase Y',
      'phase_b': 'Phase B'
    };
    const displayPhase = phaseMap[chargingPoint.phase] || chargingPoint.phase || 'N/A';

    // Format OEM for display
    const oemMap = {
      'massive_mobility': 'Massive Mobility',
      'evre': 'EVRE',
      'okaya': 'Okaya'
    };
    const displayOEM = oemMap[chargingPoint.oemList] || chargingPoint.oemList || 'N/A';

    res.json({
      success: true,
      chargingPoint: {
        id: chargingPoint.id,
        chargingPointId: chargingPoint.chargingPointId,
        deviceId: chargingPoint.deviceId,
        deviceName: chargingPoint.deviceName,
        status: realTimeStatus,
        cStatus: cStatus,
        chargerType: chargingPoint.chargerType,
        powerCapacity: parseFloat(chargingPoint.powerCapacity),
        maxPower: maxPower,
        phase: displayPhase,
        oemList: displayOEM,
        firmwareVersion: chargingPoint.firmwareVersion || 'N/A',
        connectorCount: connectors.length,
        connectors: connectors.map(c => ({
          connectorId: c.connectorId,
          connectorType: c.connectorType,
          power: parseFloat(c.power),
          // For connector status, we'll use the charging point's overall status
          // Individual connector status can be enhanced later if needed
          status: realTimeStatus === 'Online' ? (cStatus === 'Available' ? 'Available' : cStatus) : 'Unavailable',
          cStatus: realTimeStatus === 'Online' ? (cStatus === 'Available' ? 'Available' : cStatus) : 'Unavailable'
        })),
        pricePerKwh: pricePerKwh ? parseFloat(pricePerKwh.toFixed(2)) : null,
        tariff: chargingPoint.tariff ? {
          tariffId: chargingPoint.tariff.tariffId,
          tariffName: chargingPoint.tariff.tariffName,
          baseCharges: parseFloat(chargingPoint.tariff.baseCharges),
          tax: parseFloat(chargingPoint.tariff.tax),
          currency: chargingPoint.tariff.currency
        } : null,
        station: chargingPoint.station ? {
          id: chargingPoint.station.id,
          stationId: chargingPoint.station.stationId,
          stationName: chargingPoint.station.stationName
        } : null,
        createdAt: chargingPoint.createdAt
      }
    });
  } catch (error) {
    console.error('Error fetching charging point:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch charging point'
    });
  }
});

// ============================================
// VEHICLES API ROUTES
// ============================================

/**
 * GET /api/user/vehicles
 * Get all vehicles for the authenticated customer
 */
router.get('/vehicles', authenticateCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;

    const vehicles = await Vehicle.findAll({
      where: {
        customerId: customer.id
      },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      vehicles: vehicles.map(vehicle => ({
        id: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        vehicleType: vehicle.vehicleType,
        brand: vehicle.brand,
        modelName: vehicle.modelName,
        connectorType: vehicle.connectorType,
        batteryCapacity: parseFloat(vehicle.batteryCapacity),
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicles'
    });
  }
});

/**
 * GET /api/user/vehicles/:vehicleId
 * Get single vehicle by ID (only if it belongs to the customer)
 */
router.get('/vehicles/:vehicleId', authenticateCustomerToken, async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const customer = req.customer;

    const vehicle = await Vehicle.findOne({
      where: {
        id: vehicleId,
        customerId: customer.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      vehicle: {
        id: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        vehicleType: vehicle.vehicleType,
        brand: vehicle.brand,
        modelName: vehicle.modelName,
        connectorType: vehicle.connectorType,
        batteryCapacity: parseFloat(vehicle.batteryCapacity),
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching vehicle:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch vehicle'
    });
  }
});

/**
 * POST /api/user/vehicles
 * Create a new vehicle for the authenticated customer
 */
router.post('/vehicles', authenticateCustomerToken, [
  body('vehicleNumber')
    .notEmpty()
    .withMessage('Vehicle number is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Vehicle number must be between 1 and 50 characters'),
  body('vehicleType')
    .notEmpty()
    .withMessage('Vehicle type is required')
    .isIn(['2W', '3W', '4W', 'Commercial'])
    .withMessage('Vehicle type must be one of: 2W, 3W, 4W, Commercial'),
  body('brand')
    .notEmpty()
    .withMessage('Brand is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Brand must be between 1 and 100 characters'),
  body('modelName')
    .notEmpty()
    .withMessage('Model name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Model name must be between 1 and 100 characters'),
  body('connectorType')
    .notEmpty()
    .withMessage('Connector type is required')
    .isIn(['Type 2', 'CCS', 'CHAdeMO', 'GB/T', 'Bharat AC', 'Bharat DC'])
    .withMessage('Connector type must be one of: Type 2, CCS, CHAdeMO, GB/T, Bharat AC, Bharat DC'),
  body('batteryCapacity')
    .notEmpty()
    .withMessage('Battery capacity is required')
    .isFloat({ min: 0.1 })
    .withMessage('Battery capacity must be at least 0.1 kWh')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const { vehicleNumber, vehicleType, brand, modelName, connectorType, batteryCapacity } = req.body;

    // Check if vehicle number already exists for this customer
    const existingVehicle = await Vehicle.findOne({
      where: {
        customerId: customer.id,
        vehicleNumber: vehicleNumber.trim()
      }
    });

    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        error: 'Vehicle with this number already exists'
      });
    }

    // Create vehicle
    const vehicle = await Vehicle.create({
      customerId: customer.id,
      vehicleNumber: vehicleNumber.trim(),
      vehicleType,
      brand: brand.trim(),
      modelName: modelName.trim(),
      connectorType,
      batteryCapacity: parseFloat(batteryCapacity)
    });

    res.status(201).json({
      success: true,
      message: 'Vehicle added successfully',
      vehicle: {
        id: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        vehicleType: vehicle.vehicleType,
        brand: vehicle.brand,
        modelName: vehicle.modelName,
        connectorType: vehicle.connectorType,
        batteryCapacity: parseFloat(vehicle.batteryCapacity),
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creating vehicle:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create vehicle'
    });
  }
});

/**
 * PUT /api/user/vehicles/:vehicleId
 * Update a vehicle (only if it belongs to the customer)
 */
router.put('/vehicles/:vehicleId', authenticateCustomerToken, [
  body('vehicleNumber')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Vehicle number must be between 1 and 50 characters'),
  body('vehicleType')
    .optional()
    .isIn(['2W', '3W', '4W', 'Commercial'])
    .withMessage('Vehicle type must be one of: 2W, 3W, 4W, Commercial'),
  body('brand')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Brand must be between 1 and 100 characters'),
  body('modelName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Model name must be between 1 and 100 characters'),
  body('connectorType')
    .optional()
    .isIn(['Type 2', 'CCS', 'CHAdeMO', 'GB/T', 'Bharat AC', 'Bharat DC'])
    .withMessage('Connector type must be one of: Type 2, CCS, CHAdeMO, GB/T, Bharat AC, Bharat DC'),
  body('batteryCapacity')
    .optional()
    .isFloat({ min: 0.1 })
    .withMessage('Battery capacity must be at least 0.1 kWh')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const { vehicleId } = req.params;
    const customer = req.customer;

    // Find vehicle and check ownership
    const vehicle = await Vehicle.findOne({
      where: {
        id: vehicleId,
        customerId: customer.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    // Check if vehicle number is being changed and if it's already taken
    if (req.body.vehicleNumber && req.body.vehicleNumber.trim() !== vehicle.vehicleNumber) {
      const existingVehicle = await Vehicle.findOne({
        where: {
          customerId: customer.id,
          vehicleNumber: req.body.vehicleNumber.trim(),
          id: { [Op.ne]: vehicleId }
        }
      });

      if (existingVehicle) {
        return res.status(400).json({
          success: false,
          error: 'Vehicle with this number already exists'
        });
      }
    }

    // Update vehicle
    const updateData = {};
    if (req.body.vehicleNumber) updateData.vehicleNumber = req.body.vehicleNumber.trim();
    if (req.body.vehicleType) updateData.vehicleType = req.body.vehicleType;
    if (req.body.brand) updateData.brand = req.body.brand.trim();
    if (req.body.modelName) updateData.modelName = req.body.modelName.trim();
    if (req.body.connectorType) updateData.connectorType = req.body.connectorType;
    if (req.body.batteryCapacity) updateData.batteryCapacity = parseFloat(req.body.batteryCapacity);

    await vehicle.update(updateData);

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      vehicle: {
        id: vehicle.id,
        vehicleNumber: vehicle.vehicleNumber,
        vehicleType: vehicle.vehicleType,
        brand: vehicle.brand,
        modelName: vehicle.modelName,
        connectorType: vehicle.connectorType,
        batteryCapacity: parseFloat(vehicle.batteryCapacity),
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating vehicle:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update vehicle'
    });
  }
});

/**
 * DELETE /api/user/vehicles/:vehicleId
 * Delete a vehicle (only if it belongs to the customer)
 */
router.delete('/vehicles/:vehicleId', authenticateCustomerToken, async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const customer = req.customer;

    // Find vehicle and check ownership
    const vehicle = await Vehicle.findOne({
      where: {
        id: vehicleId,
        customerId: customer.id
      }
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    // Delete vehicle
    await vehicle.destroy();

    res.json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting vehicle:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete vehicle'
    });
  }
});

// ============================================
// WALLET API ROUTES
// ============================================

/**
 * Helper function to get or create wallet for customer
 */
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

/**
 * GET /api/user/wallet/balance
 * Get current wallet balance
 */
router.get('/wallet/balance', authenticateCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;
    const wallet = await getOrCreateWallet(customer.id);

    res.json({
      success: true,
      balance: parseFloat(wallet.balance),
      currency: wallet.currency
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet balance'
    });
  }
});

/**
 * GET /api/user/wallet/transactions
 * Get wallet transaction history
 */
router.get('/wallet/transactions', authenticateCustomerToken, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('fromDate').optional().isISO8601().withMessage('From date must be a valid date'),
  query('toDate').optional().isISO8601().withMessage('To date must be a valid date'),
  query('type').optional().isIn(['credit', 'debit', 'refund']).withMessage('Type must be credit, debit, or refund')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {
      customerId: customer.id
    };

    if (req.query.type) {
      whereClause.transactionType = req.query.type;
    }

    if (req.query.fromDate || req.query.toDate) {
      whereClause.createdAt = {};
      if (req.query.fromDate) {
        whereClause.createdAt[Op.gte] = new Date(req.query.fromDate);
      }
      if (req.query.toDate) {
        // Add one day to include the entire toDate
        const toDate = new Date(req.query.toDate);
        toDate.setHours(23, 59, 59, 999);
        whereClause.createdAt[Op.lte] = toDate;
      }
    }

    const { count, rows: transactions } = await WalletTransaction.findAndCountAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      success: true,
      transactions: transactions.map(t => ({
        id: t.id,
        transactionType: t.transactionType,
        amount: parseFloat(t.amount),
        balanceBefore: parseFloat(t.balanceBefore),
        balanceAfter: parseFloat(t.balanceAfter),
        description: t.description,
        referenceId: t.referenceId,
        status: t.status,
        transactionCategory: t.transactionCategory,
        createdAt: t.createdAt
      })),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet transactions'
    });
  }
});

/**
 * POST /api/user/wallet/topup
 * Create Razorpay order for wallet top-up
 */
router.post('/wallet/topup', authenticateCustomerToken, [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least ₹1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const amount = parseFloat(req.body.amount);

    if (amount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Minimum top-up amount is ₹1'
      });
    }

    // Get or create wallet
    const wallet = await getOrCreateWallet(customer.id);

    // Create Razorpay order
    const orderResult = await createOrder(amount, customer.id);

    if (!orderResult.success) {
      return res.status(500).json({
        success: false,
        error: orderResult.error || 'Failed to create payment order'
      });
    }

    // Check for existing pending transactions for this order amount
    // Mark previous pending transactions as failed ONLY if they're OLD (more than 1 minute)
    // This prevents marking a transaction as failed while it's still being verified
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    // Look for pending transactions older than 1 minute (safe to mark as failed - user likely retried)
    const oldPendingTransactions = await WalletTransaction.findAll({
      where: {
        customerId: customer.id,
        transactionType: 'credit',
        status: 'pending',
        transactionCategory: 'topup',
        amount: amount,
        createdAt: {
          [Op.lt]: oneMinuteAgo, // Only transactions older than 1 minute
          [Op.gte]: twoMinutesAgo // But not too old (within last 2 minutes)
        }
      },
      order: [['createdAt', 'DESC']]
    });

    // Mark old pending transactions as failed (user retried after they expired)
    if (oldPendingTransactions.length > 0) {
      for (const prevTxn of oldPendingTransactions) {
        if (prevTxn.status === 'pending') {
          await prevTxn.update({
            status: 'failed',
            description: `${prevTxn.description} - Payment attempt failed (retried)`
          });
          console.log(`[Top-up Order] Marked old pending transaction ${prevTxn.id} (order: ${prevTxn.referenceId}) as failed (user retrying with new order: ${orderResult.order.id})`);
        }
      }
    }

    // Create pending transaction with the new order ID
    // IMPORTANT: Create transaction AFTER marking previous ones as failed to avoid race conditions
    const transaction = await WalletTransaction.create({
      walletId: wallet.id,
      customerId: customer.id,
      transactionType: 'credit',
      amount: amount,
      balanceBefore: parseFloat(wallet.balance),
      balanceAfter: parseFloat(wallet.balance), // Will be updated after payment verification
      description: `Wallet Top-up - ₹${amount}`,
      referenceId: orderResult.order.id,
      status: 'pending',
      transactionCategory: 'topup'
    });

    console.log(`[Top-up Order] Created new pending transaction ${transaction.id} with order ID ${orderResult.order.id} for amount ₹${amount}`);
    
    // Double-check that our new transaction is still pending (shouldn't be marked as failed)
    await transaction.reload();
    if (transaction.status !== 'pending') {
      console.error(`[Top-up Order] ERROR: New transaction ${transaction.id} was marked as ${transaction.status} immediately after creation!`);
      // Revert to pending if it was incorrectly marked
      await transaction.update({ status: 'pending' });
    }

    res.json({
      success: true,
      order: orderResult.order,
      transactionId: transaction.id,
      key: process.env.RAZORPAY_KEY_ID // Return key for frontend
    });
  } catch (error) {
    console.error('Error creating top-up order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create top-up order'
    });
  }
});

/**
 * POST /api/user/wallet/topup/verify
 * Verify Razorpay payment and update wallet
 */
router.post('/wallet/topup/verify', authenticateCustomerToken, [
  body('razorpay_order_id')
    .notEmpty()
    .withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id')
    .notEmpty()
    .withMessage('Razorpay payment ID is required'),
  body('razorpay_signature')
    .notEmpty()
    .withMessage('Razorpay signature is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    console.log(`[Payment Verify] Starting verification for customer ${customer.id}, order: ${razorpay_order_id}, payment: ${razorpay_payment_id}`);

    // Verify payment signature
    const isValidSignature = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValidSignature) {
      console.error(`[Payment Verify] Invalid signature for order ${razorpay_order_id}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    // Get payment details from Razorpay
    const paymentResult = await getPaymentDetails(razorpay_payment_id);

    if (!paymentResult.success || paymentResult.payment.status !== 'captured') {
      console.error(`[Payment Verify] Payment not captured for ${razorpay_payment_id}`);
      return res.status(400).json({
        success: false,
        error: 'Payment not successful'
      });
    }

    console.log(`[Payment Verify] Payment verified successfully, looking for transaction with order ID: ${razorpay_order_id}`);

    // STRATEGY: Find the most recent pending transaction, prioritizing exact order ID match
    // But if not found, use any recent pending transaction (handles retry scenarios)
    
    // First, try to find by exact order ID
    let transaction = await WalletTransaction.findOne({
      where: {
        customerId: customer.id,
        referenceId: razorpay_order_id,
        status: 'pending',
        transactionCategory: 'topup'
      },
      order: [['createdAt', 'DESC']]
    });

    if (transaction) {
      console.log(`[Payment Verify] Found pending transaction ${transaction.id} with exact order ID match: ${razorpay_order_id}`);
    } else {
      console.log(`[Payment Verify] No pending transaction found with order ID ${razorpay_order_id}, searching for most recent pending...`);
      
      // If not found by order ID, find the MOST RECENT pending transaction (within last 10 minutes)
      // This handles cases where user retried and order ID might not match exactly
      const recentPendingTransaction = await WalletTransaction.findOne({
        where: {
          customerId: customer.id,
          status: 'pending',
          transactionCategory: 'topup',
          createdAt: {
            [Op.gte]: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
          }
        },
        order: [['createdAt', 'DESC']]
      });

      if (recentPendingTransaction) {
        // Found a recent pending transaction - check if it's for the same or different order
        if (recentPendingTransaction.referenceId === razorpay_order_id) {
          // Same order - use it
          console.log(`[Payment Verify] Found matching pending transaction ${recentPendingTransaction.id} for order ${razorpay_order_id}`);
          transaction = recentPendingTransaction;
        } else {
          // Different order - this might be a retry with mismatched order IDs
          // Only use it if it's VERY recent (within 30 seconds)
          const transactionAge = Date.now() - new Date(recentPendingTransaction.createdAt).getTime();
          if (transactionAge < 30000) { // 30 seconds
            console.log(`[Payment Verify] Using very recent pending transaction ${recentPendingTransaction.id} (referenceId: ${recentPendingTransaction.referenceId}, age: ${transactionAge}ms) for order ${razorpay_order_id}`);
            console.log(`[Payment Verify] Updating transaction ${recentPendingTransaction.id} referenceId from ${recentPendingTransaction.referenceId} to ${razorpay_order_id}`);
            // Update the referenceId to match the current order ID for consistency
            await recentPendingTransaction.update({
              referenceId: razorpay_order_id
            });
            await recentPendingTransaction.reload();
            transaction = recentPendingTransaction;
            console.log(`[Payment Verify] Transaction ${transaction.id} will be used for verification`);
          } else {
            console.log(`[Payment Verify] Pending transaction ${recentPendingTransaction.id} is too old (${transactionAge}ms) or for different order, not using it`);
          }
        }
      }
      
      // If still no transaction found, check by payment ID first (after completion, referenceId is updated to payment ID)
      if (!transaction) {
        const completedByPaymentId = await WalletTransaction.findOne({
          where: {
            customerId: customer.id,
            referenceId: razorpay_payment_id,
            status: 'completed',
            transactionCategory: 'topup'
          }
        });

        if (completedByPaymentId) {
          // Payment was already processed
          return res.json({
            success: true,
            message: 'Payment already verified',
            transaction: {
              id: completedByPaymentId.id,
              amount: parseFloat(completedByPaymentId.amount),
              balanceAfter: parseFloat(completedByPaymentId.balanceAfter)
            }
          });
        }

        // Check if there's a completed transaction with this order ID (might have been updated)
        const completedByOrderId = await WalletTransaction.findOne({
          where: {
            customerId: customer.id,
            referenceId: razorpay_order_id,
            status: 'completed',
            transactionCategory: 'topup'
          },
          order: [['createdAt', 'DESC']]
        });

        if (completedByOrderId) {
          // Payment was already processed
          return res.json({
            success: true,
            message: 'Payment already verified',
            transaction: {
              id: completedByOrderId.id,
              amount: parseFloat(completedByOrderId.amount),
              balanceAfter: parseFloat(completedByOrderId.balanceAfter)
            }
          });
        }

        // No transaction found at all - log for debugging and try to find ANY recent pending transaction
        const allRecentTransactions = await WalletTransaction.findAll({
          where: {
            customerId: customer.id,
            transactionCategory: 'topup',
            createdAt: {
              [Op.gte]: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
            }
          },
          order: [['createdAt', 'DESC']],
          limit: 10
        });

        console.error(`[Payment Verify] Transaction not found for order ${razorpay_order_id}, payment ${razorpay_payment_id}`);
        console.error(`[Payment Verify] Recent transactions for customer ${customer.id}:`, allRecentTransactions.map(t => ({
          id: t.id,
          referenceId: t.referenceId,
          status: t.status,
          amount: t.amount,
          createdAt: t.createdAt
        })));

        // LAST RESORT: Try to find ANY pending transaction (even if not recent)
        // This handles edge cases where timing is off
        const anyPendingTransaction = await WalletTransaction.findOne({
          where: {
            customerId: customer.id,
            status: 'pending',
            transactionCategory: 'topup',
            createdAt: {
              [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
            }
          },
          order: [['createdAt', 'DESC']]
        });

        if (anyPendingTransaction) {
          console.log(`[Payment Verify] FALLBACK: Using any pending transaction ${anyPendingTransaction.id} (referenceId: ${anyPendingTransaction.referenceId}) for order ${razorpay_order_id}`);
          // Update the referenceId to match
          await anyPendingTransaction.update({
            referenceId: razorpay_order_id
          });
          await anyPendingTransaction.reload();
          transaction = anyPendingTransaction;
        } else {
          console.error(`[Payment Verify] No pending transactions found at all`);
          return res.status(404).json({
            success: false,
            error: 'Transaction not found. Please contact support with your payment ID.'
          });
        }
      }
    }

    // Reload transaction to ensure we have latest status
    await transaction.reload();

    // Double-check transaction is still pending
    if (transaction.status !== 'pending') {
      if (transaction.status === 'completed') {
        // Already completed - return success
        return res.json({
          success: true,
          message: 'Payment already verified',
          transaction: {
            id: transaction.id,
            amount: parseFloat(transaction.amount),
            balanceAfter: parseFloat(transaction.balanceAfter)
          }
        });
      } else if (transaction.status === 'failed') {
        // This shouldn't happen if we found it above, but handle it
        return res.status(400).json({
          success: false,
          error: 'This payment attempt was previously marked as failed. Please try a new payment.'
        });
      }
    }

    // Get wallet
    const wallet = await Wallet.findOne({
      where: { customerId: customer.id }
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found'
      });
    }

    // Update wallet balance
    const amount = paymentResult.payment.amount; // Already in INR
    const newBalance = parseFloat(wallet.balance) + amount;

    await wallet.update({
      balance: newBalance
    });

    // Update transaction
    await transaction.update({
      status: 'completed',
      referenceId: razorpay_payment_id, // Update to payment ID
      balanceAfter: newBalance,
      description: `Wallet Top-up - ₹${amount} (Payment ID: ${razorpay_payment_id})`
    });

    console.log(`[Payment Verify] Successfully completed transaction ${transaction.id}, updated wallet balance to ₹${newBalance}`);

    res.json({
      success: true,
      message: 'Payment verified and wallet updated successfully',
      transaction: {
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        balanceAfter: newBalance
      }
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify payment'
    });
  }
});

/**
 * POST /api/user/wallet/topup/failed
 * Record a failed payment attempt
 */
router.post('/wallet/topup/failed', authenticateCustomerToken, [
  body('razorpay_order_id')
    .notEmpty()
    .withMessage('Razorpay order ID is required'),
  body('error_reason')
    .optional()
    .isString()
    .withMessage('Error reason must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const { razorpay_order_id, error_reason } = req.body;

    console.log(`[Failed Payment] Attempting to mark order ${razorpay_order_id} as failed, reason: ${error_reason}`);

    // Find transaction by order ID (any status)
    const transaction = await WalletTransaction.findOne({
      where: {
        customerId: customer.id,
        referenceId: razorpay_order_id,
        transactionCategory: 'topup'
      },
      order: [['createdAt', 'DESC']]
    });

    if (transaction) {
      console.log(`[Failed Payment] Found transaction ${transaction.id} with status: ${transaction.status}`);
      
      // If already completed, DO NOT mark as failed
      if (transaction.status === 'completed') {
        console.log(`[Failed Payment] Transaction ${transaction.id} is completed, not marking as failed`);
        return res.json({
          success: false,
          message: 'Transaction already completed - payment was successful'
        });
      }
      
      // If already failed, return success (idempotent)
      if (transaction.status === 'failed') {
        console.log(`[Failed Payment] Transaction ${transaction.id} already failed`);
        return res.json({
          success: true,
          message: 'Transaction already marked as failed',
          transaction: {
            id: transaction.id,
            amount: parseFloat(transaction.amount),
            status: 'failed'
          }
        });
      }
      
      // If pending, wait to see if verification is in progress
      if (transaction.status === 'pending') {
        console.log(`[Failed Payment] Transaction ${transaction.id} is pending, waiting 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Reload to get latest status
        await transaction.reload();
        console.log(`[Failed Payment] After wait, transaction ${transaction.id} status: ${transaction.status}`);
        
        if (transaction.status === 'completed') {
          console.log(`[Failed Payment] Transaction ${transaction.id} was completed, not marking as failed`);
          return res.json({
            success: false,
            message: 'Transaction was completed - payment was successful'
          });
        }
        
        if (transaction.status === 'pending') {
          // Still pending - safe to mark as failed
          await transaction.update({
            status: 'failed',
            description: `${transaction.description} - Payment failed${error_reason ? `: ${error_reason}` : ''}`
          });
          
          console.log(`[Failed Payment] Marked transaction ${transaction.id} as failed`);

          return res.json({
            success: true,
            message: 'Failed payment attempt recorded',
            transaction: {
              id: transaction.id,
              amount: parseFloat(transaction.amount),
              status: 'failed'
            }
          });
        }
        
        // Status changed during wait
        return res.json({
          success: true,
          message: `Transaction is now ${transaction.status}, not marking as failed`
        });
      }
    } else {
      console.log(`[Failed Payment] No transaction found for order ${razorpay_order_id}`);
      return res.json({
        success: false,
        message: 'Transaction not found for this order ID'
      });
    }
  } catch (error) {
    console.error('Error recording failed payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record failed payment attempt'
    });
  }
});

/**
 * POST /api/user/wallet/debit (Internal API - for charging sessions)
 * Deduct amount from wallet
 */
router.post('/wallet/debit', authenticateCustomerToken, [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('description')
    .notEmpty()
    .withMessage('Description is required'),
  body('referenceId')
    .optional()
    .isString()
    .withMessage('Reference ID must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const { amount, description, referenceId } = req.body;

    const wallet = await getOrCreateWallet(customer.id);
    const currentBalance = parseFloat(wallet.balance);

    if (currentBalance < amount) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance'
      });
    }

    // Deduct from wallet
    const newBalance = currentBalance - amount;

    await wallet.update({
      balance: newBalance
    });

    // Create transaction
    const transaction = await WalletTransaction.create({
      walletId: wallet.id,
      customerId: customer.id,
      transactionType: 'debit',
      amount: amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      description: description,
      referenceId: referenceId || null,
      status: 'completed',
      transactionCategory: 'charging'
    });

    res.json({
      success: true,
      transaction: {
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        balanceAfter: newBalance
      }
    });
  } catch (error) {
    console.error('Error debiting wallet:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to debit wallet'
    });
  }
});

// ============================================
// CHARGING SESSION APIs
// ============================================

/**
 * Helper function to generate unique session ID
 */
function generateSessionId() {
  return `SESS_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

/**
 * Helper function to extract meter value from MeterValues log
 */
function extractMeterValue(meterValuesLog) {
  if (!meterValuesLog || !meterValuesLog.messageData) {
    return null;
  }

  const meterValue = meterValuesLog.messageData.meterValue;
  if (!meterValue || !Array.isArray(meterValue) || meterValue.length === 0) {
    return null;
  }

  const sampledValues = meterValue[0].sampledValue;
  if (!sampledValues || !Array.isArray(sampledValues)) {
    return null;
  }

  // Find Energy.Active.Import.Register
  const energySample = sampledValues.find(sample => 
    sample.measurand === 'Energy.Active.Import.Register' || 
    sample.measurand === 'energy' ||
    sample.measurand === 'Energy'
  );

  if (energySample && energySample.value) {
    return parseFloat(energySample.value);
  }

  return null;
}

/**
 * POST /api/user/charging/start
 * Start charging session - Check wallet, deduct amount, start charging
 */
router.post('/charging/start', authenticateCustomerToken, [
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required'),
  body('connectorId')
    .notEmpty()
    .withMessage('Connector ID is required'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least ₹1'),
  body('chargingPointId')
    .optional()
    .trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const { deviceId, connectorId, amount, chargingPointId } = req.body;
    const amountValue = parseFloat(amount);

    // Get or create wallet
    const wallet = await getOrCreateWallet(customer.id);
    const currentBalance = parseFloat(wallet.balance);

    // Check wallet balance
    if (currentBalance < amountValue) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance. Please top up your wallet first.'
      });
    }

    // Check if customer already has an active session
    const activeSession = await ChargingSession.findOne({
      where: {
        customerId: customer.id,
        status: {
          [Op.in]: ['pending', 'active']
        }
      }
    });

    if (activeSession) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active charging session. Please stop it before starting a new one.'
      });
    }

    // Deduct amount from wallet
    const newBalance = currentBalance - amountValue;
    await wallet.update({ balance: newBalance });

    // Create wallet transaction (debit)
    const walletTransaction = await WalletTransaction.create({
      walletId: wallet.id,
      customerId: customer.id,
      transactionType: 'debit',
      amount: amountValue,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      description: `Charging Session - Device ${deviceId}`,
      referenceId: null, // Will be updated with transactionId later
      status: 'completed',
      transactionCategory: 'charging'
    });

    // Generate unique session ID
    const sessionId = generateSessionId();

    // Look up ChargingPoint by chargingPointId string to get the integer id
    let chargingPointDbId = null;
    if (chargingPointId) {
      const chargingPoint = await ChargingPoint.findOne({
        where: { chargingPointId: chargingPointId },
        attributes: ['id']
      });
      if (chargingPoint) {
        chargingPointDbId = chargingPoint.id;
      }
    }

    // Create charging session record
    const chargingSession = await ChargingSession.create({
      customerId: customer.id,
      chargingPointId: chargingPointDbId, // Use integer id, not string chargingPointId
      deviceId: deviceId,
      connectorId: parseInt(connectorId),
      sessionId: sessionId,
      transactionId: null, // Will be updated when charger responds
      status: 'pending',
      amountRequested: amountValue,
      amountDeducted: amountValue,
      energyConsumed: null,
      finalAmount: null,
      refundAmount: null,
      meterStart: null,
      meterEnd: null,
      startTime: null,
      endTime: null,
      stopReason: null
    });

    // Call charger remote-start API
    try {
      const chargerResponse = await axios.post(
        `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/charger/remote-start`,
        {
          deviceId: deviceId,
          connectorId: parseInt(connectorId),
          idTag: `CUSTOMER_${customer.id}` // Use customer ID as idTag
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000 // 60 seconds timeout
        }
      );

      if (chargerResponse.data && chargerResponse.data.success) {
        // Update session status to active
        await chargingSession.update({
          status: 'active',
          startTime: new Date()
        });

        res.json({
          success: true,
          message: 'Charging started successfully',
          session: {
            id: chargingSession.id,
            sessionId: chargingSession.sessionId,
            deviceId: chargingSession.deviceId,
            connectorId: chargingSession.connectorId,
            amountDeducted: parseFloat(chargingSession.amountDeducted),
            status: chargingSession.status,
            startTime: chargingSession.startTime
          }
        });
      } else {
        // Charger rejected - refund wallet
        await wallet.update({ balance: currentBalance });
        await walletTransaction.update({
          transactionType: 'refund',
          balanceBefore: newBalance,
          balanceAfter: currentBalance,
          description: `Refund - Charging rejected: ${chargerResponse.data.error || 'Unknown error'}`
        });
        await chargingSession.update({
          status: 'failed',
          refundAmount: amountValue
        });

        return res.status(400).json({
          success: false,
          error: chargerResponse.data.error || 'Charger rejected the charging request'
        });
      }
    } catch (chargerError) {
      // Charger API error - refund wallet
      await wallet.update({ balance: currentBalance });
      await walletTransaction.update({
        transactionType: 'refund',
        balanceBefore: newBalance,
        balanceAfter: currentBalance,
        description: `Refund - Charging failed: ${chargerError.response?.data?.error || chargerError.message || 'Charger connection error'}`
      });
      await chargingSession.update({
        status: 'failed',
        refundAmount: amountValue
      });

      const errorMessage = chargerError.response?.data?.error || chargerError.message || 'Failed to start charging';
      return res.status(400).json({
        success: false,
        error: errorMessage
      });
    }
  } catch (error) {
    console.error('Error starting charging session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start charging session'
    });
  }
});

/**
 * POST /api/user/charging/stop
 * Stop charging session - Stop charging, calculate final cost, process refund
 */
router.post('/charging/stop', authenticateCustomerToken, [
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required'),
  body('connectorId')
    .notEmpty()
    .withMessage('Connector ID is required'),
  body('transactionId')
    .optional()
    .isString()
    .withMessage('Transaction ID must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const { deviceId, connectorId, transactionId } = req.body;

    // Find active session for this customer
    const session = await ChargingSession.findOne({
      where: {
        customerId: customer.id,
        deviceId: deviceId,
        connectorId: parseInt(connectorId),
        status: {
          [Op.in]: ['pending', 'active']
        }
      },
      include: [
        {
          model: ChargingPoint,
          as: 'chargingPoint',
          include: [
            {
              model: Tariff,
              as: 'tariff'
            }
          ]
        }
      ]
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No active charging session found'
      });
    }

    // Call charger remote-stop API
    let stopSuccess = false;
    let actualTransactionId = transactionId || session.transactionId;

    // If we don't have transactionId yet, try to get it from StartTransaction Response (where transactionId actually comes from)
    if (!actualTransactionId && session.deviceId && session.startTime) {
      try {
        console.log(`[Stop Charging] Looking up transactionId for deviceId: ${session.deviceId}, startTime: ${session.startTime}`);
        
        // First, find the StartTransaction log (look within a reasonable time window)
        const startTimeWindow = new Date(session.startTime);
        startTimeWindow.setMinutes(startTimeWindow.getMinutes() - 5); // 5 minutes before session start
        
        const startTransactionLog = await ChargerData.findOne({
          where: {
            deviceId: session.deviceId,
            message: 'StartTransaction',
            direction: 'Incoming',
            createdAt: {
              [Op.gte]: startTimeWindow,
              [Op.lte]: new Date(Date.now() + 60000) // Up to 1 minute in future (for clock skew)
            }
          },
          order: [['createdAt', 'DESC']], // Get most recent first
          limit: 1
        });

        if (startTransactionLog) {
          console.log(`[Stop Charging] Found StartTransaction log with messageId: ${startTransactionLog.messageId}`);
          
          if (startTransactionLog.messageId) {
            // The transactionId comes from the Response to StartTransaction, not from StartTransaction itself
            // Try without deviceId filter first (Response might not have deviceId set)
            let startResponse = await ChargerData.findOne({
              where: {
                message: 'Response',
                messageId: startTransactionLog.messageId,
                direction: 'Outgoing',
                createdAt: {
                  [Op.gte]: startTimeWindow
                }
              },
              order: [['createdAt', 'ASC']],
              limit: 1
            });

            // If not found, try with deviceId
            if (!startResponse) {
              startResponse = await ChargerData.findOne({
                where: {
                  deviceId: session.deviceId,
                  message: 'Response',
                  messageId: startTransactionLog.messageId,
                  direction: 'Outgoing',
                  createdAt: {
                    [Op.gte]: startTimeWindow
                  }
                },
                order: [['createdAt', 'ASC']],
                limit: 1
              });
            }

            if (startResponse) {
              console.log(`[Stop Charging] Found Response log for messageId: ${startTransactionLog.messageId}`);
              // Extract transactionId from Response message
              if (startResponse.messageData && startResponse.messageData.transactionId) {
                actualTransactionId = startResponse.messageData.transactionId;
                console.log(`[Stop Charging] ✅ Found transactionId from Response messageData: ${actualTransactionId}`);
              } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2]) {
                if (startResponse.raw[2].transactionId) {
                  actualTransactionId = startResponse.raw[2].transactionId;
                  console.log(`[Stop Charging] ✅ Found transactionId from Response raw: ${actualTransactionId}`);
                } else {
                  console.log(`[Stop Charging] ⚠️ Response raw[2] exists but no transactionId:`, startResponse.raw[2]);
                }
              } else {
                console.log(`[Stop Charging] ⚠️ Response found but no transactionId in messageData or raw`);
              }
            } else {
              console.log(`[Stop Charging] ⚠️ No Response found for messageId: ${startTransactionLog.messageId}`);
            }

            // Fallback: try to get from StartTransaction itself (some chargers might include it)
            if (!actualTransactionId) {
              if (startTransactionLog.messageData && startTransactionLog.messageData.transactionId) {
                actualTransactionId = startTransactionLog.messageData.transactionId;
                console.log(`[Stop Charging] ✅ Found transactionId from StartTransaction messageData: ${actualTransactionId}`);
              } else if (startTransactionLog.raw && Array.isArray(startTransactionLog.raw) && startTransactionLog.raw[2]) {
                if (startTransactionLog.raw[2].transactionId) {
                  actualTransactionId = startTransactionLog.raw[2].transactionId;
                  console.log(`[Stop Charging] ✅ Found transactionId from StartTransaction raw: ${actualTransactionId}`);
                } else {
                  console.log(`[Stop Charging] ⚠️ StartTransaction raw[2] exists but no transactionId:`, startTransactionLog.raw[2]);
                }
              } else {
                console.log(`[Stop Charging] ⚠️ StartTransaction found but no transactionId in messageData or raw`);
              }
            }
          } else {
            console.log(`[Stop Charging] ⚠️ StartTransaction log found but no messageId`);
          }
        } else {
          console.log(`[Stop Charging] ⚠️ No StartTransaction log found for deviceId: ${session.deviceId} after ${session.startTime}`);
        }
      } catch (error) {
        console.error('[Stop Charging] Error finding transactionId:', error);
      }
    }

    if (actualTransactionId) {
      try {
        console.log(`[Stop Charging] Calling remote-stop for deviceId: ${deviceId}, transactionId: ${actualTransactionId}`);
        const chargerResponse = await axios.post(
          `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/charger/remote-stop`,
          {
            deviceId: deviceId,
            transactionId: actualTransactionId
          },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }
        );

        stopSuccess = chargerResponse.data && chargerResponse.data.success;
        console.log(`[Stop Charging] Remote-stop response:`, stopSuccess ? 'Success' : 'Failed', chargerResponse.data);
        
        // If remote-stop failed, log it but continue (charger might stop on its own)
        if (!stopSuccess) {
          console.warn(`[Stop Charging] Remote-stop API returned success=false. Response:`, chargerResponse.data);
        }
      } catch (chargerError) {
        console.error('[Stop Charging] Error calling remote-stop:', {
          message: chargerError.message,
          response: chargerError.response?.data,
          status: chargerError.response?.status,
          statusText: chargerError.response?.statusText
        });
        
        // If it's a timeout or connection error, we still want to finalize the session
        // But log it clearly so we know the charger didn't actually stop
        if (chargerError.code === 'ECONNREFUSED' || chargerError.code === 'ETIMEDOUT') {
          console.error(`[Stop Charging] CRITICAL: Cannot reach charger API. Charger may not actually stop!`);
        }
        
        // Continue with session finalization even if remote-stop fails
        // (charger might have stopped on its own, or we'll handle it separately)
      }
    } else {
      console.warn(`[Stop Charging] ⚠️ No transactionId available for deviceId: ${deviceId}. Cannot call remote-stop.`);
      console.warn(`[Stop Charging] Session will be finalized, but charger may not actually stop. Please verify charger status manually.`);
      // Even without transactionId, we should still finalize the session
      // The charger might have stopped on its own or via another method
      // Set stopSuccess to false so frontend knows
      stopSuccess = false;
    }

    // Get tariff for cost calculation
    const tariff = session.chargingPoint?.tariff;
    const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
    const tax = tariff ? parseFloat(tariff.tax) : 0;

    // Get meter readings from ChargerData
    let meterStart = session.meterStart;
    let meterEnd = null;
    let energyConsumed = 0;

    if (actualTransactionId) {
      // Get StartTransaction log to find meter_start
      if (!meterStart && session.startTime) {
        // Get first MeterValues after session start
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

      // Wait for StopTransaction to process and final MeterValues to arrive
      // Try multiple times with increasing delays to get the final meter reading
      let attempts = 0;
      const maxAttempts = 5;
      while (!meterEnd && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds per attempt
        
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
          const extractedValue = extractMeterValue(lastMeterValues);
          if (extractedValue !== null) {
            meterEnd = extractedValue;
            console.log(`[Stop Charging] Found meterEnd: ${meterEnd} (attempt ${attempts + 1})`);
            break;
          }
        }
        attempts++;
      }
      
      if (!meterEnd) {
        console.warn(`[Stop Charging] Could not find meterEnd after ${maxAttempts} attempts`);
      }
    }

    // Calculate energy consumed
    if (meterStart !== null && meterEnd !== null && meterEnd >= meterStart) {
      energyConsumed = (meterEnd - meterStart) / 1000; // Convert Wh to kWh
      if (energyConsumed < 0) energyConsumed = 0;
    }

    // Calculate final amount based on actual energy consumed
    let calculatedAmount = 0;
    if (energyConsumed > 0 && baseCharges > 0) {
      const baseAmount = energyConsumed * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      calculatedAmount = baseAmount * taxMultiplier;
    }

    // CRITICAL: Cap finalAmount at amountDeducted - user should NEVER be charged more than prepaid
    const amountDeducted = parseFloat(session.amountDeducted);
    let finalAmount = Math.min(calculatedAmount, amountDeducted); // Never exceed prepaid amount
    
    console.log(`[Stop Charging] Billing Calculation - Amount Deducted: ₹${amountDeducted}, Energy: ${energyConsumed} kWh, Calculated Amount: ₹${calculatedAmount.toFixed(2)}, Final Amount (Capped): ₹${finalAmount.toFixed(2)}, MeterStart: ${meterStart}, MeterEnd: ${meterEnd}`);

    // Calculate refund (if final amount is less than deducted)
    let refundAmount = 0;
    
    // If we have valid energy consumption data
    if (energyConsumed > 0 && calculatedAmount > 0) {
      // Since finalAmount is capped at amountDeducted, refund = amountDeducted - finalAmount
      if (finalAmount < amountDeducted) {
        refundAmount = amountDeducted - finalAmount;
        console.log(`[Stop Charging] Refund: ₹${refundAmount.toFixed(2)} (Used: ₹${finalAmount.toFixed(2)}, Deducted: ₹${amountDeducted.toFixed(2)})`);
      } else {
        console.log(`[Stop Charging] No refund (Used all prepaid amount: ₹${finalAmount.toFixed(2)} = ₹${amountDeducted.toFixed(2)})`);
      }
      
      // If calculated amount exceeded prepaid, log a warning
      if (calculatedAmount > amountDeducted) {
        console.warn(`[Stop Charging] ⚠️ Calculated amount (₹${calculatedAmount.toFixed(2)}) exceeded prepaid (₹${amountDeducted.toFixed(2)}). Capped at prepaid amount. Auto-stop should have triggered earlier.`);
      }
    } 
    // If energy is 0 but we have meter readings
    else if (energyConsumed === 0 && meterStart !== null && meterEnd !== null) {
      // Check if meter readings are the same (no charging happened)
      const meterDiff = Math.abs(meterEnd - meterStart);
      if (meterDiff < 1) { // Less than 1 Wh difference (essentially no charging)
        // No charging happened - refund full amount
        refundAmount = amountDeducted;
        console.log(`[Stop Charging] Full refund: ₹${refundAmount} (No charging - meter unchanged)`);
      } else {
        // Meter readings changed but energy calculated as 0 (might be rounding or calculation issue)
        // Recalculate energy with better precision
        const energyWh = meterEnd - meterStart;
        if (energyWh > 0) {
          energyConsumed = energyWh / 1000; // Convert Wh to kWh
          const baseAmount = energyConsumed * baseCharges;
          const taxMultiplier = 1 + (tax / 100);
          const recalculatedAmount = baseAmount * taxMultiplier;
          // Cap at amountDeducted
          const recalculatedFinalAmount = Math.min(recalculatedAmount, amountDeducted);
          
          if (recalculatedFinalAmount < amountDeducted) {
            refundAmount = amountDeducted - recalculatedFinalAmount;
            console.log(`[Stop Charging] Recalculated partial refund: ₹${refundAmount.toFixed(2)} (Energy: ${energyConsumed} kWh, Used: ₹${recalculatedFinalAmount.toFixed(2)}, Capped from ₹${recalculatedAmount.toFixed(2)})`);
          }
          
          // Update finalAmount with recalculated value (capped)
          finalAmount = recalculatedFinalAmount;
        } else {
          // No energy consumed - refund full
          refundAmount = amountDeducted;
          console.log(`[Stop Charging] Full refund: ₹${refundAmount} (Meter readings changed but energyWh <= 0)`);
        }
      }
    }
    // If we don't have meter readings, check session duration
    else if (energyConsumed === 0 && (meterStart === null || meterEnd === null)) {
      // If session was very short (less than 30 seconds), likely no charging happened
      const sessionDuration = session.startTime ? (new Date() - new Date(session.startTime)) / 1000 : 0;
      if (sessionDuration < 30) {
        // Very short session, likely no charging - refund full amount
        refundAmount = amountDeducted;
        console.log(`[Stop Charging] Full refund: ₹${refundAmount} (Very short session: ${sessionDuration.toFixed(1)}s)`);
      } else {
        // Session was longer but no meter readings - wait a bit more and try again
        console.warn(`[Stop Charging] No meter readings after ${sessionDuration.toFixed(1)}s. Waiting 5 more seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Try one more time to get meter readings
        const retryMeterValues = await ChargerData.findOne({
          where: {
            deviceId: deviceId,
            message: 'MeterValues',
            direction: 'Incoming',
            createdAt: {
              [Op.gte]: session.startTime
            }
          },
          order: [['createdAt', 'DESC']],
          limit: 1
        });
        
        if (retryMeterValues) {
          meterEnd = extractMeterValue(retryMeterValues);
          if (meterEnd !== null && meterStart !== null && meterEnd >= meterStart) {
            energyConsumed = (meterEnd - meterStart) / 1000;
            if (energyConsumed > 0 && baseCharges > 0) {
              const baseAmount = energyConsumed * baseCharges;
              const taxMultiplier = 1 + (tax / 100);
              const retryCalculatedAmount = baseAmount * taxMultiplier;
              // Cap at amountDeducted
              const retryFinalAmount = Math.min(retryCalculatedAmount, amountDeducted);
              
              if (retryFinalAmount < amountDeducted) {
                refundAmount = amountDeducted - retryFinalAmount;
                console.log(`[Stop Charging] Retry successful - Partial refund: ₹${refundAmount.toFixed(2)} (Capped from ₹${retryCalculatedAmount.toFixed(2)})`);
              }
              
              // Update finalAmount with retry value (capped)
              finalAmount = retryFinalAmount;
            }
          }
        }
        
        // If still no meter readings, refund full to be safe
        if (refundAmount === 0 && energyConsumed === 0) {
          refundAmount = amountDeducted;
          console.warn(`[Stop Charging] Full refund: ₹${refundAmount} (No meter readings after retry)`);
        }
      }
    }

    // Update session status to 'stopped' IMMEDIATELY to prevent frontend loop
    // This must happen FIRST so the active session API returns null immediately
    await session.update({
      status: 'stopped',
      transactionId: actualTransactionId,
      energyConsumed: energyConsumed,
      finalAmount: finalAmount,
      refundAmount: refundAmount,
      meterStart: meterStart,
      meterEnd: meterEnd,
      endTime: new Date(),
      stopReason: 'Remote'
    });
    
    // Reload session to ensure we have the latest data
    await session.reload();
    
    console.log(`[Stop Charging] Session ${session.sessionId} updated to 'stopped' status with endTime: ${session.endTime}`);

    // Update wallet if refund is needed (after session update to prevent race conditions)
    if (refundAmount > 0) {
      // Check if refund transaction already exists for this session to prevent duplicates
      const existingRefund = await WalletTransaction.findOne({
        where: {
          customerId: customer.id,
          referenceId: session.sessionId,
          transactionType: 'refund',
          transactionCategory: 'refund'
        }
      });

      if (!existingRefund) {
        const wallet = await getOrCreateWallet(customer.id);
        const currentBalance = parseFloat(wallet.balance);
        const newBalance = currentBalance + refundAmount;

        await wallet.update({ balance: newBalance });

        // Create refund transaction
        await WalletTransaction.create({
          walletId: wallet.id,
          customerId: customer.id,
          transactionType: 'refund',
          amount: refundAmount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description: `Refund - Charging Session ${session.sessionId} (Energy: ${energyConsumed.toFixed(2)} kWh, Used: ₹${finalAmount.toFixed(2)}, Refunded: ₹${refundAmount.toFixed(2)})`,
          referenceId: session.sessionId,
          status: 'completed',
          transactionCategory: 'refund'
        });
        
        console.log(`[Stop Charging] Wallet refund processed: ₹${refundAmount} (Balance: ₹${currentBalance} → ₹${newBalance})`);
      } else {
        console.log(`[Stop Charging] Refund transaction already exists for session ${session.sessionId}, skipping duplicate`);
      }
    }

    // Return response with stopSuccess status
    res.json({
      success: true,
      message: stopSuccess 
        ? 'Charging stopped successfully' 
        : 'Session finalized, but charger remote-stop may have failed. Please verify charger status.',
      stopSuccess: stopSuccess, // Include this so frontend knows if charger actually stopped
      session: {
        id: session.id,
        sessionId: session.sessionId,
        energyConsumed: parseFloat(energyConsumed.toFixed(3)),
        finalAmount: parseFloat(finalAmount.toFixed(2)),
        refundAmount: parseFloat(refundAmount.toFixed(2)),
        amountDeducted: parseFloat(session.amountDeducted),
        startTime: session.startTime,
        endTime: session.endTime
      }
    });
  } catch (error) {
    console.error('Error stopping charging session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop charging session'
    });
  }
});

/**
 * GET /api/user/charging/active-session
 * Get active charging session for the customer
 */
router.get('/charging/active-session', authenticateCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;

    // Find active session (exclude sessions with endTime set, as they are stopped)
    const session = await ChargingSession.findOne({
      where: {
        customerId: customer.id,
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
              model: Station,
              as: 'station',
              attributes: ['id', 'stationId', 'stationName']
            },
            {
              model: Tariff,
              as: 'tariff'
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (!session) {
      return res.json({
        success: true,
        session: null
      });
    }

    // CRITICAL: Double-check by deviceId - if no active sessions exist for this deviceId, charging has stopped
    // This catches cases where CMS stopped the session but the customer's session query still found it
    const deviceId = session.deviceId;
    const activeSessionsForDevice = await ChargingSession.count({
      where: {
        deviceId: deviceId,
        status: {
          [Op.in]: ['pending', 'active']
        },
        endTime: null
      }
    });

    // If no active sessions exist for this deviceId, the session was stopped (possibly from CMS)
    if (activeSessionsForDevice === 0) {
      console.log(`[Active Session] No active sessions found for deviceId ${deviceId} - session was stopped`);
      return res.json({
        success: true,
        session: null
      });
    }

    // Reload session to ensure we have the latest data
    await session.reload();

    // Double-check session is still active after reload
    if (session.status && ['stopped', 'completed', 'failed'].includes(session.status)) {
      console.log(`[Active Session] Session ${session.sessionId} has status ${session.status} - returning null`);
      return res.json({
        success: true,
        session: null
      });
    }

    // Double-check endTime is still null
    if (session.endTime) {
      console.log(`[Active Session] Session ${session.sessionId} has endTime ${session.endTime} - returning null`);
      return res.json({
        success: true,
        session: null
      });
    }

    // Get current meter reading for real-time energy calculation
    let currentEnergy = 0;
    let meterNow = null;

    if (session.deviceId) {
      // Get latest MeterValues
      const latestMeterValues = await ChargerData.findOne({
        where: {
          deviceId: session.deviceId,
          message: 'MeterValues',
          direction: 'Incoming'
        },
        order: [['createdAt', 'DESC']],
        limit: 1
      });

      if (latestMeterValues) {
        meterNow = extractMeterValue(latestMeterValues);
      }

      // Get meter_start from first MeterValues after session start
      let meterStart = session.meterStart;
      if (!meterStart && session.startTime) {
        const startMeterValues = await ChargerData.findOne({
          where: {
            deviceId: session.deviceId,
            message: 'MeterValues',
            direction: 'Incoming',
            createdAt: {
              [Op.gte]: session.startTime
            }
          },
          order: [['createdAt', 'ASC']],
          limit: 1
        });

        if (startMeterValues) {
          meterStart = extractMeterValue(startMeterValues);
          await session.update({ meterStart: meterStart });
        }
      }

      // Calculate current energy
      if (meterStart !== null && meterNow !== null && meterNow >= meterStart) {
        currentEnergy = (meterNow - meterStart) / 1000; // Convert Wh to kWh
        if (currentEnergy < 0) currentEnergy = 0;
      }
    }

    // Calculate current cost
    let currentCost = 0;
    const tariff = session.chargingPoint?.tariff;
    if (currentEnergy > 0 && tariff) {
      const baseCharges = parseFloat(tariff.baseCharges) || 0;
      const tax = parseFloat(tariff.tax) || 0;
      const baseAmount = currentEnergy * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      currentCost = baseAmount * taxMultiplier;
    }

    // AUTO-STOP: Check if cost has reached 95% of prepaid amount
    const amountDeducted = parseFloat(session.amountDeducted);
    // Stop at 95% threshold to prevent overcharging
    const stopThreshold = amountDeducted * 0.95;
    const shouldAutoStop = amountDeducted > 0 && currentCost >= stopThreshold;
    
    // Note: Auto-stop is handled by frontend to avoid circular API calls
    // Frontend will call stop charging endpoint when shouldAutoStop is true

    res.json({
      success: true,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        deviceId: session.deviceId,
        deviceName: session.chargingPoint?.deviceName || session.deviceId,
        connectorId: session.connectorId,
        transactionId: session.transactionId,
        amountDeducted: parseFloat(session.amountDeducted),
        energy: parseFloat(currentEnergy.toFixed(3)),
        cost: parseFloat(currentCost.toFixed(2)),
        status: session.status,
        startTime: session.startTime,
        endTime: session.endTime, // Include endTime so frontend can detect CMS stops
        shouldAutoStop: shouldAutoStop, // Let frontend know if auto-stop should trigger
        station: session.chargingPoint?.station ? {
          stationId: session.chargingPoint.station.stationId,
          stationName: session.chargingPoint.station.stationName
        } : null,
        tariff: tariff ? {
          tariffId: tariff.tariffId,
          tariffName: tariff.tariffName,
          baseCharges: parseFloat(tariff.baseCharges),
          tax: parseFloat(tariff.tax),
          currency: tariff.currency
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active session'
    });
  }
});

// ============================================
// SESSIONS API ROUTES
// ============================================

/**
 * GET /api/user/sessions
 * Get completed charging sessions for the customer
 */
router.get('/sessions', authenticateCustomerToken, [
  query('fromDate').optional().isISO8601().withMessage('From date must be a valid ISO8601 date'),
  query('toDate').optional().isISO8601().withMessage('To date must be a valid ISO8601 date'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      });
    }

    const customer = req.customer;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Parse dates and set proper time boundaries
    let fromDate = null;
    let toDate = null;
    
    if (req.query.fromDate) {
      fromDate = new Date(req.query.fromDate);
      // Set to start of day (00:00:00.000) in local timezone
      fromDate.setHours(0, 0, 0, 0);
    }
    
    if (req.query.toDate) {
      toDate = new Date(req.query.toDate);
      // Set to end of day (23:59:59.999) in local timezone to include all sessions on that day
      toDate.setHours(23, 59, 59, 999);
    }

    // Build where clause
    const whereClause = {
      customerId: customer.id,
      status: {
        [Op.in]: ['stopped', 'completed'] // Only completed/stopped sessions
      }
    };

    // Add date filters
    if (fromDate || toDate) {
      whereClause.endTime = {};
      if (fromDate) {
        whereClause.endTime[Op.gte] = fromDate;
      }
      if (toDate) {
        whereClause.endTime[Op.lte] = toDate;
      }
    }

    // Get sessions with related data
    const { count, rows: sessions } = await ChargingSession.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ChargingPoint,
          as: 'chargingPoint',
          include: [
            {
              model: Station,
              as: 'station',
              attributes: ['id', 'stationId', 'stationName']
            },
            {
              model: Tariff,
              as: 'tariff',
              attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
            }
          ]
        }
      ],
      order: [['endTime', 'DESC'], ['createdAt', 'DESC']],
      limit: limit,
      offset: offset
    });

    // Format sessions for response
    const formattedSessions = sessions.map(session => {
      const tariff = session.chargingPoint?.tariff;
      const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
      const tax = tariff ? parseFloat(tariff.tax) : 0;

      return {
        id: session.id,
        sessionId: session.sessionId,
        transactionId: session.transactionId,
        deviceId: session.deviceId,
        deviceName: session.chargingPoint?.deviceName || session.deviceId,
        connectorId: session.connectorId,
        stationName: session.chargingPoint?.station?.stationName || 'N/A',
        stationId: session.chargingPoint?.station?.stationId || null,
        startTime: session.startTime,
        endTime: session.endTime,
        energy: parseFloat(session.energyConsumed || 0),
        billedAmount: parseFloat(session.finalAmount || 0),
        amountDeducted: parseFloat(session.amountDeducted),
        refundAmount: parseFloat(session.refundAmount || 0),
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR',
        status: session.status,
        stopReason: session.stopReason
      };
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      sessions: formattedSessions,
      total: count,
      page: page,
      limit: limit,
      totalPages: totalPages
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
});

/**
 * GET /api/user/sessions/:sessionId
 * Get single session details
 */
router.get('/sessions/:sessionId', authenticateCustomerToken, async (req, res) => {
  try {
    const customer = req.customer;
    const { sessionId } = req.params;

    const session = await ChargingSession.findOne({
      where: {
        sessionId: sessionId,
        customerId: customer.id
      },
      include: [
        {
          model: ChargingPoint,
          as: 'chargingPoint',
          include: [
            {
              model: Station,
              as: 'station',
              attributes: ['id', 'stationId', 'stationName']
            },
            {
              model: Tariff,
              as: 'tariff',
              attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
            }
          ]
        }
      ]
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const tariff = session.chargingPoint?.tariff;
    const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
    const tax = tariff ? parseFloat(tariff.tax) : 0;

    res.json({
      success: true,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        transactionId: session.transactionId,
        deviceId: session.deviceId,
        deviceName: session.chargingPoint?.deviceName || session.deviceId,
        connectorId: session.connectorId,
        stationName: session.chargingPoint?.station?.stationName || 'N/A',
        stationId: session.chargingPoint?.station?.stationId || null,
        startTime: session.startTime,
        endTime: session.endTime,
        energy: parseFloat(session.energyConsumed || 0),
        billedAmount: parseFloat(session.finalAmount || 0),
        amountDeducted: parseFloat(session.amountDeducted),
        refundAmount: parseFloat(session.refundAmount || 0),
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR',
        status: session.status,
        stopReason: session.stopReason,
        meterStart: session.meterStart ? parseFloat(session.meterStart) : null,
        meterEnd: session.meterEnd ? parseFloat(session.meterEnd) : null
      }
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
});

module.exports = router;

