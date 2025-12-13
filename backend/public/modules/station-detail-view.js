// Station Detail View Module
import { getChargingStation, getStationChargingPoints } from '../services/api.js';
import { getActiveSessions, getCompletedSessions } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showSuccess, showWarning } from '../utils/notifications.js';
import { loadChargingStationsModule } from './charging-stations.js';

// Export function to load station detail view
export async function loadStationDetailView(stationId, activeTab = 'details') {
    try {
        // Normalize tab name: 'charging-points' from URL -> 'points' internally
        const normalizedTab = activeTab === 'charging-points' ? 'points' : activeTab;
        
        // Update global CMS state
        window.CMS_CURRENT_MODULE = 'charging-stations';
        window.CMS_CURRENT_STATION_ID = stationId;
        window.CMS_CURRENT_STATION_TAB = normalizedTab;
        
        // Ensure URL is clean (normalize if needed)
        const urlTabName = normalizedTab === 'points' ? 'charging-points' : normalizedTab;
        const expectedUrl = urlTabName === 'details'
            ? `/cms/charging-stations/${stationId}`
            : `/cms/charging-stations/${stationId}/${urlTabName}`;
        
        if (window.location.pathname !== expectedUrl) {
            window.history.replaceState({ module: 'charging-stations', stationId, tab: normalizedTab }, '', expectedUrl);
        }
        
        // Fetch station details
        const stationResponse = await getChargingStation(stationId);
        
        if (!stationResponse.success || !stationResponse.station) {
            showError('Failed to load station details');
            loadChargingStationsModule();
            return;
        }
        
        const station = stationResponse.station;
        const moduleContent = document.getElementById('moduleContent');
        
        // Create detail view HTML
        moduleContent.innerHTML = `
        <style>
            .station-detail-view {
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
            
            .station-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .station-header-left {
                flex: 1;
            }
            
            .station-name {
                font-size: 28px;
                font-weight: 700;
                color: var(--text-primary);
                margin: 0 0 8px 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .station-location {
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
            
            .status-active {
                background-color: #d4edda;
                color: #155724;
            }
            
            .status-inactive {
                background-color: #f8d7da;
                color: #721c24;
            }
            
            .status-maintenance {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .station-header-right {
                display: flex;
                gap: 12px;
            }
            
            .header-btn {
                padding: 10px 20px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s;
                border: none;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .btn-edit {
                background-color: #dc3545;
                color: white;
            }
            
            .btn-edit:hover {
                background-color: #c82333;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(220, 53, 69, 0.3);
            }
            
            .tabs-container {
                border-bottom: 2px solid var(--border-color);
                margin-bottom: 30px;
            }
            
            .tabs-list {
                display: flex;
                gap: 0;
                list-style: none;
                padding: 0;
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .tab-item {
                padding: 14px 24px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                color: var(--text-secondary);
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .tab-item:hover {
                color: var(--text-primary);
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
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 12px;
                padding: 24px;
                margin-bottom: 24px;
                box-shadow: 0 2px 4px var(--shadow);
            }
            
            .detail-card-title {
                font-size: 18px;
                font-weight: 600;
                color: var(--text-primary);
                margin: 0 0 20px 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .detail-card-title .map-btn {
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 12px;
                cursor: pointer;
                color: var(--text-secondary);
                transition: all 0.2s;
            }
            
            .detail-card-title .map-btn:hover {
                background: var(--hover-bg);
                color: var(--text-primary);
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
            
            .amenities-list {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
            }
            
            .amenity-badge {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                font-size: 14px;
                color: var(--text-primary);
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .amenity-badge:hover {
                background: var(--hover-bg);
                border-color: var(--border-color);
                transform: translateY(-1px);
            }
            
            .amenity-badge i {
                color: #007bff;
            }
            
            .gallery-images-container {
                width: 100%;
            }
            
            .gallery-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 20px;
                margin-top: 10px;
            }
            
            .gallery-item {
                position: relative;
                width: 100%;
                padding-top: 75%; /* 4:3 aspect ratio */
                border-radius: 8px;
                overflow: hidden;
                cursor: pointer;
                border: 1px solid var(--border-color);
                background-color: var(--bg-tertiary);
                transition: all 0.3s;
            }
            
            .gallery-item:hover {
                transform: translateY(-4px);
                box-shadow: 0 8px 16px rgba(0,0,0,0.15);
                border-color: #007bff;
            }
            
            .gallery-item img {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.3s;
            }
            
            .gallery-item:hover img {
                transform: scale(1.05);
            }
            
            .gallery-item-overlay {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                background: linear-gradient(to top, rgba(0,0,0,0.7), transparent);
                padding: 12px;
                opacity: 0;
                transition: opacity 0.3s;
            }
            
            .gallery-item:hover .gallery-item-overlay {
                opacity: 1;
            }
            
            .gallery-item-name {
                color: white;
                font-size: 13px;
                font-weight: 600;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }
            
            /* Gallery Modal */
            .gallery-modal {
                display: none;
                position: fixed;
                z-index: 99999;
                left: 0;
                top: 0;
                width: 100vw;
                height: 100vh;
                background-color: rgba(0,0,0,0.95);
                animation: fadeIn 0.3s;
                overflow: hidden;
            }
            
            .gallery-modal.active {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .gallery-modal-content {
                position: relative;
                max-width: 90vw;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
            }
            
            .gallery-modal-content img {
                max-width: 90vw;
                max-height: 80vh;
                width: auto;
                height: auto;
                object-fit: contain;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            }
            
            .gallery-modal-close {
                position: absolute;
                top: 20px;
                right: 20px;
                color: white;
                font-size: 24px;
                cursor: pointer;
                transition: all 0.3s;
                background-color: rgba(0,0,0,0.6);
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                z-index: 100000;
                border: 2px solid rgba(255,255,255,0.3);
                backdrop-filter: blur(10px);
            }
            
            .gallery-modal-close:hover {
                color: white;
                background-color: rgba(220, 53, 69, 0.9);
                border-color: rgba(255,255,255,0.5);
                transform: scale(1.1) rotate(90deg);
                box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
            }
            
            .gallery-modal-close i {
                font-size: 20px;
                line-height: 1;
            }
            
            .gallery-modal-title {
                color: white;
                font-size: 18px;
                font-weight: 600;
                margin-top: 20px;
                text-align: center;
                padding: 10px 20px;
                background-color: rgba(0,0,0,0.5);
                border-radius: 8px;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .table-wrapper {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 3px var(--shadow);
            }
            
            .table-scroll {
                overflow-x: auto;
                overflow-y: visible;
                max-width: 100%;
            }
            
            .table-scroll::-webkit-scrollbar {
                height: 8px;
            }
            
            .table-scroll::-webkit-scrollbar-track {
                background: var(--bg-tertiary);
            }
            
            .table-scroll::-webkit-scrollbar-thumb {
                background: var(--text-muted);
                border-radius: 4px;
            }
            
            .table-scroll::-webkit-scrollbar-thumb:hover {
                background: var(--text-secondary);
            }
            
            #pointsTable {
                width: 100%;
                min-width: 1200px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            #pointsTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] #pointsTable thead {
                background-color: #1a1a1a;
            }
            
            #pointsTable thead th {
                padding: 14px 12px;
                text-align: left;
                font-weight: 600;
                white-space: nowrap;
                border-right: 1px solid rgba(255,255,255,0.1);
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            #pointsTable tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            #pointsTable tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            #pointsTable tbody tr:hover {
                background-color: var(--hover-bg);
            }
            
            #pointsTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .status-badge {
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                white-space: nowrap;
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
            
            .c-status-badge {
                padding: 5px 12px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .c-status-available {
                background-color: #d4edda;
                color: #155724;
            }
            
            .c-status-charging {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .c-status-unavailable {
                background-color: #f8d7da;
                color: #721c24;
            }
            
            .c-status-faulted {
                background-color: #f8d7da;
                color: #721c24;
            }
            
            .loading-spinner {
                text-align: center;
                padding: 40px;
                color: var(--text-secondary);
            }
        </style>
        
        <div class="station-detail-view">
            <!-- Breadcrumb Navigation -->
            <div class="breadcrumb-nav">
                <a href="#" onclick="window.goBackToStationsList(); return false;">CHARGING STATIONS</a>
                <span class="separator">></span>
                <span>${station.stationId || stationId}</span>
            </div>
            
            <!-- Station Header -->
            <div class="station-header">
                <div class="station-header-left">
                    <h1 class="station-name">${station.stationName || 'N/A'}</h1>
                    <div class="station-location">${formatLocation(station)}</div>
                    <span class="status-badge-large ${getStatusClass(station.status)}">${station.status || 'N/A'}</span>
                </div>
                <div class="station-header-right">
                    <button class="header-btn btn-edit" onclick="window.editStationDetails('${stationId}')">
                        <i class="fas fa-edit me-2"></i>EDIT DETAILS
                    </button>
                </div>
            </div>
            
            <!-- Tabs -->
            <div class="tabs-container">
                <ul class="tabs-list">
                    <li class="tab-item ${activeTab === 'details' ? 'active' : ''}" data-tab="details" onclick="window.switchStationTab('details', '${stationId}')">DETAILS</li>
                    <li class="tab-item ${activeTab === 'points' ? 'active' : ''}" data-tab="points" onclick="window.switchStationTab('points', '${stationId}')">CHARGING POINTS</li>
                    <li class="tab-item ${activeTab === 'sessions' ? 'active' : ''}" data-tab="sessions" onclick="window.switchStationTab('sessions', '${stationId}')">SESSIONS</li>
                </ul>
            </div>
            
            <!-- Tab Contents -->
            <div id="tabContents">
                <!-- Details Tab (Overview and Details both show this) -->
                <div id="detailsTab" class="tab-content ${activeTab === 'details' ? 'active' : ''}">
                    ${generateDetailsTab(station)}
                </div>
                
                <!-- Charging Points Tab -->
                <div id="pointsTab" class="tab-content ${activeTab === 'points' ? 'active' : ''}">
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
            </div>
        </div>
        `;
        
        // If points tab is active, load it immediately
        if (activeTab === 'points') {
            // Load charging points tab (this will set up the table and load data)
            loadChargingPointsTab(stationId);
        } else if (activeTab === 'sessions') {
            // Load sessions tab
            loadStationSessionsTab(stationId);
        }
        // Note: We don't pre-load the points tab if details is active to avoid unnecessary API calls
        
        // Setup gallery modal functions only for detail page
        window.openGalleryImageModal = openGalleryImageModal;
        window.closeGalleryImageModal = closeGalleryImageModal;
        
    } catch (error) {
        console.error('Error loading station detail view:', error);
        showError(error.message || 'Failed to load station details');
        loadChargingStationsModule();
    }
}

