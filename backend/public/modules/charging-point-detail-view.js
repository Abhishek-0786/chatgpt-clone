// Charging Point Detail View Module
import { getChargingPoint } from '../services/api.js';

import { getActiveSessions, getCompletedSessions } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showSuccess, showWarning, showInfo } from '../utils/notifications.js';
import { loadChargingPointsModule } from './charging-points.js';

// Global lock to prevent duplicate API calls
const chargingLocks = new Set();

// Global variable to store logs refresh interval
let logsRefreshInterval = null;
let currentLogsDeviceId = null;
let lastLogTimestamp = null; // Track last log timestamp for incremental updates


// Global variable to store connectors refresh interval
let connectorsRefreshInterval = null;
let currentConnectorsPointId = null;

// Track remote-start events that don't yet have a StartTransaction
const pendingRemoteStarts = new Map(); // key: `${deviceId}_${connectorId}`

// Socket.io for real-time CMS updates
let cmsSocket = null;
let cmsSocketInitialized = false;
let pendingConnectorRefresh = null;
window.currentChargingPointDeviceId = window.currentChargingPointDeviceId || null;
window.currentChargingPointId = window.currentChargingPointId || null;

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

        window.currentChargingPointId = chargingPointId;
        window.currentChargingPointDeviceId = point.deviceId;
        initCmsSocket();
        
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
                color: var(--text-secondary);
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
                color: var(--text-muted);
            }
            
            .point-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .point-header-left {
                flex: 1;
            }
            
            .point-name {
                font-size: 28px;
                font-weight: 700;
                color: var(--text-primary);
                margin: 0 0 8px 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .point-location {
                font-size: 16px;
                color: var(--text-secondary);
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


            .status-charging {
                background-color: #fff4e5;
                color: #a45b00;
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
                border-bottom: 2px solid var(--border-color);
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
                color: var(--text-secondary);
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .tab-item:hover {
                color: #dc3545;
                background-color: var(--bg-tertiary);
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
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 25px;
                margin-bottom: 25px;
                box-shadow: 0 1px 3px var(--shadow);
            }
            
            .detail-card-title {
                font-size: 18px;
                font-weight: 600;
                color: var(--text-primary);
                margin: 0 0 20px 0;
                padding-bottom: 15px;
                border-bottom: 2px solid var(--border-color);
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
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .detail-value {
                font-size: 15px;
                color: var(--text-primary);
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
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 1px 3px var(--shadow);
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
                color: var(--text-primary);
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
                color: var(--text-secondary);
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
                border-bottom: 1px solid var(--border-color);
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .connector-table th {
                background-color: var(--bg-tertiary);
                font-weight: 600;
                color: var(--text-primary);
                text-transform: uppercase;
                font-size: 12px;
                letter-spacing: 0.5px;
            }
            
            .connector-table td {
                color: var(--text-secondary);
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
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 20px;
                max-height: 600px;
                overflow-y: auto;
                scroll-behavior: auto; /* Use auto instead of smooth to prevent scroll jumping */
            }
            
            .log-item {
                background: var(--card-bg);
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 15px;
                box-shadow: 0 2px 10px var(--shadow);
                border-left: 4px solid #17a2b8;
                transition: all 0.3s ease;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            
            .log-item:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 20px var(--shadow);
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
                color: var(--text-primary);
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
                color: var(--text-muted);
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
                background-color: var(--bg-tertiary);
                border-radius: 5px;
                padding: 10px;
                margin-top: 10px;
                font-family: 'Courier New', monospace;
                font-size: 0.85rem;
                color: var(--text-primary);
            }
            
            .log-data pre {
                margin: 0;
                font-family: 'Courier New', monospace;
                font-size: 0.85rem;
                color: var(--text-primary);
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

                    <li class="tab-item ${activeTab === 'sessions' ? 'active' : ''}" data-tab="sessions" onclick="window.switchPointTab('sessions', '${chargingPointId}')">SESSIONS</li>
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

                
                <!-- Sessions Tab -->
                <div id="sessionsTab" class="tab-content ${activeTab === 'sessions' ? 'active' : ''}">
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

        } else if (activeTab === 'sessions') {
            loadSessionsTab(chargingPointId, point.deviceId);
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
                <h4 style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 15px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;">Secure</h4>
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
                <h4 style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 15px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;">Non-Secure</h4>
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

async function loadConnectorsTab(chargingPointId, point, isInitialLoad = false) {
    try {
        const connectorsTab = document.getElementById('connectorsTab');

        if (!connectorsTab) return;
        
        // Store point ID for auto-refresh
        currentConnectorsPointId = { chargingPointId, deviceId: point.deviceId };
        
        // Clear any existing refresh interval
        if (connectorsRefreshInterval) {
            clearInterval(connectorsRefreshInterval);
            connectorsRefreshInterval = null;
        }
        
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

                console.log(`[Load Connectors] Checking active transaction for connector ${connector.connectorId} (deviceId: ${point.deviceId})`);
                const activeTransaction = await getActiveTransaction(point.deviceId, connector.connectorId);

                console.log(`[Load Connectors] Connector ${connector.connectorId} active transaction:`, activeTransaction);
                return {
                    ...connector,
                    activeTransaction: activeTransaction
                };
            })
        );
        

        const anyConnectorCharging = connectorsWithStatus.some(connector => connector.activeTransaction);
        const headerStatusElement = document.querySelector('.point-header .status-badge-large');
        if (headerStatusElement) {
            const newHeaderStatus = anyConnectorCharging ? 'Charging' : realTimeStatus;
            headerStatusElement.textContent = newHeaderStatus;
            headerStatusElement.className = `status-badge-large ${getStatusClass(newHeaderStatus)}`;
        }
        
        // Sort connectors by connectorId (1, 2, 3, etc.)
        const sortedConnectors = connectorsWithStatus.sort((a, b) => (a.connectorId || 0) - (b.connectorId || 0));
        
        connectorsTab.innerHTML = sortedConnectors.map(connector => {
            // Check if charging is active
            // Show stop button if we have an active transaction object
            // The stop function has a fail-safe to re-fetch transactionId if it's missing
            const hasActiveTransaction = connector.activeTransaction !== null;
            // Only exclude if transactionId is explicitly a pending placeholder (not yet started)
            // If transactionId is null/undefined but we have an active transaction object, still show stop button
            const isPendingPlaceholder = hasActiveTransaction && 
                                        connector.activeTransaction.transactionId &&
                                        typeof connector.activeTransaction.transactionId === 'string' &&
                                        connector.activeTransaction.transactionId.startsWith('pending-');
            const isCharging = hasActiveTransaction && !isPendingPlaceholder;
            
            // Debug logging
            if (hasActiveTransaction) {
                console.log(`[Connector ${connector.connectorId}] Active transaction found:`, {
                    transactionId: connector.activeTransaction.transactionId,
                    isPendingPlaceholder: isPendingPlaceholder,
                    isCharging: isCharging
                });
            }
            
            const connectorStatus = isCharging ? 'Charging' : realTimeStatus;
            const statusBadgeClass = isCharging ? 'badge-warning' : (realTimeStatus === 'Online' ? 'badge-success' : 'badge-danger');
            
            return `
                <div class="connector-card">
                    <div class="connector-card-header">
                        <h3 class="connector-card-title">Connector ${connector.connectorId}</h3>
                        <div class="connector-actions">
                            ${isCharging ? `

                                <button class="btn-stop-charging" onclick="window.stopChargingFromDetail('${point.deviceId}', ${connector.connectorId}, '${connector.activeTransaction.transactionId || ''}', '${connector.activeTransaction.sessionId || ''}', this)">
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
        

        // Start auto-refresh every 5 seconds when connectors tab is active
        if (isInitialLoad || !connectorsRefreshInterval) {
            connectorsRefreshInterval = setInterval(async () => {
                // Only refresh if connectors tab is currently active
                const connectorsTabElement = document.getElementById('connectorsTab');
                if (connectorsTabElement && connectorsTabElement.classList.contains('active') && currentConnectorsPointId) {
                    try {
                        const pointResponse = await getChargingPoint(currentConnectorsPointId.chargingPointId);
                        if (pointResponse.success && pointResponse.point) {
                            await loadConnectorsTab(currentConnectorsPointId.chargingPointId, pointResponse.point, false);
                        }
                    } catch (error) {
                        console.error('Error auto-refreshing connectors:', error);
                    }
                }
            }, 5000); // Refresh every 5 seconds
        }
        
    } catch (error) {
        console.error('Error loading connectors tab:', error);

        const connectorsTab = document.getElementById('connectorsTab');
        if (connectorsTab) {
            connectorsTab.innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <h5>Error loading connectors</h5>
                <p>${error.message || 'Please try again'}</p>
            </div>
        `;

        }
    }
}

// Load Sessions Tab
let currentSessionsDeviceId = null;
let currentSessionsSubTab = 'active'; // 'active' or 'completed'
let sessionsState = {
    active: { page: 1, limit: 10, search: '' },
    completed: { page: 1, limit: 10, search: '', fromDate: '', toDate: '' }
};

async function loadSessionsTab(chargingPointId, deviceId) {
    try {
        const sessionsTab = document.getElementById('sessionsTab');
        if (!sessionsTab) return;
        
        currentSessionsDeviceId = deviceId;
        
        // Render sessions UI with sub-tabs
        renderSessionsUI(deviceId);
        
        // Load initial sub-tab (active sessions)
        await loadSessionsSubTab('active', deviceId);
        
    } catch (error) {
        console.error('Error loading sessions tab:', error);
        const sessionsTab = document.getElementById('sessionsTab');
        if (sessionsTab) {
            sessionsTab.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                    <h5>Error loading sessions</h5>
                    <p>${error.message || 'Please try again'}</p>
                </div>
            `;
        }
    }
}

// Render sessions UI with sub-tabs
function renderSessionsUI(deviceId) {
    const sessionsTab = document.getElementById('sessionsTab');
    sessionsTab.innerHTML = `
        <style>
            .sessions-sub-tabs {
                display: flex;
                gap: 0;
                margin-bottom: 20px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .sessions-sub-tab {
                padding: 12px 24px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                color: var(--text-secondary);
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                background: none;
                border-top: none;
                border-left: none;
                border-right: none;
                position: relative;
            }
            
            .sessions-sub-tab:hover {
                color: #dc3545;
                background-color: var(--bg-tertiary);
            }
            
            .sessions-sub-tab.active {
                color: #dc3545;
                border-bottom: 3px solid #dc3545;
            }
            
            .sessions-sub-tab.active::after {
                content: '';
                position: absolute;
                bottom: -2px;
                left: 0;
                right: 0;
                height: 3px;
                background-color: #dc3545;
            }
            
            .sessions-empty-state {
                text-align: center;
                padding: 60px 20px;
            }
            
            .sessions-empty-state i {
                font-size: 64px;
                color: var(--text-secondary);
                margin-bottom: 20px;
                display: block;
                opacity: 0.7;
            }
            
            .sessions-empty-state h5 {
                font-size: 16px;
                font-weight: 500;
                color: var(--text-secondary);
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .sessions-empty-state p {
                color: var(--text-secondary);
            }
            
            .sessions-loading-state {
                text-align: center;
                padding: 60px 20px;
            }
            
            .sessions-loading-state i {
                font-size: 32px;
                color: var(--text-secondary);
                margin-bottom: 15px;
                display: block;
            }
            
            .sessions-loading-state p {
                font-size: 14px;
                font-weight: 500;
                color: var(--text-secondary);
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .sessions-content {
                display: none;
            }
            
            .sessions-content.active {
                display: block;
            }
            
            .sessions-filters {
                display: flex;
                gap: 15px;
                align-items: center;
                margin-bottom: 20px;
                flex-wrap: wrap;
                padding: 15px;
                background-color: var(--bg-tertiary);
                border-radius: 8px;
                border: 1px solid var(--border-color);
            }
            
            .sessions-search-input {
                flex: 1;
                min-width: 250px;
                padding: 10px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .sessions-date-group {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .sessions-date-input {
                padding: 10px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .sessions-date-input::-webkit-calendar-picker-indicator {
                filter: invert(0);
                cursor: pointer;
            }
            
            [data-theme="dark"] .sessions-date-input::-webkit-calendar-picker-indicator {
                filter: invert(1);
            }
            
            .sessions-apply-btn {
                padding: 10px 24px;
                background-color: #343a40;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .sessions-apply-btn:hover {
                background-color: #23272b;
            }
            
            .sessions-table-wrapper {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 3px var(--shadow);
            }
            
            .sessions-table-scroll {
                overflow-x: auto;
                overflow-y: visible;
                max-width: 100%;
            }
            
            .sessions-table-scroll::-webkit-scrollbar {
                height: 8px;
            }
            
            .sessions-table-scroll::-webkit-scrollbar-track {
                background: var(--bg-tertiary);
            }
            
            .sessions-table-scroll::-webkit-scrollbar-thumb {
                background: var(--text-muted);
                border-radius: 4px;
            }
            
            .sessions-table-scroll::-webkit-scrollbar-thumb:hover {
                background: var(--text-secondary);
            }
            
            .sessions-table {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .sessions-table thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] .sessions-table thead {
                background-color: #1a1a1a;
            }
            
            .sessions-table thead th {
                padding: 14px 12px;
                text-align: left;
                font-weight: 600;
                white-space: nowrap;
                border-right: 1px solid rgba(255,255,255,0.1);
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                overflow: hidden;
                text-overflow: ellipsis;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .sessions-table thead th:last-child {
                border-right: none;
            }
            
            .sessions-table tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            .sessions-table tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            .sessions-table tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .sessions-table tbody td:last-child {
                border-right: none;
            }
            
            .sessions-table tbody td a {
                color: var(--text-primary);
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            .sessions-table tbody td a:hover {
                color: #007bff;
                text-decoration: underline;
            }
            
            .sessions-pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 20px;
                padding: 15px;
                background-color: var(--bg-tertiary);
                border-radius: 8px;
            }
            
            .sessions-pagination-info {
                font-size: 14px;
                color: var(--text-secondary);
            }
            
            .sessions-pagination-controls {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .sessions-pagination-btn {
                padding: 8px 16px;
                border: 1px solid var(--border-color);
                background: var(--card-bg);
                color: var(--text-primary);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .sessions-pagination-btn:hover:not(:disabled) {
                background-color: var(--hover-bg);
                border-color: var(--border-color);
            }
            
            .sessions-pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .sessions-pagination-btn.active {
                background-color: #dc3545;
                color: white;
                border-color: #dc3545;
            }
        </style>
        
        <div class="sessions-sub-tabs">
            <button class="sessions-sub-tab active" data-subtab="active" onclick="window.switchSessionsSubTab('active', '${deviceId}')">ACTIVE</button>
            <button class="sessions-sub-tab" data-subtab="completed" onclick="window.switchSessionsSubTab('completed', '${deviceId}')">COMPLETED</button>
        </div>
        
        <!-- Active Sessions Content -->
        <div id="activeSessionsContent" class="sessions-content active">
            <div class="sessions-filters">
                <input type="text" id="activeSessionsSearch" class="sessions-search-input" placeholder="Search by Transaction ID, Session ID..." 
                       onkeyup="if(event.key==='Enter') window.applyActiveSessionsFilters('${deviceId}')">
                <button class="sessions-apply-btn" onclick="window.applyActiveSessionsFilters('${deviceId}')">SEARCH</button>
            </div>
            <div id="activeSessionsTableContainer">
                <div class="sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            </div>
            <div id="activeSessionsPagination" class="sessions-pagination" style="display: none;"></div>
        </div>
        
        <!-- Completed Sessions Content -->
        <div id="completedSessionsContent" class="sessions-content">
            <div class="sessions-filters">
                <input type="text" id="completedSessionsSearch" class="sessions-search-input" placeholder="Search by Transaction ID, Session ID..." 
                       onkeyup="if(event.key==='Enter') window.applyCompletedSessionsFilters('${deviceId}')">
                <div class="sessions-date-group">
                    <input type="date" id="completedSessionsFromDate" class="sessions-date-input" placeholder="From Date">
                    <input type="date" id="completedSessionsToDate" class="sessions-date-input" placeholder="To Date">
                </div>
                <button class="sessions-apply-btn" onclick="window.applyCompletedSessionsFilters('${deviceId}')">APPLY</button>
            </div>
            <div id="completedSessionsTableContainer">
                <div class="sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            </div>
            <div id="completedSessionsPagination" class="sessions-pagination" style="display: none;"></div>
        </div>
    `;
    
    // Attach event listeners
    attachSessionsEventListeners(deviceId);
}

// Attach event listeners for sessions
function attachSessionsEventListeners(deviceId) {
    // Set initial filter values
    const activeSearch = document.getElementById('activeSessionsSearch');
    const completedSearch = document.getElementById('completedSessionsSearch');
    const fromDate = document.getElementById('completedSessionsFromDate');
    const toDate = document.getElementById('completedSessionsToDate');
    
    if (activeSearch) activeSearch.value = sessionsState.active.search || '';
    if (completedSearch) completedSearch.value = sessionsState.completed.search || '';
    if (fromDate) fromDate.value = sessionsState.completed.fromDate || '';
    if (toDate) toDate.value = sessionsState.completed.toDate || '';
}

// Load sessions sub-tab
async function loadSessionsSubTab(subTab, deviceId) {
    try {
        currentSessionsSubTab = subTab;
        
        if (subTab === 'active') {
            await loadActiveSessions(deviceId);
        } else if (subTab === 'completed') {
            await loadCompletedSessionsForDevice(deviceId);
        }
    } catch (error) {
        console.error(`Error loading ${subTab} sessions:`, error);
        const container = document.getElementById(`${subTab}SessionsTableContainer`);
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>Error loading sessions: ${error.message}</p>
                </div>
            `;
        }
    }
}

// Load active sessions for device
async function loadActiveSessions(deviceId) {
    try {
        const container = document.getElementById('activeSessionsTableContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="sessions-loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading sessions...</p>
            </div>
        `;
        
        const state = sessionsState.active;
        
        // Fetch all active sessions in batches (max limit is 100 per API)
        // We'll make multiple requests if needed to get all sessions
        let allSessions = [];
        let currentPage = 1;
        const maxLimit = 100; // Backend max limit
        let hasMore = true;
        
        while (hasMore) {
            const response = await getActiveSessions({
                page: currentPage,
                limit: maxLimit,
                search: '' // Don't use backend search, we'll filter client-side
            });
            
            if (response.success && response.sessions && response.sessions.length > 0) {
                allSessions = allSessions.concat(response.sessions);
                // Check if there are more pages
                const totalPages = Math.ceil((response.total || 0) / maxLimit);
                if (currentPage >= totalPages || response.sessions.length < maxLimit) {
                    hasMore = false;
                } else {
                    currentPage++;
                }
            } else {
                hasMore = false;
            }
        }
        
        // Filter by deviceId
        let filteredSessions = allSessions.filter(session => 
            session.deviceId && session.deviceId.toLowerCase() === deviceId.toLowerCase()
        );
        
        // Apply search filter if provided
        if (state.search) {
            const searchLower = state.search.toLowerCase();
            filteredSessions = filteredSessions.filter(session => 
                (session.transactionId && session.transactionId.toString().toLowerCase().includes(searchLower)) ||
                (session.sessionId && session.sessionId.toLowerCase().includes(searchLower))
            );
        }
        
        if (filteredSessions.length === 0) {
            container.innerHTML = `
                <div class="sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No active sessions found for this charging point</h5>
                </div>
            `;
            document.getElementById('activeSessionsPagination').style.display = 'none';
            return;
        }
        
        // Client-side pagination
        const totalPages = Math.ceil(filteredSessions.length / state.limit);
        const paginatedSessions = filteredSessions.slice((state.page - 1) * state.limit, state.page * state.limit);
        
        // Display sessions (sessions, page, limit, total)
        displayActiveSessions(paginatedSessions, state.page, state.limit, filteredSessions.length);
        
    } catch (error) {
        console.error('Error loading active sessions:', error);
        const container = document.getElementById('activeSessionsTableContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>Error loading sessions: ${error.message}</p>
                </div>
            `;
        }
    }
}

// Load completed sessions for device
async function loadCompletedSessionsForDevice(deviceId) {
    try {
        const container = document.getElementById('completedSessionsTableContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="sessions-loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading sessions...</p>
            </div>
        `;
        
        const state = sessionsState.completed;
        
        // Fetch all completed sessions in batches (max limit is 100 per API)
        // We'll make multiple requests if needed to get all sessions
        let allSessions = [];
        let currentPage = 1;
        const maxLimit = 100; // Backend max limit
        let hasMore = true;
        
        while (hasMore) {
            const response = await getCompletedSessions({
                page: currentPage,
                limit: maxLimit,
                search: '', // Don't use backend search, we'll filter client-side
                fromDate: state.fromDate,
                toDate: state.toDate
            });
            
            if (response.success && response.sessions && response.sessions.length > 0) {
                allSessions = allSessions.concat(response.sessions);
                // Check if there are more pages
                const totalPages = Math.ceil((response.total || 0) / maxLimit);
                if (currentPage >= totalPages || response.sessions.length < maxLimit) {
                    hasMore = false;
                } else {
                    currentPage++;
                }
            } else {
                hasMore = false;
            }
        }
        
        // Filter by deviceId
        let filteredSessions = allSessions.filter(session => 
            session.deviceId && session.deviceId.toLowerCase() === deviceId.toLowerCase()
        );
        
        // Apply search filter if provided
        if (state.search) {
            const searchLower = state.search.toLowerCase();
            filteredSessions = filteredSessions.filter(session => 
                (session.transactionId && session.transactionId.toString().toLowerCase().includes(searchLower)) ||
                (session.sessionId && session.sessionId.toLowerCase().includes(searchLower))
            );
        }
        
        if (filteredSessions.length === 0) {
            container.innerHTML = `
                <div class="sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No completed sessions found for this charging point</h5>
                </div>
            `;
            document.getElementById('completedSessionsPagination').style.display = 'none';
            return;
        }
        
        // Client-side pagination
        const totalPages = Math.ceil(filteredSessions.length / state.limit);
        const paginatedSessions = filteredSessions.slice((state.page - 1) * state.limit, state.page * state.limit);
        
        // Display sessions
        displayCompletedSessions(paginatedSessions, state.page, totalPages, filteredSessions.length);
        
    } catch (error) {
        console.error('Error loading completed sessions:', error);
        const container = document.getElementById('completedSessionsTableContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>Error loading sessions: ${error.message}</p>
                </div>
            `;
        }
    }
}

// Display active sessions
function displayActiveSessions(sessions, page, limit, total) {
    const container = document.getElementById('activeSessionsTableContainer');
    if (!container) return;
    
    const currencySymbol = sessions[0]?.currency === 'USD' ? '$' : '₹';
    
    container.innerHTML = `
        <div class="sessions-table-wrapper">
            <div class="sessions-table-scroll">
                <table class="sessions-table">
                    <thead>
                        <tr>
                            <th>S.NO</th>
                            <th>STATION</th>
                            <th>ENERGY (KWH)</th>
                            <th>ENTERED AMOUNT (₹)</th>
                            <th>BILLED AMOUNT (₹)</th>
                            <th>BASE CHARGE</th>
                            <th>TAX (%)</th>
                            <th>REFUND (₹)</th>
                            <th>MODE</th>
                            <th>VEHICLE</th>
                            <th>SESSION DURATION</th>
                            <th>START TIME</th>
                            <th>DEVICE ID</th>
                            <th>CONNECTOR ID</th>
                            <th>T</th>
                            <th>SESSION ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map((session, index) => {
                            const serialNo = (page - 1) * limit + index + 1;
                            const startTime = formatDate(session.startTime);
                            return `
                                <tr>
                                    <td>${serialNo}</td>
                                    <td>${session.stationName || 'N/A'}</td>
                                    <td>${(session.energy || 0).toFixed(2)}</td>
                                    <td>${currencySymbol}${(session.enteredAmount || 0).toFixed(2)}</td>
                                    <td>${currencySymbol}${(session.billedAmount || 0).toFixed(2)}</td>
                                    <td>${currencySymbol}${(session.baseCharges || 0).toFixed(2)}</td>
                                    <td>${(session.tax || 0).toFixed(2)}%</td>
                                    <td>${currencySymbol}${(session.refund || 0).toFixed(2)}</td>
                                    <td>${session.mode || 'N/A'}</td>
                                    <td>${session.vehicle || 'N/A'}</td>
                                    <td>${session.sessionDuration || 'N/A'}</td>
                                    <td>${startTime}</td>
                                    <td>${session.deviceId || 'N/A'}</td>
                                    <td>${session.connectorId || 'N/A'}</td>
                                    <td>${session.transactionId || 'N/A'}</td>
                                    <td><a href="#" onclick="window.viewSession('${session.sessionId}'); return false;">${session.sessionId || 'N/A'}</a></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Update pagination
    updateActiveSessionsPagination(page, Math.ceil(total / limit), total);
}

// Display completed sessions
function displayCompletedSessions(sessions, page, totalPages, total) {
    const container = document.getElementById('completedSessionsTableContainer');
    if (!container) return;
    
    const currencySymbol = sessions[0]?.currency === 'USD' ? '$' : '₹';
    
    container.innerHTML = `
        <div class="sessions-table-wrapper">
            <div class="sessions-table-scroll">
                <table class="sessions-table">
                    <thead>
                        <tr>
                            <th>S.NO</th>
                            <th>STATION</th>
                            <th>ENERGY (KWH)</th>
                            <th>ENTERED AMOUNT (₹)</th>
                            <th>BILLED AMOUNT (₹)</th>
                            <th>BASE CHARGE</th>
                            <th>TAX (%)</th>
                            <th>REFUND (₹)</th>
                            <th>MODE</th>
                            <th>VEHICLE</th>
                            <th>SESSION DURATION</th>
                            <th>STOP REASON</th>
                            <th>START TIME</th>
                            <th>END TIME</th>
                            <th>DEVICE ID</th>
                            <th>CONNECTOR ID</th>
                            <th>Transaction ID</th>
                            <th>SESSION ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map((session, index) => {
                            const serialNo = (page - 1) * sessionsState.completed.limit + index + 1;
                            const startTime = formatDate(session.startTime);
                            const endTime = session.endTime ? formatDate(session.endTime) : 'N/A';
                            return `
                                <tr>
                                    <td>${serialNo}</td>
                                    <td>${session.stationName || 'N/A'}</td>
                                    <td>${(session.energy || 0).toFixed(2)}</td>
                                    <td>${currencySymbol}${(session.enteredAmount || 0).toFixed(2)}</td>
                                    <td>${currencySymbol}${(session.billedAmount || 0).toFixed(2)}</td>
                                    <td>${currencySymbol}${(session.baseCharges || 0).toFixed(2)}</td>
                                    <td>${(session.tax || 0).toFixed(2)}%</td>
                                    <td>${currencySymbol}${(session.refund || 0).toFixed(2)}</td>
                                    <td>${session.mode || 'N/A'}</td>
                                    <td>${session.vehicle || 'N/A'}</td>
                                    <td>${session.sessionDuration || 'N/A'}</td>
                                    <td>${session.stopReason || 'N/A'}</td>
                                    <td>${startTime}</td>
                                    <td>${endTime}</td>
                                    <td>${session.deviceId || 'N/A'}</td>
                                    <td>${session.connectorId || 'N/A'}</td>
                                    <td>${session.transactionId || 'N/A'}</td>
                                    <td><a href="#" onclick="window.viewSession('${session.sessionId}'); return false;">${session.sessionId || 'N/A'}</a></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Update pagination
    updateCompletedSessionsPagination(page, totalPages, total);
}

// Update active sessions pagination
function updateActiveSessionsPagination(currentPage, totalPages, total) {
    const pagination = document.getElementById('activeSessionsPagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    const start = (currentPage - 1) * sessionsState.active.limit + 1;
    const end = Math.min(currentPage * sessionsState.active.limit, total);
    
    let paginationHTML = `
        <div class="sessions-pagination-info">Showing ${start}-${end} of ${total}</div>
        <div class="sessions-pagination-controls">
    `;
    
    // Previous button
    paginationHTML += `
        <button class="sessions-pagination-btn" onclick="window.activeSessionsPrevPage('${currentSessionsDeviceId}')" 
                ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
    `;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="sessions-pagination-btn ${i === currentPage ? 'active' : ''}" 
                        onclick="window.activeSessionsGoToPage(${i}, '${currentSessionsDeviceId}')">${i}</button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span>...</span>`;
        }
    }
    
    // Next button
    paginationHTML += `
        <button class="sessions-pagination-btn" onclick="window.activeSessionsNextPage('${currentSessionsDeviceId}')" 
                ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    `;
    
    paginationHTML += `</div>`;
    pagination.innerHTML = paginationHTML;
}

// Update completed sessions pagination
function updateCompletedSessionsPagination(currentPage, totalPages, total) {
    const pagination = document.getElementById('completedSessionsPagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    const start = (currentPage - 1) * sessionsState.completed.limit + 1;
    const end = Math.min(currentPage * sessionsState.completed.limit, total);
    
    let paginationHTML = `
        <div class="sessions-pagination-info">Showing ${start}-${end} of ${total}</div>
        <div class="sessions-pagination-controls">
    `;
    
    // Previous button
    paginationHTML += `
        <button class="sessions-pagination-btn" onclick="window.completedSessionsPrevPage('${currentSessionsDeviceId}')" 
                ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
    `;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="sessions-pagination-btn ${i === currentPage ? 'active' : ''}" 
                        onclick="window.completedSessionsGoToPage(${i}, '${currentSessionsDeviceId}')">${i}</button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span>...</span>`;
        }
    }
    
    // Next button
    paginationHTML += `
        <button class="sessions-pagination-btn" onclick="window.completedSessionsNextPage('${currentSessionsDeviceId}')" 
                ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    `;
    
    paginationHTML += `</div>`;
    pagination.innerHTML = paginationHTML;
}

// Load Logs Tab

// Logs state management
let logsCurrentPage = 1;
let logsTotalPages = 1;
let logsFilters = {
    messageType: '',
    direction: '',
    fromDate: '',
    toDate: '',
    connectorId: ''
};

async function loadLogsTab(chargingPointId, deviceId) {
    try {
        const logsTab = document.getElementById('logsTab');
        
        // Store deviceId for auto-refresh
        currentLogsDeviceId = deviceId;
        lastLogTimestamp = null; // Reset timestamp on initial load

        logsCurrentPage = 1; // Reset pagination
        
        // Clear any existing refresh interval
        if (logsRefreshInterval) {
            clearInterval(logsRefreshInterval);
            logsRefreshInterval = null;
        }

        
        // Render logs UI with filters
        renderLogsUI(deviceId);
        
        // Load logs initially
        await refreshLogs(deviceId, true);
        

        // Start auto-refresh every 10 seconds when logs tab is active (reduced frequency)
        logsRefreshInterval = setInterval(async () => {
            // Only refresh if logs tab is currently active
            const logsTabElement = document.getElementById('logsTab');
            if (logsTabElement && logsTabElement.classList.contains('active')) {
                await refreshLogs(deviceId, false);
            }

        }, 10000); // Refresh every 10 seconds
        
    } catch (error) {
        console.error('Error loading logs tab:', error);
        document.getElementById('logsTab').innerHTML = `
            <div class="text-center py-5 logs-empty-state">
                <i class="fas fa-exclamation-triangle fa-3x mb-3"></i>
                <h5>Error loading logs</h5>
                <p>${error.message || 'Please try again'}</p>
            </div>
        `;
    }
}


// Render logs UI with filters and pagination
function renderLogsUI(deviceId) {
    const logsTab = document.getElementById('logsTab');
    logsTab.innerHTML = `
        <style>
            .logs-filters {
                background: var(--card-bg);
                padding: 24px;
                border-radius: 12px;
                margin-bottom: 24px;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 18px;
                box-shadow: 0 2px 8px var(--shadow);
                border: 1px solid var(--border-color);
            }
            .logs-filters .filter-group {
                display: flex;
                flex-direction: column;
            }
            .logs-filters label {
                font-size: 12px;
                font-weight: 600;
                color: var(--text-secondary);
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .logs-filters input,
            .logs-filters select {
                padding: 10px 14px;
                border: 1px solid var(--input-border);
                border-radius: 6px;
                font-size: 14px;
                background: var(--input-bg);
                color: var(--text-primary);
                transition: all 0.2s;
            }
            .logs-filters input:focus,
            .logs-filters select:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .logs-filters input[type="date"]::-webkit-calendar-picker-indicator {
                filter: invert(0);
                cursor: pointer;
            }
            
            [data-theme="dark"] .logs-filters input[type="date"]::-webkit-calendar-picker-indicator {
                filter: invert(1);
            }
            .logs-filters button {
                padding: 12px 24px;
                background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                box-shadow: 0 2px 4px rgba(0,123,255,0.2);
            }
            .logs-filters button:hover {
                background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
                box-shadow: 0 4px 8px rgba(0,123,255,0.3);
                transform: translateY(-1px);
            }
            .logs-container {
                max-height: 600px;
                overflow-y: auto;
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 16px;
                background: var(--card-bg);
            }
            .logs-container::-webkit-scrollbar {
                width: 8px;
            }
            .logs-container::-webkit-scrollbar-track {
                background: var(--bg-tertiary);
                border-radius: 4px;
            }
            .logs-container::-webkit-scrollbar-thumb {
                background: var(--text-muted);
                border-radius: 4px;
            }
            .logs-container::-webkit-scrollbar-thumb:hover {
                background: var(--text-secondary);
            }
            .log-item-compact {
                background: var(--card-bg);
                border-left: 4px solid #007bff;
                padding: 16px 20px;
                margin-bottom: 12px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 2px 4px var(--shadow);
                border: 1px solid var(--border-color);
            }
            .log-item-compact:hover {
                box-shadow: 0 4px 12px var(--shadow);
                transform: translateY(-2px);
                border-color: var(--border-color);
            }
            .log-item-compact.incoming {
                border-left-color: #28a745;
                background: var(--card-bg);
            }
            .log-item-compact.outgoing {
                border-left-color: #007bff;
                background: var(--card-bg);
            }
            .log-item-compact-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .log-item-compact-message {
                font-weight: 600;
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 15px;
            }
            .log-item-compact-message i {
                font-size: 16px;
            }
            .log-item-compact-meta {
                display: flex;
                gap: 15px;
                font-size: 13px;
                color: var(--text-secondary);
                font-weight: 500;
            }
            .log-item-compact-info {
                font-size: 12px;
                color: var(--text-muted);
                display: flex;
                gap: 20px;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--border-color);
            }
            .logs-loading-state i, .logs-loading-state p {
                color: var(--text-secondary);
            }
            .logs-empty-state i, .logs-empty-state h5, .logs-empty-state p {
                color: var(--text-secondary);
            }
            .logs-empty-state i {
                opacity: 0.7;
            }
            .log-item-compact-info-item {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .log-item-compact-info-item i {
                color: var(--text-muted);
                font-size: 11px;
            }
            .badge-incoming {
                background-color: #28a745;
                color: white;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .badge-outgoing {
                background-color: #007bff;
                color: white;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .logs-pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 20px;
                padding: 15px 20px;
                background: var(--bg-tertiary);
                border-radius: 8px;
                flex-wrap: nowrap;
            }
            .logs-pagination-info {
                color: var(--text-secondary);
                font-size: 14px;
                white-space: nowrap;
                margin-right: 20px;
            }
            .logs-pagination-controls {
                display: flex;
                gap: 12px;
                align-items: center;
                flex-wrap: nowrap;
            }
            .logs-pagination-controls span {
                color: var(--text-secondary);
                font-size: 14px;
                font-weight: 500;
                white-space: nowrap;
                padding: 0 8px;
            }
            .logs-pagination-controls button {
                padding: 8px 15px;
                border: 1px solid var(--border-color);
                background: var(--card-bg);
                color: var(--text-primary);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }
            .logs-pagination-controls button:hover:not(:disabled) {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }
            .logs-pagination-controls button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .log-drawer {
                position: fixed;
                top: 0;
                right: -500px;
                width: 500px;
                height: 100vh;
                background: var(--card-bg);
                box-shadow: -4px 0 20px var(--shadow);
                z-index: 10000;
                transition: right 0.3s ease-in-out;
                display: flex;
                flex-direction: column;
            }
            .log-drawer.open {
                right: 0;
            }
            .log-drawer-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 24px;
                border-bottom: 1px solid var(--border-color);
                background: var(--bg-tertiary);
            }
            .log-drawer-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                color: var(--text-primary);
            }
            .log-drawer-close {
                font-size: 24px;
                font-weight: bold;
                color: var(--text-muted);
                cursor: pointer;
                border: none;
                background: none;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.2s;
            }
            .log-drawer-close:hover {
                background: var(--hover-bg);
                color: var(--text-primary);
            }
            .log-drawer-body {
                flex: 1;
                overflow-y: auto;
                padding: 24px;
            }
            .log-drawer-body pre {
                background: var(--bg-tertiary);
                padding: 16px;
                border-radius: 6px;
                overflow-x: auto;
                font-size: 13px;
                line-height: 1.6;
                margin: 0;
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                font-family: 'Courier New', monospace;
            }
            .log-drawer-body::-webkit-scrollbar {
                width: 8px;
            }
            .log-drawer-body::-webkit-scrollbar-track {
                background: var(--bg-tertiary);
            }
            .log-drawer-body::-webkit-scrollbar-thumb {
                background: var(--text-muted);
                border-radius: 4px;
            }
            .log-drawer-body::-webkit-scrollbar-thumb:hover {
                background: var(--text-secondary);
            }
        </style>
        
        <div class="logs-filters">
            <div class="filter-group">
                <label>Message Type</label>
                <select id="logFilterMessageType">
                    <option value="">All Messages</option>
                    <option value="BootNotification">BootNotification</option>
                    <option value="StatusNotification">StatusNotification</option>
                    <option value="ChangeConfiguration">ChangeConfiguration</option>
                    <option value="RemoteStartTransaction">RemoteStartTransaction</option>
                    <option value="RemoteStopTransaction">RemoteStopTransaction</option>
                    <option value="StartTransaction">StartTransaction</option>
                    <option value="StopTransaction">StopTransaction</option>
                    <option value="MeterValues">MeterValues</option>
                    <option value="Heartbeat">Heartbeat</option>
                    <option value="Response">Response</option>
                </select>
            </div>
            <div class="filter-group">
                <label>Direction</label>
                <select id="logFilterDirection">
                    <option value="">All Directions</option>
                    <option value="Incoming">Incoming</option>
                    <option value="Outgoing">Outgoing</option>
                </select>
            </div>
            <div class="filter-group">
                <label>From Date</label>
                <input type="date" id="logFilterFromDate">
            </div>
            <div class="filter-group">
                <label>To Date</label>
                <input type="date" id="logFilterToDate">
            </div>
            <div class="filter-group">
                <label>&nbsp;</label>
                <button id="applyLogsFiltersBtn">Apply Filters</button>
            </div>
        </div>
        
        <div class="logs-container" id="logsContainer">
            <div class="text-center py-5 logs-loading-state">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p class="mt-3">Loading logs...</p>
            </div>
        </div>
        
        <div class="logs-pagination" id="logsPagination" style="display: none;">
            <div class="logs-pagination-info" id="logsPaginationInfo"></div>
            <div class="logs-pagination-controls">
                <button id="logsPrevBtn" disabled>Previous</button>
                <span id="logsPageInfo" style="min-width: 100px; text-align: center;">Page ${logsCurrentPage} of ${logsTotalPages}</span>
                <button id="logsNextBtn" disabled>Next</button>
            </div>
        </div>
        
        <div class="log-drawer" id="logDrawer">
            <div class="log-drawer-header">
                <h3>Log Details</h3>
                <button class="log-drawer-close" onclick="closeLogDrawer()">&times;</button>
            </div>
            <div class="log-drawer-body" id="logDrawerBody">
                <pre id="logDrawerContent"></pre>
            </div>
        </div>
    `;
    
    // Attach event listeners
    attachLogsEventListeners(deviceId);
}

// Attach event listeners for filters
function attachLogsEventListeners(deviceId) {
    // Restore filter values
    const messageTypeSelect = document.getElementById('logFilterMessageType');
    const directionSelect = document.getElementById('logFilterDirection');
    const fromDateInput = document.getElementById('logFilterFromDate');
    const toDateInput = document.getElementById('logFilterToDate');
    
    if (messageTypeSelect) messageTypeSelect.value = logsFilters.messageType || '';
    if (directionSelect) directionSelect.value = logsFilters.direction || '';
    if (fromDateInput) fromDateInput.value = logsFilters.fromDate || '';
    if (toDateInput) toDateInput.value = logsFilters.toDate || '';
    
    // Apply filters button
    const applyBtn = document.getElementById('applyLogsFiltersBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            logsFilters.messageType = messageTypeSelect ? messageTypeSelect.value : '';
            logsFilters.direction = directionSelect ? directionSelect.value : '';
            logsFilters.fromDate = fromDateInput ? fromDateInput.value : '';
            logsFilters.toDate = toDateInput ? toDateInput.value : '';
            logsCurrentPage = 1;
            refreshLogs(deviceId, true);
        });
    }
    
    // Pagination buttons
    const prevBtn = document.getElementById('logsPrevBtn');
    const nextBtn = document.getElementById('logsNextBtn');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (logsCurrentPage > 1) {
                logsCurrentPage--;
                refreshLogs(deviceId, false);
            }
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (logsCurrentPage < logsTotalPages) {
                logsCurrentPage++;
                refreshLogs(deviceId, false);
            }
        });
    }
    
    // Close drawer function
    window.closeLogDrawer = function() {
        const drawer = document.getElementById('logDrawer');
        if (drawer) {
            drawer.classList.remove('open');
        }
    };
    
    // Open drawer function
    window.openLogDrawer = function() {
        const drawer = document.getElementById('logDrawer');
        if (drawer) {
            drawer.classList.add('open');
        }
    };
}

// Refresh logs function (called by auto-refresh and pagination)
async function refreshLogs(deviceId, isInitialLoad = false) {
    try {
        const logsTab = document.getElementById('logsTab');
        if (!logsTab) return;
        

        const container = document.getElementById('logsContainer');
        if (!container) return;
        
        // Build API URL with filters and pagination
        const params = new URLSearchParams({
            deviceId: deviceId,
            page: logsCurrentPage,
            limit: 20 // Show 20 logs per page
        });
        
        // Add filters
        if (logsFilters.messageType) params.append('messageType', logsFilters.messageType);
        if (logsFilters.direction) params.append('direction', logsFilters.direction);
        if (logsFilters.fromDate) params.append('fromDate', logsFilters.fromDate);
        if (logsFilters.toDate) params.append('toDate', logsFilters.toDate);
        if (logsFilters.connectorId) params.append('connectorId', logsFilters.connectorId);
        
        // Show loading state
        container.innerHTML = `
            <div class="text-center py-5 logs-loading-state">
                <i class="fas fa-spinner fa-spin fa-2x"></i>
                <p class="mt-3">Loading logs...</p>
            </div>
        `;
        
        // Fetch logs
        const response = await fetch(`/api/charger/data?${params.toString()}`);
        const data = await response.json();
        
        if (!data.success || !data.data || data.data.length === 0) {

            container.innerHTML = `
                    <div class="text-center py-5 logs-empty-state">
                        <i class="fas fa-inbox fa-3x mb-3"></i>
                        <h5>No logs found</h5>
                        <p>Try adjusting your filters or date range.</p>
                    </div>
                `;

            // Hide pagination
            const pagination = document.getElementById('logsPagination');
            if (pagination) pagination.style.display = 'none';
            return;
        }

        
        // Update pagination info
        logsTotalPages = data.pagination.pages || 1;
        const totalLogs = data.pagination.total || 0;
        
        // Display logs with compact preview
        const logsHtml = data.data.map(log => createCompactLogItem(log)).join('');
        container.innerHTML = logsHtml;
        
        // Attach click handlers to log items
        container.querySelectorAll('.log-item-compact').forEach(item => {
            item.addEventListener('click', function() {
                const logId = this.getAttribute('data-log-id');
                if (logId) {
                    showLogDetails(parseInt(logId));
                }
            });
        });
        
        // Update pagination controls
        updateLogsPagination(totalLogs);
        
        // Update last log timestamp

        if (data.data.length > 0 && isInitialLoad) {
            const latestLog = data.data[0];
            const logTime = new Date(latestLog.timestamp || latestLog.createdAt).getTime();
            if (!lastLogTimestamp || logTime > lastLogTimestamp) {
                lastLogTimestamp = logTime;
            }
        }
        

    } catch (error) {
        console.error('Error refreshing logs:', error);
        const container = document.getElementById('logsContainer');
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5 logs-empty-state">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>Error loading logs: ${error.message}</p>
                </div>
            `;
        }
    }
}

// Update pagination controls
function updateLogsPagination(totalLogs) {
    const pagination = document.getElementById('logsPagination');
    const paginationInfo = document.getElementById('logsPaginationInfo');
    const pageInfo = document.getElementById('logsPageInfo');
    const prevBtn = document.getElementById('logsPrevBtn');
    const nextBtn = document.getElementById('logsNextBtn');
    
    if (!pagination) return;
    
    pagination.style.display = 'flex';
    
    if (paginationInfo) {
        const start = (logsCurrentPage - 1) * 20 + 1;
        const end = Math.min(logsCurrentPage * 20, totalLogs);
        paginationInfo.textContent = `Showing ${start}-${end} of ${totalLogs} logs`;
    }
    
    if (pageInfo) {
        pageInfo.textContent = `Page ${logsCurrentPage} of ${logsTotalPages}`;
    }
    
    if (prevBtn) {
        prevBtn.disabled = logsCurrentPage <= 1;
    }
    
    if (nextBtn) {
        nextBtn.disabled = logsCurrentPage >= logsTotalPages;
    }
}

// Create compact log item HTML (preview only)
function createCompactLogItem(log) {
    const timestamp = new Date(log.timestamp || log.createdAt).toLocaleString();
    const directionItemClass = log.direction === 'Incoming' ? 'incoming' : 'outgoing';
    
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

            case 'Heartbeat': return 'fas fa-heartbeat';
            default: return 'fas fa-comment';
        }
    };
    

    const connectorText = (log.connectorId !== null && log.connectorId !== undefined && log.connectorId !== 0) 
        ? `Connector ${log.connectorId}` 
        : 'N/A';
    
    return `
        <div class="log-item-compact ${directionItemClass}" data-log-id="${log.id}" style="cursor: pointer;">
            <div class="log-item-compact-header">
                <div class="log-item-compact-message">
                    <i class="${getMessageIcon(log.message)}"></i>
                    <span>${log.message || 'Unknown'}</span>
                </div>
                <div class="log-item-compact-meta">
                    <span><i class="fas fa-clock"></i> ${timestamp}</span>
                    <span class="badge ${directionItemClass === 'incoming' ? 'badge-incoming' : 'badge-outgoing'}">${log.direction}</span>
                </div>
            </div>
            <div class="log-item-compact-info">
                <div class="log-item-compact-info-item">
                    <i class="fas fa-charging-station"></i>
                    <span>${log.deviceId || 'N/A'}</span>
                </div>
                ${log.messageId ? `
                <div class="log-item-compact-info-item">
                    <i class="fas fa-hashtag"></i>
                    <span style="font-family: monospace; font-size: 11px;">${log.messageId}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Show full log details in drawer
async function showLogDetails(logId) {
    try {
        const drawer = document.getElementById('logDrawer');
        const drawerContent = document.getElementById('logDrawerContent');
        
        if (!drawer || !drawerContent) return;
        
        // Open drawer if not already open
        openLogDrawer();
        
        // Show loading state
        drawerContent.textContent = 'Loading log details...';
        
        // Fetch full log details
        const response = await fetch(`/api/charger/data/log/${logId}`);
        const data = await response.json();
        
        if (!data.success || !data.log) {
            modalContent.textContent = 'Error: Log not found';
            return;
        }
        
        const log = data.log;
        
        // Format raw data
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

            rawData = log.raw;
        }
        
        // Build complete log object
    const fullLogData = {

            id: log.id,
        deviceId: log.deviceId || null,
        type: log.type || 'OCPP',
        connectorId: log.connectorId !== null && log.connectorId !== undefined ? log.connectorId : 0,
        messageId: log.messageId || null,
        message: log.message || 'Unknown',
        messageData: log.messageData !== null && log.messageData !== undefined ? log.messageData : {},
        raw: rawData !== null ? rawData : [],
        direction: log.direction || 'Unknown',

            timestamp: log.timestamp || log.createdAt,
            createdAt: log.createdAt,
            updatedAt: log.updatedAt
        };
        
        // Display formatted JSON
        drawerContent.textContent = JSON.stringify(fullLogData, null, 2);
        
    } catch (error) {
        console.error('Error loading log details:', error);
        const drawerContent = document.getElementById('logDrawerContent');
        if (drawerContent) {
            drawerContent.textContent = `Error: ${error.message}`;
        }
    }
}

// Make showLogDetails globally accessible
window.showLogDetails = showLogDetails;

// Get active transaction for a connector
// First checks ChargingSession table (most reliable), then falls back to OCPP logs
async function getActiveTransaction(deviceId, connectorId) {
    try {

        const normalizeDirection = (direction) => {
            if (!direction) return '';
            return direction.toString().trim().toLowerCase();
        };

        const isIncoming = (log) => normalizeDirection(log.direction) === 'incoming';
        const isOutgoing = (log) => normalizeDirection(log.direction) === 'outgoing';

        // Method 1: Check ChargingSession table (most reliable)
        try {
            const sessionsResponse = await fetch(`/api/charger/${encodeURIComponent(deviceId)}/active-sessions`);
            const sessionsData = await sessionsResponse.json();
            
            if (sessionsData.success && sessionsData.sessions && Array.isArray(sessionsData.sessions)) {
                // Find active session for this specific connector
                // Convert both to numbers for comparison to handle type mismatches
                const connectorIdNum = parseInt(connectorId);
                
                console.log(`🔍 Checking ${sessionsData.sessions.length} sessions for connector ${connectorId} (deviceId: ${deviceId})`);
                
                const activeSession = sessionsData.sessions.find(session => {
                    const sessionConnectorId = parseInt(session.connectorId);
                    const matchesConnector = sessionConnectorId === connectorIdNum;
                    const isActiveStatus = session.status === 'pending' || session.status === 'active';
                    const hasNoEndTime = !session.endTime;
                    const isNotStopped = session.status !== 'stopped' && session.status !== 'completed' && session.status !== 'cancelled';
                    
                    console.log(`  Session: connectorId=${sessionConnectorId}, status=${session.status}, endTime=${session.endTime}, matches=${matchesConnector && isActiveStatus && hasNoEndTime && isNotStopped}`);
                    
                    return matchesConnector && isActiveStatus && hasNoEndTime && isNotStopped;
                });
                
                if (activeSession) {
                    // Get transactionId from session
                    const transactionId = activeSession.transactionId || activeSession.transaction_id;
                    const sessionId = activeSession.sessionId || activeSession.session_id;
                    
                    // CRITICAL: Return transaction object even if transactionId is null
                    // This allows stop button to show, and stop function will re-fetch transactionId if needed
                    console.log(`✅ Found active session for connector ${connectorId}: transactionId=${transactionId || 'null'}, sessionId=${sessionId || 'null'}`);
                    return {
                        transactionId: transactionId || null, // Allow null - stop function will handle it
                        connectorId: connectorIdNum,
                        startTime: activeSession.startTime || activeSession.createdAt,
                        sessionId: sessionId || null // Include sessionId from ChargingSession
                    };
                } else {
                    console.log(`ℹ️ No active session found for connector ${connectorId} in ${sessionsData.sessions.length} sessions - falling back to OCPP logs`);
                }
            } else {
                console.log(`ℹ️ API returned invalid data - falling back to OCPP logs`);
            }
        } catch (apiError) {
            console.warn('Error fetching active sessions from API, falling back to logs:', apiError);
        }
        
        // Method 2: Fallback to OCPP logs parsing (for CMS/admin initiated charging)
        // This is important because CMS charging doesn't create ChargingSession records
        console.log(`🔍 Checking OCPP logs for active transaction (deviceId: ${deviceId}, connectorId: ${connectorId})`);
        const response = await fetch(`/api/charger/data?deviceId=${encodeURIComponent(deviceId)}&limit=2000`);
        const data = await response.json();
        
        if (!data.success || !data.data || !Array.isArray(data.data)) {

            console.log(`❌ Failed to fetch OCPP logs: success=${data.success}, data=${data.data ? 'exists' : 'null'}`);
            const pendingResult = getPendingTransaction(deviceId, connectorId);
            if (pendingResult) {
                return pendingResult;
            }
            return null;
        }

        
        console.log(`📊 Fetched ${data.data.length} OCPP log entries`);
        
        // Sort by timestamp (descending) to get latest first, then by id as tiebreaker
        data.data.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt).getTime();
            const timeB = new Date(b.timestamp || b.createdAt).getTime();
            if (timeB !== timeA) return timeB - timeA; // Latest first
            return (b.id || 0) - (a.id || 0); // Higher ID first
        });
        
        // Find all StartTransaction messages for this specific connector

        const connectorIdNum = parseInt(connectorId);
        const startTransactions = data.data.filter(log => {

            if ((log.message || '').toString() !== 'StartTransaction' || !isIncoming(log)) {
                return false;
            }
            // Check connectorId from various possible locations

            let logConnectorId = log.connectorId;
            if (logConnectorId === null || logConnectorId === undefined) {
                if (log.messageData && log.messageData.connectorId !== undefined) {
                    logConnectorId = log.messageData.connectorId;
                } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].connectorId !== undefined) {
                    logConnectorId = log.raw[2].connectorId;
                } else {
                    logConnectorId = 0;
                }
            }
            // Convert both to numbers for comparison
            const logConnectorIdNum = parseInt(logConnectorId);
            const matches = logConnectorIdNum === connectorIdNum;
            if (matches) {
                console.log(`  ✅ Found StartTransaction: connectorId=${logConnectorId} (parsed: ${logConnectorIdNum}), messageId=${log.messageId}`);
            }
            return matches;
        });
        
        console.log(`📋 Found ${startTransactions.length} StartTransaction messages for connector ${connectorId}`);
        
        if (startTransactions.length === 0) {
            // Debug: show what StartTransaction messages exist
            const allStartTransactions = data.data.filter(log => log.message === 'StartTransaction' && log.direction === 'Incoming');
            console.log(`  Total StartTransaction messages: ${allStartTransactions.length}`);
            allStartTransactions.slice(0, 3).forEach(log => {
            const logConnectorId = log.connectorId || 
                                  (log.messageData && log.messageData.connectorId) || 
                                  (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].connectorId) || 

                                      'unknown';
                console.log(`    - connectorId: ${logConnectorId}, timestamp: ${log.timestamp || log.createdAt}`);
            });
            const pendingResult = getPendingTransaction(deviceId, connectorId);
            if (pendingResult) {
                return pendingResult;
            }
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

        
        console.log(`📅 Latest StartTransaction: timestamp=${latestStart.timestamp || latestStart.createdAt}, messageId=${latestStart.messageId}`);
        
        // Check if StartTransaction is recent (within last 2 hours)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();

        console.log(`⏰ StartTransaction time: ${new Date(startTime).toISOString()}, 2 hours ago: ${twoHoursAgo.toISOString()}`);
        
        if (startTime < twoHoursAgo.getTime()) {

            console.log(`❌ StartTransaction is too old (${Math.round((Date.now() - startTime) / 60000)} minutes ago)`);
            return null; // Transaction is too old, consider it inactive
        }

        
        // CRITICAL: If StartTransaction is older than 15 minutes and there's no active ChargingSession,
        // be very strict - only show stop button if MeterValues are VERY recent (within 5 minutes)
        // This prevents false positives from old sessions
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        const isStartTransactionOld = startTime < fifteenMinutesAgo.getTime();
        if (isStartTransactionOld) {
            console.log(`⚠️ StartTransaction is older than 15 minutes (${Math.round((Date.now() - startTime) / 60000)} minutes ago) - will require very recent MeterValues`);
        }
        
        // Find the response to this StartTransaction (outgoing from server, same messageId)
        const startResponse = data.data.find(log => 

            (log.message || '') === 'Response' && 
            log.messageId === latestStart.messageId &&

            isOutgoing(log)
        );

        
        console.log(`🔍 Looking for Response to StartTransaction (messageId: ${latestStart.messageId}): ${startResponse ? 'Found' : 'Not found'}`);
        
        // Get transactionId - first try from response, then from StartTransaction itself
        let transactionId = null;
        if (startResponse) {

            console.log(`  Response found, checking for transactionId...`);
            if (startResponse.messageData && startResponse.messageData.transactionId) {
                transactionId = startResponse.messageData.transactionId;

                console.log(`  ✅ Found transactionId in messageData: ${transactionId}`);
            } else if (startResponse.raw && Array.isArray(startResponse.raw) && startResponse.raw[2] && startResponse.raw[2].transactionId) {
                transactionId = startResponse.raw[2].transactionId;
                console.log(`  ✅ Found transactionId in raw[2]: ${transactionId}`);
            } else {
                console.log(`  ⚠️ Response found but no transactionId in messageData or raw[2]`);
                console.log(`  Response structure:`, {
                    hasMessageData: !!startResponse.messageData,
                    hasRaw: !!startResponse.raw,
                    rawType: Array.isArray(startResponse.raw) ? 'array' : typeof startResponse.raw,
                    rawLength: Array.isArray(startResponse.raw) ? startResponse.raw.length : 'N/A'
                });
            }
        }
        
        // If not found in response, try to get from StartTransaction message itself

        if (!transactionId) {
            console.log(`  Trying to get transactionId from StartTransaction itself...`);
            if (latestStart.messageData && latestStart.messageData.transactionId) {
            transactionId = latestStart.messageData.transactionId;

                console.log(`  ✅ Found transactionId in StartTransaction.messageData: ${transactionId}`);
            } else if (latestStart.raw && Array.isArray(latestStart.raw)) {
            // Try to extract from raw OCPP message
            const payload = latestStart.raw[2];
            if (payload && payload.transactionId) {
                transactionId = payload.transactionId;

                    console.log(`  ✅ Found transactionId in StartTransaction.raw[2]: ${transactionId}`);
                } else {
                    console.log(`  ⚠️ StartTransaction.raw[2] exists but no transactionId:`, payload);
                }
            } else {
                console.log(`  ⚠️ No transactionId found in StartTransaction`);
            }
        }
        
        // CRITICAL FIX: Check for StopTransaction BEFORE returning transaction
        // Even if transactionId is null, check if there's a StopTransaction after StartTransaction
        // This prevents showing stop button for already-stopped sessions
        console.log(`🔍 Checking for StopTransaction after StartTransaction`);
        
        // Check for any StopTransaction for this connector after the StartTransaction
        let stopTransaction = null;
        if (latestStart) {
            const startTime = new Date(latestStart.timestamp || latestStart.createdAt).getTime();
            
            stopTransaction = data.data.find(log => {
                if ((log.message || '').toString() !== 'StopTransaction' || !isIncoming(log)) {
                    return false;
                }
                
                const logTime = new Date(log.timestamp || log.createdAt).getTime();
                if (logTime <= startTime) {
                    return false; // StopTransaction before StartTransaction, ignore
                }
                
                // Check connectorId match
                let logConnectorId = log.connectorId;
                if (logConnectorId === null || logConnectorId === undefined) {
                    if (log.messageData && log.messageData.connectorId !== undefined) {
                        logConnectorId = log.messageData.connectorId;
                    } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].connectorId !== undefined) {
                        logConnectorId = log.raw[2].connectorId;
                    } else {
                        logConnectorId = 0;
                    }
                }
                
                const logConnectorIdNum = parseInt(logConnectorId);
                if (logConnectorIdNum !== connectorIdNum) {
                    return false; // Different connector
                }
                
                // If we have transactionId, match it; otherwise, any StopTransaction after StartTransaction counts
                if (transactionId) {
                    let logTransactionId = null;
                    if (log.messageData && log.messageData.transactionId) {
                        logTransactionId = log.messageData.transactionId;
                    } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId) {
                        logTransactionId = log.raw[2].transactionId;
                    }
                    
                    if (logTransactionId && logTransactionId.toString() === transactionId.toString()) {
                        console.log(`  ⚠️ Found StopTransaction for transactionId ${transactionId} at ${new Date(logTime).toISOString()}`);
                        return true;
                    }
                } else {
                    // No transactionId, but StopTransaction exists after StartTransaction for this connector
                    // This is a valid stop - the session was stopped even without transactionId
                    console.log(`  ⚠️ Found StopTransaction after StartTransaction (no transactionId match needed) at ${new Date(logTime).toISOString()}`);
                    return true;
                }
                
                return false;
            });
        }
        
        if (stopTransaction) {
            const stopTime = new Date(stopTransaction.timestamp || stopTransaction.createdAt).getTime();
            console.log(`ℹ️ StopTransaction found after StartTransaction at ${new Date(stopTime).toISOString()} - session is stopped, not active`);
            return null; // Session is stopped, don't show stop button
        } else {
            console.log(`✅ No StopTransaction found after StartTransaction - checking if charging is actually active`);
        }
        
        if (!transactionId) {

            console.log(`⚠️ Could not extract transactionId from StartTransaction or Response - checking MeterValues and pending starts`);
            
            // CRITICAL: Since there's no active ChargingSession in database (we checked earlier),
            // we need to be VERY strict. Only show stop button if MeterValues are VERY recent (within 5 minutes)
            // This prevents false positives from old sessions
            const recentMeterValues = data.data.filter(log => {
                if ((log.message || '').toString() !== 'MeterValues' || !isIncoming(log)) {
                    return false;
                }
                
                let logConnectorId = log.connectorId;
                if (logConnectorId === null || logConnectorId === undefined) {
                    if (log.messageData && log.messageData.connectorId !== undefined) {
                        logConnectorId = log.messageData.connectorId;
                    } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].connectorId !== undefined) {
                        logConnectorId = log.raw[2].connectorId;
                    } else {
                        logConnectorId = 0;
                    }
                }
                
                return parseInt(logConnectorId) === connectorIdNum;
            });
            
            // Get most recent MeterValues
            if (recentMeterValues.length > 0) {
                const latestMeter = recentMeterValues.reduce((latest, current) => {
                    const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
                    const currentTime = new Date(current.timestamp || current.createdAt).getTime();
                    return currentTime > latestTime ? current : latest;
                });
                
                const meterTime = new Date(latestMeter.timestamp || latestMeter.createdAt).getTime();
                const startTime = latestStart ? new Date(latestStart.timestamp || latestStart.createdAt).getTime() : 0;
                
                // CRITICAL: Since no active ChargingSession exists, require VERY recent MeterValues (within 5 minutes)
                // This ensures we only show stop button for truly active charging
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).getTime();
                
                // MeterValues must be after StartTransaction and VERY recent (within 5 minutes)
                if (meterTime >= startTime && meterTime >= fiveMinutesAgo) {
                    // CRITICAL: Check if there's a StopTransaction AFTER the latest MeterValues
                    // If StopTransaction exists after MeterValues, charging has stopped
                    const stopAfterMeter = data.data.find(log => {
                        if ((log.message || '').toString() !== 'StopTransaction' || !isIncoming(log)) {
                            return false;
                        }
                        
                        const logTime = new Date(log.timestamp || log.createdAt).getTime();
                        if (logTime <= meterTime) {
                            return false; // StopTransaction before MeterValues, ignore
                        }
                        
                        // Check connectorId match
                        let logConnectorId = log.connectorId;
                        if (logConnectorId === null || logConnectorId === undefined) {
                            if (log.messageData && log.messageData.connectorId !== undefined) {
                                logConnectorId = log.messageData.connectorId;
                            } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].connectorId !== undefined) {
                                logConnectorId = log.raw[2].connectorId;
                            } else {
                                logConnectorId = 0;
                            }
                        }
                        
                        return parseInt(logConnectorId) === connectorIdNum;
                    });
                    
                    if (stopAfterMeter) {
                        console.log(`⚠️ Found StopTransaction after latest MeterValues - charging has stopped`);
                        return null; // Charging has stopped, don't show stop button
                    }
                    
                    // CRITICAL: Even with recent MeterValues, we need to verify there's actually an active session
                    // Check if there's a pending start (CMS-initiated) or if we can extract transactionId from MeterValues
                    let meterTransactionId = null;
                    if (latestMeter.messageData && latestMeter.messageData.transactionId) {
                        meterTransactionId = latestMeter.messageData.transactionId;
                    } else if (latestMeter.raw && Array.isArray(latestMeter.raw) && latestMeter.raw[2] && latestMeter.raw[2].transactionId) {
                        meterTransactionId = latestMeter.raw[2].transactionId;
                    }
                    
                    // CRITICAL: Before showing stop button, check if there's a StopTransaction for this transactionId
                    // This prevents showing stop button after charging has been stopped
                    if (meterTransactionId) {
                        const stopForThisTransaction = data.data.find(log => {
                            if ((log.message || '').toString() !== 'StopTransaction' || !isIncoming(log)) {
                                return false;
                            }
                            
                            let logTransactionId = null;
                            if (log.messageData && log.messageData.transactionId) {
                                logTransactionId = log.messageData.transactionId;
                            } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId) {
                                logTransactionId = log.raw[2].transactionId;
                            }
                            
                            return logTransactionId && logTransactionId.toString() === meterTransactionId.toString();
                        });
                        
                        if (stopForThisTransaction) {
                            const stopTime = new Date(stopForThisTransaction.timestamp || stopForThisTransaction.createdAt).getTime();
                            const meterTime = new Date(latestMeter.timestamp || latestMeter.createdAt).getTime();
                            
                            // If StopTransaction is after MeterValues, charging has stopped
                            if (stopTime > meterTime) {
                                console.log(`⚠️ Found StopTransaction (${stopTime}) after MeterValues (${meterTime}) for transactionId ${meterTransactionId} - charging has stopped`);
                                return null; // Don't show stop button
                            }
                        }
                    }
                    
                    // Only show stop button if we have a transactionId from MeterValues OR a pending start
                    const pendingKey = `${deviceId}_${connectorId}`;
                    const pendingEntry = pendingRemoteStarts.get(pendingKey);
                    
                    if (meterTransactionId || pendingEntry) {
                        console.log(`✅ Found VERY recent MeterValues (within 5 min) with transactionId=${meterTransactionId || 'pending'} and no StopTransaction after - charging is active`);
                        return {
                            transactionId: meterTransactionId ? parseInt(meterTransactionId) : null, // Use transactionId from MeterValues if available
                            connectorId: connectorId,
                            startTime: latestStart.timestamp || latestStart.createdAt,
                            sessionId: pendingEntry ? pendingEntry.sessionId : null
                        };
                    } else {
                        console.log(`⚠️ Found recent MeterValues but no transactionId and no pending start - not showing stop button`);
                    }
                } else {
                    const minutesAgo = Math.round((Date.now() - meterTime) / 60000);
                    console.log(`⚠️ MeterValues are too old (${minutesAgo} minutes ago, need within 5 min) - not showing stop button`);
                }
            } else {
                console.log(`⚠️ No MeterValues found for connector ${connectorId} - not showing stop button`);
            }
            
            // Check pending starts
            const pendingResult = getPendingTransaction(deviceId, connectorId);
            if (pendingResult) {
                console.log(`✅ Found pending transaction: ${pendingResult.transactionId}`);
                return pendingResult;
            }
            
            // No MeterValues and no pending - don't show stop button
            console.log(`⚠️ No MeterValues or pending transaction found - not showing stop button`);
            return null;
        }
        

        console.log(`🔍 Checking for StopTransaction with transactionId: ${transactionId}`);
        
        // Check for StopTransaction with same transactionId (if not already checked above)
        if (!stopTransaction && transactionId) {
            stopTransaction = data.data.find(log => {
                if ((log.message || '').toString() !== 'StopTransaction' || !isIncoming(log)) {
                    return false;
                }
                
                let logTransactionId = null;
                if (log.messageData && log.messageData.transactionId) {
                    logTransactionId = log.messageData.transactionId;
                } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].transactionId) {
                    logTransactionId = log.raw[2].transactionId;
                }
                
                // Compare as strings to handle type mismatches
                const matches = logTransactionId && (logTransactionId.toString() === transactionId.toString());
                if (matches) {
                    console.log(`  ⚠️ Found StopTransaction for transactionId ${transactionId}`);
                }
                return matches;
            });
        }
        
        let stopIsAfterStart = false;
        if (stopTransaction) {
            const stopTime = new Date(stopTransaction.timestamp || stopTransaction.createdAt).getTime();
            const startTimeMs = startTime;
            if (!isNaN(stopTime) && !isNaN(startTimeMs) && stopTime > startTimeMs) {
                stopIsAfterStart = true;
            } else {
                stopTransaction = null;
            }
        }

        // If no StopTransaction found after this start, transaction is active
        // CRITICAL FIX: Update pendingRemoteStarts with actual transactionId when found
        const pendingKey = `${deviceId}_${connectorId}`;
        if (pendingRemoteStarts.has(pendingKey)) {
            // Update the pending entry with the actual transactionId
            const pendingEntry = pendingRemoteStarts.get(pendingKey);
            pendingRemoteStarts.set(pendingKey, {
                ...pendingEntry,
                transactionId: transactionId // Update with real transactionId from StartTransaction
            });
            console.log(`✅ Updated pending start with transactionId: ${transactionId}`);
        }

        if (!stopTransaction) {

            console.log(`✅ Found active transaction from OCPP logs: transactionId=${transactionId}, connectorId=${connectorId}`);
            // Check if there's a pending start for this connector (CMS-initiated)
            const pendingKey = `${deviceId}_${connectorId}`;
            const pendingEntry = pendingRemoteStarts.get(pendingKey);
            const sessionId = pendingEntry ? pendingEntry.sessionId : null;
            
            // CRITICAL: Always return transaction object if transactionId is found
            // Even if transactionId is null/undefined, return the object so stop button shows
            // The stop function will re-fetch transactionId if needed
            return {

                transactionId: transactionId || null, // Allow null - stop function will handle it
                connectorId: connectorId,

                startTime: latestStart.timestamp || latestStart.createdAt,
                sessionId: sessionId // Include sessionId if available from pending starts
            };
        } else if (stopIsAfterStart) {
            console.log(`ℹ️ Transaction ${transactionId} has been stopped (StopTransaction found at ${stopTransaction.timestamp || stopTransaction.createdAt})`);
        }
        
        // Method 3: Check for recent StatusNotification with "Charging" status
        // CRITICAL FIX: Only use StatusNotification if there's also a StartTransaction or MeterValues
        // This prevents false positives from stale StatusNotification messages
        console.log(`🔍 Checking for recent StatusNotification with Charging status (deviceId: ${deviceId}, connectorId: ${connectorId})`);
        const statusNotifications = data.data.filter(log => {
            if ((log.message || '').toString() !== 'StatusNotification' || !isIncoming(log)) {
                return false;
            }
            let logConnectorId = log.connectorId;
            if (logConnectorId === null || logConnectorId === undefined) {
                if (log.messageData && log.messageData.connectorId !== undefined) {
                    logConnectorId = log.messageData.connectorId;
                } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].connectorId !== undefined) {
                    logConnectorId = log.raw[2].connectorId;
                } else {
                    logConnectorId = 0;
                }
            }
            const logConnectorIdNum = parseInt(logConnectorId);
            const matchesConnector = logConnectorIdNum === connectorIdNum;
            if (!matchesConnector) return false;
            
            // Check if status is "Charging"
            let status = null;
            if (log.messageData && log.messageData.status) {
                status = log.messageData.status;
            } else if (log.raw && Array.isArray(log.raw) && log.raw[2] && log.raw[2].status) {
                status = log.raw[2].status;
            }
            
            return status === 'Charging';
        });
        
        if (statusNotifications.length > 0) {
            // Get the most recent StatusNotification with Charging status
            const latestStatus = statusNotifications.reduce((latest, current) => {
                const latestTime = new Date(latest.timestamp || latest.createdAt).getTime();
                const currentTime = new Date(current.timestamp || current.createdAt).getTime();
                return currentTime > latestTime ? current : latest;
            });
            
            const statusTime = new Date(latestStatus.timestamp || latestStatus.createdAt).getTime();
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).getTime();
            
            if (statusTime >= twoHoursAgo) {
                // CRITICAL: Only use StatusNotification if there's also a StartTransaction or MeterValues
                // This prevents false positives from stale status messages
                const hasStartTransaction = data.data.some(log => {
                    if ((log.message || '').toString() !== 'StartTransaction' || !isIncoming(log)) return false;
                    const logConnectorId = log.connectorId || (log.messageData && log.messageData.connectorId) || 0;
                    return parseInt(logConnectorId) === connectorIdNum;
                });
                
                const hasMeterValues = data.data.some(log => {
                    if ((log.message || '').toString() !== 'MeterValues' || !isIncoming(log)) return false;
                    const logConnectorId = log.connectorId || (log.messageData && log.messageData.connectorId) || 0;
                    return parseInt(logConnectorId) === connectorIdNum;
                });
                
                if (hasStartTransaction || hasMeterValues) {
                    console.log(`✅ Found recent StatusNotification with Charging status AND StartTransaction/MeterValues for connector ${connectorId}`);
                    // Return a pseudo-transaction entry based on StatusNotification
                    return {
                        transactionId: `status-${connectorId}-${statusTime}`,
                        connectorId: connectorIdNum,
                        startTime: latestStatus.timestamp || latestStatus.createdAt,
                        fromStatusNotification: true
                    };
                } else {
                    console.log(`⚠️ StatusNotification shows Charging but no StartTransaction/MeterValues found - ignoring to prevent false positive`);
                }
            }
        }
        
        const pendingResult = getPendingTransaction(deviceId, connectorId);
        if (pendingResult) {
            return pendingResult;
        }
        return null;
    } catch (error) {
        console.error('Error getting active transaction:', error);

        const pendingResult = getPendingTransaction(deviceId, connectorId);
        if (pendingResult) {
            return pendingResult;
        }
        return null;
    }
}


