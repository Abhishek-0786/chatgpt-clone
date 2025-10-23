const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Chat = sequelize.define('Chat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'New Chat'
  },
  systemInstructions: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: ''
  },
  aiModel: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'gemini',
    validate: {
      isIn: [['gemini', 'openai']]
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  timestamps: true
});

module.exports = Chat;
