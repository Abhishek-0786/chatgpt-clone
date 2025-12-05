/**
 * OCPP Message Processor
 * Consumes OCPP messages from RabbitMQ and processes them
 * Moves the storeMessage logic from websocket-server.js here
 */

const BaseConsumer = require('./rabbitmq/consumer');
const { QUEUES, ROUTING_KEYS } = require('./rabbitmq/queues');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const { Op } = require('sequelize');
const {
  MESSAGE_TYPE,
  createMessageId
} = require('../utils/ocpp');
const { publishNotification } = require('./rabbitmq/producer');
const listManager = require('../redis/listManager');
const updater = require('../redis/updater');

class OCPPMessageProcessor extends BaseConsumer {
  constructor() {
    super(QUEUES.OCPP_MESSAGES, {
      prefetch: 1, // Process one message at a time to maintain order
      routingKeys: [
        ROUTING_KEYS.OCPP_BOOT_NOTIFICATION,
        ROUTING_KEYS.OCPP_START_TRANSACTION,
        ROUTING_KEYS.OCPP_STOP_TRANSACTION,
        ROUTING_KEYS.OCPP_STATUS_NOTIFICATION,
        ROUTING_KEYS.OCPP_METER_VALUES,
        ROUTING_KEYS.OCPP_RESPONSE,
        ROUTING_KEYS.OCPP_ERROR
      ],
      maxRetries: 3
    });
  }

  /**
   * Process OCPP message from queue
   * @param {Object} content - Message content from RabbitMQ
   * @param {Object} msg - Raw RabbitMQ message
   * @returns {Promise<boolean>} - true if successful
   */
  async processMessage(content, msg) {
    try {
      const { deviceId, chargerId, messageType, payload, parsedMessage } = content;

      console.log(`📥 [OCPP Processor] Received message: ${messageType} from ${deviceId}`);

      // Store the message in database
      await this.storeMessage(deviceId, chargerId, parsedMessage || content);

      // Process based on message type
      switch (messageType) {
        case 'BootNotification':
          await this.handleBootNotification(deviceId, chargerId, payload);
          break;
        case 'StartTransaction':
          await this.handleStartTransaction(deviceId, chargerId, payload);
          break;
        case 'StopTransaction':
          await this.handleStopTransaction(deviceId, chargerId, payload);
          break;
        case 'StatusNotification':
          await this.handleStatusNotification(deviceId, chargerId, payload);
          break;
        case 'MeterValues':
          await this.handleMeterValues(deviceId, chargerId, payload);
          break;
      }

      return true;
    } catch (error) {
      console.error('❌ Error in OCPP message processor:', error.message);
      throw error; // Re-throw to trigger retry logic
    }
  }

