const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const { Customer, ChargingSession, Station, ChargingPoint, Connector, WalletTransaction, Charger, Wallet } = require('../models');

const { getSystemCustomerId, isSystemCustomer } = require('../services/cmsCustomerService');
const { calculateSessionStats, calculateStationRealTimeStatus } = require('../services/cmsStationService');
const { hasFault, hasActiveTransaction, calculateChargingPointRealTimeStatus } = require('../services/chargingPointService');

async function getDashboardStats(filters) {
  const systemCustomerId = await getSystemCustomerId();
  
  const data = {
    totals: {
      customers: 0,
      stations: 0,
      chargingPoints: 0,
      revenue: 0,
      energy: 0
    },
    status: {
      stationsOnline: 0,
      stationsOffline: 0,
      chargersAvailable: 0,
      chargersBusy: 0,
      chargersFaulted: 0,
      chargersUnavailable: 0,
      activeSessions: 0
    },
    recent: {
      sessions: [],
      customers: [],
      lowBalanceCustomers: []
    }
  };

  data.totals.customers = await Customer.count({
    where: { id: { [Op.ne]: systemCustomerId } }
  });

  data.status.activeSessions = await ChargingSession.count({
    where: {
      status: 'active',
      customerId: { [Op.ne]: systemCustomerId }
    }
  });

  const sessionWhere = {
    status: { [Op.in]: ['completed', 'stopped'] },
    customerId: { [Op.ne]: systemCustomerId }
  };

  data.totals.sessions = await ChargingSession.count({
    where: sessionWhere
  });

  const revenueSum = await ChargingSession.sum('finalAmount', {
    where: sessionWhere
  });
  data.totals.revenue = revenueSum || 0;

  const energySum = await ChargingSession.sum('energyConsumed', {
    where: sessionWhere
  });
  data.totals.energy = energySum || 0;

  data.totals.stations = await Station.count({
    where: { deleted: false }
  });

  data.totals.chargingPoints = await ChargingPoint.count({
    where: { deleted: false }
  });

  // Calculate station online/offline status
  const stations = await Station.findAll({
    where: { deleted: false },
    attributes: ['id', 'stationId', 'stationName']
  });

  const offlineStationsList = [];

  for (const station of stations) {
    const statusResult = await calculateStationRealTimeStatus(station.stationId);
    if (statusResult && statusResult.status === 'Online') {
      data.status.stationsOnline++;
    } else {
      data.status.stationsOffline++;
      // Add to offline stations list
      offlineStationsList.push({
        stationId: station.stationId,
        name: station.stationName || station.stationId
      });
    }
  }

  // Add offline stations list to data
  data.offlineStations = offlineStationsList;

  // Calculate charger status (Available, Busy, Faulted, Unavailable)
  const chargingPoints = await ChargingPoint.findAll({
    where: { deleted: false },
    attributes: ['id', 'deviceId']
  });

  for (const cp of chargingPoints) {
    if (cp.deviceId) {
      // First check if charger is online
      const realTimeStatus = await calculateChargingPointRealTimeStatus(cp.deviceId);
      
      if (realTimeStatus === 'Online') {
        // Only count as Available/Busy/Faulted if charger is online
        const isBusy = await hasActiveTransaction(cp.deviceId);
        const isFaulted = await hasFault(cp.deviceId);

        if (isBusy) {
          data.status.chargersBusy++;
        } else if (isFaulted) {
          data.status.chargersFaulted++;
        } else {
          data.status.chargersAvailable++;
        }
      } else {
        // If offline, count as Unavailable
        data.status.chargersUnavailable++;
      }
    } else {
      // If no deviceId, count as Unavailable
      data.status.chargersUnavailable++;
    }
  }

  // Fetch recent sessions
  const recentSessions = await ChargingSession.findAll({
    where: {
      customerId: { [Op.ne]: systemCustomerId }
    },
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'fullName']
      },
      {
        model: ChargingPoint,
        as: 'chargingPoint',
        include: [
          {
            model: Station,
            as: 'station',
            attributes: ['id', 'stationId', 'stationName']
          }
        ],
        attributes: ['id', 'deviceName', 'chargingPointId']
      }
    ],
    order: [['createdAt', 'DESC']],
    limit: 10,
    attributes: ['sessionId', 'energyConsumed', 'finalAmount', 'startTime', 'endTime']
  });

  data.recent.sessions = recentSessions.map(session => ({
    sessionId: session.sessionId,
    energy: parseFloat(session.energyConsumed || 0),
    billedAmount: parseFloat(session.finalAmount || 0),
    startTime: session.startTime,
    endTime: session.endTime,
    customerName: session.customer?.fullName || 'Unknown',
    stationName: session.chargingPoint?.station?.stationName || 'N/A',
    chargingPointName: session.chargingPoint?.deviceName || 'N/A'
  }));

  // Fetch recent customers
  const recentCustomers = await Customer.findAll({
    where: {
      id: { [Op.ne]: systemCustomerId }
    },
    order: [['createdAt', 'DESC']],
    limit: 10,
    attributes: ['id', 'fullName', 'phone', 'email', 'createdAt']
  });

  data.recent.customers = recentCustomers.map(customer => ({
    customerId: customer.id,
    name: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    createdAt: customer.createdAt
  }));

  // Fetch low balance customers
  const allCustomersWithWallets = await Customer.findAll({
    where: {
      id: { [Op.ne]: systemCustomerId }
    },
    include: [
      {
        model: Wallet,
        as: 'wallet',
        required: false,
        attributes: ['balance']
      }
    ],
    attributes: ['id', 'fullName']
  });

  data.recent.lowBalanceCustomers = allCustomersWithWallets
    .map(customer => ({
      customerId: customer.id,
      name: customer.fullName,
      balance: parseFloat(customer.wallet?.balance || 0)
    }))
    .filter(customer => customer.balance < 50)
    .sort((a, b) => a.balance - b.balance)
    .slice(0, 10);

  // Calculate average session duration
  const completedSessions = await ChargingSession.findAll({
    where: sessionWhere,
    attributes: ['startTime', 'endTime']
  });

  let totalDuration = 0;
  let validSessions = 0;
  completedSessions.forEach(session => {
    if (session.startTime && session.endTime) {
      const duration = new Date(session.endTime) - new Date(session.startTime);
      if (duration > 0) {
        totalDuration += duration;
        validSessions++;
      }
    }
  });

  const avgDurationMs = validSessions > 0 ? totalDuration / validSessions : 0;
  const hours = Math.floor(avgDurationMs / (1000 * 60 * 60));
  const minutes = Math.floor((avgDurationMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((avgDurationMs % (1000 * 60)) / 1000);
  data.avgDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Calculate top stations by energy
  const allStations = await Station.findAll({
    where: { deleted: false },
    attributes: ['id', 'stationId', 'stationName']
  });

  const stationEnergyStats = [];
  for (const station of allStations) {
    const stationChargingPoints = await ChargingPoint.findAll({
      where: {
        stationId: station.id,
        deleted: false
      },
      attributes: ['id', 'deviceId']
    });

    const deviceIds = stationChargingPoints.map(cp => cp.deviceId).filter(Boolean);
    if (deviceIds.length === 0) continue;

    const stationSessions = await ChargingSession.findAll({
      where: {
        ...sessionWhere,
        deviceId: { [Op.in]: deviceIds }
      },
      attributes: ['energyConsumed']
    });

    const totalEnergy = stationSessions.reduce((sum, s) => sum + parseFloat(s.energyConsumed || 0), 0);
    const sessionCount = stationSessions.length;

    if (totalEnergy > 0) {
      stationEnergyStats.push({
        stationId: station.stationId,
        stationName: station.stationName,
        energy: totalEnergy,
        sessions: sessionCount
      });
    }
  }

  data.topStationsByEnergy = stationEnergyStats
    .sort((a, b) => b.energy - a.energy)
    .slice(0, 10);

  // Calculate top sessions by energy
  const topSessions = await ChargingSession.findAll({
    where: {
      ...sessionWhere,
      energyConsumed: { [Op.ne]: null, [Op.gt]: 0 }
    },
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'fullName']
      },
      {
        model: ChargingPoint,
        as: 'chargingPoint',
        include: [
          {
            model: Station,
            as: 'station',
            attributes: ['id', 'stationId', 'stationName']
          }
        ],
        attributes: ['id', 'deviceName']
      }
    ],
    order: [['energyConsumed', 'DESC']],
    limit: 10,
    attributes: ['sessionId', 'energyConsumed']
  });

  data.topSessionsByEnergy = topSessions.map(session => ({
    sessionId: session.sessionId,
    energy: parseFloat(session.energyConsumed || 0),
    customerName: session.customer?.fullName || 'Unknown',
    chargerName: session.chargingPoint?.deviceName || 'Unknown',
    stationId: session.chargingPoint?.station?.stationId || null,
    stationName: session.chargingPoint?.station?.stationName || 'N/A'
  }));

  return data;
}

