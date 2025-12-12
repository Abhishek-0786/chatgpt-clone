require('dotenv').config();
const { Sequelize } = require('sequelize');

async function addOrganizationFields() {
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

    // First, check and remove companyName column if it exists (we're using organizationName instead)
    const [companyNameCheck] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'organizations'
      AND column_name = 'companyName'
    `);

    if (companyNameCheck.length > 0) {
      console.log('📝 Dropping column "companyName" from organizations table (replaced by organizationName)...');
      await sequelize.query(`ALTER TABLE "organizations" DROP COLUMN "companyName"`);
      console.log('✅ Column "companyName" dropped successfully!');
    }

    // Check and rename companyLogo to organizationLogo if it exists
    const [companyLogoCheck] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'organizations'
      AND column_name = 'companyLogo'
    `);

    const [organizationLogoCheck] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'organizations'
      AND column_name = 'organizationLogo'
    `);

    if (companyLogoCheck.length > 0 && organizationLogoCheck.length === 0) {
      console.log('📝 Renaming column "companyLogo" to "organizationLogo"...');
      await sequelize.query(`ALTER TABLE "organizations" RENAME COLUMN "companyLogo" TO "organizationLogo"`);
      console.log('✅ Column "companyLogo" renamed to "organizationLogo" successfully!');
    } else if (companyLogoCheck.length > 0 && organizationLogoCheck.length > 0) {
      console.log('📝 Both "companyLogo" and "organizationLogo" exist. Dropping "companyLogo"...');
      await sequelize.query(`ALTER TABLE "organizations" DROP COLUMN "companyLogo"`);
      console.log('✅ Column "companyLogo" dropped successfully!');
    }

    // List of all new columns to add
    const columns = [
      { name: 'gstin', type: 'VARCHAR(50)' },
      { name: 'organizationType', type: 'VARCHAR(100)' },
      { name: 'organizationLogo', type: 'VARCHAR(500)' },
      { name: 'contactNumber', type: 'VARCHAR(20)' },
      { name: 'countryCode', type: 'VARCHAR(10)', defaultValue: "'+91'" },
      { name: 'email', type: 'VARCHAR(255)' },
      { name: 'addressCountry', type: 'VARCHAR(100)' },
      { name: 'addressPinCode', type: 'VARCHAR(20)' },
      { name: 'addressCity', type: 'VARCHAR(100)' },
      { name: 'addressState', type: 'VARCHAR(100)' },
      { name: 'fullAddress', type: 'TEXT' },
      { name: 'bankAccountNumber', type: 'VARCHAR(50)' },
      { name: 'ifscCode', type: 'VARCHAR(20)' },
      { name: 'stripePublishableKey', type: 'VARCHAR(255)' },
      { name: 'stripeSecretKey', type: 'VARCHAR(255)' },
      { name: 'redirectUrl', type: 'VARCHAR(500)' },
      { name: 'billingSameAsCompany', type: 'BOOLEAN', defaultValue: 'false' },
      { name: 'billingCountry', type: 'VARCHAR(100)' },
      { name: 'billingPinCode', type: 'VARCHAR(20)' },
      { name: 'billingCity', type: 'VARCHAR(100)' },
      { name: 'billingState', type: 'VARCHAR(100)' },
      { name: 'billingFullAddress', type: 'TEXT' },
      { name: 'documents', type: 'JSONB', defaultValue: "'[]'::jsonb" }
    ];

    // Check existing columns
    const [existingColumns] = await sequelize.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organizations'
    `);

    const existingColumnNames = existingColumns.map(col => col.column_name);

    // Add each column if it doesn't exist
    for (const column of columns) {
      if (existingColumnNames.includes(column.name)) {
        console.log(`✅ Column "${column.name}" already exists`);
        continue;
      }

      console.log(`📝 Adding column "${column.name}" to organizations table...`);
      
      let alterQuery = `ALTER TABLE "organizations" ADD COLUMN "${column.name}" ${column.type}`;
      
      if (column.defaultValue) {
        alterQuery += ` DEFAULT ${column.defaultValue}`;
      } else {
        alterQuery += ' NULL';
      }

      await sequelize.query(alterQuery);
      console.log(`✅ Column "${column.name}" added successfully!`);
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
addOrganizationFields();

