// Charging Stations Module
import { getChargingStations, deleteChargingStation } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { openAddStationForm } from './add-station-form.js';
import { showSuccess, showError, showConfirm } from '../utils/notifications.js';

// Global variables for auto-refresh
let stationsRefreshInterval = null;
let currentStationsPage = 1;
let currentStationsLimit = 10;

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
            
            .table-wrapper {
                background-color: #ffffff;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
                background: #f1f1f1;
            }
            
            .table-scroll::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 4px;
            }
            
            .table-scroll::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
            
            #stationsTable {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: #ffffff;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #stationsTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
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
                border-bottom: 1px solid #e0e0e0;
                transition: background-color 0.2s;
                background-color: #ffffff;
            }
            
            #stationsTable tbody tr.clickable-row {
                cursor: pointer;
            }
            
            #stationsTable tbody tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            
            #stationsTable tbody tr.clickable-row:hover {
                background-color: #e3f2fd;
            }
            
            #stationsTable tbody tr.clickable-row:nth-child(even):hover {
                background-color: #e3f2fd;
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
                border-right: 1px solid #f0f0f0;
                color: #333;
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #stationsTable tbody td:last-child {
                border-right: none;
            }
            
            #stationsTable tbody td a {
                color: #000000;
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            #stationsTable tbody td a:hover {
                color: #333333;
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
                border-top: 1px solid #e0e0e0;
            }
            
            .pagination {
                margin: 0;
            }
            
            .pagination .page-link {
                color: #007bff;
                border: 1px solid #dee2e6;
                padding: 8px 14px;
                margin: 0 2px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            
            .pagination .page-link:hover {
                background-color: #e9ecef;
                border-color: #dee2e6;
            }
            
            .pagination .page-item.active .page-link {
                background-color: #007bff;
                border-color: #007bff;
                color: white;
            }
            
            .pagination .page-item.disabled .page-link {
                color: #6c757d;
                pointer-events: none;
                background-color: #fff;
                border-color: #dee2e6;
                opacity: 0.5;
            }
            
            .action-btn {
                padding: 6px 12px;
                border-radius: 4px;
                transition: all 0.2s;
            }
            
            .action-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
        </style>
        
        <div id="charging-stations-content">
            <div class="stations-header">
                <h2>Charging Stations</h2>
                <button class="btn btn-primary" onclick="window.openAddStationForm()">
                    <i class="fas fa-plus me-2"></i>Add Station
                </button>
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
                    <span id="showingText" style="color: #666; font-size: 14px;">Showing 0-0 of 0 Charging Stations</span>
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
    
    // Load stations data
    loadStationsData();
    
    // Set up auto-refresh every 5 seconds
    stationsRefreshInterval = setInterval(() => {
        // Only refresh if we're still on the stations list (not on detail view)
        const urlParams = new URLSearchParams(window.location.search);
        const module = urlParams.get('module');
        const stationId = urlParams.get('station');
        
        if (module === 'charging-stations' && !stationId) {
            // We're on the stations list, refresh with current page
            loadStationsData(currentStationsPage, currentStationsLimit);
        }
    }, 10000);
}

// Export data loading function
export async function loadStationsData(page = 1, limit = 10) {
    try {
        // Update current page and limit for auto-refresh
        currentStationsPage = page;
        currentStationsLimit = limit;
        
        // Use API service to get real data from backend
        const data = await getChargingStations({ page, limit });
        
        // Use the actual API response
        displayStations(data);
    } catch (error) {
        console.error('Error loading stations:', error);
        const tbody = document.getElementById('stationsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="15" class="text-center text-danger">
                        Error loading stations. Please try again.
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
            <a class="page-link" href="#" onclick="window.loadStationsData(1); return false;">
                <i class="fas fa-angle-double-left"></i>
            </a>
        </li>
    `;
    
    // Previous page
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadStationsData(${currentPage - 1}); return false;">
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
        html += `<li class="page-item"><a class="page-link" href="#" onclick="window.loadStationsData(1); return false;">1</a></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="window.loadStationsData(${i}); return false;">${i}</a>
            </li>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><a class="page-link" href="#" onclick="window.loadStationsData(${totalPages}); return false;">${totalPages}</a></li>`;
    }
    
    // Next page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadStationsData(${currentPage + 1}); return false;">
                <i class="fas fa-angle-right"></i>
            </a>
        </li>
    `;
    
    // Last page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadStationsData(${totalPages}); return false;">
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
    
    // Push state to browser history for station detail view (default to details tab)
    const url = `/cms.html?module=charging-stations&station=${stationId}&tab=details`;
    window.history.pushState({ module: 'charging-stations', stationId: stationId, view: 'detail', tab: 'details' }, '', url);
    
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
window.loadStationsData = loadStationsData;
window.editStation = editStation;
window.viewStation = viewStation;
window.deleteStation = deleteStation;
window.openAddStationForm = openAddStationForm;
window.loadChargingStationsModule = loadChargingStationsModule;

