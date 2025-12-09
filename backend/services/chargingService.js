const { ChargingSession, ChargingPoint, Tariff, Vehicle, Wallet, WalletTransaction, ChargerData, Station, Customer } = require('../models');
const { Op } = require('sequelize');
const axios = require('axios');
const { extractMeterValue } = require('../libs/ocpp');
const { generateSessionId } = require('../libs/chargingHelpers');
const { getOrCreateWallet, debitWallet, creditWallet } = require('./walletService');

// RabbitMQ producer (optional - only if enabled)
const ENABLE_RABBITMQ = process.env.ENABLE_RABBITMQ === 'true';
let publishChargingEvent = null;
let publishNotification = null;
let publishChargingCommand = null;
if (ENABLE_RABBITMQ) {
  try {
    const producer = require('../libs/rabbitmq/producer');
    publishChargingEvent = producer.publishChargingEvent;
    publishNotification = producer.publishNotification;
    publishChargingCommand = producer.publishChargingCommand;
  } catch (error) {
    console.warn('⚠️ RabbitMQ producer not available:', error.message);
  }
}

/**
 * Get or create system customer for CMS operations
 * @returns {Promise<number>} - System customer ID
 */
async function getOrCreateSystemCustomer() {
  try {
    // Try to find existing system customer
    let systemCustomer = await Customer.findOne({
      where: {
        email: 'system@cms.admin'
      }
    });

    if (!systemCustomer) {
      // Create system customer if it doesn't exist
      systemCustomer = await Customer.create({
        fullName: 'CMS System',
        email: 'system@cms.admin',
        phone: '0000000000',
        password: 'system_password_not_used' // Password won't be used for CMS operations
      });
      console.log(`✅ [CMS] Created system customer with ID ${systemCustomer.id} for CMS operations`);
    }

    return systemCustomer.id;
  } catch (error) {
    console.error('❌ [CMS] Error getting/creating system customer:', error.message);
    throw new Error('Failed to get system customer for CMS operations');
  }
}

/**
 * Start charging session
 * @param {Object} params - Charging parameters
 * @param {number|null} params.customerId - Customer ID (null for CMS/admin)
 * @param {string} params.deviceId - Charger device ID
 * @param {number} params.connectorId - Connector ID
 * @param {number} params.amount - Amount to deduct (required for customer, optional for CMS)
 * @param {string|null} params.chargingPointId - Charging point ID string
 * @param {number|null} params.vehicleId - Vehicle ID (optional)
 * @param {string|null} params.idTag - OCPP idTag (defaults to CUSTOMER_{customerId} or CMS_ADMIN)
 * @returns {Promise<Object>} - Session data
 */
