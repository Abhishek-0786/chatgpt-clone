// Connector Selection Module - Shows all connectors for a charger and allows selection
import { updatePageTitle, refreshWalletBalance } from '../app.js';
import { getChargingPointDetail } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

export async function loadConnectorSelection(chargingPointId, deviceId, deviceName, stationId, stationName) {
    // Store page info in sessionStorage for refresh persistence
    if (chargingPointId && deviceId && stationId) {
        sessionStorage.setItem('lastPage', 'connector-selection');
        sessionStorage.setItem('lastChargingPointId', chargingPointId);
        sessionStorage.setItem('lastDeviceId', deviceId);
        sessionStorage.setItem('lastDeviceName', deviceName || '');
        sessionStorage.setItem('lastStationId', stationId);
        if (stationName) {
            sessionStorage.setItem('lastStationName', stationName);
        }
    }
    
    updatePageTitle('Select Connector');
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch charging point details from API
        const response = await getChargingPointDetail(chargingPointId);
        
        if (!response.success || !response.chargingPoint) {
            showError('Failed to load connectors');
            appMain.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error Loading Connectors</h3>
                    <p>Please try again later</p>
                    <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.goBackToChargerDetail('${chargingPointId}', '${deviceId}', '${stationId}', '${stationName || 'Station'}')">
                        <i class="fas fa-arrow-left"></i> Back to Charger
                    </button>
                </div>
            `;
            return;
        }
        
        const chargingPoint = response.chargingPoint;
        const connectors = chargingPoint.connectors || [];
        
        // Use device name and station name from API if available
        const displayDeviceName = chargingPoint.deviceName || deviceName || 'Charger';
        const displayStationName = chargingPoint.station?.stationName || stationName || 'Station';
        
        // Calculate price per kWh
        const pricePerKwh = chargingPoint.pricePerKwh || (chargingPoint.tariff ? chargingPoint.tariff.baseCharges * (1 + chargingPoint.tariff.tax / 100) : 0);
        
        appMain.innerHTML = `
            <div class="connector-selection-container">
                <!-- Back Button -->
                <button class="btn btn-outline" onclick="window.goBackToChargerDetail('${chargingPointId}', '${deviceId}', '${stationId}', '${stationName}')" style="margin-bottom: 16px;">
                    <i class="fas fa-arrow-left"></i> Back to Charger
                </button>
                
                <!-- Charger Info Card -->
                <div class="card" style="background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="font-size: 48px; color: var(--primary-color);">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <div style="flex: 1;">
                            <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 4px;">${displayDeviceName}</h2>
                            <div style="font-size: 14px; color: var(--text-secondary);">
                                ${displayStationName}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Pricing Info -->
                <div class="card" style="background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%); border: 2px solid var(--primary-color); margin-bottom: 16px;">
                    <div style="text-align: center;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Energy Price</div>
                        <div style="font-size: 32px; font-weight: 700; color: var(--primary-color); margin-bottom: 4px;">
                            ₹${pricePerKwh.toFixed(2)}
                        </div>
                        <div style="font-size: 14px; color: var(--text-secondary);">per kWh</div>
                    </div>
                </div>
                
                <!-- Connectors List -->
                <div class="card">
                    <h3 class="card-title">Select Connector</h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${connectors.length > 0 ? connectors.sort((a, b) => (a.connectorId || 0) - (b.connectorId || 0)).map(connector => {
                            const connectorTypeNames = {
                                'type2': 'Type 2',
                                'ccs2': 'CCS',
                                'type1': 'Type 1',
                                'gbt': 'GB/T',
                                'nacs': 'NACS',
                                'ac_socket': 'AC Socket'
                            };
                            const typeName = connectorTypeNames[connector.connectorType?.toLowerCase()] || connector.connectorType || 'Unknown';
                            const isAvailable = connector.status === 'Available' && connector.cStatus === 'Available';
                            
                            return `
                                <div class="connector-card" 
                                     style="padding: 16px; border: 2px solid ${isAvailable ? 'var(--primary-color)' : 'var(--border-color)'}; border-radius: 12px; cursor: ${isAvailable ? 'pointer' : 'not-allowed'}; transition: all 0.2s; opacity: ${isAvailable ? '1' : '0.6'}; background: ${isAvailable ? '#fff' : 'var(--bg-color)'};"
                                     ${isAvailable ? `onclick="window.selectConnector('${chargingPointId}', '${chargingPoint.deviceId}', '${displayDeviceName}', ${connector.connectorId}, '${typeName}', ${connector.power}, ${pricePerKwh}, '${chargingPoint.station?.stationId || stationId}', '${displayStationName}')"` : ''}
                                     ${isAvailable ? `onmouseover="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 4px 12px rgba(220, 53, 69, 0.15)'"` : ''}
                                     ${isAvailable ? `onmouseout="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='none'"` : ''}>
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div style="flex: 1;">
                                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                                                <div style="font-size: 32px; color: var(--primary-color);">
                                                    <i class="fas fa-plug"></i>
                                                </div>
                                                <div>
                                                    <div style="font-weight: 600; font-size: 18px; margin-bottom: 4px; color: var(--text-primary);">
                                                        Connector ${connector.connectorId}
                                                    </div>
                                                    <div style="font-size: 14px; color: var(--text-secondary);">
                                                        ${typeName} • ${connector.power} kW
                                                    </div>
                                                </div>
                                            </div>
                                            <span class="badge ${isAvailable ? 'badge-success' : 'badge-danger'}">
                                                ${connector.cStatus || connector.status}
                                            </span>
                                        </div>
                                        ${isAvailable ? `
                                        <div style="color: var(--primary-color); font-size: 24px;">
                                            <i class="fas fa-chevron-right"></i>
                                        </div>
                                        ` : `
                                        <div style="color: var(--text-secondary); font-size: 24px;">
                                            <i class="fas fa-lock"></i>
                                        </div>
                                        `}
                                    </div>
                                </div>
                            `;
                        }).join('') : `
                            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                                <i class="fas fa-plug" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                                <p style="font-size: 14px;">No connectors available for this charger</p>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading connector selection:', error);
        showError('Failed to load connectors');
    }
}

// Select connector and proceed to start charging
window.selectConnector = async function(chargingPointId, deviceId, deviceName, connectorId, connectorType, power, pricePerKwh, stationId, stationName) {
    // Show start charging popup with connector details
    if (window.showStartChargingPopup) {
        await window.showStartChargingPopup(chargingPointId, deviceId, deviceName, connectorId, pricePerKwh);
    } else {
        // Fallback: navigate to charger detail
        const { loadChargerDetail } = await import('./charger-detail.js');
        await loadChargerDetail(chargingPointId, deviceId, stationId, stationName);
    }
};

// Go back to charger detail
window.goBackToChargerDetail = async function(chargingPointId, deviceId, stationId, stationName) {
    const { loadChargerDetail } = await import('./charger-detail.js');
    await loadChargerDetail(chargingPointId, deviceId, stationId, stationName);
};

