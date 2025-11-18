// Active Session Module - Locked charging session page (user must stop charging to leave)
import { updatePageTitle } from '../app.js';
import { getActiveSession, stopCharging, getSessionDetails } from '../services/api.js';
import { showError, showSuccess, showWarning, showConfirm, showInfo } from '../../utils/notifications.js';

let refreshInterval = null;
let backNavigationHandler = null;
let smoothUpdateInterval = null;
let currentDisplayedEnergy = 0;
let currentDisplayedCost = 0;
let targetEnergy = 0;
let targetCost = 0;

export async function loadActiveSession() {
    // Store page info in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'active-session');
    
    updatePageTitle('Charging Active');
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch active session from API
        const response = await getActiveSession();
        const activeSession = response.success ? response.session : null;
        
        // Check if session exists and is actually active (not stopped/completed)
        if (!activeSession || 
            (activeSession.status && ['stopped', 'completed', 'failed'].includes(activeSession.status))) {
            // No active session, clear active-session page from storage and redirect to dashboard
            if (sessionStorage.getItem('lastPage') === 'active-session') {
                sessionStorage.removeItem('lastPage');
            }
            const { loadDashboard } = await import('./dashboard.js');
            await loadDashboard();
            return;
        }
        
        // Calculate price per kWh from session data
        // Use tariff data if available, otherwise calculate from cost/energy
        let pricePerKwh = 0;
        if (activeSession.tariff) {
            const baseCharges = parseFloat(activeSession.tariff.baseCharges) || 0;
            const tax = parseFloat(activeSession.tariff.tax) || 0;
            pricePerKwh = baseCharges * (1 + tax / 100);
        } else if (activeSession.cost && activeSession.energy > 0) {
            pricePerKwh = activeSession.cost / activeSession.energy;
        }
        
        // Calculate elapsed time
        const startTime = new Date(activeSession.startTime);
        const elapsedMs = Date.now() - startTime.getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        const elapsedMins = elapsedMinutes % 60;
        const elapsedTime = elapsedHours > 0 
            ? `${elapsedHours}h ${elapsedMins}m` 
            : `${elapsedMins}m`;
        
        const stationName = activeSession.station?.stationName || 'Unknown Station';
        const deviceName = activeSession.deviceName || activeSession.deviceId;
        
        // Hide navigation elements to prevent leaving
        const bottomNav = document.querySelector('.bottom-nav');
        const sidebarNav = document.getElementById('sidebarNav');
        const mobileSidebar = document.getElementById('mobileSidebar');
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
        
        // Close mobile sidebar if open
        if (mobileSidebar) {
            mobileSidebar.classList.remove('active');
        }
        if (mobileMenuOverlay) {
            mobileMenuOverlay.classList.remove('active');
        }
        document.body.style.overflow = '';
        
        // Hide navigation elements
        if (bottomNav) bottomNav.style.display = 'none';
        if (sidebarNav) sidebarNav.style.display = 'none';
        if (hamburgerMenu) hamburgerMenu.style.display = 'none';
        
        appMain.innerHTML = `
            <div class="active-session-container">
                <!-- Active Session Header -->
                <div class="card" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; margin-bottom: 12px;">
                    <div style="text-align: center; padding: 12px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Charging Active</h2>
                        <div style="font-size: 13px; opacity: 0.9; margin-bottom: 2px;">${stationName}</div>
                        <div style="font-size: 12px; opacity: 0.8;">${deviceName}</div>
                    </div>
                </div>
                
                <!-- Charging Stats -->
                <div class="card" style="margin-bottom: 12px;">
                    <h3 class="card-title" style="font-size: 14px; margin-bottom: 10px;">Charging Details</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div style="text-align: center; padding: 12px; background: var(--bg-color); border-radius: 10px;">
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 5px;">Energy Charged</div>
                            <div style="font-size: 22px; font-weight: 700; color: var(--primary-color); line-height: 1.2;" id="sessionEnergy">
                                ${(activeSession.energy || 0).toFixed(2)} <span style="font-size: 14px;">kWh</span>
                            </div>
                        </div>
                        <div style="text-align: center; padding: 12px; background: var(--bg-color); border-radius: 10px;">
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 5px;">Cost</div>
                            <div style="font-size: 22px; font-weight: 700; color: var(--primary-color);" id="sessionCost">
                                ₹${(activeSession.cost || 0).toFixed(2)}
                            </div>
                        </div>
                        <div style="text-align: center; padding: 12px; background: var(--bg-color); border-radius: 10px;">
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 5px;">Duration</div>
                            <div style="font-size: 18px; font-weight: 600; color: var(--text-primary);" id="sessionDuration">
                                ${elapsedTime}
                            </div>
                        </div>
                        <div style="text-align: center; padding: 12px; background: var(--bg-color); border-radius: 10px;">
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 5px;">Price</div>
                            <div style="font-size: 16px; font-weight: 600; color: var(--text-primary);" id="sessionPrice">
                                ₹${pricePerKwh > 0 ? pricePerKwh.toFixed(2) : '0.00'}/kWh
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Session Info -->
                <div class="card" style="margin-bottom: 12px;">
                    <h3 class="card-title" style="font-size: 14px; margin-bottom: 10px;">Session Information</h3>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-color); border-radius: 8px;">
                            <div style="font-size: 12px; color: var(--text-secondary);">Started At</div>
                            <div style="font-size: 12px; font-weight: 600;">${formatDateTime(activeSession.startTime)}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-color); border-radius: 8px;">
                            <div style="font-size: 12px; color: var(--text-secondary);">Transaction ID</div>
                            <div style="font-size: 12px; font-weight: 600; font-family: monospace;">${activeSession.transactionId || 'N/A'}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-color); border-radius: 8px;">
                            <div style="font-size: 12px; color: var(--text-secondary);">Session ID</div>
                            <div style="font-size: 12px; font-weight: 600; font-family: monospace;">${activeSession.sessionId}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Stop Charging Button -->
                <div class="card" style="padding: 16px;">
                    <button id="stopChargingBtn" class="btn btn-danger btn-full" style="font-size: 15px; padding: 12px; min-height: 48px; font-weight: 600;" 
                            onclick="window.stopChargingFromSession('${activeSession.deviceId}', ${activeSession.connectorId}, ${activeSession.transactionId ? `'${activeSession.transactionId}'` : 'null'})">
                        <i class="fas fa-stop"></i> Stop Charging
                    </button>
                    <div style="text-align: center; margin-top: 8px; font-size: 10px; color: var(--text-secondary);">
                        You must stop charging to leave this page
                    </div>
                </div>
            </div>
        `;
        
        // Start auto-refresh for real-time updates
        startAutoRefresh(activeSession);
        
        // Prevent browser back button
        preventBackNavigation();
        
    } catch (error) {
        console.error('Error loading active session:', error);
        showError('Failed to load active session');
        // Redirect to dashboard on error
        const { loadDashboard } = await import('./dashboard.js');
        await loadDashboard();
    }
}

