// API Base URL
const API_BASE = '/api/charger';
const TARGET_CHARGERS = 5; // Show top 5 chargers
const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

// Global variables for logs
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let allLogs = [];
let selectedDeviceId = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Charger list page loaded');
    checkAuthAndInitialize();
});

// Check authentication before initializing page
async function checkAuthAndInitialize() {
    try {
        console.log('🔐 Checking authentication...');
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            console.log('❌ No token found');
            showAuthError();
            return;
        }
        
        console.log('🔑 Token found, verifying...');
        
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('📡 Auth response status:', response.status);
        
        if (response.ok) {
            console.log('✅ User authenticated successfully');
            await loadChargers();
            // Auto-refresh every 15 seconds
            setInterval(loadChargers, 15000);
        } else {
            console.log('❌ Invalid token - response not OK');
            showAuthError();
        }
    } catch (error) {
        console.error('❌ Authentication check error:', error);
        showAuthError();
    }
}

// Show authentication error
function showAuthError() {
    if (document.body.innerHTML.includes('Authentication Required')) {
        return;
    }
    
    document.body.innerHTML = `
        <style>
            body {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background-color: #ffffff;
                margin: 0;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            .error-container {
                background: white;
                border-radius: 20px;
                padding: 50px;
                max-width: 500px;
                box-shadow: 0 15px 50px rgba(0,0,0,0.1);
                text-align: center;
                border: 1px solid #e5e5e5;
            }
            .error-container i {
                color: #dc3545;
                margin-bottom: 20px;
            }
            .error-container h3 {
                color: #343541;
                margin-bottom: 15px;
                font-weight: 600;
            }
            .error-container p {
                color: #666;
                margin-bottom: 30px;
                line-height: 1.5;
            }
            .error-container a {
                background-color: #10a37f;
                border: none;
                color: white;
                padding: 14px 35px;
                border-radius: 8px;
                text-decoration: none;
                display: inline-block;
                transition: all 0.2s ease;
                font-weight: 500;
                font-size: 1rem;
            }
            .error-container a:hover {
                background-color: #0d8a6b;
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(16, 163, 127, 0.4);
            }
        </style>
        <div class="error-container">
            <i class="fas fa-lock fa-3x"></i>
            <h3>Authentication Required</h3>
            <p>You need to login first to access charger list.</p>
            <a href="/">
                <i class="fas fa-arrow-left me-2" style="color: white; margin-bottom:0px;"></i>Go to Login
            </a>
        </div>
    `;
}

// Load chargers
async function loadChargers() {
    try {
        console.log('📥 Loading chargers...');
        const refreshIcon = document.getElementById('refresh-icon');
        if (refreshIcon) {
            refreshIcon.classList.add('fa-spin');
        }
        
        const response = await fetch(`${API_BASE}/chargers`);
        const data = await response.json();
        
        if (refreshIcon) {
            refreshIcon.classList.remove('fa-spin');
        }
        
        if (data.success) {
            console.log(`📊 Received ${data.data.length} chargers from API`);
            console.log(`📋 Charger IDs from API:`, data.data.map(c => c.deviceId));
            
            // Get latest activity for each charger and sort
            const chargersWithActivity = await Promise.all(
                data.data.map(async (charger) => {
                    // Get latest log timestamp
                    const latestLogResponse = await fetch(`${API_BASE}/data?deviceId=${encodeURIComponent(charger.deviceId)}&page=1&limit=1`);
                    const latestLogData = await latestLogResponse.json();
                    
                    const latestLog = latestLogData.success && latestLogData.data.length > 0 
                        ? latestLogData.data[0] 
                        : null;
                    
                    // Use charger.lastSeen as primary source (updated by Heartbeat), fallback to latest log
                    const lastActiveTime = charger.lastSeen 
                        ? new Date(charger.lastSeen) 
                        : (latestLog ? new Date(latestLog.timestamp) : null);
                    const now = new Date();
                    const timeDiff = lastActiveTime ? (now - lastActiveTime) : Infinity;
                    const isOnline = timeDiff <= OFFLINE_THRESHOLD;
                    
                    // Check for active transactions (StartTransaction without corresponding StopTransaction)
                    const activeTransaction = await getActiveTransaction(charger.deviceId);
                    
                    return {
                        ...charger,
                        lastActiveTime: lastActiveTime,
                        isOnline: isOnline,
                        activeTransaction: activeTransaction
                    };
                })
            );
            
            // Sort: Online first only; keep original relative order otherwise
            chargersWithActivity.sort((a, b) => (b.isOnline - a.isOnline));

            console.log(`📊 After sorting (online first): ${chargersWithActivity.length} chargers`);

            // Show all chargers (no top-5 cap)
            displayChargers(chargersWithActivity);
            updateLastUpdated();
            console.log(`✅ Loaded ${chargersWithActivity.length} chargers`);
        } else {
            throw new Error(data.error || 'Failed to load chargers');
        }
    } catch (error) {
        console.error('❌ Error loading chargers:', error);
        showAlert('Failed to load chargers', 'danger');
        document.getElementById('chargers-container').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h5>Error loading chargers</h5>
                <p>Please try refreshing the page</p>
            </div>
        `;
    }
}

// Display chargers
function displayChargers(chargers) {
    const container = document.getElementById('chargers-container');
    
    if (chargers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-charging-station"></i>
                <h5>No chargers found</h5>
                <p>No chargers are currently available</p>
            </div>
        `;
        return;
    }
    
    const chargersHtml = chargers.map(charger => createChargerCard(charger)).join('');
    container.innerHTML = `<div class="chargers-grid">${chargersHtml}</div>`;
}

