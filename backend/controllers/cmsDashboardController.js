const dashboardService = require('../services/dashboardService');
const cacheController = require('../libs/redis/cacheController');
const { dashboardStatsKey, dashboardChartsKey } = require('../libs/redis/keyNaming');

exports.getDashboardStats = async (req, res) => {
  try {
    const filters = req.query || {};
    
    // Build cache key
    const cacheKey = dashboardStatsKey();
    
    // Try to get from cache
    const cached = await cacheController.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }
    
    const data = await dashboardService.getDashboardStats(filters);
    
    // Transform nested structure to flat structure expected by frontend
    const stats = {
      totalCustomers: data.totals.customers || 0,
      activeSessions: data.status.activeSessions || 0,
      totalSessions: data.totals.sessions || 0,
      totalRevenue: data.totals.revenue || 0,
      totalEnergy: data.totals.energy || 0,
      totalStations: data.totals.stations || 0,
      totalChargers: data.totals.chargingPoints || 0,
      avgDuration: data.avgDuration || '00:00',
      customersChange: 0,
      sessionsChange: 0,
      revenueChange: 0,
      energyChange: 0,
      stationsOnline: data.status.stationsOnline || 0,
      stationsOffline: data.status.stationsOffline || 0,
      chargersAvailable: data.status.chargersAvailable || 0,
      chargersBusy: data.status.chargersBusy || 0,
      chargersFaulted: data.status.chargersFaulted || 0,
      chargersUnavailable: data.status.chargersUnavailable || 0
    };
    
    const response = {
      success: true,
      stats,
      todayStats: {},
      stationStatus: {
        online: stats.stationsOnline,
        offline: stats.stationsOffline,
        offlineStations: data.offlineStations || []
      },
      chargerStatus: {
        available: stats.chargersAvailable,
        busy: stats.chargersBusy,
        faulted: stats.chargersFaulted,
        unavailable: stats.chargersUnavailable
      },
      recentSessions: data.recent.sessions || [],
      recentCustomers: data.recent.customers || [],
      topStationsByEnergy: data.topStationsByEnergy || [],
      topSessionsByEnergy: data.topSessionsByEnergy || []
    };
    
    // Cache the response (60 seconds TTL - shorter for real-time data)
    await cacheController.set(cacheKey, response, 60);
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('❌ Dashboard Stats Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard stats'
    });
  }
};

exports.getDashboardCharts = async (req, res) => {
  try {
    const filters = req.query || {};
    const period = filters.period || 30;
    
    // Build cache key for charts (include period to avoid cache conflicts)
    const cacheKey = `dashboard:charts:${period}`;
    
    // Try to get from cache
    const cached = await cacheController.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }
    
    const data = await dashboardService.getDashboardCharts(filters);
    
    const response = {
      success: true,
      data
    };
    
    // Cache the response (120 seconds TTL - charts are less real-time)
    await cacheController.set(cacheKey, response, 120);
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('❌ Dashboard Charts Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load dashboard charts'
    });
  }
};

