// Active Session Module - Locked charging session page (user must stop charging to leave)
import { updatePageTitle } from '../app.js';
import { getActiveSession, stopCharging } from '../services/api.js';
import { showError, showSuccess, showConfirm } from '../../utils/notifications.js';

let refreshInterval = null;
let backNavigationHandler = null;

export async function loadActiveSession() {
    updatePageTitle('Charging Active');
    
    const appMain = document.getElementById('appMain');
    
    try {
        // TEMPORARY: Mock active session data
        // TODO: Fetch from API
        const mockActiveSession = {
            sessionId: 'SESS-ACTIVE-001',
            transactionId: 'TXN-12345',
            stationName: 'Spring House Station',
            chargerName: 'Charger 1',
            deviceId: 'DEV-001',
            connectorId: 1,
            startTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
            energy: 2.5, // kWh
            billedAmount: 28.75, // ₹
            pricePerKwh: 11.50,
            status: 'charging'
        };
        
        // Uncomment below when backend is ready:
        // const response = await getActiveSession();
        // const mockActiveSession = response.success ? response.session : null;
        
        if (!mockActiveSession) {
            // No active session, redirect to dashboard
            const { loadDashboard } = await import('./dashboard.js');
            await loadDashboard();
            return;
        }
        
        // Calculate elapsed time
        const startTime = new Date(mockActiveSession.startTime);
        const elapsedMs = Date.now() - startTime.getTime();
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        const elapsedMins = elapsedMinutes % 60;
        const elapsedTime = elapsedHours > 0 
            ? `${elapsedHours}h ${elapsedMins}m` 
            : `${elapsedMins}m`;
        
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
                        <div style="font-size: 13px; opacity: 0.9; margin-bottom: 2px;">${mockActiveSession.stationName}</div>
                        <div style="font-size: 12px; opacity: 0.8;">${mockActiveSession.chargerName}</div>
                    </div>
                </div>
                
                <!-- Charging Stats -->
                <div class="card" style="margin-bottom: 12px;">
                    <h3 class="card-title" style="font-size: 14px; margin-bottom: 10px;">Charging Details</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div style="text-align: center; padding: 12px; background: var(--bg-color); border-radius: 10px;">
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 5px;">Energy Charged</div>
                            <div style="font-size: 22px; font-weight: 700; color: var(--primary-color); line-height: 1.2;" id="sessionEnergy">
                                ${mockActiveSession.energy.toFixed(2)} <span style="font-size: 14px;">kWh</span>
                            </div>
                        </div>
                        <div style="text-align: center; padding: 12px; background: var(--bg-color); border-radius: 10px;">
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 5px;">Cost</div>
                            <div style="font-size: 22px; font-weight: 700; color: var(--primary-color);" id="sessionCost">
                                ₹${mockActiveSession.billedAmount.toFixed(2)}
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
                            <div style="font-size: 16px; font-weight: 600; color: var(--text-primary);">
                                ₹${mockActiveSession.pricePerKwh.toFixed(2)}/kWh
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
                            <div style="font-size: 12px; font-weight: 600;">${formatDateTime(mockActiveSession.startTime)}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-color); border-radius: 8px;">
                            <div style="font-size: 12px; color: var(--text-secondary);">Transaction ID</div>
                            <div style="font-size: 12px; font-weight: 600; font-family: monospace;">${mockActiveSession.transactionId}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--bg-color); border-radius: 8px;">
                            <div style="font-size: 12px; color: var(--text-secondary);">Session ID</div>
                            <div style="font-size: 12px; font-weight: 600; font-family: monospace;">${mockActiveSession.sessionId}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Stop Charging Button -->
                <div class="card" style="padding: 16px;">
                    <button class="btn btn-danger btn-full" style="font-size: 15px; padding: 12px; min-height: 48px; font-weight: 600;" 
                            onclick="window.stopChargingFromSession('${mockActiveSession.deviceId}', ${mockActiveSession.connectorId}, '${mockActiveSession.transactionId}')">
                        <i class="fas fa-stop"></i> Stop Charging
                    </button>
                    <div style="text-align: center; margin-top: 8px; font-size: 10px; color: var(--text-secondary);">
                        You must stop charging to leave this page
                    </div>
                </div>
            </div>
        `;
        
        // Start auto-refresh for real-time updates
        startAutoRefresh(mockActiveSession);
        
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
    // Clear any existing interval
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    // Update every 5 seconds
    refreshInterval = setInterval(() => {
        updateSessionStats(sessionData);
    }, 5000);
    
    // Also update immediately
    updateSessionStats(sessionData);
}

// Update session statistics
function updateSessionStats(sessionData) {
    const startTime = new Date(sessionData.startTime);
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
    
    // TODO: Fetch real-time energy and cost from API
    // For now, simulate incremental updates
    const energyEl = document.getElementById('sessionEnergy');
    const costEl = document.getElementById('sessionCost');
    
    if (energyEl && costEl) {
        // Simulate energy increase (0.1 kWh per minute)
        const additionalEnergy = (elapsedMinutes * 0.1);
        const totalEnergy = sessionData.energy + additionalEnergy;
        const totalCost = totalEnergy * sessionData.pricePerKwh;
        
        energyEl.innerHTML = `${totalEnergy.toFixed(2)} <span style="font-size: 14px;">kWh</span>`;
        costEl.textContent = `₹${totalCost.toFixed(2)}`;
    }
}

// Stop charging from active session page
window.stopChargingFromSession = async function(deviceId, connectorId, transactionId) {
    const confirmed = await showConfirm(
        'Are you sure you want to stop charging?',
        'Stop Charging',
        'Stop Charging'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        // TODO: Call API to stop charging
        // const response = await stopCharging(deviceId, connectorId, transactionId);
        
        // TEMPORARY: Mock success
        showSuccess('Charging stopped successfully');
        
        // Clear refresh interval
        if (refreshInterval) {
            clearInterval(refreshInterval);
            refreshInterval = null;
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
        
        // Redirect to dashboard
        setTimeout(async () => {
            const { loadDashboard } = await import('./dashboard.js');
            await loadDashboard();
        }, 1000);
    } catch (error) {
        console.error('Error stopping charging:', error);
        showError(error.message || 'Failed to stop charging');
    }
};

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

