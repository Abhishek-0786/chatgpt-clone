// Sessions Module - User's Charging History
import { updateActiveNav, updatePageTitle } from '../app.js';
import { getSessions } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

// Global state for infinite scrolling
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
let hasMorePages = true;
let currentDateFilter = null;
let scrollObserver = null;

export async function loadSessionsModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'sessions');
    
    // Reset state
    currentPage = 1;
    totalPages = 1;
    isLoading = false;
    hasMorePages = true;
    currentDateFilter = null;
    
    // Disconnect existing observer if any
    if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
    }
    
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
            <!-- Sentinel element for infinite scroll (always visible) -->
            <div id="sessionsScrollSentinel" style="height: 20px;"></div>
            <!-- Loading indicator for infinite scroll -->
            <div id="sessionsLoadingIndicator" style="display: none; text-align: center; padding: 20px;">
                <div class="spinner"></div>
                <p style="margin-top: 10px; color: var(--text-secondary); font-size: 14px;">Loading more sessions...</p>
            </div>
            <!-- End of list indicator -->
            <div id="sessionsEndIndicator" style="display: none; text-align: center; padding: 20px; color: var(--text-secondary); font-size: 14px;">
                <i class="fas fa-check-circle"></i> All sessions loaded
            </div>
        </div>
    `;
    
    // Load only completed sessions
    await loadSessions('completed', null, true);
    
    // Setup infinite scroll observer
    setupInfiniteScroll();
}


// Load sessions with pagination support
async function loadSessions(filter = 'completed', dateFilter = null, reset = false) {
    // Prevent concurrent loads
    if (isLoading) {
        return;
    }
    
    // If resetting, start from page 1
    if (reset) {
        currentPage = 1;
        hasMorePages = true;
        currentDateFilter = dateFilter;
    }
    
    // Check if we have more pages to load
    if (!hasMorePages) {
        return;
    }
    
    try {
        isLoading = true;
        const params = {
            page: currentPage,
            limit: 20 // Load 20 sessions per page
        };
        
        // Add date filters if provided
        if (dateFilter && dateFilter.fromDate) {
            params.fromDate = dateFilter.fromDate;
        }
        if (dateFilter && dateFilter.toDate) {
            params.toDate = dateFilter.toDate;
        }
        
        const container = document.getElementById('sessionsList');
        const loadingIndicator = document.getElementById('sessionsLoadingIndicator');
        const endIndicator = document.getElementById('sessionsEndIndicator');
        
        // Show loading indicator only if not resetting (i.e., loading more)
        if (reset) {
            container.innerHTML = '<div class="spinner"></div>';
            loadingIndicator.style.display = 'none';
            endIndicator.style.display = 'none';
        } else {
            loadingIndicator.style.display = 'block';
        }
        
        // Call real API
        const response = await getSessions(params);
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to load sessions');
        }
        
        const sessions = response.sessions || [];
        totalPages = response.totalPages || 1;
        hasMorePages = currentPage < totalPages;
        
        if (sessions.length > 0) {
            const sessionsHTML = sessions.map(session => {
                // Calculate session duration
                let sessionDuration = 'N/A';
                if (session.startTime && session.endTime) {
                    const start = new Date(session.startTime);
                    const end = new Date(session.endTime);
                    const durationMs = end - start;
                    const hours = Math.floor(durationMs / (1000 * 60 * 60));
                    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
                    
                    if (hours > 0) {
                        sessionDuration = `${hours}h ${minutes}m`;
                    } else if (minutes > 0) {
                        sessionDuration = `${minutes}m ${seconds}s`;
                    } else {
                        sessionDuration = `${seconds}s`;
                    }
                }
                
                // Get amounts
                const enteredAmount = parseFloat(session.amountDeducted || 0);
                const refundAmount = parseFloat(session.refundAmount || 0);
                const finalCost = parseFloat(session.billedAmount || 0);
                
                // Create status message with entered amount and refund
                let statusMessage = 'Charging Session';
                if (enteredAmount > 0) {
                    statusMessage = `Entered: ₹${enteredAmount.toFixed(2)}`;
                }
                
                return `
                <div class="card" style="cursor: pointer; padding: 12px; margin-bottom: 12px;" onclick="window.viewSessionDetail('${session.sessionId}')">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
                        <div style="flex: 1;">
                            <div style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">${statusMessage}</div>
                            ${refundAmount > 0 ? `<div style="font-size: 12px; color: #28a745; margin-bottom: 4px; font-weight: 500;">
                                <i class="fas fa-undo"></i> Refund: ₹${refundAmount.toFixed(2)}
                            </div>` : ''}
                            <div style="font-size: 11px; color: var(--text-secondary);">
                                ${formatDate(session.startTime)}
                            </div>
                        </div>
                        <span class="badge badge-info" style="font-size: 10px; padding: 4px 8px;">
                            Completed
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Energy</div>
                            <div style="font-size: 14px; font-weight: 600;">${parseFloat(session.energy || 0).toFixed(2)} kWh</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Duration</div>
                            <div style="font-size: 14px; font-weight: 600;">${sessionDuration}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">Cost</div>
                            <div style="font-size: 14px; font-weight: 600;">₹${finalCost.toFixed(2)}</div>
                        </div>
                    </div>
                </div>
            `;
            }).join('');
            
            if (reset) {
                container.innerHTML = sessionsHTML;
            } else {
                container.innerHTML += sessionsHTML;
            }
            
            // Update page number for next load
            currentPage++;
            
            // Show/hide end indicator
            if (!hasMorePages) {
                endIndicator.style.display = 'block';
            } else {
                endIndicator.style.display = 'none';
            }
        } else {
            if (reset) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-history"></i>
                        <h3>No Sessions Found</h3>
                        <p>Your charging sessions will appear here</p>
                    </div>
                `;
            }
            hasMorePages = false;
            endIndicator.style.display = 'block';
        }
        
        loadingIndicator.style.display = 'none';
    } catch (error) {
        console.error('Error loading sessions:', error);
        showError('Failed to load sessions');
        const container = document.getElementById('sessionsList');
        if (reset) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error Loading Sessions</h3>
                    <p>Please try again later</p>
                </div>
            `;
        }
        document.getElementById('sessionsLoadingIndicator').style.display = 'none';
    } finally {
        isLoading = false;
    }
}

// Setup infinite scroll observer
function setupInfiniteScroll() {
    // Disconnect existing observer if any
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    
    // Create intersection observer to detect when user scrolls near bottom
    const options = {
        root: null, // Use viewport as root
        rootMargin: '100px', // Trigger 100px before bottom
        threshold: 0.1
    };
    
    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && hasMorePages && !isLoading) {
                console.log('Loading more sessions...', { currentPage, totalPages, hasMorePages });
                // Load next page
                loadSessions('completed', currentDateFilter, false);
            }
        });
    }, options);
    
    // Observe the sentinel element (always visible, better for infinite scroll)
    const sentinel = document.getElementById('sessionsScrollSentinel');
    if (sentinel) {
        scrollObserver.observe(sentinel);
        console.log('Infinite scroll observer set up');
    } else {
        console.error('Sentinel element not found for infinite scroll');
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
    
    // Reset and reload with new filter
    await loadSessions('completed', dateFilter, true);
    
    // Re-setup infinite scroll observer
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    setupInfiniteScroll();
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
    
    // Reset and reload without filter
    await loadSessions('completed', null, true);
    
    // Re-setup infinite scroll observer
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    setupInfiniteScroll();
};

// View session detail
window.viewSessionDetail = function(sessionId) {
    // TODO: Navigate to session detail page
    console.log('View session detail:', sessionId);
};

