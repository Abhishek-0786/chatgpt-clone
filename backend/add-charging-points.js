/**
 * Script to add charging points to CMS
 * This script adds charging points based on the provided data
 * 
 * Usage: node add-charging-points.js
 */

const sequelize = require('./config/database');
const { Station, ChargingPoint, Connector, Tariff } = require('./models');

// Username for createdBy field
const USERNAME = 'Abhishek Gupta'; // Change this to the actual username

// Charging points data
const chargingPointsData = [
  // 1. Sector 62 Noida EV FastCharge
  {
    stationName: 'Sector 62 Noida EV FastCharge',
    points: [
      {
        deviceName: 'S62-AC-01',
        tariffName: 'Noida FastCharge Plan',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'S62-AC-02',
        tariffName: 'Noida FastCharge Plan',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'S62-DC-01',
        tariffName: 'Noida FastCharge Plan',
        chargerType: 'DC',
        powerCapacity: 30,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 15, connectorId: 1 },
          { type: 'gbt', power: 15, connectorId: 2 }
        ]
      }
    ]
  },
  // 2. Nehru Place Charging Zone
  {
    stationName: 'Nehru Place Charging Zone',
    points: [
      {
        deviceName: 'NP-AC-01',
        tariffName: 'Nehru Metro SmartCharge',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'NP-AC-02',
        tariffName: 'Nehru Metro SmartCharge',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'NP-DC-01',
        tariffName: 'Nehru Metro SmartCharge',
        chargerType: 'DC',
        powerCapacity: 30,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 15, connectorId: 1 },
          { type: 'gbt', power: 15, connectorId: 2 }
        ]
      }
    ]
  },
  // 3. Golf Course Road Rapid Charger
  {
    stationName: 'Golf Course Road Rapid Charger',
    points: [
      {
        deviceName: 'GOLF-AC-01',
        tariffName: 'Golf Premium Express',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'GOLF-AC-02',
        tariffName: 'Golf Premium Express',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'GOLF-DC-01',
        tariffName: 'Golf Premium Express',
        chargerType: 'DC',
        powerCapacity: 60,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 40, connectorId: 1 },
          { type: 'gbt', power: 20, connectorId: 2 }
        ]
      }
    ]
  },
  // 4. Dwarka Sector 21 EV Terminal
  {
    stationName: 'Dwarka Sector 21 EV Terminal',
    points: [
      {
        deviceName: 'DW-AC-01',
        tariffName: 'Dwarka Commercial Hub Tariff',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'DW-AC-02',
        tariffName: 'Dwarka Commercial Hub Tariff',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'DW-DC-01',
        tariffName: 'Dwarka Commercial Hub Tariff',
        chargerType: 'DC',
        powerCapacity: 50,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 25, connectorId: 1 },
          { type: 'gbt', power: 25, connectorId: 2 }
        ]
      }
    ]
  },
  // 5. Indirapuram Habitat Centre EV Station
  {
    stationName: 'Indirapuram Habitat Centre EV Station',
    points: [
      {
        deviceName: 'IN-AC-01',
        tariffName: 'Indirapuram Standard AC Charge',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'IN-AC-02',
        tariffName: 'Indirapuram Standard AC Charge',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'IN-DC-01',
        tariffName: 'Indirapuram Standard AC Charge',
        chargerType: 'DC',
        powerCapacity: 30,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 30, connectorId: 1 }
        ]
      }
    ]
  },
  // 6. Millennial City Centre EV Plaza
  {
    stationName: 'Millennial City Centre EV Plaza',
    points: [
      {
        deviceName: 'MCC-AC-01',
        tariffName: 'Millennial City Centre Charge Plan',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'MCC-AC-02',
        tariffName: 'Millennial City Centre Charge Plan',
        chargerType: 'AC',
        powerCapacity: 3.3,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 3.3, connectorId: 1 }
        ]
      },
      {
        deviceName: 'MCC-DC-01',
        tariffName: 'Millennial City Centre Charge Plan',
        chargerType: 'DC',
        powerCapacity: 60,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 30, connectorId: 1 },
          { type: 'gbt', power: 30, connectorId: 2 }
        ]
      }
    ]
  },
  // 7. AIIMS Hospital Charging Point
  {
    stationName: 'AIIMS Hospital Charging Point',
    points: [
      {
        deviceName: 'AIIMS-AC-01',
        tariffName: 'AIIMS Emergency EV Support',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'AIIMS-AC-02',
        tariffName: 'AIIMS Emergency EV Support',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'AIIMS-DC-01',
        tariffName: 'AIIMS Emergency EV Support',
        chargerType: 'DC',
        powerCapacity: 60,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 30, connectorId: 1 },
          { type: 'gbt', power: 30, connectorId: 2 }
        ]
      }
    ]
  },
  // 8. Sector 18 Noida EV Station
  {
    stationName: 'Sector 18 Noida EV Station',
    points: [
      {
        deviceName: 'N18-AC-01',
        tariffName: 'Noida Central Charge Plan',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'N18-AC-02',
        tariffName: 'Noida Central Charge Plan',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'N18-DC-01',
        tariffName: 'Noida Central Charge Plan',
        chargerType: 'DC',
        powerCapacity: 30,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 30, connectorId: 1 }
        ]
      }
    ]
  },
  // 9. Cyber City Charge Point
  {
    stationName: 'Cyber City Charge Point',
    points: [
      {
        deviceName: 'CY-AC-01',
        tariffName: 'Cyber Premium FastCharge',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'CY-AC-02',
        tariffName: 'Cyber Premium FastCharge',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'CY-DC-01',
        tariffName: 'Cyber Premium FastCharge',
        chargerType: 'DC',
        powerCapacity: 60,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 30, connectorId: 1 },
          { type: 'gbt', power: 30, connectorId: 2 }
        ]
      }
    ]
  },
  // 10. Connaught Place EV Hub
  {
    stationName: 'Connaught Place EV Hub',
    points: [
      {
        deviceName: 'CP-AC-01',
        tariffName: 'CP Urban SmartCharge',
        chargerType: 'AC',
        powerCapacity: 22,
        oem: 'evre',
        phase: 'phase_r',
        connectors: [
          { type: 'type2', power: 11, connectorId: 1 },
          { type: 'type2', power: 11, connectorId: 2 }
        ]
      },
      {
        deviceName: 'CP-AC-02',
        tariffName: 'CP Urban SmartCharge',
        chargerType: 'AC',
        powerCapacity: 7.4,
        oem: 'massive_mobility',
        phase: 'phase_r',
        connectors: [
          { type: 'ac_socket', power: 7.4, connectorId: 1 }
        ]
      },
      {
        deviceName: 'CP-DC-01',
        tariffName: 'CP Urban SmartCharge',
        chargerType: 'DC',
        powerCapacity: 50,
        oem: 'okaya',
        phase: 'phase_r',
        connectors: [
          { type: 'ccs2', power: 25, connectorId: 1 },
          { type: 'gbt', power: 25, connectorId: 2 }
        ]
      }
    ]
  }
];