async function getDashboardCharts(filters) {
  const systemCustomerId = await getSystemCustomerId();
  
  // Base where clause - exclude system customer
  const baseWhere = {
    customerId: { [Op.ne]: systemCustomerId }
  };

  // Get period from filters (default to 30 days)
  const period = parseInt(filters.period) || 30;
  
  // Calculate date range based on requested period
  // For "Last N Days", we want to include today, so go back (period - 1) days
  const now = new Date();
  const periodStartDate = new Date(now);
  periodStartDate.setDate(periodStartDate.getDate() - (period - 1));
  periodStartDate.setHours(0, 0, 0, 0); // Start of day
  
  // Helper function to replace NULL with 0
  const replaceNull = (value) => value === null ? 0 : parseFloat(value) || 0;

  // Helper function to format date to ISO string
  const formatDate = (dateValue) => {
    if (!dateValue) return null;
    if (dateValue instanceof Date) {
      return dateValue.toISOString();
    }
    if (typeof dateValue === 'string') {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      return dateValue;
    }
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    return dateValue;
  };

  // Helper function to filter data by period (only return last N days)
  // This is needed because DATE_TRUNC('week'/'month') might include periods that start before our cutoff
  const filterByPeriod = (data, dateKey) => {
    const cutoffDate = new Date(periodStartDate);
    cutoffDate.setHours(0, 0, 0, 0); // Start of day for accurate comparison
    return data.filter(item => {
      if (!item[dateKey]) return false;
      const itemDate = new Date(item[dateKey]);
      itemDate.setHours(0, 0, 0, 0);
      return itemDate >= cutoffDate;
    });
  };

  // Determine which aggregation to use and query data
  let chartData = null;
  let dateKey = 'date';
  
  if (period <= 30) {
    // Use daily aggregation for periods <= 30 days
    const dailyData = await ChargingSession.findAll({
      where: {
        ...baseWhere,
        createdAt: { [Op.gte]: periodStartDate }
      },
      attributes: [
        [sequelize.fn('DATE_TRUNC', 'day', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('finalAmount')), 'revenue'],
        [sequelize.fn('SUM', sequelize.col('energyConsumed')), 'energy'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'sessions']
      ],
      group: [sequelize.fn('DATE_TRUNC', 'day', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE_TRUNC', 'day', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    chartData = dailyData.map(item => ({
      date: formatDate(item.date),
      revenue: replaceNull(item.revenue),
      energy: replaceNull(item.energy),
      sessions: parseInt(item.sessions) || 0
    }));
    dateKey = 'date';
    
  } else if (period <= 90) {
    // Use weekly aggregation for periods 31-90 days
    const weeklyData = await ChargingSession.findAll({
      where: {
        ...baseWhere,
        createdAt: { [Op.gte]: periodStartDate }
      },
      attributes: [
        [sequelize.fn('DATE_TRUNC', 'week', sequelize.col('createdAt')), 'week'],
        [sequelize.fn('SUM', sequelize.col('finalAmount')), 'revenue'],
        [sequelize.fn('SUM', sequelize.col('energyConsumed')), 'energy'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'sessions']
      ],
      group: [sequelize.fn('DATE_TRUNC', 'week', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE_TRUNC', 'week', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    chartData = weeklyData.map(item => ({
      week: formatDate(item.week),
      revenue: replaceNull(item.revenue),
      energy: replaceNull(item.energy),
      sessions: parseInt(item.sessions) || 0
    }));
    dateKey = 'week';
    
  } else {
    // Use monthly aggregation for periods > 90 days
    const monthlyData = await ChargingSession.findAll({
      where: {
        ...baseWhere,
        createdAt: { [Op.gte]: periodStartDate }
      },
      attributes: [
        [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'month'],
        [sequelize.fn('SUM', sequelize.col('finalAmount')), 'revenue'],
        [sequelize.fn('SUM', sequelize.col('energyConsumed')), 'energy'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'sessions']
      ],
      group: [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    chartData = monthlyData.map(item => ({
      month: formatDate(item.month),
      revenue: replaceNull(item.revenue),
      energy: replaceNull(item.energy),
      sessions: parseInt(item.sessions) || 0
    }));
    dateKey = 'month';
  }

  // Filter to only include data within the requested period
  const filteredData = filterByPeriod(chartData, dateKey);

  // Helper function to sort by date
  const sortByDate = (arr, dateKey) => {
    return arr.sort((a, b) => {
      const dateA = new Date(a[dateKey]);
      const dateB = new Date(b[dateKey]);
      return dateA - dateB;
    });
  };

  // Sort the filtered data
  const sortedData = sortByDate(filteredData, dateKey);

  // Fill in missing days/weeks/months with zero values
  const fillMissingDates = (data, dateKey) => {
    if (period <= 30 && dateKey === 'date') {
      // For daily data, fill in all days in the period
      const filledData = [];
      const dataMap = new Map();
      
      // Create a map of existing data by date string (YYYY-MM-DD)
      data.forEach(item => {
        if (item[dateKey]) {
          const date = new Date(item[dateKey]);
          const dateStr = date.toISOString().split('T')[0];
          dataMap.set(dateStr, item);
        }
      });
      
      // Generate all dates in the period (from periodStartDate to today, inclusive)
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date(periodStartDate);
      startDate.setHours(0, 0, 0, 0);
      
      // Iterate through each day in the period
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const d = new Date(currentDate);
        const dateStr = d.toISOString().split('T')[0];
        if (dataMap.has(dateStr)) {
          filledData.push(dataMap.get(dateStr));
        } else {
          // Fill with zero values
          filledData.push({
            [dateKey]: formatDate(new Date(d)),
            revenue: 0,
            energy: 0,
            sessions: 0
          });
        }
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return filledData;
    } else if (period <= 90 && dateKey === 'week') {
      // For weekly data, fill in all weeks in the period
      const filledData = [];
      const dataMap = new Map();
      
      // Create a map of existing data by week start date (Monday of the week)
      data.forEach(item => {
        if (item[dateKey]) {
          const date = new Date(item[dateKey]);
          // Get the start of the week (Monday)
          const weekStart = new Date(date);
          const dayOfWeek = weekStart.getDay();
          const diff = weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
          weekStart.setDate(diff);
          weekStart.setHours(0, 0, 0, 0);
          const weekStr = weekStart.toISOString().split('T')[0];
          dataMap.set(weekStr, item);
        }
      });
      
      // Generate all weeks in the period
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date(periodStartDate);
      startDate.setHours(0, 0, 0, 0);
      
      // Start from the Monday of the week containing periodStartDate
      const firstWeekStart = new Date(startDate);
      const dayOfWeek = firstWeekStart.getDay();
      const diff = firstWeekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      firstWeekStart.setDate(diff);
      firstWeekStart.setHours(0, 0, 0, 0);
      
      // Iterate through each week in the period
      const currentWeek = new Date(firstWeekStart);
      while (currentWeek <= endDate) {
        const weekStr = currentWeek.toISOString().split('T')[0];
        if (dataMap.has(weekStr)) {
          filledData.push(dataMap.get(weekStr));
        } else {
          // Fill with zero values
          filledData.push({
            [dateKey]: formatDate(new Date(currentWeek)),
            revenue: 0,
            energy: 0,
            sessions: 0
          });
        }
        // Move to next week (add 7 days)
        currentWeek.setDate(currentWeek.getDate() + 7);
      }
      
      return filledData;
    }
    
    // For monthly data, return as-is (no need to fill)
    return data;
  };

  // Fill missing dates
  const filledData = fillMissingDates(sortedData, dateKey);

  // Format data for charts based on period
  const revenue = filledData.map(item => {
    const result = { value: item.revenue };
    if (item.date) result.date = item.date;
    if (item.week) result.week = item.week;
    if (item.month) result.month = item.month;
    return result;
  });

  const energy = filledData.map(item => {
    const result = { value: item.energy };
    if (item.date) result.date = item.date;
    if (item.week) result.week = item.week;
    if (item.month) result.month = item.month;
    return result;
  });

  const sessions = filledData.map(item => {
    const result = { value: item.sessions };
    if (item.date) result.date = item.date;
    if (item.week) result.week = item.week;
    if (item.month) result.month = item.month;
    return result;
  });

  return {
    revenue,
    energy,
    sessions
  };
}

function getDateRange(filter) {
  return filter; // placeholder
}

function sanitizePagination(query) {
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  return { page, limit, offset: (page - 1) * limit };
}

const tempHelpers = {
  getDateRange,
  sanitizePagination
};

module.exports = {
  getDashboardStats,
  getDashboardCharts
};

module.exports.tempHelpers = tempHelpers;