function initCmsSocket() {
    if (cmsSocketInitialized) return;
    if (typeof io === 'undefined') {
        console.warn('[CMS Socket] socket.io client not available');
        return;
    }
    cmsSocket = io();
    cmsSocketInitialized = true;
    cmsSocket.emit('join-room', 'cms:points');
    cmsSocket.emit('join-room', 'cms:dashboard');

    cmsSocket.on('notification', (payload) => {
        if (!payload || !payload.type || !payload.data) return;
        if (!window.currentChargingPointDeviceId) return;
        if (payload.data.deviceId !== window.currentChargingPointDeviceId) return;

        if (payload.type === 'charging.remote.start.accepted') {
            const connectorId = payload.data.connectorId ?? 0;
            const key = `${payload.data.deviceId}_${connectorId}`;
            pendingRemoteStarts.set(key, {
                transactionId: payload.data.transactionId || payload.data.sessionId || `pending-${Date.now()}`,
                sessionId: payload.data.sessionId || null,
                timestamp: Date.now()
            });
            scheduleConnectorRefresh();
            return;
        }

        if (payload.type === 'charging.remote.stop.accepted') {
            const connectorId = payload.data.connectorId ?? 0;
            const key = `${payload.data.deviceId}_${connectorId}`;
            pendingRemoteStarts.delete(key);
            scheduleConnectorRefresh();
            return;
        }

        if (payload.type === 'meter.values.updated') {
            scheduleConnectorRefresh();
        }

        if (payload.type === 'charger.status.changed') {
            // StatusNotification received - refresh connectors to show updated status
            const connectorStatus = payload.data.status;
            if (connectorStatus === 'Charging' || connectorStatus === 'Available' || connectorStatus === 'Finishing') {
                scheduleConnectorRefresh(300);
            }
        }
    });
}

