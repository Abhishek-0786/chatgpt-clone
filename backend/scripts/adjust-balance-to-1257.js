/**
 * Script to adjust balance to exactly ₹1257.00
 */

require('dotenv').config();
const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { Op } = require('sequelize');

async function adjustBalance() {
  try {
    console.log('🔧 Adjusting balance to ₹1257.00...\n');

    const customerId = 1;
    const targetBalance = 1257.00;

    // Get current wallet balance
    const wallet = await Wallet.findOne({
      where: { customerId: customerId }
    });

    const currentBalance = parseFloat(wallet.balance);
    const difference = targetBalance - currentBalance;

    console.log(`💰 Current balance: ₹${currentBalance.toFixed(2)}`);
    console.log(`💰 Target balance: ₹${targetBalance.toFixed(2)}`);
    console.log(`💰 Difference: ₹${difference.toFixed(2)}\n`);

    if (Math.abs(difference) < 0.01) {
      console.log('✅ Balance is already at target!');
      return;
    }

    // Get the most recent transactions
    const recentTransactions = await WalletTransaction.findAll({
      where: {
        customerId: customerId
      },
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    console.log('📋 Most recent transactions:\n');
    recentTransactions.forEach((txn, index) => {
      const date = new Date(txn.createdAt).toLocaleString('en-IN');
      console.log(`  ${index + 1}. TXN${txn.id.toString().padStart(6, '0')} - ${txn.transactionType.toUpperCase()} ₹${parseFloat(txn.amount).toFixed(2)} (${date})`);
      console.log(`     Balance: ₹${parseFloat(txn.balanceBefore).toFixed(2)} → ₹${parseFloat(txn.balanceAfter).toFixed(2)}`);
      console.log(`     ${txn.description ? txn.description.substring(0, 60) : 'N/A'}`);
      console.log('');
    });

    // If difference is positive, we need to add a credit
    // If difference is negative, we need to remove recent debits or add a debit
    if (difference > 0) {
      console.log(`\n➕ Need to add ₹${difference.toFixed(2)} to reach target`);
      console.log(`   Options:`);
      console.log(`   1. Delete recent debits totaling ₹${difference.toFixed(2)}`);
      console.log(`   2. Add a manual credit of ₹${difference.toFixed(2)}`);
      
      // Find recent debits that we can remove
      const recentDebits = recentTransactions.filter(txn => 
        txn.transactionType === 'debit' && 
        parseFloat(txn.amount) <= difference + 5 // Allow some tolerance
      );

      if (recentDebits.length > 0) {
        console.log(`\n   Found ${recentDebits.length} recent debit(s) that could be removed:`);
        recentDebits.forEach((txn, index) => {
          console.log(`     ${index + 1}. TXN${txn.id.toString().padStart(6, '0')} - ₹${parseFloat(txn.amount).toFixed(2)}`);
        });
      }
    } else {
      console.log(`\n➖ Need to remove ₹${Math.abs(difference).toFixed(2)} to reach target`);
      console.log(`   Options:`);
      console.log(`   1. Delete recent credits/refunds totaling ₹${Math.abs(difference).toFixed(2)}`);
      
      // Find recent credits/refunds that we can remove
      const recentCredits = recentTransactions.filter(txn => 
        (txn.transactionType === 'credit' || txn.transactionType === 'refund') && 
        parseFloat(txn.amount) <= Math.abs(difference) + 5
      );

      if (recentCredits.length > 0) {
        console.log(`\n   Found ${recentCredits.length} recent credit/refund(s) that could be removed:`);
        recentCredits.forEach((txn, index) => {
          console.log(`     ${index + 1}. TXN${txn.id.toString().padStart(6, '0')} - ₹${parseFloat(txn.amount).toFixed(2)} (${txn.transactionType})`);
        });
      }
    }

    // For now, let's just update the wallet balance directly and create an adjustment transaction
    // This is the safest approach
    console.log(`\n🔧 Creating adjustment transaction...`);
    
    const adjustmentAmount = difference;
    const newBalance = currentBalance + adjustmentAmount;

    // Create adjustment transaction
    await WalletTransaction.create({
      walletId: wallet.id,
      customerId: customerId,
      transactionType: adjustmentAmount > 0 ? 'credit' : 'debit',
      amount: Math.abs(adjustmentAmount),
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      description: `Balance adjustment to ₹${targetBalance.toFixed(2)}`,
      referenceId: null,
      status: 'completed',
      transactionCategory: 'adjustment'
    });

    // Update wallet balance
    await wallet.update({ balance: newBalance });

    console.log(`✅ Created adjustment transaction: ${adjustmentAmount > 0 ? 'CREDIT' : 'DEBIT'} ₹${Math.abs(adjustmentAmount).toFixed(2)}`);
    console.log(`✅ Updated wallet balance: ₹${currentBalance.toFixed(2)} → ₹${newBalance.toFixed(2)}`);

    console.log('\n✅ Balance adjustment completed!');

  } catch (error) {
    console.error('❌ Error adjusting balance:', error);
    throw error;
  }
}

// Run the adjustment
adjustBalance()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

