// Load dashboard module
export function loadDashboardModule() {
    const mainContent = document.getElementById('moduleContent');
    
    mainContent.innerHTML = `
        <style>
            /* Dashboard Container */
            .dashboard-container {
                padding: 30px 40px;
                background: var(--bg-secondary);
                min-height: 100vh;
            }
            
            .dashboard-header {
                margin-bottom: 30px;
            }
            
            .dashboard-title {
                font-size: 32px;
                font-weight: 700;
                color: var(--text-primary);
                margin: 0 0 8px 0;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .dashboard-subtitle {
                font-size: 14px;
                color: var(--text-secondary);
                margin: 0;
            }
            
            /* Stats Grid */
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .stat-box {
                background: var(--card-bg);
                border-radius: 12px;
                padding: 24px;
                border: 1px solid var(--border-color);
                box-shadow: 0 1px 3px var(--shadow);
                transition: all 0.3s ease;
            }
            
            .stat-box:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px var(--shadow);
            }
            
            .stat-box-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
            }
            
            .stat-box-title {
                font-size: 12px;
                color: var(--text-secondary);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.8px;
            }
            
            .stat-box-icon {
                width: 40px;
                height: 40px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                color: white;
            }
            
            .stat-box-icon.purple {
                background: #6366f1;
            }
            
            .stat-box-icon.green {
                background: #10b981;
            }
            
            .stat-box-icon.blue {
                background: #3b82f6;
            }
            
            .stat-box-icon.orange {
                background: #f59e0b;
            }
            
            .stat-box-icon.red {
                background: #ef4444;
            }
            
            .stat-box-icon.cyan {
                background: #06b6d4;
            }
            
            .stat-box-icon.pink {
                background: #ec4899;
            }
            
            .stat-box-icon.indigo {
                background: #8b5cf6;
            }
            
            .stat-box-value {
                font-size: 32px;
                font-weight: 700;
                color: var(--text-primary);
                margin-bottom: 8px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .stat-box-footer {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 13px;
                color: var(--text-secondary);
            }
            
            .stat-change {
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 600;
            }
            
            .stat-change.positive {
                color: #10b981;
            }
            
            .stat-change.negative {
                color: #ef4444;
            }
            
            /* Charts Section */
            .charts-section {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .chart-card {
                background: var(--card-bg);
                border-radius: 12px;
                padding: 20px;
                border: 1px solid var(--border-color);
                box-shadow: 0 1px 3px var(--shadow);
                overflow: hidden;
            }
            
            .chart-card canvas {
                max-width: 100%;
                height: auto !important;
            }
            
            .chart-card.compact {
                padding: 16px;
            }
            
            .chart-card-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
                gap: 15px;
            }
            
            .chart-card-title {
                font-size: 18px;
                font-weight: 700;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .chart-placeholder {
                height: 300px;
                background: var(--bg-tertiary);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-muted);
                font-size: 14px;
            }
            
            /* Recent Activity */
            .activity-section {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }
            
            .activity-card {
                background: var(--card-bg);
                border-radius: 12px;
                padding: 24px;
                border: 1px solid var(--border-color);
                box-shadow: 0 1px 3px var(--shadow);
            }
            
            .activity-card-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid var(--border-color);
            }
            
            .activity-card-title {
                font-size: 16px;
                font-weight: 700;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .view-all-link {
                font-size: 13px;
                color: #6366f1;
                text-decoration: none;
                font-weight: 600;
                transition: color 0.2s;
            }
            
            .view-all-link:hover {
                color: #4f46e5;
            }
            
            .activity-list {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            
            .activity-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                border-radius: 8px;
                transition: background 0.2s;
            }
            
            .activity-item:hover {
                background: var(--bg-tertiary);
            }
            
            .activity-icon {
                width: 40px;
                height: 40px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                color: white;
                flex-shrink: 0;
            }
            
            .activity-icon.session {
                background: #3b82f6;
            }
            
            .activity-icon.customer {
                background: #10b981;
            }
            
            .activity-icon.payment {
                background: #f59e0b;
            }
            
            .activity-icon.alert {
                background: #ef4444;
            }
            
            .activity-details {
                flex: 1;
            }
            
            .activity-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-primary);
                margin-bottom: 4px;
            }
            
            .activity-meta {
                font-size: 12px;
                color: var(--text-muted);
            }
            
            .activity-time {
                font-size: 12px;
                color: var(--text-muted);
                white-space: nowrap;
            }
            
            /* Loading State */
            .loading-spinner {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 60px;
            }
            
            /* Empty State */
            .empty-state {
                text-align: center;
                padding: 40px;
                color: var(--text-muted);
            }
            
            .empty-state i {
                font-size: 48px;
                margin-bottom: 16px;
                opacity: 0.5;
            }
            
            /* Responsive */
            @media (max-width: 1400px) {
                .stats-grid {
                    grid-template-columns: repeat(3, 1fr);
                }
            }
            
            @media (max-width: 1024px) {
                .stats-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
                
                .charts-section {
                    grid-template-columns: 1fr;
                }
                
                .activity-section {
                    grid-template-columns: 1fr;
                }
            }
            
            @media (max-width: 768px) {
                .dashboard-container {
                    padding: 20px;
                }
                
                .stats-grid {
                    grid-template-columns: 1fr;
                }
            }
        </style>
        
        <div class="dashboard-container">
            <!-- Header -->
            <div class="dashboard-header">
                <h1 class="dashboard-title">Dashboard</h1>
                <p class="dashboard-subtitle">Welcome back! Here's what's happening with your charging network today.</p>
            </div>
            
            <!-- Key Stats Grid -->
            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Total Customers</span>
                        <div class="stat-box-icon purple">
                            <i class="fas fa-users"></i>
                        </div>
                    </div>
                    <div class="stat-box-value" id="totalCustomers">0</div>
                    <div class="stat-box-footer">
                        <span class="stat-change positive">
                            <i class="fas fa-arrow-up"></i>
                            <span id="customersChange">0%</span>
                        </span>
                        <span>from last month</span>
                    </div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Active Sessions</span>
                        <div class="stat-box-icon green">
                            <i class="fas fa-charging-station"></i>
                        </div>
                    </div>
                    <div class="stat-box-value" id="activeSessions">0</div>
                    <div class="stat-box-footer">
                        <span id="activeSessionsLabel">Currently charging</span>
                    </div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Total Sessions</span>
                        <div class="stat-box-icon blue">
                            <i class="fas fa-bolt"></i>
                        </div>
                    </div>
                    <div class="stat-box-value" id="totalSessions">0</div>
                    <div class="stat-box-footer">
                        <span class="stat-change positive">
                            <i class="fas fa-arrow-up"></i>
                            <span id="sessionsChange">0%</span>
                        </span>
                        <span>from last month</span>
                    </div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Total Billed Amount</span>
                        <div class="stat-box-icon orange">
                            ₹
                        </div>
                    </div>
                    <div class="stat-box-value" id="totalRevenue">₹0</div>
                    <div class="stat-box-footer">
                        <span class="stat-change positive">
                            <i class="fas fa-arrow-up"></i>
                            <span id="revenueChange">0%</span>
                        </span>
                        <span>from last month</span>
                    </div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Energy Delivered</span>
                        <div class="stat-box-icon cyan">
                            <i class="fas fa-plug"></i>
                        </div>
                    </div>
                    <div class="stat-box-value" id="totalEnergy">0 kWh</div>
                    <div class="stat-box-footer">
                        <span class="stat-change positive">
                            <i class="fas fa-arrow-up"></i>
                            <span id="energyChange">0%</span>
                        </span>
                        <span>from last month</span>
                    </div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Charging Stations</span>
                        <div class="stat-box-icon pink">
                            <i class="fas fa-map-marker-alt"></i>
                        </div>
                    </div>
                    <div class="stat-box-value" id="totalStations">0</div>
                    <div class="stat-box-footer">
                        <span id="stationsStatus">0 Online</span>
                    </div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Charging Points</span>
                        <div class="stat-box-icon indigo">
                            <i class="fas fa-charging-station"></i>
                        </div>
                    </div>
                    <div class="stat-box-value" id="totalChargers">0</div>
                    <div class="stat-box-footer">
                        <span id="chargersAvailable">0 Available</span>
                    </div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-header">
                        <span class="stat-box-title">Avg Session Duration</span>
                        <div class="stat-box-icon red">
                            <i class="fas fa-clock"></i>
                        </div>
                    </div>
                    <div class="stat-box-value" id="avgDuration">00:00</div>
                    <div class="stat-box-footer">
                        <span>Average time per session</span>
                    </div>
                </div>
            </div>
            
            <!-- Charts Section -->
            <div class="charts-section">
                <div class="chart-card">
                    <div class="chart-card-header" style="flex-wrap: wrap; gap: 10px;">
                        <h3 class="chart-card-title" style="margin: 0;">Sessions Overview</h3>
                        <select class="form-select form-select-sm" style="width: auto; min-width: 140px; padding: 6px 12px; border: 1px solid var(--input-border); background-color: var(--input-bg); color: var(--text-primary); border-radius: 6px; font-size: 13px; margin-left: auto;" id="sessionsPeriod" onchange="loadSessionsChart()">
                            <option value="7">Last 7 Days</option>
                            <option value="30" selected>Last 30 Days</option>
                            <option value="90">Last 90 Days</option>
                        </select>
                    </div>
                    <div style="position: relative; height: 300px; padding: 10px; width: 100%; overflow: hidden;">
                        <canvas id="sessionsChart"></canvas>
                    </div>
                </div>
                
                <div class="chart-card">
                    <div class="chart-card-header" style="flex-wrap: wrap; gap: 10px;">
                        <h3 class="chart-card-title" style="margin: 0;">Billed Amount Overview</h3>
                        <select class="form-select form-select-sm" style="width: auto; min-width: 140px; padding: 6px 12px; border: 1px solid var(--input-border); background-color: var(--input-bg); color: var(--text-primary); border-radius: 6px; font-size: 13px; margin-left: auto;" id="revenuePeriod" onchange="loadRevenueChart()">
                            <option value="7">Last 7 Days</option>
                            <option value="30" selected>Last 30 Days</option>
                            <option value="90">Last 90 Days</option>
                        </select>
                    </div>
                    <div style="position: relative; height: 300px; padding: 10px; width: 100%; overflow: hidden;">
                        <canvas id="revenueChart"></canvas>
                    </div>
                </div>
            </div>
            
            <!-- Today's Stats and Status Overview Section -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px;">
                <!-- Today's Performance -->
                <div class="chart-card compact" style="display: flex; flex-direction: column;">
                    <div class="chart-card-header">
                        <h3 class="chart-card-title">Today's Performance</h3>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; flex: 1;">
                        <div class="today-stat-item" style="text-align: center; padding: 8px;">
                            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">Sessions</div>
                            <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);" id="todaySessions">0</div>
                        </div>
                        <div class="today-stat-item" style="text-align: center; padding: 8px;">
                            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">Billed Amount</div>
                            <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);" id="todayRevenue">₹0</div>
                        </div>
                        <div class="today-stat-item" style="text-align: center; padding: 8px;">
                            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">Energy</div>
                            <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);" id="todayEnergy">0 kWh</div>
                        </div>
                        <div class="today-stat-item" style="text-align: center; padding: 8px;">
                            <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">New Customers</div>
                            <div style="font-size: 20px; font-weight: 700; color: var(--text-primary);" id="todayCustomers">0</div>
                        </div>
                    </div>
                </div>

                <!-- Station Status -->
                <div class="chart-card compact" style="display: flex; flex-direction: column;">
                    <div class="chart-card-header">
                        <h3 class="chart-card-title">Station Status</h3>
                        <a href="#" class="view-all-link" onclick="window.loadModule('charging-stations'); return false;">
                            View All <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                    <div id="stationStatusContent" style="flex: 1; display: flex; flex-direction: column;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 10px 0; flex: 1;">
                            <div style="text-align: center; padding: 10px; background: #f0fdf4; border-radius: 8px; display: flex; flex-direction: column; justify-content: center;">
                                <div style="font-size: 24px; font-weight: 700; color: #10b981;" id="stationsOnlineCount">0</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Online</div>
                            </div>
                            <div style="text-align: center; padding: 10px; background: #fee2e2; border-radius: 8px; display: flex; flex-direction: column; justify-content: center;">
                                <div style="font-size: 24px; font-weight: 700; color: #ef4444;" id="stationsOfflineCount">0</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Offline</div>
                            </div>
                        </div>
                        <div id="offlineStationsList" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);"></div>
                    </div>
                </div>

                <!-- Charger Status -->
                <div class="chart-card compact" style="display: flex; flex-direction: column;">
                    <div class="chart-card-header">
                        <h3 class="chart-card-title">Charger Status</h3>
                        <a href="#" class="view-all-link" onclick="window.loadModule('charging-points'); return false;">
                            View All <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                    <div id="chargerStatusContent" style="flex: 1; display: flex; flex-direction: column;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 10px 0; flex: 1;">
                            <div style="text-align: center; padding: 10px; background: #f0fdf4; border-radius: 8px; display: flex; flex-direction: column; justify-content: center;">
                                <div style="font-size: 24px; font-weight: 700; color: #10b981;" id="chargersAvailableCount">0</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Available</div>
                            </div>
                            <div style="text-align: center; padding: 10px; background: #fef3c7; border-radius: 8px; display: flex; flex-direction: column; justify-content: center;">
                                <div style="font-size: 24px; font-weight: 700; color: #f59e0b;" id="chargersBusyCount">0</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Busy</div>
                            </div>
                            <div style="text-align: center; padding: 10px; background: #f1f5f9; border-radius: 8px; display: flex; flex-direction: column; justify-content: center;">
                                <div style="font-size: 24px; font-weight: 700; color: var(--text-secondary);" id="chargersUnavailableCount">0</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Unavailable</div>
                            </div>
                            <div style="text-align: center; padding: 10px; background: #fee2e2; border-radius: 8px; display: flex; flex-direction: column; justify-content: center;">
                                <div style="font-size: 24px; font-weight: 700; color: #ef4444;" id="chargersFaultedCount">0</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Faulted</div>
                            </div>
                        </div>
                        <div id="faultedChargersList" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);"></div>
                    </div>
                </div>
            </div>

            <!-- Top Performing Stations -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div class="chart-card">
                    <div class="chart-card-header">
                        <h3 class="chart-card-title">Top Stations by Energy</h3>
                    </div>
                    <div id="topStationsByRevenue" style="padding: 10px 0; max-height: 400px; overflow-y: auto;">
                        <div class="loading-spinner">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-card-header">
                        <h3 class="chart-card-title">Top Sessions by Energy</h3>
                    </div>
                    <div id="topStationsBySessions" style="padding: 10px 0; max-height: 400px; overflow-y: auto;">
                        <div class="loading-spinner">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Recent Activity -->
            <div class="activity-section">
                <div class="activity-card">
                    <div class="activity-card-header">
                        <h3 class="activity-card-title">Recent Sessions</h3>
                        <a href="#" class="view-all-link" onclick="navigateToCompletedSessions(); return false;">
                            View All <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                    <div class="activity-list" id="recentSessions">
                        <div class="loading-spinner">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="activity-card">
                    <div class="activity-card-header">
                        <h3 class="activity-card-title">Recent Customers</h3>
                        <a href="#" class="view-all-link" onclick="window.loadModule('customers'); return false;">
                            View All <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                    <div class="activity-list" id="recentCustomers">
                        <div class="loading-spinner">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Load dashboard data
    loadDashboardData();
    
    // Load chart data
    loadChartData();
    
    // Setup chart resize handlers for sidebar toggle
    setupChartResizeHandlers();
    
    // Set up Socket.io listener for real-time status updates (hybrid approach)
    if (typeof io !== 'undefined') {
        const socket = io();
        socket.emit('join-room', 'cms:dashboard');
        
        socket.on('notification', (payload) => {
            if (!payload || !payload.type || !payload.data) return;
            
            // Refresh dashboard when status changes
            if (payload.type === 'charger.status.changed' || 
                payload.type === 'charging.remote.start.accepted' || 
                payload.type === 'charging.remote.stop.accepted' ||
                payload.type === 'meter.values.updated') {
                // Reload dashboard data to update charger/station status
                loadDashboardData();
            }
        });
    }
    
    // Set up polling fallback (every 30 seconds) - always runs regardless of Socket.io
    setInterval(() => {
        loadDashboardData();
    }, 30000);
}

// Chart instances
let sessionsChart = null;
let revenueChart = null;

// Setup chart resize handlers
function setupChartResizeHandlers() {
    // Function to resize charts
    const resizeCharts = () => {
        // Use setTimeout to wait for sidebar animation to complete
        setTimeout(() => {
            if (sessionsChart) {
                sessionsChart.resize();
            }
            if (revenueChart) {
                revenueChart.resize();
            }
        }, 300); // Wait for sidebar transition (usually 200-300ms)
    };
    
    // Listen for sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    
    if (sidebar && sidebarToggle) {
        // Use MutationObserver to watch for class changes on sidebar
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    resizeCharts();
                }
            });
        });
        
        observer.observe(sidebar, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
    
    // Also listen for window resize events
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            resizeCharts();
        }, 150);
    });
}

// Load all chart data (initial load)
async function loadChartData() {
    try {
        await Promise.all([
            loadSessionsChart(),
            loadRevenueChart()
        ]);
    } catch (error) {
        console.error('Error loading chart data:', error);
    }
}

// Load Sessions Chart independently
async function loadSessionsChart() {
    try {
        const sessionsPeriod = parseInt(document.getElementById('sessionsPeriod')?.value || 30);
        
        // Pass period as query parameter to backend
        const response = await fetch(`/api/cms/dashboard/charts?period=${sessionsPeriod}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch sessions chart data');
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            // Backend now returns filtered data based on period
            const sessionsData = result.data.sessions || [];
            renderSessionsChart(sessionsData, sessionsPeriod);
        }
    } catch (error) {
        console.error('Error loading sessions chart:', error);
    }
}

