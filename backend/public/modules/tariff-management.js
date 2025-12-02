// Tariff Management Module
import { getTariffs, deleteTariff as deleteTariffAPI } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showSuccess, showError, showWarning, showConfirm } from '../utils/notifications.js';

// Export main function to load module
export function loadTariffManagementModule() {
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            #tariff-management-content {
                width: 100%;
            }
            
            .tariff-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .tariff-header h2 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .filters-section {
                display: flex;
                gap: 15px;
                align-items: center;
                margin-bottom: 20px;
                flex-wrap: wrap;
                padding: 15px;
                background-color: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #e0e0e0;
            }
            
            .search-input {
                flex: 1;
                min-width: 250px;
                padding: 10px 15px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s;
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
                color: #666;
                font-size: 14px;
                font-weight: 500;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .date-input {
                padding: 10px 15px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s;
            }
            
            .date-input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
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
            
            .status-legend {
                display: flex;
                gap: 15px;
                align-items: center;
                font-size: 12px;
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
            
            .status-dot.active {
                background-color: #28a745;
            }
            
            .status-dot.inactive {
                background-color: #dc3545;
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
            
            #tariffTable {
                width: 100%;
                min-width: 1200px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: #ffffff;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #tariffTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            #tariffTable thead th {
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
            
            #tariffTable thead th:last-child {
                border-right: none;
            }
            
            #tariffTable tbody tr {
                border-bottom: 1px solid #e0e0e0;
                transition: background-color 0.2s;
                background-color: #ffffff;
            }
            
            #tariffTable tbody tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            
            #tariffTable tbody tr:hover {
                background-color: #e9ecef;
            }
            
            #tariffTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid #f0f0f0;
                color: #333;
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #tariffTable tbody td:last-child {
                border-right: none;
            }
            
            .tariff-id-cell {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .tariff-status-bar {
                width: 4px;
                height: 20px;
                border-radius: 2px;
                flex-shrink: 0;
            }
            
            .tariff-status-bar.active {
                background-color: #28a745;
            }
            
            .tariff-status-bar.inactive {
                background-color: #dc3545;
            }
            
            .tariff-id-text {
                color: #333;
                font-weight: 500;
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
        
        <div id="tariff-management-content">
            <div class="tariff-header">
                <h2>Tariff Management</h2>
                <button class="btn btn-primary" onclick="window.addNewTariff()">
                    <i class="fas fa-plus me-2"></i>ADD NEW
                </button>
            </div>
            
            <div class="filters-section">
                <input type="text" class="search-input" id="tariffSearch" placeholder="Search by tariff ID, tariff name" onkeyup="window.applyTariffFilters()">
                <div class="date-input-group">
                    <input type="date" class="date-input" id="tariffFromDate" onchange="window.handleFromDateChange()">
                    <span>From</span>
                    <input type="date" class="date-input" id="tariffToDate" onchange="window.handleToDateChange()">
                    <span>To</span>
                    <button class="apply-btn" onclick="window.applyTariffFilters()">APPLY</button>
                </div>
            </div>
            
            <div style="display: flex; justify-content: flex-end; margin-bottom: 4px;padding-right: 10px;">
                <div class="status-legend">
                    <div class="status-legend-item">
                        <span class="status-dot active"></span>
                        <span>Active</span>
                    </div>
                    <div class="status-legend-item">
                        <span class="status-dot inactive"></span>
                        <span>Inactive</span>
                    </div>
                </div>
            </div>
            
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table id="tariffTable">
                    <thead>
                        <tr>
                            <th>S.NO</th>
                            <th>Tariff ID</th>
                            <th>Tariff Name</th>
                            <th>Base charges (₹)</th>
                            <th>Tax (%)</th>
                            <th>Created by</th>
                            <th>Created At</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="tariffTableBody">
                        <tr>
                            <td colspan="8" class="text-center" style="padding: 40px;">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    // Set max date to today for both date inputs
    setupDatePickers();
    
    loadTariffData();
}

// Setup date pickers with max date and min date logic
function setupDatePickers() {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    const fromDateInput = document.getElementById('tariffFromDate');
    const toDateInput = document.getElementById('tariffToDate');
    
    if (fromDateInput) {
        fromDateInput.setAttribute('max', todayString);
    }
    
    if (toDateInput) {
        toDateInput.setAttribute('max', todayString);
    }
}

// Handle From Date change - update To Date min attribute
export function handleFromDateChange() {
    const fromDateInput = document.getElementById('tariffFromDate');
    const toDateInput = document.getElementById('tariffToDate');
    
    if (!fromDateInput || !toDateInput) return;
    
    const fromDate = fromDateInput.value;
    
    if (fromDate) {
        // Set min date of "To Date" to the selected "From Date"
        toDateInput.setAttribute('min', fromDate);
        
        // If "To Date" has a value that's before "From Date", clear it
        if (toDateInput.value && toDateInput.value < fromDate) {
            toDateInput.value = '';
        }
    } else {
        // If "From Date" is cleared, remove min restriction from "To Date"
        toDateInput.removeAttribute('min');
    }
}

// Handle To Date change - validate it's not before From Date
export function handleToDateChange() {
    const fromDateInput = document.getElementById('tariffFromDate');
    const toDateInput = document.getElementById('tariffToDate');
    
    if (!fromDateInput || !toDateInput) return;
    
    const fromDate = fromDateInput.value;
    const toDate = toDateInput.value;
    
    if (fromDate && toDate && toDate < fromDate) {
        // If "To Date" is before "From Date", clear it and show warning
        toDateInput.value = '';
        showWarning('"To Date" cannot be before "From Date". Please select a valid date.');
    }
}

// Export data loading function
export async function loadTariffData(searchTerm = '', fromDate = '', toDate = '') {
    try {
        // Build query parameters
        const params = {
            page: 1,
            limit: 100 // Max limit allowed by backend validation
        };
        
        // Add search parameter if provided
        if (searchTerm) {
            params.search = searchTerm;
        }
        
        // Use API service to get tariffs from backend
        const data = await getTariffs(params);
        
        // Extract tariffs from response
        let allTariffs = data.tariffs || [];
        
        // Apply date filters on frontend (backend doesn't support date filtering yet)
        let filteredTariffs = allTariffs;
        
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filteredTariffs = filteredTariffs.filter(tariff => {
                const tariffDate = new Date(tariff.createdAt);
                tariffDate.setHours(0, 0, 0, 0);
                return tariffDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filteredTariffs = filteredTariffs.filter(tariff => {
                const tariffDate = new Date(tariff.createdAt);
                return tariffDate <= to;
            });
        }
        
        displayTariffs(filteredTariffs);
    } catch (error) {
        console.error('Error loading tariffs:', error);
        document.getElementById('tariffTableBody').innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-danger">
                    Error loading tariffs: ${error.message || 'Please try again.'}
                </td>
            </tr>
        `;
    }
}

// Export display function
export function displayTariffs(tariffs) {
    const tbody = document.getElementById('tariffTableBody');
    
    if (!tariffs || tariffs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">No tariffs found</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = tariffs.map((tariff, index) => {
        const serialNo = index + 1;
        
        const createdAt = formatDate(tariff.createdAt);
        
        const statusClass = (tariff.status && tariff.status.toLowerCase() === 'active') ? 'active' : 'inactive';
        
        return `
            <tr>
                <td>${serialNo}</td>
                <td>
                    <div class="tariff-id-cell">
                        <div class="tariff-status-bar ${statusClass}"></div>
                        <span class="tariff-id-text">${tariff.tariffId}</span>
                    </div>
                </td>
                <td>${tariff.tariffName}</td>
                <td>${tariff.baseCharges.toFixed(2)}</td>
                <td>${tariff.tax}</td>
                <td>${tariff.createdBy || 'N/A'}</td>
                <td>${createdAt}</td>
                <td>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn btn-sm btn-outline-primary action-btn" onclick="window.editTariff('${tariff.tariffId}'); return false;" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger action-btn" onclick="window.deleteTariff('${tariff.tariffId}', '${tariff.tariffName}'); return false;" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Export filter function
export function applyTariffFilters() {
    const searchTerm = document.getElementById('tariffSearch')?.value || '';
    const fromDate = document.getElementById('tariffFromDate')?.value || '';
    const toDate = document.getElementById('tariffToDate')?.value || '';
    loadTariffData(searchTerm, fromDate, toDate);
}

// Export action functions and make them globally available
export function addNewTariff() {
    // Dynamically import and open the add tariff form
    import('./add-tariff-form.js').then(module => {
        module.openAddTariffForm();
    }).catch(error => {
        console.error('Error loading add tariff form:', error);
        showError('Error loading form. Please refresh the page.');
    });
}

export async function editTariff(tariffId) {
    // Dynamically import and open the edit tariff form
    try {
        const formModule = await import('./add-tariff-form.js');
        formModule.openEditTariffForm(tariffId);
    } catch (error) {
        console.error('Error loading edit tariff form:', error);
        showError('Error loading form. Please refresh the page.');
    }
}

// Soft delete tariff (sets deleted = true in database)
export async function deleteTariff(tariffId, tariffName) {
    // Show beautiful confirmation dialog
    const confirmed = await showConfirm(
        `Are you sure you want to delete "${tariffName}"?\n\nThis will hide the tariff from the list, but it will not be permanently deleted from the database.`,
        'Delete Tariff'
    );
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Call API to soft delete (update deleted column to true)
        const response = await deleteTariffAPI(tariffId);
        
        if (response.success) {
            showSuccess(`Tariff "${tariffName}" has been deleted successfully.`);
            // Reload tariff list to reflect the change
            loadTariffData();
        } else {
            showError(response.error || 'Failed to delete tariff');
        }
    } catch (error) {
        console.error('Error deleting tariff:', error);
        showError(error.message || 'Failed to delete tariff');
    }
}

// Make functions globally available for onclick handlers
window.loadTariffData = loadTariffData;
window.applyTariffFilters = applyTariffFilters;
window.addNewTariff = addNewTariff;
window.editTariff = editTariff;
window.deleteTariff = deleteTariff;
window.handleFromDateChange = handleFromDateChange;
window.handleToDateChange = handleToDateChange;

