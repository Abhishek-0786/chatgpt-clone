// Customers Module
import { getCustomers, getCustomerWalletTransactions } from '../services/api.js';
import { formatDate, formatCurrency } from '../utils/helpers.js';
import { loadCustomerDetailView } from './customer-detail-view.js';

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
                min-width: 1600px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: #ffffff;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .status-badge {
                display: inline-block;
                padding: 6px 12px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .status-badge.status-active {
                background-color: #dcfce7;
                color: #16a34a;
            }
            
            .status-badge.status-inactive {
                background-color: #f3f4f6;
                color: #6b7280;
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
            
            #customersTable tbody tr {
                cursor: pointer;
            }
            
            #customersTable tbody tr:hover {
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
            
            #customersTable tbody td:last-child {
                cursor: default;
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
            
            .action-btn {
                padding: 8px 14px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .action-btn:hover {
                background-color: #0056b3;
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            
            .action-btn:active {
                transform: translateY(0);
            }
            
            .action-btn i {
                font-size: 12px;
            }
            
            #walletLedgerTable {
                width: 100%;
                min-width: 1200px;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                background-color: #ffffff;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #walletLedgerTable thead {
                background-color: #343a40;
                color: white;
                position: sticky;
                top: 0;
                z-index: 10;
            }
            
            #walletLedgerTable thead th {
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
            
            #walletLedgerTable thead th:last-child {
                border-right: none;
            }
            
            #walletLedgerTable tbody tr {
                border-bottom: 1px solid #e0e0e0;
                transition: background-color 0.2s;
                background-color: #ffffff;
            }
            
            #walletLedgerTable tbody tr:nth-child(even) {
                background-color: #f8f9fa;
            }
            
            #walletLedgerTable tbody tr:hover {
                background-color: #e9ecef;
            }
            
            #walletLedgerTable tbody td {
                padding: 14px 12px;
                vertical-align: middle;
                border-right: 1px solid #f0f0f0;
                color: #333;
                font-size: 14px;
                white-space: nowrap;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            #walletLedgerTable tbody td:last-child {
                border-right: none;
            }
            
            /* Customer Detail Page Styles */
            .customer-detail-page {
                background: #f5f7fa;
                min-height: 100vh;
                padding-bottom: 40px;
            }
            
            /* Detail Page Header */
            .detail-page-header {
                background: white;
                padding: 20px 40px;
                border-bottom: 2px solid #e0e0e0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 100;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            }
            
            .back-to-list-btn {
                background: #667eea;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: all 0.3s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .back-to-list-btn:hover {
                background: #5568d3;
                transform: translateX(-3px);
            }
            
            /* Customer Info Card */
            .customer-info-card {
                background: white;
                margin: 30px 40px;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                overflow: hidden;
            }
            
            .customer-info-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 30px 40px;
                display: flex;
                align-items: center;
                gap: 25px;
                color: white;
            }
            
            .customer-avatar {
                width: 90px;
                height: 90px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 50px;
                color: white;
                flex-shrink: 0;
            }
            
            .customer-basic-info {
                flex: 1;
            }
            
            .customer-detail-name {
                margin: 0 0 15px 0;
                font-size: 28px;
                font-weight: 700;
                color: white;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .customer-contact-info {
                display: flex;
                gap: 30px;
                flex-wrap: wrap;
            }
            
            .contact-item {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 15px;
                color: rgba(255, 255, 255, 0.95);
            }
            
            .contact-item i {
                font-size: 16px;
            }
            
            /* Customer Statistics Dashboard */
            .customer-stats-dashboard {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 18px;
                padding: 25px 40px;
                background: #f8fafc;
            }
            
            .stat-card {
                background: white;
                border-radius: 12px;
                padding: 18px 20px;
                display: flex;
                align-items: center;
                gap: 16px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
                transition: all 0.3s ease;
                border: 1px solid #e8ecf1;
            }
            
            .stat-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }
            
            .stat-card-icon {
                width: 50px;
                height: 50px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                color: white;
                flex-shrink: 0;
            }
            
            .stat-card-balance .stat-card-icon {
                background: #6366f1;
            }
            
            .stat-card-credit .stat-card-icon {
                background: #10b981;
            }
            
            .stat-card-debit .stat-card-icon {
                background: #ef4444;
            }
            
            .stat-card-sessions .stat-card-icon {
                background: #3b82f6;
            }
            
            .stat-card-energy .stat-card-icon {
                background: #f59e0b;
            }
            
            .stat-card-transactions .stat-card-icon {
                background: #8b5cf6;
            }
            
            .stat-card-info {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 5px;
            }
            
            .stat-card-label {
                font-size: 10px;
                color: #94a3b8;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .stat-card-value {
                font-size: 22px;
                font-weight: 700;
                color: #1e293b;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.2;
            }
            
            /* Ledger Section */
            .ledger-section {
                background: white;
                margin: 0 40px 40px 40px;
                border-radius: 12px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
                overflow: hidden;
                border: 1px solid #e8ecf1;
            }
            
            .ledger-section-header {
                padding: 25px 30px;
                border-bottom: 1px solid #e8ecf1;
                background: white;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 20px;
                flex-wrap: wrap;
            }
            
            .ledger-header-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .ledger-header-right {
                display: flex;
                align-items: center;
                gap: 10px;
                position: relative;
            }
            
            .ledger-search-input {
                padding: 10px 40px 10px 16px;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                font-size: 14px;
                width: 300px;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .ledger-search-input:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .ledger-search-icon {
                position: absolute;
                right: 14px;
                color: #94a3b8;
                pointer-events: none;
            }
            
            .ledger-icon {
                width: 40px;
                height: 40px;
                background: #6366f1;
                color: white;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
            }
            
            .ledger-title {
                margin: 0;
                font-size: 22px;
                font-weight: 700;
                color: #1e293b;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .ledger-pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 20px;
                padding: 20px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                border: 1px solid #e2e8f0;
            }
            
            .pagination-info {
                font-size: 14px;
                color: #64748b;
                font-weight: 500;
            }
            
            .pagination-controls {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .pagination-btn {
                padding: 8px 16px;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                background: white;
                color: #334155;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 6px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .pagination-btn:hover:not(:disabled) {
                background: #f8fafc;
                border-color: #667eea;
                color: #667eea;
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
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                background: white;
                color: #334155;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .pagination-page-btn:hover {
                background: #f8fafc;
                border-color: #667eea;
                color: #667eea;
            }
            
            .pagination-page-btn.active {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-color: #667eea;
                color: white;
            }
            
            .ledger-table-wrapper {
                overflow-x: auto;
                overflow-y: auto;
                max-height: 600px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                border: 1px solid #e2e8f0;
            }
            
            .ledger-detail-table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                font-size: 14px;
                min-width: 1200px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                background: white;
            }
            
            .ledger-detail-table thead {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                position: sticky;
                top: 0;
                z-index: 10;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .ledger-detail-table thead th {
                padding: 20px 18px;
                text-align: left;
                font-weight: 700;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 1.2px;
                color: white;
                border: none;
                white-space: nowrap;
                position: relative;
            }
            
            .ledger-detail-table thead th:not(:last-child)::after {
                content: '';
                position: absolute;
                right: 0;
                top: 25%;
                height: 50%;
                width: 1px;
                background: rgba(255, 255, 255, 0.2);
            }
            
            .ledger-detail-table tbody tr {
                border-bottom: 1px solid #e2e8f0;
                transition: all 0.2s ease;
                background: white;
            }
            
            .ledger-detail-table tbody tr:nth-child(even) {
                background: #fafbfc;
            }
            
            .ledger-detail-table tbody tr:hover {
                background: #f0f4ff;
                transform: scale(1.001);
                box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
                border-bottom: none;
            }
            
            .ledger-detail-table tbody tr:last-child {
                border-bottom: none;
            }
            
            .ledger-detail-table tbody tr:last-child:hover {
                border-bottom: none;
            }
            
            .ledger-detail-table tbody td {
                padding: 20px 18px;
                vertical-align: middle;
                color: #334155;
                font-size: 14px;
                font-weight: 500;
                border: none;
            }
            
            .ledger-detail-table tbody td:first-child {
                color: #64748b;
                font-weight: 600;
                text-align: center;
                font-size: 13px;
            }
            
            .ledger-detail-table .transaction-type {
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                display: inline-block;
                letter-spacing: 0.8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            
            .ledger-detail-table .transaction-credit {
                background: #d4edda;
                color: #155724;
            }
            
            .ledger-detail-table .transaction-debit {
                background: #dbeafe;
                color: #1e40af;
            }
            
            .ledger-detail-table .transaction-failed {
                background: #fee2e2;
                color: #991b1b;
            }
            
            .ledger-detail-table tbody td:nth-child(7),
            .ledger-detail-table tbody td:nth-child(8),
            .ledger-detail-table tbody td:nth-child(9) {
                text-align: right;
                font-weight: 700;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                font-size: 15px;
            }
            
            .ledger-detail-table tbody td:nth-child(7) {
                color: #dc2626;
            }
            
            .ledger-detail-table tbody td:nth-child(8) {
                color: #16a34a;
            }
            
            .ledger-detail-table tbody td:nth-child(9) {
                color: #1e40af;
                font-size: 16px;
            }
            
            /* Scrollbar */
            .ledger-table-wrapper::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }
            
            .ledger-table-wrapper::-webkit-scrollbar-track {
                background: #f1f5f9;
                border-radius: 10px;
            }
            
            .ledger-table-wrapper::-webkit-scrollbar-thumb {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 10px;
                border: 2px solid #f1f5f9;
            }
            
            .ledger-table-wrapper::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(135deg, #5568d3 0%, #6a3f8f 100%);
            }
        </style>
        
        <div id="customers-content">
            <div class="customers-header">
                <h2>Customers</h2>
            </div>
            
            <!-- Filters Section -->
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
            
            <!-- Main Customers Table -->
            <div class="table-wrapper">
                <div class="table-scroll">
                    <table id="customersTable">
                    <thead>
                        <tr>
                            <th>S.NO</th>
                            <th>CUSTOMER NAME</th>
                            <th>PHONE</th>
                            <th>EMAIL</th>
                            <th>NO. SESSIONS*</th>
                            <th>TOTAL ENERGY* (KWH)</th>
                            <th>AVG. DURATION* (HRS)</th>
                            <th>DEFAULT VEHICLE</th>
                            <th>WALLET BALANCE</th>
                            <th>TOTAL BILLED (₹)</th>
                            <th>STATUS</th>
                            <th>LAST ACTIVE</th>
                            <th>CREATED ON</th>
                        </tr>
                    </thead>
                    <tbody id="customersTableBody">
                        <tr>
                            <td colspan="13" class="text-center" style="padding: 40px;">
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
        
        <!-- Customer Detail Page with Ledger -->
        <div id="customerDetailPage" class="customer-detail-page" style="display: none;">
            <!-- Header with Back Button -->
            <div class="detail-page-header">
                <button class="back-to-list-btn" onclick="window.closeCustomerDetail()">
                    <i class="fas fa-arrow-left"></i> Back to Customers
                </button>
            </div>

            <!-- Customer Information Card -->
            <div class="customer-info-card">
                <div class="customer-info-header">
                    <div class="customer-avatar">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="customer-basic-info">
                        <h2 class="customer-detail-name" id="detailCustomerName">Customer Name</h2>
                        <div class="customer-contact-info">
                            <span class="contact-item">
                                <i class="fas fa-phone"></i>
                                <span id="detailCustomerPhone">-</span>
                            </span>
                            <span class="contact-item">
                                <i class="fas fa-envelope"></i>
                                <span id="detailCustomerEmail">-</span>
                            </span>
                        </div>
                    </div>
                </div>
                
                <!-- Customer Statistics Dashboard -->
                <div class="customer-stats-dashboard">
                    <div class="stat-card stat-card-balance">
                        <div class="stat-card-icon">
                            <i class="fas fa-wallet"></i>
                        </div>
                        <div class="stat-card-info">
                            <div class="stat-card-label">CURRENT BALANCE</div>
                            <div class="stat-card-value" id="detailBalance">₹0.00</div>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-card-credit">
                        <div class="stat-card-icon">
                            <i class="fas fa-plus-circle"></i>
                        </div>
                        <div class="stat-card-info">
                            <div class="stat-card-label">TOTAL CREDITS</div>
                            <div class="stat-card-value" id="detailCredit">₹0.00</div>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-card-debit">
                        <div class="stat-card-icon">
                            <i class="fas fa-minus-circle"></i>
                        </div>
                        <div class="stat-card-info">
                            <div class="stat-card-label">TOTAL DEBITS</div>
                            <div class="stat-card-value" id="detailDebit">₹0.00</div>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-card-sessions">
                        <div class="stat-card-icon">
                            <i class="fas fa-charging-station"></i>
                        </div>
                        <div class="stat-card-info">
                            <div class="stat-card-label">TOTAL SESSIONS</div>
                            <div class="stat-card-value" id="detailSessions">0</div>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-card-energy">
                        <div class="stat-card-icon">
                            <i class="fas fa-bolt"></i>
                        </div>
                        <div class="stat-card-info">
                            <div class="stat-card-label">ENERGY CONSUMED</div>
                            <div class="stat-card-value" id="detailEnergy">0 kWh</div>
                        </div>
                    </div>
                    
                    <div class="stat-card stat-card-transactions">
                        <div class="stat-card-icon">
                            <i class="fas fa-receipt"></i>
                        </div>
                        <div class="stat-card-info">
                            <div class="stat-card-label">TRANSACTIONS</div>
                            <div class="stat-card-value" id="detailTransactionCount">0</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Ledger Section -->
            <div class="ledger-section">
                <div class="ledger-section-header">
                    <div class="ledger-header-left">
                        <i class="fas fa-book ledger-icon"></i>
                        <h3 class="ledger-title">Wallet Ledger</h3>
                    </div>
                    <div class="ledger-header-right">
                        <input type="text" id="ledgerSearchInput" class="ledger-search-input" placeholder="Search by Transaction ID..." onkeyup="window.filterLedgerTransactions()">
                        <i class="fas fa-search ledger-search-icon"></i>
                    </div>
                </div>
                <div class="ledger-table-wrapper">
                    <table class="ledger-detail-table" id="detailLedgerTable">
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
                        <tbody id="detailLedgerTableBody">
                            <tr>
                                <td colspan="9" class="text-center" style="padding: 60px;">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Loading...</span>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div id="ledgerPagination" class="ledger-pagination" style="display: none;">
                    <div class="pagination-info">
                        <span id="ledgerPaginationInfo">Showing 0-0 of 0</span>
                    </div>
                    <div class="pagination-controls">
                        <button class="pagination-btn" id="ledgerPrevBtn" onclick="window.goToLedgerPage('prev')" disabled>
                            <i class="fas fa-chevron-left"></i> Previous
                        </button>
                        <div class="pagination-pages" id="ledgerPageNumbers"></div>
                        <button class="pagination-btn" id="ledgerNextBtn" onclick="window.goToLedgerPage('next')" disabled>
                            Next <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Load customers data
    loadCustomersData();
}

// Store current customer data globally
let currentCustomerData = null;

// Store all transactions for pagination and filtering
let allTransactions = [];
let currentLedgerPage = 1;
const ledgerPageSize = 10;
let filteredTransactions = [];

// Export function to view customer's detail page with ledger
export async function viewCustomerLedger(customerId, customerName) {
    // Find the customer data from the current list
    const customerRow = document.querySelector(`button[onclick*="viewCustomerLedger('${customerId}'"]`);
    if (customerRow) {
        const row = customerRow.closest('tr');
        const cells = row.querySelectorAll('td');
        currentCustomerData = {
            id: customerId,
            name: customerName,
            phone: cells[2]?.textContent || '-',
            email: '-', // Email not in table, will be fetched
            sessions: cells[3]?.textContent || '0',
            energy: cells[4]?.textContent || '0'
        };
    }
    
    // Hide customers list
    document.getElementById('customers-content').style.display = 'none';
    
    // Show detail page
    document.getElementById('customerDetailPage').style.display = 'block';
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    // Set customer info
    document.getElementById('detailCustomerName').textContent = customerName;
    document.getElementById('detailCustomerPhone').textContent = currentCustomerData?.phone || '-';
    document.getElementById('detailSessions').textContent = currentCustomerData?.sessions || '0';
    document.getElementById('detailEnergy').textContent = currentCustomerData?.energy ? `${currentCustomerData.energy} kWh` : '0 kWh';
    
    // Show loading state in ledger table
    document.getElementById('detailLedgerTableBody').innerHTML = `
        <tr>
            <td colspan="9" class="text-center" style="padding: 60px;">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </td>
        </tr>
    `;
    
    // Load wallet transactions for this customer
    try {
        // First, get customer details
        const customersData = await getCustomers({ searchTerm: '', fromDate: '', toDate: '' });
        const customer = customersData.customers.find(c => c.id == customerId);
        
        if (customer) {
            document.getElementById('detailCustomerEmail').textContent = customer.email || '-';
        }
        
        // Call wallet transactions API
        const data = await getCustomerWalletTransactions(customerId, {});
        
        // Display transactions in detail page
        displayCustomerDetailLedger(data.transactions || []);
    } catch (error) {
        console.error('Error loading wallet ledger:', error);
        document.getElementById('detailLedgerTableBody').innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 60px; color: #dc3545;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; display: block; margin-bottom: 15px;"></i>
                    <p style="margin: 0;">Error loading wallet ledger. Please try again.</p>
                </td>
            </tr>
        `;
    }
}

// Function to close customer detail page and go back to list
export function closeCustomerDetail() {
    // Hide detail page
    document.getElementById('customerDetailPage').style.display = 'none';
    
    // Show customers list
    document.getElementById('customers-content').style.display = 'block';
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    // Clear current customer data
    currentCustomerData = null;
}

// Function to display customer's wallet ledger in detail page
function displayCustomerDetailLedger(transactions) {
    // Store all transactions
    allTransactions = transactions || [];
    currentLedgerPage = 1;
    
    // Apply filter and pagination
    applyLedgerFilterAndPagination();
}

// Function to filter and paginate ledger transactions
function applyLedgerFilterAndPagination() {
    const searchInput = document.getElementById('ledgerSearchInput');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    // Filter transactions by transaction ID
    if (searchTerm) {
        filteredTransactions = allTransactions.filter(txn => 
            txn.transactionId && txn.transactionId.toLowerCase().includes(searchTerm)
        );
    } else {
        filteredTransactions = [...allTransactions];
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(filteredTransactions.length / ledgerPageSize);
    const startIndex = (currentLedgerPage - 1) * ledgerPageSize;
    const endIndex = startIndex + ledgerPageSize;
    const paginatedTransactions = filteredTransactions.slice(startIndex, endIndex);
    
    const tbody = document.getElementById('detailLedgerTableBody');
    
    if (!paginatedTransactions || paginatedTransactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center" style="padding: 60px; color: #999;">
                    <i class="fas fa-inbox" style="font-size: 48px; display: block; margin-bottom: 15px; opacity: 0.3;"></i>
                    <p style="margin: 0;">${searchTerm ? 'No transactions found matching your search' : 'No transactions found for this customer'}</p>
                </td>
            </tr>
        `;
        
        // Hide pagination if no results
        const pagination = document.getElementById('ledgerPagination');
        if (pagination) {
            pagination.style.display = 'none';
        }
        
        // Still update stats from all transactions
        updateLedgerStats(allTransactions);
        return;
    }
    
    // Calculate summary statistics from ALL transactions (not just filtered)
    updateLedgerStats(allTransactions);
    
    // Generate detailed table rows for current page
    tbody.innerHTML = paginatedTransactions.map((transaction, index) => {
        const serialNo = startIndex + index + 1;
        const dateTime = formatDate(transaction.dateTime);
        
        // Check if this is a failed payment
        const isFailedPayment = transaction.description && 
            (transaction.description.toLowerCase().includes('payment failed') || 
             transaction.description.toLowerCase().includes('failed'));
        
        // Determine transaction type class: failed (red), credit (green), or debit (blue)
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
        
        // For debit/credit columns, show dash if not applicable
        const debitAmount = transaction.type === 'Debit' ? transaction.amount.toFixed(2) : '-';
        const creditAmount = transaction.type === 'Credit' ? transaction.amount.toFixed(2) : '-';
        
        return `
            <tr>
                <td>${serialNo}</td>
                <td>${dateTime}</td>
                <td>${transaction.transactionId}</td>
                <td>${transaction.description}</td>
                <td>${transaction.referenceId}</td>
                <td>
                    <span class="transaction-type transaction-${typeClass}">
                        ${displayType}
                    </span>
                </td>
                <td>${debitAmount}</td>
                <td>${creditAmount}</td>
                <td>${transaction.balance.toFixed(2)}</td>
            </tr>
        `;
    }).join('');
    
    // Update pagination
    updateLedgerPagination(filteredTransactions.length, totalPages);
}

// Function to update ledger statistics
function updateLedgerStats(transactions) {
    let totalCredit = 0;
    let totalDebit = 0;
    let currentBalance = 0;
    
    transactions.forEach(txn => {
        if (txn.type === 'Credit') {
            totalCredit += txn.amount;
        } else if (txn.type === 'Debit') {
            totalDebit += txn.amount;
        }
    });
    
    // Current balance is from the most recent transaction
    if (transactions.length > 0) {
        currentBalance = transactions[0].balance;
    }
    
    // Update summary stats in detail page
    document.getElementById('detailBalance').textContent = formatCurrency(currentBalance);
    document.getElementById('detailCredit').textContent = formatCurrency(totalCredit);
    document.getElementById('detailDebit').textContent = formatCurrency(totalDebit);
    document.getElementById('detailTransactionCount').textContent = transactions.length;
}

// Function to update pagination controls
function updateLedgerPagination(totalItems, totalPages) {
    const pagination = document.getElementById('ledgerPagination');
    const paginationInfo = document.getElementById('ledgerPaginationInfo');
    const prevBtn = document.getElementById('ledgerPrevBtn');
    const nextBtn = document.getElementById('ledgerNextBtn');
    const pageNumbers = document.getElementById('ledgerPageNumbers');
    
    if (!pagination || totalPages === 0) {
        if (pagination) pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    
    // Update pagination info
    const startIndex = (currentLedgerPage - 1) * ledgerPageSize + 1;
    const endIndex = Math.min(currentLedgerPage * ledgerPageSize, totalItems);
    paginationInfo.textContent = `Showing ${startIndex}-${endIndex} of ${totalItems}`;
    
    // Update prev/next buttons
    prevBtn.disabled = currentLedgerPage === 1;
    nextBtn.disabled = currentLedgerPage === totalPages;
    
    // Generate page number buttons
    pageNumbers.innerHTML = '';
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentLedgerPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    if (startPage > 1) {
        const firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-page-btn';
        firstBtn.textContent = '1';
        firstBtn.onclick = () => goToLedgerPage(1);
        pageNumbers.appendChild(firstBtn);
        
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.style.padding = '0 8px';
            ellipsis.style.color = '#94a3b8';
            pageNumbers.appendChild(ellipsis);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = 'pagination-page-btn';
        if (i === currentLedgerPage) {
            pageBtn.classList.add('active');
        }
        pageBtn.textContent = i;
        pageBtn.onclick = () => goToLedgerPage(i);
        pageNumbers.appendChild(pageBtn);
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.style.padding = '0 8px';
            ellipsis.style.color = '#94a3b8';
            pageNumbers.appendChild(ellipsis);
        }
        
        const lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-page-btn';
        lastBtn.textContent = totalPages;
        lastBtn.onclick = () => goToLedgerPage(totalPages);
        pageNumbers.appendChild(lastBtn);
    }
}

// Function to navigate to a specific page
function goToLedgerPage(page) {
    if (typeof page === 'string') {
        if (page === 'prev') {
            currentLedgerPage = Math.max(1, currentLedgerPage - 1);
        } else if (page === 'next') {
            const totalPages = Math.ceil(filteredTransactions.length / ledgerPageSize);
            currentLedgerPage = Math.min(totalPages, currentLedgerPage + 1);
        }
    } else {
        currentLedgerPage = page;
    }
    
    applyLedgerFilterAndPagination();
    
    // Scroll to top of table
    const tableWrapper = document.querySelector('.ledger-table-wrapper');
    if (tableWrapper) {
        tableWrapper.scrollTop = 0;
    }
}

// Function to filter ledger transactions
function filterLedgerTransactions() {
    currentLedgerPage = 1; // Reset to first page when filtering
    applyLedgerFilterAndPagination();
}

// Make functions globally available
window.filterLedgerTransactions = filterLedgerTransactions;
window.goToLedgerPage = goToLedgerPage;

// Export data loading functions
export async function loadCustomersData(searchTerm = '', fromDate = '', toDate = '') {
    try {
        // Call real API
        const data = await getCustomers({ searchTerm, fromDate, toDate });
        
        // Display customers
        displayCustomers({
            customers: data.customers || [],
            total: data.total || 0
        });
    } catch (error) {
        console.error('Error loading customers:', error);
        document.getElementById('customersTableBody').innerHTML = `
            <tr>
                <td colspan="13" class="text-center text-danger">
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
                <td colspan="13" class="text-center">No customers found</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = data.customers.map((customer, index) => {
        const serialNo = index + 1;
        
        const lastActive = customer.lastActive ? formatDate(customer.lastActive) : '-';
        const createdAt = formatDate(customer.createdAt);
        
        // Format wallet balance and total billed amount
        const walletBalance = customer.walletBalance !== undefined ? formatCurrency(customer.walletBalance) : '₹0.00';
        const totalBilled = customer.totalBilledAmount !== undefined ? formatCurrency(customer.totalBilledAmount) : '₹0.00';
        
        // Format email
        const email = customer.email || '-';
        
        // Status badge
        const status = customer.status || 'Inactive';
        const statusClass = status === 'Active' ? 'status-active' : 'status-inactive';
        const statusBadge = `<span class="status-badge ${statusClass}">${status}</span>`;
        
        return `
            <tr onclick="window.viewCustomerDetail('${customer.id}'); return false;" style="cursor: pointer;">
                <td>${serialNo}</td>
                <td>${customer.customerName}</td>
                <td>${customer.phone}</td>
                <td>${email}</td>
                <td>${customer.noSessions}</td>
                <td>${customer.totalEnergy.toFixed(2)}</td>
                <td>${customer.avgDuration}</td>
                <td>${customer.defaultVehicle && customer.defaultVehicle !== 'undefined, undefined' && customer.defaultVehicle.trim() !== '' ? customer.defaultVehicle : 'N/A'}</td>
                <td>${walletBalance}</td>
                <td>${totalBilled}</td>
                <td>${statusBadge}</td>
                <td>${lastActive}</td>
                <td>${createdAt}</td>
            </tr>
        `;
    }).join('');
}

export async function loadWalletTransactionsData(searchTerm = '', fromDate = '', toDate = '') {
    try {
        // This function is no longer used since we removed the tabs
        // Keeping it for backward compatibility if needed
        return;
        
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

// Export action functions
export function viewCustomer(customerId, tab = 'details') {
    loadCustomerDetailView(customerId, tab);
}

// Make functions globally available for onclick handlers
window.loadCustomersData = loadCustomersData;
window.applyCustomerFilters = applyCustomerFilters;
window.viewCustomer = viewCustomer;
window.viewCustomerDetail = viewCustomer;
window.viewCustomerLedger = function(customerId, customerName) {
    // Redirect to customer detail with wallet tab
    viewCustomer(customerId, 'wallet');
};
window.closeCustomerDetail = closeCustomerDetail;