  /**
   * Store message in database (moved from websocket-server.js)
   * @param {string} deviceId - Charger device ID
   * @param {number} chargerId - Charger database ID (may be null)
   * @param {Object} message - Message object
   */
  async storeMessage(deviceId, chargerId, message) {
    try {
      // Ensure charger exists and get chargerId if not provided
      if (!chargerId || chargerId === null) {
        let charger = await Charger.findOne({ 
          where: { deviceId },
          attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
        });
        
        if (!charger) {
          // Create charger if it doesn't exist
          console.log(`📝 Creating charger for deviceId: ${deviceId}`);
          charger = await Charger.create({
            deviceId,
            name: deviceId,
            chargerName: deviceId,
            status: 'Available',
            vendor: 'Unknown',
            model: 'Unknown',
            serialNumber: 'Unknown',
            firmwareVersion: 'Unknown',
            connectorCount: 0,
            powerRating: 0
          }, {
            attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
          });
          console.log(`✅ Created charger: ${deviceId} (id: ${charger.id})`);
        }
        
        chargerId = charger.id;
      }

      // Update charger's lastSeen
      await Charger.update(
        { lastSeen: new Date() },
        { where: { deviceId } }
      );

      // Determine message type and direction
      const messageType = (message && message.ocpp && message.action)
        ? message.action
        : (message.message || message.messageType || message.type || 'Unknown');
      const direction = message.direction || 'Incoming';

      // Get messageId for duplicate check
      const msgId = message.id || message.messageId;
      
      // Check for duplicate message (same messageId + message type + direction)
      if (msgId) {
        const existingMessage = await ChargerData.findOne({
          where: {
            deviceId: deviceId,
            messageId: msgId,
            message: messageType,
            direction: direction
          }
        });

        if (existingMessage) {
          console.warn(`⚠️ Duplicate message detected and skipped: ${messageType} (${direction}) messageId: ${msgId} from ${deviceId}`);
          return; // Skip storing duplicate
        }
      }
      
      // For RemoteStartTransaction/RemoteStopTransaction, check for recent duplicates
      if ((messageType === 'RemoteStartTransaction' || messageType === 'RemoteStopTransaction') && direction === 'Outgoing') {
        const fiveSecondsAgo = new Date(Date.now() - 5000);
        const recentDuplicate = await ChargerData.findOne({
          where: {
            deviceId: deviceId,
            message: messageType,
            direction: 'Outgoing',
            createdAt: {
              [Op.gte]: fiveSecondsAgo
            }
          },
          order: [['id', 'DESC']]
        });

        if (recentDuplicate) {
          const timeDiff = Math.round((Date.now() - new Date(recentDuplicate.createdAt).getTime()) / 1000);
          console.warn(`⚠️ [DUPLICATE PREVENTED] Duplicate ${messageType} command detected within 5 seconds - skipping storage. Previous messageId: ${recentDuplicate.messageId} (${timeDiff}s ago), Current messageId: ${msgId}`);
          return;
        }
      }

      // For StartTransaction/StopTransaction, check for duplicates (they're logged in handleIncomingMessage AND stored here)
      // Only store if not already in database (prevent duplicates from queue processing)
      if ((messageType === 'StartTransaction' || messageType === 'StopTransaction') && direction === 'Incoming') {
        const recentDuplicate = await ChargerData.findOne({
          where: {
            deviceId: deviceId,
            message: messageType,
            direction: 'Incoming',
            // Check if same transactionId or same timestamp (within 2 seconds)
            createdAt: {
              [Op.gte]: new Date(Date.now() - 2000)
            }
          },
          order: [['id', 'DESC']]
        });

        if (recentDuplicate) {
          // Check if it's the same transaction (same transactionId in payload)
          // Use message.payload directly since messageData hasn't been set yet
          const currentPayload = message.payload || {};
          const currentTransactionId = currentPayload.transactionId || currentPayload.idTag;
          const duplicateTransactionId = recentDuplicate.messageData?.transactionId || recentDuplicate.messageData?.idTag;
          
          if (currentTransactionId && duplicateTransactionId && currentTransactionId.toString() === duplicateTransactionId.toString()) {
            console.warn(`⚠️ [DUPLICATE PREVENTED] Duplicate ${messageType} detected (same transactionId: ${currentTransactionId}) - skipping storage. Previous messageId: ${recentDuplicate.messageId}`);
            return;
          } else if (!currentTransactionId && !duplicateTransactionId) {
            // Both don't have transactionId, check timestamp (within 1 second = likely duplicate)
            const timeDiff = Date.now() - new Date(recentDuplicate.createdAt).getTime();
            if (timeDiff < 1000) {
              console.warn(`⚠️ [DUPLICATE PREVENTED] Duplicate ${messageType} detected (same timestamp) - skipping storage. Previous messageId: ${recentDuplicate.messageId}`);
              return;
            }
          }
        }
      }

      // Extract connectorId
      let connectorId = 0;
      if (message.connectorId !== undefined && message.connectorId !== null) {
        connectorId = message.connectorId;
      } else if (message.payload && typeof message.payload.connectorId !== 'undefined') {
        connectorId = message.payload.connectorId;
      }

      // Format messageData
      let messageData = {};
      if (message.payload) {
        if (messageType === 'Response' && Object.keys(message.payload).length === 0) {
          messageData = {};
        } else {
          messageData = message.payload;
        }
      }

      // Format raw array
      let rawArray;
      if (message.raw && Array.isArray(message.raw)) {
        rawArray = message.raw;
      } else {
        const rawMsgId = msgId || createMessageId();
        if (message.type === MESSAGE_TYPE.CALL_RESULT || messageType === 'Response') {
          rawArray = [MESSAGE_TYPE.CALL_RESULT, rawMsgId, message.payload || messageData || {}];
        } else {
          rawArray = [MESSAGE_TYPE.CALL, rawMsgId, message.action || messageType, message.payload || messageData || {}];
        }
      }

      // Create timestamp
      const timestamp = new Date();

      // Store in ChargerData
      const finalMsgId = msgId || createMessageId();
      await ChargerData.create({
        chargerId: chargerId,
        deviceId: deviceId,
        type: 'OCPP',
        connectorId: connectorId,
        messageId: finalMsgId,
        message: messageType,
        messageData: messageData,
        raw: rawArray,
        direction: direction,
        timestamp: timestamp
      });

      console.log(`💾 Stored message: ${messageType} (${direction}) from ${deviceId} [messageId: ${finalMsgId}, chargerId: ${chargerId}]`);
    } catch (error) {
      console.error('❌ Error storing message:', error.message);
      // Don't throw for validation errors - just log and skip
      // This prevents infinite retries
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeDatabaseError') {
        console.error('⚠️ Database error - skipping message to prevent infinite retries');
        return; // Return successfully to acknowledge message
      }
      throw error; // Re-throw other errors for retry
    }
  }

  /**
   * Handle BootNotification
   */
  async handleBootNotification(deviceId, chargerId, payload) {
    try {
      // Update charger metadata if needed
      // Exclude chargerStatus as it may not exist in database
      const charger = await Charger.findByPk(chargerId, {
        attributes: { exclude: ['chargerStatus'] }
      });
      if (charger && payload) {
        const updates = {};
        
        if (payload.chargePointVendor && (!charger.vendor || charger.vendor === 'Unknown')) {
          updates.vendor = payload.chargePointVendor;
        }
        if (payload.chargePointModel && (!charger.model || charger.model === 'Unknown')) {
          updates.model = payload.chargePointModel;
        }
        if (payload.chargePointSerialNumber && (!charger.serialNumber || charger.serialNumber === 'Unknown')) {
          updates.serialNumber = payload.chargePointSerialNumber;
        }
        if (payload.firmwareVersion && (!charger.firmwareVersion || charger.firmwareVersion === 'Unknown')) {
          updates.firmwareVersion = payload.firmwareVersion;
        }

        if (Object.keys(updates).length > 0) {
          await charger.update(updates);
          console.log(`✅ Updated charger metadata from BootNotification for ${deviceId}`);
        }
      }

      // Publish notification
      await publishNotification({
        type: 'charger.booted',
        data: { deviceId, chargerId },
        recipients: []
      });
    } catch (error) {
      console.error(`❌ Error handling BootNotification:`, error.message);
    }
  }

  /**
   * Handle StartTransaction
   * Note: We don't publish session.started notification here because:
   * - charging.started is already published by the customer route when charging is initiated
   * - This prevents duplicate notifications to the customer
   * - The customer route notification includes more context (sessionId, amountDeducted, etc.)
   */
  async handleStartTransaction(deviceId, chargerId, payload) {
    try {
      // Session started notification is handled by customer route (charging.started)
      // This handler is kept for future extensions (e.g., CMS notifications, analytics)
      // No notification published here to avoid duplicates
    } catch (error) {
      console.error(`❌ Error handling StartTransaction:`, error.message);
    }
  }

  /**
   * Handle StopTransaction
   * Note: We don't publish session.stopped notification here because:
   * - charging.stopped is already published by the customer route when charging is stopped
   * - This prevents duplicate notifications to the customer
   * - The customer route notification includes more context (sessionId, energyConsumed, refundAmount, etc.)
   */
  async handleStopTransaction(deviceId, chargerId, payload) {
    try {
      // Update Redis status to "Available" when charging stops
      // This ensures the UI updates immediately even if StatusNotification is delayed
      try {
        const updater = require('../../redis/updater');
        await updater(deviceId, { status: 'Available' });
        console.log(`✅ [StopTransaction] Updated Redis status to Available for ${deviceId}`);
      } catch (redisErr) {
        console.error(`❌ [Redis] Error updating status in StopTransaction for ${deviceId}:`, redisErr.message);
      }

      // Update charger status in database
      if (chargerId) {
        try {
          const charger = await Charger.findByPk(chargerId, {
            attributes: { exclude: ['chargerStatus'] }
          });
          
          if (charger) {
            await charger.update({ status: 'Available' });
            console.log(`✅ [StopTransaction] Updated charger ${deviceId} status to Available in database`);
          }
        } catch (dbErr) {
          console.error(`❌ [DB] Error updating charger status in StopTransaction for ${deviceId}:`, dbErr.message);
        }
      }

      // Session stopped notification is handled by customer route (charging.stopped)
      // This handler is kept for future extensions (e.g., CMS notifications, analytics)
      // No notification published here to avoid duplicates
    } catch (error) {
      console.error(`❌ Error handling StopTransaction:`, error.message);
    }
  }

  /**
   * Handle StatusNotification
   */
  async handleStatusNotification(deviceId, chargerId, payload) {
    try {
      const { connectorId, status } = payload;
      
      // Update charger status based on connector status
      // If connector 0 (charger-level) or any connector is Charging, update charger status
      if (status === 'Charging' || status === 'Available' || status === 'Finishing' || status === 'Preparing') {
        let chargerStatus = 'Available';
        
        if (status === 'Charging') {
          chargerStatus = 'Charging';
        } else if (status === 'Finishing' || status === 'Preparing') {
          chargerStatus = 'Occupied';
        }
        
        // Update charger status in database
        if (chargerId) {
          const charger = await Charger.findByPk(chargerId, {
            attributes: { exclude: ['chargerStatus'] }
          });
          
          if (charger) {
            await charger.update({ status: chargerStatus });
            console.log(`✅ [StatusNotification] Updated charger ${deviceId} status to ${chargerStatus} (connector ${connectorId})`);
          }
        }
      }

      // Update Redis with listManager and updater
      try {
        // Push to events list and trim
        await listManager.push(`events:${deviceId}`, payload);
        await listManager.trim(`events:${deviceId}`, 100);
        
        // Update status (include errorCode if status indicates error like Faulted, Unavailable)
        const updateData = { status: payload.status };
        if (payload.status === 'Faulted' || payload.status === 'Unavailable') {
          updateData.errorCode = payload.errorCode || payload.status;
        }
        await updater(deviceId, updateData);
      } catch (redisErr) {
        console.error(`❌ [Redis] Error updating StatusNotification for ${deviceId}:`, redisErr.message);
      }

      // Publish notification
      await publishNotification({
        type: 'charger.status.changed',
        data: {
          deviceId,
          chargerId,
          connectorId: payload.connectorId,
          status: payload.status
        },
        recipients: []
      });
    } catch (error) {
      console.error(`❌ Error handling StatusNotification:`, error.message);
    }
  }

  /**
   * Handle MeterValues
   */
  async handleMeterValues(deviceId, chargerId, payload) {
    try {
      const { ChargingSession, ChargingPoint, Tariff } = require('../models');
      const { Op } = require('sequelize');

      console.log(`📊 [MeterValues] Processing MeterValues for device ${deviceId}, charger ${chargerId}`);
      console.log(`📊 [MeterValues] Payload:`, JSON.stringify(payload).substring(0, 200));

      // Extract energy from meter values
      let energyWh = null;
      if (payload.meterValue && Array.isArray(payload.meterValue) && payload.meterValue.length > 0) {
        const sampledValues = payload.meterValue[0].sampledValue;
        if (sampledValues && Array.isArray(sampledValues)) {
          const energySample = sampledValues.find(sample => 
            sample.measurand === 'Energy.Active.Import.Register' || 
            sample.measurand === 'energy' ||
            sample.measurand === 'Energy'
          );
          if (energySample && energySample.value) {
            energyWh = parseFloat(energySample.value);
            console.log(`📊 [MeterValues] Extracted energy: ${energyWh} Wh`);
          } else {
            console.warn(`⚠️ [MeterValues] No energy sample found in meter values`);
          }
        } else {
          console.warn(`⚠️ [MeterValues] No sampledValues found in meterValue[0]`);
        }
      } else {
        console.warn(`⚠️ [MeterValues] No meterValue array in payload`);
      }

      // Find active session for this device/connector/transactionId
      const transactionId = payload.transactionId;
      const connectorId = payload.connectorId || 0;
      
      console.log(`📊 [MeterValues] TransactionId: ${transactionId}, ConnectorId: ${connectorId}, EnergyWh: ${energyWh}`);
      
      if (!transactionId || energyWh === null) {
        console.warn(`⚠️ [MeterValues] Missing transactionId (${transactionId}) or energyWh (${energyWh}) - skipping session update`);
        // No transaction ID or no energy value - just publish basic notification
        await publishNotification({
          type: 'meter.values',
          data: {
            deviceId,
            chargerId,
            connectorId: connectorId,
            transactionId: transactionId,
            meterValues: payload.meterValue
          },
          recipients: []
        });
        
        // Update Redis with listManager (even without energy value)
        try {
          await listManager.push(`ocpp:list:${deviceId}`, payload);
          await listManager.trim(`ocpp:list:${deviceId}`, 200);
        } catch (redisErr) {
          console.error(`❌ [Redis] Error updating MeterValues for ${deviceId}:`, redisErr.message);
        }
        return;
      }

      // Find active charging session
      // Convert transactionId to string (database stores it as VARCHAR)
      const transactionIdStr = transactionId ? String(transactionId) : null;
      
      console.log(`📊 [MeterValues] Looking for session: deviceId=${deviceId}, connectorId=${connectorId}, transactionId=${transactionIdStr}`);
      
      // Try to find session by transactionId first, then fallback to deviceId + connectorId if transactionId doesn't match
      let session = await ChargingSession.findOne({
        where: {
          deviceId: deviceId,
          connectorId: connectorId,
          transactionId: transactionIdStr,
          status: {
            [Op.in]: ['pending', 'active']
          },
          endTime: null
        },
        include: [
          {
            model: ChargingPoint,
            as: 'chargingPoint',
            include: [
              {
                model: Tariff,
                as: 'tariff'
              }
            ]
          }
        ]
      });

      // If not found by transactionId, try without transactionId (for sessions that haven't received StartTransaction yet)
      if (!session) {
        console.log(`📊 [MeterValues] Session not found with transactionId, trying without transactionId...`);
        session = await ChargingSession.findOne({
          where: {
            deviceId: deviceId,
            connectorId: connectorId,
            status: {
              [Op.in]: ['pending', 'active']
            },
            endTime: null
          },
          include: [
            {
              model: ChargingPoint,
              as: 'chargingPoint',
              include: [
                {
                  model: Tariff,
                  as: 'tariff'
                }
              ]
            }
          ],
          order: [['createdAt', 'DESC']] // Get most recent session
        });
      }

      if (!session) {
        // No active session found - this is normal for CMS-initiated charging (no ChargingSession record created)
        // Just publish notification so UI can still display meter values
        console.log(`ℹ️ [MeterValues] No ChargingSession found for deviceId=${deviceId}, connectorId=${connectorId}, transactionId=${transactionIdStr} (likely CMS-initiated charging - this is expected)`);
        await publishNotification({
          type: 'meter.values',
          data: {
            deviceId,
            chargerId,
            connectorId: connectorId,
            transactionId: transactionId,
            meterValues: payload.meterValue,
            energyWh: energyWh
          },
          recipients: []
        });
        
        // Update Redis with listManager and updater
        try {
          await listManager.push(`ocpp:list:${deviceId}`, payload);
          await listManager.trim(`ocpp:list:${deviceId}`, 200);
          
          // Update meter value (convert Wh to kWh)
          const latestMeterValue = energyWh / 1000;
          await updater(deviceId, { meter: latestMeterValue });
        } catch (redisErr) {
          console.error(`❌ [Redis] Error updating MeterValues for ${deviceId}:`, redisErr.message);
        }
        return;
      }

      console.log(`✅ [MeterValues] Found session: ${session.sessionId}, status: ${session.status}, transactionId: ${session.transactionId}`);

      // Calculate energy consumed (convert Wh to kWh)
      let energyConsumed = 0;
      let cost = 0;

      // Update transactionId if session doesn't have it yet (from StartTransaction)
      if (!session.transactionId && transactionIdStr) {
        console.log(`📊 [MeterValues] Updating session transactionId from ${session.transactionId} to ${transactionIdStr}`);
        await session.update({ transactionId: transactionIdStr });
        await session.reload();
      }

      // Get meter start if not set
      if (!session.meterStart && session.startTime) {
        // Try to get first meter value after session start
        const ChargerData = require('../models/ChargerData');
        const firstMeterValues = await ChargerData.findOne({
          where: {
            deviceId: deviceId,
            message: 'MeterValues',
            direction: 'Incoming',
            createdAt: {
              [Op.gte]: session.startTime
            }
          },
          order: [['createdAt', 'ASC']],
          limit: 1
        });

        if (firstMeterValues && firstMeterValues.messageData && firstMeterValues.messageData.meterValue) {
          const sampledValues = firstMeterValues.messageData.meterValue[0]?.sampledValue;
          if (sampledValues && Array.isArray(sampledValues)) {
            const energySample = sampledValues.find(sample => 
              sample.measurand === 'Energy.Active.Import.Register' || 
              sample.measurand === 'energy' ||
              sample.measurand === 'Energy'
            );
            if (energySample && energySample.value) {
              await session.update({ meterStart: parseFloat(energySample.value) });
              await session.reload();
            }
          }
        }
      }

      // Calculate energy consumed
      // CRITICAL: Use meterStart from session if available, otherwise calculate from first meter value
      let actualMeterStart = session.meterStart;
      if (actualMeterStart === null && session.startTime) {
        // Try to get first meter value after session start
        const ChargerData = require('../models/ChargerData');
        const firstMeterValues = await ChargerData.findOne({
          where: {
            deviceId: deviceId,
            message: 'MeterValues',
            direction: 'Incoming',
            createdAt: {
              [Op.gte]: session.startTime
            }
          },
          order: [['createdAt', 'ASC']],
          limit: 1
        });

        if (firstMeterValues && firstMeterValues.messageData && firstMeterValues.messageData.meterValue) {
          const sampledValues = firstMeterValues.messageData.meterValue[0]?.sampledValue;
          if (sampledValues && Array.isArray(sampledValues)) {
            const energySample = sampledValues.find(sample => 
              sample.measurand === 'Energy.Active.Import.Register' || 
              sample.measurand === 'energy' ||
              sample.measurand === 'Energy'
            );
            if (energySample && energySample.value) {
              actualMeterStart = parseFloat(energySample.value);
              // Update session with meterStart if not set
              if (!session.meterStart) {
                await session.update({ meterStart: actualMeterStart });
                await session.reload();
                console.log(`📊 [MeterValues] Set meterStart to ${actualMeterStart} Wh from first MeterValues`);
              }
            }
          }
        }
      }

      if (actualMeterStart !== null && energyWh !== null && energyWh >= actualMeterStart) {
        energyConsumed = (energyWh - actualMeterStart) / 1000; // Convert Wh to kWh
        if (energyConsumed < 0) energyConsumed = 0;
        console.log(`📊 [MeterValues] Calculated energy: ${energyConsumed.toFixed(3)} kWh (${energyWh} Wh - ${actualMeterStart} Wh)`);
      } else {
        console.warn(`⚠️ [MeterValues] Cannot calculate energy: meterStart=${actualMeterStart}, energyWh=${energyWh}`);
      }

      // Calculate cost if we have tariff
      const tariff = session.chargingPoint?.tariff;
      if (energyConsumed > 0 && tariff) {
        const baseCharges = parseFloat(tariff.baseCharges || 0);
        const tax = parseFloat(tariff.tax || 0);
        
        if (baseCharges > 0) {
          const baseAmount = energyConsumed * baseCharges;
          const taxMultiplier = 1 + (tax / 100);
          const calculatedAmount = baseAmount * taxMultiplier;
          // Cap at amountDeducted - user should NEVER be charged more than prepaid
          cost = Math.min(calculatedAmount, parseFloat(session.amountDeducted || 0));
          console.log(`📊 [MeterValues] Calculated cost: ₹${cost.toFixed(2)} (from ₹${calculatedAmount.toFixed(2)}, capped at ₹${session.amountDeducted})`);
        }
      }

      // Update session with latest energy and cost
      // CRITICAL: Always update meterEnd to track latest reading, even if energyConsumed is 0
      const updateData = {
        meterEnd: energyWh // Always update meterEnd to latest reading
      };
      
      // Update energyConsumed and finalAmount if we have valid calculations
      // This ensures the session is updated in real-time for frontend polling
      if (energyConsumed > 0) {
        updateData.energyConsumed = energyConsumed;
        updateData.finalAmount = cost;
      } else if (energyConsumed === 0 && session.meterStart !== null) {
        // Even if energy is 0, update to show we're tracking (prevents full refund if meter is updating)
        updateData.energyConsumed = 0;
        updateData.finalAmount = 0;
      }
      
      await session.update(updateData);
      
      // Reload session to get latest values
      await session.reload();

      console.log(`✅ [MeterValues] Updated session ${session.sessionId}:`);
      console.log(`   - Energy: ${energyConsumed.toFixed(3)} kWh`);
      console.log(`   - Cost: ₹${cost.toFixed(2)}`);
      console.log(`   - MeterEnd: ${energyWh} Wh`);
      console.log(`   - MeterStart: ${session.meterStart} Wh`);
      
      // Publish notification for real-time frontend updates
      try {
        await publishNotification({
          type: 'meter.values.updated',
          data: {
            sessionId: session.sessionId,
            deviceId: deviceId,
            connectorId: connectorId,
            transactionId: transactionId,
            energyConsumed: energyConsumed,
            cost: cost,
            energyWh: energyWh,
            meterStart: session.meterStart,
            meterEnd: energyWh
          },
          recipients: [session.customerId]
        });
        console.log(`📤 [MeterValues] Published notification for session ${session.sessionId} to customer ${session.customerId}`);
      } catch (notifError) {
        console.warn(`⚠️ [MeterValues] Failed to publish notification:`, notifError.message);
      }

      // Update cost separately (it's calculated, not stored directly in some schemas)
      if (session.rawAttributes && (session.rawAttributes.cost || session.rawAttributes.finalAmount)) {
        await session.update({ 
          cost: cost,
          finalAmount: cost 
        });
      }

      // Publish notification with session data for real-time updates
      await publishNotification({
        type: 'meter.values',
        data: {
          sessionId: session.sessionId,
          customerId: session.customerId,
          deviceId: deviceId,
          chargerId: chargerId,
          connectorId: payload.connectorId,
          transactionId: transactionId,
          energyConsumed: energyConsumed,
          cost: cost,
          meterStart: session.meterStart,
          meterEnd: energyWh,
          timestamp: new Date()
        },
        recipients: session.customerId ? [session.customerId] : []
      });

      // Also publish as session.energy.updated for compatibility
      await publishNotification({
        type: 'session.energy.updated',
        data: {
          sessionId: session.sessionId,
          customerId: session.customerId,
          deviceId: deviceId,
          connectorId: payload.connectorId,
          transactionId: transactionId,
          energyConsumed: energyConsumed,
          cost: cost,
          timestamp: new Date()
        },
        recipients: session.customerId ? [session.customerId] : []
      });
      
      // Update Redis with listManager and updater
      try {
        // Push to OCPP list and trim
        await listManager.push(`ocpp:list:${deviceId}`, payload);
        await listManager.trim(`ocpp:list:${deviceId}`, 200);
        
        // Update meter value (convert Wh to kWh)
        const latestMeterValue = energyWh / 1000;
        await updater(deviceId, { meter: latestMeterValue });
      } catch (redisErr) {
        console.error(`❌ [Redis] Error updating MeterValues for ${deviceId}:`, redisErr.message);
      }
    } catch (error) {
      console.error(`❌ Error handling MeterValues:`, error.message);
      console.error(error.stack);
    }
  }
}

// Create singleton instance
let processorInstance = null;

/**
 * Get or create OCPP message processor instance
 */
function getOCPPMessageProcessor() {
  if (!processorInstance) {
    processorInstance = new OCPPMessageProcessor();
  }
  return processorInstance;
}

/**
 * Start OCPP message processor
 */
async function startOCPPMessageProcessor() {
  try {
    const processor = getOCPPMessageProcessor();
    await processor.start();
    console.log('✅ OCPP Message Processor started');
    return processor;
  } catch (error) {
    console.error('❌ Failed to start OCPP Message Processor:', error.message);
    throw error;
  }
}

/**
 * Stop OCPP message processor
 */
async function stopOCPPMessageProcessor() {
  try {
    if (processorInstance) {
      await processorInstance.stop();
      processorInstance = null;
      console.log('✅ OCPP Message Processor stopped');
    }
  } catch (error) {
    console.error('❌ Error stopping OCPP Message Processor:', error.message);
  }
}

module.exports = {
  OCPPMessageProcessor,
  getOCPPMessageProcessor,
  startOCPPMessageProcessor,
  stopOCPPMessageProcessor
};

