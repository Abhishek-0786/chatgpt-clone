const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Vehicle = sequelize.define('Vehicle', {
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
  vehicleNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 50]
    },
    comment: 'Vehicle registration number (e.g., MH-01-AB-1234)'
  },
  vehicleType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['2W', '3W', '4W', 'Commercial']]
    },
    comment: 'Vehicle type: 2W, 3W, 4W, or Commercial'
  },
  brand: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    },
    comment: 'Vehicle brand/manufacturer (e.g., Tesla, Tata, Mahindra)'
  },
  modelName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    },
    comment: 'Vehicle model name (e.g., Model 3, Nexon EV)'
  },
  connectorType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [['Type 2', 'CCS', 'CHAdeMO', 'GB/T', 'Bharat AC', 'Bharat DC']]
    },
    comment: 'Connector type for charging'
  },
  batteryCapacity: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    validate: {
      min: 0.1
    },
    comment: 'Battery capacity in kWh'
  }
}, {
  tableName: 'vehicles',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['customerId']
    },
    {
      unique: true,
      fields: ['customerId', 'vehicleNumber'],
      name: 'unique_vehicle_per_customer'
    }
  ]
});

module.exports = Vehicle;