// Load Revenue Chart independently
async function loadRevenueChart() {
    try {
        const revenuePeriod = parseInt(document.getElementById('revenuePeriod')?.value || 30);
        
        // Pass period as query parameter to backend
        const response = await fetch(`/api/cms/dashboard/charts?period=${revenuePeriod}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch revenue chart data');
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            // Backend now returns filtered data based on period
            const revenueData = result.data.revenue || [];
            renderRevenueChart(revenueData, revenuePeriod);
        }
    } catch (error) {
        console.error('Error loading revenue chart:', error);
    }
}

// Render Sessions Chart
function renderSessionsChart(sessionsData, period) {
    const ctx = document.getElementById('sessionsChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (sessionsChart) {
        sessionsChart.destroy();
    }
    
    const labels = sessionsData.map(item => {
        // Handle different date keys: date, week, or month
        const dateValue = item.date || item.week || item.month;
        if (!dateValue) return 'N/A';
        
        // Parse date - handle ISO string format
        let date;
        if (typeof dateValue === 'string' && dateValue.includes('T')) {
            // ISO string - parse and use local date to avoid timezone issues
            const isoDate = new Date(dateValue);
            // Create a new date using local timezone components to avoid day shift
            date = new Date(isoDate.getFullYear(), isoDate.getMonth(), isoDate.getDate());
        } else {
            date = new Date(dateValue);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.warn('Invalid date value:', dateValue);
            return 'Invalid Date';
        }
        
        // Format based on period
        if (period <= 7) {
            // For 7 days or less, show day and month
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (period <= 30) {
            // For 30 days, show day and month
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (period <= 90) {
            // For weekly data, show week range or start date
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
            // For monthly data, show month and year
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
    });
    
    const data = sessionsData.map(item => item.value || 0);
    
    sessionsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sessions',
                data: data,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            return `Sessions: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        font: {
                            size: 11
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        display: false
                    }
                }
            }

        }
    });
}

