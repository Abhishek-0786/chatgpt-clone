/**
 * Simple script to test Start/Stop Charging commands
 * Usage: node test-charging.js <deviceId> <connectorId> <idTag>
 * Example: node test-charging.js DEVN0IBHDNZ 1 ADMIN
 */

const http = require('http');

const API_BASE = 'http://localhost:3000';
const deviceId = process.argv[2] || 'DEVN0IBHDNZ';
const connectorId = parseInt(process.argv[3]) || 1;
const idTag = process.argv[4] || 'ADMIN';

console.log('🧪 Testing Charging Commands');
console.log(`📍 Device ID: ${deviceId}`);
console.log(`🔌 Connector ID: ${connectorId}`);
console.log(`🏷️  ID Tag: ${idTag}\n`);

/**
 * Make HTTP POST request
 */
function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Test Start Charging
 */
async function testStartCharging() {
  console.log('🚀 Testing Start Charging...');
  
  try {
    const result = await makeRequest('/api/charger/remote-start', {
      deviceId: deviceId,
      connectorId: connectorId,
      idTag: idTag
    });
    
    if (result.status === 200 && result.data.success) {
      console.log('✅ Start Charging: SUCCESS');
      console.log(`   Message: ${result.data.message}`);
      return true;
    } else {
      console.log('❌ Start Charging: FAILED');
      console.log(`   Status: ${result.status}`);
      console.log(`   Error: ${result.data.error || JSON.stringify(result.data)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Start Charging: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Test Stop Charging
 */
async function testStopCharging(transactionId) {
  console.log('\n🛑 Testing Stop Charging...');
  console.log(`   Transaction ID: ${transactionId}`);
  
  try {
    const result = await makeRequest('/api/charger/remote-stop', {
      deviceId: deviceId,
      transactionId: transactionId
    });
    
    if (result.status === 200 && result.data.success) {
      console.log('✅ Stop Charging: SUCCESS');
      console.log(`   Message: ${result.data.message}`);
      return true;
    } else {
      console.log('❌ Stop Charging: FAILED');
      console.log(`   Status: ${result.status}`);
      console.log(`   Error: ${result.data.error || JSON.stringify(result.data)}`);
      return false;
    }
  } catch (error) {
    console.log('❌ Stop Charging: ERROR');
    console.log(`   ${error.message}`);
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('='.repeat(50));
  
  // Test 1: Start Charging
  const startSuccess = await testStartCharging();
  
  if (!startSuccess) {
    console.log('\n⚠️  Start charging failed. Cannot test stop charging.');
    console.log('💡 Make sure:');
    console.log('   1. Server is running on port 3000');
    console.log('   2. Charger is connected via WebSocket');
    console.log('   3. Charger is not already charging');
    process.exit(1);
  }
  
  // Wait a bit for the transaction to start
  console.log('\n⏳ Waiting 3 seconds for transaction to start...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 2: Stop Charging
  // Note: You'll need to get the actual transactionId from the charger's StartTransaction response
  // For now, we'll use a placeholder - you should replace this with the actual transactionId
  console.log('\n⚠️  To test stop charging, you need the transactionId from the charger.');
  console.log('💡 Check your server logs for the StartTransaction message.');
  console.log('💡 Or use the API: GET /api/charger/:deviceId/sessions');
  
  // Uncomment and replace with actual transactionId to test stop:
  // const transactionId = 3494285; // Replace with actual transactionId
  // await testStopCharging(transactionId);
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Test completed!');
  console.log('\n💡 Next steps:');
  console.log('   1. Check server logs for RemoteStartTransaction');
  console.log('   2. Get transactionId from StartTransaction response');
  console.log('   3. Run: node test-charging.js <deviceId> <connectorId> <idTag>');
  console.log('   4. Or manually test stop with the transactionId');
}

// Run tests
runTests().catch(console.error);

