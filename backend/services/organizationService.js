const { Organization, Station, ChargingPoint, ChargingSession, Vehicle, Tariff } = require('../models');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');
const cacheController = require('../libs/redis/cacheController');
const redisClient = require('../libs/redis/redisClient');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishCMSEvent = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../libs/rabbitmq/producer');
    publishCMSEvent = producer.publishCMSEvent;
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
}

/**
 * Calculate session statistics for an organization
 */
async function calculateOrganizationSessionStats(orgNameForStation) {
  try {
    // Get all stations for this organization
    const stations = await Station.findAll({
      where: {
        organization: orgNameForStation,
        deleted: false
      },
      attributes: ['id']
    });

    const stationIds = stations.map(s => s.id);
    
    if (stationIds.length === 0) {
      return {
        sessions: 0,
        energy: 0,
        billedAmount: 0
      };
    }

    // Get all charging points for these stations
    const chargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: { [Op.in]: stationIds },
        deleted: false
      },
      attributes: ['id', 'deviceId']
    });

    const deviceIds = chargingPoints
      .map(cp => cp.deviceId)
      .filter(deviceId => deviceId !== null && deviceId !== undefined);

    if (deviceIds.length === 0) {
      return {
        sessions: 0,
        energy: 0,
        billedAmount: 0
      };
    }

    // Get system customer ID to exclude system sessions
    const systemCustomerId = 3; // Default system customer ID

    // Calculate totals from ChargingSession records
    const sessionStats = await ChargingSession.findAll({
      where: {
        deviceId: { [Op.in]: deviceIds },
        status: { [Op.in]: ['stopped', 'completed'] },
        endTime: { [Op.ne]: null },
        customerId: { [Op.ne]: systemCustomerId }
      },
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('ChargingSession.id')), 'sessions'],
        [Sequelize.fn('SUM', Sequelize.col('ChargingSession.energyConsumed')), 'totalEnergy'],
        [Sequelize.fn('SUM', Sequelize.col('ChargingSession.finalAmount')), 'totalBilledAmount']
      ],
      raw: true
    });

    const stats = sessionStats[0] || {};
    const sessions = parseInt(stats.sessions) || 0;
    const energy = parseFloat(stats.totalEnergy) || 0;
    const billedAmount = parseFloat(stats.totalBilledAmount) || 0;

    return {
      sessions,
      energy: parseFloat(energy.toFixed(2)),
      billedAmount: parseFloat(billedAmount.toFixed(2))
    };
  } catch (error) {
    console.error(`Error calculating session stats for organization ${orgNameForStation}:`, error);
    return {
      sessions: 0,
      energy: 0,
      billedAmount: 0
    };
  }
}

/**
 * Get all organizations with pagination and filters
 */
