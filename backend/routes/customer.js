const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { authenticateCustomerToken } = require('../middleware/customerAuth');
const customerController = require('../controllers/customerController');
const walletController = require('../controllers/walletController');
const paymentController = require('../controllers/paymentController');
const stationController = require('../controllers/stationController');
const chargingController = require('../controllers/chargingController');
const paymentService = require('../services/paymentService');
const walletService = require('../services/walletService');

// Import remaining models and services for routes not yet refactored
const { Customer, Station, ChargingPoint, Connector, Tariff, Vehicle, Wallet, WalletTransaction, ChargingSession } = require('../models');
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const axios = require('axios');

// RabbitMQ producer (optional - only if enabled) - Still needed for charging routes
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishChargingEvent = null;
let publishNotification = null;
let publishChargingCommand = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../libs/rabbitmq/producer');
    publishChargingEvent = producer.publishChargingEvent;
    publishNotification = producer.publishNotification;
    publishChargingCommand = producer.publishChargingCommand;
    console.log('✅ [RABBITMQ] Customer routes configured to use RabbitMQ for event publishing');
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
} else {
  console.log('ℹ️ [LEGACY] Customer routes using direct processing (ENABLE_RABBITMQ=false)');
}

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
}, customerController.register);

// Login (User Panel)
router.post('/auth/login', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
}, customerController.login);

// Get current customer
router.get('/auth/me', authenticateCustomerToken, customerController.getCurrentCustomer);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, customerController.updateProfile);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, customerController.changePassword);

// Forgot Password
router.post('/auth/forgot-password', [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
}, customerController.forgotPassword);

// Reset Password
router.post('/auth/reset-password', [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      error: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
}, customerController.resetPassword);

// ============================================
// VEHICLES APIs
// ============================================

/**
 * GET /api/user/vehicles
 * Get all vehicles for customer
 */
router.get('/vehicles', authenticateCustomerToken, customerController.getVehicles);

/**
 * GET /api/user/vehicles/:vehicleId
 * Get vehicle by ID
 */
router.get('/vehicles/:vehicleId', authenticateCustomerToken, customerController.getVehicleById);

/**
 * POST /api/user/vehicles
 * Create new vehicle
 */
router.post('/vehicles', authenticateCustomerToken, [
  body('vehicleName')
    .notEmpty()
    .withMessage('Vehicle name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Vehicle name must be between 1 and 100 characters'),
  body('vehicleType')
    .notEmpty()
    .withMessage('Vehicle type is required')
    .isIn(['2W', '3W', '4W'])
    .withMessage('Vehicle type must be 2W, 3W, or 4W'),
  body('batteryCapacity')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Battery capacity must be a positive number'),
  body('connectorType')
    .optional()
    .isString()
    .withMessage('Connector type must be a string')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, customerController.createVehicle);

/**
 * PUT /api/user/vehicles/:vehicleId
 * Update vehicle
 */
router.put('/vehicles/:vehicleId', authenticateCustomerToken, [
  body('vehicleName')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Vehicle name must be between 1 and 100 characters'),
  body('vehicleType')
    .optional()
    .isIn(['2W', '3W', '4W'])
    .withMessage('Vehicle type must be 2W, 3W, or 4W'),
  body('batteryCapacity')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Battery capacity must be a positive number'),
  body('connectorType')
    .optional()
    .isString()
    .withMessage('Connector type must be a string')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, customerController.updateVehicle);

/**
 * DELETE /api/user/vehicles/:vehicleId
 * Delete vehicle
 */
router.delete('/vehicles/:vehicleId', authenticateCustomerToken, customerController.deleteVehicle);

// ============================================
// WALLET APIs
// ============================================

/**
 * GET /api/user/wallet/balance
 * Get current wallet balance
 */
router.get('/wallet/balance', authenticateCustomerToken, walletController.getBalance);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, walletController.getTransactions);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, walletController.debit);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, paymentController.createTopupOrder);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, paymentController.verifyTopupPayment);

/**
 * POST /api/user/wallet/topup/failed
 * Mark failed payment attempt
 */
