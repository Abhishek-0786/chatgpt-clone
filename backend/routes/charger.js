const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');
const ChargingSession = require('../models/ChargingSession');
const ChargingPoint = require('../models/ChargingPoint');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { sendOcppCall, connections } = require('../libs/websocket_client');
const chargerController = require('../controllers/chargerController');
const walletService = require('../services/walletService');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishChargingCommand = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../libs/rabbitmq/producer');
    publishChargingCommand = producer.publishChargingCommand;
    console.log('✅ [RABBITMQ] Charger routes configured to use RabbitMQ for command publishing');
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
} else {
  console.log('ℹ️ [LEGACY] Charger routes using direct processing (ENABLE_RABBITMQ=false)');
}

// Test endpoint to check file
router.get('/test-file', chargerController.testFile);

// Import data from JSON file
router.get('/sync', chargerController.syncData);

// Get charger data with pagination and filtering
router.get('/data', chargerController.getChargerData);

// Get charger metadata
router.get('/chargers', chargerController.getAllChargers);

// Get specific charger data (legacy endpoint - uses same filtering as /data)
router.get('/data/:deviceId', chargerController.getChargerDataByDevice);

// Get full log details by ID
router.get('/data/log/:logId', chargerController.getLogById);

// Danger: purge all chargers except a specific deviceId (local cleanup helper)
// Usage: DELETE /api/charger/purge?except=DEVICE_ID&confirm=YES
router.delete('/purge', chargerController.purgeChargers);

// In-memory map to track recent RemoteStartTransaction requests (prevent duplicates)
const recentRemoteStartRequests = new Map(); // deviceId -> timestamp