// Helper function to format location
function formatLocation(station) {
    const parts = [];
    if (station.city) parts.push(station.city);
    if (station.state) parts.push(station.state);
    return parts.length > 0 ? parts.join(', ') : 'Location not available';
}

// Helper function to get status class
function getStatusClass(status) {
    if (!status) return 'status-offline';
    const statusLower = status.toLowerCase();
    if (statusLower === 'online') return 'status-online';
    if (statusLower === 'offline') return 'status-offline';
    // Fallback for old status values
    if (statusLower === 'active') return 'status-online';
    if (statusLower === 'inactive') return 'status-offline';
    if (statusLower === 'maintenance') return 'status-offline';
    return 'status-offline';
}

// Generate Details Tab HTML
function generateDetailsTab(station) {
    return `
        <!-- Specifications Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Specifications</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Station ID</span>
                    <span class="detail-value copyable" onclick="copyToClipboard('${station.stationId || ''}')">
                        ${station.stationId || 'N/A'}
                        <i class="fas fa-copy copy-icon"></i>
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Grid Connection Power Capacity</span>
                    <span class="detail-value">${station.powerCapacity ? station.powerCapacity + ' kW' : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Grid Phase</span>
                    <span class="detail-value">${formatGridPhase(station.gridPhase)}</span>
                </div>
            </div>
        </div>
        
        <!-- Location Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">
                Location
                <button class="map-btn" onclick="window.viewOnMap('${station.latitude || ''}', '${station.longitude || ''}')">
                    <i class="fas fa-eye me-1"></i>MAP
                </button>
            </h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Address</span>
                    <span class="detail-value">${station.fullAddress || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Pin Code</span>
                    <span class="detail-value">${station.pinCode || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">City/Town</span>
                    <span class="detail-value">${station.city || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">State</span>
                    <span class="detail-value">${station.state || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Country</span>
                    <span class="detail-value">${station.country || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Latitude</span>
                    <span class="detail-value">${station.latitude || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Longitude</span>
                    <span class="detail-value">${station.longitude || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <!-- Other Details Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Other Details</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Timings</span>
                    <span class="detail-value">${formatTimings(station.openingTime, station.closingTime)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Working Days</span>
                    <span class="detail-value">${formatWorkingDays(station.workingDays)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Contact Number</span>
                    <span class="detail-value">${station.contactNumber || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Created By</span>
                    <span class="detail-value">${station.createdBy || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Station Incharge</span>
                    <span class="detail-value">${station.inchargeName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Created At</span>
                    <span class="detail-value">${station.createdAt ? formatDate(station.createdAt) : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Last Modified</span>
                    <span class="detail-value">${station.updatedAt ? formatDate(station.updatedAt) : 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <!-- Amenities Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Amenities</h3>
            <div class="amenities-list" id="amenitiesList">
                ${generateAmenities(station.amenities)}
            </div>
        </div>
        
        <!-- Gallery Images Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Gallery Images</h3>
            <div class="gallery-images-container">
                ${generateGalleryImages(station.galleryImages)}
            </div>
        </div>
    `;
}

