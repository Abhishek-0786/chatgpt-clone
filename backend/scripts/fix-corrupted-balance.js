/**
 * Script to fix corrupted wallet balance by correcting transaction 178 and recalculating
 */

require('dotenv').config();
const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { Op } = require('sequelize');

async function fixCorruptedBalance() {
  try {
    console.log('🔧 Fixing corrupted wallet balance...\n');

    const customerId = 1;

    // Get all transactions ordered by creation time
    const allTransactions = await WalletTransaction.findAll({
      where: {
        customerId: customerId
      },
      order: [['createdAt', 'ASC']]
    });

    console.log(`📊 Total transactions: ${allTransactions.length}\n`);

    // Find the corrupted transaction (TXN000186) - it has balanceBefore = ₹537001.42
    const corruptedTxn = allTransactions.find(txn => 
      txn.id === 186 && parseFloat(txn.balanceBefore) > 100000
    );

    if (!corruptedTxn) {
      console.log('❌ Corrupted transaction (TXN000186) not found');
      return;
    }

    console.log(`🔍 Found corrupted transaction:`);
    console.log(`   TXN${corruptedTxn.id.toString().padStart(6, '0')}: ${corruptedTxn.transactionType}, Amount: ₹${corruptedTxn.amount}`);
    console.log(`   Balance Before: ₹${parseFloat(corruptedTxn.balanceBefore).toFixed(2)} (CORRUPTED)`);
    console.log(`   Balance After: ₹${parseFloat(corruptedTxn.balanceAfter).toFixed(2)} (CORRUPTED)`);
    console.log(`   Created: ${new Date(corruptedTxn.createdAt).toLocaleString('en-IN')}\n`);

    // Find the transaction before the corrupted one to get the correct balance
    const transactionsBeforeCorrupted = allTransactions.filter(txn => 
      new Date(txn.createdAt) < new Date(corruptedTxn.createdAt)
    );

    let correctBalanceBefore = 0;
    if (transactionsBeforeCorrupted.length > 0) {
      const lastTxnBefore = transactionsBeforeCorrupted[transactionsBeforeCorrupted.length - 1];
      correctBalanceBefore = parseFloat(lastTxnBefore.balanceAfter);
      console.log(`📊 Last transaction before corrupted one:`);
      console.log(`   TXN${lastTxnBefore.id.toString().padStart(6, '0')}: Balance After = ₹${correctBalanceBefore.toFixed(2)}`);
    }

    // Calculate correct balance after for the corrupted transaction
    const amount = parseFloat(corruptedTxn.amount);
    let correctBalanceAfter = correctBalanceBefore;
    if (corruptedTxn.transactionType === 'credit' || corruptedTxn.transactionType === 'refund') {
      correctBalanceAfter = correctBalanceBefore + amount;
    } else if (corruptedTxn.transactionType === 'debit') {
      correctBalanceAfter = correctBalanceBefore - amount;
    }

    console.log(`\n✅ Corrected values:`);
    console.log(`   Balance Before: ₹${correctBalanceBefore.toFixed(2)}`);
    console.log(`   Balance After: ₹${correctBalanceAfter.toFixed(2)}\n`);

    // Update the corrupted transaction
    await corruptedTxn.update({
      balanceBefore: correctBalanceBefore,
      balanceAfter: correctBalanceAfter
    });

    console.log(`✅ Updated corrupted transaction TXN${corruptedTxn.id.toString().padStart(6, '0')}\n`);

    // Now recalculate all transactions after the corrupted one
    console.log('📊 Recalculating all transactions after the corrupted one...\n');

    const transactionsAfterCorrupted = allTransactions.filter(txn => 
      new Date(txn.createdAt) > new Date(corruptedTxn.createdAt)
    );

    let runningBalance = correctBalanceAfter;

    for (const txn of transactionsAfterCorrupted) {
      const amount = parseFloat(txn.amount);
      const oldBalanceBefore = parseFloat(txn.balanceBefore);
      const oldBalanceAfter = parseFloat(txn.balanceAfter);

      // Calculate correct balance
      let newBalanceAfter = runningBalance;
      if (txn.transactionType === 'credit' || txn.transactionType === 'refund') {
        newBalanceAfter = runningBalance + amount;
      } else if (txn.transactionType === 'debit') {
        newBalanceAfter = runningBalance - amount;
      }

      // Only update if values are different
      if (Math.abs(oldBalanceBefore - runningBalance) > 0.01 || 
          Math.abs(oldBalanceAfter - newBalanceAfter) > 0.01) {
        await txn.update({
          balanceBefore: runningBalance,
          balanceAfter: newBalanceAfter
        });
        console.log(`✅ Updated TXN${txn.id.toString().padStart(6, '0')}: ₹${oldBalanceAfter.toFixed(2)} → ₹${newBalanceAfter.toFixed(2)}`);
      }

      runningBalance = newBalanceAfter;
    }

    // Update wallet balance
    const wallet = await Wallet.findOne({
      where: { customerId: customerId }
    });

    console.log(`\n💰 Final calculated balance: ₹${runningBalance.toFixed(2)}`);
    console.log(`💰 Current wallet balance: ₹${parseFloat(wallet.balance).toFixed(2)}`);

    await wallet.update({ balance: runningBalance });
    console.log(`✅ Updated wallet balance to ₹${runningBalance.toFixed(2)}\n`);

    console.log('✅ Wallet balance fix completed!');

  } catch (error) {
    console.error('❌ Error fixing wallet balance:', error);
    throw error;
  }
}

// Run the fix
fixCorruptedBalance()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

