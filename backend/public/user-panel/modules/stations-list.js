// Stations List Module
import { updateActiveNav, updatePageTitle, refreshWalletBalance } from '../app.js';
import { getStations } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

// Filter state for stations list
let currentFiltersStations = {
    operationalStatus: 'all',
    connectorType: 'all'
};

// Get connector type icon HTML (same as dashboard)
function getConnectorTypeIcon(connectorType) {
    const icons = {
        'type2': { icon: 'fa-plug', name: 'Type 2', color: '#007bff' },
        'ccs2': { icon: 'fa-bolt', name: 'CCS2', color: '#dc3545' },
        'type1': { icon: 'fa-plug', name: 'Type 1', color: '#28a745' },
        'gbt': { icon: 'fa-charging-station', name: 'GB/T', color: '#ffc107' },
        'nacs': { icon: 'fa-bolt', name: 'NACS', color: '#17a2b8' },
        'ac_socket': { icon: 'fa-plug', name: 'AC Socket', color: '#6c757d' }
    };
    
    const connector = icons[connectorType.toLowerCase()] || { icon: 'fa-plug', name: connectorType, color: '#6c757d' };
    
    return `
        <div style="display: flex; align-items: center; gap: 4px; background: #f8f9fa; padding: 4px 8px; border-radius: 6px; border: 1px solid #e0e0e0;">
            <i class="fas ${connector.icon}" style="color: ${connector.color}; font-size: 11px;"></i>
            <span style="font-size: 10px; font-weight: 500; color: var(--text-primary);">${connector.name}</span>
        </div>
    `;
}

export async function loadStationsModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'stations');
    
    updateActiveNav('stations');
    updatePageTitle('Stations');
    
    // Reduce header title font size for stations page
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.style.fontSize = '18px';
    }
    
    const appMain = document.getElementById('appMain');
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
    appMain.innerHTML = `
        <div class="stations-container">
            <!-- Search Bar with Filter -->
            <div style="margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px; background: white; border-radius: 12px; padding: 12px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border: 1px solid rgba(0,0,0,0.1);">
                    <i class="fas fa-search" style="color: var(--text-secondary); font-size: 16px; flex-shrink: 0;"></i>
                    <input 
                        type="text" 
                        id="locationSearchInputStations" 
                        placeholder="Search by city, state, or address..." 
                        style="flex: 1; border: none; background: transparent; outline: none; font-size: 14px; color: var(--text-primary); min-width: 0;"
                        onkeyup="if(event.key === 'Enter') window.searchStationsByLocationInList()"
                    />
                    <button 
                        onclick="window.clearLocationSearchInList()" 
                        id="clearLocationBtnStations" 
                        style="display: none; background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; font-size: 14px; flex-shrink: 0;"
                    >
                        <i class="fas fa-times"></i>
                    </button>
                    <div style="width: 1px; height: 24px; background: rgba(0,0,0,0.1); flex-shrink: 0;"></div>
                    <button 
                        onclick="window.showFilterModalStations()" 
                        id="filterBtnStations"
                        style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; font-size: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;"
                        title="Filter stations"
                    >
                        <i class="fas fa-filter"></i>
                    </button>
                </div>
            </div>
            
            <!-- Filter Modal -->
            <div id="filterModalStations" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: calc(100% - 32px); max-width: 400px; z-index: 1001; background: white; border-radius: 12px; padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); pointer-events: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="font-size: 18px; font-weight: 600; margin: 0; color: var(--text-primary);">Filter Stations</h3>
                    <button onclick="window.closeFilterModalStations()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 18px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Operational Status Filter -->
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">Operational Status</label>
                    <select id="operationalStatusFilterStations" style="width: 100%; padding: 10px; border: 2px solid var(--border-color); border-radius: 8px; font-size: 14px; background: white; color: var(--text-primary);" onchange="window.applyFiltersStations()">
                        <option value="all">All Stations</option>
                        <option value="operational">Operational</option>
                        <option value="non-operational">Non-Operational</option>
                    </select>
                </div>
                
                <!-- Connector Type Filter -->
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">Connector Type</label>
                    <select id="connectorTypeFilterStations" style="width: 100%; padding: 10px; border: 2px solid var(--border-color); border-radius: 8px; font-size: 14px; background: white; color: var(--text-primary);" onchange="window.applyFiltersStations()">
                        <option value="all">All Types</option>
                        <option value="type2">Type 2</option>
                        <option value="ccs2">CCS2</option>
                        <option value="type1">Type 1</option>
                        <option value="gbt">GBT</option>
                        <option value="nacs">NACS</option>
                        <option value="ac_socket">AC Socket</option>
                    </select>
                </div>
                
                <button onclick="window.resetFiltersStations()" class="btn btn-outline btn-full" style="margin-top: 8px;">
                    Reset Filters
                </button>
            </div>
            
            <!-- Filter Modal Overlay -->
            <div id="filterModalOverlayStations" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000;" onclick="window.closeFilterModalStations()"></div>
            
            <div id="stationsList">
                <div class="spinner"></div>
            </div>
        </div>
    `;
    
    // Setup search input event listeners
    const searchInput = document.getElementById('locationSearchInputStations');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const clearBtn = document.getElementById('clearLocationBtnStations');
            if (this.value.trim()) {
                clearBtn.style.display = 'block';
            } else {
                clearBtn.style.display = 'none';
            }
        });
    }
    
    // Load stations list
    await loadStationsList();
}

