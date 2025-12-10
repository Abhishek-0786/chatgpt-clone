// Station Detail Module - Shows station details and chargers with tabs
import { updatePageTitle, refreshWalletBalance } from '../app.js';
import { getStationChargingPoints, getActiveSession, getStationDetails, getVehicles, getWalletBalance } from '../services/api.js';
import { startCharging } from '../services/api.js';
import { showError, showSuccess } from '../../utils/notifications.js';

let currentTab = 'details'; // 'details' or 'charger'
let allChargers = [];
let filteredChargers = [];
let currentFilters = {
    status: 'all', // 'all', 'available', 'busy', 'offline'
    chargerType: 'all' // 'all', 'ac', 'dc'
};

export async function loadStationDetail(stationId, stationName) {
    // Page title removed - no longer updating page title for station detail page
    
    // Store station info in session storage for navigation after stopping charging
    if (stationId) {
        sessionStorage.setItem('lastStationId', stationId);
        if (stationName) {
            sessionStorage.setItem('lastStationName', stationName);
        }
        // Store page type for refresh persistence
        sessionStorage.setItem('lastPage', 'station-detail');
    }
    
    const appMain = document.getElementById('appMain');
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
    try {
        // Fetch station details and charging points
        const [stationResponse, pointsResponse, sessionResponse] = await Promise.all([
            getStationDetails(stationId).catch(() => ({ success: false, station: null })),
            getStationChargingPoints(stationId).catch(() => ({ success: false, points: [] })),
            getActiveSession().catch(() => ({ success: false, session: null }))
        ]);
        
        const station = stationResponse.success ? stationResponse.station : null;
        const chargingPoints = pointsResponse.success && pointsResponse.points ? pointsResponse.points : [];
        const userActiveSession = sessionResponse.success ? sessionResponse.session : null;
        
        // Station name is displayed in the page content, no need to update page title
        
        // Format charging points for display
        allChargers = chargingPoints.map(point => {
            // Get connector type name
            const connectorTypeNames = {
                'type2': 'Type 2',
                'ccs2': 'CCS',
                'type1': 'Type 1',
                'gbt': 'GB/T',
                'nacs': 'NACS',
                'ac_socket': 'AC Socket',
                'wall': 'Wall'
            };
            const connectorType = point.connectors && point.connectors.length > 0 
                ? connectorTypeNames[point.connectors[0].connectorType?.toLowerCase()] || point.connectors[0].connectorType || 'N/A'
                : 'N/A';
            const power = point.maxPower ? `${point.maxPower} kW` : (point.powerCapacity ? `${point.powerCapacity} kW` : 'N/A');
            
            // Determine charger type (AC or DC)
            const chargerType = point.chargerType?.toLowerCase() || 
                               (point.powerCapacity && parseFloat(point.powerCapacity) < 50 ? 'ac' : 'dc');
            
            // Check if this is the user's active charging point
            const isUserCharging = userActiveSession && 
                point.deviceId === userActiveSession.deviceId;
            
            // Get connector details
            const connectors = point.connectors || [];
            
            return {
                chargingPointId: point.chargingPointId,
                deviceId: point.deviceId,
                deviceName: point.deviceName,
                status: point.status,
                cStatus: point.cStatus,
                connectorType: connectorType,
                chargerType: chargerType,
                power: power,
                powerCapacity: point.powerCapacity || point.maxPower || 0,
                connectorId: connectors.length > 0 ? connectors[0].connectorId : null,
                connectors: connectors,
                isUserCharging: isUserCharging,
                pricePerKwh: point.pricePerKwh || null,
                lastCharged: point.lastCharged || null
            };
        });
        
        // Sort chargers: Online/Available first, then Unavailable/Offline
        filteredChargers = [...allChargers].sort((a, b) => {
            const aIsAvailable = a.status === 'Online' && a.cStatus === 'Available';
            const bIsAvailable = b.status === 'Online' && b.cStatus === 'Available';
            const aIsUnavailable = a.status === 'Offline' || a.cStatus === 'Unavailable';
            const bIsUnavailable = b.status === 'Offline' || b.cStatus === 'Unavailable';
            
            // Available chargers come first
            if (aIsAvailable && !bIsAvailable) return -1;
            if (!aIsAvailable && bIsAvailable) return 1;
            
            // Among unavailable, sort by status
            if (aIsUnavailable && !bIsUnavailable) return 1;
            if (!aIsUnavailable && bIsUnavailable) return -1;
            
            return 0;
        });
        
        const displayStationName = station?.stationName || stationName || 'Station';
        const displayStatus = station?.status || 'Offline';
        
        // Format short address (city, state, pinCode)
        const shortAddress = [station?.city, station?.state, station?.pinCode].filter(Boolean).join(', ') || 
                            station?.fullAddress?.split(',')[0] || 
                            'Address not available';
        
        appMain.innerHTML = `
            <div class="station-detail-container">
                <!-- Back Button - Modern -->
                <button onclick="window.loadStationsModule()" 
                        style="display: flex; align-items: center; gap: 8px; background: white; border: 1px solid #e9ecef; 
                               border-radius: 12px; padding: 10px 16px; margin-bottom: 16px; cursor: pointer; 
                               transition: all 0.2s; color: #667eea; font-size: 14px; font-weight: 600;
                               box-shadow: 0 2px 6px rgba(0,0,0,0.05);"
                        onmouseover="this.style.background='#f8f9fa'; this.style.borderColor='#667eea'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 3px 10px rgba(102, 126, 234, 0.15)'"
                        onmouseout="this.style.background='white'; this.style.borderColor='#e9ecef'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.05)'">
                    <i class="fas fa-arrow-left" style="font-size: 14px;"></i>
                    <span>Back to Stations</span>
                </button>
                
                <!-- Station Image Banner -->
                <div style="width: 100%; height: 180px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin-bottom: 16px; border-radius: 16px; position: relative; overflow: hidden; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.25);">
                    ${station?.image || station?.photo ? `
                        <img src="${station.image || station.photo}" 
                             alt="${displayStationName}" 
                             style="width: 100%; height: 100%; object-fit: cover;"
                             onerror="this.style.display='none'; this.parentElement.style.background='linear-gradient(135deg, #667eea 0%, #764ba2 100%)';">
                    ` : `
                        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); position: relative;">
                            <div style="position: absolute; width: 200px; height: 200px; background: rgba(255, 255, 255, 0.1); border-radius: 50%; top: -50px; right: -50px;"></div>
                            <div style="position: absolute; width: 150px; height: 150px; background: rgba(255, 255, 255, 0.08); border-radius: 50%; bottom: -30px; left: -30px;"></div>
                            <i class="fas fa-charging-station" style="font-size: 56px; color: rgba(255, 255, 255, 0.4); position: relative; z-index: 1;"></i>
                        </div>
                    `}
                </div>
                
                <!-- Station Header Card - Modern -->
                <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; margin-bottom: 16px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05); margin-top: -50px; position: relative; z-index: 10;">
                    <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px;">
                        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-charging-station" style="color: #667eea; font-size: 24px;"></i>
                                        </div>
                        <div style="flex: 1; min-width: 0; overflow: hidden;">
                            <h2 style="font-size: 18px; font-weight: 700; margin: 0 0 6px 0; color: #212529; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${displayStationName}</h2>
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <span style="background: ${displayStatus === 'Online' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'}; color: white; font-size: 10px; padding: 4px 10px; border-radius: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                                    ${displayStatus}
                                        </span>
                                ${station?.rating ? `
                                    <div style="display: flex; align-items: center; gap: 4px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); padding: 4px 10px; border-radius: 12px;">
                                        <span style="font-size: 12px; font-weight: 700; color: #92400e;">${station.rating}</span>
                                        <i class="fas fa-star" style="font-size: 10px; color: #f59e0b;"></i>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #6c757d; padding-top: 12px; border-top: 1px solid #f0f0f0;">
                        <i class="fas fa-map-marker-alt" style="color: #667eea; font-size: 12px;"></i>
                        <span>${shortAddress}</span>
                    </div>
                </div>
                
                <!-- Toggle Tabs - Smooth Toggle -->
                <div class="station-tabs-toggle" 
                     style="background: #f8f9fa; border-radius: 16px; padding: 6px; margin-bottom: 16px; display: flex; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                    <!-- Sliding Indicator -->
                    <div id="tabIndicator" 
                         style="position: absolute; top: 6px; bottom: 6px; left: ${currentTab === 'details' ? '6px' : '50%'}; 
                                width: calc(50% - 6px); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                border-radius: 12px; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); 
                                box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3); z-index: 1;"></div>
                    <button class="station-tab-toggle ${currentTab === 'details' ? 'active' : ''}" 
                            onclick="window.switchStationTab('details')"
                            style="flex: 1; padding: 12px 16px; border: none; background: transparent; 
                                   color: ${currentTab === 'details' ? 'white' : '#6c757d'}; 
                                   font-weight: ${currentTab === 'details' ? '700' : '500'}; 
                                   font-size: 14px; cursor: pointer; transition: color 0.3s ease; 
                                   position: relative; z-index: 2;">
                        Details
                    </button>
                    <button class="station-tab-toggle ${currentTab === 'charger' ? 'active' : ''}" 
                            onclick="window.switchStationTab('charger')"
                            style="flex: 1; padding: 12px 16px; border: none; background: transparent; 
                                   color: ${currentTab === 'charger' ? 'white' : '#6c757d'}; 
                                   font-weight: ${currentTab === 'charger' ? '700' : '500'}; 
                                   font-size: 14px; cursor: pointer; transition: color 0.3s ease; 
                                   position: relative; z-index: 2;">
                        Charger
                    </button>
                </div>
                
                <!-- Tab Content -->
                <div id="stationTabContent">
                    ${currentTab === 'details' ? renderDetailsTab(station) : renderChargerTab()}
                </div>
                                        </div>
        `;
        
        // Attach event listeners for charger tab
        if (currentTab === 'charger') {
            attachChargerTabListeners();
        }
        
    } catch (error) {
        console.error('Error loading station detail:', error);
        showError('Failed to load station details');
    }
}

// Render Details Tab
function renderDetailsTab(station) {
    if (!station) {
        return '<div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 40px 20px; text-align: center; color: #6c757d;">Station details not available</div>';
    }
    
    // Get amenities
    const amenities = station.amenities || [];
    
    // Get connector types
    const connectorTypes = station.connectorTypes || [];
    
    return `
        <div class="details-tab-content">
            <!-- Location Section - Icon Based -->
            <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 22px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 18px;">
                    <div style="width: 52px; height: 52px; background: linear-gradient(135deg, #ef444415 0%, #ef444425 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-map-marker-alt" style="color: #ef4444; font-size: 24px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 11px; color: #6c757d; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Location</div>
                        <div style="font-size: 16px; font-weight: 700; color: #212529; word-wrap: break-word; line-height: 1.5;">
                            ${station.fullAddress || 'Address not available'}
                        </div>
                        ${station.city || station.state ? `
                            <div style="font-size: 14px; color: #6c757d; margin-top: 6px;">
                                ${[station.city, station.state, station.pinCode].filter(Boolean).join(', ')}
                            </div>
                        ` : ''}
                                    </div>
                                </div>
                
                <!-- Embedded Map -->
                ${station.latitude && station.longitude ? `
                    <div style="margin-top: 18px; border-top: 1px solid #f0f0f0; padding-top: 18px;">
                        <div id="stationMapEmbed" 
                             style="width: 100%; height: 220px; border-radius: 12px; overflow: hidden; border: 1px solid #e9ecef; cursor: pointer; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"
                             onclick="window.navigateToStationLocation(${station.latitude}, ${station.longitude}, '${(station.stationName || '').replace(/'/g, "\\'")}')">
                            <iframe 
                                src="https://www.google.com/maps/embed/v1/place?key=AIzaSyA00C5oMIAZe3CQzg107eG1SgdPCdPyq5o&q=${station.latitude},${station.longitude}&zoom=15&maptype=roadmap"
                                width="100%" 
                                height="220" 
                                style="border:0; pointer-events: none;" 
                                allowfullscreen="" 
                                loading="lazy" 
                                referrerpolicy="no-referrer-when-downgrade">
                            </iframe>
                        </div>
                        <p style="font-size: 12px; color: #6c757d; margin: 10px 0 0 0; text-align: center;">
                            Tap on map to navigate
                        </p>
                    </div>
                ` : `
                    <div style="background: #f8f9fa; padding: 40px 20px; border-radius: 12px; text-align: center; margin-top: 18px; border-top: 1px solid #f0f0f0; padding-top: 18px;">
                        <i class="fas fa-map-marker-alt" style="font-size: 36px; color: #6c757d; opacity: 0.4; margin-bottom: 10px;"></i>
                        <p style="font-size: 14px; color: #6c757d; margin: 0;">Location map not available</p>
                    </div>
                `}
            </div>
            
            <!-- Operating Hours - Icon Based -->
            <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 22px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 52px; height: 52px; background: linear-gradient(135deg, #f59e0b15 0%, #f59e0b25 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i class="fas fa-clock" style="color: #f59e0b; font-size: 24px;"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 11px; color: #6c757d; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Operating Hours</div>
                        <div style="font-size: 16px; font-weight: 700; color: #212529;">
                            ${station.open24Hours ? '24 Hours' : (station.openingTime && station.closingTime ? `${station.openingTime} - ${station.closingTime}` : 'N/A')}
                                </div>
                        ${station.workingDays && station.workingDays.length > 0 && !station.allDays ? `
                            <div style="font-size: 14px; color: #6c757d; margin-top: 6px;">
                                ${station.workingDays.join(', ')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
            
            <!-- Supported Connectors - Icon Based -->
            ${connectorTypes.length > 0 ? `
                <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 22px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 18px;">
                        <div style="width: 52px; height: 52px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-plug" style="color: #667eea; font-size: 24px;"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 11px; color: #6c757d; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Supported Connectors</div>
                        </div>
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; padding-top: 18px; border-top: 1px solid #f0f0f0;">
                        ${connectorTypes.map(type => {
                            const connectorIcons = {
                                'type2': { icon: 'fa-plug', color: '#667eea', name: 'Type 2' },
                                'ccs2': { icon: 'fa-bolt', color: '#ef4444', name: 'CCS2' },
                                'type1': { icon: 'fa-plug', color: '#10b981', name: 'Type 1' },
                                'gbt': { icon: 'fa-charging-station', color: '#f59e0b', name: 'GB/T' },
                                'nacs': { icon: 'fa-bolt', color: '#06b6d4', name: 'NACS' },
                                'ac_socket': { icon: 'fa-plug', color: '#6c757d', name: 'AC Socket' }
                            };
                            const connector = connectorIcons[type.toLowerCase()] || { icon: 'fa-plug', color: '#6c757d', name: type };
                            return `
                                <div style="display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); padding: 10px 14px; border-radius: 10px; border: 1px solid #e9ecef;">
                                    <i class="fas ${connector.icon}" style="color: ${connector.color}; font-size: 14px;"></i>
                                    <span style="font-size: 13px; font-weight: 600; color: #212529;">${connector.name}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}
                
            <!-- Amenities - Icon Based -->
            ${amenities.length > 0 ? `
                <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 22px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 18px;">
                        <div style="width: 52px; height: 52px; background: linear-gradient(135deg, #f59e0b15 0%, #f59e0b25 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-star" style="color: #f59e0b; font-size: 24px;"></i>
                                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 11px; color: #6c757d; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Amenities</div>
                                    </div>
                                </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px; padding-top: 18px; border-top: 1px solid #f0f0f0;">
                        ${amenities.map(amenity => {
                            const amenityIcons = {
                                'restroom': { icon: 'fa-restroom', name: 'Restroom' },
                                'cafe': { icon: 'fa-coffee', name: 'Cafe' },
                                'restaurant': { icon: 'fa-utensils', name: 'Restaurant' },
                                'parking': { icon: 'fa-parking', name: 'Parking' },
                                'wifi': { icon: 'fa-wifi', name: 'WiFi' },
                                'shop': { icon: 'fa-shopping-bag', name: 'Shop' }
                            };
                            const amenityData = amenityIcons[amenity.toLowerCase()] || { icon: 'fa-check-circle', name: amenity };
                            return `
                                <div style="display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #f0f8ff 0%, #ffffff 100%); padding: 10px 14px; border-radius: 10px; border: 1px solid #e9ecef;">
                                    <i class="fas ${amenityData.icon}" style="color: #667eea; font-size: 14px;"></i>
                                    <span style="font-size: 13px; font-weight: 600; color: #212529;">${amenityData.name}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}
        </div>
    `;
}

// Render Charger Tab
function renderChargerTab() {
    return `
        <div class="charger-tab-content">
            <!-- Search and Filters -->
            <div style="margin-bottom: 16px;">
                <!-- Search Bar -->
                <div style="position: relative; margin-bottom: 12px;">
                    <input type="text" 
                           id="chargerSearchInput" 
                           placeholder="Search Charger Name" 
                           style="width: 100%; padding: 12px 40px 12px 40px; border: 1px solid #e9ecef; border-radius: 12px; font-size: 14px; background: white; outline: none; transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.04);"
                           onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'"
                           onblur="this.style.borderColor='#e9ecef'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.04)'"
                           oninput="window.filterChargers()">
                    <i class="fas fa-search" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #6c757d; font-size: 14px;"></i>
                    <button id="clearChargerSearch" 
                            onclick="window.clearChargerSearch()"
                            style="display: none; position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: #f8f9fa; border: none; color: #6c757d; cursor: pointer; padding: 6px 10px; font-size: 12px; border-radius: 8px; transition: all 0.2s;"
                            onmouseover="this.style.background='#e9ecef'"
                            onmouseout="this.style.background='#f8f9fa'">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- Filter Buttons -->
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button class="filter-btn ${currentFilters.status === 'all' ? 'active' : ''}" 
                            onclick="window.setChargerFilter('status', 'all')"
                            style="padding: 10px 18px; border: 1px solid ${currentFilters.status === 'all' ? '#667eea' : '#e9ecef'}; 
                                   background: ${currentFilters.status === 'all' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white'}; 
                                   color: ${currentFilters.status === 'all' ? 'white' : '#6c757d'}; 
                                   border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: ${currentFilters.status === 'all' ? '0 2px 8px rgba(102, 126, 234, 0.25)' : 'none'};"
                            onmouseover="${currentFilters.status !== 'all' ? `this.style.borderColor='#667eea'; this.style.background='#f8f9fa'` : ''}"
                            onmouseout="${currentFilters.status !== 'all' ? `this.style.borderColor='#e9ecef'; this.style.background='white'` : ''}">
                        All
                    </button>
                    <button class="filter-btn ${currentFilters.status === 'available' ? 'active' : ''}" 
                            onclick="window.setChargerFilter('status', 'available')"
                            style="padding: 10px 18px; border: 1px solid ${currentFilters.status === 'available' ? '#10b981' : '#e9ecef'}; 
                                   background: ${currentFilters.status === 'available' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'white'}; 
                                   color: ${currentFilters.status === 'available' ? 'white' : '#6c757d'}; 
                                   border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: ${currentFilters.status === 'available' ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none'};"
                            onmouseover="${currentFilters.status !== 'available' ? `this.style.borderColor='#10b981'; this.style.background='#f8f9fa'` : ''}"
                            onmouseout="${currentFilters.status !== 'available' ? `this.style.borderColor='#e9ecef'; this.style.background='white'` : ''}">
                        Available
                    </button>
                    <button class="filter-btn ${currentFilters.chargerType === 'ac' ? 'active' : ''}" 
                            onclick="window.setChargerFilter('chargerType', 'ac')"
                            style="padding: 10px 18px; border: 1px solid ${currentFilters.chargerType === 'ac' ? '#f59e0b' : '#e9ecef'}; 
                                   background: ${currentFilters.chargerType === 'ac' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'white'}; 
                                   color: ${currentFilters.chargerType === 'ac' ? 'white' : '#6c757d'}; 
                                   border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: ${currentFilters.chargerType === 'ac' ? '0 2px 8px rgba(245, 158, 11, 0.25)' : 'none'};"
                            onmouseover="${currentFilters.chargerType !== 'ac' ? `this.style.borderColor='#f59e0b'; this.style.background='#f8f9fa'` : ''}"
                            onmouseout="${currentFilters.chargerType !== 'ac' ? `this.style.borderColor='#e9ecef'; this.style.background='white'` : ''}">
                        AC
                    </button>
                    <button class="filter-btn ${currentFilters.chargerType === 'dc' ? 'active' : ''}" 
                            onclick="window.setChargerFilter('chargerType', 'dc')"
                            style="padding: 10px 18px; border: 1px solid ${currentFilters.chargerType === 'dc' ? '#ef4444' : '#e9ecef'}; 
                                   background: ${currentFilters.chargerType === 'dc' ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'white'}; 
                                   color: ${currentFilters.chargerType === 'dc' ? 'white' : '#6c757d'}; 
                                   border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: ${currentFilters.chargerType === 'dc' ? '0 2px 8px rgba(239, 68, 68, 0.25)' : 'none'};"
                            onmouseover="${currentFilters.chargerType !== 'dc' ? `this.style.borderColor='#ef4444'; this.style.background='#f8f9fa'` : ''}"
                            onmouseout="${currentFilters.chargerType !== 'dc' ? `this.style.borderColor='#e9ecef'; this.style.background='white'` : ''}">
                        DC
                    </button>
                                        </div>
                                    </div>
            
            <!-- Charger List -->
            <div id="chargerListContainer">
                ${renderChargerList(filteredChargers)}
                                    </div>
                                </div>
    `;
}

// Render Charger List
function renderChargerList(chargers) {
    if (chargers.length === 0) {
        return `
            <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 60px 20px; text-align: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                    <i class="fas fa-charging-station" style="font-size: 36px; color: #667eea;"></i>
                </div>
                <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #212529;">No Chargers Found</h3>
                <p style="margin: 0; font-size: 14px; color: #6c757d;">Try adjusting your filters</p>
            </div>
        `;
    }
    
    return chargers.map(charger => {
        const isOnline = charger.status === 'Online';
        const isOffline = charger.status === 'Offline' || charger.cStatus === 'Unavailable';
        
        // Get connector info
        const connectors = charger.connectors || [];
        const connectorInfo = connectors.length > 0 ? connectors[0] : null;
        
        // Format last charged
        let lastChargedText = '';
        if (charger.lastCharged) {
            const lastChargedDate = new Date(charger.lastCharged);
            const now = new Date();
            const diffMonths = Math.floor((now - lastChargedDate) / (1000 * 60 * 60 * 24 * 30));
            if (diffMonths > 0) {
                lastChargedText = `Last charged ${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
            } else {
                const diffDays = Math.floor((now - lastChargedDate) / (1000 * 60 * 60 * 24));
                lastChargedText = diffDays > 0 ? `Last charged ${diffDays} day${diffDays > 1 ? 's' : ''} ago` : 'Recently charged';
            }
        }
        
        const chargerCardId = `charger-card-${charger.chargingPointId}`;
        const connectorSelectId = `connector-select-${charger.chargingPointId}`;
        const amountInputId = `amount-input-${charger.chargingPointId}`;
        const startBtnId = `start-btn-${charger.chargingPointId}`;
        
        // Determine charger-level status badge (show if at least one connector is available, or if charging)
        const hasAvailableConnector = connectors.some(conn => {
            const connStatus = conn.cStatus || conn.status;
            return isOnline && connStatus === 'Available';
        });
        const hasChargingConnector = connectors.some(conn => {
            const connStatus = conn.cStatus || conn.status;
            return connStatus === 'Charging';
        });
        const chargerLevelStatus = hasChargingConnector ? 'Charging' : (hasAvailableConnector ? 'Available' : (charger.cStatus || charger.status));
        const statusBadgeColor = hasAvailableConnector ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 
                                 hasChargingConnector ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 
                                 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        
        return `
            <div class="charger-card" id="${chargerCardId}"
                 style="padding: 14px; border: 1px solid ${isOnline ? '#e9ecef' : '#f0f0f0'}; 
                        border-radius: 12px; margin-bottom: 10px; 
                        background: ${isOnline ? 'white' : '#fafafa'}; 
                        opacity: ${isOffline ? '0.7' : '1'}; 
                        transition: all 0.2s; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ${connectors.length > 0 ? '12px' : '0'}; padding-bottom: ${connectors.length > 0 ? '12px' : '0'}; border-bottom: ${connectors.length > 0 ? '1px solid #f0f0f0' : 'none'};">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px; color: #212529; word-wrap: break-word;">
                            ${charger.deviceName}
                        </div>
                        <div style="font-size: 12px; color: #6c757d; display: flex; align-items: center; gap: 6px;">
                            <span>${charger.chargerType ? charger.chargerType.toUpperCase() : 'N/A'}</span>
                            <span>•</span>
                            <span>${charger.power}</span>
                        </div>
                                </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; margin-left: 12px;">
                        <span style="background: ${statusBadgeColor}; color: white; font-size: 10px; padding: 4px 10px; border-radius: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            ${chargerLevelStatus}
                        </span>
                        ${charger.pricePerKwh ? `
                            <div style="font-size: 13px; font-weight: 700; color: #667eea;">
                                ₹${charger.pricePerKwh}/kWh
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Always show connector cards if connectors exist, so users can see individual connector statuses -->
                ${connectors.length > 0 ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${connectors.sort((a, b) => (a.connectorId || 0) - (b.connectorId || 0)).map((conn, index) => {
                            const connectorCardId = `connector-card-${charger.chargingPointId}-${conn.connectorId}`;
                            // Use per-connector status if available, otherwise fallback to charger-level status
                            // Priority: conn.cStatus > conn.status > charger-level status
                            const connectorStatus = conn.cStatus || conn.status || (isOnline ? 'Available' : 'Unavailable');
                            // Connector is available if charger is online AND connector status is 'Available' (not 'Charging' or 'Unavailable')
                            const isConnectorAvailable = isOnline && connectorStatus === 'Available';
                            
                            // Determine connector status badge color
                            const connectorBadgeColor = connectorStatus === 'Available' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
                                                       connectorStatus === 'Charging' ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' :
                                                       'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                            
                            return `
                                <div id="${connectorCardId}"
                                     class="connector-card-item"
                                     data-connector-id="${conn.connectorId}"
                                     data-charger-id="${charger.chargingPointId}"
                                     onclick="${isConnectorAvailable ? `window.openChargingPopup('${charger.chargingPointId}', '${conn.connectorId}', '${charger.deviceId}', '${conn.connectorType || charger.connectorType}', '${conn.power || charger.power}', ${charger.pricePerKwh || 0}, '${connectorStatus}')` : 'void(0)'}"
                                     style="padding: 12px; border: 1px solid ${isConnectorAvailable ? '#e9ecef' : '#f0f0f0'}; 
                                            border-radius: 10px; background: ${isConnectorAvailable ? 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)' : '#fafafa'}; 
                                            cursor: ${isConnectorAvailable ? 'pointer' : 'not-allowed'}; 
                                            transition: all 0.2s; opacity: ${isConnectorAvailable ? '1' : '0.6'};"
                                     onmouseover="${isConnectorAvailable ? `this.style.borderColor='#667eea'; this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.15)'; this.style.transform='translateY(-1px)'` : ''}"
                                     onmouseout="${isConnectorAvailable ? `this.style.borderColor='#e9ecef'; this.style.boxShadow='none'; this.style.transform='translateY(0)'` : ''}">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="width: 36px; height: 36px; border-radius: 8px; background: ${isConnectorAvailable ? 'linear-gradient(135deg, #667eea15 0%, #667eea25 100%)' : '#f5f5f5'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                            <i class="fas fa-plug" style="font-size: 16px; color: ${isConnectorAvailable ? '#667eea' : '#9e9e9e'};"></i>
                                        </div>
                                        <div style="flex: 1; min-width: 0;">
                                            <div style="font-size: 13px; font-weight: 700; color: #212529; margin-bottom: 3px;">
                                                Connector ${conn.connectorId}
                                            </div>
                                            <div style="font-size: 11px; color: #6c757d; margin-bottom: 6px;">
                                                ${conn.connectorType || charger.connectorType}
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                                <span style="background: ${connectorBadgeColor}; color: white; font-size: 9px; padding: 3px 8px; border-radius: 10px; font-weight: 600; text-transform: uppercase;">
                                                    ${connectorStatus}
                                                </span>
                                                <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: #6c757d;">
                                                    <i class="fas fa-bolt" style="font-size: 10px; color: #f59e0b;"></i>
                                                    <span>Upto ${conn.power || charger.power}</span>
                                                </div>
                                            </div>
                                        </div>
                                        ${isConnectorAvailable ? `
                                            <i class="fas fa-chevron-right" style="color: #6c757d; font-size: 14px; flex-shrink: 0;"></i>
                ` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : (isOffline ? `
                    <div style="font-size: 12px; color: #6c757d; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-times-circle" style="font-size: 11px; color: #ef4444;"></i>
                        <span>Charger unavailable</span>
                    </div>
                ` : '')}
            </div>
        `;
    }).join('');
}

// Switch Tab
window.switchStationTab = function(tab) {
    currentTab = tab;
    const appMain = document.getElementById('appMain');
    if (!appMain) return;
    
    // Update sliding indicator
    const indicator = appMain.querySelector('#tabIndicator');
    if (indicator) {
        indicator.style.left = tab === 'details' ? '6px' : '50%';
    }
    
    // Update toggle tabs
    const tabs = appMain.querySelectorAll('.station-tab-toggle');
    tabs.forEach(t => {
        const tabText = t.textContent.trim().toLowerCase();
        if (tabText === tab) {
            t.classList.add('active');
            t.style.color = 'white';
            t.style.fontWeight = '700';
        } else {
            t.classList.remove('active');
            t.style.color = '#6c757d';
            t.style.fontWeight = '500';
        }
    });
    
    // Update content
    const content = appMain.querySelector('#stationTabContent');
    if (content) {
        if (tab === 'details') {
            // Re-fetch station details if needed
            const stationId = sessionStorage.getItem('lastStationId');
            if (stationId) {
                getStationDetails(stationId).then(response => {
                    if (response.success) {
                        content.innerHTML = renderDetailsTab(response.station);
                    }
                });
            }
        } else {
            content.innerHTML = renderChargerTab();
            attachChargerTabListeners();
        }
    }
};

// Filter Chargers
window.filterChargers = function() {
    const searchInput = document.getElementById('chargerSearchInput');
    const clearBtn = document.getElementById('clearChargerSearch');
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    if (clearBtn) {
        clearBtn.style.display = searchTerm ? 'block' : 'none';
    }
    
    filteredChargers = allChargers.filter(charger => {
        // Search filter
        const matchesSearch = !searchTerm || charger.deviceName.toLowerCase().includes(searchTerm);
        
        // Status filter
        const isAvailable = charger.status === 'Online' && charger.cStatus === 'Available';
        const isBusy = charger.cStatus === 'Charging' || (charger.status === 'Online' && charger.cStatus !== 'Available' && charger.cStatus !== 'Unavailable');
        const isOffline = charger.status === 'Offline' || charger.cStatus === 'Unavailable';
        
        let matchesStatus = true;
        if (currentFilters.status === 'available') {
            matchesStatus = isAvailable;
        } else if (currentFilters.status === 'busy') {
            matchesStatus = isBusy;
        } else if (currentFilters.status === 'offline') {
            matchesStatus = isOffline;
        }
        
        // Charger type filter
        let matchesType = true;
        if (currentFilters.chargerType === 'ac') {
            matchesType = charger.chargerType === 'ac';
        } else if (currentFilters.chargerType === 'dc') {
            matchesType = charger.chargerType === 'dc';
        }
        
        return matchesSearch && matchesStatus && matchesType;
    });
    
    // Sort filtered chargers: Online/Available first, then Unavailable/Offline
    filteredChargers.sort((a, b) => {
        const aIsAvailable = a.status === 'Online' && a.cStatus === 'Available';
        const bIsAvailable = b.status === 'Online' && b.cStatus === 'Available';
        const aIsUnavailable = a.status === 'Offline' || a.cStatus === 'Unavailable';
        const bIsUnavailable = b.status === 'Offline' || b.cStatus === 'Unavailable';
        
        // Available chargers come first
        if (aIsAvailable && !bIsAvailable) return -1;
        if (!aIsAvailable && bIsAvailable) return 1;
        
        // Among unavailable, sort by status
        if (aIsUnavailable && !bIsUnavailable) return 1;
        if (!aIsUnavailable && bIsUnavailable) return -1;
        
        return 0;
    });
    
    // Update charger list
    const container = document.getElementById('chargerListContainer');
    if (container) {
        container.innerHTML = renderChargerList(filteredChargers);
    }
};

// Set Charger Filter
window.setChargerFilter = function(filterType, value) {
    if (filterType === 'status') {
        currentFilters.status = currentFilters.status === value ? 'all' : value;
    } else if (filterType === 'chargerType') {
        currentFilters.chargerType = currentFilters.chargerType === value ? 'all' : value;
    }
    
    // Re-render filter buttons
    const appMain = document.getElementById('appMain');
    if (appMain && currentTab === 'charger') {
        const content = appMain.querySelector('#stationTabContent');
        if (content) {
            content.innerHTML = renderChargerTab();
            attachChargerTabListeners();
        }
    }
    
    // Apply filters
    window.filterChargers();
};

// Clear Charger Search
window.clearChargerSearch = function() {
    const searchInput = document.getElementById('chargerSearchInput');
    if (searchInput) {
        searchInput.value = '';
        window.filterChargers();
    }
};

// Attach Charger Tab Listeners
function attachChargerTabListeners() {
    const searchInput = document.getElementById('chargerSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', window.filterChargers);
    }
}

// Navigate to station location
window.navigateToStationLocation = function(lat, lng, stationName) {
    if (!lat || !lng) {
        alert('Location information not available for this station');
        return;
    }
    
    // Open Google Maps with the station location
    const stationNameEncoded = encodeURIComponent(stationName || 'Charging Station');
    
    // Try to open in Google Maps app first, fallback to web
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${stationNameEncoded}`;
    const appleMapsUrl = `https://maps.apple.com/?daddr=${lat},${lng}`;
    
    // Detect platform and open appropriate maps app
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    
    if (isIOS) {
        // Try Apple Maps first on iOS
        window.open(appleMapsUrl, '_blank');
    } else {
        // Use Google Maps for Android and desktop
        window.open(googleMapsUrl, '_blank');
    }
};

// Open charging popup when connector is clicked
window.openChargingPopup = async function(chargingPointId, connectorId, deviceId, connectorType, power, pricePerKwh, connectorStatus) {
    // Check if user has vehicles BEFORE opening popup
    const vehiclesResponse = await getVehicles();
    const vehicles = vehiclesResponse.success && vehiclesResponse.vehicles ? vehiclesResponse.vehicles : [];
    
    // If no vehicles, show error and redirect to vehicles page
    if (vehicles.length === 0) {
        showError('Please add a vehicle before starting charging');
        // Navigate to vehicles page after a short delay
        setTimeout(() => {
            window.loadVehiclesModule();
        }, 1500);
        return;
    }
    
    // Fetch current wallet balance
    let walletBalance = 0;
    try {
        const walletResponse = await getWalletBalance();
        walletBalance = walletResponse.success ? parseFloat(walletResponse.balance || 0) : 0;
    } catch (error) {
        console.error('Error fetching wallet balance:', error);
        walletBalance = 0;
    }
    
    // Create popup modal
    const modalId = `charging-popup-${chargingPointId}-${connectorId}`;
    const amountInputId = `popup-amount-input-${chargingPointId}-${connectorId}`;
    const vehicleSelectId = `popup-vehicle-select-${chargingPointId}-${connectorId}`;
    const startBtnId = `popup-start-btn-${chargingPointId}-${connectorId}`;
    
    // Check if modal already exists
    let modal = document.getElementById(modalId);
    if (modal) {
        // Update wallet balance in existing modal
        const modalContent = modal.querySelector('.charging-popup-content');
        if (modalContent) {
            modalContent.dataset.walletBalance = walletBalance;
        }
        
        // CRITICAL: Reset all form fields and button state when reopening modal
        const vehicleSelect = document.getElementById(`popup-vehicle-select-${chargingPointId}-${connectorId}`);
        const amountInput = document.getElementById(`popup-amount-input-${chargingPointId}-${connectorId}`);
        const startBtn = document.getElementById(`popup-start-btn-${chargingPointId}-${connectorId}`);
        const estimatedCost = document.getElementById(`estimated-cost-${modalId}`);
        
        // Reset vehicle selection
        if (vehicleSelect) {
            vehicleSelect.value = '';
            vehicleSelect.style.borderColor = '#e0e0e0';
        }
        
        // Reset amount input
        if (amountInput) {
            amountInput.value = '';
            amountInput.max = walletBalance;
            amountInput.style.borderColor = '#e0e0e0';
        }
        
        // Reset start button to initial state
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Charging';
            startBtn.style.background = '';
            startBtn.style.cursor = 'pointer';
            startBtn.style.opacity = '1';
        }
        
        // Hide estimated cost
        if (estimatedCost) {
            estimatedCost.style.display = 'none';
        }
        
        modal.style.display = 'flex';
        return;
    }
    
    // Create modal HTML
    const modalHTML = `
        <div id="${modalId}" class="charging-popup-modal" data-charging-point-id="${chargingPointId}" data-connector-id="${connectorId}" 
             style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); 
                    z-index: 10000; display: flex; align-items: center; justify-content: center; 
                    padding: 20px;"
             onclick="if(event.target.id === '${modalId}') window.closeChargingPopup('${modalId}')">
            <div class="charging-popup-content" data-charging-point-id="${chargingPointId}" data-connector-id="${connectorId}" 
                 data-wallet-balance="${walletBalance}"
                 style="background: white; border-radius: 16px; padding: 24px; width: 100%; max-width: 400px; 
                        max-height: 90vh; overflow-y: auto; position: relative;"
                 onclick="event.stopPropagation()">
                <!-- Close Button -->
                <button onclick="window.closeChargingPopup('${modalId}')" 
                        style="position: absolute; top: 16px; right: 16px; background: none; border: none; 
                               font-size: 24px; color: var(--text-secondary); cursor: pointer; 
                               width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; 
                               border-radius: 50%; transition: all 0.2s;"
                        onmouseover="this.style.background='#f0f0f0'"
                        onmouseout="this.style.background='none'">
                    <i class="fas fa-times"></i>
                </button>
                
                <!-- Connector Info -->
                <div style="margin-bottom: 20px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">
                        ${connectorType} | ${power}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 14px; font-weight: 600; color: var(--text-primary);">
                            Connector ${connectorId}
                        </span>
                        <span class="badge ${connectorStatus === 'Available' ? 'badge-success' : 'badge-danger'}" 
                              style="font-size: 10px; padding: 3px 8px;">
                            ${connectorStatus.toUpperCase()}
                        </span>
                        ${pricePerKwh ? `
                            <span style="font-size: 12px; color: var(--text-secondary); margin-left: auto;">
                                ₹${pricePerKwh}/kWh
                            </span>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Vehicle Selection -->
                <div style="margin-bottom: 16px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                        Select Vehicle
                    </label>
                    <select id="${vehicleSelectId}" 
                            style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; color: var(--text-primary); outline: none; transition: border-color 0.2s;"
                            onchange="this.style.borderColor='var(--primary-color)'; window.onVehicleSelectedInPopup('${modalId}', '${chargingPointId}', '${connectorId}')"
                            onfocus="this.style.borderColor='var(--primary-color)'"
                            onblur="this.style.borderColor='#e0e0e0'">
                        <option value="">Select Vehicle</option>
                        ${vehicles.length === 0 ? `
                            <option value="" disabled>No vehicles found. Add a vehicle first.</option>
                        ` : vehicles.map(vehicle => `
                            <option value="${vehicle.id}">
                                ${vehicle.vehicleNumber || 'Vehicle'} ${vehicle.vehicleType ? `(${vehicle.vehicleType})` : ''}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <!-- Amount Input -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                        Enter Amount (₹)
                    </label>
                    <input type="number" 
                           id="${amountInputId}" 
                           placeholder="Enter amount"
                           min="1"
                           step="0.01"
                           max="${walletBalance}"
                           style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; background: white; color: var(--text-primary); outline: none; transition: border-color 0.2s;"
                           onfocus="this.style.borderColor='var(--primary-color)'"
                           onblur="this.style.borderColor='#e0e0e0'"
                           oninput="window.restrictAmountInput(this, ${walletBalance}, '${modalId}', ${pricePerKwh || 0}, '${chargingPointId}', '${connectorId}')">
                    <div id="amount-error-${modalId}" style="display: none; margin-top: 6px; font-size: 12px; color: #dc3545;"></div>
                    ${pricePerKwh ? `
                        <div id="estimated-cost-${modalId}" style="display: none; margin-top: 6px; font-size: 12px; color: var(--text-secondary);">
                            <span id="estimated-energy-${modalId}"></span> • 
                            <span id="estimated-cost-value-${modalId}"></span>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Start Charging Button -->
                <button id="${startBtnId}"
                        onclick="window.startChargingFromPopup('${modalId}', '${chargingPointId}', '${connectorId}', '${deviceId}', ${pricePerKwh || 0})"
                        disabled
                        style="width: 100%; padding: 14px; background: #cccccc; color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: not-allowed; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; opacity: 0.6;">
                    <i class="fas fa-bolt"></i>
                    <span>Start Charging</span>
                </button>
            </div>
        </div>
    `;
    
    // Append modal to body
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add input restriction after modal is added to DOM
    setTimeout(() => {
        const amountInput = document.getElementById(amountInputId);
        if (amountInput) {
            // Restrict input to wallet balance
            amountInput.addEventListener('input', function(e) {
                const value = parseFloat(e.target.value) || 0;
                if (value > walletBalance) {
                    e.target.value = walletBalance.toFixed(2);
                    // Trigger calculation functions
                    window.calculateEstimatedCostInPopup(modalId, pricePerKwh || 0);
                    window.onAmountEnteredInPopup(modalId, chargingPointId, connectorId);
                }
            });
            
            // Prevent pasting values greater than balance
            amountInput.addEventListener('paste', function(e) {
                setTimeout(() => {
                    const value = parseFloat(e.target.value) || 0;
                    if (value > walletBalance) {
                        e.target.value = walletBalance.toFixed(2);
                        window.calculateEstimatedCostInPopup(modalId, pricePerKwh || 0);
                        window.onAmountEnteredInPopup(modalId, chargingPointId, connectorId);
                    }
                }, 0);
            });
        }
    }, 100);
};

// Close charging popup
window.closeChargingPopup = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        // Get chargingPointId and connectorId from data attributes on modal content (more reliable than parsing modalId)
        const modalContent = modal.querySelector('.charging-popup-content');
        const chargingPointId = modalContent?.dataset.chargingPointId;
        const connectorId = modalContent?.dataset.connectorId;
        
        if (chargingPointId && connectorId) {
            // Reset form fields when closing modal
            const vehicleSelect = document.getElementById(`popup-vehicle-select-${chargingPointId}-${connectorId}`);
            const amountInput = document.getElementById(`popup-amount-input-${chargingPointId}-${connectorId}`);
            const startBtn = document.getElementById(`popup-start-btn-${chargingPointId}-${connectorId}`);
            const estimatedCost = document.getElementById(`estimated-cost-${modalId}`);
            
            if (vehicleSelect) {
                vehicleSelect.value = '';
                vehicleSelect.style.borderColor = '#e0e0e0';
            }
            if (amountInput) {
                amountInput.value = '';
                amountInput.style.borderColor = '#e0e0e0';
            }
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerHTML = '<i class="fas fa-play me-2"></i>Start Charging';
                startBtn.style.background = '';
                startBtn.style.cursor = 'pointer';
                startBtn.style.opacity = '1';
            }
            if (estimatedCost) {
                estimatedCost.style.display = 'none';
            }
        }
        
        modal.style.display = 'none';
    }
};

// Handle vehicle selection in popup
window.onVehicleSelectedInPopup = function(modalId, chargingPointId, connectorId) {
    const vehicleSelect = document.getElementById(`popup-vehicle-select-${chargingPointId}-${connectorId}`);
    if (!vehicleSelect || !vehicleSelect.value || vehicleSelect.value === '') {
        // Reset amount and button
        const amountInput = document.getElementById(`popup-amount-input-${chargingPointId}-${connectorId}`);
        const startBtn = document.getElementById(`popup-start-btn-${chargingPointId}-${connectorId}`);
        
        if (amountInput) amountInput.value = '';
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.style.background = '#cccccc';
            startBtn.style.cursor = 'not-allowed';
            startBtn.style.opacity = '0.6';
        }
        
        // Hide estimated cost
        const estimatedCost = document.getElementById(`estimated-cost-${modalId}`);
        if (estimatedCost) estimatedCost.style.display = 'none';
        return;
    }
};

// Handle amount input in popup
window.onAmountEnteredInPopup = function(modalId, chargingPointId, connectorId) {
    const amountInput = document.getElementById(`popup-amount-input-${chargingPointId}-${connectorId}`);
    const startBtn = document.getElementById(`popup-start-btn-${chargingPointId}-${connectorId}`);
    const vehicleSelect = document.getElementById(`popup-vehicle-select-${chargingPointId}-${connectorId}`);
    
    if (!amountInput || !startBtn || !vehicleSelect) return;
    
    // Get wallet balance from modal
    const modalContent = document.getElementById(modalId)?.querySelector('.charging-popup-content');
    const walletBalance = modalContent ? parseFloat(modalContent.dataset.walletBalance || 0) : 0;
    
    const amount = parseFloat(amountInput.value);
    const vehicleId = vehicleSelect.value;
    
    // Validate amount against wallet balance
    if (amount && amount >= 1 && amount <= walletBalance && vehicleId) {
        // Enable start button
        startBtn.disabled = false;
        startBtn.style.background = 'var(--primary-color)';
        startBtn.style.cursor = 'pointer';
        startBtn.style.opacity = '1';
    } else {
        // Disable start button
        startBtn.disabled = true;
        startBtn.style.background = '#cccccc';
        startBtn.style.cursor = 'not-allowed';
        startBtn.style.opacity = '0.6';
    }
};

// Restrict amount input to wallet balance
window.restrictAmountInput = function(inputElement, walletBalance, modalId, pricePerKwh, chargingPointId, connectorId) {
    const value = parseFloat(inputElement.value) || 0;
    if (value > walletBalance) {
        inputElement.value = walletBalance.toFixed(2);
    }
    // Call calculation functions
    window.calculateEstimatedCostInPopup(modalId, pricePerKwh);
    window.onAmountEnteredInPopup(modalId, chargingPointId, connectorId);
};

// Calculate estimated cost in popup
window.calculateEstimatedCostInPopup = function(modalId, pricePerKwh) {
    // Extract chargingPointId and connectorId from modalId
    // modalId format: charging-popup-${chargingPointId}-${connectorId}
    const idString = modalId.replace('charging-popup-', '');
    // Find the last hyphen to separate chargingPointId and connectorId
    const lastHyphenIndex = idString.lastIndexOf('-');
    if (lastHyphenIndex === -1) {
        console.error('Invalid modalId format:', modalId);
        return;
    }
    const chargingPointId = idString.substring(0, lastHyphenIndex);
    const connectorId = idString.substring(lastHyphenIndex + 1);
    
    const amountInput = document.getElementById(`popup-amount-input-${chargingPointId}-${connectorId}`);
    if (!amountInput) {
        console.error('Amount input not found:', `popup-amount-input-${chargingPointId}-${connectorId}`);
        return;
    }
    
    // Get wallet balance from modal
    const modalContent = document.getElementById(modalId)?.querySelector('.charging-popup-content');
    const walletBalance = modalContent ? parseFloat(modalContent.dataset.walletBalance || 0) : 0;
    
    const estimatedCostDiv = document.getElementById(`estimated-cost-${modalId}`);
    const estimatedEnergy = document.getElementById(`estimated-energy-${modalId}`);
    const estimatedCostValue = document.getElementById(`estimated-cost-value-${modalId}`);
    const amountErrorDiv = document.getElementById(`amount-error-${modalId}`);
    const startBtn = document.getElementById(`popup-start-btn-${chargingPointId}-${connectorId}`);
    
    if (!estimatedCostDiv || !estimatedEnergy || !estimatedCostValue) {
        console.error('Estimated cost elements not found for modalId:', modalId);
        return;
    }
    
    if (!pricePerKwh || pricePerKwh === 0) {
        estimatedCostDiv.style.display = 'none';
        return;
    }
    
    const amount = parseFloat(amountInput.value) || 0;
    
    // Validate amount against wallet balance
    if (amount > walletBalance) {
        // Show error message
        if (amountErrorDiv) {
            amountErrorDiv.textContent = `Amount cannot exceed wallet balance (₹${walletBalance.toFixed(2)})`;
            amountErrorDiv.style.display = 'block';
        }
        // Change input border to red
        amountInput.style.borderColor = '#dc3545';
        // Disable start button
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.style.background = '#cccccc';
            startBtn.style.cursor = 'not-allowed';
            startBtn.style.opacity = '0.6';
        }
        // Hide estimated cost
        estimatedCostDiv.style.display = 'none';
        return;
    } else {
        // Clear error message
        if (amountErrorDiv) {
            amountErrorDiv.style.display = 'none';
        }
        // Reset input border
        amountInput.style.borderColor = '';
    }
    
    if (amount > 0) {
        // Calculate estimated kWh based on amount and price per kWh
        const estimatedKwh = amount / pricePerKwh;
        estimatedEnergy.textContent = `~${estimatedKwh.toFixed(2)} kWh`;
        estimatedCostValue.textContent = `₹${amount.toFixed(2)}`;
        estimatedCostDiv.style.display = 'block';
    } else {
        estimatedCostDiv.style.display = 'none';
    }
};

// Start charging from popup
window.startChargingFromPopup = async function(modalId, chargingPointId, connectorId, deviceId, pricePerKwh) {
    // Get selected vehicle
    const vehicleSelect = document.getElementById(`popup-vehicle-select-${chargingPointId}-${connectorId}`);
    if (!vehicleSelect || !vehicleSelect.value) {
        showError('Please select a vehicle');
        return;
    }
    const vehicleId = parseInt(vehicleSelect.value);
    
    // Get amount
    const amountInput = document.getElementById(`popup-amount-input-${chargingPointId}-${connectorId}`);
    if (!amountInput) {
        showError('Amount input not found');
        return;
    }
    
    // Get wallet balance from modal
    const modalContent = document.getElementById(modalId)?.querySelector('.charging-popup-content');
    const walletBalance = modalContent ? parseFloat(modalContent.dataset.walletBalance || 0) : 0;
    
    const amount = parseFloat(amountInput.value);
    if (!amount || amount < 1) {
        showError('Please enter a valid amount (minimum ₹1.00)');
        amountInput.focus();
        return;
    }
    
    // Validate amount against wallet balance
    if (amount > walletBalance) {
        showError(`Amount cannot exceed wallet balance (₹${walletBalance.toFixed(2)}). Please enter a lower amount or top up your wallet.`);
        amountInput.focus();
        return;
    }
    
    // Get start button
    const startBtn = document.getElementById(`popup-start-btn-${chargingPointId}-${connectorId}`);
    const originalBtnText = startBtn ? startBtn.innerHTML : '';
    
    try {
        // Show loading state
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
            startBtn.style.cursor = 'not-allowed';
        }
        
        // Call API to start charging
        const response = await startCharging(deviceId, parseInt(connectorId), amount, chargingPointId, vehicleId);
        
        if (response.success) {
            showSuccess(`Charging started! Amount deducted: ₹${amount.toFixed(2)}`);
            
            // Reset form fields before closing
            const vehicleSelect = document.getElementById(`popup-vehicle-select-${chargingPointId}-${connectorId}`);
            const amountInput = document.getElementById(`popup-amount-input-${chargingPointId}-${connectorId}`);
            if (vehicleSelect) vehicleSelect.value = '';
            if (amountInput) amountInput.value = '';
            
            // Close popup
            window.closeChargingPopup(modalId);
            
            // Navigate to active session page
            setTimeout(async () => {
                try {
                    const { loadActiveSession } = await import('./active-session.js');
                    await loadActiveSession();
                } catch (error) {
                    console.error('[Start Charging] Error loading active session:', error);
                    setTimeout(async () => {
                        const { loadActiveSession } = await import('./active-session.js');
                        await loadActiveSession();
                    }, 2000);
                }
            }, 1500);
        } else {
            showError(response.error || 'Failed to start charging');
            // Reset button
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerHTML = originalBtnText;
                startBtn.style.cursor = 'pointer';
            }
        }
    } catch (error) {
        console.error('Error starting charging:', error);
        showError(error.message || 'Failed to start charging');
        // Reset button
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = originalBtnText;
            startBtn.style.cursor = 'pointer';
        }
    }
};

// Handle vehicle selection
window.onVehicleSelected = function(chargingPointId) {
    const vehicleSelect = document.getElementById(`vehicle-select-${chargingPointId}`);
    if (!vehicleSelect || !vehicleSelect.value || vehicleSelect.value === '') {
        // Hide amount section if vehicle is deselected
        const amountSection = document.getElementById(`amount-section-${chargingPointId}`);
        const startSection = document.getElementById(`start-section-${chargingPointId}`);
        
        if (amountSection) amountSection.style.display = 'none';
        if (startSection) startSection.style.display = 'none';
        
        // Reset amount
        const amountInput = document.getElementById(`amount-input-${chargingPointId}`);
        if (amountInput) amountInput.value = '';
        return;
    }
    
    // Show amount section
    const amountSection = document.getElementById(`amount-section-${chargingPointId}`);
    if (amountSection) {
        amountSection.style.display = 'block';
    }
    
    // Hide start section until amount is entered
    const startSection = document.getElementById(`start-section-${chargingPointId}`);
    if (startSection) startSection.style.display = 'none';
    
    // Reset amount
    const amountInput = document.getElementById(`amount-input-${chargingPointId}`);
    if (amountInput) amountInput.value = '';
};

// Handle amount input
window.onAmountEntered = function(chargingPointId) {
    const amountInput = document.getElementById(`amount-input-${chargingPointId}`);
    const startSection = document.getElementById(`start-section-${chargingPointId}`);
    
    if (!amountInput || !startSection) return;
    
    const amount = parseFloat(amountInput.value);
    
    if (amount && amount >= 1) {
        // Show start button
        startSection.style.display = 'block';
    } else {
        // Hide start button if amount is invalid
        startSection.style.display = 'none';
    }
};

// Load vehicles for a specific charger
async function loadVehiclesForCharger(chargingPointId) {
    try {
        const vehicleSelect = document.getElementById(`vehicle-select-${chargingPointId}`);
        if (!vehicleSelect) return;
        
        // Check if already loaded
        if (vehicleSelect.options.length > 1) return;
        
        const vehiclesResponse = await getVehicles();
        const vehicles = vehiclesResponse.success && vehiclesResponse.vehicles ? vehiclesResponse.vehicles : [];
        
        // Clear existing options except the first one
        vehicleSelect.innerHTML = '<option value="">Select Vehicle</option>';
        
        if (vehicles.length === 0) {
            vehicleSelect.innerHTML += '<option value="" disabled>No vehicles found. Add a vehicle first.</option>';
        } else {
            vehicles.forEach(vehicle => {
                const option = document.createElement('option');
                option.value = vehicle.id;
                option.textContent = `${vehicle.vehicleNumber || 'Vehicle'} ${vehicle.vehicleType ? `(${vehicle.vehicleType})` : ''}`;
                vehicleSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading vehicles:', error);
    }
}

// Calculate estimated cost for charger
window.calculateEstimatedCostForCharger = function(chargingPointId, pricePerKwh) {
    const amountInput = document.getElementById(`amount-input-${chargingPointId}`);
    const estimatedCostDiv = document.getElementById(`estimated-cost-${chargingPointId}`);
    const estimatedEnergy = document.getElementById(`estimated-energy-${chargingPointId}`);
    const estimatedCostValue = document.getElementById(`estimated-cost-value-${chargingPointId}`);
    
    if (!amountInput || !pricePerKwh || pricePerKwh === 0) {
        if (estimatedCostDiv) {
            estimatedCostDiv.style.display = 'none';
        }
        return;
    }
    
    const amount = parseFloat(amountInput.value) || 0;
    
    if (amount > 0 && estimatedCostDiv && estimatedEnergy && estimatedCostValue) {
        const estimatedKwh = amount / pricePerKwh;
        estimatedEnergy.textContent = `~${estimatedKwh.toFixed(2)} kWh`;
        estimatedCostValue.textContent = `₹${amount.toFixed(2)}`;
        estimatedCostDiv.style.display = 'block';
    } else {
        if (estimatedCostDiv) {
            estimatedCostDiv.style.display = 'none';
        }
    }
};

// Calculate estimated cost for charger (legacy function, kept for compatibility)
window.calculateEstimatedCostForCharger = function(chargingPointId, pricePerKwh) {
    // This function is no longer used but kept for compatibility
    console.log('calculateEstimatedCostForCharger called but not used in popup flow');
};

// View charger detail - opens charger detail page
window.viewChargerDetail = async function(chargingPointId, deviceId, stationId, stationName) {
    const { loadChargerDetail } = await import('./charger-detail.js');
    await loadChargerDetail(chargingPointId, deviceId, stationId, stationName);
};
