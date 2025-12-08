/**
 * Payment Consumer Service
 * Consumes payment.completed messages from RabbitMQ and updates wallet/ledger
 * 
 * TODO: Move this logic to PaymentMicroservice in future
 * TODO: Ensure idempotency to avoid double wallet updates
 */

const BaseConsumer = require('../libs/rabbitmq/consumer');
const { QUEUES, ROUTING_KEYS } = require('../libs/rabbitmq/queues');
const { Wallet, WalletTransaction } = require('../models');
const { Op } = require('sequelize');
const { getPaymentDetails } = require('../libs/razorpay');

class PaymentConsumer extends BaseConsumer {
  constructor() {
    super(QUEUES.PAYMENT_COMPLETED, {
      routingKeys: [ROUTING_KEYS.PAYMENT_COMPLETED],
      prefetch: 1 // Process one payment at a time
    });
  }

  async processMessage(content, msg) {
    try {
      console.log('📥 [Payment Consumer] Received payment message:', JSON.stringify(content, null, 2));

      const { type, payload, timestamp } = content;

      // Only process wallet.topup payments
      if (type !== 'wallet.topup') {
        console.log(`⏭️ [Payment Consumer] Ignoring payment type: ${type}`);
        return true; // Acknowledge - not an error, just not our type
      }

      // Extract payment details from Razorpay webhook payload
      // Razorpay webhook structure: { event, payload: { payment: { entity: {...} }, order: { entity: {...} } } }
      const paymentEntity = payload?.payload?.payment?.entity;
      if (!paymentEntity) {
        console.error('❌ [Payment Consumer] Missing payment entity in webhook payload');
        console.error('❌ [Payment Consumer] Payload structure:', JSON.stringify(payload, null, 2));
        return false; // Fail - BaseConsumer will nack and requeue
      }

      const paymentId = paymentEntity.id;
      const orderId = paymentEntity.order_id;
      const amount = paymentEntity.amount / 100; // Convert from paise to INR
      const status = paymentEntity.status;

      console.log(`💰 [Payment Consumer] Processing payment: ${paymentId}, order: ${orderId}, amount: ₹${amount}, status: ${status}`);

      // Only process captured payments
      if (status !== 'captured') {
        console.log(`⏭️ [Payment Consumer] Payment ${paymentId} not captured (status: ${status}), ignoring`);
        return true; // Acknowledge - not an error, just not captured yet
      }

      // Get customer ID from order notes
      // Razorpay webhook structure: payload.payload.order.entity.notes
      const orderEntity = payload?.payload?.order?.entity;
      const orderNotes = orderEntity?.notes;
      const customerId = orderNotes?.customerId ? parseInt(orderNotes.customerId) : null;

      if (!customerId) {
        console.error(`❌ [Payment Consumer] Missing customerId in order notes for payment ${paymentId}`);
        // Try to find transaction by order ID as fallback
        const transaction = await WalletTransaction.findOne({
          where: {
            referenceId: orderId,
            transactionCategory: 'topup',
            status: 'pending'
          },
          order: [['createdAt', 'DESC']]
        });

        if (transaction) {
          console.log(`✅ [Payment Consumer] Found transaction ${transaction.id} by order ID, using customerId: ${transaction.customerId}`);
          await this.processPaymentUpdate(transaction.customerId, paymentId, orderId, amount, transaction.id);
          return true; // Success - BaseConsumer will ack
        } else {
          console.error(`❌ [Payment Consumer] Cannot process payment ${paymentId} - no customerId and no pending transaction found`);
          // This is a permanent failure - don't retry
          return true; // Acknowledge to prevent infinite retries (payment cannot be processed)
        }
      }

      // TODO: Ensure idempotency to avoid double wallet updates
      // Check if this payment has already been processed
      const existingTransaction = await WalletTransaction.findOne({
        where: {
          referenceId: paymentId,
          status: 'completed',
          transactionCategory: 'topup'
        }
      });

      if (existingTransaction) {
        console.log(`✅ [Payment Consumer] Payment ${paymentId} already processed (transaction ${existingTransaction.id}), skipping`);
        return true; // Already processed - acknowledge
      }

      // Find pending transaction for this order
      let transaction = await WalletTransaction.findOne({
        where: {
          customerId: customerId,
          referenceId: orderId,
          status: 'pending',
          transactionCategory: 'topup'
        },
        order: [['createdAt', 'DESC']]
      });

      // If not found by order ID, try to find most recent pending transaction
      if (!transaction) {
        console.log(`[Payment Consumer] No pending transaction found with order ID ${orderId}, searching for most recent pending...`);
        transaction = await WalletTransaction.findOne({
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

        if (transaction) {
          console.log(`✅ [Payment Consumer] Found recent pending transaction ${transaction.id}, updating referenceId to ${orderId}`);
          await transaction.update({ referenceId: orderId });
        }
      }

      if (!transaction) {
        console.error(`❌ [Payment Consumer] No pending transaction found for customer ${customerId}, order ${orderId}`);
        // Transaction not found - this might be a timing issue, so we'll retry
        return false; // Fail - BaseConsumer will nack and requeue for retry
      }

      // Process payment update
      await this.processPaymentUpdate(customerId, paymentId, orderId, amount, transaction.id);

      console.log(`✅ [Payment Consumer] Successfully processed payment ${paymentId}`);
      return true; // Success - BaseConsumer will ack

    } catch (error) {
      console.error('❌ [Payment Consumer] Error processing payment message:', error);
      
      // Check if it's a validation error that will always fail
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        console.error('⚠️ [Payment Consumer] Validation error - acknowledging to prevent infinite retries');
        return true; // Acknowledge to prevent infinite retries (BaseConsumer will ack)
      } else {
        // Database or other error - throw to trigger retry logic in BaseConsumer
        console.error('🔄 [Payment Consumer] Error occurred, message will be retried');
        throw error; // Re-throw to trigger nack and retry in BaseConsumer
      }
    }
  }

  async processPaymentUpdate(customerId, paymentId, orderId, amount, transactionId) {
    try {
      console.log(`💳 [Payment Consumer] Processing payment update for customer ${customerId}, transaction ${transactionId}`);

      // Get wallet
      const wallet = await Wallet.findOne({
        where: { customerId: customerId }
      });

      if (!wallet) {
        throw new Error(`Wallet not found for customer ${customerId}`);
      }

      // Reload transaction to ensure we have latest status
      const transaction = await WalletTransaction.findByPk(transactionId);
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      // Double-check transaction is still pending
      if (transaction.status !== 'pending') {
        if (transaction.status === 'completed') {
          console.log(`✅ [Payment Consumer] Transaction ${transactionId} already completed, skipping`);
          return;
        } else {
          throw new Error(`Transaction ${transactionId} is in ${transaction.status} status, cannot process`);
        }
      }

      // Calculate new balance
      const currentBalance = parseFloat(wallet.balance) || 0;
      const newBalance = currentBalance + amount;

      // Update wallet balance
      await wallet.update({
        balance: newBalance
      });

      // Update transaction
      await transaction.update({
        status: 'completed',
        referenceId: paymentId, // Update to payment ID
        balanceAfter: newBalance,
        description: `Wallet Top-up - ₹${amount} (Payment ID: ${paymentId})`
      });

      console.log(`✅ [Payment Consumer] Updated wallet for customer ${customerId}: ₹${currentBalance} → ₹${newBalance}`);
      console.log(`✅ [Payment Consumer] Updated transaction ${transactionId} to completed status`);

    } catch (error) {
      console.error(`❌ [Payment Consumer] Error in processPaymentUpdate:`, error);
      throw error; // Re-throw to trigger nack in processMessage
    }
  }
}

module.exports = PaymentConsumer;

