// Charging Stations Module
import { getChargingStations, deleteChargingStation } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { openAddStationForm } from './add-station-form.js';
import { showSuccess, showError, showConfirm } from '../utils/notifications.js';

// Global variables for auto-refresh
let stationsRefreshInterval = null;
let currentStationsPage = 1;
let currentStationsLimit = 10;
let stationsFilters = {
    search: '',
    fromDate: '',
    toDate: '',
    status: ''
};
// Sorting state
let currentSortField = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'

// Export function to clear refresh interval (called when navigating away)
export function clearStationsRefreshInterval() {
    if (stationsRefreshInterval) {
        clearInterval(stationsRefreshInterval);
        stationsRefreshInterval = null;
    }
}

// Export main function to load module
export function loadChargingStationsModule() {
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            #charging-stations-content {
                width: 100%;
            }
            
            .stations-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .stations-header h2 {
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
            
            .status-legend {
                display: flex;
                gap: 15px;
                align-items: center;
                font-size: 12px;
                color: var(--text-secondary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .status-legend-item {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }
            
            .status-dot.online {
                background-color: #28a745;
            }
            
            .status-dot.offline {
                background-color: #dc3545;
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
            
            #stationsTable {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #stationsTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] #stationsTable thead {
                background-color: #1a1a1a;
            }
            
            #stationsTable thead th {
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
            
            #stationsTable thead th:last-child {
                border-right: none;
            }
            
            #stationsTable tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            #stationsTable tbody tr.clickable-row {
                cursor: pointer;
            }
            
            #stationsTable tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            #stationsTable tbody tr.clickable-row:hover {
                background-color: var(--hover-bg);
            }
            
            #stationsTable tbody tr.clickable-row:nth-child(even):hover {
                background-color: var(--hover-bg);
            }
            
            #stationsTable tbody tr .action-column {
                cursor: default;
            }
            
            #stationsTable tbody tr .action-column * {
                cursor: pointer;
            }
            
            #stationsTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #stationsTable tbody td:last-child {
                border-right: none;
            }
            
            #stationsTable tbody td a {
                color: var(--text-primary);
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            #stationsTable tbody td a:hover {
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
            }
            
            .action-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px var(--shadow);
            }
            
            .stations-header h2 {
                color: var(--text-primary);
            }
            
            #showingText {
                color: var(--text-secondary) !important;
            }
        </style>
        
        <div id="charging-stations-content">
            <div class="stations-header">
                <h2>Charging Stations</h2>
                <button class="btn btn-primary" onclick="window.openAddStationForm()">
                    <i class="fas fa-plus me-2"></i>Add Station
                </button>
            </div>
            
            <div class="filters-section">
                <input type="text" class="search-input" id="stationSearch" placeholder="Search by station ID, station name, city, state" onkeyup="if(event.key === 'Enter') window.applyStationFilters()">
                <div class="date-input-group">
                    <input type="date" class="date-input" id="stationFromDate" onchange="window.handleStationFromDateChange()">
                    <span>From</span>
                    <input type="date" class="date-input" id="stationToDate" onchange="window.handleStationToDateChange()">
                    <span>To</span>
                </div>
                <select class="status-select" id="stationStatus">
                    <option value="">All Status</option>
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                </select>
                <select class="sort-select" id="stationSort">
                    <option value="">Sort By</option>
                    <option value="sessions-asc">Sessions (Low to High)</option>
                    <option value="sessions-desc">Sessions (High to Low)</option>
                    <option value="billedAmount-asc">Billed Amount (Low to High)</option>
                    <option value="billedAmount-desc">Billed Amount (High to Low)</option>
                    <option value="energy-asc">Energy (Low to High)</option>
                    <option value="energy-desc">Energy (High to Low)</option>
                </select>
                <button class="apply-btn" onclick="window.applyStationFilters()">APPLY</button>
            </div>
            
            <div style="display: flex; justify-content: flex-end; margin-bottom: 4px; padding-right: 10px;">
                <div class="status-legend">
                    <div class="status-legend-item">
                        <span class="status-dot online"></span>
                        <span>Online</span>
                    </div>
                    <div class="status-legend-item">
                        <span class="status-dot offline"></span>
                        <span>Offline</span>
                    </div>
                </div>
            </div>
            
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table id="stationsTable">
                    <thead>
                        <tr>
                            <th>S.NO</th>
                            <th>Station Name</th>
                            <th>City</th>
                            <th>Chargers</th>
                            <th>Sessions*</th>
                            <th>Billed Amount* (₹)</th>
                            <th>Energy* (kWh)</th>
                            <th>Status</th>
                            <th>Online CPs %</th>
                            <th>Online CPs</th>
                            <th>Offline CPs %</th>
                            <th>Offline CPs</th>
                            <th>Station ID</th>
                            <th>Created At</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="stationsTableBody">
                        <tr>
                            <td colspan="15" class="text-center" style="padding: 40px;">
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
                    <span id="showingText" style="color: var(--text-secondary); font-size: 14px;">Showing 0-0 of 0 Charging Stations</span>
                </div>
                <nav>
                    <ul class="pagination mb-0" id="pagination">
                        <!-- Pagination will be generated here -->
                    </ul>
                </nav>
            </div>
        </div>
    `;
    
    // Clear any existing refresh interval
    if (stationsRefreshInterval) {
        clearInterval(stationsRefreshInterval);
        stationsRefreshInterval = null;
    }
    
    // Restore filter values
    setTimeout(() => {
        restoreStationFilters();
        // Load stations data with current filters
        // Make sure status is only used if it's not empty
        const statusFilter = stationsFilters.status && stationsFilters.status.trim() !== '' ? stationsFilters.status : '';
        loadStationsData(1, currentStationsLimit, stationsFilters.search || '', stationsFilters.fromDate || '', stationsFilters.toDate || '', statusFilter);
    }, 100);
    
    // Set up auto-refresh every 10 seconds (polling fallback)
    stationsRefreshInterval = setInterval(() => {
        // Only refresh if we're still on the stations list (not on detail view)
        const urlParams = new URLSearchParams(window.location.search);
        const module = urlParams.get('module');
        const stationId = urlParams.get('station');
        
        if (module === 'charging-stations' && !stationId) {
            // We're on the stations list, refresh with current page and filters
            loadStationsData(currentStationsPage, currentStationsLimit, stationsFilters.search, stationsFilters.fromDate, stationsFilters.toDate, stationsFilters.status);
        }
    }, 10000);
    
    // Set up Socket.io listener for real-time status updates (hybrid approach)
    if (typeof io !== 'undefined') {
        const socket = io();
        socket.emit('join-room', 'cms:stations');
        
        socket.on('notification', (payload) => {
            if (!payload || !payload.type || !payload.data) return;
            
            // Refresh stations list when status changes
            // These events affect station status (online/offline CPs, overall status, etc.)
            if (payload.type === 'charger.status.changed' || 
                payload.type === 'charging.remote.start.accepted' || 
                payload.type === 'charging.remote.stop.accepted' ||
                payload.type === 'meter.values.updated') {
                const urlParams = new URLSearchParams(window.location.search);
                const module = urlParams.get('module');
                const stationId = urlParams.get('station');
                
                if (module === 'charging-stations' && !stationId) {
                    // We're on the stations list, refresh with current page and filters
                    loadStationsData(currentStationsPage, currentStationsLimit, stationsFilters.search, stationsFilters.fromDate, stationsFilters.toDate, stationsFilters.status);
                }
            }
        });
    }
}

// Export data loading function
export async function loadStationsData(page = 1, limit = 10, searchTerm = '', fromDate = '', toDate = '', status = '') {
    try {
        // Update current page and limit for auto-refresh
        currentStationsPage = page;
        currentStationsLimit = limit;
        
        // Check if we need to fetch all stations (when date, status filters, or sorting is active)
        const hasClientSideFilters = fromDate || toDate || (status && status.trim() !== '') || currentSortField;
        
        let allStations = [];
        let totalStations = 0;
        
        if (hasClientSideFilters) {
            // Fetch all stations when client-side filters are active
            // Backend max limit is 100, so we need to make multiple requests
            let currentPage = 1;
            const maxLimit = 100; // Backend max limit
            let hasMore = true;
            
            while (hasMore) {
                const params = {
                    page: currentPage,
                    limit: maxLimit
                };
                
                // Add search parameter if provided (backend search)
                if (searchTerm) {
                    params.search = searchTerm;
                }
                
                // Don't send status to backend - it's calculated dynamically and backend expects different values
                // Status filtering will be done client-side
                
                const data = await getChargingStations(params);
                if (!data || !data.success) {
                    throw new Error(data?.error || data?.message || 'Failed to fetch stations from API');
                }
                
                if (data.stations && data.stations.length > 0) {
                    allStations = allStations.concat(data.stations);
                    totalStations = data.total || 0;
                    
                    // Check if there are more pages
                    const totalPages = Math.ceil((data.total || 0) / maxLimit);
                    if (currentPage >= totalPages || data.stations.length < maxLimit) {
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
            
            // Add search parameter if provided
            if (searchTerm) {
                params.search = searchTerm;
            }
            
            // Don't send status to backend - it's calculated dynamically
            
            const data = await getChargingStations(params);
            if (!data || !data.success) {
                throw new Error(data?.error || data?.message || 'Failed to fetch stations from API');
            }
            allStations = data.stations || [];
            totalStations = data.total || 0;
        }
        
        // Apply client-side date and status filtering
        let filteredStations = allStations;
        
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filteredStations = filteredStations.filter(station => {
                const stationDate = new Date(station.createdAt);
                stationDate.setHours(0, 0, 0, 0);
                return stationDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filteredStations = filteredStations.filter(station => {
                const stationDate = new Date(station.createdAt);
                return stationDate <= to;
            });
        }
        
        if (status && status.trim() !== '') {
            filteredStations = filteredStations.filter(station => {
                return station.status === status;
            });
        }
        
        // Apply sorting if sort field is set
        if (currentSortField) {
            filteredStations = sortStationsData(filteredStations, currentSortField, currentSortDirection);
        }
        
        // Apply client-side pagination if filters are active
        let paginatedStations = filteredStations;
        let totalPages = 1;
        let total = filteredStations.length;
        
        if (hasClientSideFilters) {
            // Client-side pagination
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            paginatedStations = filteredStations.slice(startIndex, endIndex);
            totalPages = Math.ceil(filteredStations.length / limit);
            total = filteredStations.length;
        } else {
            // Use backend pagination data
            totalPages = Math.ceil(totalStations / limit);
            total = totalStations;
        }
        
        // Prepare data for display
        const displayData = {
            stations: paginatedStations,
            total: total,
            page: page,
            limit: limit,
            totalPages: totalPages
        };
        
        // Display the data
        displayStations(displayData);
    } catch (error) {
        console.error('Error loading stations:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            page,
            limit,
            searchTerm,
            fromDate,
            toDate,
            status
        });
        const tbody = document.getElementById('stationsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="15" class="text-center text-danger">
                        Error loading stations: ${error.message || 'Please try again.'}
                    </td>
                </tr>
            `;
        }
    }
}