// Prevent browser back navigation
function preventBackNavigation() {
    // Push current state to history
    history.pushState(null, null, location.href);
    
    // Create handler function
    backNavigationHandler = function(event) {
        // Push state again to prevent going back
        history.pushState(null, null, location.href);
        showError('Please stop charging before leaving this page');
    };
    
    // Listen for back button
    window.addEventListener('popstate', backNavigationHandler);
}

// Start auto-refresh for real-time updates
function startAutoRefresh(sessionData) {
    // Clear any existing intervals
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (smoothUpdateInterval) {
        clearInterval(smoothUpdateInterval);
    }
    
    // Reset auto-stop flag for new session
    autoStopTriggered = false;
    
    // Initialize displayed values
    currentDisplayedEnergy = sessionData.energy || 0;
    currentDisplayedCost = sessionData.cost || 0;
    targetEnergy = sessionData.energy || 0;
    targetCost = sessionData.cost || 0;
    
    // Update from API every 1 second
    refreshInterval = setInterval(() => {
        updateSessionStats(sessionData);
    }, 1000);
    
    // Smooth UI updates every 100ms for fluid animation
    smoothUpdateInterval = setInterval(() => {
        smoothUpdateDisplay();
    }, 100);
    
    // Also update immediately
    updateSessionStats(sessionData);
}