// Helper functions
function formatGridPhase(phase) {
    if (!phase) return 'N/A';
    return phase.charAt(0).toUpperCase() + phase.slice(1).replace('_', ' ');
}

function formatTimings(openingTime, closingTime) {
    if (!openingTime || !closingTime) return 'N/A';
    return `${formatTime(openingTime)} - ${formatTime(closingTime)}`;
}

function formatTime(time) {
    if (!time) return '';
    // Handle both time strings and Date objects
    if (typeof time === 'string') {
        const parts = time.split(':');
        if (parts.length >= 2) {
            const hours = parseInt(parts[0]);
            const minutes = parts[1];
            const period = hours >= 12 ? 'pm' : 'am';
            const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
            return `${displayHours}:${minutes} ${period}`;
        }
    }
    return time;
}

function formatWorkingDays(workingDays) {
    if (!workingDays || !Array.isArray(workingDays) || workingDays.length === 0) {
        return 'N/A';
    }
    
    const dayNames = {
        'sunday': 'Sunday',
        'monday': 'Monday',
        'tuesday': 'Tuesday',
        'wednesday': 'Wednesday',
        'thursday': 'Thursday',
        'friday': 'Friday',
        'saturday': 'Saturday'
    };
    
    if (workingDays.length === 7) {
        return 'All Days';
    }
    
    return workingDays.map(day => dayNames[day.toLowerCase()] || day).join(', ');
}

function generateAmenities(amenities) {
    if (!amenities || !Array.isArray(amenities) || amenities.length === 0) {
        return '<div style="color: #999; font-style: italic;">No amenities listed</div>';
    }
    
    const amenityIcons = {
        'mall': 'fa-shopping-bag',
        'restaurant': 'fa-utensils',
        'cafe': 'fa-coffee',
        'parking': 'fa-parking',
        'restroom': 'fa-restroom',
        'wifi': 'fa-wifi',
        'atm': 'fa-money-bill',
        'hospital': 'fa-hospital',
        'hotel': 'fa-hotel'
    };
    
    return amenities.map(amenity => {
        const amenityLower = amenity.toLowerCase();
        const icon = amenityIcons[amenityLower] || 'fa-map-marker-alt';
        return `
            <div class="amenity-badge">
                <i class="fas ${icon}"></i>
                <span>${amenity}</span>
            </div>
        `;
    }).join('');
}

function generateGalleryImages(galleryImages) {
    if (!galleryImages || !Array.isArray(galleryImages) || galleryImages.length === 0) {
        return '<div style="color: #999; font-style: italic; text-align: center; padding: 40px;">No gallery images available</div>';
    }
    
    return `
        <div class="gallery-grid">
            ${galleryImages.map((img, index) => `
                <div class="gallery-item">
                    <img src="${img.path}" alt="${img.name || `Gallery Image ${index + 1}`}" 
                         onclick="openGalleryImageModal('${img.path}', '${(img.name || `Image ${index + 1}`).replace(/'/g, "\\'")}')"
                         onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'200\\' height=\\'200\\'%3E%3Crect fill=\\'%23ddd\\' width=\\'200\\' height=\\'200\\'/%3E%3Ctext fill=\\'%23999\\' font-family=\\'sans-serif\\' font-size=\\'14\\' dy=\\'10.5\\' font-weight=\\'bold\\' x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\'%3EImage not found%3C/text%3E%3C/svg%3E';">
                    <div class="gallery-item-overlay">
                        <div class="gallery-item-name">${img.name || `Image ${index + 1}`}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Helper function to get C.STATUS badge class
function getCStatusClass(cStatus) {
    if (!cStatus) return 'c-status-unavailable';
    const statusLower = cStatus.toLowerCase();
    if (statusLower === 'available') return 'c-status-available';
    if (statusLower === 'charging') return 'c-status-charging';
    if (statusLower === 'faulted') return 'c-status-faulted';
    return 'c-status-unavailable';
}

