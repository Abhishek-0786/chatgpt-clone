const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Connector = sequelize.define('Connector', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  chargingPointId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'charging_points',
      key: 'id'
    },
    comment: 'Foreign key to ChargingPoint table'
  },
  connectorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isIn: [[1, 2, 3]]
    },
    comment: 'Connector number (1, 2, or 3) - unique per charging point'
  },
  connectorType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [['type2', 'ccs2', 'type1', 'gbt', 'nacs', 'ac_socket']]
    }
  },
  power: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: 'Connector power in kW'
  }
}, {
  tableName: 'connectors',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['chargingPointId']
    },
    {
      unique: true,
      fields: ['chargingPointId', 'connectorId'],
      name: 'unique_connector_per_point'
    }
  ]
});

module.exports = Connector;