// Smooth update display values with interpolation
function smoothUpdateDisplay() {
    const energyEl = document.getElementById('sessionEnergy');
    const costEl = document.getElementById('sessionCost');
    
    // Smooth interpolation factor (0.1 = 10% closer per update, creates smooth animation)
    const interpolationFactor = 0.15;
    
    // Smoothly interpolate energy towards target
    if (Math.abs(currentDisplayedEnergy - targetEnergy) > 0.001) {
        currentDisplayedEnergy += (targetEnergy - currentDisplayedEnergy) * interpolationFactor;
        if (energyEl) {
            energyEl.innerHTML = `${currentDisplayedEnergy.toFixed(2)} <span style="font-size: 14px;">kWh</span>`;
        }
    }
    
    // Smoothly interpolate cost towards target
    if (Math.abs(currentDisplayedCost - targetCost) > 0.01) {
        currentDisplayedCost += (targetCost - currentDisplayedCost) * interpolationFactor;
        if (costEl) {
            costEl.textContent = `₹${currentDisplayedCost.toFixed(2)}`;
        }
    }
}

// Track if auto-stop has been triggered to prevent multiple calls
let autoStopTriggered = false;

// Update session statistics
async function updateSessionStats(sessionData) {
    try {
        // Fetch latest session data from API
        const response = await getActiveSession();
        
        // Check if session is no longer active (null, or status is stopped/completed)
        if (!response.success || !response.session) {
            console.log('[Session Update] No active session found - session was stopped');
            // Clear smooth update interval
            if (smoothUpdateInterval) {
                clearInterval(smoothUpdateInterval);
                smoothUpdateInterval = null;
            }
            // Session ended (possibly stopped from CMS), fetch final session details
            await handleSessionStoppedExternally(sessionData);
            return;
        }
        
        // Double-check session status (in case API returns a stopped session due to timing)
        if (response.session.status && ['stopped', 'completed', 'failed'].includes(response.session.status)) {
            console.log(`[Session Update] Session status is ${response.session.status} - session was stopped`);
            // Clear intervals
            if (refreshInterval) {
                clearInterval(refreshInterval);
                refreshInterval = null;
            }
            if (smoothUpdateInterval) {
                clearInterval(smoothUpdateInterval);
                smoothUpdateInterval = null;
            }
            // Session ended (possibly stopped from CMS), fetch final session details
            await handleSessionStoppedExternally(sessionData);
            return;
        }
        
        // Check if endTime is set (indicates session was stopped, possibly from CMS)
        if (response.session.endTime) {
            const endTime = new Date(response.session.endTime);
            const now = new Date();
            // If endTime is in the past (more than 1 second ago), session was stopped
            if (endTime.getTime() < (now.getTime() - 1000)) {
                console.log('[Session Update] Session has endTime set - session was stopped from CMS');
                // Clear intervals
                if (refreshInterval) {
                    clearInterval(refreshInterval);
                    refreshInterval = null;
                }
                if (smoothUpdateInterval) {
                    clearInterval(smoothUpdateInterval);
                    smoothUpdateInterval = null;
                }
                // Session ended (stopped from CMS), fetch final session details and redirect
                await handleSessionStoppedExternally(sessionData);
                return;
            }
        }
        
        const session = response.session;
        const startTime = new Date(session.startTime);
        const elapsedMs = Date.now() - startTime.getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        const elapsedMins = elapsedMinutes % 60;
        const elapsedTime = elapsedHours > 0 
            ? `${elapsedHours}h ${elapsedMins}m` 
            : `${elapsedMins}m`;
        
        // Update duration
        const durationEl = document.getElementById('sessionDuration');
        if (durationEl) {
            durationEl.textContent = elapsedTime;
        }
        
        // Update target values for smooth animation (don't update display directly)
        targetEnergy = parseFloat(session.energy || 0);
        targetCost = parseFloat(session.cost || 0);
        
        // Update price per kWh (this can update directly as it doesn't change frequently)
        const priceEl = document.getElementById('sessionPrice');
        
        // Update price per kWh if element exists
        if (priceEl) {
            let pricePerKwh = 0;
            if (session.tariff) {
                const baseCharges = parseFloat(session.tariff.baseCharges) || 0;
                const tax = parseFloat(session.tariff.tax) || 0;
                pricePerKwh = baseCharges * (1 + tax / 100);
            } else if (session.cost && session.energy > 0) {
                pricePerKwh = session.cost / session.energy;
            }
            priceEl.textContent = `₹${pricePerKwh > 0 ? pricePerKwh.toFixed(2) : '0.00'}/kWh`;
        }
        
        // AUTO-STOP: Check if cost has reached 95% of prepaid amount
        const currentCost = parseFloat(session.cost || 0);
        const amountDeducted = parseFloat(session.amountDeducted || 0);
        
        // Stop at 95% of prepaid amount to prevent overcharging
        const stopThreshold = amountDeducted * 0.95; // 95% threshold
        
        if (!autoStopTriggered && amountDeducted > 0 && currentCost >= stopThreshold) {
            autoStopTriggered = true;
            console.log(`[Auto-Stop] Cost (₹${currentCost.toFixed(2)}) reached 95% threshold (₹${stopThreshold.toFixed(2)} of ₹${amountDeducted.toFixed(2)}). Stopping charging automatically...`);
            
            // Show notification
            showInfo(`Prepaid amount (₹${amountDeducted.toFixed(2)}) exhausted. Stopping charging...`);
            
            // Automatically stop charging
            try {
                const stopResponse = await stopCharging(
                    session.deviceId,
                    session.connectorId,
                    session.transactionId
                );
                
                if (stopResponse.success) {
                    let message = 'Charging stopped automatically - prepaid amount exhausted';
                    if (stopResponse.session && stopResponse.session.refundAmount > 0) {
                        message += `. Refund: ₹${stopResponse.session.refundAmount.toFixed(2)}`;
                    }
                    showSuccess(message);
                    
                    // Clear refresh intervals
                    if (refreshInterval) {
                        clearInterval(refreshInterval);
                        refreshInterval = null;
                    }
                    if (smoothUpdateInterval) {
                        clearInterval(smoothUpdateInterval);
                        smoothUpdateInterval = null;
                    }
                    
                    // Remove back button prevention
                    if (backNavigationHandler) {
                        window.removeEventListener('popstate', backNavigationHandler);
                        backNavigationHandler = null;
                    }
                    
                    // Restore navigation elements
                    const bottomNav = document.querySelector('.bottom-nav');
                    const sidebarNav = document.getElementById('sidebarNav');
                    const hamburgerMenu = document.getElementById('hamburgerMenu');
                    const mobileSidebar = document.getElementById('mobileSidebar');
                    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
                    
                    // Close mobile sidebar if it's open
                    if (mobileSidebar) {
                        mobileSidebar.classList.remove('active');
                    }
                    if (mobileMenuOverlay) {
                        mobileMenuOverlay.classList.remove('active');
                    }
                    document.body.style.overflow = '';
                    
                    // Restore navigation visibility
                    if (bottomNav) bottomNav.style.display = 'flex';
                    if (sidebarNav && window.innerWidth >= 1024) {
                        sidebarNav.style.display = 'flex';
                    } else if (sidebarNav) {
                        sidebarNav.style.display = 'none';
                    }
                    
                    // Restore hamburger menu based on screen size
                    if (hamburgerMenu) {
                        if (window.innerWidth < 1024) {
                            hamburgerMenu.style.display = 'block';
                        } else {
                            hamburgerMenu.style.display = 'none';
                        }
                    }
                    
                    // Navigate back
                    setTimeout(async () => {
                        try {
                            const lastStationId = sessionStorage.getItem('lastStationId');
                            const lastStationName = sessionStorage.getItem('lastStationName');
                            
                            if (lastStationId) {
                                const { loadStationDetail } = await import('./station-detail.js');
                                await loadStationDetail(lastStationId, lastStationName);
                            } else {
                                const { loadDashboard } = await import('./dashboard.js');
                                await loadDashboard();
                            }
                        } catch (error) {
                            window.location.reload();
                        }
                    }, 1000);
                } else {
                    showError(stopResponse.error || 'Failed to auto-stop charging');
                    autoStopTriggered = false; // Reset to retry
                }
            } catch (error) {
                console.error('[Auto-Stop] Error stopping charging:', error);
                showError('Failed to auto-stop charging. Please stop manually.');
                autoStopTriggered = false; // Reset to retry
            }
        }
    } catch (error) {
        console.error('Error updating session stats:', error);
        // Continue with existing data on error
    }
}

