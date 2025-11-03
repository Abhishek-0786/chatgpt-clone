const WebSocket = require('ws');
const Charger = require('./models/Charger');
const ChargerData = require('./models/ChargerData');
const {
  MESSAGE_TYPE,
  createMessageId,
  toOcppCall,
  toOcppCallResult,
  parseIncoming
} = require('./utils/ocpp');

// Store active WebSocket connections
const connections = new Map(); // deviceId -> WebSocket
const pendingRequests = new Map(); // messageId -> { deviceId, resolve, reject, timeout }
const intervals = new Map(); // deviceId -> periodic trigger intervalId
const keepAliveIntervals = new Map(); // deviceId -> keepalive ping intervalId
const heartbeatIntervals = new Map(); // deviceId -> heartbeat intervalId
const heartbeatConfigured = new Set(); // deviceIds we attempted ChangeConfiguration
const messageSequences = new Map(); // deviceId -> sequence counter for maintaining exact order
const messageQueues = new Map(); // deviceId -> queue of messages to store in order
const messageProcessingLocks = new Map(); // deviceId -> promise for sequential message processing

// Create WebSocket server
function createWebSocketServer(port = 9000) {
  const wss = new WebSocket.Server({
    port,
    handleProtocols: (protocols, request) => {
      // Prefer OCPP 1.6 JSON subprotocol if offered by the client
      // protocols can be a Set or Array, handle both
      const protocolsList = Array.isArray(protocols) ? protocols : Array.from(protocols || []);
      
      if (protocolsList.includes('ocpp1.6')) {
        return 'ocpp1.6';
      }
      // Fallback: accept the first proposed protocol (or none)
      return protocolsList.length > 0 ? protocolsList[0] : false;
    }
  });

  const env = process.env.NODE_ENV || 'development';
  const host = process.env.WEBSOCKET_HOST || (env === 'production' ? '13.232.204.219' : 'localhost');
  
  console.log(`🚀 WebSocket server started on port ${port}`);
  console.log(`📡 WebSocket URL: ws://${host}:${port}/ws/ocpp/16/{deviceId}`);

  wss.on('connection', async (ws, req) => {
    console.log('🔌 New WebSocket connection attempt');
    console.log('📍 Request URL:', req.url);
    console.log('📍 Headers host:', req.headers.host);
    
    try {
      // Extract device ID from URL path
      // Expected format: /ws/ocpp/16/{deviceId}
      const url = new URL(req.url, `ws://${req.headers.host}`);
      const pathParts = url.pathname.split('/').filter(p => p);
      
      console.log('📋 Parsed pathname:', url.pathname);
      console.log('📋 Path parts:', pathParts);
      
      let deviceId = null;
      
      // Try to extract device ID from path
      if (pathParts.length >= 4 && pathParts[1] === 'ocpp') {
        // Be tolerant: some simulators append the id twice (/ws/ocpp/16/ID/ID)
        // Always use the last non-empty segment as deviceId
        for (let i = pathParts.length - 1; i >= 0; i--) {
          if (pathParts[i] && pathParts[i] !== 'ocpp' && pathParts[i] !== 'ws') {
            deviceId = pathParts[i];
            break;
          }
        }
        console.log('✅ Extracted deviceId from OCPP path (tolerant):', deviceId);
      } else if (pathParts.length > 0) {
        // Fallback: last part might be device ID
        deviceId = pathParts[pathParts.length - 1];
        console.log('⚠️ Using fallback - extracted deviceId from last part:', deviceId);
      }

      if (!deviceId || deviceId.trim() === '') {
        console.error('❌ No device ID found in WebSocket URL:', req.url);
        console.error('URL pathname:', url.pathname);
        console.error('Path parts:', pathParts);
        ws.close(1008, 'Device ID required in path');
        return;
      }

      // Trim and validate deviceId
      deviceId = deviceId.trim();
      
      console.log(`✅ New charger connected: ${deviceId}`);
      console.log(`📍 Connection from: ${req.socket.remoteAddress}`);
      console.log(`📋 Full WebSocket URL: ${req.url}`);
      
      // Store connection
      connections.set(deviceId, ws);
      ws.isAlive = true;
      
      // IMPORTANT: Declare charger variable and initialize lock
      let charger = null;
      let chargerInitializing = false;
      let chargerInitPromise = null;
      
      // Function to ensure charger exists (with lock to prevent race conditions)
      async function ensureCharger() {
        if (charger && charger.id) {
          return charger;
        }
        
        // If already initializing, wait for that to complete
        if (chargerInitializing && chargerInitPromise) {
          return chargerInitPromise;
        }
        
        // Start initialization
        chargerInitializing = true;
        chargerInitPromise = (async () => {
          try {
            let currentCharger = await Charger.findOne({ 
              where: { deviceId },
              attributes: { exclude: ['chargerStatus'] }
            });
            
            if (!currentCharger) {
              console.log(`📝 Creating new charger: ${deviceId}`);
              await Charger.create({
                deviceId: deviceId,
                name: deviceId,
                lastSeen: new Date()
              }, {
                fields: ['deviceId', 'name', 'lastSeen'],
                returning: false
              });
              
              currentCharger = await Charger.findOne({ 
                where: { deviceId },
                attributes: { exclude: ['chargerStatus'] }
              });
            }
            
            if (currentCharger) {
              charger = currentCharger;
              console.log(`✅ Charger ready: ${deviceId}, id: ${currentCharger.id}`);
              return currentCharger;
            } else {
              console.error(`❌ Failed to create/fetch charger for ${deviceId}`);
              return null;
            }
          } finally {
            chargerInitializing = false;
            chargerInitPromise = null;
          }
        })();
        
        return chargerInitPromise;
      }
      
      // Setup message handler IMMEDIATELY to not lose early messages from simulator
      // Initialize message processing lock for this device - ensures sequential processing
      if (!messageProcessingLocks.has(deviceId)) {
        messageProcessingLocks.set(deviceId, Promise.resolve());
      }
      
      ws.on('message', async (data) => {
        // Wait for previous message to complete processing before handling this one
        const previousPromise = messageProcessingLocks.get(deviceId);
        const currentPromise = (async () => {
          await previousPromise; // Wait for previous message
          
          console.log(`📩 Message received from ${deviceId} (raw length: ${data.length})`);
          try {
          // Ensure charger exists (synchronized to prevent race conditions)
          const currentCharger = await ensureCharger();
          if (!currentCharger || !currentCharger.id) {
            console.error(`❌ Cannot process message - charger not ready for ${deviceId}`);
            return;
          }
          
          const rawStr = data.toString();
          console.log(`🧾 Raw frame from ${deviceId}: ${rawStr.substring(0, 500)}${rawStr.length > 500 ? '...' : ''}`);
          
          if (!rawStr || rawStr.trim() === '') {
            console.warn(`⚠️ Empty message received from ${deviceId}`);
            return;
          }
          
          let parsed;
          try {
            parsed = parseIncoming(rawStr);
            console.log(`🔍 Parsed result for ${deviceId}: kind=${parsed.kind}, action=${parsed.action || 'N/A'}`);
          } catch (parseError) {
            console.error(`❌ Parse error for ${deviceId}:`, parseError.message);
            console.error(`❌ Raw message that failed to parse:`, rawStr);
            return;
          }
          let messageForStorage = null;
          let messageType = 'Unknown';

          if (parsed.kind === 'CALL_RESULT' || parsed.kind === 'CALL_ERROR') {
            // Resolve/reject pending promise
            const pending = pendingRequests.get(parsed.id);
            if (pending) {
              pendingRequests.delete(parsed.id);
              clearTimeout(pending.timeout);
              if (parsed.kind === 'CALL_RESULT') {
                pending.resolve(parsed.payload || {});
              } else {
                pending.reject(parsed.error || { errorCode: 'InternalError' });
              }
            }
          }

          if (parsed.kind === 'CALL') {
            messageType = parsed.action || 'CALL';
            
            // Auto-respond to Heartbeat CALLs with current time
            // NOTE: Heartbeat ke logs store NAHI karte - sirf lastSeen update karte hain
            if (parsed.action === 'Heartbeat') {
              try {
                const payload = { currentTime: new Date().toISOString() };
                ws.send(JSON.stringify(toOcppCallResult(parsed.id, payload)));
                console.log(`💓 Replied Heartbeat for ${deviceId}`);
                
                // Heartbeat se sirf lastSeen update karo - log store mat karo
                if (currentCharger && currentCharger.id) {
                  await Charger.update(
                    { lastSeen: new Date() },
                    { where: { deviceId } }
                  );
                  console.log(`💓 Updated lastSeen for ${deviceId} from Heartbeat`);
                } else {
                  console.warn(`⚠️ Cannot update lastSeen - charger not found for ${deviceId}`);
                }
                // Skip storeMessage for Heartbeat - return early
                return;
              } catch (e) {
                console.warn(`⚠️ Failed to reply Heartbeat for ${deviceId}: ${e.message}`);
                return;
              }
            }
            
            // Store allowed actions ke logs: BootNotification, StatusNotification, ChangeConfiguration, StartTransaction, StopTransaction, MeterValues
            const allowedActions = ['BootNotification', 'StatusNotification', 'ChangeConfiguration', 'StartTransaction', 'StopTransaction', 'MeterValues'];
            if (allowedActions.includes(parsed.action)) {
              messageForStorage = {
                ocpp: true,
                type: MESSAGE_TYPE.CALL,
                id: parsed.id,
                action: parsed.action,
                payload: parsed.payload,
                direction: 'Incoming', // Charger se aane wala message = Incoming
                raw: [MESSAGE_TYPE.CALL, parsed.id, parsed.action, parsed.payload || {}]
              };
            } else {
              // Other actions ke logs store mat karo
              console.log(`⚠️ Skipping log storage for action: ${parsed.action}`);
              messageForStorage = null;
            }
            
            if (parsed.action === 'BootNotification') {
              try {
                // First, enqueue the incoming BootNotification message (sequence 1)
                if (currentCharger && currentCharger.id) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, messageForStorage);
                    console.log(`✅ BootNotification (Incoming) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue BootNotification: ${storeErr.message}`);
                  }
                }
                
                // Update charger metadata from BootNotification
                if (currentCharger && currentCharger.id) {
                  try {
                    await tryUpdateChargerMetadataFromOcpp(deviceId, currentCharger, parsed);
                  } catch (metaErr) {
                    console.warn(`⚠️ Failed to update charger metadata from BootNotification: ${metaErr.message}`);
                  }
                }
                
                // Then send response and enqueue it (sequence 2)
                const payload = {
                  status: 'Accepted',
                  currentTime: new Date().toISOString(),
                  interval: 30
                };
                const responseFrame = toOcppCallResult(parsed.id, payload);
                ws.send(JSON.stringify(responseFrame));
                console.log(`✅ Replied BootNotification for ${deviceId}`);
                
                // Store outgoing BootNotification response (enqueue for sequential storage)
                if (currentCharger && currentCharger.id) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, {
                      ocpp: true,
                      type: MESSAGE_TYPE.CALL_RESULT,
                      id: parsed.id,
                      payload: payload,
                      action: 'Response',
                      direction: 'Outgoing',
                      raw: responseFrame
                    });
                    console.log(`✅ BootNotification Response (Outgoing) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue BootNotification response: ${storeErr.message}`);
                  }
                }
                
                // Automatically send ChangeConfiguration after BootNotification
                // Wait a bit to ensure BootNotification response is sent first
                setTimeout(async () => {
                  try {
                    // Ensure charger exists before sending ChangeConfiguration
                    // Use attributes exclude to avoid chargerStatus column error
                    const charger = await Charger.findOne({ 
                      where: { deviceId },
                      attributes: { exclude: ['chargerStatus'] }
                    });
                    if (!charger || !charger.id) {
                      console.warn(`⚠️ Cannot send ChangeConfiguration - charger not found for ${deviceId}`);
                      return;
                    }
                    
                    await sendOcppCall(deviceId, 'ChangeConfiguration', {
                      key: 'MeterValueSampleInterval',
                      value: '30'
                    }, 10000);
                    console.log(`✅ Auto-sent ChangeConfiguration to ${deviceId}: MeterValueSampleInterval = 30`);
                  } catch (configError) {
                    console.error(`❌ Failed to auto-send ChangeConfiguration to ${deviceId}:`, configError);
                    console.error(`❌ Error details:`, configError.message, configError.stack);
                  }
                }, 500); // 500ms delay to ensure BootNotification response is sent first
              } catch (e) {
                console.warn(`⚠️ Failed to reply BootNotification for ${deviceId}: ${e.message}`);
              }
            } else if (parsed.action === 'StartTransaction') {
              try {
                // First, enqueue the incoming StartTransaction message
                if (currentCharger && currentCharger.id && messageForStorage) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, messageForStorage);
                    console.log(`✅ StartTransaction (Incoming) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue StartTransaction: ${storeErr.message}`);
                  }
                }
                
                // Extract connectorId from payload
                const connectorId = parsed.payload?.connectorId || 0;
                const idTag = parsed.payload?.idTag || '';
                
                // Generate a transaction ID (use a simple counter or timestamp-based ID)
                const transactionId = Date.now() % 10000000; // Simple transaction ID
                
                // Send response with transactionId
                const payload = {
                  idTagInfo: {
                    status: 'Accepted',
                    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days expiry
                  },
                  transactionId: transactionId
                };
                const responseFrame = toOcppCallResult(parsed.id, payload);
                ws.send(JSON.stringify(responseFrame));
                console.log(`✅ Replied StartTransaction for ${deviceId} with transactionId: ${transactionId}`);
                
                // Store outgoing StartTransaction response (enqueue for sequential storage)
                if (currentCharger && currentCharger.id) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, {
                      ocpp: true,
                      type: MESSAGE_TYPE.CALL_RESULT,
                      id: parsed.id,
                      payload: payload,
                      action: 'Response',
                      direction: 'Outgoing',
                      raw: responseFrame
                    });
                    console.log(`✅ StartTransaction Response (Outgoing) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue StartTransaction response: ${storeErr.message}`);
                  }
                }
              } catch (e) {
                console.warn(`⚠️ Failed to reply StartTransaction for ${deviceId}: ${e.message}`);
              }
            } else if (parsed.action === 'StopTransaction') {
              try {
                // First, enqueue the incoming StopTransaction message
                if (currentCharger && currentCharger.id && messageForStorage) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, messageForStorage);
                    console.log(`✅ StopTransaction (Incoming) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue StopTransaction: ${storeErr.message}`);
                  }
                }
                
                // Extract transactionId from payload
                const transactionId = parsed.payload?.transactionId;
                
                // Send response
                const payload = {
                  idTagInfo: {
                    status: 'Accepted'
                  }
                };
                const responseFrame = toOcppCallResult(parsed.id, payload);
                ws.send(JSON.stringify(responseFrame));
                console.log(`✅ Replied StopTransaction for ${deviceId} for transactionId: ${transactionId}`);
                
                // Store outgoing StopTransaction response (enqueue for sequential storage)
                if (currentCharger && currentCharger.id) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, {
                      ocpp: true,
                      type: MESSAGE_TYPE.CALL_RESULT,
                      id: parsed.id,
                      payload: payload,
                      action: 'Response',
                      direction: 'Outgoing',
                      raw: responseFrame
                    });
                    console.log(`✅ StopTransaction Response (Outgoing) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue StopTransaction response: ${storeErr.message}`);
                  }
                }
              } catch (e) {
                console.warn(`⚠️ Failed to reply StopTransaction for ${deviceId}: ${e.message}`);
              }
            } else if (parsed.action === 'StatusNotification') {
              try {
                // First, enqueue the incoming StatusNotification message
                if (currentCharger && currentCharger.id) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, messageForStorage);
                    console.log(`✅ StatusNotification (Incoming) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue StatusNotification: ${storeErr.message}`);
                  }
                }
                
                // Extract connectorId from StatusNotification payload
                const connectorId = parsed.payload && typeof parsed.payload.connectorId !== 'undefined' 
                  ? parsed.payload.connectorId 
                  : 0;
                
                // Then send response and enqueue it
                const responseFrame = toOcppCallResult(parsed.id, {});
                ws.send(JSON.stringify(responseFrame));
                console.log(`✅ Replied StatusNotification for ${deviceId}`);
                
                // Store outgoing StatusNotification response with connectorId from original message (enqueue for sequential storage)
                if (currentCharger && currentCharger.id) {
                  try {
                    await enqueueMessage(deviceId, currentCharger.id, {
                      ocpp: true,
                      type: MESSAGE_TYPE.CALL_RESULT,
                      id: parsed.id,
                      payload: {},
                      action: 'Response',
                      direction: 'Outgoing',
                      raw: responseFrame,
                      connectorId: connectorId // Pass connectorId from original StatusNotification
                    });
                    console.log(`✅ StatusNotification Response (Outgoing) enqueued for ${deviceId}`);
                  } catch (storeErr) {
                    console.warn(`⚠️ Failed to enqueue StatusNotification response: ${storeErr.message}`);
                  }
                }
              } catch (e) {
                console.warn(`⚠️ Failed to reply StatusNotification for ${deviceId}: ${e.message}`);
              }
            } else if (parsed.action === 'MeterValues') {
              try {
                ws.send(JSON.stringify(toOcppCallResult(parsed.id, {})));
                console.log(`✅ Replied MeterValues for ${deviceId}`);
              } catch (e) {
                console.warn(`⚠️ Failed to reply MeterValues for ${deviceId}: ${e.message}`);
              }
            }
          } else if (parsed.kind === 'CALL_RESULT') {
            // CALL_RESULT messages ko "Response" ke naam se store karte hain
            // Charger se aane wala response = Incoming
            messageForStorage = {
              ocpp: true,
              type: MESSAGE_TYPE.CALL_RESULT,
              id: parsed.id,
              payload: parsed.payload,
              action: 'Response',
              direction: 'Incoming',
              raw: [MESSAGE_TYPE.CALL_RESULT, parsed.id, parsed.payload || {}]
            };
            messageType = 'Response';
          } else if (parsed.kind === 'CALL_ERROR') {
            messageForStorage = {
              ocpp: true,
              type: MESSAGE_TYPE.CALL_ERROR,
              id: parsed.id,
              error: parsed.error
            };
            messageType = 'CALL_ERROR';
          } else {
            const msgObj = parsed.data || {};
            messageType = msgObj.messageType || msgObj.type || 'Unknown';
            messageForStorage = msgObj;
          }
          console.log(`📨 Received message from ${deviceId}: ${messageType}`);
          console.log(`🔍 Debug - parsed.kind: ${parsed.kind}, parsed.action: ${parsed.action || 'N/A'}`);
          console.log(`🔍 Debug - messageForStorage: ${messageForStorage ? 'SET' : 'NULL'}, charger: ${currentCharger ? 'EXISTS' : 'NULL'}, charger.id: ${currentCharger && currentCharger.id ? currentCharger.id : 'N/A'}`);
          
          // Store message in database (only for allowed actions and if messageForStorage is set)
          // Heartbeat ke logs store NAHI karte - sirf allowed actions: BootNotification, StatusNotification, ChangeConfiguration, StartTransaction, StopTransaction
          // Note: BootNotification, StatusNotification, StartTransaction, and StopTransaction are already enqueued above, so skip them here
          if (messageForStorage && currentCharger && currentCharger.id && 
              parsed.action !== 'BootNotification' && parsed.action !== 'StatusNotification' &&
              parsed.action !== 'StartTransaction' && parsed.action !== 'StopTransaction') {
            console.log(`💾 Attempting to enqueue message for ${deviceId} (chargerId: ${currentCharger.id})...`);
            try {
              await enqueueMessage(deviceId, currentCharger.id, messageForStorage);
              console.log(`✅ Message enqueued successfully for ${deviceId}`);
            } catch (storeError) {
              console.error(`❌ Error enqueueing message for ${deviceId}:`, storeError.message);
              console.error(`❌ Store error details:`, storeError);
            }
            // Try to enrich charger metadata based on OCPP messages
            try {
              await tryUpdateChargerMetadataFromOcpp(deviceId, currentCharger, parsed);
            } catch (e) {
              console.warn('⚠️ Metadata update skipped:', e.message);
            }
          } else if (messageForStorage && !currentCharger) {
            console.error(`❌ Cannot store message - charger record not found for ${deviceId}`);
            console.error(`❌ messageForStorage: ${messageForStorage ? 'SET' : 'NULL'}, charger: NULL`);
          } else if (!messageForStorage) {
            // Message skipped (e.g., Heartbeat or other unallowed actions)
            console.log(`⏭️ Skipped log storage for ${deviceId}: ${messageType}`);
            // Still try metadata update for non-logged messages (e.g., MeterValues metadata)
            if (currentCharger && currentCharger.id) {
              try {
                await tryUpdateChargerMetadataFromOcpp(deviceId, currentCharger, parsed);
              } catch (e) {
                console.warn('⚠️ Metadata update skipped:', e.message);
              }
            }
          }
          
        } catch (error) {
          console.error(`❌ Error processing message from ${deviceId}:`, error.message);
          // Don't send error ack - OCPP 1.6J only allows array frames
        }
          })(); // End of current promise
        messageProcessingLocks.set(deviceId, currentPromise);
        await currentPromise; // Wait for this message to complete
      });

      // Handle connection close
      ws.on('close', (code, reason) => {
        console.log(`🔌 Charger disconnected: ${deviceId} (code: ${code}, reason: ${reason || 'none'})`);
        console.log(`📊 Total messages received before disconnect: Check logs above`);
        connections.delete(deviceId);
        // Stop periodic if any
        const intId = intervals.get(deviceId);
        if (intId) {
          clearInterval(intId);
          intervals.delete(deviceId);
        }
        // Stop keepalive if any
        const ka = keepAliveIntervals.get(deviceId);
        if (ka) {
          clearInterval(ka);
          keepAliveIntervals.delete(deviceId);
        }
        // Stop heartbeat if any
        const hb = heartbeatIntervals.get(deviceId);
        if (hb) {
          clearInterval(hb);
          heartbeatIntervals.delete(deviceId);
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${deviceId}:`, error.message);
      });

      // Keepalive: ping every 30s. Do NOT mark online or store any Transport entries by default.
      ws.on('pong', async () => {
        ws.isAlive = true;
        const usePongForOnline = (process.env.OCPP_PONG_UPDATES_LASTSEEN || 'false').toLowerCase() === 'true';
        const logPong = (process.env.OCPP_LOG_WEBSOCKET_PONG || 'false').toLowerCase() === 'true';
        if (usePongForOnline) {
          try {
            await Charger.update({ lastSeen: new Date() }, { where: { deviceId } });
          } catch (e) {
            console.warn(`⚠️ Failed to update lastSeen on pong for ${deviceId}: ${e.message}`);
          }
        }
        if (logPong) {
          try {
            const hbCharger = await Charger.findOne({ where: { deviceId }, attributes: { exclude: ['chargerStatus'] } });
            if (hbCharger && hbCharger.id) {
              await ChargerData.create({
                chargerId: hbCharger.id,
                deviceId,
                type: 'Transport',
                message: 'Heartbeat',
                messageData: { transport: 'websocket', event: 'pong' },
                raw: { transport: 'websocket', event: 'pong' },
                direction: 'Incoming',
                timestamp: new Date()
              });
            }
          } catch (logErr) {
            console.warn(`⚠️ Failed to log heartbeat for ${deviceId}: ${logErr.message}`);
          }
        }
      });

      // Don't send welcome message - OCPP 1.6J only allows array frames (CALL/CALL_RESULT/CALL_ERROR)
      console.log(`✅ WebSocket ready for OCPP 1.6J messages from ${deviceId}`);
      console.log(`⏳ Waiting for messages from charger ${deviceId}...`);
      console.log(`📋 Expected first message: BootNotification`);
      console.log(`🚫 Server-initiated triggers DISABLED - waiting for charger messages only`);

      // DISABLED: All server-initiated triggers to avoid conflicts with simulator
      // maybeStartPeriodic(deviceId);
      // maybeStartHeartbeat(deviceId);
      // maybeSetHeartbeatInterval(deviceId, 30);
      // WebSocket keepalive pings also disabled

    } catch (error) {
      console.error('❌ Connection error:', error.message);
      ws.close(1011, 'Internal server error');
    }
  });

  wss.on('error', (error) => {
    console.error('❌ WebSocket server error:', error.message);
  });

  return wss;
}

// Queue message for sequential storage
async function enqueueMessage(deviceId, chargerId, message) {
  // Initialize queue for device if not exists
  if (!messageQueues.has(deviceId)) {
    messageQueues.set(deviceId, {
      queue: [],
      processing: false,
      nextSequence: 1,
      processingPromise: Promise.resolve()
    });
  }
  
  const queueData = messageQueues.get(deviceId);
  
  // Wait for any ongoing processing to complete before assigning sequence
  await queueData.processingPromise;
  
  const sequence = queueData.nextSequence;
  queueData.nextSequence++;
  
  // Add message to queue with assigned sequence
  queueData.queue.push({
    deviceId,
    chargerId,
    message,
    sequence,
    timestamp: new Date()
  });
  
  console.log(`📥 Enqueued message for ${deviceId}: ${message.action || message.message || 'Unknown'} (sequence: ${sequence})`);
  
  // Process queue immediately and wait for it to complete
  queueData.processingPromise = processMessageQueue(deviceId);
  await queueData.processingPromise;
}

// Process message queue sequentially
async function processMessageQueue(deviceId) {
  const queueData = messageQueues.get(deviceId);
  if (!queueData) return;
  
  // If already processing, don't start another process
  if (queueData.processing) {
    // Wait for current processing to complete
    await queueData.processingPromise;
    return;
  }
  
  queueData.processing = true;
  
  try {
    while (queueData.queue.length > 0) {
      const queuedMessage = queueData.queue.shift();
      await storeMessage(
        queuedMessage.deviceId,
        queuedMessage.chargerId,
        queuedMessage.message,
        queuedMessage.sequence
      );
    }
  } catch (error) {
    console.error(`❌ Error processing message queue for ${deviceId}:`, error.message);
  } finally {
    queueData.processing = false;
  }
}

// Store message in database with exact order (no sorting, maintain sequence)
async function storeMessage(deviceId, chargerId, message, assignedSequence) {
  try {
    // Update charger's lastSeen
    await Charger.update(
      { lastSeen: new Date() },
      { where: { deviceId } }
    );

    // Determine message type and direction
    const messageType = (message && message.ocpp && message.action)
      ? message.action
      : (message.message || message.messageType || message.type || 'Unknown');
    const direction = message.direction || 'Incoming'; // Default to Incoming

    // Extract connectorId - prioritize message.connectorId, then payload
    let connectorId = 0;
    if (message.connectorId !== undefined && message.connectorId !== null) {
      connectorId = message.connectorId;
    } else if (message.payload && typeof message.payload.connectorId !== 'undefined') {
      connectorId = message.payload.connectorId;
    }

    // Format messageData exactly as user wants
    // For Response messages with empty payload, ensure messageData is {}
    let messageData = {};
    if (message.payload) {
      if (messageType === 'Response' && Object.keys(message.payload).length === 0) {
        messageData = {}; // Empty object for StatusNotification responses
      } else {
        messageData = message.payload;
      }
    }

    // Format raw array exactly as user provided
    let rawArray;
    if (message.raw && Array.isArray(message.raw)) {
      rawArray = message.raw;
    } else {
      // Build raw array based on message type
      const msgId = message.id || message.messageId || createMessageId();
      if (message.type === MESSAGE_TYPE.CALL_RESULT || messageType === 'Response') {
        // Response: [3, messageId, payload]
        rawArray = [MESSAGE_TYPE.CALL_RESULT, msgId, message.payload || messageData || {}];
      } else {
        // CALL: [2, messageId, action, payload]
        rawArray = [MESSAGE_TYPE.CALL, msgId, message.action || messageType, message.payload || messageData || {}];
      }
    }

    // Use assigned sequence from queue
    const sequence = assignedSequence || 1;
    
    // Create timestamp with sequence offset to maintain exact order
    // Base timestamp + sequence milliseconds ensures messages appear in stored order
    const baseTime = new Date();
    const timestamp = new Date(baseTime.getTime() + sequence);

    // Store in ChargerData with exact format
    await ChargerData.create({
      chargerId: chargerId,
      deviceId: deviceId,
      type: 'OCPP',
      connectorId: connectorId,
      messageId: message.id || message.messageId || createMessageId(),
      message: messageType,
      messageData: messageData,
      raw: rawArray,
      direction: direction,
      timestamp: timestamp
    });

    console.log(`💾 Stored message: ${messageType} (${direction}) from ${deviceId} [sequence: ${sequence}]`);
  } catch (error) {
    console.error('❌ Error storing message:', error.message);
    throw error;
  }
}

// Send an OCPP CALL and await response
async function sendOcppCall(deviceId, action, payload = {}, timeoutMs = 10000) {
  const ws = connections.get(deviceId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error(`Charger ${deviceId} not connected`);
  }
  const id = createMessageId();
  const frame = toOcppCall(action, payload, id);
  
  // Store outgoing message (ChangeConfiguration, etc.) with "Outgoing" direction (enqueue for sequential storage)
  try {
    const charger = await Charger.findOne({ 
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] }
    });
    if (charger && charger.id) {
      await enqueueMessage(deviceId, charger.id, {
        ocpp: true,
        type: MESSAGE_TYPE.CALL,
        id: id,
        action: action,
        payload: payload,
        direction: 'Outgoing',
        raw: frame
      });
      console.log(`💾 Enqueued ${action} (Outgoing) for ${deviceId} - messageId: ${id}`);
    } else {
      console.warn(`⚠️ Cannot enqueue ${action} - charger not found for ${deviceId}`);
    }
  } catch (storeErr) {
    console.error(`❌ Failed to enqueue outgoing ${action}:`, storeErr);
    console.error(`❌ Error details:`, storeErr.message, storeErr.stack);
  }
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`OCPP timeout for ${action}`));
    }, timeoutMs);
    pendingRequests.set(id, { deviceId, resolve, reject, timeout });
    ws.send(JSON.stringify(frame));
  });
}

function maybeStartPeriodic(deviceId) {
  const enabled = (process.env.OCPP_PERIODIC_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled) return;
  if (intervals.get(deviceId)) return; // already running
  const intervalMs = parseInt(process.env.OCPP_PERIODIC_MS || '120000', 10);
  const connectorId = parseInt(process.env.OCPP_PERIODIC_CONNECTOR_ID || '1', 10);
  const messageTrigger = process.env.OCPP_PERIODIC_TRIGGER || 'MeterValues';
  const intId = setInterval(async () => {
    try {
      // Use TriggerMessage to request MeterValues from charger
      await sendOcppCall(deviceId, 'TriggerMessage', {
        requestedMessage: messageTrigger,
        connectorId
      }, 10000);
      console.log(`⏱️ Triggered ${messageTrigger} for ${deviceId}`);
    } catch (e) {
      console.warn(`⚠️ Periodic trigger failed for ${deviceId}: ${e.message}`);
    }
  }, intervalMs);
  intervals.set(deviceId, intId);
}

function maybeStartHeartbeat(deviceId) {
  if ((process.env.OCPP_HEARTBEAT_ENABLED || 'false').toLowerCase() !== 'true') return;
  if (heartbeatIntervals.get(deviceId)) return;
  const hbId = setInterval(async () => {
    try {
      // In OCPP 1.6, Heartbeat is initiated by the charger.
      // We request it via TriggerMessage so the charger sends Heartbeat to us.
      await sendOcppCall(deviceId, 'TriggerMessage', {
        requestedMessage: 'Heartbeat'
      }, 10000);
      // lastSeen will be updated when the Heartbeat CALL arrives; we also bump it here as a fallback
      await Charger.update({ lastSeen: new Date() }, { where: { deviceId } });
      console.log(`💓 Triggered Heartbeat for ${deviceId}`);
    } catch (e) {
      console.warn(`⚠️ Heartbeat trigger failed for ${deviceId}: ${e.message}`);
    }
  }, 30000);
  heartbeatIntervals.set(deviceId, hbId);
}

async function maybeSetHeartbeatInterval(deviceId, seconds) {
  if (heartbeatConfigured.has(deviceId)) return;
  heartbeatConfigured.add(deviceId);
  try {
    const payload = { key: 'HeartbeatInterval', value: String(seconds) };
    await sendOcppCall(deviceId, 'ChangeConfiguration', payload, 10000);
    console.log(`🛠️ Set HeartbeatInterval=${seconds}s for ${deviceId}`);
  } catch (e) {
    // allow retry next time
    heartbeatConfigured.delete(deviceId);
    throw e;
  }
}

// Heuristics to enrich charger metadata from OCPP messages without custom params
async function tryUpdateChargerMetadataFromOcpp(deviceId, charger, parsed) {
  if (!parsed || parsed.kind !== 'CALL') return;
  const action = parsed.action;
  const payload = parsed.payload || {};

  // 1) BootNotification: Extract vendor, model, serialNumber, firmwareVersion
  if (action === 'BootNotification') {
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
      console.log(`✅ Updated charger metadata from BootNotification for ${deviceId}:`, updates);
    }
    return;
  }

  // 2) Connector count: track the highest connectorId seen in StatusNotification
  if (action === 'StatusNotification') {
    const connectorId = Number(payload.connectorId);
    if (!Number.isNaN(connectorId) && connectorId > 0) {
      const current = Number(charger.connectorCount || 0);
      if (connectorId > current) {
        await charger.update({ connectorCount: connectorId });
        console.log(`🔧 Updated connectorCount for ${deviceId} → ${connectorId}`);
      }
    }
    return;
  }

  // 3) Power (kW): infer from MeterValues if present
  if (action === 'MeterValues') {
    const meterValue = Array.isArray(payload.meterValue) ? payload.meterValue : [];
    let inferredKw = undefined;

    for (const mv of meterValue) {
      const sv = Array.isArray(mv.sampledValue) ? mv.sampledValue : [];
      // Prefer direct power measurand
      const powerSv = sv.find(x => (x.measurand === 'Power.Active.Import' || x.measurand === 'Power.Active.Export'));
      if (powerSv && powerSv.value != null) {
        const unit = (powerSv.unit || '').toLowerCase();
        const val = Number(powerSv.value);
        if (!Number.isNaN(val)) {
          if (unit === 'w' || unit === '') inferredKw = val / 1000;
          else if (unit === 'kw') inferredKw = val;
        }
      }
      // If no direct power, try Voltage × Current
      if (inferredKw === undefined) {
        const vSv = sv.find(x => x.measurand === 'Voltage');
        const cSv = sv.find(x => x.measurand === 'Current.Import' || x.measurand === 'Current.Export' || x.measurand === 'Current');
        const v = vSv ? Number(vSv.value) : NaN;
        const c = cSv ? Number(cSv.value) : NaN;
        if (!Number.isNaN(v) && !Number.isNaN(c)) {
          inferredKw = (v * c) / 1000; // simple single-phase estimate
        }
      }
      if (inferredKw !== undefined) break;
    }

    if (inferredKw !== undefined) {
      // Smooth: keep the max seen so far to avoid flicker
      const currentKw = Number(charger.powerRating || 0);
      const nextKw = Math.max(currentKw, inferredKw);
      if (!Number.isNaN(nextKw) && nextKw > 0 && nextKw !== currentKw) {
        await charger.update({ powerRating: nextKw });
        console.log(`⚡ Updated powerRating for ${deviceId} → ${nextKw.toFixed(2)} kW`);
      }
    }
  }
}

// Send command to charger (for future use)
function sendCommand(deviceId, command) {
  const ws = connections.get(deviceId);
  
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error(`❌ Charger ${deviceId} is not connected`);
    return false;
  }

  try {
    ws.send(JSON.stringify(command));
    console.log(`📤 Sent command to ${deviceId}:`, command);
    return true;
  } catch (error) {
    console.error(`❌ Error sending command to ${deviceId}:`, error.message);
    return false;
  }
}

// Get all connected chargers
function getConnectedChargers() {
  return Array.from(connections.keys());
}

// Get WebSocket for a specific charger
function getChargerConnection(deviceId) {
  return connections.get(deviceId);
}

// Get connection count
function getConnectionCount() {
  return connections.size;
}

module.exports = {
  createWebSocketServer,
  sendCommand,
  getConnectedChargers,
  getChargerConnection,
  getConnectionCount,
  connections,
  sendOcppCall
};

