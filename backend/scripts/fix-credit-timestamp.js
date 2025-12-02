/**
 * Fix the credit ₹20 transaction timestamp and balance
 */

require('dotenv').config();
const sequelize = require('../config/database');
const WalletTransaction = require('../models/WalletTransaction');

async function fixCreditTimestamp() {
  try {
    // Find all credit ₹20 transactions with "Manual adjustment" description
    const credits = await WalletTransaction.findAll({
      where: {
        customerId: 1,
        transactionType: 'credit',
        amount: 20.00,
        description: {
          [require('sequelize').Op.like]: '%Manual adjustment%'
        }
      },
      order: [['createdAt', 'DESC']]
    });

    console.log(`Found ${credits.length} credit ₹20 transaction(s)\n`);

    // Update the most recent one to have correct timestamp and balance
    if (credits.length > 0) {
      const credit = credits[0];
      console.log(`Updating TXN${credit.id.toString().padStart(6, '0')}:`);
      console.log(`  Current time: ${new Date(credit.createdAt).toLocaleString('en-IN')}`);
      console.log(`  Current balance: ₹${parseFloat(credit.balanceBefore).toFixed(2)} → ₹${parseFloat(credit.balanceAfter).toFixed(2)}\n`);

      // The balance should be ₹1237.42 → ₹1257.42
      await sequelize.query(`
        UPDATE wallet_transactions 
        SET "balanceBefore" = 1237.42, 
            "balanceAfter" = 1257.42, 
            "createdAt" = '2025-11-21 05:33:55.000+00',
            "updatedAt" = NOW()
        WHERE id = ${credit.id}
      `);

      console.log(`✅ Updated to:`);
      console.log(`  Time: 11:03:55 am`);
      console.log(`  Balance: ₹1237.42 → ₹1257.42\n`);

      // Delete any other duplicate credits
      if (credits.length > 1) {
        const idsToDelete = credits.slice(1).map(c => c.id);
        await WalletTransaction.destroy({
          where: { id: { [require('sequelize').Op.in]: idsToDelete } }
        });
        console.log(`✅ Deleted ${credits.length - 1} duplicate credit transaction(s)\n`);
      }
    }

    // Recalculate wallet balance
    const wallet = await require('../models/Wallet').findOne({ where: { customerId: 1 } });
    await wallet.update({ balance: 1257.42 });
    console.log(`✅ Updated wallet balance to ₹1257.42\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixCreditTimestamp()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

