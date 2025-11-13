// Dashboard Module - Home Screen
import { updateActiveNav, updatePageTitle, updateWalletBalance } from '../app.js';
import { getWalletBalance, getActiveSession, getStations } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

export async function loadDashboard() {
    updateActiveNav('dashboard');
    updatePageTitle('GenX EV');
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch wallet balance and active session
        const [walletResponse, sessionResponse] = await Promise.all([
            getWalletBalance().catch(() => ({ success: false, balance: 0 })),
            getActiveSession().catch(() => ({ success: false, session: null }))
        ]);
        const walletBalance = walletResponse.success ? walletResponse.balance : 0;
        const activeSession = sessionResponse.success ? sessionResponse.session : null;
        
        // Update wallet balance in header
        updateWalletBalance(walletBalance);
        
        // Show/hide active session banner
        const banner = document.getElementById('activeSessionBanner');
        if (activeSession) {
            banner.style.display = 'block';
            document.getElementById('bannerEnergy').textContent = `${activeSession.energy || 0} kWh`;
        } else {
            banner.style.display = 'none';
        }
        
        appMain.innerHTML = `
            <!-- Wallet Balance Card -->
            <div class="card">
                <div style="text-align: center;">
                    <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Wallet Balance</div>
                    <div style="font-size: 36px; font-weight: 700; color: var(--primary-color); margin-bottom: 16px;">
                        ₹${parseFloat(walletBalance || 0).toFixed(2)}
                    </div>
                    <button class="btn btn-primary btn-full" onclick="window.showTopUpModal()">
                        <i class="fas fa-plus"></i> Top Up Wallet
                    </button>
                </div>
            </div>
            
            <!-- Active Session Card -->
            ${activeSession ? `
            <div class="card" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white;">
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                    <div style="font-size: 32px;">
                        <i class="fas fa-bolt"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">Charging Active</div>
                        <div style="font-size: 14px; opacity: 0.9;">${activeSession.stationName || 'Station'}</div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                    <div>
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Energy</div>
                        <div style="font-size: 20px; font-weight: 600;">${activeSession.energy || 0} kWh</div>
                    </div>
                    <div>
                        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Cost</div>
                        <div style="font-size: 20px; font-weight: 600;">₹${parseFloat(activeSession.billedAmount || 0).toFixed(2)}</div>
                    </div>
                </div>
                <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);" onclick="window.viewActiveSession()">
                    View Details
                </button>
            </div>
            ` : ''}
            
            <!-- Stations List -->
            <div id="stationsList">
                <div class="spinner"></div>
            </div>
            
            <!-- View All Stations Button -->
            <div id="viewAllStationsBtn" style="display: none; margin-top: 16px;">
                <button class="btn btn-outline btn-full" onclick="window.loadStationsModule()">
                    <i class="fas fa-map-marker-alt"></i> View All Stations
                </button>
            </div>
        `;
        
        // Load stations
        loadStations();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Failed to load dashboard');
        appMain.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Dashboard</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

// Load stations
async function loadStations() {
    try {
        const DASHBOARD_LIMIT = 5;
        const container = document.getElementById('stationsList');
        const viewAllBtn = document.getElementById('viewAllStationsBtn');
        
        // Fetch stations from API
        const response = await getStations();
        const allStations = response.success && response.stations ? response.stations : [];
        const stations = allStations.slice(0, DASHBOARD_LIMIT);
        const hasMoreStations = allStations.length > DASHBOARD_LIMIT;
        
        if (stations && stations.length > 0) {
            container.innerHTML = stations.map(station => `
                <div class="card" style="cursor: pointer;" onclick="window.viewStationFromDashboard('${station.stationId}', '${station.stationName}')">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                        <div style="flex: 1;">
                            <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 4px;">${station.stationName}</h3>
                            <div style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                                <i class="fas fa-map-marker-alt"></i> ${station.city || 'N/A'}, ${station.state || 'N/A'}
                            </div>
                        </div>
                        <span class="badge ${station.status === 'Online' ? 'badge-success' : 'badge-danger'}">
                            ${station.status || 'Offline'}
                        </span>
                    </div>
                    <div style="margin-top: 12px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Available Chargers</div>
                                <div style="font-size: 16px; font-weight: 600;">${station.onlineCPs || 0} / ${station.totalCPs || station.chargers || 0}</div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Price</div>
                                <div style="font-size: 16px; font-weight: 600;">₹${station.pricePerKwh || 0}/kWh onwards</div>
                            </div>
                        </div>
                        ${station.amenities && station.amenities.length > 0 ? `
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;">
                            ${station.amenities.map(amenity => {
                                const iconMap = {
                                    'Parking': 'fa-parking',
                                    'Restroom': 'fa-restroom',
                                    'WiFi': 'fa-wifi',
                                    'Food': 'fa-utensils',
                                    'Cafe': 'fa-coffee',
                                    'Shop': 'fa-store'
                                };
                                const icon = iconMap[amenity] || 'fa-check';
                                return `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-secondary); background: var(--bg-color); padding: 4px 8px; border-radius: 6px;">
                                    <i class="fas ${icon}"></i>
                                    <span>${amenity}</span>
                                </span>`;
                            }).join('')}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');
            
            // Show "View All" button if there are more stations
            if (hasMoreStations && viewAllBtn) {
                viewAllBtn.style.display = 'block';
            } else if (viewAllBtn) {
                viewAllBtn.style.display = 'none';
            }
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-map-marker-alt"></i>
                    <h3>No Stations Found</h3>
                    <p>No charging stations available at the moment</p>
                </div>
            `;
            if (viewAllBtn) {
                viewAllBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading stations:', error);
        const container = document.getElementById('stationsList');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error Loading Stations</h3>
                    <p>Please try again later</p>
                </div>
            `;
        }
    }
}

// View station from dashboard
window.viewStationFromDashboard = async function(stationId, stationName) {
    const { loadStationDetail } = await import('./station-detail.js');
    await loadStationDetail(stationId, stationName);
};

