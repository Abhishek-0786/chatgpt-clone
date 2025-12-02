# Email Setup Guide for Password Reset

This guide will help you set up email sending for the forgot password feature.

## Quick Setup Options

### Option 1: Gmail (Recommended for Development - FREE)

**Limits:** 500 emails/day, 1,500,000 emails/month

**Steps:**
1. Go to [Google Account](https://myaccount.google.com/)
2. Enable 2-Step Verification
3. Go to [App Passwords](https://myaccount.google.com/apppasswords)
4. Generate a new app password for "Mail"
5. Copy the 16-character password

**Add to `.env`:**
```env
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-character-app-password
```

### Option 2: SendGrid (Recommended for Production)

**Free Tier:** 100 emails/day forever

**Steps:**
1. Sign up at [SendGrid](https://sendgrid.com/)
2. Verify your email
3. Go to Settings → API Keys
4. Create an API key with "Full Access"
5. Copy the API key

**Add to `.env`:**
```env
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=your-api-key-here
```

### Option 3: Mailgun (Best for Production - More Free Emails)

**Free Tier:** 5,000 emails/month for 3 months

**Steps:**
1. Sign up at [Mailgun](https://www.mailgun.com/)
2. Verify your email
3. Go to Settings → SMTP Credentials
4. Reset/create SMTP credentials
5. Copy username and password

**Add to `.env`:**
```env
EMAIL_SERVICE=mailgun
MAILGUN_USER=postmaster@mg.yourdomain.com
MAILGUN_PASSWORD=your-mailgun-password
```

### Option 4: Test Without Sending (Ethereal Email)

**For development only - creates fake emails**

**Steps:**
1. No setup needed!
2. Just don't set `EMAIL_SERVICE` in `.env`
3. Check console for Ethereal email URL
4. Click the URL to see the "sent" email

## Installation

```bash
npm install nodemailer
```

## Usage

After setup, uncomment these lines in `routes/auth.js`:

```javascript
const { sendPasswordResetEmail } = require('../utils/email');
await sendPasswordResetEmail(email, resetLink);
```

## Testing

1. Fill in forgot password form
2. Check console for reset link (development)
3. Or check your email inbox (production)
4. Click link to reset password

## Troubleshooting

**Gmail says "Less secure app access"**
- Enable 2-Step Verification
- Use App Passwords instead of regular password

**Emails not sending**
- Check `.env` file has correct credentials
- Check spam folder
- Verify email service limits not exceeded

**SendGrid errors**
- Make sure API key has correct permissions
- Verify your SendGrid account is active

## Production Deployment

Remember to add these environment variables to your Lightsail instance!

In your Lightsail SSH terminal:
```bash
nano .env
```

Add your email configuration, then restart:
```bash
pm2 restart chatgpt-clone
```