// Gallery Modal Functions - Only available on station detail page
function openGalleryImageModal(imagePath, imageName) {
    // Check if we're on the detail page
    const moduleContent = document.getElementById('moduleContent');
    if (!moduleContent || !moduleContent.querySelector('.station-detail-view')) {
        console.warn('Gallery modal can only be opened from station detail page');
        return;
    }
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    
    // Create modal if it doesn't exist
    let modal = document.getElementById('galleryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'galleryModal';
        modal.className = 'gallery-modal';
        modal.innerHTML = `
            <div class="gallery-modal-content">
                <button class="gallery-modal-close" onclick="closeGalleryImageModal()" type="button" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
                <img id="galleryModalImage" src="" alt="">
                <div class="gallery-modal-title" id="galleryModalTitle"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Don't close on background click - only X button closes
        // Prevent clicks on modal background from closing
        modal.addEventListener('click', (e) => {
            // Only allow clicks on the close button to work
            // Don't close on background click
            e.stopPropagation();
        });
    }
    
    // Set image and title
    const imgElement = document.getElementById('galleryModalImage');
    const titleElement = document.getElementById('galleryModalTitle');
    
    if (imgElement) {
        imgElement.src = imagePath;
        imgElement.onerror = function() {
            this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="16" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3EImage not found%3C/text%3E%3C/svg%3E';
        };
    }
    
    if (titleElement) {
        titleElement.textContent = imageName;
    }
    
    // Show modal
    modal.classList.add('active');
}

function closeGalleryImageModal() {
    const modal = document.getElementById('galleryModal');
    if (modal) {
        modal.classList.remove('active');
        // Don't remove the modal from DOM, just hide it
        // This way it can be reused if needed
    }
    // Restore body scroll
    document.body.style.overflow = '';
}

// Gallery modal functions will be set up only when detail view loads

// Global variable to track refresh interval for charging points tab
let stationPointsRefreshInterval = null;
let currentStationIdForRefresh = null;

// Load Charging Points Tab
async function loadChargingPointsTab(stationId) {
    try {
        // Clear any existing refresh interval
        if (stationPointsRefreshInterval) {
            clearInterval(stationPointsRefreshInterval);
            stationPointsRefreshInterval = null;
        }
        
        currentStationIdForRefresh = stationId;
        
        // Load initial data
        await refreshChargingPointsTab(stationId);
        
        // Set up auto-refresh every 3 seconds
        stationPointsRefreshInterval = setInterval(() => {
            const activeTab = document.querySelector('.tab-item.active');
            if (activeTab && activeTab.getAttribute('data-tab') === 'points') {
                refreshChargingPointsTab(stationId);
            }
        }, 3000);
        
        // Set up Socket.io listener for real-time status updates
        if (typeof io !== 'undefined') {
            const socket = io();
            socket.emit('join-room', 'cms:stations');
            
            socket.on('notification', (payload) => {
                if (!payload || !payload.type || !payload.data) return;
                
                // Refresh charging points tab when status changes
                if (payload.type === 'charger.status.changed' || 
                    payload.type === 'charging.remote.start.accepted' || 
                    payload.type === 'charging.remote.stop.accepted' ||
                    payload.type === 'meter.values.updated') {
                    const activeTab = document.querySelector('.tab-item.active');
                    if (activeTab && activeTab.getAttribute('data-tab') === 'points') {
                        refreshChargingPointsTab(stationId);
                    }
                }
            });
        }
        
    } catch (error) {
        console.error('Error loading charging points:', error);
        const pointsTab = document.getElementById('pointsTab');
        if (pointsTab) {
            pointsTab.innerHTML = `
                <div class="detail-card">
                    <div style="text-align: center; padding: 40px; color: #dc3545;">
                        Error loading charging points: ${error.message || 'Please try again.'}
                    </div>
                </div>
            `;
        }
    }
}

// Refresh Charging Points Tab (updates table body only)
async function refreshChargingPointsTab(stationId) {
    try {
        const data = await getStationChargingPoints(stationId, { page: 1, limit: 100 });
        
        const pointsTableBody = document.getElementById('pointsTableBody');
        if (!pointsTableBody) {
            // If table body doesn't exist, reload the entire tab
            const pointsTab = document.getElementById('pointsTab');
            if (!pointsTab) return;
            
            if (!data.points || data.points.length === 0) {
                pointsTab.innerHTML = `
                    <div class="detail-card">
                        <div style="text-align: center; padding: 40px; color: #999;">
                            No charging points found for this station.
                        </div>
                    </div>
                `;
                return;
            }
            
            pointsTab.innerHTML = `
                <div class="table-wrapper">
                    <div class="table-scroll">
                        <table id="pointsTable">
                            <thead>
                                <tr>
                                    <th>S.NO</th>
                                    <th>Charging Point</th>
                                    <th>Device ID</th>
                                    <th>Status</th>
                                    <th>C. Status</th>
                                    <th>Charger Type</th>
                                    <th>Connectors</th>
                                    <th>Max Power (kWh)</th>
                                    <th>Sessions*</th>
                                    <th>Billed Amount* (₹)</th>
                                    <th>Energy* (kWh)</th>
                                    <th>Created At</th>
                                </tr>
                            </thead>
                            <tbody id="pointsTableBody">
                                ${data.points.map((point, index) => {
                                    const serialNo = index + 1;
                                    const statusClass = point.status === 'Online' ? 'status-online' : 'status-offline';
                                    const createdAt = formatDate(point.createdAt);
                                    return `
                                        <tr>
                                            <td>${serialNo}</td>
                                            <td><a href="#" onclick="window.viewPointFromStation('${point.chargingPointId || point.id}'); return false;">${point.chargingPoint || 'N/A'}</a></td>
                                            <td>${point.deviceId || 'N/A'}</td>
                                    <td><span class="status-badge ${statusClass}">${point.status || 'N/A'}</span></td>
                                    <td><span class="c-status-badge ${getCStatusClass(point.cStatus)}">${point.cStatus || 'N/A'}</span></td>
                                            <td>${point.chargerType || 'N/A'}</td>
                                            <td>${point.connectors || 0}</td>
                                            <td>${point.maxPower || 0}</td>
                                            <td>${point.sessions || 0}</td>
                                            <td>${(point.billedAmount || 0).toFixed(2)}</td>
                                            <td>${(point.energy || 0).toFixed(2)}</td>
                                            <td>${createdAt}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            return;
        }
        
        // Update table body only (preserves scroll position)
        if (!data.points || data.points.length === 0) {
            pointsTableBody.innerHTML = '';
            return;
        }
        
        pointsTableBody.innerHTML = data.points.map((point, index) => {
            const serialNo = index + 1;
            const statusClass = point.status === 'Online' ? 'status-online' : 'status-offline';
            const createdAt = formatDate(point.createdAt);
            return `
                <tr>
                    <td>${serialNo}</td>
                    <td><a href="#" onclick="window.viewPointFromStation('${point.chargingPointId || point.id}'); return false;">${point.chargingPoint || 'N/A'}</a></td>
                    <td>${point.deviceId || 'N/A'}</td>
                    <td><span class="status-badge ${statusClass}">${point.status || 'N/A'}</span></td>
                    <td><span class="c-status-badge ${getCStatusClass(point.cStatus)}">${point.cStatus || 'N/A'}</span></td>
                    <td>${point.chargerType || 'N/A'}</td>
                    <td>${point.connectors || 0}</td>
                    <td>${point.maxPower || 0}</td>
                    <td>${point.sessions || 0}</td>
                    <td>${(point.billedAmount || 0).toFixed(2)}</td>
                    <td>${(point.energy || 0).toFixed(2)}</td>
                    <td>${createdAt}</td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error refreshing charging points:', error);
        // Don't show error on every refresh, only log it
    }
}

// Switch Tab Function
export function switchStationTab(tabName, stationId) {
    // Map internal tab names to URL tab names
    // 'points' -> 'charging-points' for URL
    const urlTabName = tabName === 'points' ? 'charging-points' : tabName;
    
    // Use clean URL format
    const url = urlTabName === 'details' 
        ? `/cms/charging-stations/${stationId}`
        : `/cms/charging-stations/${stationId}/${urlTabName}`;
    
    window.history.pushState({ module: 'charging-stations', stationId: stationId, tab: tabName }, '', url);
    
    // Update global CMS state
    window.CMS_CURRENT_STATION_TAB = tabName;
    
    // Clear refresh interval when switching tabs
    if (stationPointsRefreshInterval) {
        clearInterval(stationPointsRefreshInterval);
        stationPointsRefreshInterval = null;
    }
    
    // Update tab items
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabName.toLowerCase()) {
            item.classList.add('active');
        }
    });
    
    // Update tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Show corresponding content
    if (tabName === 'details') {
        document.getElementById('detailsTab')?.classList.add('active');
    } else if (tabName === 'points') {
        document.getElementById('pointsTab')?.classList.add('active');
        loadChargingPointsTab(stationId);
    } else if (tabName === 'sessions') {
        document.getElementById('sessionsTab')?.classList.add('active');
        loadStationSessionsTab(stationId);
    }
}

