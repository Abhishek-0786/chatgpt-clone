const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ChargingPoint = sequelize.define('ChargingPoint', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  chargingPointId: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },
  deviceId: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    },
    comment: 'Unique device ID for linking with ChargerData logs'
  },
  deviceName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 255]
    }
  },
  stationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'stations',
      key: 'id'
    },
    comment: 'Foreign key to Station table'
  },
  tariffId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'tariffs',
      key: 'id'
    },
    comment: 'Foreign key to Tariff table'
  },
  chargerType: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      isIn: [['AC', 'DC']]
    }
  },
  powerCapacity: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: 'Power capacity in kW'
  },
  firmwareVersion: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  oemList: {
    type: DataTypes.STRING(50),
    allowNull: true,
    validate: {
      isIn: [['massive_mobility', 'evre', 'okaya', null]]
    }
  },
  phase: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      isIn: [['phase_r', 'phase_y', 'phase_b', null]]
    }
  },
  status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Offline',
    validate: {
      isIn: [['Online', 'Offline', 'Faulted']]
    }
  },
  cStatus: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Unavailable',
    validate: {
      isIn: [['Available', 'Charging', 'Occupied', 'Unavailable', 'Faulted']]
    },
    comment: 'Connector status'
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
  tableName: 'charging_points',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      unique: true,
      fields: ['chargingPointId']
    },
    {
      unique: true,
      fields: ['deviceId']
    },
    {
      fields: ['stationId']
    },
    {
      fields: ['tariffId']
    },
    {
      fields: ['deleted']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = ChargingPoint;

