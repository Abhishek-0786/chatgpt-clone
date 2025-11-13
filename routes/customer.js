const express = require('express');
const { body, validationResult, query } = require('express-validator');
const jwt = require('jsonwebtoken');
const { Customer, Station, ChargingPoint, Connector, Tariff, Vehicle, Wallet, WalletTransaction } = require('../models');
const { authenticateCustomerToken } = require('../middleware/customerAuth');
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const { createOrder, verifyPayment, getPaymentDetails } = require('../utils/razorpay');

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
 */
router.get('/stations', async (req, res) => {
  try {
    // Get all non-deleted stations
    const stations = await Station.findAll({
      where: {
        deleted: false
      },
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
        createdAt: station.createdAt
      };
    }));

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

    // Create pending transaction
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

    // Verify payment signature
    const isValidSignature = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    // Get payment details from Razorpay
    const paymentResult = await getPaymentDetails(razorpay_payment_id);

    if (!paymentResult.success || paymentResult.payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        error: 'Payment not successful'
      });
    }

    // Find pending transaction by order ID
    const transaction = await WalletTransaction.findOne({
      where: {
        customerId: customer.id,
        referenceId: razorpay_order_id,
        status: 'pending'
      }
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
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

module.exports = router;

