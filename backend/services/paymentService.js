const { WalletTransaction } = require('../models');
const { Op } = require('sequelize');
const { createOrder, verifyPayment, getPaymentDetails, verifyWebhookSignature } = require('../libs/razorpay');
const { getOrCreateWallet, creditWallet } = require('./walletService');

/**
 * Create Razorpay order for wallet top-up
 */
async function createTopupOrder(customerId, amount) {
  // Validation: amount must be a number and > 0
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount');
  }

  if (amount < 1) {
    throw new Error('Minimum top-up amount is ₹1');
  }

  // Get or create wallet
  const wallet = await getOrCreateWallet(customerId);

  // Create Razorpay order
  const orderResult = await createOrder(amount, customerId);

  if (!orderResult.success) {
    throw new Error(orderResult.error || 'Failed to create payment order');
  }

  // Check for existing pending transactions for this order amount
  // Mark previous pending transactions as failed ONLY if they're OLD (more than 1 minute)
  const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  
  // Look for pending transactions older than 1 minute (safe to mark as failed - user likely retried)
  const oldPendingTransactions = await WalletTransaction.findAll({
    where: {
      customerId: customerId,
      transactionType: 'credit',
      status: 'pending',
      transactionCategory: 'topup',
      amount: amount,
      createdAt: {
        [Op.lt]: oneMinuteAgo, // Only transactions older than 1 minute
        [Op.gte]: twoMinutesAgo // But not too old (within last 2 minutes)
      }
    },
    order: [['createdAt', 'DESC']]
  });

  // Mark old pending transactions as failed (user retried after they expired)
  if (oldPendingTransactions.length > 0) {
    for (const prevTxn of oldPendingTransactions) {
      if (prevTxn.status === 'pending') {
        await prevTxn.update({
          status: 'failed',
          description: `${prevTxn.description} - Payment attempt failed (retried)`
        });
        console.log(`[Top-up Order] Marked old pending transaction ${prevTxn.id} (order: ${prevTxn.referenceId}) as failed (user retrying with new order: ${orderResult.order.id})`);
      }
    }
  }

  // Create pending transaction with the new order ID
  const transaction = await WalletTransaction.create({
    walletId: wallet.id,
    customerId: customerId,
    transactionType: 'credit',
    amount: amount,
    balanceBefore: parseFloat(wallet.balance),
    balanceAfter: parseFloat(wallet.balance), // Will be updated after payment verification
    description: `Wallet Top-up - ₹${amount}`,
    referenceId: orderResult.order.id,
    status: 'pending',
    transactionCategory: 'topup'
  });

  console.log(`[Top-up Order] Created new pending transaction ${transaction.id} with order ID ${orderResult.order.id} for amount ₹${amount}`);
  
  // Double-check that our new transaction is still pending
  await transaction.reload();
  if (transaction.status !== 'pending') {
    console.error(`[Top-up Order] ERROR: New transaction ${transaction.id} was marked as ${transaction.status} immediately after creation!`);
    // Revert to pending if it was incorrectly marked
    await transaction.update({ status: 'pending' });
  }

  return {
    success: true,
    order: orderResult.order,
    transactionId: transaction.id,
    key: process.env.RAZORPAY_KEY_ID
  };
}

/**
 * Verify Razorpay payment and update wallet
 */
