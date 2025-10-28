const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Charger = sequelize.define('Charger', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  deviceId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: 'Unique charger device ID'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Human readable charger name'
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Physical location of charger'
  },
  chargerStatus: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
    defaultValue: 'active',
    comment: 'Charger operational status'
  },
  vendor: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Manufacturer name'
  },
  model: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Charger model'
  },
  serialNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Serial number'
  },
  firmwareVersion: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Firmware version'
  },
  meterSerialNumber: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Meter serial number'
  },
  connectorCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Number of connectors'
  },
  powerRating: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Power rating in kW'
  },
  voltage: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Voltage rating in V'
  },
  current: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Current rating in A'
  },
  energyConsumption: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Energy consumption in kWh'
  },
  status: {
    type: DataTypes.ENUM('Available', 'Charging', 'Occupied', 'Unavailable'),
    defaultValue: 'Available',
    comment: 'Current charger status'
  },
  errorCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Current error code'
  },
  vendorId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Vendor ID'
  },
  installationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Installation date'
  },
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last activity timestamp'
  }
}, {
  timestamps: true,
  tableName: 'chargers'
});

module.exports = Charger;
