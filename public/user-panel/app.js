// User Panel - Main Application Entry Point
import { checkAuth, loadAuthModule } from './modules/auth.js';
import { loadDashboard } from './modules/dashboard.js';
import { loadStationsModule } from './modules/stations-list.js';
import { loadWalletModule } from './modules/wallet.js';
import { loadSessionsModule } from './modules/sessions.js';
import { loadProfileModule } from './modules/profile.js';
import { showError } from '../utils/notifications.js';

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Import charging popup module
        await import('./modules/charging-popup.js');
        
        // Check if user is authenticated
        const isAuthenticated = await checkAuth();
        
        if (!isAuthenticated) {
            // Show auth screen
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('authScreen').style.display = 'block';
            await loadAuthModule();
        } else {
            // Show main app
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('appContainer').style.display = 'flex';
            
            // Check for active session first
            const { getActiveSession } = await import('./services/api.js');
            const sessionResponse = await getActiveSession().catch(() => ({ success: false, session: null }));
            const activeSession = sessionResponse.success ? sessionResponse.session : null;
            
            // If there's an active session, load it
            if (activeSession && activeSession.status && !['stopped', 'completed', 'failed'].includes(activeSession.status)) {
                const { loadActiveSession } = await import('./modules/active-session.js');
                await loadActiveSession();
            } else {
                // Check URL parameters or sessionStorage for which page to load
                const urlParams = new URLSearchParams(window.location.search);
                const page = urlParams.get('page') || sessionStorage.getItem('lastPage') || 'dashboard';
                
                // Load the appropriate page
                switch(page) {
                    case 'stations':
                        await loadStationsModule();
                        break;
                    case 'wallet':
                        await loadWalletModule();
                        break;
                    case 'sessions':
                        await loadSessionsModule();
                        break;
                    case 'profile':
                        await loadProfileModule();
                        break;
                    case 'vehicles':
                        await window.loadVehiclesModule();
                        break;
                    case 'station-detail':
                        // Load station detail page if stationId is stored
                        const lastStationId = sessionStorage.getItem('lastStationId');
                        const lastStationName = sessionStorage.getItem('lastStationName');
                        if (lastStationId) {
                            const { loadStationDetail } = await import('./modules/station-detail.js');
                            await loadStationDetail(lastStationId, lastStationName);
                        } else {
                            // Fallback to dashboard if no stationId found
                            await loadDashboard();
                        }
                        break;
                    case 'charger-detail':
                        // Load charger detail page if parameters are stored
                        const lastChargingPointId = sessionStorage.getItem('lastChargingPointId');
                        const lastDeviceId = sessionStorage.getItem('lastDeviceId');
                        const lastStationIdForCharger = sessionStorage.getItem('lastStationId');
                        const lastStationNameForCharger = sessionStorage.getItem('lastStationName');
                        if (lastChargingPointId && lastDeviceId && lastStationIdForCharger) {
                            const { loadChargerDetail } = await import('./modules/charger-detail.js');
                            await loadChargerDetail(lastChargingPointId, lastDeviceId, lastStationIdForCharger, lastStationNameForCharger);
                        } else {
                            // Fallback to dashboard if parameters not found
                            await loadDashboard();
                        }
                        break;
                    case 'connector-selection':
                        // Load connector selection page if parameters are stored
                        const lastChargingPointIdForConnector = sessionStorage.getItem('lastChargingPointId');
                        const lastDeviceIdForConnector = sessionStorage.getItem('lastDeviceId');
                        const lastDeviceName = sessionStorage.getItem('lastDeviceName');
                        const lastStationIdForConnector = sessionStorage.getItem('lastStationId');
                        const lastStationNameForConnector = sessionStorage.getItem('lastStationName');
                        if (lastChargingPointIdForConnector && lastDeviceIdForConnector && lastStationIdForConnector) {
                            const { loadConnectorSelection } = await import('./modules/connector-selection.js');
                            await loadConnectorSelection(lastChargingPointIdForConnector, lastDeviceIdForConnector, lastDeviceName, lastStationIdForConnector, lastStationNameForConnector);
                        } else {
                            // Fallback to dashboard if parameters not found
                            await loadDashboard();
                        }
                        break;
                    case 'active-session':
                        // Load active session page (will redirect to dashboard if no active session)
                        const { loadActiveSession } = await import('./modules/active-session.js');
                        await loadActiveSession();
                        break;
                    default:
                        await loadDashboard();
                }
            }
            
            // Check for active session and show banner
            checkActiveSession();
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to load application');
    }
});

// Check for active charging session
async function checkActiveSession() {
    try {
        // TODO: Implement API call to check active session
        // For now, hide the banner
        document.getElementById('activeSessionBanner').style.display = 'none';
    } catch (error) {
        console.error('Error checking active session:', error);
    }
}

// View active session
window.viewActiveSession = async function() {
    const { loadActiveSession } = await import('./modules/active-session.js');
    await loadActiveSession();
};

// Show wallet quick view
window.showWalletQuickView = function() {
    loadWalletModule();
};

// Make navigation functions globally available
window.loadDashboard = loadDashboard;
window.loadStationsModule = loadStationsModule;
window.loadWalletModule = loadWalletModule;
window.loadSessionsModule = loadSessionsModule;
window.loadProfileModule = loadProfileModule;

// Load vehicles module
window.loadVehiclesModule = async function() {
    const { loadVehiclesModule } = await import('./modules/vehicles.js');
    await loadVehiclesModule();
};

// Mobile menu toggle
window.toggleMobileMenu = function() {
    const overlay = document.getElementById('mobileMenuOverlay');
    const sidebar = document.getElementById('mobileSidebar');
    
    if (overlay && sidebar) {
        overlay.classList.toggle('active');
        sidebar.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }
};

// Close mobile menu on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('mobileSidebar');
        if (sidebar && sidebar.classList.contains('active')) {
            window.toggleMobileMenu();
        }
    }
});

// Update active nav item
export function updateActiveNav(page) {
    // Update bottom nav (mobile)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === page) {
            item.classList.add('active');
        }
    });
    
    // Update sidebar nav (desktop)
    document.querySelectorAll('.sidebar-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === page) {
            item.classList.add('active');
        }
    });
    
    // Update mobile nav
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === page) {
            item.classList.add('active');
        }
    });
    
    // Show/hide sidebar based on screen size
    const sidebarNav = document.getElementById('sidebarNav');
    if (window.innerWidth >= 1024) {
        if (sidebarNav) sidebarNav.style.display = 'flex';
    } else {
        if (sidebarNav) sidebarNav.style.display = 'none';
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    updateActiveNav(document.querySelector('.nav-item.active, .sidebar-nav-item.active')?.getAttribute('data-page') || 'dashboard');
});

// Update page title
export function updatePageTitle(title) {
    const titleElement = document.getElementById('pageTitle');
    if (titleElement) {
        titleElement.textContent = title;
    }
}

// Update wallet balance in header
export function updateWalletBalance(balance) {
    const balanceElement = document.getElementById('walletBalance');
    if (balanceElement) {
        balanceElement.textContent = `₹${parseFloat(balance || 0).toFixed(2)}`;
    }
}

