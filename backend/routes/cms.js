const express = require('express');
const { body, validationResult, query, param } = require('express-validator');
const { Tariff, Station, ChargingPoint, Connector, Customer, Vehicle, WalletTransaction, Wallet } = require('../models');
const { Op } = require('sequelize');
const ChargerData = require('../models/ChargerData');
const ChargingSession = require('../models/ChargingSession');
const Charger = require('../models/Charger');
const sequelize = require('../config/database');
const axios = require('axios');
const cacheController = require('../libs/redis/cacheController');
const { statusKey } = require('../libs/redis/keyNaming');
const redisClient = require('../libs/redis/redisClient');
const chargingController = require('../controllers/chargingController');
const tariffController = require('../controllers/tariffController');
const chargingPointController = require('../controllers/chargingPointController');
const cmsCustomerController = require('../controllers/cmsCustomerController');
const cmsDashboardController = require('../controllers/cmsDashboardController');
const cmsStationController = require('../controllers/cmsStationController');
const organizationController = require('../controllers/organizationController');
const { authenticateToken } = require('../middleware/auth');
const { uploadLogo, uploadMultipleDocuments, logosDir, documentsDir } = require('../config/multer');
const multer = require('multer');
const path = require('path');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishCMSEvent = null;
let publishChargingCommand = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../libs/rabbitmq/producer');
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

/**
 * Helper function to get system customer ID (cached for performance)
 */
let systemCustomerIdCache = null;
async function getSystemCustomerId() {
  if (systemCustomerIdCache !== null) {
    return systemCustomerIdCache;
  }
  try {
    const systemCustomer = await Customer.findOne({
      where: { email: 'system@cms.admin' },
      attributes: ['id']
    });
    systemCustomerIdCache = systemCustomer ? systemCustomer.id : null;
    return systemCustomerIdCache;
  } catch (error) {
    console.error('Error getting system customer ID:', error);
    return null;
  }
}

/**
 * Helper function to add system customer exclusion to ChargingSession where clause
 * @param {Object} whereClause - Existing where clause
 * @returns {Promise<Object>} - Updated where clause with system customer exclusion
 */
async function excludeSystemCustomerSessions(whereClause) {
  const systemCustomerId = await getSystemCustomerId();
  if (systemCustomerId !== null) {
    whereClause.customerId = {
      [Op.ne]: systemCustomerId
    };
  }
  return whereClause;
}

/**
 * Helper function to check if a customerId is the system customer (CMS)
 * @param {number|null} customerId - Customer ID to check
 * @returns {Promise<boolean>} - True if system customer
 */
async function isSystemCustomer(customerId) {
  if (!customerId || customerId === 0) return true;
  try {
    const systemCustomerId = await getSystemCustomerId();
    return customerId === systemCustomerId;
  } catch (error) {
    return false;
  }
}

/**
 * Helper function to map OCPP status to Online/Offline
 */
function mapOCPPStatusToOnlineOffline(ocppStatus) {
  if (!ocppStatus) return 'Offline';
  
  const onlineStatuses = ['Available', 'Charging', 'Preparing', 'Finishing'];
  const offlineStatuses = ['Faulted', 'Unavailable', 'Offline'];
  
  if (onlineStatuses.includes(ocppStatus)) {
    return 'Online';
  } else if (offlineStatuses.includes(ocppStatus)) {
    return 'Offline';
  }
  
  // Default to checking if it's a valid status that indicates online
  return 'Offline';
}

/**
 * Helper function to enhance cached responses with real-time status from Redis
 * This implements the hybrid approach: cache static data, overlay real-time status
 */