async function startChargingSession(params) {
  const {
    customerId,
    deviceId,
    connectorId,
    amount,
    chargingPointId = null,
    vehicleId = null,
    idTag = null
  } = params;

  const connectorIdInt = parseInt(connectorId);
  const amountValue = customerId ? parseFloat(amount) : (parseFloat(amount) || 0);

  // Validate vehicleId if provided (customer only)
  let vehicleDbId = null;
  if (customerId && vehicleId) {
    const vehicleIdInt = parseInt(vehicleId);
    if (isNaN(vehicleIdInt)) {
      throw new Error('Invalid vehicle ID');
    }

    const vehicle = await Vehicle.findOne({
      where: {
        id: vehicleIdInt,
        customerId: customerId
      }
    });

    if (!vehicle) {
      throw new Error('Vehicle not found or does not belong to you');
    }

    vehicleDbId = vehicleIdInt;
  }

  // For customer: validate wallet and deduct amount
  let wallet = null;
  let walletTransaction = null;
  let chargingSession = null;

  if (customerId) {
    // Get or create wallet
    wallet = await getOrCreateWallet(customerId);
    const currentBalance = parseFloat(wallet.balance);

    // Check wallet balance
    if (amountValue > currentBalance) {
      throw new Error(`Amount (₹${amountValue.toFixed(2)}) cannot exceed wallet balance (₹${currentBalance.toFixed(2)}). Please enter a lower amount or top up your wallet.`);
    }

    // Check if charger/connector is already in use by another customer
    const activeSessionOnCharger = await ChargingSession.findOne({
      where: {
        deviceId: deviceId,
        connectorId: connectorIdInt,
        status: {
          [Op.in]: ['pending', 'active']
        },
        endTime: null,
        customerId: {
          [Op.ne]: customerId // Exclude current customer's sessions
        }
      }
    });

    if (activeSessionOnCharger) {
      throw new Error('This charger connector is currently in use by another customer. Please try a different connector or wait for the current session to end.');
    }

    // Generate unique session ID
    const sessionId = generateSessionId();

    // Deduct amount from wallet using walletService
    const debitResult = await debitWallet(customerId, amountValue, `Charging Session - Device ${deviceId}`, sessionId);
    walletTransaction = await WalletTransaction.findOne({
      where: {
        id: debitResult.transaction.id
      }
    });

    // Look up ChargingPoint by chargingPointId string to get the integer id
    let chargingPointDbId = null;
    if (chargingPointId) {
      const chargingPoint = await ChargingPoint.findOne({
        where: { chargingPointId: chargingPointId },
        attributes: ['id']
      });
      if (chargingPoint) {
        chargingPointDbId = chargingPoint.id;
      }
    }

    // Create charging session record
    chargingSession = await ChargingSession.create({
      customerId: customerId,
      vehicleId: vehicleDbId,
      chargingPointId: chargingPointDbId,
      deviceId: deviceId,
      connectorId: connectorIdInt,
      sessionId: sessionId,
      transactionId: null,
      status: 'pending',
      amountRequested: amountValue,
      amountDeducted: amountValue,
      energyConsumed: null,
      finalAmount: null,
      refundAmount: null,
      meterStart: null,
      meterEnd: null,
      startTime: null,
      endTime: null,
      stopReason: null
    });
  } else {
    // CMS/admin: Check for existing active session on this charger/connector
    const existingSession = await ChargingSession.findOne({
      where: {
        deviceId: deviceId,
        connectorId: connectorIdInt,
        status: {
          [Op.in]: ['pending', 'active']
        },
        endTime: null
      }
    });

    if (existingSession) {
      throw new Error(`Charging is already active on connector ${connectorIdInt} of charger ${deviceId}. Please stop the current session before starting a new one.`);
    }

    // CMS: Create charging session record (required for charging-responses-consumer to publish events)
    const sessionId = generateSessionId();
    
    // Get or create system customer for CMS operations (required for foreign key constraint)
    const systemCustomerId = await getOrCreateSystemCustomer();
    
    // Look up ChargingPoint by chargingPointId string to get the integer id (if provided)
    let chargingPointDbId = null;
    if (chargingPointId) {
      const chargingPoint = await ChargingPoint.findOne({
        where: { chargingPointId: chargingPointId },
        attributes: ['id']
      });
      if (chargingPoint) {
        chargingPointDbId = chargingPoint.id;
      }
    }

    // Create CMS charging session record
    // Note: Using system customer ID for CMS sessions (database foreign key constraint requires valid customer)
    // Code checks for customerId === systemCustomerId OR customerId === null to identify CMS sessions
    chargingSession = await ChargingSession.create({
      customerId: systemCustomerId, // CMS session - using system customer (database foreign key constraint)
      vehicleId: null, // CMS session - no vehicle
      chargingPointId: chargingPointDbId,
      deviceId: deviceId,
      connectorId: connectorIdInt,
      sessionId: sessionId,
      transactionId: null,
      status: 'pending', // Will be updated to 'active' when charger confirms
      amountRequested: 0, // CMS session - no amount requested
      amountDeducted: 0, // CMS session - no wallet deduction
      energyConsumed: null,
      finalAmount: null,
      refundAmount: null,
      meterStart: null,
      meterEnd: null,
      startTime: null,
      endTime: null,
      stopReason: null
    });

    console.log(`✅ [CMS] Created charging session ${sessionId} for device ${deviceId}, connector ${connectorIdInt}`);
  }

  // Determine idTag and ensure sessionId is set
  const idTagValue = idTag || (customerId ? `CUSTOMER_${customerId}` : 'CMS_ADMIN');
  // sessionId is already set from chargingSession creation above
  const sessionId = chargingSession.sessionId;

  // Queue-based microservice flow: Publish remote start command to queue
  let useQueueFlow = ENABLE_RABBITMQ && publishChargingCommand;

  if (useQueueFlow) {
    console.log(`📤 [Queue] Publishing remote start command for session ${sessionId}`);

    try {
      const commandPublished = await publishChargingCommand({
        command: 'RemoteStartTransaction',
        deviceId: deviceId,
        payload: {
          connectorId: connectorIdInt,
          idTag: idTagValue
        },
        sessionId: sessionId,
        customerId: customerId,
        connectorId: connectorIdInt,
        idTag: idTagValue,
        transactionId: null,
        timestamp: new Date(),
        useQueueFlow: true
      });

      if (commandPublished) {
        console.log(`✅ [Queue] Remote start command published for session ${sessionId}`);
        
        // For customer: return session data
        if (customerId && chargingSession) {
          return {
            success: true,
            message: 'Charging session started. Waiting for charger confirmation...',
            session: {
              id: chargingSession.id,
              sessionId: chargingSession.sessionId,
              status: 'pending',
              deviceId: deviceId,
              connectorId: connectorIdInt,
              amountDeducted: amountValue
            },
            useQueueFlow: true
          };
        } else {
          // CMS: return session data (now includes session record)
          return {
            success: true,
            message: 'Charging session started. Waiting for charger confirmation...',
            session: {
              id: chargingSession.id,
              sessionId: chargingSession.sessionId,
              status: 'pending',
              deviceId: deviceId,
              connectorId: connectorIdInt,
              amountDeducted: 0
            },
            useQueueFlow: true
          };
        }
      } else {
        console.warn(`⚠️ [Queue] Failed to publish remote start command, falling back to direct call`);
        useQueueFlow = false;
      }
    } catch (queueError) {
      console.error(`❌ [Queue] Error publishing remote start command:`, queueError.message);
      console.warn(`⚠️ [Queue] Falling back to direct call`);
      useQueueFlow = false;
    }
  }

  // FALLBACK: Direct API call (legacy flow)
  if (!useQueueFlow) {
    console.log(`🔄 [FALLBACK] Using direct API call for remote start (queue flow disabled or failed)`);
    try {
      const chargerResponse = await axios.post(
        `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/charger/remote-start`,
        {
          deviceId: deviceId,
          connectorId: connectorIdInt,
          idTag: idTagValue
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      if (chargerResponse.data && chargerResponse.data.success) {
        // For customer: update session status to active
        if (customerId && chargingSession) {
          await chargingSession.update({
            status: 'active',
            startTime: new Date()
          });

          // Publish charging started event to RabbitMQ (if enabled)
          if (ENABLE_RABBITMQ && publishChargingEvent && publishNotification) {
            try {
              await publishChargingEvent({
                type: 'charging.started',
                sessionId: chargingSession.sessionId,
                customerId: customerId,
                deviceId: deviceId,
                connectorId: connectorIdInt,
                additionalData: {
                  amountDeducted: amountValue,
                  chargingPointId: chargingPointId
                }
              });

              await publishNotification({
                type: 'charging.started',
                data: {
                  sessionId: chargingSession.sessionId,
                  customerId: customerId,
                  deviceId: deviceId,
                  connectorId: connectorIdInt,
                  amountDeducted: amountValue,
                  startTime: chargingSession.startTime
                },
                recipients: [customerId]
              });

              console.log(`📤 [RABBITMQ] Published charging.started event for session ${chargingSession.sessionId}`);
            } catch (rabbitmqError) {
              console.warn('⚠️ [RABBITMQ] Failed to publish charging.started event:', rabbitmqError.message);
            }
          }

          return {
            success: true,
            message: 'Charging started successfully',
            session: {
              id: chargingSession.id,
              sessionId: chargingSession.sessionId,
              deviceId: chargingSession.deviceId,
              connectorId: chargingSession.connectorId,
              amountDeducted: parseFloat(chargingSession.amountDeducted),
              status: chargingSession.status,
              startTime: chargingSession.startTime
            },
            useQueueFlow: false
          };
        } else {
          // CMS: return simple success
          return {
            success: true,
            sessionId: null,
            message: chargerResponse.data.message || 'Remote start command sent directly',
            useQueueFlow: false
          };
        }
      } else {
        // Charger rejected - refund wallet (customer only)
        if (customerId && wallet && walletTransaction) {
          await wallet.update({ balance: parseFloat(wallet.balance) + amountValue });
          await walletTransaction.update({
            transactionType: 'refund',
            balanceBefore: parseFloat(wallet.balance) - amountValue,
            balanceAfter: parseFloat(wallet.balance),
            description: `Refund - Charging rejected: ${chargerResponse.data.error || 'Unknown error'}`
          });
          if (chargingSession) {
            await chargingSession.update({
              status: 'failed',
              refundAmount: amountValue
            });
          }
        }

        throw new Error(chargerResponse.data.error || 'Charger rejected the charging request');
      }
    } catch (chargerError) {
      // Charger API error - refund wallet (customer only)
      if (customerId && wallet && walletTransaction) {
        const currentBalance = parseFloat(wallet.balance);
        await wallet.update({ balance: currentBalance + amountValue });
        await walletTransaction.update({
          transactionType: 'refund',
          balanceBefore: currentBalance - amountValue,
          balanceAfter: currentBalance,
          description: `Refund - Charging failed: ${chargerError.response?.data?.error || chargerError.message || 'Charger connection error'}`
        });
        if (chargingSession) {
          await chargingSession.update({
            status: 'failed',
            refundAmount: amountValue
          });
        }
      }

      const errorMessage = chargerError.response?.data?.error || chargerError.message || 'Failed to start charging';
      throw new Error(errorMessage);
    }
  }
}

/**
 * Stop charging session
 * @param {Object} params - Stop parameters
 * @param {number|null} params.customerId - Customer ID (null for CMS/admin)
 * @param {string} params.deviceId - Charger device ID
 * @param {number} params.connectorId - Connector ID (required for customer, optional for CMS)
 * @param {string|null} params.transactionId - OCPP transaction ID (optional, will be resolved if not provided)
 * @param {string|null} params.sessionId - Session ID (optional, for CMS lookup)
 * @returns {Promise<Object>} - Stop result
 */
async function stopChargingSession(params) {
  const {
    customerId,
    deviceId,
    connectorId,
    transactionId = null,
    sessionId = null
  } = params;

  const connectorIdInt = connectorId ? parseInt(connectorId) : null;

  // For customer: find active session
  let session = null;
  if (customerId) {
    session = await ChargingSession.findOne({
      where: {
        customerId: customerId,
        deviceId: deviceId,
        connectorId: connectorIdInt,
        status: {
          [Op.in]: ['pending', 'active']
        }
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

    if (!session) {
      throw new Error('No active charging session found');
    }
  } else {
    // CMS: Find active session by deviceId and connectorId (or sessionId if provided)
    const systemCustomerId = await getOrCreateSystemCustomer();
    const sessionWhere = {
      deviceId: deviceId,
      status: {
        [Op.in]: ['pending', 'active']
      },
      endTime: null
    };
    
    if (sessionId) {
      sessionWhere.sessionId = sessionId;
    }
    
    if (connectorIdInt !== null && connectorIdInt !== undefined) {
      sessionWhere.connectorId = connectorIdInt;
    }
    
    // Try to find by system customer ID first
    session = await ChargingSession.findOne({
      where: {
        ...sessionWhere,
        customerId: systemCustomerId
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
      order: [['createdAt', 'DESC']]
    });
    
    // If not found, try without customerId filter (for backward compatibility)
    if (!session) {
      session = await ChargingSession.findOne({
        where: sessionWhere,
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
        order: [['createdAt', 'DESC']]
      });
    }
  }

  // Resolve transactionId if not provided
  let actualTransactionId = transactionId || (session ? session.transactionId : null);

  // If we don't have transactionId yet, try to get it from StartTransaction Response
  if (!actualTransactionId) {
    if (customerId && session && session.deviceId && session.startTime) {
      try {
        console.log(`[Stop Charging] Looking up transactionId for deviceId: ${session.deviceId}, startTime: ${session.startTime}`);

        const startTimeWindow = new Date(session.startTime);
        startTimeWindow.setMinutes(startTimeWindow.getMinutes() - 5);

        const startTransactionLog = await ChargerData.findOne({
          where: {
            deviceId: session.deviceId,
            message: 'StartTransaction',
            direction: 'Incoming',
            createdAt: {
              [Op.gte]: startTimeWindow,
              [Op.lte]: new Date(Date.now() + 60000)
            }
          },
          order: [['createdAt', 'DESC']],
          limit: 1
        });

        if (startTransactionLog && startTransactionLog.messageId) {
          let startResponse = await ChargerData.findOne({
            where: {
              message: 'Response',
              messageId: startTransactionLog.messageId,
              direction: 'Outgoing',
              createdAt: {
                [Op.gte]: startTimeWindow
              }
            },
            order: [['createdAt', 'ASC']],
            limit: 1
          });

          if (!startResponse) {
            startResponse = await ChargerData.findOne({
              where: {
                deviceId: session.deviceId,
                message: 'Response',
                messageId: startTransactionLog.messageId,
                direction: 'Outgoing',
                createdAt: {
                  [Op.gte]: startTimeWindow
                }
              },
              order: [['createdAt', 'ASC']],
              limit: 1
            });
          }

          if (startResponse) {
            if (startResponse.messageData && startResponse.messageData.transactionId) {
              actualTransactionId = startResponse.messageData.transactionId;
            } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
              actualTransactionId = startResponse.raw[2].transactionId;
            }
          }
        }
      } catch (error) {
        console.error('[Stop Charging] Error finding transactionId:', error);
      }
    } else if (!customerId) {
      // CMS: Resolve transactionId from logs (complex logic from CMS route)
      const normalizedTransactionId = (transactionId === '' || transactionId === 'null' || transactionId === 'undefined') ? null : transactionId;
      const normalizedConnectorId = (connectorId === '' || connectorId === 'null' || connectorId === 'undefined') ? null : connectorId;
      const normalizedSessionId = (sessionId === '' || sessionId === 'null' || sessionId === 'undefined') ? null : sessionId;

      const parsedTransactionId = normalizedTransactionId ? parseInt(normalizedTransactionId) : NaN;
      if (!isNaN(parsedTransactionId) && parsedTransactionId > 0) {
        actualTransactionId = parsedTransactionId;
      } else {
        // Look up from session
        if (normalizedSessionId) {
          const foundSession = await ChargingSession.findOne({
            where: {
              sessionId: normalizedSessionId,
              deviceId: deviceId,
              status: ['pending', 'active'],
              endTime: null
            }
          });

          if (foundSession && foundSession.transactionId) {
            actualTransactionId = parseInt(foundSession.transactionId);
          }
        }

        // Look up from MeterValues or StartTransaction logs
        if (!actualTransactionId) {
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          const meterValueWhere = {
            deviceId: deviceId,
            message: 'MeterValues',
            direction: 'Incoming',
            timestamp: {
              [Op.gte]: twoHoursAgo
            }
          };

          if (normalizedConnectorId !== null && normalizedConnectorId !== undefined) {
            meterValueWhere.connectorId = parseInt(normalizedConnectorId);
          }

          const recentMeterValue = await ChargerData.findOne({
            where: meterValueWhere,
            order: [['timestamp', 'DESC'], ['id', 'DESC']],
            limit: 1
          });

          if (recentMeterValue) {
            let txId = null;
            if (recentMeterValue.messageData && recentMeterValue.messageData.transactionId) {
              txId = recentMeterValue.messageData.transactionId;
            } else if (recentMeterValue.raw && Array.isArray(recentMeterValue.raw) && recentMeterValue.raw[2] && recentMeterValue.raw[2].transactionId) {
              txId = recentMeterValue.raw[2].transactionId;
            }

            if (txId) {
              // Verify transaction is still active
              const stopTransaction = await ChargerData.findOne({
                where: {
                  deviceId: deviceId,
                  message: 'StopTransaction',
                  direction: 'Incoming'
                },
                order: [['timestamp', 'DESC']],
                limit: 1
              });

              let isStopped = false;
              if (stopTransaction) {
                let stopTxId = null;
                if (stopTransaction.messageData && stopTransaction.messageData.transactionId) {
                  stopTxId = stopTransaction.messageData.transactionId;
                } else if (stopTransaction.raw && Array.isArray(stopTransaction.raw) && stopTransaction.raw[2] && stopTransaction.raw[2].transactionId) {
                  stopTxId = stopTransaction.raw[2].transactionId;
                }

                if (stopTxId && stopTxId.toString() === txId.toString()) {
                  const stopTime = new Date(stopTransaction.timestamp || stopTransaction.createdAt).getTime();
                  const meterTime = new Date(recentMeterValue.timestamp || recentMeterValue.createdAt).getTime();
                  if (stopTime > meterTime) {
                    isStopped = true;
                  }
                }
              }

              if (!isStopped) {
                actualTransactionId = parseInt(txId);
              }
            }
          }

          // Fallback: Get from StartTransaction logs
          if (!actualTransactionId) {
            const startTransactionWhere = {
              deviceId: deviceId,
              message: 'StartTransaction',
              direction: 'Incoming',
              timestamp: {
                [Op.gte]: twoHoursAgo
              }
            };

            if (normalizedConnectorId !== null && normalizedConnectorId !== undefined) {
              startTransactionWhere.connectorId = parseInt(normalizedConnectorId);
            }

            const startTransaction = await ChargerData.findOne({
              where: startTransactionWhere,
              order: [['timestamp', 'DESC'], ['id', 'DESC']],
              limit: 1
            });

            if (startTransaction && startTransaction.messageId) {
              const response = await ChargerData.findOne({
                where: {
                  deviceId: deviceId,
                  message: 'Response',
                  direction: 'Outgoing',
                  messageId: startTransaction.messageId
                }
              });

              if (response) {
                let txId = null;
                if (response.messageData && response.messageData.transactionId) {
                  txId = response.messageData.transactionId;
                } else if (response.raw && Array.isArray(response.raw) && response.raw[2] && response.raw[2].transactionId) {
                  txId = response.raw[2].transactionId;
                }

                if (txId) {
                  // Verify transaction is still active
                  const stopTransaction = await ChargerData.findOne({
                    where: {
                      deviceId: deviceId,
                      message: 'StopTransaction',
                      direction: 'Incoming'
                    },
                    order: [['timestamp', 'DESC']],
                    limit: 1
                  });

                  let isStopped = false;
                  if (stopTransaction) {
                    let stopTxId = null;
                    if (stopTransaction.messageData && stopTransaction.messageData.transactionId) {
                      stopTxId = stopTransaction.messageData.transactionId;
                    } else if (stopTransaction.raw && Array.isArray(stopTransaction.raw) && stopTransaction.raw[2] && stopTransaction.raw[2].transactionId) {
                      stopTxId = stopTransaction.raw[2].transactionId;
                    }

                    if (stopTxId && stopTxId.toString() === txId.toString()) {
                      const stopTime = new Date(stopTransaction.timestamp || stopTransaction.createdAt).getTime();
                      const startTime = new Date(startTransaction.timestamp || startTransaction.createdAt).getTime();
                      if (stopTime > startTime) {
                        isStopped = true;
                      }
                    }
                  }

                  if (!isStopped) {
                    actualTransactionId = parseInt(txId);
                  }
                }
              }
            }
          }
        }

        if (!actualTransactionId) {
          throw new Error('Could not find active charging session or transactionId. Please ensure charging is active and try again.');
        }
      }
    }
  }

  // Send remote stop command
  let useQueueFlow = ENABLE_RABBITMQ && publishChargingCommand;
  let stopSuccess = false;
  const sessionIdValue = session ? session.sessionId : (sessionId || `CMS_STOP_${Date.now()}`);

  if (actualTransactionId) {
    if (useQueueFlow) {
      console.log(`📤 [Queue] Publishing remote stop command for session ${sessionIdValue}`);

      try {
        const commandPublished = await publishChargingCommand({
          command: 'RemoteStopTransaction',
          deviceId: deviceId,
          payload: {
            transactionId: actualTransactionId
          },
          sessionId: sessionIdValue,
          customerId: customerId,
          connectorId: connectorIdInt,
          transactionId: actualTransactionId,
          timestamp: new Date(),
          useQueueFlow: true
        });

        if (commandPublished) {
          console.log(`✅ [Queue] Remote stop command published for session ${sessionIdValue}`);
          stopSuccess = true;
        } else {
          console.warn(`⚠️ [Queue] Failed to publish remote stop command, falling back to direct call`);
          useQueueFlow = false;
        }
      } catch (queueError) {
        console.error(`❌ [Queue] Error publishing remote stop command:`, queueError.message);
        console.warn(`⚠️ [Queue] Falling back to direct call`);
        useQueueFlow = false;
      }
    }

    // FALLBACK: Direct API call
    if (!useQueueFlow) {
      console.log(`🔄 [FALLBACK] Using direct API call for remote stop (queue flow disabled or failed)`);
      try {
        const chargerResponse = await axios.post(
          `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/charger/remote-stop`,
          {
            deviceId: deviceId,
            transactionId: actualTransactionId
          },
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }
        );

        stopSuccess = chargerResponse.data && chargerResponse.data.success;
      } catch (chargerError) {
        console.error('[Stop Charging] Error calling remote-stop:', chargerError.message);
        if (chargerError.code === 'ECONNREFUSED' || chargerError.code === 'ETIMEDOUT') {
          console.error(`[Stop Charging] CRITICAL: Cannot reach charger API. Charger may not actually stop!`);
        }
      }
    }
  } else {
    console.warn(`[Stop Charging] ⚠️ No transactionId available for deviceId: ${deviceId}. Cannot call remote-stop.`);
    stopSuccess = false;
  }

  // Initialize variables for both customer and CMS sessions
  let energyConsumed = 0;
  let finalAmount = 0;
  let refundAmount = 0;
  let meterStart = null;
  let meterEnd = null;
  let amountDeducted = 0; // Initialize for CMS sessions (will be updated for customer sessions)
  let determinedStopReason = 'Remote (CMS)';

  // For customer: Calculate energy, cost, and refund
  if (customerId && session) {
    // Get tariff for cost calculation
    const tariff = session.chargingPoint?.tariff;
    const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
    const tax = tariff ? parseFloat(tariff.tax) : 0;

    // Get meter readings from ChargerData
    let meterStart = session.meterStart;
    let meterEnd = null;
    let energyConsumed = 0;

    if (actualTransactionId) {
      // Get StartTransaction log to find meter_start
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

      // Wait for StopTransaction to process and final MeterValues to arrive
      let attempts = 0;
      const maxAttempts = 5;
      while (!meterEnd && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));

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
          const extractedValue = extractMeterValue(lastMeterValues);
          if (extractedValue !== null) {
            meterEnd = extractedValue;
            break;
          }
        }
        attempts++;
      }
    }

    // Calculate energy consumed
    if (meterStart !== null && meterEnd !== null && meterEnd >= meterStart) {
      energyConsumed = (meterEnd - meterStart) / 1000; // Convert Wh to kWh
      if (energyConsumed < 0) energyConsumed = 0;
    }

    // Calculate final amount based on actual energy consumed
    let calculatedAmount = 0;
    if (energyConsumed > 0 && baseCharges > 0) {
      const baseAmount = energyConsumed * baseCharges;
      const taxMultiplier = 1 + (tax / 100);
      calculatedAmount = baseAmount * taxMultiplier;
    }

    // Cap finalAmount at amountDeducted
    amountDeducted = parseFloat(session.amountDeducted);
    finalAmount = Math.min(calculatedAmount, amountDeducted);

    // Calculate refund
    let refundAmount = 0;

    // Check if session was updated by MeterValues processor
    if (session.energyConsumed > 0 && session.finalAmount > 0) {
      energyConsumed = parseFloat(session.energyConsumed);
      finalAmount = parseFloat(session.finalAmount);
      calculatedAmount = finalAmount;

      if (finalAmount < amountDeducted) {
        refundAmount = amountDeducted - finalAmount;
      }
    } else if (energyConsumed > 0 && calculatedAmount > 0) {
      if (finalAmount < amountDeducted) {
        refundAmount = amountDeducted - finalAmount;
      }
    } else if (energyConsumed === 0 && meterStart !== null && meterEnd !== null) {
      const meterDiff = Math.abs(meterEnd - meterStart);
      if (meterDiff < 1) {
        refundAmount = amountDeducted;
      } else {
        const energyWh = meterEnd - meterStart;
        if (energyWh > 0) {
          energyConsumed = energyWh / 1000;
          const baseAmount = energyConsumed * baseCharges;
          const taxMultiplier = 1 + (tax / 100);
          const recalculatedAmount = baseAmount * taxMultiplier;
          const recalculatedFinalAmount = Math.min(recalculatedAmount, amountDeducted);

          if (recalculatedFinalAmount < amountDeducted) {
            refundAmount = amountDeducted - recalculatedFinalAmount;
          }

          finalAmount = recalculatedFinalAmount;
        } else {
          refundAmount = amountDeducted;
        }
      }
    } else if (energyConsumed === 0 && (meterStart === null || meterEnd === null)) {
      const sessionDuration = session.startTime ? (new Date() - new Date(session.startTime)) / 1000 : 0;
      if (sessionDuration < 30) {
        refundAmount = amountDeducted;
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const retryMeterValues = await ChargerData.findOne({
          where: {
            deviceId: deviceId,
            message: 'MeterValues',
            direction: 'Incoming',
            createdAt: {
              [Op.gte]: session.startTime
            }
          },
          order: [['createdAt', 'DESC']],
          limit: 1
        });

        if (retryMeterValues) {
          meterEnd = extractMeterValue(retryMeterValues);
          if (meterEnd !== null && meterStart !== null && meterEnd >= meterStart) {
            energyConsumed = (meterEnd - meterStart) / 1000;
            if (energyConsumed > 0 && baseCharges > 0) {
              const baseAmount = energyConsumed * baseCharges;
              const taxMultiplier = 1 + (tax / 100);
              const retryCalculatedAmount = baseAmount * taxMultiplier;
              const retryFinalAmount = Math.min(retryCalculatedAmount, amountDeducted);

              if (retryFinalAmount < amountDeducted) {
                refundAmount = amountDeducted - retryFinalAmount;
              }

              finalAmount = retryFinalAmount;
            }
          }
        }

        if (refundAmount === 0 && energyConsumed === 0) {
          refundAmount = amountDeducted;
        }
      }
    }

    // Determine stop reason
    let determinedStopReason = 'Remote';
    if (refundAmount === 0 && finalAmount > 0 && Math.abs(finalAmount - amountDeducted) < 0.15) {
      determinedStopReason = 'ChargingCompleted';
    } else if (refundAmount > 0) {
      determinedStopReason = 'Remote';
    }
  } else {
    // CMS: Use energy already calculated by MeterValues handler, or calculate from meterStart/meterEnd
    // First, reload session to get latest values (in case MeterValues handler updated it)
    await session.reload();
    
    // Check if energy was already calculated by MeterValues handler during charging
    if (session.energyConsumed !== null && session.energyConsumed > 0) {
      // Use values already calculated by MeterValues handler
      energyConsumed = parseFloat(session.energyConsumed);
      finalAmount = parseFloat(session.finalAmount || 0);
      meterStart = session.meterStart;
      meterEnd = session.meterEnd;
      console.log(`✅ [Stop Charging - CMS] Using energy from MeterValues: ${energyConsumed.toFixed(3)} kWh, cost: ₹${finalAmount.toFixed(2)}`);
    } else if (session.meterStart !== null && session.meterEnd !== null) {
      // Calculate from meterStart and meterEnd if available
      const meterStartWh = parseFloat(session.meterStart);
      const meterEndWh = parseFloat(session.meterEnd);
      
      if (!isNaN(meterStartWh) && !isNaN(meterEndWh) && meterEndWh >= meterStartWh) {
        energyConsumed = (meterEndWh - meterStartWh) / 1000; // Convert Wh to kWh
        if (energyConsumed < 0) energyConsumed = 0;
        
        // Calculate cost if we have tariff
        const tariff = session.chargingPoint?.tariff;
        if (energyConsumed > 0 && tariff) {
          const baseCharges = parseFloat(tariff.baseCharges || 0);
          const tax = parseFloat(tariff.tax || 0);
          
          if (baseCharges > 0) {
            const baseAmount = energyConsumed * baseCharges;
            const taxMultiplier = 1 + (tax / 100);
            finalAmount = baseAmount * taxMultiplier;
            console.log(`📊 [Stop Charging - CMS] Calculated energy from meter values: ${energyConsumed.toFixed(3)} kWh, cost: ₹${finalAmount.toFixed(2)}`);
          }
        }
        
        meterStart = meterStartWh;
        meterEnd = meterEndWh;
      } else {
        // Invalid meter values
        energyConsumed = 0;
        finalAmount = 0;
        meterStart = session.meterStart;
        meterEnd = session.meterEnd;
        console.log(`⚠️ [Stop Charging - CMS] Invalid meter values, setting energy to 0`);
      }
    } else {
      // No meter values available - set to 0
      energyConsumed = 0;
      finalAmount = 0;
      meterStart = session.meterStart;
      meterEnd = session.meterEnd;
      console.log(`⚠️ [Stop Charging - CMS] No meter values available, setting energy to 0`);
    }
    
    refundAmount = 0; // CMS sessions don't have refunds
    determinedStopReason = 'Remote (CMS)';
  }

  // Update session status to 'stopped' IMMEDIATELY (for both customer and CMS)
  if (session) {
    // For customer sessions, reload to get latest values (in case MeterValues updated it)
    if (customerId) {
      await session.reload();
      
      // If MeterValues handler already calculated energy, use it (it's more accurate)
      if (session.energyConsumed !== null && session.energyConsumed > 0 && energyConsumed === 0) {
        energyConsumed = parseFloat(session.energyConsumed);
        finalAmount = parseFloat(session.finalAmount || 0);
        console.log(`✅ [Stop Charging - Customer] Using energy from MeterValues: ${energyConsumed.toFixed(3)} kWh, cost: ₹${finalAmount.toFixed(2)}`);
      }
    }
    
    await session.update({
      status: 'stopped',
      transactionId: actualTransactionId,
      energyConsumed: energyConsumed,
      finalAmount: finalAmount,
      refundAmount: refundAmount,
      meterStart: meterStart,
      meterEnd: meterEnd,
      endTime: new Date(),
      stopReason: determinedStopReason
    });

    await session.reload();

    // Update Redis status to "Available"
    try {
      const updater = require('../libs/redis/updater');
      await updater(deviceId, { status: 'Available' });

      const cacheController = require('../libs/redis/cacheController');
      const redisClient = require('../libs/redis/redisClient');

      try {
        const keys = await redisClient.keys('charging-points:list:*');
        if (keys && keys.length > 0) {
          await Promise.all(keys.map(key => cacheController.del(key)));
        }
      } catch (cacheErr) {
        console.error(`❌ [Cache] Error invalidating cache:`, cacheErr.message);
      }
    } catch (redisErr) {
      console.error(`❌ [Redis] Error updating status when stopping charging for ${deviceId}:`, redisErr.message);
    }

    // Update wallet if refund is needed
    if (refundAmount > 0) {
      const existingRefund = await WalletTransaction.findOne({
        where: {
          customerId: customerId,
          referenceId: session.sessionId,
          transactionType: 'refund',
          transactionCategory: 'refund'
        }
      });

      if (!existingRefund) {
        const wallet = await getOrCreateWallet(customerId);
        const currentBalance = parseFloat(wallet.balance);
        const newBalance = currentBalance + refundAmount;

        await wallet.update({ balance: newBalance });

        await WalletTransaction.create({
          walletId: wallet.id,
          customerId: customerId,
          transactionType: 'refund',
          amount: refundAmount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description: `Refund - Charging Session ${session.sessionId} (Energy: ${energyConsumed.toFixed(2)} kWh, Used: ₹${finalAmount.toFixed(2)}, Refunded: ₹${refundAmount.toFixed(2)})`,
          referenceId: session.sessionId,
          status: 'completed',
          transactionCategory: 'refund'
        });
      }
    }

    // Publish charging stopped event to RabbitMQ
    if (ENABLE_RABBITMQ && publishChargingEvent && publishNotification) {
      try {
        await publishChargingEvent({
          type: 'charging.stopped',
          sessionId: session.sessionId,
          customerId: customerId,
          deviceId: session.deviceId,
          connectorId: session.connectorId,
          additionalData: {
            energyConsumed: energyConsumed,
            finalAmount: finalAmount,
            refundAmount: refundAmount,
            amountDeducted: amountDeducted,
            startTime: session.startTime,
            endTime: session.endTime,
            stopReason: determinedStopReason
          }
        });

        await publishNotification({
          type: 'charging.stopped',
          data: {
            sessionId: session.sessionId,
            customerId: customerId,
            deviceId: session.deviceId,
            connectorId: session.connectorId,
            energyConsumed: energyConsumed,
            finalAmount: finalAmount,
            refundAmount: refundAmount,
            endTime: session.endTime,
            suppressToast: true
          },
          recipients: [customerId]
        });
      } catch (rabbitmqError) {
        console.warn('⚠️ [RABBITMQ] Failed to publish charging.stopped event:', rabbitmqError.message);
      }
    }

    return {
      success: true,
      message: stopSuccess
        ? 'Charging stopped successfully'
        : 'Session finalized, but charger remote-stop may have failed. Please verify charger status.',
      stopSuccess: stopSuccess,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        energyConsumed: parseFloat(energyConsumed.toFixed(3)),
        finalAmount: parseFloat(finalAmount.toFixed(2)),
        refundAmount: parseFloat(refundAmount.toFixed(2)),
        amountDeducted: amountDeducted,
        startTime: session.startTime,
        endTime: session.endTime
      }
    };
  } else {
    // CMS: Simple response
    return {
      success: true,
      message: stopSuccess
        ? 'Stop command sent successfully'
        : 'Stop command queued. Waiting for charger confirmation.',
      stopSuccess: stopSuccess
    };
  }
}