function scheduleConnectorRefresh(delay = 500) {
    if (pendingConnectorRefresh) {
        clearTimeout(pendingConnectorRefresh);
    }
    pendingConnectorRefresh = setTimeout(async () => {
        pendingConnectorRefresh = null;
        if (window.currentChargingPointId) {
            try {
                const pointResponse = await getChargingPoint(window.currentChargingPointId);
                if (pointResponse.success && pointResponse.point) {
                    await loadConnectorsTab(window.currentChargingPointId, pointResponse.point, false);
                }
            } catch (error) {
                console.error('Error refreshing connectors after notification:', error);
            }
        }
    }, delay);
}

function getPendingTransaction(deviceId, connectorId) {
    const pendingKey = `${deviceId}_${connectorId}`;
    const pendingEntry = pendingRemoteStarts.get(pendingKey);
    if (!pendingEntry) return null;
    const age = Date.now() - pendingEntry.timestamp;
    if (age < 5 * 60 * 1000) {
        // CRITICAL FIX: Only return pending transaction if it has a valid transactionId
        // If transactionId is still pending (starts with 'pending-'), return null
        // This prevents showing stop button before StartTransaction arrives
        const txId = pendingEntry.transactionId;
        if (txId && !txId.toString().startsWith('pending-') && !isNaN(parseInt(txId))) {
            return {
                transactionId: txId,
                connectorId,
                startTime: new Date(pendingEntry.timestamp).toISOString(),
                pending: false, // Has valid transactionId, not pending anymore
                sessionId: pendingEntry.sessionId
            };
        }
        // Still pending - return null so getActiveTransaction falls back to OCPP logs
        return null;
    }
    pendingRemoteStarts.delete(pendingKey);
    return null;
}