// Render Revenue Chart
function renderRevenueChart(revenueData, period) {
    const ctx = document.getElementById('revenueChart');
    if (!ctx) return;
    
    // Destroy existing chart if it exists
    if (revenueChart) {
        revenueChart.destroy();
    }
    
    const labels = revenueData.map(item => {
        // Handle different date keys: date, week, or month
        const dateValue = item.date || item.week || item.month;
        if (!dateValue) return 'N/A';
        
        // Parse date - handle ISO string format
        let date;
        if (typeof dateValue === 'string' && dateValue.includes('T')) {
            // ISO string - parse and use local date to avoid timezone issues
            const isoDate = new Date(dateValue);
            // Create a new date using local timezone components to avoid day shift
            date = new Date(isoDate.getFullYear(), isoDate.getMonth(), isoDate.getDate());
        } else {
            date = new Date(dateValue);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            console.warn('Invalid date value:', dateValue);
            return 'Invalid Date';
        }
        
        // Format based on period
        if (period <= 7) {
            // For 7 days or less, show day and month
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (period <= 30) {
            // For 30 days, show day and month
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else if (period <= 90) {
            // For weekly data, show week range or start date
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } else {
            // For monthly data, show month and year
            return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
    });
    
    const data = revenueData.map(item => item.value || 0);
    
    revenueChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Billed Amount',
                data: data,
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 4,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function(context) {
                            return `Billed Amount: ₹${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        font: {
                            size: 11
                        },
                        callback: function(value) {
                            return '₹' + value.toFixed(0);
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            size: 11
                        },
                        maxRotation: 45,
                        minRotation: 45
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// Load dashboard statistics
async function loadDashboardData() {
    try {
        // Check if dashboard elements exist before making API call
        const dashboardContainer = document.getElementById('totalCustomers');
        if (!dashboardContainer) {
            // Dashboard is not loaded on this page, silently return
            console.log('Dashboard not loaded on this page, skipping data fetch');
            return;
        }
        
        const response = await fetch('/api/cms/dashboard/stats');
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', response.status, errorText);
            throw new Error(`Failed to fetch dashboard data: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            updateDashboardStats(data.stats);
            updateTodayStats(data.todayStats || {});
            updateStationStatus(data.stationStatus || {});
            updateChargerStatus(data.chargerStatus || {});
            updateTopStations(data.topStationsByEnergy || [], data.topSessionsByEnergy || []);
            loadRecentSessions(data.recentSessions || []);
            loadRecentCustomers(data.recentCustomers || []);
        } else {
            console.error('API returned success: false', data);
            loadMockDashboardData();
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        console.error('Full error details:', error);
        // Only show alert if dashboard is actually loaded on this page
        const dashboardContainer = document.getElementById('totalCustomers');
        if (dashboardContainer) {
            alert(`Error loading dashboard: ${error.message}. Please check console for details.`);
        }
    }
}

// Helper function to safely set textContent
function safeSetTextContent(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    } else {
        console.warn(`Element with id "${elementId}" not found`);
    }
}

// Update dashboard statistics
function updateDashboardStats(stats) {
    safeSetTextContent('totalCustomers', stats.totalCustomers || 0);
    safeSetTextContent('activeSessions', stats.activeSessions || 0);
    safeSetTextContent('totalSessions', stats.totalSessions || 0);
    safeSetTextContent('totalRevenue', `₹${(stats.totalRevenue || 0).toFixed(2)}`);
    safeSetTextContent('totalEnergy', `${(stats.totalEnergy || 0).toFixed(2)} kWh`);
    safeSetTextContent('totalStations', stats.totalStations || 0);
    safeSetTextContent('totalChargers', stats.totalChargers || 0);
    safeSetTextContent('avgDuration', stats.avgDuration || '00:00');
    
    // Update changes
    safeSetTextContent('customersChange', `${stats.customersChange || 0}%`);
    safeSetTextContent('sessionsChange', `${stats.sessionsChange || 0}%`);
    safeSetTextContent('revenueChange', `${stats.revenueChange || 0}%`);
    safeSetTextContent('energyChange', `${stats.energyChange || 0}%`);
    
    // Update footer labels
    const totalStations = stats.totalStations || 0;
    const stationsOnline = stats.stationsOnline || 0;
    const stationsOffline = totalStations - stationsOnline;
    
    // Show offline count if all stations are offline, otherwise show online count
    if (stationsOnline === 0 && totalStations > 0) {
        safeSetTextContent('stationsStatus', `${stationsOffline} Offline`);
    } else {
        safeSetTextContent('stationsStatus', `${stationsOnline} Online`);
    }
    
    safeSetTextContent('chargersAvailable', `${stats.chargersAvailable || 0} Available`);
}

// Load recent sessions
function loadRecentSessions(sessions) {
    const container = document.getElementById('recentSessions');
    if (!container) {
        console.warn('Element with id "recentSessions" not found');
        return;
    }
    
    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-bolt"></i>
                <p>No recent sessions</p>
            </div>
        `;
        return;
    }
    
    // Filter out sessions with null startTime and take first 5
    const validSessions = sessions.filter(s => s.startTime !== null && s.startTime !== undefined).slice(0, 5);
    
    container.innerHTML = validSessions.map(session => {
        const timeDisplay = formatTime(session.startTime);
        return `
        <div class="activity-item">
            <div class="activity-icon session">
                <i class="fas fa-bolt"></i>
            </div>
            <div class="activity-details">
                <div class="activity-title">${session.customerName || 'Unknown'}</div>
                <div class="activity-meta">${session.stationName} • ${(session.energy || 0).toFixed(2)} kWh • ₹${(session.billedAmount || 0).toFixed(2)}</div>
            </div>
            <div class="activity-time">${timeDisplay}</div>
        </div>
    `;
    }).join('');
}

// Load recent customers
function loadRecentCustomers(customers) {
    const container = document.getElementById('recentCustomers');
    if (!container) {
        console.warn('Element with id "recentCustomers" not found');
        return;
    }
    
    if (customers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No recent customers</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = customers.slice(0, 5).map(customer => {
        // Use customerId from API response, fallback to id for backward compatibility
        const customerId = customer.customerId || customer.id;
        if (!customerId) {
            console.warn('Customer missing ID:', customer);
            return '';
        }
        return `
        <div class="activity-item" onclick="viewCustomerDetailFromDashboard('${customerId}');" style="cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='#f8fafc';" onmouseout="this.style.backgroundColor='transparent';">
            <div class="activity-icon customer">
                <i class="fas fa-user"></i>
            </div>
            <div class="activity-details">
                <div class="activity-title" style="color: #3b82f6;">${customer.name || 'Unknown'}</div>
                <div class="activity-meta">${customer.phone || 'N/A'}</div>
            </div>
            <div class="activity-time">${formatDate(customer.createdAt)}</div>
        </div>
    `;
    }).filter(html => html !== '').join('');
}

// Load mock data for development
function loadMockDashboardData() {
    const mockStats = {
        totalCustomers: 156,
        activeSessions: 8,
        totalSessions: 1247,
        totalRevenue: 45678.50,
        totalEnergy: 2345.67,
        totalStations: 12,
        totalChargers: 48,
        avgDuration: '00:45:30',
        customersChange: 12.5,
        sessionsChange: 18.3,
        revenueChange: 23.7,
        energyChange: 15.8,
        stationsOnline: 11,
        chargersAvailable: 40
    };
    
    updateDashboardStats(mockStats);
    
    // Mock recent sessions
    loadRecentSessions([
        { customerName: 'Abhishek', stationName: 'Station A', amount: 150.00, startTime: new Date() },
        { customerName: 'Rahul Kumar', stationName: 'Station B', amount: 200.50, startTime: new Date(Date.now() - 1000 * 60 * 30) },
        { customerName: 'Priya Singh', stationName: 'Station C', amount: 125.75, startTime: new Date(Date.now() - 1000 * 60 * 60) }
    ]);
    
    // Mock recent customers
    loadRecentCustomers([
        { fullName: 'Amit Sharma', phone: '9876543210', createdAt: new Date() },
        { fullName: 'Sneha Patel', phone: '9876543211', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2) },
        { fullName: 'Vikram Singh', phone: '9876543212', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5) }
    ]);
}

// Update today's stats
function updateTodayStats(todayStats) {
    safeSetTextContent('todaySessions', todayStats.sessions || 0);
    safeSetTextContent('todayRevenue', `₹${(todayStats.revenue || 0).toFixed(2)}`);
    safeSetTextContent('todayEnergy', `${(todayStats.energy || 0).toFixed(2)} kWh`);
    safeSetTextContent('todayCustomers', todayStats.newCustomers || 0);
}

// Update station status
function updateStationStatus(stationStatus) {
    safeSetTextContent('stationsOnlineCount', stationStatus.online || 0);
    safeSetTextContent('stationsOfflineCount', stationStatus.offline || 0);
    
    const offlineList = document.getElementById('offlineStationsList');
    if (!offlineList) {
        console.warn('Element with id "offlineStationsList" not found');
        return;
    }
    
    const offlineCount = stationStatus.offline || 0;
    
    // Check offline count first - if there are offline stations, show them
    if (offlineCount > 0 && stationStatus.offlineStations && stationStatus.offlineStations.length > 0) {
        // Limit to 3 stations max to prevent layout breaking
        const displayStations = stationStatus.offlineStations.slice(0, 3);
        const remainingCount = stationStatus.offlineStations.length - 3;
        
        offlineList.innerHTML = `
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">Offline Stations:</div>
            <div style="max-height: 200px; overflow-y: auto; padding-right: 4px;">
                ${displayStations.map(s => `
                    <div style="padding: 6px 10px; background: #fee2e2; border-radius: 6px; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; min-width: 0;">
                        <i class="fas fa-exclamation-circle" style="color: #ef4444; margin-right: 6px; flex-shrink: 0;"></i>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: #721c24; font-weight: 500;">${s.name || s.stationName || 'Unknown Station'}</span>
                    </div>
                `).join('')}
                ${remainingCount > 0 ? `
                    <div style="padding: 6px 10px; text-align: center; font-size: 11px; color: var(--text-secondary); font-style: italic;">
                        +${remainingCount} more offline station${remainingCount > 1 ? 's' : ''}
                    </div>
                ` : ''}
            </div>
        `;
    } else if (offlineCount > 0) {
        // If offline count > 0 but no array, show count message
        offlineList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 12px;">${offlineCount} station${offlineCount > 1 ? 's are' : ' is'} offline</div>`;
    } else {
        // Only show "All stations are online" when offline count is actually 0
        offlineList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 12px;">All stations are online</div>';
    }
}

// Update charger status
function updateChargerStatus(chargerStatus) {
    safeSetTextContent('chargersAvailableCount', chargerStatus.available || 0);
    safeSetTextContent('chargersBusyCount', chargerStatus.busy || 0);
    safeSetTextContent('chargersUnavailableCount', chargerStatus.unavailable || 0);
    safeSetTextContent('chargersFaultedCount', chargerStatus.faulted || 0);
    
    const faultedList = document.getElementById('faultedChargersList');
    if (!faultedList) {
        console.warn('Element with id "faultedChargersList" not found');
        return;
    }
    
    if (chargerStatus.faultedChargers && chargerStatus.faultedChargers.length > 0) {
        // Limit to 3 chargers max to prevent layout breaking
        const displayChargers = chargerStatus.faultedChargers.slice(0, 3);
        const remainingCount = chargerStatus.faultedChargers.length - 3;
        
        faultedList.innerHTML = `
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px; font-weight: 600;">Faulted Chargers:</div>
            <div style="max-height: 200px; overflow-y: auto; padding-right: 4px;">
                ${displayChargers.map(c => `
                    <div style="padding: 6px 10px; background: #fee2e2; border-radius: 6px; margin-bottom: 6px; font-size: 12px; display: flex; align-items: center; min-width: 0;">
                        <i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 6px; flex-shrink: 0;"></i>
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: #721c24; font-weight: 500;">${c.name}</span>
                    </div>
                `).join('')}
                ${remainingCount > 0 ? `
                    <div style="padding: 6px 10px; text-align: center; font-size: 11px; color: var(--text-secondary); font-style: italic;">
                        +${remainingCount} more faulted charger${remainingCount > 1 ? 's' : ''}
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        faultedList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 12px;">No faulted chargers</div>';
    }
}

// Update top stations and sessions by energy
function updateTopStations(topStationsByEnergy, topSessionsByEnergy) {
    const stationsContainer = document.getElementById('topStationsByRevenue');
    const sessionsContainer = document.getElementById('topStationsBySessions');
    
    if (!stationsContainer || !sessionsContainer) {
        console.warn('Dashboard containers not found (topStationsByRevenue or topStationsBySessions)');
        return;
    }
    
    console.log('Top Stations by Energy:', topStationsByEnergy);
    console.log('Top Sessions by Energy:', topSessionsByEnergy);
    
    if (!topStationsByEnergy || topStationsByEnergy.length === 0) {
        stationsContainer.innerHTML = '<div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-chart-line" style="font-size: 48px; opacity: 0.5; margin-bottom: 16px;"></i><p>No data available</p></div>';
    } else {
        stationsContainer.innerHTML = topStationsByEnergy.map((station, index) => `
            <div onclick="viewStationFromDashboard('${station.stationId}');" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='var(--bg-tertiary)';" onmouseout="this.style.backgroundColor='transparent';">
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                        ${index + 1}. <span style="color: #3b82f6;">${station.stationName || 'Unknown'}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${station.sessions || 0} sessions</div>
                </div>
                <div style="font-weight: 700; color: #10b981; font-size: 18px;">${(station.energy || 0).toFixed(2)} kWh</div>
            </div>
        `).join('');
    }
    
    if (!topSessionsByEnergy || topSessionsByEnergy.length === 0) {
        sessionsContainer.innerHTML = '<div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fas fa-chart-line" style="font-size: 48px; opacity: 0.5; margin-bottom: 16px;"></i><p>No data available</p></div>';
    } else {
        sessionsContainer.innerHTML = topSessionsByEnergy.map((session, index) => `
            <div onclick="viewStationFromDashboard('${session.stationId || ''}');" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='var(--bg-tertiary)';" onmouseout="this.style.backgroundColor='transparent';">
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                        ${index + 1}. <span style="color: #3b82f6;">${session.stationName || 'Unknown'}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${session.customerName || 'Unknown'} • ${session.chargerName || 'Unknown'}</div>
                </div>
                <div style="font-weight: 700; color: #3b82f6; font-size: 18px;">${(session.energy || 0).toFixed(2)} kWh</div>
            </div>
        `).join('');
    }
}

// Function to view station from dashboard
async function viewStationFromDashboard(stationId) {
    // Update sidebar to show Charging Stations as active
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === 'charging-stations') {
            item.classList.add('active');
        }
    });
    
    // Use clean URL for station detail view
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
        alert('Failed to load station details');
    }
}

