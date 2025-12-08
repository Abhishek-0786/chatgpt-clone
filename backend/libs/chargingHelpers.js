const crypto = require('crypto');

/**
 * Generate unique session ID
 */
function generateSessionId() {
  return `SESS_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

module.exports = {
  generateSessionId
};

