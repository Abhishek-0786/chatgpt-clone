const express = require('express');
const { body, validationResult, query, param } = require('express-validator');
const { Tariff, Station, ChargingPoint, Connector, Customer, Vehicle, WalletTransaction, Wallet } = require('../models');
const { Op } = require('sequelize');
const ChargerData = require('../models/ChargerData');
const ChargingSession = require('../models/ChargingSession');
const Charger = require('../models/Charger');
const sequelize = require('../config/database');
const axios = require('axios');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishCMSEvent = null;
let publishChargingCommand = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../services/rabbitmq/producer');
    publishCMSEvent = producer.publishCMSEvent;
    publishChargingCommand = producer.publishChargingCommand;
    console.log('✅ [RABBITMQ] CMS routes configured to use RabbitMQ for event publishing');
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
} else {
  console.log('ℹ️ [LEGACY] CMS routes using direct processing (ENABLE_RABBITMQ=false)');
}

const router = express.Router();

// ============================================
// TARIFF MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/cms/tariffs
 * Get all tariffs with pagination and filters
 * Query params: page, limit, search, status
 */
router.get('/tariffs', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString(),
  query('status').optional().isIn(['Active', 'Inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status;

    // Build where clause
    const where = {
      deleted: false // Only show non-deleted tariffs
    };

    // Add search filter
    if (search) {
      where[Op.or] = [
        { tariffId: { [Op.iLike]: `%${search}%` } },
        { tariffName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Add status filter
    if (status) {
      where.status = status;
    }

    // Get tariffs with pagination
    const { count, rows: tariffs } = await Tariff.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      tariffs: tariffs.map(tariff => ({
        id: tariff.id,
        tariffId: tariff.tariffId,
        tariffName: tariff.tariffName,
        currency: tariff.currency,
        baseCharges: parseFloat(tariff.baseCharges),
        tax: parseFloat(tariff.tax),
        status: tariff.status,
        createdBy: tariff.createdBy,
        createdAt: tariff.createdAt
      })),
      total: count,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching tariffs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tariffs',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/tariffs/dropdown
 * Get all active tariffs for dropdown (no pagination)
 */
router.get('/tariffs/dropdown', async (req, res) => {
  try {
    const tariffs = await Tariff.findAll({
      where: {
        deleted: false,
        status: 'Active'
      },
      attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax'],
      order: [['tariffName', 'ASC']]
    });

    res.json({
      success: true,
      tariffs: tariffs.map(tariff => ({
        id: tariff.id,
        tariffId: tariff.tariffId,
        tariffName: tariff.tariffName,
        baseCharges: parseFloat(tariff.baseCharges),
        tax: parseFloat(tariff.tax)
      }))
    });
  } catch (error) {
    console.error('Error fetching tariffs for dropdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tariffs',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/tariffs/:tariffId
 * Get single tariff by tariffId
 */
router.get('/tariffs/:tariffId', async (req, res) => {
  try {
    const { tariffId } = req.params;

    const tariff = await Tariff.findOne({
      where: {
        tariffId,
        deleted: false
      }
    });

    if (!tariff) {
      return res.status(404).json({
        success: false,
        error: 'Tariff not found'
      });
    }

    res.json({
      success: true,
      tariff: {
        id: tariff.id,
        tariffId: tariff.tariffId,
        tariffName: tariff.tariffName,
        currency: tariff.currency,
        baseCharges: parseFloat(tariff.baseCharges),
        tax: parseFloat(tariff.tax),
        status: tariff.status,
        createdBy: tariff.createdBy,
        createdAt: tariff.createdAt,
        updatedAt: tariff.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching tariff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tariff',
      message: error.message
    });
  }
});

/**
 * POST /api/cms/tariffs
 * Create new tariff
 */
router.post('/tariffs', [
  body('tariffName')
    .notEmpty()
    .withMessage('Tariff name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Tariff name must be between 1 and 255 characters'),
  body('currency')
    .notEmpty()
    .withMessage('Currency is required')
    .isIn(['INR', 'USD'])
    .withMessage('Currency must be INR or USD'),
  body('baseCharges')
    .notEmpty()
    .withMessage('Base charges is required')
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        throw new Error('Base charges must be a positive number');
      }
      return true;
    }),
  body('tax')
    .notEmpty()
    .withMessage('Tax is required')
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 100) {
        throw new Error('Tax must be between 0 and 100');
      }
      return true;
    }),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive'])
    .withMessage('Status must be Active or Inactive'),
  body('createdBy')
    .optional()
    .isString()
    .withMessage('Created by must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { tariffName, currency, baseCharges, tax, status, createdBy } = req.body;

    // Generate unique tariffId (only tariffId needs to be unique, not tariffName)
    let tariffId;
    let existingTariff;
    do {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      tariffId = `TAR-${timestamp}-${randomStr}`;
      existingTariff = await Tariff.findOne({ where: { tariffId } });
    } while (existingTariff); // Regenerate if exists (very unlikely, but just in case)

    // Create tariff
    const tariff = await Tariff.create({
      tariffId,
      tariffName,
      currency,
      baseCharges,
      tax,
      status: status || 'Active',
      createdBy: createdBy || null,
      deleted: false
    });

    // Publish CMS event to RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ && publishCMSEvent) {
      try {
        await publishCMSEvent({
          type: 'cms.tariff.created',
          data: {
            tariffId: tariff.tariffId,
            id: tariff.id,
            tariffName: tariff.tariffName,
            createdBy: createdBy
          }
        });
        console.log(`📤 [RABBITMQ] Published cms.tariff.created event for ${tariff.tariffId}`);
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish cms.tariff.created event:', rabbitmqError.message);
        // Don't fail the request if RabbitMQ fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Tariff created successfully',
      tariff: {
        id: tariff.id,
        tariffId: tariff.tariffId,
        tariffName: tariff.tariffName,
        currency: tariff.currency,
        baseCharges: parseFloat(tariff.baseCharges),
        tax: parseFloat(tariff.tax),
        status: tariff.status,
        createdBy: tariff.createdBy,
        createdAt: tariff.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating tariff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create tariff',
      message: error.message
    });
  }
});

/**
 * PUT /api/cms/tariffs/:tariffId
 * Update tariff
 */
router.put('/tariffs/:tariffId', [
  body('tariffName')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Tariff name must be between 1 and 255 characters'),
  body('currency')
    .optional()
    .isIn(['INR', 'USD'])
    .withMessage('Currency must be INR or USD'),
  body('baseCharges')
    .optional()
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        throw new Error('Base charges must be a positive number');
      }
      return true;
    }),
  body('tax')
    .optional()
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 100) {
        throw new Error('Tax must be between 0 and 100');
      }
      return true;
    }),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive'])
    .withMessage('Status must be Active or Inactive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { tariffId } = req.params;
    const updateData = req.body;

    // Find tariff
    const tariff = await Tariff.findOne({
      where: {
        tariffId,
        deleted: false
      }
    });

    if (!tariff) {
      return res.status(404).json({
        success: false,
        error: 'Tariff not found'
      });
    }

    // Update tariff (tariffName can be duplicate, only tariffId is unique)
    await tariff.update(updateData);

    // Reload to get updated data
    await tariff.reload();

    // Publish CMS event to RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ && publishCMSEvent) {
      try {
        await publishCMSEvent({
          type: 'cms.tariff.updated',
          data: {
            tariffId: tariff.tariffId,
            id: tariff.id,
            tariffName: tariff.tariffName
          }
        });
        console.log(`📤 [RABBITMQ] Published cms.tariff.updated event for ${tariff.tariffId}`);
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish cms.tariff.updated event:', rabbitmqError.message);
        // Don't fail the request if RabbitMQ fails
      }
    }

    res.json({
      success: true,
      message: 'Tariff updated successfully',
      tariff: {
        id: tariff.id,
        tariffId: tariff.tariffId,
        tariffName: tariff.tariffName,
        currency: tariff.currency,
        baseCharges: parseFloat(tariff.baseCharges),
        tax: parseFloat(tariff.tax),
        status: tariff.status,
        createdBy: tariff.createdBy,
        createdAt: tariff.createdAt,
        updatedAt: tariff.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating tariff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update tariff',
      message: error.message
    });
  }
});

/**
 * DELETE /api/cms/tariffs/:tariffId
 * Soft delete tariff (set deleted = true)
 */
router.delete('/tariffs/:tariffId', async (req, res) => {
  try {
    const { tariffId } = req.params;

    // Find tariff
    const tariff = await Tariff.findOne({
      where: {
        tariffId,
        deleted: false
      }
    });

    if (!tariff) {
      return res.status(404).json({
        success: false,
        error: 'Tariff not found'
      });
    }

    // Soft delete
    await tariff.update({ deleted: true });

    res.json({
      success: true,
      message: 'Tariff deleted successfully',
      tariffId: tariff.tariffId
    });
  } catch (error) {
    console.error('Error deleting tariff:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete tariff',
      message: error.message
    });
  }
});

// ============================================
// CHARGING STATIONS ROUTES
// ============================================

/**
 * GET /api/cms/stations
 * Get all stations with pagination and filters
 * Query params: page, limit, search, status, organization
 */
router.get('/stations', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString(),
  query('status').optional().isIn(['Active', 'Inactive', 'Maintenance']),
  query('organization').optional().isIn(['massive_mobility', '1c_ev_charging', 'genx'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status;
    const organization = req.query.organization;

    // Build where clause
    const where = {
      deleted: false // Only show non-deleted stations
    };

    // Add search filter
    if (search) {
      where[Op.or] = [
        { stationId: { [Op.iLike]: `%${search}%` } },
        { stationName: { [Op.iLike]: `%${search}%` } },
        { city: { [Op.iLike]: `%${search}%` } },
        { state: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Add status filter
    if (status) {
      where.status = status;
    }

    // Add organization filter
    if (organization) {
      where.organization = organization;
    }

    // Get total count
    const total = await Station.count({ where });

    // Get ALL stations (without pagination) so we can sort by status globally
    const allStations = await Station.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    const ChargingPoint = require('../models/ChargingPoint');

    // Calculate online/offline stats and session statistics for each station
    const stationsWithStats = await Promise.all(allStations.map(async (station) => {
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
          }
        ],
        attributes: ['id', 'deviceId']
      });

      const totalCPs = chargingPoints.length;
      let onlineCPs = 0;
      let offlineCPs = 0;
      let totalSessions = 0;
      let totalEnergy = 0;
      let totalBilledAmount = 0;

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

      return {
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: station.organization,
        status: stationStatus,
        city: station.city,
        state: station.state,
        country: station.country,
        chargers: totalCPs,
        sessions: totalSessions,
        billedAmount: parseFloat(totalBilledAmount.toFixed(2)),
        energy: parseFloat(totalEnergy.toFixed(2)),
        onlineCPsPercent: onlineCPsPercent,
        onlineCPs: onlineCPs,
        offlineCPsPercent: offlineCPsPercent,
        offlineCPs: offlineCPs,
        createdAt: station.createdAt,
        updatedAt: station.updatedAt
      };
    }));

    // Sort stations: Online first, then Offline, then by createdAt DESC
    stationsWithStats.sort((a, b) => {
      // First sort by status: Online comes before Offline
      if (a.status === 'Online' && b.status !== 'Online') return -1;
      if (a.status !== 'Online' && b.status === 'Online') return 1;
      // If same status, sort by createdAt DESC (newest first)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Apply pagination AFTER sorting
    const paginatedStations = stationsWithStats.slice(offset, offset + limit);

    res.json({
      success: true,
      stations: paginatedStations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stations',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/stations/dropdown
 * Get all active stations for dropdown (no pagination)
 */
router.get('/stations/dropdown', async (req, res) => {
  try {
    const stations = await Station.findAll({
      where: {
        deleted: false,
        status: 'Active' // Only show active stations in dropdown
      },
      attributes: ['id', 'stationId', 'stationName', 'organization'],
      order: [['stationName', 'ASC']]
    });

    res.json({
      success: true,
      stations: stations.map(station => ({
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: station.organization
      }))
    });
  } catch (error) {
    console.error('Error fetching stations for dropdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stations',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/stations/:stationId
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

    // Calculate real-time status based on charging points
    const ChargingPoint = require('../models/ChargingPoint');
    
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

    res.json({
      success: true,
      station: {
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: station.organization,
        status: stationStatus, // Use calculated real-time status
        powerCapacity: station.powerCapacity ? parseFloat(station.powerCapacity) : null,
        gridPhase: station.gridPhase,
        pinCode: station.pinCode,
        city: station.city,
        state: station.state,
        country: station.country,
        latitude: station.latitude ? parseFloat(station.latitude) : null,
        longitude: station.longitude ? parseFloat(station.longitude) : null,
        fullAddress: station.fullAddress,
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
        amenities: station.amenities || [],
        createdBy: station.createdBy,
        createdAt: station.createdAt,
        updatedAt: station.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch station',
      message: error.message
    });
  }
});

/**
 * POST /api/cms/stations
 * Create new station
 */
router.post('/stations', [
  body('stationName')
    .notEmpty()
    .withMessage('Station name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Station name must be between 1 and 255 characters'),
  body('organization')
    .notEmpty()
    .withMessage('Organization is required')
    .isIn(['massive_mobility', '1c_ev_charging', 'genx'])
    .withMessage('Organization must be massive_mobility, 1c_ev_charging, or genx'),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive', 'Maintenance'])
    .withMessage('Status must be Active, Inactive, or Maintenance'),
  body('gridPhase')
    .notEmpty()
    .withMessage('Grid phase is required')
    .isIn(['Single Phase', 'Three Phase'])
    .withMessage('Grid phase must be Single Phase or Three Phase'),
  body('country')
    .notEmpty()
    .withMessage('Country is required')
    .isString()
    .withMessage('Country must be a string'),
  body('powerCapacity')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) {
          throw new Error('Power capacity must be a positive number');
        }
      }
      return true;
    }),
  body('latitude')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num) || num < -90 || num > 90) {
          throw new Error('Latitude must be between -90 and 90');
        }
      }
      return true;
    }),
  body('longitude')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num) || num < -180 || num > 180) {
          throw new Error('Longitude must be between -180 and 180');
        }
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      stationName,
      organization,
      status,
      powerCapacity,
      gridPhase,
      pinCode,
      city,
      state,
      country,
      latitude,
      longitude,
      fullAddress,
      openingTime,
      closingTime,
      open24Hours,
      workingDays,
      allDays,
      contactNumber,
      inchargeName,
      ownerName,
      ownerContact,
      sessionStartStopSMS,
      amenities,
      createdBy
    } = req.body;

    // Generate unique stationId
    let stationId;
    let existingStation;
    do {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      stationId = `STN-${timestamp}-${randomStr}`;
      existingStation = await Station.findOne({ where: { stationId } });
    } while (existingStation);

    // Create station
    const station = await Station.create({
      stationId,
      stationName,
      organization,
      status: status || 'Active',
      powerCapacity: powerCapacity ? parseFloat(powerCapacity) : null,
      gridPhase,
      pinCode: pinCode || null,
      city: city || null,
      state: state || null,
      country,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      fullAddress: fullAddress || null,
      openingTime: openingTime || null,
      closingTime: closingTime || null,
      open24Hours: open24Hours || false,
      workingDays: Array.isArray(workingDays) ? workingDays : [],
      allDays: allDays || false,
      contactNumber: contactNumber || null,
      inchargeName: inchargeName || null,
      ownerName: ownerName || null,
      ownerContact: ownerContact || null,
      sessionStartStopSMS: sessionStartStopSMS || false,
      amenities: Array.isArray(amenities) ? amenities : [],
      createdBy: createdBy || null,
      deleted: false
    });

    // Publish CMS event to RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ && publishCMSEvent) {
      try {
        await publishCMSEvent({
          type: 'cms.station.created',
          data: {
            stationId: station.stationId,
            id: station.id,
            stationName: station.stationName,
            organization: station.organization,
            createdBy: createdBy
          }
        });
        console.log(`📤 [RABBITMQ] Published cms.station.created event for ${station.stationId}`);
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish cms.station.created event:', rabbitmqError.message);
        // Don't fail the request if RabbitMQ fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Station created successfully',
      station: {
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: station.organization,
        status: station.status,
        createdAt: station.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create station',
      message: error.message
    });
  }
});

/**
 * PUT /api/cms/stations/:stationId
 * Update station
 */
router.put('/stations/:stationId', [
  body('stationName')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Station name must be between 1 and 255 characters'),
  body('organization')
    .optional()
    .isIn(['massive_mobility', '1c_ev_charging', 'genx'])
    .withMessage('Organization must be massive_mobility, 1c_ev_charging, or genx'),
  body('status')
    .optional()
    .isIn(['Active', 'Inactive', 'Maintenance'])
    .withMessage('Status must be Active, Inactive, or Maintenance'),
  body('gridPhase')
    .optional()
    .isIn(['Single Phase', 'Three Phase'])
    .withMessage('Grid phase must be Single Phase or Three Phase'),
  body('powerCapacity')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) {
          throw new Error('Power capacity must be a positive number');
        }
      }
      return true;
    }),
  body('latitude')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num) || num < -90 || num > 90) {
          throw new Error('Latitude must be between -90 and 90');
        }
      }
      return true;
    }),
  body('longitude')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num) || num < -180 || num > 180) {
          throw new Error('Longitude must be between -180 and 180');
        }
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { stationId } = req.params;
    const updateData = req.body;

    // Find station
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

    // Prepare update data
    const dataToUpdate = {};
    if (updateData.stationName !== undefined) dataToUpdate.stationName = updateData.stationName;
    if (updateData.organization !== undefined) dataToUpdate.organization = updateData.organization;
    if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
    if (updateData.powerCapacity !== undefined) dataToUpdate.powerCapacity = updateData.powerCapacity ? parseFloat(updateData.powerCapacity) : null;
    if (updateData.gridPhase !== undefined) dataToUpdate.gridPhase = updateData.gridPhase;
    if (updateData.pinCode !== undefined) dataToUpdate.pinCode = updateData.pinCode || null;
    if (updateData.city !== undefined) dataToUpdate.city = updateData.city || null;
    if (updateData.state !== undefined) dataToUpdate.state = updateData.state || null;
    if (updateData.country !== undefined) dataToUpdate.country = updateData.country;
    if (updateData.latitude !== undefined) dataToUpdate.latitude = updateData.latitude ? parseFloat(updateData.latitude) : null;
    if (updateData.longitude !== undefined) dataToUpdate.longitude = updateData.longitude ? parseFloat(updateData.longitude) : null;
    if (updateData.fullAddress !== undefined) dataToUpdate.fullAddress = updateData.fullAddress || null;
    if (updateData.openingTime !== undefined) dataToUpdate.openingTime = updateData.openingTime || null;
    if (updateData.closingTime !== undefined) dataToUpdate.closingTime = updateData.closingTime || null;
    if (updateData.open24Hours !== undefined) dataToUpdate.open24Hours = updateData.open24Hours;
    if (updateData.workingDays !== undefined) dataToUpdate.workingDays = Array.isArray(updateData.workingDays) ? updateData.workingDays : [];
    if (updateData.allDays !== undefined) dataToUpdate.allDays = updateData.allDays;
    if (updateData.contactNumber !== undefined) dataToUpdate.contactNumber = updateData.contactNumber || null;
    if (updateData.inchargeName !== undefined) dataToUpdate.inchargeName = updateData.inchargeName || null;
    if (updateData.ownerName !== undefined) dataToUpdate.ownerName = updateData.ownerName || null;
    if (updateData.ownerContact !== undefined) dataToUpdate.ownerContact = updateData.ownerContact || null;
    if (updateData.sessionStartStopSMS !== undefined) dataToUpdate.sessionStartStopSMS = updateData.sessionStartStopSMS;
    if (updateData.amenities !== undefined) dataToUpdate.amenities = Array.isArray(updateData.amenities) ? updateData.amenities : [];

    // Update station
    await station.update(dataToUpdate);

    // Reload to get updated data
    await station.reload();

    // Publish CMS event to RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ && publishCMSEvent) {
      try {
        await publishCMSEvent({
          type: 'cms.station.updated',
          data: {
            stationId: station.stationId,
            id: station.id,
            stationName: station.stationName
          }
        });
        console.log(`📤 [RABBITMQ] Published cms.station.updated event for ${station.stationId}`);
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish cms.station.updated event:', rabbitmqError.message);
        // Don't fail the request if RabbitMQ fails
      }
    }

    res.json({
      success: true,
      message: 'Station updated successfully',
      station: {
        id: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        organization: station.organization,
        status: station.status,
        createdAt: station.createdAt,
        updatedAt: station.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update station',
      message: error.message
    });
  }
});