// Function to view session from dashboard
async function viewSessionFromDashboard(sessionId) {
    // Update sidebar to show Sessions as active
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === 'sessions') {
            item.classList.add('active');
        }
    });
    
    // Navigate to sessions module and trigger session view
    try {
        window.loadModule('sessions');
        // Wait for module to load, then call viewSession if available
        setTimeout(() => {
            if (window.viewSession) {
                window.viewSession(sessionId);
            } else {
                // Fallback: try to find and click the session row
                const sessionRow = document.querySelector(`[data-session-id="${sessionId}"]`);
                if (sessionRow) {
                    sessionRow.click();
                } else {
                    // Show sessions list - user can find the session
                    console.log(`Session ID: ${sessionId} - Please find it in the sessions list.`);
                }
            }
        }, 500);
    } catch (error) {
        console.error('Error loading sessions module:', error);
        alert('Failed to load session details');
    }
}

// Navigate to completed sessions
async function navigateToCompletedSessions() {
    // Update sidebar to show Sessions as active
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === 'charging-sessions') {
            item.classList.add('active');
        }
    });
    
    // Navigate to sessions module
    try {
        window.loadModule('charging-sessions');
        
        // Wait for module to load and DOM to be ready, then switch to completed tab
        // Check for both the function and the tab elements
        let attempts = 0;
        const maxAttempts = 20; // Increased attempts
        const checkAndSwitch = () => {
            attempts++;
            
            // Check if both the function exists and the tab elements are present
            const hasFunction = typeof window.switchSessionsTab === 'function';
            const hasTabs = document.querySelectorAll('.tab-item[data-tab]').length > 0;
            const completedTab = document.querySelector('.tab-item[data-tab="completed"]');
            
            if (hasFunction && hasTabs && completedTab) {
                // Small delay to ensure everything is rendered
                setTimeout(() => {
                    try {
                        window.switchSessionsTab('completed');
                        console.log('Successfully switched to completed tab');
                    } catch (error) {
                        console.error('Error switching to completed tab:', error);
                    }
                }, 100);
            } else if (attempts < maxAttempts) {
                setTimeout(checkAndSwitch, 150);
            } else {
                console.warn('Could not switch to completed tab - function or elements not found after', maxAttempts, 'attempts');
                // Try one more time with a direct click as fallback
                setTimeout(() => {
                    const completedTabElement = document.querySelector('.tab-item[data-tab="completed"]');
                    if (completedTabElement) {
                        completedTabElement.click();
                    }
                }, 200);
            }
        };
        
        // Start checking after a short delay
        setTimeout(checkAndSwitch, 200);
    } catch (error) {
        console.error('Error loading sessions module:', error);
    }
}

