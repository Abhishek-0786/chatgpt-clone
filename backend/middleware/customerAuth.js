const jwt = require('jsonwebtoken');
const { Customer } = require('../models');

const authenticateCustomerToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const customer = await Customer.findByPk(decoded.customerId);
    
    if (!customer) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = { customerId: customer.id, email: customer.email };
    req.customer = customer;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authenticateCustomerToken };

