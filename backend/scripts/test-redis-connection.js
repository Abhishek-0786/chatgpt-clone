// Test script for Redis client connection
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const redisClient = require('../libs/redis/redisClient');

async function testRedisConnection() {
  console.log('🧪 Testing Redis Connection...\n');
  
  try {
    // Test 1: Check if Redis is connected
    console.log('Test 1: Checking connection status...');
    const status = redisClient.status;
    console.log(`✅ Connection status: ${status}\n`);
    
    // Test 2: Ping Redis server
    console.log('Test 2: Pinging Redis server...');
    const pong = await redisClient.ping();
    console.log(`✅ Ping response: ${pong}\n`);
    
    // Test 3: Set a test key
    console.log('Test 3: Setting a test key...');
    await redisClient.set('test:connection', 'Hello Redis!', 'EX', 10);
    console.log('✅ Key set successfully\n');
    
    // Test 4: Get the test key
    console.log('Test 4: Getting the test key...');
    const value = await redisClient.get('test:connection');
    console.log(`✅ Retrieved value: ${value}\n`);
    
    // Test 5: Check TTL
    console.log('Test 5: Checking TTL of test key...');
    const ttl = await redisClient.ttl('test:connection');
    console.log(`✅ TTL: ${ttl} seconds\n`);
    
    // Test 6: Delete the test key
    console.log('Test 6: Deleting test key...');
    await redisClient.del('test:connection');
    console.log('✅ Key deleted successfully\n');
    
    console.log('✅ All tests passed! Redis connection is working correctly.\n');
    
    // Close connection
    await redisClient.quit();
    console.log('🔴 Redis connection closed.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run tests
testRedisConnection();

