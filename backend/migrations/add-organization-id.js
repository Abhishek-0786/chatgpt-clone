/**
 * Migration: Add organizationId field to organizations table
 * Generates unique organizationId for existing organizations
 * Format: ORG-{timestamp}-{randomString}
 */

const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    // Check if organizationId column already exists
    const tableDescription = await queryInterface.describeTable('organizations');
    
    if (!tableDescription.organizationId) {
      console.log('Adding organizationId column to organizations table...');
      
      // Add organizationId column (nullable first, then we'll populate it)
      await queryInterface.addColumn('organizations', 'organizationId', {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: false // We'll add unique constraint after populating
      });
      
      console.log('organizationId column added successfully');
    } else {
      console.log('organizationId column already exists, skipping...');
    }
    
    // Generate organizationId for existing organizations that don't have one
    const [results] = await sequelize.query(`
      SELECT id, "organizationName" 
      FROM organizations 
      WHERE "organizationId" IS NULL OR "organizationId" = ''
    `);
    
    if (results && results.length > 0) {
      console.log(`Generating organizationId for ${results.length} existing organizations...`);
      
      for (const org of results) {
        let organizationId;
        let existingOrg;
        let attempts = 0;
        const maxAttempts = 10;
        
        do {
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
          organizationId = `ORG-${timestamp}-${randomStr}`;
          
          // Check if this ID already exists
          const [existing] = await sequelize.query(`
            SELECT id FROM organizations WHERE "organizationId" = :organizationId
          `, {
            replacements: { organizationId }
          });
          
          existingOrg = existing && existing.length > 0;
          attempts++;
          
          if (attempts >= maxAttempts) {
            throw new Error(`Failed to generate unique organizationId after ${maxAttempts} attempts for organization ${org.id}`);
          }
        } while (existingOrg);
        
        // Update the organization with the generated ID
        await sequelize.query(`
          UPDATE organizations 
          SET "organizationId" = :organizationId 
          WHERE id = :id
        `, {
          replacements: { organizationId, id: org.id }
        });
        
        console.log(`Generated organizationId ${organizationId} for organization ${org.organizationName} (ID: ${org.id})`);
      }
      
      console.log('Successfully generated organizationId for all existing organizations');
    } else {
      console.log('All organizations already have organizationId');
    }
    
    // Now make organizationId NOT NULL and add unique constraint
    const [checkNull] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM organizations 
      WHERE "organizationId" IS NULL OR "organizationId" = ''
    `);
    
    if (checkNull[0].count === '0') {
      console.log('Making organizationId NOT NULL and adding unique constraint...');
      
      // First, set NOT NULL constraint
      await sequelize.query(`
        ALTER TABLE organizations 
        ALTER COLUMN "organizationId" SET NOT NULL
      `);
      
      // Then add unique constraint/index
      try {
        await sequelize.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "organizations_organizationId_unique" 
          ON organizations ("organizationId")
        `);
      } catch (error) {
        // Index might already exist, try to drop and recreate
        if (error.message.includes('already exists')) {
          console.log('Unique index already exists, skipping...');
        } else {
          throw error;
        }
      }
      
      console.log('organizationId column is now NOT NULL with unique constraint');
    } else {
      console.log('Warning: Some organizations still have NULL organizationId. Skipping constraint addition.');
    }
    
    console.log('✅ Migration completed successfully');
  } catch (error) {
    console.error('❌ Error in migration:', error);
    throw error;
  }
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    // Check if organizationId column exists
    const tableDescription = await queryInterface.describeTable('organizations');
    
    if (tableDescription.organizationId) {
      console.log('Removing organizationId column from organizations table...');
      
      // Drop unique index first
      try {
        await sequelize.query(`DROP INDEX IF EXISTS "organizations_organizationId_unique"`);
      } catch (error) {
        console.log('Index may not exist, continuing...');
      }
      
      // Remove the column
      await queryInterface.removeColumn('organizations', 'organizationId');
      
      console.log('organizationId column removed successfully');
    } else {
      console.log('organizationId column does not exist, nothing to remove');
    }
    
    console.log('✅ Rollback completed successfully');
  } catch (error) {
    console.error('❌ Error in rollback:', error);
    throw error;
  }
}

module.exports = { up, down };

// If running directly (not as a module)
if (require.main === module) {
  up()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}