// Export display function
export function displayStations(data) {
    const tbody = document.getElementById('stationsTableBody');
    const showingText = document.getElementById('showingText');
    
    if (!data.stations || data.stations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="15" class="text-center">No stations found</td>
            </tr>
        `;
        showingText.textContent = 'Showing 0-0 of 0 Charging Stations';
        return;
    }
    
    tbody.innerHTML = data.stations.map((station, index) => {
        const serialNo = (data.page - 1) * data.limit + index + 1;
        const statusClass = station.status === 'Online' ? 'status-online' : 'status-offline';
        const statusBadge = `<span class="status-badge ${statusClass}">${station.status}</span>`;
        
        const createdAt = formatDate(station.createdAt);
        
        return `
            <tr class="clickable-row" onclick="window.viewStation('${station.stationId}');">
                <td>${serialNo}</td>
                <td>${station.stationName}</td>
                <td>${station.city}</td>
                <td>${station.chargers}</td>
                <td>${station.sessions}</td>
                <td>${station.billedAmount.toFixed(2)}</td>
                <td>${station.energy.toFixed(2)}</td>
                <td>${statusBadge}</td>
                <td>${station.onlineCPsPercent}</td>
                <td>${station.onlineCPs}</td>
                <td>${station.offlineCPsPercent}</td>
                <td>${station.offlineCPs}</td>
                <td>${station.stationId}</td>
                <td>${createdAt}</td>
                <td class="action-column" onclick="event.stopPropagation();">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn btn-sm btn-outline-primary action-btn" onclick="window.editStation('${station.stationId}'); return false;" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger action-btn" onclick="window.deleteStation('${station.stationId}', '${station.stationName}'); return false;" title="Delete">
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
    showingText.textContent = `Showing ${start}-${end} of ${data.total} Charging Stations`;
    
    // Generate pagination
    generatePagination(data.page, data.totalPages);
}

// Sort stations data
function sortStationsData(stations, sortField, sortDirection) {
    const sorted = [...stations].sort((a, b) => {
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

// Export pagination function
export function generatePagination(currentPage, totalPages) {
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    // First page
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadStationsData(1, ${currentStationsLimit}, '${stationsFilters.search}', '${stationsFilters.fromDate}', '${stationsFilters.toDate}', '${stationsFilters.status}'); return false;">
                <i class="fas fa-angle-double-left"></i>
            </a>
        </li>
    `;
    
    // Previous page
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadStationsData(${currentPage - 1}, ${currentStationsLimit}, '${stationsFilters.search}', '${stationsFilters.fromDate}', '${stationsFilters.toDate}', '${stationsFilters.status}'); return false;">
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
        html += `<li class="page-item"><a class="page-link" href="#" onclick="window.loadStationsData(1, ${currentStationsLimit}, '${stationsFilters.search}', '${stationsFilters.fromDate}', '${stationsFilters.toDate}', '${stationsFilters.status}'); return false;">1</a></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="window.loadStationsData(${i}, ${currentStationsLimit}, '${stationsFilters.search}', '${stationsFilters.fromDate}', '${stationsFilters.toDate}', '${stationsFilters.status}'); return false;">${i}</a>
            </li>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><a class="page-link" href="#" onclick="window.loadStationsData(${totalPages}, ${currentStationsLimit}, '${stationsFilters.search}', '${stationsFilters.fromDate}', '${stationsFilters.toDate}', '${stationsFilters.status}'); return false;">${totalPages}</a></li>`;
    }
    
    // Next page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadStationsData(${currentPage + 1}, ${currentStationsLimit}, '${stationsFilters.search}', '${stationsFilters.fromDate}', '${stationsFilters.toDate}', '${stationsFilters.status}'); return false;">
                <i class="fas fa-angle-right"></i>
            </a>
        </li>
    `;
    
    // Last page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadStationsData(${totalPages}, ${currentStationsLimit}, '${stationsFilters.search}', '${stationsFilters.fromDate}', '${stationsFilters.toDate}', '${stationsFilters.status}'); return false;">
                <i class="fas fa-angle-double-right"></i>
            </a>
        </li>
    `;
    
    pagination.innerHTML = html;
}

// Export action functions and make them globally available
export async function editStation(stationId) {
    // Dynamically import and open edit station form
    try {
        const formModule = await import('./add-station-form.js');
        formModule.openEditStationForm(stationId);
    } catch (error) {
        console.error('Error loading edit station form:', error);
        showError(error.message || 'Failed to load edit form');
    }
}

export async function viewStation(stationId) {
    // Clear refresh interval when navigating to detail view
    clearStationsRefreshInterval();
    
    // Use clean URL for station detail view (default to details tab)
    const url = `/cms/charging-stations/${stationId}/details`;
    window.history.pushState({ module: 'charging-stations', stationId: stationId, view: 'detail', tab: 'details' }, '', url);
    
    // Update global CMS state
    window.CMS_CURRENT_MODULE = 'charging-stations';
    window.CMS_CURRENT_STATION_ID = stationId;
    window.CMS_CURRENT_STATION_TAB = 'details';
    
    // Dynamically import and load station detail view
    try {
        const detailModule = await import('./station-detail-view.js');
        detailModule.loadStationDetailView(stationId, 'details');
    } catch (error) {
        console.error('Error loading station detail view:', error);
        showError(error.message || 'Failed to load station details');
    }
}

// Soft delete station (sets deleted = true in database)
export async function deleteStation(stationId, stationName) {
    // Show beautiful confirmation dialog
    const confirmed = await showConfirm(
        `Are you sure you want to delete "${stationName}"?\n\nThis will hide the station from the list, but it will not be permanently deleted from the database.`,
        'Delete Station'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Call API to soft delete (update deleted column to true)
        const response = await deleteChargingStation(stationId);
        
        if (response.success) {
            showSuccess(`Station "${stationName}" has been deleted successfully.`);
            // Reload stations list to reflect the change
            loadStationsData();
        } else {
            showError(response.error || 'Failed to delete station');
        }
    } catch (error) {
        console.error('Error deleting station:', error);
        showError(error.message || 'Failed to delete station');
    }
}

// Make functions globally available for onclick handlers
// Filter functions
function applyStationFilters() {
    const searchTerm = document.getElementById('stationSearch')?.value || '';
    const fromDate = document.getElementById('stationFromDate')?.value || '';
    const toDate = document.getElementById('stationToDate')?.value || '';
    const statusSelect = document.getElementById('stationStatus')?.value || '';
    const sortSelect = document.getElementById('stationSort')?.value || '';
    
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
    stationsFilters.search = searchTerm;
    stationsFilters.fromDate = fromDate;
    stationsFilters.toDate = toDate;
    stationsFilters.status = statusSelect;
    
    // Reset to first page when applying filters
    loadStationsData(1, currentStationsLimit, searchTerm, fromDate, toDate, statusSelect);
}

function handleStationFromDateChange() {
    const fromDate = document.getElementById('stationFromDate')?.value || '';
    const toDate = document.getElementById('stationToDate')?.value || '';
    
    // If fromDate is after toDate, clear toDate
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        document.getElementById('stationToDate').value = '';
    }
}

function handleStationToDateChange() {
    const fromDate = document.getElementById('stationFromDate')?.value || '';
    const toDate = document.getElementById('stationToDate')?.value || '';
    
    // If toDate is before fromDate, clear fromDate
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
        document.getElementById('stationFromDate').value = '';
    }
}

// Restore filter values when module loads
function restoreStationFilters() {
    const searchInput = document.getElementById('stationSearch');
    const fromDateInput = document.getElementById('stationFromDate');
    const toDateInput = document.getElementById('stationToDate');
    const statusSelect = document.getElementById('stationStatus');
    const sortSelect = document.getElementById('stationSort');
    
    if (searchInput) searchInput.value = stationsFilters.search || '';
    if (fromDateInput) fromDateInput.value = stationsFilters.fromDate || '';
    if (toDateInput) toDateInput.value = stationsFilters.toDate || '';
    if (statusSelect) statusSelect.value = stationsFilters.status || '';
    
    // Restore sort selection
    if (sortSelect && currentSortField) {
        sortSelect.value = `${currentSortField}-${currentSortDirection}`;
    } else if (sortSelect) {
        sortSelect.value = '';
    }
}

window.loadStationsData = loadStationsData;
window.editStation = editStation;
window.viewStation = viewStation;
window.deleteStation = deleteStation;
window.openAddStationForm = openAddStationForm;
window.loadChargingStationsModule = loadChargingStationsModule;
window.applyStationFilters = applyStationFilters;
window.handleStationFromDateChange = handleStationFromDateChange;
window.handleStationToDateChange = handleStationToDateChange;

