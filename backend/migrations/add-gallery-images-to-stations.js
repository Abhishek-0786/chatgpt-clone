/**
 * Migration: Add galleryImages column to stations table
 * 
 * This migration adds a galleryImages JSONB column to store gallery images
 * for charging stations, similar to how documents are stored for organizations.
 * 
 * Run directly: node backend/migrations/add-gallery-images-to-stations.js
 */

const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    const tableDescription = await queryInterface.describeTable('stations');
    
    if (!tableDescription.galleryImages) {
      console.log('Adding galleryImages column to stations table...');
      await queryInterface.addColumn('stations', 'galleryImages', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      });
      console.log('galleryImages column added successfully');
    } else {
      console.log('galleryImages column already exists, skipping...');
    }

    // Update existing stations to have empty array if null
    const [results] = await sequelize.query(`
      UPDATE stations 
      SET "galleryImages" = '[]'::jsonb 
      WHERE "galleryImages" IS NULL
    `);
    
    console.log(`Updated ${results || 0} stations with empty gallery images array`);
    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Error in migration:', error);
    throw error;
  }
}

async function down() {
  const queryInterface = sequelize.getQueryInterface();
  
  try {
    const tableDescription = await queryInterface.describeTable('stations');
    
    if (tableDescription.galleryImages) {
      console.log('Removing galleryImages column from stations table...');
      await queryInterface.removeColumn('stations', 'galleryImages');
      console.log('galleryImages column removed successfully');
    } else {
      console.log('galleryImages column does not exist, skipping...');
    }

    console.log('✅ Rollback completed successfully');

  } catch (error) {
    console.error('❌ Error in rollback:', error);
    throw error;
  }
}

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

module.exports = { up, down };

