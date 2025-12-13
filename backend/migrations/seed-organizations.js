require('dotenv').config();
const { Sequelize } = require('sequelize');
const Organization = require('../models/Organization');

// Organization data to seed
const organizationsData = [
  {
    "organizationName": "Genx",
    "gstin": "29ABCDG1234P1Z7",
    "organizationType": "franchise",
    "contactDetails": {
      "countryCode": "+91",
      "contactNumber": "9845317286",
      "email": "info@genx.com"
    },
    "addressDetails": {
      "country": "India",
      "pinCode": "560102",
      "city": "Bengaluru",
      "state": "Karnataka",
      "fullAddress": "No. 18, 2nd Floor, Orion Tech Square, 27th Main Road, Sector 2, HSR Layout, Bengaluru, Karnataka 560102"
    },
    "billingAddress": {
      "sameAsCompanyAddress": true,
      "country": "India",
      "pinCode": "560102",
      "city": "Bengaluru",
      "state": "Karnataka",
      "fullAddress": "No. 18, 2nd Floor, Orion Tech Square, 27th Main Road, Sector 2, HSR Layout, Bengaluru, Karnataka 560102"
    },
    "paymentDetails": {
      "bankAccountNumber": "458712369045",
      "ifscCode": "DEMO0560102"
    }
  },
  {
    "organizationName": "Massive Mobility",
    "gstin": "06PQRSX5678L1Z2",
    "organizationType": "cpo",
    "contactDetails": {
      "countryCode": "+91",
      "contactNumber": "9810552846",
      "email": "info@massivemobility.in"
    },
    "addressDetails": {
      "country": "India",
      "pinCode": "122009",
      "city": "Gurugram",
      "state": "Haryana",
      "fullAddress": "Plot 2, Springhouse Coworking, Golf Course Rd, near Global Foyer Mall, Sector 43, Gurugram, Haryana 122009"
    },
    "billingAddress": {
      "sameAsCompanyAddress": true,
      "country": "India",
      "pinCode": "122009",
      "city": "Gurugram",
      "state": "Haryana",
      "fullAddress": "Plot 2, Springhouse Coworking, Golf Course Rd, near Global Foyer Mall, Sector 43, Gurugram, Haryana 122009"
    },
    "paymentDetails": {
      "bankAccountNumber": "739184520611",
      "ifscCode": "DEMO0122009"
    }
  },
  {
    "organizationName": "1charging",
    "gstin": "27LMNOP9012Q1Z5",
    "organizationType": "1c",
    "contactDetails": {
      "countryCode": "+91",
      "contactNumber": "9769031158",
      "email": "abhishek@1charging.com"
    },
    "addressDetails": {
      "country": "India",
      "pinCode": "411057",
      "city": "Pune",
      "state": "Maharashtra",
      "fullAddress": "Office 14B, Nova Business Hub, Rajiv Gandhi Infotech Park, Hinjawadi Phase 1, Pune, Maharashtra 411057"
    },
    "billingAddress": {
      "sameAsCompanyAddress": false,
      "country": "India",
      "pinCode": "411001",
      "city": "Pune",
      "state": "Maharashtra",
      "fullAddress": "Unit 5A, Maple Heights, Bund Garden Road, Pune, Maharashtra 411001"
    },
    "paymentDetails": {
      "bankAccountNumber": "512906738144",
      "ifscCode": "DEMO0411057"
    }
  },
  {
    "organizationName": "Statiq",
    "gstin": "07TUVWA3456R1Z9",
    "organizationType": "franchise",
    "contactDetails": {
      "countryCode": "+91",
      "contactNumber": "9871604421",
      "email": "contact@statiq.com"
    },
    "addressDetails": {
      "country": "India",
      "pinCode": "110020",
      "city": "New Delhi",
      "state": "Delhi",
      "fullAddress": "3rd Floor, Vertex House, Okhla Industrial Area Phase II, New Delhi, Delhi 110020"
    },
    "billingAddress": {
      "sameAsCompanyAddress": true,
      "country": "India",
      "pinCode": "110020",
      "city": "New Delhi",
      "state": "Delhi",
      "fullAddress": "3rd Floor, Vertex House, Okhla Industrial Area Phase II, New Delhi, Delhi 110020"
    },
    "paymentDetails": {
      "bankAccountNumber": "684275931208",
      "ifscCode": "DEMO0110020"
    }
  },
  {
    "organizationName": "Chargetrip",
    "gstin": "24BCDEA7890S1Z1",
    "organizationType": "franchise",
    "contactDetails": {
      "countryCode": "+91",
      "contactNumber": "9925047318",
      "email": "sales@chargetrip.com"
    },
    "addressDetails": {
      "country": "India",
      "pinCode": "380015",
      "city": "Ahmedabad",
      "state": "Gujarat",
      "fullAddress": "Suite 509, WestGate Business Bay, S.G. Highway, Makarba, Ahmedabad, Gujarat 380015"
    },
    "billingAddress": {
      "sameAsCompanyAddress": true,
      "country": "India",
      "pinCode": "380015",
      "city": "Ahmedabad",
      "state": "Gujarat",
      "fullAddress": "Suite 509, WestGate Business Bay, S.G. Highway, Makarba, Ahmedabad, Gujarat 380015"
    },
    "paymentDetails": {
      "bankAccountNumber": "903716482550",
      "ifscCode": "DEMO0380015"
    }
  }
];

