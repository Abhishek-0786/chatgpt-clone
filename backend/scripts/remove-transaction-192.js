/**
 * Script to remove TXN000192 and recalculate balance
 */

require('dotenv').config();
const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { Op } = require('sequelize');

async function removeTransaction192() {
  try {
    console.log('🔧 Removing TXN000192 and recalculating balance...\n');

    const customerId = 1;

    // Find TXN000192
    const txn192 = await WalletTransaction.findByPk(192);

    if (!txn192) {
      console.log('❌ TXN000192 not found');
      return;
    }

    console.log(`📋 Found TXN000192:`);
    console.log(`   Type: ${txn192.transactionType}`);
    console.log(`   Amount: ₹${parseFloat(txn192.amount).toFixed(2)}`);
    console.log(`   Description: ${txn192.description}`);
    console.log(`   Balance: ₹${parseFloat(txn192.balanceBefore).toFixed(2)} → ₹${parseFloat(txn192.balanceAfter).toFixed(2)}`);
    console.log(`   Created: ${new Date(txn192.createdAt).toLocaleString('en-IN')}\n`);

    // Get the balance before this transaction
    const balanceBeforeTxn192 = parseFloat(txn192.balanceBefore);

    // Delete the transaction
    await txn192.destroy();
    console.log(`✅ Deleted TXN000192\n`);

    // Recalculate all transactions after TXN000192
    console.log('📊 Recalculating subsequent transactions...\n');

    const transactionsAfter = await WalletTransaction.findAll({
      where: {
        customerId: customerId,
        createdAt: {
          [Op.gt]: new Date(txn192.createdAt)
        }
      },
      order: [['createdAt', 'ASC']]
    });

    let runningBalance = balanceBeforeTxn192;
    for (const txn of transactionsAfter) {
      const amount = parseFloat(txn.amount);
      let newBalanceAfter = runningBalance;

      if (txn.transactionType === 'credit' || txn.transactionType === 'refund') {
        newBalanceAfter = runningBalance + amount;
      } else if (txn.transactionType === 'debit') {
        newBalanceAfter = runningBalance - amount;
      }

      await txn.update({
        balanceBefore: runningBalance,
        balanceAfter: newBalanceAfter
      });

      runningBalance = newBalanceAfter;
    }

    // Update wallet balance
    const wallet = await Wallet.findOne({
      where: { customerId: customerId }
    });

    await wallet.update({ balance: runningBalance });

    console.log(`✅ Final balance: ₹${runningBalance.toFixed(2)}`);
    console.log(`✅ Updated wallet balance to ₹${runningBalance.toFixed(2)}\n`);

    console.log('✅ Transaction removal completed!');

  } catch (error) {
    console.error('❌ Error removing transaction:', error);
    throw error;
  }
}

// Run the removal
removeTransaction192()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

