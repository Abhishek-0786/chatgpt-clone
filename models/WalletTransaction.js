const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WalletTransaction = sequelize.define('WalletTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  walletId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'wallets',
      key: 'id'
    },
    comment: 'Foreign key to Wallet table'
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    },
    comment: 'Foreign key to Customer table (for quick queries)'
  },
  transactionType: {
    type: DataTypes.ENUM('credit', 'debit', 'refund'),
    allowNull: false,
    comment: 'Type of transaction: credit (top-up), debit (charging), refund'
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: 'Transaction amount'
  },
  balanceBefore: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Wallet balance before this transaction'
  },
  balanceAfter: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Wallet balance after this transaction'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Transaction description (e.g., "Wallet Top-up", "Charging Session #123")'
  },
  referenceId: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'External reference ID (Razorpay payment ID, session ID, etc.)'
  },
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Transaction status'
  },
  transactionCategory: {
    type: DataTypes.ENUM('topup', 'charging', 'refund', 'adjustment'),
    allowNull: false,
    comment: 'Category of transaction'
  }
}, {
  tableName: 'wallet_transactions',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['walletId']
    },
    {
      fields: ['customerId']
    },
    {
      fields: ['referenceId']
    },
    {
      fields: ['status']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = WalletTransaction;