async function verifyTopupPayment(customerId, razorpay_order_id, razorpay_payment_id, razorpay_signature) {
  console.log(`[Payment Verify] Starting verification for customer ${customerId}, order: ${razorpay_order_id}, payment: ${razorpay_payment_id}`);

  // Verify payment signature
  const isValidSignature = verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

  if (!isValidSignature) {
    console.error(`[Payment Verify] Invalid signature for order ${razorpay_order_id}`);
    throw new Error('Invalid payment signature');
  }

  // Get payment details from Razorpay
  const paymentResult = await getPaymentDetails(razorpay_payment_id);

  if (!paymentResult.success || paymentResult.payment.status !== 'captured') {
    console.error(`[Payment Verify] Payment not captured for ${razorpay_payment_id}`);
    throw new Error('Payment not successful');
  }

  console.log(`[Payment Verify] Payment verified successfully, looking for transaction with order ID: ${razorpay_order_id}`);

  // Idempotency check: Check if this payment_id was already processed
  // Check both referenceId (if payment_id was stored there) and description (where payment_id is currently stored)
  const existingPaymentTransaction = await WalletTransaction.findOne({
    where: {
      customerId: customerId,
      status: 'completed',
      transactionCategory: 'topup',
      [Op.or]: [
        { referenceId: razorpay_payment_id },
        { description: { [Op.like]: `%Payment ID: ${razorpay_payment_id}%` } }
      ]
    }
  });

  if (existingPaymentTransaction) {
    console.log(`[Payment Verify] Payment ${razorpay_payment_id} already verified in transaction ${existingPaymentTransaction.id}, returning success without re-crediting`);
    return {
      success: true,
      message: 'Payment already verified',
      transaction: {
        id: existingPaymentTransaction.id,
        amount: parseFloat(existingPaymentTransaction.amount),
        balanceAfter: parseFloat(existingPaymentTransaction.balanceAfter)
      }
    };
  }

  // Find the most recent pending transaction, prioritizing exact order ID match
  let transaction = await WalletTransaction.findOne({
    where: {
      customerId: customerId,
      referenceId: razorpay_order_id,
      status: 'pending',
      transactionCategory: 'topup'
    },
    order: [['createdAt', 'DESC']]
  });

  if (transaction) {
    console.log(`[Payment Verify] Found pending transaction ${transaction.id} with exact order ID match: ${razorpay_order_id}`);
  } else {
    console.log(`[Payment Verify] No pending transaction found with order ID ${razorpay_order_id}, searching for most recent pending...`);
    
    // If not found by order ID, find the MOST RECENT pending transaction (within last 10 minutes)
    const recentPendingTransaction = await WalletTransaction.findOne({
      where: {
        customerId: customerId,
        status: 'pending',
        transactionCategory: 'topup',
        createdAt: {
          [Op.gte]: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
        }
      },
      order: [['createdAt', 'DESC']]
    });

    if (recentPendingTransaction) {
      if (recentPendingTransaction.referenceId === razorpay_order_id) {
        console.log(`[Payment Verify] Found matching pending transaction ${recentPendingTransaction.id} for order ${razorpay_order_id}`);
        transaction = recentPendingTransaction;
      } else {
        // Different order - this might be a retry with mismatched order IDs
        // Only use it if it's VERY recent (within 30 seconds)
        const transactionAge = Date.now() - new Date(recentPendingTransaction.createdAt).getTime();
        if (transactionAge < 30000) { // 30 seconds
          console.log(`[Payment Verify] Using very recent pending transaction ${recentPendingTransaction.id} (referenceId: ${recentPendingTransaction.referenceId}, age: ${transactionAge}ms) for order ${razorpay_order_id}`);
          console.log(`[Payment Verify] Updating transaction ${recentPendingTransaction.id} referenceId from ${recentPendingTransaction.referenceId} to ${razorpay_order_id}`);
          // Update the referenceId to match the current order ID for consistency
          await recentPendingTransaction.update({
            referenceId: razorpay_order_id
          });
          await recentPendingTransaction.reload();
          transaction = recentPendingTransaction;
        } else {
          throw new Error('No matching pending transaction found');
        }
      }
    } else {
      throw new Error('No matching pending transaction found');
    }
  }

  // Check if transaction is already completed (idempotency)
  if (transaction.status === 'completed') {
    console.log(`[Payment Verify] Transaction ${transaction.id} already completed, returning success`);
    return {
      success: true,
      message: 'Payment already verified',
      transaction: {
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        balanceAfter: parseFloat(transaction.balanceAfter)
      }
    };
  }

  // Update wallet balance
  const wallet = await getOrCreateWallet(customerId);
  const currentBalance = parseFloat(wallet.balance);
  const amount = parseFloat(transaction.amount);
  const newBalance = currentBalance + amount;

  await wallet.update({ balance: newBalance });

  // Update transaction status
  await transaction.update({
    status: 'completed',
    balanceAfter: newBalance,
    description: `${transaction.description} - Payment verified (Payment ID: ${razorpay_payment_id})`
  });

  console.log(`[Payment Verify] Successfully verified payment for transaction ${transaction.id}, updated wallet balance to ₹${newBalance}`);

  return {
    success: true,
    message: 'Payment verified successfully',
    transaction: {
      id: transaction.id,
      amount: parseFloat(transaction.amount),
      balanceAfter: newBalance
    }
  };
}

/**
 * Mark failed payment
 */