async function getAllOrganizations(filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  const { search, sort, fromDate, toDate } = filters;

  // Build cache key with query params
  const cacheKey = `organizations:list:page:${page}:limit:${limit}:search:${search || 'none'}:sort:${sort || 'none'}:fromDate:${fromDate || 'none'}:toDate:${toDate || 'none'}`;

  // Try to get from cache
  const cached = await cacheController.get(cacheKey);
  if (cached && cached.organizations && cached.total !== undefined) {
    return cached;
  }

  // Build where clause
  const where = {
    deleted: false // Only show non-deleted organizations
  };

  // Add search filter
  if (search) {
    where[Op.or] = [
      { organizationName: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Add date filters
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      where.createdAt[Op.gte] = from;
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = to;
    }
  }

  // Default order
  let order = [['createdAt', 'DESC']];

  // Get organizations with pagination (without sorting by stats yet - we'll sort after calculating stats)
  const { count, rows: organizations } = await Organization.findAndCountAll({
    where,
    limit,
    offset,
    order
  });

  // Get station, charger counts, and session stats for each organization
  const organizationsWithCounts = await Promise.all(
    organizations.map(async (org) => {
      // Convert organization name to the format used in stations.organization field
      // e.g., "Massive Mobility" -> "massive_mobility"
      const orgNameForStation = org.organizationName.toLowerCase().replace(/\s+/g, '_');
      
      // Count stations by matching organization name (temporary until organizationId column is added)
      const stationCount = await Station.count({
        where: {
          organization: orgNameForStation,
          deleted: false
        }
      });

      // Count chargers (charging points) - get station IDs first, then count chargers
      const stations = await Station.findAll({
        where: {
          organization: orgNameForStation,
          deleted: false
        },
        attributes: ['id']
      });
      
      const stationIds = stations.map(s => s.id);
      let chargerCount = 0;
      if (stationIds.length > 0) {
        chargerCount = await ChargingPoint.count({
          include: [
            {
              model: Station,
              as: 'station',
              where: {
                id: { [Op.in]: stationIds },
                deleted: false
              },
              required: true
            }
          ]
        });
      }

      // Calculate session statistics
      const sessionStats = await calculateOrganizationSessionStats(orgNameForStation);

      return {
        id: org.id,
        organizationName: org.organizationName,
        stations: stationCount,
        chargers: chargerCount,
        sessions: sessionStats.sessions,
        energy: sessionStats.energy,
        billedAmount: sessionStats.billedAmount,
        createdAt: org.createdAt
      };
    })
  );

  // Apply sorting if specified
  if (sort) {
    const [sortField, sortDirection] = sort.split('-');
    const direction = sortDirection === 'asc' ? 1 : -1;
    
    organizationsWithCounts.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortField) {
        case 'sessions':
          aVal = a.sessions || 0;
          bVal = b.sessions || 0;
          break;
        case 'energy':
          aVal = a.energy || 0;
          bVal = b.energy || 0;
          break;
        case 'billedAmount':
          aVal = a.billedAmount || 0;
          bVal = b.billedAmount || 0;
          break;
        default:
          return 0;
      }
      
      return (aVal - bVal) * direction;
    });
  }

  const totalPages = Math.ceil(count / limit);

  const response = {
    organizations: organizationsWithCounts,
    total: count,
    page,
    limit,
    totalPages
  };

  // Cache the response
  await cacheController.set(cacheKey, response, 300);

  return response;
}

/**
 * Get all organizations for dropdown (no pagination)
 */
async function getOrganizationsDropdown() {
  const organizations = await Organization.findAll({
    where: {
      deleted: false
    },
    attributes: ['id', 'organizationName'],
    order: [['organizationName', 'ASC']]
  });

  return {
    organizations: organizations.map(org => ({
      id: org.id,
      organizationName: org.organizationName
    }))
  };
}

/**
 * Get single organization by id
 */
async function getOrganizationById(id) {
  const organization = await Organization.findOne({
    where: {
      id,
      deleted: false
    }
  });

  if (!organization) {
    return null;
  }

  // Get counts - convert organization name to format used in stations.organization
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');
  
  const stationCount = await Station.count({
    where: {
      organization: orgNameForStation,
      deleted: false
    }
  });

  // Get station IDs first, then count chargers
  const stations = await Station.findAll({
    where: {
      organization: orgNameForStation,
      deleted: false
    },
    attributes: ['id']
  });
  
  const stationIds = stations.map(s => s.id);
  let chargerCount = 0;
  if (stationIds.length > 0) {
    chargerCount = await ChargingPoint.count({
      include: [
        {
          model: Station,
          as: 'station',
          where: {
            id: { [Op.in]: stationIds },
            deleted: false
          },
          required: true
        }
      ]
    });
  }

  // Return all organization fields
  return {
    id: organization.id,
    organizationName: organization.organizationName,
    gstin: organization.gstin,
    organizationType: organization.organizationType,
    organizationLogo: organization.organizationLogo,
    contactNumber: organization.contactNumber,
    countryCode: organization.countryCode,
    email: organization.email,
    addressCountry: organization.addressCountry,
    addressPinCode: organization.addressPinCode,
    addressCity: organization.addressCity,
    addressState: organization.addressState,
    fullAddress: organization.fullAddress,
    bankAccountNumber: organization.bankAccountNumber,
    ifscCode: organization.ifscCode,
    billingSameAsCompany: organization.billingSameAsCompany,
    billingCountry: organization.billingCountry,
    billingPinCode: organization.billingPinCode,
    billingCity: organization.billingCity,
    billingState: organization.billingState,
    billingFullAddress: organization.billingFullAddress,
    documents: organization.documents || [],
    stations: stationCount,
    chargers: chargerCount,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt
  };
}

/**
 * Helper function to invalidate all organizations list cache entries
 */
