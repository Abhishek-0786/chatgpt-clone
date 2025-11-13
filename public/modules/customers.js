// Customers Module
import { getCustomers, getCustomerWalletTransactions } from '../services/api.js';
import { formatDate, formatCurrency } from '../utils/helpers.js';

// Export main function to load module
export function loadCustomersModule() {
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            #customers-content {
                width: 100%;
            }
            
            .customers-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            
            .customers-header h2 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .tabs-container {
                margin-bottom: 20px;
                border-bottom: 2px solid #e0e0e0;
            }
            
            .tabs {
                display: flex;
                gap: 0;
                margin: 0;
                padding: 0;
                list-style: none;
            }
            
            .tab {
                padding: 12px 24px;
                cursor: pointer;
                border: none;
                background: none;
                font-size: 14px;
                font-weight: 600;
                color: #666;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .tab:hover {
                color: #007bff;
                background-color: #f8f9fa;
            }
            
            .tab.active {
                color: #007bff;
                border-bottom-color: #007bff;
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
            
            .export-btn {
                padding: 10px 20px;
                background-color: #28a745;
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
            
            .export-btn:hover {
                background-color: #218838;
            }
            
            .stats-note {
                font-size: 11px;
                color: #666;
                font-style: italic;
                margin-top: 5px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
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
            
            #customersTable, #walletTable {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: #ffffff;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #customersTable thead, #walletTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            #customersTable thead th, #walletTable thead th {
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
            
            #customersTable thead th:last-child, #walletTable thead th:last-child {
                border-right: none;
            }
            
            #customersTable tbody tr, #walletTable tbody tr {
                border-bottom: 1px solid #e0e0e0;
                transition: background-color 0.2s;
                background-color: #ffffff;
            }
            
            #customersTable tbody tr:nth-child(even), #walletTable tbody tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            
            #customersTable tbody tr:hover, #walletTable tbody tr:hover {
                background-color: #e9ecef;
            }
            
            #customersTable tbody td, #walletTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid #f0f0f0;
                color: #333;
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #customersTable tbody td:last-child, #walletTable tbody td:last-child {
                border-right: none;
            }
            
            #customersTable tbody td a {
                color: #000000;
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            #customersTable tbody td a:hover {
                color: #333333;
                text-decoration: underline;
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
                display: flex;
                align-items: center;
                gap: 10px;
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
            
            .go-to-page {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .go-to-page input {
                width: 60px;
                padding: 6px 10px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .go-to-page button {
                padding: 6px 16px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .go-to-page button:hover {
                background-color: #0056b3;
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
            }
            
            .transaction-type {
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .transaction-credit {
                background-color: #d1e7dd;
                color: #0f5132;
            }
            
            .transaction-debit {
                background-color: #f8d7da;
                color: #842029;
            }
            
            .transaction-hold {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .transaction-settlement {
                background-color: #cfe2ff;
                color: #084298;
            }
        </style>
        
        <div id="customers-content">
            <div class="customers-header">
                <h2>Customers</h2>
            </div>
            
            <div class="tabs-container">
                <ul class="tabs">
                    <li>
                        <button class="tab active" onclick="window.switchCustomerTab('details')">
                            Details of Customers
                        </button>
                    </li>
                    <li>
                        <button class="tab" onclick="window.switchCustomerTab('wallet')">
                            Wallet Transactions (Ledger)
                        </button>
                    </li>
                </ul>
            </div>
            
            <!-- Details Tab -->
            <div id="detailsTab" class="tab-content active">
                <div class="filters-section">
                    <input type="text" class="search-input" id="customerSearch" placeholder="Search by customer name, phone number" onkeyup="window.applyCustomerFilters()">
                    <div class="date-input-group">
                        <input type="date" class="date-input" id="customerFromDate">
                        <span>From</span>
                        <input type="date" class="date-input" id="customerToDate">
                        <span>To</span>
                        <button class="apply-btn" onclick="window.applyCustomerFilters()">APPLY</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <div class="stats-note">*stats from created date to present</div>
                </div>
                
                <div class="table-wrapper">
                    <div class="table-scroll">
                        <table id="customersTable">
                        <thead>
                            <tr>
                                <th>S.NO</th>
                                <th>Customer Name</th>
                                <th>Phone</th>
                                <th>No. Sessions*</th>
                                <th>Total energy* (kWh)</th>
                                <th>Avg. duration* (Hrs)</th>
                                <th>Default Vehicle</th>
                                <th>Last Active</th>
                                <th>Created on</th>
                            </tr>
                        </thead>
                        <tbody id="customersTableBody">
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
            </div>
            
            <!-- Wallet Transactions Tab -->
            <div id="walletTab" class="tab-content">
                <div class="filters-section">
                    <input type="text" class="search-input" id="walletSearch" placeholder="Search by customer name, transaction ID" onkeyup="window.applyWalletFilters()">
                    <div class="date-input-group">
                        <input type="date" class="date-input" id="walletFromDate">
                        <span>From</span>
                        <input type="date" class="date-input" id="walletToDate">
                        <span>To</span>
                        <button class="apply-btn" onclick="window.applyWalletFilters()">APPLY</button>
                    </div>
                </div>
                
                <div class="table-wrapper">
                    <div class="table-scroll">
                        <table id="walletTable">
                        <thead>
                            <tr>
                                <th>S.NO</th>
                                <th>Customer Name</th>
                                <th>Transaction ID</th>
                                <th>Date/Time</th>
                                <th>Type</th>
                                <th>Amount (₹)</th>
                                <th>Balance (₹)</th>
                                <th>Description</th>
                                <th>Reference ID</th>
                            </tr>
                        </thead>
                        <tbody id="walletTableBody">
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
            </div>
        </div>
    `;
    
    // Load customers data
    loadCustomersData();
}

// Export tab switching function
export function switchCustomerTab(tabName) {
    // Update tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    if (tabName === 'details') {
        tabs[0].classList.add('active');
        document.getElementById('detailsTab').classList.add('active');
        document.getElementById('walletTab').classList.remove('active');
        loadCustomersData();
    } else {
        tabs[1].classList.add('active');
        document.getElementById('walletTab').classList.add('active');
        document.getElementById('detailsTab').classList.remove('active');
        loadWalletTransactionsData();
    }
}

// Export data loading functions
export async function loadCustomersData(searchTerm = '', fromDate = '', toDate = '') {
    try {
        // Use API service
        const data = await getCustomers({ searchTerm, fromDate, toDate });
        
        // Mock data for now
        const mockCustomers = [
            {
                id: 1,
                customerName: "Aakrit",
                phone: "+91 9540931339",
                type: "App Customer",
                status: "active",
                noSessions: 2,
                totalEnergy: 3.11,
                avgDuration: 0.01,
                defaultVehicle: "MAXIMA CARGO, Bajaj",
                lastActive: "2025-07-27T19:46:00Z",
                createdAt: "2025-10-15T11:31:00Z"
            },
            {
                id: 2,
                customerName: "Anu",
                phone: "+91 9876543210",
                type: "App Customer",
                status: "active",
                noSessions: 1,
                totalEnergy: 1.16,
                avgDuration: 0.01,
                defaultVehicle: "EV RE, Bajaj",
                lastActive: "2025-07-20T10:30:00Z",
                createdAt: "2025-10-10T09:15:00Z"
            },
            {
                id: 3,
                customerName: "Saif Ali",
                phone: "+91 9123456789",
                type: "Direct Pay",
                status: "active",
                noSessions: 0,
                totalEnergy: 0,
                avgDuration: 0.00,
                defaultVehicle: "-,-",
                lastActive: null,
                createdAt: "2025-10-20T14:20:00Z"
            },
            {
                id: 4,
                customerName: "Manish Kumar",
                phone: "+91 9988776655",
                type: "App Customer",
                status: "active",
                noSessions: 3,
                totalEnergy: 5.25,
                avgDuration: 0.02,
                defaultVehicle: "Ape E-Xtra, Piaggio",
                lastActive: "2025-08-15T16:45:00Z",
                createdAt: "2025-09-05T08:00:00Z"
            },
            {
                id: 5,
                customerName: "Sharad Chandra",
                phone: "+91 9876543211",
                type: "App Customer",
                status: "active",
                noSessions: 1,
                totalEnergy: 2.10,
                avgDuration: 0.01,
                defaultVehicle: "S1, Ola Electric",
                lastActive: "2025-09-10T12:00:00Z",
                createdAt: "2025-09-01T10:30:00Z"
            },
            {
                id: 6,
                customerName: "ALTAF Khan",
                phone: "+91 9123456788",
                type: "Direct Pay",
                status: "active",
                noSessions: 0,
                totalEnergy: 0,
                avgDuration: 0.00,
                defaultVehicle: "-,-",
                lastActive: null,
                createdAt: "2025-10-25T15:00:00Z"
            },
            {
                id: 7,
                customerName: "Paragilal38@Gmail.Com",
                phone: "+91 9988776654",
                type: "App Customer",
                status: "inactive",
                noSessions: 0,
                totalEnergy: 0,
                avgDuration: 0.00,
                defaultVehicle: "Treo, Mahindra",
                lastActive: null,
                createdAt: "2025-10-18T11:00:00Z"
            }
        ];
        
        // Apply filters
        let filteredCustomers = mockCustomers;
        
        if (searchTerm) {
            filteredCustomers = filteredCustomers.filter(customer => 
                customer.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                customer.phone.includes(searchTerm)
            );
        }
        
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filteredCustomers = filteredCustomers.filter(customer => {
                const customerDate = new Date(customer.createdAt);
                customerDate.setHours(0, 0, 0, 0);
                return customerDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filteredCustomers = filteredCustomers.filter(customer => {
                const customerDate = new Date(customer.createdAt);
                return customerDate <= to;
            });
        }
        
        // Show all customers (no pagination)
        displayCustomers({
            customers: filteredCustomers,
            total: filteredCustomers.length
        });
    } catch (error) {
        console.error('Error loading customers:', error);
        document.getElementById('customersTableBody').innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger">
                    Error loading customers. Please try again.
                </td>
            </tr>
        `;
    }
}

export function displayCustomers(data) {
    const tbody = document.getElementById('customersTableBody');
    
    if (!data.customers || data.customers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">No customers found</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = data.customers.map((customer, index) => {
        const serialNo = index + 1;
        
        const lastActive = customer.lastActive ? formatDate(customer.lastActive) : '-';
        const createdAt = formatDate(customer.createdAt);
        
        return `
            <tr>
                <td>${serialNo}</td>
                <td>
                    <a href="#" onclick="window.viewCustomer('${customer.id}'); return false;">${customer.customerName}</a>
                </td>
                <td>${customer.phone}</td>
                <td>${customer.noSessions}</td>
                <td>${customer.totalEnergy.toFixed(2)}</td>
                <td>${customer.avgDuration.toFixed(2)} Hrs</td>
                <td>${customer.defaultVehicle}</td>
                <td>${lastActive}</td>
                <td>${createdAt}</td>
            </tr>
        `;
    }).join('');
}

export async function loadWalletTransactionsData(searchTerm = '', fromDate = '', toDate = '') {
    try {
        // Use API service
        const data = await getCustomerWalletTransactions({ searchTerm, fromDate, toDate });
        
        // Mock data for wallet transactions
        const mockTransactions = [
            {
                id: 1,
                customerName: "Aakrit",
                transactionId: "TXN001234",
                dateTime: "2025-11-05T10:30:00Z",
                type: "Credit",
                amount: 500.00,
                balance: 500.00,
                description: "Wallet Top-up",
                referenceId: "PAY123456"
            },
            {
                id: 2,
                customerName: "Aakrit",
                transactionId: "TXN001235",
                dateTime: "2025-11-05T11:15:00Z",
                type: "Debit",
                amount: 150.00,
                balance: 350.00,
                description: "Charging Session Payment",
                referenceId: "SESS789012"
            },
            {
                id: 3,
                customerName: "Anu",
                transactionId: "TXN001236",
                dateTime: "2025-11-04T14:20:00Z",
                type: "Credit",
                amount: 1000.00,
                balance: 1000.00,
                description: "Wallet Top-up",
                referenceId: "PAY123457"
            },
            {
                id: 4,
                customerName: "Manish Kumar",
                transactionId: "TXN001237",
                dateTime: "2025-11-03T09:45:00Z",
                type: "Hold",
                amount: 200.00,
                balance: 800.00,
                description: "Charging Session Hold",
                referenceId: "HOLD345678"
            },
            {
                id: 5,
                customerName: "Manish Kumar",
                transactionId: "TXN001238",
                dateTime: "2025-11-03T10:30:00Z",
                type: "Settlement",
                amount: 180.00,
                balance: 620.00,
                description: "Charging Session Settlement",
                referenceId: "SETT345679"
            },
            {
                id: 6,
                customerName: "Sharad Chandra",
                transactionId: "TXN001239",
                dateTime: "2025-11-02T16:00:00Z",
                type: "Debit",
                amount: 75.50,
                balance: 424.50,
                description: "Charging Session Payment",
                referenceId: "SESS789013"
            }
        ];
        
        // Apply filters
        let filteredTransactions = mockTransactions;
        
        if (searchTerm) {
            filteredTransactions = filteredTransactions.filter(transaction => 
                transaction.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                transaction.transactionId.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        
        if (fromDate) {
            const from = new Date(fromDate);
            from.setHours(0, 0, 0, 0);
            filteredTransactions = filteredTransactions.filter(transaction => {
                const transactionDate = new Date(transaction.dateTime);
                transactionDate.setHours(0, 0, 0, 0);
                return transactionDate >= from;
            });
        }
        
        if (toDate) {
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);
            filteredTransactions = filteredTransactions.filter(transaction => {
                const transactionDate = new Date(transaction.dateTime);
                return transactionDate <= to;
            });
        }
        
        // Show all transactions (no pagination)
        displayWalletTransactions({
            transactions: filteredTransactions,
            total: filteredTransactions.length
        });
    } catch (error) {
        console.error('Error loading wallet transactions:', error);
        document.getElementById('walletTableBody').innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger">
                    Error loading wallet transactions. Please try again.
                </td>
            </tr>
        `;
    }
}

export function displayWalletTransactions(data) {
    const tbody = document.getElementById('walletTableBody');
    
    if (!data.transactions || data.transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">No wallet transactions found</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = data.transactions.map((transaction, index) => {
        const serialNo = index + 1;
        const typeClass = `transaction-${transaction.type.toLowerCase()}`;
        const dateTime = formatDate(transaction.dateTime);
        
        return `
            <tr>
                <td>${serialNo}</td>
                <td><a href="#" onclick="window.viewCustomer('${transaction.customerName}'); return false;">${transaction.customerName}</a></td>
                <td>${transaction.transactionId}</td>
                <td>${dateTime}</td>
                <td><span class="transaction-type ${typeClass}">${transaction.type}</span></td>
                <td>${formatCurrency(transaction.amount)}</td>
                <td>${formatCurrency(transaction.balance)}</td>
                <td>${transaction.description}</td>
                <td>${transaction.referenceId}</td>
            </tr>
        `;
    }).join('');
}



// Export filter functions
export function applyCustomerFilters() {
    const searchTerm = document.getElementById('customerSearch')?.value || '';
    const fromDate = document.getElementById('customerFromDate')?.value || '';
    const toDate = document.getElementById('customerToDate')?.value || '';
    loadCustomersData(searchTerm, fromDate, toDate);
}

export function applyWalletFilters() {
    const searchTerm = document.getElementById('walletSearch')?.value || '';
    const fromDate = document.getElementById('walletFromDate')?.value || '';
    const toDate = document.getElementById('walletToDate')?.value || '';
    loadWalletTransactionsData(searchTerm, fromDate, toDate);
}

// Export action functions
export function viewCustomer(customerId) {
    // TODO: Implement view customer details
    alert(`View customer ${customerId} details`);
}

// Make functions globally available for onclick handlers
window.switchCustomerTab = switchCustomerTab;
window.loadCustomersData = loadCustomersData;
window.loadWalletTransactionsData = loadWalletTransactionsData;
window.applyCustomerFilters = applyCustomerFilters;
window.applyWalletFilters = applyWalletFilters;
window.viewCustomer = viewCustomer;

