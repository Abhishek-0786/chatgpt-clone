const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChargerData = sequelize.define('ChargerData', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  chargerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'chargers',
      key: 'id'
    },
    comment: 'Foreign key to Charger table'
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Charger device ID'
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Message type (OCPP, etc.)'
  },
  connectorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Connector ID'
  },
  messageId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Message identifier'
  },
  message: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Message type (Response, StatusNotification, etc.)'
  },
  messageData: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Message payload data'
  },
  raw: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Raw message data'
  },
  direction: {
    type: DataTypes.ENUM('Incoming', 'Outgoing'),
    allowNull: false,
    comment: 'Message direction'
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Message timestamp'
  }
}, {
  timestamps: true,
  tableName: 'charger_data',
  indexes: [
    {
      fields: ['deviceId']
    },
    {
      fields: ['timestamp']
    },
    {
      fields: ['message']
    },
    {
      fields: ['direction']
    }
  ]
});

module.exports = ChargerData;