function markPendingStart(deviceId, connectorId, sessionId = null) {
    const pendingKey = `${deviceId}_${connectorId}`;
    // CRITICAL FIX: Store sessionId separately, transactionId will be updated when StartTransaction arrives
    // Initially set transactionId as pending marker - getActiveTransaction will find real transactionId from OCPP logs
    pendingRemoteStarts.set(pendingKey, {
        transactionId: `pending-${Date.now()}`, // Placeholder - will be replaced when StartTransaction arrives
        sessionId: sessionId || null, // Store actual sessionId from CMS start response
        timestamp: Date.now()
    });
    scheduleConnectorRefresh(200);
}

function clearPendingStart(deviceId, connectorId) {
    const pendingKey = `${deviceId}_${connectorId}`;
    pendingRemoteStarts.delete(pendingKey);
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
        

        const response = await fetch('/api/cms/charging/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                deviceId: deviceId,
                connectorId: connectorId,

                amount: 0,
                idTag: 'CMS_ADMIN'
            })
        });
        
        const data = await response.json();
        

        // Check both HTTP status and response success flag
        if (response.ok && data.success) {
            showSuccess('Charging started successfully!');

            markPendingStart(deviceId, connectorId, data.sessionId || null);
            // Reload connectors tab to update status after a short delay
            setTimeout(async () => {
                if (window.currentChargingPointId) {
                    const pointResponse = await getChargingPoint(window.currentChargingPointId);
                    if (pointResponse.success && pointResponse.point) {

                        await loadConnectorsTab(window.currentChargingPointId, pointResponse.point, false);
                    }
                }
            }, 2000); // Wait 2 seconds for StartTransaction to arrive
            // Also refresh again after 5 seconds to ensure it's updated
            setTimeout(async () => {
                if (window.currentChargingPointId) {
                    const pointResponse = await getChargingPoint(window.currentChargingPointId);
                    if (pointResponse.success && pointResponse.point) {
                        await loadConnectorsTab(window.currentChargingPointId, pointResponse.point, false);
                    }
                }
            }, 5000);
        } else {

            // Show error message from API or default message
            const errorMessage = data.error || `Failed to start charging (${response.status} ${response.statusText})`;
            console.error('Failed to start charging:', errorMessage, data);
            showError(errorMessage);
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

async function stopChargingFromDetail(deviceId, connectorId, transactionId, sessionId, button) {
    const lockKey = `${deviceId}_stop_${connectorId}`;
    if (chargingLocks.has(lockKey)) {
        return;
    }
    
    chargingLocks.add(lockKey);
    
    try {
        const originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Stopping...';
        

        // FAIL-SAFE: If transactionId looks invalid (not a number or empty), re-fetch active transaction
        let actualTransactionId = transactionId;
        let actualSessionId = sessionId;
        
        const parsedTxId = parseInt(transactionId);
        if (!transactionId || transactionId === '' || transactionId === 'null' || transactionId === 'undefined' || 
            isNaN(parsedTxId) || parsedTxId <= 0 || transactionId.toString().startsWith('pending-')) {
            console.log(`⚠️ [Stop Charging] Invalid transactionId "${transactionId}", re-fetching active transaction...`);
            try {
                const activeTransaction = await getActiveTransaction(deviceId, connectorId);
                if (activeTransaction && activeTransaction.transactionId) {
                    actualTransactionId = activeTransaction.transactionId;
                    actualSessionId = activeTransaction.sessionId || sessionId;
                    console.log(`✅ [Stop Charging] Re-fetched transactionId: ${actualTransactionId}, sessionId: ${actualSessionId}`);
                } else {
                    console.warn(`⚠️ [Stop Charging] Could not re-fetch transactionId, using original: ${transactionId}`);
                }
            } catch (refetchError) {
                console.error('Error re-fetching active transaction:', refetchError);
                // Continue with original values
            }
        }
        
        // Normalize empty strings to null for backend
        const normalizedTransactionId = (actualTransactionId === '' || actualTransactionId === 'null' || actualTransactionId === 'undefined') ? null : actualTransactionId;
        const normalizedSessionId = (actualSessionId === '' || actualSessionId === 'null' || actualSessionId === 'undefined') ? null : actualSessionId;
        
        console.log(`📤 [Stop Charging] Sending request: deviceId=${deviceId}, connectorId=${connectorId}, transactionId=${normalizedTransactionId}, sessionId=${normalizedSessionId}`);
        
        const response = await fetch('/api/cms/charging/stop', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                deviceId: deviceId,

                connectorId: connectorId, // Add connectorId for better lookup
                transactionId: normalizedTransactionId,
                sessionId: normalizedSessionId
            })
        });
        
        const data = await response.json();
        

        // Check both HTTP status and response success flag
        if (response.ok && data.success) {
            showSuccess('Charging stopped successfully!');

            clearPendingStart(deviceId, connectorId);
            // Reload connectors tab to update status after a short delay
            setTimeout(async () => {
                if (window.currentChargingPointId) {
                    const pointResponse = await getChargingPoint(window.currentChargingPointId);
                    if (pointResponse.success && pointResponse.point) {

                        await loadConnectorsTab(window.currentChargingPointId, pointResponse.point, false);
                    }
                }
            }, 3000); // Wait 3 seconds for StopTransaction to arrive and ChargingSession to update
            // Also refresh again after 8 seconds to ensure it's fully updated
            setTimeout(async () => {
                if (window.currentChargingPointId) {
                    const pointResponse = await getChargingPoint(window.currentChargingPointId);
                    if (pointResponse.success && pointResponse.point) {
                        await loadConnectorsTab(window.currentChargingPointId, pointResponse.point, false);
                    }
                }
            }, 8000);
        } else {

            // Show error message from API or default message
            const errorMessage = data.error || `Failed to stop charging (${response.status} ${response.statusText})`;
            console.error('Failed to stop charging:', errorMessage, data);
            showError(errorMessage);
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
    

    // If switching to sessions tab, load it
    if (tabName === 'sessions' && window.currentChargingPointId) {
        getChargingPoint(window.currentChargingPointId).then(response => {
            if (response.success && response.point && response.point.deviceId) {
                loadSessionsTab(window.currentChargingPointId, response.point.deviceId);
            }
        }).catch(error => {
            console.error('Error loading sessions on tab switch:', error);
        });
    }
    
    // If switching to connectors tab, load it
    if (tabName === 'connectors' && window.currentChargingPointId) {
        getChargingPoint(window.currentChargingPointId).then(response => {
            if (response.success && response.point) {
                const connectorsTab = document.getElementById('connectorsTab');

                if (connectorsTab) {
                    // Always reload to get latest status
                    loadConnectorsTab(window.currentChargingPointId, response.point, true);
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

    if (statusLower === 'charging') return 'status-charging';
    if (statusLower === 'faulted') return 'status-faulted';
    return 'status-offline';
}

function formatOrganization(org) {
    if (!org) return 'N/A';
    if (org === 'massive_mobility') return 'Massive Mobility';
    if (org === '1c_ev_charging') return '1C EV Charging';

    if (org === 'genx') return 'GenX';
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


// Sessions tab functions
window.switchSessionsSubTab = async function(subTab, deviceId) {
    // Update sub-tab UI
    document.querySelectorAll('.sessions-sub-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-subtab') === subTab) {
            tab.classList.add('active');
        }
    });
    
    // Update content visibility
    document.getElementById('activeSessionsContent').classList.remove('active');
    document.getElementById('completedSessionsContent').classList.remove('active');
    
    if (subTab === 'active') {
        document.getElementById('activeSessionsContent').classList.add('active');
    } else if (subTab === 'completed') {
        document.getElementById('completedSessionsContent').classList.add('active');
    }
    
    // Load the sub-tab data
    await loadSessionsSubTab(subTab, deviceId);
};

window.applyActiveSessionsFilters = async function(deviceId) {
    const searchInput = document.getElementById('activeSessionsSearch');
    if (searchInput) {
        sessionsState.active.search = searchInput.value.trim();
        sessionsState.active.page = 1; // Reset to first page
    }
    await loadActiveSessions(deviceId);
};

window.applyCompletedSessionsFilters = async function(deviceId) {
    const searchInput = document.getElementById('completedSessionsSearch');
    const fromDateInput = document.getElementById('completedSessionsFromDate');
    const toDateInput = document.getElementById('completedSessionsToDate');
    
    if (searchInput) {
        sessionsState.completed.search = searchInput.value.trim();
    }
    if (fromDateInput) {
        sessionsState.completed.fromDate = fromDateInput.value;
    }
    if (toDateInput) {
        sessionsState.completed.toDate = toDateInput.value;
    }
    sessionsState.completed.page = 1; // Reset to first page
    
    await loadCompletedSessionsForDevice(deviceId);
};

window.activeSessionsPrevPage = async function(deviceId) {
    if (sessionsState.active.page > 1) {
        sessionsState.active.page--;
        await loadActiveSessions(deviceId);
    }
};

window.activeSessionsNextPage = async function(deviceId) {
    sessionsState.active.page++;
    await loadActiveSessions(deviceId);
};

window.activeSessionsGoToPage = async function(page, deviceId) {
    sessionsState.active.page = page;
    await loadActiveSessions(deviceId);
};

window.completedSessionsPrevPage = async function(deviceId) {
    if (sessionsState.completed.page > 1) {
        sessionsState.completed.page--;
        await loadCompletedSessionsForDevice(deviceId);
    }
};

window.completedSessionsNextPage = async function(deviceId) {
    sessionsState.completed.page++;
    await loadCompletedSessionsForDevice(deviceId);
};

window.completedSessionsGoToPage = async function(page, deviceId) {
    sessionsState.completed.page = page;
    await loadCompletedSessionsForDevice(deviceId);
};
window.copyToClipboard = copyToClipboard;
window.downloadConnectorQR = downloadConnectorQR;
window.startChargingFromDetail = startChargingFromDetail;
window.stopChargingFromDetail = stopChargingFromDetail;
window.loadChargingPointsModule = loadChargingPointsModule;
// Store getActiveTransaction for this module (to avoid conflicts)
window.getActiveTransactionForPoint = getActiveTransaction;



