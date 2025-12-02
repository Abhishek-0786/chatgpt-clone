const { Sequelize } = require('sequelize');
const path = require('path');
// Always use .env from backend directory, regardless of where server is started
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let sequelize;

if (process.env.DATABASE_URL) {
  // Modify DATABASE_URL to include SSL parameters
  let databaseUrl = process.env.DATABASE_URL;
  
  // Add SSL parameters to the URL if not already present
  if (!databaseUrl.includes('sslmode=')) {
    databaseUrl += databaseUrl.includes('?') ? '&' : '?';
    databaseUrl += 'sslmode=require';
  }
  
  console.log('Using DATABASE_URL with SSL:', databaseUrl.replace(/:[^:@]+@/, ':***@')); // Log without password
  
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  // Fall back to individual variables
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
}

module.exports = sequelize;
