// Active Session Module - Locked charging session page (user must stop charging to leave)
import { updatePageTitle, refreshWalletBalance } from '../app.js';
import { getActiveSession, stopCharging, getSessionDetails } from '../services/api.js';
import { showError, showSuccess, showWarning, showConfirm, showInfo } from '../../utils/notifications.js';

let refreshInterval = null;
let smoothUpdateInterval = null;
let currentDisplayedEnergy = 0;
let currentDisplayedCost = 0;
let targetEnergy = 0;
let targetCost = 0;

export async function loadActiveSession() {
    // Store page info in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'active-session');
    
    // Hide snackbar when on active session page
    const banner = document.getElementById('activeSessionBanner');
    if (banner) {
        banner.style.display = 'none';
    }
    
    updatePageTitle('');
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch active session from API
        const response = await getActiveSession();
        const activeSession = response.success ? response.session : null;
        
        // Check if session exists and is actually active (not stopped/completed)
        // NOTE: 'pending' status is valid - session is waiting for charger confirmation
        // Allow 'pending' and 'active' statuses
        if (!activeSession || 
            (activeSession.status && ['stopped', 'completed', 'failed'].includes(activeSession.status))) {
            // No active session found - wait a bit and retry (session might still be initializing)
            // This can happen if we navigate too quickly after starting charging
            console.log('[Active Session] Session not found or inactive, waiting 2 seconds and retrying...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Retry once
            const retryResponse = await getActiveSession();
            const retrySession = retryResponse.success ? retryResponse.session : null;
            
            if (!retrySession || 
                (retrySession.status && ['stopped', 'completed', 'failed'].includes(retrySession.status))) {
                // Still no active session, wait one more time (session might be pending)
                console.log('[Active Session] Session still not found after first retry, waiting 3 more seconds...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const finalRetryResponse = await getActiveSession();
                const finalRetrySession = finalRetryResponse.success ? finalRetryResponse.session : null;
                
                if (!finalRetrySession || 
                    (finalRetrySession.status && ['stopped', 'completed', 'failed'].includes(finalRetrySession.status))) {
                    // Still no active session after multiple retries, redirect to dashboard
                    console.log('[Active Session] Session still not found after multiple retries, redirecting to dashboard');
                    if (sessionStorage.getItem('lastPage') === 'active-session') {
                        sessionStorage.removeItem('lastPage');
                    }
                    const { loadDashboard } = await import('./dashboard.js');
                    await loadDashboard();
                    return;
                }
                
                // Use final retry session
                activeSession = finalRetrySession;
            } else {
                // Use retry session
                activeSession = retrySession;
            }
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
        let elapsedTime = '0m';
        if (activeSession.startTime) {
            const startTime = new Date(activeSession.startTime);
            // Validate startTime is a valid date
            if (!isNaN(startTime.getTime())) {
                const elapsedMs = Date.now() - startTime.getTime();
                // Only calculate if elapsed time is positive (startTime is in the past)
                if (elapsedMs > 0) {
                    const elapsedMinutes = Math.floor(elapsedMs / 60000);
                    const elapsedHours = Math.floor(elapsedMinutes / 60);
                    const elapsedMins = elapsedMinutes % 60;
                    elapsedTime = elapsedHours > 0 
                        ? `${elapsedHours}h ${elapsedMins}m` 
                        : `${elapsedMins}m`;
                }
            }
        }
        
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
        
        // Hide bottom navigation on active session page
        if (bottomNav) bottomNav.style.display = 'none';
        if (sidebarNav) sidebarNav.style.display = 'none';
        if (hamburgerMenu) hamburgerMenu.style.display = 'none';
        
        // Show back button in header
        const appHeader = document.querySelector('.app-header');
        if (appHeader) {
            // Check if back button already exists
            let backButton = appHeader.querySelector('.back-button');
            if (!backButton) {
                backButton = document.createElement('button');
                backButton.className = 'back-button';
                backButton.innerHTML = '<i class="fas fa-arrow-left"></i>';
                backButton.style.cssText = 'background: none; border: none; color: var(--sidebar-text); font-size: 20px; padding: 8px; cursor: pointer; margin-right: 12px; border-radius: 4px; transition: background-color 0.2s; display: flex; align-items: center; justify-content: center;';
                backButton.onmouseover = function() {
                    this.style.backgroundColor = 'var(--sidebar-hover)';
                };
                backButton.onmouseout = function() {
                    this.style.backgroundColor = 'transparent';
                };
                backButton.onclick = async function(e) {
                    e.stopPropagation();
                    // Navigate back to previous page or dashboard
                    // Get the page before active-session
                    const lastPageBeforeActive = sessionStorage.getItem('lastPageBeforeActive') || sessionStorage.getItem('lastPage') || 'dashboard';
                    if (lastPageBeforeActive === 'dashboard' || lastPageBeforeActive === 'active-session') {
                        const { loadDashboard } = await import('./dashboard.js');
                        await loadDashboard();
                    } else if (lastPageBeforeActive === 'station-detail') {
                        const lastStationId = sessionStorage.getItem('lastStationId');
                        const lastStationName = sessionStorage.getItem('lastStationName');
                        if (lastStationId) {
                            const { loadStationDetail } = await import('./station-detail.js');
                            await loadStationDetail(lastStationId, lastStationName);
                        } else {
                            const { loadDashboard } = await import('./dashboard.js');
                            await loadDashboard();
                        }
                    } else {
                        const { loadDashboard } = await import('./dashboard.js');
                        await loadDashboard();
                    }
                };
                // Insert back button at the beginning of the header (before hamburger menu)
                // This ensures it's visible even when hamburger menu is hidden
                appHeader.insertBefore(backButton, appHeader.firstChild);
            }
            backButton.style.display = 'flex';
            backButton.style.visibility = 'visible';
            backButton.style.opacity = '1';
        }
        
        appMain.innerHTML = `
            <div class="active-session-container" style="padding: 0; background: #f8fafc; min-height: 100vh; overflow-x: hidden;">
                <!-- Hero Section - Compact -->
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                            color: white; padding: 24px 16px 32px 16px; position: relative; overflow: hidden;">
                    <div style="text-align: center; position: relative; z-index: 1;">
                        <div style="width: 60px; height: 60px; margin: 0 auto 12px; background: rgba(255,255,255,0.2); 
                                    border-radius: 50%; display: flex; align-items: center; justify-content: center;
                                    backdrop-filter: blur(10px); border: 2px solid rgba(255,255,255,0.3);
                                    position: relative; overflow: hidden;">
                            <i class="fas fa-bolt" id="chargingBoltIcon" style="font-size: 28px; color: white; 
                                    animation: boltRotate 2s linear infinite;"></i>
                        </div>
                        <div style="font-size: 13px; opacity: 0.95; margin-bottom: 3px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${stationName}</div>
                        <div style="font-size: 12px; opacity: 0.85; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${deviceName}</div>
                    </div>
                </div>
                
                <!-- Stats Cards - Compact -->
                <div style="padding: 16px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                        <!-- Energy Card -->
                        <div style="background: white; border-radius: 12px; padding: 16px 12px; 
                                    box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #f0f0f0;
                                    position: relative; overflow: hidden;">
                            <div style="position: absolute; top: -15px; right: -15px; width: 50px; height: 50px; 
                                        background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); 
                                        border-radius: 50%; opacity: 0.4;"></div>
                            <div style="position: relative; z-index: 1;">
                                <div style="font-size: 9px; color: #991b1b; margin-bottom: 8px; font-weight: 600; 
                                          text-transform: uppercase; letter-spacing: 0.5px;">Energy</div>
                                <div style="font-size: 22px; font-weight: 800; color: #dc2626; line-height: 1;" id="sessionEnergy">
                                    ${(activeSession.energy || 0).toFixed(2)}<span style="font-size: 13px; font-weight: 600; margin-left: 2px;">kWh</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Cost Card -->
                        <div style="background: white; border-radius: 12px; padding: 16px 12px; 
                                    box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #f0f0f0;
                                    position: relative; overflow: hidden;">
                            <div style="position: absolute; top: -15px; right: -15px; width: 50px; height: 50px; 
                                        background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); 
                                        border-radius: 50%; opacity: 0.4;"></div>
                            <div style="position: relative; z-index: 1;">
                                <div style="font-size: 9px; color: #991b1b; margin-bottom: 8px; font-weight: 600; 
                                          text-transform: uppercase; letter-spacing: 0.5px;">Cost</div>
                                <div style="font-size: 22px; font-weight: 800; color: #dc2626;" id="sessionCost">
                                    ₹${(activeSession.cost || 0).toFixed(2)}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Duration Card -->
                        <div style="background: white; border-radius: 12px; padding: 16px 12px; 
                                    box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #f0f0f0;
                                    position: relative; overflow: hidden;">
                            <div style="position: absolute; top: -15px; right: -15px; width: 50px; height: 50px; 
                                        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); 
                                        border-radius: 50%; opacity: 0.4;"></div>
                            <div style="position: relative; z-index: 1;">
                                <div style="font-size: 9px; color: #1e40af; margin-bottom: 8px; font-weight: 600; 
                                          text-transform: uppercase; letter-spacing: 0.5px;">Duration</div>
                                <div style="font-size: 20px; font-weight: 800; color: #1e40af;" id="sessionDuration">
                                    ${elapsedTime}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Price Card -->
                        <div style="background: white; border-radius: 12px; padding: 16px 12px; 
                                    box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #f0f0f0;
                                    position: relative; overflow: hidden;">
                            <div style="position: absolute; top: -15px; right: -15px; width: 50px; height: 50px; 
                                        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); 
                                        border-radius: 50%; opacity: 0.4;"></div>
                            <div style="position: relative; z-index: 1;">
                                <div style="font-size: 9px; color: #1e40af; margin-bottom: 8px; font-weight: 600; 
                                          text-transform: uppercase; letter-spacing: 0.5px;">Price</div>
                                <div style="font-size: 16px; font-weight: 700; color: #1e40af; line-height: 1.2;" id="sessionPrice">
                                    ₹${pricePerKwh > 0 ? pricePerKwh.toFixed(2) : '0.00'}/kWh
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Session Info - Compact -->
                    <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 16px; 
                                box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #f0f0f0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px;">
                            <div style="width: 3px; height: 18px; background: linear-gradient(180deg, #667eea 0%, #764ba2 100%); 
                                        border-radius: 2px;"></div>
                            <h3 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin: 0;">Session Details</h3>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; 
                                        padding: 12px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;">
                                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                                border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                        <i class="fas fa-clock" style="color: white; font-size: 12px;"></i>
                                    </div>
                                    <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600; white-space: nowrap;">Started At</span>
                                </div>
                                <div style="font-size: 12px; font-weight: 600; color: var(--text-primary); margin-left: 8px; 
                                          text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;">${formatDateTime(activeSession.startTime)}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; 
                                        padding: 12px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;">
                                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                                border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                        <i class="fas fa-receipt" style="color: white; font-size: 12px;"></i>
                                    </div>
                                    <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600; white-space: nowrap;">Transaction ID</span>
                                </div>
                                <div style="font-size: 10px; font-weight: 600; font-family: 'Courier New', monospace; 
                                          color: var(--text-primary); background: white; padding: 4px 8px; 
                                          border-radius: 6px; border: 1px solid #e2e8f0; margin-left: 8px;
                                          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">${activeSession.transactionId || 'N/A'}</div>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; 
                                        padding: 12px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;">
                                <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                                border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                        <i class="fas fa-id-card" style="color: white; font-size: 12px;"></i>
                                    </div>
                                    <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600; white-space: nowrap;">Session ID</span>
                                </div>
                                <div style="font-size: 10px; font-weight: 600; font-family: 'Courier New', monospace; 
                                          color: var(--text-primary); background: white; padding: 4px 8px; 
                                          border-radius: 6px; border: 1px solid #e2e8f0; margin-left: 8px;
                                          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%;">${activeSession.sessionId}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Stop Button - Compact -->
                    <button id="stopChargingBtn" 
                            style="width: 100%; padding: 12px 20px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); 
                                   color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; 
                                   min-height: 44px; cursor: pointer; transition: all 0.3s; 
                                   box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
                                   display: flex; align-items: center; justify-content: center; gap: 8px; 
                                   letter-spacing: 0.2px; text-transform: uppercase; margin-bottom: 12px;" 
                            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(239, 68, 68, 0.4)'"
                            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.3)'"
                            onclick="window.stopChargingFromSession('${activeSession.deviceId}', ${activeSession.connectorId}, ${activeSession.transactionId ? `'${activeSession.transactionId}'` : 'null'})">
                        <i class="fas fa-stop" style="font-size: 14px;"></i>
                        <span>Stop Charging</span>
                    </button>
                    
                    <div style="text-align: center; font-size: 11px; color: #94a3b8; 
                               display: flex; align-items: center; justify-content: center; gap: 6px; padding-bottom: 16px;">
                        <i class="fas fa-info-circle" style="font-size: 10px;"></i>
                        <span>You can navigate away and return via the snackbar</span>
                    </div>
                </div>
            </div>
            <style>
                @keyframes boltRotate {
                    from { 
                        transform: rotate(0deg);
                    }
                    to { 
                        transform: rotate(360deg);
                    }
                }
            </style>
        `;
        
        // Start auto-refresh for real-time updates
        startAutoRefresh(activeSession);
        
        // Setup Socket.io listener for real-time meter value updates
        setupSocketListeners(activeSession);
        
        // Back button is now allowed - user can navigate away
        // They can return via the snackbar on the home page
        
    } catch (error) {
        console.error('Error loading active session:', error);
        showError('Failed to load active session');
        // Redirect to dashboard on error
        const { loadDashboard } = await import('./dashboard.js');
        await loadDashboard();
    }
}

// Back button prevention removed - users can now navigate away from active session page
// They can return via the snackbar on the home page

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
    
    // Smooth UI updates every 100ms for fluid animation (always needed)
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

// Track if user just manually stopped to prevent duplicate notifications
let manualStopJustHappened = false;

// Socket.io connection for real-time updates
let socket = null;

// Setup Socket.io listeners for real-time updates
function setupSocketListeners(sessionData) {
    try {
        // Get Socket.io instance (should be available globally or import it)
        if (typeof io !== 'undefined') {
            socket = io();
            
            // Join customer room for notifications
            const customerId = sessionData.customerId || sessionData.customer?.id;
            if (customerId) {
                socket.emit('join-room', `customer:${customerId}`);
                console.log(`[Socket] Joined customer room: customer:${customerId}`);
            }
            
            // Listen for meter value updates
            socket.on('notification', (data) => {
                if (data.type === 'meter.values.updated' && data.data.sessionId === sessionData.sessionId) {
                    console.log('[Socket] Received meter values update:', data.data);
                    // Trigger immediate session refresh
                    updateSessionStats(sessionData);
                } else if (data.type === 'charging.stopped' && data.data.sessionId === sessionData.sessionId) {
                    console.log('[Socket] Received charging stopped notification');
                    // Session was stopped externally, handle it
                    handleSessionStoppedExternally(sessionData);
                }
            });
            
            console.log('[Socket] Socket.io listeners setup complete');
        } else {
            console.warn('[Socket] Socket.io not available, using polling only');
        }
    } catch (error) {
        console.error('[Socket] Error setting up Socket.io listeners:', error);
        // Continue with polling only if Socket.io fails
    }
}

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
        let elapsedTime = '0m';
        if (session.startTime) {
            const startTime = new Date(session.startTime);
            // Validate startTime is a valid date
            if (!isNaN(startTime.getTime())) {
                const elapsedMs = Date.now() - startTime.getTime();
                // Only calculate if elapsed time is positive (startTime is in the past)
                if (elapsedMs > 0) {
                    const elapsedMinutes = Math.floor(elapsedMs / 60000);
                    const elapsedHours = Math.floor(elapsedMinutes / 60);
                    const elapsedMins = elapsedMinutes % 60;
                    elapsedTime = elapsedHours > 0 
                        ? `${elapsedHours}h ${elapsedMins}m` 
                        : `${elapsedMins}m`;
                }
            }
        }
        
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
                // Set flag BEFORE making API call
                manualStopJustHappened = true;
                setTimeout(() => {
                    manualStopJustHappened = false;
                }, 10000);
                
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
                    
                    // Back button prevention removed - no cleanup needed
                    
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
                    
                    // Restore navigation visibility (bottom nav should already be visible)
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
                    
                    // Hide back button when leaving active session page
                    const backButton = document.querySelector('.back-button');
                    if (backButton) {
                        backButton.style.display = 'none';
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
        
        // Set flag BEFORE making API call to prevent duplicate notification from polling
        // (polling might detect session stopped while waiting for API response)
        manualStopJustHappened = true;
        // Reset flag after 10 seconds (enough time for API call + polling cycles)
        setTimeout(() => {
            manualStopJustHappened = false;
        }, 10000);
        
        // Call API to stop charging
        const response = await stopCharging(deviceId, connectorId, validTransactionId);
        
        if (!response.success) {
            showError(response.error || 'Failed to stop charging');
            // Reset flag on error
            manualStopJustHappened = false;
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
        
        // Only show warning if stopSuccess is explicitly false
        // In queue flow, stopSuccess is true if command was published successfully
        // stopSuccess can be undefined/null in queue flow, which we treat as success
        if (response.stopSuccess === false) {
            message += ' (Note: Charger remote-stop may have failed. Please verify charger status.)';
            showWarning(message);
        } else {
            // stopSuccess is true, undefined, or null - all treated as success
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
        // Back button prevention removed - no cleanup needed
        
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
        
        // Hide back button when leaving active session page
        const backButton = document.querySelector('.back-button');
        if (backButton) {
            backButton.style.display = 'none';
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
        
        // Reset flag on error
        manualStopJustHappened = false;
        
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
        // Back button prevention removed - no cleanup needed
        
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
        
        // Show appropriate message only if user didn't just manually stop
        // (to prevent duplicate notification - API response already showed success message)
        if (!manualStopJustHappened) {
            let message = 'Charging session has been stopped';
            if (refundAmount > 0) {
                message += `. Refund of ₹${refundAmount.toFixed(2)} has been processed and added to your wallet.`;
                showSuccess(message);
            } else {
                message += '.';
                showInfo(message);
            }
        } else {
            // User just manually stopped - API response already showed notification
            // Just log for debugging
            console.log('[Session Stopped] Suppressing duplicate notification - user just manually stopped');
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
        
        // Hide back button when leaving active session page
        const backButton = document.querySelector('.back-button');
        if (backButton) {
            backButton.style.display = 'none';
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