async function invalidateOrganizationsListCache() {
  try {
    const keys = await redisClient.keys('organizations:list:*');
    if (keys && keys.length > 0) {
      await Promise.all(keys.map(key => cacheController.del(key)));
      console.log(`✅ [Cache] Invalidated ${keys.length} organizations list cache entries`);
    }
  } catch (error) {
    console.warn('⚠️ [Cache] Failed to invalidate organizations list cache:', error.message);
  }
}

/**
 * Create new organization
 */
async function createOrganization(organizationData) {
  const {
    organizationName,
    gstin,
    organizationType,
    organizationLogo,
    contactNumber,
    countryCode,
    email,
    addressCountry,
    addressPinCode,
    addressCity,
    addressState,
    fullAddress,
    bankAccountNumber,
    ifscCode,
    billingSameAsCompany,
    billingCountry,
    billingPinCode,
    billingCity,
    billingState,
    billingFullAddress,
    documents
  } = organizationData;

  // Check if organization with same name already exists
  const existingOrg = await Organization.findOne({
    where: {
      organizationName,
      deleted: false
    }
  });

  if (existingOrg) {
    throw new Error('Organization with this name already exists');
  }

  // Create organization with all fields
  const organization = await Organization.create({
    organizationName,
    gstin: gstin || null,
    organizationType: organizationType || null,
    organizationLogo: organizationLogo || null,
    contactNumber: contactNumber || null,
    countryCode: countryCode || '+91',
    email: email || null,
    addressCountry: addressCountry || null,
    addressPinCode: addressPinCode || null,
    addressCity: addressCity || null,
    addressState: addressState || null,
    fullAddress: fullAddress || null,
    bankAccountNumber: bankAccountNumber || null,
    ifscCode: ifscCode || null,
    billingSameAsCompany: billingSameAsCompany || false,
    billingCountry: billingCountry || null,
    billingPinCode: billingPinCode || null,
    billingCity: billingCity || null,
    billingState: billingState || null,
    billingFullAddress: billingFullAddress || null,
    documents: documents || [],
    deleted: false
  });

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.organization.created',
        data: {
          id: organization.id,
          organizationName: organization.organizationName
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.organization.created event for ${organization.id}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.organization.created event:', rabbitmqError.message);
    }
  }

  // Invalidate organizations list cache
  await invalidateOrganizationsListCache();

  return {
    id: organization.id,
    organizationName: organization.organizationName,
    stations: 0,
    chargers: 0,
    createdAt: organization.createdAt
  };
}

/**
 * Update organization
 */
