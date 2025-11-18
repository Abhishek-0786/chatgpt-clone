// CMS Main JavaScript
import { loadDashboardModule } from './modules/dashboard.js';
import { loadChargingStationsModule } from './modules/charging-stations.js';
import { loadChargingPointsModule } from './modules/charging-points.js';
import { loadChargingSessionsModule } from './modules/charging-sessions.js';
import { loadTariffManagementModule } from './modules/tariff-management.js';
import { loadCustomersModule } from './modules/customers.js';

// Export functions for global access
export { loadDashboardModule, loadChargingStationsModule, loadChargingPointsModule, loadChargingSessionsModule, loadTariffManagementModule, loadCustomersModule };

// Define loadModule function first
function loadModule(moduleName, pushState = true) {
    const moduleContent = document.getElementById('moduleContent');
    
    // Clear stations refresh interval when switching to a different module
    if (moduleName !== 'charging-stations') {
        import('./modules/charging-stations.js').then(module => {
            if (module.clearStationsRefreshInterval) {
                module.clearStationsRefreshInterval();
            }
        }).catch(() => {
            // Ignore errors if module not loaded
        });
    }
    
    // Clear points refresh interval when switching to a different module
    if (moduleName !== 'charging-points') {
        import('./modules/charging-points.js').then(module => {
            if (module.clearPointsRefreshInterval) {
                module.clearPointsRefreshInterval();
            }
        }).catch(() => {
            // Ignore errors if module not loaded
        });
    }
    
    // Update URL without reloading page
    if (pushState) {
        const url = `/cms.html?module=${moduleName}`;
        window.history.pushState({ module: moduleName }, '', url);
    }
    
    switch(moduleName) {
        case 'dashboard':
            loadDashboardModule();
            break;
        case 'charging-stations':
            loadChargingStationsModule();
            break;
        case 'charging-points':
            loadChargingPointsModule();
            break;
        case 'charging-sessions':
            loadChargingSessionsModule();
            break;
        case 'tariff-management':
            loadTariffManagementModule();
            break;
        case 'customers':
            loadCustomersModule();
            break;
        default:
            loadDashboardModule();
    }
}

// Make loadModule globally available
window.loadModule = loadModule;

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
    const urlParams = new URLSearchParams(window.location.search);
    let module = urlParams.get('module');
    const stationId = urlParams.get('station');
    const pointId = urlParams.get('point');
    const action = urlParams.get('action');
    
    // If no module specified, default to dashboard
    if (!module) {
        module = 'dashboard';
    }
    
    // Update active menu item
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === module) {
            item.classList.add('active');
        }
    });
    
    // Handle station detail view
    if (stationId && module === 'charging-stations' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load station detail view with active tab
        import('./modules/station-detail-view.js').then(detailModule => {
            detailModule.loadStationDetailView(stationId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading station detail:', error);
            loadModule(module, false);
        });
    } else if (stationId && module === 'charging-stations' && action === 'edit') {
        // Load edit station form
        import('./modules/add-station-form.js').then(formModule => {
            formModule.openEditStationForm(stationId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(module, false);
        });
    } else if (pointId && module === 'charging-points' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load charging point detail view with active tab
        import('./modules/charging-point-detail-view.js').then(detailModule => {
            window.currentChargingPointId = pointId;
            detailModule.loadChargingPointDetailView(pointId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading charging point detail:', error);
            loadModule(module, false);
        });
    } else if (pointId && module === 'charging-points' && action === 'edit') {
        // Load edit charging point form
        import('./modules/add-charging-point-form.js').then(formModule => {
            formModule.openEditChargingPointForm(pointId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(module, false);
        });
    } else {
        // Load regular module without pushing new state (to avoid infinite loop)
        loadModule(module, false);
    }
});

// Handle initial page load - check URL for module
function initializeCMS() {
    // FIRST: Check URL and set active menu item BEFORE any module loads
    const urlParams = new URLSearchParams(window.location.search);
    let moduleFromUrl = urlParams.get('module');
    
    // If no module specified, default to dashboard only on first visit
    if (!moduleFromUrl) {
        moduleFromUrl = 'dashboard';
        // Update URL to include dashboard module
        window.history.replaceState({ module: 'dashboard' }, '', '/cms.html?module=dashboard');
    }
    
    // Update active menu item based on URL IMMEDIATELY
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === moduleFromUrl) {
            item.classList.add('active');
        }
    });
    
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
    });

    // Menu item click handlers
    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all items
            menuItems.forEach(mi => mi.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
            
            // Load module
            const module = this.getAttribute('data-module');
            loadModule(module);
        });
    });
    
    // Show module content area
    const moduleContent = document.getElementById('moduleContent');
    if (moduleContent) {
        moduleContent.style.display = 'block';
    }
    
    // Check for additional URL parameters (station, point, action) on initial load
    const stationId = urlParams.get('station');
    const pointId = urlParams.get('point');
    const action = urlParams.get('action');
    
    // Handle station detail view on initial load
    if (stationId && moduleFromUrl === 'charging-stations' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load station detail view with active tab
        import('./modules/station-detail-view.js').then(detailModule => {
            detailModule.loadStationDetailView(stationId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading station detail:', error);
            loadModule(moduleFromUrl, false);
        });
    } else if (stationId && moduleFromUrl === 'charging-stations' && action === 'edit') {
        // Load edit station form
        import('./modules/add-station-form.js').then(formModule => {
            formModule.openEditStationForm(stationId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(moduleFromUrl, false);
        });
    } else if (pointId && moduleFromUrl === 'charging-points' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load charging point detail view with active tab
        import('./modules/charging-point-detail-view.js').then(detailModule => {
            window.currentChargingPointId = pointId;
            detailModule.loadChargingPointDetailView(pointId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading charging point detail:', error);
            loadModule(moduleFromUrl, false);
        });
    } else if (pointId && moduleFromUrl === 'charging-points' && action === 'edit') {
        // Load edit charging point form
        import('./modules/add-charging-point-form.js').then(formModule => {
            formModule.openEditChargingPointForm(pointId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(moduleFromUrl, false);
        });
    } else {
        // Load regular module from URL (without pushing state on initial load)
        loadModule(moduleFromUrl, false);
    }
    
    // Push initial state if not already in history
    if (!window.location.search.includes('module=')) {
        window.history.replaceState({ module: moduleFromUrl }, '', `/cms.html?module=${moduleFromUrl}`);
    }
}

// Initialize CMS on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeCMS();
});
