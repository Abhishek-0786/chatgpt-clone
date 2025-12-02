/**
 * Charging Responses Consumer
 * Consumes remote start/stop responses from RabbitMQ and updates sessions
 */

const BaseConsumer = require('./rabbitmq/consumer');
const { ROUTING_KEYS } = require('./rabbitmq/queues');
const ChargingSession = require('../models/ChargingSession');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const ChargerData = require('../models/ChargerData');
const Charger = require('../models/Charger');
const { publishNotification } = require('./rabbitmq/producer');
const { Op } = require('sequelize');

class ChargingResponsesConsumer extends BaseConsumer {
  constructor() {
    // Use CHARGING_EVENTS queue with routing keys for remote start/stop responses
    super('charging_events', {
      prefetch: 5, // Process multiple responses at once
      routingKeys: [
        ROUTING_KEYS.CHARGING_REMOTE_START_RESPONSE,
        ROUTING_KEYS.CHARGING_REMOTE_STOP_RESPONSE
      ],
      maxRetries: 3
    });
  }

  async processMessage(content, msg) {
    try {
      const routingKey = msg.fields.routingKey;
      console.log(`📥 [Queue] Received charging response: ${routingKey} for session ${content.sessionId}`);

      if (routingKey === ROUTING_KEYS.CHARGING_REMOTE_START_RESPONSE) {
        return await this.handleRemoteStartResponse(content);
      } else if (routingKey === ROUTING_KEYS.CHARGING_REMOTE_STOP_RESPONSE) {
        return await this.handleRemoteStopResponse(content);
      } else {
        console.warn(`⚠️ [Queue] Unknown routing key: ${routingKey}`);
        return true; // Acknowledge to prevent retries
      }
    } catch (error) {
      console.error(`❌ [Queue] Error processing charging response:`, error.message);
      console.error(`❌ [Queue] Error stack:`, error.stack);
      
      // Don't retry validation errors - they will always fail
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        console.error(`⚠️ [Queue] Validation/Constraint error - acknowledging to prevent infinite retries`);
        return true; // Acknowledge to prevent infinite retries
      }
      
      throw error; // Re-throw to trigger retry logic for other errors
    }
  }

  async handleRemoteStartResponse(content) {
    try {
      const { sessionId, deviceId, connectorId, status, transactionId, errorCode, errorDescription } = content;
      
      console.log(`🚀 [Queue] Processing remote start response for session ${sessionId}: ${status}`);

      // Find the session
      const session = await ChargingSession.findOne({
        where: { sessionId: sessionId }
      });

      if (!session) {
        console.warn(`⚠️ [Queue] Session ${sessionId} not found - may have been deleted`);
        return true; // Acknowledge - session doesn't exist
      }

      let effectiveStatus = status;
      let detectedStartLog = null;

      if (status !== 'Accepted') {
        detectedStartLog = await this.findRecentStartTransaction(session, deviceId, connectorId);
        if (detectedStartLog) {
          effectiveStatus = 'Accepted';
          console.warn(`⚠️ [Queue] Remote start reported as ${status}, but StartTransaction ${detectedStartLog.messageId || '(unknown)'} detected. Treating as Accepted.`);
        }
      }

      if (effectiveStatus === 'Accepted') {
        const derivedTransactionId = transactionId ||
          detectedStartLog?.messageData?.transactionId ||
          session.transactionId;
        const derivedStartTime = detectedStartLog ? detectedStartLog.createdAt : new Date();
        const updatePayload = {
          status: 'active',
          transactionId: derivedTransactionId || session.transactionId
        };

        if (!session.startTime) {
          updatePayload.startTime = derivedStartTime;
        }

        // Update session to active
        await session.update(updatePayload);

        console.log(`✅ [Queue] Session ${sessionId} activated successfully`);

        await this.updateChargerStatus(deviceId, 'Charging');
        await this.publishChargingNotification('charging.remote.start.accepted', {
          deviceId,
          connectorId,
          sessionId,
          transactionId: session.transactionId || derivedTransactionId,
          status: 'active'
        });
      } else {
        // Rejected - refund wallet and mark as failed
        const wallet = await Wallet.findOne({
          where: { customerId: session.customerId }
        });

        if (wallet && session.amountDeducted > 0) {
          // CRITICAL: Check if refund already exists to prevent duplicate refunds
          const existingRefund = await WalletTransaction.findOne({
            where: {
              customerId: session.customerId,
              referenceId: sessionId,
              transactionType: 'refund',
              transactionCategory: 'refund'
            }
          });

          if (existingRefund) {
            console.log(`⚠️ [Queue] Refund already exists for session ${sessionId}, skipping duplicate refund`);
          } else {
            // Find the original debit transaction for THIS session
            // CRITICAL: Must find the exact debit transaction created for this session
            const originalDebit = await WalletTransaction.findOne({
              where: {
                customerId: session.customerId,
                referenceId: sessionId, // Must match sessionId exactly - this is the key!
                transactionType: 'debit',
                transactionCategory: 'charging'
              },
              order: [['createdAt', 'DESC']],
              limit: 1
            });

            const refundAmount = parseFloat(session.amountDeducted);
            const currentBalance = parseFloat(wallet.balance);
            
            // CRITICAL: Calculate target balance correctly
            // If we found the correct debit transaction (by sessionId), ALWAYS restore to its balanceBefore
            // This ensures we restore to the exact original balance, even if previous refunds corrupted the balance
            let targetBalance;
            
            if (originalDebit && originalDebit.balanceBefore !== null && originalDebit.referenceId === sessionId) {
              // Found the correct debit transaction for this session - restore to its original balanceBefore
              targetBalance = parseFloat(originalDebit.balanceBefore);
              console.log(`✅ [Queue] Found correct debit transaction for session ${sessionId}`);
              console.log(`📊 [Queue] Original balance before deduction: ₹${targetBalance}`);
              console.log(`📊 [Queue] Current balance: ₹${currentBalance}`);
              console.log(`📊 [Queue] Refund amount: ₹${refundAmount}`);
              console.log(`📊 [Queue] Restoring balance to original: ₹${targetBalance}`);
            } else {
              // No matching debit transaction found - use safe approach: add refund to current balance
              // This should only happen if the debit transaction wasn't created with referenceId
              targetBalance = currentBalance + refundAmount;
              console.warn(`⚠️ [Queue] Original debit transaction not found for session ${sessionId} (referenceId match)`);
              console.log(`📊 [Queue] Using fallback: currentBalance + refundAmount = ₹${currentBalance} + ₹${refundAmount} = ₹${targetBalance}`);
            }

            // Update wallet balance to target balance
            await wallet.update({ balance: targetBalance });

            // Create refund transaction with correct field names
            await WalletTransaction.create({
              walletId: wallet.id,
              customerId: session.customerId,
              transactionType: 'refund',
              amount: refundAmount,
              balanceBefore: currentBalance,
              balanceAfter: targetBalance,
              description: `Refund for failed charging session ${sessionId}: ${errorDescription || errorCode || 'Rejected'}`,
              referenceId: sessionId,
              status: 'completed',
              transactionCategory: 'refund'
            });

            console.log(`💰 [Queue] Refunded ₹${refundAmount} to customer ${session.customerId} (Balance: ₹${currentBalance} → ₹${targetBalance}, restored to original)`);
          }
        }

        // Update session status
        await session.update({
          status: 'failed',
          refundAmount: session.amountDeducted,
          stopReason: errorDescription || errorCode || 'Rejected'
        });

        console.log(`❌ [Queue] Session ${sessionId} rejected: ${errorDescription || errorCode}`);
      }

      return true; // Acknowledge message
    } catch (error) {
      console.error(`❌ [Queue] Error in handleRemoteStartResponse:`, error.message);
      
      // Don't retry validation errors - they will always fail
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        console.error(`⚠️ [Queue] Validation/Constraint error in handleRemoteStartResponse - acknowledging to prevent infinite retries`);
        return true; // Acknowledge to prevent infinite retries
      }
      
      throw error; // Re-throw to trigger retry for other errors
    }
  }

  async handleRemoteStopResponse(content) {
    try {
      const { sessionId, deviceId, status, errorCode, errorDescription } = content;
      
      console.log(`🛑 [Queue] Processing remote stop response for session ${sessionId}: ${status}`);

      // Find the session
      const session = await ChargingSession.findOne({
        where: { sessionId: sessionId }
      });

      if (!session) {
        console.warn(`⚠️ [Queue] Session ${sessionId} not found - may have been deleted`);
        return true; // Acknowledge - session doesn't exist
      }

      if (status === 'Accepted') {
        // Session stop was accepted by charger
        // Note: Final billing is handled by StopTransaction message processing
        // This just confirms the charger accepted the stop command
        console.log(`✅ [Queue] Remote stop accepted for session ${sessionId}`);

        await this.updateChargerStatus(deviceId, 'Available');
        await this.publishChargingNotification('charging.remote.stop.accepted', {
          deviceId,
          sessionId,
          status: 'stopped'
        });
      } else {
        // Stop was rejected - log but don't fail (charger might stop on its own)
        console.warn(`⚠️ [Queue] Remote stop rejected for session ${sessionId}: ${errorDescription || errorCode}`);
        // Session will be finalized when StopTransaction is received
      }

      return true; // Acknowledge message
    } catch (error) {
      console.error(`❌ [Queue] Error in handleRemoteStopResponse:`, error.message);
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Detect if a StartTransaction log exists for the given session/device.
   * Some chargers do not send explicit RemoteStartTransaction responses but
   * immediately start the transaction. In that case we should treat the
   * session as accepted instead of refunding the customer.
   */
  async findRecentStartTransaction(session, deviceId, connectorId) {
    try {
      const lookbackStart = new Date(session.createdAt.getTime() - 60 * 1000); // 1 minute before session creation
      const connectorToMatch = connectorId !== undefined && connectorId !== null
        ? connectorId
        : session.connectorId;

      const whereClause = {
        deviceId,
        message: 'StartTransaction',
        direction: 'Incoming',
        createdAt: {
          [Op.gte]: lookbackStart
        }
      };

      if (connectorToMatch !== undefined && connectorToMatch !== null) {
        whereClause.connectorId = connectorToMatch;
      }

      const startLog = await ChargerData.findOne({
        where: whereClause,
        order: [['createdAt', 'DESC']]
      });

      return startLog || null;
    } catch (error) {
      console.warn(`⚠️ [Queue] Failed to look up StartTransaction logs for device ${deviceId}: ${error.message}`);
      return null;
    }
  }

  async updateChargerStatus(deviceId, status = 'Available') {
    try {
      await Charger.update({ status }, { where: { deviceId } });
    } catch (error) {
      console.warn(`⚠️ [Queue] Failed to update charger status for ${deviceId}: ${error.message}`);
    }
  }

  async publishChargingNotification(type, data = {}) {
    try {
      await publishNotification({
        type,
        data,
        recipients: [] // broadcast to all CMS/UI listeners
      });
    } catch (error) {
      console.warn(`⚠️ [Queue] Failed to publish notification (${type}): ${error.message}`);
    }
  }
}

let consumerInstance = null;

function getChargingResponsesConsumer() {
  if (!consumerInstance) {
    consumerInstance = new ChargingResponsesConsumer();
  }
  return consumerInstance;
}

async function startChargingResponsesConsumer() {
  try {
    const consumer = getChargingResponsesConsumer();
    await consumer.start();
    console.log('✅ Charging Responses Consumer started');
    return consumer;
  } catch (error) {
    console.error('❌ Failed to start Charging Responses Consumer:', error.message);
    throw error;
  }
}

async function stopChargingResponsesConsumer() {
  try {
    if (consumerInstance) {
      await consumerInstance.stop();
      consumerInstance = null;
      console.log('✅ Charging Responses Consumer stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping Charging Responses Consumer:', error.message);
  }
}

module.exports = {
  ChargingResponsesConsumer,
  getChargingResponsesConsumer,
  startChargingResponsesConsumer,
  stopChargingResponsesConsumer
};

