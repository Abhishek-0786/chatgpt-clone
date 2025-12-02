/**
 * Wallet Manager
 * Handles wallet-related business logic
 * TODO: Move this to BillingMicroservice when implemented
 * 
 * Now uses REST API instead of direct database access
 */

const apiClient = require('../utils/api_client');

/**
 * Get or create wallet for a customer
 * Uses REST API to communicate with backend
 * @param {number} customerId - Customer ID
 * @returns {Promise<Object>} Wallet object
 */
async function getOrCreateWallet(customerId) {
  // This is now handled by backend via processRefund API
  // We don't need to get/create wallet here anymore
  return { customerId }; // Return minimal object
}

/**
 * Process refund for a customer
 * Uses REST API to communicate with backend billing service
 * @param {number} customerId - Customer ID
 * @param {number} refundAmount - Amount to refund
 * @param {string} sessionId - Session ID for reference
 * @param {Object} sessionData - Additional session data
 * @returns {Promise<Object>} Refund transaction object
 */
async function processRefund(customerId, refundAmount, sessionId, sessionData = {}) {
  if (refundAmount <= 0) {
    return null;
  }

  try {
    const refundTransaction = await apiClient.processRefund(
      customerId,
      refundAmount,
      sessionId,
      {
        energyConsumed: sessionData.energyConsumed,
        finalAmount: sessionData.finalAmount,
        amountDeducted: sessionData.amountDeducted,
        description: `Auto-refund - Charger disconnected during session ${sessionId} (Energy: ${sessionData.energyConsumed?.toFixed(2) || 0} kWh, Used: ₹${sessionData.finalAmount?.toFixed(2) || 0}, Refunded: ₹${refundAmount.toFixed(2)})`
      }
    );

    if (refundTransaction) {
      console.log(`💰 Refund processed via API: ₹${refundAmount} for customer ${customerId}`);
    } else {
      console.warn(`⚠️ Refund API call returned no transaction for session ${sessionId}`);
    }

    return refundTransaction;
  } catch (error) {
    console.error(`❌ Error processing refund via API:`, error.message);
    // TODO: Publish to RabbitMQ DLQ for retry when BillingMicroservice is ready
    return null;
  }
}

module.exports = {
  getOrCreateWallet,
  processRefund
};
