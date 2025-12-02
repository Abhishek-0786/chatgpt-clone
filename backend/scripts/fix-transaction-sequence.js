/**
 * Script to fix transaction sequence and add missing credit
 * Expected sequence:
 * 1. 11:03 - Debit ₹22 (balance deducted)
 * 2. After that - Refund ₹22 (balance restored)
 * 3. After that - Debit ₹20 (balance deducted)
 * 4. After that - Credit ₹20 (balance restored)
 * Final balance: ₹1257.42
 */

require('dotenv').config();
const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { Op } = require('sequelize');

async function fixTransactionSequence() {
  try {
    console.log('🔧 Fixing transaction sequence...\n');

    const customerId = 1;

    // Get the wallet
    const wallet = await Wallet.findOne({
      where: { customerId: customerId }
    });

    // Find the specific transactions we need to fix
    // TXN000188: Debit ₹22 at 11:03:38 am
    // TXN000186: Refund ₹22 at 10:53:40 am (should be AFTER the debit)
    // TXN000190: Debit ₹20 at 11:15:39 am
    // Need to add: Credit ₹20 after the debit

    const txn188 = await WalletTransaction.findByPk(188); // Debit ₹22 at 11:03
    const txn186 = await WalletTransaction.findByPk(186); // Refund ₹22 at 10:53 (should be after)
    const txn190 = await WalletTransaction.findByPk(190); // Debit ₹20 at 11:15

    if (!txn188 || !txn186 || !txn190) {
      console.log('❌ One or more transactions not found');
      return;
    }

    console.log('📋 Current transactions:');
    console.log(`   TXN000186: ${txn186.transactionType} ₹${txn186.amount} at ${new Date(txn186.createdAt).toLocaleString('en-IN')}`);
    console.log(`   TXN000188: ${txn188.transactionType} ₹${txn188.amount} at ${new Date(txn188.createdAt).toLocaleString('en-IN')}`);
    console.log(`   TXN000190: ${txn190.transactionType} ₹${txn190.amount} at ${new Date(txn190.createdAt).toLocaleString('en-IN')}\n`);

    // Get the balance before TXN000188 (the debit at 11:03)
    const transactionsBefore = await WalletTransaction.findAll({
      where: {
        customerId: customerId,
        createdAt: {
          [Op.lt]: new Date(txn188.createdAt)
        }
      },
      order: [['createdAt', 'DESC']],
      limit: 1
    });

    let balanceBeforeDebit = 1257.42; // Starting balance
    if (transactionsBefore.length > 0) {
      balanceBeforeDebit = parseFloat(transactionsBefore[0].balanceAfter);
    }

    console.log(`📊 Balance before first debit (11:03): ₹${balanceBeforeDebit.toFixed(2)}\n`);

    // Step 1: Update TXN000188 (Debit ₹22 at 11:03) - this should happen FIRST
    const balanceAfterDebit22 = balanceBeforeDebit - 22.00;
    await txn188.update({
      balanceBefore: balanceBeforeDebit,
      balanceAfter: balanceAfterDebit22,
      createdAt: new Date('2025-11-21T05:33:38.000Z') // 11:03:38 am IST
    });
    console.log(`✅ Updated TXN000188 (Debit ₹22):`);
    console.log(`   Balance: ₹${balanceBeforeDebit.toFixed(2)} → ₹${balanceAfterDebit22.toFixed(2)}`);
    console.log(`   Time: 11:03:38 am\n`);

    // Step 2: Update TXN000186 (Refund ₹22) - should happen AFTER the debit
    const balanceAfterRefund22 = balanceAfterDebit22 + 22.00; // Should be ₹1257.42
    await txn186.update({
      balanceBefore: balanceAfterDebit22,
      balanceAfter: balanceAfterRefund22,
      createdAt: new Date('2025-11-21T05:33:45.000Z') // 11:03:45 am IST (7 seconds after debit)
    });
    console.log(`✅ Updated TXN000186 (Refund ₹22):`);
    console.log(`   Balance: ₹${balanceAfterDebit22.toFixed(2)} → ₹${balanceAfterRefund22.toFixed(2)}`);
    console.log(`   Time: 11:03:45 am (after debit)\n`);

    // Step 3: Update TXN000190 (Debit ₹20) - should happen after the refund
    const balanceAfterDebit20 = balanceAfterRefund22 - 20.00; // Should be ₹1237.42
    await txn190.update({
      balanceBefore: balanceAfterRefund22,
      balanceAfter: balanceAfterDebit20,
      createdAt: new Date('2025-11-21T05:33:50.000Z') // 11:03:50 am IST (5 seconds after refund)
    });
    console.log(`✅ Updated TXN000190 (Debit ₹20):`);
    console.log(`   Balance: ₹${balanceAfterRefund22.toFixed(2)} → ₹${balanceAfterDebit20.toFixed(2)}`);
    console.log(`   Time: 11:03:50 am (after refund)\n`);

    // Step 4: Create or update credit ₹20 transaction
    const balanceAfterCredit20 = balanceAfterDebit20 + 20.00; // Should be ₹1257.42
    
    // Check if there's already a credit ₹20 right after the debit
    let existingCredit20 = await WalletTransaction.findOne({
      where: {
        customerId: customerId,
        transactionType: 'credit',
        amount: 20.00,
        createdAt: {
          [Op.gte]: new Date('2025-11-21T05:33:50.000Z'),
          [Op.lte]: new Date('2025-11-21T05:34:00.000Z')
        }
      },
      order: [['createdAt', 'ASC']],
      limit: 1
    });

    if (existingCredit20) {
      // Update existing credit
      await existingCredit20.update({
        balanceBefore: balanceAfterDebit20,
        balanceAfter: balanceAfterCredit20,
        createdAt: new Date('2025-11-21T05:33:55.000Z') // 11:03:55 am IST
      });
      console.log(`✅ Updated existing credit ₹20 transaction:`);
      console.log(`   Balance: ₹${balanceAfterDebit20.toFixed(2)} → ₹${balanceAfterCredit20.toFixed(2)}`);
      console.log(`   Time: 11:03:55 am\n`);
    } else {
      // Create new credit transaction
      await WalletTransaction.create({
        walletId: wallet.id,
        customerId: customerId,
        transactionType: 'credit',
        amount: 20.00,
        balanceBefore: balanceAfterDebit20,
        balanceAfter: balanceAfterCredit20,
        description: 'Refund for failed charging session - Manual adjustment',
        referenceId: null,
        status: 'completed',
        transactionCategory: 'refund'
      });
      console.log(`✅ Created credit ₹20 transaction:`);
      console.log(`   Balance: ₹${balanceAfterDebit20.toFixed(2)} → ₹${balanceAfterCredit20.toFixed(2)}`);
      console.log(`   Time: 11:03:55 am\n`);
    }

    // Recalculate all transactions after this sequence
    console.log('📊 Recalculating all subsequent transactions...\n');
    
    const finalBalance = balanceAfterCredit20; // Should be ₹1257.42
    
    // Get all transactions after the credit ₹20, ordered by time
    const transactionsAfter = await WalletTransaction.findAll({
      where: {
        customerId: customerId,
        createdAt: {
          [Op.gt]: new Date('2025-11-21T05:33:55.000Z')
        },
        id: {
          [Op.ne]: existingCredit20 ? existingCredit20.id : -1 // Exclude the credit we just created/updated
        }
      },
      order: [['createdAt', 'ASC']]
    });

    let runningBalance = finalBalance;
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

    // Update wallet balance to the final balance after credit ₹20
    await wallet.update({ balance: finalBalance });

    console.log(`✅ Final balance after credit ₹20: ₹${finalBalance.toFixed(2)}`);
    console.log(`✅ Updated wallet balance to ₹${finalBalance.toFixed(2)}\n`);

    console.log('✅ Transaction sequence fix completed!');

  } catch (error) {
    console.error('❌ Error fixing transaction sequence:', error);
    throw error;
  }
}

// Run the fix
fixTransactionSequence()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

