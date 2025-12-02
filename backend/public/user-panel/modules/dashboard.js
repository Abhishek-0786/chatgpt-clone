// Dashboard Module - Home Screen
import { updateActiveNav, updatePageTitle, updateWalletBalance } from '../app.js';
import { getWalletBalance, getActiveSession, getStations } from '../services/api.js';
import { showError } from '../../utils/notifications.js';

// Map instance (Google Maps)
let map = null;
let mapMarkers = [];
let markerCluster = null; // Google Maps MarkerClusterer
let selectedStation = null; // Store selected station for detail card
let userLocation = null; // Store user's current location
let userLocationMarker = null; // Marker for user's location
let currentFilters = {
    operationalStatus: 'all',
    connectorType: 'all'
};

export async function loadDashboard() {
    // Store current page in sessionStorage for refresh persistence
    const previousPage = sessionStorage.getItem('lastPage');
    if (previousPage === 'active-session') {
        // Store the page before active-session for back button navigation
        sessionStorage.setItem('lastPageBeforeActive', 'dashboard');
    }
    sessionStorage.setItem('lastPage', 'dashboard');
    
    // Hide back button when on dashboard
    const backButton = document.querySelector('.back-button');
    if (backButton) {
        backButton.style.display = 'none';
    }
    
    // Ensure bottom navigation is visible on dashboard
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        bottomNav.style.display = 'flex';
    }
    
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
        
        // Show/hide active session snackbar (only if not on active session page)
        const banner = document.getElementById('activeSessionBanner');
        if (activeSession) {
            if (banner) {
                banner.style.display = 'flex';
                const bannerEnergy = document.getElementById('bannerEnergy');
                if (bannerEnergy) {
                    bannerEnergy.textContent = `${(activeSession.energy || 0).toFixed(2)} kWh`;
                }
                // Make the entire banner clickable to redirect to active session page
                banner.style.cursor = 'pointer';
                banner.onclick = async function() {
                    const { loadActiveSession } = await import('./active-session.js');
                    await loadActiveSession();
                };
            }
        } else {
            if (banner) {
                banner.style.display = 'none';
            }
        }
        
        appMain.innerHTML = `
            <!-- Map Section with Search Overlay - Full Background -->
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 70px; z-index: 1; overflow: hidden;">
                <!-- Map Background -->
                <div id="stationsMap" style="height: 100%; width: 100%;"></div>
                
                <!-- Search Bar Overlay -->
                <div style="position: absolute; top: 80px; left: 16px; right: 16px; z-index: 1000; pointer-events: auto;">
                    <div style="display: flex; align-items: center; gap: 12px; background: white; border-radius: 12px; padding: 12px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); pointer-events: auto; border: 1px solid rgba(0,0,0,0.1);">
                        <i class="fas fa-search" style="color: var(--text-secondary); font-size: 16px; flex-shrink: 0;"></i>
                        <input 
                            type="text" 
                            id="locationSearchInput" 
                            placeholder="Search by city, state, or address..." 
                            style="flex: 1; border: none; background: transparent; outline: none; font-size: 14px; color: var(--text-primary); min-width: 0;"
                            onkeyup="if(event.key === 'Enter') window.searchStationsByLocation()"
                        />
                        <button 
                            onclick="window.clearLocationSearch()" 
                            id="clearLocationBtn" 
                            style="display: none; background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; font-size: 14px; flex-shrink: 0;"
                        >
                            <i class="fas fa-times"></i>
                        </button>
                        <div style="width: 1px; height: 24px; background: rgba(0,0,0,0.1); flex-shrink: 0;"></div>
                        <button 
                            onclick="window.showFilterModal()" 
                            id="filterBtn"
                            style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; font-size: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;"
                            title="Filter stations"
                        >
                            <i class="fas fa-filter"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Filter Modal -->
                <div id="filterModal" style="display: none; position: absolute; top: 140px; left: 16px; right: 16px; z-index: 1001; background: white; border-radius: 12px; padding: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); pointer-events: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="font-size: 18px; font-weight: 600; margin: 0; color: var(--text-primary);">Filter Stations</h3>
                        <button onclick="window.closeFilterModal()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 18px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <!-- Operational Status Filter -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">Operational Status</label>
                        <select id="operationalStatusFilter" style="width: 100%; padding: 10px; border: 2px solid var(--border-color); border-radius: 8px; font-size: 14px; background: white; color: var(--text-primary);" onchange="window.applyFilters()">
                            <option value="all">All Stations</option>
                            <option value="operational">Operational</option>
                            <option value="non-operational">Non-Operational</option>
                        </select>
                    </div>
                    
                    <!-- Connector Type Filter -->
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: var(--text-primary);">Connector Type</label>
                        <select id="connectorTypeFilter" style="width: 100%; padding: 10px; border: 2px solid var(--border-color); border-radius: 8px; font-size: 14px; background: white; color: var(--text-primary);" onchange="window.applyFilters()">
                            <option value="all">All Types</option>
                            <option value="type2">Type 2</option>
                            <option value="ccs2">CCS2</option>
                            <option value="type1">Type 1</option>
                            <option value="gbt">GBT</option>
                            <option value="nacs">NACS</option>
                            <option value="ac_socket">AC Socket</option>
                        </select>
                    </div>
                    
                    <button onclick="window.resetFilters()" class="btn btn-outline btn-full" style="margin-top: 8px;">
                        Reset Filters
                    </button>
                </div>
                
                <!-- Station Detail Card (shown when marker is clicked) -->
                <div id="stationDetailCard" style="display: none; position: absolute; bottom: 16px; left: 16px; right: 16px; z-index: 1002; background: white; border-radius: 12px; padding: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); cursor: pointer; max-width: calc(100vw - 32px);" onclick="window.viewStationFromMapCard()">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px; gap: 8px; min-width: 0;">
                        <div style="flex: 1; min-width: 0; overflow: hidden;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; min-width: 0;">
                                <span id="stationCardStatus" class="badge badge-success" style="display: inline-block; font-size: 10px; padding: 4px 8px; flex-shrink: 0;">Available</span>
                                <h3 id="stationCardName" style="font-size: 16px; font-weight: 600; margin: 0; color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></h3>
                            </div>
                            <p id="stationCardAddress" style="font-size: 12px; color: var(--text-secondary); margin: 0; display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden;">
                                <i class="fas fa-map-marker-alt" style="font-size: 11px; flex-shrink: 0;"></i> 
                                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1;"></span>
                            </p>
                            <p id="stationCardDistance" style="font-size: 11px; color: var(--primary-color); margin: 4px 0 0 0; display: none; align-items: center; gap: 4px; font-weight: 500;">
                                <i class="fas fa-route" style="font-size: 10px;"></i> 
                                <span id="stationCardDistanceText"></span>
                            </p>
                        </div>
                        <button onclick="event.stopPropagation(); window.closeStationDetailCard()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px; flex-shrink: 0; margin-left: 4px;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                        <div>
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Available Chargers</div>
                            <div id="stationCardChargers" style="font-size: 14px; font-weight: 600;"></div>
                        </div>
                        <div>
                            <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 2px;">Price</div>
                            <div id="stationCardPrice" style="font-size: 14px; font-weight: 600;"></div>
                        </div>
                    </div>
                    
                    <!-- Connector Types -->
                    <div style="margin-bottom: 0;">
                        <div style="font-size: 10px; color: var(--text-secondary); margin-bottom: 4px; font-weight: 600;">Supported Connectors</div>
                        <div id="stationCardConnectors" style="display: flex; flex-wrap: wrap; gap: 6px;">
                            <!-- Connector icons will be inserted here -->
                        </div>
                    </div>
                    
                    <!-- Navigate Button - Fixed at bottom right -->
                    <button 
                        id="stationCardNavigateBtn"
                        style="position: absolute; bottom: 12px; right: 12px; background: var(--primary-color); border: none; color: white; cursor: pointer; padding: 10px; font-size: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%; width: 44px; height: 44px; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: all 0.2s; z-index: 10;"
                        onclick="event.stopPropagation(); window.navigateToStation()"
                        onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'"
                        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)'"
                        title="Navigate to station"
                    >
                        <i class="fas fa-map-marked-alt"></i>
                    </button>
                </div>
                
                <!-- Floating Location Button (Bottom Right) -->
                <div id="floatingLocationBtn" 
                     style="position: absolute; bottom: 90px; right: 16px; z-index: 999; pointer-events: auto; display: block;"
                     onclick="window.handleLocationButtonClick()">
                    <div id="locationButtonContent" style="background: ${userLocation ? '#007bff' : '#dc3545'}; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px ${userLocation ? 'rgba(0, 123, 255, 0.4)' : 'rgba(220, 53, 69, 0.4)'}; cursor: pointer; transition: all 0.3s; border: 3px solid white;"
                         onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 16px ${userLocation ? 'rgba(0, 123, 255, 0.5)' : 'rgba(220, 53, 69, 0.5)'}'"
                         onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px ${userLocation ? 'rgba(0, 123, 255, 0.4)' : 'rgba(220, 53, 69, 0.4)'}'">
                        <i class="fas ${userLocation ? 'fa-crosshairs' : 'fa-map-marker-alt'}" style="color: white; font-size: 20px;"></i>
                    </div>
                </div>
            </div>
            
            <!-- Spacer to prevent content overlap -->
            <div style="height: calc(100vh - 70px);"></div>
        `;
        
        // Setup search input event listeners
        const searchInput = document.getElementById('locationSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function() {
                const clearBtn = document.getElementById('clearLocationBtn');
                if (this.value.trim()) {
                    clearBtn.style.display = 'block';
                } else {
                    clearBtn.style.display = 'none';
                }
            });
        }
        
        // Initialize map and load stations
        // Wait a bit for DOM to be ready
        setTimeout(async () => {
            await initializeMap();
            // Add user location marker if we have saved location and permission
            setTimeout(() => {
                if (userLocation && map) {
                    addUserLocationMarker();
                    // Center map on user location
                    map.setCenter(userLocation);
                    map.setZoom(12);
                }
            }, 200);
            loadStations();
            
            // Update floating location button state based on user location (after permission check)
            updateLocationButtonState();
        }, 100);
        
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

