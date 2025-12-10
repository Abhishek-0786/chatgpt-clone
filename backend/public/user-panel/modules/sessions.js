// Sessions Module - User's Charging History
import { updateActiveNav, updatePageTitle, refreshWalletBalance } from '../app.js';
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
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
    const appMain = document.getElementById('appMain');
    
    // Set max date to today (disable future dates)
    const today = new Date().toISOString().split('T')[0];
    
    appMain.innerHTML = `
        <div class="sessions-container">
            <!-- Date Filter - Modern Card -->
            <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                        <i class="fas fa-filter" style="color: #667eea; font-size: 14px;"></i>
                    </div>
                    <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #212529;">Filter by Date</h3>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div style="position: relative;">
                        <label style="display: block; font-size: 11px; color: #6c757d; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">From Date</label>
                        <input type="date" id="fromDateFilter" style="width: 100%; padding: 12px; font-size: 14px; border: 1px solid #e9ecef; border-radius: 12px; background: #f8f9fa; color: #212529; font-weight: 500;" max="${today}" onchange="window.applyDateFilter()">
                    </div>
                    <div style="position: relative;">
                        <label style="display: block; font-size: 11px; color: #6c757d; margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">To Date</label>
                        <input type="date" id="toDateFilter" style="width: 100%; padding: 12px; font-size: 14px; border: 1px solid #e9ecef; border-radius: 12px; background: #f8f9fa; color: #212529; font-weight: 500;" max="${today}" onchange="window.applyDateFilter()">
                    </div>
                </div>
                <button onclick="window.clearDateFilter()" style="width: 100%; padding: 12px; font-size: 14px; font-weight: 600; border: 1px solid #dc2626; border-radius: 12px; background: white; color: #dc2626; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.background='#fee2e2'; this.style.borderColor='#dc2626'" onmouseout="this.style.background='white'; this.style.borderColor='#dc2626'">
                    <i class="fas fa-times"></i>
                    <span>Clear Filter</span>
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
                <div style="background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 14px; margin-bottom: 10px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05); cursor: pointer; transition: all 0.2s;" onclick="window.viewSessionDetail('${session.sessionId}')" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.08)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 1px 4px rgba(0, 0, 0, 0.05)'">
                    <!-- Header Section - Compact -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                                <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-bolt" style="color: #667eea; font-size: 14px;"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 14px; font-weight: 600; color: #212529; margin-bottom: 3px; word-wrap: break-word;">${statusMessage}</div>
                                    ${refundAmount > 0 ? `
                                    <div style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: #10b981; font-weight: 500; margin-bottom: 3px;">
                                        <i class="fas fa-undo" style="font-size: 11px;"></i>
                                        <span>Refund: ₹${refundAmount.toFixed(2)}</span>
                                    </div>
                                    ` : ''}
                                    <div style="display: flex; align-items: center; gap: 5px; font-size: 11px; color: #6c757d;">
                                        <i class="fas fa-calendar-alt" style="font-size: 10px;"></i>
                                        <span>${formatDate(session.startTime)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="flex-shrink: 0; margin-left: 10px; display: flex; align-items: center; gap: 8px;">
                            <button onclick="event.stopPropagation(); window.viewInvoice('${session.sessionId}')"
                               style="display: inline-block; padding: 6px 8px; color: #dc2626; text-decoration: none; border-radius: 8px; background: #fee2e2; border: none; cursor: pointer; transition: all 0.2s;"
                               title="View Invoice"
                               onmouseover="this.style.background='#fecaca'; this.style.transform='scale(1.05)'"
                               onmouseout="this.style.background='#fee2e2'; this.style.transform='scale(1)'">
                                <i class="fas fa-file-invoice" style="font-size: 14px;"></i>
                            </button>
                            <span style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; font-size: 9px; font-weight: 600; padding: 4px 10px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 1px 4px rgba(16, 185, 129, 0.25);">
                                Completed
                            </span>
                        </div>
                    </div>
                    
                    <!-- Stats Grid - Compact -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <div style="text-align: center; padding: 10px 8px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-radius: 10px; border: 1px solid #e9ecef;">
                            <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 7px; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px;">
                                <i class="fas fa-bolt" style="color: #667eea; font-size: 12px;"></i>
                            </div>
                            <div style="font-size: 9px; color: #6c757d; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Energy</div>
                            <div style="font-size: 13px; font-weight: 700; color: #212529; line-height: 1.2;">${parseFloat(session.energy || 0).toFixed(2)}<span style="font-size: 10px; font-weight: 500; color: #6c757d;"> kWh</span></div>
                        </div>
                        <div style="text-align: center; padding: 10px 8px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-radius: 10px; border: 1px solid #e9ecef;">
                            <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #f59e0b15 0%, #f59e0b25 100%); border-radius: 7px; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px;">
                                <i class="fas fa-clock" style="color: #f59e0b; font-size: 12px;"></i>
                            </div>
                            <div style="font-size: 9px; color: #6c757d; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Duration</div>
                            <div style="font-size: 13px; font-weight: 700; color: #212529; line-height: 1.2;">${sessionDuration}</div>
                        </div>
                        <div style="text-align: center; padding: 10px 8px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-radius: 10px; border: 1px solid #e9ecef;">
                            <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #10b98115 0%, #10b98125 100%); border-radius: 7px; display: flex; align-items: center; justify-content: center; margin: 0 auto 6px;">
                                <i class="fas fa-wallet" style="color: #10b981; font-size: 12px;"></i>
                            </div>
                            <div style="font-size: 9px; color: #6c757d; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Cost</div>
                            <div style="font-size: 13px; font-weight: 700; color: #212529; line-height: 1.2;">₹${finalCost.toFixed(2)}</div>
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
                    <div style="text-align: center; padding: 60px 20px;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                            <i class="fas fa-history" style="font-size: 36px; color: #667eea;"></i>
                        </div>
                        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #212529;">No Sessions Found</h3>
                        <p style="margin: 0; font-size: 14px; color: #6c757d;">Your charging sessions will appear here</p>
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
                <div style="text-align: center; padding: 60px 20px;">
                    <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #ef444415 0%, #ef444425 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                        <i class="fas fa-exclamation-circle" style="font-size: 36px; color: #ef4444;"></i>
                    </div>
                    <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #212529;">Error Loading Sessions</h3>
                    <p style="margin: 0; font-size: 14px; color: #6c757d;">Please try again later</p>
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

// View invoice with authentication
window.viewInvoice = async function(sessionId) {
    try {
        const token = localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
        if (!token) {
            showError('Please login to view invoice');
            return;
        }
        
        // Show loading indicator
        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000;';
        loadingMsg.innerHTML = '<div class="spinner"></div><p style="margin-top: 10px;">Loading invoice...</p>';
        document.body.appendChild(loadingMsg);
        
        // Fetch invoice PDF with authentication
        const response = await fetch(`/api/user/sessions/${sessionId}/invoice/pdf?preview=1`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        // Remove loading indicator
        document.body.removeChild(loadingMsg);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to load invoice' }));
            showError(errorData.error || 'Failed to load invoice');
            return;
        }
        
        // Create blob from PDF response
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Open PDF in new window
        const newWindow = window.open(url, '_blank');
        if (!newWindow) {
            showError('Please allow popups to view invoice');
        }
        
        // Clean up blob URL after a delay
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
        }, 1000);
        
    } catch (error) {
        console.error('Error loading invoice:', error);
        showError('Failed to load invoice. Please try again.');
    }
};