// View station detail - now loads station detail view
window.viewStationDetail = async function(stationId) {
    const { loadStationDetail } = await import('./station-detail.js');
    // Fetch station name from API if needed
    try {
        const { getStationDetails } = await import('../services/api.js');
        const response = await getStationDetails(stationId);
        const stationName = response.success && response.station ? response.station.stationName : null;
        await loadStationDetail(stationId, stationName);
    } catch (error) {
        await loadStationDetail(stationId, null);
    }
};

// Load stations list
async function loadStationsList(location = null) {
    try {
        const container = document.getElementById('stationsList');
        
        // Build API params
        const params = {};
        if (location && location.trim()) {
            params.location = location.trim();
        } else {
            // If no location, sort by last active
            params.sortBy = 'lastActive';
        }
        
        // Fetch stations from API
        const response = await getStations(params);
        const stations = response.success && response.stations ? response.stations : [];
        
        // Apply filters
        let filteredStations = stations;
        if (currentFiltersStations.operationalStatus === 'operational') {
            filteredStations = filteredStations.filter(station => station.status === 'Online');
        } else if (currentFiltersStations.operationalStatus === 'non-operational') {
            filteredStations = filteredStations.filter(station => station.status === 'Offline');
        }
        
        if (currentFiltersStations.connectorType !== 'all') {
            filteredStations = filteredStations.filter(station => {
                if (station.connectorTypes && Array.isArray(station.connectorTypes)) {
                    return station.connectorTypes.includes(currentFiltersStations.connectorType);
                }
                return false;
            });
        }
        
        if (filteredStations && filteredStations.length > 0) {
            container.innerHTML = filteredStations.map(station => `
                <div class="card" style="cursor: pointer; padding: 12px; margin-bottom: 12px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);" onclick="window.viewStationDetail('${station.stationId}')">
                    <!-- Header Section -->
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; min-width: 0;">
                        <div style="flex: 1; min-width: 0; overflow: hidden;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; min-width: 0;">
                                <span class="badge ${station.status === 'Online' ? 'badge-success' : 'badge-danger'}" style="display: inline-block; font-size: 10px; padding: 4px 8px; flex-shrink: 0;">${station.status || 'Offline'}</span>
                                <h3 style="font-size: 16px; font-weight: 600; margin: 0; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;">${station.stationName}</h3>
                            </div>
                            <p style="font-size: 12px; color: var(--text-secondary); margin: 0; display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden;">
                                <i class="fas fa-map-marker-alt" style="font-size: 11px; flex-shrink: 0;"></i> 
                                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1;">${station.city || 'N/A'}, ${station.state || 'N/A'}</span>
                            </p>
                        </div>
                    </div>
                    
                    <!-- Stats Section -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.08);">
                        <div>
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px;">Available Chargers</div>
                            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${station.onlineCPs || 0} / ${station.totalCPs || 0}</div>
                        </div>
                        <div>
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px;">Price</div>
                            <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">₹${station.pricePerKwh || 0}/kWh onwards</div>
                        </div>
                    </div>
                    
                    <!-- Connector Types Section -->
                    ${station.connectorTypes && station.connectorTypes.length > 0 ? `
                    <div style="margin-top: 4px;">
                        <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 600;">Supported Connectors</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                            ${station.connectorTypes.map(type => getConnectorTypeIcon(type)).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-map-marker-alt"></i>
                    <h3>No Stations Found</h3>
                    <p>No charging stations available at the moment</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading stations:', error);
        showError('Failed to load stations');
        document.getElementById('stationsList').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Stations</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

// Search stations by location in stations list
window.searchStationsByLocationInList = async function() {
    const searchInput = document.getElementById('locationSearchInputStations');
    const location = searchInput ? searchInput.value.trim() : '';
    await loadStationsList(location);
};

// Clear location search in stations list
window.clearLocationSearchInList = async function() {
    const searchInput = document.getElementById('locationSearchInputStations');
    const clearBtn = document.getElementById('clearLocationBtnStations');
    if (searchInput) {
        searchInput.value = '';
        clearBtn.style.display = 'none';
    }
    await loadStationsList(null);
};

// Show filter modal for stations list
window.showFilterModalStations = function() {
    const filterModal = document.getElementById('filterModalStations');
    const filterOverlay = document.getElementById('filterModalOverlayStations');
    if (filterModal) {
        filterModal.style.display = 'block';
    }
    if (filterOverlay) {
        filterOverlay.style.display = 'block';
    }
};

// Close filter modal for stations list
window.closeFilterModalStations = function() {
    const filterModal = document.getElementById('filterModalStations');
    const filterOverlay = document.getElementById('filterModalOverlayStations');
    if (filterModal) {
        filterModal.style.display = 'none';
    }
    if (filterOverlay) {
        filterOverlay.style.display = 'none';
    }
};

// Apply filters for stations list
window.applyFiltersStations = async function() {
    const operationalStatus = document.getElementById('operationalStatusFilterStations')?.value || 'all';
    const connectorType = document.getElementById('connectorTypeFilterStations')?.value || 'all';
    
    currentFiltersStations = {
        operationalStatus: operationalStatus,
        connectorType: connectorType
    };
    
    // Update filter button to show active state
    const filterBtn = document.getElementById('filterBtnStations');
    if (filterBtn) {
        const hasActiveFilters = operationalStatus !== 'all' || connectorType !== 'all';
        if (hasActiveFilters) {
            filterBtn.style.color = 'var(--primary-color)';
            filterBtn.innerHTML = '<i class="fas fa-filter" style="position: relative;"><span style="position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; background: var(--primary-color); border-radius: 50%; border: 2px solid white;"></span></i>';
        } else {
            filterBtn.style.color = 'var(--text-secondary)';
            filterBtn.innerHTML = '<i class="fas fa-filter"></i>';
        }
    }
    
    // Reload stations with filters
    const searchInput = document.getElementById('locationSearchInputStations');
    const location = searchInput ? searchInput.value.trim() : '';
    await loadStationsList(location);
    
    window.closeFilterModalStations();
};

// Reset filters for stations list
window.resetFiltersStations = async function() {
    const operationalStatusFilter = document.getElementById('operationalStatusFilterStations');
    const connectorTypeFilter = document.getElementById('connectorTypeFilterStations');
    
    if (operationalStatusFilter) operationalStatusFilter.value = 'all';
    if (connectorTypeFilter) connectorTypeFilter.value = 'all';
    
    currentFiltersStations = {
        operationalStatus: 'all',
        connectorType: 'all'
    };
    
    // Update filter button
    const filterBtn = document.getElementById('filterBtnStations');
    if (filterBtn) {
        filterBtn.style.color = 'var(--text-secondary)';
        filterBtn.innerHTML = '<i class="fas fa-filter"></i>';
    }
    
    // Reload stations
    const searchInput = document.getElementById('locationSearchInputStations');
    const location = searchInput ? searchInput.value.trim() : '';
    await loadStationsList(location);
    
    window.closeFilterModalStations();
};