// Function to view customer detail from dashboard
async function viewCustomerDetailFromDashboard(customerId) {
    // Validate customerId
    if (!customerId || customerId === 'undefined' || customerId === 'null') {
        console.error('Invalid customer ID:', customerId);
        alert('Invalid customer ID. Please try again.');
        return;
    }
    
    // Update sidebar to show Customers as active
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === 'customers') {
            item.classList.add('active');
        }
    });
    
    // Navigate to customers module and load customer detail view
    try {
        // Push state to browser history for customer detail view
        // Use clean URL for customer detail view (always include tab for consistency)
        const url = `/cms/customers/${customerId}/details`;
        window.history.pushState({ module: 'customers', customerId: customerId, view: 'detail', tab: 'details' }, '', url);
        
        // Update global CMS state
        window.CMS_CURRENT_MODULE = 'customers';
        window.CMS_CURRENT_CUSTOMER_ID = customerId;
        window.CMS_CURRENT_CUSTOMER_TAB = 'details';
        
        // Dynamically import and load customer detail view
        const detailModule = await import('./customer-detail-view.js');
        await detailModule.loadCustomerDetailView(customerId, 'details');
    } catch (error) {
        console.error('Error loading customer detail view:', error);
        alert('Failed to load customer details');
    }
}

// Make functions globally available
window.viewStationFromDashboard = viewStationFromDashboard;
window.viewSessionFromDashboard = viewSessionFromDashboard;
window.navigateToCompletedSessions = navigateToCompletedSessions;
window.viewCustomerDetailFromDashboard = viewCustomerDetailFromDashboard;