// Remote Start Transaction
router.post('/remote-start', async (req, res) => {
  try {
    const { deviceId, connectorId, idTag } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }
    
    if (connectorId === undefined || connectorId === null) {
      return res.status(400).json({
        success: false,
        error: 'connectorId is required'
      });
    }
    
    if (!idTag) {
      return res.status(400).json({
        success: false,
        error: 'idTag is required'
      });
    }
    
    // Find charger
    const charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: { exclude: ['chargerStatus'] }
    });
    
    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }
    
    // Check if charger is connected
    const ws = await connections.get(deviceId);
    if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
      return res.status(400).json({
        success: false,
        error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
      });
    }
    
    // CRITICAL: Check if charger is already charging (has active transaction) - CHECK THIS FIRST!
    // This prevents sending RemoteStartTransaction if charging is already active
    // This is the main protection against periodic/automatic retry requests
    try {
      // Check for any active StartTransaction (not stopped) - look back 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      
      const recentData = await ChargerData.findAll({
        where: { 
          deviceId: deviceId,
          createdAt: {
            [Op.gte]: tenMinutesAgo
          }
        },
        order: [['id', 'DESC']],
        limit: 200
      });
      
      // Find latest StartTransaction
      const startTransactions = recentData.filter(log => 
        log.message === 'StartTransaction' && log.direction === 'Incoming'
      );
      
      if (startTransactions.length > 0) {
        // Get latest StartTransaction (by timestamp, then ID)
        const latestStart = startTransactions.reduce((latest, current) => {
          const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
          const currentTime = new Date(current.timestamp || current.createdAt).getTime();
          if (currentTime > latestTime) return current;
          if (currentTime < latestTime) return latest;
          return (current.id || 0) > (latest.id || 0) ? current : latest;
        });
        
        // Get transactionId from StartTransaction response
        const startResponse = recentData.find(log => 
          log.message === 'Response' && 
          log.messageId === latestStart.messageId &&
          log.direction === 'Outgoing'
        );
        
        let transactionId = null;
        if (startResponse) {
          if (startResponse.messageData && startResponse.messageData.transactionId) {
            transactionId = startResponse.messageData.transactionId;
          } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
            transactionId = startResponse.raw[2].transactionId;
          }
        }
        
        if (transactionId) {
          // Check if there's a StopTransaction for this transactionId
          const stopTransaction = recentData.find(log => 
            log.message === 'StopTransaction' && 
            log.direction === 'Incoming' &&
            (
              (log.messageData && log.messageData.transactionId === transactionId) || 
              (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
            )
          );
          
          // If no StopTransaction found, charging is still active - BLOCK the request
          if (!stopTransaction) {
            const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
            const timeSinceStart = Math.round((Date.now() - startTime) / 1000);
            console.warn(`⚠️ [BLOCKED] RemoteStartTransaction request for ${deviceId} rejected - charger is already charging (Transaction ${transactionId}, started ${timeSinceStart}s ago)`);
            
            // Don't record this in rate limit map - it's a different error (already charging)
            // Just return the error directly
            return res.status(400).json({
              success: false,
              error: `Charger ${deviceId} is already charging (Transaction ${transactionId}). Please stop the current charging session first.`
            });
          }
        }
      }
    } catch (checkError) {
      // If check fails, log warning but continue (don't block the request)
      console.warn(`⚠️ Error checking active transaction for ${deviceId}:`, checkError.message);
    }
    
    // CRITICAL: Check if a RemoteStartTransaction was already sent for this device recently
    // This prevents duplicate API calls from creating multiple RemoteStartTransaction commands
    // BUT only if charging is NOT already active (checked above)
    // ALSO: If charging has stopped (no active transaction), clear the rate limit to allow new requests
    const lastRequestTime = recentRemoteStartRequests.get(deviceId);
    if (lastRequestTime) {
      const timeSinceLastRequest = Date.now() - lastRequestTime;
      // Increased to 2 minutes to prevent periodic requests during charging
      if (timeSinceLastRequest < 120000) { // 2 minutes (was 5 seconds)
        // IMPORTANT: Double-check if charging has actually stopped (StopTransaction exists)
        // If charging has stopped, clear rate limit and allow the request
        try {
          const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
          const recentData = await ChargerData.findAll({
            where: { 
              deviceId: deviceId,
              createdAt: {
                [Op.gte]: tenMinutesAgo
              }
            },
            order: [['id', 'DESC']],
            limit: 200
          });
          
          const startTransactions = recentData.filter(log => 
            log.message === 'StartTransaction' && log.direction === 'Incoming'
          );
          
          let hasActiveTransaction = false;
          if (startTransactions.length > 0) {
            const latestStart = startTransactions.reduce((latest, current) => {
              const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
              const currentTime = new Date(current.timestamp || current.createdAt).getTime();
              if (currentTime > latestTime) return current;
              if (currentTime < latestTime) return latest;
              return (current.id || 0) > (latest.id || 0) ? current : latest;
            });
            
            const startResponse = recentData.find(log => 
              log.message === 'Response' && 
              log.messageId === latestStart.messageId &&
              log.direction === 'Outgoing'
            );
            
            let transactionId = null;
            if (startResponse) {
              if (startResponse.messageData && startResponse.messageData.transactionId) {
                transactionId = startResponse.messageData.transactionId;
              } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
                transactionId = startResponse.raw[2].transactionId;
              }
            }
            
            if (transactionId) {
              const stopTransaction = recentData.find(log => 
                log.message === 'StopTransaction' && 
                log.direction === 'Incoming' &&
                (
                  (log.messageData && log.messageData.transactionId === transactionId) || 
                  (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
                )
              );
              
              // If no StopTransaction found, charging is still active
              if (!stopTransaction) {
                hasActiveTransaction = true;
              }
            }
          }
          
          // If charging has stopped (no active transaction), clear rate limit and allow request
          if (!hasActiveTransaction) {
            console.log(`✅ [RATE LIMIT] Charging stopped for ${deviceId}, clearing rate limit to allow new request`);
            recentRemoteStartRequests.delete(deviceId);
            // Continue to allow the request - don't block it
          } else {
            // Charging still active - block the request
            const minutesLeft = Math.ceil((120000 - timeSinceLastRequest) / 60000);
            console.warn(`⚠️ [DUPLICATE PREVENTED] RemoteStartTransaction request for ${deviceId} rejected - duplicate request within 2 minutes (${minutesLeft} minute(s) ago) while charging is active`);
            return res.status(429).json({
              success: false,
              error: `A RemoteStartTransaction request was already sent for ${deviceId} recently. Please wait ${minutesLeft} minute(s) before trying again.`
            });
          }
        } catch (rateLimitCheckError) {
          // If check fails, apply rate limit (safer to block than allow)
          console.warn(`⚠️ Error checking active transaction for rate limit: ${rateLimitCheckError.message}`);
          const minutesLeft = Math.ceil((120000 - timeSinceLastRequest) / 60000);
          console.warn(`⚠️ [DUPLICATE PREVENTED] RemoteStartTransaction request for ${deviceId} rejected - duplicate request within 2 minutes (${minutesLeft} minute(s) ago)`);
          return res.status(429).json({
            success: false,
            error: `A RemoteStartTransaction request was already sent for ${deviceId} recently. Please wait ${minutesLeft} minute(s) before trying again.`
          });
        }
      }
    }
    
    // Record this request (will be cleared after 2 minutes automatically)
    recentRemoteStartRequests.set(deviceId, Date.now());
    // Auto-cleanup after 2 minutes
    setTimeout(() => {
      recentRemoteStartRequests.delete(deviceId);
    }, 120000); // 2 minutes
    
    // Send RemoteStartTransaction
    try {
      const payload = {
        idTag: idTag,
        connectorId: connectorId
      };
      
      // Increase timeout to 60 seconds for live chargers (they may respond slower)
      const response = await sendOcppCall(deviceId, 'RemoteStartTransaction', payload, 60000);
      
      if (response.status === 'Accepted') {
        // Publish command to RabbitMQ for auditing (if enabled)
        if (ENABLE_RABBITMQ && publishChargingCommand) {
          try {
            await publishChargingCommand({
              deviceId: deviceId,
              command: 'RemoteStartTransaction',
              payload: payload,
              timestamp: new Date(),
              sentViaWebSocket: true
            });
            console.log(`📤 [RABBITMQ] Published RemoteStartTransaction command for ${deviceId}`);
          } catch (rabbitmqError) {
            console.warn('⚠️ [RABBITMQ] Failed to publish RemoteStartTransaction command:', rabbitmqError.message);
            // Don't fail the request if RabbitMQ fails
          }
        }

        res.json({
          success: true,
          message: 'Remote start transaction sent successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: `Remote start transaction rejected: ${response.status}`
        });
      }
    } catch (error) {
      // Check if error is due to connection
      if (error.message && error.message.includes('not connected')) {
        console.error('❌ Error sending RemoteStartTransaction:', error);
        return res.status(400).json({
          success: false,
          error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
        });
      }
      
      // Check if error is due to timeout
      if (error.message && error.message.includes('timeout')) {
        // Timeout is expected for slow chargers - log as warning, not error
        console.warn(`⚠️ RemoteStartTransaction timeout for ${deviceId} (60s). Charging may still start.`);
        return res.status(408).json({
          success: false,
          error: `Charger ${deviceId} did not respond within 60 seconds. The charger may be offline, busy, or experiencing communication issues. Note: Charging may still start even if this timeout occurs.`
        });
      }
      
      // Other errors - log as error
      console.error('❌ Error sending RemoteStartTransaction:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send remote start transaction'
      });
    }
    
  } catch (error) {
    console.error('❌ Error in remote-start endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process remote start request',
      details: error.message
    });
  }
});

