/**
 * Script to analyze all wallet transactions and identify discrepancies
 */

require('dotenv').config();
const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { Op } = require('sequelize');

async function analyzeTransactions() {
  try {
    console.log('🔍 Analyzing wallet transactions...\n');

    const customerId = 1;

    // Get all transactions ordered by creation time
    const allTransactions = await WalletTransaction.findAll({
      where: {
        customerId: customerId
      },
      order: [['createdAt', 'ASC']] // Oldest first
    });

    console.log(`📊 Total transactions: ${allTransactions.length}\n`);

    // Get current wallet balance
    const wallet = await Wallet.findOne({
      where: { customerId: customerId }
    });

    console.log(`💰 Current wallet balance: ₹${parseFloat(wallet.balance).toFixed(2)}\n`);

    // Calculate balance step by step
    let runningBalance = 0;
    let startBalance = 0;

    if (allTransactions.length > 0) {
      const firstTxn = allTransactions[0];
      if (firstTxn.balanceBefore !== null) {
        startBalance = parseFloat(firstTxn.balanceBefore);
        runningBalance = startBalance;
        console.log(`📊 Starting balance (from first transaction): ₹${startBalance.toFixed(2)}\n`);
      }
    }

    console.log('📋 Transaction Details:\n');
    console.log('='.repeat(120));
    console.log('S.NO | DATE & TIME | TXN ID | TYPE | AMOUNT | BALANCE BEFORE | BALANCE AFTER | DESCRIPTION');
    console.log('='.repeat(120));

    allTransactions.forEach((txn, index) => {
      const amount = parseFloat(txn.amount);
      const balanceBefore = parseFloat(txn.balanceBefore);
      const balanceAfter = parseFloat(txn.balanceAfter);
      
      // Calculate expected balance
      if (txn.transactionType === 'credit' || txn.transactionType === 'refund') {
        runningBalance += amount;
      } else if (txn.transactionType === 'debit') {
        runningBalance -= amount;
      }

      const date = new Date(txn.createdAt).toLocaleString('en-IN');
      const txnId = `TXN${txn.id.toString().padStart(6, '0')}`;
      const type = txn.transactionType.toUpperCase();
      const desc = txn.description ? txn.description.substring(0, 40) : 'N/A';

      // Check for discrepancies
      const expectedBalance = runningBalance;
      const actualBalanceAfter = balanceAfter;
      const discrepancy = Math.abs(expectedBalance - actualBalanceAfter);

      let flag = '';
      if (discrepancy > 0.01) {
        flag = ' ⚠️ MISMATCH';
      }

      console.log(
        `${(index + 1).toString().padStart(4)} | ${date.padEnd(20)} | ${txnId} | ${type.padEnd(6)} | ₹${amount.toFixed(2).padStart(8)} | ₹${balanceBefore.toFixed(2).padStart(12)} | ₹${balanceAfter.toFixed(2).padStart(12)} | ${desc}${flag}`
      );

      if (discrepancy > 0.01) {
        console.log(`     ⚠️ Expected: ₹${expectedBalance.toFixed(2)}, Actual: ₹${actualBalanceAfter.toFixed(2)}, Difference: ₹${discrepancy.toFixed(2)}`);
      }
    });

    console.log('='.repeat(120));
    console.log(`\n💰 Final calculated balance: ₹${runningBalance.toFixed(2)}`);
    console.log(`💰 Current wallet balance: ₹${parseFloat(wallet.balance).toFixed(2)}`);
    console.log(`💰 Expected balance (₹1257): ₹1257.00`);

    // Find transactions that might be causing issues
    console.log('\n🔍 Analyzing potential issues:\n');

    // Check for transactions with suspiciously high balances
    const highBalanceTxns = allTransactions.filter(txn => 
      parseFloat(txn.balanceAfter) > 10000
    );

    if (highBalanceTxns.length > 0) {
      console.log(`⚠️ Found ${highBalanceTxns.length} transactions with balance > ₹10,000:`);
      highBalanceTxns.forEach(txn => {
        console.log(`   - TXN${txn.id.toString().padStart(6, '0')}: Balance After = ₹${parseFloat(txn.balanceAfter).toFixed(2)} (${txn.transactionType}, ${new Date(txn.createdAt).toLocaleString('en-IN')})`);
      });
    }

    // Check for duplicate refunds
    const refundsBySession = {};
    allTransactions
      .filter(txn => txn.transactionType === 'refund' && txn.referenceId)
      .forEach(txn => {
        if (!refundsBySession[txn.referenceId]) {
          refundsBySession[txn.referenceId] = [];
        }
        refundsBySession[txn.referenceId].push(txn);
      });

    const duplicateRefunds = Object.entries(refundsBySession)
      .filter(([sessionId, refunds]) => refunds.length > 1);

    if (duplicateRefunds.length > 0) {
      console.log(`\n⚠️ Found duplicate refunds for ${duplicateRefunds.length} session(s):`);
      duplicateRefunds.forEach(([sessionId, refunds]) => {
        console.log(`   - Session ${sessionId}: ${refunds.length} refunds`);
        refunds.forEach(refund => {
          console.log(`     * TXN${refund.id.toString().padStart(6, '0')}: ₹${parseFloat(refund.amount).toFixed(2)} (${new Date(refund.createdAt).toLocaleString('en-IN')})`);
        });
      });
    }

    // Calculate what balance should be if we start from ₹1257
    console.log('\n📊 Reverse calculation from ₹1257:\n');
    let targetBalance = 1257.00;
    const recentTransactions = allTransactions.slice().reverse(); // Most recent first
    
    console.log('Working backwards from ₹1257.00:\n');
    for (const txn of recentTransactions) {
      const amount = parseFloat(txn.amount);
      if (txn.transactionType === 'credit' || txn.transactionType === 'refund') {
        targetBalance -= amount; // Reverse credit = subtract
      } else if (txn.transactionType === 'debit') {
        targetBalance += amount; // Reverse debit = add back
      }
    }
    console.log(`If current balance should be ₹1257.00, starting balance would be: ₹${targetBalance.toFixed(2)}`);

    // Find which transactions need to be removed/adjusted
    console.log('\n🔧 Recommendations:\n');
    const difference = runningBalance - 1257.00;
    console.log(`Difference from expected: ₹${difference.toFixed(2)}`);
    
    if (Math.abs(difference) > 0.01) {
      console.log(`\nTo fix balance to ₹1257.00, you may need to:`);
      if (difference > 0) {
        console.log(`- Remove or adjust transactions totaling ₹${difference.toFixed(2)} in credits/refunds`);
      } else {
        console.log(`- Add or adjust transactions totaling ₹${Math.abs(difference).toFixed(2)} in credits/refunds`);
      }
    }

  } catch (error) {
    console.error('❌ Error analyzing transactions:', error);
    throw error;
  }
}

// Run the analysis
analyzeTransactions()
  .then(() => {
    console.log('\n✅ Analysis completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });

