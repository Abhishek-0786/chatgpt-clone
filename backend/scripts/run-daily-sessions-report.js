/**
 * Test script to run the daily sessions report once
 * Usage: node backend/scripts/run-daily-sessions-report.js
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { sendDailySessionsReport } = require('../services/dailySessionsReportService');

async function runReport() {
  try {
    console.log('🚀 Running daily sessions report test...');
    console.log('');
    
    const result = await sendDailySessionsReport();
    
    console.log('');
    console.log('✅ Report completed successfully!');
    console.log(`   - Total sessions: ${result.total}`);
    console.log(`   - Recipients: ${result.recipients.join(', ')}`);
    console.log(`   - Filename: ${result.filename}`);
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Report failed:', error.message);
    console.error('');
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Run the report
runReport();