// Copy to Clipboard Function
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Copied to clipboard!');
    }).catch(() => {
        showError('Failed to copy');
    });
}

// Edit Station Details
export function editStationDetails(stationId) {
    // Push state for edit view
    const url = `/cms?module=charging-stations&station=${stationId}&action=edit`;
    window.history.pushState({ module: 'charging-stations', stationId: stationId, view: 'edit' }, '', url);
    
    // Import and call edit station function
    import('./charging-stations.js').then(module => {
        module.editStation(stationId);
    }).catch(error => {
        console.error('Error loading edit station:', error);
        showError('Error loading edit form');
    });
}

// View on Map (placeholder)
export function viewOnMap(latitude, longitude) {
    if (!latitude || !longitude) {
        showWarning('Location coordinates not available');
        return;
    }
    // Open Google Maps
    window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, '_blank');
}

// Go back to stations list
export function goBackToStationsList() {
    // Clear refresh interval when navigating away
    if (stationPointsRefreshInterval) {
        clearInterval(stationPointsRefreshInterval);
        stationPointsRefreshInterval = null;
    }
    
    // Remove gallery modal functions when leaving detail page
    if (window.openGalleryImageModal) {
        delete window.openGalleryImageModal;
    }
    if (window.closeGalleryImageModal) {
        delete window.closeGalleryImageModal;
    }
    // Remove modal from DOM completely when leaving detail page
    const modal = document.getElementById('galleryModal');
    if (modal) {
        modal.classList.remove('active');
        modal.remove(); // Remove from DOM completely
        document.body.style.overflow = '';
    }
    
    // Use clean URL for stations list (this will restart the auto-refresh)
    const url = `/cms/charging-stations`;
    window.history.pushState({ module: 'charging-stations' }, '', url);
    
    // Update global CMS state
    window.CMS_CURRENT_MODULE = 'charging-stations';
    window.CMS_CURRENT_STATION_ID = null;
    window.CMS_CURRENT_STATION_TAB = null;
    
    loadChargingStationsModule();
}

// View charging point from station detail
async function viewPointFromStation(chargingPointId) {
    // Use clean URL for point detail view (default to details tab)
    const url = `/cms/charging-points/${chargingPointId}/details`;
    window.history.pushState({ module: 'charging-points', chargingPointId: chargingPointId, view: 'detail', tab: 'details' }, '', url);
    
    // Update global CMS state
    window.CMS_CURRENT_MODULE = 'charging-points';
    window.CMS_CURRENT_POINT_ID = chargingPointId;
    window.CMS_CURRENT_POINT_TAB = 'details';
    
    // Dynamically import and load charging point detail view (default to details tab)
    try {
        const detailModule = await import('./charging-point-detail-view.js');
        window.currentChargingPointId = chargingPointId; // Store for reloading
        detailModule.loadChargingPointDetailView(chargingPointId, 'details');
    } catch (error) {
        console.error('Error loading charging point detail view:', error);
        showError(error.message || 'Failed to load charging point details');
    }
}

// Load Station Sessions Tab
let currentStationSessionsId = null;
let currentStationSessionsSubTab = 'active'; // 'active' or 'completed'
let stationSessionsState = {
    active: { page: 1, limit: 10, search: '' },
    completed: { page: 1, limit: 10, search: '', fromDate: '', toDate: '' }
};

