// Organizations Module
import { getOrganizations, createOrganization, updateOrganization, deleteOrganization } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showSuccess, showError, showConfirm } from '../utils/notifications.js';
import { openAddOrganizationForm, openEditOrganizationForm } from './add-organization-form.js';

// Global variables
let currentPage = 1;
let currentLimit = 10;
let currentSearch = '';
let currentSort = '';
let currentFromDate = '';
let currentToDate = '';
let currentTotal = 0;
let currentTotalPages = 0;
let editingOrganizationId = null;

// Export main function to load module
export function loadOrganizationsModule() {
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            #organizations-content {
                width: 100%;
            }
            
            .organizations-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .organizations-header h2 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .add-org-btn {
                padding: 10px 24px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .add-org-btn:hover {
                background-color: #0056b3;
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
                min-width: 200px;
            }
            
            [data-theme="dark"] .sort-select {
                background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e0e0e0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            }
            
            .sort-select:focus {
                outline: none;
                border-color: var(--input-border);
                box-shadow: none;
            }
            
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
            
            #organizationsTable {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #organizationsTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] #organizationsTable thead {
                background-color: #1a1a1a;
            }
            
            #organizationsTable thead th {
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
            
            #organizationsTable thead th:last-child {
                border-right: none;
            }
            
            #organizationsTable tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            #organizationsTable tbody tr.clickable-row {
                cursor: pointer;
            }
            
            #organizationsTable tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            #organizationsTable tbody tr.clickable-row:hover {
                background-color: var(--hover-bg);
            }
            
            #organizationsTable tbody tr.clickable-row:nth-child(even):hover {
                background-color: var(--hover-bg);
            }
            
            #organizationsTable tbody tr .action-column {
                cursor: default;
            }
            
            #organizationsTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #organizationsTable tbody td:last-child {
                border-right: none;
            }
            
            .action-buttons {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            
            .action-btn {
                padding: 6px 12px;
                border-radius: 4px;
                transition: all 0.2s;
                cursor: pointer;
                border: 1px solid;
                background-color: transparent;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                width: 32px;
                height: 32px;
            }
            
            .action-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 4px var(--shadow);
            }
            
            .btn-outline-primary {
                color: #007bff;
                border-color: #007bff;
            }
            
            .btn-outline-primary:hover {
                background-color: #007bff;
                color: white;
            }
            
            .btn-outline-danger {
                color: #dc3545;
                border-color: #dc3545;
            }
            
            .btn-outline-danger:hover {
                background-color: #dc3545;
                color: white;
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
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .pagination .page-link {
                color: #007bff;
                border: 1px solid var(--border-color);
                background-color: var(--card-bg);
                padding: 8px 14px;
                margin: 0 2px;
                border-radius: 4px;
                transition: all 0.2s;
                cursor: pointer;
                text-decoration: none;
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
            
            /* Modal Styles */
            .modal-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 1000;
                align-items: center;
                justify-content: center;
            }
            
            .modal-overlay.active {
                display: flex;
            }
            
            .modal-content {
                background-color: var(--card-bg);
                border-radius: 8px;
                padding: 30px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .modal-header h3 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--text-primary);
            }
            
            .close-btn {
                background: none;
                border: none;
                font-size: 24px;
                color: var(--text-secondary);
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .close-btn:hover {
                color: var(--text-primary);
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: var(--text-primary);
                font-size: 14px;
            }
            
            .form-group input {
                width: 100%;
                padding: 10px 15px;
                border: 1px solid var(--input-border);
                border-radius: 4px;
                font-size: 14px;
                background-color: var(--input-bg);
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-group input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .modal-actions {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                margin-top: 30px;
            }
            
            .modal-btn {
                padding: 10px 24px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .modal-btn-primary {
                background-color: #007bff;
                color: white;
            }
            
            .modal-btn-primary:hover {
                background-color: #0056b3;
            }
            
            .modal-btn-secondary {
                background-color: var(--bg-tertiary);
                color: var(--text-primary);
                border: 1px solid var(--border-color);
            }
            
            .modal-btn-secondary:hover {
                background-color: var(--hover-bg);
            }
        </style>
        
        <div id="organizations-content">
            <div class="organizations-header">
                <h2>Organizations</h2>
                <button class="add-org-btn" onclick="window.openAddOrganizationForm()">
                    <i class="fas fa-plus"></i> Add Organization
                </button>
            </div>
            
            <!-- Filters Section -->
            <div class="filters-section">
                <input type="text" class="search-input" id="organizationSearch" placeholder="Search by organization name" onkeyup="if(event.key === 'Enter') window.applyOrganizationFilters()">
                <div class="date-input-group">
                    <input type="date" class="date-input" id="organizationFromDate" onchange="window.handleOrganizationFromDateChange()">
                    <span>From</span>
                    <input type="date" class="date-input" id="organizationToDate" onchange="window.handleOrganizationToDateChange()">
                    <span>To</span>
                </div>
                <select class="sort-select" id="organizationSort">
                    <option value="">Sort By</option>
                    <option value="sessions-asc">Sessions (Low to High)</option>
                    <option value="sessions-desc">Sessions (High to Low)</option>
                    <option value="energy-asc">Energy (Low to High)</option>
                    <option value="energy-desc">Energy (High to Low)</option>
                    <option value="billedAmount-asc">Billed Amount (Low to High)</option>
                    <option value="billedAmount-desc">Billed Amount (High to Low)</option>
                </select>
                <button class="apply-btn" onclick="window.applyOrganizationFilters()">APPLY</button>
            </div>
            
            <!-- Main Organizations Table -->
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table id="organizationsTable">
                    <thead>
                        <tr>
                            <th>S.NO</th>
                            <th>ORGANIZATION NAME</th>
                            <th>STATIONS</th>
                            <th>CHARGERS</th>
                            <th>SESSIONS</th>
                            <th>ENERGY (kWh)</th>
                            <th>BILLED AMOUNT (₹)</th>
                            <th>CREATED AT</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>
                    <tbody id="organizationsTableBody">
                        <tr>
                            <td colspan="9" class="text-center" style="padding: 40px;">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Pagination -->
            <div class="table-footer" id="organizationsPagination" style="display: none;">
                <div class="pagination-info" style="color: var(--text-secondary); font-size: 14px;">
                    Showing <span id="paginationStart">0</span> to <span id="paginationEnd">0</span> of <span id="paginationTotal">0</span> organizations
                </div>
                <div class="pagination" id="paginationControls"></div>
            </div>
        </div>
        
    `;
    
    // Load organizations data
    loadOrganizationsData();
    
    // Setup global functions
    setupGlobalFunctions();
}

// Setup global functions
function setupGlobalFunctions() {
    window.applyOrganizationFilters = applyOrganizationFilters;
    window.handleOrganizationFromDateChange = handleOrganizationFromDateChange;
    window.handleOrganizationToDateChange = handleOrganizationToDateChange;
    window.openAddOrganizationForm = openAddOrganizationForm;
    window.editOrganization = editOrganization;
    window.deleteOrganizationHandler = deleteOrganizationHandler;
    window.viewOrganizationDetail = viewOrganizationDetail;
}

// View organization detail
async function viewOrganizationDetail(organizationId) {
    try {
        const detailModule = await import('./organization-detail-view.js');
        detailModule.loadOrganizationDetailView(organizationId, 'details');
    } catch (error) {
        console.error('Error loading organization detail view:', error);
        showError('Failed to load organization details');
    }
}

// Load organizations data
async function loadOrganizationsData() {
    try {
        const response = await getOrganizations({
            page: currentPage,
            limit: currentLimit,
            search: currentSearch,
            sort: currentSort,
            fromDate: currentFromDate,
            toDate: currentToDate
        });
        
        if (response.success) {
            currentTotal = response.total;
            currentTotalPages = response.totalPages;
            renderOrganizationsTable(response.organizations);
            renderPagination();
        } else {
            showError('Failed to load organizations');
        }
    } catch (error) {
        console.error('Error loading organizations:', error);
        showError(error.message || 'Failed to load organizations');
    }
}

// Render organizations table
function renderOrganizationsTable(organizations) {
    const tbody = document.getElementById('organizationsTableBody');
    
    if (!organizations || organizations.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 40px; color: var(--text-secondary);">
                    No organizations found
                </td>
            </tr>
        `;
        const paginationContainer = document.getElementById('organizationsPagination');
        if (paginationContainer) {
            paginationContainer.style.display = 'none';
        }
        return;
    }
    
    // Pagination visibility is handled in renderPagination function
    
    tbody.innerHTML = organizations.map((org, index) => {
        const serialNo = (currentPage - 1) * currentLimit + index + 1;
        return `
            <tr class="clickable-row" onclick="window.viewOrganizationDetail(${org.id});">
                <td>${serialNo}</td>
                <td>
                    ${org.organizationName || '-'}
                </td>
                <td>${org.stations || 0}</td>
                <td>${org.chargers || 0}</td>
                <td>${org.sessions || 0}</td>
                <td>${(org.energy || 0).toFixed(2)}</td>
                <td>₹${(org.billedAmount || 0).toFixed(2)}</td>
                <td>${formatDate(org.createdAt)}</td>
                <td class="action-column" onclick="event.stopPropagation();">
                    <div class="action-buttons">
                        <button class="action-btn btn-outline-primary" onclick="window.editOrganization(${org.id}, '${org.organizationName.replace(/'/g, "\\'")}'); return false;" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn btn-outline-danger" onclick="window.deleteOrganizationHandler(${org.id}, '${org.organizationName.replace(/'/g, "\\'")}'); return false;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Render pagination
function renderPagination() {
    const paginationControls = document.getElementById('paginationControls');
    const paginationStart = document.getElementById('paginationStart');
    const paginationEnd = document.getElementById('paginationEnd');
    const paginationTotal = document.getElementById('paginationTotal');
    const paginationContainer = document.getElementById('organizationsPagination');
    
    // Only show pagination if there are more than 10 items
    if (currentTotal <= currentLimit) {
        if (paginationContainer) {
            paginationContainer.style.display = 'none';
        }
        return;
    }
    
    if (paginationContainer) {
        paginationContainer.style.display = 'flex';
    }
    
    const start = (currentPage - 1) * currentLimit + 1;
    const end = Math.min(currentPage * currentLimit, currentTotal);
    
    paginationStart.textContent = start;
    paginationEnd.textContent = end;
    paginationTotal.textContent = currentTotal;
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <span class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); window.goToOrganizationPage(${currentPage - 1})" ${currentPage === 1 ? 'style="pointer-events: none;"' : ''}>
                Previous
            </a>
        </span>
    `;
    
    // Page numbers
    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(currentTotalPages, startPage + maxPages - 1);
    
    if (endPage - startPage < maxPages - 1) {
        startPage = Math.max(1, endPage - maxPages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <span class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); window.goToOrganizationPage(${i})">${i}</a>
            </span>
        `;
    }
    
    // Next button
    paginationHTML += `
        <span class="page-item ${currentPage === currentTotalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); window.goToOrganizationPage(${currentPage + 1})" ${currentPage === currentTotalPages ? 'style="pointer-events: none;"' : ''}>
                Next
            </a>
        </span>
    `;
    
    paginationControls.innerHTML = paginationHTML;
}

// Apply filters
function applyOrganizationFilters() {
    currentSearch = document.getElementById('organizationSearch').value.trim();
    currentSort = document.getElementById('organizationSort').value;
    currentFromDate = document.getElementById('organizationFromDate').value || '';
    currentToDate = document.getElementById('organizationToDate').value || '';
    currentPage = 1;
    loadOrganizationsData();
}

// Handle from date change
function handleOrganizationFromDateChange() {
    const fromDate = document.getElementById('organizationFromDate').value || '';
    const toDate = document.getElementById('organizationToDate').value || '';
    
    // If fromDate is after toDate, clear toDate
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        document.getElementById('organizationToDate').value = '';
    }
}

// Handle to date change
function handleOrganizationToDateChange() {
    const fromDate = document.getElementById('organizationFromDate').value || '';
    const toDate = document.getElementById('organizationToDate').value || '';
    
    // If toDate is before fromDate, clear fromDate
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
        document.getElementById('organizationFromDate').value = '';
    }
}

// Go to page
window.goToOrganizationPage = function(page) {
    if (page >= 1 && page <= currentTotalPages) {
        currentPage = page;
        loadOrganizationsData();
    }
};

// Edit organization
function editOrganization(id, name) {
    openEditOrganizationForm(id);
}

// Delete organization handler
async function deleteOrganizationHandler(id, name) {
    const confirmed = await showConfirm(
        `Are you sure you want to delete "${name}"?`,
        'This action cannot be undone. Make sure the organization has no stations before deleting.'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await deleteOrganization(id);
        
        if (response.success) {
            showSuccess('Organization deleted successfully');
            loadOrganizationsData();
        } else {
            showError(response.message || 'Failed to delete organization');
        }
    } catch (error) {
        console.error('Error deleting organization:', error);
        showError(error.message || 'Failed to delete organization');
    }
}