// Update location button state based on current userLocation
function updateLocationButtonState() {
    const floatingBtn = document.getElementById('floatingLocationBtn');
    const btnContent = document.getElementById('locationButtonContent');
    if (floatingBtn && btnContent) {
        if (userLocation) {
            // Location is active - show blue button with crosshairs
            btnContent.style.background = '#007bff';
            btnContent.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.4)';
            btnContent.innerHTML = '<i class="fas fa-crosshairs" style="color: white; font-size: 20px;"></i>';
            btnContent.setAttribute('onmouseover', "this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 16px rgba(0, 123, 255, 0.5)'");
            btnContent.setAttribute('onmouseout', "this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0, 123, 255, 0.4)'");
        } else {
            // Location not active - show red button with marker icon
            btnContent.style.background = '#dc3545';
            btnContent.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.4)';
            btnContent.innerHTML = '<i class="fas fa-map-marker-alt" style="color: white; font-size: 20px;"></i>';
            btnContent.setAttribute('onmouseover', "this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 16px rgba(220, 53, 69, 0.5)'");
            btnContent.setAttribute('onmouseout', "this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(220, 53, 69, 0.4)'");
        }
    }
}

// Handle location button click
window.handleLocationButtonClick = function() {
    if (userLocation) {
        // If location is already active, re-center map on user location
        if (map) {
            map.setCenter(userLocation);
            map.setZoom(12);
        }
    } else {
        // Request location permission
        window.requestUserLocation();
    }
};

