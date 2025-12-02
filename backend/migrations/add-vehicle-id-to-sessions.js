require('dotenv').config();
const { Sequelize } = require('sequelize');

async function addVehicleIdToSessions() {
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
      WHERE table_name = 'charging_sessions' 
      AND column_name = 'vehicleId'
    `);

    if (results.length > 0) {
      console.log('✅ vehicleId column already exists');
      return;
    }

    // Add vehicleId column
    console.log('📝 Adding vehicleId column to charging_sessions table...');
    await sequelize.query(`
      ALTER TABLE "charging_sessions" 
      ADD COLUMN IF NOT EXISTS "vehicleId" INTEGER;
    `);

    console.log('✅ vehicleId column added successfully!');

    // Add foreign key constraint
    console.log('📝 Adding foreign key constraint...');
    await sequelize.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'charging_sessions_vehicleId_fkey'
        ) THEN
          ALTER TABLE "charging_sessions" 
          ADD CONSTRAINT "charging_sessions_vehicleId_fkey" 
          FOREIGN KEY ("vehicleId") 
          REFERENCES "vehicles"("id") 
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    console.log('✅ Foreign key constraint added successfully!');
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

addVehicleIdToSessions();

