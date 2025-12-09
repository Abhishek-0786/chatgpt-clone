// Charging Points Module
import { getChargingPoints, deleteChargingPoint } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showSuccess, showError, showConfirm } from '../utils/notifications.js';

// Global variables for auto-refresh
let pointsRefreshInterval = null;
let currentPointsPage = 1;
let currentPointsLimit = 10;
let pointsFilters = {
    search: '',
    fromDate: '',
    toDate: '',
    status: ''
};
// Sorting state
let currentSortField = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'

// Export function to clear refresh interval (called when navigating away)
export function clearPointsRefreshInterval() {
    if (pointsRefreshInterval) {
        clearInterval(pointsRefreshInterval);
        pointsRefreshInterval = null;
    }
}

// Function to view station from charging points module
async function viewStationFromPoints(stationId) {
    // Clear refresh interval when navigating away
    clearPointsRefreshInterval();
    
    // Update sidebar to show Charging Stations as active
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === 'charging-stations') {
            item.classList.add('active');
        }
    });
    
    // Push state to browser history for station detail view
    const url = `/cms?module=charging-stations&station=${stationId}`;
    window.history.pushState({ module: 'charging-stations', stationId: stationId, view: 'detail' }, '', url);
    
    // Dynamically import and load station detail view
    try {
        const detailModule = await import('./station-detail-view.js');
        detailModule.loadStationDetailView(stationId);
    } catch (error) {
        console.error('Error loading station detail view:', error);
        showError(error.message || 'Failed to load station details');
    }
}

