// Customer Detail View Module
import { getCustomerDetails, getCustomerVehicles, getCustomerSessions, getCustomerWalletTransactions } from '../services/api.js';
import { formatDate, formatCurrency } from '../utils/helpers.js';
import { showError } from '../utils/notifications.js';
import { loadCustomersModule } from './customers.js';

let currentCustomerId = null;
let currentTab = 'details'; // 'details', 'vehicles', 'sessions', 'wallet'

// Pagination and search state
let sessionsState = {
    currentPage: 1,
    limit: 10,
    searchTerm: '',
    fromDate: '',
    toDate: '',
    total: 0,
    totalPages: 0
};

let walletState = {
    currentPage: 1,
    limit: 10,
    searchTerm: '',
    fromDate: '',
    toDate: '',
    total: 0,
    totalPages: 0,
    allTransactions: []
};

// Brand images/logos mapping - Using local logo images
// Logo files are placed in: backend/public/user-panel/images/brand-logos/
const BRAND_IMAGES = {
    'Ola Electric': '/user-panel/images/brand-logos/ola-electric.png',
    'Ather': '/user-panel/images/brand-logos/ather.png',
    'TVS': '/user-panel/images/brand-logos/tvs.png',
    'Bajaj': '/user-panel/images/brand-logos/bajaj.png',
    'Hero MotoCorp (Vida)': '/user-panel/images/brand-logos/hero-motocorp-vida.png',
    'Ampere': '/user-panel/images/brand-logos/ampere.png',
    'Revolt': '/user-panel/images/brand-logos/revolt.png',
    'Ultraviolette': '/user-panel/images/brand-logos/Ultraviolette.png',
    'Simple Energy': '/user-panel/images/brand-logos/simple-energy.png',
    'Hero Electric': '/user-panel/images/brand-logos/hero-electric.jpg',
    'Mahindra Electric': '/user-panel/images/brand-logos/mahindra-electric.png',
    'Piaggio': '/user-panel/images/brand-logos/piaggio.jpg',
    'Altigreen': '/user-panel/images/brand-logos/altigreen.png',
    'Omega Seiki': '/user-panel/images/brand-logos/omega-seiki.jpg',
    'Euler Motors': '/user-panel/images/brand-logos/euler-motors.png',
    'Kinetic Green': '/user-panel/images/brand-logos/kinetic-green.png',
    'Atul Auto': '/user-panel/images/brand-logos/atul-auto.png',
    'Tata': '/user-panel/images/brand-logos/tata.jpg',
    'MG': '/user-panel/images/brand-logos/mg.jpg',
    'Mahindra': '/user-panel/images/brand-logos/mahindra.png',
    'Hyundai': '/user-panel/images/brand-logos/hyundai.png',
    'Kia': '/user-panel/images/brand-logos/kia.png',
    'BYD': '/user-panel/images/brand-logos/byd.png',
    'Citroën': '/user-panel/images/brand-logos/citroen.png'
};

