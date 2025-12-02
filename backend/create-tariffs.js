/**
 * Script to create tariffs for all stations
 * This script creates tariffs based on the provided tariff list
 * 
 * Usage: node create-tariffs.js
 */

const sequelize = require('./config/database');
const { Tariff } = require('./models');

// Username for createdBy field
const USERNAME = 'Abhishek Gupta'; // Change this to the actual username

// Tariff data
const tariffsData = [
  {
    tariffName: 'Noida FastCharge Plan',
    baseCharges: 18.50,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'Nehru Metro SmartCharge',
    baseCharges: 16.50,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'Golf Premium Express',
    baseCharges: 23.00,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'Dwarka Commercial Hub Tariff',
    baseCharges: 18.00,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'Indirapuram Standard AC Charge',
    baseCharges: 14.00,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'Millennial City Center Charge Plan',
    baseCharges: 15.00,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'AIIMS Emergency EV Support',
    baseCharges: 15.00,
    tax: 12,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'Noida Central Charge Plan',
    baseCharges: 17.00,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'Cyber Premium FastCharge',
    baseCharges: 24.00,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  },
  {
    tariffName: 'CP Urban SmartCharge',
    baseCharges: 19.00,
    tax: 18,
    currency: 'INR',
    status: 'Active'
  }
];

async function createTariffs() {
  try {
    console.log('🚀 Starting to create tariffs...\n');

    let totalCreated = 0;
    let totalSkipped = 0;
    const errors = [];

    for (const tariffData of tariffsData) {
      const { tariffName, baseCharges, tax, currency, status } = tariffData;

      // Check if tariff already exists
      const existingTariff = await Tariff.findOne({
        where: {
          tariffName: tariffName,
          deleted: false
        }
      });

      if (existingTariff) {
        console.log(`  ⏭️  Skipping ${tariffName} (already exists)`);
        totalSkipped++;
        continue;
      }

      // Generate unique tariffId
      let tariffId;
      let existingTariffId;
      do {
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        tariffId = `TAR-${timestamp}-${randomStr}`;
        existingTariffId = await Tariff.findOne({ where: { tariffId } });
      } while (existingTariffId);

      // Create tariff
      const tariff = await Tariff.create({
        tariffId,
        tariffName,
        currency,
        baseCharges: parseFloat(baseCharges),
        tax: parseFloat(tax),
        status,
        createdBy: USERNAME,
        deleted: false
      });

      console.log(`  ✅ Created: ${tariffName} (${tariffId}) - ₹${baseCharges}/kWh + ${tax}% tax`);
      totalCreated++;
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   ✅ Created: ${totalCreated} tariffs`);
    console.log(`   ⏭️  Skipped: ${totalSkipped} tariffs`);
    if (errors.length > 0) {
      console.log(`   ❌ Errors: ${errors.length}`);
      console.log(`\n   Error details:`);
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }

    console.log(`\n✨ Done!`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
createTariffs();

