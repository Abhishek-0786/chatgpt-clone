/**
 * Session Manager
 * Handles charging session-related business logic
 * TODO: Move this to SessionMicroservice when implemented
 * 
 * Now uses REST API and RabbitMQ instead of direct database access
 */

const apiClient = require('../utils/api_client');
const { extractMeterValue } = require('../utils/meter_extractor');
const { processRefund } = require('./wallet_manager');
const rabbitmqProducer = require('../rabbitmq/producer');

/**
 * Stop all active charging sessions when charger disconnects
 * Uses REST API to get sessions and stop them
 * @param {string} deviceId - Device identifier
 * @param {Object} options - Options object
 * @param {Function} options.onEvent - Callback for events (for RabbitMQ/Socket.io)
 */
async function stopActiveSessionsOnDisconnect(deviceId, options = {}) {
  try {
    console.log(`🛑 [AUTO-STOP] Checking for active sessions on disconnected charger: ${deviceId}`);
    
    // Get active sessions from backend API
    const activeSessions = await apiClient.getActiveSessions(deviceId);

    if (!activeSessions || activeSessions.length === 0) {
      console.log(`✅ [AUTO-STOP] No active sessions found for ${deviceId}`);
      return;
    }

    console.log(`⚠️ [AUTO-STOP] Found ${activeSessions.length} active session(s) for disconnected charger ${deviceId}. Stopping them...`);

    // Process each active session
    for (const session of activeSessions) {
      try {
        const customerId = session.customerId;
        const amountDeducted = parseFloat(session.amountDeducted || 0);
        
        // Get meter readings from session data (backend should provide this)
        let meterStart = session.meterStart;
        let meterEnd = session.meterEnd || null;
        let energyConsumed = 0;
        let finalAmount = 0;
        let refundAmount = 0;

        // Calculate energy consumed from meter readings
        if (meterStart !== null && meterEnd !== null && meterEnd >= meterStart) {
          energyConsumed = (meterEnd - meterStart) / 1000; // Convert Wh to kWh
          if (energyConsumed < 0) energyConsumed = 0;
        }

        // Calculate final amount if we have tariff and energy data
        const tariff = session.tariff || session.chargingPoint?.tariff;
        if (energyConsumed > 0 && tariff) {
          const baseCharges = parseFloat(tariff.baseCharges || 0);
          const tax = parseFloat(tariff.tax || 0);
          
          if (baseCharges > 0) {
            const baseAmount = energyConsumed * baseCharges;
            const taxMultiplier = 1 + (tax / 100);
            const calculatedAmount = baseAmount * taxMultiplier;
            // Cap at amountDeducted - user should NEVER be charged more than prepaid
            finalAmount = Math.min(calculatedAmount, amountDeducted);
          }
        }

        // Calculate refund
        if (energyConsumed > 0 && finalAmount > 0 && finalAmount < amountDeducted) {
          refundAmount = amountDeducted - finalAmount;
        } else if (energyConsumed === 0 || finalAmount === 0) {
          // No energy consumed or no valid calculation - full refund to be safe
          refundAmount = amountDeducted;
        }

        // Stop session via API
        const stopSuccess = await apiClient.stopSession(session.sessionId, {
          status: 'stopped',
          energyConsumed: energyConsumed,
          finalAmount: finalAmount,
          refundAmount: refundAmount,
          meterStart: meterStart,
          meterEnd: meterEnd,
          endTime: new Date(),
          stopReason: 'Disconnected'
        });

        if (stopSuccess) {
          console.log(`✅ [AUTO-STOP] Session ${session.sessionId} stopped via API. Energy: ${energyConsumed.toFixed(3)} kWh, Final: ₹${finalAmount.toFixed(2)}, Refund: ₹${refundAmount.toFixed(2)}`);
        } else {
          console.warn(`⚠️ [AUTO-STOP] Failed to stop session ${session.sessionId} via API`);
        }

        // Process refund if needed
        if (refundAmount > 0) {
          await processRefund(customerId, refundAmount, session.sessionId, {
            energyConsumed,
            finalAmount,
            amountDeducted
          });
        }

        // Publish events if callback provided
        if (options.onEvent) {
          await options.onEvent({
            type: 'charging.stopped',
            sessionId: session.sessionId,
            customerId: customerId,
            deviceId: deviceId,
            connectorId: session.connectorId,
            energyConsumed: energyConsumed,
            finalAmount: finalAmount,
            refundAmount: refundAmount,
            amountDeducted: amountDeducted,
            startTime: session.startTime,
            endTime: new Date(),
            stopReason: 'Disconnected'
          });
        }

      } catch (sessionError) {
        console.error(`❌ [AUTO-STOP] Error stopping session ${session.sessionId}:`, sessionError.message);
        // Continue with other sessions even if one fails
      }
    }

    console.log(`✅ [AUTO-STOP] Completed stopping ${activeSessions.length} session(s) for ${deviceId}`);

  } catch (error) {
    console.error(`❌ [AUTO-STOP] Error stopping active sessions for ${deviceId}:`, error.message);
    console.error(error.stack);
  }
}

module.exports = {
  stopActiveSessionsOnDisconnect
};