async function enhanceWithRealTimeStatus(items, deviceIdField = 'deviceId') {
  if (!Array.isArray(items)) {
    return items;
  }

  // Batch read all status keys for better performance
  const statusPromises = items
    .filter(item => item[deviceIdField])
    .map(item => {
      const key = statusKey(item[deviceIdField]);
      return redisClient.get(key).then(value => ({
        deviceId: item[deviceIdField],
        statusData: value ? JSON.parse(value) : null
      })).catch(() => ({
        deviceId: item[deviceIdField],
        statusData: null
      }));
    });

  const statusResults = await Promise.all(statusPromises);
  const statusMap = new Map();
  statusResults.forEach(result => {
    if (result.statusData) {
      statusMap.set(result.deviceId, result.statusData);
    }
  });

  // Batch read lastSeen for fallback
  const allDeviceIds = items.map(item => item[deviceIdField]).filter(Boolean);
  const chargerDataMap = new Map();
  if (allDeviceIds.length > 0) {
    const chargers = await Charger.findAll({
      where: { deviceId: { [Op.in]: allDeviceIds } },
      attributes: ['deviceId', 'lastSeen']
    });
    chargers.forEach(c => {
      chargerDataMap.set(c.deviceId, c.lastSeen);
    });
  }

  // Enhance items with real-time status
  const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  // Check for active transactions to determine C.STATUS correctly
  const ChargingSession = require('../models/ChargingSession');
  const activeSessionsMap = new Map();
  if (allDeviceIds.length > 0) {
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const activeSessionsWhere = {
      deviceId: { [Op.in]: allDeviceIds },
      status: ['pending', 'active'],
      endTime: null
    };
    if (systemCustomerId !== null) {
      activeSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const activeSessions = await ChargingSession.findAll({
      where: activeSessionsWhere,
      attributes: ['deviceId']
    });
    activeSessions.forEach(session => {
      activeSessionsMap.set(session.deviceId, true);
    });
  }

  return items.map(item => {
    if (!item[deviceIdField]) {
      return item;
    }

    const realTimeStatusData = statusMap.get(item[deviceIdField]);
    let finalStatus = item.status; // Default to cached status
    let cStatus = item.cStatus || 'Unavailable'; // Default to cached C.STATUS

    if (realTimeStatusData && realTimeStatusData.status) {
      // Map OCPP status to Online/Offline
      finalStatus = mapOCPPStatusToOnlineOffline(realTimeStatusData.status);
      
      // Determine C.STATUS: if there's an active session, it should be "Charging"
      // Otherwise use the OCPP status
      if (activeSessionsMap.has(item[deviceIdField])) {
        cStatus = 'Charging';
      } else {
        cStatus = realTimeStatusData.status;
      }
    } else {
      // Fallback to lastSeen check
      const lastSeen = chargerDataMap.get(item[deviceIdField]);
      if (lastSeen) {
        const lastActiveTime = new Date(lastSeen);
        const now = new Date();
        const timeDiff = now - lastActiveTime;
        if (timeDiff <= OFFLINE_THRESHOLD) {
          finalStatus = 'Online';
          // Check if there's an active session
          if (activeSessionsMap.has(item[deviceIdField])) {
            cStatus = 'Charging';
          } else if (!cStatus || cStatus === 'Unavailable') {
            cStatus = 'Available';
          }
        } else {
          finalStatus = 'Offline';
          cStatus = 'Unavailable';
        }
      } else {
        finalStatus = 'Offline';
        cStatus = 'Unavailable';
      }
    }

    return {
      ...item,
      status: finalStatus,
      cStatus: cStatus
    };
  });
}

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array() 
    });
  }
  next();
}, tariffController.getAllTariffs);

/**
 * GET /api/cms/tariffs/dropdown
 * Get all active tariffs for dropdown (no pagination)
 */
router.get('/tariffs/dropdown', tariffController.getTariffsDropdown);

/**
 * GET /api/cms/tariffs/:tariffId
 * Get single tariff by tariffId
 */
router.get('/tariffs/:tariffId', tariffController.getTariffById);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
}, tariffController.createTariff);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array()
    });
  }
  next();
}, tariffController.updateTariff);

/**
 * DELETE /api/cms/tariffs/:tariffId
 * Soft delete tariff (set deleted = true)
 */
router.delete('/tariffs/:tariffId', tariffController.deleteTariff);

