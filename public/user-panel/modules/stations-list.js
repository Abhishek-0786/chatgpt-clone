// Stations List Module
import { updateActiveNav, updatePageTitle } from '../app.js';
import { getStations } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

export async function loadStationsModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'stations');
    
    updateActiveNav('stations');
    updatePageTitle('Charging Stations');
    
    const appMain = document.getElementById('appMain');
    
    appMain.innerHTML = `
        <div class="stations-container">
            <!-- Location Search Box -->
            <div class="card" style="padding: 12px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px; background: var(--bg-color); border-radius: 12px; padding: 8px 12px;">
                    <i class="fas fa-search" style="color: var(--text-secondary); font-size: 16px;"></i>
                    <input 
                        type="text" 
                        id="locationSearchInputStations" 
                        placeholder="Search by city, state, or address..." 
                        style="flex: 1; border: none; background: transparent; outline: none; font-size: 14px; color: var(--text-primary);"
                        onkeyup="if(event.key === 'Enter') window.searchStationsByLocationInList()"
                    />
                    <button 
                        onclick="window.clearLocationSearchInList()" 
                        id="clearLocationBtnStations" 
                        style="display: none; background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; font-size: 14px;"
                    >
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            
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
        
        if (stations && stations.length > 0) {
            container.innerHTML = stations.map(station => `
                <div class="card" style="cursor: pointer;" onclick="window.viewStationDetail('${station.stationId}')">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${station.stationName}</h3>
                            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                                <i class="fas fa-map-marker-alt"></i> ${station.city || 'N/A'}, ${station.state || 'N/A'}
                            </div>
                        </div>
                        <span class="badge ${station.status === 'Online' ? 'badge-success' : 'badge-danger'}">
                            ${station.status || 'Offline'}
                        </span>
                    </div>
                    <div style="margin-top: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Available Chargers</div>
                                <div style="font-size: 16px; font-weight: 600;">${station.onlineCPs || 0} / ${station.totalCPs || 0}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Price</div>
                                <div style="font-size: 16px; font-weight: 600;">₹${station.pricePerKwh || 0}/kWh onwards</div>
                            </div>
                        </div>
                        ${station.amenities && station.amenities.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                            ${station.amenities.map(amenity => {
                                const iconMap = {
                                    'Parking': 'fa-parking',
                                    'Restroom': 'fa-restroom',
                                    'WiFi': 'fa-wifi',
                                    'Food': 'fa-utensils',
                                    'Cafe': 'fa-coffee',
                                    'Shop': 'fa-store'
                                };
                                const icon = iconMap[amenity] || 'fa-check';
                                return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-secondary); background: var(--bg-color); padding: 4px 8px; border-radius: 6px;">
                                    <i class="fas ${icon}"></i>
                                    <span>${amenity}</span>
                                </span>`;
                            }).join('')}
                        </div>
                        ` : ''}
                    </div>
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
