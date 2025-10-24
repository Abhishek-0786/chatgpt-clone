const sequelize = require('../config/database');
const User = require('./User');
const Chat = require('./Chat');
const Message = require('./Message');
const Charger = require('./Charger');
const ChargerData = require('./ChargerData');

// Define associations
User.hasMany(Chat, { foreignKey: 'userId', as: 'chats' });
Chat.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Chat.hasMany(Message, { foreignKey: 'chatId', as: 'messages' });
Message.belongsTo(Chat, { foreignKey: 'chatId', as: 'chat' });

// Charger associations
Charger.hasMany(ChargerData, { foreignKey: 'chargerId', as: 'data' });
ChargerData.belongsTo(Charger, { foreignKey: 'chargerId', as: 'charger' });

// Sync database
const syncDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    await sequelize.sync({ alter: true });
    console.log('Database synchronized successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

module.exports = {
  sequelize,
  User,
  Chat,
  Message,
  Charger,
  ChargerData,
  syncDatabase
};
