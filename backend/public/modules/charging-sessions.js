// Charging Sessions Module
import { getActiveSessions, getCompletedSessions } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';

// Global variables for sorting
let currentSessionsSortField = null;
let currentSessionsSortDirection = 'asc';

// Export main function to load module
export function loadChargingSessionsModule() {
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            #charging-sessions-content {
                width: 100%;
            }
            
            .sessions-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .sessions-header h2 {
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
            
            #sessionsTable {
                width: 100%;
                min-width: 1750px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #sessionsTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] #sessionsTable thead {
                background-color: #1a1a1a;
            }
            
            #sessionsTable thead th {
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
            
            #sessionsTable thead th:last-child {
                border-right: none;
            }
            
            #sessionsTable tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            #sessionsTable tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            #sessionsTable tbody tr:hover {
                background-color: var(--hover-bg);
            }
            
            #sessionsTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #sessionsTable tbody td:last-child {
                border-right: none;
            }
            
            #sessionsTable tbody td a {
                color: var(--text-primary);
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            #sessionsTable tbody td a:hover {
                color: #007bff;
                text-decoration: underline;
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
            
            .sessions-header h2 {
                color: var(--text-primary);
            }
            
            [data-theme="dark"] .tabs-list {
                border-bottom-color: var(--border-color) !important;
            }
            
            [data-theme="dark"] .tab-item {
                color: var(--text-secondary) !important;
            }
            
            [data-theme="dark"] .tab-item.active {
                color: #007bff !important;
            }
            
            #showingTextPagination {
                color: var(--text-secondary) !important;
            }
        </style>
        
        <div id="charging-sessions-content">
            <div class="sessions-header">
                <h2>Charging Sessions</h2>
            </div>
            
            <!-- Tabs -->
            <div class="tabs-container" style="margin-bottom: 20px;">
                <ul class="tabs-list" style="display: flex; gap: 10px; border-bottom: 2px solid var(--border-color); margin: 0; padding: 0; list-style: none;">
                    <li class="tab-item active" data-tab="active" onclick="window.switchSessionsTab('active')" style="padding: 12px 24px; cursor: pointer; border-bottom: 3px solid #007bff; font-weight: 600; color: #007bff; transition: all 0.2s;">
                        ACTIVE SESSIONS
                    </li>
                    <li class="tab-item" data-tab="completed" onclick="window.switchSessionsTab('completed')" style="padding: 12px 24px; cursor: pointer; border-bottom: 3px solid transparent; font-weight: 600; color: var(--text-secondary); transition: all 0.2s;">
                        COMPLETED SESSIONS
                    </li>
                </ul>
            </div>
            
            <div class="filters-section">
                <input type="text" class="search-input" id="sessionSearch" placeholder="Search by Station Name, Device ID, Session ID, or Transaction ID" onkeyup="window.applyFilters()">
                <div class="date-input-group" id="dateFilters" style="display: none;">
                    <input type="date" class="date-input" id="fromDate" onchange="window.handleSessionsFromDateChange()">
                    <span>From</span>
                    <input type="date" class="date-input" id="toDate" onchange="window.handleSessionsToDateChange()">
                    <span>To</span>
                    <select class="sort-select" id="sessionSort" style="display: none;">
                        <option value="">Sort By</option>
                        <option value="duration-asc">Session Duration (Low to High)</option>
                        <option value="duration-desc">Session Duration (High to Low)</option>
                        <option value="billedAmount-asc">Billed Amount (Low to High)</option>
                        <option value="billedAmount-desc">Billed Amount (High to Low)</option>
                        <option value="energy-asc">Energy (Low to High)</option>
                        <option value="energy-desc">Energy (High to Low)</option>
                    </select>
                    <button class="apply-btn" onclick="window.applyFilters()">APPLY</button>
                </div>
            </div>
            
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table id="sessionsTable">
                    <thead id="sessionsTableHead">
                        <!-- Table header will be dynamically generated -->
                    </thead>
                    <tbody id="sessionsTableBody">
                        <tr>
                            <td colspan="15" class="text-center" style="padding: 40px;" id="loadingRow">
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
                    <span id="showingTextPagination" style="color: var(--text-secondary); font-size: 14px;">Showing 0-0 of 0</span>
                </div>
                <nav>
                    <ul class="pagination mb-0" id="paginationSessions">
                        <!-- Pagination will be generated here -->
                    </ul>
                </nav>
            </div>
        </div>
    `;
    
    // Load active sessions by default
    window.currentSessionsTab = 'active';
    generateTableHeader();
    
    // Set max date to today for both date inputs
    setupSessionsDatePickers();
    
    loadSessionsData();
}

// Setup date pickers with max date and min date logic
function setupSessionsDatePickers() {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    
    if (fromDateInput) {
        fromDateInput.setAttribute('max', todayString);
    }
    
    if (toDateInput) {
        toDateInput.setAttribute('max', todayString);
    }
}

// Handle From Date change - update To Date min attribute
export function handleSessionsFromDateChange() {
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    
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
export function handleSessionsToDateChange() {
    const fromDateInput = document.getElementById('fromDate');
    const toDateInput = document.getElementById('toDate');
    
    if (!fromDateInput || !toDateInput) return;
    
    const fromDate = fromDateInput.value;
    const toDate = toDateInput.value;
    
    if (fromDate && toDate && toDate < fromDate) {
        // If "To Date" is before "From Date", clear it and show warning
        toDateInput.value = '';
        // Import showWarning dynamically to avoid circular dependency
        import('../utils/notifications.js').then(module => {
            module.showWarning('"To Date" cannot be before "From Date". Please select a valid date.');
        });
    }
}

// Generate table header based on current tab
function generateTableHeader() {
    const thead = document.getElementById('sessionsTableHead');
    const currentTab = window.currentSessionsTab || 'active';
    const colspan = currentTab === 'active' ? 16 : 18;
    
    let headerHTML = '<tr>';
    headerHTML += '<th>S.NO</th>';
    headerHTML += '<th>Station Name</th>';
    headerHTML += '<th>Energy (kWh)</th>';
    headerHTML += '<th>Entered Amount (₹)</th>';
    headerHTML += '<th>Billed Amount (₹)</th>';
    headerHTML += '<th>Base Charge</th>';
    headerHTML += '<th>Tax (%)</th>';
    headerHTML += '<th>Refund (₹)</th>';
    headerHTML += '<th>Mode</th>';
    headerHTML += '<th>Vehicle</th>';
    headerHTML += '<th>Session Duration</th>';
    
    // Only show Stop Reason and End Time for completed sessions
    if (currentTab === 'completed') {
        headerHTML += '<th>Stop Reason</th>';
    }
    
    headerHTML += '<th>Start Time</th>';
    
    // Only show End Time for completed sessions
    if (currentTab === 'completed') {
        headerHTML += '<th>End Time</th>';
    }
    
    headerHTML += '<th>Device ID</th>';
    headerHTML += '<th>Connector ID</th>';
    headerHTML += '<th>Transaction ID</th>';
    headerHTML += '<th>Session ID</th>';
    headerHTML += '</tr>';
    
    thead.innerHTML = headerHTML;
    
    // Update loading row colspan if it exists
    const loadingRow = document.getElementById('loadingRow');
    if (loadingRow) {
        loadingRow.setAttribute('colspan', colspan);
    }
}

// Switch between Active and Completed tabs
export function switchSessionsTab(tabName) {
    window.currentSessionsTab = tabName;
    
    // Update tab UI
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-tab') === tabName) {
            item.classList.add('active');
            item.style.borderBottomColor = '#007bff';
            item.style.color = '#007bff';
        } else {
            item.style.borderBottomColor = 'transparent';
            item.style.color = '#666';
        }
    });
    
    // Show/hide date filters (only for completed sessions)
    const dateFilters = document.getElementById('dateFilters');
    if (dateFilters) {
        dateFilters.style.display = tabName === 'completed' ? 'flex' : 'none';
        // Setup date pickers when filters are shown
        if (tabName === 'completed') {
            setupSessionsDatePickers();
            // Show sort dropdown for completed sessions
            const sortSelect = document.getElementById('sessionSort');
            if (sortSelect) {
                sortSelect.style.display = 'block';
            }
        } else {
            // Hide sort dropdown for active sessions
            const sortSelect = document.getElementById('sessionSort');
            if (sortSelect) {
                sortSelect.style.display = 'none';
            }
        }
    }
    
    // Regenerate table header based on current tab
    generateTableHeader();
    
    // Reset filters and reload data
    document.getElementById('sessionSearch').value = '';
    document.getElementById('fromDate').value = '';
    document.getElementById('toDate').value = '';
    const sortSelect = document.getElementById('sessionSort');
    if (sortSelect) {
        sortSelect.value = '';
    }
    currentSessionsSortField = null;
    currentSessionsSortDirection = 'asc';
    loadSessionsData();
}

// Export filter function
export function applyFilters() {
    // Get filter values
    const searchTerm = document.getElementById('sessionSearch')?.value || '';
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    const sortSelect = document.getElementById('sessionSort')?.value || '';
    
    // Parse sort value
    if (sortSelect) {
        const [sortField, sortDirection] = sortSelect.split('-');
        currentSessionsSortField = sortField;
        currentSessionsSortDirection = sortDirection || 'asc';
    } else {
        currentSessionsSortField = null;
        currentSessionsSortDirection = 'asc';
    }
    
    // Reload data with filters
    const currentTab = window.currentSessionsTab || 'active';
    loadSessionsData(1, 10, searchTerm, fromDate, toDate);
}

// Export data loading function
export async function loadSessionsData(page = 1, limit = 10, searchTerm = '', fromDate = '', toDate = '') {
    try {
        const currentTab = window.currentSessionsTab || 'active';
        
        // Check if we need to fetch all data for client-side sorting (only for completed sessions)
        const hasClientSideFilters = currentTab === 'completed' && (currentSessionsSortField || fromDate || toDate);
        
        let allSessions = [];
        let totalSessions = 0;
        
        if (hasClientSideFilters) {
            // Fetch all sessions for client-side sorting/filtering
            let hasMore = true;
            let currentPage = 1;
            const fetchLimit = 100; // Fetch in batches
            
            while (hasMore) {
                const batchData = await getCompletedSessions({ 
                    page: currentPage, 
                    limit: fetchLimit, 
                    search: searchTerm, 
                    fromDate: '', 
                    toDate: '' // Don't filter by date on backend, we'll do it client-side
                });
                
                if (batchData.success && batchData.sessions) {
                    allSessions = allSessions.concat(batchData.sessions);
                    totalSessions = batchData.total || allSessions.length;
                    
                    if (batchData.sessions.length < fetchLimit || allSessions.length >= totalSessions) {
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
            let data;
            if (currentTab === 'active') {
                // Load active sessions
                data = await getActiveSessions({ page, limit, search: searchTerm });
            } else {
                // Load completed sessions
                data = await getCompletedSessions({ page, limit, search: searchTerm, fromDate, toDate });
            }
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load sessions');
            }
            
            allSessions = data.sessions || [];
            totalSessions = data.total || 0;
        }
        
        // Apply client-side date filtering if needed
        let filteredSessions = allSessions;
        
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filteredSessions = filteredSessions.filter(session => {
                const sessionDate = new Date(session.startTime);
                sessionDate.setHours(0, 0, 0, 0);
                return sessionDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filteredSessions = filteredSessions.filter(session => {
                const sessionDate = new Date(session.startTime);
                return sessionDate <= to;
            });
        }
        
        // Apply sorting if sort field is set (only for completed sessions)
        if (currentTab === 'completed' && currentSessionsSortField) {
            filteredSessions = sortSessionsData(filteredSessions, currentSessionsSortField, currentSessionsSortDirection);
        }
        
        // Apply client-side pagination if filters are active
        let paginatedSessions = filteredSessions;
        let totalPages = 1;
        let total;
        
        if (hasClientSideFilters) {
            // When using client-side filtering, total is the filtered count
            total = filteredSessions.length;
            totalPages = Math.ceil(total / limit);
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            paginatedSessions = filteredSessions.slice(startIndex, endIndex);
        } else {
            // When using server-side pagination, total comes from API
            total = totalSessions;
            totalPages = Math.ceil(totalSessions / limit);
        }
        
        const displayData = {
            sessions: paginatedSessions,
            total: total,
            page: page,
            limit: limit,
            totalPages: totalPages
        };
        
        displaySessions(displayData);
    } catch (error) {
        console.error('Error loading sessions:', error);
        const currentTab = window.currentSessionsTab || 'active';
        const colspan = currentTab === 'active' ? 16 : 18;
        document.getElementById('sessionsTableBody').innerHTML = `
            <tr>
                <td colspan="${colspan}" class="text-center text-danger">
                    Error loading charging sessions: ${error.message || 'Please try again.'}
                </td>
            </tr>
        `;
    }
}

// Legacy mock data function (kept for reference, not used)
function loadSessionsDataMock(page = 1, limit = 10, searchTerm = '', fromDate = '', toDate = '') {
    try {
        // Mock data for now (will be replaced when API is ready)
        let allSessions = [
            {
                id: 1,
                stationName: "Spring House",
                energy: 0.04,
                enteredAmount: 0.00,
                billedAmount: 0.77,
                refund: 0.00,
                mode: "OCPI",
                sessionDuration: "00:03:08",
                stopReason: "Remote",
                interpretedReason: "Software Testing",
                startTime: "2025-11-03T14:48:00Z",
                endTime: "2025-11-03T14:51:00Z",
                deviceId: "1CEVCHAC31506",
                connectorId: 1,
                transactionId: "1118634",
                lastSOC: 0,
                sessionId: "69087372298f3df12dddf99a"
            },
            {
                id: 2,
                stationName: "Spring House",
                energy: 0.06,
                enteredAmount: 0.00,
                billedAmount: 1.03,
                refund: 0.00,
                mode: "APP",
                sessionDuration: "00:04:52",
                stopReason: "Remote",
                interpretedReason: "User Request",
                startTime: "2025-11-03T14:40:00Z",
                endTime: "2025-11-03T14:45:00Z",
                deviceId: "1CEVCHAC31506",
                connectorId: 1,
                transactionId: "1118633",
                lastSOC: 0,
                sessionId: "69085362298f3df12dddf99a"
            },
            {
                id: 3,
                stationName: "Spring House",
                energy: 0.23,
                enteredAmount: 50.00,
                billedAmount: 3.7,
                refund: 0.00,
                mode: "HUB",
                sessionDuration: "00:16:20",
                stopReason: "PowerLoss",
                interpretedReason: "Charger Not Responding",
                startTime: "2025-10-30T17:30:00Z",
                endTime: "2025-10-30T17:34:00Z",
                deviceId: "1CEVCHAC31506",
                connectorId: 1,
                transactionId: "1118632",
                lastSOC: 0,
                sessionId: "69075362298f3df12dddf99a"
            },
            {
                id: 4,
                stationName: "TEST Station",
                energy: 0.15,
                enteredAmount: 0.00,
                billedAmount: 2.5,
                refund: 0.00,
                mode: "APP",
                sessionDuration: "00:12:30",
                stopReason: "Remote",
                interpretedReason: "User Request",
                startTime: "2025-11-02T10:20:00Z",
                endTime: "2025-11-02T10:32:00Z",
                deviceId: "EVPLUGAC76061",
                connectorId: 1,
                transactionId: "1118631",
                lastSOC: 0,
                sessionId: "69064362298f3df12dddf99a"
            },
            {
                id: 5,
                stationName: "Stellar EV Charging Station",
                energy: 0.08,
                enteredAmount: 0.00,
                billedAmount: 1.5,
                refund: 0.00,
                mode: "OCPI",
                sessionDuration: "00:08:15",
                stopReason: "Remote",
                interpretedReason: "Software Testing",
                startTime: "2025-11-01T15:00:00Z",
                endTime: "2025-11-01T15:08:00Z",
                deviceId: "687f475c2d0229e4cdd12744",
                connectorId: 1,
                transactionId: "1118630",
                lastSOC: 0,
                sessionId: "69053362298f3df12dddf99a"
            }
        ];
        
        // Apply filters
        let filteredSessions = allSessions;
        
        // Filter by search term
        if (searchTerm) {
            filteredSessions = filteredSessions.filter(session => 
                session.stationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                session.deviceId.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        // Filter by date range
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filteredSessions = filteredSessions.filter(session => {
                const sessionDate = new Date(session.startTime);
                sessionDate.setHours(0, 0, 0, 0);
                return sessionDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filteredSessions = filteredSessions.filter(session => {
                const sessionDate = new Date(session.startTime);
                return sessionDate <= to;
            });
        }
        
        // Pagination
        const total = filteredSessions.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedSessions = filteredSessions.slice(startIndex, endIndex);
        
        const mockData = {
            sessions: paginatedSessions,
            total: total,
            page: page,
            limit: limit,
            totalPages: totalPages
        };
        
        displaySessions(mockData);
    } catch (error) {
        console.error('Error loading sessions:', error);
        document.getElementById('sessionsTableBody').innerHTML = `
            <tr>
                <td colspan="15" class="text-center text-danger">
                    Error loading charging sessions. Please try again.
                </td>
            </tr>
        `;
    }
}

// Helper function to convert duration string (HH:MM:SS) to seconds for sorting
function durationToSeconds(duration) {
    if (!duration || duration === 'N/A') return 0;
    const parts = duration.split(':');
    if (parts.length !== 3) return 0;
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseInt(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}

// Sort sessions data
function sortSessionsData(sessions, sortField, sortDirection) {
    if (!sortField || !sessions || sessions.length === 0) return sessions;
    
    const sorted = [...sessions].sort((a, b) => {
        let aValue, bValue;
        
        switch(sortField) {
            case 'duration':
                // Convert duration string to seconds for comparison
                aValue = durationToSeconds(a.sessionDuration);
                bValue = durationToSeconds(b.sessionDuration);
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

// Export display function
export function displaySessions(data) {
    const tbody = document.getElementById('sessionsTableBody');
    const showingPagination = document.getElementById('showingTextPagination');
    const currentTab = window.currentSessionsTab || 'active';
    const colspan = currentTab === 'active' ? 16 : 18;
    
    if (!data.sessions || data.sessions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${colspan}" class="text-center">No charging sessions found</td>
            </tr>
        `;
        showingPagination.textContent = 'Showing 0-0 of 0';
        return;
    }
    
    tbody.innerHTML = data.sessions.map((session, index) => {
        const serialNo = (data.page - 1) * data.limit + index + 1;
        
        const startTime = formatDate(session.startTime);
        const endTime = session.endTime ? formatDate(session.endTime) : 'N/A';
        
        // Format currency symbol
        const currencySymbol = session.currency === 'USD' ? '$' : '₹';
        
        // Determine vehicle display: show "N/A" if mode is "CMS", otherwise show vehicle info
        let vehicleDisplay = 'N/A';
        if (session.mode !== 'CMS' && session.vehicle && session.vehicle !== 'N/A') {
            vehicleDisplay = session.vehicle;
        }
        
        let rowHTML = `
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
                <td>${vehicleDisplay}</td>
                <td>${session.sessionDuration || 'N/A'}</td>
        `;
        
        // Only show Stop Reason for completed sessions
        if (currentTab === 'completed') {
            rowHTML += `<td>${session.stopReason || 'N/A'}</td>`;
        }
        
        rowHTML += `<td>${startTime}</td>`;
        
        // Only show End Time for completed sessions
        if (currentTab === 'completed') {
            rowHTML += `<td>${endTime}</td>`;
        }
        
        rowHTML += `
                <td>${session.deviceId || 'N/A'}</td>
                <td>${session.connectorId || 'N/A'}</td>
                <td>${session.transactionId || 'N/A'}</td>
                <td><a href="#" onclick="window.viewSession('${session.sessionId}'); return false;">${session.sessionId || 'N/A'}</a></td>
            </tr>
        `;
        
        return rowHTML;
    }).join('');
    
    // Update showing text
    const start = (data.page - 1) * data.limit + 1;
    const end = Math.min(data.page * data.limit, data.total);
    showingPagination.textContent = `Showing ${start}-${end} of ${data.total}`;
    
    // Generate pagination
    generateSessionsPagination(data.page, data.totalPages);
}

// Export pagination function
export function generateSessionsPagination(currentPage, totalPages) {
    const pagination = document.getElementById('paginationSessions');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    // Get current filter values
    const searchTerm = document.getElementById('sessionSearch')?.value || '';
    const fromDate = document.getElementById('fromDate')?.value || '';
    const toDate = document.getElementById('toDate')?.value || '';
    
    // Helper function to create pagination link with filters
    const createPageLink = (pageNum) => {
        return `window.loadSessionsData(${pageNum}, 10, '${searchTerm}', '${fromDate}', '${toDate}'); return false;`;
    };
    
    let html = '';
    
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
export function viewSession(sessionId) {
    // TODO: Implement view session details
    alert(`View session ${sessionId}`);
}

// Make functions globally available for onclick handlers
window.loadSessionsData = loadSessionsData;
window.applyFilters = applyFilters;
window.viewSession = viewSession;
window.switchSessionsTab = switchSessionsTab;
window.handleSessionsFromDateChange = handleSessionsFromDateChange;
window.handleSessionsToDateChange = handleSessionsToDateChange;