// Utility functions
function formatTime(date) {
    if (!date) {
        console.warn('formatTime: date is null or undefined');
        return 'Unknown';
    }
    
    try {
        const now = new Date();
        let sessionDate;
        
        // Handle different date formats
        if (typeof date === 'string') {
            sessionDate = new Date(date);
        } else if (date instanceof Date) {
            sessionDate = date;
        } else {
            // Try to parse as ISO string or timestamp
            sessionDate = new Date(date);
        }
        
        // Check if date is valid
        if (isNaN(sessionDate.getTime())) {
            console.warn('formatTime: invalid date', date);
            // Try to format as date string if possible
            if (typeof date === 'string') {
                return date.substring(0, 10); // Return first 10 chars if it's a string
            }
            return 'Unknown';
        }
        
        // Check if date is in the future (invalid)
        if (sessionDate > now) {
            return formatDate(sessionDate);
        }
        
        const diff = now - sessionDate;
        const minutes = Math.floor(diff / 60000);
        
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        
        // For older dates, show formatted date instead
        return formatDate(sessionDate);
    } catch (error) {
        console.error('Error formatting time:', error, date);
        // Try to return a readable format
        if (typeof date === 'string') {
            return date.substring(0, 10);
        }
        return 'Unknown';
    }
}

function formatDate(date) {
    const d = new Date(date);
    const options = { month: 'short', day: 'numeric' };
    return d.toLocaleDateString('en-US', options);
}

// Export functions
window.loadDashboardModule = loadDashboardModule;
window.loadChartData = loadChartData;
window.loadSessionsChart = loadSessionsChart;
window.loadRevenueChart = loadRevenueChart;