// Request user location
window.requestUserLocation = async function() {
    const floatingBtn = document.getElementById('floatingLocationBtn');
    const btnContent = document.getElementById('locationButtonContent');
    
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser');
        return;
    }
    
    // Show loading state on floating button
    if (btnContent) {
        btnContent.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: white; font-size: 20px;"></i>';
        btnContent.style.pointerEvents = 'none';
    }
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            // Store in sessionStorage for persistence
            sessionStorage.setItem('userLocation', JSON.stringify(userLocation));
            
            // Update button to show active state (blue with crosshairs icon)
            if (btnContent) {
                btnContent.style.background = '#007bff';
                btnContent.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.4)';
                btnContent.innerHTML = '<i class="fas fa-crosshairs" style="color: white; font-size: 20px;"></i>';
                btnContent.style.pointerEvents = 'auto';
                // Update hover shadow
                btnContent.setAttribute('onmouseover', "this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 16px rgba(0, 123, 255, 0.5)'");
                btnContent.setAttribute('onmouseout', "this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0, 123, 255, 0.4)'");
            }
            
            // Update map center
            if (map) {
                map.setCenter(userLocation);
                map.setZoom(12); // Zoom to city level
                
                // Add user location marker
                addUserLocationMarker();
            }
            
            // Reload stations to sort by distance
            await loadStations();
        },
        (error) => {
            console.error('Error getting location:', error);
            let errorMessage = 'Unable to get your location';
            if (error.code === error.PERMISSION_DENIED) {
                errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                errorMessage = 'Location information unavailable.';
            } else if (error.code === error.TIMEOUT) {
                errorMessage = 'Location request timed out.';
            }
            showError(errorMessage);
            
            // Reset button state
            if (btnContent) {
                btnContent.style.background = '#dc3545';
                btnContent.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.4)';
                btnContent.innerHTML = '<i class="fas fa-map-marker-alt" style="color: white; font-size: 20px;"></i>';
                btnContent.style.pointerEvents = 'auto';
                // Reset hover shadow
                btnContent.setAttribute('onmouseover', "this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 16px rgba(220, 53, 69, 0.5)'");
                btnContent.setAttribute('onmouseout', "this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(220, 53, 69, 0.4)'");
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
};

// Add user location marker to map
function addUserLocationMarker() {
    if (!map || !userLocation) return;
    
    // Remove existing user location marker
    if (userLocationMarker) {
        userLocationMarker.setMap(null);
    }
    
    // Create custom marker for user location
    const userMarkerDiv = document.createElement('div');
    userMarkerDiv.className = 'user-location-marker';
    userMarkerDiv.innerHTML = `
        <div style="width: 20px; height: 20px; background: #007bff; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
        <div style="width: 40px; height: 40px; background: rgba(0,123,255,0.2); border-radius: 50%; position: absolute; top: -10px; left: -10px; animation: pulse 2s infinite;"></div>
    `;
    
    // Create overlay for user location
    class UserLocationOverlay extends google.maps.OverlayView {
        constructor(position, map) {
            super();
            this.position = position;
            this.setMap(map);
        }
        
        onAdd() {
            this.div = document.createElement('div');
            this.div.style.position = 'absolute';
            this.div.style.cursor = 'pointer';
            this.div.innerHTML = `
                <div style="position: relative;">
                    <div style="width: 20px; height: 20px; background: #007bff; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>
                    <div style="width: 40px; height: 40px; background: rgba(0,123,255,0.2); border-radius: 50%; position: absolute; top: -10px; left: -10px; animation: pulse 2s infinite;"></div>
                </div>
            `;
            const panes = this.getPanes();
            panes.overlayMouseTarget.appendChild(this.div);
        }
        
        draw() {
            const overlayProjection = this.getProjection();
            const position = overlayProjection.fromLatLngToDivPixel(this.position);
            if (this.div) {
                this.div.style.left = (position.x - 10) + 'px';
                this.div.style.top = (position.y - 10) + 'px';
            }
        }
        
        onRemove() {
            if (this.div && this.div.parentNode) {
                this.div.parentNode.removeChild(this.div);
            }
        }
    }
    
    userLocationMarker = new UserLocationOverlay(userLocation, map);
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

// Check geolocation permission status
async function checkGeolocationPermission() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(false);
            return;
        }
        
        // Use Permissions API if available (more reliable)
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
                resolve(result.state === 'granted');
            }).catch(() => {
                // Fallback to getCurrentPosition if Permissions API fails
                checkPermissionWithGetCurrentPosition(resolve);
            });
        } else {
            // Fallback: Try to get current position with a short timeout
            checkPermissionWithGetCurrentPosition(resolve);
        }
    });
}

