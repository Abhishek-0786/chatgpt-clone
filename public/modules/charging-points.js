// Charging Points Module
import { getChargingPoints, deleteChargingPoint } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showSuccess, showError, showConfirm } from '../utils/notifications.js';

// Global variables for auto-refresh
let pointsRefreshInterval = null;
let currentPointsPage = 1;
let currentPointsLimit = 10;

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
    const url = `/cms.html?module=charging-stations&station=${stationId}`;
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
            
            #pointsTable {
                width: 100%;
                min-width: 1500px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: #ffffff;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #pointsTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
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
                border-bottom: 1px solid #e0e0e0;
                transition: background-color 0.2s;
                background-color: #ffffff;
            }
            
            #pointsTable tbody tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            
            #pointsTable tbody tr:hover {
                background-color: #e9ecef;
            }
            
            #pointsTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid #f0f0f0;
                color: #333;
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #pointsTable tbody td:last-child {
                border-right: none;
            }
            
            #pointsTable tbody td a {
                color: #000000;
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            #pointsTable tbody td a:hover {
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
            
            .status-faulted {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .c-status {
                color: #333;
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
                margin-right: 5px;
            }
            
            .action-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
        </style>
        
        <div id="charging-points-content">
            <div class="points-header">
                <h2>Charging Points</h2>
                <button class="btn btn-primary" id="addChargingPointBtn">
                    <i class="fas fa-plus me-2"></i>ADD NEW
                </button>
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
                    <span id="showingTextPoints" style="color: #666; font-size: 14px;">Showing 0-0 of 0 Charging Points</span>
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
    
    // Load points data
    loadPointsData();
    
    // Set up auto-refresh every 10 seconds
    pointsRefreshInterval = setInterval(() => {
        // Only refresh if we're still on the points list (not on detail view)
        const urlParams = new URLSearchParams(window.location.search);
        const module = urlParams.get('module');
        const pointId = urlParams.get('point');
        
        if (module === 'charging-points' && !pointId) {
            // We're on the points list, refresh with current page
            loadPointsData(currentPointsPage, currentPointsLimit);
        }
    }, 10000);
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
export async function loadPointsData(page = 1, limit = 10) {
    try {
        // Update current page and limit for auto-refresh
        currentPointsPage = page;
        currentPointsLimit = limit;
        
        // Use API service to get charging points from backend
        const data = await getChargingPoints({ page, limit });
        
        // Map backend response to frontend format
        const formattedData = {
            points: data.points.map(point => ({
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
            total: data.total,
            page: data.page,
            limit: data.limit,
            totalPages: data.totalPages
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
    
    // First page
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadPointsData(1); return false;">
                <i class="fas fa-angle-double-left"></i>
            </a>
        </li>
    `;
    
    // Previous page
    html += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadPointsData(${currentPage - 1}); return false;">
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
        html += `<li class="page-item"><a class="page-link" href="#" onclick="window.loadPointsData(1); return false;">1</a></li>`;
        if (startPage > 2) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="window.loadPointsData(${i}); return false;">${i}</a>
            </li>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        html += `<li class="page-item"><a class="page-link" href="#" onclick="window.loadPointsData(${totalPages}); return false;">${totalPages}</a></li>`;
    }
    
    // Next page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadPointsData(${currentPage + 1}); return false;">
                <i class="fas fa-angle-right"></i>
            </a>
        </li>
    `;
    
    // Last page
    html += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="window.loadPointsData(${totalPages}); return false;">
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
    
    // Push state to browser history for point detail view (default to details tab)
    const url = `/cms.html?module=charging-points&point=${chargingPointId}&tab=details`;
    window.history.pushState({ module: 'charging-points', chargingPointId: chargingPointId, view: 'detail', tab: 'details' }, '', url);
    
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
            // Reload points list to reflect the change
            loadPointsData();
        } else {
            showError(response.error || 'Failed to delete charging point');
        }
    } catch (error) {
        console.error('Error deleting charging point:', error);
        showError(error.message || 'Failed to delete charging point');
    }
}

// Make functions globally available for onclick handlers
window.loadPointsData = loadPointsData;
window.editPoint = editPoint;
window.viewPoint = viewPoint;
window.deletePoint = deletePoint;
window.viewStationFromPoints = viewStationFromPoints;

