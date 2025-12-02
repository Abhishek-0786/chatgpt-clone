/**
 * Script to update createdBy field for existing tariffs
 * 
 * Usage: node update-tariffs-createdby.js
 */

const sequelize = require('./config/database');
const { Tariff } = require('./models');

// Username for createdBy field
const USERNAME = 'Abhishek Gupta';

async function updateTariffsCreatedBy() {
  try {
    console.log('🚀 Starting to update tariffs createdBy field...\n');

    // Find all tariffs that don't have createdBy set or have null/empty createdBy
    const tariffs = await Tariff.findAll({
      where: {
        deleted: false
      }
    });

    let totalUpdated = 0;

    for (const tariff of tariffs) {
      // Update if createdBy is null, empty, or not set
      if (!tariff.createdBy || tariff.createdBy.trim() === '' || tariff.createdBy === 'N/A') {
        await tariff.update({
          createdBy: USERNAME
        });
        console.log(`  ✅ Updated: ${tariff.tariffName} - createdBy: ${USERNAME}`);
        totalUpdated++;
      } else {
        console.log(`  ⏭️  Skipped: ${tariff.tariffName} - already has createdBy: ${tariff.createdBy}`);
      }
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   ✅ Updated: ${totalUpdated} tariffs`);
    console.log(`\n✨ Done!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
updateTariffsCreatedBy();