// Remote Stop Transaction
router.post('/remote-stop', async (req, res) => {
  try {
    const { deviceId, transactionId } = req.body;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }
    
    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'transactionId is required'
      });
    }
    
    // Find charger
    const charger = await Charger.findOne({
      where: { deviceId: deviceId },
      attributes: { exclude: ['chargerStatus'] }
    });
    
    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }
    
    // Check if charger is connected
    const ws = await connections.get(deviceId);
    if (!ws || ws.readyState !== 1) { // WebSocket.OPEN = 1
      return res.status(400).json({
        success: false,
        error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
      });
    }
    
    // Send RemoteStopTransaction
    try {
      const payload = {
        transactionId: transactionId
      };
      
      // Increase timeout to 60 seconds for live chargers (they may respond slower)
      const response = await sendOcppCall(deviceId, 'RemoteStopTransaction', payload, 60000);
      
      if (response.status === 'Accepted') {
        // Publish command to RabbitMQ for auditing (if enabled)
        if (ENABLE_RABBITMQ && publishChargingCommand) {
          try {
            await publishChargingCommand({
              deviceId: deviceId,
              command: 'RemoteStopTransaction',
              payload: payload,
              timestamp: new Date(),
              sentViaWebSocket: true
            });
            console.log(`📤 [RABBITMQ] Published RemoteStopTransaction command for ${deviceId}`);
          } catch (rabbitmqError) {
            console.warn('⚠️ [RABBITMQ] Failed to publish RemoteStopTransaction command:', rabbitmqError.message);
            // Don't fail the request if RabbitMQ fails
          }
        }

        // CRITICAL: Clear rate limit when charging stops successfully
        // This allows user to start charging again immediately after stopping
        if (recentRemoteStartRequests.has(deviceId)) {
          console.log(`✅ [RATE LIMIT] Charging stopped for ${deviceId}, clearing rate limit to allow new request`);
          recentRemoteStartRequests.delete(deviceId);
        }
        
        // Update ChargingSession when stopped from CMS
        // Check if there are any active sessions for this deviceId and update them
        try {
          const activeSessions = await ChargingSession.findAll({
            where: {
              deviceId: deviceId,
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
                    model: require('../models/Tariff'),
                    as: 'tariff'
                  }
                ]
              }
            ],
            order: [['createdAt', 'DESC']]
          });
          
          if (activeSessions.length > 0) {
            // Process each active session with refund calculation
            for (const session of activeSessions) {
              // Get tariff for cost calculation
              const tariff = session.chargingPoint?.tariff;
              const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
              const tax = tariff ? parseFloat(tariff.tax) : 0;

              // Get meter readings
              let meterStart = session.meterStart;
              let meterEnd = null;
              let energyConsumed = 0;

              // Get meter_start if not set
              if (!meterStart && session.startTime) {
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

                if (firstMeterValues) {
                  meterStart = extractMeterValue(firstMeterValues);
                }
              }

              // Wait a bit for final meter readings after stop
              await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds

              // Get latest meter reading
              const lastMeterValues = await ChargerData.findOne({
                where: {
                  deviceId: deviceId,
                  message: 'MeterValues',
                  direction: 'Incoming',
                  createdAt: {
                    [Op.gte]: session.startTime || new Date(Date.now() - 24 * 60 * 60 * 1000)
                  }
                },
                order: [['createdAt', 'DESC']],
                limit: 1
              });

              if (lastMeterValues) {
                meterEnd = extractMeterValue(lastMeterValues);
              }

              // Calculate energy consumed
              if (meterStart !== null && meterEnd !== null && meterEnd >= meterStart) {
                energyConsumed = (meterEnd - meterStart) / 1000; // Convert Wh to kWh
                if (energyConsumed < 0) energyConsumed = 0;
              }

              // Calculate final amount
              let calculatedAmount = 0;
              if (energyConsumed > 0 && baseCharges > 0) {
                const baseAmount = energyConsumed * baseCharges;
                const taxMultiplier = 1 + (tax / 100);
                calculatedAmount = baseAmount * taxMultiplier;
              }

              // Cap finalAmount at amountDeducted
              const amountDeducted = parseFloat(session.amountDeducted);
              let finalAmount = Math.min(calculatedAmount, amountDeducted);

              // Calculate refund
              let refundAmount = 0;
              if (energyConsumed > 0 && calculatedAmount > 0) {
                if (finalAmount < amountDeducted) {
                  refundAmount = amountDeducted - finalAmount;
                }
              } else if (energyConsumed === 0) {
                // No energy consumed - refund full amount
                refundAmount = amountDeducted;
              }

              // Update session with all calculated values
              await session.update({
                status: 'stopped',
                endTime: new Date(),
                stopReason: 'Remote (CMS)',
                energyConsumed: energyConsumed,
                finalAmount: finalAmount,
                refundAmount: refundAmount,
                meterStart: meterStart,
                meterEnd: meterEnd
              });

              console.log(`✅ [Remote Stop] Updated session ${session.sessionId} - Energy: ${energyConsumed.toFixed(3)} kWh, Final: ₹${finalAmount.toFixed(2)}, Refund: ₹${refundAmount.toFixed(2)}`);

              // Update wallet if refund is needed
              if (refundAmount > 0 && session.customerId) {
                try {
                  // Check if refund transaction already exists for this session to prevent duplicates
                  const existingRefund = await WalletTransaction.findOne({
                    where: {
                      customerId: session.customerId,
                      referenceId: session.sessionId,
                      transactionType: 'refund',
                      transactionCategory: 'refund'
                    }
                  });

                  if (!existingRefund) {
                    const description = `Refund - Charging Session ${session.sessionId} (Energy: ${energyConsumed.toFixed(2)} kWh, Used: ₹${finalAmount.toFixed(2)}, Refunded: ₹${refundAmount.toFixed(2)})`;
                    const result = await walletService.refundWallet(session.customerId, refundAmount, description, session.sessionId);
                    console.log(`✅ [Remote Stop] Wallet refund processed: ₹${refundAmount} (Balance: ₹${result.transaction.balanceAfter})`);
                  } else {
                    console.log(`✅ [Remote Stop] Refund transaction already exists for session ${session.sessionId}, skipping duplicate`);
                  }
                } catch (walletError) {
                  console.error('⚠️ [Remote Stop] Error updating wallet:', walletError);
                }
              }
            }
          } else {
            console.log(`⚠️ [Remote Stop] No active sessions found for deviceId: ${deviceId}`);
          }
        } catch (sessionError) {
          // Log error but don't fail the request - charger stop was successful
          console.error('⚠️ [Remote Stop] Error updating sessions:', sessionError);
        }
        
        res.json({
          success: true,
          message: 'Remote stop transaction sent successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: `Remote stop transaction rejected: ${response.status}`
        });
      }
    } catch (error) {
      // Check if error is due to connection
      if (error.message && error.message.includes('not connected')) {
        console.error('❌ Error sending RemoteStopTransaction:', error);
        return res.status(400).json({
          success: false,
          error: `Charger ${deviceId} is not connected. Please ensure the charger is online and connected via WebSocket.`
        });
      }
      
      // Check if error is due to timeout
      if (error.message && error.message.includes('timeout')) {
        // Timeout is expected for slow chargers - log as warning, not error
        console.warn(`⚠️ RemoteStopTransaction timeout for ${deviceId} (60s). Charging may still stop.`);
        return res.status(408).json({
          success: false,
          error: `Charger ${deviceId} did not respond within 60 seconds. The charger may be offline, busy, or experiencing communication issues. Note: Charging may still stop even if this timeout occurs.`
        });
      }
      
      // Other errors - log as error
      console.error('❌ Error sending RemoteStopTransaction:', error);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send remote stop transaction'
      });
    }
    
  } catch (error) {
    console.error('❌ Error in remote-stop endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process remote stop request',
      details: error.message
    });
  }
});