// Export function to load customer detail view
export async function loadCustomerDetailView(customerId, activeTab = 'details') {
    try {
        currentCustomerId = customerId;
        currentTab = activeTab;
        
        // Fetch customer details
        const customerResponse = await getCustomerDetails(customerId);
        
        if (!customerResponse.success || !customerResponse.customer) {
            showError('Failed to load customer details');
            loadCustomersModule();
            return;
        }
        
        const customer = customerResponse.customer;
        const moduleContent = document.getElementById('moduleContent');
        
        // Create detail view HTML
        moduleContent.innerHTML = `
        <style>
            .customer-detail-view {
                width: 100%;
            }
            
            .breadcrumb-nav {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 20px;
                font-size: 14px;
                color: #666;
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
                color: #999;
            }
            
            .customer-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid #e0e0e0;
            }
            
            .customer-header-left {
                flex: 1;
            }
            
            .customer-name {
                font-size: 28px;
                font-weight: 700;
                color: #333;
                margin: 0 0 8px 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .customer-contact {
                font-size: 16px;
                color: #666;
                margin-bottom: 12px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .customer-wallet-balance {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-size: 16px;
                color: #666;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .customer-wallet-balance i {
                font-size: 16px;
                color: #28a745;
            }
            
            .customer-wallet-balance .balance-amount {
                font-weight: 600;
                color: #28a745;
            }
            
            .tabs-container {
                border-bottom: 2px solid #e0e0e0;
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
                color: #666;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .tab-item:hover {
                color: #333;
                background-color: #f8f9fa;
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
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 12px;
                padding: 24px;
                margin-bottom: 24px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            }
            
            .detail-card-title {
                font-size: 18px;
                font-weight: 600;
                color: #333;
                margin: 0 0 20px 0;
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
                color: #999;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .detail-value {
                font-size: 15px;
                color: #333;
                font-weight: 500;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
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
            
            .detail-table {
                width: 100%;
                min-width: 1200px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: #ffffff;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .detail-table thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            .detail-table thead th {
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
            
            .detail-table tbody tr {
                border-bottom: 1px solid #e0e0e0;
                transition: background-color 0.2s;
            }
            
            .detail-table tbody tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            
            .detail-table tbody tr:hover {
                background-color: #e9ecef;
            }
            
            .detail-table tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                color: #333;
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
            
            .status-completed {
                background-color: #d4edda;
                color: #155724;
            }
            
            .status-stopped {
                background-color: #fff3cd;
                color: #856404;
            }
            
            .transaction-type {
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .transaction-credit {
                background-color: #d1e7dd;
                color: #0f5132;
            }
            
            .transaction-debit {
                background-color: #f8d7da;
                color: #842029;
            }
            
            .loading-spinner {
                text-align: center;
                padding: 40px;
                color: #666;
            }
            
            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: #999;
            }
            
            .empty-state i {
                font-size: 48px;
                display: block;
                margin-bottom: 15px;
                opacity: 0.3;
            }
            
            .brand-logo {
                width: 32px;
                height: 32px;
                object-fit: contain;
                flex-shrink: 0;
                display: block;
            }
            
            .brand-logo-container {
                display: inline-block;
                vertical-align: middle;
                margin-right: 8px;
            }
            
            .brand-logo-fallback {
                width: 32px;
                height: 32px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%);
                border-radius: 6px;
                color: #667eea;
                font-weight: 700;
                font-size: 14px;
                margin-right: 8px;
                vertical-align: middle;
            }
            
            .detail-value-with-logo {
                display: flex;
                align-items: center;
                gap: 8px;
                background: transparent !important;
            }
            
            .detail-value-with-logo img {
                background: none !important;
                background-color: transparent !important;
                border: none !important;
                box-shadow: none !important;
                padding: 0 !important;
            }
            
            /* Search and Filter Styles */
            .tab-filters {
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
            
            .tab-search-input {
                flex: 1;
                min-width: 250px;
                padding: 10px 15px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                transition: border-color 0.2s;
            }
            
            .tab-search-input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .tab-date-input-group {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .tab-date-input-group span {
                color: #666;
                font-size: 14px;
                font-weight: 500;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .tab-date-input {
                padding: 10px 15px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                transition: border-color 0.2s;
                width: 150px;
            }
            
            .tab-date-input:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .tab-apply-btn {
                padding: 10px 24px;
                background-color: #343a40;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                text-transform: uppercase;
            }
            
            .tab-apply-btn:hover {
                background-color: #23272b;
            }
            
            .tab-apply-btn:active {
                transform: translateY(1px);
            }
            
            .date-icon {
                color: #666;
                margin-right: 5px;
            }
            
            /* Pagination Styles */
            .tab-pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 20px;
                padding: 15px 0;
                border-top: 1px solid #e0e0e0;
            }
            
            .pagination-info {
                font-size: 14px;
                color: #666;
                font-weight: 500;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .pagination-controls {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .pagination-btn {
                padding: 8px 16px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                background: white;
                color: #007bff;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .pagination-btn:hover:not(:disabled) {
                background: #e9ecef;
                border-color: #dee2e6;
            }
            
            .pagination-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .pagination-pages {
                display: flex;
                gap: 6px;
                align-items: center;
            }
            
            .pagination-page-btn {
                min-width: 36px;
                height: 36px;
                padding: 0 12px;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                background: white;
                color: #007bff;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .pagination-page-btn:hover {
                background: #e9ecef;
                border-color: #dee2e6;
            }
            
            .pagination-page-btn.active {
                background: #007bff;
                border-color: #007bff;
                color: white;
            }
        </style>
        
        <div class="customer-detail-view">
            <!-- Breadcrumb Navigation -->
            <div class="breadcrumb-nav">
                <a href="#" onclick="window.goBackToCustomersList(); return false;">CUSTOMERS</a>
                <span class="separator">></span>
                <span>${customer.customerName || customerId}</span>
            </div>
            
            <!-- Customer Header -->
            <div class="customer-header">
                <div class="customer-header-left">
                    <h1 class="customer-name">${customer.customerName || 'N/A'}</h1>
                    <div class="customer-contact">
                        <i class="fas fa-phone me-2"></i>${customer.phone || 'N/A'}
                        <span style="margin-left: 20px;">
                            <i class="fas fa-envelope me-2"></i>${customer.email || 'N/A'}
                        </span>
                        <span style="margin-left: 20px;" class="customer-wallet-balance">
                            <i class="fas fa-wallet"></i>
                            <span>Wallet Balance: <span class="balance-amount">${formatCurrency(customer.walletBalance || 0)}</span></span>
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Tabs -->
            <div class="tabs-container">
                <ul class="tabs-list">
                    <li class="tab-item ${activeTab === 'details' ? 'active' : ''}" data-tab="details" onclick="window.switchCustomerTab('details', '${customerId}')">DETAILS</li>
                    <li class="tab-item ${activeTab === 'vehicles' ? 'active' : ''}" data-tab="vehicles" onclick="window.switchCustomerTab('vehicles', '${customerId}')">VEHICLES</li>
                    <li class="tab-item ${activeTab === 'sessions' ? 'active' : ''}" data-tab="sessions" onclick="window.switchCustomerTab('sessions', '${customerId}')">SESSIONS</li>
                    <li class="tab-item ${activeTab === 'wallet' ? 'active' : ''}" data-tab="wallet" onclick="window.switchCustomerTab('wallet', '${customerId}')">WALLET LEDGER</li>
                </ul>
            </div>
            
            <!-- Tab Contents -->
            <div id="tabContents">
                <!-- Details Tab -->
                <div id="detailsTab" class="tab-content ${activeTab === 'details' ? 'active' : ''}">
                    ${generateDetailsTab(customer)}
                </div>
                
                <!-- Vehicles Tab -->
                <div id="vehiclesTab" class="tab-content ${activeTab === 'vehicles' ? 'active' : ''}">
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
                
                <!-- Wallet Ledger Tab -->
                <div id="walletTab" class="tab-content ${activeTab === 'wallet' ? 'active' : ''}">
                    <div class="loading-spinner">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        
        // Load tab content based on active tab
        if (activeTab === 'vehicles') {
            loadVehiclesTab(customerId);
        } else if (activeTab === 'sessions') {
            loadSessionsTab(customerId, 1, '', '', '');
        } else if (activeTab === 'wallet') {
            loadWalletTab(customerId, 1, '', '', '');
        }
        
    } catch (error) {
        console.error('Error loading customer detail:', error);
        showError('Failed to load customer details');
    }
}

// Generate Details Tab
function generateDetailsTab(customer) {
    return `
        <div class="detail-card">
            <h3 class="detail-card-title">Customer Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Customer Name</span>
                    <span class="detail-value">${customer.customerName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Phone Number</span>
                    <span class="detail-value">${customer.phone || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Email Address</span>
                    <span class="detail-value">${customer.email || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Wallet Balance</span>
                    <span class="detail-value">${formatCurrency(customer.walletBalance || 0)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Total Sessions</span>
                    <span class="detail-value">${customer.noSessions || 0}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Total Energy Consumed</span>
                    <span class="detail-value">${(customer.totalEnergy || 0).toFixed(2)} kWh</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Last Active</span>
                    <span class="detail-value">${customer.lastActive ? formatDate(customer.lastActive) : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Created On</span>
                    <span class="detail-value">${customer.createdAt ? formatDate(customer.createdAt) : 'N/A'}</span>
                </div>
            </div>
        </div>
        ${customer.defaultVehicle ? `
        <div class="detail-card" style="margin-top: 24px;">
            <h3 class="detail-card-title">Assigned Vehicle</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Vehicle Number</span>
                    <span class="detail-value">${customer.defaultVehicle.vehicleNumber || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Brand</span>
                    <span class="detail-value detail-value-with-logo">
                        ${(() => {
                            const brand = customer.defaultVehicle.brand || 'N/A';
                            if (brand === 'N/A') return brand;
                            const brandImage = BRAND_IMAGES[brand];
                            if (brandImage) {
                                return `
                                    <span class="brand-logo-container">
                                        <img src="${brandImage}" alt="${brand}" class="brand-logo" style="background: transparent; padding: 0; border: none;"
                                             onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='inline-flex';">
                                        <span class="brand-logo-fallback" style="display: none;">${brand.charAt(0)}</span>
                                    </span>
                                    <span>${brand}</span>
                                `;
                            } else {
                                return `
                                    <span class="brand-logo-fallback">${brand.charAt(0)}</span>
                                    <span>${brand}</span>
                                `;
                            }
                        })()}
                    </span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Model</span>
                    <span class="detail-value">${customer.defaultVehicle.modelName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Vehicle Type</span>
                    <span class="detail-value">${customer.defaultVehicle.vehicleType || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Connector Type</span>
                    <span class="detail-value">${customer.defaultVehicle.connectorType || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Battery Capacity</span>
                    <span class="detail-value">${customer.defaultVehicle.batteryCapacity ? customer.defaultVehicle.batteryCapacity.toFixed(2) + ' kWh' : 'N/A'}</span>
                </div>
            </div>
        </div>
        ` : `
        <div class="detail-card" style="margin-top: 24px;">
            <h3 class="detail-card-title">Assigned Vehicle</h3>
            <div style="padding: 20px; text-align: center; color: #999;">
                <i class="fas fa-car" style="font-size: 32px; display: block; margin-bottom: 10px; opacity: 0.3;"></i>
                <p style="margin: 0;">No vehicle assigned</p>
            </div>
        </div>
        `}
    `;
}

// Load Vehicles Tab
async function loadVehiclesTab(customerId) {
    try {
        const response = await getCustomerVehicles(customerId);
        const vehicles = response.vehicles || [];
        
        const tabContent = document.getElementById('vehiclesTab');
        
        if (vehicles.length === 0) {
            tabContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-car"></i>
                    <p>No vehicles found for this customer</p>
                </div>
            `;
            return;
        }
        
        tabContent.innerHTML = `
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table class="detail-table">
                        <thead>
                            <tr>
                                <th>S.NO</th>
                                <th>VEHICLE NUMBER</th>
                                <th>VEHICLE TYPE</th>
                                <th>BRAND</th>
                                <th>MODEL</th>
                                <th>CONNECTOR TYPE</th>
                                <th>BATTERY CAPACITY (KWH)</th>
                                <th>CREATED ON</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vehicles.map((vehicle, index) => {
                                const brand = vehicle.brand || 'N/A';
                                const brandImage = brand !== 'N/A' ? BRAND_IMAGES[brand] : null;
                                
                                return `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${vehicle.vehicleNumber || 'N/A'}</td>
                                    <td>${vehicle.vehicleType || 'N/A'}</td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            ${brandImage ? `
                                                <span class="brand-logo-container">
                                                    <img src="${brandImage}" alt="${brand}" class="brand-logo" style="background: transparent; padding: 0; border: none;"
                                                         onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='inline-flex';">
                                                    <span class="brand-logo-fallback" style="display: none;">${brand.charAt(0)}</span>
                                                </span>
                                            ` : brand !== 'N/A' ? `
                                                <span class="brand-logo-fallback">${brand.charAt(0)}</span>
                                            ` : ''}
                                            <span>${brand}</span>
                                        </div>
                                    </td>
                                    <td>${vehicle.modelName || 'N/A'}</td>
                                    <td>${vehicle.connectorType || 'N/A'}</td>
                                    <td>${vehicle.batteryCapacity ? vehicle.batteryCapacity.toFixed(2) : 'N/A'}</td>
                                    <td>${formatDate(vehicle.createdAt)}</td>
                                </tr>
                            `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading vehicles:', error);
        const tabContent = document.getElementById('vehiclesTab');
        tabContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading vehicles. Please try again.</p>
            </div>
        `;
    }
}

// Load Sessions Tab
async function loadSessionsTab(customerId, page = 1, searchTerm = '', fromDate = '', toDate = '') {
    try {
        sessionsState.currentPage = page;
        sessionsState.searchTerm = searchTerm;
        sessionsState.fromDate = fromDate;
        sessionsState.toDate = toDate;
        
        const response = await getCustomerSessions(customerId, { 
            page: page, 
            limit: sessionsState.limit,
            fromDate: fromDate,
            toDate: toDate
        });
        const sessions = response.sessions || [];
        sessionsState.total = response.total || 0;
        sessionsState.totalPages = response.totalPages || 0;
        
        // Apply client-side search if search term exists
        let filteredSessions = sessions;
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filteredSessions = sessions.filter(session =>
                (session.sessionId && session.sessionId.toLowerCase().includes(searchLower)) ||
                (session.stationName && session.stationName.toLowerCase().includes(searchLower)) ||
                (session.deviceName && session.deviceName.toLowerCase().includes(searchLower)) ||
                (session.transactionId && session.transactionId.toString().includes(searchTerm))
            );
        }
        
        const tabContent = document.getElementById('sessionsTab');
        
        tabContent.innerHTML = `
            <!-- Search and Date Filters -->
            <div class="tab-filters">
                <input type="text" 
                       class="tab-search-input" 
                       id="sessionsSearchInput" 
                       placeholder="Search by Session ID, Station, Device..." 
                       value="${searchTerm}"
                       onkeyup="window.handleSessionsSearch('${customerId}')">
                <div class="tab-date-input-group">
                    <i class="fas fa-calendar-alt date-icon"></i>
                    <input type="date" 
                           class="tab-date-input" 
                           id="sessionsFromDate" 
                           value="${fromDate}"
                           onchange="window.handleSessionsDateChange('${customerId}')">
                    <span>From</span>
                    <i class="fas fa-calendar-alt date-icon"></i>
                    <input type="date" 
                           class="tab-date-input" 
                           id="sessionsToDate" 
                           value="${toDate}"
                           onchange="window.handleSessionsDateChange('${customerId}')">
                    <span>To</span>
                    <button class="tab-apply-btn" onclick="window.applySessionsFilters('${customerId}')">APPLY</button>
                </div>
            </div>
            
            ${filteredSessions.length === 0 ? `
                <div class="empty-state">
                    <i class="fas fa-charging-station"></i>
                    <p>${searchTerm ? 'No sessions found matching your search' : 'No charging sessions found for this customer'}</p>
                </div>
            ` : `
                <div class="table-wrapper">
                    <div class="table-scroll">
                        <table class="detail-table">
                            <thead>
                                <tr>
                                    <th>S.NO</th>
                                    <th>SESSION ID</th>
                                    <th>STATION</th>
                                    <th>DEVICE</th>
                                    <th>VEHICLE</th>
                                    <th>START TIME</th>
                                    <th>END TIME</th>
                                    <th>ENERGY (KWH)</th>
                                    <th>ENTERED AMOUNT (₹)</th>
                                    <th>AMOUNT (₹)</th>
                                    <th>REFUND (₹)</th>
                                    <th>STOP REASON</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredSessions.map((session, index) => {
                                    const serialNo = (sessionsState.currentPage - 1) * sessionsState.limit + index + 1;
                                    return `
                                    <tr>
                                        <td>${serialNo}</td>
                                        <td>${session.sessionId || 'N/A'}</td>
                                        <td>${session.stationName || 'N/A'}</td>
                                        <td>${session.deviceName || 'N/A'}</td>
                                        <td>${session.vehicle || 'N/A'}</td>
                                        <td>${formatDate(session.startTime)}</td>
                                        <td>${session.endTime ? formatDate(session.endTime) : 'N/A'}</td>
                                        <td>${session.energy ? session.energy.toFixed(2) : '0.00'}</td>
                                        <td>${formatCurrency(session.amountDeducted || 0)}</td>
                                        <td>${formatCurrency(session.billedAmount || 0)}</td>
                                        <td>${formatCurrency(session.refundAmount || 0)}</td>
                                        <td>${session.stopReason || 'N/A'}</td>
                                    </tr>
                                `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                ${generateSessionsPagination(customerId)}
            `}
        `;
    } catch (error) {
        console.error('Error loading sessions:', error);
        const tabContent = document.getElementById('sessionsTab');
        tabContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading sessions. Please try again.</p>
            </div>
        `;
    }
}

// Generate Sessions Pagination
function generateSessionsPagination(customerId) {
    if (sessionsState.totalPages <= 1) {
        return '';
    }
    
    const startIndex = (sessionsState.currentPage - 1) * sessionsState.limit + 1;
    const endIndex = Math.min(sessionsState.currentPage * sessionsState.limit, sessionsState.total);
    
    let pagesHtml = '';
    const maxVisible = 5;
    let startPage = Math.max(1, sessionsState.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(sessionsState.totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
        pagesHtml += `<button class="pagination-page-btn" onclick="window.goToSessionsPage('${customerId}', 1)">1</button>`;
        if (startPage > 2) {
            pagesHtml += `<span style="padding: 0 8px; color: #94a3b8;">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pagesHtml += `<button class="pagination-page-btn ${i === sessionsState.currentPage ? 'active' : ''}" onclick="window.goToSessionsPage('${customerId}', ${i})">${i}</button>`;
    }
    
    if (endPage < sessionsState.totalPages) {
        if (endPage < sessionsState.totalPages - 1) {
            pagesHtml += `<span style="padding: 0 8px; color: #94a3b8;">...</span>`;
        }
        pagesHtml += `<button class="pagination-page-btn" onclick="window.goToSessionsPage('${customerId}', ${sessionsState.totalPages})">${sessionsState.totalPages}</button>`;
    }
    
    return `
        <div class="tab-pagination">
            <div class="pagination-info">
                Showing ${startIndex}-${endIndex} of ${sessionsState.total} sessions
            </div>
            <div class="pagination-controls">
                <button class="pagination-btn" 
                        onclick="window.goToSessionsPage('${customerId}', ${sessionsState.currentPage - 1})" 
                        ${sessionsState.currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
                <div class="pagination-pages">
                    ${pagesHtml}
                </div>
                <button class="pagination-btn" 
                        onclick="window.goToSessionsPage('${customerId}', ${sessionsState.currentPage + 1})" 
                        ${sessionsState.currentPage === sessionsState.totalPages ? 'disabled' : ''}>
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

// Handle Sessions Search
window.handleSessionsSearch = function(customerId) {
    const searchInput = document.getElementById('sessionsSearchInput');
    const fromDateInput = document.getElementById('sessionsFromDate');
    const toDateInput = document.getElementById('sessionsToDate');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    loadSessionsTab(customerId, 1, searchTerm, fromDate, toDate);
};

// Handle Sessions Date Change
window.handleSessionsDateChange = function(customerId) {
    const fromDateInput = document.getElementById('sessionsFromDate');
    const toDateInput = document.getElementById('sessionsToDate');
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    
    // If fromDate is after toDate, clear toDate
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        toDateInput.value = '';
    }
    
    // If toDate is before fromDate, clear fromDate
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
        fromDateInput.value = '';
    }
};

// Apply Sessions Filters
window.applySessionsFilters = function(customerId) {
    const searchInput = document.getElementById('sessionsSearchInput');
    const fromDateInput = document.getElementById('sessionsFromDate');
    const toDateInput = document.getElementById('sessionsToDate');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    loadSessionsTab(customerId, 1, searchTerm, fromDate, toDate);
};

// Go to Sessions Page
window.goToSessionsPage = function(customerId, page) {
    const searchInput = document.getElementById('sessionsSearchInput');
    const fromDateInput = document.getElementById('sessionsFromDate');
    const toDateInput = document.getElementById('sessionsToDate');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    loadSessionsTab(customerId, page, searchTerm, fromDate, toDate);
};

// Load Wallet Tab
async function loadWalletTab(customerId, page = 1, searchTerm = '', fromDate = '', toDate = '') {
    try {
        walletState.currentPage = page;
        walletState.searchTerm = searchTerm;
        walletState.fromDate = fromDate;
        walletState.toDate = toDate;
        
        const response = await getCustomerWalletTransactions(customerId, {
            fromDate: fromDate,
            toDate: toDate
        });
        const allTransactions = response.transactions || [];
        walletState.allTransactions = allTransactions;
        
        // Apply client-side search if search term exists
        let filteredTransactions = allTransactions;
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filteredTransactions = allTransactions.filter(transaction =>
                (transaction.transactionId && transaction.transactionId.toLowerCase().includes(searchLower)) ||
                (transaction.description && transaction.description.toLowerCase().includes(searchLower)) ||
                (transaction.referenceId && transaction.referenceId.toLowerCase().includes(searchLower))
            );
        }
        
        walletState.total = filteredTransactions.length;
        walletState.totalPages = Math.ceil(walletState.total / walletState.limit);
        
        // Paginate filtered transactions
        const startIndex = (walletState.currentPage - 1) * walletState.limit;
        const endIndex = startIndex + walletState.limit;
        const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);
        
        const tabContent = document.getElementById('walletTab');
        
        tabContent.innerHTML = `
            <!-- Search and Date Filters -->
            <div class="tab-filters">
                <input type="text" 
                       class="tab-search-input" 
                       id="walletSearchInput" 
                       placeholder="Search by Transaction ID, Description, Reference ID..." 
                       value="${searchTerm}"
                       onkeyup="window.handleWalletSearch('${customerId}')">
                <div class="tab-date-input-group">
                    <i class="fas fa-calendar-alt date-icon"></i>
                    <input type="date" 
                           class="tab-date-input" 
                           id="walletFromDate" 
                           value="${fromDate}"
                           onchange="window.handleWalletDateChange('${customerId}')">
                    <span>From</span>
                    <i class="fas fa-calendar-alt date-icon"></i>
                    <input type="date" 
                           class="tab-date-input" 
                           id="walletToDate" 
                           value="${toDate}"
                           onchange="window.handleWalletDateChange('${customerId}')">
                    <span>To</span>
                    <button class="tab-apply-btn" onclick="window.applyWalletFilters('${customerId}')">APPLY</button>
                </div>
            </div>
            
            ${paginatedTransactions.length === 0 ? `
                <div class="empty-state">
                    <i class="fas fa-wallet"></i>
                    <p>${searchTerm ? 'No transactions found matching your search' : 'No wallet transactions found for this customer'}</p>
                </div>
            ` : `
                <div class="table-wrapper">
                    <div class="table-scroll">
                        <table class="detail-table">
                            <thead>
                                <tr>
                                    <th>S.NO</th>
                                    <th>DATE & TIME</th>
                                    <th>TRANSACTION ID</th>
                                    <th>DESCRIPTION</th>
                                    <th>REFERENCE ID</th>
                                    <th>TYPE</th>
                                    <th>DEBIT (₹)</th>
                                    <th>CREDIT (₹)</th>
                                    <th>BALANCE (₹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${paginatedTransactions.map((transaction, index) => {
                                    const isFailedPayment = transaction.description && 
                                        (transaction.description.toLowerCase().includes('payment failed') || 
                                         transaction.description.toLowerCase().includes('failed'));
                                    
                                    let typeClass;
                                    let displayType;
                                    if (isFailedPayment) {
                                        typeClass = 'failed';
                                        displayType = 'Failed';
                                    } else if (transaction.type.toLowerCase() === 'credit') {
                                        typeClass = 'credit';
                                        displayType = 'Credit';
                                    } else {
                                        typeClass = 'debit';
                                        displayType = 'Debit';
                                    }
                                    
                                    const debitAmount = transaction.type === 'Debit' ? transaction.amount.toFixed(2) : '-';
                                    const creditAmount = transaction.type === 'Credit' ? transaction.amount.toFixed(2) : '-';
                                    const serialNo = startIndex + index + 1;
                                    
                                    return `
                                        <tr>
                                            <td>${serialNo}</td>
                                            <td>${formatDate(transaction.dateTime)}</td>
                                            <td>${transaction.transactionId || 'N/A'}</td>
                                            <td>${transaction.description || 'N/A'}</td>
                                            <td>${transaction.referenceId || 'N/A'}</td>
                                            <td>
                                                <span class="transaction-type transaction-${typeClass}">
                                                    ${displayType}
                                                </span>
                                            </td>
                                            <td>${debitAmount}</td>
                                            <td>${creditAmount}</td>
                                            <td>${transaction.balance ? transaction.balance.toFixed(2) : '0.00'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                ${generateWalletPagination(customerId)}
            `}
        `;
    } catch (error) {
        console.error('Error loading wallet transactions:', error);
        const tabContent = document.getElementById('walletTab');
        tabContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error loading wallet transactions. Please try again.</p>
            </div>
        `;
    }
}

// Generate Wallet Pagination
function generateWalletPagination(customerId) {
    if (walletState.totalPages <= 1) {
        return '';
    }
    
    const startIndex = (walletState.currentPage - 1) * walletState.limit + 1;
    const endIndex = Math.min(walletState.currentPage * walletState.limit, walletState.total);
    
    let pagesHtml = '';
    const maxVisible = 5;
    let startPage = Math.max(1, walletState.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(walletState.totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
        pagesHtml += `<button class="pagination-page-btn" onclick="window.goToWalletPage('${customerId}', 1)">1</button>`;
        if (startPage > 2) {
            pagesHtml += `<span style="padding: 0 8px; color: #94a3b8;">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        pagesHtml += `<button class="pagination-page-btn ${i === walletState.currentPage ? 'active' : ''}" onclick="window.goToWalletPage('${customerId}', ${i})">${i}</button>`;
    }
    
    if (endPage < walletState.totalPages) {
        if (endPage < walletState.totalPages - 1) {
            pagesHtml += `<span style="padding: 0 8px; color: #94a3b8;">...</span>`;
        }
        pagesHtml += `<button class="pagination-page-btn" onclick="window.goToWalletPage('${customerId}', ${walletState.totalPages})">${walletState.totalPages}</button>`;
    }
    
    return `
        <div class="tab-pagination">
            <div class="pagination-info">
                Showing ${startIndex}-${endIndex} of ${walletState.total} transactions
            </div>
            <div class="pagination-controls">
                <button class="pagination-btn" 
                        onclick="window.goToWalletPage('${customerId}', ${walletState.currentPage - 1})" 
                        ${walletState.currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i> Previous
                </button>
                <div class="pagination-pages">
                    ${pagesHtml}
                </div>
                <button class="pagination-btn" 
                        onclick="window.goToWalletPage('${customerId}', ${walletState.currentPage + 1})" 
                        ${walletState.currentPage === walletState.totalPages ? 'disabled' : ''}>
                    Next <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

// Handle Wallet Search
window.handleWalletSearch = function(customerId) {
    const searchInput = document.getElementById('walletSearchInput');
    const fromDateInput = document.getElementById('walletFromDate');
    const toDateInput = document.getElementById('walletToDate');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    loadWalletTab(customerId, 1, searchTerm, fromDate, toDate);
};

// Handle Wallet Date Change
window.handleWalletDateChange = function(customerId) {
    const fromDateInput = document.getElementById('walletFromDate');
    const toDateInput = document.getElementById('walletToDate');
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    
    // If fromDate is after toDate, clear toDate
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        toDateInput.value = '';
    }
    
    // If toDate is before fromDate, clear fromDate
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
        fromDateInput.value = '';
    }
};

// Apply Wallet Filters
window.applyWalletFilters = function(customerId) {
    const searchInput = document.getElementById('walletSearchInput');
    const fromDateInput = document.getElementById('walletFromDate');
    const toDateInput = document.getElementById('walletToDate');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    loadWalletTab(customerId, 1, searchTerm, fromDate, toDate);
};

// Go to Wallet Page
window.goToWalletPage = function(customerId, page) {
    const searchInput = document.getElementById('walletSearchInput');
    const fromDateInput = document.getElementById('walletFromDate');
    const toDateInput = document.getElementById('walletToDate');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    const fromDate = fromDateInput ? fromDateInput.value : '';
    const toDate = toDateInput ? toDateInput.value : '';
    loadWalletTab(customerId, page, searchTerm, fromDate, toDate);
};

// Switch Tab Function
export function switchCustomerTab(tabName, customerId) {
    // Update URL with tab parameter
    const url = `/cms.html?module=customers&customer=${customerId}&tab=${tabName}`;
    window.history.pushState({ module: 'customers', customerId: customerId, tab: tabName }, '', url);
    
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
    } else if (tabName === 'vehicles') {
        document.getElementById('vehiclesTab')?.classList.add('active');
        loadVehiclesTab(customerId);
    } else if (tabName === 'sessions') {
        document.getElementById('sessionsTab')?.classList.add('active');
        const searchInput = document.getElementById('sessionsSearchInput');
        const fromDateInput = document.getElementById('sessionsFromDate');
        const toDateInput = document.getElementById('sessionsToDate');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const fromDate = fromDateInput ? fromDateInput.value : '';
        const toDate = toDateInput ? toDateInput.value : '';
        loadSessionsTab(customerId, sessionsState.currentPage || 1, searchTerm, fromDate, toDate);
    } else if (tabName === 'wallet') {
        document.getElementById('walletTab')?.classList.add('active');
        const searchInput = document.getElementById('walletSearchInput');
        const fromDateInput = document.getElementById('walletFromDate');
        const toDateInput = document.getElementById('walletToDate');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const fromDate = fromDateInput ? fromDateInput.value : '';
        const toDate = toDateInput ? toDateInput.value : '';
        loadWalletTab(customerId, walletState.currentPage || 1, searchTerm, fromDate, toDate);
    }
}

// Make functions globally available
window.switchCustomerTab = switchCustomerTab;
window.goBackToCustomersList = function() {
    loadCustomersModule();
};