/**
 * Get active charging session for customer
 * @param {number} customerId - Customer ID
 * @returns {Promise<Object|null>} - Active session or null
 */
async function getActiveSession(customerId) {
  const session = await ChargingSession.findOne({
    where: {
      customerId: customerId,
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
            model: Station,
            as: 'station',
            attributes: ['id', 'stationId', 'stationName']
          },
          {
            model: Tariff,
            as: 'tariff'
          }
        ]
      }
    ],
    order: [['createdAt', 'DESC']]
  });

  if (!session) {
    return null;
  }

  // Double-check by deviceId
  const activeSessionsForDevice = await ChargingSession.count({
    where: {
      deviceId: session.deviceId,
      status: {
        [Op.in]: ['pending', 'active']
      },
      endTime: null
    }
  });

  if (activeSessionsForDevice === 0) {
    return null;
  }

  await session.reload();

  if (['stopped', 'completed', 'failed'].includes(session.status) || session.endTime) {
    return null;
  }

  // Get current meter reading for real-time energy calculation
  let currentEnergy = 0;
  let meterNow = null;

  if (session.deviceId) {
    const latestMeterValues = await ChargerData.findOne({
      where: {
        deviceId: session.deviceId,
        message: 'MeterValues',
        direction: 'Incoming'
      },
      order: [['createdAt', 'DESC']],
      limit: 1
    });

    if (latestMeterValues) {
      meterNow = extractMeterValue(latestMeterValues);
    }

    let meterStart = session.meterStart;
    if (!meterStart && session.startTime) {
      const startMeterValues = await ChargerData.findOne({
        where: {
          deviceId: session.deviceId,
          message: 'MeterValues',
          direction: 'Incoming',
          createdAt: {
            [Op.gte]: session.startTime
          }
        },
        order: [['createdAt', 'ASC']],
        limit: 1
      });

      if (startMeterValues) {
        meterStart = extractMeterValue(startMeterValues);
        await session.update({ meterStart: meterStart });
      }
    }

    if (meterStart !== null && meterNow !== null && meterNow >= meterStart) {
      currentEnergy = (meterNow - meterStart) / 1000;
      if (currentEnergy < 0) currentEnergy = 0;
    }
  }

  // Calculate current cost
  let currentCost = 0;
  const tariff = session.chargingPoint?.tariff;
  if (currentEnergy > 0 && tariff) {
    const baseCharges = parseFloat(tariff.baseCharges) || 0;
    const tax = parseFloat(tariff.tax) || 0;
    const baseAmount = currentEnergy * baseCharges;
    const taxMultiplier = 1 + (tax / 100);
    currentCost = baseAmount * taxMultiplier;
  }

  // AUTO-STOP: Check if cost has reached 95% of prepaid amount
  const amountDeducted = parseFloat(session.amountDeducted);
  const stopThreshold = amountDeducted * 0.95;
  const shouldAutoStop = amountDeducted > 0 && currentCost >= stopThreshold;

  return {
    id: session.id,
    sessionId: session.sessionId,
    deviceId: session.deviceId,
    deviceName: session.chargingPoint?.deviceName || session.deviceId,
    connectorId: session.connectorId,
    transactionId: session.transactionId,
    amountDeducted: parseFloat(session.amountDeducted),
    energy: parseFloat(currentEnergy.toFixed(3)),
    cost: parseFloat(currentCost.toFixed(2)),
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    shouldAutoStop: shouldAutoStop,
    station: session.chargingPoint?.station ? {
      stationId: session.chargingPoint.station.stationId,
      stationName: session.chargingPoint.station.stationName
    } : null,
    tariff: tariff ? {
      tariffId: tariff.tariffId,
      tariffName: tariff.tariffName,
      baseCharges: parseFloat(tariff.baseCharges),
      tax: parseFloat(tariff.tax),
      currency: tariff.currency
    } : null
  };
}