async function loadStationSessionsTab(stationId) {
    try {
        const sessionsTab = document.getElementById('sessionsTab');
        if (!sessionsTab) return;
        
        currentStationSessionsId = stationId;
        
        // Get all charging points for this station to get deviceIds
        const pointsResponse = await getStationChargingPoints(stationId, { page: 1, limit: 1000 });
        const deviceIds = pointsResponse.points ? pointsResponse.points.map(p => p.deviceId).filter(Boolean) : [];
        
        // Render sessions UI with sub-tabs
        renderStationSessionsUI(stationId, deviceIds);
        
        // Load initial sub-tab (active sessions)
        await loadStationSessionsSubTab('active', stationId, deviceIds);
        
    } catch (error) {
        console.error('Error loading station sessions tab:', error);
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

// Render station sessions UI with sub-tabs
function renderStationSessionsUI(stationId, deviceIds) {
    const sessionsTab = document.getElementById('sessionsTab');
    sessionsTab.innerHTML = `
        <style>
            .station-sessions-sub-tabs {
                display: flex;
                gap: 0;
                margin-bottom: 20px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .station-sessions-sub-tab {
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
            
            .station-sessions-sub-tab:hover {
                color: #dc3545;
                background-color: var(--bg-tertiary);
            }
            
            .station-sessions-sub-tab.active {
                color: #dc3545;
                border-bottom: 3px solid #dc3545;
            }
            
            .station-sessions-sub-tab.active::after {
                content: '';
                position: absolute;
                bottom: -2px;
                left: 0;
                right: 0;
                height: 3px;
                background-color: #dc3545;
            }
            
            .station-sessions-empty-state {
                text-align: center;
                padding: 60px 20px;
            }
            
            .station-sessions-empty-state i {
                font-size: 64px;
                color: var(--text-secondary);
                margin-bottom: 20px;
                display: block;
                opacity: 0.7;
            }
            
            .station-sessions-empty-state h5 {
                font-size: 16px;
                font-weight: 500;
                color: var(--text-secondary);
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .station-sessions-empty-state p {
                color: var(--text-secondary);
            }
            
            .station-sessions-loading-state {
                text-align: center;
                padding: 60px 20px;
            }
            
            .station-sessions-loading-state i {
                font-size: 32px;
                color: var(--text-secondary);
                margin-bottom: 15px;
                display: block;
            }
            
            .station-sessions-loading-state p {
                font-size: 14px;
                font-weight: 500;
                color: var(--text-secondary);
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .station-sessions-content {
                display: none;
            }
            
            .station-sessions-content.active {
                display: block;
            }
            
            .station-sessions-filters {
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
            
            .station-sessions-search-input {
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
            
            .station-sessions-date-group {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .station-sessions-date-input {
                padding: 10px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .station-sessions-date-input::-webkit-calendar-picker-indicator {
                filter: invert(0);
                cursor: pointer;
            }
            
            [data-theme="dark"] .station-sessions-date-input::-webkit-calendar-picker-indicator {
                filter: invert(1);
            }
            
            .station-sessions-apply-btn {
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
            
            .station-sessions-apply-btn:hover {
                background-color: #23272b;
            }
            
            .station-sessions-table-wrapper {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 3px var(--shadow);
            }
            
            .station-sessions-table-scroll {
                overflow-x: auto;
                overflow-y: visible;
                max-width: 100%;
            }
            
            .station-sessions-table-scroll::-webkit-scrollbar {
                height: 8px;
            }
            
            .station-sessions-table-scroll::-webkit-scrollbar-track {
                background: var(--bg-tertiary);
            }
            
            .station-sessions-table-scroll::-webkit-scrollbar-thumb {
                background: var(--text-muted);
                border-radius: 4px;
            }
            
            .station-sessions-table-scroll::-webkit-scrollbar-thumb:hover {
                background: var(--text-secondary);
            }
            
            .station-sessions-table {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .station-sessions-table thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] .station-sessions-table thead {
                background-color: #1a1a1a;
            }
            
            .station-sessions-table thead th {
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
            
            .station-sessions-table thead th:last-child {
                border-right: none;
            }
            
            .station-sessions-table tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            .station-sessions-table tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            .station-sessions-table tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .station-sessions-table tbody td:last-child {
                border-right: none;
            }
            
            .station-sessions-table tbody td a {
                color: var(--text-primary);
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            .station-sessions-table tbody td a:hover {
                color: #007bff;
                text-decoration: underline;
            }
            
            .station-sessions-pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 20px;
                padding: 15px;
                background-color: var(--bg-tertiary);
                border-radius: 8px;
            }
            
            .station-sessions-pagination-info {
                font-size: 14px;
                color: var(--text-secondary);
            }
            
            .station-sessions-pagination-controls {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .station-sessions-pagination-btn {
                padding: 8px 16px;
                border: 1px solid var(--border-color);
                background: var(--card-bg);
                color: var(--text-primary);
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .station-sessions-pagination-btn:hover:not(:disabled) {
                background-color: #f8f9fa;
            }
            
            .station-sessions-pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .station-sessions-pagination-btn.active {
                background-color: #dc3545;
                color: white;
                border-color: #dc3545;
            }
        </style>
        
        <div class="station-sessions-sub-tabs">
            <button class="station-sessions-sub-tab active" data-subtab="active" onclick="window.switchStationSessionsSubTab('active', '${stationId}')">ACTIVE</button>
            <button class="station-sessions-sub-tab" data-subtab="completed" onclick="window.switchStationSessionsSubTab('completed', '${stationId}')">COMPLETED</button>
        </div>
        
        <!-- Active Sessions Content -->
        <div id="stationActiveSessionsContent" class="station-sessions-content active">
            <div class="station-sessions-filters">
                <input type="text" id="stationActiveSessionsSearch" class="station-sessions-search-input" placeholder="Search by Device ID, Transaction ID, Session ID..." 
                       onkeyup="if(event.key==='Enter') window.applyStationActiveSessionsFilters('${stationId}')">
                <button class="station-sessions-apply-btn" onclick="window.applyStationActiveSessionsFilters('${stationId}')">SEARCH</button>
            </div>
            <div id="stationActiveSessionsTableContainer">
                <div class="station-sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            </div>
            <div id="stationActiveSessionsPagination" class="station-sessions-pagination" style="display: none;"></div>
        </div>
        
        <!-- Completed Sessions Content -->
        <div id="stationCompletedSessionsContent" class="station-sessions-content">
            <div class="station-sessions-filters">
                <input type="text" id="stationCompletedSessionsSearch" class="station-sessions-search-input" placeholder="Search by Device ID, Transaction ID, Session ID..." 
                       onkeyup="if(event.key==='Enter') window.applyStationCompletedSessionsFilters('${stationId}')">
                <div class="station-sessions-date-group">
                    <input type="date" id="stationCompletedSessionsFromDate" class="station-sessions-date-input" placeholder="From Date">
                    <input type="date" id="stationCompletedSessionsToDate" class="station-sessions-date-input" placeholder="To Date">
                </div>
                <button class="station-sessions-apply-btn" onclick="window.applyStationCompletedSessionsFilters('${stationId}')">APPLY</button>
            </div>
            <div id="stationCompletedSessionsTableContainer">
                <div class="station-sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            </div>
            <div id="stationCompletedSessionsPagination" class="station-sessions-pagination" style="display: none;"></div>
        </div>
    `;
    
    // Store deviceIds for filtering
    window.currentStationDeviceIds = deviceIds;
    
    // Attach event listeners
    attachStationSessionsEventListeners();
}

// Attach event listeners for station sessions
function attachStationSessionsEventListeners() {
    // Set initial filter values
    const activeSearch = document.getElementById('stationActiveSessionsSearch');
    const completedSearch = document.getElementById('stationCompletedSessionsSearch');
    const fromDate = document.getElementById('stationCompletedSessionsFromDate');
    const toDate = document.getElementById('stationCompletedSessionsToDate');
    
    if (activeSearch) activeSearch.value = stationSessionsState.active.search || '';
    if (completedSearch) completedSearch.value = stationSessionsState.completed.search || '';
    if (fromDate) fromDate.value = stationSessionsState.completed.fromDate || '';
    if (toDate) toDate.value = stationSessionsState.completed.toDate || '';
}

// Load station sessions sub-tab
async function loadStationSessionsSubTab(subTab, stationId, deviceIds) {
    try {
        currentStationSessionsSubTab = subTab;
        
        if (subTab === 'active') {
            await loadStationActiveSessions(stationId, deviceIds);
        } else if (subTab === 'completed') {
            await loadStationCompletedSessions(stationId, deviceIds);
        }
    } catch (error) {
        console.error(`Error loading ${subTab} sessions:`, error);
        const container = document.getElementById(`station${subTab.charAt(0).toUpperCase() + subTab.slice(1)}SessionsTableContainer`);
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

// Load active sessions for station
async function loadStationActiveSessions(stationId, deviceIds) {
    try {
        const container = document.getElementById('stationActiveSessionsTableContainer');
        if (!container) return;
        
            container.innerHTML = `
                <div class="station-sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            `;
        
        const state = stationSessionsState.active;
        
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
        
        const response = {
            success: true,
            sessions: allSessions
        };
        
        if (!response.success || !response.sessions) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No sessions found</h5>
                </div>
            `;
            return;
        }
        
        // Filter by deviceIds (all charging points in this station)
        let filteredSessions = response.sessions.filter(session => 
            session.deviceId && deviceIds.some(id => id.toLowerCase() === session.deviceId.toLowerCase())
        );
        
        // Apply search filter if provided
        if (state.search) {
            const searchLower = state.search.toLowerCase();
            filteredSessions = filteredSessions.filter(session => 
                (session.deviceId && session.deviceId.toLowerCase().includes(searchLower)) ||
                (session.transactionId && session.transactionId.toString().toLowerCase().includes(searchLower)) ||
                (session.sessionId && session.sessionId.toLowerCase().includes(searchLower))
            );
        }
        
        if (filteredSessions.length === 0) {
            container.innerHTML = `
                <div class="station-sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No active sessions found for this station</h5>
                </div>
            `;
            document.getElementById('stationActiveSessionsPagination').style.display = 'none';
            return;
        }
        
        // Client-side pagination
        const totalPages = Math.ceil(filteredSessions.length / state.limit);
        const paginatedSessions = filteredSessions.slice((state.page - 1) * state.limit, state.page * state.limit);
        
        // Display sessions (sessions, page, limit, total)
        displayStationActiveSessions(paginatedSessions, state.page, state.limit, filteredSessions.length);
        
    } catch (error) {
        console.error('Error loading station active sessions:', error);
        const container = document.getElementById('stationActiveSessionsTableContainer');
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

// Load completed sessions for station
async function loadStationCompletedSessions(stationId, deviceIds) {
    try {
        const container = document.getElementById('stationCompletedSessionsTableContainer');
        if (!container) return;
        
            container.innerHTML = `
                <div class="station-sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            `;
        
        const state = stationSessionsState.completed;
        
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
        
        const response = {
            success: true,
            sessions: allSessions
        };
        
        if (!response.success || !response.sessions) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No sessions found</h5>
                </div>
            `;
            return;
        }
        
        // Filter by deviceIds (all charging points in this station)
        let filteredSessions = response.sessions.filter(session => 
            session.deviceId && deviceIds.some(id => id.toLowerCase() === session.deviceId.toLowerCase())
        );
        
        // Apply search filter if provided
        if (state.search) {
            const searchLower = state.search.toLowerCase();
            filteredSessions = filteredSessions.filter(session => 
                (session.deviceId && session.deviceId.toLowerCase().includes(searchLower)) ||
                (session.transactionId && session.transactionId.toString().toLowerCase().includes(searchLower)) ||
                (session.sessionId && session.sessionId.toLowerCase().includes(searchLower))
            );
        }
        
        if (filteredSessions.length === 0) {
            container.innerHTML = `
                <div class="station-sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No completed sessions found for this station</h5>
                </div>
            `;
            document.getElementById('stationCompletedSessionsPagination').style.display = 'none';
            return;
        }
        
        // Client-side pagination
        const totalPages = Math.ceil(filteredSessions.length / state.limit);
        const paginatedSessions = filteredSessions.slice((state.page - 1) * state.limit, state.page * state.limit);
        
        // Display sessions
        displayStationCompletedSessions(paginatedSessions, state.page, totalPages, filteredSessions.length);
        
    } catch (error) {
        console.error('Error loading station completed sessions:', error);
        const container = document.getElementById('stationCompletedSessionsTableContainer');
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

// Display station active sessions
function displayStationActiveSessions(sessions, page, limit, total) {
    const container = document.getElementById('stationActiveSessionsTableContainer');
    if (!container) return;
    
    const currencySymbol = sessions[0]?.currency === 'USD' ? '$' : '₹';
    
    container.innerHTML = `
        <div class="station-sessions-table-wrapper">
            <div class="station-sessions-table-scroll">
                <table class="station-sessions-table">
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
    const totalPages = Math.ceil(total / limit);
    updateStationActiveSessionsPagination(page, totalPages, total);
}

// Display station completed sessions
function displayStationCompletedSessions(sessions, page, totalPages, total) {
    const container = document.getElementById('stationCompletedSessionsTableContainer');
    if (!container) return;
    
    const currencySymbol = sessions[0]?.currency === 'USD' ? '$' : '₹';
    
    container.innerHTML = `
        <div class="station-sessions-table-wrapper">
            <div class="station-sessions-table-scroll">
                <table class="station-sessions-table">
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
                            <th>T</th>
                            <th>SESSION ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map((session, index) => {
                            const serialNo = (page - 1) * stationSessionsState.completed.limit + index + 1;
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
    updateStationCompletedSessionsPagination(page, totalPages, total);
}

// Update station active sessions pagination
function updateStationActiveSessionsPagination(currentPage, totalPages, total) {
    const pagination = document.getElementById('stationActiveSessionsPagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    const start = (currentPage - 1) * stationSessionsState.active.limit + 1;
    const end = Math.min(currentPage * stationSessionsState.active.limit, total);
    
    let paginationHTML = `
        <div class="station-sessions-pagination-info">Showing ${start}-${end} of ${total}</div>
        <div class="station-sessions-pagination-controls">
    `;
    
    // Previous button
    paginationHTML += `
        <button class="station-sessions-pagination-btn" onclick="window.stationActiveSessionsPrevPage('${currentStationSessionsId}')" 
                ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
    `;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="station-sessions-pagination-btn ${i === currentPage ? 'active' : ''}" 
                        onclick="window.stationActiveSessionsGoToPage(${i}, '${currentStationSessionsId}')">${i}</button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span>...</span>`;
        }
    }
    
    // Next button
    paginationHTML += `
        <button class="station-sessions-pagination-btn" onclick="window.stationActiveSessionsNextPage('${currentStationSessionsId}')" 
                ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    `;
    
    paginationHTML += `</div>`;
    pagination.innerHTML = paginationHTML;
}

// Update station completed sessions pagination
function updateStationCompletedSessionsPagination(currentPage, totalPages, total) {
    const pagination = document.getElementById('stationCompletedSessionsPagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    const start = (currentPage - 1) * stationSessionsState.completed.limit + 1;
    const end = Math.min(currentPage * stationSessionsState.completed.limit, total);
    
    let paginationHTML = `
        <div class="station-sessions-pagination-info">Showing ${start}-${end} of ${total}</div>
        <div class="station-sessions-pagination-controls">
    `;
    
    // Previous button
    paginationHTML += `
        <button class="station-sessions-pagination-btn" onclick="window.stationCompletedSessionsPrevPage('${currentStationSessionsId}')" 
                ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
    `;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            paginationHTML += `
                <button class="station-sessions-pagination-btn ${i === currentPage ? 'active' : ''}" 
                        onclick="window.stationCompletedSessionsGoToPage(${i}, '${currentStationSessionsId}')">${i}</button>
            `;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            paginationHTML += `<span>...</span>`;
        }
    }
    
    // Next button
    paginationHTML += `
        <button class="station-sessions-pagination-btn" onclick="window.stationCompletedSessionsNextPage('${currentStationSessionsId}')" 
                ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
    `;
    
    paginationHTML += `</div>`;
    pagination.innerHTML = paginationHTML;
}

// Make functions globally available
window.loadStationDetailView = loadStationDetailView;
window.switchStationTab = switchStationTab;
window.editStationDetails = editStationDetails;
window.viewOnMap = viewOnMap;
window.copyToClipboard = copyToClipboard;
window.goBackToStationsList = goBackToStationsList;
window.loadChargingStationsModule = loadChargingStationsModule;
window.viewPointFromStation = viewPointFromStation;

// Station sessions tab functions
window.switchStationSessionsSubTab = async function(subTab, stationId) {
    // Get deviceIds for this station
    const deviceIds = window.currentStationDeviceIds || [];
    
    // Update sub-tab UI
    document.querySelectorAll('.station-sessions-sub-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-subtab') === subTab) {
            tab.classList.add('active');
        }
    });
    
    // Update content visibility
    document.getElementById('stationActiveSessionsContent').classList.remove('active');
    document.getElementById('stationCompletedSessionsContent').classList.remove('active');
    
    if (subTab === 'active') {
        document.getElementById('stationActiveSessionsContent').classList.add('active');
    } else if (subTab === 'completed') {
        document.getElementById('stationCompletedSessionsContent').classList.add('active');
    }
    
    // Load the sub-tab data
    await loadStationSessionsSubTab(subTab, stationId, deviceIds);
};

