/**
 * Script to fix corrupted wallet balance
 * Removes problematic refund transactions and recalculates correct balance
 */

require('dotenv').config();
const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { Op } = require('sequelize');

async function fixWalletBalance() {
  try {
    console.log('🔧 Starting wallet balance fix...\n');

    // Customer ID to fix (change this to the affected customer)
    const customerId = 1;

    // Find all refund transactions that restored balance to suspiciously high values (> ₹1,000,000)
    const problematicRefunds = await WalletTransaction.findAll({
      where: {
        customerId: customerId,
        transactionType: 'refund',
        balanceAfter: {
          [Op.gte]: 1000000 // Balance after refund is >= ₹1,000,000 (suspiciously high)
        }
      },
      order: [['createdAt', 'DESC']]
    });

    console.log(`📊 Found ${problematicRefunds.length} problematic refund transactions:`);
    problematicRefunds.forEach((txn, index) => {
      console.log(`  ${index + 1}. TXN${txn.id.toString().padStart(6, '0')} - Refund ₹${txn.amount}, Balance After: ₹${txn.balanceAfter} (${txn.createdAt.toISOString()})`);
      console.log(`     Description: ${txn.description}`);
      console.log(`     Reference ID: ${txn.referenceId || 'N/A'}`);
    });

    if (problematicRefunds.length === 0) {
      console.log('✅ No problematic refund transactions found.');
      return;
    }

    // Delete the problematic refund transactions (delete 4-5 as user requested)
    // Delete the most recent problematic refunds first (they're ordered DESC)
    const transactionsToDelete = problematicRefunds.slice(0, Math.min(5, problematicRefunds.length));
    
    console.log(`\n🗑️  Deleting ${transactionsToDelete.length} problematic refund transactions...`);
    
    const transactionIds = transactionsToDelete.map(txn => txn.id);
    await WalletTransaction.destroy({
      where: {
        id: {
          [Op.in]: transactionIds
        }
      }
    });

    console.log(`✅ Deleted ${transactionsToDelete.length} transactions:\n`);
    transactionsToDelete.forEach((txn, index) => {
      console.log(`  ${index + 1}. Deleted TXN${txn.id.toString().padStart(6, '0')} - Refund ₹${txn.amount}`);
    });

    // Recalculate wallet balance from all remaining transactions
    console.log('\n📊 Recalculating wallet balance from all transactions...');
    
    // Get all transactions for this customer, ordered by creation time
    const allTransactions = await WalletTransaction.findAll({
      where: {
        customerId: customerId
      },
      order: [['createdAt', 'ASC']] // Oldest first
    });

    // Get the wallet
    const wallet = await Wallet.findOne({
      where: { customerId: customerId }
    });

    if (!wallet) {
      console.error('❌ Wallet not found for customer', customerId);
      return;
    }

    // Calculate balance from transactions
    let calculatedBalance = 0;
    if (allTransactions.length > 0) {
      // Start from the first transaction's balanceBefore (if available)
      // Otherwise, start from 0 and calculate forward
      const firstTxn = allTransactions[0];
      if (firstTxn.balanceBefore !== null) {
        calculatedBalance = parseFloat(firstTxn.balanceBefore);
        console.log(`📊 Starting balance: ₹${calculatedBalance} (from first transaction)`);
      } else {
        console.log('📊 Starting balance: ₹0 (no initial balance found)');
      }

      // Process each transaction
      for (const txn of allTransactions) {
        const amount = parseFloat(txn.amount);
        if (txn.transactionType === 'credit' || txn.transactionType === 'refund') {
          calculatedBalance += amount;
        } else if (txn.transactionType === 'debit') {
          calculatedBalance -= amount;
        }
      }
    }

    console.log(`\n💰 Calculated balance: ₹${calculatedBalance.toFixed(2)}`);
    console.log(`💰 Current wallet balance: ₹${parseFloat(wallet.balance).toFixed(2)}`);

    // Update wallet balance
    await wallet.update({ balance: calculatedBalance });
    console.log(`✅ Updated wallet balance to ₹${calculatedBalance.toFixed(2)}`);

    console.log('\n✅ Wallet balance fix completed!');
    
  } catch (error) {
    console.error('❌ Error fixing wallet balance:', error);
    throw error;
  }
}

// Run the fix
fixWalletBalance()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