// ============================================
// API Endpoints for WebSocket Service
// ============================================

/**
 * Get charger by device ID
 * GET /api/charger/by-device/:deviceId
 */
router.get('/by-device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const charger = await Charger.findOne({
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create or update charger (ensure exists)
 * POST /api/charger/ensure
 */
router.post('/ensure', async (req, res) => {
  try {
    const { deviceId, ...chargerData } = req.body;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required'
      });
    }

    // Remove chargerStatus from data if present (column doesn't exist)
    delete chargerData.chargerStatus;

    let charger = await Charger.findOne({ 
      where: { deviceId }
      // defaultScope will automatically exclude chargerStatus
    });

    if (charger) {
      // Update existing charger - only update valid fields
      const validFields = ['name', 'location', 'vendor', 'model', 'serialNumber', 'firmwareVersion', 
                          'meterSerialNumber', 'connectorCount', 'powerRating', 'voltage', 'current', 
                          'energyConsumption', 'status', 'errorCode', 'vendorId', 'installationDate', 'lastSeen'];
      const updateData = {};
      for (const field of validFields) {
        if (chargerData[field] !== undefined) {
          updateData[field] = chargerData[field];
        }
      }
      if (Object.keys(updateData).length > 0) {
        await charger.update(updateData);
        await charger.reload(); // Reload to get updated data
      }
    } else {
      // Create new charger with default values
      const defaultData = {
        deviceId,
        name: chargerData.name || deviceId,
        status: chargerData.status || 'Available',
        vendor: chargerData.vendor || 'Unknown',
        model: chargerData.model || 'Unknown',
        serialNumber: chargerData.serialNumber || 'Unknown',
        firmwareVersion: chargerData.firmwareVersion || 'Unknown',
        connectorCount: chargerData.connectorCount || 0,
        powerRating: chargerData.powerRating || 0
      };
      
      // Add optional fields if provided
      if (chargerData.location) defaultData.location = chargerData.location;
      if (chargerData.meterSerialNumber) defaultData.meterSerialNumber = chargerData.meterSerialNumber;
      if (chargerData.voltage) defaultData.voltage = chargerData.voltage;
      if (chargerData.current) defaultData.current = chargerData.current;
      if (chargerData.energyConsumption) defaultData.energyConsumption = chargerData.energyConsumption;
      if (chargerData.errorCode) defaultData.errorCode = chargerData.errorCode;
      if (chargerData.vendorId) defaultData.vendorId = chargerData.vendorId;
      if (chargerData.installationDate) defaultData.installationDate = chargerData.installationDate;
      if (chargerData.lastSeen) defaultData.lastSeen = chargerData.lastSeen;
      
      charger = await Charger.create(defaultData);
    }

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    console.error('❌ Error in /api/charger/ensure:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Update charger status
 * PATCH /api/charger/:deviceId/status
 */
router.patch('/:deviceId/status', async (req, res) => {
  try {
    const { deviceId } = req.params;
    let { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'status is required'
      });
    }

    // Map 'online'/'offline' to valid ENUM values
    const statusMap = {
      'online': 'Available',
      'offline': 'Unavailable',
      'connected': 'Available',
      'disconnected': 'Unavailable'
    };
    
    if (statusMap[status]) {
      status = statusMap[status];
    }

    // Validate status is one of the allowed values
    const validStatuses = ['Available', 'Charging', 'Occupied', 'Unavailable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const charger = await Charger.findOne({ 
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    await charger.update({ status });

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    console.error('❌ Error updating charger status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update charger last seen timestamp
 * PATCH /api/charger/:deviceId/last-seen
 */
router.patch('/:deviceId/last-seen', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const charger = await Charger.findOne({ 
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    await charger.update({ lastSeen: new Date() });

    res.json({
      success: true,
      charger
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get active sessions for charger
 * GET /api/charger/:deviceId/active-sessions
 */
router.get('/:deviceId/active-sessions', async (req, res) => {
  try {
    const { deviceId } = req.params;

    const sessions = await ChargingSession.findAll({
      where: {
        deviceId,
        status: {
          [Op.in]: ['pending', 'active']
        },
        endTime: null // Only get sessions that haven't ended
      },
      attributes: ['id', 'deviceId', 'connectorId', 'transactionId', 'status', 'startTime', 'endTime', 'createdAt', 'updatedAt'],
      include: [
        {
          model: ChargingPoint,
          as: 'chargingPoint',
          attributes: ['id', 'chargingPointId', 'deviceId', 'deviceName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Store OCPP message
 * POST /api/charger/:deviceId/ocpp-message
 */
router.post('/:deviceId/ocpp-message', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const messageData = req.body;

    const charger = await Charger.findOne({ 
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] } // Exclude if column doesn't exist
    });

    if (!charger) {
      return res.status(404).json({
        success: false,
        error: 'Charger not found'
      });
    }

    // Store message in ChargerData
    // Extract fields from messageData (which may be nested)
    const type = messageData.type || 'OCPP';
    const message = messageData.message || messageData.messageType || messageData.action || 'Unknown';
    const direction = messageData.direction || 'Incoming';
    const connectorId = messageData.connectorId || 0;
    const messageId = messageData.messageId || messageData.id || null;
    const payload = messageData.messageData || messageData.payload || messageData;
    const raw = messageData.raw || null;
    const timestamp = messageData.timestamp ? new Date(messageData.timestamp) : new Date();

    await ChargerData.create({
      chargerId: charger.id,
      deviceId,
      type: type,
      connectorId: connectorId,
      messageId: messageId,
      message: message,
      messageData: payload,
      raw: raw,
      direction: direction,
      timestamp: timestamp
    });

    res.json({
      success: true,
      message: 'OCPP message stored successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
