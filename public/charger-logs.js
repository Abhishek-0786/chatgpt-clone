// Global variables
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let allLogs = [];
let filteredLogs = [];
let currentFilters = {
    deviceId: '',
    message: '',
    direction: '',
    connectorId: ''
};

// API Base URL
const API_BASE = '/api/charger';

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Charger logs page loaded');
    checkAuthAndInitialize();
});

// Check authentication before initializing page
async function checkAuthAndInitialize() {
    try {
        console.log('🔐 Checking authentication...');
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            // User is not logged in - show error and redirect
            console.log('❌ No token found');
            showAuthError();
            return;
        }
        
        console.log('🔑 Token found, verifying...');
        
        // Verify token is valid by checking with backend
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('📡 Auth response status:', response.status);
        
        if (response.ok) {
            // User is authenticated - proceed with initialization
            console.log('✅ User authenticated successfully');
            await initializePage();
        } else {
            // Token is invalid - show error and redirect
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
    // Check if body already has an error message
    if (document.body.innerHTML.includes('Authentication Required')) {
        return; // Already showing error, don't replace again
    }
    
    // Hide the entire page content
    const existingContent = document.body.innerHTML;
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
            <p>You need to login first to access charger logs.</p>
            <a href="/">
                <i class="fas fa-arrow-left me-2" style="color: white; margin-bottom:0px;"></i>Go to Login
            </a>
        </div>
    `;
}

// Initialize page
async function initializePage() {
    try {
        // Load existing data first (if any)
        console.log('🔄 Loading existing data...');
        await loadLogs();
        
        // Setup event listeners
        setupEventListeners();
        
        // Optional: background import only when explicitly requested via URL (?import=1)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('import') === '1') {
            console.log('🔄 Starting background import...');
            autoImportData(); // Don't await - run in background
        }
        
        console.log('✅ Page initialized successfully');
    } catch (error) {
        console.error('❌ Initialization error:', error);
        showAlert('Failed to initialize page', 'danger');
    }
}

// Auto-import data function (background)
async function autoImportData() {
    try {
        console.log('🔄 Starting background import...');
        showAlert('🔄 Background import started... New data will appear as it loads.', 'info');
        
        const response = await fetch(`${API_BASE}/sync`);
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Background import completed: ${data.syncedRecords} records imported`);
            if (data.syncedRecords > 0) {
                showAlert(`✅ Background import completed: ${data.syncedRecords} new records added!`, 'success');
                // Reload data to show new records
                allLogs = [];
                currentPage = 1;
                await loadLogs();
            } else {
                showAlert(`ℹ️ All data already imported: ${data.totalRecords} records available`, 'info');
            }
        } else {
            console.log('⚠️ Background import failed:', data.error);
            showAlert(`⚠️ Background import failed: ${data.error}`, 'warning');
        }
    } catch (error) {
        console.error('❌ Background import error:', error);
        showAlert('❌ Background import failed: Please refresh page', 'danger');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Infinite scroll
    window.addEventListener('scroll', handleScroll);
}

// Load statistics (simplified - no stats display needed)
async function loadStats() {
    try {
        // Just check if data is available, no need to display stats
        const response = await fetch(`${API_BASE}/data?page=1&limit=1`);
        const data = await response.json();
        
        if (data.success) {
            console.log(`📊 Total logs available: ${data.pagination.total}`);
        }
    } catch (error) {
        console.error('❌ Error loading stats:', error);
    }
}

// Get deviceId from URL parameter
function getDeviceIdFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('deviceId');
}