/**
 * DELETE /api/cms/stations/:stationId
 * Soft delete station (set deleted = true)
 */
router.delete('/stations/:stationId', async (req, res) => {
  try {
    const { stationId } = req.params;

    // Find station
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

    // Soft delete
    await station.update({ deleted: true });

    res.json({
      success: true,
      message: 'Station deleted successfully',
      stationId: station.stationId
    });
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete station',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/stations/:stationId/points
 * Get charging points for a station
 */
router.get('/stations/:stationId/points', async (req, res) => {
  try {
    const { stationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

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

    // Get charging points for this station
    // Use distinct: true to ensure count is correct when there are multiple connectors per charging point
    const { count, rows: chargingPoints } = await ChargingPoint.findAndCountAll({
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
      distinct: true, // Count distinct charging points, not joined rows
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

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

      // Calculate C.STATUS (Connector Status) - use same helper functions as main charging points endpoint
      const ChargerData = require('../models/ChargerData');
      let cStatus = 'Unavailable'; // Default
      
      if (realTimeStatus === 'Offline') {
        cStatus = 'Unavailable';
      } else {
        // Helper function to check if charging point has active transaction (same as main endpoint)
        async function hasActiveTransaction(deviceId) {
          try {
            if (!deviceId) {
              return false;
            }

            // First, check for active ChargingSession records (most reliable)
            const ChargingSession = require('../models/ChargingSession');
            const activeSession = await ChargingSession.findOne({
              where: {
                deviceId: deviceId,
                status: ['pending', 'active'],
                endTime: null
              },
              order: [['createdAt', 'DESC']]
            });

            if (activeSession) {
              return true;
            }

            // Get all recent logs for this device (more comprehensive check)
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

        // Check for recent RemoteStopTransaction accepted response (within last 2 minutes)
        // If remote stop was accepted, charging should be considered stopped even if StopTransaction hasn't arrived
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        // First, find all RemoteStopTransaction commands (outgoing) within last 2 minutes
        const remoteStopCommands = allLogs.filter(log => {
          if (log.message !== 'RemoteStopTransaction' || log.direction !== 'Outgoing') {
            return false;
          }
          const logTime = new Date(log.timestamp || log.createdAt).getTime();
          return logTime >= twoMinutesAgo.getTime();
        });
        
        // Then find their corresponding accepted responses
        const remoteStopResponses = [];
        for (const command of remoteStopCommands) {
          const response = allLogs.find(log => 
            log.message === 'Response' && 
            log.direction === 'Incoming' &&
            log.messageId === command.messageId
          );
          
          if (response) {
            // Check if response status is "Accepted"
            let status = null;
            if (response.messageData && response.messageData.status) {
              status = response.messageData.status;
            } else if (response.raw && Array.isArray(response.raw) && response.raw[2] && response.raw[2].status) {
              status = response.raw[2].status;
            }
            if (status === 'Accepted') {
              remoteStopResponses.push(response);
            }
          }
        }

        if (remoteStopResponses.length > 0) {
          // Remote stop was accepted recently - check if there's a StatusNotification confirming it
          const latestRemoteStop = remoteStopResponses[0];
          const remoteStopTime = new Date(latestRemoteStop.timestamp || latestRemoteStop.createdAt).getTime();
          
          // Check for StatusNotification with "Available" or "Finishing" after remote stop
          const statusAfterStop = allLogs.find(log => {
            if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
              return false;
            }
            const logTime = new Date(log.timestamp || log.createdAt).getTime();
            if (logTime < remoteStopTime) {
              return false;
            }
            let status = null;
            if (log.messageData && log.messageData.status) {
              status = log.messageData.status;
            } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
              status = log.raw[2].status;
            }
            return status === 'Available' || status === 'Finishing';
          });

          if (statusAfterStop) {
            // Remote stop was accepted and StatusNotification confirms it - charging is stopped
            console.log(`✅ [hasActiveTransaction] Remote stop accepted and StatusNotification confirms charging stopped for ${deviceId}`);
            return false;
          }
          
          // Even without StatusNotification, if RemoteStopTransaction was accepted recently, consider charging stopped
          // The charger has accepted the stop command, so charging should be stopping
          const responseTime = new Date(latestRemoteStop.timestamp || latestRemoteStop.createdAt).getTime();
          const timeSinceStop = Date.now() - responseTime;
          if (timeSinceStop < 30 * 1000) { // Within last 30 seconds
            console.log(`✅ [hasActiveTransaction] Remote stop accepted recently (${Math.round(timeSinceStop/1000)}s ago) for ${deviceId} - considering charging stopped`);
            return false;
          }
        }

        // Check for recent StatusNotification with "Charging" status (within last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const chargingStatusNotifications = allLogs.filter(log => {
          if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
            return false;
          }
          const logTime = new Date(log.timestamp || log.createdAt).getTime();
          if (logTime < fiveMinutesAgo.getTime()) {
            return false;
          }
          // Check if status is "Charging"
          let status = null;
          if (log.messageData && log.messageData.status) {
            status = log.messageData.status;
          } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
            status = log.raw[2].status;
          }
          return status === 'Charging';
        });

        if (chargingStatusNotifications.length > 0) {
          // Check if there's a more recent StatusNotification with "Available" or "Finishing"
          const latestStatus = chargingStatusNotifications[0];
          const latestStatusTime = new Date(latestStatus.timestamp || latestStatus.createdAt).getTime();
          
          const laterStatusNotifications = allLogs.filter(log => {
            if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
              return false;
            }
            const logTime = new Date(log.timestamp || log.createdAt).getTime();
            return logTime > latestStatusTime;
          });

          // If there's a later StatusNotification, check if it's "Available" or "Finishing"
          if (laterStatusNotifications.length > 0) {
            const laterStatus = laterStatusNotifications[0];
            let status = null;
            if (laterStatus.messageData && laterStatus.messageData.status) {
              status = laterStatus.messageData.status;
            } else if (laterStatus.raw && Array.isArray(laterStatus.raw) && laterStatus.raw[2] && laterStatus.raw[2].status) {
              status = laterStatus.raw[2].status;
            }
            // If later status is "Available" or "Finishing", charging has stopped
            if (status === 'Available' || status === 'Finishing') {
              console.log(`✅ [hasActiveTransaction] StatusNotification shows charging stopped (${status}) for ${deviceId}`);
              return false;
            } else {
              // Later status is still "Charging" or other, so charging is active
              return true;
            }
          } else {
            // No later status notification, so charging is likely still active
            return true;
          }
            }

            // Find all StartTransaction messages (incoming from charger)
            const startTransactions = allLogs.filter(log => 
              log.message === 'StartTransaction' && log.direction === 'Incoming'
            );

            if (startTransactions.length === 0) {
              return false;
            }

            // Get the latest StartTransaction (by timestamp first, then by id)
            const latestStart = startTransactions.reduce((latest, current) => {
              const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
              const currentTime = new Date(current.timestamp || current.createdAt).getTime();
              if (currentTime > latestTime) return current;
              if (currentTime < latestTime) return latest;
              // If same time, use ID
              const latestId = latest.id || 0;
              const currentId = current.id || 0;
              return currentId > latestId ? current : latest;
            });

            // Check if StartTransaction is recent (within last 2 hours)
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
            if (startTime < twoHoursAgo.getTime()) {
              return false; // Transaction is too old, consider it inactive
            }

            // Find the response to this StartTransaction (outgoing from server, same messageId)
            const startResponse = allLogs.find(log => 
              log.message === 'Response' && 
              log.messageId === latestStart.messageId &&
              log.direction === 'Outgoing'
            );

            // Get transactionId - first try from response, then from StartTransaction itself
            let transactionId = null;
            if (startResponse) {
              if (startResponse.messageData && startResponse.messageData.transactionId) {
                transactionId = startResponse.messageData.transactionId;
              } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
                transactionId = startResponse.raw[2].transactionId;
              }
            }

            // If not found in response, try to get from StartTransaction message itself
            if (!transactionId && latestStart.messageData && latestStart.messageData.transactionId) {
              transactionId = latestStart.messageData.transactionId;
            } else if (!transactionId && latestStart.raw && Array.isArray(latestStart.raw)) {
              // Try to extract from raw OCPP message
              const payload = latestStart.raw[2];
              if (payload && payload.transactionId) {
                transactionId = payload.transactionId;
              }
            }

            if (!transactionId) {
              return false;
            }

            // Check for StopTransaction with same transactionId in all logs
            const stopTransaction = allLogs.find(log => 
              log.message === 'StopTransaction' && 
              log.direction === 'Incoming' &&
              (
                (log.messageData && log.messageData.transactionId === transactionId) || 
                (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
              )
            );

            // If no StopTransaction found, transaction is active
            if (!stopTransaction) {
              return true;
            }

            return false;
          } catch (error) {
            console.error('Error checking active transaction for deviceId:', deviceId, error);
            return false;
          }
        }

        // Helper function to check if charging point has fault (same as main endpoint)
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
            console.error('Error checking fault for deviceId:', deviceId, error);
            return false;
          }
        }

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

      return {
        id: point.id,
        chargingPointId: point.chargingPointId,
        chargingPoint: point.deviceName,
        deviceId: point.deviceId,
        status: realTimeStatus,
        cStatus: cStatus,
        chargerType: point.chargerType,
        connectors: connectors.length,
        maxPower: maxPower,
        sessions: sessionStats.sessions,
        billedAmount: sessionStats.billedAmount,
        energy: sessionStats.energy,
        createdAt: point.createdAt
      };
    }));

    res.json({
      success: true,
      points: formattedPoints,
      total: count,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching station charging points:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch station charging points',
      message: error.message
    });
  }
});

// ============================================
// CHARGING POINT MANAGEMENT ROUTES
// ============================================

/**
 * GET /api/cms/charging-points
 * Get all charging points with pagination and filters
 * Query params: page, limit, search, status, stationId
 */
