/**
 * Script to verify the transaction sequence is correct
 */

require('dotenv').config();
const sequelize = require('../config/database');
const WalletTransaction = require('../models/WalletTransaction');

async function verifySequence() {
  try {
    const customerId = 1;

    // Get the specific transactions
    const txn186 = await WalletTransaction.findByPk(186);
    const txn188 = await WalletTransaction.findByPk(188);
    const txn190 = await WalletTransaction.findByPk(190);
    
    // Get the credit ₹20 transaction we just created
    const credit20 = await WalletTransaction.findOne({
      where: {
        customerId: customerId,
        transactionType: 'credit',
        amount: 20.00,
        description: {
          [require('sequelize').Op.like]: '%Manual adjustment%'
        }
      },
      order: [['createdAt', 'DESC']],
      limit: 1
    });

    console.log('📋 Transaction Sequence (in chronological order):\n');
    
    const transactions = [txn188, txn186, txn190, credit20].filter(t => t !== null);
    transactions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    transactions.forEach((txn, index) => {
      const date = new Date(txn.createdAt).toLocaleString('en-IN');
      console.log(`${index + 1}. TXN${txn.id.toString().padStart(6, '0')} - ${txn.transactionType.toUpperCase()} ₹${parseFloat(txn.amount).toFixed(2)}`);
      console.log(`   Time: ${date}`);
      console.log(`   Balance: ₹${parseFloat(txn.balanceBefore).toFixed(2)} → ₹${parseFloat(txn.balanceAfter).toFixed(2)}`);
      console.log(`   ${txn.description ? txn.description.substring(0, 60) : 'N/A'}`);
      console.log('');
    });

    if (credit20) {
      console.log(`✅ Final balance: ₹${parseFloat(credit20.balanceAfter).toFixed(2)}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifySequence()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

