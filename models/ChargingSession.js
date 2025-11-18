const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChargingSession = sequelize.define('ChargingSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    },
    comment: 'Foreign key to Customer table'
  },
  chargingPointId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'charging_points',
      key: 'id'
    },
    comment: 'Foreign key to ChargingPoint table'
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Charger device ID'
  },
  connectorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Connector ID on the charger'
  },
  sessionId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Unique session ID (generated)'
  },
  transactionId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'OCPP transaction ID from charger'
  },
  status: {
    type: DataTypes.ENUM('pending', 'active', 'completed', 'stopped', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'Session status'
  },
  amountRequested: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Amount user requested to charge (in INR)'
  },
  amountDeducted: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    comment: 'Amount deducted from wallet (in INR)'
  },
  energyConsumed: {
    type: DataTypes.DECIMAL(10, 3),
    allowNull: true,
    comment: 'Energy consumed in kWh'
  },
  finalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'Final amount charged (may differ from requested)'
  },
  refundAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0.00,
    comment: 'Amount refunded if session ended early'
  },
  meterStart: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    comment: 'Meter reading at start (in Wh)'
  },
  meterEnd: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
    comment: 'Meter reading at end (in Wh)'
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Actual charging start time'
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Charging end time'
  },
  stopReason: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Reason for stopping (Local, Remote, etc.)'
  }
}, {
  tableName: 'charging_sessions',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['customerId']
    },
    {
      fields: ['deviceId']
    },
    {
      fields: ['transactionId']
    },
    {
      fields: ['sessionId']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = ChargingSession;

