/**
 * Script to update existing stations with new details
 * This script updates all 10 stations with the provided information
 * 
 * Usage: node update-stations.js
 */

const sequelize = require('./config/database');
const { Station } = require('./models');

// Station update data
const stationsData = [
  {
    stationName: 'Connaught Place EV Hub',
    organization: 'massive_mobility',
    status: 'Active',
    powerCapacity: 150,
    gridPhase: 'Three Phase',
    pinCode: '110001',
    city: 'Connaught Place',
    state: 'Delhi',
    country: 'India',
    latitude: 28.628646,
    longitude: 77.226826,
    fullAddress: 'Block A, Connaught Place, Rajiv Chowk, New Delhi, Delhi 110001, India',
    openingTime: '06:00:00',
    closingTime: '22:00:00',
    open24Hours: false,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 9876543210',
    inchargeName: 'Rajesh Kumar',
    stationOwnerName: 'Prakash Sharma',
    stationOwnerContactNo: '+91 9811122334',
    amenities: ['Restaurant', 'Mall', 'ATM']
  },
  {
    stationName: 'Cyber City Charge Point',
    organization: '1c_ev_charging',
    status: 'Active',
    powerCapacity: 200,
    gridPhase: 'Three Phase',
    pinCode: '122002',
    city: 'DLF Cyber City (Phase III)',
    state: 'Haryana',
    country: 'India',
    latitude: 28.497922,
    longitude: 77.088693,
    fullAddress: 'Building 10C, DLF Cyber City, Phase III, Gurugram, Haryana 122002, India',
    openingTime: null,
    closingTime: null,
    open24Hours: true,
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 9899898989',
    inchargeName: 'Sandeep Malik',
    stationOwnerName: 'DLF Smart Energy',
    stationOwnerContactNo: '+91 9877788881',
    amenities: ['Restaurant', 'Hotel', 'Mall', 'Cafe']
  },
  {
    stationName: 'Sector 18 Noida EV Station',
    organization: 'genx',
    status: 'Active',
    powerCapacity: 120,
    gridPhase: 'Three Phase',
    pinCode: '201301',
    city: 'Sector 18, Noida',
    state: 'Uttar Pradesh',
    country: 'India',
    latitude: 28.569588,
    longitude: 77.323109,
    fullAddress: 'Parking Area near DLF Mall of India, Sector 18, Noida, Uttar Pradesh 201301, India',
    openingTime: '09:00:00',
    closingTime: '21:00:00',
    open24Hours: false,
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 8822334455',
    inchargeName: 'Ashutosh Verma',
    stationOwnerName: 'SunCharge EV',
    stationOwnerContactNo: '+91 9988776655',
    amenities: ['Restaurant', 'Mall', 'Cafe', 'ATM']
  },
  {
    stationName: 'AIIMS Hospital Charging Point',
    organization: 'massive_mobility',
    status: 'Active',
    powerCapacity: 90,
    gridPhase: 'Three Phase',
    pinCode: '110029',
    city: 'AIIMS, Ansari Nagar',
    state: 'Delhi',
    country: 'India',
    latitude: 28.567818,
    longitude: 77.209562,
    fullAddress: 'Sri Aurobindo Marg, Ansari Nagar East, AIIMS Campus, New Delhi 110029, India',
    openingTime: null,
    closingTime: null,
    open24Hours: true,
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 9810081100',
    inchargeName: 'Vinod Sethi',
    stationOwnerName: 'Delhi Govt Energy',
    stationOwnerContactNo: '+91 8866554433',
    amenities: ['Hospital', 'Restaurant', 'ATM']
  },
  {
    stationName: 'Millennial City Center EV Plaza',
    organization: 'genx',
    status: 'Maintenance',
    powerCapacity: 180,
    gridPhase: 'Three Phase',
    pinCode: '122007',
    city: 'Sector 29, Gurugram',
    state: 'Haryana',
    country: 'India',
    latitude: 28.45934,
    longitude: 77.07266,
    fullAddress: 'Outside Millennium City Centre Gurugram Metro Station, Sector 29, Gurugram, Haryana 122007, India',
    openingTime: '07:00:00',
    closingTime: '23:00:00',
    open24Hours: false,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    stationContactNumber: '+91 9988225566',
    inchargeName: 'Preeti Chauhan',
    stationOwnerName: 'FastCharge',
    stationOwnerContactNo: '+91 9999200001',
    amenities: ['Mall', 'Cafe', 'Hotel']
  },
  {
    stationName: 'Indirapuram Habitat Centre EV Station',
    organization: '1c_ev_charging',
    status: 'Active',
    powerCapacity: 110,
    gridPhase: 'Three Phase',
    pinCode: '201001',
    city: 'Indirapuram, Ghaziabad',
    state: 'Uttar Pradesh',
    country: 'India',
    latitude: 28.64,
    longitude: 77.369,
    fullAddress: 'Indirapuram Habitat Centre, Doctor Sushila Naiyar Marg, Indirapuram, Ghaziabad, Uttar Pradesh 201001, India',
    openingTime: '05:00:00',
    closingTime: '23:59:00',
    open24Hours: false,
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 9711332200',
    inchargeName: 'Piyush Rathi',
    stationOwnerName: 'PowerBuddy',
    stationOwnerContactNo: '+91 9445566777',
    amenities: ['Restaurant', 'Mall', 'ATM', 'Garage']
  },
  {
    stationName: 'Dwarka Sector 21 EV Terminal',
    organization: 'massive_mobility',
    status: 'Active',
    powerCapacity: 250,
    gridPhase: 'Three Phase',
    pinCode: '110077',
    city: 'Sector 21, Dwarka',
    state: 'Delhi',
    country: 'India',
    latitude: 28.552125,
    longitude: 77.058016,
    fullAddress: 'Dwarka Sector 21 Metro Station, Sector 21, Dwarka, New Delhi 110077, India',
    openingTime: null,
    closingTime: null,
    open24Hours: true,
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 8800220066',
    inchargeName: 'Rohit Mathur',
    stationOwnerName: 'UrbanCharge',
    stationOwnerContactNo: '+91 9988112233',
    amenities: ['Restaurant', 'Cafe', 'Hotel', 'ATM']
  },
  {
    stationName: 'Golf Course Road Rapid Charger',
    organization: 'genx',
    status: 'Active',
    powerCapacity: 300,
    gridPhase: 'Three Phase',
    pinCode: '122002',
    city: 'Golf Course Road, Sector 54, Gurugram',
    state: 'Haryana',
    country: 'India',
    latitude: 28.44532,
    longitude: 77.10147,
    fullAddress: 'Near The Palm Spring Plaza, Golf Course Road, Sector 54, Gurugram, Haryana 122002, India',
    openingTime: '06:30:00',
    closingTime: '23:00:00',
    open24Hours: false,
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 9811010101',
    inchargeName: 'Harsh Kapoor',
    stationOwnerName: 'DLF Mobility',
    stationOwnerContactNo: '+91 8877665544',
    amenities: ['Restaurant', 'Mall', 'Cafe']
  },
  {
    stationName: 'Nehru Place Charging Zone',
    organization: '1c_ev_charging',
    status: 'Active',
    powerCapacity: 140,
    gridPhase: 'Three Phase',
    pinCode: '110019',
    city: 'Nehru Place',
    state: 'Delhi',
    country: 'India',
    latitude: 28.549655,
    longitude: 77.252948,
    fullAddress: 'International Trade Tower Parking Area, Nehru Place, New Delhi 110019, India',
    openingTime: '08:00:00',
    closingTime: '20:00:00',
    open24Hours: false,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 9877711223',
    inchargeName: 'Amit Bansal',
    stationOwnerName: 'Delhi Green Charge',
    stationOwnerContactNo: '+91 9822255443',
    amenities: ['Mall', 'Restaurant', 'ATM']
  },
  {
    stationName: 'Sector 62 Noida EV FastCharge',
    organization: 'massive_mobility',
    status: 'Active',
    powerCapacity: 220,
    gridPhase: 'Three Phase',
    pinCode: '201309',
    city: 'Sector 62, Noida',
    state: 'Uttar Pradesh',
    country: 'India',
    latitude: 28.628151,
    longitude: 77.367783,
    fullAddress: 'The Corenthum, A-41, Block A, Industrial Area, Sector 62, Noida, Uttar Pradesh 201309, India',
    openingTime: '07:00:00',
    closingTime: '23:30:00',
    open24Hours: false,
    workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    stationContactNumber: '+91 9755566770',
    inchargeName: 'Deepak Gera',
    stationOwnerName: 'ChargeZone',
    stationOwnerContactNo: '+91 9988447766',
    amenities: ['Hotel', 'Cafe', 'Garage', 'ATM']
  }
];

