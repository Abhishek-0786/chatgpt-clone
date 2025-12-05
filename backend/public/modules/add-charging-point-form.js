// Add Charging Point Form Module
import { createChargingPoint, getTariffs, getStationsForDropdown, getChargingPoint, updateChargingPoint } from '../services/api.js';
import { showSuccess, showError, showWarning } from '../utils/notifications.js';

// Store added connectors
let addedConnectors = [];

// Export function to open add charging point form
export function openAddChargingPointForm(isEditMode = false) {
    if (!isEditMode) {
        addedConnectors = []; // Reset connectors only if not in edit mode
    }
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            .add-charging-point-container {
                width: 100%;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }
            
            .form-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
            }
            
            .form-header h2 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn {
                padding: 10px 20px;
                background-color: transparent;
                color: #dc3545;
                border: 1px solid #dc3545;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn:hover {
                background-color: #dc3545;
                color: white;
            }
            
            .form-section {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 25px;
                margin-bottom: 25px;
            }
            
            .section-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .section-icon {
                font-size: 20px;
                color: #007bff;
            }
            
            .section-title {
                font-size: 18px;
                font-weight: 600;
                margin: 0;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            }
            
            .form-group {
                display: flex;
                flex-direction: column;
            }
            
            .form-group label {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-group label .required {
                color: #dc3545;
            }
            
            .form-group input,
            .form-group select,
            .form-group textarea {
                padding: 12px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .form-group select {
                padding-right: 40px;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 15px center;
                background-size: 12px;
            }
            
            .form-group input:focus,
            .form-group select:focus,
            .form-group textarea:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .form-group.full-width {
                grid-column: 1 / -1;
            }
            
            .connector-types-grid {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                gap: 15px;
                margin-top: 15px;
                max-width: 800px;
            }
            
            .connector-type-card {
                border: 2px solid var(--border-color);
                border-radius: 8px;
                padding: 15px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s;
                background-color: var(--card-bg);
                position: relative;
            }
            
            .connector-type-card:hover {
                border-color: #007bff;
                background-color: var(--hover-bg);
            }
            
            .connector-type-card.selected {
                border-color: #007bff;
                background-color: var(--hover-bg);
            }
            
            .connector-type-card input[type="radio"] {
                position: absolute;
                top: 10px;
                right: 10px;
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            
            .connector-icon {
                width: 48px;
                height: 48px;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 8px;
            }
            
            .connector-icon img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                background: transparent;
                padding: 0;
                border: none;
                box-shadow: none;
            }
            
            .connector-type-name {
                font-size: 14px;
                font-weight: 500;
                color: #333;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .connector-input-group {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin-top: 20px;
            }
            
            .add-connector-btn {
                padding: 12px 24px;
                background-color: #000;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                margin-top: 20px;
            }
            
            .add-connector-btn:hover {
                background-color: #333;
            }
            
            .connectors-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .connectors-table thead {
                background-color: #343a40;
                color: white;
            }
            
            .connectors-table thead th {
                padding: 12px;
                text-align: left;
                font-weight: 600;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .connectors-table tbody tr {
                border-bottom: 1px solid #e0e0e0;
            }
            
            .connectors-table tbody tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            
            .connectors-table tbody td {
                padding: 12px;
                vertical-align: middle;
            }
            
            .delete-connector-btn {
                padding: 6px 12px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                transition: background-color 0.2s;
            }
            
            .delete-connector-btn:hover {
                background-color: #c82333;
            }
            
            .form-actions {
                display: flex;
                justify-content: flex-end;
                gap: 15px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e0e0e0;
            }
            
            .save-btn {
                padding: 12px 30px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 16px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .save-btn:hover {
                background-color: #c82333;
            }
            
            .save-btn:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
        </style>
        
        <div class="add-charging-point-container">
            <div class="form-header">
                <h2>Add New Charging Point</h2>
                <button class="cancel-btn" onclick="window.cancelAddChargingPoint()">CANCEL</button>
            </div>
            
            <form id="addChargingPointForm" onsubmit="window.handleAddChargingPointSubmit(event)">
                <!-- Basic Details Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-user-cog section-icon"></i>
                        <h3 class="section-title">Basic details</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Device name<span class="required">*</span></label>
                            <input type="text" name="deviceName" placeholder="Enter the name here" required>
                        </div>
                        <div class="form-group">
                            <label>Charging Station<span class="required">*</span></label>
                            <select name="chargingStation" id="chargingStationSelect" required>
                                <option value="" disabled selected hidden>Select Charging Station</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Tariff<span class="required">*</span></label>
                            <select name="tariff" id="tariffSelect" required>
                                <option value="" disabled selected hidden>Select Tariff</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Specifications Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-cogs section-icon"></i>
                        <h3 class="section-title">Specifications</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Charger Type<span class="required">*</span></label>
                            <select name="chargerType" required>
                                <option value="" disabled selected hidden>Select Charger Type</option>
                                <option value="AC">AC</option>
                                <option value="DC">DC</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Power capacity (kW)<span class="required">*</span></label>
                            <input type="number" name="powerCapacity" step="0.01" placeholder="Enter power capacity here" required>
                        </div>
                        <div class="form-group">
                            <label>Firmware version (optional)</label>
                            <input type="text" name="firmwareVersion" placeholder="Enter firmwareVersion here">
                        </div>
                        <div class="form-group">
                            <label>OEMs List</label>
                            <select name="oemList">
                                <option value="" disabled selected hidden>Select OEM</option>
                                <option value="massive_mobility">Massive Mobility</option>
                                <option value="evre">EVRE</option>
                                <option value="okaya">Okaya</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Phase</label>
                            <select name="phase">
                                <option value="" selected>Select Phase</option>
                                <option value="phase_r">Phase R</option>
                                <option value="phase_y">Phase Y</option>
                                <option value="phase_b">Phase B</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Add Connector Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-plug section-icon"></i>
                        <h3 class="section-title">Add Connector</h3>
                    </div>
                    <div>
                        <label style="font-size: 14px; font-weight: 600; margin-bottom: 15px; display: block; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;">
                            Please choose the connector type<span class="required">*</span>
                        </label>
                        <div class="connector-types-grid">
                            <div class="connector-type-card" onclick="window.selectConnectorType('type2')">
                                <input type="radio" name="connectorType" value="type2" id="connector-type2" onchange="window.selectConnectorType('type2')">
                                <div class="connector-icon">
                                    <img src="/images/connector-types/type2.png" alt="Type 2" onerror="this.onerror=null; this.style.display='none'; const fallback = this.parentElement.querySelector('.icon-fallback'); if(fallback) fallback.style.display='flex';">
                                    <div class="icon-fallback" style="display: none; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f0f0f0; border-radius: 4px;">
                                        <i class="fas fa-plug" style="font-size: 24px; color: #666;"></i>
                                    </div>
                                </div>
                                <div class="connector-type-name">Type 2</div>
                            </div>
                            <div class="connector-type-card" onclick="window.selectConnectorType('ccs2')">
                                <input type="radio" name="connectorType" value="ccs2" id="connector-ccs2" onchange="window.selectConnectorType('ccs2')">
                                <div class="connector-icon">
                                    <img src="/images/connector-types/ccs2.png" alt="CCS 2" onerror="this.onerror=null; this.style.display='none'; const fallback = this.parentElement.querySelector('.icon-fallback'); if(fallback) fallback.style.display='flex';">
                                    <div class="icon-fallback" style="display: none; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f0f0f0; border-radius: 4px;">
                                        <i class="fas fa-bolt" style="font-size: 24px; color: #666;"></i>
                                    </div>
                                </div>
                                <div class="connector-type-name">CCS 2</div>
                            </div>
                            <div class="connector-type-card" onclick="window.selectConnectorType('type1')">
                                <input type="radio" name="connectorType" value="type1" id="connector-type1" onchange="window.selectConnectorType('type1')">
                                <div class="connector-icon">
                                    <img src="/images/connector-types/type1.png" alt="Type 1" onerror="this.onerror=null; this.style.display='none'; const fallback = this.parentElement.querySelector('.icon-fallback'); if(fallback) fallback.style.display='flex';">
                                    <div class="icon-fallback" style="display: none; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f0f0f0; border-radius: 4px;">
                                        <i class="fas fa-circle" style="font-size: 24px; color: #666;"></i>
                                    </div>
                                </div>
                                <div class="connector-type-name">Type 1</div>
                            </div>
                            <div class="connector-type-card" onclick="window.selectConnectorType('gbt')">
                                <input type="radio" name="connectorType" value="gbt" id="connector-gbt" onchange="window.selectConnectorType('gbt')">
                                <div class="connector-icon">
                                    <img src="/images/connector-types/gbt.png" alt="GB/T" onerror="this.onerror=null; this.style.display='none'; const fallback = this.parentElement.querySelector('.icon-fallback'); if(fallback) fallback.style.display='flex';">
                                    <div class="icon-fallback" style="display: none; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f0f0f0; border-radius: 4px;">
                                        <i class="fas fa-charging-station" style="font-size: 24px; color: #666;"></i>
                                    </div>
                                </div>
                                <div class="connector-type-name">GB/T</div>
                            </div>
                            <div class="connector-type-card" onclick="window.selectConnectorType('nacs')">
                                <input type="radio" name="connectorType" value="nacs" id="connector-nacs" onchange="window.selectConnectorType('nacs')">
                                <div class="connector-icon">
                                    <img src="/images/connector-types/nacs.png" alt="NACS" onerror="this.onerror=null; this.style.display='none'; const fallback = this.parentElement.querySelector('.icon-fallback'); if(fallback) fallback.style.display='flex';">
                                    <div class="icon-fallback" style="display: none; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f0f0f0; border-radius: 4px;">
                                        <i class="fas fa-battery-full" style="font-size: 24px; color: #666;"></i>
                                    </div>
                                </div>
                                <div class="connector-type-name">NACS</div>
                            </div>
                            <div class="connector-type-card" onclick="window.selectConnectorType('ac_socket')">
                                <input type="radio" name="connectorType" value="ac_socket" id="connector-ac_socket" onchange="window.selectConnectorType('ac_socket')">
                                <div class="connector-icon">
                                    <img src="/images/connector-types/ac_socket.png" alt="AC Socket" onerror="this.onerror=null; this.style.display='none'; const fallback = this.parentElement.querySelector('.icon-fallback'); if(fallback) fallback.style.display='flex';">
                                    <div class="icon-fallback" style="display: none; align-items: center; justify-content: center; width: 48px; height: 48px; background: #f0f0f0; border-radius: 4px;">
                                        <i class="fas fa-power-off" style="font-size: 24px; color: #666;"></i>
                                    </div>
                                </div>
                                <div class="connector-type-name">AC Socket</div>
                            </div>
                        </div>
                        
                        <div class="connector-input-group">
                            <div class="form-group">
                                <label>Connector Power(kW)<span class="required">*</span></label>
                                <input type="number" id="connectorPower" step="0.01" placeholder="Enter Connector Power here">
                            </div>
                            <div class="form-group">
                                <label>Connector ID<span class="required">*</span></label>
                                <select id="connectorId">
                                    <option value="" disabled selected hidden>Select One</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                </select>
                            </div>
                        </div>
                        
                        <button type="button" class="add-connector-btn" onclick="window.addConnector()">
                            ADD CONNECTOR
                        </button>
                        
                        <table class="connectors-table" id="connectorsTable">
                            <thead>
                                <tr>
                                    <th>S.No</th>
                                    <th>Connector Type</th>
                                    <th>Power</th>
                                    <th>Connector ID</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="connectorsTableBody">
                                <tr>
                                    <td colspan="5" class="text-center" style="padding: 20px; color: #666;">
                                        No connectors added yet.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- Form Actions -->
                <div class="form-actions">
                    <button type="submit" class="save-btn" id="saveChargingPointBtn">
                        SAVE & ADD CHARGE POINT
                    </button>
                </div>
            </form>
        </div>
    `;
    
    // Load tariffs and stations
    loadTariffs();
    loadStations();
}

// Load tariffs from tariff management
async function loadTariffs() {
    try {
        const tariffs = await getTariffs();
        const select = document.getElementById('tariffSelect');
        
        if (tariffs && tariffs.tariffs && tariffs.tariffs.length > 0) {
            tariffs.tariffs.forEach(tariff => {
                const option = document.createElement('option');
                option.value = tariff.id;
                option.textContent = tariff.tariffName;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading tariffs:', error);
    }
}

// Load stations from stations list
async function loadStations() {
    try {
        const stations = await getStationsForDropdown();
        const select = document.getElementById('chargingStationSelect');
        
        if (stations && stations.success && stations.stations && stations.stations.length > 0) {
            stations.stations.forEach(station => {
                const option = document.createElement('option');
                option.value = station.id; // Use station ID instead of name
                option.textContent = station.stationName;
                select.appendChild(option);
            });
        } else {
            // Show message if no stations available
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No stations available';
            option.disabled = true;
            select.appendChild(option);
        }
    } catch (error) {
        console.error('Error loading stations:', error);
        showError('Failed to load stations. Please refresh the page.');
    }
}

// Select connector type
export function selectConnectorType(type) {
    // Unselect all cards
    document.querySelectorAll('.connector-type-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Select the clicked card
    const card = document.querySelector(`[onclick*="${type}"]`);
    if (card) {
        card.classList.add('selected');
    }
    
    // Check the radio button
    const radio = document.getElementById(`connector-${type}`);
    if (radio) {
        radio.checked = true;
    }
}

// Add connector to table
export function addConnector() {
    const connectorType = document.querySelector('input[name="connectorType"]:checked');
    const connectorPower = document.getElementById('connectorPower');
    const connectorId = document.getElementById('connectorId');
    
    if (!connectorType) {
        showWarning('Please select a connector type');
        return;
    }
    
    if (!connectorPower.value || parseFloat(connectorPower.value) <= 0) {
        showWarning('Please enter valid connector power');
        return;
    }
    
    if (!connectorId.value) {
        showWarning('Please select a connector ID');
        return;
    }
    
    // Check if connector ID already exists
    const existingConnector = addedConnectors.find(c => c.connectorId === connectorId.value);
    if (existingConnector) {
        showWarning('This Connector ID is already added');
        return;
    }
    
    const connector = {
        connectorType: connectorType.value, // Backend expects 'connectorType'
        typeName: getConnectorTypeName(connectorType.value), // For display only
        power: parseFloat(connectorPower.value),
        connectorId: connectorId.value
    };
    
    addedConnectors.push(connector);
    updateConnectorsTable();
    
    // Remove the selected connector ID from dropdown
    updateConnectorIdDropdown();
    
    // Reset form
    connectorType.checked = false;
    connectorPower.value = '';
    connectorId.value = '';
    document.querySelectorAll('.connector-type-card').forEach(card => {
        card.classList.remove('selected');
    });
}

// Update connector ID dropdown - remove already used IDs
function updateConnectorIdDropdown() {
    const connectorIdSelect = document.getElementById('connectorId');
    const currentValue = connectorIdSelect.value;
    
    // Get all used connector IDs
    const usedIds = addedConnectors.map(c => c.connectorId);
    
    // Clear all options except the placeholder
    connectorIdSelect.innerHTML = '<option value="" disabled selected hidden>Select One</option>';
    
    // Add only available IDs (1, 2, 3 that are not used)
    const availableIds = ['1', '2', '3'].filter(id => !usedIds.includes(id));
    
    availableIds.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id;
        connectorIdSelect.appendChild(option);
    });
    
    // If no options available, show a message
    if (availableIds.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'All IDs used';
        option.disabled = true;
        connectorIdSelect.appendChild(option);
    }
}

// Get connector type display name
function getConnectorTypeName(value) {
    const names = {
        'type2': 'Type 2',
        'ccs2': 'CCS 2',
        'type1': 'Type 1',
        'gbt': 'GB/T',
        'nacs': 'NACS',
        'ac_socket': 'AC Socket'
    };
    return names[value] || value;
}

// Update connectors table
function updateConnectorsTable() {
    const tbody = document.getElementById('connectorsTableBody');
    
    if (addedConnectors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center" style="padding: 20px; color: #666;">
                    No connectors added yet.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = addedConnectors.map((connector, index) => {
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${connector.typeName || getConnectorTypeName(connector.connectorType || connector.type)}</td>
                <td>${connector.power}</td>
                <td>${connector.connectorId}</td>
                <td>
                    <button type="button" class="delete-connector-btn" onclick="window.deleteConnector(${index})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Delete connector
export function deleteConnector(index) {
    addedConnectors.splice(index, 1);
    updateConnectorsTable();
    // Update dropdown to add back the deleted connector ID
    updateConnectorIdDropdown();
}

// Cancel add charging point - use dynamic import to avoid circular dependency
export function cancelAddChargingPoint() {
    // Use dynamic import to avoid circular dependency
    import('./charging-points.js').then(module => {
        module.loadChargingPointsModule();
    }).catch(() => {
        // Fallback: try to call global function
        if (typeof window.loadChargingPointsModule === 'function') {
            window.loadChargingPointsModule();
        } else {
            // Last resort: reload page
            window.location.reload();
        }
    });
}

// Handle form submission
export async function handleAddChargingPointSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Validate connectors
    if (addedConnectors.length === 0) {
        showWarning('Please add at least one connector');
        return;
    }
    
    // Get createdBy from localStorage
    let createdBy = 'Admin';
    try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        if (currentUser.username) {
            createdBy = currentUser.username;
        } else if (currentUser.firstName && currentUser.lastName) {
            createdBy = `${currentUser.firstName} ${currentUser.lastName}`;
        } else if (currentUser.firstName) {
            createdBy = currentUser.firstName;
        }
    } catch (e) {
        console.error('Error getting user from localStorage:', e);
    }
    
    // Normalize connectors to ensure they have connectorType (not type)
    const normalizedConnectors = addedConnectors.map(connector => ({
        connectorType: connector.connectorType || connector.type, // Support both old and new format
        power: connector.power,
        connectorId: connector.connectorId
    }));
    
    // Get all form values
    const chargingPointData = {
        deviceName: formData.get('deviceName'),
        chargingStation: formData.get('chargingStation'),
        tariff: formData.get('tariff'),
        chargerType: formData.get('chargerType'),
        powerCapacity: parseFloat(formData.get('powerCapacity')),
        firmwareVersion: formData.get('firmwareVersion') || null,
        oemList: formData.get('oemList') || null,
        phase: formData.get('phase') || null,
        connectors: normalizedConnectors,
        createdBy: createdBy
    };
    
    // Disable submit button
    const saveBtn = document.getElementById('saveChargingPointBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        const response = await createChargingPoint(chargingPointData);
        
        if (response.success) {
            showSuccess('Charging Point added successfully!');
            cancelAddChargingPoint();
        } else {
            showError(response.error || 'Failed to add charging point');
        }
    } catch (error) {
        console.error('Error adding charging point:', error);
        showError(error.message || 'Failed to add charging point');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE & ADD CHARGE POINT';
    }
}

// Export function to open edit charging point form
export async function openEditChargingPointForm(chargingPointId) {
    try {
        // Fetch charging point data
        const response = await getChargingPoint(chargingPointId);
        if (!response.success || !response.point) {
            showError('Failed to load charging point data');
            return;
        }
        
        const point = response.point;
        
        // First, open the add form to get the structure (pass true to indicate edit mode)
        openAddChargingPointForm(true);
        
        // Wait for DOM to be ready, then fill in the values
        setTimeout(() => {
            fillEditFormData(point, chargingPointId);
        }, 200);
        
    } catch (error) {
        console.error('Error opening edit charging point form:', error);
        showError(error.message || 'Failed to load charging point data');
    }
}

// Helper function to fill form data for edit
function fillEditFormData(point, chargingPointId) {
    // Change form title and submit button
    const formHeader = document.querySelector('.form-header h2');
    if (formHeader) {
        formHeader.textContent = 'Edit Charging Point';
    }
    
    const form = document.getElementById('addChargingPointForm');
    if (form) {
        form.id = 'editChargingPointForm';
        form.onsubmit = (e) => {
            e.preventDefault();
            handleUpdateChargingPointSubmit(e, chargingPointId);
        };
    }
    
    const saveBtn = document.getElementById('saveChargingPointBtn');
    if (saveBtn) {
        saveBtn.textContent = 'UPDATE CHARGE POINT';
    }
    
    // Fill in all form fields
    if (point.deviceName) {
        const input = document.querySelector('input[name="deviceName"]');
        if (input) input.value = point.deviceName;
    }
    
    // Set charging station (stationId) - need to use database ID, not stationId string
    // Backend returns stationId as integer (FK), so we can use it directly
    if (point.stationId) {
        const select = document.querySelector('select[name="chargingStation"]');
        if (select) {
            // Wait for stations to load, then set value
            const setStationValue = () => {
                if (select.options.length > 1) { // More than just placeholder
                    select.value = point.stationId; // This is the database ID (integer)
                } else {
                    // Stations not loaded yet, try again
                    setTimeout(setStationValue, 100);
                }
            };
            setTimeout(setStationValue, 300);
        }
    }
    
    // Set tariff
    if (point.tariffId) {
        const select = document.getElementById('tariffSelect');
        if (select) {
            // Wait for tariffs to load, then set value
            const setTariffValue = () => {
                if (select.options.length > 1) { // More than just placeholder
                    select.value = point.tariffId;
                } else {
                    // Tariffs not loaded yet, try again
                    setTimeout(setTariffValue, 100);
                }
            };
            setTimeout(setTariffValue, 300);
        }
    }
    
    if (point.chargerType) {
        const select = document.querySelector('select[name="chargerType"]');
        if (select) {
            select.value = point.chargerType;
        }
    }
    
    if (point.powerCapacity) {
        const input = document.querySelector('input[name="powerCapacity"]');
        if (input) input.value = point.powerCapacity;
    }
    
    if (point.firmwareVersion) {
        const input = document.querySelector('input[name="firmwareVersion"]');
        if (input) input.value = point.firmwareVersion;
    }
    
    if (point.oemList) {
        const select = document.querySelector('select[name="oemList"]');
        if (select) {
            select.value = point.oemList;
        }
    }
    
    // Set phase value (or leave as "Select Phase" if null/empty)
    const phaseSelect = document.querySelector('select[name="phase"]');
    if (phaseSelect) {
        if (point.phase) {
            phaseSelect.value = point.phase;
        } else {
            phaseSelect.value = ''; // Set to "Select Phase" option
        }
    }
    
    // Load existing connectors
    if (point.connectors && point.connectors.length > 0) {
        addedConnectors = point.connectors.map(connector => ({
            connectorType: connector.connectorType,
            typeName: getConnectorTypeName(connector.connectorType),
            power: parseFloat(connector.power),
            connectorId: connector.connectorId.toString()
        }));
        updateConnectorsTable();
        updateConnectorIdDropdown();
        
        // Select the first connector type radio button if connectors exist
        if (addedConnectors.length > 0) {
            const firstConnectorType = addedConnectors[0].connectorType;
            const radio = document.getElementById(`connector-${firstConnectorType}`);
            if (radio) {
                radio.checked = true;
                selectConnectorType(firstConnectorType);
            }
        }
    }
}

// Handle update form submission
export async function handleUpdateChargingPointSubmit(event, chargingPointId) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Validate connectors
    if (addedConnectors.length === 0) {
        showWarning('Please add at least one connector');
        return;
    }
    
    // Normalize connectors to ensure they have connectorType (not type)
    const normalizedConnectors = addedConnectors.map(connector => ({
        connectorType: connector.connectorType || connector.type,
        power: connector.power,
        connectorId: connector.connectorId
    }));
    
    // Get all form values (including chargingStation and tariff for update)
    const chargingPointData = {
        deviceName: formData.get('deviceName'),
        chargingStation: formData.get('chargingStation'), // Station can be changed
        tariff: formData.get('tariff'), // Tariff can be changed
        chargerType: formData.get('chargerType'),
        powerCapacity: parseFloat(formData.get('powerCapacity')),
        firmwareVersion: formData.get('firmwareVersion') || null,
        oemList: formData.get('oemList') || null,
        phase: formData.get('phase') || null,
        connectors: normalizedConnectors // Connectors can be updated
    };
    
    // Disable submit button
    const saveBtn = document.getElementById('saveChargingPointBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Updating...';
    
    try {
        const response = await updateChargingPoint(chargingPointId, chargingPointData);
        
        if (response.success) {
            showSuccess('Charging Point updated successfully!');
            cancelAddChargingPoint();
        } else {
            showError(response.error || 'Failed to update charging point');
        }
    } catch (error) {
        console.error('Error updating charging point:', error);
        showError(error.message || 'Failed to update charging point');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'UPDATE CHARGE POINT';
    }
}

// Make functions globally available
window.openAddChargingPointForm = openAddChargingPointForm;
window.openEditChargingPointForm = openEditChargingPointForm;
window.selectConnectorType = selectConnectorType;
window.addConnector = addConnector;
window.deleteConnector = deleteConnector;
window.cancelAddChargingPoint = cancelAddChargingPoint;
window.handleAddChargingPointSubmit = handleAddChargingPointSubmit;
window.handleUpdateChargingPointSubmit = handleUpdateChargingPointSubmit;