// Create charger card HTML
function createChargerCard(charger) {
    const statusClass = charger.isOnline ? 'online' : 'offline';
    const statusText = charger.isOnline ? 'Online' : 'Offline';
    const lastActive = charger.lastActiveTime;
    const timeAgo = lastActive ? getTimeAgo(lastActive) : 'Never';
    const lastActiveDate = lastActive ? lastActive.toLocaleDateString() : 'N/A';
    const lastActiveTimeStr = lastActive ? lastActive.toLocaleTimeString() : '';
    
    // Check if charging is active
    const isCharging = charger.activeTransaction !== null && charger.activeTransaction !== undefined;
    
    return `
        <div class="charger-card ${isCharging ? 'charging-active' : ''}" onclick="viewChargerLogs('${charger.deviceId}')">
            <div class="charger-card-header">
                <div>
                    <div class="charger-id">
                        <i class="fas fa-charging-station me-2"></i>${charger.deviceId}
                        ${isCharging ? `<span class="charging-badge-inline"><i class="fas fa-bolt fa-spin"></i></span>` : ''}
                    </div>
                    ${charger.name ? `<div class="text-muted mt-1">${charger.name}</div>` : ''}
                </div>
                <span class="status-badge ${statusClass}">
                    ${statusText}
                </span>
            </div>
            
            <div class="charger-info" style="margin-top: 10px;">
                <div class="boot-info-item">
                    <i class="fas fa-industry me-2"></i>
                    <span class="info-label">Vendor:</span>
                    <span class="boot-info-value">${charger.vendor || 'N/A'}</span>
                </div>
                <div class="boot-info-item">
                    <i class="fas fa-cube me-2"></i>
                    <span class="info-label">Model:</span>
                    <span class="boot-info-value">${charger.model || 'N/A'}</span>
                </div>
                <div class="boot-info-item">
                    <i class="fas fa-barcode me-2"></i>
                    <span class="info-label">Serial:</span>
                    <span class="boot-info-value">${charger.serialNumber || 'N/A'}</span>
                </div>
                <div class="boot-info-item">
                    <i class="fas fa-code-branch me-2"></i>
                    <span class="info-label">Firmware:</span>
                    <span class="boot-info-value">${charger.firmwareVersion || 'N/A'}</span>
                </div>
                <div class="boot-info-item">
                    <i class="fas fa-plug me-2"></i>
                    <span class="info-label">Connectors:</span>
                    <span class="boot-info-value">${charger.connectorCount ?? 'N/A'}</span>
                </div>
            </div>
            
            <div class="last-active">
                <div>
                    <div class="last-active-line">
                        <i class="fas fa-clock"></i>
                        <span class="last-active-time">Last Active: ${lastActiveDate}</span>
                    </div>
                    <div class="last-active-sub">${lastActiveTimeStr}</div>
                </div>
                <span class="time-ago">${timeAgo} ago</span>
            </div>
            
            <div class="charger-card-actions mt-3" style="display: flex; gap: 10px; justify-content: space-between;">
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); viewChargerLogs('${charger.deviceId}')" style="flex: 1;">
                    <i class="fas fa-list me-2"></i>View Logs
                </button>
                ${!isCharging ? `
                    <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); startCharging('${charger.deviceId}', this)" style="flex: 1;">
                        <i class="fas fa-play me-2"></i>Start Charging
                    </button>
                ` : (charger.activeTransaction && charger.activeTransaction.transactionId ? `
                    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); stopCharging('${charger.deviceId}', ${charger.activeTransaction.transactionId}, this)" style="flex: 1;">
                        <i class="fas fa-stop me-2"></i>Stop Charging
                    </button>
                ` : `
                    <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); startCharging('${charger.deviceId}', this)" style="flex: 1;">
                        <i class="fas fa-play me-2"></i>Start Charging
                    </button>
                `)}
            </div>
        </div>
    `;
}

