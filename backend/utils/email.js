// Email utility for sending password reset emails
// To use this, install nodemailer: npm install nodemailer

const nodemailer = require('nodemailer');

// Create transporter (configure with your email service)
const createTransporter = () => {
  // For Gmail (Free - 500 emails/day)
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // App-specific password
      },
      // Optimize connection settings
      pool: true,
      maxConnections: 1,
      maxMessages: 3,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      secure: true,
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  
  // For SendGrid (Free tier - 100 emails/day)
  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }
  
  // For Mailgun (Free tier - 5,000 emails/month)
  if (process.env.EMAIL_SERVICE === 'mailgun') {
    return nodemailer.createTransport({
      host: 'smtp.mailgun.org',
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAILGUN_USER,
        pass: process.env.MAILGUN_PASSWORD
      }
    });
  }
  
  // For testing without sending emails (logs link only)
  console.log('⚠️ No EMAIL_SERVICE configured. Email will NOT be sent (testing mode).');
  console.log('⚠️ Configure EMAIL_SERVICE in .env file to enable email sending.');
  
  return null; // Return null to indicate no email was sent
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetLink) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      console.log(`📧 TEST MODE: Would send email to ${email}:`);
      console.log(`📧 Reset Link: ${resetLink}`);
      console.log('📧 (Configure EMAIL_SERVICE in .env to actually send emails)');
      return true; // Return true even in test mode
    }
    
    console.log(`📧 Attempting to send email to ${email}...`);
    console.log(`📧 Using EMAIL_SERVICE: ${process.env.EMAIL_SERVICE}`);
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request - GenX',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested to reset your password. Click the link below to reset it:</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" style="background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">This link will expire in 1 hour.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.error('Full error:', error);
    return false;
  }
};

module.exports = {
  sendPasswordResetEmail
};
