const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Station = sequelize.define('Station', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  stationId: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  stationName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255]
    }
  },
  organization: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      isIn: [['massive_mobility', '1c_ev_charging']]
    }
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Active',
    validate: {
      isIn: [['Active', 'Inactive', 'Maintenance']]
    }
  },
  // Specifications
  powerCapacity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  gridPhase: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [['Single Phase', 'Three Phase']]
    }
  },
  // Location
  pinCode: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  country: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true
  },
  fullAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Other details
  openingTime: {
    type: DataTypes.TIME,
    allowNull: true
  },
  closingTime: {
    type: DataTypes.TIME,
    allowNull: true
  },
  open24Hours: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  workingDays: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  allDays: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  contactNumber: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  inchargeName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  ownerName: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  ownerContact: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  sessionStartStopSMS: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  // Amenities (stored as array)
  amenities: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  createdBy: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'stations',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      unique: true,
      fields: ['stationId']
    },
    {
      fields: ['deleted']
    },
    {
      fields: ['status']
    },
    {
      fields: ['organization']
    }
  ]
});

module.exports = Station;