// Get time ago string
function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

// View charger logs (clickable card)
function viewChargerLogs(deviceId) {
    window.location.href = `/charger-logs.html?deviceId=${encodeURIComponent(deviceId)}`;
}

// Show logs view
function showLogsView(deviceId) {
    // Not used anymore; logs open on dedicated page
}

// Show cards view
function showCardsView() {
    // Not used anymore; page only shows cards now
}

// Load charger logs
async function loadLogs(page = 1, deviceId = null) {
    // No longer used on this page
    if (isLoading) return;
    
    const targetDeviceId = deviceId || selectedDeviceId;
    
    try {
        isLoading = true;
        console.log(`📥 Loading page ${page}${targetDeviceId ? ` for device: ${targetDeviceId}` : ''}...`);
        
        // Build API URL with deviceId if present
        let apiUrl = `${API_BASE}/data?page=${page}&limit=100`;
        if (targetDeviceId) {
            apiUrl += `&deviceId=${encodeURIComponent(targetDeviceId)}`;
        }
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (data.success) {
            if (page === 1) {
                allLogs = data.data;
            } else {
                allLogs = [...allLogs, ...data.data];
            }
            
            currentPage = data.pagination.page;
            totalPages = data.pagination.pages;
            
            displayLogs();
            
            console.log(`✅ Loaded ${data.data.length} logs for page ${page}`);
        } else {
            throw new Error(data.error || 'Failed to load logs');
        }
    } catch (error) {
        console.error('❌ Error loading logs:', error);
        showAlert('Failed to load charger logs', 'danger');
    } finally {
        isLoading = false;
    }
}

