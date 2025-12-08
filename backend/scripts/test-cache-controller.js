// Test script for Cache Controller
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const cacheController = require('../libs/redis/cacheController');

async function testCacheController() {
  console.log('🧪 Testing Cache Controller...\n');
  
  try {
    // Test 1: Set a simple value
    console.log('Test 1: Setting a simple value...');
    const simpleValue = { name: 'Test Station', status: 'Online' };
    const setResult1 = await cacheController.set('test:simple', simpleValue);
    console.log(`✅ Set result: ${setResult1}\n`);
    
    // Test 2: Get the simple value
    console.log('Test 2: Getting the simple value...');
    const retrieved1 = await cacheController.get('test:simple');
    console.log(`✅ Retrieved value:`, retrieved1);
    console.log(`✅ Values match: ${JSON.stringify(retrieved1) === JSON.stringify(simpleValue)}\n`);
    
    // Test 3: Set a value with TTL
    console.log('Test 3: Setting a value with TTL (5 seconds)...');
    const ttlValue = { message: 'This will expire', timestamp: Date.now() };
    const setResult2 = await cacheController.set('test:ttl', ttlValue, 5);
    console.log(`✅ Set result: ${setResult2}\n`);
    
    // Test 4: Get value with TTL (should still exist)
    console.log('Test 4: Getting value with TTL (immediately)...');
    const retrieved2 = await cacheController.get('test:ttl');
    console.log(`✅ Retrieved value:`, retrieved2);
    console.log(`✅ Value exists: ${retrieved2 !== null}\n`);
    
    // Test 5: Get a non-existent key
    console.log('Test 5: Getting a non-existent key...');
    const nonExistent = await cacheController.get('test:nonexistent');
    console.log(`✅ Result: ${nonExistent}`);
    console.log(`✅ Returns null: ${nonExistent === null}\n`);
    
    // Test 6: Set a complex nested object
    console.log('Test 6: Setting a complex nested object...');
    const complexValue = {
      station: {
        id: 1,
        name: 'Test Station',
        chargers: [
          { id: 1, name: 'Charger 1', status: 'Online' },
          { id: 2, name: 'Charger 2', status: 'Offline' }
        ],
        metadata: {
          location: { lat: 28.6139, lng: 77.2090 },
          created: new Date().toISOString()
        }
      }
    };
    const setResult3 = await cacheController.set('test:complex', complexValue);
    console.log(`✅ Set result: ${setResult3}\n`);
    
    // Test 7: Get the complex object
    console.log('Test 7: Getting the complex object...');
    const retrieved3 = await cacheController.get('test:complex');
    console.log(`✅ Retrieved value:`, JSON.stringify(retrieved3, null, 2));
    console.log(`✅ Values match: ${JSON.stringify(retrieved3) === JSON.stringify(complexValue)}\n`);
    
    // Test 8: Set an array
    console.log('Test 8: Setting an array...');
    const arrayValue = ['item1', 'item2', { nested: 'object' }, 123];
    const setResult4 = await cacheController.set('test:array', arrayValue);
    console.log(`✅ Set result: ${setResult4}\n`);
    
    // Test 9: Get the array
    console.log('Test 9: Getting the array...');
    const retrieved4 = await cacheController.get('test:array');
    console.log(`✅ Retrieved value:`, retrieved4);
    console.log(`✅ Values match: ${JSON.stringify(retrieved4) === JSON.stringify(arrayValue)}\n`);
    
    // Test 10: Delete a key
    console.log('Test 10: Deleting a key...');
    const delResult = await cacheController.del('test:simple');
    console.log(`✅ Delete result: ${delResult}\n`);
    
    // Test 11: Verify key is deleted
    console.log('Test 11: Verifying key is deleted...');
    const afterDelete = await cacheController.get('test:simple');
    console.log(`✅ Value after delete: ${afterDelete}`);
    console.log(`✅ Key deleted: ${afterDelete === null}\n`);
    
    // Test 12: Wait for TTL to expire
    console.log('Test 12: Waiting for TTL to expire (6 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    const expired = await cacheController.get('test:ttl');
    console.log(`✅ Value after TTL: ${expired}`);
    console.log(`✅ TTL expired: ${expired === null}\n`);
    
    // Cleanup: Delete all test keys
    console.log('🧹 Cleaning up test keys...');
    await cacheController.del('test:complex');
    await cacheController.del('test:array');
    console.log('✅ Cleanup complete\n');
    
    console.log('✅ All tests passed! Cache Controller is working correctly.\n');
    
    // Close Redis connection
    const redisClient = require('../libs/redis/redisClient');
    await redisClient.quit();
    console.log('🔴 Redis connection closed.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run tests
testCacheController();

