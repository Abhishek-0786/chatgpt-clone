/**
 * Script to fix transaction sequence - FINAL VERSION
 * Expected sequence:
 * 1. 11:03:38 - Debit ₹22 (balance: ₹1257.42 → ₹1235.42)
 * 2. 11:03:45 - Refund ₹22 (balance: ₹1235.42 → ₹1257.42)
 * 3. 11:03:50 - Debit ₹20 (balance: ₹1257.42 → ₹1237.42)
 * 4. 11:03:55 - Credit ₹20 (balance: ₹1237.42 → ₹1257.42)
 * Final balance: ₹1257.42
 */

require('dotenv').config();
const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { Op } = require('sequelize');

async function fixTransactionSequenceFinal() {
  try {
    console.log('🔧 Fixing transaction sequence (FINAL)...\n');

    const customerId = 1;

    // Get the wallet
    const wallet = await Wallet.findOne({
      where: { customerId: customerId }
    });

    // Find the specific transactions
    const txn188 = await WalletTransaction.findByPk(188); // Debit ₹22
    const txn186 = await WalletTransaction.findByPk(186); // Refund ₹22
    const txn190 = await WalletTransaction.findByPk(190); // Debit ₹20

    if (!txn188 || !txn186 || !txn190) {
      console.log('❌ One or more transactions not found');
      return;
    }

    // Get balance before the sequence
    const transactionsBefore = await WalletTransaction.findAll({
      where: {
        customerId: customerId,
        createdAt: {
          [Op.lt]: new Date('2025-11-21T05:33:38.000Z') // Before 11:03:38
        }
      },
      order: [['createdAt', 'DESC']],
      limit: 1
    });

    let balanceBeforeDebit = 1257.42;
    if (transactionsBefore.length > 0) {
      balanceBeforeDebit = parseFloat(transactionsBefore[0].balanceAfter);
    }

    console.log(`📊 Starting balance: ₹${balanceBeforeDebit.toFixed(2)}\n`);

    // Step 1: Debit ₹22 at 11:03:38
    const balanceAfterDebit22 = balanceBeforeDebit - 22.00;
    await sequelize.query(`
      UPDATE wallet_transactions 
      SET "balanceBefore" = ${balanceBeforeDebit}, 
          "balanceAfter" = ${balanceAfterDebit22}, 
          "createdAt" = '2025-11-21 05:33:38.000+00',
          "updatedAt" = NOW()
      WHERE id = 188
    `);
    console.log(`✅ Step 1: TXN000188 - Debit ₹22.00`);
    console.log(`   Time: 11:03:38 am`);
    console.log(`   Balance: ₹${balanceBeforeDebit.toFixed(2)} → ₹${balanceAfterDebit22.toFixed(2)}\n`);

    // Step 2: Refund ₹22 at 11:03:45 (7 seconds after debit)
    const balanceAfterRefund22 = balanceAfterDebit22 + 22.00;
    await sequelize.query(`
      UPDATE wallet_transactions 
      SET "balanceBefore" = ${balanceAfterDebit22}, 
          "balanceAfter" = ${balanceAfterRefund22}, 
          "createdAt" = '2025-11-21 05:33:45.000+00',
          "updatedAt" = NOW()
      WHERE id = 186
    `);
    console.log(`✅ Step 2: TXN000186 - Refund ₹22.00`);
    console.log(`   Time: 11:03:45 am`);
    console.log(`   Balance: ₹${balanceAfterDebit22.toFixed(2)} → ₹${balanceAfterRefund22.toFixed(2)}\n`);

    // Step 3: Debit ₹20 at 11:03:50 (5 seconds after refund)
    const balanceAfterDebit20 = balanceAfterRefund22 - 20.00;
    await sequelize.query(`
      UPDATE wallet_transactions 
      SET "balanceBefore" = ${balanceAfterRefund22}, 
          "balanceAfter" = ${balanceAfterDebit20}, 
          "createdAt" = '2025-11-21 05:33:50.000+00',
          "updatedAt" = NOW()
      WHERE id = 190
    `);
    console.log(`✅ Step 3: TXN000190 - Debit ₹20.00`);
    console.log(`   Time: 11:03:50 am`);
    console.log(`   Balance: ₹${balanceAfterRefund22.toFixed(2)} → ₹${balanceAfterDebit20.toFixed(2)}\n`);

    // Step 4: Credit ₹20 at 11:03:55 (5 seconds after debit)
    const balanceAfterCredit20 = balanceAfterDebit20 + 20.00;
    
    // Check if credit already exists
    const existingCredit = await WalletTransaction.findOne({
      where: {
        customerId: customerId,
        transactionType: 'credit',
        amount: 20.00,
        description: {
          [Op.like]: '%Manual adjustment%'
        }
      },
      order: [['createdAt', 'DESC']],
      limit: 1
    });

    if (existingCredit) {
      await sequelize.query(`
        UPDATE wallet_transactions 
        SET "balanceBefore" = ${balanceAfterDebit20}, 
            "balanceAfter" = ${balanceAfterCredit20}, 
            "createdAt" = '2025-11-21 05:33:55.000+00',
            "updatedAt" = NOW()
        WHERE id = ${existingCredit.id}
      `);
      console.log(`✅ Step 4: Updated existing credit ₹20.00 (TXN${existingCredit.id.toString().padStart(6, '0')})`);
    } else {
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
        transactionCategory: 'refund',
        createdAt: new Date('2025-11-21T05:33:55.000Z'),
        updatedAt: new Date()
      });
      console.log(`✅ Step 4: Created credit ₹20.00 transaction`);
    }
    console.log(`   Time: 11:03:55 am`);
    console.log(`   Balance: ₹${balanceAfterDebit20.toFixed(2)} → ₹${balanceAfterCredit20.toFixed(2)}\n`);

    // Recalculate all transactions after this sequence
    console.log('📊 Recalculating subsequent transactions...\n');
    
    const finalBalance = balanceAfterCredit20; // ₹1257.42
    
    const transactionsAfter = await WalletTransaction.findAll({
      where: {
        customerId: customerId,
        createdAt: {
          [Op.gt]: new Date('2025-11-21T05:33:55.000Z')
        },
        id: {
          [Op.notIn]: [186, 188, 190, existingCredit ? existingCredit.id : -1]
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

    // Update wallet balance
    await wallet.update({ balance: finalBalance });

    console.log(`✅ Final balance: ₹${finalBalance.toFixed(2)}`);
    console.log(`✅ Updated wallet balance to ₹${finalBalance.toFixed(2)}\n`);

    console.log('✅ Transaction sequence fix completed!');

  } catch (error) {
    console.error('❌ Error fixing transaction sequence:', error);
    throw error;
  }
}

// Run the fix
fixTransactionSequenceFinal()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

