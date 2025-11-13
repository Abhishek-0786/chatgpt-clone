// Charger Detail Module - Shows detailed information about a specific charger
import { updatePageTitle } from '../app.js';
import { getActiveSession, getChargingPointDetail } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

export async function loadChargerDetail(chargingPointId, deviceId, stationId, stationName) {
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch charging point details from API
        const [chargingPointResponse, sessionResponse] = await Promise.all([
            getChargingPointDetail(chargingPointId).catch(() => ({ success: false, chargingPoint: null })),
            getActiveSession().catch(() => ({ success: false, session: null }))
        ]);
        
        if (!chargingPointResponse.success || !chargingPointResponse.chargingPoint) {
            showError('Charging point not found');
            appMain.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Charging Point Not Found</h3>
                    <p>Please try again later</p>
                    <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.goBackToStationDetail('${stationId}', '${stationName || 'Station'}')">
                        <i class="fas fa-arrow-left"></i> Back to Station
                    </button>
                </div>
            `;
            return;
        }
        
        const charger = chargingPointResponse.chargingPoint;
        const userActiveSession = sessionResponse.success ? sessionResponse.session : null;
        
        // Use station info from API if available, otherwise use passed parameters
        const displayStationName = charger.station?.stationName || stationName || 'Station';
        const displayStationId = charger.station?.stationId || stationId || '';
        
        // Calculate price per kWh
        const pricePerKwh = charger.pricePerKwh || (charger.tariff ? charger.tariff.baseCharges * (1 + charger.tariff.tax / 100) : 0);
        
        // Check if user has an active session on this charger
        let isUserCharging = false;
        let activeTransactionId = null;
        if (userActiveSession && userActiveSession.deviceId === charger.deviceId) {
            isUserCharging = true;
            activeTransactionId = userActiveSession.transactionId || null;
        }
        
        // Format max power for display
        const maxPowerDisplay = charger.maxPower ? `${charger.maxPower} kW` : (charger.powerCapacity ? `${charger.powerCapacity} kW` : 'N/A');
        
        // Update page title
        updatePageTitle(charger.deviceName);
        
        appMain.innerHTML = `
            <div class="charger-detail-container">
                <!-- Back Button -->
                <button class="btn btn-outline" onclick="window.goBackToStationDetail('${displayStationId}', '${displayStationName}')" style="margin-bottom: 16px;">
                    <i class="fas fa-arrow-left"></i> Back to Station
                </button>
                
                <!-- Charger Header Card -->
                <div class="card" style="background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                        <div style="font-size: 48px; color: var(--primary-color);">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <div style="flex: 1;">
                            <h2 style="font-size: 24px; font-weight: 600; margin-bottom: 4px;">${charger.deviceName}</h2>
                            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                                ${displayStationName}
                            </div>
                            <span class="badge ${charger.cStatus === 'Available' ? 'badge-success' : charger.cStatus === 'Charging' ? 'badge-warning' : 'badge-danger'}">
                                ${charger.cStatus}
                            </span>
                        </div>
                    </div>
                </div>
                
                <!-- Specifications Card (Charger-level specs only) -->
                <div class="card">
                    <h3 class="card-title">Specifications</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Charger Type</div>
                            <div style="font-size: 16px; font-weight: 600;">${charger.chargerType}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Max Power</div>
                            <div style="font-size: 16px; font-weight: 600;">${maxPowerDisplay}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Phase</div>
                            <div style="font-size: 16px; font-weight: 600;">${charger.phase}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">OEM</div>
                            <div style="font-size: 16px; font-weight: 600;">${charger.oemList}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Firmware</div>
                            <div style="font-size: 16px; font-weight: 600;">${charger.firmwareVersion}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Connectors</div>
                            <div style="font-size: 16px; font-weight: 600;">${charger.connectorCount || 0}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Connectors Card -->
                <div class="card">
                    <h3 class="card-title">Available Connectors</h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${charger.connectors && charger.connectors.length > 0 ? charger.connectors.map(connector => {
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
                                <div class="connector-item" 
                                     style="padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; ${isAvailable ? 'cursor: pointer;' : 'opacity: 0.6;'} background: ${isAvailable ? '#fff' : 'var(--bg-color)'};"
                                     ${isAvailable ? `onclick="window.viewConnectorSelection('${charger.chargingPointId}', '${charger.deviceId}', '${charger.deviceName}', '${displayStationId}', '${displayStationName}')"` : ''}>
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">Connector ${connector.connectorId}</div>
                                            <div style="font-size: 14px; color: var(--text-secondary);">${typeName} • ${connector.power} kW</div>
                                        </div>
                                        <span class="badge ${isAvailable ? 'badge-success' : 'badge-danger'}">
                                            ${connector.cStatus || connector.status}
                                        </span>
                                    </div>
                                </div>
                            `;
                        }).join('') : `
                            <div style="text-align: center; padding: 20px; color: var(--text-secondary);">
                                <i class="fas fa-plug" style="font-size: 32px; opacity: 0.3; margin-bottom: 8px;"></i>
                                <p style="font-size: 14px;">No connectors available</p>
                            </div>
                        `}
                    </div>
                </div>
                
                <!-- Status Card -->
                <div class="card">
                    <h3 class="card-title">Current Status</h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-color); border-radius: 8px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Connection Status</div>
                                <div style="font-size: 16px; font-weight: 600;">${charger.status}</div>
                            </div>
                            <span class="badge ${charger.status === 'Online' ? 'badge-success' : 'badge-danger'}">
                                ${charger.status}
                            </span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-color); border-radius: 8px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Charging Status</div>
                                <div style="font-size: 16px; font-weight: 600;">${charger.cStatus}</div>
                            </div>
                            <span class="badge ${charger.cStatus === 'Available' ? 'badge-success' : charger.cStatus === 'Charging' ? 'badge-warning' : 'badge-danger'}">
                                ${charger.cStatus}
                            </span>
                        </div>
                    </div>
                </div>
                
                <!-- Pricing Card -->
                <div class="card" style="background: linear-gradient(135deg, #fff5f5 0%, #ffffff 100%); border: 2px solid var(--primary-color);">
                    <div style="text-align: center;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Energy Price</div>
                        <div style="font-size: 32px; font-weight: 700; color: var(--primary-color); margin-bottom: 4px;">
                            ₹${pricePerKwh.toFixed(2)}
                        </div>
                        <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;">per kWh</div>
                        ${charger.tariff ? `
                        <div style="font-size: 12px; color: var(--text-secondary); padding: 8px; background: rgba(220, 53, 69, 0.1); border-radius: 8px;">
                            Base: ₹${charger.tariff.baseCharges.toFixed(2)}/kWh + ${charger.tariff.tax}% Tax
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Action Button -->
                ${charger.connectors && charger.connectors.length > 1 ? `
                <div class="card" style="padding: 24px;">
                    <button class="btn btn-primary btn-full" style="font-size: 16px; padding: 14px; min-height: 50px; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="window.viewConnectorSelection('${charger.chargingPointId}', '${charger.deviceId}', '${charger.deviceName}', '${displayStationId}', '${displayStationName}')">
                        <i class="fas fa-plug"></i> <span>Select Connector</span>
                    </button>
                </div>
                ` : charger.status === 'Online' && charger.cStatus === 'Available' && charger.connectors && charger.connectors.length === 1 ? `
                <div class="card" style="padding: 24px;">
                    <button class="btn btn-primary btn-full" style="font-size: 18px; padding: 16px; min-height: 56px;" onclick="window.showStartChargingPopup('${charger.chargingPointId}', '${charger.deviceId}', '${charger.deviceName}', ${charger.connectors[0].connectorId}, ${pricePerKwh})">
                        <i class="fas fa-bolt"></i> Start Charging
                    </button>
                </div>
                ` : isUserCharging ? `
                <div class="card" style="padding: 24px;">
                    <button class="btn btn-danger btn-full" style="font-size: 18px; padding: 16px; min-height: 56px;" onclick="window.stopCharging('${charger.chargingPointId}', '${charger.deviceId}', ${charger.connectors?.[0]?.connectorId || 1}, '${activeTransactionId || ''}')">
                        <i class="fas fa-stop"></i> Stop Charging
                    </button>
                </div>
                ` : `
                <div class="card" style="padding: 24px;">
                    <button class="btn btn-outline btn-full" disabled style="font-size: 18px; padding: 16px; min-height: 56px;">
                        <i class="fas fa-times-circle"></i> Charger Unavailable
                    </button>
                </div>
                `}
                
                <!-- Recent Sessions (Optional) -->
                <div class="card">
                    <h3 class="card-title">Recent Sessions</h3>
                    <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                        <i class="fas fa-history" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
                        <p style="font-size: 14px;">No recent sessions on this charger</p>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading charger detail:', error);
        showError('Failed to load charger details');
    }
}

// Go back to station detail
window.goBackToStationDetail = async function(stationId, stationName) {
    const { loadStationDetail } = await import('./station-detail.js');
    await loadStationDetail(stationId, stationName);
};

// View connector selection page
window.viewConnectorSelection = async function(chargingPointId, deviceId, deviceName, stationId, stationName) {
    const { loadConnectorSelection } = await import('./connector-selection.js');
    await loadConnectorSelection(chargingPointId, deviceId, deviceName, stationId, stationName);
};