router.get('/charging-points', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString(),
  query('status').optional().isIn(['Online', 'Offline', 'Faulted']),
  query('stationId').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status;
    const stationId = req.query.stationId ? parseInt(req.query.stationId) : null;

    // Build where clause
    const where = {
      deleted: false // Only show non-deleted charging points
    };

    // Add search filter
    if (search) {
      where[Op.or] = [
        { chargingPointId: { [Op.iLike]: `%${search}%` } },
        { deviceId: { [Op.iLike]: `%${search}%` } },
        { deviceName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Add status filter
    if (status) {
      where.status = status;
    }

    // Add station filter
    if (stationId) {
      where.stationId = stationId;
    }

    // Get charging points with pagination and includes
    // Use distinct: true to ensure count is correct when there are multiple connectors per charging point
    const { count, rows: chargingPoints } = await ChargingPoint.findAndCountAll({
      where,
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
          attributes: ['id', 'connectorId', 'connectorType', 'power']
        }
      ],
      distinct: true, // Count distinct charging points, not joined rows
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);
    const ChargerData = require('../models/ChargerData');

    // Helper function to check if charging point has active transaction
    async function hasActiveTransaction(deviceId) {
      try {
        if (!deviceId) {
          return false;
        }

        // First, check for active ChargingSession records (most reliable)
        const ChargingSession = require('../models/ChargingSession');
        const activeSession = await ChargingSession.findOne({
          where: {
            deviceId: deviceId,
            status: ['pending', 'active'],
            endTime: null
          },
          order: [['createdAt', 'DESC']]
        });

        if (activeSession) {
          return true;
        }

        // Get all recent logs for this device (more comprehensive check)
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

        // Check for recent RemoteStopTransaction accepted response (within last 2 minutes)
        // If remote stop was accepted, charging should be considered stopped even if StopTransaction hasn't arrived
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        // First, find all RemoteStopTransaction commands (outgoing) within last 2 minutes
        const remoteStopCommands = allLogs.filter(log => {
          if (log.message !== 'RemoteStopTransaction' || log.direction !== 'Outgoing') {
            return false;
          }
          const logTime = new Date(log.timestamp || log.createdAt).getTime();
          return logTime >= twoMinutesAgo.getTime();
        });
        
        // Then find their corresponding accepted responses
        const remoteStopResponses = [];
        for (const command of remoteStopCommands) {
          const response = allLogs.find(log => 
            log.message === 'Response' && 
            log.direction === 'Incoming' &&
            log.messageId === command.messageId
          );
          
          if (response) {
            // Check if response status is "Accepted"
            let status = null;
            if (response.messageData && response.messageData.status) {
              status = response.messageData.status;
            } else if (response.raw && Array.isArray(response.raw) && response.raw[2] && response.raw[2].status) {
              status = response.raw[2].status;
            }
            if (status === 'Accepted') {
              remoteStopResponses.push(response);
            }
          }
        }

        if (remoteStopResponses.length > 0) {
          // Remote stop was accepted recently - check if there's a StatusNotification confirming it
          const latestRemoteStop = remoteStopResponses[0];
          const remoteStopTime = new Date(latestRemoteStop.timestamp || latestRemoteStop.createdAt).getTime();
          
          // Check for StatusNotification with "Available" or "Finishing" after remote stop
          const statusAfterStop = allLogs.find(log => {
            if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
              return false;
            }
            const logTime = new Date(log.timestamp || log.createdAt).getTime();
            if (logTime < remoteStopTime) {
              return false;
            }
            let status = null;
            if (log.messageData && log.messageData.status) {
              status = log.messageData.status;
            } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
              status = log.raw[2].status;
            }
            return status === 'Available' || status === 'Finishing';
          });

          if (statusAfterStop) {
            // Remote stop was accepted and StatusNotification confirms it - charging is stopped
            console.log(`✅ [hasActiveTransaction] Remote stop accepted and StatusNotification confirms charging stopped for ${deviceId}`);
            return false;
          }
          
          // Even without StatusNotification, if RemoteStopTransaction was accepted recently, consider charging stopped
          // The charger has accepted the stop command, so charging should be stopping
          const responseTime = new Date(latestRemoteStop.timestamp || latestRemoteStop.createdAt).getTime();
          const timeSinceStop = Date.now() - responseTime;
          if (timeSinceStop < 30 * 1000) { // Within last 30 seconds
            console.log(`✅ [hasActiveTransaction] Remote stop accepted recently (${Math.round(timeSinceStop/1000)}s ago) for ${deviceId} - considering charging stopped`);
            return false;
          }
        }

        // Check for recent StatusNotification with "Charging" status (within last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const chargingStatusNotifications = allLogs.filter(log => {
          if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
            return false;
          }
          const logTime = new Date(log.timestamp || log.createdAt).getTime();
          if (logTime < fiveMinutesAgo.getTime()) {
            return false;
          }
          // Check if status is "Charging"
          let status = null;
          if (log.messageData && log.messageData.status) {
            status = log.messageData.status;
          } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
            status = log.raw[2].status;
          }
          return status === 'Charging';
        });

        if (chargingStatusNotifications.length > 0) {
          // Check if there's a more recent StatusNotification with "Available" or "Finishing"
          const latestStatus = chargingStatusNotifications[0];
          const latestStatusTime = new Date(latestStatus.timestamp || latestStatus.createdAt).getTime();
          
          const laterStatusNotifications = allLogs.filter(log => {
            if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
              return false;
            }
            const logTime = new Date(log.timestamp || log.createdAt).getTime();
            return logTime > latestStatusTime;
          });

          // If there's a later StatusNotification, check if it's "Available" or "Finishing"
          if (laterStatusNotifications.length > 0) {
            const laterStatus = laterStatusNotifications[0];
            let status = null;
            if (laterStatus.messageData && laterStatus.messageData.status) {
              status = laterStatus.messageData.status;
            } else if (laterStatus.raw && Array.isArray(laterStatus.raw) && laterStatus.raw[2] && laterStatus.raw[2].status) {
              status = laterStatus.raw[2].status;
            }
            // If later status is "Available" or "Finishing", charging has stopped
            if (status === 'Available' || status === 'Finishing') {
              console.log(`✅ [hasActiveTransaction] StatusNotification shows charging stopped (${status}) for ${deviceId}`);
              return false;
            } else {
              // Later status is still "Charging" or other, so charging is active
              return true;
            }
          } else {
            // No later status notification, so charging is likely still active
            return true;
          }
        }

        // Find all StartTransaction messages (incoming from charger)
        const startTransactions = allLogs.filter(log => 
          log.message === 'StartTransaction' && log.direction === 'Incoming'
        );

        if (startTransactions.length === 0) {
          return false;
        }

        // Get the latest StartTransaction (by timestamp first, then by id)
        const latestStart = startTransactions.reduce((latest, current) => {
          const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
          const currentTime = new Date(current.timestamp || current.createdAt).getTime();
          if (currentTime > latestTime) return current;
          if (currentTime < latestTime) return latest;
          // If same time, use ID
          const latestId = latest.id || 0;
          const currentId = current.id || 0;
          return currentId > latestId ? current : latest;
        });

        // Check if StartTransaction is recent (within last 2 hours)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
        if (startTime < twoHoursAgo.getTime()) {
          return false; // Transaction is too old, consider it inactive
        }

        // Find the response to this StartTransaction (outgoing from server, same messageId)
        const startResponse = allLogs.find(log => 
          log.message === 'Response' && 
          log.messageId === latestStart.messageId &&
          log.direction === 'Outgoing'
        );

        // Get transactionId - first try from response, then from StartTransaction itself
        let transactionId = null;
        if (startResponse) {
          if (startResponse.messageData && startResponse.messageData.transactionId) {
            transactionId = startResponse.messageData.transactionId;
          } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
            transactionId = startResponse.raw[2].transactionId;
          }
        }

        // If not found in response, try to get from StartTransaction message itself
        if (!transactionId && latestStart.messageData && latestStart.messageData.transactionId) {
          transactionId = latestStart.messageData.transactionId;
        } else if (!transactionId && latestStart.raw && Array.isArray(latestStart.raw)) {
          // Try to extract from raw OCPP message
          const payload = latestStart.raw[2];
          if (payload && payload.transactionId) {
            transactionId = payload.transactionId;
          }
        }

        if (!transactionId) {
          return false;
        }

        // Check for StopTransaction with same transactionId in all logs
        const stopTransaction = allLogs.find(log => 
          log.message === 'StopTransaction' && 
          log.direction === 'Incoming' &&
          (
            (log.messageData && log.messageData.transactionId === transactionId) || 
            (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
          )
        );

        // If no StopTransaction found, transaction is active
        if (!stopTransaction) {
          return true;
        }

        return false;
      } catch (error) {
        console.error('Error checking active transaction for deviceId:', deviceId, error);
        return false;
      }
    }

    // Helper function to check if charging point has fault
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

    // Calculate connectors count and max power, and real-time status
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

      return {
        id: point.id,
        chargingPointId: point.chargingPointId,
        deviceId: point.deviceId,
        deviceName: point.deviceName,
        stationName: point.station ? point.station.stationName : 'N/A',
        stationId: point.stationId, // Database ID (integer)
        stationIdString: point.station ? point.station.stationId : null, // Station ID string (e.g., "STN-...")
        tariffId: point.tariffId,
        tariffName: point.tariff ? point.tariff.tariffName : 'N/A',
        chargerType: point.chargerType,
        powerCapacity: parseFloat(point.powerCapacity),
        firmwareVersion: point.firmwareVersion,
        oemList: point.oemList,
        phase: point.phase,
        status: realTimeStatus, // Use calculated real-time status
        cStatus: cStatus, // Use calculated connector status
        connectors: connectors.length,
        maxPower: maxPower,
        sessions: sessionStats.sessions,
        billedAmount: sessionStats.billedAmount,
        energy: sessionStats.energy,
        createdBy: point.createdBy,
        createdAt: point.createdAt,
        chargerLastSeen: chargerData ? chargerData.lastSeen : null
      };
    }));

    res.json({
      success: true,
      points: formattedPoints,
      total: count,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching charging points:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch charging points',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/cms/charging-points/:chargingPointId
 * Get single charging point by chargingPointId
 */
router.get('/charging-points/:chargingPointId', async (req, res) => {
  try {
    const { chargingPointId } = req.params;

    const chargingPoint = await ChargingPoint.findOne({
      where: {
        chargingPointId,
        deleted: false
      },
      include: [
        {
          model: Station,
          as: 'station',
          attributes: ['id', 'stationId', 'stationName', 'organization']
        },
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName', 'currency', 'baseCharges', 'tax']
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

    // Fetch charger data using deviceId
    let chargerData = null;
    if (chargingPoint.deviceId) {
      chargerData = await Charger.findOne({
        where: {
          deviceId: chargingPoint.deviceId
        },
        attributes: ['id', 'vendor', 'model', 'serialNumber', 'meterSerialNumber', 'firmwareVersion', 'lastSeen']
      });
      
      // Find the latest BootNotification from ChargerData to update charger info
      const latestBootNotification = await ChargerData.findOne({
        where: {
          deviceId: chargingPoint.deviceId,
          message: 'BootNotification',
          direction: 'Incoming'
        },
        order: [['timestamp', 'DESC']],
        attributes: ['messageData', 'timestamp']
      });
      
      if (latestBootNotification && latestBootNotification.messageData) {
        const bootData = latestBootNotification.messageData;
        
        if (!chargerData) {
          // Create new Charger record from BootNotification
          chargerData = await Charger.create({
            deviceId: chargingPoint.deviceId,
            name: `Charger ${chargingPoint.deviceId}`,
            status: 'Available',
            vendor: bootData.chargePointVendor || 'Unknown',
            model: bootData.chargePointModel || 'Unknown',
            serialNumber: bootData.chargePointSerialNumber || 'Unknown',
            firmwareVersion: bootData.firmwareVersion || 'Unknown',
            meterSerialNumber: bootData.chargeBoxSerialNumber || null,
            lastSeen: latestBootNotification.timestamp || new Date()
          });
          console.log(`✅ Created Charger record from BootNotification for device: ${chargingPoint.deviceId}`);
        } else {
          // Update existing charger if it has "Unknown" values
          const needsUpdate = !chargerData.vendor || chargerData.vendor === 'Unknown' ||
                             !chargerData.model || chargerData.model === 'Unknown' ||
                             !chargerData.serialNumber || chargerData.serialNumber === 'Unknown' ||
                             !chargerData.firmwareVersion || chargerData.firmwareVersion === 'Unknown';
          
          if (needsUpdate) {
            const updates = {};
            
            // Update vendor if missing or Unknown
            if (bootData.chargePointVendor && (!chargerData.vendor || chargerData.vendor === 'Unknown')) {
              updates.vendor = bootData.chargePointVendor;
            }
            
            // Update model if missing or Unknown
            if (bootData.chargePointModel && (!chargerData.model || chargerData.model === 'Unknown')) {
              updates.model = bootData.chargePointModel;
            }
            
            // Update serialNumber if missing or Unknown
            if (bootData.chargePointSerialNumber && (!chargerData.serialNumber || chargerData.serialNumber === 'Unknown')) {
              updates.serialNumber = bootData.chargePointSerialNumber;
            }
            
            // Update firmwareVersion if missing or Unknown
            if (bootData.firmwareVersion && (!chargerData.firmwareVersion || chargerData.firmwareVersion === 'Unknown')) {
              updates.firmwareVersion = bootData.firmwareVersion;
            }
            
            // Update meterSerialNumber if available
            if (bootData.chargeBoxSerialNumber && (!chargerData.meterSerialNumber || chargerData.meterSerialNumber === 'Unknown')) {
              updates.meterSerialNumber = bootData.chargeBoxSerialNumber;
            }
            
            // Apply updates if any
            if (Object.keys(updates).length > 0) {
              await chargerData.update(updates);
              // Reload to get updated values
              await chargerData.reload();
              console.log(`✅ Updated Charger table from BootNotification for device: ${chargingPoint.deviceId}`);
            }
          }
        }
      }
    }

    // Helper function to normalize "Unknown" values to null
    const normalizeValue = (value) => {
      if (!value || value === 'Unknown' || value === 'unknown' || (typeof value === 'string' && value.trim() === '')) {
        return null;
      }
      return value;
    };

    res.json({
      success: true,
      point: {
        id: chargingPoint.id,
        chargingPointId: chargingPoint.chargingPointId,
        deviceId: chargingPoint.deviceId,
        deviceName: chargingPoint.deviceName,
        stationId: chargingPoint.stationId,
        stationName: chargingPoint.station ? chargingPoint.station.stationName : null,
        organization: chargingPoint.station ? chargingPoint.station.organization : null,
        tariffId: chargingPoint.tariffId,
        tariffName: chargingPoint.tariff ? chargingPoint.tariff.tariffName : null,
        chargerType: chargingPoint.chargerType,
        powerCapacity: parseFloat(chargingPoint.powerCapacity),
        firmwareVersion: chargingPoint.firmwareVersion,
        oemList: chargingPoint.oemList,
        phase: chargingPoint.phase,
        status: chargingPoint.status,
        cStatus: chargingPoint.cStatus,
        connectors: chargingPoint.connectors.map(c => ({
          id: c.id,
          connectorId: c.connectorId,
          connectorType: c.connectorType,
          power: parseFloat(c.power)
        })),
        // Charger data from Charger table - normalize "Unknown" values to null
        chargeBoxSerialNumber: chargerData ? normalizeValue(chargerData.meterSerialNumber) : null,
        chargePointModel: chargerData ? normalizeValue(chargerData.model) : null,
        chargePointSerialNumber: chargerData ? normalizeValue(chargerData.serialNumber) : null,
        chargePointVendor: chargerData ? normalizeValue(chargerData.vendor) : null,
        chargerFirmwareVersion: chargerData ? normalizeValue(chargerData.firmwareVersion) : null,
        chargerLastSeen: chargerData ? chargerData.lastSeen : null, // For real-time status
        createdBy: chargingPoint.createdBy,
        createdAt: chargingPoint.createdAt,
        updatedAt: chargingPoint.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching charging point:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch charging point',
      message: error.message
    });
  }
});

/**
 * POST /api/cms/charging-points
 * Create new charging point with connectors
 */
router.post('/charging-points', [
  body('deviceName')
    .notEmpty()
    .withMessage('Device name is required')
    .isLength({ min: 1, max: 255 })
    .withMessage('Device name must be between 1 and 255 characters'),
  body('chargingStation')
    .notEmpty()
    .withMessage('Charging station is required'),
  body('tariff')
    .notEmpty()
    .withMessage('Tariff is required')
    .isInt({ min: 1 })
    .withMessage('Tariff must be a valid ID'),
  body('chargerType')
    .notEmpty()
    .withMessage('Charger type is required')
    .isIn(['AC', 'DC'])
    .withMessage('Charger type must be AC or DC'),
  body('powerCapacity')
    .notEmpty()
    .withMessage('Power capacity is required')
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        throw new Error('Power capacity must be a positive number');
      }
      return true;
    }),
  body('connectors')
    .isArray({ min: 1 })
    .withMessage('At least one connector is required'),
  body('connectors.*.connectorType')
    .notEmpty()
    .withMessage('Connector type is required')
    .isIn(['type2', 'ccs2', 'type1', 'gbt', 'nacs', 'ac_socket'])
    .withMessage('Invalid connector type'),
  body('connectors.*.power')
    .notEmpty()
    .withMessage('Connector power is required')
    .custom((value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        throw new Error('Connector power must be a positive number');
      }
      return true;
    }),
  body('connectors.*.connectorId')
    .notEmpty()
    .withMessage('Connector ID is required')
    .isIn(['1', '2', '3'])
    .withMessage('Connector ID must be 1, 2, or 3')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      deviceName,
      chargingStation,
      tariff,
      chargerType,
      powerCapacity,
      firmwareVersion,
      oemList,
      phase,
      connectors,
      createdBy
    } = req.body;

    // Frontend now sends stationId directly (integer)
    const stationId = parseInt(chargingStation);
    if (isNaN(stationId) || stationId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid charging station. Please select a valid station.'
      });
    }

    // Verify tariff exists
    const tariffExists = await Tariff.findOne({
      where: {
        id: parseInt(tariff),
        deleted: false
      }
    });

    if (!tariffExists) {
      return res.status(400).json({
        success: false,
        error: 'Tariff not found'
      });
    }

    // Verify station exists
    const stationExists = await Station.findOne({
      where: {
        id: stationId,
        deleted: false
      }
    });

    if (!stationExists) {
      return res.status(400).json({
        success: false,
        error: 'Station not found'
      });
    }

    // Generate unique chargingPointId
    let chargingPointId;
    let existingPoint;
    do {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      chargingPointId = `CP-${timestamp}-${randomStr}`;
      existingPoint = await ChargingPoint.findOne({ where: { chargingPointId } });
    } while (existingPoint);

    // Generate unique deviceId
    let deviceId;
    let existingDevice;
    do {
      const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
      deviceId = `DEV${randomStr}`;
      existingDevice = await ChargingPoint.findOne({ where: { deviceId } });
    } while (existingDevice);

    // Create charging point
    const chargingPoint = await ChargingPoint.create({
      chargingPointId,
      deviceId,
      deviceName,
      stationId,
      tariffId: parseInt(tariff),
      chargerType,
      powerCapacity: parseFloat(powerCapacity),
      firmwareVersion: firmwareVersion || null,
      oemList: oemList || null,
      phase: phase || null,
      status: 'Offline',
      cStatus: 'Unavailable',
      createdBy: createdBy || null,
      deleted: false
    });

    // Create connectors
    const connectorPromises = connectors.map(connector => {
      return Connector.create({
        chargingPointId: chargingPoint.id,
        connectorId: parseInt(connector.connectorId),
        connectorType: connector.connectorType,
        power: parseFloat(connector.power)
      });
    });

    await Promise.all(connectorPromises);

    // Reload with associations
    await chargingPoint.reload({
      include: [
        {
          model: Station,
          as: 'station',
          attributes: ['id', 'stationId', 'stationName']
        },
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName']
        },
        {
          model: Connector,
          as: 'connectors',
          attributes: ['id', 'connectorId', 'connectorType', 'power']
        }
      ]
    });

    // Publish CMS event to RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ && publishCMSEvent) {
      try {
        await publishCMSEvent({
          type: 'cms.point.created',
          data: {
            chargingPointId: chargingPoint.chargingPointId,
            id: chargingPoint.id,
            deviceId: chargingPoint.deviceId,
            deviceName: chargingPoint.deviceName,
            stationId: chargingPoint.stationId,
            createdBy: createdBy
          }
        });
        console.log(`📤 [RABBITMQ] Published cms.point.created event for ${chargingPoint.chargingPointId}`);
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish cms.point.created event:', rabbitmqError.message);
        // Don't fail the request if RabbitMQ fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Charging point created successfully',
      point: {
        id: chargingPoint.id,
        chargingPointId: chargingPoint.chargingPointId,
        deviceId: chargingPoint.deviceId,
        deviceName: chargingPoint.deviceName,
        stationId: chargingPoint.stationId,
        tariffId: chargingPoint.tariffId,
        createdAt: chargingPoint.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating charging point:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create charging point',
      message: error.message
    });
  }
});

/**
 * PUT /api/cms/charging-points/:chargingPointId
 * Update charging point
 */
router.put('/charging-points/:chargingPointId', [
  body('deviceName')
    .optional()
    .isLength({ min: 1, max: 255 })
    .withMessage('Device name must be between 1 and 255 characters'),
  body('chargingStation')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) {
          throw new Error('Charging station must be a valid ID');
        }
      }
      return true;
    }),
  body('tariff')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) {
          throw new Error('Tariff must be a valid ID');
        }
      }
      return true;
    }),
  body('chargerType')
    .optional()
    .isIn(['AC', 'DC'])
    .withMessage('Charger type must be AC or DC'),
  body('powerCapacity')
    .optional()
    .custom((value) => {
      if (value !== null && value !== undefined) {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) {
          throw new Error('Power capacity must be a positive number');
        }
      }
      return true;
    })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { chargingPointId } = req.params;
    const updateData = req.body;

    // Find charging point
    const chargingPoint = await ChargingPoint.findOne({
      where: {
        chargingPointId,
        deleted: false
      }
    });

    if (!chargingPoint) {
      return res.status(404).json({
        success: false,
        error: 'Charging point not found'
      });
    }

    // Handle station update if provided
    if (updateData.chargingStation !== undefined) {
      const stationId = parseInt(updateData.chargingStation);
      if (isNaN(stationId) || stationId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid charging station. Please select a valid station.'
        });
      }

      // Verify station exists
      const stationExists = await Station.findOne({
        where: {
          id: stationId,
          deleted: false
        }
      });

      if (!stationExists) {
        return res.status(400).json({
          success: false,
          error: 'Station not found'
        });
      }
    }

    // Handle tariff update if provided
    if (updateData.tariff !== undefined) {
      const tariffId = parseInt(updateData.tariff);
      if (isNaN(tariffId) || tariffId <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid tariff. Please select a valid tariff.'
        });
      }

      // Verify tariff exists
      const tariffExists = await Tariff.findOne({
        where: {
          id: tariffId,
          deleted: false
        }
      });

      if (!tariffExists) {
        return res.status(400).json({
          success: false,
          error: 'Tariff not found'
        });
      }
    }

    // Prepare update data
    const dataToUpdate = {};
    if (updateData.deviceName !== undefined) dataToUpdate.deviceName = updateData.deviceName;
    if (updateData.chargingStation !== undefined) dataToUpdate.stationId = parseInt(updateData.chargingStation);
    if (updateData.tariff !== undefined) dataToUpdate.tariffId = parseInt(updateData.tariff);
    if (updateData.chargerType !== undefined) dataToUpdate.chargerType = updateData.chargerType;
    if (updateData.powerCapacity !== undefined) dataToUpdate.powerCapacity = updateData.powerCapacity ? parseFloat(updateData.powerCapacity) : null;
    if (updateData.firmwareVersion !== undefined) dataToUpdate.firmwareVersion = updateData.firmwareVersion || null;
    if (updateData.oemList !== undefined) dataToUpdate.oemList = updateData.oemList || null;
    if (updateData.phase !== undefined) dataToUpdate.phase = updateData.phase || null;
    if (updateData.status !== undefined) dataToUpdate.status = updateData.status;
    if (updateData.cStatus !== undefined) dataToUpdate.cStatus = updateData.cStatus;

    // Update charging point
    await chargingPoint.update(dataToUpdate);

    // Handle connectors update if provided
    if (updateData.connectors && Array.isArray(updateData.connectors)) {
      // Delete existing connectors
      await Connector.destroy({
        where: {
          chargingPointId: chargingPoint.id
        }
      });

      // Create new connectors
      const connectorPromises = updateData.connectors.map(connector => {
        return Connector.create({
          chargingPointId: chargingPoint.id,
          connectorId: parseInt(connector.connectorId),
          connectorType: connector.connectorType,
          power: parseFloat(connector.power)
        });
      });

      await Promise.all(connectorPromises);
    }

    // Reload to get updated data
    await chargingPoint.reload({
      include: [
        {
          model: Station,
          as: 'station',
          attributes: ['id', 'stationId', 'stationName']
        },
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName']
        },
        {
          model: Connector,
          as: 'connectors',
          attributes: ['id', 'connectorId', 'connectorType', 'power']
        }
      ]
    });

    // Publish CMS event to RabbitMQ (if enabled)
    if (ENABLE_RABBITMQ && publishCMSEvent) {
      try {
        await publishCMSEvent({
          type: 'cms.point.updated',
          data: {
            chargingPointId: chargingPoint.chargingPointId,
            id: chargingPoint.id,
            deviceId: chargingPoint.deviceId,
            deviceName: chargingPoint.deviceName
          }
        });
        console.log(`📤 [RABBITMQ] Published cms.point.updated event for ${chargingPoint.chargingPointId}`);
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish cms.point.updated event:', rabbitmqError.message);
        // Don't fail the request if RabbitMQ fails
      }
    }

    res.json({
      success: true,
      message: 'Charging point updated successfully',
      point: {
        id: chargingPoint.id,
        chargingPointId: chargingPoint.chargingPointId,
        deviceId: chargingPoint.deviceId,
        deviceName: chargingPoint.deviceName,
        status: chargingPoint.status,
        cStatus: chargingPoint.cStatus,
        updatedAt: chargingPoint.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating charging point:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update charging point',
      message: error.message
    });
  }
});

/**
 * DELETE /api/cms/charging-points/:chargingPointId
 * Soft delete charging point (set deleted = true)
 */
