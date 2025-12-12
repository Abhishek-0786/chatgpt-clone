require('dotenv').config();
const { Sequelize } = require('sequelize');

async function removeStripeFields() {
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
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Columns to remove
    const columnsToRemove = ['stripePublishableKey', 'stripeSecretKey', 'redirectUrl'];

    // Check existing columns
    const [existingColumns] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organizations'
    `);

    const existingColumnNames = existingColumns.map(col => col.column_name);

    // Drop each column if it exists
    for (const columnName of columnsToRemove) {
      if (existingColumnNames.includes(columnName)) {
        console.log(`📝 Dropping column "${columnName}" from organizations table...`);
        await sequelize.query(`ALTER TABLE "organizations" DROP COLUMN "${columnName}"`);
        console.log(`✅ Column "${columnName}" dropped successfully!`);
      } else {
        console.log(`✅ Column "${columnName}" does not exist`);
      }
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

removeStripeFields();

