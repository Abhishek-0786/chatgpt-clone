const { Station, ChargingPoint, Connector, Tariff, ChargingSession } = require('../models');
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const sequelize = require('../config/database');

/**
 * Calculate session statistics for a device
 */
async function calculateSessionStats(deviceId, chargingPoint) {
  try {
    const sessions = await ChargingSession.findAll({
      where: {
        deviceId: deviceId,
        status: 'completed'
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSessions'],
        [sequelize.fn('SUM', sequelize.col('energyConsumed')), 'totalEnergy'],
        [sequelize.fn('SUM', sequelize.col('finalAmount')), 'totalBilledAmount']
      ],
      raw: true
    });

    const stats = sessions[0] || {};
    const totalSessions = parseInt(stats.totalSessions) || 0;
    const totalEnergy = parseFloat(stats.totalEnergy) || 0;
    const totalBilledAmount = parseFloat(stats.totalBilledAmount) || 0;

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
 * Get all stations with real-time status and statistics
 */
async function getAllStations(location, sortBy) {
  try {
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

    return {
      success: true,
      stations: stationsWithStats
    };
  } catch (error) {
    console.error('Error fetching stations:', error);
    throw new Error('Failed to fetch stations');
  }
}

/**
 * Get single station by stationId
 */
async function getStationById(stationId) {
  try {
    const station = await Station.findOne({
      where: {
        stationId,
        deleted: false
      }
    });

    if (!station) {
      return {
        success: false,
        error: 'Station not found'
      };
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

    // Parse gallery images (handle JSONB objects, JSON strings, and arrays)
    let galleryImages = [];
    try {
      // Get galleryImages from Sequelize model
      let rawGalleryImages = station.galleryImages || 
                            (station.dataValues && station.dataValues.galleryImages) || 
                            (station.get ? station.get('galleryImages') : null);
      
      // If still not found, try toJSON()
      if (!rawGalleryImages && station.toJSON) {
        const stationPlain = station.toJSON();
        rawGalleryImages = stationPlain.galleryImages;
      }
      
      // Process galleryImages based on its type
      if (rawGalleryImages !== undefined && rawGalleryImages !== null) {
        if (typeof rawGalleryImages === 'string') {
          try {
            galleryImages = JSON.parse(rawGalleryImages);
            if (!Array.isArray(galleryImages)) {
              galleryImages = [];
            }
          } catch (e) {
            console.error('[Station Service] Error parsing galleryImages JSON string:', e);
            galleryImages = [];
          }
        } else if (Array.isArray(rawGalleryImages)) {
          galleryImages = rawGalleryImages;
        }
      }
    } catch (error) {
      console.error('[Station Service] Error processing gallery images:', error);
      galleryImages = [];
    }

    return {
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
        fullAddress: station.fullAddress,
        latitude: station.latitude ? parseFloat(station.latitude) : null,
        longitude: station.longitude ? parseFloat(station.longitude) : null,
        // Operating hours
        openingTime: station.openingTime,
        closingTime: station.closingTime,
        open24Hours: station.open24Hours,
        workingDays: station.workingDays || [],
        allDays: station.allDays,
        // Additional info
        amenities: station.amenities || [],
        // Gallery Images
        galleryImages: galleryImages,
        contactNumber: station.contactNumber,
        onlineCPs: onlineCPs,
        totalCPs: chargingPoints.length,
        createdAt: station.createdAt,
        updatedAt: station.updatedAt
      }
    };
  } catch (error) {
    console.error('Error fetching station:', error);
    throw new Error('Failed to fetch station');
  }
}

module.exports = {
  getAllStations,
  getStationById,
  calculateSessionStats
};

