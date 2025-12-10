const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { Op } = require('sequelize');
const { sendPasswordResetEmail } = require('../libs/email');
const crypto = require('crypto');

/**
 * Register a new user
 */
async function register(req, res) {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: 'User with this email or username already exists' 
      });
    }

    // Create new user
    const user = await User.create({
      username,
      email,
      password,
      firstName,
      lastName
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Login user
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Validate password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get current user
 */
async function getCurrentUser(req, res) {
  res.json({ user: req.user.toJSON() });
}

/**
 * Change password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // Verify current password
    const isValidPassword = await user.validatePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'Current password is incorrect'
      });
    }

    // Check if new password is same as current password
    const isSamePassword = await user.validatePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        error: 'New password must be different from current password'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

/**
 * Forgot password - send reset email
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findOne({ where: { email } });
    
    // Always return success for security (don't reveal if email exists)
    if (!user) {
      return res.json({ 
        message: 'If that email exists, we\'ve sent a password reset link.' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    // Save token to database
    await user.update({
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetTokenExpires
    });

    // Generate reset link - detect production domain from request or use FRONTEND_URL
    const getFrontendUrl = () => {
      // First, check if FRONTEND_URL is explicitly set (highest priority)
      if (process.env.FRONTEND_URL) {
        console.log(`[Reset Link] Using FRONTEND_URL: ${process.env.FRONTEND_URL}`);
        return process.env.FRONTEND_URL;
      }
      
      // Check for forwarded host (for proxies/load balancers)
      const forwardedHost = req.get('x-forwarded-host') || req.headers['x-forwarded-host'] || '';
      const forwardedProto = req.get('x-forwarded-proto') || req.headers['x-forwarded-proto'] || 'https';
      
      // Check request host header
      const host = req.get('host') || req.headers.host || '';
      
      // Use forwarded host if available, otherwise use direct host
      const detectedHost = forwardedHost || host;
      
      console.log(`[Reset Link] Detected host: ${detectedHost}, Forwarded: ${forwardedHost}, Direct: ${host}`);
      
      // Check if production domain is detected
      if (detectedHost && detectedHost.includes('genx.1charging.com')) {
        const protocol = forwardedProto === 'http' ? 'http' : 'https';
        const url = `${protocol}://genx.1charging.com`;
        console.log(`[Reset Link] Using production domain: ${url}`);
        return url;
      }
      
      // If NODE_ENV is production, default to production domain
      if (process.env.NODE_ENV === 'production') {
        console.log(`[Reset Link] NODE_ENV=production, using production domain`);
        return 'https://genx.1charging.com';
      }
      
      // If host is localhost or 127.0.0.1, use localhost
      if (detectedHost && (detectedHost.includes('localhost') || detectedHost.includes('127.0.0.1'))) {
        console.log(`[Reset Link] Detected localhost, using localhost`);
        return 'http://localhost:3000';
      }
      
      // Default to production domain if we can't determine (safer for production)
      console.log(`[Reset Link] Unknown host, defaulting to production domain`);
      return 'https://genx.1charging.com';
    };
    const resetLink = `${getFrontendUrl()}/reset-password?token=${resetToken}`;
    
    // Log the reset link for development
    console.log(`Password reset link for ${email}: ${resetLink}`);
    
    // Send email with reset link
    try {
      const emailSent = await sendPasswordResetEmail(email, resetLink);
      
      if (!emailSent) {
        console.log('⚠️ Email not sent, showing reset link in console for testing');
      }
    } catch (emailError) {
      console.error('❌ Error during email sending:', emailError);
      console.log('📧 Reset link (copy this):', resetLink);
    }

    res.json({
      message: 'If that email exists, we\'ve sent a password reset link.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Reset password with token
 */
async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    // Find user with valid reset token
    const user = await User.findOne({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          [Op.gt]: new Date() // Token not expired
        }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Update password and clear reset token
    await user.update({
      password: password, // This will be hashed by the hook
      resetPasswordToken: null,
      resetPasswordExpires: null
    });

    res.json({ message: 'Password reset successful. You can now login with your new password.' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  register,
  login,
  getCurrentUser,
  changePassword,
  forgotPassword,
  resetPassword
};