// Stop charging from active session page
window.stopChargingFromSession = async function(deviceId, connectorId, transactionId) {
    // Get button reference
    const stopButton = document.getElementById('stopChargingBtn');
    let originalButtonText = '';
    
    // Disable button to prevent multiple clicks
    if (stopButton) {
        stopButton.disabled = true;
        originalButtonText = stopButton.innerHTML;
        stopButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping...';
    }
    
    const confirmed = await showConfirm(
        'Are you sure you want to stop charging? Any unused amount will be refunded to your wallet.',
        'Stop Charging',
        'Stop Charging'
    );
    
    if (!confirmed) {
        // Re-enable button if user cancels
        if (stopButton) {
            stopButton.disabled = false;
            stopButton.innerHTML = originalButtonText;
        }
        return;
    }
    
    try {
        // Handle null/undefined/empty transactionId
        const validTransactionId = transactionId && transactionId !== '' && transactionId !== 'null' && transactionId !== 'undefined' 
            ? transactionId 
            : null;
        
        console.log('[Stop Charging] Calling stop API:', { deviceId, connectorId, transactionId: validTransactionId });
        
        // Call API to stop charging
        const response = await stopCharging(deviceId, connectorId, validTransactionId);
        
        if (!response.success) {
            showError(response.error || 'Failed to stop charging');
            // Re-enable button on error
            if (stopButton) {
                stopButton.disabled = false;
                stopButton.innerHTML = '<i class="fas fa-stop"></i> Stop Charging';
            }
            return;
        }
        
        let message = 'Charging stopped successfully';
        if (response.session && response.session.refundAmount > 0) {
            message += `. Refund: ₹${response.session.refundAmount.toFixed(2)}`;
        }
        
        // Check if charger actually stopped
        if (response.stopSuccess === false) {
            message += ' (Note: Charger remote-stop may have failed. Please verify charger status.)';
            showWarning(message);
        } else {
            showSuccess(message);
        }
        
        // Clear refresh intervals
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
        if (smoothUpdateInterval) {
            clearInterval(smoothUpdateInterval);
            smoothUpdateInterval = null;
        }
        
        // Remove back button prevention
        if (backNavigationHandler) {
            window.removeEventListener('popstate', backNavigationHandler);
            backNavigationHandler = null;
        }
        
        // Restore navigation elements
        const bottomNav = document.querySelector('.bottom-nav');
        const sidebarNav = document.getElementById('sidebarNav');
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const mobileSidebar = document.getElementById('mobileSidebar');
        const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
        
        // Close mobile sidebar if it's open
        if (mobileSidebar) {
            mobileSidebar.classList.remove('active');
        }
        if (mobileMenuOverlay) {
            mobileMenuOverlay.classList.remove('active');
        }
        // Reset body overflow
        document.body.style.overflow = '';
        
        // Restore navigation visibility
        if (bottomNav) bottomNav.style.display = 'flex';
        if (sidebarNav && window.innerWidth >= 1024) {
            sidebarNav.style.display = 'flex';
        } else if (sidebarNav) {
            sidebarNav.style.display = 'none';
        }
        
        // Restore hamburger menu based on screen size
        if (hamburgerMenu) {
            if (window.innerWidth < 1024) {
                hamburgerMenu.style.display = 'block';
            } else {
                hamburgerMenu.style.display = 'none';
            }
        }
        
        // Navigate back - check if we came from station detail or dashboard
        setTimeout(async () => {
            try {
                // Check if we have station info in session storage
                const lastStationId = sessionStorage.getItem('lastStationId');
                const lastStationName = sessionStorage.getItem('lastStationName');
                
                if (lastStationId) {
                    // Reload station detail page
                    const { loadStationDetail } = await import('./station-detail.js');
                    await loadStationDetail(lastStationId, lastStationName);
                } else {
                    // Navigate to dashboard
                    const { loadDashboard } = await import('./dashboard.js');
                    await loadDashboard();
                }
            } catch (error) {
                // If navigation fails, try to reload current page
                window.location.reload();
            }
        }, 1000);
    } catch (error) {
        console.error('[Stop Charging] Error:', error);
        showError(error.message || 'Failed to stop charging');
        
        // Re-enable button on error
        const stopButton = document.getElementById('stopChargingBtn');
        if (stopButton) {
            stopButton.disabled = false;
            stopButton.innerHTML = '<i class="fas fa-stop"></i> Stop Charging';
        }
    }
};

