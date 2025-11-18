// Station Detail Module - Shows chargers for a station
import { updatePageTitle } from '../app.js';
import { getStationChargingPoints, getActiveSession, getStationDetails } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

export async function loadStationDetail(stationId, stationName) {
    updatePageTitle(stationName || 'Station Details');
    
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
        
        // Update station name if we got it from API
        if (station && station.stationName) {
            updatePageTitle(station.stationName);
        }
        
        // Format charging points for display
        const formattedChargers = chargingPoints.map(point => {
            // Get connector type name
            const connectorTypeNames = {
                'type2': 'Type 2',
                'ccs2': 'CCS',
                'type1': 'Type 1',
                'gbt': 'GB/T',
                'nacs': 'NACS',
                'ac_socket': 'AC Socket'
            };
            const connectorType = point.connectors && point.connectors.length > 0 
                ? connectorTypeNames[point.connectors[0].connectorType?.toLowerCase()] || point.connectors[0].connectorType || 'N/A'
                : 'N/A';
            const power = point.maxPower ? `${point.maxPower} kW` : (point.powerCapacity ? `${point.powerCapacity} kW` : 'N/A');
            
            // Check if this is the user's active charging point
            const isUserCharging = userActiveSession && 
                point.deviceId === userActiveSession.deviceId;
            
            return {
                chargingPointId: point.chargingPointId,
                deviceId: point.deviceId,
                deviceName: point.deviceName,
                status: point.status,
                cStatus: point.cStatus,
                connectorType: connectorType,
                power: power,
                connectorId: point.connectors && point.connectors.length > 0 ? point.connectors[0].connectorId : null,
                isUserCharging: isUserCharging
            };
        });
        
        // Separate chargers into available and busy
        const availableChargers = formattedChargers.filter(c => 
            c.status === 'Online' && c.cStatus === 'Available'
        );
        const busyChargers = formattedChargers.filter(c => 
            c.cStatus === 'Charging' || (c.status === 'Online' && c.cStatus !== 'Available' && c.cStatus !== 'Unavailable')
        );
        const offlineChargers = formattedChargers.filter(c => 
            c.status === 'Offline' || c.cStatus === 'Unavailable'
        );
        
        const displayStationName = station?.stationName || stationName || 'Station';
        const displayStatus = station?.status || 'Offline';
        
        appMain.innerHTML = `
            <div class="station-detail-container">
                <!-- Back Button -->
                <button class="btn btn-outline" onclick="window.loadStationsModule()" style="margin-bottom: 16px;">
                    <i class="fas fa-arrow-left"></i> Back to Stations
                </button>
                
                <!-- Station Info -->
                <div class="card">
                    <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 8px;">${displayStationName}</h2>
                    <span class="badge ${displayStatus === 'Online' ? 'badge-success' : 'badge-danger'}">${displayStatus}</span>
                </div>
                
                <!-- Available Chargers Section -->
                ${availableChargers.length > 0 ? `
                <div class="card">
                    <h3 class="card-title">Available Chargers</h3>
                    <div id="availableChargersList">
                        ${availableChargers.map(charger => `
                            <div class="charger-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s;" 
                                 onclick="window.viewChargerDetail('${charger.chargingPointId}', '${charger.deviceId}', '${stationId}', '${stationName || 'Station'}')"
                                 onmouseover="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 2px 8px rgba(220, 53, 69, 0.1)'"
                                 onmouseout="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; font-size: 18px; margin-bottom: 4px; color: var(--text-primary);">${charger.deviceName}</div>
                                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                                            ${charger.connectorType} • ${charger.power}
                                        </div>
                                        <span class="badge badge-success">
                                            ${charger.cStatus}
                                        </span>
                                    </div>
                                    <div style="color: var(--text-secondary); font-size: 20px;">
                                        <i class="fas fa-chevron-right"></i>
                                    </div>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; gap: 4px;">
                                    <i class="fas fa-info-circle"></i>
                                    <span>Tap to view details</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <!-- Busy Chargers Section -->
                ${busyChargers.length > 0 ? `
                <div class="card">
                    <h3 class="card-title">Busy Chargers</h3>
                    <div id="busyChargersList">
                        ${busyChargers.map(charger => `
                            <div class="charger-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 12px; opacity: 0.7; background: var(--bg-color);">
                                <div style="display: flex; justify-content: space-between; align-items: start;">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; font-size: 18px; margin-bottom: 4px; color: var(--text-primary);">${charger.deviceName}</div>
                                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                                            ${charger.connectorType} • ${charger.power}
                                        </div>
                                        <span class="badge ${charger.cStatus === 'Charging' ? 'badge-warning' : 'badge-danger'}">
                                            ${charger.cStatus}
                                        </span>
                                    </div>
                                    <div style="color: var(--text-secondary); font-size: 20px;">
                                        <i class="fas fa-lock"></i>
                                    </div>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; gap: 4px;">
                                    <i class="fas fa-info-circle"></i>
                                    <span>Currently in use</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                <!-- Offline/Unavailable Chargers Section -->
                ${offlineChargers.length > 0 ? `
                <div class="card">
                    <h3 class="card-title">Unavailable Chargers</h3>
                    <div id="unavailableChargersList">
                        ${offlineChargers.map(charger => `
                            <div class="charger-card" style="padding: 16px; border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 12px; opacity: 0.6; background: var(--bg-color);">
                                <div style="display: flex; justify-content: space-between; align-items: start;">
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; font-size: 18px; margin-bottom: 4px; color: var(--text-primary);">${charger.deviceName}</div>
                                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                                            ${charger.connectorType} • ${charger.power}
                                        </div>
                                        <span class="badge badge-danger">
                                            ${charger.cStatus}
                                        </span>
                                    </div>
                                    <div style="color: var(--text-secondary); font-size: 20px;">
                                        <i class="fas fa-times-circle"></i>
                                    </div>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; gap: 4px;">
                                    <i class="fas fa-info-circle"></i>
                                    <span>Charger unavailable</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    } catch (error) {
        console.error('Error loading station detail:', error);
        showError('Failed to load station details');
    }
}

// View charger detail - opens charger detail page
window.viewChargerDetail = async function(chargingPointId, deviceId, stationId, stationName) {
    const { loadChargerDetail } = await import('./charger-detail.js');
    await loadChargerDetail(chargingPointId, deviceId, stationId, stationName);
};

