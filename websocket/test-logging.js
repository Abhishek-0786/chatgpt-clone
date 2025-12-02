/**
 * Test script to verify logging flow
 * Run: node websocket/test-logging.js
 */

// Load .env.ocpp first, then fallback to .env
const fs = require('fs');
const path = require('path');

const envOcppPath = path.join(__dirname, '.env.ocpp');
const envPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(envOcppPath)) {
  require('dotenv').config({ path: envOcppPath });
  console.log('✅ Loaded .env.ocpp');
} else if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log('✅ Loaded .env');
} else {
  require('dotenv').config();
  console.log('⚠️ Using system environment variables');
}

const { QUEUES } = require('./rabbitmq/queues');
const rabbitmqProducer = require('./rabbitmq/producer');
const { isConnected, initializeRabbitMQ } = require('./rabbitmq/connection');

async function testLogging() {
  console.log('🧪 Testing Logging Flow...\n');
  
  // Check environment
  console.log('📋 Environment Check:');
  console.log(`   ENABLE_RABBITMQ: ${process.env.ENABLE_RABBITMQ}`);
  console.log(`   RABBITMQ_URL: ${process.env.RABBITMQ_URL || 'not set'}`);
  console.log(`   QUEUE_NAME: ${QUEUES.OCPP_LOGS}\n`);
  
  // Initialize RabbitMQ
  if (process.env.ENABLE_RABBITMQ === 'true') {
    console.log('🔌 Initializing RabbitMQ...');
    try {
      await initializeRabbitMQ();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    } catch (error) {
      console.error('❌ Failed to initialize RabbitMQ:', error.message);
    }
  } else {
    console.log('⚠️ RabbitMQ is disabled (ENABLE_RABBITMQ != true)');
  }
  
  // Check connection
  console.log('\n🔍 Connection Check:');
  const connected = isConnected();
  console.log(`   RabbitMQ Connected: ${connected}`);
  
  if (!connected) {
    console.log('❌ RabbitMQ is not connected!');
    console.log('   Please check:');
    console.log('   1. RabbitMQ is running');
    console.log('   2. ENABLE_RABBITMQ=true in .env.ocpp or .env');
    console.log('   3. RABBITMQ_URL is correct');
    return;
  }
  
  // Test publishing
  console.log('\n📤 Testing Publish...');
  const testLogData = {
    deviceId: 'TEST_DEVICE',
    messageType: 'BootNotification',
    payload: { test: true },
    direction: 'Incoming',
    rawMessage: '[2,"test-id","BootNotification",{}]',
    timestamp: new Date()
  };
  
  try {
    const published = await rabbitmqProducer.publishQueue(QUEUES.OCPP_LOGS, testLogData);
    if (published) {
      console.log('✅ Successfully published test message to queue!');
    } else {
      console.log('❌ Failed to publish (returned false)');
    }
  } catch (error) {
    console.error('❌ Error publishing:', error.message);
    console.error('   Stack:', error.stack);
  }
  
  console.log('\n✅ Test complete!');
  process.exit(0);
}

testLogging().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