// Fallback permission check using getCurrentPosition
function checkPermissionWithGetCurrentPosition(resolve) {
    navigator.geolocation.getCurrentPosition(
        () => resolve(true), // Permission granted
        (error) => {
            // Permission denied
            if (error.code === error.PERMISSION_DENIED) {
                resolve(false);
            } else {
                // Other errors (timeout, unavailable) - assume permission might be granted
                // but location is just unavailable right now
                resolve(true);
            }
        },
        { timeout: 500, maximumAge: 0 }
    );
}

// Initialize Google Maps
async function initializeMap() {
    // Check if Google Maps is loaded
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.warn('Google Maps not loaded yet, retrying...');
        setTimeout(initializeMap, 100);
        return;
    }
    
    // Try to restore user location from sessionStorage, but verify permission first
    const savedLocation = sessionStorage.getItem('userLocation');
    if (savedLocation) {
        try {
            const parsedLocation = JSON.parse(savedLocation);
            // Check if geolocation permission is still available
            const hasPermission = await checkGeolocationPermission();
            if (hasPermission) {
                userLocation = parsedLocation;
            } else {
                // Permission was revoked, clear stored location
                sessionStorage.removeItem('userLocation');
                userLocation = null;
                // Remove user location marker if it exists
                if (userLocationMarker) {
                    userLocationMarker.setMap(null);
                    userLocationMarker = null;
                }
                // Reset location button state
                updateLocationButtonState();
            }
        } catch (e) {
            userLocation = null;
            sessionStorage.removeItem('userLocation');
        }
    }
    
    // Default center (India - New Delhi) or user location
    const defaultCenter = userLocation || { lat: 28.6139, lng: 77.2090 };
    const defaultZoom = userLocation ? 12 : 5;
    
    // Initialize map if not already initialized
    const mapContainer = document.getElementById('stationsMap');
    if (!mapContainer) {
        console.warn('Map container not found');
        return;
    }
    
    // If map exists, check if it's still valid
    if (map) {
        try {
            const currentContainer = document.getElementById('stationsMap');
            if (currentContainer && map.getDiv() === currentContainer) {
                // Map is still valid, trigger resize
                setTimeout(() => {
                    if (map) {
                        google.maps.event.trigger(map, 'resize');
                    }
                }, 100);
                return;
            } else {
                // Map container was replaced, clear old map
                console.log('Map container was replaced, clearing old map instance');
                map = null;
                mapMarkers = [];
                markerCluster = null;
            }
        } catch (error) {
            console.log('Map instance is invalid, clearing it:', error);
            map = null;
            mapMarkers = [];
            markerCluster = null;
        }
    }
    
    try {
        // Create new Google Maps instance
        map = new google.maps.Map(mapContainer, {
            center: defaultCenter,
            zoom: defaultZoom, // Zoom level based on whether user location is available
            mapTypeId: 'roadmap',
            disableDefaultUI: false,
            zoomControl: false, // Disable zoom controls
            mapTypeControl: false,
            scaleControl: false,
            streetViewControl: false,
            fullscreenControl: false,
            // Enable one-finger panning (greedy mode)
            gestureHandling: 'greedy',
            // Set region to India
            region: 'IN',
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });
        
        // Reset initial fit flag for new map instance
        map.hasInitialFit = false;
        
        // Close station card when clicking on map
        map.addListener('click', function(e) {
            // Check if click was on a marker
            const clickedElement = e.domEvent?.target;
            const isMarkerClick = clickedElement?.closest('.genx-marker-container') || 
                                  clickedElement?.closest('.genx-marker-teardrop') ||
                                  clickedElement?.closest('.genx-marker-content') ||
                                  clickedElement?.closest('.genx-marker-status');
            if (!isMarkerClick) {
                window.closeStationDetailCard();
            }
        });
    } catch (error) {
        console.error('Error initializing Google Maps:', error);
    }
}