// Load charger logs
async function loadLogs(page = 1) {
    if (isLoading) return;
    
    try {
        isLoading = true;
        const deviceId = getDeviceIdFromURL();
        console.log(`📥 Loading page ${page}${deviceId ? ` for device: ${deviceId}` : ''}...`);
        
        // Build API URL with deviceId if present (increased limit to show all messages)
        let apiUrl = `${API_BASE}/data?page=${page}&limit=1000`;
        if (deviceId) {
            apiUrl += `&deviceId=${encodeURIComponent(deviceId)}`;
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
            
            // Update page title if deviceId is present
            if (deviceId) {
                updatePageTitle(deviceId);
            }
            
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

// Update page title with device ID
function updatePageTitle(deviceId) {
    const pageTitle = document.querySelector('.page-title');
    if (pageTitle) {
        pageTitle.innerHTML = `
            <i class="fas fa-charging-station me-2"></i>
            Charger Logs - ${deviceId}
        `;
    }
}

// Display logs
function displayLogs() {
    const container = document.getElementById('logs-container');
    
    // Reverse the array so newest messages appear first (sequence 1 will be last)
    const reversedLogs = [...allLogs].reverse();
    
    if (reversedLogs.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                <h5 class="text-muted">No logs found</h5>
                <p class="text-muted">Try syncing data</p>
            </div>
        `;
        return;
    }
    
    const logsHtml = reversedLogs.map(log => createLogItem(log)).join('');
    const loadingHtml = isLoading ? `
        <div class="text-center py-3">
            <i class="fas fa-spinner fa-spin me-2"></i>Loading more data...
        </div>
    ` : '';
    
    const totalCountHtml = `
        <div class="text-center py-2">
            <small class="text-muted">Showing ${reversedLogs.length} records</small>
        </div>
    `;
    
    container.innerHTML = logsHtml + loadingHtml + totalCountHtml;
}

// Create log item HTML
function createLogItem(log) {
    const timestamp = new Date(log.timestamp).toLocaleString();
    const directionClass = log.direction === 'Incoming' ? 'direction-incoming' : 'direction-outgoing';
    // Format messageData - if null/undefined, show {} for Response messages, otherwise show the data
    let messageData = 'No data';
    if (log.messageData !== null && log.messageData !== undefined) {
        if (typeof log.messageData === 'object' && Object.keys(log.messageData).length === 0) {
            messageData = '{}'; // Empty object for StatusNotification responses
        } else {
            messageData = JSON.stringify(log.messageData, null, 2);
        }
    } else if (log.message === 'Response') {
        messageData = '{}'; // Default empty object for Response messages without messageData
    }
    
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
    
    // Add direction class to log-item for border color
    const directionItemClass = log.direction === 'Incoming' ? 'incoming' : 'outgoing';
    
    // Format raw array for display - handle both string and object formats
    let rawData = null;
    try {
        if (log.raw) {
            if (typeof log.raw === 'string') {
                rawData = JSON.parse(log.raw);
            } else {
                rawData = log.raw;
            }
        }
    } catch (e) {
        console.warn('Error parsing raw data:', e);
        rawData = log.raw; // Use as-is if parsing fails
    }
    
    // Format timestamps for display
    const createdAt = log.createdAt ? new Date(log.createdAt).toISOString() : log.timestamp ? new Date(log.timestamp).toISOString() : null;
    const updatedAt = log.updatedAt ? new Date(log.updatedAt).toISOString() : log.timestamp ? new Date(log.timestamp).toISOString() : null;
    
    // Build complete log object for display (matching user's JSON format exactly)
    const fullLogData = {
        deviceId: log.deviceId || null,
        type: log.type || 'OCPP',
        connectorId: log.connectorId !== null && log.connectorId !== undefined ? log.connectorId : 0,
        messageId: log.messageId || null,
        message: log.message || 'Unknown',
        messageData: log.messageData !== null && log.messageData !== undefined ? log.messageData : {},
        raw: rawData !== null ? rawData : [],
        direction: log.direction || 'Unknown',
        createdAt: createdAt,
        updatedAt: updatedAt
    };
    
    return `
        <div class="log-item ${directionItemClass}">
            <div class="log-header">
                <div>
                    <div class="log-message">
                        <i class="${getMessageIcon(log.message)} me-2"></i>
                        ${log.message || 'Unknown'}
                    </div>
                    <div class="log-device">
                        <i class="fas fa-charging-station me-1"></i>${log.deviceId}
                        ${log.connectorId !== null && log.connectorId !== undefined ? `<span class="connector-badge ms-2">Connector ${log.connectorId}</span>` : ''}
                    </div>
                </div>
                <div class="text-end">
                    <div class="log-timestamp">${timestamp}</div>
                    <div class="log-direction ${directionClass}">${log.direction}</div>
                </div>
            </div>
            
            <div class="log-data">
                <pre style="max-height: 500px; overflow-y: auto;">${JSON.stringify(fullLogData, null, 2)}</pre>
            </div>
        </div>
    `;
}

// Update statistics (simplified - no stats display needed)
function updateStats() {
    const incomingCount = allLogs.filter(log => log.direction === 'Incoming').length;
    const outgoingCount = allLogs.filter(log => log.direction === 'Outgoing').length;
    
    // Just log the stats, don't try to update non-existent elements
    console.log(`📊 Stats: ${incomingCount} incoming, ${outgoingCount} outgoing`);
}

// Handle scroll for infinite loading
function handleScroll() {
    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.body.offsetHeight;
    const scrollPercent = (scrollTop + windowHeight) / documentHeight;
    
    console.log(`📊 Scroll: ${Math.round(scrollPercent * 100)}% - Page: ${currentPage}/${totalPages} - Loading: ${isLoading}`);
    
    // Trigger when 80% scrolled OR when very close to bottom
    if (scrollPercent >= 0.8 || (scrollTop + windowHeight) >= (documentHeight - 500)) {
        if (currentPage < totalPages && !isLoading) {
            console.log('🔄 Auto-loading more data...');
            loadLogs(currentPage + 1);
        } else if (currentPage >= totalPages) {
            console.log('✅ All pages loaded - no more data');
        }
    }
}



// Show alert
function showAlert(message, type) {
    const container = document.getElementById('alert-container');
    const alertId = 'alert-' + Date.now();
    
    const alertHtml = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', alertHtml);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            alert.remove();
        }
    }, 5000);
}

// Auto-refresh every 30 seconds
setInterval(async () => {
    if (!isLoading) {
        console.log('🔄 Auto-refreshing data...');
        await loadStats();
        // Only reload first page to avoid duplicates
        if (currentPage === 1) {
            await loadLogs(1);
        }
    }
}, 30000);