/**
 * Get sessions for customer with filters
 * @param {number} customerId - Customer ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} - Sessions with pagination
 */
async function getSessions(customerId, filters = {}) {
  const {
    page = 1,
    limit = 20,
    fromDate,
    toDate
  } = filters;

  const offset = (page - 1) * limit;

  let fromDateObj = null;
  let toDateObj = null;

  if (fromDate) {
    fromDateObj = new Date(fromDate);
    fromDateObj.setHours(0, 0, 0, 0);
  }

  if (toDate) {
    toDateObj = new Date(toDate);
    toDateObj.setHours(23, 59, 59, 999);
  }

  const whereClause = {
    customerId: customerId,
    status: {
      [Op.in]: ['stopped', 'completed']
    }
  };

  if (fromDateObj || toDateObj) {
    whereClause.endTime = {};
    if (fromDateObj) {
      whereClause.endTime[Op.gte] = fromDateObj;
    }
    if (toDateObj) {
      whereClause.endTime[Op.lte] = toDateObj;
    }
  }

  const { count, rows: sessions } = await ChargingSession.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: ChargingPoint,
        as: 'chargingPoint',
        include: [
          {
            model: Station,
            as: 'station',
            attributes: ['id', 'stationId', 'stationName']
          },
          {
            model: Tariff,
            as: 'tariff',
            attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
          }
        ]
      }
    ],
    order: [['endTime', 'DESC'], ['createdAt', 'DESC']],
    limit: limit,
    offset: offset
  });

  const formattedSessions = sessions.map(session => {
    const tariff = session.chargingPoint?.tariff;
    const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
    const tax = tariff ? parseFloat(tariff.tax) : 0;

    return {
      id: session.id,
      sessionId: session.sessionId,
      transactionId: session.transactionId,
      deviceId: session.deviceId,
      deviceName: session.chargingPoint?.deviceName || session.deviceId,
      connectorId: session.connectorId,
      stationName: session.chargingPoint?.station?.stationName || 'N/A',
      stationId: session.chargingPoint?.station?.stationId || null,
      startTime: session.startTime,
      endTime: session.endTime,
      energy: parseFloat(session.energyConsumed || 0),
      billedAmount: parseFloat(session.finalAmount || 0),
      amountDeducted: parseFloat(session.amountDeducted),
      refundAmount: parseFloat(session.refundAmount || 0),
      baseCharges: baseCharges,
      tax: tax,
      currency: tariff ? tariff.currency : 'INR',
      status: session.status,
      stopReason: session.stopReason
    };
  });

  const totalPages = Math.ceil(count / limit);

  return {
    sessions: formattedSessions,
    total: count,
    page: page,
    limit: limit,
    totalPages: totalPages
  };
}