// Get organization logo/icon based on organization value
function getOrganizationIcon(organization) {
    // Map formatted names back to original values if needed
    const orgNameMap = {
        'Massive Mobility': 'massive_mobility',
        '1C EV Charging': '1c_ev_charging',
        'GenX': 'genx'
    };
    
    // Normalize organization value (handle both original and formatted)
    const normalizedOrg = orgNameMap[organization] || organization || 'genx';
    
    const orgLogos = {
        'genx': {
            type: 'icon',
            value: 'fas fa-robot'
        },
        '1c_ev_charging': {
            type: 'image',
            value: '/user-panel/images/organization-logos/1c-ev-charging', // Will try .png and .jpg
            extensions: ['.png', '.jpg', '.jpeg']
        },
        'massive_mobility': {
            type: 'image',
            value: '/user-panel/images/organization-logos/massive-mobility', // Will try .png and .jpg
            extensions: ['.png', '.jpg', '.jpeg']
        }
    };
    
    return orgLogos[normalizedOrg] || orgLogos['genx']; // Default to GenX robot icon
}

// Custom Google Maps Overlay for GenX markers
class GenXMarkerOverlay extends google.maps.OverlayView {
    constructor(position, station, map) {
        super();
        this.position = position;
        this.station = station;
        this.setMap(map);
    }
    