router.delete('/charging-points/:chargingPointId', async (req, res) => {
  try {
    const { chargingPointId } = req.params;

    // Find charging point
    const chargingPoint = await ChargingPoint.findOne({
      where: {
        chargingPointId,
        deleted: false
      }
    });

    if (!chargingPoint) {
      return res.status(404).json({
        success: false,
        error: 'Charging point not found'
      });
    }

    // Soft delete
    await chargingPoint.update({ deleted: true });

    res.json({
      success: true,
      message: 'Charging point deleted successfully',
      chargingPointId: chargingPoint.chargingPointId
    });
  } catch (error) {
    console.error('Error deleting charging point:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete charging point',
      message: error.message
    });
  }
});

// ============================================
// CHARGING SESSIONS ROUTES
// ============================================

/**
 * Helper function to extract meter value from MeterValues message
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
 * Calculate session statistics for a charging point within a date range
 * Returns: { sessions: count, energy: total kWh, billedAmount: total amount }
 */
async function calculateSessionStatsForDateRange(deviceId, chargingPoint, startDate, endDate) {
  try {
    // CRITICAL: Also count ChargingSession records (for web app sessions) within date range
    // This ensures sessions started from web app are included even if OCPP logs are missing/delayed
    const chargingSessions = await ChargingSession.findAll({
      where: {
        deviceId: deviceId,
        status: {
          [Op.in]: ['stopped', 'completed']
        },
        endTime: {
          [Op.ne]: null
        },
        startTime: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      attributes: ['id', 'transactionId', 'energyConsumed', 'finalAmount', 'startTime', 'endTime']
    });

    // Get all StartTransaction messages for this device within date range
    // These are the sessions that STARTED in this date range
    const startTransactions = await ChargerData.findAll({
      where: {
        deviceId: deviceId,
        message: 'StartTransaction',
        direction: 'Incoming',
        timestamp: {
          [Op.gte]: startDate,
          [Op.lte]: endDate
        }
      },
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Get all StopTransaction messages for this device (regardless of date)
    // We need all stops to match with starts, even if stop is outside the date range
    // A session is counted on the day it STARTED, not the day it ended
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

    // Create a map of transactionIds from ChargingSession records to avoid double counting
    const chargingSessionTransactionIds = new Set();
    let totalSessions = 0;
    let totalEnergy = 0;
    let totalBilledAmount = 0;
    const processedTransactionIds = new Set();

    // First, count sessions from ChargingSession records (web app sessions)
    for (const session of chargingSessions) {
      totalSessions++;
      
      // Use session data if available
      if (session.energyConsumed) {
        totalEnergy += parseFloat(session.energyConsumed);
      }
      if (session.finalAmount) {
        totalBilledAmount += parseFloat(session.finalAmount);
      }
      
      // Track transactionId if available to avoid double counting with OCPP logs
      if (session.transactionId) {
        chargingSessionTransactionIds.add(session.transactionId.toString());
      }
    }

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

      // Skip if this transactionId is already counted from ChargingSession records (avoid double counting)
      if (chargingSessionTransactionIds.has(transactionId.toString())) {
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
 * Calculate session statistics for a charging point
 * Returns: { sessions: count, energy: total kWh, billedAmount: total amount }
 */
async function calculateSessionStats(deviceId, chargingPoint) {
  try {
    // CRITICAL: Also count ChargingSession records (for web app sessions)
    // This ensures sessions started from web app are included even if OCPP logs are missing/delayed
    const chargingSessions = await ChargingSession.findAll({
      where: {
        deviceId: deviceId,
        status: {
          [Op.in]: ['stopped', 'completed']
        },
        endTime: {
          [Op.ne]: null
        }
      },
      attributes: ['id', 'transactionId', 'energyConsumed', 'finalAmount', 'startTime', 'endTime']
    });

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

    // Create a set of processed session IDs from ChargingSession records to avoid double counting
    const processedSessionIds = new Set();
    let totalSessions = 0;
    let totalEnergy = 0;
    let totalBilledAmount = 0;
    const processedTransactionIds = new Set();

    // Create a map of transactionIds from ChargingSession records to avoid double counting
    const chargingSessionTransactionIds = new Set();
    
    // First, count sessions from ChargingSession records (web app sessions)
    for (const session of chargingSessions) {
      processedSessionIds.add(session.id);
      totalSessions++;
      
      // Use session data if available, otherwise calculate from meter readings
      if (session.energyConsumed) {
        totalEnergy += parseFloat(session.energyConsumed);
      }
      if (session.finalAmount) {
        totalBilledAmount += parseFloat(session.finalAmount);
      }
      
      // Track transactionId if available to avoid double counting with OCPP logs
      if (session.transactionId) {
        chargingSessionTransactionIds.add(session.transactionId.toString());
      }
    }

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

      // Skip if this transactionId is already counted from ChargingSession records (avoid double counting)
      if (chargingSessionTransactionIds.has(transactionId.toString())) {
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
 * GET /api/cms/sessions/active
 * Get active charging sessions
 */
router.get('/sessions/active', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    // Get all StartTransaction messages
    const startTransactions = await ChargerData.findAll({
      where: {
        message: 'StartTransaction',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 10000 // Get recent transactions
    });

    // Get all StopTransaction messages
    const stopTransactions = await ChargerData.findAll({
      where: {
        message: 'StopTransaction',
        direction: 'Incoming'
      },
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Also get recent MeterValues to detect active sessions even if StartTransaction is delayed
    const recentMeterValues = await ChargerData.findAll({
      where: {
        message: 'MeterValues',
        direction: 'Incoming',
        timestamp: {
          [Op.gte]: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
        }
      },
      order: [['timestamp', 'DESC']],
      limit: 1000
    });

    // Also get recent StatusNotification with "Charging" status
    const recentChargingStatus = await ChargerData.findAll({
      where: {
        message: 'StatusNotification',
        direction: 'Incoming',
        timestamp: {
          [Op.gte]: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
        }
      },
      order: [['timestamp', 'DESC']],
      limit: 1000
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

    // Filter active sessions (StartTransaction without corresponding StopTransaction)
    const activeSessions = [];
    const processedTransactionIds = new Set();
    const activeTransactionIdsFromMeterValues = new Set();
    const activeDeviceConnectorsFromStatus = new Set();

    // First, collect active transactionIds from MeterValues (most reliable - shows current charging)
    for (const meterValue of recentMeterValues) {
      let txId = null;
      if (meterValue.messageData && meterValue.messageData.transactionId) {
        txId = meterValue.messageData.transactionId;
      } else if (meterValue.raw && Array.isArray(meterValue.raw) && meterValue.raw[2] && meterValue.raw[2].transactionId) {
        txId = meterValue.raw[2].transactionId;
      }
      
      if (txId) {
        // Check if there's a StopTransaction for this transactionId
        const hasStop = stopTransactions.some(stop => {
          let stopTxId = null;
          if (stop.messageData && stop.messageData.transactionId) {
            stopTxId = stop.messageData.transactionId;
          } else if (stop.raw && Array.isArray(stop.raw) && stop.raw[2] && stop.raw[2].transactionId) {
            stopTxId = stop.raw[2].transactionId;
          }
          return stopTxId && stopTxId.toString() === txId.toString();
        });
        
        if (!hasStop) {
          activeTransactionIdsFromMeterValues.add(txId.toString());
        }
      }
    }

    // Also collect active device/connector pairs from StatusNotification with "Charging"
    for (const statusNotif of recentChargingStatus) {
      let status = null;
      if (statusNotif.messageData && statusNotif.messageData.status) {
        status = statusNotif.messageData.status;
      } else if (statusNotif.raw && Array.isArray(statusNotif.raw) && statusNotif.raw[2] && statusNotif.raw[2].status) {
        status = statusNotif.raw[2].status;
      }
      
      if (status === 'Charging' && statusNotif.deviceId) {
        const connectorId = statusNotif.connectorId || (statusNotif.messageData && statusNotif.messageData.connectorId) || 0;
        activeDeviceConnectorsFromStatus.add(`${statusNotif.deviceId}_${connectorId}`);
      }
    }

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

      // Get deviceId and connectorId first (needed for checks below)
      const deviceId = start.deviceId;
      let connectorId = null;
      if (start.connectorId) {
        connectorId = start.connectorId;
      } else if (start.messageData && start.messageData.connectorId) {
        connectorId = start.messageData.connectorId;
      } else if (start.raw && Array.isArray(start.raw) && start.raw[2] && start.raw[2].connectorId) {
        connectorId = start.raw[2].connectorId;
      }

      // Check if there's a StopTransaction for this transactionId
      if (stopTransactionMap.has(transactionId.toString())) {
        // But also check if MeterValues show it's still active (might be a false stop or delayed)
        if (activeTransactionIdsFromMeterValues.has(transactionId.toString())) {
          // MeterValues show it's still active, so include it
          console.log(`[Active Sessions] TransactionId ${transactionId} has StopTransaction but MeterValues show it's active - including it`);
        } else {
        continue; // This session is completed, skip
        }
      }

      // Also check if this transactionId is in active MeterValues (confirms it's active)
      const isActiveFromMeterValues = activeTransactionIdsFromMeterValues.has(transactionId.toString());
      
      // Check if device/connector is active from StatusNotification
      const deviceConnectorKey = `${deviceId}_${connectorId || 0}`;
      const isActiveFromStatus = activeDeviceConnectorsFromStatus.has(deviceConnectorKey);

      // Check if StartTransaction is recent (within last 24 hours) OR if MeterValues/StatusNotification show it's active
      const startTime = new Date(start.timestamp || start.createdAt);
      const now = new Date();
      const hoursSinceStart = (now - startTime) / (1000 * 60 * 60);
      
      // Include if recent OR if MeterValues/StatusNotification confirm it's active
      if (hoursSinceStart > 24 && !isActiveFromMeterValues && !isActiveFromStatus) {
        continue; // Too old and not confirmed active, consider it stale
      }

      processedTransactionIds.add(transactionId.toString());
      
      // Check if charger is actually online (lastSeen within 5 minutes)
      const charger = await Charger.findOne({
        where: { deviceId: deviceId },
        attributes: ['lastSeen']
      });
      
      if (!charger || !charger.lastSeen) {
        continue; // Charger not found or never seen, skip
      }
      
      const lastSeenTime = new Date(charger.lastSeen);
      const minutesSinceLastSeen = (now - lastSeenTime) / (1000 * 60);
      if (minutesSinceLastSeen > 5) {
        continue; // Charger is offline, skip this session
      }

      // Find charging point for this deviceId
      const chargingPoint = await ChargingPoint.findOne({
        where: { deviceId, deleted: false },
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
      });

      if (!chargingPoint) {
        continue;
      }

      // Get meter_start from first MeterValues after StartTransaction for this transaction
      let meterStart = null;
      const startMeterValues = await ChargerData.findOne({
        where: {
          deviceId: deviceId,
          message: 'MeterValues',
          direction: 'Incoming',
          timestamp: {
            [Op.gte]: startTime
          }
        },
        order: [['timestamp', 'ASC']],
        limit: 1
      });

      if (startMeterValues) {
        meterStart = extractMeterValue(startMeterValues);
      }

      // Get meter_now (latest MeterValues for this transaction - should be after start)
      let meterNow = null;
      const latestMeterValues = await ChargerData.findOne({
        where: {
          deviceId: deviceId,
          message: 'MeterValues',
          direction: 'Incoming',
          timestamp: {
            [Op.gte]: startTime
          }
        },
        order: [['timestamp', 'DESC']],
        limit: 1
      });

      if (latestMeterValues) {
        meterNow = extractMeterValue(latestMeterValues);
      }

      // Calculate energy: (meter_now - meter_start) / 1000
      let energy = 0;
      if (meterStart !== null && meterNow !== null && meterNow >= meterStart) {
        energy = (meterNow - meterStart) / 1000;
        if (energy < 0) energy = 0; // Prevent negative values
      }

      // Get tariff details
      const tariff = chargingPoint.tariff;
      const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
      const tax = tariff ? parseFloat(tariff.tax) : 0;

      // Calculate billed amount: (Energy × Base Charge) × (1 + Tax/100)
      // Example: (0.03 * 100) * (1 + 15/100) = 3 * 1.15 = 3.45
      const baseAmount = energy * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      const billedAmount = baseAmount * taxMultiplier;
      
      // Debug logging - check which tariff is being used
      if (energy > 0 && baseCharges > 0) {
        console.log(`[Session Debug - Completed] Device: ${deviceId}, TransactionId: ${transactionId}`);
        console.log(`  ChargingPoint ID: ${chargingPoint.id}, Tariff ID: ${tariff ? tariff.id : 'N/A'}`);
        console.log(`  Tariff Name: ${tariff ? tariff.tariffName : 'N/A'}, BaseCharge: ${baseCharges}, Tax: ${tax}%`);
        console.log(`  Energy: ${energy}, BaseAmount: ${baseAmount}, TaxMultiplier: ${taxMultiplier}, BilledAmount: ${billedAmount.toFixed(2)}`);
      }

      // Calculate session duration
      const durationMs = now - startTime;
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      const sessionDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Generate unique Session ID (deviceId + timestamp + transactionId hash)
      const sessionIdHash = require('crypto').createHash('md5')
        .update(`${deviceId}-${startTime.getTime()}-${transactionId}`)
        .digest('hex')
        .substring(0, 12);
      const sessionId = `SESS-${sessionIdHash.toUpperCase()}`;

      // Try to find matching ChargingSession record to get entered amount, refund, and mode
      let enteredAmount = 0;
      let refundAmount = 0;
      let sessionMode = 'OCPP'; // Default mode
      try {
        // First try to find by transactionId and startTime (most accurate)
        let chargingSession = await ChargingSession.findOne({
          where: {
            deviceId: deviceId,
            connectorId: connectorId,
            transactionId: transactionId.toString(),
            startTime: {
              [Op.gte]: new Date(startTime.getTime() - 60000), // Within 1 minute
              [Op.lte]: new Date(startTime.getTime() + 60000)
            }
          },
          include: [
            {
              model: Vehicle,
              as: 'vehicle',
              attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
              required: false
            }
          ],
          order: [['createdAt', 'DESC']],
          limit: 1
        });

        // If not found, try to find by deviceId, connectorId, and startTime (broader match)
        if (!chargingSession) {
          chargingSession = await ChargingSession.findOne({
            where: {
              deviceId: deviceId,
              connectorId: connectorId,
              startTime: {
                [Op.gte]: new Date(startTime.getTime() - 300000), // Within 5 minutes
                [Op.lte]: new Date(startTime.getTime() + 300000)
              }
            },
            include: [
              {
                model: Vehicle,
                as: 'vehicle',
                attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
                required: false
              }
            ],
            order: [['createdAt', 'DESC']],
            limit: 1
          });
        }

        // If still not found, try to find by deviceId and endTime (for CMS-stopped sessions)
        if (!chargingSession) {
          chargingSession = await ChargingSession.findOne({
            where: {
              deviceId: deviceId,
              connectorId: connectorId,
              endTime: {
                [Op.gte]: new Date(endTime.getTime() - 300000), // Within 5 minutes
                [Op.lte]: new Date(endTime.getTime() + 300000)
              },
              stopReason: 'Remote (CMS)'
            },
            include: [
              {
                model: Vehicle,
                as: 'vehicle',
                attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
                required: false
              }
            ],
            order: [['createdAt', 'DESC']],
            limit: 1
          });
        }

        if (chargingSession) {
          enteredAmount = parseFloat(chargingSession.amountRequested || chargingSession.amountDeducted || 0);
          refundAmount = parseFloat(chargingSession.refundAmount || 0);
          
          // Determine mode based on customerId
          // If customerId is null, it was started from CMS; otherwise from App
          sessionMode = chargingSession.customerId === null ? 'CMS' : 'App';
        }
      } catch (error) {
        console.error('Error fetching ChargingSession for entered amount:', error);
      }

      // Get vehicle information
      let vehicleInfo = null;
      if (chargingSession && chargingSession.vehicle) {
        vehicleInfo = {
          vehicleNumber: chargingSession.vehicle.vehicleNumber || 'N/A',
          brand: chargingSession.vehicle.brand || '',
          modelName: chargingSession.vehicle.modelName || ''
        };
      }

      activeSessions.push({
        transactionId: transactionId.toString(), // Transaction ID from charger
        sessionId: sessionId, // Unique session ID we generate
        deviceId: deviceId,
        connectorId: connectorId,
        stationName: chargingPoint.station ? chargingPoint.station.stationName : 'N/A',
        stationId: chargingPoint.station ? chargingPoint.station.stationId : null,
        startTime: startTime.toISOString(),
        endTime: null,
        energy: parseFloat(energy.toFixed(2)),
        enteredAmount: parseFloat(enteredAmount.toFixed(2)),
        billedAmount: parseFloat(billedAmount.toFixed(2)),
        refund: parseFloat(refundAmount.toFixed(2)),
        mode: sessionMode,
        sessionDuration: sessionDuration,
        stopReason: null,
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR',
        vehicle: vehicleInfo ? `${vehicleInfo.vehicleNumber}${vehicleInfo.brand ? ` (${vehicleInfo.brand}${vehicleInfo.modelName ? ` ${vehicleInfo.modelName}` : ''})` : ''}` : 'N/A'
      });
    }

    // CRITICAL: Also get active sessions directly from ChargingSession table
    // This ensures web app sessions are included even if OCPP logs are missing or delayed
    const activeChargingSessions = await ChargingSession.findAll({
      where: {
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
              as: 'tariff',
              attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
            }
          ],
          required: false
        },
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Create a set of already processed deviceId_connectorId pairs from OCPP-based sessions
    const processedDeviceConnectors = new Set();
    activeSessions.forEach(session => {
      processedDeviceConnectors.add(`${session.deviceId}_${session.connectorId}`);
    });

    // Add ChargingSession records that aren't already in activeSessions
    for (const session of activeChargingSessions) {
      const deviceConnectorKey = `${session.deviceId}_${session.connectorId}`;
      
      // Skip if we already have this session from OCPP logs
      if (processedDeviceConnectors.has(deviceConnectorKey)) {
        continue;
      }

      // Skip if no charging point found
      if (!session.chargingPoint) {
        continue;
      }

      const chargingPoint = session.chargingPoint;
      const tariff = chargingPoint.tariff;
      const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
      const tax = tariff ? parseFloat(tariff.tax) : 0;

      // Calculate energy from session or meter readings
      let energy = 0;
      if (session.energyConsumed) {
        energy = parseFloat(session.energyConsumed);
      } else if (session.meterStart !== null && session.meterEnd !== null && session.meterEnd >= session.meterStart) {
        energy = (session.meterEnd - session.meterStart) / 1000;
      }

      // Calculate billed amount
      const baseAmount = energy * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      const billedAmount = baseAmount * taxMultiplier;

      // Calculate session duration
      const startTime = session.startTime || session.createdAt;
      const now = new Date();
      const durationMs = now - new Date(startTime);
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      const sessionDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Get vehicle information
      let vehicleInfo = null;
      if (session.vehicle) {
        vehicleInfo = {
          vehicleNumber: session.vehicle.vehicleNumber || 'N/A',
          brand: session.vehicle.brand || '',
          modelName: session.vehicle.modelName || ''
        };
      }

      // Determine mode
      const sessionMode = session.customerId === null ? 'CMS' : 'App';

      activeSessions.push({
        transactionId: session.transactionId ? session.transactionId.toString() : 'N/A',
        sessionId: session.sessionId || `SESS-${session.id}`,
        deviceId: session.deviceId,
        connectorId: session.connectorId,
        stationName: chargingPoint.station ? chargingPoint.station.stationName : 'N/A',
        stationId: chargingPoint.station ? chargingPoint.station.stationId : null,
        startTime: startTime ? new Date(startTime).toISOString() : session.createdAt.toISOString(),
        endTime: null,
        energy: parseFloat(energy.toFixed(2)),
        enteredAmount: parseFloat(session.amountRequested || session.amountDeducted || 0),
        billedAmount: parseFloat(billedAmount.toFixed(2)),
        refund: parseFloat(session.refundAmount || 0),
        mode: sessionMode,
        sessionDuration: sessionDuration,
        stopReason: null,
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR',
        vehicle: vehicleInfo ? `${vehicleInfo.vehicleNumber}${vehicleInfo.brand ? ` (${vehicleInfo.brand}${vehicleInfo.modelName ? ` ${vehicleInfo.modelName}` : ''})` : ''}` : 'N/A'
      });

      processedDeviceConnectors.add(deviceConnectorKey);
    }

    // Fallback: Create sessions from MeterValues/StatusNotification if no StartTransaction found yet
    // This handles cases where charging started but StartTransaction log is delayed

    // Add sessions from active MeterValues that don't have a StartTransaction yet
    for (const txId of activeTransactionIdsFromMeterValues) {
      // Check if we already have a session for this transactionId
      const existingSession = activeSessions.find(s => s.transactionId && s.transactionId.toString() === txId);
      if (existingSession) continue;

      // Find the most recent MeterValue for this transactionId
      const meterValue = recentMeterValues.find(mv => {
        let mvTxId = null;
        if (mv.messageData && mv.messageData.transactionId) {
          mvTxId = mv.messageData.transactionId;
        } else if (mv.raw && Array.isArray(mv.raw) && mv.raw[2] && mv.raw[2].transactionId) {
          mvTxId = mv.raw[2].transactionId;
        }
        return mvTxId && mvTxId.toString() === txId;
      });

      if (meterValue) {
        const deviceId = meterValue.deviceId;
        const connectorId = meterValue.connectorId || 0;
        const deviceConnectorKey = `${deviceId}_${connectorId}`;

        // Skip if we already processed this device/connector
        if (processedDeviceConnectors.has(deviceConnectorKey)) continue;

        // Find charging point
        const chargingPoint = await ChargingPoint.findOne({
          where: { deviceId, deleted: false },
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
        });

        if (chargingPoint) {
          // Extract energy from MeterValues
          let energy = 0;
          const meterData = meterValue.messageData || (meterValue.raw && meterValue.raw[2]);
          if (meterData && meterData.meterValue && Array.isArray(meterData.meterValue)) {
            const sampledValues = meterData.meterValue[0]?.sampledValue;
            if (sampledValues && Array.isArray(sampledValues)) {
              const energySample = sampledValues.find(s => 
                s.measurand === 'Energy.Active.Import.Register' || s.measurand === 'energy'
              );
              if (energySample && energySample.value) {
                energy = parseFloat(energySample.value) / 1000; // Convert Wh to kWh
              }
            }
          }

          const tariff = chargingPoint.tariff;
          const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
          const tax = tariff ? parseFloat(tariff.tax) : 0;
          const billedAmount = energy * baseCharges * (1 + tax / 100);

          activeSessions.push({
            transactionId: txId,
            sessionId: `CMS_${txId}`,
            deviceId: deviceId,
            connectorId: connectorId,
            stationName: chargingPoint.station ? chargingPoint.station.stationName : 'N/A',
            stationId: chargingPoint.station ? chargingPoint.station.stationId : null,
            startTime: (meterValue.timestamp || meterValue.createdAt).toISOString(),
            endTime: null,
            energy: parseFloat(energy.toFixed(2)),
            enteredAmount: 0,
            billedAmount: parseFloat(billedAmount.toFixed(2)),
            refund: 0,
            mode: 'OCPP',
            sessionDuration: 'Active',
            stopReason: null,
            baseCharges: baseCharges,
            tax: tax,
            currency: tariff ? tariff.currency : 'INR',
            vehicle: 'N/A'
          });

          processedDeviceConnectors.add(deviceConnectorKey);
        }
      }
    }

    // Apply search filter
    let filteredSessions = activeSessions;
    if (search) {
      filteredSessions = activeSessions.filter(session =>
        session.stationName.toLowerCase().includes(search.toLowerCase()) ||
        session.deviceId.toLowerCase().includes(search.toLowerCase()) ||
        session.transactionId.toString().includes(search)
      );
    }

    // Pagination
    const total = filteredSessions.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedSessions = filteredSessions.slice(offset, offset + limit);

    res.json({
      success: true,
      sessions: paginatedSessions,
      total,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active sessions',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/sessions/completed
 * Get completed charging sessions
 */
router.get('/sessions/completed', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString(),
  query('fromDate').optional().isISO8601().withMessage('From date must be a valid ISO8601 date'),
  query('toDate').optional().isISO8601().withMessage('To date must be a valid ISO8601 date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
    const toDate = req.query.toDate ? new Date(req.query.toDate) : null;

    // CRITICAL: Use the same priority logic as calculateSessionStats
    // First, get ALL ChargingSession records (they take priority)
    const completedChargingSessionsWhere = {
      status: {
        [Op.in]: ['stopped', 'completed']
      },
      endTime: {
        [Op.ne]: null
      }
    };

    // Apply date filters if provided
    if (fromDate) {
      completedChargingSessionsWhere.endTime = {
        ...completedChargingSessionsWhere.endTime,
        [Op.gte]: fromDate
      };
    }
    if (toDate) {
      completedChargingSessionsWhere.endTime = {
        ...completedChargingSessionsWhere.endTime,
        [Op.lte]: toDate
      };
    }

    // CRITICAL: Get list of valid deviceIds from ChargingPoint records first
    // This ensures we only process sessions for devices that have ChargingPoints
    // (matching calculateSessionStats behavior)
    const allChargingPoints = await ChargingPoint.findAll({
      where: { deleted: false },
      attributes: ['deviceId']
    });
    const validDeviceIds = new Set(allChargingPoints.map(cp => cp.deviceId).filter(Boolean));

    // Only get ChargingSession records for devices that have ChargingPoint records
    if (validDeviceIds.size > 0) {
      completedChargingSessionsWhere.deviceId = {
        [Op.in]: Array.from(validDeviceIds)
      };
    } else {
      // If no valid deviceIds, return empty result
      completedChargingSessionsWhere.deviceId = { [Op.in]: [] };
    }

    const completedChargingSessions = await ChargingSession.findAll({
      where: completedChargingSessionsWhere,
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
          ],
          required: false
        },
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
          required: false
        }
      ],
      order: [['endTime', 'DESC']]
    });

    // Pre-fetch all charging points to avoid async lookups in the loop
    const chargingPointsMap = new Map();
    const allChargingPointsWithDetails = await ChargingPoint.findAll({
      where: { 
        deviceId: {
          [Op.in]: Array.from(validDeviceIds)
        },
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
        }
      ]
    });
    allChargingPointsWithDetails.forEach(cp => {
      if (cp.deviceId) {
        chargingPointsMap.set(cp.deviceId, cp);
      }
    });

    // Create a set of transactionIds from ChargingSession records to avoid double counting
    const chargingSessionTransactionIds = new Set();
    completedChargingSessions.forEach(session => {
      if (session.transactionId) {
        chargingSessionTransactionIds.add(session.transactionId.toString());
      }
    });

    // Now get OCPP logs - we'll only use sessions that DON'T have a matching ChargingSession
    // AND only for devices that have ChargingPoint records (validDeviceIds already defined above)
    const startWhere = {
      message: 'StartTransaction',
      direction: 'Incoming',
      deviceId: {
        [Op.in]: Array.from(validDeviceIds)
      }
    };
    if (fromDate) {
      startWhere.timestamp = { [Op.gte]: fromDate };
    }

    const startTransactions = await ChargerData.findAll({
      where: startWhere,
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Get all StopTransaction messages - only for devices with ChargingPoint records
    const stopWhere = {
      message: 'StopTransaction',
      direction: 'Incoming',
      deviceId: {
        [Op.in]: Array.from(validDeviceIds)
      }
    };
    if (fromDate) {
      stopWhere.timestamp = { [Op.gte]: fromDate };
    }
    if (toDate) {
      stopWhere.timestamp = {
        ...stopWhere.timestamp,
        [Op.lte]: toDate
      };
    }

    const stopTransactions = await ChargerData.findAll({
      where: stopWhere,
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

    // Initialize completedSessions array - we'll add ChargingSession records first, then OCPP logs
    const completedSessions = [];
    
    // First, add ALL ChargingSession records to completedSessions (they take priority)
    // NOTE: We don't skip sessions even if chargingPoint is null, as long as deviceId is valid
    // This matches calculateSessionStats which doesn't require chargingPoint association
    for (const session of completedChargingSessions) {
      // Only skip if deviceId is not in validDeviceIds (shouldn't happen due to our filter, but safety check)
      if (!session.deviceId || !validDeviceIds.has(session.deviceId)) {
        continue;
      }

      // Get charging point info from pre-fetched map (much faster than async lookup in loop)
      let chargingPoint = session.chargingPoint;
      if (!chargingPoint && session.deviceId) {
        chargingPoint = chargingPointsMap.get(session.deviceId);
      }

      const tariff = chargingPoint?.tariff;
      const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
      const tax = tariff ? parseFloat(tariff.tax) : 0;

      // Calculate energy from session
      let energy = 0;
      if (session.energyConsumed) {
        energy = parseFloat(session.energyConsumed);
      } else if (session.meterStart !== null && session.meterEnd !== null && session.meterEnd >= session.meterStart) {
        energy = (session.meterEnd - session.meterStart) / 1000;
      }

      // Calculate billed amount (use finalAmount if available, otherwise calculate)
      let billedAmount = 0;
      if (session.finalAmount) {
        billedAmount = parseFloat(session.finalAmount);
      } else {
        const baseAmount = energy * baseCharges;
        const taxMultiplier = 1 + (tax / 100);
        billedAmount = baseAmount * taxMultiplier;
      }

      // Calculate session duration
      const startTime = session.startTime || session.createdAt;
      const endTime = session.endTime;
      // Note: We already filtered for endTime != null in the query, so this should always exist
      if (!endTime) {
        console.warn(`[Completed Sessions] Skipping session ${session.id} - no endTime`);
        continue; // Safety check - should not happen due to query filter
      }

      const durationMs = new Date(endTime) - new Date(startTime);
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      const sessionDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Get vehicle information
      let vehicleInfo = null;
      if (session.vehicle) {
        vehicleInfo = {
          vehicleNumber: session.vehicle.vehicleNumber || 'N/A',
          brand: session.vehicle.brand || '',
          modelName: session.vehicle.modelName || ''
        };
      }

      // Determine mode and format stop reason
      const sessionMode = session.customerId === null ? 'CMS' : 'App';
      let formattedStopReason = 'Unknown';
      if (session.stopReason === 'Remote (CMS)') {
        formattedStopReason = 'Stopped from CMS';
      } else if (session.stopReason === 'Remote') {
        formattedStopReason = 'User stopped charging';
      } else if (session.stopReason) {
        formattedStopReason = 'Charger initiated';
      }

      completedSessions.push({
        transactionId: session.transactionId ? session.transactionId.toString() : 'N/A',
        sessionId: session.sessionId || `SESS-${session.id}`,
        deviceId: session.deviceId,
        connectorId: session.connectorId,
        stationName: chargingPoint?.station?.stationName || 'N/A',
        stationId: chargingPoint?.station?.stationId || null,
        startTime: startTime ? new Date(startTime).toISOString() : session.createdAt.toISOString(),
        endTime: new Date(endTime).toISOString(),
        energy: parseFloat(energy.toFixed(2)),
        enteredAmount: parseFloat(session.amountRequested || session.amountDeducted || 0),
        billedAmount: parseFloat(billedAmount.toFixed(2)),
        refund: parseFloat(session.refundAmount || 0),
        mode: sessionMode,
        sessionDuration: sessionDuration,
        stopReason: formattedStopReason,
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR',
        vehicle: vehicleInfo ? `${vehicleInfo.vehicleNumber}${vehicleInfo.brand ? ` (${vehicleInfo.brand}${vehicleInfo.modelName ? ` ${vehicleInfo.modelName}` : ''})` : ''}` : 'N/A'
      });
    }

    // Now process OCPP logs - only add sessions that DON'T have a matching ChargingSession record
    // Create a set to track ChargingSession records by deviceId + connectorId + time window for better matching
    const chargingSessionKeys = new Set();
    completedChargingSessions.forEach(session => {
      if (session.deviceId && session.connectorId && session.endTime) {
        // Create a key based on deviceId, connectorId, and endTime (within 5 minutes)
        const endTime = new Date(session.endTime);
        const timeKey = Math.floor(endTime.getTime() / (5 * 60 * 1000)); // Round to 5-minute window
        chargingSessionKeys.add(`${session.deviceId}_${session.connectorId}_${timeKey}`);
      }
    });

    const processedTransactionIds = new Set();

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

      // CRITICAL: Skip if this transactionId is already in ChargingSession records (avoid double counting)
      // This matches the logic in calculateSessionStats
      if (chargingSessionTransactionIds.has(transactionId.toString())) {
        continue; // Already counted from ChargingSession records
      }

      // Check if there's a StopTransaction for this transactionId
      const stop = stopTransactionMap.get(transactionId.toString());
      if (!stop) {
        continue; // No stop transaction, skip (it's active or incomplete)
      }

      processedTransactionIds.add(transactionId.toString());

      // Get deviceId and connectorId
      const deviceId = start.deviceId;
      let connectorId = null;
      if (start.connectorId) {
        connectorId = start.connectorId;
      } else if (start.messageData && start.messageData.connectorId) {
        connectorId = start.messageData.connectorId;
      } else if (start.raw && Array.isArray(start.raw) && start.raw[2] && start.raw[2].connectorId) {
        connectorId = start.raw[2].connectorId;
      }

      // Additional check: if this OCPP session matches a ChargingSession by deviceId + connectorId + time
      // even if transactionId doesn't match, skip it to avoid duplicates
      // NOTE: This check might be too aggressive and exclude valid OCPP sessions
      // We'll rely primarily on transactionId matching instead
      // if (deviceId && connectorId && stop.timestamp) {
      //   const endTime = new Date(stop.timestamp);
      //   const timeKey = Math.floor(endTime.getTime() / (5 * 60 * 1000)); // Round to 5-minute window
      //   const sessionKey = `${deviceId}_${connectorId}_${timeKey}`;
      //   if (chargingSessionKeys.has(sessionKey)) {
      //     continue; // This session already exists in ChargingSession records, skip
      //   }
      // }

      // Get charging point from pre-fetched map (much faster than async lookup)
      const chargingPoint = chargingPointsMap.get(deviceId);
      if (!chargingPoint) {
        continue; // Skip if no charging point found for this deviceId
      }

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

      // Get tariff details
      const tariff = chargingPoint.tariff;
      const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
      const tax = tariff ? parseFloat(tariff.tax) : 0;

      // Calculate billed amount: (Energy × Base Charge) × (1 + Tax/100)
      // Example: (0.03 * 100) * (1 + 15/100) = 3 * 1.15 = 3.45
      const baseAmount = energy * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      const billedAmount = baseAmount * taxMultiplier;
      
      // Debug logging - check which tariff is being used
      if (energy > 0 && baseCharges > 0) {
        console.log(`[Session Debug - Completed] Device: ${deviceId}, TransactionId: ${transactionId}`);
        console.log(`  ChargingPoint ID: ${chargingPoint.id}, Tariff ID: ${tariff ? tariff.id : 'N/A'}`);
        console.log(`  Tariff Name: ${tariff ? tariff.tariffName : 'N/A'}, BaseCharge: ${baseCharges}, Tax: ${tax}%`);
        console.log(`  Energy: ${energy}, BaseAmount: ${baseAmount}, TaxMultiplier: ${taxMultiplier}, BilledAmount: ${billedAmount.toFixed(2)}`);
      }

      // Get stop reason
      let stopReason = null;
      if (stop.messageData && stop.messageData.reason) {
        stopReason = stop.messageData.reason;
      } else if (stop.raw && Array.isArray(stop.raw) && stop.raw[2] && stop.raw[2].reason) {
        stopReason = stop.raw[2].reason;
      }

      // Calculate session duration
      const durationMs = endTime - startTime;
      const hours = Math.floor(durationMs / (1000 * 60 * 60));
      const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
      const sessionDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

      // Generate unique Session ID (deviceId + timestamp + transactionId hash)
      const sessionIdHash = require('crypto').createHash('md5')
        .update(`${deviceId}-${startTime.getTime()}-${transactionId}`)
        .digest('hex')
        .substring(0, 12);
      const sessionId = `SESS-${sessionIdHash.toUpperCase()}`;

      // Try to find matching ChargingSession record to get entered amount, refund, mode, and stop reason
      let enteredAmount = 0;
      let refundAmount = 0;
      let sessionMode = 'OCPP'; // Default mode
      let formattedStopReason = stopReason || 'Unknown';
      let chargingSession = null; // Declare outside try block for access after catch
      try {
        // First try to find by transactionId and startTime (most accurate)
        chargingSession = await ChargingSession.findOne({
          where: {
            deviceId: deviceId,
            connectorId: connectorId,
            transactionId: transactionId.toString(),
            startTime: {
              [Op.gte]: new Date(startTime.getTime() - 60000), // Within 1 minute
              [Op.lte]: new Date(startTime.getTime() + 60000)
            }
          },
          include: [
            {
              model: Vehicle,
              as: 'vehicle',
              attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
              required: false
            }
          ],
          order: [['createdAt', 'DESC']],
          limit: 1
        });

        // If not found, try to find by deviceId, connectorId, and startTime (broader match)
        if (!chargingSession) {
          chargingSession = await ChargingSession.findOne({
            where: {
              deviceId: deviceId,
              connectorId: connectorId,
              startTime: {
                [Op.gte]: new Date(startTime.getTime() - 300000), // Within 5 minutes
                [Op.lte]: new Date(startTime.getTime() + 300000)
              }
            },
            include: [
              {
                model: Vehicle,
                as: 'vehicle',
                attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
                required: false
              }
            ],
            order: [['createdAt', 'DESC']],
            limit: 1
          });
        }

        // If still not found, try to find by deviceId and endTime (for CMS-stopped sessions)
        if (!chargingSession) {
          chargingSession = await ChargingSession.findOne({
            where: {
              deviceId: deviceId,
              connectorId: connectorId,
              endTime: {
                [Op.gte]: new Date(endTime.getTime() - 300000), // Within 5 minutes
                [Op.lte]: new Date(endTime.getTime() + 300000)
              },
              stopReason: 'Remote (CMS)'
            },
            include: [
              {
                model: Vehicle,
                as: 'vehicle',
                attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
                required: false
              }
            ],
            order: [['createdAt', 'DESC']],
            limit: 1
          });
        }

        if (chargingSession) {
          enteredAmount = parseFloat(chargingSession.amountRequested || chargingSession.amountDeducted || 0);
          refundAmount = parseFloat(chargingSession.refundAmount || 0);
          
          // Determine mode based on customerId
          // If customerId is null, it was started from CMS; otherwise from App
          sessionMode = chargingSession.customerId === null ? 'CMS' : 'App';
          
          // Format stop reason based on ChargingSession stopReason
          const sessionStopReason = chargingSession.stopReason;
          if (sessionStopReason === 'Remote (CMS)') {
            formattedStopReason = 'Stopped from CMS';
          } else if (sessionStopReason === 'Remote') {
            formattedStopReason = 'User stopped charging';
          } else if (sessionStopReason) {
            // For other reasons (Local, DeAuthorized, etc.), charger initiated
            formattedStopReason = 'Charger initiated';
          } else {
            // Fallback to OCPP stop reason if ChargingSession doesn't have one
            formattedStopReason = stopReason || 'Unknown';
          }
        } else {
          // No ChargingSession found - determine mode from stop reason if available
          // If stop reason is from OCPP, it's likely charger initiated
          if (stopReason && stopReason !== 'Unknown') {
            formattedStopReason = 'Charger initiated';
          }
        }
      } catch (error) {
        console.error('Error fetching ChargingSession for entered amount:', error);
      }

      // Get vehicle information
      let vehicleInfo = null;
      if (chargingSession && chargingSession.vehicle) {
        vehicleInfo = {
          vehicleNumber: chargingSession.vehicle.vehicleNumber || 'N/A',
          brand: chargingSession.vehicle.brand || '',
          modelName: chargingSession.vehicle.modelName || ''
        };
      }

      completedSessions.push({
        transactionId: transactionId.toString(), // Transaction ID from charger
        sessionId: sessionId, // Unique session ID we generate
        deviceId: deviceId,
        connectorId: connectorId,
        stationName: chargingPoint.station ? chargingPoint.station.stationName : 'N/A',
        stationId: chargingPoint.station ? chargingPoint.station.stationId : null,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        energy: parseFloat(energy.toFixed(2)),
        enteredAmount: parseFloat(enteredAmount.toFixed(2)),
        billedAmount: parseFloat(billedAmount.toFixed(2)),
        refund: parseFloat(refundAmount.toFixed(2)),
        mode: sessionMode,
        sessionDuration: sessionDuration,
        stopReason: formattedStopReason,
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR',
        vehicle: vehicleInfo ? `${vehicleInfo.vehicleNumber}${vehicleInfo.brand ? ` (${vehicleInfo.brand}${vehicleInfo.modelName ? ` ${vehicleInfo.modelName}` : ''})` : ''}` : 'N/A'
      });
    }

    // Apply search filter
    let filteredSessions = completedSessions;
    if (search) {
      filteredSessions = completedSessions.filter(session =>
        session.stationName.toLowerCase().includes(search.toLowerCase()) ||
        session.deviceId.toLowerCase().includes(search.toLowerCase()) ||
        session.transactionId.toString().includes(search)
      );
    }

    // Sort by end time (most recent first)
    filteredSessions.sort((a, b) => {
      const timeA = new Date(a.endTime).getTime();
      const timeB = new Date(b.endTime).getTime();
      return timeB - timeA;
    });

    // Pagination
    const total = filteredSessions.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedSessions = filteredSessions.slice(offset, offset + limit);

    res.json({
      success: true,
      sessions: paginatedSessions,
      total,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error('Error fetching completed sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch completed sessions',
      message: error.message
    });
  }
});

// ============================================
// CUSTOMERS ROUTES
// ============================================

/**
 * GET /api/cms/customers
 * Get all customers with their statistics
 * Query params: searchTerm, fromDate, toDate
 */
router.get('/customers', [
  query('searchTerm').optional().isString(),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { searchTerm = '', fromDate, toDate } = req.query;

    // Build where clause for customers
    const where = {};

    // Add search filter
    if (searchTerm) {
      where[Op.or] = [
        { fullName: { [Op.iLike]: `%${searchTerm}%` } },
        { phone: { [Op.iLike]: `%${searchTerm}%` } },
        { email: { [Op.iLike]: `%${searchTerm}%` } }
      ];
    }

    // Add date filter
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt[Op.gte] = new Date(fromDate);
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = endDate;
      }
    }

    // Get customers with their default vehicle and wallet
    const customers = await Customer.findAll({
      where,
      include: [
        {
          model: Vehicle,
          as: 'vehicles',
          required: false,
          separate: true,
          order: [['createdAt', 'ASC']],
          limit: 1
        },
        {
          model: Wallet,
          as: 'wallet',
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Get statistics for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        // Get charging sessions statistics
        const sessions = await ChargingSession.findAll({
          where: {
            customerId: customer.id,
            status: {
              [Op.in]: ['completed', 'stopped']
            }
          },
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('id')), 'totalSessions'],
            [sequelize.fn('SUM', sequelize.col('energyConsumed')), 'totalEnergy'],
            [sequelize.fn('MAX', sequelize.col('endTime')), 'lastActive']
          ],
          raw: true
        });

        // Calculate average duration
        const sessionsWithDuration = await ChargingSession.findAll({
          where: {
            customerId: customer.id,
            status: {
              [Op.in]: ['completed', 'stopped']
            },
            startTime: { [Op.not]: null },
            endTime: { [Op.not]: null }
          },
          attributes: ['startTime', 'endTime']
        });

        let avgDurationFormatted = '00:00:00';
        if (sessionsWithDuration.length > 0) {
          const totalDurationMs = sessionsWithDuration.reduce((sum, session) => {
            const duration = new Date(session.endTime) - new Date(session.startTime);
            return sum + duration;
          }, 0);
          const avgDurationMs = totalDurationMs / sessionsWithDuration.length;
          
          // Convert to HH:MM:SS format
          const hours = Math.floor(avgDurationMs / (1000 * 60 * 60));
          const minutes = Math.floor((avgDurationMs % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((avgDurationMs % (1000 * 60)) / 1000);
          
          avgDurationFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        const stats = sessions[0] || {};
        const defaultVehicle = customer.vehicles && customer.vehicles[0];
        
        // Get wallet balance
        const wallet = customer.wallet || { balance: 0 };
        const walletBalance = parseFloat(wallet.balance) || 0;
        
        // Calculate total billed amount from all completed sessions
        const sessionsForBilling = await ChargingSession.findAll({
          where: {
            customerId: customer.id,
            status: {
              [Op.in]: ['completed', 'stopped']
            },
            finalAmount: { [Op.not]: null }
          },
          attributes: [
            [sequelize.fn('SUM', sequelize.col('finalAmount')), 'totalBilled']
          ],
          raw: true
        });
        
        const totalBilledAmount = parseFloat(sessionsForBilling[0]?.totalBilled || 0) || 0;
        
        // Determine status based on lastActive date (Active if within last 15 days)
        let status = 'Inactive';
        if (stats.lastActive) {
          const lastActiveDate = new Date(stats.lastActive);
          const daysSinceLastActive = (Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24);
          status = daysSinceLastActive <= 15 ? 'Active' : 'Inactive';
        }

        return {
          id: customer.id,
          customerName: customer.fullName,
          phone: customer.phone,
          email: customer.email,
          noSessions: parseInt(stats.totalSessions) || 0,
          totalEnergy: parseFloat(stats.totalEnergy) || 0,
          avgDuration: avgDurationFormatted,
          defaultVehicle: defaultVehicle 
            ? `${defaultVehicle.brand || ''} ${defaultVehicle.modelName || ''}`.trim() 
            : null,
          lastActive: stats.lastActive || null,
          createdAt: customer.createdAt,
          walletBalance: walletBalance,
          totalBilledAmount: totalBilledAmount,
          status: status
        };
      })
    );

    res.json({
      success: true,
      customers: customersWithStats,
      total: customersWithStats.length
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/customers/:customerId/wallet-transactions
 * Get wallet transactions for a specific customer
 */
router.get('/customers/:customerId/wallet-transactions', [
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { customerId } = req.params;
    const { fromDate, toDate } = req.query;

    // Verify customer exists
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Build where clause
    const where = {
      customerId: customerId
    };

    // Add date filter
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt[Op.gte] = new Date(fromDate);
      }
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = endDate;
      }
    }

    // Get wallet transactions
    const transactions = await WalletTransaction.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    // Format transactions
    const formattedTransactions = transactions.map((txn) => ({
      id: txn.id,
      customerId: txn.customerId,
      customerName: customer.fullName,
      transactionId: `TXN${String(txn.id).padStart(6, '0')}`,
      dateTime: txn.createdAt,
      type: (txn.transactionType === 'credit' || txn.transactionType === 'refund') ? 'Credit' : 'Debit',
      amount: parseFloat(txn.amount),
      balance: parseFloat(txn.balanceAfter),
      description: txn.description,
      referenceId: txn.referenceId || '-',
      status: txn.status
    }));

    res.json({
      success: true,
      transactions: formattedTransactions,
      total: formattedTransactions.length,
      customerName: customer.fullName
    });
  } catch (error) {
    console.error('Error fetching wallet transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet transactions',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/customers/:customerId
 * Get customer details by ID
 */
router.get('/customers/:customerId', [
  param('customerId').isInt().withMessage('Customer ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { customerId } = req.params;

    const customer = await Customer.findByPk(customerId, {
      include: [
        {
          model: Wallet,
          as: 'wallet',
          required: false
        },
        {
          model: Vehicle,
          as: 'vehicles',
          required: false,
          separate: true,
          order: [['createdAt', 'ASC']],
          limit: 1
        }
      ]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Get statistics
    const sessions = await ChargingSession.findAll({
      where: { customerId: customer.id },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSessions'],
        [sequelize.fn('SUM', sequelize.col('energyConsumed')), 'totalEnergy'],
        [sequelize.fn('MAX', sequelize.col('endTime')), 'lastActive']
      ],
      raw: true
    });

    const stats = sessions[0] || {};
    const wallet = customer.wallet || { balance: 0 };
    const defaultVehicle = customer.vehicles && customer.vehicles[0];

    res.json({
      success: true,
      customer: {
        id: customer.id,
        customerName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        createdAt: customer.createdAt,
        walletBalance: parseFloat(wallet.balance) || 0,
        noSessions: parseInt(stats.totalSessions) || 0,
        totalEnergy: parseFloat(stats.totalEnergy) || 0,
        lastActive: stats.lastActive || null,
        defaultVehicle: defaultVehicle ? {
          vehicleNumber: defaultVehicle.vehicleNumber,
          brand: defaultVehicle.brand,
          modelName: defaultVehicle.modelName,
          vehicleType: defaultVehicle.vehicleType,
          connectorType: defaultVehicle.connectorType,
          batteryCapacity: parseFloat(defaultVehicle.batteryCapacity) || 0
        } : null
      }
    });
  } catch (error) {
    console.error('Error fetching customer details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer details',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/customers/:customerId/vehicles
 * Get all vehicles for a specific customer
 */
router.get('/customers/:customerId/vehicles', [
  param('customerId').isInt().withMessage('Customer ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { customerId } = req.params;

    // Verify customer exists
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    const vehicles = await Vehicle.findAll({
      where: { customerId: customerId },
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
        batteryCapacity: parseFloat(vehicle.batteryCapacity) || 0,
        createdAt: vehicle.createdAt,
        updatedAt: vehicle.updatedAt
      })),
      total: vehicles.length
    });
  } catch (error) {
    console.error('Error fetching customer vehicles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer vehicles',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/customers/:customerId/sessions
 * Get charging sessions for a specific customer
 */
router.get('/customers/:customerId/sessions', [
  param('customerId').isInt().withMessage('Customer ID must be an integer'),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { customerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Verify customer exists
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Parse dates
    let fromDate = null;
    let toDate = null;
    
    if (req.query.fromDate) {
      fromDate = new Date(req.query.fromDate);
      fromDate.setHours(0, 0, 0, 0);
    }
    
    if (req.query.toDate) {
      toDate = new Date(req.query.toDate);
      toDate.setHours(23, 59, 59, 999);
    }

    // Build where clause
    const whereClause = {
      customerId: customerId,
      status: {
        [Op.in]: ['stopped', 'completed']
      }
    };

    if (fromDate || toDate) {
      whereClause.endTime = {};
      if (fromDate) {
        whereClause.endTime[Op.gte] = fromDate;
      }
      if (toDate) {
        whereClause.endTime[Op.lte] = toDate;
      }
    }

    // Get sessions
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
        },
        {
          model: Vehicle,
          as: 'vehicle',
          attributes: ['id', 'vehicleNumber', 'brand', 'modelName'],
          required: false
        }
      ],
      order: [['endTime', 'DESC'], ['createdAt', 'DESC']],
      limit: limit,
      offset: offset
    });

    // Format sessions
    const formattedSessions = sessions.map(session => {
      const tariff = session.chargingPoint?.tariff;
      const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
      const tax = tariff ? parseFloat(tariff.tax) : 0;

      // Determine mode - customer sessions are always from App
      const sessionMode = 'App';
      
      // Format stop reason
      let formattedStopReason = session.stopReason || 'Unknown';
      if (session.stopReason === 'Remote (CMS)') {
        formattedStopReason = 'Stopped from CMS';
      } else if (session.stopReason === 'Remote') {
        formattedStopReason = 'User stopped charging';
      } else if (session.stopReason && session.stopReason !== 'Unknown') {
        formattedStopReason = 'Charger initiated';
      }

      // Get vehicle information
      let vehicleInfo = null;
      if (session.vehicle) {
        vehicleInfo = `${session.vehicle.vehicleNumber || 'N/A'}${session.vehicle.brand ? ` (${session.vehicle.brand}${session.vehicle.modelName ? ` ${session.vehicle.modelName}` : ''})` : ''}`;
      }

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
        amountDeducted: parseFloat(session.amountDeducted || 0),
        refundAmount: parseFloat(session.refundAmount || 0),
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR',
        status: session.status,
        mode: sessionMode,
        stopReason: formattedStopReason,
        vehicle: vehicleInfo || 'N/A'
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
    console.error('Error fetching customer sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer sessions',
      message: error.message
    });
  }
});

// ============================================
// DASHBOARD STATISTICS
// ============================================

/**
 * Helper function to check if a charger has a fault
 */
async function hasFault(deviceId) {
  try {
    const ChargerData = require('../models/ChargerData');
    
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
 * GET /api/cms/dashboard/stats
 * Get dashboard statistics and overview
 */
router.get('/dashboard/stats', async (req, res) => {
  try {
    // Date calculations
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Get total customers
    const totalCustomers = await Customer.count();
    
    // Get active sessions
    const activeSessions = await ChargingSession.count({
      where: {
        status: {
          [Op.in]: ['pending', 'active']
        }
      }
    });
    
    // Calculate total billed amount, energy, and sessions using the same method as stations list
    // (using calculateSessionStats which calculates from MeterValues - same as stations table)
    const allStations = await Station.findAll({
      where: { deleted: false },
      attributes: ['id']
    });
    
    let totalBilledAmount = 0;
    let totalEnergy = 0;
    let totalSessionsCount = 0;
    
    for (const station of allStations) {
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
          }
        ],
        attributes: ['id', 'deviceId']
      });
      
      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          const sessionStats = await calculateSessionStats(cp.deviceId, cp);
          totalSessionsCount += sessionStats.sessions;
          totalEnergy += sessionStats.energy;
          totalBilledAmount += sessionStats.billedAmount;
        }
      }
    }
    
    const totalRevenue = parseFloat(totalBilledAmount.toFixed(2));
    const totalEnergyRounded = parseFloat(totalEnergy.toFixed(2));
    const totalSessions = totalSessionsCount;
    
    // Get total stations
    const totalStations = await Station.count({
      where: {
        deleted: false
      }
    });
    
    // Get total chargers
    const totalChargers = await ChargingPoint.count({
      where: {
        deleted: false
      }
    });
    
    // Calculate real-time station status based on charging point lastSeen (same as stations list)
    const allStationsForStatus = await Station.findAll({
      where: { deleted: false },
      attributes: ['id', 'stationName']
    });
    
    let stationsOnline = 0;
    let stationsOffline = 0;
    const offlineStationsList = [];
    const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
    
    for (const station of allStationsForStatus) {
      const chargingPoints = await ChargingPoint.findAll({
        where: {
          stationId: station.id,
          deleted: false
        },
        attributes: ['id', 'deviceId']
      });
      
      let onlineCPs = 0;
      
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
      
      // Station is online if at least 1 CP is online
      if (onlineCPs >= 1) {
        stationsOnline++;
      } else {
        stationsOffline++;
        offlineStationsList.push({
          id: station.id,
          stationName: station.stationName,
          status: 'Offline'
        });
      }
    }
    
    const offlineStations = offlineStationsList.slice(0, 10); // Limit to 10
    
    // Helper function to check if charging point has active transaction (same as charging points list)
    async function hasActiveTransaction(deviceId) {
      try {
        if (!deviceId) {
          return false;
        }

        // First, check for active ChargingSession records (most reliable)
        const ChargingSession = require('../models/ChargingSession');
        const activeSession = await ChargingSession.findOne({
      where: {
            deviceId: deviceId,
            status: ['pending', 'active'],
            endTime: null
          },
          order: [['createdAt', 'DESC']]
        });

        if (activeSession) {
          return true;
        }

        // Get all recent logs for this device (more comprehensive check)
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

        // Check for recent StatusNotification with "Charging" status (within last 5 minutes)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const chargingStatusNotifications = allLogs.filter(log => {
          if (log.message !== 'StatusNotification' || log.direction !== 'Incoming') {
            return false;
          }
          const logTime = new Date(log.timestamp || log.createdAt).getTime();
          if (logTime < fiveMinutesAgo.getTime()) {
            return false;
          }
          let status = null;
          if (log.messageData && log.messageData.status) {
            status = log.messageData.status;
          } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
            status = log.raw[2].status;
          }
          return status === 'Charging';
        });

        // If we found recent StatusNotification with "Charging", check if there's a StopTransaction after it
        if (chargingStatusNotifications.length > 0) {
          const latestChargingStatus = chargingStatusNotifications.reduce((latest, current) => {
            const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
            const currentTime = new Date(current.timestamp || current.createdAt).getTime();
            return currentTime > latestTime ? current : latest;
          });
          
          const statusTime = new Date(latestChargingStatus.timestamp || latestChargingStatus.createdAt).getTime();
          
          // Check if there's a StopTransaction after this StatusNotification
          const stopAfterStatus = allLogs.find(log => {
            if (log.message !== 'StopTransaction' || log.direction !== 'Incoming') {
              return false;
            }
            const logTime = new Date(log.timestamp || log.createdAt).getTime();
            return logTime > statusTime;
          });
          
          // If no StopTransaction after the charging status, charging is active
          if (!stopAfterStatus) {
            return true;
          }
        }

        // Check for recent MeterValues (within last 5 minutes) - indicates active charging
        const recentMeterValues = allLogs.filter(log => {
          if (log.message !== 'MeterValues' || log.direction !== 'Incoming') {
            return false;
          }
          const logTime = new Date(log.timestamp || log.createdAt).getTime();
          return logTime >= fiveMinutesAgo.getTime();
        });

        if (recentMeterValues.length > 0) {
          // Get the latest MeterValues
          const latestMeter = recentMeterValues.reduce((latest, current) => {
            const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
            const currentTime = new Date(current.timestamp || current.createdAt).getTime();
            return currentTime > latestTime ? current : latest;
          });
          
          const meterTime = new Date(latestMeter.timestamp || latestMeter.createdAt).getTime();
          
          // Extract transactionId from MeterValues
          let meterTransactionId = null;
          if (latestMeter.messageData && latestMeter.messageData.transactionId) {
            meterTransactionId = latestMeter.messageData.transactionId;
          } else if (latestMeter.raw && Array.isArray(latestMeter.raw) && latestMeter.raw[2] && latestMeter.raw[2].transactionId) {
            meterTransactionId = latestMeter.raw[2].transactionId;
          }
          
          // Check if there's a StopTransaction after this MeterValues (by time or by transactionId)
          const stopAfterMeter = allLogs.find(log => {
            if (log.message !== 'StopTransaction' || log.direction !== 'Incoming') {
              return false;
            }
            const logTime = new Date(log.timestamp || log.createdAt).getTime();
            
            // First check by time
            if (logTime > meterTime) {
              // If we have transactionId, also match by transactionId for accuracy
              if (meterTransactionId) {
                let logTransactionId = null;
                if (log.messageData && log.messageData.transactionId) {
                  logTransactionId = log.messageData.transactionId;
                } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId) {
                  logTransactionId = log.raw[2].transactionId;
                }
                // If transactionId matches, this is definitely the stop for this transaction
                if (logTransactionId && logTransactionId.toString() === meterTransactionId.toString()) {
                  return true;
                }
              }
              // If no transactionId match but time is after, still consider it (might be same transaction)
              return true;
            }
            return false;
          });
          
          // If no StopTransaction after MeterValues, charging is active
          if (!stopAfterMeter) {
            return true;
          }
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
          if (currentTime > latestTime) return current;
          if (currentTime < latestTime) return latest;
          const latestId = latest.id || 0;
          const currentId = current.id || 0;
          return currentId > latestId ? current : latest;
        });

        // Check if StartTransaction is recent (within last 2 hours)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
        if (startTime < twoHoursAgo.getTime()) {
          return false;
        }

        // Find the response to this StartTransaction
        const startResponse = allLogs.find(log => 
          log.message === 'Response' && 
          log.messageId === latestStart.messageId &&
          log.direction === 'Outgoing'
        );

        // Get transactionId
        let transactionId = null;
        if (startResponse) {
          if (startResponse.messageData && startResponse.messageData.transactionId) {
            transactionId = startResponse.messageData.transactionId;
          } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
            transactionId = startResponse.raw[2].transactionId;
          }
        }

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

        // Check for StopTransaction with same transactionId
        const stopTransaction = allLogs.find(log => 
          log.message === 'StopTransaction' && 
          log.direction === 'Incoming' &&
          (
            (log.messageData && log.messageData.transactionId === transactionId) || 
            (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
          )
        );

        // If no StopTransaction found, transaction is active
        if (!stopTransaction) {
          return true;
        }

        return false;
      } catch (error) {
        console.error('Error checking active transaction for deviceId:', deviceId, error);
        return false;
      }
    }
    
    // Get charger status breakdown - calculate dynamically (same as charging points list)
    const allChargers = await ChargingPoint.findAll({
      where: { deleted: false },
      attributes: ['id', 'deviceId', 'deviceName']
    });
    
    // Calculate status for each charger dynamically
    let chargersAvailable = 0;
    let chargersBusy = 0;
    let chargersUnavailable = 0;
    const faultedChargersList = [];
    
    for (const charger of allChargers) {
      if (!charger.deviceId) {
        chargersUnavailable++;
        continue;
      }
      
      // Fetch charger data to get lastSeen
      const chargerData = await Charger.findOne({
        where: { deviceId: charger.deviceId },
        attributes: ['lastSeen', 'status']
      });
      
      // Calculate real-time status based on lastSeen
      const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
      let realTimeStatus = 'Offline';
      if (chargerData && chargerData.lastSeen) {
        const lastActiveTime = new Date(chargerData.lastSeen);
        const now = new Date();
        const timeDiff = now - lastActiveTime;
        const isOnline = timeDiff <= OFFLINE_THRESHOLD;
        realTimeStatus = isOnline ? 'Online' : 'Offline';
      }
      
      // Calculate C.STATUS (Connector Status) - same logic as charging points list
      let cStatus = 'Unavailable'; // Default
      if (realTimeStatus === 'Offline') {
        cStatus = 'Unavailable';
        chargersUnavailable++;
      } else {
        // Check for faults first
      const hasFaultStatus = await hasFault(charger.deviceId);
      if (hasFaultStatus) {
          cStatus = 'Faulted';
        faultedChargersList.push({
          id: charger.id,
          deviceName: charger.deviceName,
          deviceId: charger.deviceId
        });
        } else {
          // Check for active charging
          const isCharging = await hasActiveTransaction(charger.deviceId);
          if (isCharging) {
            cStatus = 'Charging';
            chargersBusy++;
          } else {
            cStatus = 'Available';
            chargersAvailable++;
          }
        }
      }
    }
    
    const chargersFaulted = faultedChargersList.length;
    
    // Today's stats - calculate using same method as stations list (calculateSessionStatsForDateRange)
    let todayBilledAmount = 0;
    let todayEnergy = 0;
    let todaySessions = 0;
    
    for (const station of allStations) {
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
          }
        ],
        attributes: ['id', 'deviceId']
      });
      
      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          // Get session stats for today only
          const sessionStats = await calculateSessionStatsForDateRange(cp.deviceId, cp, todayStart, now);
          todaySessions += sessionStats.sessions;
          todayEnergy += sessionStats.energy;
          todayBilledAmount += sessionStats.billedAmount;
        }
      }
    }
    
    const todayRevenue = parseFloat(todayBilledAmount.toFixed(2));
    const todayEnergyRounded = parseFloat(todayEnergy.toFixed(2));
    
    const todayNewCustomers = await Customer.count({
      where: {
        createdAt: {
          [Op.gte]: todayStart
        }
      }
    });
    
    // Week stats - calculate using same method as stations list
    let weekBilledAmount = 0;
    let weekEnergy = 0;
    let weekSessions = 0;
    
    for (const station of allStations) {
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
          }
        ],
        attributes: ['id', 'deviceId']
      });
      
      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          const sessionStats = await calculateSessionStatsForDateRange(cp.deviceId, cp, weekStart, now);
          weekSessions += sessionStats.sessions;
          weekEnergy += sessionStats.energy;
          weekBilledAmount += sessionStats.billedAmount;
        }
      }
    }
    
    const weekRevenue = parseFloat(weekBilledAmount.toFixed(2));
    
    const weekNewCustomers = await Customer.count({
      where: {
        createdAt: {
          [Op.gte]: weekStart
        }
      }
    });
    
    // Month stats - calculate using same method as stations list
    let monthBilledAmount = 0;
    let monthEnergy = 0;
    let monthSessions = 0;
    
    for (const station of allStations) {
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
          }
        ],
        attributes: ['id', 'deviceId']
      });
      
      for (const cp of chargingPoints) {
        if (cp.deviceId) {
          const sessionStats = await calculateSessionStatsForDateRange(cp.deviceId, cp, monthStart, now);
          monthSessions += sessionStats.sessions;
          monthEnergy += sessionStats.energy;
          monthBilledAmount += sessionStats.billedAmount;
        }
      }
    }
    
    const monthRevenue = parseFloat(monthBilledAmount.toFixed(2));
    
    const monthNewCustomers = await Customer.count({
      where: {
        createdAt: {
          [Op.gte]: monthStart
        }
      }
    });
    
    // Top performing stations by energy (using calculateSessionStats - same as dashboard)
    let formattedTopStationsByEnergy = [];
    try {
      const stationsForTop = await Station.findAll({
        where: { deleted: false },
        attributes: ['id', 'stationName', 'stationId']
      });
      
      const stationStats = [];
      
      for (const station of stationsForTop) {
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
            }
          ],
          attributes: ['id', 'deviceId']
        });
        
        let totalEnergy = 0;
        let totalSessions = 0;
        
        for (const cp of chargingPoints) {
          if (cp.deviceId) {
            const sessionStats = await calculateSessionStats(cp.deviceId, cp);
            totalSessions += sessionStats.sessions;
            totalEnergy += sessionStats.energy;
          }
        }
        
        if (totalSessions > 0) {
          stationStats.push({
            stationId: station.stationId,
            stationName: station.stationName || 'Unknown',
            energy: parseFloat(totalEnergy.toFixed(2)),
            sessions: totalSessions
          });
        }
      }
      
      // Sort by energy descending and take top 5
      formattedTopStationsByEnergy = stationStats
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 5);
    } catch (error) {
      console.error('Error fetching top stations by energy:', error);
      formattedTopStationsByEnergy = [];
    }
    
    // Top sessions by energy (individual sessions, using MeterValues calculation)
    // Note: This uses stored energyConsumed for performance, but we could calculate from MeterValues if needed
    // For now, using energyConsumed as it's already calculated and stored
    let formattedTopSessionsByEnergy = [];
    try {
      const topSessions = await ChargingSession.findAll({
        where: {
          status: {
            [Op.in]: ['completed', 'stopped']
          },
          energyConsumed: {
            [Op.ne]: null,
            [Op.gt]: 0
          }
        },
        include: [
          {
            model: ChargingPoint,
            as: 'chargingPoint',
            attributes: ['id', 'deviceName', 'deviceId'],
            include: [
              {
                model: Station,
                as: 'station',
                attributes: ['id', 'stationName', 'stationId'],
                where: { deleted: false },
                required: true
              }
            ],
            where: { deleted: false },
            required: true
          },
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'fullName'],
            required: true
          }
        ],
        attributes: ['id', 'energyConsumed', 'startTime'],
        order: [['energyConsumed', 'DESC']],
        limit: 5
      });
      
      formattedTopSessionsByEnergy = topSessions.map(session => ({
        sessionId: session.id,
        stationId: session.chargingPoint?.station?.stationId || null,
        energy: parseFloat(session.energyConsumed) || 0,
        stationName: session.chargingPoint?.station?.stationName || 'Unknown',
        chargerName: session.chargingPoint?.deviceName || 'Unknown',
        customerName: session.customer?.fullName || 'Unknown',
        startTime: session.startTime
      }));
    } catch (error) {
      console.error('Error fetching top sessions by energy:', error);
      formattedTopSessionsByEnergy = [];
    }
    
    // Calculate average session duration
    const completedSessions = await ChargingSession.findAll({
      attributes: ['startTime', 'endTime'],
      where: {
        status: {
          [Op.in]: ['completed', 'stopped']
        },
        startTime: {
          [Op.ne]: null
        },
        endTime: {
          [Op.ne]: null
        }
      },
      limit: 100 // Last 100 sessions for average
    });
    
    let avgDuration = '00:00:00';
    if (completedSessions.length > 0) {
      const validSessions = [];
      const totalDurationMs = completedSessions.reduce((sum, session) => {
        // Validate dates before calculation
        const startTime = new Date(session.startTime);
        const endTime = new Date(session.endTime);
        
        // Skip if dates are invalid or if endTime is before startTime
        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime()) || endTime < startTime) {
          return sum;
        }
        
        const duration = endTime - startTime;
        
        // Skip if duration is negative or unreasonably large (more than 24 hours)
        if (duration < 0 || duration > 24 * 60 * 60 * 1000) {
          return sum;
        }
        
        validSessions.push(session);
        return sum + duration;
      }, 0);
      
      // Only calculate average if we have valid sessions
      if (validSessions.length > 0) {
        const avgDurationMs = totalDurationMs / validSessions.length;
      const hours = Math.floor(avgDurationMs / (1000 * 60 * 60));
      const minutes = Math.floor((avgDurationMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((avgDurationMs % (1000 * 60)) / 1000);
      avgDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    }
    
    // Get recent sessions (last 10)
    const recentSessions = await ChargingSession.findAll({
      limit: 10,
      where: {
        startTime: {
          [Op.ne]: null
        }
      },
      order: [['startTime', 'DESC']],
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['fullName']
        },
        {
          model: ChargingPoint,
          as: 'chargingPoint',
          attributes: ['deviceName', 'deviceId'],
          include: [
            {
              model: Station,
              as: 'station',
              attributes: ['stationName']
            },
            {
              model: Tariff,
              as: 'tariff',
              attributes: ['id', 'baseCharges', 'tax']
            }
          ]
        }
      ]
    });
    
    // Format recent sessions with billed amount calculation
    const formattedRecentSessions = recentSessions
      .filter(session => session.startTime !== null)
      .map(session => {
        const energy = parseFloat(session.energyConsumed) || 0;
        const tariff = session.chargingPoint?.tariff;
        const baseCharges = tariff ? parseFloat(tariff.baseCharges) || 0 : 0;
        const tax = tariff ? parseFloat(tariff.tax) || 0 : 0;
        
        // Calculate billed amount: (Energy × Base Charge) × (1 + Tax/100)
        const baseAmount = energy * baseCharges;
        const taxMultiplier = 1 + (tax / 100);
        const billedAmount = baseAmount * taxMultiplier;
        
        return {
          customerName: session.customer?.fullName || 'Unknown',
          stationName: session.chargingPoint?.station?.stationName || session.chargingPoint?.deviceName || 'Unknown',
          amount: parseFloat(session.finalAmount) || parseFloat(session.amountDeducted) || 0,
          startTime: session.startTime,
          status: session.status,
          energy: parseFloat(energy.toFixed(2)),
          billedAmount: parseFloat(billedAmount.toFixed(2))
        };
      });
    
    // Get recent customers (last 10)
    const recentCustomers = await Customer.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'fullName', 'phone', 'createdAt']
    });
    
    // Get low balance customers (wallet balance < 100)
    let lowBalanceCustomers = [];
    try {
      lowBalanceCustomers = await Customer.findAll({
        include: [
          {
            model: Wallet,
            as: 'wallet',
            attributes: ['balance'],
            where: {
              balance: {
                [Op.lt]: 100
              }
            },
            required: true
          }
        ],
        attributes: ['id', 'fullName', 'phone'],
        limit: 10
      });
    } catch (error) {
      console.error('Error fetching low balance customers:', error);
      lowBalanceCustomers = [];
    }
    
    // Calculate month-over-month changes (mock for now)
    const customersChange = 12.5;
    const sessionsChange = 18.3;
    const revenueChange = 23.7;
    const energyChange = 15.8;
    
    res.json({
      success: true,
      stats: {
        totalCustomers,
        activeSessions,
        totalSessions,
        totalRevenue,
        totalEnergy,
        totalStations,
        totalChargers,
        avgDuration,
        stationsOnline,
        chargersAvailable,
        customersChange,
        sessionsChange,
        revenueChange,
        energyChange
      },
      todayStats: {
        sessions: todaySessions,
        revenue: todayRevenue,
        energy: todayEnergyRounded,
        newCustomers: todayNewCustomers
      },
      weekStats: {
        sessions: weekSessions,
        revenue: weekRevenue,
        energy: parseFloat(weekEnergy.toFixed(2)),
        newCustomers: weekNewCustomers
      },
      monthStats: {
        sessions: monthSessions,
        revenue: monthRevenue,
        energy: parseFloat(monthEnergy.toFixed(2)),
        newCustomers: monthNewCustomers
      },
      stationStatus: {
        online: stationsOnline,
        offline: stationsOffline,
        offlineStations: offlineStations.map(s => ({
          id: s.id,
          name: s.stationName,
          status: s.status
        }))
      },
      chargerStatus: {
        available: chargersAvailable,
        busy: chargersBusy,
        unavailable: chargersUnavailable,
        faulted: chargersFaulted,
        faultedChargers: faultedChargersList.map(c => ({
          id: c.id,
          name: c.deviceName,
          deviceId: c.deviceId
        }))
      },
      topStationsByEnergy: formattedTopStationsByEnergy,
      topSessionsByEnergy: formattedTopSessionsByEnergy,
      alerts: {
        offlineStations: offlineStations.map(s => ({
          id: s.id,
          name: s.stationName,
          status: s.status
        })),
        faultedChargers: faultedChargersList.map(c => ({
          id: c.id,
          name: c.deviceName,
          deviceId: c.deviceId
        })),
        lowBalanceCustomers: lowBalanceCustomers.map(c => ({
          id: c.id,
          name: c.fullName,
          phone: c.phone,
          balance: parseFloat(c.wallet?.balance) || 0
        }))
      },
      recentSessions: formattedRecentSessions,
      recentCustomers
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/cms/dashboard/charts
 * Get chart data for sessions and revenue over time
 * Query params: period (7, 30, 90 days)
 * OPTIMIZED: Fetches all data in bulk and processes in memory
 */
router.get('/dashboard/charts', async (req, res) => {
  try {
    const period = parseInt(req.query.period) || 30;
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - period);
    startDate.setHours(0, 0, 0, 0); // Start of day
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    
    // Generate all dates in the period
    const allDates = [];
    for (let i = 0; i < period; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      allDates.push(dateStr);
    }
    
    // Initialize maps for sessions and revenue
    const sessionsMap = new Map();
    const revenueMap = new Map();
    allDates.forEach(dateStr => {
      sessionsMap.set(dateStr, 0);
      revenueMap.set(dateStr, 0);
    });
    
    // OPTIMIZATION: Fetch all data in bulk first
    // 1. Get all charging points with tariffs in one query
    const allChargingPoints = await ChargingPoint.findAll({
      where: { deleted: false },
      include: [
        {
          model: Tariff,
          as: 'tariff',
          attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
        }
      ],
      attributes: ['id', 'deviceId']
    });
    
    // Create deviceId -> chargingPoint map for quick lookup
    const deviceIdToChargingPoint = new Map();
    allChargingPoints.forEach(cp => {
      if (cp.deviceId) {
        deviceIdToChargingPoint.set(cp.deviceId, cp);
      }
    });
    
    const validDeviceIds = Array.from(deviceIdToChargingPoint.keys());
    
    if (validDeviceIds.length === 0) {
      // No charging points, return empty data
      const sessionsChartData = allDates.map(date => ({ date: date, count: 0 }));
      const revenueChartData = allDates.map(date => ({ date: date, revenue: 0 }));
      return res.json({
        success: true,
        period: period,
        sessions: sessionsChartData,
        revenue: revenueChartData
      });
    }
    
    // 2. Fetch all ChargingSession records for the period in one query
    const allChargingSessions = await ChargingSession.findAll({
      where: {
        deviceId: { [Op.in]: validDeviceIds },
        status: { [Op.in]: ['stopped', 'completed'] },
        endTime: { [Op.ne]: null },
        startTime: { [Op.gte]: startDate, [Op.lte]: endDate }
      },
      attributes: ['id', 'deviceId', 'transactionId', 'energyConsumed', 'finalAmount', 'startTime', 'endTime']
    });
    
    // 3. Fetch all StartTransaction logs for the period in one query
    const allStartTransactions = await ChargerData.findAll({
      where: {
        deviceId: { [Op.in]: validDeviceIds },
        message: 'StartTransaction',
        direction: 'Incoming',
        timestamp: { [Op.gte]: startDate, [Op.lte]: endDate }
      },
      attributes: ['id', 'deviceId', 'messageId', 'timestamp', 'messageData', 'raw', 'connectorId'],
      order: [['timestamp', 'ASC']]
    });
    
    // 4. Fetch all StopTransaction logs (need all to match with starts) in one query
    const allStopTransactions = await ChargerData.findAll({
      where: {
        deviceId: { [Op.in]: validDeviceIds },
        message: 'StopTransaction',
        direction: 'Incoming'
      },
      attributes: ['id', 'deviceId', 'timestamp', 'messageData', 'raw', 'connectorId'],
      order: [['timestamp', 'ASC']]
    });
    
    // 5. Fetch all StartTransaction Response messages to get transactionIds
    const startMessageIds = allStartTransactions.map(st => st.messageId).filter(Boolean);
    const allStartResponses = startMessageIds.length > 0 ? await ChargerData.findAll({
      where: {
        message: 'Response',
        messageId: { [Op.in]: startMessageIds },
        direction: 'Outgoing'
      },
      attributes: ['id', 'messageId', 'messageData', 'raw']
    }) : [];
    
    // Create messageId -> transactionId map
    const messageIdToTransactionId = new Map();
    allStartResponses.forEach(resp => {
      let transactionId = null;
      if (resp.messageData && resp.messageData.transactionId) {
        transactionId = resp.messageData.transactionId;
      } else if (resp.raw && Array.isArray(resp.raw) && resp.raw[2] && resp.raw[2].transactionId) {
        transactionId = resp.raw[2].transactionId;
      }
      if (transactionId) {
        messageIdToTransactionId.set(resp.messageId, transactionId.toString());
      }
    });
    
    // Create transactionId -> StopTransaction map
    const stopTransactionMap = new Map();
    allStopTransactions.forEach(stop => {
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
    
    // Create set of transactionIds from ChargingSession records (to avoid double counting)
    const chargingSessionTransactionIds = new Set();
    allChargingSessions.forEach(session => {
      if (session.transactionId) {
        chargingSessionTransactionIds.add(session.transactionId.toString());
      }
    });
    
    // Process ChargingSession records - group by date
    allChargingSessions.forEach(session => {
      const startDateObj = new Date(session.startTime);
      const dateStr = startDateObj.toISOString().split('T')[0];
      
      if (sessionsMap.has(dateStr)) {
        sessionsMap.set(dateStr, sessionsMap.get(dateStr) + 1);
        
        // Calculate revenue
        const chargingPoint = deviceIdToChargingPoint.get(session.deviceId);
        if (chargingPoint && chargingPoint.tariff && session.finalAmount) {
          revenueMap.set(dateStr, revenueMap.get(dateStr) + parseFloat(session.finalAmount));
        }
      }
    });
    
    // Process OCPP StartTransaction logs - only count those not in ChargingSession
    // For performance, we'll count sessions but skip detailed revenue calculation for OCPP-only sessions
    // (ChargingSession records already have revenue calculated)
    for (const start of allStartTransactions) {
      const transactionId = messageIdToTransactionId.get(start.messageId) || 
        (start.messageData && start.messageData.transactionId ? start.messageData.transactionId.toString() : null) ||
        (start.raw && Array.isArray(start.raw) && start.raw[2] && start.raw[2].transactionId ? start.raw[2].transactionId.toString() : null);
      
      if (!transactionId || chargingSessionTransactionIds.has(transactionId)) {
        continue; // Skip if already counted from ChargingSession
      }
      
      const stop = stopTransactionMap.get(transactionId);
      if (!stop) {
        continue; // No stop transaction, skip (incomplete session)
      }
      
      const startDateObj = new Date(start.timestamp || start.createdAt);
      const dateStr = startDateObj.toISOString().split('T')[0];
      
      if (sessionsMap.has(dateStr)) {
        sessionsMap.set(dateStr, sessionsMap.get(dateStr) + 1);
        // Note: Revenue for OCPP-only sessions would require fetching MeterValues which is expensive
        // Most sessions are in ChargingSession table which already has revenue, so this is acceptable
      }
    }
    
    // Format data for charts
    const sessionsChartData = allDates.map(date => ({
      date: date,
      count: sessionsMap.get(date) || 0
    }));
    
    const revenueChartData = allDates.map(date => ({
      date: date,
      revenue: parseFloat((revenueMap.get(date) || 0).toFixed(2))
    }));
    
    res.json({
      success: true,
      period: period,
      sessions: sessionsChartData,
      revenue: revenueChartData
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chart data',
      message: error.message
    });
  }
});

// ============================================
// CMS Remote Charging Controls
// ============================================

router.post('/charging/start', [
  body('deviceId').notEmpty().withMessage('deviceId is required'),
  body('connectorId').isInt({ min: 0 }).withMessage('connectorId is required'),
  body('amount').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { deviceId, connectorId, idTag } = req.body;
    const amount = parseFloat(req.body.amount) || 0;
    const connectorIdInt = parseInt(connectorId);
    const generatedSessionId = `CMS_${Date.now()}`;
    const idTagValue = idTag || 'CMS_ADMIN';

    // Check for existing active session on THIS specific charger/connector
    // Allow multiple sessions on different chargers, but not on the same charger/connector
    const existingSession = await ChargingSession.findOne({
      where: {
        deviceId: deviceId,
        connectorId: connectorIdInt,
        status: {
          [Op.in]: ['pending', 'active']
        },
        endTime: null
      }
    });

    if (existingSession) {
      return res.status(400).json({
        success: false,
        error: `Charging is already active on connector ${connectorIdInt} of charger ${deviceId}. Please stop the current session before starting a new one.`
      });
    }

    let useQueueFlow = ENABLE_RABBITMQ && publishChargingCommand;

    if (useQueueFlow) {
      try {
        const commandPublished = await publishChargingCommand({
          command: 'RemoteStartTransaction',
          deviceId,
          payload: {
            connectorId: connectorIdInt,
            idTag: idTagValue
          },
          sessionId: generatedSessionId,
          customerId: null,
          connectorId: connectorIdInt,
          idTag: idTagValue,
          transactionId: null,
          timestamp: new Date(),
          amountRequested: amount,
          useQueueFlow: true
        });

        if (commandPublished) {
          return res.json({
            success: true,
            sessionId: generatedSessionId,
            message: 'Charging command queued. Waiting for charger confirmation.'
          });
        } else {
          console.warn(`⚠️ [CMS] Failed to publish queue command for ${deviceId}, falling back to direct call`);
          useQueueFlow = false;
        }
      } catch (error) {
        console.error(`❌ [CMS] Error publishing queue command:`, error.message);
        useQueueFlow = false;
      }
    }

    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const fallbackResponse = await axios.post(
        `${backendUrl}/api/charger/remote-start`,
        {
          deviceId,
          connectorId: connectorIdInt,
          idTag: idTagValue
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000
        }
      );

      if (fallbackResponse.data && fallbackResponse.data.success) {
        return res.json({
          success: true,
          sessionId: null,
          message: fallbackResponse.data.message || 'Remote start command sent directly'
        });
      }

      return res.status(400).json({
        success: false,
        error: fallbackResponse.data?.error || 'Remote start command failed'
      });
    } catch (fallbackError) {
      console.error('❌ [CMS] Fallback remote start failed:', fallbackError.message);
      return res.status(500).json({
        success: false,
        error: fallbackError.response?.data?.error || fallbackError.message || 'Failed to send remote start command'
      });
    }
  } catch (error) {
    console.error('❌ [CMS] Error in charging start:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send charging start request',
      details: error.message
    });
  }
});

