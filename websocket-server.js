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
      ws.on('message', async (data) => {
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
            
            // Sirf allowed actions ke logs store karo: BootNotification, StatusNotification, ChangeConfiguration
            const allowedActions = ['BootNotification', 'StatusNotification', 'ChangeConfiguration'];
            if (allowedActions.includes(parsed.action)) {
              messageForStorage = {
                ocpp: true,
                type: MESSAGE_TYPE.CALL,
                id: parsed.id,
                action: parsed.action,
                payload: parsed.payload
              };
            } else {
              // Other actions ke logs store mat karo
              console.log(`⚠️ Skipping log storage for action: ${parsed.action}`);
              messageForStorage = null;
            }
            
            if (parsed.action === 'BootNotification') {
              try {
                const payload = {
                  status: 'Accepted',
                  currentTime: new Date().toISOString(),
                  interval: 30
                };
                ws.send(JSON.stringify(toOcppCallResult(parsed.id, payload)));
                console.log(`✅ Replied BootNotification for ${deviceId}`);
              } catch (e) {
                console.warn(`⚠️ Failed to reply BootNotification for ${deviceId}: ${e.message}`);
              }
            } else if (parsed.action === 'StatusNotification') {
              try {
                ws.send(JSON.stringify(toOcppCallResult(parsed.id, {})));
                console.log(`✅ Replied StatusNotification for ${deviceId}`);
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
            messageForStorage = {
              ocpp: true,
              type: MESSAGE_TYPE.CALL_RESULT,
              id: parsed.id,
              payload: parsed.payload,
              action: 'Response' // Response ke naam se store karein
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
          // Heartbeat ke logs store NAHI karte - sirf allowed actions: BootNotification, StatusNotification, ChangeConfiguration
          if (messageForStorage && currentCharger && currentCharger.id) {
            console.log(`💾 Attempting to store message for ${deviceId} (chargerId: ${currentCharger.id})...`);
            try {
              await storeMessage(deviceId, currentCharger.id, messageForStorage);
              console.log(`✅ Message stored successfully for ${deviceId}`);
            } catch (storeError) {
              console.error(`❌ Error storing message for ${deviceId}:`, storeError.message);
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

// Store message in database
async function storeMessage(deviceId, chargerId, message) {
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

    // Store in ChargerData
    await ChargerData.create({
      chargerId: chargerId,
      deviceId: deviceId,
      type: 'OCPP', // Default type
      message: messageType,
      messageData: message,
      raw: message,
      direction: direction,
      timestamp: new Date()
    });

    console.log(`💾 Stored message: ${messageType} from ${deviceId}`);
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

  // 1) Connector count: track the highest connectorId seen in StatusNotification
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

  // 2) Power (kW): infer from MeterValues if present
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
  connections
};