    onAdd() {
        const isOperational = this.station.status === 'Online';
        const statusIcon = isOperational ? '✓' : '✕';
        const statusClass = isOperational ? 'marker-status-available' : 'marker-status-unavailable';
        
        // Get organization icon/logo
        // Use organization field (original value) if available, otherwise fallback
        const orgValue = this.station.organization || this.station.organizationDisplay || 'genx';
        const orgIcon = getOrganizationIcon(orgValue);
        
        // Create icon HTML based on type
        let iconHTML = '';
        if (orgIcon.type === 'image') {
            // Use image logo - try first extension (.png)
            const imagePath = orgIcon.value + (orgIcon.extensions ? orgIcon.extensions[0] : '.png');
            const extensions = orgIcon.extensions || ['.png', '.jpg', '.jpeg'];
            iconHTML = `<img src="${imagePath}" 
                             alt="${this.station.organization || orgValue}" 
                             class="genx-marker-logo"
                             onerror="(function(img,exts){var s=img.src,b=s.substring(0,s.lastIndexOf('.'));var t=exts.findIndex(function(e){return s.endsWith(e)});if(t<exts.length-1){img.src=b+exts[t+1]}else{img.style.display='none';img.parentElement.innerHTML='<i class=\\'fas fa-robot genx-marker-icon\\'></i>'}})(this,${JSON.stringify(extensions)})">
                        `;
        } else {
            // Use Font Awesome icon (default robot icon for GenX)
            iconHTML = `<i class="${orgIcon.value} genx-marker-icon"></i>`;
        }
        
        const div = document.createElement('div');
        div.className = 'genx-marker-container';
        div.style.position = 'absolute';
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div class="genx-marker-teardrop">
                <div class="genx-marker-content">
                    ${iconHTML}
                </div>
                <div class="genx-marker-status ${statusClass}">${statusIcon}</div>
            </div>
        `;
        
        // Store station data
        div.stationData = this.station;
        
        // Add click event
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            showStationDetailCard(this.station);
        });
        
        // Add hover effect
        div.addEventListener('mouseenter', () => {
            const teardrop = div.querySelector('.genx-marker-teardrop');
            if (teardrop) {
                teardrop.style.transform = 'scale(1.1)';
                teardrop.style.transition = 'transform 0.2s ease';
            }
        });
        
        div.addEventListener('mouseleave', () => {
            const teardrop = div.querySelector('.genx-marker-teardrop');
            if (teardrop) {
                teardrop.style.transform = 'scale(1)';
            }
        });
        
        this.div = div;
        const panes = this.getPanes();
        panes.overlayMouseTarget.appendChild(div);
    }
    
    draw() {
        const overlayProjection = this.getProjection();
        const position = overlayProjection.fromLatLngToDivPixel(this.position);
        
        if (this.div) {
            this.div.style.left = (position.x - 22.5) + 'px';
            this.div.style.top = (position.y - 55) + 'px';
        }
    }
    
    onRemove() {
        if (this.div && this.div.parentNode) {
            this.div.parentNode.removeChild(this.div);
        }
    }
}

// Update map with stations
function updateMapWithStations(stations) {
    // Check if Google Maps is loaded
    if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
        console.warn('Google Maps not loaded yet');
        return;
    }
    
    // Initialize map if not already done
    if (!map) {
        initializeMap();
        // Wait a bit for map to initialize, then try again
        setTimeout(() => updateMapWithStations(stations), 200);
        return;
    }
    
    // Clear existing markers
    mapMarkers.forEach(marker => {
        if (marker && marker.onRemove) {
            marker.onRemove();
        }
        if (marker && marker.setMap) {
            marker.setMap(null);
        }
    });
    mapMarkers = [];
    
    // Clear marker cluster if exists
    if (markerCluster) {
        markerCluster.clearMarkers();
        markerCluster = null;
    }
    
    // Filter stations with valid coordinates
    const stationsWithCoords = stations.filter(station => 
        station.latitude && station.longitude && 
        !isNaN(station.latitude) && !isNaN(station.longitude)
    );
    
    if (stationsWithCoords.length === 0 && !userLocation) {
        // If no stations with coordinates and no user location, keep default view
        return;
    }
    
    // If user location is available but no stations, center on user location
    if (stationsWithCoords.length === 0 && userLocation) {
        addUserLocationMarker();
        if (!map.hasInitialFit) {
            map.setCenter(userLocation);
            map.setZoom(12);
            map.hasInitialFit = true;
        }
        return;
    }
    
    // Create bounds to fit all markers
    const bounds = new google.maps.LatLngBounds();
    
    // Include user location in bounds if available
    if (userLocation) {
        bounds.extend(new google.maps.LatLng(userLocation.lat, userLocation.lng));
    }
    
    // Create markers for each station
    stationsWithCoords.forEach(station => {
        const position = new google.maps.LatLng(station.latitude, station.longitude);
        
        // Create custom overlay marker
        const marker = new GenXMarkerOverlay(position, station, map);
        
        mapMarkers.push(marker);
        bounds.extend(position);
    });
    
    // Add user location marker if available
    if (userLocation) {
        addUserLocationMarker();
    }
    
    // Fit map to show all markers and user location (only on initial load, not when filters change)
    if ((mapMarkers.length > 0 || userLocation) && !map.hasInitialFit) {
        try {
            if (userLocation && mapMarkers.length === 0) {
                // Only user location, center on it
                map.setCenter(userLocation);
                map.setZoom(12);
            } else if (bounds.getNorthEast() && bounds.getSouthWest()) {
                // Fit bounds to include all markers and user location
                map.fitBounds(bounds, {
                    padding: 50
                });
                // Limit max zoom to prevent too much zooming in
                map.addListener('bounds_changed', function() {
                    if (map.getZoom() > 15) {
                        map.setZoom(15);
                    }
                });
            }
            map.hasInitialFit = true; // Mark that initial fit has been done
        } catch (error) {
            console.error('Error fitting bounds:', error);
        }
    }
}

// Show station detail card
// Get connector type icon HTML
function getConnectorTypeIcon(connectorType) {
    const icons = {
        'type2': { icon: 'fa-plug', name: 'Type 2', color: '#007bff' },
        'ccs2': { icon: 'fa-bolt', name: 'CCS2', color: '#dc3545' },
        'type1': { icon: 'fa-plug', name: 'Type 1', color: '#28a745' },
        'gbt': { icon: 'fa-charging-station', name: 'GB/T', color: '#ffc107' },
        'nacs': { icon: 'fa-bolt', name: 'NACS', color: '#17a2b8' },
        'ac_socket': { icon: 'fa-plug', name: 'AC Socket', color: '#6c757d' }
    };
    
    const connector = icons[connectorType.toLowerCase()] || { icon: 'fa-plug', name: connectorType, color: '#6c757d' };
    
    return `
        <div style="display: flex; align-items: center; gap: 4px; background: #f8f9fa; padding: 4px 8px; border-radius: 6px; border: 1px solid #e0e0e0;">
            <i class="fas ${connector.icon}" style="color: ${connector.color}; font-size: 11px;"></i>
            <span style="font-size: 10px; font-weight: 500; color: var(--text-primary);">${connector.name}</span>
        </div>
    `;
}

// Get amenity icon HTML
function getAmenityIcon(amenity) {
    const icons = {
        'restroom': { icon: 'fa-restroom', name: 'Restroom' },
        'cafe': { icon: 'fa-coffee', name: 'Cafe' },
        'restaurant': { icon: 'fa-utensils', name: 'Restaurant' },
        'parking': { icon: 'fa-parking', name: 'Parking' },
        'wifi': { icon: 'fa-wifi', name: 'WiFi' },
        'shopping': { icon: 'fa-shopping-bag', name: 'Shopping' },
        'atm': { icon: 'fa-money-bill', name: 'ATM' },
        'security': { icon: 'fa-shield-alt', name: 'Security' },
        'waiting_area': { icon: 'fa-couch', name: 'Waiting Area' },
        'vending_machine': { icon: 'fa-cookie', name: 'Vending Machine' },
        'hotel': { icon: 'fa-hotel', name: 'Hotel' },
        'mall': { icon: 'fa-store', name: 'Mall' }
    };
    
    const amenityData = icons[amenity.toLowerCase()] || { icon: 'fa-check-circle', name: amenity };
    
    return `
        <div style="display: flex; align-items: center; gap: 4px; background: #f0f8ff; padding: 4px 8px; border-radius: 6px; border: 1px solid #e0e0e0;">
            <i class="fas ${amenityData.icon}" style="color: #007bff; font-size: 11px;"></i>
            <span style="font-size: 10px; font-weight: 500; color: var(--text-primary);">${amenityData.name}</span>
        </div>
    `;
}

function showStationDetailCard(station) {
    selectedStation = station;
    const card = document.getElementById('stationDetailCard');
    if (!card) return;
    
    // Update card content
    document.getElementById('stationCardName').textContent = station.stationName || 'Charging Station';
    document.getElementById('stationCardAddress').querySelector('span').textContent = 
        `${station.city || ''}, ${station.state || ''}`.replace(/^,\s*|,\s*$/g, '') || station.fullAddress || 'Address not available';
    
    const statusBadge = document.getElementById('stationCardStatus');
    statusBadge.textContent = station.status || 'Offline';
    statusBadge.className = station.status === 'Online' ? 'badge badge-success' : 'badge badge-danger';
    
    document.getElementById('stationCardChargers').textContent = `${station.onlineCPs || 0} / ${station.totalCPs || 0}`;
    document.getElementById('stationCardPrice').textContent = `₹${station.pricePerKwh || 0}/kWh onwards`;
    
    // Calculate and display distance if user location is available
    const distanceElement = document.getElementById('stationCardDistance');
    const distanceText = document.getElementById('stationCardDistanceText');
    if (userLocation && station.latitude && station.longitude) {
        const distance = calculateDistance(
            userLocation.lat,
            userLocation.lng,
            station.latitude,
            station.longitude
        );
        // Format distance: show 1 decimal place if >= 1km, otherwise show 2 decimal places
        const formattedDistance = distance >= 1 
            ? distance.toFixed(1) 
            : distance.toFixed(2);
        distanceText.textContent = `${formattedDistance} km away`;
        distanceElement.style.display = 'flex';
    } else {
        distanceElement.style.display = 'none';
    }
    
    // Update connector types
    const connectorsContainer = document.getElementById('stationCardConnectors');
    if (connectorsContainer) {
        if (station.connectorTypes && Array.isArray(station.connectorTypes) && station.connectorTypes.length > 0) {
            connectorsContainer.innerHTML = station.connectorTypes.map(type => getConnectorTypeIcon(type)).join('');
        } else {
            connectorsContainer.innerHTML = '<span style="font-size: 12px; color: var(--text-secondary);">No connector information available</span>';
        }
    }
    
    // Show/hide navigate button based on coordinates
    const navigateBtn = document.getElementById('stationCardNavigateBtn');
    if (navigateBtn) {
        if (station.latitude && station.longitude) {
            navigateBtn.style.display = 'flex';
        } else {
            navigateBtn.style.display = 'none';
        }
    }
    
    // Show card
    card.style.display = 'block';
    
    // Hide location button when card is open
    const locationBtn = document.getElementById('floatingLocationBtn');
    if (locationBtn) {
        locationBtn.style.display = 'none';
    }
    
    // Ensure markers remain visible - don't pan or zoom map
    // Markers should stay in their position
    // Force all markers to remain visible
    if (map && mapMarkers.length > 0) {
        mapMarkers.forEach(marker => {
            if (marker && marker._icon) {
                marker._icon.style.display = 'block';
                marker._icon.style.opacity = '1';
                marker._icon.style.visibility = 'visible';
            }
        });
    }
}

// Close station detail card
window.closeStationDetailCard = function() {
    const card = document.getElementById('stationDetailCard');
    if (card) {
        card.style.display = 'none';
    }
    selectedStation = null;
    
    // Show location button again when card is closed
    const locationBtn = document.getElementById('floatingLocationBtn');
    if (locationBtn) {
        locationBtn.style.display = 'block';
    }
    
    // Ensure all markers remain visible
    if (map && mapMarkers.length > 0) {
        mapMarkers.forEach(marker => {
            if (marker && marker._icon) {
                marker._icon.style.display = 'block';
                marker._icon.style.opacity = '1';
            }
        });
    }
};

// Navigate to station location
window.navigateToStation = function() {
    if (!selectedStation || !selectedStation.latitude || !selectedStation.longitude) {
        alert('Location information not available for this station');
        return;
    }
    
    // Open Google Maps with the station location
    const lat = selectedStation.latitude;
    const lng = selectedStation.longitude;
    const stationName = encodeURIComponent(selectedStation.stationName || 'Charging Station');
    
    // Try to open in Google Maps app first, fallback to web
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${stationName}`;
    const appleMapsUrl = `https://maps.apple.com/?daddr=${lat},${lng}`;
    
    // Detect if iOS device
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (isIOS) {
        // Try Apple Maps first on iOS
        window.open(appleMapsUrl, '_blank');
    } else {
        // Use Google Maps for Android and other devices
        window.open(googleMapsUrl, '_blank');
    }
};

// View station from map card
window.viewStationFromMapCard = async function() {
    if (!selectedStation) return;
    const { loadStationDetail } = await import('./station-detail.js');
    await loadStationDetail(selectedStation.stationId, selectedStation.stationName);
};

// View station from map (legacy support)
window.viewStationFromMap = async function(stationId, stationName) {
    const { loadStationDetail } = await import('./station-detail.js');
    await loadStationDetail(stationId, stationName);
};

// Load stations
async function loadStations(location = null) {
    try {
        const DASHBOARD_LIMIT = 5;
        const container = document.getElementById('stationsList');
        const viewAllBtn = document.getElementById('viewAllStationsBtn');
        
        // Build API params
        const params = {};
        if (location && location.trim()) {
            params.location = location.trim();
        } else {
            // If no location, sort by last active
            params.sortBy = 'lastActive';
        }
        
        // Fetch stations from API
        const response = await getStations(params);
        let allStations = response.success && response.stations ? response.stations : [];
        
        // If user location is available, calculate distance and sort by distance
        if (userLocation) {
            allStations = allStations.map(station => {
                if (station.latitude && station.longitude) {
                    const distance = calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        station.latitude,
                        station.longitude
                    );
                    return {
                        ...station,
                        distance: distance // Distance in km
                    };
                }
                return {
                    ...station,
                    distance: Infinity // Stations without coordinates go to the end
                };
            });
            
            // Sort by distance (nearest first)
            allStations.sort((a, b) => a.distance - b.distance);
        }
        
        // Apply filters
        allStations = applyStationFilters(allStations);
        
        const stations = allStations.slice(0, DASHBOARD_LIMIT);
        const hasMoreStations = allStations.length > DASHBOARD_LIMIT;
        
        // Update map with filtered stations
        updateMapWithStations(allStations);
        
        // Hide stations list container since we're using map only
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        if (viewAllBtn) {
            viewAllBtn.style.display = 'none';
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

// Search stations by location
window.searchStationsByLocation = async function() {
    const searchInput = document.getElementById('locationSearchInput');
    const location = searchInput ? searchInput.value.trim() : '';
    await loadStations(location);
};

// Clear location search
window.clearLocationSearch = async function() {
    const searchInput = document.getElementById('locationSearchInput');
    const clearBtn = document.getElementById('clearLocationBtn');
    if (searchInput) {
        searchInput.value = '';
        clearBtn.style.display = 'none';
    }
    await loadStations(null);
};

// Show filter modal
window.showFilterModal = function() {
    const filterModal = document.getElementById('filterModal');
    if (filterModal) {
        filterModal.style.display = 'block';
    }
};

// Close filter modal
window.closeFilterModal = function() {
    const filterModal = document.getElementById('filterModal');
    if (filterModal) {
        filterModal.style.display = 'none';
    }
};

// Apply filters
window.applyFilters = async function() {
    const operationalStatus = document.getElementById('operationalStatusFilter')?.value || 'all';
    const connectorType = document.getElementById('connectorTypeFilter')?.value || 'all';
    
    currentFilters = {
        operationalStatus: operationalStatus,
        connectorType: connectorType
    };
    
    // Update filter button to show active state
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        const hasActiveFilters = operationalStatus !== 'all' || connectorType !== 'all';
        if (hasActiveFilters) {
            filterBtn.style.color = 'var(--primary-color)';
            filterBtn.innerHTML = '<i class="fas fa-filter" style="position: relative;"><span style="position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; background: var(--primary-color); border-radius: 50%; border: 2px solid white;"></span></i>';
        } else {
            filterBtn.style.color = 'var(--text-secondary)';
            filterBtn.innerHTML = '<i class="fas fa-filter"></i>';
        }
    }
    
    // Reload stations with filters
    const searchInput = document.getElementById('locationSearchInput');
    const location = searchInput ? searchInput.value.trim() : '';
    await loadStations(location);
    
    // Close modal after applying
    window.closeFilterModal();
};

// Reset filters
window.resetFilters = async function() {
    const operationalStatusFilter = document.getElementById('operationalStatusFilter');
    const connectorTypeFilter = document.getElementById('connectorTypeFilter');
    
    if (operationalStatusFilter) operationalStatusFilter.value = 'all';
    if (connectorTypeFilter) connectorTypeFilter.value = 'all';
    
    currentFilters = {
        operationalStatus: 'all',
        connectorType: 'all'
    };
    
    // Update filter button
    const filterBtn = document.getElementById('filterBtn');
    if (filterBtn) {
        filterBtn.style.color = 'var(--text-secondary)';
        filterBtn.innerHTML = '<i class="fas fa-filter"></i>';
    }
    
    // Reload stations
    const searchInput = document.getElementById('locationSearchInput');
    const location = searchInput ? searchInput.value.trim() : '';
    await loadStations(location);
    
    // Close modal
    window.closeFilterModal();
};

// Apply station filters
function applyStationFilters(stations) {
    let filtered = [...stations];
    
    // Filter by operational status
    if (currentFilters.operationalStatus === 'operational') {
        filtered = filtered.filter(station => station.status === 'Online');
    } else if (currentFilters.operationalStatus === 'non-operational') {
        filtered = filtered.filter(station => station.status === 'Offline');
    }
    
    // Filter by connector type
    if (currentFilters.connectorType !== 'all') {
        filtered = filtered.filter(station => {
            // Check if station has the selected connector type
            if (station.connectorTypes && Array.isArray(station.connectorTypes)) {
                return station.connectorTypes.includes(currentFilters.connectorType);
            }
            return false;
        });
    }
    
    return filtered;
}