router.post('/charging/stop', [
  body('deviceId').notEmpty().withMessage('deviceId is required'),
  // transactionId is optional - backend will resolve it from sessionId or OCPP logs if not provided
  // Use custom validator that handles all cases (null, undefined, empty string, or any value)
  body('transactionId').custom((value) => {
    // Always allow - backend will resolve it if needed
    return true;
  }),
  body('sessionId').custom((value) => {
    // Allow null, undefined, empty string, or string
    if (value === null || value === undefined || value === '') {
      return true;
    }
    return typeof value === 'string';
  }),
  body('connectorId').custom((value) => {
    // Allow null, undefined, empty string, or valid integer (string or number)
    if (value === null || value === undefined || value === '') {
      return true;
    }
    // Handle both string and number types
    const parsed = typeof value === 'number' ? value : parseInt(value);
    return !isNaN(parsed) && parsed >= 0;
  }).withMessage('connectorId must be a valid integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { deviceId, transactionId, sessionId, connectorId } = req.body;
    // Normalize empty strings to null/undefined
    const normalizedTransactionId = (transactionId === '' || transactionId === 'null' || transactionId === 'undefined') ? null : transactionId;
    const normalizedConnectorId = (connectorId === '' || connectorId === 'null' || connectorId === 'undefined') ? null : connectorId;
    const normalizedSessionId = (sessionId === '' || sessionId === 'null' || sessionId === 'undefined') ? null : sessionId;
    const sessionIdValue = normalizedSessionId || `CMS_STOP_${Date.now()}`;

    console.log(`🛑 [CMS] Stop request received: deviceId=${deviceId}, transactionId=${normalizedTransactionId}, sessionId=${normalizedSessionId}, connectorId=${normalizedConnectorId}`);

    // Resolve actual OCPP transactionId
    // The frontend might pass a sessionId or pseudo transactionId, so we need to look up the real one
    let actualTransactionId = null;
    
    // First, check if transactionId is a valid number (real OCPP transactionId)
    const parsedTransactionId = normalizedTransactionId ? parseInt(normalizedTransactionId) : NaN;
    if (!isNaN(parsedTransactionId) && parsedTransactionId > 0) {
      actualTransactionId = parsedTransactionId;
      console.log(`✅ [CMS] transactionId is already a valid number: ${actualTransactionId}`);
    } else {
        // Not a valid number - try to look it up from active sessions or logs
        console.log(`🔍 [CMS] transactionId "${transactionId}" is not a number, looking up actual OCPP transactionId...`);
        
        const ChargerData = require('../models/ChargerData');
        const ChargingSession = require('../models/ChargingSession');
        
        // First, try to find from ChargingSession (if sessionId was provided)
        if (normalizedSessionId && normalizedSessionId !== sessionIdValue) {
          const session = await ChargingSession.findOne({
            where: {
              sessionId: normalizedSessionId,
              deviceId: deviceId,
              status: ['pending', 'active'],
              endTime: null
            }
          });
          
          if (session && session.transactionId) {
            actualTransactionId = parseInt(session.transactionId);
            console.log(`✅ [CMS] Found transactionId ${actualTransactionId} from session ${normalizedSessionId}`);
          }
        }
        
        // If not found from session, try to find from recent StartTransaction logs or MeterValues
        if (!actualTransactionId) {
          // First, try to get from recent MeterValues (most reliable - shows current active transaction)
          // CRITICAL FIX: Filter by connectorId if provided (more accurate) and recent timestamp
          const meterValueWhere = {
            deviceId: deviceId,
            message: 'MeterValues',
            direction: 'Incoming'
          };
          
          // Filter by connectorId if provided (more accurate for multi-connector chargers)
          if (normalizedConnectorId !== null && normalizedConnectorId !== undefined) {
            meterValueWhere.connectorId = parseInt(normalizedConnectorId);
          }
          
          // Filter by recent timestamp (last 2 hours) to avoid old transactions
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          meterValueWhere.timestamp = {
            [Op.gte]: twoHoursAgo
          };
          
          const recentMeterValue = await ChargerData.findOne({
            where: meterValueWhere,
            order: [['timestamp', 'DESC'], ['id', 'DESC']],
            limit: 1
          });
          
          if (recentMeterValue) {
            let txId = null;
            if (recentMeterValue.messageData && recentMeterValue.messageData.transactionId) {
              txId = recentMeterValue.messageData.transactionId;
            } else if (recentMeterValue.raw && Array.isArray(recentMeterValue.raw) && recentMeterValue.raw[2] && recentMeterValue.raw[2].transactionId) {
              txId = recentMeterValue.raw[2].transactionId;
            }
            
            if (txId) {
              // Verify this transaction is still active (no StopTransaction found)
              const stopTransaction = await ChargerData.findOne({
                where: {
                  deviceId: deviceId,
                  message: 'StopTransaction',
                  direction: 'Incoming'
                },
                order: [['timestamp', 'DESC']],
                limit: 1
              });
              
              let isStopped = false;
              if (stopTransaction) {
                let stopTxId = null;
                if (stopTransaction.messageData && stopTransaction.messageData.transactionId) {
                  stopTxId = stopTransaction.messageData.transactionId;
                } else if (stopTransaction.raw && Array.isArray(stopTransaction.raw) && stopTransaction.raw[2] && stopTransaction.raw[2].transactionId) {
                  stopTxId = stopTransaction.raw[2].transactionId;
                }
                
                if (stopTxId && stopTxId.toString() === txId.toString()) {
                  const stopTime = new Date(stopTransaction.timestamp || stopTransaction.createdAt).getTime();
                  const meterTime = new Date(recentMeterValue.timestamp || recentMeterValue.createdAt).getTime();
                  if (stopTime > meterTime) {
                    isStopped = true;
                  }
                }
              }
              
              if (!isStopped) {
                actualTransactionId = parseInt(txId);
                console.log(`✅ [CMS] Found active transactionId ${actualTransactionId} from MeterValues (connector ${connectorId || 'any'})`);
              }
            }
          }
          
          // Fallback: Get from StartTransaction logs if MeterValues didn't work
          if (!actualTransactionId) {
            // CRITICAL FIX: Filter by connectorId if provided (more accurate) and recent timestamp
            const startTransactionWhere = {
              deviceId: deviceId,
              message: 'StartTransaction',
              direction: 'Incoming'
            };
            
            // Filter by connectorId if provided (more accurate for multi-connector chargers)
            if (normalizedConnectorId !== null && normalizedConnectorId !== undefined) {
              startTransactionWhere.connectorId = parseInt(normalizedConnectorId);
            }
            
            // Filter by recent timestamp (last 2 hours) to avoid old transactions
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            startTransactionWhere.timestamp = {
              [Op.gte]: twoHoursAgo
            };
            
            // Get the most recent StartTransaction for this device/connector
            const startTransaction = await ChargerData.findOne({
              where: startTransactionWhere,
              order: [['timestamp', 'DESC'], ['id', 'DESC']],
              limit: 1
            });
            
            if (startTransaction) {
              // Extract transactionId from StartTransaction response
              const response = await ChargerData.findOne({
                where: {
                  deviceId: deviceId,
                  message: 'Response',
                  direction: 'Outgoing',
                  messageId: startTransaction.messageId
                }
              });
              
              if (response) {
                let txId = null;
                if (response.messageData && response.messageData.transactionId) {
                  txId = response.messageData.transactionId;
                } else if (response.raw && Array.isArray(response.raw) && response.raw[2] && response.raw[2].transactionId) {
                  txId = response.raw[2].transactionId;
                }
                
                if (txId) {
                  // Verify this transaction is still active (no StopTransaction found)
                  const stopTransaction = await ChargerData.findOne({
                    where: {
                      deviceId: deviceId,
                      message: 'StopTransaction',
                      direction: 'Incoming'
                    },
                    order: [['timestamp', 'DESC']],
                    limit: 1
                  });
                  
                  // Check if StopTransaction is for this transactionId
                  let isStopped = false;
                  if (stopTransaction) {
                    let stopTxId = null;
                    if (stopTransaction.messageData && stopTransaction.messageData.transactionId) {
                      stopTxId = stopTransaction.messageData.transactionId;
                    } else if (stopTransaction.raw && Array.isArray(stopTransaction.raw) && stopTransaction.raw[2] && stopTransaction.raw[2].transactionId) {
                      stopTxId = stopTransaction.raw[2].transactionId;
                    }
                    
                    // Check if StopTransaction is after StartTransaction and matches transactionId
                    if (stopTxId && stopTxId.toString() === txId.toString()) {
                      const stopTime = new Date(stopTransaction.timestamp || stopTransaction.createdAt).getTime();
                      const startTime = new Date(startTransaction.timestamp || startTransaction.createdAt).getTime();
                      if (stopTime > startTime) {
                        isStopped = true;
                      }
                    }
                  }
                  
                  // If not stopped, this is the active transaction
                  if (!isStopped) {
                    actualTransactionId = parseInt(txId);
                    console.log(`✅ [CMS] Found active transactionId ${actualTransactionId} from StartTransaction logs`);
                  }
                }
              }
            }
          }
        }
        
        if (!actualTransactionId) {
          return res.status(400).json({
            success: false,
            error: 'Could not find active charging session or transactionId. Please ensure charging is active and try again.'
          });
        }
      }

    console.log(`🛑 [CMS] Stopping charging with transactionId: ${actualTransactionId} (original: ${transactionId})`);

    let useQueueFlow = ENABLE_RABBITMQ && publishChargingCommand;

    if (useQueueFlow) {
      try {
        const commandPublished = await publishChargingCommand({
          command: 'RemoteStopTransaction',
          deviceId,
          payload: {
            transactionId: actualTransactionId
          },
          sessionId: sessionIdValue,
          customerId: null,
          connectorId: normalizedConnectorId ? parseInt(normalizedConnectorId) : null,
          transactionId: actualTransactionId,
          timestamp: new Date(),
          useQueueFlow: true
        });

        if (commandPublished) {
          return res.json({
            success: true,
            message: 'Stop command queued. Waiting for charger confirmation.'
          });
        } else {
          console.warn(`⚠️ [CMS] Failed to publish stop command for ${deviceId}, falling back to direct call`);
          useQueueFlow = false;
        }
      } catch (error) {
        console.error(`❌ [CMS] Error publishing stop command:`, error.message);
        useQueueFlow = false;
      }
    }

    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const fallbackResponse = await axios.post(
        `${backendUrl}/api/charger/remote-stop`,
        {
          deviceId,
          transactionId: actualTransactionId
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000
        }
      );

      if (fallbackResponse.data && fallbackResponse.data.success) {
        return res.json({
          success: true,
          message: fallbackResponse.data.message || 'Stop command sent directly'
        });
      }

      return res.status(400).json({
        success: false,
        error: fallbackResponse.data?.error || 'Remote stop command failed'
      });
    } catch (fallbackError) {
      console.error('❌ [CMS] Fallback remote stop failed:', fallbackError.message);
      return res.status(500).json({
        success: false,
        error: fallbackError.response?.data?.error || fallbackError.message || 'Failed to send remote stop command'
      });
    }
  } catch (error) {
    console.error('❌ [CMS] Error in charging stop:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send charging stop request',
      details: error.message
    });
  }
});

module.exports = router;