// Display logs
function displayLogs() {
    const container = document.getElementById('logs-container');
    
    if (allLogs.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">No logs found</h5>
                <p class="text-muted">Try syncing data</p>
            </div>
        `;
        return;
    }
    
    const logsHtml = allLogs.map(log => createLogItem(log)).join('');
    const loadingHtml = isLoading ? `
        <div class="text-center py-3">
            <i class="fas fa-spinner fa-spin me-2"></i>Loading more data...
        </div>
    ` : '';
    
    const totalCountHtml = `
        <div class="text-center py-2">
            <small class="text-muted">Showing ${allLogs.length} records</small>
        </div>
    `;
    
    container.innerHTML = logsHtml + loadingHtml + totalCountHtml;
}

// Create log item HTML
function createLogItem(log) {
    const timestamp = new Date(log.timestamp).toLocaleString();
    const directionClass = log.direction === 'Incoming' ? 'direction-incoming' : 'direction-outgoing';
    const messageData = log.messageData ? JSON.stringify(log.messageData, null, 2) : 'No data';
    
    // Get message type icon
    const getMessageIcon = (message) => {
        switch(message) {
            case 'BootNotification': return 'fas fa-power-off';
            case 'StatusNotification': return 'fas fa-info-circle';
            case 'MeterValues': return 'fas fa-tachometer-alt';
            case 'StartTransaction': return 'fas fa-play';
            case 'StopTransaction': return 'fas fa-stop';
            case 'RemoteStartTransaction': return 'fas fa-play-circle';
            case 'RemoteStopTransaction': return 'fas fa-stop-circle';
            case 'ChangeConfiguration': return 'fas fa-cog';
            case 'Response': return 'fas fa-reply';
            default: return 'fas fa-comment';
        }
    };
    
    return `
        <div class="log-item">
            <div class="log-header">
                <div>
                    <div class="log-message">
                        <i class="${getMessageIcon(log.message)} me-2"></i>
                        ${log.message || 'Unknown'}
                    </div>
                    <div class="log-device">
                        <i class="fas fa-charging-station me-1"></i>${log.deviceId}
                        ${log.connectorId !== null ? `<span class="connector-badge ms-2">Connector ${log.connectorId}</span>` : ''}
                    </div>
                </div>
                <div class="text-end">
                    <div class="log-timestamp">${timestamp}</div>
                    <div class="log-direction ${directionClass}">${log.direction}</div>
                </div>
            </div>
            
            <div class="log-data">
                <strong>Message Data:</strong><br>
                <pre>${messageData}</pre>
            </div>
        </div>
    `;
}

// Handle scroll for infinite loading
function handleScroll() {
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.body.offsetHeight;
    const scrollPercent = (scrollTop + windowHeight) / documentHeight;
    
    // Trigger when 80% scrolled OR when very close to bottom
    if (scrollPercent >= 0.8 || (scrollTop + windowHeight) >= (documentHeight - 500)) {
        if (currentPage < totalPages && !isLoading && selectedDeviceId) {
            console.log('🔄 Auto-loading more data...');
            loadLogs(currentPage + 1, selectedDeviceId);
        }
    }
}

// Get active transaction for a charger
async function getActiveTransaction(deviceId) {
    try {
        // Get more data and sort by timestamp to ensure we have the latest
        const response = await fetch(`${API_BASE}/data?deviceId=${encodeURIComponent(deviceId)}&limit=2000`);
        const data = await response.json();
        
        if (!data.success || !data.data || !Array.isArray(data.data)) {
            console.warn(`⚠️ [getActiveTransaction] Invalid response for ${deviceId}`);
            return null;
        }
        
        // Sort by timestamp (descending) to get latest first, then by id as tiebreaker
        data.data.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt).getTime();
            const timeB = new Date(b.timestamp || b.createdAt).getTime();
            if (timeB !== timeA) return timeB - timeA; // Latest first
            return (b.id || 0) - (a.id || 0); // Higher ID first
        });
        
        // Find all StartTransaction messages (incoming from charger)
        const startTransactions = data.data.filter(log => 
            log.message === 'StartTransaction' && log.direction === 'Incoming'
        );
        
        if (startTransactions.length === 0) {
            return null;
        }
        
        // Get the latest StartTransaction (by timestamp first, then by id)
        const latestStart = startTransactions.reduce((latest, current) => {
            const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
            const currentTime = new Date(current.timestamp || current.createdAt).getTime();
            if (currentTime > latestTime) return current;
            if (currentTime < latestTime) return latest;
            // If same time, use ID
            const latestId = latest.id || 0;
            const currentId = current.id || 0;
            return currentId > latestId ? current : latest;
        });
        
        // CRITICAL: Check if StartTransaction is recent (within last 2 hours for real chargers)
        // Real chargers might have delays, so we use a longer window
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
        if (startTime < twoHoursAgo.getTime()) {
            console.log(`⚠️ [getActiveTransaction] StartTransaction too old for ${deviceId} (${new Date(startTime).toISOString()})`);
            return null; // Transaction is too old, consider it inactive
        }
        
        // Find the response to this StartTransaction (outgoing from server, same messageId)
        // BUT: For real chargers, if response not found, try to get transactionId from StartTransaction itself
        const startResponse = data.data.find(log => 
            log.message === 'Response' && 
            log.messageId === latestStart.messageId &&
            log.direction === 'Outgoing'
        );
        
        // Get transactionId - first try from response, then from StartTransaction itself (for real chargers)
        let transactionId = null;
        if (startResponse) {
            if (startResponse.messageData && startResponse.messageData.transactionId) {
                transactionId = startResponse.messageData.transactionId;
            } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
                transactionId = startResponse.raw[2].transactionId;
            }
        }
        
        // If not found in response, try to get from StartTransaction message itself (real chargers might send it differently)
        if (!transactionId && latestStart.messageData && latestStart.messageData.transactionId) {
            transactionId = latestStart.messageData.transactionId;
        } else if (!transactionId && latestStart.raw && Array.isArray(latestStart.raw)) {
            // Try to extract from raw OCPP message
            const payload = latestStart.raw[2];
            if (payload && payload.transactionId) {
                transactionId = payload.transactionId;
            }
        }
        
        if (!transactionId) {
            console.log(`⚠️ [getActiveTransaction] No transactionId found for ${deviceId} - StartTransaction: ${JSON.stringify(latestStart).substring(0, 200)}`);
            return null;
        }
        
        // Check for StopTransaction with same transactionId in all data (not just recent)
        const stopTransaction = data.data.find(log => 
            log.message === 'StopTransaction' && 
            log.direction === 'Incoming' &&
            (
                (log.messageData && log.messageData.transactionId === transactionId) || 
                (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
            )
        );
        
        // If no StopTransaction found, transaction is active
        if (!stopTransaction) {
            const connectorId = latestStart.connectorId || 
                               (latestStart.messageData && latestStart.messageData.connectorId) || 
                               (latestStart.raw && Array.isArray(latestStart.raw) && latestStart.raw[2] && latestStart.raw[2].connectorId) || 0;
            
            console.log(`✅ [getActiveTransaction] Active transaction found for ${deviceId}: transactionId=${transactionId}, connectorId=${connectorId}`);
            return {
                transactionId: transactionId,
                connectorId: connectorId,
                startTime: latestStart.timestamp || latestStart.createdAt
            };
        }
        
        return null;
    } catch (error) {
        console.error('❌ Error getting active transaction:', error);
        return null;
    }
}

// Global lock to prevent duplicate API calls
const chargingLocks = new Set(); // Set of deviceIds currently processing

// Start charging
async function startCharging(deviceId, button) {
    // CRITICAL: Prevent duplicate API calls - check global lock FIRST (synchronous check)
    // Use Set for O(1) lookup performance
    if (chargingLocks.has(deviceId)) {
        console.log(`⚠️ [DUPLICATE PREVENTED] Start charging already in progress for ${deviceId}, ignoring duplicate click`);
        return;
    }
    
    // Also check button state (additional protection)
    if (button && (button.disabled || button.dataset.processing === 'true')) {
        console.log(`⚠️ [DUPLICATE PREVENTED] Button already disabled for ${deviceId}, ignoring duplicate click`);
        return;
    }
    
    // Set global lock IMMEDIATELY (synchronous) - BEFORE any async operations
    // This MUST happen synchronously to prevent race conditions
    chargingLocks.add(deviceId);
    console.log(`🔒 [LOCK SET] Start charging lock set for ${deviceId} at ${Date.now()}`);
    
    // Log API call attempt
    console.log(`📤 [API CALL] Starting RemoteStartTransaction for ${deviceId} at ${new Date().toISOString()}`);
    
    try {
        // Disable button and show loading
        const originalText = button.innerHTML;
        button.disabled = true;
        button.dataset.processing = 'true';
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Starting...';
        
        // CRITICAL: For live chargers, StartTransaction arrives AFTER RemoteStartTransaction
        // So we start checking IMMEDIATELY after API call, not after response
        // This way we detect charging as soon as charger sends StartTransaction
        
        let checkStarted = false;
        let checkCompleted = false;
        let successShown = false;
        
        // Start checking for StartTransaction IMMEDIATELY (don't wait for API response)
        const startChecking = async () => {
            if (checkStarted) return; // Prevent multiple checks
            checkStarted = true;
            
            console.log(`🔍 [IMMEDIATE CHECK] Starting immediate check for ${deviceId}...`);
            
            // Check every 2 seconds for up to 30 seconds (15 checks)
            let checkCount = 0;
            const maxChecks = 15; // 15 checks = 30 seconds total
            const checkInterval = 2000; // 2 seconds
            
            const checkChargingStatus = async () => {
                if (checkCompleted || successShown) return; // Stop if already completed
                
                checkCount++;
                console.log(`🔍 [IMMEDIATE CHECK] Checking charging status (attempt ${checkCount}/${maxChecks}) for ${deviceId}`);
                
                const quickCheck = await getActiveTransaction(deviceId);
                if (quickCheck) {
                    // Found StartTransaction! Show success immediately
                    if (!successShown) {
                        successShown = true;
                        checkCompleted = true;
                        showAlert('Charging started successfully', 'success');
                        chargingLocks.delete(deviceId);
                        console.log(`✅ [IMMEDIATE CHECK] Found active transaction: ${quickCheck.transactionId}`);
                        // Wait a bit for database to sync before reloading UI
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await loadChargers();
                        // Reset button state
                        if (button && button.parentNode) {
                            button.dataset.processing = 'false';
                        }
                    }
                    return; // Stop checking
                }
                
                // If no active transaction yet, check again if we haven't exceeded max checks
                if (checkCount < maxChecks && !checkCompleted) {
                    setTimeout(checkChargingStatus, checkInterval);
                } else if (checkCount >= maxChecks && !successShown) {
                    // No StartTransaction found after 30 seconds - check completed but no success
                    checkCompleted = true;
                    console.log(`⏳ [IMMEDIATE CHECK] No StartTransaction found after ${maxChecks} checks, waiting for API response...`);
                    // Don't show error here - wait for API response to determine if it's a timeout or error
                }
            };
            
            // Start checking after 1 second (give charger time to process RemoteStartTransaction)
            setTimeout(checkChargingStatus, 1000);
        };
        
        // Start checking immediately (in parallel with API call)
        startChecking();
        
        // Make API call (but don't block on it - check is already running)
        const response = await fetch(`${API_BASE}/remote-start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                deviceId: deviceId,
                connectorId: 1, // Default to connector 1
                idTag: Date.now().toString() // Generate a unique idTag
            })
        });
        
        // Parse JSON response, handle errors
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            // If check already found charging, don't show error
            if (successShown) {
                return; // Exit early, success already shown
            }
            throw new Error(`Server response error (${response.status}): ${response.statusText}`);
        }
        
        // If check already found charging, don't process API response
        if (successShown) {
            return; // Exit early, success already shown
        }
        
        if (data.success) {
            // API response came back first - show success
            if (!successShown) {
                successShown = true;
                checkCompleted = true;
                showAlert('Charging started successfully', 'success');
                // Wait more for database to sync before reloading UI (real chargers need more time)
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Reload chargers to update UI (this will reset button state)
                await loadChargers();
                // Clear global lock
                chargingLocks.delete(deviceId);
                console.log(`🔓 [LOCK CLEARED] Start charging lock cleared for ${deviceId}`);
                // Reset processing flag after reload
                if (button && button.parentNode) {
                    button.dataset.processing = 'false';
                }
            }
        } else if (response.status === 408) {
            // Timeout error - but we already started checking, so just wait for check to complete
            // If check already found charging, success already shown
            if (successShown) {
                return; // Exit early, success already shown
            }
            
            // If check is still running, do one final immediate check
            if (!checkCompleted) {
                console.log(`⚠️ [TIMEOUT] Received 408 timeout for ${deviceId}, doing final check...`);
                // Do one final immediate check
                const finalCheck = await getActiveTransaction(deviceId);
                if (finalCheck) {
                    // Found it! Show success immediately
                    if (!successShown) {
                        successShown = true;
                        checkCompleted = true;
                        showAlert('Charging started successfully', 'success');
                        chargingLocks.delete(deviceId);
                        console.log(`✅ [TIMEOUT] Found active transaction: ${finalCheck.transactionId}`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await loadChargers();
                        if (button && button.parentNode) {
                            button.dataset.processing = 'false';
                        }
                    }
                    return; // Exit early, success shown
                }
                // No StartTransaction found - show error
                checkCompleted = true;
                console.log(`⚠️ [TIMEOUT] No StartTransaction found after timeout for ${deviceId}`);
                showAlert('Charging did not start. The charger may be busy or offline. Please try again.', 'danger');
                button.innerHTML = originalText;
                button.disabled = false;
                button.dataset.processing = 'false';
                chargingLocks.delete(deviceId);
                console.log(`❌ [TIMEOUT] Charging confirmed NOT started for ${deviceId}`);
                return; // Exit early
            }
            
            // Check completed but no StartTransaction found - show error
            if (!successShown) {
                console.log(`⚠️ [TIMEOUT] Received 408 timeout and check completed with no StartTransaction for ${deviceId}`);
                showAlert('Charging did not start. The charger may be busy or offline. Please try again.', 'danger');
                button.innerHTML = originalText;
                button.disabled = false;
                button.dataset.processing = 'false';
                chargingLocks.delete(deviceId);
                console.log(`❌ [TIMEOUT] Charging confirmed NOT started for ${deviceId}`);
            }
            return; // Exit early
        } else {
            // Show specific error message from API
            showAlert(data.error || 'Failed to start charging', 'danger');
            button.innerHTML = originalText;
            button.disabled = false;
            button.dataset.processing = 'false';
            // Clear global lock
            chargingLocks.delete(deviceId);
            console.log(`🔓 [LOCK CLEARED] Start charging lock cleared for ${deviceId}`);
        }
    } catch (error) {
        console.error('❌ Error starting charging:', error);
        // Handle network errors or parsing errors
        if (error instanceof TypeError && error.message.includes('fetch')) {
            showAlert('Network error: Please check your connection', 'danger');
        } else {
            showAlert('Failed to start charging: ' + (error.message || 'Unknown error'), 'danger');
        }
        button.innerHTML = originalText;
        button.disabled = false;
        button.dataset.processing = 'false';
        // Clear global lock on error
        chargingLocks.delete(deviceId);
    }
}

