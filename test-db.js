const { sequelize } = require('./models');

async function testDatabase() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection successful!');
        
        // Test if we can create a simple table
        await sequelize.query('SELECT 1 as test');
        console.log('✅ Database query successful!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        process.exit(1);
    }
}

testDatabase();
