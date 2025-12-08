const { Customer, Vehicle, Wallet, WalletTransaction, ChargingSession, ChargingPoint, Station, Tariff } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const cacheController = require('../libs/redis/cacheController');

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
 * Calculate customer statistics
 * @param {number} customerId - Customer ID
 * @returns {Promise<Object>} - Customer statistics
 */
async function calculateCustomerStats(customerId) {
  const sessions = await ChargingSession.findAll({
    where: {
      customerId: customerId,
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

  const stats = sessions[0] || {};

  // Calculate average duration
  const sessionsWithDuration = await ChargingSession.findAll({
    where: {
      customerId: customerId,
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

  // Calculate total billed amount
  const sessionsForBilling = await ChargingSession.findAll({
    where: {
      customerId: customerId,
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
    totalSessions: parseInt(stats.totalSessions) || 0,
    totalEnergy: parseFloat(stats.totalEnergy) || 0,
    lastActive: stats.lastActive || null,
    avgDuration: avgDurationFormatted,
    totalBilledAmount: totalBilledAmount,
    status: status
  };
}

/**
 * Get all customers with their statistics
 * @param {Object} filters - Filter options (searchTerm, fromDate, toDate)
 * @param {Object} pagination - Pagination options (not used currently, but kept for consistency)
 * @returns {Promise<Object>} - Customers with statistics
 */
async function getAllCustomers(filters, pagination) {
  const { searchTerm = '', fromDate, toDate } = filters;

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

  // Exclude system customer from customer list
  where.email = { [Op.ne]: 'system@cms.admin' };

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
      const stats = await calculateCustomerStats(customer.id);
      const defaultVehicle = customer.vehicles && customer.vehicles[0];
      const wallet = customer.wallet || { balance: 0 };
      const walletBalance = parseFloat(wallet.balance) || 0;

      return {
        id: customer.id,
        customerName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        noSessions: stats.totalSessions,
        totalEnergy: stats.totalEnergy,
        avgDuration: stats.avgDuration,
        defaultVehicle: defaultVehicle 
          ? `${defaultVehicle.brand || ''} ${defaultVehicle.modelName || ''}`.trim() 
          : null,
        lastActive: stats.lastActive,
        createdAt: customer.createdAt,
        walletBalance: walletBalance,
        totalBilledAmount: stats.totalBilledAmount,
        status: stats.status
      };
    })
  );

  return {
    success: true,
    customers: customersWithStats,
    total: customersWithStats.length
  };
}

/**
 * Get customer details by ID
 * @param {number} customerId - Customer ID
 * @returns {Promise<Object|null>} - Customer details with statistics, or null if not found or system customer
 */
async function getCustomerById(customerId) {
  // Check if system customer
  if (await isSystemCustomer(customerId)) {
    return null; // Return null to indicate 404
  }

  // Build cache key
  const cacheKey = `customer:${customerId}`;

  // Try to get from cache
  const cached = await cacheController.get(cacheKey);
  if (cached) {
    return cached;
  }

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
    return null;
  }

  // Block access to system customer detail view
  if (customer.email === 'system@cms.admin') {
    return null;
  }

  // Get statistics
  const stats = await calculateCustomerStats(customer.id);
  const wallet = customer.wallet || { balance: 0 };
  const defaultVehicle = customer.vehicles && customer.vehicles[0];

  const response = {
    success: true,
    customer: {
      id: customer.id,
      customerName: customer.fullName,
      phone: customer.phone,
      email: customer.email,
      createdAt: customer.createdAt,
      walletBalance: parseFloat(wallet.balance) || 0,
      noSessions: stats.totalSessions,
      totalEnergy: stats.totalEnergy,
      lastActive: stats.lastActive,
      defaultVehicle: defaultVehicle ? {
        vehicleNumber: defaultVehicle.vehicleNumber,
        brand: defaultVehicle.brand,
        modelName: defaultVehicle.modelName,
        vehicleType: defaultVehicle.vehicleType,
        connectorType: defaultVehicle.connectorType,
        batteryCapacity: parseFloat(defaultVehicle.batteryCapacity) || 0
      } : null
    }
  };

  // Cache the response
  await cacheController.set(cacheKey, response, 300);

  return response;
}

/**
 * Get wallet transactions for a specific customer
 * @param {number} customerId - Customer ID
 * @param {Object} filters - Filter options (fromDate, toDate)
 * @returns {Promise<Object>} - Wallet transactions
 */
async function getCustomerWalletTransactions(customerId, filters) {
  // Check if system customer
  if (await isSystemCustomer(customerId)) {
    return null; // Return null to indicate 404
  }

  // Verify customer exists and is not system customer
  const customer = await Customer.findByPk(customerId);
  if (!customer || customer.email === 'system@cms.admin') {
    return null;
  }

  const { fromDate, toDate } = filters;

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

  return {
    success: true,
    transactions: formattedTransactions,
    total: formattedTransactions.length,
    customerName: customer.fullName
  };
}

/**
 * Get charging sessions for a specific customer
 * @param {number} customerId - Customer ID
 * @param {Object} filters - Filter options (fromDate, toDate)
 * @param {Object} pagination - Pagination options (page, limit)
 * @returns {Promise<Object>} - Charging sessions
 */
async function getCustomerSessions(customerId, filters, pagination) {
  // Check if system customer
  if (await isSystemCustomer(customerId)) {
    return null; // Return null to indicate 404
  }

  // Verify customer exists and is not system customer
  const customer = await Customer.findByPk(customerId);
  if (!customer || customer.email === 'system@cms.admin') {
    return null;
  }

  const page = pagination.page || 1;
  const limit = pagination.limit || 20;
  const offset = (page - 1) * limit;

  // Parse dates
  let fromDate = null;
  let toDate = null;
  
  if (filters.fromDate) {
    fromDate = new Date(filters.fromDate);
    fromDate.setHours(0, 0, 0, 0);
  }
  
  if (filters.toDate) {
    toDate = new Date(filters.toDate);
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
    } else if (session.stopReason === 'ChargingCompleted') {
      formattedStopReason = 'Charging completed';
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

  return {
    success: true,
    sessions: formattedSessions,
    total: count,
    page: page,
    limit: limit,
    totalPages: totalPages
  };
}

module.exports = {
  getAllCustomers,
  getCustomerById,
  getCustomerWalletTransactions,
  getCustomerSessions,
  calculateCustomerStats,
  getSystemCustomerId,
  isSystemCustomer
};

