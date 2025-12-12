const sequelize = require('../config/database');
const User = require('./User');
const Customer = require('./Customer');
const Chat = require('./Chat');
const Message = require('./Message');
const Charger = require('./Charger');
const ChargerData = require('./ChargerData');
const Tariff = require('./Tariff');
const Station = require('./Station');
const ChargingPoint = require('./ChargingPoint');
const Connector = require('./Connector');
const Vehicle = require('./Vehicle');
const Wallet = require('./Wallet');
const WalletTransaction = require('./WalletTransaction');
const ChargingSession = require('./ChargingSession');
const Organization = require('./Organization');

// Define associations
User.hasMany(Chat, { foreignKey: 'userId', as: 'chats' });
Chat.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Chat.hasMany(Message, { foreignKey: 'chatId', as: 'messages' });
Message.belongsTo(Chat, { foreignKey: 'chatId', as: 'chat' });

// Charger associations
Charger.hasMany(ChargerData, { foreignKey: 'chargerId', as: 'data' });
ChargerData.belongsTo(Charger, { foreignKey: 'chargerId', as: 'charger' });

// Organization associations - Temporarily commented out until organizationId column is added via migration
// Organization.hasMany(Station, { foreignKey: 'organizationId', as: 'stations' });
// Station.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organizationData' });

// Station associations
Station.hasMany(ChargingPoint, { foreignKey: 'stationId', as: 'chargingPoints' });
ChargingPoint.belongsTo(Station, { foreignKey: 'stationId', as: 'station' });

// Tariff associations
Tariff.hasMany(ChargingPoint, { foreignKey: 'tariffId', as: 'chargingPoints' });
ChargingPoint.belongsTo(Tariff, { foreignKey: 'tariffId', as: 'tariff' });

// ChargingPoint associations
ChargingPoint.hasMany(Connector, { foreignKey: 'chargingPointId', as: 'connectors' });
Connector.belongsTo(ChargingPoint, { foreignKey: 'chargingPointId', as: 'chargingPoint' });

// Customer associations
Customer.hasMany(Vehicle, { foreignKey: 'customerId', as: 'vehicles' });
Vehicle.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Customer.hasOne(Wallet, { foreignKey: 'customerId', as: 'wallet' });
Wallet.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Wallet.hasMany(WalletTransaction, { foreignKey: 'walletId', as: 'transactions' });
WalletTransaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });

Customer.hasMany(WalletTransaction, { foreignKey: 'customerId', as: 'walletTransactions' });
WalletTransaction.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

Customer.hasMany(ChargingSession, { foreignKey: 'customerId', as: 'chargingSessions' });
ChargingSession.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });

ChargingPoint.hasMany(ChargingSession, { foreignKey: 'chargingPointId', as: 'sessions' });
ChargingSession.belongsTo(ChargingPoint, { foreignKey: 'chargingPointId', as: 'chargingPoint' });

Vehicle.hasMany(ChargingSession, { foreignKey: 'vehicleId', as: 'chargingSessions' });
ChargingSession.belongsTo(Vehicle, { foreignKey: 'vehicleId', as: 'vehicle' });

// Sync database
const syncDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection established successfully.');
    
    await sequelize.sync({ force: false });
    console.log('Database synchronized successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
};

module.exports = {
  sequelize,
  User,
  Customer,
  Chat,
  Message,
  Charger,
  ChargerData,
  Tariff,
  Station,
  ChargingPoint,
  Connector,
  Vehicle,
  Wallet,
  WalletTransaction,
  ChargingSession,
  Organization,
  syncDatabase
};
