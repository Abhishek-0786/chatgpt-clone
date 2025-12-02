/**
 * Test Charger Routes - Remote Start/Stop
 * Usage: node test-charger-routes.js
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3000';
const deviceId = 'DEVL9R2MNFW';
const connectorId = 1;
const idTag = 'ADMIN';

async function testRemoteStart() {
  try {
    console.log('🧪 Testing Remote Start Transaction...');
    console.log(`📍 Device ID: ${deviceId}`);
    console.log(`📍 Connector ID: ${connectorId}`);
    console.log(`📍 ID Tag: ${idTag}`);
    console.log('');
    
    const response = await axios.post(`${API_BASE}/api/charger/remote-start`, {
      deviceId,
      connectorId,
      idTag
    }, {
      timeout: 10000
    });
    
    if (response.data.success) {
      console.log('✅ SUCCESS: Remote start command sent!');
      console.log('📝 Response:', JSON.stringify(response.data, null, 2));
      console.log('');
      console.log('📤 Check RabbitMQ:');
      console.log('   1. Open: http://localhost:15672');
      console.log('   2. Go to: Queues → charging_commands');
      console.log('   3. Click: "Get messages"');
      console.log('   4. You should see RemoteStartTransaction command');
      console.log('');
      console.log('📋 Check Server Logs:');
      console.log('   Look for: 📤 [RABBITMQ] Published RemoteStartTransaction command');
      return true;
    } else {
      console.log('❌ FAILED:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('   Error:', error.response.data.error);
    }
    return false;
  }
}

async function testRemoteStop(transactionId) {
  try {
    console.log('🧪 Testing Remote Stop Transaction...');
    console.log(`📍 Device ID: ${deviceId}`);
    console.log(`📍 Transaction ID: ${transactionId}`);
    console.log('');
    
    const response = await axios.post(`${API_BASE}/api/charger/remote-stop`, {
      deviceId,
      transactionId
    }, {
      timeout: 10000
    });
    
    if (response.data.success) {
      console.log('✅ SUCCESS: Remote stop command sent!');
      console.log('📝 Response:', JSON.stringify(response.data, null, 2));
      console.log('');
      console.log('📤 Check RabbitMQ:');
      console.log('   Queue: charging_commands should have 2 messages now');
      return true;
    } else {
      console.log('❌ FAILED:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ ERROR:', error.response?.data || error.message);
    if (error.response?.data?.error) {
      console.error('   Error:', error.response.data.error);
    }
    return false;
  }
}

// Main function
async function runTest() {
  console.log('='.repeat(60));
  console.log('🚀 Testing Charger Routes with RabbitMQ');
  console.log('='.repeat(60));
  console.log('');
  
  // Test 1: Remote Start
  const startSuccess = await testRemoteStart();
  
  if (!startSuccess) {
    console.log('');
    console.log('⚠️  Remote start failed. Common issues:');
    console.log('   1. Charger not connected via WebSocket');
    console.log('   2. Charger already charging');
    console.log('   3. Server not running');
    console.log('   4. Invalid deviceId');
    process.exit(1);
  }
  
  console.log('');
  console.log('⏳ Waiting 5 seconds for charger to respond...');
  console.log('💡 Check server logs for transactionId from StartTransaction');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Test 1 Complete: Remote Start');
  console.log('');
  
  // Try to get transactionId from the response or ask user
  console.log('💡 To test Remote Stop:');
  console.log('   1. Get transactionId from server logs (look for "transactionId" in StartTransaction response)');
  console.log('   2. Run: node test-charger-routes.js <transactionId>');
  console.log('   3. Or manually call the API with transactionId');
  console.log('');
  console.log('📋 Example: node test-charger-routes.js 9540441');
  console.log('='.repeat(60));
}

// If transactionId provided as argument, test stop
const transactionId = process.argv[2];
if (transactionId) {
  testRemoteStop(parseInt(transactionId)).then(() => {
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Test 2 Complete: Remote Stop');
    console.log('='.repeat(60));
  });
} else {
  runTest();
}

