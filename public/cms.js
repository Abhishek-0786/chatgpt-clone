// CMS Main JavaScript
import { loadChargingStationsModule } from './modules/charging-stations.js';
import { loadChargingPointsModule } from './modules/charging-points.js';
import { loadChargingSessionsModule } from './modules/charging-sessions.js';
import { loadTariffManagementModule } from './modules/tariff-management.js';
import { loadCustomersModule } from './modules/customers.js';

// Export functions for global access
export { loadChargingStationsModule, loadChargingPointsModule, loadChargingSessionsModule, loadTariffManagementModule, loadCustomersModule };

document.addEventListener('DOMContentLoaded', function() {
    initializeCMS();
});


function loadModule(moduleName, pushState = true) {
    const moduleContent = document.getElementById('moduleContent');
    
    // Update URL without reloading page
    if (pushState) {
        const url = `/cms.html?module=${moduleName}`;
        window.history.pushState({ module: moduleName }, '', url);
    }
    
    switch(moduleName) {
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
            moduleContent.innerHTML = '<h2>Module Not Found</h2>';
    }
}

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
    const urlParams = new URLSearchParams(window.location.search);
    const module = urlParams.get('module') || 'charging-stations';
    const stationId = urlParams.get('station');
    const pointId = urlParams.get('point');
    const action = urlParams.get('action');
    
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
        // Load station detail view
        import('./modules/station-detail-view.js').then(detailModule => {
            detailModule.loadStationDetailView(stationId);
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
        // Load charging point detail view
        import('./modules/charging-point-detail-view.js').then(detailModule => {
            window.currentChargingPointId = pointId;
            detailModule.loadChargingPointDetailView(pointId);
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
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
    });

    // Menu item click handlers
    const menuItems = document.querySelectorAll('.menu-item');
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

    // Check URL for module parameter on initial load
    const urlParams = new URLSearchParams(window.location.search);
    const moduleFromUrl = urlParams.get('module') || 'charging-stations';
    
    // Update active menu item based on URL
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === moduleFromUrl) {
            item.classList.add('active');
        }
    });
    
    // Load module from URL (without pushing state on initial load)
    loadModule(moduleFromUrl, false);
    
    // Push initial state if not already in history
    if (!window.location.search.includes('module=')) {
        window.history.replaceState({ module: moduleFromUrl }, '', `/cms.html?module=${moduleFromUrl}`);
    }
}
