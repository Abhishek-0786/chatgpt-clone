/**
 * Daily Sessions Report Service
 * Generates CSV report of completed sessions in the last 24 hours
 * and emails it to configured recipients
 */

const { Op } = require('sequelize');
const { ChargingSession, ChargingPoint, Station, Organization, Tariff, Vehicle, Customer } = require('../models');
const { getEmailTransporter } = require('../libs/email');

/**
 * Get completed sessions with organization information
 * Matches the CMS "Completed Sessions" tab - includes both 'completed' and 'stopped' statuses
 * @param {number|null} minutesAgo - Number of minutes to look back (null = all sessions, no time restriction)
 */
async function getCompletedSessionsLast24h(minutesAgo = null) {
  try {
    // System customer ID (exclude system sessions)
    const systemCustomerId = 3;
    
    // Build where clause - match CMS completed sessions tab
    // Include both 'completed' and 'stopped' statuses (same as CMS)
    const whereClause = {
      status: {
        [Op.in]: ['stopped', 'completed'] // Match CMS completed sessions tab
      },
      customerId: {
        [Op.ne]: systemCustomerId
      },
      endTime: {
        [Op.ne]: null // Must have an end time
      }
    };
    
    // If minutesAgo is provided, filter by time window
    if (minutesAgo !== null && minutesAgo > 0) {
      const now = new Date();
      const timeAgo = new Date(now.getTime() - minutesAgo * 60 * 1000);
      
      // Debug: Log the time range being queried
      console.log(`🔍 Querying sessions from: ${timeAgo.toISOString()} to ${now.toISOString()}`);
      console.log(`🔍 Local time range: ${timeAgo.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} to ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      
      whereClause.endTime[Op.gte] = timeAgo;
      whereClause.endTime[Op.lte] = now;
    } else {
      // No time restriction - get all completed/stopped sessions
      console.log('🔍 Querying ALL completed/stopped sessions (no time restriction) - matching CMS Completed Sessions tab');
    }
    
    // Query completed sessions
    const sessions = await ChargingSession.findAll({
      where: whereClause,
      include: [
        {
          model: ChargingPoint,
          as: 'chargingPoint',
          required: false,
          include: [
            {
              model: Station,
              as: 'station',
              required: false,
              attributes: ['id', 'stationId', 'stationName', 'organization']
            },
            {
              model: Tariff,
              as: 'tariff',
              required: false,
              attributes: ['id', 'baseCharges', 'tax', 'currency']
            }
          ]
        },
        {
          model: Vehicle,
          as: 'vehicle',
          required: false,
          attributes: ['id', 'vehicleNumber', 'brand', 'modelName', 'vehicleType']
        },
        {
          model: Customer,
          as: 'customer',
          required: false,
          attributes: ['id', 'fullName', 'email', 'phone']
        }
      ],
      order: [['endTime', 'DESC']]
    });
    
    // Get all unique organization strings from stations
    const orgStrings = [...new Set(sessions
      .map(s => s.chargingPoint?.station?.organization)
      .filter(Boolean)
    )];
    
    // Fetch organizations by matching organization string to organizationName
    const organizations = await Organization.findAll({
      where: {
        deleted: false
      },
      attributes: ['id', 'organizationName']
    });
    
    // Create a map: organization string -> organization name
    const orgMap = new Map();
    organizations.forEach(org => {
      const orgString = org.organizationName.toLowerCase().replace(/\s+/g, '_');
      orgMap.set(orgString, org.organizationName);
    });
    
    // Format sessions for CSV
    const rows = sessions.map((session, index) => {
      const station = session.chargingPoint?.station;
      const tariff = session.chargingPoint?.tariff;
      const vehicle = session.vehicle;
      const customer = session.customer;
      
      // Get organization name
      const orgString = station?.organization || '';
      const organizationName = orgMap.get(orgString) || orgString || 'N/A';
      
      // Calculate session duration
      let sessionDuration = 'N/A';
      if (session.startTime && session.endTime) {
        const durationMs = new Date(session.endTime) - new Date(session.startTime);
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
        sessionDuration = `${hours}h ${minutes}m ${seconds}s`;
      }
      
      // Get vehicle display
      let vehicleDisplay = 'N/A';
      if (vehicle) {
        vehicleDisplay = `${vehicle.brand} ${vehicle.modelName} (${vehicle.vehicleNumber})`;
      }
      
      // Determine mode (matching CMS logic)
      // CMS if customerId is null, 0, or 3 (system customer), otherwise APP
      let mode = 'N/A';
      if (!session.customerId || session.customerId === 0 || session.customerId === 3) {
        mode = 'CMS';
      } else {
        mode = 'APP';
      }
      
      // Format stop reason (matching CMS format)
      let formattedStopReason = 'Unknown';
      if (session.stopReason === 'Remote (CMS)') {
        formattedStopReason = 'Stopped from CMS';
      } else if (session.stopReason === 'Remote') {
        formattedStopReason = 'User stopped charging';
      } else if (session.stopReason === 'ChargingCompleted') {
        formattedStopReason = 'Charging completed';
      } else if (session.stopReason) {
        formattedStopReason = session.stopReason;
      }
      
      // Get base charges and tax from tariff
      const baseCharges = tariff ? parseFloat(tariff.baseCharges || 0) : 0;
      const tax = tariff ? parseFloat(tariff.tax || 0) : 0;
      
      // Get entered amount (amountRequested or amountDeducted)
      const enteredAmount = parseFloat(session.amountRequested || session.amountDeducted || 0);
      
      // Format dates
      const formatDate = (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      };
      
      return {
        'S.No': index + 1,
        'Organization': organizationName,
        'Station Name': station?.stationName || 'N/A',
        'Device id': session.deviceId || 'N/A',
        'Connector ID': session.connectorId || 'N/A',
        'Transaction ID': session.transactionId || 'N/A',
        'Energy (kWh)': parseFloat(session.energyConsumed || 0).toFixed(3),
        'Entered Amount (₹)': enteredAmount.toFixed(2),
        'Billed Amount (₹)': parseFloat(session.finalAmount || 0).toFixed(2),
        'Base Charge': baseCharges.toFixed(2),
        'Tax (%)': tax.toFixed(2),
        'Refund (₹)': parseFloat(session.refundAmount || 0).toFixed(2),
        'Mode': mode,
        'Vehicle': vehicleDisplay,
        'Session Duration': sessionDuration,
        'Stop Reason': formattedStopReason,
        'Start Time': formatDate(session.startTime),
        'End Time': formatDate(session.endTime),
        'Session ID': session.sessionId || 'N/A'
      };
    });
    
    const now = new Date();
    const fromTime = minutesAgo !== null ? new Date(now.getTime() - minutesAgo * 60 * 1000) : null;
    
    return {
      sessions: rows,
      total: rows.length,
      fromTime: fromTime, // null when fetching all sessions
      toTime: now,
      minutesAgo: minutesAgo
    };
  } catch (error) {
    console.error('Error fetching completed sessions:', error);
    throw error;
  }
}

/**
 * Generate CSV buffer from rows
 */
function generateCsvBuffer(rows) {
  try {
    // CSV headers in exact order
    const headers = [
      'S.No',
      'Organization',
      'Station Name',
      'Device id',
      'Connector ID',
      'Transaction ID',
      'Energy (kWh)',
      'Entered Amount (₹)',
      'Billed Amount (₹)',
      'Base Charge',
      'Tax (%)',
      'Refund (₹)',
      'Mode',
      'Vehicle',
      'Session Duration',
      'Stop Reason',
      'Start Time',
      'End Time',
      'Session ID'
    ];
    
    // Escape CSV field (handle quotes, commas, newlines)
    const escapeCsvField = (field) => {
      if (field === null || field === undefined) {
        return '';
      }
      const str = String(field);
      // If field contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    // Build CSV content
    const lines = [];
    
    // Add BOM for UTF-8 (helps Excel open it correctly)
    lines.push('\ufeff');
    
    // Add header row
    lines.push(headers.map(escapeCsvField).join(','));
    
    // Add data rows
    rows.forEach(row => {
      const values = headers.map(header => escapeCsvField(row[header]));
      lines.push(values.join(','));
    });
    
    // Convert to buffer with UTF-8 encoding
    return Buffer.from(lines.join('\n'), 'utf-8');
  } catch (error) {
    console.error('Error generating CSV:', error);
    throw error;
  }
}

/**
 * Send daily sessions report via email
 */
async function sendDailySessionsReport() {
  try {
    console.log('📊 Starting daily sessions report generation...');
    
    // Get time window from env (default: 1440 minutes = 24 hours)
    // Set to a number to limit to last N minutes
    // For daily reports, we fetch sessions from the last 24 hours
    // This applies to both production (cron at 2 PM) and testing (manual script)
    const envMinutes = process.env.SESSIONS_REPORT_MINUTES;
    let minutesAgo = envMinutes ? parseInt(envMinutes, 10) : 1440; // Default: 24 hours (1440 minutes)
    if (minutesAgo <= 0) {
      minutesAgo = 1440; // Treat 0 or negative as 24 hours
    }
    
    // Note: Removed ALL_SESSIONS flag - always use 24-hour window for consistency
    // Both production and testing now use the same time window (last 24 hours)
    
    // Fetch completed sessions
    const reportData = await getCompletedSessionsLast24h(minutesAgo);
    
    // Generate filename with date
    const today = new Date();
    const timezone = process.env.REPORT_TZ || 'Asia/Kolkata';
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `completed_sessions_${dateStr}.csv`;
    
    // Format time range for email body
    const formatDateTime = (date) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleString('en-IN', {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    };
    
    // Format date only (without time)
    const formatDateOnly = (date) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleDateString('en-IN', {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };
    
    // Determine time window text
    let timeWindowText = 'All Time';
    let reportPeriodText = '';
    
    if (minutesAgo !== null && minutesAgo > 0) {
      if (minutesAgo >= 1440) {
        const days = Math.floor(minutesAgo / 1440);
        timeWindowText = days === 1 ? 'Last 24 Hours' : `Last ${days} Days`;
      } else if (minutesAgo >= 60) {
        const hours = Math.floor(minutesAgo / 60);
        timeWindowText = hours === 1 ? 'Last 1 Hour' : `Last ${hours} Hours`;
      } else {
        timeWindowText = minutesAgo === 1 ? 'Last 1 Minute' : `Last ${minutesAgo} Minutes`;
      }
      
      if (reportData.fromTime && reportData.toTime) {
        reportPeriodText = `${formatDateTime(reportData.fromTime)} to ${formatDateTime(reportData.toTime)}`;
      }
    } else {
      // All sessions - show date range from first session to now
      const now = new Date();
      reportPeriodText = `All completed sessions up to ${formatDateTime(now)}`;
    }
    
    // Get recipients from env
    const recipientsEnv = process.env.DAILY_SESSIONS_REPORT_RECIPIENTS;
    if (!recipientsEnv || recipientsEnv.trim() === '') {
      console.error('❌ DAILY_SESSIONS_REPORT_RECIPIENTS not configured');
      throw new Error('Email recipients not configured');
    }
    
    const recipients = recipientsEnv.split(',').map(email => email.trim()).filter(Boolean);
    if (recipients.length === 0) {
      console.error('❌ No valid email recipients found');
      throw new Error('No valid email recipients');
    }
    
    // Get email configuration
    const transporter = getEmailTransporter();
    if (!transporter) {
      console.error('❌ Email transporter not configured');
      throw new Error('Email service not configured');
    }
    
    // Format report date
    const reportDate = formatDateOnly(today);
    
    // Format generated at timestamp
    const generatedAt = formatDateTime(today);
    
    // Calculate previous date (24 hours ago) for subject
    const previousDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const previousDateStr = previousDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const previousDateFormatted = formatDateOnly(previousDate);
    
    // Email subject with date range
    const emailSubject = `Daily Charging Sessions Report (${previousDateStr} - ${dateStr})`;
    
    // Handle case when there are no sessions - send notification email
    if (reportData.total === 0) {
      console.log(`ℹ️ No completed sessions found. Sending notification email.`);
      
      // Build email body for no sessions
      let noSessionsEmailBody = `
Dear Sir,

No completed charging sessions were found for ${reportDate}.

Report Date: ${reportDate}
Time Window: ${timeWindowText}`;

      // Add Period line only if reportPeriodText exists
      if (reportPeriodText) {
        noSessionsEmailBody += `\nPeriod: ${reportPeriodText}`;
      }
      
      noSessionsEmailBody += `
Total Sessions: 0
Generated At: ${generatedAt}

This is an automated email. Please do not reply.`;
      
      // Calculate previous date for no sessions email subject
      const previousDateForNoSessions = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const previousDateStrForNoSessions = previousDateForNoSessions.toISOString().split('T')[0];
      const noSessionsEmailSubject = `Daily Charging Sessions Report (${previousDateStrForNoSessions} - ${dateStr}) (No Sessions)`;
      
      // Send notification email
      await transporter.sendMail({
        from: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'noreply@genx.com',
        to: recipients.join(', '),
        subject: noSessionsEmailSubject,
        text: noSessionsEmailBody
      });
      
      console.log(`✅ No sessions notification sent to ${recipients.length} recipient(s): ${recipients.join(', ')}`);
      
      return {
        success: true,
        message: 'No sessions to report - notification sent',
        total: 0,
        recipients: recipients,
        filename: null
      };
    }
    
    const timeMsg = minutesAgo ? `in the last ${minutesAgo} minute(s)` : '(all completed sessions)';
    console.log(`📊 Found ${reportData.total} completed sessions ${timeMsg}`);
    
    // Generate CSV
    const csvBuffer = generateCsvBuffer(reportData.sessions);
    
    // Prepare simple text-based email (no borders/boxes) - matching user's exact format
    let emailBody = `
Dear Sir,

Please find attached the daily report of completed charging sessions for ${reportDate}.

Report Date: ${reportDate}
Time Window: ${timeWindowText}`;

    // Add Period line only if reportPeriodText exists
    if (reportPeriodText) {
      emailBody += `\nPeriod: ${reportPeriodText}`;
    }
    
    emailBody += `
Total Sessions: ${reportData.total}

The detailed CSV report (${filename}) is attached to this email. The report includes organization, station details, energy consumed, billing amounts, and transaction details.

If you have any questions or need additional information, please don't hesitate to contact us at info@genx.1charging.com

This is an automated email. Please do not reply.`;
    
    // Prepare email
    const mailOptions = {
      from: process.env.EMAIL_USER || process.env.EMAIL_FROM || 'noreply@genx.com',
      to: recipients.join(', '),
      subject: emailSubject,
      text: emailBody,
      attachments: [
        {
          filename: filename,
          content: csvBuffer,
          contentType: 'text/csv; charset=utf-8'
        }
      ]
    };
    
    // Send email
    console.log(`📧 Sending report to ${recipients.length} recipient(s): ${recipients.join(', ')}`);
    await transporter.sendMail(mailOptions);
    
    console.log(`✅ Daily sessions report sent successfully`);
    console.log(`   - Total sessions: ${reportData.total}`);
    console.log(`   - Recipients: ${recipients.join(', ')}`);
    console.log(`   - Filename: ${filename}`);
    
    return {
      success: true,
      message: 'Report sent successfully',
      total: reportData.total,
      recipients: recipients,
      filename: filename
    };
  } catch (error) {
    console.error('❌ Error sending daily sessions report:', error);
    throw error;
  }
}

module.exports = {
  getCompletedSessionsLast24h,
  generateCsvBuffer,
  sendDailySessionsReport
};

