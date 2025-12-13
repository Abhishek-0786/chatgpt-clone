/**
 * Cron Jobs Scheduler
 * Manages all scheduled cron jobs for the application
 */

const cron = require('node-cron');
const { sendDailySessionsReport } = require('./dailySessionsReportService');

let dailySessionsReportJob = null;

/**
 * Initialize all cron jobs
 */
function initializeCronJobs() {
  try {
    // Check if daily sessions report is enabled
    const isEnabled = process.env.DAILY_SESSIONS_REPORT_ENABLED === 'true';
    
    if (!isEnabled) {
      console.log('ℹ️  Daily Sessions Report cron job is disabled (DAILY_SESSIONS_REPORT_ENABLED=false)');
      return;
    }
    
    // Get timezone (default: Asia/Kolkata)
    const timezone = process.env.REPORT_TZ || 'Asia/Kolkata';
    
    // Schedule: Daily at 2:00 PM (cron: "0 14 * * *")
    // Cron format: minute hour day month day-of-week
    const cronExpression = '0 14 * * *'; // Daily at 2:00 PM
    
    console.log(`⏰ Scheduling Daily Sessions Report cron job...`);
    console.log(`   - Schedule: Daily at 2:00 PM (${timezone})`);
    console.log(`   - Cron: ${cronExpression}`);
    const timeWindowMinutes = parseInt(process.env.SESSIONS_REPORT_MINUTES || '1440', 10);
    const timeWindowHours = (timeWindowMinutes / 60).toFixed(1);
    console.log(`   - Time window: Last ${timeWindowMinutes} minute(s) (${timeWindowHours} hours)`);
    
    dailySessionsReportJob = cron.schedule(
      cronExpression,
      async () => {
        try {
          console.log('⏰ [Cron] Daily Sessions Report job triggered');
          await sendDailySessionsReport();
          console.log('✅ [Cron] Daily Sessions Report job completed');
        } catch (error) {
          console.error('❌ [Cron] Daily Sessions Report job failed:', error);
          // Don't throw - fail gracefully, log error
        }
      },
      {
        scheduled: true,
        timezone: timezone
      }
    );
    
    console.log('✅ Daily Sessions Report cron job scheduled successfully');
  } catch (error) {
    console.error('❌ Error initializing cron jobs:', error);
    // Don't throw - fail gracefully
  }
}

/**
 * Stop all cron jobs (for graceful shutdown)
 */
function stopCronJobs() {
  try {
    if (dailySessionsReportJob) {
      dailySessionsReportJob.stop();
      console.log('⏰ Daily Sessions Report cron job stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping cron jobs:', error);
  }
}

module.exports = {
  initializeCronJobs,
  stopCronJobs
};