// ============================================
// ORGANIZATIONS ROUTES
// ============================================

/**
 * GET /api/cms/organizations
 * Get all organizations with pagination and filters
 * Query params: page, limit, search
 */
router.get('/organizations', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array() 
    });
  }
  next();
}, organizationController.getAllOrganizations);

/**
 * GET /api/cms/organizations/dropdown
 * Get all organizations for dropdown (no pagination)
 */
router.get('/organizations/dropdown', organizationController.getOrganizationsDropdown);

/**
 * GET /api/cms/organizations/:id
 * Get single organization by id
 */
router.get('/organizations/:id', organizationController.getOrganizationById);

/**
 * POST /api/cms/organizations
 * Create new organization (with file uploads)
 */
router.post('/organizations', 
  uploadLogo.single('organizationLogo'),
  uploadMultipleDocuments,
  [
    body('organizationName')
      .notEmpty()
      .withMessage('Organization name is required')
      .isLength({ min: 1, max: 255 })
      .withMessage('Organization name must be between 1 and 255 characters')
  ], 
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array() 
      });
    }
    next();
  }, 
  organizationController.createOrganization
);

/**
 * PUT /api/cms/organizations/:id
 * Update organization (with file uploads)
 */
router.put('/organizations/:id', 
  (req, res, next) => {
    // Use .any() to handle both logo and documents flexibly
    const upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          if (file.fieldname === 'organizationLogo') {
            cb(null, logosDir);
          } else if (file.fieldname && file.fieldname.includes('documents')) {
            cb(null, documentsDir);
          } else {
            cb(new Error('Invalid field name'), null);
          }
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = path.extname(file.originalname);
          if (file.fieldname === 'organizationLogo') {
            cb(null, `logo-${uniqueSuffix}${ext}`);
          } else {
            cb(null, `doc-${uniqueSuffix}${ext}`);
          }
        }
      }),
      fileFilter: (req, file, cb) => {
        if (file.fieldname === 'organizationLogo') {
          // Only images for logo
          if (file.mimetype.startsWith('image/')) {
            cb(null, true);
          } else {
            cb(new Error('Only image files are allowed for logos'), false);
          }
        } else if (file.fieldname && file.fieldname.includes('documents')) {
          // Documents can be images, PDF, or Word docs
          const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ];
          if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
          } else {
            cb(new Error('Invalid file type. Allowed: images, PDF, Word documents'), false);
          }
        } else {
          cb(new Error('Invalid field name'), false);
        }
      },
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
      }
    }).any();
    
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload error'
        });
      }
      next();
    });
  },
  [
    body('organizationName')
      .notEmpty()
      .withMessage('Organization name is required')
      .isLength({ min: 1, max: 255 })
      .withMessage('Organization name must be between 1 and 255 characters')
  ], 
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array()
      });
    }
    next();
  }, 
  organizationController.updateOrganization
);

/**
 * DELETE /api/cms/organizations/:id
 * Soft delete organization (set deleted = true)
 */
router.delete('/organizations/:id', organizationController.deleteOrganization);

/**
 * GET /api/cms/organizations/:id/stations
 * Get all stations for an organization
 */
router.get('/organizations/:id/stations', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString(),
  query('status').optional().isString(),
  query('sort').optional().isString(),
  query('fromDate').optional().isISO8601().toDate().withMessage('From Date must be a valid date'),
  query('toDate').optional().isISO8601().toDate().withMessage('To Date must be a valid date')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array() 
    });
  }
  next();
}, organizationController.getOrganizationStations);

/**
 * GET /api/cms/organizations/:id/sessions
 * Get all sessions for an organization (active or completed)
 */