async function updateOrganization(id, updateData) {
  const {
    organizationName,
    gstin,
    organizationType,
    organizationLogo,
    contactNumber,
    countryCode,
    email,
    addressCountry,
    addressPinCode,
    addressCity,
    addressState,
    fullAddress,
    bankAccountNumber,
    ifscCode,
    billingSameAsCompany,
    billingCountry,
    billingPinCode,
    billingCity,
    billingState,
    billingFullAddress,
    documents
  } = updateData;

  // Find organization
  const organization = await Organization.findOne({
    where: {
      id,
      deleted: false
    }
  });

  if (!organization) {
    return {
      success: false,
      error: 'Organization not found'
    };
  }

  // Check if another organization with same name exists
  if (organizationName && organizationName !== organization.organizationName) {
    const existingOrg = await Organization.findOne({
      where: {
        organizationName,
        deleted: false,
        id: { [Op.ne]: id }
      }
    });

    if (existingOrg) {
      return {
        success: false,
        error: 'Organization with this name already exists'
      };
    }
  }

  // Build update object with only provided fields
  const updateFields = {};
  if (organizationName !== undefined) updateFields.organizationName = organizationName;
  if (gstin !== undefined) updateFields.gstin = gstin;
  if (organizationType !== undefined) updateFields.organizationType = organizationType;
  // Handle logo: null means remove, undefined means don't update, string means update
  if (organizationLogo !== undefined) {
    updateFields.organizationLogo = organizationLogo; // Can be null to remove, or a path string
  }
  if (contactNumber !== undefined) updateFields.contactNumber = contactNumber;
  if (countryCode !== undefined) updateFields.countryCode = countryCode;
  if (email !== undefined) updateFields.email = email;
  if (addressCountry !== undefined) updateFields.addressCountry = addressCountry;
  if (addressPinCode !== undefined) updateFields.addressPinCode = addressPinCode;
  if (addressCity !== undefined) updateFields.addressCity = addressCity;
  if (addressState !== undefined) updateFields.addressState = addressState;
  if (fullAddress !== undefined) updateFields.fullAddress = fullAddress;
  if (bankAccountNumber !== undefined) updateFields.bankAccountNumber = bankAccountNumber;
  if (ifscCode !== undefined) updateFields.ifscCode = ifscCode;
  if (billingSameAsCompany !== undefined) updateFields.billingSameAsCompany = billingSameAsCompany;
  if (billingCountry !== undefined) updateFields.billingCountry = billingCountry;
  if (billingPinCode !== undefined) updateFields.billingPinCode = billingPinCode;
  if (billingCity !== undefined) updateFields.billingCity = billingCity;
  if (billingState !== undefined) updateFields.billingState = billingState;
  if (billingFullAddress !== undefined) updateFields.billingFullAddress = billingFullAddress;
  if (documents !== undefined) updateFields.documents = documents;

  // Update organization
  await organization.update(updateFields);

  // Reload to get updated data
  await organization.reload();

  // Get counts - convert organization name to format used in stations.organization
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');
  
  const stationCount = await Station.count({
    where: {
      organization: orgNameForStation,
      deleted: false
    }
  });

  // Get station IDs first, then count chargers
  const stations = await Station.findAll({
    where: {
      organization: orgNameForStation,
      deleted: false
    },
    attributes: ['id']
  });
  
  const stationIds = stations.map(s => s.id);
  let chargerCount = 0;
  if (stationIds.length > 0) {
    chargerCount = await ChargingPoint.count({
      include: [
        {
          model: Station,
          as: 'station',
          where: {
            id: { [Op.in]: stationIds },
            deleted: false
          },
          required: true
        }
      ]
    });
  }

  // Publish CMS event to RabbitMQ (if enabled)
  if (ENABLE_RABBITMQ && publishCMSEvent) {
    try {
      await publishCMSEvent({
        type: 'cms.organization.updated',
        data: {
          id: organization.id,
          organizationName: organization.organizationName
        }
      });
      console.log(`📤 [RABBITMQ] Published cms.organization.updated event for ${organization.id}`);
    } catch (rabbitmqError) {
      console.warn('⚠️ [RABBITMQ] Failed to publish cms.organization.updated event:', rabbitmqError.message);
    }
  }

  // Invalidate organizations list cache
  await invalidateOrganizationsListCache();

  // Return all organization fields (similar to getOrganizationById)
  return {
    id: organization.id,
    organizationName: organization.organizationName,
    gstin: organization.gstin,
    organizationType: organization.organizationType,
    organizationLogo: organization.organizationLogo,
    contactNumber: organization.contactNumber,
    countryCode: organization.countryCode,
    email: organization.email,
    addressCountry: organization.addressCountry,
    addressPinCode: organization.addressPinCode,
    addressCity: organization.addressCity,
    addressState: organization.addressState,
    fullAddress: organization.fullAddress,
    bankAccountNumber: organization.bankAccountNumber,
    ifscCode: organization.ifscCode,
    billingSameAsCompany: organization.billingSameAsCompany,
    billingCountry: organization.billingCountry,
    billingPinCode: organization.billingPinCode,
    billingCity: organization.billingCity,
    billingState: organization.billingState,
    billingFullAddress: organization.billingFullAddress,
    documents: organization.documents || [],
    stations: stationCount,
    chargers: chargerCount,
    createdAt: organization.createdAt,
    updatedAt: organization.updatedAt
  };
}

/**
 * Soft delete organization (set deleted = true)
 */
async function deleteOrganization(id) {
  // Find organization
  const organization = await Organization.findOne({
    where: {
      id,
      deleted: false
    }
  });

  if (!organization) {
    return null;
  }

  // Check if organization has stations - convert organization name to format used in stations.organization
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');
  
  const stationCount = await Station.count({
    where: {
      organization: orgNameForStation,
      deleted: false
    }
  });

  if (stationCount > 0) {
    throw new Error('Cannot delete organization with existing stations. Please remove or reassign stations first.');
  }

  // Soft delete
  await organization.update({ deleted: true });

  // Invalidate organizations list cache
  await invalidateOrganizationsListCache();

  return {
    id: organization.id
  };
}

/**
 * Calculate session stats for a charging point
 */