/**
 * Get session by ID for customer
 * @param {number} customerId - Customer ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} - Session or null
 */
async function getSessionById(customerId, sessionId) {
  const session = await ChargingSession.findOne({
    where: {
      sessionId: sessionId,
      customerId: customerId
    },
    include: [
      {
        model: ChargingPoint,
        as: 'chargingPoint',
        include: [
          {
            model: Station,
            as: 'station',
            attributes: ['id', 'stationId', 'stationName']
          },
          {
            model: Tariff,
            as: 'tariff',
            attributes: ['id', 'tariffId', 'tariffName', 'baseCharges', 'tax', 'currency']
          }
        ]
      }
    ]
  });

  if (!session) {
    return null;
  }

  const tariff = session.chargingPoint?.tariff;
  const baseCharges = tariff ? parseFloat(tariff.baseCharges) : 0;
  const tax = tariff ? parseFloat(tariff.tax) : 0;

  return {
    id: session.id,
    sessionId: session.sessionId,
    transactionId: session.transactionId,
    deviceId: session.deviceId,
    deviceName: session.chargingPoint?.deviceName || session.deviceId,
    connectorId: session.connectorId,
    stationName: session.chargingPoint?.station?.stationName || 'N/A',
    stationId: session.chargingPoint?.station?.stationId || null,
    startTime: session.startTime,
    endTime: session.endTime,
    energy: parseFloat(session.energyConsumed || 0),
    billedAmount: parseFloat(session.finalAmount || 0),
    amountDeducted: parseFloat(session.amountDeducted),
    refundAmount: parseFloat(session.refundAmount || 0),
    baseCharges: baseCharges,
    tax: tax,
    currency: tariff ? tariff.currency : 'INR',
    status: session.status,
    stopReason: session.stopReason,
    meterStart: session.meterStart ? parseFloat(session.meterStart) : null,
    meterEnd: session.meterEnd ? parseFloat(session.meterEnd) : null
  };
}

module.exports = {
  startChargingSession,
  stopChargingSession,
  getActiveSession,
  getSessions,
  getSessionById
};