// Export main function to load module
export function loadChargingPointsModule() {
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            #charging-points-content {
                width: 100%;
            }
            
            .points-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .points-header h2 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
            }
            
            .filters-section {
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
            
            .search-input {
                flex: 1;
                min-width: 250px;
                padding: 10px 15px;
                border: 1px solid var(--input-border);
                border-radius: 4px;
                font-size: 14px;
                background-color: var(--input-bg);
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .search-input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .date-input-group {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .date-input-group span {
                color: var(--text-secondary);
                font-size: 14px;
                font-weight: 500;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .date-input {
                padding: 10px 15px;
                border: 1px solid var(--input-border);
                border-radius: 4px;
                font-size: 14px;
                background-color: var(--input-bg);
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .date-input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .date-input::-webkit-calendar-picker-indicator {
                filter: invert(0);
                cursor: pointer;
            }
            
            [data-theme="dark"] .date-input::-webkit-calendar-picker-indicator {
                filter: invert(1);
            }
            
            .status-select,
            .sort-select {
                padding: 10px 40px 10px 15px;
                border: 1px solid var(--input-border);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                background-color: var(--input-bg);
                color: var(--text-primary);
                cursor: pointer;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
                appearance: none;
                -webkit-appearance: none;
                -moz-appearance: none;
                background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
                background-repeat: no-repeat;
                background-position: right 12px center;
                background-size: 16px;
            }
            
            [data-theme="dark"] .status-select,
            [data-theme="dark"] .sort-select {
                background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e0e0e0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            }
            
            .status-select:focus,
            .sort-select:focus {
                outline: none;
                border-color: var(--input-border);
                box-shadow: none;
            }
            
            .status-select:hover,
            .sort-select:hover {
                border-color: var(--input-border);
            }
            
            .apply-btn {
                padding: 10px 24px;
                background-color: #343a40;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .apply-btn:hover {
                background-color: #23272b;
            }
            
            .apply-btn:active {
                transform: translateY(1px);
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
                min-width: 1500px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
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
                overflow: hidden;
                text-overflow: ellipsis;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #pointsTable thead th:last-child {
                border-right: none;
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
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #pointsTable tbody td:last-child {
                border-right: none;
            }
            
            #pointsTable tbody td a {
                color: var(--text-primary);
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            #pointsTable tbody td a:hover {
                color: #007bff;
                text-decoration: underline;
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
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
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
            
            .c-status {
                color: var(--text-primary);
                font-size: 13px;
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
            
            .table-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 20px;
                padding: 15px 0;
                border-top: 1px solid var(--border-color);
            }
            
            .pagination {
                margin: 0;
            }
            
            .pagination .page-link {
                color: #007bff;
                border: 1px solid var(--border-color);
                background-color: var(--card-bg);
                padding: 8px 14px;
                margin: 0 2px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            
            .pagination .page-link:hover {
                background-color: var(--hover-bg);
                border-color: var(--border-color);
            }
            
            .pagination .page-item.active .page-link {
                background-color: #007bff;
                border-color: #007bff;
                color: white;
            }
            
            .pagination .page-item.disabled .page-link {
                color: var(--text-muted);
                pointer-events: none;
                background-color: var(--card-bg);
                border-color: var(--border-color);
                opacity: 0.5;
            }
            
            .action-btn {
                padding: 6px 12px;
                border-radius: 4px;
                transition: all 0.2s;
                margin-right: 5px;
            }
            
            .action-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px var(--shadow);
            }
            
            .points-header h2 {
                color: var(--text-primary);
            }
            
            #showingTextPoints {
                color: var(--text-secondary) !important;
            }
        </style>
        
        <div id="charging-points-content">
            <div class="points-header">
                <h2>Charging Points</h2>
                <button class="btn btn-primary" id="addChargingPointBtn">
                    <i class="fas fa-plus me-2"></i>ADD NEW
                </button>
            </div>
            
            <div class="filters-section">
                <input type="text" class="search-input" id="pointSearch" placeholder="Search by Charging Point ID, Device ID, Device Name" onkeyup="if(event.key === 'Enter') window.applyPointFilters()">
                <div class="date-input-group">
                    <input type="date" class="date-input" id="pointFromDate" onchange="window.handlePointFromDateChange()">
                    <span>From</span>
                    <input type="date" class="date-input" id="pointToDate" onchange="window.handlePointToDateChange()">
                    <span>To</span>
                </div>
                <select class="status-select" id="pointStatus">
                    <option value="">All Status</option>
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                    <option value="Faulted">Faulted</option>
                </select>
                <select class="sort-select" id="pointSort">
                    <option value="">Sort By</option>
                    <option value="sessions-asc">Sessions (Low to High)</option>
                    <option value="sessions-desc">Sessions (High to Low)</option>
                    <option value="billedAmount-asc">Billed Amount (Low to High)</option>
                    <option value="billedAmount-desc">Billed Amount (High to Low)</option>
                    <option value="energy-asc">Energy (Low to High)</option>
                    <option value="energy-desc">Energy (High to Low)</option>
                </select>
                <button class="apply-btn" onclick="window.applyPointFilters()">APPLY</button>
            </div>
            
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table id="pointsTable">
                    <thead>
                        <tr>
                            <th>S.No</th>
                            <th>Charging Point</th>
                            <th>Station Name</th>
                            <th>Device ID</th>
                            <th>Status</th>
                            <th>C. Status</th>
                            <th>Charger type</th>
                            <th>Connectors</th>
                            <th>Max power (kWh)</th>
                            <th>Sessions*</th>
                            <th>Billed Amount* (₹)</th>
                            <th>Energy* (kWh)</th>
                            <th>Created At</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="pointsTableBody">
                        <tr>
                            <td colspan="14" class="text-center" style="padding: 40px;">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                    </table>
                </div>
            </div>
            
            <div class="table-footer">
                <div>
                    <span id="showingTextPoints" style="color: var(--text-secondary); font-size: 14px;">Showing 0-0 of 0 Charging Points</span>
                </div>
                <nav>
                    <ul class="pagination mb-0" id="paginationPoints">
                        <!-- Pagination will be generated here -->
                    </ul>
                </nav>
            </div>
        </div>
    `;
    
    // Clear any existing refresh interval
    if (pointsRefreshInterval) {
        clearInterval(pointsRefreshInterval);
        pointsRefreshInterval = null;
    }
    
    // Setup add form button after HTML is rendered
    setupAddFormButton();
    
    // Restore filter values
    setTimeout(() => {
        restorePointFilters();
        // Load points data with current filters
        loadPointsData(1, currentPointsLimit, pointsFilters.search, pointsFilters.fromDate, pointsFilters.toDate, pointsFilters.status);
    }, 100);
    
    // Set up auto-refresh every 10 seconds
    pointsRefreshInterval = setInterval(() => {
        // Only refresh if we're still on the points list (not on detail view)
        const urlParams = new URLSearchParams(window.location.search);
        const module = urlParams.get('module');
        const pointId = urlParams.get('point');
        
        if (module === 'charging-points' && !pointId) {
            // We're on the points list, refresh with current page and filters
            loadPointsData(currentPointsPage, currentPointsLimit, pointsFilters.search, pointsFilters.fromDate, pointsFilters.toDate, pointsFilters.status);
        }
    }, 10000);
    
    // Set up Socket.io listener for real-time status updates
    if (typeof io !== 'undefined') {
        const socket = io();
        socket.emit('join-room', 'cms:points');
        
        socket.on('notification', (payload) => {
            if (!payload || !payload.type || !payload.data) return;
            
            // Refresh points list when status changes
            if (payload.type === 'charger.status.changed' || 
                payload.type === 'charging.remote.start.accepted' || 
                payload.type === 'charging.remote.stop.accepted' ||
                payload.type === 'meter.values.updated') {
                const urlParams = new URLSearchParams(window.location.search);
                const module = urlParams.get('module');
                const pointId = urlParams.get('point');
                
                if (module === 'charging-points' && !pointId) {
                    // We're on the points list, refresh with current page and filters
                    loadPointsData(currentPointsPage, currentPointsLimit, pointsFilters.search, pointsFilters.fromDate, pointsFilters.toDate, pointsFilters.status);
                }
            }
        });
    }
}

// Setup add form button - called after module HTML is loaded
function setupAddFormButton() {
    try {
        const addButton = document.getElementById('addChargingPointBtn');
        if (addButton) {
            // Remove any existing event listeners by cloning the button
            const newButton = addButton.cloneNode(true);
            addButton.parentNode.replaceChild(newButton, addButton);
            
            newButton.addEventListener('click', async function(e) {
                e.preventDefault();
                try {
                    const formModule = await import('./add-charging-point-form.js');
                    formModule.openAddChargingPointForm();
                } catch (error) {
                    console.error('Error loading add charging point form:', error);
                    alert('Error loading form. Please refresh the page.');
                }
            });
        }
    } catch (error) {
        console.error('Error setting up add charging point button:', error);
    }
}

// Export data loading function
export async function loadPointsData(page = 1, limit = 10, searchTerm = '', fromDate = '', toDate = '', status = '') {
    try {
        // Update current page and limit for auto-refresh
        currentPointsPage = page;
        currentPointsLimit = limit;
        
        // Check if we need to fetch all points (when date filters or sorting is active)
        const hasClientSideFilters = fromDate || toDate || currentSortField;
        
        let allPoints = [];
        let totalPoints = 0;
        
        if (hasClientSideFilters) {
            // Fetch all points when client-side filters are active
            // Backend max limit is 100, so we need to make multiple requests
            let currentPage = 1;
            const maxLimit = 100; // Backend max limit
            let hasMore = true;
            
            while (hasMore) {
                const params = {
                    page: currentPage,
                    limit: maxLimit
                };
                
                // Add search and status parameters if provided (backend filters)
                if (searchTerm) {
                    params.search = searchTerm;
                }
                if (status) {
                    params.status = status;
                }
                
                const data = await getChargingPoints(params);
                if (!data || !data.success) {
                    throw new Error(data?.error || data?.message || 'Failed to fetch charging points from API');
                }
                
                if (data.points && data.points.length > 0) {
                    allPoints = allPoints.concat(data.points);
                    totalPoints = data.total || 0;
                    
                    // Check if there are more pages
                    const totalPages = Math.ceil((data.total || 0) / maxLimit);
                    if (currentPage >= totalPages || data.points.length < maxLimit) {
                        hasMore = false;
                    } else {
                        currentPage++;
                    }
                } else {
                    hasMore = false;
                }
            }
        } else {
            // Use normal pagination when no client-side filters
            const params = {
                page: page,
                limit: limit
            };
            
            // Add search and status parameters if provided
            if (searchTerm) {
                params.search = searchTerm;
            }
            if (status) {
                params.status = status;
            }
            
            const data = await getChargingPoints(params);
            allPoints = data.points || [];
            totalPoints = data.total || 0;
        }
        
        // Apply client-side date filtering
        let filteredPoints = allPoints;
        
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filteredPoints = filteredPoints.filter(point => {
                const pointDate = new Date(point.createdAt);
                pointDate.setHours(0, 0, 0, 0);
                return pointDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filteredPoints = filteredPoints.filter(point => {
                const pointDate = new Date(point.createdAt);
                return pointDate <= to;
            });
        }
        
        // Apply sorting if sort field is set
        if (currentSortField) {
            filteredPoints = sortPointsData(filteredPoints, currentSortField, currentSortDirection);
        }
        
        // Apply client-side pagination if filters are active
        let paginatedPoints = filteredPoints;
        let totalPages = 1;
        let total = filteredPoints.length;
        
        if (hasClientSideFilters) {
            // Client-side pagination
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            paginatedPoints = filteredPoints.slice(startIndex, endIndex);
            totalPages = Math.ceil(filteredPoints.length / limit);
            total = filteredPoints.length;
        } else {
            // Use backend pagination data
            totalPages = Math.ceil(totalPoints / limit);
            total = totalPoints;
        }
        
        // Map backend response to frontend format
        const formattedData = {
            points: paginatedPoints.map(point => ({
                id: point.id,
                chargingPoint: point.deviceName,
                chargingPointId: point.chargingPointId,
                stationId: point.stationId, // Database ID (integer)
                stationIdString: point.stationIdString, // Station ID string (e.g., "STN-...") for navigation
                stationName: point.stationName,
                deviceId: point.deviceId,
                status: point.status,
                cStatus: point.cStatus,
                chargerType: point.chargerType,
                connectors: point.connectors,
                maxPower: point.maxPower,
                sessions: point.sessions || 0,
                billedAmount: point.billedAmount || 0,
                energy: point.energy || 0,
                createdAt: point.createdAt
            })),
            total: total,
            page: page,
            limit: limit,
            totalPages: totalPages
        };
        
        displayPoints(formattedData);
    } catch (error) {
        console.error('Error loading points:', error);
        document.getElementById('pointsTableBody').innerHTML = `
            <tr>
                <td colspan="14" class="text-center text-danger">
                    Error loading charging points: ${error.message || 'Please try again.'}
                </td>
            </tr>
        `;
    }
}

// Export display function
export function displayPoints(data) {
    const tbody = document.getElementById('pointsTableBody');
    const showingText = document.getElementById('showingTextPoints');
    
    if (!data.points || data.points.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="text-center">No charging points found</td>
            </tr>
        `;
        showingText.textContent = 'Showing 0-0 of 0 Charging Points';
        return;
    }
    
    tbody.innerHTML = data.points.map((point, index) => {
        const serialNo = (data.page - 1) * data.limit + index + 1;
        
        // Status badge
        let statusClass = 'status-offline';
        if (point.status === 'Online') {
            statusClass = 'status-online';
        } else if (point.status === 'Faulted') {
            statusClass = 'status-faulted';
        }
        const statusBadge = `<span class="status-badge ${statusClass}">${point.status}</span>`;
        
        const createdAt = formatDate(point.createdAt);
        
        return `
            <tr>
                <td>${serialNo}</td>
                <td><a href="#" onclick="window.viewPoint('${point.chargingPointId || point.id}'); return false;">${point.chargingPoint}</a></td>
                <td><a href="#" onclick="window.viewStationFromPoints('${point.stationIdString || point.stationId}'); return false;">${point.stationName}</a></td>
                <td>${point.deviceId}</td>
                <td>${statusBadge}</td>
                <td class="c-status">
                    <span class="c-status-badge ${getCStatusClass(point.cStatus)}">${point.cStatus}</span>
                </td>
                <td>${point.chargerType}</td>
                <td>${point.connectors}</td>
                <td>${point.maxPower}</td>
                <td>${point.sessions}</td>
                <td>${point.billedAmount.toFixed(2)}</td>
                <td>${point.energy.toFixed(2)}</td>
                <td>${createdAt}</td>
                <td>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn btn-sm btn-outline-primary action-btn" onclick="window.editPoint('${point.chargingPointId || point.id}'); return false;" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger action-btn" onclick="window.deletePoint('${point.chargingPointId || point.id}', '${point.chargingPoint}'); return false;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    // Update showing text
    const start = (data.page - 1) * data.limit + 1;
    const end = Math.min(data.page * data.limit, data.total);
    showingText.textContent = `Showing ${start}-${end} of ${data.total} Charging Points`;
    
    // Generate pagination
    generatePointsPagination(data.page, data.totalPages);
}

// Sort points data
function sortPointsData(points, sortField, sortDirection) {
    const sorted = [...points].sort((a, b) => {
        let aValue, bValue;
        
        switch(sortField) {
            case 'sessions':
                aValue = a.sessions || 0;
                bValue = b.sessions || 0;
                break;
            case 'billedAmount':
                aValue = parseFloat(a.billedAmount || 0);
                bValue = parseFloat(b.billedAmount || 0);
                break;
            case 'energy':
                aValue = parseFloat(a.energy || 0);
                bValue = parseFloat(b.energy || 0);
                break;
            default:
                return 0;
        }
        
        if (sortDirection === 'asc') {
            return aValue - bValue;
        } else {
            return bValue - aValue;
        }
    });
    
    return sorted;
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

// Export pagination function
export function generatePointsPagination(currentPage, totalPages) {
    const pagination = document.getElementById('paginationPoints');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // Helper function to create pagination link with filters
    const createPageLink = (pageNum) => {
        return `window.loadPointsData(${pageNum}, ${currentPointsLimit}, '${pointsFilters.search}', '${pointsFilters.fromDate}', '${pointsFilters.toDate}', '${pointsFilters.status}'); return false;`;
    };
    
    // First page
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${createPageLink(1)}">
                <i class="fas fa-angle-double-left"></i>
            </a>
        </li>
    `;
    
    // Previous page
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${createPageLink(currentPage - 1)}">
                <i class="fas fa-angle-left"></i>
            </a>
        </li>
    `;
    
    // Page numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="${createPageLink(1)}">1</a></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="${createPageLink(i)}">${i}</a>
            </li>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><a class="page-link" href="#" onclick="${createPageLink(totalPages)}">${totalPages}</a></li>`;
    }
    
    // Next page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${createPageLink(currentPage + 1)}">
                <i class="fas fa-angle-right"></i>
            </a>
        </li>
    `;
    
    // Last page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${createPageLink(totalPages)}">
                <i class="fas fa-angle-double-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
}

// Export action functions and make them globally available
export async function editPoint(chargingPointId) {
    try {
        // Dynamically import and open edit charging point form
        const formModule = await import('./add-charging-point-form.js');
        formModule.openEditChargingPointForm(chargingPointId);
    } catch (error) {
        console.error('Error loading edit charging point form:', error);
        showError('Error loading form. Please refresh the page.');
    }
}

export async function viewPoint(chargingPointId) {
    // Clear refresh interval when navigating to detail view
    clearPointsRefreshInterval();
    
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

// Soft delete charging point (sets deleted = true in database)
export async function deletePoint(chargingPointId, chargingPointName) {
    // Confirm deletion using custom modal
    const confirmed = await showConfirm(
        `Are you sure you want to delete "${chargingPointName}"?\n\nThis will hide the charging point from the list, but it will not be permanently deleted from the database.`,
        'Delete Charging Point'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Call API to soft delete (update deleted column to true)
        const response = await deleteChargingPoint(chargingPointId);
        
        if (response.success) {
            showSuccess(`Charging Point "${chargingPointName}" has been deleted successfully.`);
            // Reload points list to reflect the change (with current filters)
            loadPointsData(currentPointsPage, currentPointsLimit, pointsFilters.search, pointsFilters.fromDate, pointsFilters.toDate, pointsFilters.status);
        } else {
            showError(response.error || 'Failed to delete charging point');
        }
    } catch (error) {
        console.error('Error deleting charging point:', error);
        showError(error.message || 'Failed to delete charging point');
    }
}

// Filter functions
function applyPointFilters() {
    const searchTerm = document.getElementById('pointSearch')?.value || '';
    const fromDate = document.getElementById('pointFromDate')?.value || '';
    const toDate = document.getElementById('pointToDate')?.value || '';
    const statusSelect = document.getElementById('pointStatus')?.value || '';
    const sortSelect = document.getElementById('pointSort')?.value || '';
    
    // Parse sort value
    if (sortSelect) {
        const [sortField, sortDirection] = sortSelect.split('-');
        currentSortField = sortField;
        currentSortDirection = sortDirection || 'asc';
    } else {
        currentSortField = null;
        currentSortDirection = 'asc';
    }
    
    // Update filters
    pointsFilters.search = searchTerm;
    pointsFilters.fromDate = fromDate;
    pointsFilters.toDate = toDate;
    pointsFilters.status = statusSelect;
    
    // Save filters to sessionStorage
    sessionStorage.setItem('pointsFilters', JSON.stringify(pointsFilters));
    
    // Reset to first page when applying filters
    loadPointsData(1, currentPointsLimit, searchTerm, fromDate, toDate, statusSelect);
}

function handlePointFromDateChange() {
    const fromDate = document.getElementById('pointFromDate')?.value || '';
    const toDate = document.getElementById('pointToDate')?.value || '';
    
    // If fromDate is after toDate, clear toDate
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        document.getElementById('pointToDate').value = '';
        pointsFilters.toDate = '';
    }
    
    // Set max date for toDate input
    const toDateInput = document.getElementById('pointToDate');
    if (toDateInput && fromDate) {
        toDateInput.setAttribute('min', fromDate);
    }
}

function handlePointToDateChange() {
    const fromDate = document.getElementById('pointFromDate')?.value || '';
    const toDate = document.getElementById('pointToDate')?.value || '';
    
    // If toDate is before fromDate, clear fromDate
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
        document.getElementById('pointFromDate').value = '';
        pointsFilters.fromDate = '';
    }
}

// Restore filter values when module loads
function restorePointFilters() {
    // Try to restore from sessionStorage
    const savedFilters = sessionStorage.getItem('pointsFilters');
    if (savedFilters) {
        try {
            pointsFilters = JSON.parse(savedFilters);
        } catch (e) {
            console.error('Error parsing saved filters:', e);
        }
    }
    
    const searchInput = document.getElementById('pointSearch');
    const fromDateInput = document.getElementById('pointFromDate');
    const toDateInput = document.getElementById('pointToDate');
    const statusSelect = document.getElementById('pointStatus');
    const sortSelect = document.getElementById('pointSort');
    
    if (searchInput) searchInput.value = pointsFilters.search || '';
    if (fromDateInput) {
        fromDateInput.value = pointsFilters.fromDate || '';
        // Set max date to today
        const today = new Date().toISOString().split('T')[0];
        fromDateInput.setAttribute('max', today);
    }
    if (toDateInput) {
        toDateInput.value = pointsFilters.toDate || '';
        // Set max date to today
        const today = new Date().toISOString().split('T')[0];
        toDateInput.setAttribute('max', today);
        // Set min date if fromDate is set
        if (pointsFilters.fromDate) {
            toDateInput.setAttribute('min', pointsFilters.fromDate);
        }
    }
    if (statusSelect) statusSelect.value = pointsFilters.status || '';
    
    // Restore sort selection
    if (sortSelect && currentSortField) {
        sortSelect.value = `${currentSortField}-${currentSortDirection}`;
    } else if (sortSelect) {
        sortSelect.value = '';
    }
}

// Make functions globally available for onclick handlers
window.loadPointsData = loadPointsData;
window.editPoint = editPoint;
window.viewPoint = viewPoint;
window.deletePoint = deletePoint;
window.applyPointFilters = applyPointFilters;
window.handlePointFromDateChange = handlePointFromDateChange;
window.handlePointToDateChange = handlePointToDateChange;
window.viewStationFromPoints = viewStationFromPoints;

