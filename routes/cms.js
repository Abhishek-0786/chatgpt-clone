const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Tariff, Station, ChargingPoint, Connector } = require('../models');
const { Op } = require('sequelize');
const ChargerData = require('../models/ChargerData');

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
  query('organization').optional().isIn(['massive_mobility', '1c_ev_charging'])
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

    // Get stations
    const stations = await Station.findAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const Charger = require('../models/Charger');
    const ChargingPoint = require('../models/ChargingPoint');

    // Calculate online/offline stats and session statistics for each station
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

    res.json({
      success: true,
      stations: stationsWithStats,
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
    const Charger = require('../models/Charger');
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
    .isIn(['massive_mobility', '1c_ev_charging'])
    .withMessage('Organization must be massive_mobility or 1c_ev_charging'),
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
    .isIn(['massive_mobility', '1c_ev_charging'])
    .withMessage('Organization must be massive_mobility or 1c_ev_charging'),
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
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);
    const Charger = require('../models/Charger');

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
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);
    const Charger = require('../models/Charger');
    const ChargerData = require('../models/ChargerData');

    // Helper function to check if charging point has active transaction
    async function hasActiveTransaction(deviceId) {
      try {
        if (!deviceId) {
          return false;
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
    const Charger = require('../models/Charger');

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
        attributes: ['vendor', 'model', 'serialNumber', 'meterSerialNumber', 'firmwareVersion', 'lastSeen']
      });
    }

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
        // Charger data from Charger table
        chargeBoxSerialNumber: chargerData ? chargerData.meterSerialNumber : null,
        chargePointModel: chargerData ? chargerData.model : null,
        chargePointSerialNumber: chargerData ? chargerData.serialNumber : null,
        chargePointVendor: chargerData ? chargerData.vendor : null,
        chargerFirmwareVersion: chargerData ? chargerData.firmwareVersion : null,
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
 * Calculate session statistics for a charging point
 * Returns: { sessions: count, energy: total kWh, billedAmount: total amount }
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
      if (stopTransactionMap.has(transactionId.toString())) {
        continue; // This session is completed, skip
      }

      // Check if StartTransaction is recent (within last 24 hours)
      const startTime = new Date(start.timestamp || start.createdAt);
      const now = new Date();
      const hoursSinceStart = (now - startTime) / (1000 * 60 * 60);
      if (hoursSinceStart > 24) {
        continue; // Too old, consider it stale
      }

      processedTransactionIds.add(transactionId.toString());

      // Get deviceId and connectorId
      const deviceId = start.deviceId;
      
      // Check if charger is actually online (lastSeen within 5 minutes)
      const Charger = require('../models/Charger');
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
      let connectorId = null;
      if (start.connectorId) {
        connectorId = start.connectorId;
      } else if (start.messageData && start.messageData.connectorId) {
        connectorId = start.messageData.connectorId;
      } else if (start.raw && Array.isArray(start.raw) && start.raw[2] && start.raw[2].connectorId) {
        connectorId = start.raw[2].connectorId;
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
        enteredAmount: 0, // TODO: Get from payment data if available
        billedAmount: parseFloat(billedAmount.toFixed(2)),
        refund: 0,
        mode: 'OCPP', // Default mode
        sessionDuration: sessionDuration,
        stopReason: null,
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR'
      });
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

    // Get all StartTransaction messages
    const startWhere = {
      message: 'StartTransaction',
      direction: 'Incoming'
    };
    if (fromDate) {
      startWhere.timestamp = { [Op.gte]: fromDate };
    }

    const startTransactions = await ChargerData.findAll({
      where: startWhere,
      order: [['timestamp', 'DESC']],
      limit: 10000
    });

    // Get all StopTransaction messages
    const stopWhere = {
      message: 'StopTransaction',
      direction: 'Incoming'
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

    // Find completed sessions (StartTransaction with corresponding StopTransaction)
    const completedSessions = [];
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
        enteredAmount: 0, // TODO: Get from payment data if available
        billedAmount: parseFloat(billedAmount.toFixed(2)),
        refund: 0,
        mode: 'OCPP', // Default mode
        sessionDuration: sessionDuration,
        stopReason: stopReason || 'Unknown',
        baseCharges: baseCharges,
        tax: tax,
        currency: tariff ? tariff.currency : 'INR'
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

module.exports = router;

