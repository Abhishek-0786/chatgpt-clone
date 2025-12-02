const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const Customer = sequelize.define('Customer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [1, 100]
    },
    comment: 'Full name of the customer'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      len: [10, 15]
    },
    comment: 'Phone number of the customer'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 100]
    }
  },
  resetPasswordToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resetPasswordExpires: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'customers',
  hooks: {
    beforeCreate: async (customer) => {
      if (customer.password) {
        customer.password = await bcrypt.hash(customer.password, 12);
      }
    },
    beforeUpdate: async (customer) => {
      if (customer.changed('password')) {
        customer.password = await bcrypt.hash(customer.password, 12);
      }
    }
  }
});

// Instance methods
Customer.prototype.validatePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

Customer.prototype.toJSON = function() {
  const values = Object.assign({}, this.get());
  delete values.password;
  return values;
};

module.exports = Customer;

