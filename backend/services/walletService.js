const { Wallet, WalletTransaction } = require('../models');
const { Op } = require('sequelize');

/**
 * Get or create wallet for customer
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
 * Get wallet balance
 */
async function getWalletBalance(customerId) {
  const wallet = await getOrCreateWallet(customerId);
  return {
    success: true,
    balance: parseFloat(wallet.balance),
    currency: wallet.currency
  };
}

/**
 * Get wallet transactions with pagination and filters
 */
async function getWalletTransactions(customerId, options = {}) {
  const {
    page = 1,
    limit = 20,
    fromDate,
    toDate,
    type
  } = options;

  const offset = (page - 1) * limit;

  // Build where clause
  const whereClause = {
    customerId: customerId
  };

  if (type) {
    whereClause.transactionType = type;
  }

  if (fromDate || toDate) {
    whereClause.createdAt = {};
    if (fromDate) {
      whereClause.createdAt[Op.gte] = new Date(fromDate);
    }
    if (toDate) {
      // Add one day to include the entire toDate
      const toDateObj = new Date(toDate);
      toDateObj.setHours(23, 59, 59, 999);
      whereClause.createdAt[Op.lte] = toDateObj;
    }
  }

  const { count, rows: transactions } = await WalletTransaction.findAndCountAll({
    where: whereClause,
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });

  return {
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
  };
}

/**
 * Debit wallet (deduct amount)
 */
async function debitWallet(customerId, amount, description, referenceId = null) {
  // Validation: amount must be a number and > 0
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  // Validation: check for duplicate transaction by referenceId
  if (referenceId) {
    const existingTransaction = await WalletTransaction.findOne({
      where: {
        customerId: customerId,
        referenceId: referenceId
      }
    });
    if (existingTransaction) {
      throw new Error('Duplicate transaction');
    }
  }

  const wallet = await getOrCreateWallet(customerId);
  const currentBalance = parseFloat(wallet.balance);

  if (currentBalance < amount) {
    throw new Error('Insufficient wallet balance');
  }

  // Deduct from wallet
  const newBalance = currentBalance - amount;

  await wallet.update({
    balance: newBalance
  });

  // Create transaction
  const transaction = await WalletTransaction.create({
    walletId: wallet.id,
    customerId: customerId,
    transactionType: 'debit',
    amount: amount,
    balanceBefore: currentBalance,
    balanceAfter: newBalance,
    description: description,
    referenceId: referenceId || null,
    status: 'completed',
    transactionCategory: 'charging'
  });

  return {
    success: true,
    transaction: {
      id: transaction.id,
      amount: parseFloat(transaction.amount),
      balanceAfter: newBalance
    }
  };
}

/**
 * Credit wallet (add amount)
 */
async function creditWallet(customerId, amount, description, referenceId = null) {
  // Validation: amount must be a number and > 0
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  // Validation: check for duplicate transaction by referenceId
  if (referenceId) {
    const existingTransaction = await WalletTransaction.findOne({
      where: {
        customerId: customerId,
        referenceId: referenceId
      }
    });
    if (existingTransaction) {
      throw new Error('Duplicate transaction');
    }
  }

  const wallet = await getOrCreateWallet(customerId);
  const currentBalance = parseFloat(wallet.balance);
  const newBalance = currentBalance + amount;

  await wallet.update({
    balance: newBalance
  });

  // Create transaction
  const transaction = await WalletTransaction.create({
    walletId: wallet.id,
    customerId: customerId,
    transactionType: 'credit',
    amount: amount,
    balanceBefore: currentBalance,
    balanceAfter: newBalance,
    description: description,
    referenceId: referenceId || null,
    status: 'completed',
    transactionCategory: 'topup'
  });

  return {
    success: true,
    transaction: {
      id: transaction.id,
      amount: parseFloat(transaction.amount),
      balanceAfter: newBalance
    }
  };
}

/**
 * Refund wallet (refund amount)
 */
async function refundWallet(customerId, amount, description, referenceId = null) {
  // Validation: amount must be a number and > 0
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  // Validation: check for duplicate transaction by referenceId
  if (referenceId) {
    const existingTransaction = await WalletTransaction.findOne({
      where: {
        customerId: customerId,
        referenceId: referenceId
      }
    });
    if (existingTransaction) {
      throw new Error('Duplicate transaction');
    }
  }

  const wallet = await getOrCreateWallet(customerId);
  const currentBalance = parseFloat(wallet.balance);
  const newBalance = currentBalance + amount;

  await wallet.update({
    balance: newBalance
  });

  // Create transaction
  const transaction = await WalletTransaction.create({
    walletId: wallet.id,
    customerId: customerId,
    transactionType: 'refund',
    amount: amount,
    balanceBefore: currentBalance,
    balanceAfter: newBalance,
    description: description,
    referenceId: referenceId || null,
    status: 'completed',
    transactionCategory: 'charging'
  });

  return {
    success: true,
    transaction: {
      id: transaction.id,
      amount: parseFloat(transaction.amount),
      balanceAfter: newBalance
    }
  };
}

module.exports = {
  getOrCreateWallet,
  getWalletBalance,
  getWalletTransactions,
  debitWallet,
  creditWallet,
  refundWallet
};