router.get('/organizations/:id/sessions', [
  query('type').optional().isIn(['active', 'completed']).withMessage('Type must be active or completed'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array() 
    });
  }
  next();
}, organizationController.getOrganizationSessions);

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

    // Build cache key with query params
    const cacheKey = `stations:list:page:${page}:limit:${limit}:search:${search || 'none'}:status:${status || 'all'}:org:${organization || 'all'}`;

    // Try to get from cache
    const cached = await cacheController.get(cacheKey);
    if (cached) {
      // Enhance cached response with real-time status from charging points
      if (cached.stations && Array.isArray(cached.stations)) {
        const ChargingPoint = require('../models/ChargingPoint');
        
        // Get all charging points for all stations in one query
        const stationIds = cached.stations.map(s => s.id);
        const allChargingPoints = await ChargingPoint.findAll({
          where: {
            stationId: { [Op.in]: stationIds },
            deleted: false
          },
          attributes: ['id', 'deviceId', 'stationId']
        });

        // Group charging points by station
        const cpByStation = new Map();
        allChargingPoints.forEach(cp => {
          if (!cpByStation.has(cp.stationId)) {
            cpByStation.set(cp.stationId, []);
          }
          cpByStation.get(cp.stationId).push(cp);
        });

        // Get all deviceIds and batch read status from Redis
        const allDeviceIds = allChargingPoints.map(cp => cp.deviceId).filter(Boolean);
        const statusPromises = allDeviceIds.map(deviceId => {
          const key = statusKey(deviceId);
          return redisClient.get(key).then(value => ({
            deviceId,
            statusData: value ? JSON.parse(value) : null
          })).catch(() => ({
            deviceId,
            statusData: null
          }));
        });

        const statusResults = await Promise.all(statusPromises);
        const deviceStatusMap = new Map();
        statusResults.forEach(result => {
          if (result.statusData) {
            deviceStatusMap.set(result.deviceId, result.statusData.status);
          }
        });

        // Batch read lastSeen for fallback
        const chargerDataMap = new Map();
        if (allDeviceIds.length > 0) {
          const chargers = await Charger.findAll({
            where: { deviceId: { [Op.in]: allDeviceIds } },
            attributes: ['deviceId', 'lastSeen']
          });
          chargers.forEach(c => {
            chargerDataMap.set(c.deviceId, c.lastSeen);
          });
        }

        // Enhance stations with real-time status
        const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        const enhancedStations = cached.stations.map(station => {
          const chargingPoints = cpByStation.get(station.id) || [];
          let onlineCPs = 0;

          for (const cp of chargingPoints) {
            if (cp.deviceId) {
              const realTimeStatus = deviceStatusMap.get(cp.deviceId);
              if (realTimeStatus) {
                // Check if OCPP status indicates online
                const onlineStatuses = ['Available', 'Charging', 'Preparing', 'Finishing'];
                if (onlineStatuses.includes(realTimeStatus)) {
                  onlineCPs++;
                }
              } else {
                // Fallback to lastSeen check
                const lastSeen = chargerDataMap.get(cp.deviceId);
                if (lastSeen) {
                  const lastActiveTime = new Date(lastSeen);
                  const now = new Date();
                  const timeDiff = now - lastActiveTime;
                  if (timeDiff <= OFFLINE_THRESHOLD) {
                    onlineCPs++;
                  }
                }
              }
            }
          }

          const stationStatus = onlineCPs >= 1 ? 'Online' : 'Offline';
          return {
            ...station,
            status: stationStatus,
            onlineCPs: onlineCPs,
            offlineCPs: chargingPoints.length - onlineCPs,
            onlineCPsPercent: chargingPoints.length > 0 ? Math.round((onlineCPs / chargingPoints.length) * 100) : 0,
            offlineCPsPercent: chargingPoints.length > 0 ? Math.round(((chargingPoints.length - onlineCPs) / chargingPoints.length) * 100) : 0
          };
        });

        // Re-sort stations with updated status
        enhancedStations.sort((a, b) => {
          if (a.status === 'Online' && b.status !== 'Online') return -1;
          if (a.status !== 'Online' && b.status === 'Online') return 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });

        return res.json({
          ...cached,
          stations: enhancedStations
        });
      }
      return res.json(cached);
    }

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

    const response = {
      success: true,
      stations: paginatedStations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };

    // Cache the response
    await cacheController.set(cacheKey, response, 300);

    res.json(response);
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
router.get('/stations/:stationId', cmsStationController.getStationById);

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
], cmsStationController.updateStation);

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

            // CRITICAL: Check Redis status first - if it shows "Available", charging is definitely stopped
            try {
              const { statusKey } = require('../libs/redis/keyNaming');
              const redisClient = require('../libs/redis/redisClient');
              const statusValue = await redisClient.get(statusKey(deviceId));
              if (statusValue) {
                const statusData = JSON.parse(statusValue);
                if (statusData && statusData.status) {
                  // If Redis shows "Available", charging is definitely stopped
                  if (statusData.status === 'Available' || statusData.status === 'available') {
                    console.log(`✅ [hasActiveTransaction] Redis status shows "Available" for ${deviceId} - charging is stopped`);
                    return false;
                  }
                  // If Redis shows "Charging", charging is definitely active
                  if (statusData.status === 'Charging' || statusData.status === 'charging') {
                    console.log(`✅ [hasActiveTransaction] Redis status shows "Charging" for ${deviceId} - charging is active`);
                    return true;
                  }
                }
              }
            } catch (redisErr) {
              // If Redis check fails, continue with database check
              console.warn(`⚠️ [hasActiveTransaction] Redis check failed for ${deviceId}:`, redisErr.message);
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
  query('status').optional().isIn(['Online', 'Offline', 'Faulted', 'online', 'offline', 'faulted', 'active', 'inactive']),
  query('stationId').optional() // Allow both integer (DB ID) and string (stationId like STN-...)
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, chargingPointController.getAllChargingPoints);