async function calculateStationSessionStats(deviceId) {
  try {
    const systemCustomerId = 3; // Default system customer ID
    const chargingSessionsWhere = {
      deviceId: deviceId,
      status: {
        [Op.in]: ['stopped', 'completed']
      },
      endTime: {
        [Op.ne]: null
      },
      customerId: { [Op.ne]: systemCustomerId }
    };

    const chargingSessions = await ChargingSession.findAll({
      where: chargingSessionsWhere,
      attributes: ['id', 'transactionId', 'energyConsumed', 'finalAmount']
    });

    let totalSessions = chargingSessions.length;
    let totalEnergy = 0;
    let totalBilledAmount = 0;

    for (const session of chargingSessions) {
      if (session.energyConsumed) {
        totalEnergy += parseFloat(session.energyConsumed);
      }
      if (session.finalAmount) {
        totalBilledAmount += parseFloat(session.finalAmount);
      }
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
 * Get all stations for an organization
 */
async function getOrganizationStations(organizationId, filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 10;
  const offset = (page - 1) * limit;
  const { search, status, fromDate, toDate, sort } = filters;

  // Get organization
  const organization = await Organization.findOne({
    where: {
      id: organizationId,
      deleted: false
    }
  });

  if (!organization) {
    return null;
  }

  // Convert organization name to the format used in stations.organization field
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');

  // Build where clause
  const where = {
    organization: orgNameForStation,
    deleted: false
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

  // Add date filters
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      where.createdAt[Op.gte] = from;
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = to;
    }
  }

  // Get all stations (we'll calculate stats and filter by status after)
  const allStations = await Station.findAll({
    where,
    order: [['createdAt', 'DESC']]
  });

  // Calculate stats for each station
  const stationsWithStats = await Promise.all(allStations.map(async (station) => {
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
          const sessionStats = await calculateStationSessionStats(cp.deviceId);
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
      status: stationStatus,
      city: station.city,
      state: station.state,
      chargers: totalCPs,
      sessions: totalSessions,
      billedAmount: parseFloat(totalBilledAmount.toFixed(2)),
      energy: parseFloat(totalEnergy.toFixed(2)),
      onlineCPsPercent: onlineCPsPercent,
      onlineCPs: onlineCPs,
      offlineCPsPercent: offlineCPsPercent,
      offlineCPs: offlineCPs,
      createdAt: station.createdAt
    };
  }));

  // Filter by status if provided
  let filteredStations = stationsWithStats;
  if (status && status.trim() !== '') {
    filteredStations = stationsWithStats.filter(s => s.status === status);
  }

  // Apply sorting
  if (sort) {
    const [sortField, sortDirection] = sort.split('-'); // e.g., 'sessions-asc'
    filteredStations.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle numeric sorting
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      // Handle string sorting (case-insensitive)
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return 0;
    });
  } else {
    // Default: Online first, then Offline, then by createdAt DESC
    filteredStations.sort((a, b) => {
      if (a.status === 'Online' && b.status !== 'Online') return -1;
      if (a.status !== 'Online' && b.status === 'Online') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  const total = filteredStations.length;
  const totalPages = Math.ceil(total / limit);

  // Apply pagination
  const paginatedStations = filteredStations.slice(offset, offset + limit);

  return {
    stations: paginatedStations,
    total,
    page,
    limit,
    totalPages
  };
}

/**
 * Get all sessions for an organization
 */
async function getOrganizationSessions(organizationId, type, filters, pagination) {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const offset = (page - 1) * limit;
    const { search, fromDate, toDate } = filters;

  // Get organization
  const organization = await Organization.findOne({
    where: {
      id: organizationId,
      deleted: false
    }
  });

  if (!organization) {
    return null;
  }

  // Convert organization name to the format used in stations.organization field
  const orgNameForStation = organization.organizationName.toLowerCase().replace(/\s+/g, '_');

  // Get all stations for this organization
  const stations = await Station.findAll({
    where: {
      organization: orgNameForStation,
      deleted: false
    },
    attributes: ['id']
  });

  const stationIds = stations.map(s => s.id);

  if (stationIds.length === 0) {
    return {
      sessions: [],
      total: 0,
      page,
      limit,
      totalPages: 0
    };
  }

  // Get all charging points for these stations
  const chargingPoints = await ChargingPoint.findAll({
    where: {
      stationId: { [Op.in]: stationIds },
      deleted: false
    },
    attributes: ['id', 'deviceId']
  });

  const deviceIds = chargingPoints
    .map(cp => cp.deviceId)
    .filter(deviceId => deviceId !== null && deviceId !== undefined);

  if (deviceIds.length === 0) {
    return {
      sessions: [],
      total: 0,
      page,
      limit,
      totalPages: 0
    };
  }

  // Build where clause for sessions
  const systemCustomerId = 3; // Default system customer ID
  const where = {
    deviceId: { [Op.in]: deviceIds },
    customerId: { [Op.ne]: systemCustomerId }
  };

  if (type === 'active') {
    where.status = { [Op.in]: ['pending', 'active'] };
  } else {
    where.status = { [Op.in]: ['stopped', 'completed'] };
    
    // Build endTime condition
    const endTimeCondition = { [Op.ne]: null };
    
    // Add date filters for completed sessions
    if (fromDate || toDate) {
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        endTimeCondition[Op.gte] = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        endTimeCondition[Op.lte] = to;
      }
    }
    
    where.endTime = endTimeCondition;
  }

  // Add search filter
  if (search) {
    where[Op.or] = [
      { sessionId: { [Op.iLike]: `%${search}%` } },
      { transactionId: { [Op.iLike]: `%${search}%` } },
      { deviceId: { [Op.iLike]: `%${search}%` } }
    ];
  }

  // Get total count
  const total = await ChargingSession.count({ where });

  // Get sessions with pagination
  const sessions = await ChargingSession.findAll({
    where,
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
        attributes: ['id', 'deviceId', 'deviceName']
      },
      {
        model: Vehicle,
        as: 'vehicle',
        attributes: ['id', 'vehicleNumber', 'vehicleType', 'brand', 'modelName'],
        required: false
      }
    ],
    limit,
    offset,
    order: type === 'active' 
      ? [['startTime', 'DESC']]
      : [['endTime', 'DESC'], ['createdAt', 'DESC']]
  });

  const totalPages = Math.ceil(total / limit);

  return {
    sessions: sessions.map(session => {
      const tariff = session.chargingPoint?.tariff;
      const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
      const tax = tariff ? parseFloat(tariff.tax) : 0;
      const currency = tariff ? tariff.currency : 'INR';
      
      // Calculate session duration
      let sessionDuration = 'N/A';
      if (session.startTime && session.endTime) {
        const durationMs = new Date(session.endTime) - new Date(session.startTime);
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
        sessionDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      } else if (session.startTime && type === 'active') {
        // For active sessions, calculate duration from start to now
        const durationMs = new Date() - new Date(session.startTime);
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
        sessionDuration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
      
      // Determine vehicle display
      let vehicleDisplay = 'N/A';
      if (session.vehicle) {
        vehicleDisplay = session.vehicle.vehicleNumber || 'N/A';
      }
      
      // Determine mode (CMS if customerId is 0 or null, otherwise APP/OCPI)
      let mode = 'N/A';
      if (!session.customerId || session.customerId === 0 || session.customerId === 3) {
        mode = 'CMS';
      } else {
        // Could be APP or OCPI - for now default to APP, can be enhanced later
        mode = 'APP';
      }
      
      // Calculate entered amount (amountRequested or amountDeducted)
      const enteredAmount = parseFloat(session.amountRequested || session.amountDeducted || 0);
      
      return {
        id: session.id,
        sessionId: session.sessionId,
        transactionId: session.transactionId,
        deviceId: session.deviceId,
        deviceName: session.chargingPoint?.deviceName || session.deviceId,
        stationName: session.chargingPoint?.station?.stationName || 'N/A',
        stationId: session.chargingPoint?.station?.stationId || null,
        startTime: session.startTime,
        endTime: session.endTime,
        energy: parseFloat(session.energyConsumed || 0),
        enteredAmount: enteredAmount,
        billedAmount: parseFloat(session.finalAmount || 0),
        baseCharges: baseCharges,
        tax: tax,
        refund: parseFloat(session.refundAmount || 0),
        mode: mode,
        vehicle: vehicleDisplay,
        sessionDuration: sessionDuration,
        connectorId: session.connectorId,
        status: session.status,
        stopReason: session.stopReason,
        currency: currency,
        createdAt: session.createdAt
      };
    }),
    total,
    page,
    limit,
    totalPages
  };
}

module.exports = {
  getAllOrganizations,
  getOrganizationsDropdown,
  getOrganizationById,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getOrganizationStations,
  getOrganizationSessions
};

