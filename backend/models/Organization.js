const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Organization = sequelize.define('Organization', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  organizationId: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  organizationName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true,
      len: [1, 255]
    }
  },
  // Basic Details
  gstin: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  organizationType: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  organizationLogo: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  // Contact Details
  contactNumber: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  countryCode: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: '+91'
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  // Address Details
  addressCountry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  addressPinCode: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  addressCity: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  addressState: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  fullAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Payment Details
  bankAccountNumber: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  ifscCode: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  // Billing Address
  billingSameAsCompany: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  billingCountry: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  billingPinCode: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  billingCity: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  billingState: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  billingFullAddress: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Documents (stored as JSON array of {name, path, date})
  documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: []
  },
  deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'organizations',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      unique: true,
      fields: ['organizationId']
    },
    {
      unique: true,
      fields: ['organizationName']
    },
    {
      fields: ['deleted']
    }
  ]
});

module.exports = Organization;

