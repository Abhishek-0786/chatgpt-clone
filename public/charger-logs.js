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
    initializePage();
});

// Initialize page
async function initializePage() {
    try {
        // Load existing data first (if any)
        console.log('🔄 Loading existing data...');
        await loadLogs();
        
        // Setup event listeners
        setupEventListeners();
        
        // Start background import
        console.log('🔄 Starting background import...');
        autoImportData(); // Don't await - run in background
        
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

// Load charger logs
async function loadLogs(page = 1) {
    if (isLoading) return;
    
    try {
        isLoading = true;
        console.log(`📥 Loading page ${page}...`);
        
        const response = await fetch(`${API_BASE}/data?page=${page}&limit=100`);
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