// Map country names to country codes (if needed)
const countryNameToCode = {
  "India": "IN",
  "United States": "US",
  "United Kingdom": "GB",
  "China": "CN",
  "Japan": "JP",
  "Germany": "DE",
  "France": "FR",
  "Australia": "AU",
  "United Arab Emirates": "AE",
  "Singapore": "SG"
};

// Normalize organization type
function normalizeOrganizationType(type) {
  if (!type) return null;
  const normalized = type.toLowerCase().trim();
  if (normalized === '1c') return '1C';
  return normalized.toUpperCase();
}

// Convert country name to code or keep as is
function getCountryCode(country) {
  if (!country) return null;
  return countryNameToCode[country] || country;
}

async function seedOrganizations() {
  try {
    console.log('🔌 Connecting to database...');
    await Organization.sequelize.authenticate();
    console.log('✅ Database connection established\n');

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const orgData of organizationsData) {
      try {
        // Map the data structure to database fields
        const mappedData = {
          organizationName: orgData.organizationName.trim(),
          gstin: orgData.gstin || null,
          organizationType: normalizeOrganizationType(orgData.organizationType),
          organizationLogo: null,
          contactNumber: orgData.contactDetails?.contactNumber || null,
          countryCode: orgData.contactDetails?.countryCode || '+91',
          email: orgData.contactDetails?.email || null,
          addressCountry: getCountryCode(orgData.addressDetails?.country),
          addressPinCode: orgData.addressDetails?.pinCode || null,
          addressCity: orgData.addressDetails?.city || null,
          addressState: orgData.addressDetails?.state || null,
          fullAddress: orgData.addressDetails?.fullAddress || null,
          bankAccountNumber: orgData.paymentDetails?.bankAccountNumber || null,
          ifscCode: orgData.paymentDetails?.ifscCode || null,
          billingSameAsCompany: orgData.billingAddress?.sameAsCompanyAddress || false,
          billingCountry: getCountryCode(orgData.billingAddress?.country),
          billingPinCode: orgData.billingAddress?.pinCode || null,
          billingCity: orgData.billingAddress?.city || null,
          billingState: orgData.billingAddress?.state || null,
          billingFullAddress: orgData.billingAddress?.fullAddress || null,
          documents: [],
          deleted: false
        };

        // Check if organization exists
        const existingOrg = await Organization.findOne({
          where: {
            organizationName: mappedData.organizationName,
            deleted: false
          }
        });

        if (existingOrg) {
          // Update existing organization
          await existingOrg.update(mappedData);
          console.log(`✅ Updated organization: ${mappedData.organizationName}`);
          updatedCount++;
        } else {
          // Create new organization
          await Organization.create(mappedData);
          console.log(`✅ Created organization: ${mappedData.organizationName}`);
          createdCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${orgData.organizationName}:`, error.message);
        skippedCount++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Created: ${createdCount}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Total: ${organizationsData.length}`);
    console.log('\n✅ Seed operation completed!');

  } catch (error) {
    console.error('❌ Seed error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await Organization.sequelize.close();
  }
}

seedOrganizations();