// Stop charging
async function stopCharging(deviceId, transactionId, button) {
    // Prevent double-click - check global lock first (synchronous check)
    const stopLockKey = `${deviceId}_stop`;
    if (chargingLocks.has(stopLockKey)) {
        console.log(`⚠️ [DUPLICATE PREVENTED] Stop charging already in progress for ${deviceId}, ignoring duplicate click`);
        return;
    }
    
    // Also check button state (additional protection)
    if (button && (button.disabled || button.dataset.processing === 'true')) {
        console.log(`⚠️ [DUPLICATE PREVENTED] Button already disabled for ${deviceId}, ignoring duplicate click`);
        return;
    }
    
    // Set global lock IMMEDIATELY (synchronous) - BEFORE any async operations
    chargingLocks.add(stopLockKey);
    console.log(`🔒 [LOCK SET] Stop charging lock set for ${deviceId} at ${Date.now()}`);
    
    // Log API call attempt
    console.log(`📤 [API CALL] Starting RemoteStopTransaction for ${deviceId} at ${new Date().toISOString()}`);
    
    try {
        // Disable button and show loading
        const originalText = button.innerHTML;
        button.disabled = true;
        button.dataset.processing = 'true';
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Stopping...';
        
        // CRITICAL: For live chargers, StopTransaction arrives AFTER RemoteStopTransaction
        // So we start checking IMMEDIATELY after API call, not after response
        // This way we detect charging stopped as soon as charger sends StopTransaction
        
        let checkStarted = false;
        let checkCompleted = false;
        let successShown = false;
        
        // Start checking for StopTransaction IMMEDIATELY (don't wait for API response)
        const startChecking = async () => {
            if (checkStarted) return; // Prevent multiple checks
            checkStarted = true;
            
            console.log(`🔍 [IMMEDIATE CHECK] Starting immediate check for stop ${deviceId}...`);
            
            // Check every 2 seconds for up to 30 seconds (15 checks)
            let checkCount = 0;
            const maxChecks = 15; // 15 checks = 30 seconds total
            const checkInterval = 2000; // 2 seconds
            
            const checkChargingStatus = async () => {
                if (checkCompleted || successShown) return; // Stop if already completed
                
                checkCount++;
                console.log(`🔍 [IMMEDIATE CHECK] Checking if charging stopped (attempt ${checkCount}/${maxChecks}) for ${deviceId}`);
                
                const quickCheck = await getActiveTransaction(deviceId);
                if (!quickCheck) {
                    // No active transaction found - charging stopped! Show success immediately
                    if (!successShown) {
                        successShown = true;
                        checkCompleted = true;
                        showAlert('Charging stopped successfully', 'success');
                        chargingLocks.delete(stopLockKey);
                        console.log(`✅ [IMMEDIATE CHECK] Charging stopped for ${deviceId}`);
                        // Wait a bit for database to sync before reloading UI
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await loadChargers();
                        // Reset button state
                        if (button && button.parentNode) {
                            button.dataset.processing = 'false';
                        }
                    }
                    return; // Stop checking
                }
                
                // If charging still active, check again if we haven't exceeded max checks
                if (checkCount < maxChecks && !checkCompleted) {
                    setTimeout(checkChargingStatus, checkInterval);
                } else if (checkCount >= maxChecks && !successShown) {
                    // Charging still active after 30 seconds - will wait for API response
                    checkCompleted = true;
                    console.log(`⏳ [IMMEDIATE CHECK] Charging still active after ${maxChecks} checks, waiting for API response...`);
                }
            };
            
            // Start checking after 1 second (give charger time to process RemoteStopTransaction)
            setTimeout(checkChargingStatus, 1000);
        };
        
        // Start checking immediately (in parallel with API call)
        startChecking();
        
        // Make API call (but don't block on it - check is already running)
        const response = await fetch(`${API_BASE}/remote-stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                deviceId: deviceId,
                transactionId: transactionId
            })
        });
        
        // Parse JSON response, handle errors
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            // If check already found charging stopped, don't show error
            if (successShown) {
                return; // Exit early, success already shown
            }
            throw new Error(`Server response error (${response.status}): ${response.statusText}`);
        }
        
        // If check already found charging stopped, don't process API response
        if (successShown) {
            return; // Exit early, success already shown
        }
        
        if (data.success) {
            // API response came back first - show success
            if (!successShown) {
                successShown = true;
                checkCompleted = true;
                showAlert('Charging stopped successfully', 'success');
                // Wait more for database to sync before reloading UI (real chargers need more time)
                await new Promise(resolve => setTimeout(resolve, 1000));
                // Reload chargers to update UI (this will reset button state)
                await loadChargers();
                // Clear global lock
                chargingLocks.delete(stopLockKey);
                console.log(`🔓 [LOCK CLEARED] Stop charging lock cleared for ${deviceId}`);
                // Reset processing flag after reload
                if (button && button.parentNode) {
                    button.dataset.processing = 'false';
                }
            }
        } else if (response.status === 408) {
            // Timeout error - but we already started checking, so just wait for check to complete
            // If check already found charging stopped, success already shown
            if (successShown) {
                return; // Exit early, success already shown
            }
            
            // If check is still running, do one final immediate check
            if (!checkCompleted) {
                console.log(`⚠️ [TIMEOUT] Received 408 timeout for stop ${deviceId}, doing final check...`);
                // Do one final immediate check
                const finalCheck = await getActiveTransaction(deviceId);
                if (!finalCheck) {
                    // Charging stopped! Show success immediately
                    if (!successShown) {
                        successShown = true;
                        checkCompleted = true;
                        showAlert('Charging stopped successfully', 'success');
                        chargingLocks.delete(stopLockKey);
                        console.log(`✅ [TIMEOUT] Charging stopped for ${deviceId}`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await loadChargers();
                        if (button && button.parentNode) {
                            button.dataset.processing = 'false';
                        }
                    }
                    return; // Exit early, success shown
                }
                // Charging still active - show error
                checkCompleted = true;
                console.log(`⚠️ [TIMEOUT] Charging still active after timeout for ${deviceId}`);
                showAlert('Charging did not stop. The charger may be busy or offline. Please try again.', 'danger');
                button.innerHTML = originalText;
                button.disabled = false;
                button.dataset.processing = 'false';
                chargingLocks.delete(stopLockKey);
                console.log(`❌ [TIMEOUT] Charging confirmed NOT stopped for ${deviceId}`);
                return; // Exit early
            }
            
            // Check completed but charging still active - show error
            if (!successShown) {
                console.log(`⚠️ [TIMEOUT] Received 408 timeout and check completed but charging still active for ${deviceId}`);
                showAlert('Charging did not stop. The charger may be busy or offline. Please try again.', 'danger');
                button.innerHTML = originalText;
                button.disabled = false;
                button.dataset.processing = 'false';
                chargingLocks.delete(stopLockKey);
                console.log(`❌ [TIMEOUT] Charging confirmed NOT stopped for ${deviceId}`);
            }
            return; // Exit early
        } else {
            // Show specific error message from API
            if (!successShown) {
                showAlert(data.error || 'Failed to stop charging', 'danger');
                button.innerHTML = originalText;
                button.disabled = false;
                button.dataset.processing = 'false';
                // Clear global lock
                chargingLocks.delete(stopLockKey);
                console.log(`🔓 [LOCK CLEARED] Stop charging lock cleared for ${deviceId}`);
            }
        }
    } catch (error) {
        console.error('❌ Error stopping charging:', error);
        // Show better error message (only if success not already shown)
        if (!successShown) {
            showAlert('Failed to stop charging: ' + (error.message || 'Unknown error'), 'danger');
            button.innerHTML = originalText;
            button.disabled = false;
            button.dataset.processing = 'false';
        }
        // Clear global lock on error
        chargingLocks.delete(stopLockKey);
    }
}

// Update last updated time
function updateLastUpdated() {
    const lastUpdatedEl = document.getElementById('last-updated');
    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    }
}

// Show alert
function showAlert(message, type, returnId = false) {
    const container = document.getElementById('alert-container');
    if (!container) return returnId ? null : undefined;
    
    const alertId = 'alert-' + Date.now();
    const alertHtml = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'exclamation-circle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // For warnings with returnId, append (don't replace) to allow multiple alerts
    // For others, replace existing alert
    if (type === 'warning' && returnId) {
        container.innerHTML += alertHtml; // Append warning alerts
    } else {
        container.innerHTML = alertHtml; // Replace existing alert
    }
    
    // Auto-dismiss after 5 seconds (except for warnings that might be dismissed manually)
    if (type !== 'warning' || !returnId) {
        setTimeout(() => {
            const alert = document.getElementById(alertId);
            if (alert) {
                alert.remove();
            }
        }, 5000);
    }
    
    // Return alert ID if requested (for manual dismissal)
    if (returnId) {
        return alertId;
    }
}

// Dismiss alert by ID
function dismissAlert(alertId) {
    const alert = document.getElementById(alertId);
    if (alert) {
        // Use Bootstrap's dismiss method if available, otherwise just remove
        try {
            const bsAlert = bootstrap?.Alert?.getOrCreateInstance(alert);
            if (bsAlert) {
                bsAlert.close();
            } else {
                alert.remove();
            }
        } catch (e) {
            // Fallback: just remove the alert
            alert.remove();
        }
    }
}