window.applyStationActiveSessionsFilters = async function(stationId) {
    const searchInput = document.getElementById('stationActiveSessionsSearch');
    if (searchInput) {
        stationSessionsState.active.search = searchInput.value.trim();
        stationSessionsState.active.page = 1; // Reset to first page
    }
    const deviceIds = window.currentStationDeviceIds || [];
    await loadStationActiveSessions(stationId, deviceIds);
};

window.applyStationCompletedSessionsFilters = async function(stationId) {
    const searchInput = document.getElementById('stationCompletedSessionsSearch');
    const fromDateInput = document.getElementById('stationCompletedSessionsFromDate');
    const toDateInput = document.getElementById('stationCompletedSessionsToDate');
    
    if (searchInput) {
        stationSessionsState.completed.search = searchInput.value.trim();
    }
    if (fromDateInput) {
        stationSessionsState.completed.fromDate = fromDateInput.value;
    }
    if (toDateInput) {
        stationSessionsState.completed.toDate = toDateInput.value;
    }
    stationSessionsState.completed.page = 1; // Reset to first page
    
    const deviceIds = window.currentStationDeviceIds || [];
    await loadStationCompletedSessions(stationId, deviceIds);
};

window.stationActiveSessionsPrevPage = async function(stationId) {
    if (stationSessionsState.active.page > 1) {
        stationSessionsState.active.page--;
        const deviceIds = window.currentStationDeviceIds || [];
        await loadStationActiveSessions(stationId, deviceIds);
    }
};

window.stationActiveSessionsNextPage = async function(stationId) {
    stationSessionsState.active.page++;
    const deviceIds = window.currentStationDeviceIds || [];
    await loadStationActiveSessions(stationId, deviceIds);
};

window.stationActiveSessionsGoToPage = async function(page, stationId) {
    stationSessionsState.active.page = page;
    const deviceIds = window.currentStationDeviceIds || [];
    await loadStationActiveSessions(stationId, deviceIds);
};

window.stationCompletedSessionsPrevPage = async function(stationId) {
    if (stationSessionsState.completed.page > 1) {
        stationSessionsState.completed.page--;
        const deviceIds = window.currentStationDeviceIds || [];
        await loadStationCompletedSessions(stationId, deviceIds);
    }
};

window.stationCompletedSessionsNextPage = async function(stationId) {
    stationSessionsState.completed.page++;
    const deviceIds = window.currentStationDeviceIds || [];
    await loadStationCompletedSessions(stationId, deviceIds);
};

window.stationCompletedSessionsGoToPage = async function(page, stationId) {
    stationSessionsState.completed.page = page;
    const deviceIds = window.currentStationDeviceIds || [];
    await loadStationCompletedSessions(stationId, deviceIds);
};

