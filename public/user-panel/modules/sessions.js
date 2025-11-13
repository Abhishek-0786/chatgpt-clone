// Sessions Module - User's Charging History
import { updateActiveNav, updatePageTitle } from '../app.js';
import { getSessions } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

export async function loadSessionsModule() {
    updateActiveNav('sessions');
    updatePageTitle('My Sessions');
    
    const appMain = document.getElementById('appMain');
    
    // Set max date to today (disable future dates)
    const today = new Date().toISOString().split('T')[0];
    
    appMain.innerHTML = `
        <div class="sessions-container">
            <!-- Date Filter -->
            <div class="card" style="margin-bottom: 16px;">
                <h3 class="card-title">Filter by Date</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" style="font-size: 12px; margin-bottom: 4px;">From Date</label>
                        <input type="date" class="form-input" id="fromDateFilter" style="padding: 10px; font-size: 14px;" max="${today}" onchange="window.applyDateFilter()">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label" style="font-size: 12px; margin-bottom: 4px;">To Date</label>
                        <input type="date" class="form-input" id="toDateFilter" style="padding: 10px; font-size: 14px;" max="${today}" onchange="window.applyDateFilter()">
                    </div>
                </div>
                <button class="btn btn-outline btn-full" onclick="window.clearDateFilter()" style="padding: 8px; font-size: 14px;">
                    <i class="fas fa-times"></i> Clear Filter
                </button>
            </div>
            
            <!-- Sessions List -->
            <div id="sessionsList">
                <div class="spinner"></div>
            </div>
        </div>
    `;
    
    // Load only completed sessions
    await loadSessions('completed');
}


// Load sessions
async function loadSessions(filter = 'completed', dateFilter = null) {
    try {
        const params = { status: 'completed' }; // Only load completed sessions
        
        // TEMPORARY: Mock data for testing
        // TODO: Remove this and use real API
        const allMockSessions = [
            {
                sessionId: 'SESS-001',
                stationName: 'Spring House Station',
                startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'completed',
                energy: 15.5,
                sessionDuration: '2h 30m',
                billedAmount: 250.50
            },
            {
                sessionId: 'SESS-002',
                stationName: 'Modern EV Charging',
                startTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'completed',
                energy: 8.2,
                sessionDuration: '1h 15m',
                billedAmount: 132.00
            },
            {
                sessionId: 'SESS-003',
                stationName: 'Spring House Station',
                startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'completed',
                energy: 22.8,
                sessionDuration: '3h 45m',
                billedAmount: 365.20
            },
            {
                sessionId: 'SESS-004',
                stationName: 'EV Power Station',
                startTime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'completed',
                energy: 12.3,
                sessionDuration: '1h 45m',
                billedAmount: 198.50
            },
            {
                sessionId: 'SESS-005',
                stationName: 'Green Energy Hub',
                startTime: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'completed',
                energy: 18.7,
                sessionDuration: '2h 15m',
                billedAmount: 301.20
            }
        ];
        
        // Apply date filter if provided
        let mockSessions = allMockSessions;
        if (dateFilter && (dateFilter.fromDate || dateFilter.toDate)) {
            mockSessions = allMockSessions.filter(session => {
                const sessionDate = new Date(session.startTime);
                sessionDate.setHours(0, 0, 0, 0);
                
                if (dateFilter.fromDate) {
                    const fromDate = new Date(dateFilter.fromDate);
                    fromDate.setHours(0, 0, 0, 0);
                    if (sessionDate < fromDate) return false;
                }
                
                if (dateFilter.toDate) {
                    const toDate = new Date(dateFilter.toDate);
                    toDate.setHours(23, 59, 59, 999);
                    if (sessionDate > toDate) return false;
                }
                
                return true;
            });
        }
        
        const container = document.getElementById('sessionsList');
        
        // Uncomment below when backend is ready:
        // const response = await getSessions(params);
        // if (response.success && response.sessions && response.sessions.length > 0) {
        
        if (mockSessions && mockSessions.length > 0) {
            container.innerHTML = mockSessions.map(session => `
                <div class="card" style="cursor: pointer;" onclick="window.viewSessionDetail('${session.sessionId}')">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 4px;">${session.stationName || 'Station'}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                ${formatDate(session.startTime)}
                            </div>
                        </div>
                        <span class="badge ${session.status === 'active' ? 'badge-success' : 'badge-info'}">
                            ${session.status || 'Completed'}
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 12px;">
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Energy</div>
                            <div style="font-size: 16px; font-weight: 600;">${parseFloat(session.energy || 0).toFixed(2)} kWh</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Duration</div>
                            <div style="font-size: 16px; font-weight: 600;">${session.sessionDuration || 'N/A'}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Cost</div>
                            <div style="font-size: 16px; font-weight: 600;">₹${parseFloat(session.billedAmount || 0).toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <h3>No Sessions Found</h3>
                    <p>Your charging sessions will appear here</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        showError('Failed to load sessions');
        document.getElementById('sessionsList').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Sessions</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Apply date filter
window.applyDateFilter = async function() {
    const fromDateInput = document.getElementById('fromDateFilter');
    const toDateInput = document.getElementById('toDateFilter');
    
    const fromDate = fromDateInput?.value || null;
    const toDate = toDateInput?.value || null;
    
    // Update To Date min when From Date changes
    if (fromDate && toDateInput) {
        toDateInput.min = fromDate;
        // If To Date is before From Date, clear it
        if (toDate && new Date(toDate) < new Date(fromDate)) {
            showError('To Date cannot be before From Date');
            toDateInput.value = '';
            return;
        }
    } else if (toDateInput) {
        // Reset min when From Date is cleared
        const today = new Date().toISOString().split('T')[0];
        toDateInput.min = '';
    }
    
    // Update From Date max when To Date changes
    if (toDate && fromDateInput) {
        fromDateInput.max = toDate;
        // If From Date is after To Date, clear it
        if (fromDate && new Date(fromDate) > new Date(toDate)) {
            showError('From Date cannot be after To Date');
            fromDateInput.value = '';
            return;
        }
    } else if (fromDateInput) {
        // Reset max when To Date is cleared
        const today = new Date().toISOString().split('T')[0];
        fromDateInput.max = today;
    }
    
    const dateFilter = {
        fromDate: fromDate,
        toDate: toDate
    };
    
    await loadSessions('completed', dateFilter);
};

// Clear date filter
window.clearDateFilter = async function() {
    const fromDateInput = document.getElementById('fromDateFilter');
    const toDateInput = document.getElementById('toDateFilter');
    const today = new Date().toISOString().split('T')[0];
    
    if (fromDateInput) {
        fromDateInput.value = '';
        fromDateInput.max = today;
    }
    if (toDateInput) {
        toDateInput.value = '';
        toDateInput.min = '';
        toDateInput.max = today;
    }
    
    await loadSessions('completed', null);
};

// View session detail
window.viewSessionDetail = function(sessionId) {
    // TODO: Navigate to session detail page
    console.log('View session detail:', sessionId);
};

