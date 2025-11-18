// Charging Point Detail View Module
import { getChargingPoint } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showSuccess, showWarning, showInfo } from '../utils/notifications.js';
import { loadChargingPointsModule } from './charging-points.js';

// Global lock to prevent duplicate API calls
const chargingLocks = new Set();

// Global variable to store logs refresh interval
let logsRefreshInterval = null;
let currentLogsDeviceId = null;
let lastLogTimestamp = null; // Track last log timestamp for incremental updates

// Export function to load charging point detail view
export async function loadChargingPointDetailView(chargingPointId, activeTab = 'details') {
    try {
        // Fetch charging point details
        const pointResponse = await getChargingPoint(chargingPointId);
        
        if (!pointResponse.success || !pointResponse.point) {
            showError('Failed to load charging point details');
            loadChargingPointsModule();
            return;
        }
        
        const point = pointResponse.point;
        const moduleContent = document.getElementById('moduleContent');
        
        // Calculate real-time status for header
        const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        let headerStatus = point.status || 'Offline';
        if (point.chargerLastSeen) {
            const lastActiveTime = new Date(point.chargerLastSeen);
            const now = new Date();
            const timeDiff = now - lastActiveTime;
            const isOnline = timeDiff <= OFFLINE_THRESHOLD;
            headerStatus = isOnline ? 'Online' : 'Offline';
        }
        
        // Create detail view HTML
        moduleContent.innerHTML = `
        <style>
            .charging-point-detail-view {
                width: 100%;
            }
            
            .breadcrumb-nav {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 20px;
                font-size: 14px;
                color: #666;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .breadcrumb-nav a {
                color: #007bff;
                text-decoration: none;
                cursor: pointer;
            }
            
            .breadcrumb-nav a:hover {
                text-decoration: underline;
            }
            
            .breadcrumb-nav .separator {
                color: #999;
            }
            
            .point-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #e0e0e0;
            }
            
            .point-header-left {
                flex: 1;
            }
            
            .point-name {
                font-size: 28px;
                font-weight: 700;
                color: #333;
                margin: 0 0 8px 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .point-location {
                font-size: 16px;
                color: #666;
                margin-bottom: 12px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .status-badge-large {
                display: inline-block;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 13px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .status-online {
                background-color: #d4edda;
                color: #155724;
            }
            
            .status-offline {
                background-color: #f8d7da;
                color: #721c24;
            }
            
            .status-faulted {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .point-header-right {
                display: flex;
                gap: 12px;
                align-items: center;
            }
            
            .header-btn {
                padding: 10px 20px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .btn-edit {
                background-color: #dc3545;
                color: white;
                border: 1px solid #dc3545;
            }
            
            .btn-edit:hover {
                background-color: #c82333;
                border-color: #bd2130;
            }
            
            .tabs-container {
                margin-bottom: 30px;
                border-bottom: 2px solid #e0e0e0;
            }
            
            .tabs-list {
                display: flex;
                list-style: none;
                margin: 0;
                padding: 0;
                gap: 0;
            }
            
            .tab-item {
                padding: 12px 24px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                color: #666;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .tab-item:hover {
                color: #dc3545;
                background-color: #f8f9fa;
            }
            
            .tab-item.active {
                color: #dc3545;
                border-bottom-color: #dc3545;
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
            }
            
            .detail-card {
                background-color: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 25px;
                margin-bottom: 25px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .detail-card-title {
                font-size: 18px;
                font-weight: 600;
                color: #333;
                margin: 0 0 20px 0;
                padding-bottom: 15px;
                border-bottom: 2px solid #f0f0f0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .detail-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 20px;
            }
            
            .detail-item {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            
            .detail-label {
                font-size: 12px;
                font-weight: 600;
                color: #999;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .detail-value {
                font-size: 15px;
                color: #333;
                font-weight: 500;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .detail-value.copyable {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
            }
            
            .copy-icon {
                color: #007bff;
                font-size: 14px;
                opacity: 0.6;
                transition: opacity 0.2s;
            }
            
            .copy-icon:hover {
                opacity: 1;
            }
            
            .connector-card {
                background-color: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .connector-card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .connector-card-title {
                font-size: 16px;
                font-weight: 600;
                color: #333;
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .connector-actions {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .connector-toggle {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                color: #666;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .toggle-switch {
                position: relative;
                width: 50px;
                height: 26px;
            }
            
            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 26px;
            }
            
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 20px;
                width: 20px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            
            input:checked + .toggle-slider {
                background-color: #22c55e;
            }
            
            input:checked + .toggle-slider:before {
                transform: translateX(24px);
            }
            
            .connector-table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 15px;
            }
            
            .connector-table th,
            .connector-table td {
                padding: 12px;
                text-align: left;
                border-bottom: 1px solid #e0e0e0;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .connector-table th {
                background-color: #f8f9fa;
                font-weight: 600;
                color: #333;
                text-transform: uppercase;
                font-size: 12px;
                letter-spacing: 0.5px;
            }
            
            .connector-table td {
                color: #666;
            }
            
            .status-badge-small {
                display: inline-block;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .badge-success {
                background-color: #d4edda;
                color: #155724;
            }
            
            .badge-danger {
                background-color: #f8d7da;
                color: #721c24;
            }
            
            .badge-warning {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .btn-start-charging {
                background-color: #22c55e;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .btn-start-charging:hover {
                background-color: #16a34a;
            }
            
            .btn-start-charging:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
            
            .btn-stop-charging {
                background-color: #dc3545;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .btn-stop-charging:hover {
                background-color: #c82333;
            }
            
            .btn-stop-charging:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
            
            .loading-spinner {
                text-align: center;
                padding: 40px;
            }
            
            .logs-container {
                background-color: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                padding: 20px;
                max-height: 600px;
                overflow-y: auto;
                scroll-behavior: auto; /* Use auto instead of smooth to prevent scroll jumping */
            }
            
            .log-item {
                background: white;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 15px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                border-left: 4px solid #17a2b8;
                transition: all 0.3s ease;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            
            .log-item:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            }
            
            .log-item.incoming {
                border-left-color: #28a745; /* Green for incoming */
            }
            
            .log-item.outgoing {
                border-left-color: #007bff; /* Blue for outgoing */
            }
            
            .log-item:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            
            .log-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 15px;
                gap: 20px;
            }
            
            .log-header > div:first-child {
                flex: 0 0 auto;
                min-width: 280px;
                max-width: 400px;
            }
            
            .log-header > div:last-child {
                flex: 0 0 auto;
                text-align: right;
                min-width: 180px;
            }
            
            .log-message {
                font-weight: 600;
                color: #343a40;
                margin-bottom: 5px;
                word-wrap: break-word;
                overflow-wrap: break-word;
                white-space: normal;
                display: flex;
                align-items: center;
            }
            
            .log-message i {
                color: #007bff;
                margin-right: 8px;
            }
            
            .log-device {
                color: #007bff;
                font-size: 0.9rem;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .log-device i {
                color: #007bff;
            }
            
            .connector-badge {
                background-color: #17a2b8;
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 0.8rem;
                font-weight: 600;
            }
            
            .log-timestamp {
                color: #6c757d;
                font-size: 0.9rem;
                margin-bottom: 5px;
            }
            
            .log-direction {
                display: inline-block;
                padding: 4px 8px;
                border-radius: 15px;
                font-size: 0.8rem;
                font-weight: 600;
                text-transform: uppercase;
            }
            
            .direction-incoming {
                background-color: #28a745; /* Green background for incoming */
                color: white; /* White text */
                font-weight: 600;
                padding: 4px 12px;
                border-radius: 12px;
            }
            
            .direction-outgoing {
                background-color: #007bff; /* Blue background for outgoing */
                color: white; /* White text */
                font-weight: 600;
                padding: 4px 12px;
                border-radius: 12px;
            }
            
            .log-data {
                background-color: #f8f9fa;
                border-radius: 5px;
                padding: 10px;
                margin-top: 10px;
                font-family: 'Courier New', monospace;
                font-size: 0.85rem;
                color: #343a40;
            }
            
            .log-data pre {
                margin: 0;
                font-family: 'Courier New', monospace;
                font-size: 0.85rem;
                color: #343a40;
                white-space: pre-wrap;
                word-break: break-word;
            }
            
            .text-end {
                text-align: right;
            }
        </style>
        
        <div class="charging-point-detail-view">
            <!-- Breadcrumb Navigation -->
            <div class="breadcrumb-nav">
                <a href="#" onclick="window.goBackToPointsList(); return false;">CHARGING POINTS</a>
                <span class="separator">></span>
                <span>${point.chargingPointId || chargingPointId}</span>
            </div>
            
            <!-- Charging Point Header -->
            <div class="point-header">
                <div class="point-header-left">
                    <h1 class="point-name">${point.deviceName || 'N/A'}</h1>
                    <div class="point-location">${point.stationName || 'N/A'}</div>
                    <span class="status-badge-large ${getStatusClass(headerStatus)}">${headerStatus}</span>
                </div>
                <div class="point-header-right">
                    <button class="header-btn btn-edit" onclick="window.editPointDetails('${chargingPointId}')">
                        <i class="fas fa-edit me-2"></i>EDIT DETAILS
                    </button>
                </div>
            </div>
            
            <!-- Tabs -->
            <div class="tabs-container">
                <ul class="tabs-list">
                    <li class="tab-item ${activeTab === 'details' ? 'active' : ''}" data-tab="details" onclick="window.switchPointTab('details', '${chargingPointId}')">DETAILS</li>
                    <li class="tab-item ${activeTab === 'connectors' ? 'active' : ''}" data-tab="connectors" onclick="window.switchPointTab('connectors', '${chargingPointId}')">CONNECTORS</li>
                    <li class="tab-item ${activeTab === 'logs' ? 'active' : ''}" data-tab="logs" onclick="window.switchPointTab('logs', '${chargingPointId}')">LOGS</li>
                </ul>
            </div>
            
            <!-- Tab Contents -->
            <div id="pointTabContents">
                <!-- Details Tab -->
                <div id="detailsTab" class="tab-content ${activeTab === 'details' ? 'active' : ''}">
                    ${generateDetailsTab(point)}
                </div>
                
                <!-- Connectors Tab -->
                <div id="connectorsTab" class="tab-content ${activeTab === 'connectors' ? 'active' : ''}">
                    <div class="loading-spinner">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                </div>
                
                <!-- Logs Tab -->
                <div id="logsTab" class="tab-content ${activeTab === 'logs' ? 'active' : ''}">
                    <div class="loading-spinner">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        
        // Store chargingPointId for refresh
        window.currentChargingPointId = chargingPointId;
        
        // Load initial tab data based on active tab
        if (activeTab === 'connectors') {
            loadConnectorsTab(chargingPointId, point);
        } else if (activeTab === 'logs') {
            loadLogsTab(chargingPointId, point.deviceId);
        } else {
            // Load connectors and logs in background for details tab
            loadConnectorsTab(chargingPointId, point);
            loadLogsTab(chargingPointId, point.deviceId);
        }
        
    } catch (error) {
        console.error('Error loading charging point detail view:', error);
        showError(error.message || 'Failed to load charging point details');
        loadChargingPointsModule(); // Go back to list on error
    }
}

// Generate Details Tab HTML
function generateDetailsTab(point) {
    const websocketUrl = `wss://genx.1charging.com/ws/ocpp/16/${point.deviceId}`;
    const websocketUrlNonSecure = `ws://genx.1charging.com/ws/ocpp/16/${point.deviceId}`;
    
    return `
        <!-- Basic Details Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Basic Details</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Device Id</span>
                    <span class="detail-value copyable" onclick="copyToClipboard('${point.deviceId || ''}')">
                        ${point.deviceId || 'N/A'}
                        <i class="fas fa-copy copy-icon"></i>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Device Name</span>
                    <span class="detail-value">${point.deviceName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Station Name</span>
                    <span class="detail-value">${point.stationName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Organization</span>
                    <span class="detail-value">${formatOrganization(point.organization)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Tariff</span>
                    <span class="detail-value">${point.tariffName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Created by</span>
                    <span class="detail-value">${point.createdBy || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Created At</span>
                    <span class="detail-value">${point.createdAt ? formatDate(point.createdAt) : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Last Modified</span>
                    <span class="detail-value">${point.updatedAt ? formatDate(point.updatedAt) : 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <!-- Specifications Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Specifications</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Charger type</span>
                    <span class="detail-value">${point.chargerType || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Connectors</span>
                    <span class="detail-value">${point.connectors ? point.connectors.map(c => getConnectorTypeDisplayName(c.connectorType)).join(', ') : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Max power supply</span>
                    <span class="detail-value">${point.powerCapacity ? point.powerCapacity + ' kWh' : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">No of connectors</span>
                    <span class="detail-value">${point.connectors ? point.connectors.length : 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Firmware Version</span>
                    <span class="detail-value">${point.chargerFirmwareVersion || point.firmwareVersion || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Phase</span>
                    <span class="detail-value">${formatPhase(point.phase)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Charge Box Serial Number</span>
                    <span class="detail-value">${point.chargeBoxSerialNumber || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Charge Point Model</span>
                    <span class="detail-value">${point.chargePointModel || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Charge Point Serial Number</span>
                    <span class="detail-value">${point.chargePointSerialNumber || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Charge Point Vendor</span>
                    <span class="detail-value">${point.chargePointVendor || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">ICCID</span>
                    <span class="detail-value">N/A</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">IMSI</span>
                    <span class="detail-value">N/A</span>
                </div>
            </div>
        </div>
        
        <!-- OCPP Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">OCPP (Version: 1.6j)</h3>
            <div style="margin-bottom: 30px;">
                <h4 style="font-size: 14px; font-weight: 600; color: #333; margin-bottom: 15px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;">Secure</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Protocol</span>
                        <span class="detail-value">wss</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Device Id</span>
                        <span class="detail-value">${point.deviceId || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Port</span>
                        <span class="detail-value">443</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Path</span>
                        <span class="detail-value">/ws/ocpp/16/</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Host/Domain/Server IP</span>
                        <span class="detail-value">genx.1charging.com</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Full URL</span>
                        <span class="detail-value copyable" onclick="copyToClipboard('${websocketUrl}')">
                            ${websocketUrl}
                            <i class="fas fa-copy copy-icon"></i>
                        </span>
                    </div>
                </div>
            </div>
            <div>
                <h4 style="font-size: 14px; font-weight: 600; color: #333; margin-bottom: 15px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;">Non-Secure</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Protocol</span>
                        <span class="detail-value">ws</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Device Id</span>
                        <span class="detail-value">${point.deviceId || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Port</span>
                        <span class="detail-value">80</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Path</span>
                        <span class="detail-value">/ws/ocpp/16/</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Host/Domain/Server IP</span>
                        <span class="detail-value">genx.1charging.com</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Full URL</span>
                        <span class="detail-value copyable" onclick="copyToClipboard('${websocketUrlNonSecure}')">
                            ${websocketUrlNonSecure}
                            <i class="fas fa-copy copy-icon"></i>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Load Connectors Tab
async function loadConnectorsTab(chargingPointId, point) {
    try {
        const connectorsTab = document.getElementById('connectorsTab');
        
        if (!point.connectors || point.connectors.length === 0) {
            connectorsTab.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-plug fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No connectors found</h5>
                </div>
            `;
            return;
        }
        
        // Calculate real-time online status based on charger's lastSeen
        const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        let realTimeStatus = point.status || 'Offline';
        if (point.chargerLastSeen) {
            const lastActiveTime = new Date(point.chargerLastSeen);
            const now = new Date();
            const timeDiff = now - lastActiveTime;
            const isOnline = timeDiff <= OFFLINE_THRESHOLD;
            realTimeStatus = isOnline ? 'Online' : 'Offline';
        }
        
        // Get active transactions for each connector
        const connectorsWithStatus = await Promise.all(
            point.connectors.map(async (connector) => {
                const activeTransaction = await getActiveTransaction(point.deviceId, connector.connectorId);
                return {
                    ...connector,
                    activeTransaction: activeTransaction
                };
            })
        );
        
        connectorsTab.innerHTML = connectorsWithStatus.map(connector => {
            const isCharging = connector.activeTransaction !== null;
            const connectorStatus = isCharging ? 'Charging' : realTimeStatus;
            const statusBadgeClass = isCharging ? 'badge-warning' : (realTimeStatus === 'Online' ? 'badge-success' : 'badge-danger');
            
            return `
                <div class="connector-card">
                    <div class="connector-card-header">
                        <h3 class="connector-card-title">Connector ${connector.connectorId}</h3>
                        <div class="connector-actions">
                            ${isCharging ? `
                                <button class="btn-stop-charging" onclick="window.stopChargingFromDetail('${point.deviceId}', ${connector.activeTransaction.transactionId}, ${connector.connectorId}, this)">
                                    <i class="fas fa-stop me-2"></i>Stop Charging
                                </button>
                            ` : `
                                <button class="btn-start-charging" onclick="window.startChargingFromDetail('${point.deviceId}', ${connector.connectorId}, this)">
                                    <i class="fas fa-play me-2"></i>Start Charging
                                </button>
                            `}
                        </div>
                    </div>
                    <table class="connector-table">
                        <thead>
                            <tr>
                                <th>Connector ID</th>
                                <th>Connector type</th>
                                <th>Status</th>
                                <th>Power Supply (kWh)</th>
                                <th>Error</th>
                                <th>Vendor Error</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${connector.connectorId}</td>
                                <td>${getConnectorTypeDisplayName(connector.connectorType)}</td>
                                <td><span class="status-badge-small ${statusBadgeClass}">${connectorStatus}</span></td>
                                <td>${connector.power || 'N/A'}</td>
                                <td>-</td>
                                <td>-</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading connectors tab:', error);
        document.getElementById('connectorsTab').innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <h5>Error loading connectors</h5>
                <p>${error.message || 'Please try again'}</p>
            </div>
        `;
    }
}

// Load Logs Tab
async function loadLogsTab(chargingPointId, deviceId) {
    try {
        const logsTab = document.getElementById('logsTab');
        
        // Store deviceId for auto-refresh
        currentLogsDeviceId = deviceId;
        lastLogTimestamp = null; // Reset timestamp on initial load
        
        // Clear any existing refresh interval
        if (logsRefreshInterval) {
            clearInterval(logsRefreshInterval);
            logsRefreshInterval = null;
        }
        
        // Load logs initially
        await refreshLogs(deviceId, true);
        
        // Start auto-refresh every 3 seconds when logs tab is active
        logsRefreshInterval = setInterval(async () => {
            // Only refresh if logs tab is currently active
            const logsTabElement = document.getElementById('logsTab');
            if (logsTabElement && logsTabElement.classList.contains('active')) {
                await refreshLogs(deviceId, false);
            }
        }, 3000); // Refresh every 3 seconds
        
    } catch (error) {
        console.error('Error loading logs tab:', error);
        document.getElementById('logsTab').innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <h5>Error loading logs</h5>
                <p>${error.message || 'Please try again'}</p>
            </div>
        `;
    }
}

// Refresh logs function (called by auto-refresh)
async function refreshLogs(deviceId, isInitialLoad = false) {
    try {
        const logsTab = document.getElementById('logsTab');
        if (!logsTab) return;
        
        // Get current scroll position and container
        const container = logsTab.querySelector('.logs-container');
        let scrollPosition = 0;
        let scrollHeight = 0;
        let wasScrolledToBottom = true;
        
        if (container) {
            scrollPosition = container.scrollTop;
            scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;
            // Check if user was at bottom (within 100px threshold)
            wasScrolledToBottom = (scrollHeight - scrollPosition <= clientHeight + 100);
        }
        
        // Fetch logs using deviceId
        const response = await fetch(`/api/charger/data?deviceId=${encodeURIComponent(deviceId)}&page=1&limit=1000`);
        const data = await response.json();
        
        if (!data.success || !data.data || data.data.length === 0) {
            // Only show "No logs found" if container is empty
            if (!container || container.innerHTML.trim() === '') {
                logsTab.innerHTML = `
                    <div class="text-center py-5">
                        <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                        <h5 class="text-muted">No logs found</h5>
                    </div>
                `;
            }
            return;
        }
        
        // Update last log timestamp
        if (data.data.length > 0) {
            const latestLog = data.data[0];
            const logTime = new Date(latestLog.timestamp || latestLog.createdAt).getTime();
            if (!lastLogTimestamp || logTime > lastLogTimestamp) {
                lastLogTimestamp = logTime;
            }
        }
        
        // Display logs using same structure as charger-logs.js
        const logsHtml = data.data.map(log => createLogItem(log)).join('');
        
        // Update logs
        logsTab.innerHTML = `
            <div class="logs-container">
                ${logsHtml}
            </div>
        `;
        
        // Restore scroll position
        const newContainer = logsTab.querySelector('.logs-container');
        if (newContainer) {
            // Use requestAnimationFrame to ensure DOM is updated
            requestAnimationFrame(() => {
                if (wasScrolledToBottom) {
                    // Auto-scroll to bottom to show new logs
                    newContainer.scrollTop = newContainer.scrollHeight;
                } else {
                    // Maintain scroll position relative to content
                    const newScrollHeight = newContainer.scrollHeight;
                    const heightDifference = newScrollHeight - scrollHeight;
                    // Adjust scroll position by the difference in content height
                    newContainer.scrollTop = scrollPosition + heightDifference;
                }
            });
        }
        
    } catch (error) {
        console.error('Error refreshing logs:', error);
        // Don't show error on every refresh, just log it
    }
}

// Create log item HTML (same structure as charger-logs.js but without header)
function createLogItem(log) {
    const timestamp = new Date(log.timestamp).toLocaleString();
    const directionClass = log.direction === 'Incoming' ? 'direction-incoming' : 'direction-outgoing';
    
    // Get message type icon
    const getMessageIcon = (message) => {
        switch(message) {
            case 'BootNotification': return 'fas fa-power-off';
            case 'StatusNotification': return 'fas fa-info-circle';
            case 'MeterValues': return 'fas fa-tachometer-alt';
            case 'StartTransaction': return 'fas fa-play';
            case 'StopTransaction': return 'fas fa-stop';
            case 'RemoteStartTransaction': return 'fas fa-play-circle';
            case 'RemoteStopTransaction': return 'fas fa-stop-circle';
            case 'ChangeConfiguration': return 'fas fa-cog';
            case 'Response': return 'fas fa-reply';
            default: return 'fas fa-comment';
        }
    };
    
    // Add direction class to log-item for border color
    const directionItemClass = log.direction === 'Incoming' ? 'incoming' : 'outgoing';
    
    // Format raw array for display - handle both string and object formats
    let rawData = null;
    try {
        if (log.raw) {
            if (typeof log.raw === 'string') {
                rawData = JSON.parse(log.raw);
            } else {
                rawData = log.raw;
            }
        }
    } catch (e) {
        console.warn('Error parsing raw data:', e);
        rawData = log.raw; // Use as-is if parsing fails
    }
    
    // Format timestamps for display
    const createdAt = log.createdAt ? new Date(log.createdAt).toISOString() : log.timestamp ? new Date(log.timestamp).toISOString() : null;
    const updatedAt = log.updatedAt ? new Date(log.updatedAt).toISOString() : log.timestamp ? new Date(log.timestamp).toISOString() : null;
    
    // Build complete log object for display (matching charger-logs.js format exactly)
    const fullLogData = {
        deviceId: log.deviceId || null,
        type: log.type || 'OCPP',
        connectorId: log.connectorId !== null && log.connectorId !== undefined ? log.connectorId : 0,
        messageId: log.messageId || null,
        message: log.message || 'Unknown',
        messageData: log.messageData !== null && log.messageData !== undefined ? log.messageData : {},
        raw: rawData !== null ? rawData : [],
        direction: log.direction || 'Unknown',
        createdAt: createdAt,
        updatedAt: updatedAt
    };
    
    return `
        <div class="log-item ${directionItemClass}">
            <div class="log-header">
                <div>
                    <div class="log-message">
                        <i class="${getMessageIcon(log.message)} me-2"></i>
                        ${log.message || 'Unknown'}
                    </div>
                    <div class="log-device">
                        <i class="fas fa-charging-station me-1"></i>${log.deviceId || 'N/A'}
                        ${log.connectorId !== null && log.connectorId !== undefined && log.connectorId !== 0 ? `<span class="connector-badge ms-2">Connector ${log.connectorId}</span>` : ''}
                    </div>
                </div>
                <div class="text-end">
                    <div class="log-timestamp">${timestamp}</div>
                    <div class="log-direction ${directionClass}">${log.direction}</div>
                </div>
            </div>
            
            <div class="log-data">
                <pre style="max-height: 500px; overflow-y: auto;">${JSON.stringify(fullLogData, null, 2)}</pre>
            </div>
        </div>
    `;
}

// Get active transaction for a connector (matching charger-list.js logic)
async function getActiveTransaction(deviceId, connectorId) {
    try {
        // Get more data and sort by timestamp to ensure we have the latest
        const response = await fetch(`/api/charger/data?deviceId=${encodeURIComponent(deviceId)}&limit=2000`);
        const data = await response.json();
        
        if (!data.success || !data.data || !Array.isArray(data.data)) {
            return null;
        }
        
        // Sort by timestamp (descending) to get latest first, then by id as tiebreaker
        data.data.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt).getTime();
            const timeB = new Date(b.timestamp || b.createdAt).getTime();
            if (timeB !== timeA) return timeB - timeA; // Latest first
            return (b.id || 0) - (a.id || 0); // Higher ID first
        });
        
        // Find all StartTransaction messages for this specific connector
        const startTransactions = data.data.filter(log => {
            if (log.message !== 'StartTransaction' || log.direction !== 'Incoming') {
                return false;
            }
            // Check connectorId from various possible locations
            const logConnectorId = log.connectorId || 
                                  (log.messageData && log.messageData.connectorId) || 
                                  (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].connectorId) || 
                                  0;
            return logConnectorId === connectorId;
        });
        
        if (startTransactions.length === 0) {
            return null;
        }
        
        // Get the latest StartTransaction (by timestamp first, then by id)
        const latestStart = startTransactions.reduce((latest, current) => {
            const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
            const currentTime = new Date(current.timestamp || current.createdAt).getTime();
            if (currentTime > latestTime) return current;
            if (currentTime < latestTime) return latest;
            // If same time, use ID
            const latestId = latest.id || 0;
            const currentId = current.id || 0;
            return currentId > latestId ? current : latest;
        });
        
        // Check if StartTransaction is recent (within last 2 hours)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
        if (startTime < twoHoursAgo.getTime()) {
            return null; // Transaction is too old, consider it inactive
        }
        
        // Find the response to this StartTransaction (outgoing from server, same messageId)
        const startResponse = data.data.find(log => 
            log.message === 'Response' && 
            log.messageId === latestStart.messageId &&
            log.direction === 'Outgoing'
        );
        
        // Get transactionId - first try from response, then from StartTransaction itself
        let transactionId = null;
        if (startResponse) {
            if (startResponse.messageData && startResponse.messageData.transactionId) {
                transactionId = startResponse.messageData.transactionId;
            } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
                transactionId = startResponse.raw[2].transactionId;
            }
        }
        
        // If not found in response, try to get from StartTransaction message itself
        if (!transactionId && latestStart.messageData && latestStart.messageData.transactionId) {
            transactionId = latestStart.messageData.transactionId;
        } else if (!transactionId && latestStart.raw && Array.isArray(latestStart.raw)) {
            // Try to extract from raw OCPP message
            const payload = latestStart.raw[2];
            if (payload && payload.transactionId) {
                transactionId = payload.transactionId;
            }
        }
        
        if (!transactionId) {
            return null;
        }
        
        // Check for StopTransaction with same transactionId
        const stopTransaction = data.data.find(log => 
            log.message === 'StopTransaction' && 
            log.direction === 'Incoming' &&
            (
                (log.messageData && log.messageData.transactionId === transactionId) || 
                (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId === transactionId)
            )
        );
        
        // If no StopTransaction found, transaction is active
        if (!stopTransaction) {
            return {
                transactionId: transactionId,
                connectorId: connectorId,
                startTime: latestStart.timestamp || latestStart.createdAt
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error getting active transaction:', error);
        return null;
    }
}

// Start charging from detail view
async function startChargingFromDetail(deviceId, connectorId, button) {
    // Prevent duplicate calls
    const lockKey = `${deviceId}_${connectorId}`;
    if (chargingLocks.has(lockKey)) {
        return;
    }
    
    chargingLocks.add(lockKey);
    
    try {
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Starting...';
        
        const response = await fetch('/api/charger/remote-start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                deviceId: deviceId,
                connectorId: connectorId,
                idTag: 'ADMIN' // Default admin tag
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Charging started successfully!');
            // Reload connectors tab to update status after a short delay
            setTimeout(async () => {
                if (window.currentChargingPointId) {
                    const pointResponse = await getChargingPoint(window.currentChargingPointId);
                    if (pointResponse.success && pointResponse.point) {
                        loadConnectorsTab(window.currentChargingPointId, pointResponse.point);
                    }
                }
            }, 3000); // Wait 3 seconds for StartTransaction to arrive
        } else {
            showError(data.error || 'Failed to start charging');
            button.innerHTML = originalText;
            button.disabled = false;
        }
    } catch (error) {
        console.error('Error starting charging:', error);
        showError(error.message || 'Failed to start charging');
        button.innerHTML = originalText;
        button.disabled = false;
    } finally {
        setTimeout(() => {
            chargingLocks.delete(lockKey);
        }, 5000);
    }
}

// Stop charging from detail view
async function stopChargingFromDetail(deviceId, transactionId, connectorId, button) {
    const lockKey = `${deviceId}_stop_${connectorId}`;
    if (chargingLocks.has(lockKey)) {
        return;
    }
    
    chargingLocks.add(lockKey);
    
    try {
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Stopping...';
        
        const response = await fetch('/api/charger/remote-stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                deviceId: deviceId,
                transactionId: transactionId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Charging stopped successfully!');
            // Reload connectors tab to update status after a short delay
            setTimeout(async () => {
                if (window.currentChargingPointId) {
                    const pointResponse = await getChargingPoint(window.currentChargingPointId);
                    if (pointResponse.success && pointResponse.point) {
                        loadConnectorsTab(window.currentChargingPointId, pointResponse.point);
                    }
                }
            }, 3000); // Wait 3 seconds for StopTransaction to arrive
        } else {
            showError(data.error || 'Failed to stop charging');
            button.innerHTML = originalText;
            button.disabled = false;
        }
    } catch (error) {
        console.error('Error stopping charging:', error);
        showError(error.message || 'Failed to stop charging');
        button.innerHTML = originalText;
        button.disabled = false;
    } finally {
        setTimeout(() => {
            chargingLocks.delete(lockKey);
        }, 5000);
    }
}

// Switch tab
export function switchPointTab(tabName, chargingPointId) {
    // Update URL with tab parameter
    const url = `/cms.html?module=charging-points&point=${chargingPointId}&tab=${tabName}`;
    window.history.pushState({ module: 'charging-points', chargingPointId: chargingPointId, tab: tabName }, '', url);
    
    // Clear logs refresh interval if switching away from logs tab
    if (tabName !== 'logs' && logsRefreshInterval) {
        clearInterval(logsRefreshInterval);
        logsRefreshInterval = null;
        currentLogsDeviceId = null;
        lastLogTimestamp = null;
    }
    
    // Update active tab
    document.querySelectorAll('.tab-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabName) {
            item.classList.add('active');
        }
    });
    
    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // If switching to logs tab, start auto-refresh
    if (tabName === 'logs' && window.currentChargingPointId) {
        // Get deviceId from the point data
        getChargingPoint(window.currentChargingPointId).then(response => {
            if (response.success && response.point && response.point.deviceId) {
                loadLogsTab(window.currentChargingPointId, response.point.deviceId);
            }
        }).catch(error => {
            console.error('Error loading logs on tab switch:', error);
        });
    }
    
    // If switching to connectors tab, load it if not already loaded
    if (tabName === 'connectors' && window.currentChargingPointId) {
        getChargingPoint(window.currentChargingPointId).then(response => {
            if (response.success && response.point) {
                const connectorsTab = document.getElementById('connectorsTab');
                if (connectorsTab && connectorsTab.querySelector('.loading-spinner')) {
                    loadConnectorsTab(window.currentChargingPointId, response.point);
                }
            }
        }).catch(error => {
            console.error('Error loading connectors on tab switch:', error);
        });
    }
}

// Edit point details
export function editPointDetails(chargingPointId) {
    // Push state to browser history for edit view
    const url = `/cms.html?module=charging-points&point=${chargingPointId}&action=edit`;
    window.history.pushState({ module: 'charging-points', chargingPointId: chargingPointId, view: 'edit' }, '', url);
    
    // Dynamically import and open edit charging point form
    import('./add-charging-point-form.js').then(formModule => {
        formModule.openEditChargingPointForm(chargingPointId);
    }).catch(error => {
        console.error('Error loading edit form:', error);
        showError(error.message || 'Failed to load edit form');
    });
}

// Go back to points list
export function goBackToPointsList() {
    // Clear logs refresh interval
    if (logsRefreshInterval) {
        clearInterval(logsRefreshInterval);
        logsRefreshInterval = null;
        currentLogsDeviceId = null;
        lastLogTimestamp = null;
    }
    
    // Update URL and load points list
    const url = `/cms.html?module=charging-points`;
    window.history.pushState({ module: 'charging-points' }, '', url);
    loadChargingPointsModule();
}

// Copy to clipboard
export function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard!');
    }).catch(() => {
        showError('Failed to copy');
    });
}

// Download connector QR code
export function downloadConnectorQR(deviceId, connectorId) {
    // TODO: Implement QR code download
    showInfo('QR code download functionality will be implemented');
}

// Helper functions
function getStatusClass(status) {
    if (!status) return 'status-offline';
    const statusLower = status.toLowerCase();
    if (statusLower === 'online') return 'status-online';
    if (statusLower === 'faulted') return 'status-faulted';
    return 'status-offline';
}

function formatOrganization(org) {
    if (!org) return 'N/A';
    if (org === 'massive_mobility') return 'Massive Mobility';
    if (org === '1c_ev_charging') return '1C EV Charging';
    return org;
}

function formatPhase(phase) {
    if (!phase) return 'N/A';
    if (phase === 'phase_r') return 'Phase R';
    if (phase === 'phase_y') return 'Phase Y';
    if (phase === 'phase_b') return 'Phase B';
    return phase;
}

function getConnectorTypeDisplayName(type) {
    const names = {
        'type2': 'Type 2',
        'ccs2': 'CCS 2',
        'type1': 'Type 1',
        'gbt': 'GB/T',
        'nacs': 'NACS',
        'ac_socket': 'AC Socket'
    };
    return names[type] || type;
}

// Make functions globally available (with unique names to avoid conflicts)
window.loadChargingPointDetailView = loadChargingPointDetailView;
window.switchPointTab = switchPointTab;
window.editPointDetails = editPointDetails;
window.goBackToPointsList = goBackToPointsList;
window.copyToClipboard = copyToClipboard;
window.downloadConnectorQR = downloadConnectorQR;
window.startChargingFromDetail = startChargingFromDetail;
window.stopChargingFromDetail = stopChargingFromDetail;
window.loadChargingPointsModule = loadChargingPointsModule;
// Store getActiveTransaction for this module (to avoid conflicts)
window.getActiveTransactionForPoint = getActiveTransaction;