async function addChargingPoints() {
  try {
    console.log('🚀 Starting to add charging points...\n');

    let totalCreated = 0;
    let totalSkipped = 0;
    const errors = [];

    for (const stationData of chargingPointsData) {
      const { stationName, points } = stationData;

      // Find station by name
      const station = await Station.findOne({
        where: {
          stationName: stationName,
          deleted: false
        }
      });

      if (!station) {
        console.log(`❌ Station not found: ${stationName}`);
        errors.push(`Station not found: ${stationName}`);
        continue;
      }

      console.log(`\n📍 Processing station: ${stationName} (ID: ${station.id})`);

      for (const pointData of points) {
        const { deviceName, tariffName, chargerType, powerCapacity, oem, phase, connectors } = pointData;

        // Find tariff by name
        const tariff = await Tariff.findOne({
          where: {
            tariffName: tariffName,
            deleted: false
          }
        });

        if (!tariff) {
          console.log(`  ⚠️  Tariff not found: ${tariffName} for device ${deviceName}`);
          errors.push(`Tariff not found: ${tariffName} for device ${deviceName}`);
          continue;
        }

        // Check if charging point already exists
        const existingPoint = await ChargingPoint.findOne({
          where: {
            deviceName: deviceName,
            deleted: false
          }
        });

        if (existingPoint) {
          console.log(`  ⏭️  Skipping ${deviceName} (already exists)`);
          totalSkipped++;
          continue;
        }

        // Generate unique chargingPointId
        let chargingPointId;
        let existingPointId;
        do {
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
          chargingPointId = `CP-${timestamp}-${randomStr}`;
          existingPointId = await ChargingPoint.findOne({ where: { chargingPointId } });
        } while (existingPointId);

        // Generate unique deviceId
        let deviceId;
        let existingDevice;
        do {
          const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
          deviceId = `DEV${randomStr}`;
          existingDevice = await ChargingPoint.findOne({ where: { deviceId } });
        } while (existingDevice);

        // Create charging point
        const chargingPoint = await ChargingPoint.create({
          chargingPointId,
          deviceId,
          deviceName,
          stationId: station.id,
          tariffId: tariff.id,
          chargerType,
          powerCapacity: parseFloat(powerCapacity),
          firmwareVersion: null,
          oemList: oem,
          phase: phase,
          status: 'Offline',
          cStatus: 'Unavailable',
          createdBy: USERNAME,
          deleted: false
        });

        console.log(`  ✅ Created charging point: ${deviceName} (${chargingPointId})`);

        // Create connectors
        for (const connectorData of connectors) {
          await Connector.create({
            chargingPointId: chargingPoint.id,
            connectorId: connectorData.connectorId,
            connectorType: connectorData.type,
            power: parseFloat(connectorData.power)
          });
        }

        console.log(`     └─ Added ${connectors.length} connector(s)`);
        totalCreated++;
      }
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   ✅ Created: ${totalCreated} charging points`);
    console.log(`   ⏭️  Skipped: ${totalSkipped} charging points`);
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
addChargingPoints();