async function updateStations() {
  try {
    console.log('🚀 Starting to update stations...\n');

    let totalUpdated = 0;
    let totalNotFound = 0;
    const errors = [];

    for (const stationData of stationsData) {
      const { stationName, ...updateData } = stationData;

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
        totalNotFound++;
        continue;
      }

      // Prepare update object (workingDays and amenities are arrays in the model)
      const updateFields = {
        organization: updateData.organization,
        status: updateData.status,
        powerCapacity: parseFloat(updateData.powerCapacity),
        gridPhase: updateData.gridPhase,
        pinCode: updateData.pinCode,
        city: updateData.city,
        state: updateData.state,
        country: updateData.country,
        latitude: parseFloat(updateData.latitude),
        longitude: parseFloat(updateData.longitude),
        fullAddress: updateData.fullAddress,
        openingTime: updateData.openingTime,
        closingTime: updateData.closingTime,
        open24Hours: updateData.open24Hours,
        workingDays: updateData.workingDays, // Array
        allDays: updateData.workingDays.length === 7, // True if all 7 days
        contactNumber: updateData.stationContactNumber,
        inchargeName: updateData.inchargeName,
        ownerName: updateData.stationOwnerName,
        ownerContact: updateData.stationOwnerContactNo,
        amenities: updateData.amenities // Array
      };

      // Update station
      await station.update(updateFields);

      console.log(`✅ Updated: ${stationName}`);
      totalUpdated++;
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   ✅ Updated: ${totalUpdated} stations`);
    console.log(`   ❌ Not found: ${totalNotFound} stations`);
    if (errors.length > 0) {
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
updateStations();