async function markFailedPayment(customerId, razorpay_order_id, error_reason) {
  console.log(`[Failed Payment] Attempting to mark order ${razorpay_order_id} as failed, reason: ${error_reason}`);

  // Find transaction by order ID (any status)
  const transaction = await WalletTransaction.findOne({
    where: {
      customerId: customerId,
      referenceId: razorpay_order_id,
      transactionCategory: 'topup'
    },
    order: [['createdAt', 'DESC']]
  });

  if (!transaction) {
    console.log(`[Failed Payment] No transaction found for order ${razorpay_order_id}`);
    throw new Error('Transaction not found for this order ID');
  }

  console.log(`[Failed Payment] Found transaction ${transaction.id} with status: ${transaction.status}`);
  
  // Idempotency check: If already completed or failed, return without changes
  if (transaction.status === 'completed') {
    console.log(`[Failed Payment] Transaction ${transaction.id} is completed, not marking as failed`);
    return {
      success: true,
      message: 'Transaction already completed - payment was successful',
      transaction: {
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        status: 'completed'
      }
    };
  }
  
  // If already failed, return success (idempotent)
  if (transaction.status === 'failed') {
    console.log(`[Failed Payment] Transaction ${transaction.id} already failed`);
    return {
      success: true,
      message: 'Transaction already marked as failed',
      transaction: {
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        status: 'failed'
      }
    };
  }
  
  // If pending, wait to see if verification is in progress
  if (transaction.status === 'pending') {
    console.log(`[Failed Payment] Transaction ${transaction.id} is pending, waiting 3s...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Reload to get latest status
    await transaction.reload();
    console.log(`[Failed Payment] After wait, transaction ${transaction.id} status: ${transaction.status}`);
    
    if (transaction.status === 'completed') {
      console.log(`[Failed Payment] Transaction ${transaction.id} was completed, not marking as failed`);
      throw new Error('Transaction was completed - payment was successful');
    }
    
    if (transaction.status === 'pending') {
      // Still pending - safe to mark as failed
      await transaction.update({
        status: 'failed',
        description: `${transaction.description} - Payment failed${error_reason ? `: ${error_reason}` : ''}`
      });
      
      console.log(`[Failed Payment] Marked transaction ${transaction.id} as failed`);

      return {
        success: true,
        message: 'Failed payment attempt recorded',
        transaction: {
          id: transaction.id,
          amount: parseFloat(transaction.amount),
          status: 'failed'
        }
      };
    }
    
    // Status changed during wait
    return {
      success: true,
      message: `Transaction is now ${transaction.status}, not marking as failed`
    };
  }

  // Other status - return as is
  return {
    success: true,
    message: `Transaction status is ${transaction.status}`,
    transaction: {
      id: transaction.id,
      amount: parseFloat(transaction.amount),
      status: transaction.status
    }
  };
}

/**
 * Handle payment webhook (for Razorpay webhooks)
 */
async function handlePaymentWebhook(webhookPayload, signature) {
  // Verify webhook signature
  const isValidSignature = verifyWebhookSignature(JSON.stringify(webhookPayload), signature);
  
  if (!isValidSignature) {
    throw new Error('Invalid webhook signature');
  }

  // Validity check: Validate webhook payload structure
  if (!webhookPayload || typeof webhookPayload !== 'object') {
    throw new Error('Invalid webhook payload: payload is not an object');
  }

  const paymentEntity = webhookPayload.payload?.payment?.entity;
  if (!paymentEntity) {
    throw new Error('Invalid webhook payload: missing payment.entity');
  }

  const paymentId = paymentEntity.id;
  const orderId = paymentEntity.order_id;
  const status = paymentEntity.status;

  if (!paymentId || typeof paymentId !== 'string') {
    throw new Error('Invalid webhook payload: missing or invalid payment.id');
  }

  if (!orderId || typeof orderId !== 'string') {
    throw new Error('Invalid webhook payload: missing or invalid payment.order_id');
  }

  if (!status || typeof status !== 'string') {
    throw new Error('Invalid webhook payload: missing or invalid payment.status');
  }

  // Idempotency check: Check if this payment was already processed
  const existingPaymentTransaction = await WalletTransaction.findOne({
    where: {
      referenceId: paymentId,
      status: 'completed',
      transactionCategory: 'topup'
    }
  });

  if (existingPaymentTransaction) {
    console.log(`[Payment Webhook] Payment ${paymentId} already processed in transaction ${existingPaymentTransaction.id}, skipping duplicate`);
    return {
      success: true,
      message: 'Payment already processed'
    };
  }

  // Also check by order_id if payment_id not found
  const existingOrderTransaction = await WalletTransaction.findOne({
    where: {
      referenceId: orderId,
      status: 'completed',
      transactionCategory: 'topup'
    }
  });

  if (existingOrderTransaction) {
    // Check if this payment_id is mentioned in the description
    const paymentIdInDescription = existingOrderTransaction.description?.includes(`Payment ID: ${paymentId}`);
    if (paymentIdInDescription) {
      console.log(`[Payment Webhook] Payment ${paymentId} (order ${orderId}) already processed in transaction ${existingOrderTransaction.id}, skipping duplicate`);
      return {
        success: true,
        message: 'Payment already processed'
      };
    }
  }

  // Publish to RabbitMQ queue for async processing (if enabled)
  const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
  if (ENABLE_RABBITMQ) {
    try {
      const { publishPayment } = require('../libs/rabbitmq/producer');
      const published = await publishPayment(webhookPayload);
      
      if (!published) {
        throw new Error('Failed to publish to RabbitMQ queue');
      }

      console.log(`[Payment Webhook] Successfully published payment ${paymentId} to queue`);
      
      return {
        success: true,
        message: 'Webhook received and queued for processing'
      };
    } catch (error) {
      console.error('[Payment Webhook] Failed to publish to RabbitMQ queue:', error);
      throw error;
    }
  } else {
    // Direct processing (fallback)
    throw new Error('Direct webhook processing not implemented - enable RabbitMQ');
  }
}

module.exports = {
  createTopupOrder,
  verifyTopupPayment,
  markFailedPayment,
  handlePaymentWebhook
};

