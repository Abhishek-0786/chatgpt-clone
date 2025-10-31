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
            // Auto-refresh every 30 seconds
            setInterval(loadChargers, 30000);
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
                    
                    return {
                        ...charger,
                        lastActiveTime: lastActiveTime,
                        isOnline: isOnline
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
    const lastActiveTime = lastActive ? lastActive.toLocaleTimeString() : '';
    
    return `
        <div class="charger-card" onclick="viewChargerLogs('${charger.deviceId}')">
            <div class="charger-card-header">
                <div>
                    <div class="charger-id">
                        <i class="fas fa-charging-station me-2"></i>${charger.deviceId}
                    </div>
                    ${charger.name ? `<div class="text-muted mt-1">${charger.name}</div>` : ''}
                </div>
                <span class="status-badge ${statusClass}">
                    ${statusText}
                </span>
            </div>
            
            <div class="charger-info">
                <div class="info-item">
                    <i class="fas fa-bolt"></i>
                    <span class="info-label">Power:</span>
                    <span>${charger.powerRating ?? 'N/A'}</span>
                </div>
                <div class="info-item">
                    <i class="fas fa-plug"></i>
                    <span class="info-label">Connectors:</span>
                    <span>${charger.connectorCount ?? 'N/A'}</span>
                </div>
            </div>
            
            <div class="last-active">
                <div>
                    <div class="last-active-line">
                        <i class="fas fa-clock"></i>
                        <span class="last-active-time">Last Active: ${lastActiveDate}</span>
                    </div>
                    <div class="last-active-sub">${lastActiveTime}</div>
                </div>
                <span class="time-ago">${timeAgo} ago</span>
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

// Update last updated time
function updateLastUpdated() {
    const lastUpdatedEl = document.getElementById('last-updated');
    if (lastUpdatedEl) {
        lastUpdatedEl.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    }
}

// Show alert
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    if (!container) return;
    
    const alertId = 'alert-' + Date.now();
    const alertHtml = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', alertHtml);
    
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            alert.remove();
        }
    }, 5000);
}