// Handle session stopped externally (from CMS or other source)
async function handleSessionStoppedExternally(sessionData) {
    try {
        // Clear refresh intervals
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
        }
        if (smoothUpdateInterval) {
            clearInterval(smoothUpdateInterval);
            smoothUpdateInterval = null;
        }
        autoStopTriggered = false; // Reset for next session
        
        // Remove back button prevention
        if (backNavigationHandler) {
            window.removeEventListener('popstate', backNavigationHandler);
            backNavigationHandler = null;
        }
        
        // Fetch final session details to get refund information
        let refundAmount = 0;
        let finalAmount = 0;
        let energyConsumed = 0;
        
        if (sessionData && sessionData.sessionId) {
            try {
                const sessionDetailsResponse = await getSessionDetails(sessionData.sessionId);
                if (sessionDetailsResponse.success && sessionDetailsResponse.session) {
                    refundAmount = parseFloat(sessionDetailsResponse.session.refundAmount || 0);
                    finalAmount = parseFloat(sessionDetailsResponse.session.billedAmount || 0);
                    energyConsumed = parseFloat(sessionDetailsResponse.session.energy || 0);
                }
            } catch (error) {
                console.error('[Session Stopped] Error fetching session details:', error);
                // Continue with redirect even if we can't fetch details
            }
        }
        
        // Show appropriate message
        let message = 'Charging session has been stopped';
        if (refundAmount > 0) {
            message += `. Refund of ₹${refundAmount.toFixed(2)} has been processed and added to your wallet.`;
            showSuccess(message);
        } else {
            message += '.';
            showInfo(message);
        }
        
        // Restore navigation elements
        const bottomNav = document.querySelector('.bottom-nav');
        const sidebarNav = document.getElementById('sidebarNav');
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const mobileSidebar = document.getElementById('mobileSidebar');
        const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
        
        // Close mobile sidebar if it's open
        if (mobileSidebar) {
            mobileSidebar.classList.remove('active');
        }
        if (mobileMenuOverlay) {
            mobileMenuOverlay.classList.remove('active');
        }
        document.body.style.overflow = '';
        
        // Restore navigation visibility
        if (bottomNav) bottomNav.style.display = 'flex';
        if (sidebarNav && window.innerWidth >= 1024) {
            sidebarNav.style.display = 'flex';
        } else if (sidebarNav) {
            sidebarNav.style.display = 'none';
        }
        
        // Restore hamburger menu based on screen size
        if (hamburgerMenu) {
            if (window.innerWidth < 1024) {
                hamburgerMenu.style.display = 'block';
            } else {
                hamburgerMenu.style.display = 'none';
            }
        }
        
        // Navigate to home page after a short delay
        setTimeout(async () => {
            try {
                const { loadDashboard } = await import('./dashboard.js');
                await loadDashboard();
            } catch (error) {
                console.error('[Session Stopped] Error navigating to dashboard:', error);
                window.location.reload();
            }
        }, 1500); // 1.5 second delay to show the message
        
    } catch (error) {
        console.error('[Session Stopped] Error handling stopped session:', error);
        // Fallback: just redirect to dashboard
        const { loadDashboard } = await import('./dashboard.js');
        await loadDashboard();
    }
}

// Format date and time helper
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