/**
 * GET /api/cms/charging-points/:chargingPointId
 * Get single charging point by chargingPointId
 */
router.get('/charging-points/:chargingPointId', chargingPointController.getChargingPointById);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
}, chargingPointController.createChargingPoint);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
}, chargingPointController.updateChargingPoint);

/**
 * DELETE /api/cms/charging-points/:chargingPointId
 * Soft delete charging point (set deleted = true)
 */
router.delete('/charging-points/:chargingPointId', chargingPointController.deleteChargingPoint);

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
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const chargingSessionsWhere = {
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
    };
    if (systemCustomerId !== null) {
      chargingSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const chargingSessions = await ChargingSession.findAll({
      where: chargingSessionsWhere,
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
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const chargingSessionsWhere = {
      deviceId: deviceId,
      status: {
        [Op.in]: ['stopped', 'completed']
      },
      endTime: {
        [Op.ne]: null
      }
    };
    if (systemCustomerId !== null) {
      chargingSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const chargingSessions = await ChargingSession.findAll({
      where: chargingSessionsWhere,
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
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const chargingSessionsWhere = {
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
    };
    if (systemCustomerId !== null) {
      chargingSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const chargingSessions = await ChargingSession.findAll({
      where: chargingSessionsWhere,
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
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const chargingSessionsWhere = {
      deviceId: deviceId,
      status: {
        [Op.in]: ['stopped', 'completed']
      },
      endTime: {
        [Op.ne]: null
      }
    };
    if (systemCustomerId !== null) {
      chargingSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const chargingSessions = await ChargingSession.findAll({
      where: chargingSessionsWhere,
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

      // CRITICAL: Check if this session has been stopped in ChargingSession table
      // This catches cases where user stopped charging from web app or CMS stopped it
      // Check by transactionId first, then by deviceId + connectorId + startTime as fallback
      let stoppedSession = null;
      
      // First try to find by transactionId if available (check both string and number formats)
      if (transactionId) {
        const txIdStr = transactionId.toString();
        stoppedSession = await ChargingSession.findOne({
          where: {
            deviceId: deviceId,
            connectorId: connectorId || 0,
            [Op.or]: [
              { transactionId: txIdStr },
              { transactionId: parseInt(txIdStr) },
              { transactionId: transactionId }
            ],
            [Op.or]: [
              { status: 'stopped' },
              { status: 'completed' },
              { status: 'failed' },
              { endTime: { [Op.ne]: null } }
            ]
          },
          limit: 1
        });
      }
      
      // If not found by transactionId, try by deviceId + connectorId + startTime (within 10 minutes window)
      if (!stoppedSession) {
        stoppedSession = await ChargingSession.findOne({
          where: {
            deviceId: deviceId,
            connectorId: connectorId || 0,
            startTime: {
              [Op.gte]: new Date(startTime.getTime() - 10 * 60 * 1000), // 10 minutes before
              [Op.lte]: new Date(startTime.getTime() + 10 * 60 * 1000)  // 10 minutes after
            },
            [Op.or]: [
              { status: 'stopped' },
              { status: 'completed' },
              { status: 'failed' },
              { endTime: { [Op.ne]: null } }
            ]
          },
          limit: 1
        });
      }
      
      // Final fallback: Check if there's ANY stopped session for this deviceId + connectorId
      // within the last 30 minutes (to catch cases where startTime doesn't match exactly)
      if (!stoppedSession) {
        const recentStoppedSession = await ChargingSession.findOne({
          where: {
            deviceId: deviceId,
            connectorId: connectorId || 0,
            [Op.or]: [
              { status: 'stopped' },
              { status: 'completed' },
              { status: 'failed' },
              { endTime: { [Op.ne]: null } }
            ],
            // Check if session was stopped recently (within last 30 minutes)
            [Op.or]: [
              { endTime: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) } },
              { updatedAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) } }
            ]
          },
          order: [['endTime', 'DESC'], ['updatedAt', 'DESC']],
          limit: 1
        });
        
        // Only exclude if the stopped session's startTime is close to this session's startTime
        if (recentStoppedSession && recentStoppedSession.startTime) {
          const timeDiff = Math.abs(new Date(recentStoppedSession.startTime).getTime() - startTime.getTime());
          if (timeDiff < 15 * 60 * 1000) { // Within 15 minutes
            stoppedSession = recentStoppedSession;
          }
        }
      }

      // If session is stopped in ChargingSession table, skip it even if OCPP messages show it as active
      if (stoppedSession) {
        console.log(`[Active Sessions] Session for deviceId ${deviceId}, connectorId ${connectorId}, transactionId ${transactionId} is stopped in ChargingSession table (status: ${stoppedSession.status}, endTime: ${stoppedSession.endTime}) - excluding from active sessions`);
        continue;
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
          // Check if customerId matches system customer (email: system@cms.admin) or is null/0
          const isCMS = await isSystemCustomer(chargingSession.customerId);
          sessionMode = isCMS ? 'CMS' : 'App';
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
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const activeSessionsWhere = {
      status: {
        [Op.in]: ['pending', 'active']
      },
      endTime: null
    };
    if (systemCustomerId !== null) {
      activeSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }
    const activeChargingSessions = await ChargingSession.findAll({
      where: activeSessionsWhere,
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
      const isCMS = await isSystemCustomer(session.customerId);
      const sessionMode = isCMS ? 'CMS' : 'App';

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
      const searchLower = search.toLowerCase();
      filteredSessions = activeSessions.filter(session =>
        (session.stationName && session.stationName.toLowerCase().includes(searchLower)) ||
        (session.deviceId && session.deviceId.toLowerCase().includes(searchLower)) ||
        (session.transactionId && session.transactionId.toString().includes(search)) ||
        (session.sessionId && session.sessionId.toLowerCase().includes(searchLower))
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
    // Exclude system customer sessions
    const systemCustomerId = await getSystemCustomerId();
    const completedChargingSessionsWhere = {
      status: {
        [Op.in]: ['stopped', 'completed']
      },
      endTime: {
        [Op.ne]: null
      }
    };
    if (systemCustomerId !== null) {
      completedChargingSessionsWhere.customerId = { [Op.ne]: systemCustomerId };
    }

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
      const isCMS = await isSystemCustomer(session.customerId);
      const sessionMode = isCMS ? 'CMS' : 'App';
      let formattedStopReason = 'Unknown';
      if (session.stopReason === 'Remote (CMS)') {
        formattedStopReason = 'Stopped from CMS';
      } else if (session.stopReason === 'Remote') {
        formattedStopReason = 'User stopped charging';
      } else if (session.stopReason === 'ChargingCompleted') {
        formattedStopReason = 'Charging completed';
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
          // Check if customerId matches system customer (email: system@cms.admin) or is null/0
          const isCMS = await isSystemCustomer(chargingSession.customerId);
          sessionMode = isCMS ? 'CMS' : 'App';
          
          // Format stop reason based on ChargingSession stopReason
          const sessionStopReason = chargingSession.stopReason;
          if (sessionStopReason === 'Remote (CMS)') {
            formattedStopReason = 'Stopped from CMS';
          } else if (sessionStopReason === 'Remote') {
            formattedStopReason = 'User stopped charging';
          } else if (sessionStopReason === 'ChargingCompleted') {
            formattedStopReason = 'Charging completed';
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
      const searchLower = search.toLowerCase();
      filteredSessions = completedSessions.filter(session =>
        (session.stationName && session.stationName.toLowerCase().includes(searchLower)) ||
        (session.deviceId && session.deviceId.toLowerCase().includes(searchLower)) ||
        (session.transactionId && session.transactionId.toString().includes(search)) ||
        (session.sessionId && session.sessionId.toLowerCase().includes(searchLower))
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

/**
 * GET /api/cms/charging-sessions/:sessionId/invoice/pdf
 * Preview or download invoice PDF for a completed charging session
 * Query param ?preview=1 opens PDF inline in browser, otherwise downloads as attachment
 */
router.get('/charging-sessions/:sessionId/invoice/pdf', chargingController.downloadInvoicePDF);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, cmsCustomerController.getAllCustomers);

/**
 * GET /api/cms/customers/:customerId/wallet-transactions
 * Get wallet transactions for a specific customer
 */
router.get('/customers/:customerId/wallet-transactions', [
  param('customerId').isInt().withMessage('Customer ID must be an integer'),
  query('fromDate').optional().isISO8601(),
  query('toDate').optional().isISO8601()
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, cmsCustomerController.getCustomerWalletTransactions);

/**
 * GET /api/cms/customers/:customerId
 * Get customer details by ID
 */
router.get('/customers/:customerId', [
  param('customerId').isInt().withMessage('Customer ID must be an integer')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, cmsCustomerController.getCustomerById);

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
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, cmsCustomerController.getCustomerSessions);

// ============================================
// DASHBOARD STATISTICS
// ============================================

/**
 * GET /api/cms/dashboard/stats
 * Get dashboard statistics and overview
 */
router.get('/dashboard/stats', cmsDashboardController.getDashboardStats);

/**
 * GET /api/cms/dashboard/charts
 * Get chart data for sessions and revenue over time
 * Query params: period (7, 30, 90 days)
 * OPTIMIZED: Fetches all data in bulk and processes in memory
 */
router.get('/dashboard/charts', cmsDashboardController.getDashboardCharts);

// ============================================
// CMS Remote Charging Controls
// ============================================

router.post('/charging/start', authenticateToken, [
  body('deviceId').notEmpty().withMessage('deviceId is required'),
  body('connectorId').isInt({ min: 0 }).withMessage('connectorId is required'),
  body('amount').optional().isFloat({ min: 0 })
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }
  next();
}, chargingController.startCharging);

router.post('/charging/stop', authenticateToken, [
  body('deviceId')
    .notEmpty()
    .withMessage('deviceId is required')
    .isString()
    .withMessage('deviceId must be a string'),
  body('connectorId').custom((value) => {
    // Handle both string and number types
    const parsed = typeof value === 'number' ? value : parseInt(value);
    return !isNaN(parsed) && parsed >= 0;
  }).withMessage('connectorId must be a valid integer')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: errors.array()[0].msg });
  }
  next();
}, chargingController.stopCharging);

module.exports = router;