router.post('/wallet/topup/failed', authenticateCustomerToken, [
  body('razorpay_order_id')
    .notEmpty()
    .withMessage('Razorpay order ID is required')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, paymentController.markFailedPayment);

// ============================================
// STATIONS APIs
// ============================================

/**
 * GET /api/user/stations
 * Get all stations with real-time status and statistics
 */
router.get('/stations', stationController.getAllStations);

/**
 * GET /api/user/stations/:stationId
 * Get single station by stationId
 */
router.get('/stations/:stationId', stationController.getStationById);

// ============================================
// REMAINING ROUTES (Not yet refactored - will be done in next phase)
// ============================================

// Helper functions still needed for remaining routes
async function getOrCreateWallet(customerId) {
  const { getOrCreateWallet: getWallet } = require('../services/walletService');
  return await getWallet(customerId);
}

// Extract meter value helper - now in libs/ocpp.js
const { extractMeterValue } = require('../libs/ocpp');

// Generate session ID helper - now in libs/chargingHelpers.js
const { generateSessionId } = require('../libs/chargingHelpers');

// Calculate session stats - now in stationService
const { calculateSessionStats } = require('../services/stationService');

// ============================================
// REMAINING ROUTES (Not yet refactored - will be done in next phase)
// ============================================

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

// extractMeterValue is now imported from libs/ocpp.js (see line 425)

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

    // FIRST: Check for recent StatusNotification with "Charging" status (most reliable for CMS-initiated charging)
    // This should be checked BEFORE StartTransaction because StatusNotification arrives immediately
    const recentStatusNotification = allLogs.find(log => 
      log.message === 'StatusNotification' && 
      log.direction === 'Incoming' &&
      (
        (log.messageData && log.messageData.status === 'Charging') ||
        (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status === 'Charging')
      )
    );

    if (recentStatusNotification) {
      const statusTime = new Date(recentStatusNotification.timestamp || recentStatusNotification.createdAt).getTime();
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      // If StatusNotification with "Charging" is recent (within 5 minutes), consider it active
      if (statusTime > fiveMinutesAgo) {
        // Check if there's a more recent StatusNotification with "Available" (charging stopped)
        const recentAvailableStatus = allLogs.find(log => 
          log.message === 'StatusNotification' && 
          log.direction === 'Incoming' &&
          log.timestamp > recentStatusNotification.timestamp &&
          (
            (log.messageData && log.messageData.status === 'Available') ||
            (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status === 'Available')
          )
        );
        
        if (!recentAvailableStatus) {
          console.log(`[hasActiveTransaction] Found recent StatusNotification with "Charging" for ${deviceId} - returning true`);
          return true;
        }
      }
    }

    // SECOND: Check for recent MeterValues - if MeterValues are coming, charging is likely active
    const recentMeterValue = allLogs.find(log => 
      log.message === 'MeterValues' && 
      log.direction === 'Incoming'
    );

    if (recentMeterValue) {
      const meterTime = new Date(recentMeterValue.timestamp || recentMeterValue.createdAt).getTime();
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      // If MeterValues are recent (within 5 minutes), check if there's a matching StopTransaction
      if (meterTime > fiveMinutesAgo) {
        let meterTxId = null;
        if (recentMeterValue.messageData && recentMeterValue.messageData.transactionId) {
          meterTxId = recentMeterValue.messageData.transactionId;
        } else if (recentMeterValue.raw && Array.isArray(recentMeterValue.raw) && recentMeterValue.raw[2] && recentMeterValue.raw[2].transactionId) {
          meterTxId = recentMeterValue.raw[2].transactionId;
        }
        
        if (meterTxId) {
          // Check if there's a StopTransaction for this transactionId that's more recent than MeterValues
          const stopForMeterTx = allLogs.find(log => 
            log.message === 'StopTransaction' && 
            log.direction === 'Incoming' &&
            (
              (log.messageData && log.messageData.transactionId && log.messageData.transactionId.toString() === meterTxId.toString()) ||
              (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId && log.raw[2].transactionId.toString() === meterTxId.toString())
            )
          );
          
          if (!stopForMeterTx) {
            console.log(`[hasActiveTransaction] Found recent MeterValues with transactionId ${meterTxId} for ${deviceId} - returning true`);
            return true;
          } else {
            const stopForMeterTime = new Date(stopForMeterTx.timestamp || stopForMeterTx.createdAt).getTime();
            if (stopForMeterTime <= meterTime) {
              console.log(`[hasActiveTransaction] Found recent MeterValues for ${deviceId} and StopTransaction is not more recent - returning true`);
              return true;
            }
          }
        } else {
          // MeterValues without transactionId but recent - likely active charging
          console.log(`[hasActiveTransaction] Found recent MeterValues (no transactionId) for ${deviceId} - returning true`);
          return true;
        }
      }
    }

    // THIRD: Check StartTransaction/StopTransaction logs (fallback for customer-initiated charging)
    // Find all StartTransaction messages (incoming from charger)
    const startTransactions = allLogs.filter(log => 
      log.message === 'StartTransaction' && log.direction === 'Incoming'
    );

    if (startTransactions.length === 0) {
      // No StartTransaction found, but we already checked StatusNotification and MeterValues above
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
    if (!stopTransaction) {
      return true;
    }

    // Check if StopTransaction happened after StartTransaction
    const stopTime = new Date(stopTransaction.timestamp || stopTransaction.createdAt).getTime();
    const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
    
    // If StopTransaction is before or at the same time as StartTransaction, consider it active
    if (stopTime <= startTime) {
      return true;
    }

    // If we reach here, StopTransaction happened after StartTransaction, so charging has stopped
    return false;
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

// calculateSessionStats is now imported from services/stationService.js (see line 431)

/**
 * GET /api/user/stations (DUPLICATE - REMOVED)
 * This route is now handled by stationController.getAllStations (see above)
 * Keeping this comment to show the old route was removed
 */
// OLD ROUTE REMOVED - Now using stationController.getAllStations
/*
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

      // Format organization for display
      const orgMap = {
        'massive_mobility': 'Massive Mobility',
        '1c_ev_charging': '1C EV Charging',
        'genx': 'GenX'
      };
      const organizationDisplay = orgMap[station.organization] || station.organization;
      // Keep original organization value for icon lookup
      const organization = station.organization;

      // Collect all connector types from all charging points
      const connectorTypes = new Set();
      chargingPoints.forEach(cp => {
        if (cp.connectors && cp.connectors.length > 0) {
          cp.connectors.forEach(connector => {
            if (connector.connectorType) {
              connectorTypes.add(connector.connectorType);
            }
          });
        }
      });

      return {
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: organization, // Original value for icon lookup
        organizationDisplay: organizationDisplay, // Formatted name for display
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
        connectorTypes: Array.from(connectorTypes), // Add connector types array
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
        connectors: await Promise.all(connectors.map(async (c) => {
          // Check if THIS specific connector has an active session
          let connectorStatus = 'Unavailable';
          let connectorCStatus = 'Unavailable';
          
          if (realTimeStatus === 'Online') {
            // Check if this specific connector has an active session
            const activeSessionForConnector = await ChargingSession.findOne({
              where: {
                deviceId: point.deviceId,
                connectorId: c.connectorId,
                status: {
                  [Op.in]: ['pending', 'active']
                },
                endTime: null
              }
            });
            
            if (activeSessionForConnector) {
              connectorStatus = 'Charging';
              connectorCStatus = 'Charging';
            } else {
              // Check for faults on this connector (if connector-specific fault detection is needed)
              // For now, use device-level fault check
              const hasFaultStatus = await hasFault(point.deviceId);
              if (hasFaultStatus) {
                connectorStatus = 'Faulted';
                connectorCStatus = 'Faulted';
              } else {
                connectorStatus = 'Available';
                connectorCStatus = 'Available';
              }
            }
          }
          
          return {
            connectorId: c.connectorId,
            connectorType: c.connectorType,
            power: parseFloat(c.power),
            status: connectorStatus,
            cStatus: connectorCStatus
          };
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
    // Always check hasActiveTransaction() for real-time status (not from Charger model)
    // This ensures CMS-initiated charging is detected correctly
    let cStatus = 'Unavailable'; // Default
    if (realTimeStatus === 'Offline') {
      cStatus = 'Unavailable';
    } else {
      // Check for faults first
      const hasFaultStatus = await hasFault(chargingPoint.deviceId);
      if (hasFaultStatus) {
        cStatus = 'Faulted';
      } else {
        // Check for active charging - this checks StatusNotification and MeterValues first
        // so it works even if StartTransaction log is delayed
        const isCharging = await hasActiveTransaction(chargingPoint.deviceId);
        console.log(`[Charging Point API] Device ${chargingPoint.deviceId}: hasActiveTransaction=${isCharging}, realTimeStatus=${realTimeStatus}`);
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
        connectors: await Promise.all(connectors.map(async (c) => {
          // Check if THIS specific connector has an active session
          let connectorStatus = 'Unavailable';
          let connectorCStatus = 'Unavailable';
          
          if (realTimeStatus === 'Online') {
            // Check if this specific connector has an active session
            const activeSessionForConnector = await ChargingSession.findOne({
              where: {
                deviceId: chargingPoint.deviceId,
                connectorId: c.connectorId,
                status: {
                  [Op.in]: ['pending', 'active']
                },
                endTime: null
              }
            });
            
            if (activeSessionForConnector) {
              connectorStatus = 'Charging';
              connectorCStatus = 'Charging';
            } else {
              // Check for faults on this connector (if connector-specific fault detection is needed)
              // For now, use device-level fault check
              const hasFaultStatus = await hasFault(chargingPoint.deviceId);
              if (hasFaultStatus) {
                connectorStatus = 'Faulted';
                connectorCStatus = 'Faulted';
              } else {
                connectorStatus = 'Available';
                connectorCStatus = 'Available';
              }
            }
          }
          
          return {
            connectorId: c.connectorId,
            connectorType: c.connectorType,
            power: parseFloat(c.power),
            status: connectorStatus,
            cStatus: connectorCStatus
          };
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
// VEHICLES API ROUTES (Already refactored above - removing duplicate)
// ============================================

// Vehicle routes are now handled by customerController (see above)

// ============================================
// REMAINING ROUTES (Not yet refactored - will be done in next phase)
// ============================================

/**
 * GET /api/user/stations/:stationId/points
 * Get charging points for a station (NOT YET REFACTORED)
 */
router.get('/stations/:stationId/points', async (req, res) => {
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
 * Razorpay webhook handler
 * Receives payment events from Razorpay and publishes to RabbitMQ queue for async processing
 * 
 * Note: This handler expects raw body (Buffer) from express.raw() middleware
 * The raw body middleware is applied in server.js before JSON parsing for this specific route
 */
async function handlePaymentWebhook(req, res) {
  try {
    // Get webhook signature from header
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      console.error('[Payment Webhook] Missing X-Razorpay-Signature header');
      return res.status(400).json({
        success: false,
        error: 'Missing signature header'
      });
    }

    // Get webhook secret from environment
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Payment Webhook] RAZORPAY_WEBHOOK_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: 'Webhook secret not configured'
      });
    }

    // Get raw body - express.raw() middleware provides Buffer
    if (!Buffer.isBuffer(req.body)) {
      console.error('[Payment Webhook] Expected raw body (Buffer) but got:', typeof req.body);
      return res.status(400).json({
        success: false,
        error: 'Invalid request body format'
      });
    }

    const rawBody = req.body.toString('utf8');
    
    // Verify webhook signature (must use raw body string)
    const { verifyWebhookSignature } = require('../libs/razorpay');
    const isValidSignature = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValidSignature) {
      console.error('[Payment Webhook] Invalid signature');
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    // Parse webhook payload
    let webhookPayload;
    try {
      webhookPayload = JSON.parse(rawBody);
    } catch (error) {
      console.error('[Payment Webhook] Invalid JSON payload:', error);
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON payload'
      });
    }

    console.log(`[Payment Webhook] Received webhook event: ${webhookPayload.event}, entity: ${webhookPayload.entity}`);

    // Only process payment.captured events
    if (webhookPayload.event !== 'payment.captured') {
      console.log(`[Payment Webhook] Ignoring event: ${webhookPayload.event}`);
      return res.status(200).json({
        success: true,
        message: 'Event ignored (not payment.captured)'
      });
    }

    // Check if RabbitMQ is enabled
    const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
    if (!ENABLE_RABBITMQ) {
      console.warn('[Payment Webhook] RabbitMQ disabled, cannot process webhook');
      return res.status(500).json({
        success: false,
        error: 'Payment processing unavailable'
      });
    }

    // Import publishPayment dynamically to avoid circular dependencies
    const { publishPayment } = require('../libs/rabbitmq/producer');

    // Publish to RabbitMQ queue immediately (before any DB operations)
    const published = await publishPayment({
      type: 'wallet.topup',
      payload: webhookPayload,
      timestamp: new Date()
    });

    if (!published) {
      console.error('[Payment Webhook] Failed to publish to RabbitMQ queue');
      return res.status(500).json({
        success: false,
        error: 'Failed to queue payment for processing'
      });
    }

    console.log(`[Payment Webhook] Successfully published payment ${webhookPayload.payload?.payment?.entity?.id} to queue`);

    // Return 200 immediately - do not wait for DB update
    // The consumer will process the queue message and update wallet/ledger
    return res.status(200).json({
      success: true,
      message: 'Webhook received and queued for processing'
    });

  } catch (error) {
    console.error('[Payment Webhook] Error processing webhook:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
}

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

    const result = await walletService.debitWallet(customer.id, amount, description, referenceId || null);

    res.json({
      success: true,
      transaction: {
        id: result.transaction.id,
        amount: result.transaction.amount,
        balanceAfter: result.transaction.balanceAfter
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

// generateSessionId is now imported from libs/chargingHelpers.js (see line 428)
// extractMeterValue is now imported from libs/ocpp.js (see line 425)

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, chargingController.startCharging);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, chargingController.stopCharging);

// OLD ROUTE CODE REMOVED - Now using chargingController.stopCharging
// This route handler was moved to backend/services/chargingService.js and backend/controllers/chargingController.js
/*
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

    // Queue-based microservice flow: Publish remote stop command to queue
    // TODO: Remove fallback after queue flow fully validated
    let useQueueFlow = ENABLE_RABBITMQ && publishChargingCommand;
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
      if (useQueueFlow) {
        // NEW: Queue-based flow (asynchronous, microservice architecture)
        console.log(`📤 [Queue] Publishing remote stop command for session ${session.sessionId}`);
        
        try {
          const commandPublished = await publishChargingCommand({
            command: 'RemoteStopTransaction',
            deviceId: deviceId,
            payload: {
              transactionId: actualTransactionId
            },
            sessionId: session.sessionId,
            deviceId: deviceId,
            transactionId: actualTransactionId,
            timestamp: new Date(),
            useQueueFlow: true // Use new routing key
          });

          if (commandPublished) {
            console.log(`✅ [Queue] Remote stop command published for session ${session.sessionId}`);
            // Response will be processed asynchronously by ChargingResponsesConsumer
            // Continue with session finalization (charger will stop asynchronously)
            stopSuccess = true; // Assume success - actual result will come via queue
          } else {
            console.warn(`⚠️ [Queue] Failed to publish remote stop command, falling back to direct call`);
            useQueueFlow = false; // Fall back to direct call
          }
        } catch (queueError) {
          console.error(`❌ [Queue] Error publishing remote stop command:`, queueError.message);
          console.warn(`⚠️ [Queue] Falling back to direct call`);
          useQueueFlow = false; // Fall back to direct call
        }
      }

      // FALLBACK: Direct API call (legacy flow - will be removed after queue flow validated)
      if (!useQueueFlow) {
        console.log(`🔄 [FALLBACK] Using direct API call for remote stop (queue flow disabled or failed)`);
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
    
    // CRITICAL: Check if session was updated by MeterValues processor
    // If session already has energyConsumed and finalAmount, use those values (they're more accurate)
    if (session.energyConsumed > 0 && session.finalAmount > 0) {
      console.log(`[Stop Charging] Using session values from MeterValues processor: Energy=${session.energyConsumed} kWh, Cost=₹${session.finalAmount}`);
      energyConsumed = parseFloat(session.energyConsumed);
      finalAmount = parseFloat(session.finalAmount);
      calculatedAmount = finalAmount; // Use session finalAmount as calculated amount
      
      // Recalculate refund based on session values
      if (finalAmount < amountDeducted) {
        refundAmount = amountDeducted - finalAmount;
        console.log(`[Stop Charging] Refund based on session values: ₹${refundAmount.toFixed(2)} (Used: ₹${finalAmount.toFixed(2)}, Deducted: ₹${amountDeducted.toFixed(2)})`);
      } else {
        console.log(`[Stop Charging] No refund (Used all prepaid amount: ₹${finalAmount.toFixed(2)} = ₹${amountDeducted.toFixed(2)})`);
      }
    }
    // If we have valid energy consumption data from meter readings
    else if (energyConsumed > 0 && calculatedAmount > 0) {
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

    // Determine stop reason based on whether amount was fully consumed
    // If refundAmount is 0 and finalAmount equals amountDeducted, charging completed naturally
    let determinedStopReason = 'Remote'; // Default: User stopped before amount exhausted
    if (refundAmount === 0 && finalAmount > 0 && Math.abs(finalAmount - amountDeducted) < 0.15) {
      // Amount fully consumed (no refund, finalAmount equals amountDeducted) - Charging completed
      determinedStopReason = 'ChargingCompleted';
    } else if (refundAmount > 0) {
      // Partial consumption - user stopped before amount was exhausted
      determinedStopReason = 'Remote';
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
      stopReason: determinedStopReason
    });
    
    // Reload session to ensure we have the latest data
    await session.reload();
    
    console.log(`[Stop Charging] Session ${session.sessionId} updated to 'stopped' status with endTime: ${session.endTime}`);

    // Update Redis status to "Available" when charging stops
    // This ensures the UI updates immediately in the CMS
    try {
      const updater = require('../libs/redis/updater');
      await updater(deviceId, { status: 'Available' });
      console.log(`✅ [Stop Charging] Updated Redis status to Available for ${deviceId}`);
      
      // Invalidate cache for charging points list to ensure UI updates immediately
      const cacheController = require('../libs/redis/cacheController');
      const redisClient = require('../libs/redis/redisClient');
      
      // Delete all charging-points cache keys (pattern: charging-points:list:*)
      // This includes both old page-based keys and new global keys
      try {
        const keys = await redisClient.keys('charging-points:list:*');
        if (keys && keys.length > 0) {
          await Promise.all(keys.map(key => cacheController.del(key)));
          console.log(`✅ [Stop Charging] Invalidated ${keys.length} charging-points cache keys`);
        }
      } catch (cacheErr) {
        console.error(`❌ [Cache] Error invalidating cache:`, cacheErr.message);
      }
    } catch (redisErr) {
      console.error(`❌ [Redis] Error updating status when stopping charging for ${deviceId}:`, redisErr.message);
    }

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

    // Publish charging stopped event to RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ && publishChargingEvent && publishNotification) {
      try {
        // Publish charging event
        await publishChargingEvent({
          type: 'charging.stopped',
          sessionId: session.sessionId,
          customerId: customer.id,
          deviceId: session.deviceId,
          connectorId: session.connectorId,
          additionalData: {
            energyConsumed: energyConsumed,
            finalAmount: finalAmount,
            refundAmount: refundAmount,
            amountDeducted: parseFloat(session.amountDeducted),
            startTime: session.startTime,
            endTime: session.endTime,
            stopReason: determinedStopReason
          }
        });

        // Publish notification for real-time frontend update
        // Note: suppressToast is set to true because the API response already shows a success message
        // The frontend should use this notification for UI updates but not show a duplicate toast
        await publishNotification({
          type: 'charging.stopped',
          data: {
            sessionId: session.sessionId,
            customerId: customer.id,
            deviceId: session.deviceId,
            connectorId: session.connectorId,
            energyConsumed: energyConsumed,
            finalAmount: finalAmount,
            refundAmount: refundAmount,
            endTime: session.endTime,
            suppressToast: true // Prevent duplicate toast - API response already shows success message
          },
          recipients: [customer.id]
        });

        console.log(`📤 [RABBITMQ] Published charging.stopped event for session ${session.sessionId}`);
        console.log(`📤 [RABBITMQ] Published charging.stopped notification with recipients: [${customer.id}]`);
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish charging.stopped event:', rabbitmqError.message);
        console.error('⚠️ [RABBITMQ] Error details:', rabbitmqError);
        // Don't fail the request if RabbitMQ fails
      }
    } else {
      console.log(`🔍 [DEBUG] Skipping RabbitMQ publish - ENABLE_RABBITMQ: ${ENABLE_RABBITMQ}, publishChargingEvent: ${!!publishChargingEvent}, publishNotification: ${!!publishNotification}`);
    }

    // Return response with stopSuccess status
    // In queue flow, stopSuccess is true if command was published successfully
    // The actual charger response will come asynchronously via queue
    const message = stopSuccess 
      ? 'Charging stopped successfully' 
      : 'Session finalized, but charger remote-stop may have failed. Please verify charger status.';
    
    res.json({
      success: true,
      message: message,
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
router.get('/charging/active-session', authenticateCustomerToken, chargingController.getActiveSession);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: errors.array()[0].msg
    });
  }
  next();
}, chargingController.getSessions);

/**
 * GET /api/user/sessions/:sessionId
 * Get single session details
 */
router.get('/sessions/:sessionId', authenticateCustomerToken, chargingController.getSessionById);

/**
 * GET /api/user/sessions/:sessionId/invoice/pdf
 * Download invoice PDF for a completed charging session (customer access)
 * Query param ?preview=1 opens PDF inline in browser, otherwise downloads as attachment
 */
router.get('/sessions/:sessionId/invoice/pdf', authenticateCustomerToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const customerId = req.customer.id;
    
    // Verify session belongs to this customer
    const session = await ChargingSession.findOne({
      where: {
        sessionId: sessionId,
        customerId: customerId
      }
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or access denied'
      });
    }
    
    // Check if session is completed (has endTime) - allow both 'completed' and 'stopped' statuses
    if (!session.endTime) {
      return res.status(400).json({
        success: false,
        error: 'Invoice can only be generated for completed sessions'
      });
    }
    
    // Also check if status is valid for invoice generation
    if (!['completed', 'stopped'].includes(session.status)) {
      return res.status(400).json({
        success: false,
        error: 'Invoice can only be generated for completed sessions'
      });
    }
    
    // Use the same invoice generation logic
    await chargingController.downloadInvoicePDF(req, res);
  } catch (error) {
    console.error('Error generating customer invoice PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice',
      message: error.message
    });
  }
});

module.exports = router;

// Export webhook handler for use in server.js
// Note: Webhook handler needs special raw body handling, so we keep it here
module.exports.handlePaymentWebhook = async function(req, res) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing signature header'
      });
    }

    // Get webhook secret from environment
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({
        success: false,
        error: 'Webhook secret not configured'
      });
    }

    // Get raw body - express.raw() middleware provides Buffer
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body format'
      });
    }

    const rawBody = req.body.toString('utf8');
    
    // Verify webhook signature
    const { verifyWebhookSignature } = require('../libs/razorpay');
    const isValidSignature = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }

    // Parse webhook payload
    let webhookPayload;
    try {
      webhookPayload = JSON.parse(rawBody);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON payload'
      });
    }

    // Only process payment.captured events
    if (webhookPayload.event !== 'payment.captured') {
      return res.status(200).json({
        success: true,
        message: 'Event ignored (not payment.captured)'
      });
    }

    // Call payment service
    const result = await paymentService.handlePaymentWebhook(webhookPayload, signature);
    res.status(200).json(result);
  } catch (error) {
    console.error('[Payment Webhook] Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process webhook'
    });
  }
};

