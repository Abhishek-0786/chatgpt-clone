require('dotenv').config();
const { Sequelize } = require('sequelize');

async function addUserFields() {
  // Database connection
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: console.log
    }
  );

  try {
    console.log('🔌 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Check if fullName column already exists
    const [fullNameCheck] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Users' 
      AND column_name = 'fullName'
    `);

    if (fullNameCheck.length === 0) {
      console.log('📝 Adding fullName column to Users table...');
      await sequelize.query(`
        ALTER TABLE "Users" 
        ADD COLUMN "fullName" VARCHAR(100);
      `);
      console.log('✅ fullName column added successfully!');
    } else {
      console.log('✅ fullName column already exists');
    }

    // Check if phone column already exists
    const [phoneCheck] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Users' 
      AND column_name = 'phone'
    `);

    if (phoneCheck.length === 0) {
      console.log('📝 Adding phone column to Users table...');
      await sequelize.query(`
        ALTER TABLE "Users" 
        ADD COLUMN "phone" VARCHAR(15);
      `);
      console.log('✅ phone column added successfully!');
    } else {
      console.log('✅ phone column already exists');
    }

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run migration
addUserFields();

