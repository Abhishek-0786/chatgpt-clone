// Organization Detail View Module
import { getOrganizationById, getOrganizationStations, getOrganizationSessions } from '../services/api.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showSuccess, showWarning } from '../utils/notifications.js';
import { loadOrganizationsModule } from './organizations.js';
import { openEditOrganizationForm } from './add-organization-form.js';

// Export function to load organization detail view
export async function loadOrganizationDetailView(organizationId, activeTab = 'details') {
    try {
        // Update global CMS state
        window.CMS_CURRENT_MODULE = 'organizations';
        window.CMS_CURRENT_ORGANIZATION_ID = organizationId;
        window.CMS_CURRENT_ORGANIZATION_TAB = activeTab;
        
        // Update URL
        const expectedUrl = activeTab === 'details'
            ? `/cms/organizations/${organizationId}`
            : `/cms/organizations/${organizationId}/${activeTab}`;
        
        if (window.location.pathname !== expectedUrl) {
            window.history.replaceState({ module: 'organizations', organizationId, tab: activeTab }, '', expectedUrl);
        }
        
        // Fetch organization details
        const orgResponse = await getOrganizationById(organizationId);
        
        if (!orgResponse.success || !orgResponse.data || !orgResponse.data.organization) {
            showError('Failed to load organization details');
            loadOrganizationsModule();
            return;
        }
        
        const organization = orgResponse.data.organization;
        const moduleContent = document.getElementById('moduleContent');
        
        // Create detail view HTML
        moduleContent.innerHTML = `
        <style>
            .organization-detail-view {
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
            
            .organization-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 30px;
                padding-bottom: 20px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .organization-header-left {
                flex: 1;
                display: flex;
                align-items: center;
                gap: 20px;
            }
            
            .organization-logo-circle {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                overflow: hidden;
                flex-shrink: 0;
                border: 2px solid var(--border-color);
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: var(--bg-tertiary);
                padding: 8px;
                box-sizing: border-box;
            }
            
            .organization-logo-circle img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                object-position: center;
            }
            
            .organization-logo-placeholder {
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .organization-logo-placeholder::before {
                content: '';
                width: 40px;
                height: 40px;
                background-color: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
            }
            
            .organization-header-text {
                flex: 1;
            }
            
            .organization-name {
                font-size: 28px;
                font-weight: 700;
                color: var(--text-primary);
                margin: 0 0 8px 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .organization-type {
                font-size: 16px;
                color: var(--text-secondary);
                margin-bottom: 12px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .organization-header-right {
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
                gap: 8px;
            }
            
            .detail-label {
                font-size: 12px;
                font-weight: 600;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .detail-value {
                font-size: 14px;
                color: var(--text-primary);
                font-weight: 500;
            }
            
            .documents-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .document-item {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px;
                background-color: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                transition: all 0.2s;
            }
            
            .document-item:hover {
                background-color: var(--hover-bg);
                border-color: #007bff;
            }
            
            .document-icon {
                width: 48px;
                height: 48px;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: #007bff;
                color: white;
                border-radius: 8px;
                font-size: 20px;
                flex-shrink: 0;
            }
            
            .document-info {
                flex: 1;
                min-width: 0;
            }
            
            .document-name {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: 4px;
                word-break: break-word;
            }
            
            .document-date {
                font-size: 12px;
                color: var(--text-secondary);
            }
            
            .document-actions {
                display: flex;
                gap: 8px;
                flex-shrink: 0;
            }
            
            .document-link {
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                color: var(--text-primary);
                text-decoration: none;
                transition: all 0.2s;
            }
            
            .document-link:hover {
                background-color: #007bff;
                border-color: #007bff;
                color: white;
            }
            
            .no-documents {
                text-align: center;
                padding: 40px 20px;
                color: var(--text-secondary);
            }
            
            .no-documents i {
                font-size: 48px;
                margin-bottom: 16px;
                opacity: 0.5;
                display: block;
            }
            
            .no-documents p {
                font-size: 14px;
                margin: 0;
                font-weight: 500;
            }
            
            .loading-spinner {
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 40px;
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
            
            #organizationStationsTable, #organizationSessionsTable {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            #organizationStationsTable thead, #organizationSessionsTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] #organizationStationsTable thead,
            [data-theme="dark"] #organizationSessionsTable thead {
                background-color: #1a1a1a;
            }
            
            #organizationStationsTable thead th,
            #organizationSessionsTable thead th {
                padding: 14px 12px;
                text-align: left;
                font-weight: 600;
                white-space: nowrap;
                border-right: 1px solid rgba(255,255,255,0.1);
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            #organizationStationsTable tbody tr,
            #organizationSessionsTable tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            #organizationStationsTable tbody tr:nth-child(even),
            #organizationSessionsTable tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            #organizationStationsTable tbody tr:hover,
            #organizationSessionsTable tbody tr:hover {
                background-color: var(--hover-bg);
            }
            
            #organizationStationsTable tbody td,
            #organizationSessionsTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
            }
            
            .sessions-tabs {
                display: flex;
                gap: 10px;
                border-bottom: 2px solid var(--border-color);
                margin-bottom: 20px;
                list-style: none;
                padding: 0;
                margin: 0 0 20px 0;
            }
            
            .sessions-tab-item {
                padding: 12px 24px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                color: var(--text-secondary);
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .sessions-tab-item:hover {
                color: var(--text-primary);
            }
            
            .sessions-tab-item.active {
                color: #007bff;
                border-bottom-color: #007bff;
            }
            
            .status-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
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
            
            [data-theme="dark"] .status-active {
                background-color: #1e4620;
                color: #90ee90;
            }
            
            [data-theme="dark"] .status-inactive {
                background-color: #4a1f1f;
                color: #ff6b6b;
            }
            
            [data-theme="dark"] .status-maintenance {
                background-color: #4a3f1f;
                color: #ffd93d;
            }
        </style>
        
        <div class="organization-detail-view">
            <!-- Breadcrumb -->
            <div class="breadcrumb-nav">
                <a href="#" onclick="event.preventDefault(); window.loadOrganizationsModule(); return false;">Organizations</a>
                <span class="separator">/</span>
                <span>${organization.organizationName || 'Organization'}</span>
            </div>
            
            <!-- Organization Header -->
            <div class="organization-header">
                <div class="organization-header-left">
                    <div class="organization-logo-circle">
                        ${organization.organizationLogo ? 
                            `<img src="${organization.organizationLogo}" alt="${organization.organizationName || 'Organization'}" />` :
                            `<div class="organization-logo-placeholder"></div>`
                        }
                    </div>
                    <div class="organization-header-text">
                        <h1 class="organization-name">${organization.organizationName || 'N/A'}</h1>
                        <div class="organization-type">${organization.organizationType ? organization.organizationType.toUpperCase() : 'N/A'}</div>
                    </div>
                </div>
                <div class="organization-header-right">
                    <button class="header-btn btn-edit" onclick="window.editOrganizationDetails(${organizationId})">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                </div>
            </div>
            
            <!-- Tabs -->
            <div class="tabs-container">
                <ul class="tabs-list">
                    <li class="tab-item ${activeTab === 'details' ? 'active' : ''}" data-tab="details" onclick="window.switchOrganizationTab('details', ${organizationId})">DETAILS</li>
                    <li class="tab-item ${activeTab === 'stations' ? 'active' : ''}" data-tab="stations" onclick="window.switchOrganizationTab('stations', ${organizationId})">CHARGING STATIONS</li>
                    <li class="tab-item ${activeTab === 'sessions' ? 'active' : ''}" data-tab="sessions" onclick="window.switchOrganizationTab('sessions', ${organizationId})">SESSIONS</li>
                </ul>
            </div>
            
            <!-- Tab Contents -->
            <div id="tabContents">
                <!-- Details Tab -->
                <div id="detailsTab" class="tab-content ${activeTab === 'details' ? 'active' : ''}">
                    ${generateDetailsTab(organization)}
                </div>
                
                <!-- Charging Stations Tab -->
                <div id="stationsTab" class="tab-content ${activeTab === 'stations' ? 'active' : ''}">
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
        
        // Load tab content if not details
        if (activeTab === 'stations') {
            loadOrganizationStationsTab(organizationId);
        } else if (activeTab === 'sessions') {
            loadOrganizationSessionsTab(organizationId, 'active');
        }
        
        // Setup global functions
        setupGlobalFunctions(organizationId);
        
    } catch (error) {
        console.error('Error loading organization detail view:', error);
        showError(error.message || 'Failed to load organization details');
        loadOrganizationsModule();
    }
}

// Generate Details Tab HTML
function generateDetailsTab(organization) {
    return `
        <!-- Basic Information Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Basic Information</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Organization Name</span>
                    <span class="detail-value">${organization.organizationName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Organization Type</span>
                    <span class="detail-value">${organization.organizationType ? organization.organizationType.toUpperCase() : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">GSTIN</span>
                    <span class="detail-value">${organization.gstin || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <!-- Contact Details Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Contact Details</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Contact Number</span>
                    <span class="detail-value">${organization.countryCode || ''} ${organization.contactNumber || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Email</span>
                    <span class="detail-value">${organization.email || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <!-- Address Details Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">
                Address Details
                ${organization.fullAddress ? `
                <button class="map-btn" onclick="window.viewOrganizationOnMap('${(organization.fullAddress || '').replace(/'/g, "\\'")}')">
                    <i class="fas fa-map-marker-alt me-1"></i>MAP
                </button>
                ` : ''}
            </h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Country</span>
                    <span class="detail-value">${organization.addressCountry || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">State</span>
                    <span class="detail-value">${organization.addressState || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">City</span>
                    <span class="detail-value">${organization.addressCity || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Pin Code</span>
                    <span class="detail-value">${organization.addressPinCode || 'N/A'}</span>
                </div>
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <span class="detail-label">Full Address</span>
                    <span class="detail-value">${organization.fullAddress || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <!-- Payment Details Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Payment Details</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Bank Account Number</span>
                    <span class="detail-value">${organization.bankAccountNumber || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">IFSC Code</span>
                    <span class="detail-value">${organization.ifscCode || 'N/A'}</span>
                </div>
            </div>
        </div>
        
        <!-- Billing Address Card -->
        ${organization.billingSameAsCompany ? '' : `
        <div class="detail-card">
            <h3 class="detail-card-title">Billing Address</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Country</span>
                    <span class="detail-value">${organization.billingCountry || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">State</span>
                    <span class="detail-value">${organization.billingState || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">City</span>
                    <span class="detail-value">${organization.billingCity || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Pin Code</span>
                    <span class="detail-value">${organization.billingPinCode || 'N/A'}</span>
                </div>
                <div class="detail-item" style="grid-column: 1 / -1;">
                    <span class="detail-label">Full Address</span>
                    <span class="detail-value">${organization.billingFullAddress || 'N/A'}</span>
                </div>
            </div>
        </div>
        `}
        
        <!-- Documents Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Documents</h3>
            ${organization.documents && Array.isArray(organization.documents) && organization.documents.length > 0 ? `
                <div class="documents-list">
                    ${organization.documents.map((doc, index) => `
                        <div class="document-item">
                            <div class="document-icon">
                                <i class="fas fa-file-alt"></i>
                            </div>
                            <div class="document-info">
                                <div class="document-name">${doc.name || `Document ${index + 1}`}</div>
                                ${doc.date ? `<div class="document-date">${doc.date}</div>` : ''}
                            </div>
                            ${doc.path ? `
                                <div class="document-actions">
                                    <a href="${doc.path}" target="_blank" class="document-link" title="View Document">
                                        <i class="fas fa-external-link-alt"></i>
                                    </a>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : `
                <div class="no-documents">
                    <i class="fas fa-file-alt"></i>
                    <p>No document attached</p>
                </div>
            `}
        </div>
        
        <!-- Other Details Card -->
        <div class="detail-card">
            <h3 class="detail-card-title">Other Details</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Created At</span>
                    <span class="detail-value">${organization.createdAt ? formatDate(organization.createdAt) : 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Updated At</span>
                    <span class="detail-value">${organization.updatedAt ? formatDate(organization.updatedAt) : 'N/A'}</span>
                </div>
            </div>
        </div>
    `;
}

// Organization stations state
let currentOrganizationStationsId = null;
let organizationStationsState = {
    page: 1,
    limit: 10,
    search: '',
    status: '',
    fromDate: '',
    toDate: '',
    sort: ''
};

// Load Organization Stations Tab
async function loadOrganizationStationsTab(organizationId) {
    try {
        currentOrganizationStationsId = organizationId;
        const stationsTab = document.getElementById('stationsTab');
        
        stationsTab.innerHTML = `
            <style>
                .organization-stations-filters {
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
                
                .organization-stations-search-input {
                    flex: 1;
                    min-width: 250px;
                    padding: 10px 15px;
                    border: 1px solid var(--input-border);
                    border-radius: 4px;
                    font-size: 14px;
                    background-color: var(--input-bg);
                    color: var(--text-primary);
                    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                }
                
                .organization-stations-date-group {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                
                .organization-stations-date-input {
                    padding: 10px 15px;
                    border: 1px solid var(--input-border);
                    border-radius: 4px;
                    font-size: 14px;
                    background-color: var(--input-bg);
                    color: var(--text-primary);
                    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                }
                
                .organization-stations-status-select,
                .organization-stations-sort-select {
                    padding: 10px 40px 10px 15px;
                    border: 1px solid var(--input-border);
                    border-radius: 4px;
                    font-size: 14px;
                    font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                    background-color: var(--input-bg);
                    color: var(--text-primary);
                    cursor: pointer;
                    appearance: none;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
                    background-repeat: no-repeat;
                    background-position: right 12px center;
                    background-size: 16px;
                }
                
                [data-theme="dark"] .organization-stations-status-select,
                [data-theme="dark"] .organization-stations-sort-select {
                    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e0e0e0' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
                }
                
                .organization-stations-apply-btn {
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
                
                .organization-stations-apply-btn:hover {
                    background-color: #23272b;
                }
                
                .status-online {
                    background-color: #d4edda;
                    color: #155724;
                }
                
                .status-offline {
                    background-color: #f8d7da;
                    color: #721c24;
                }
                
                [data-theme="dark"] .status-online {
                    background-color: #1e4620;
                    color: #90ee90;
                }
                
                [data-theme="dark"] .status-offline {
                    background-color: #4a1f1f;
                    color: #ff6b6b;
                }
                
                .organization-stations-clickable-row {
                    cursor: pointer;
                }
                
                .organization-stations-clickable-row:hover {
                    background-color: var(--hover-bg) !important;
                }
            </style>
            
            <div class="organization-stations-filters">
                <input type="text" class="organization-stations-search-input" id="organizationStationsSearch" 
                       placeholder="Search by station ID, station name, city, state" 
                       onkeyup="if(event.key === 'Enter') window.applyOrganizationStationsFilters(${organizationId})">
                <div class="organization-stations-date-group">
                    <input type="date" class="organization-stations-date-input" id="organizationStationsFromDate" 
                           onchange="window.handleOrganizationStationsFromDateChange()">
                    <span>From</span>
                    <input type="date" class="organization-stations-date-input" id="organizationStationsToDate" 
                           onchange="window.handleOrganizationStationsToDateChange()">
                    <span>To</span>
                </div>
                <select class="organization-stations-status-select" id="organizationStationsStatus">
                    <option value="">All Status</option>
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                </select>
                <select class="organization-stations-sort-select" id="organizationStationsSort">
                    <option value="">Sort By</option>
                    <option value="sessions-asc">Sessions (Low to High)</option>
                    <option value="sessions-desc">Sessions (High to Low)</option>
                    <option value="billedAmount-asc">Billed Amount (Low to High)</option>
                    <option value="billedAmount-desc">Billed Amount (High to Low)</option>
                    <option value="energy-asc">Energy (Low to High)</option>
                    <option value="energy-desc">Energy (High to Low)</option>
                </select>
                <button class="organization-stations-apply-btn" onclick="window.applyOrganizationStationsFilters(${organizationId})">APPLY</button>
            </div>
            
            <div style="display: flex; justify-content: flex-end; margin-bottom: 4px; padding-right: 10px;">
                <div class="status-legend" style="display: flex; gap: 15px; align-items: center; font-size: 12px; color: var(--text-secondary); font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;">
                    <div class="status-legend-item" style="display: flex; align-items: center; gap: 5px;">
                        <span class="status-dot online" style="width: 8px; height: 8px; border-radius: 50%; background-color: #28a745;"></span>
                        <span>Online</span>
                    </div>
                    <div class="status-legend-item" style="display: flex; align-items: center; gap: 5px;">
                        <span class="status-dot offline" style="width: 8px; height: 8px; border-radius: 50%; background-color: #dc3545;"></span>
                        <span>Offline</span>
                    </div>
                </div>
            </div>
            
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table id="organizationStationsTable">
                        <thead>
                            <tr>
                                <th>S.NO</th>
                                <th>STATION NAME</th>
                                <th>CITY</th>
                                <th>CHARGERS</th>
                                <th>SESSIONS*</th>
                                <th>BILLED AMOUNT* (₹)</th>
                                <th>ENERGY* (KWH)</th>
                                <th>STATUS</th>
                                <th>ONLINE CPS %</th>
                                <th>ONLINE CPS</th>
                                <th>OFFLINE CPS %</th>
                                <th>OFFLINE CPS</th>
                                <th>STATION ID</th>
                                <th>CREATED AT</th>
                            </tr>
                        </thead>
                        <tbody id="organizationStationsTableBody">
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
            
            <div class="table-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                <div>
                    <span id="organizationStationsShowingText" style="color: var(--text-secondary); font-size: 14px;">Showing 0-0 of 0 Stations</span>
                </div>
                <nav>
                    <ul class="pagination mb-0" id="organizationStationsPagination">
                        <!-- Pagination will be generated here -->
                    </ul>
                </nav>
            </div>
        `;
        
        // Restore filter values
        document.getElementById('organizationStationsSearch').value = organizationStationsState.search || '';
        document.getElementById('organizationStationsStatus').value = organizationStationsState.status || '';
        document.getElementById('organizationStationsSort').value = organizationStationsState.sort || '';
        document.getElementById('organizationStationsFromDate').value = organizationStationsState.fromDate || '';
        document.getElementById('organizationStationsToDate').value = organizationStationsState.toDate || '';
        
        // Load stations data
        await loadOrganizationStationsData(organizationId);
        
    } catch (error) {
        console.error('Error loading organization stations tab:', error);
        showError('Failed to load stations');
    }
}

// Load organization stations data
async function loadOrganizationStationsData(organizationId) {
    try {
        const state = organizationStationsState;
        const params = {
            page: state.page,
            limit: state.limit
        };
        
        if (state.search) params.search = state.search;
        if (state.status) params.status = state.status;
        if (state.sort) params.sort = state.sort;
        if (state.fromDate) params.fromDate = state.fromDate;
        if (state.toDate) params.toDate = state.toDate;
        
        const response = await getOrganizationStations(organizationId, params);
        
        if (!response.success) {
            throw new Error('Failed to load stations');
        }
        
        const stations = response.stations || [];
        const total = response.total || 0;
        const page = response.page || 1;
        const limit = response.limit || 10;
        const totalPages = response.totalPages || 1;
        
        // Update table
        const tbody = document.getElementById('organizationStationsTableBody');
        const showingText = document.getElementById('organizationStationsShowingText');
        
        if (stations.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center" style="padding: 40px; color: var(--text-secondary);">
                        No stations found
                    </td>
                </tr>
            `;
            showingText.textContent = 'Showing 0-0 of 0 Stations';
        } else {
            tbody.innerHTML = stations.map((station, index) => {
                const serialNo = (page - 1) * limit + index + 1;
                const statusClass = station.status === 'Online' ? 'status-online' : 'status-offline';
                return `
                    <tr class="organization-stations-clickable-row" onclick="window.viewStationDetail('${station.stationId}');">
                        <td>${serialNo}</td>
                        <td>${station.stationName || 'N/A'}</td>
                        <td>${station.city || 'N/A'}</td>
                        <td>${station.chargers || 0}</td>
                        <td>${station.sessions || 0}</td>
                        <td>₹${(station.billedAmount || 0).toFixed(2)}</td>
                        <td>${(station.energy || 0).toFixed(2)}</td>
                        <td>
                            <span class="status-badge ${statusClass}">
                                ${station.status || 'N/A'}
                            </span>
                        </td>
                        <td>${station.onlineCPsPercent || 0}</td>
                        <td>${station.onlineCPs || 0}</td>
                        <td>${station.offlineCPsPercent || 0}</td>
                        <td>${station.offlineCPs || 0}</td>
                        <td>${station.stationId || 'N/A'}</td>
                        <td>${formatDate(station.createdAt)}</td>
                    </tr>
                `;
            }).join('');
            
            const start = (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);
            showingText.textContent = `Showing ${start}-${end} of ${total} Stations`;
        }
        
        // Update pagination
        renderOrganizationStationsPagination(page, totalPages, total);
        
    } catch (error) {
        console.error('Error loading organization stations data:', error);
        const tbody = document.getElementById('organizationStationsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center text-danger" style="padding: 40px;">
                        Error loading stations: ${error.message || 'Please try again.'}
                    </td>
                </tr>
            `;
        }
    }
}

// Render pagination for organization stations
function renderOrganizationStationsPagination(currentPage, totalPages, total) {
    const pagination = document.getElementById('organizationStationsPagination');
    if (!pagination) return;
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); window.organizationStationsGoToPage(${currentPage - 1}, ${currentOrganizationStationsId}); return false;" 
               ${currentPage === 1 ? 'style="pointer-events: none;"' : ''}>
                Previous
            </a>
        </li>
    `;
    
    // Page numbers
    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);
    
    if (endPage - startPage < maxPages - 1) {
        startPage = Math.max(1, endPage - maxPages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); window.organizationStationsGoToPage(${i}, ${currentOrganizationStationsId}); return false;">${i}</a>
            </li>
        `;
    }
    
    // Next button
    paginationHTML += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="event.preventDefault(); window.organizationStationsGoToPage(${currentPage + 1}, ${currentOrganizationStationsId}); return false;" 
               ${currentPage === totalPages ? 'style="pointer-events: none;"' : ''}>
                Next
            </a>
        </li>
    `;
    
    pagination.innerHTML = paginationHTML;
}

// Apply filters for organization stations
export function applyOrganizationStationsFilters(organizationId) {
    organizationStationsState.search = document.getElementById('organizationStationsSearch').value.trim();
    organizationStationsState.status = document.getElementById('organizationStationsStatus').value;
    organizationStationsState.sort = document.getElementById('organizationStationsSort').value;
    organizationStationsState.fromDate = document.getElementById('organizationStationsFromDate').value || '';
    organizationStationsState.toDate = document.getElementById('organizationStationsToDate').value || '';
    organizationStationsState.page = 1;
    loadOrganizationStationsData(organizationId);
}

// Handle date changes
export function handleOrganizationStationsFromDateChange() {
    const fromDate = document.getElementById('organizationStationsFromDate').value;
    const toDate = document.getElementById('organizationStationsToDate').value;
    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
        document.getElementById('organizationStationsToDate').value = fromDate;
        organizationStationsState.toDate = fromDate;
    }
    organizationStationsState.fromDate = fromDate;
}

export function handleOrganizationStationsToDateChange() {
    const fromDate = document.getElementById('organizationStationsFromDate').value;
    const toDate = document.getElementById('organizationStationsToDate').value;
    if (fromDate && toDate && new Date(toDate) < new Date(fromDate)) {
        document.getElementById('organizationStationsFromDate').value = toDate;
        organizationStationsState.fromDate = toDate;
    }
    organizationStationsState.toDate = toDate;
}

// Pagination functions
export function organizationStationsGoToPage(page, organizationId) {
    organizationStationsState.page = page;
    loadOrganizationStationsData(organizationId);
}

// Organization sessions state
let currentOrganizationSessionsSubTab = 'active'; // 'active' or 'completed'
let organizationSessionsState = {
    active: { page: 1, limit: 10, search: '' },
    completed: { page: 1, limit: 10, search: '', fromDate: '', toDate: '' }
};

// Load Organization Sessions Tab
async function loadOrganizationSessionsTab(organizationId, sessionType = 'active') {
    try {
        const sessionsTab = document.getElementById('sessionsTab');
        if (!sessionsTab) return;
        
        currentOrganizationSessionsId = organizationId;
        currentOrganizationSessionsSubTab = sessionType;
        
        // Render sessions UI with sub-tabs
        renderOrganizationSessionsUI(organizationId, sessionType);
        
        // Load initial sub-tab
        await loadOrganizationSessionsSubTab(sessionType, organizationId);
        
    } catch (error) {
        console.error('Error loading organization sessions tab:', error);
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

// Render organization sessions UI with sub-tabs
function renderOrganizationSessionsUI(organizationId, sessionType = 'active') {
    const sessionsTab = document.getElementById('sessionsTab');
    const isActive = sessionType === 'active';
    sessionsTab.innerHTML = `
        <style>
            .organization-sessions-sub-tabs {
                display: flex;
                gap: 0;
                margin-bottom: 20px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .organization-sessions-sub-tab {
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
            
            .organization-sessions-sub-tab:hover {
                color: #dc3545;
                background-color: var(--bg-tertiary);
            }
            
            .organization-sessions-sub-tab.active {
                color: #dc3545;
                border-bottom: 3px solid #dc3545;
            }
            
            .organization-sessions-empty-state {
                text-align: center;
                padding: 60px 20px;
            }
            
            .organization-sessions-empty-state i {
                font-size: 64px;
                color: var(--text-secondary);
                margin-bottom: 20px;
                display: block;
                opacity: 0.7;
            }
            
            .organization-sessions-empty-state h5 {
                font-size: 16px;
                font-weight: 500;
                color: var(--text-secondary);
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .organization-sessions-loading-state {
                text-align: center;
                padding: 60px 20px;
            }
            
            .organization-sessions-loading-state i {
                font-size: 32px;
                color: var(--text-secondary);
                margin-bottom: 15px;
                display: block;
            }
            
            .organization-sessions-loading-state p {
                font-size: 14px;
                font-weight: 500;
                color: var(--text-secondary);
                margin: 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .organization-sessions-content {
                display: none;
            }
            
            .organization-sessions-content.active {
                display: block;
            }
            
            .organization-sessions-filters {
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
            
            .organization-sessions-search-input {
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
            
            .organization-sessions-date-group {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .organization-sessions-date-input {
                padding: 10px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .organization-sessions-date-input::-webkit-calendar-picker-indicator {
                filter: invert(0);
                cursor: pointer;
            }
            
            [data-theme="dark"] .organization-sessions-date-input::-webkit-calendar-picker-indicator {
                filter: invert(1);
            }
            
            .organization-sessions-apply-btn {
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
            
            .organization-sessions-apply-btn:hover {
                background-color: #23272b;
            }
            
            .organization-sessions-table-wrapper {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 3px var(--shadow);
            }
            
            .organization-sessions-table-scroll {
                overflow-x: auto;
                overflow-y: visible;
                max-width: 100%;
            }
            
            .organization-sessions-table-scroll::-webkit-scrollbar {
                height: 8px;
            }
            
            .organization-sessions-table-scroll::-webkit-scrollbar-track {
                background: var(--bg-tertiary);
            }
            
            .organization-sessions-table-scroll::-webkit-scrollbar-thumb {
                background: var(--text-muted);
                border-radius: 4px;
            }
            
            .organization-sessions-table-scroll::-webkit-scrollbar-thumb:hover {
                background: var(--text-secondary);
            }
            
            .organization-sessions-table {
                width: 100%;
                min-width: 1400px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: var(--card-bg);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .organization-sessions-table thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            [data-theme="dark"] .organization-sessions-table thead {
                background-color: #1a1a1a;
            }
            
            .organization-sessions-table thead th {
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
            
            .organization-sessions-table thead th:last-child {
                border-right: none;
            }
            
            .organization-sessions-table tbody tr {
                border-bottom: 1px solid var(--border-color);
                transition: background-color 0.2s;
                background-color: var(--card-bg);
            }
            
            .organization-sessions-table tbody tr:nth-child(even) {
                background-color: var(--bg-tertiary);
            }
            
            .organization-sessions-table tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid var(--border-color);
                color: var(--text-primary);
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            }
            
            .organization-sessions-table tbody td:last-child {
                border-right: none;
            }
            
            .organization-sessions-table tbody td a {
                color: var(--text-primary);
                text-decoration: underline;
                cursor: pointer;
                font-weight: 500;
                transition: color 0.2s;
                white-space: nowrap;
                display: inline-block;
            }
            
            .organization-sessions-table tbody td a:hover {
                color: #007bff;
                text-decoration: underline;
            }
        </style>
        
        <div class="organization-sessions-sub-tabs">
            <button class="organization-sessions-sub-tab ${isActive ? 'active' : ''}" data-subtab="active" onclick="window.switchOrganizationSessionsSubTab('active', ${organizationId})">ACTIVE</button>
            <button class="organization-sessions-sub-tab ${!isActive ? 'active' : ''}" data-subtab="completed" onclick="window.switchOrganizationSessionsSubTab('completed', ${organizationId})">COMPLETED</button>
        </div>
        
        <!-- Active Sessions Content -->
        <div id="organizationActiveSessionsContent" class="organization-sessions-content ${isActive ? 'active' : ''}">
            <div class="organization-sessions-filters">
                <input type="text" id="organizationActiveSessionsSearch" class="organization-sessions-search-input" placeholder="Search by Device ID, Transaction ID, Session ID..." 
                       onkeyup="if(event.key==='Enter') window.applyOrganizationActiveSessionsFilters(${organizationId})">
                <button class="organization-sessions-apply-btn" onclick="window.applyOrganizationActiveSessionsFilters(${organizationId})">SEARCH</button>
            </div>
            <div id="organizationActiveSessionsTableContainer">
                <div class="organization-sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            </div>
        </div>
        
        <!-- Completed Sessions Content -->
        <div id="organizationCompletedSessionsContent" class="organization-sessions-content ${!isActive ? 'active' : ''}">
            <div class="organization-sessions-filters">
                <input type="text" id="organizationCompletedSessionsSearch" class="organization-sessions-search-input" placeholder="Search by Device ID, Transaction ID, Session ID..." 
                       onkeyup="if(event.key==='Enter') window.applyOrganizationCompletedSessionsFilters(${organizationId})">
                <div class="organization-sessions-date-group">
                    <input type="date" id="organizationCompletedSessionsFromDate" class="organization-sessions-date-input" placeholder="From Date">
                    <input type="date" id="organizationCompletedSessionsToDate" class="organization-sessions-date-input" placeholder="To Date">
                </div>
                <button class="organization-sessions-apply-btn" onclick="window.applyOrganizationCompletedSessionsFilters(${organizationId})">APPLY</button>
            </div>
            <div id="organizationCompletedSessionsTableContainer">
                <div class="organization-sessions-loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Loading sessions...</p>
                </div>
            </div>
        </div>
    `;
    
    // Attach event listeners
    attachOrganizationSessionsEventListeners();
}

// Attach event listeners for organization sessions
function attachOrganizationSessionsEventListeners() {
    // Set initial filter values
    const activeSearch = document.getElementById('organizationActiveSessionsSearch');
    const completedSearch = document.getElementById('organizationCompletedSessionsSearch');
    const fromDate = document.getElementById('organizationCompletedSessionsFromDate');
    const toDate = document.getElementById('organizationCompletedSessionsToDate');
    
    if (activeSearch) activeSearch.value = organizationSessionsState.active.search || '';
    if (completedSearch) completedSearch.value = organizationSessionsState.completed.search || '';
    if (fromDate) fromDate.value = organizationSessionsState.completed.fromDate || '';
    if (toDate) toDate.value = organizationSessionsState.completed.toDate || '';
}

// Load organization sessions sub-tab
async function loadOrganizationSessionsSubTab(subTab, organizationId) {
    try {
        currentOrganizationSessionsSubTab = subTab;
        console.log(`Loading ${subTab} sessions for organization ${organizationId}`);
        
        if (subTab === 'active') {
            await loadOrganizationActiveSessions(organizationId);
        } else if (subTab === 'completed') {
            await loadOrganizationCompletedSessions(organizationId);
        }
    } catch (error) {
        console.error(`Error loading ${subTab} sessions:`, error);
        console.error('Error stack:', error.stack);
        const containerId = subTab === 'active' 
            ? 'organizationActiveSessionsTableContainer' 
            : 'organizationCompletedSessionsTableContainer';
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>Error loading sessions: ${error.message || 'Unknown error'}</p>
                </div>
            `;
        }
    }
}

// Load active sessions for organization
async function loadOrganizationActiveSessions(organizationId) {
    try {
        const container = document.getElementById('organizationActiveSessionsTableContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="organization-sessions-loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading sessions...</p>
            </div>
        `;
        
        const state = organizationSessionsState.active;
        
        console.log('Loading active sessions with params:', { organizationId, page: state.page, limit: state.limit, search: state.search });
        
        let response;
        try {
            response = await getOrganizationSessions(organizationId, 'active', {
                page: state.page,
                limit: state.limit,
                search: state.search
            });
            console.log('Active sessions response:', response); // Debug log
        } catch (apiError) {
            console.error('API Error:', apiError);
            throw apiError;
        }
        
        if (!response) {
            console.error('No response received from API');
            container.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>No response received from server</p>
                </div>
            `;
            return;
        }
        
        if (!response.success) {
            console.error('API returned success: false', response);
            container.innerHTML = `
                <div class="organization-sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No active sessions found for this organization</h5>
                </div>
            `;
            return;
        }
        
        const sessions = response.sessions || [];
        
        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="organization-sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No active sessions found for this organization</h5>
                </div>
            `;
            return;
        }
        
        // Display sessions
        displayOrganizationActiveSessions(sessions, state.page, state.limit, response.total || sessions.length);
        
    } catch (error) {
        console.error('Error loading organization active sessions:', error);
        const container = document.getElementById('organizationActiveSessionsTableContainer');
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

// Load completed sessions for organization
async function loadOrganizationCompletedSessions(organizationId) {
    try {
        const container = document.getElementById('organizationCompletedSessionsTableContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="organization-sessions-loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading sessions...</p>
            </div>
        `;
        
        const state = organizationSessionsState.completed;
        
        console.log('Loading completed sessions with params:', { organizationId, page: state.page, limit: state.limit, search: state.search, fromDate: state.fromDate, toDate: state.toDate });
        
        let response;
        try {
            response = await getOrganizationSessions(organizationId, 'completed', {
                page: state.page,
                limit: state.limit,
                search: state.search,
                fromDate: state.fromDate,
                toDate: state.toDate
            });
            console.log('Completed sessions response:', response); // Debug log
        } catch (apiError) {
            console.error('API Error:', apiError);
            throw apiError;
        }
        
        if (!response) {
            console.error('No response received from API');
            container.innerHTML = `
                <div class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle fa-2x mb-3"></i>
                    <p>No response received from server</p>
                </div>
            `;
            return;
        }
        
        if (!response.success) {
            console.error('API returned success: false', response);
            container.innerHTML = `
                <div class="organization-sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No completed sessions found for this organization</h5>
                </div>
            `;
            return;
        }
        
        const sessions = response.sessions || [];
        
        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="organization-sessions-empty-state">
                    <i class="fas fa-inbox"></i>
                    <h5>No completed sessions found for this organization</h5>
                </div>
            `;
            return;
        }
        
        // Display sessions
        displayOrganizationCompletedSessions(sessions, state.page, state.limit, response.total || sessions.length);
        
    } catch (error) {
        console.error('Error loading organization completed sessions:', error);
        const container = document.getElementById('organizationCompletedSessionsTableContainer');
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

// Display active sessions
function displayOrganizationActiveSessions(sessions, page, limit, total) {
    const container = document.getElementById('organizationActiveSessionsTableContainer');
    if (!container) return;
    
    const serialNo = (page - 1) * limit;
    const currencySymbol = sessions[0]?.currency === 'USD' ? '$' : '₹';
    
    container.innerHTML = `
        <div class="organization-sessions-table-wrapper">
            <div class="organization-sessions-table-scroll">
                <table class="organization-sessions-table">
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
                            <th>TRANSACTION ID</th>
                            <th>SESSION ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map((session, index) => {
                            const startTime = formatDate(session.startTime);
                            // Determine vehicle display: show "N/A" if mode is "CMS", otherwise show vehicle info
                            let vehicleDisplay = 'N/A';
                            if (session.mode !== 'CMS' && session.vehicle && session.vehicle !== 'N/A') {
                                vehicleDisplay = session.vehicle;
                            }
                            return `
                                <tr>
                                    <td>${serialNo + index + 1}</td>
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
}

// Display completed sessions
function displayOrganizationCompletedSessions(sessions, page, limit, total) {
    const container = document.getElementById('organizationCompletedSessionsTableContainer');
    if (!container) return;
    
    const serialNo = (page - 1) * limit;
    const currencySymbol = sessions[0]?.currency === 'USD' ? '$' : '₹';
    
    container.innerHTML = `
        <div class="organization-sessions-table-wrapper">
            <div class="organization-sessions-table-scroll">
                <table class="organization-sessions-table">
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
                            <th>TRANSACTION ID</th>
                            <th>SESSION ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessions.map((session, index) => {
                            const startTime = formatDate(session.startTime);
                            const endTime = session.endTime ? formatDate(session.endTime) : 'N/A';
                            // Determine vehicle display: show "N/A" if mode is "CMS", otherwise show vehicle info
                            let vehicleDisplay = 'N/A';
                            if (session.mode !== 'CMS' && session.vehicle && session.vehicle !== 'N/A') {
                                vehicleDisplay = session.vehicle;
                            }
                            return `
                                <tr>
                                    <td>${serialNo + index + 1}</td>
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
}

// Global variable to store current organization ID
let currentOrganizationSessionsId = null;

// Helper function to get status class
function getStatusClass(status) {
    if (!status) return 'status-inactive';
    const statusLower = status.toLowerCase();
    if (statusLower === 'active') return 'status-active';
    if (statusLower === 'inactive') return 'status-inactive';
    if (statusLower === 'maintenance') return 'status-maintenance';
    return 'status-inactive';
}

// Switch organization tab
export function switchOrganizationTab(tab, organizationId) {
    loadOrganizationDetailView(organizationId, tab);
}

// Switch organization session type (sub-tab)
export function switchOrganizationSessionsSubTab(subTab, organizationId) {
    // Update sub-tab buttons
    const subTabs = document.querySelectorAll('.organization-sessions-sub-tab');
    subTabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-subtab') === subTab) {
            tab.classList.add('active');
        }
    });
    
    // Update content visibility
    const activeContent = document.getElementById('organizationActiveSessionsContent');
    const completedContent = document.getElementById('organizationCompletedSessionsContent');
    
    if (activeContent) activeContent.classList.remove('active');
    if (completedContent) completedContent.classList.remove('active');
    
    if (subTab === 'active') {
        if (activeContent) activeContent.classList.add('active');
    } else if (subTab === 'completed') {
        if (completedContent) completedContent.classList.add('active');
    }
    
    // Load the sub-tab data
    loadOrganizationSessionsSubTab(subTab, organizationId);
}

// Apply active sessions filters
export function applyOrganizationActiveSessionsFilters(organizationId) {
    const searchInput = document.getElementById('organizationActiveSessionsSearch');
    if (searchInput) {
        organizationSessionsState.active.search = searchInput.value.trim();
        organizationSessionsState.active.page = 1; // Reset to first page
    }
    loadOrganizationActiveSessions(organizationId);
}

// Apply completed sessions filters
export function applyOrganizationCompletedSessionsFilters(organizationId) {
    const searchInput = document.getElementById('organizationCompletedSessionsSearch');
    const fromDate = document.getElementById('organizationCompletedSessionsFromDate');
    const toDate = document.getElementById('organizationCompletedSessionsToDate');
    
    if (searchInput) {
        organizationSessionsState.completed.search = searchInput.value.trim();
    }
    if (fromDate) {
        organizationSessionsState.completed.fromDate = fromDate.value;
    }
    if (toDate) {
        organizationSessionsState.completed.toDate = toDate.value;
    }
    organizationSessionsState.completed.page = 1; // Reset to first page
    
    loadOrganizationCompletedSessions(organizationId);
}

// Edit organization details
export function editOrganizationDetails(organizationId) {
    openEditOrganizationForm(organizationId);
}

// View station detail
export async function viewStationDetail(stationId) {
    try {
        // Update URL to station detail view
        const url = `/cms/charging-stations/${stationId}`;
        window.history.pushState({ module: 'charging-stations', stationId, tab: 'details' }, '', url);
        
        const detailModule = await import('./station-detail-view.js');
        detailModule.loadStationDetailView(stationId, 'details');
    } catch (error) {
        console.error('Error loading station detail view:', error);
        showError('Failed to load station details');
    }
}

// View organization on map
export function viewOrganizationOnMap(address) {
    if (!address) {
        showWarning('Address not available');
        return;
    }
    // Open Google Maps with the address
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
}

// Setup global functions
function setupGlobalFunctions(organizationId) {
    window.switchOrganizationTab = switchOrganizationTab;
    window.switchOrganizationSessionsSubTab = switchOrganizationSessionsSubTab;
    window.applyOrganizationActiveSessionsFilters = applyOrganizationActiveSessionsFilters;
    window.applyOrganizationCompletedSessionsFilters = applyOrganizationCompletedSessionsFilters;
    window.applyOrganizationStationsFilters = applyOrganizationStationsFilters;
    window.handleOrganizationStationsFromDateChange = handleOrganizationStationsFromDateChange;
    window.handleOrganizationStationsToDateChange = handleOrganizationStationsToDateChange;
    window.organizationStationsGoToPage = organizationStationsGoToPage;
    window.editOrganizationDetails = editOrganizationDetails;
    window.viewStationDetail = viewStationDetail;
    window.viewOrganizationOnMap = viewOrganizationOnMap;
    window.loadOrganizationDetailView = loadOrganizationDetailView;
}

