require('dotenv').config();
const { Sequelize } = require('sequelize');

async function addChargerStatusColumn() {
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

    // Check if column already exists
    const [results] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'chargers' 
      AND column_name = 'chargerStatus'
    `);

    if (results.length > 0) {
      console.log('✅ chargerStatus column already exists');
      return;
    }

    // First create ENUM type if it doesn't exist
    console.log('📝 Creating chargerStatus ENUM type...');
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_chargers_chargerStatus AS ENUM ('active', 'inactive', 'maintenance');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('✅ ENUM type created/verified');

    // Add column
    console.log('📝 Adding chargerStatus column to chargers table...');
    await sequelize.query(`
      ALTER TABLE "chargers" 
      ADD COLUMN IF NOT EXISTS "chargerStatus" 
      enum_chargers_chargerStatus DEFAULT 'active';
    `);

    console.log('✅ chargerStatus column added successfully!');

    // Update existing records with default value
    console.log('🔄 Updating existing records...');
    await sequelize.query(`
      UPDATE "chargers" 
      SET "chargerStatus" = 'active' 
      WHERE "chargerStatus" IS NULL;
    `);

    console.log('✅ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

addChargerStatusColumn();

