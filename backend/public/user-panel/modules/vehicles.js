// Vehicles Module - Manage User Vehicles
import { updateActiveNav, updatePageTitle, refreshWalletBalance } from '../app.js';
import { getVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle as deleteVehicleAPI } from '../services/api.js';
import { showSuccess, showError } from '../../utils/notifications.js';

// EV Vehicle Database - Only Electric Vehicles (Official Indian EV Market Data)
const EV_VEHICLES = {
    '2W': {
        'Ola Electric': {
            'S1 X': { connectorType: 'Type 6 DC + 16A AC', batteryCapacity: 3.0 },
            'S1 Air': { connectorType: 'Type 6 DC + 16A AC', batteryCapacity: 2.5 },
            'S1 Pro': { connectorType: 'Type 6 DC + 16A AC', batteryCapacity: 3.97 }
        },
        'Ather': {
            '450X': { connectorType: 'Ather fast connector + 6A AC', batteryCapacity: 2.9 },
            'Rizta': { connectorType: 'Ather fast connector + 6A AC', batteryCapacity: 3.0 }
        },
        'TVS': {
            'iQube': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 2.25 }
        },
        'Bajaj': {
            'Chetak': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 2.9 }
        },
        'Hero MotoCorp (Vida)': {
            'Vida V1 Pro': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 3.0 }
        },
        'Ampere': {
            'Magnus': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 1.5 },
            'Primus': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 1.5 }
        },
        'Revolt': {
            'RV400': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 3.24 }
        },
        'Ultraviolette': {
            'F77': { connectorType: 'Type 6 DC + AC', batteryCapacity: 4.2 }
        },
        'Simple Energy': {
            'One': { connectorType: 'Type 6 DC + AC', batteryCapacity: 4.8 }
        },
        'Hero Electric': {
            'Optima CX': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 1.2 },
            'Photon': { connectorType: '15–16A AC / Bharat AC-001-type', batteryCapacity: 1.5 }
        }
    },
    '3W': {
        'Mahindra Electric': {
            'Treo': { connectorType: 'Bharat DC-001 (GB/T DC) + 16A AC', batteryCapacity: 7.37 },
            'Treo Zor': { connectorType: 'Bharat DC-001 (GB/T DC) + 16A AC', batteryCapacity: 7.37 }
        },
        'Piaggio': {
            'Ape E City': { connectorType: 'Bharat DC-001 (GB/T DC)', batteryCapacity: 3.0 },
            'Ape E-Xtra FX': { connectorType: 'Bharat DC-001 (GB/T DC)', batteryCapacity: 3.0 }
        },
        'Altigreen': {
            'neEV': { connectorType: 'Bharat DC-001 + 16A AC', batteryCapacity: 10.0 },
            'neEV Tez': { connectorType: 'Bharat DC-001 + 16A AC', batteryCapacity: 10.0 }
        },
        'Omega Seiki': {
            'Rage+': { connectorType: 'Bharat DC-001', batteryCapacity: 8.0 },
            'Rage+ RapidEV': { connectorType: 'Bharat DC-001', batteryCapacity: 8.0 }
        },
        'Euler Motors': {
            'HiLoad EV': { connectorType: 'Bharat DC-001', batteryCapacity: 12.0 }
        },
        'Kinetic Green': {
            'Safar Smart': { connectorType: 'Bharat DC-001', batteryCapacity: 4.0 },
            'Safar Shakti': { connectorType: 'Bharat DC-001', batteryCapacity: 4.0 }
        },
        'Atul Auto': {
            'Elite Plus': { connectorType: 'Bharat DC-001', batteryCapacity: 5.0 }
        }
    },
    '4W': {
        'Tata': {
            'Tiago.ev': { connectorType: 'CCS2 (Type 2 AC + CCS2 DC)', batteryCapacity: 24.0 },
            'Tigor.ev': { connectorType: 'CCS2', batteryCapacity: 26.0 },
            'Punch.ev': { connectorType: 'CCS2', batteryCapacity: 25.0 },
            'Nexon.ev': { connectorType: 'CCS2', batteryCapacity: 30.2 },
            'Harrier.ev': { connectorType: 'CCS2', batteryCapacity: 70.0 },
            'Curvv.ev': { connectorType: 'CCS2', batteryCapacity: 50.0 }
        },
        'MG': {
            'ZS EV': { connectorType: 'CCS2 combo (Type 2 AC + CCS2 DC)', batteryCapacity: 44.5 },
            'Comet EV': { connectorType: 'CCS2', batteryCapacity: 17.3 },
            'Windsor EV': { connectorType: 'CCS2', batteryCapacity: 50.0 },
            'Windsor Inspire': { connectorType: 'CCS2', batteryCapacity: 50.0 }
        },
        'Mahindra': {
            'XUV400': { connectorType: 'CCS2', batteryCapacity: 39.4 }
        },
        'Hyundai': {
            'Kona Electric': { connectorType: 'CCS2', batteryCapacity: 39.2 },
            'Ioniq 5': { connectorType: 'CCS2', batteryCapacity: 72.6 }
        },
        'Kia': {
            'EV6': { connectorType: 'CCS2', batteryCapacity: 77.4 },
            'Carens Clavis EV': { connectorType: 'CCS2', batteryCapacity: 60.0 }
        },
        'BYD': {
            'Atto 3': { connectorType: 'CCS2', batteryCapacity: 60.48 },
            'E6': { connectorType: 'CCS2', batteryCapacity: 71.7 }
        },
        'Citroën': {
            'eC3': { connectorType: 'CCS2', batteryCapacity: 29.2 }
        }
    },
    'Commercial': {}
};

// Brand images/logos mapping - Using local logo images
// Logo files are placed in: backend/public/user-panel/images/brand-logos/
// File extensions are based on actual files in the directory
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

export async function loadVehiclesModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'vehicles');
    
    updateActiveNav('vehicles');
    updatePageTitle('My Vehicles');
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch vehicles from API
        const response = await getVehicles();
        const vehicles = response.success && response.vehicles ? response.vehicles : [];
    
    appMain.innerHTML = `
        <div class="vehicles-container">
            <!-- Add Vehicle Button - Modern -->
            <div style="margin-bottom: 16px; display: flex; justify-content: flex-start;">
                <button onclick="window.navigateToAddVehicle()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 12px; padding: 12px 20px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 3px 12px rgba(102, 126, 234, 0.25); display: flex; align-items: center; justify-content: center; gap: 8px;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 18px rgba(102, 126, 234, 0.35)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 3px 12px rgba(102, 126, 234, 0.25)'">
                    <i class="fas fa-plus" style="font-size: 14px;"></i>
                    <span>Add Vehicle</span>
                </button>
            </div>
            
            <!-- Vehicles List -->
            <div id="vehiclesList">
                ${vehicles.length > 0 ? vehicles.map(vehicle => {
                    // Get brand logo
                    const brandImage = BRAND_IMAGES[vehicle.brand];
                    
                    return `
                    <div style="background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 14px; margin-bottom: 10px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                        <!-- Header Section -->
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0;">
                            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid #e9ecef; padding: 6px;">
                                ${brandImage ? `
                                    <img src="${brandImage}" alt="${vehicle.brand}" 
                                         style="width: 100%; height: 100%; object-fit: contain; display: block;"
                                         onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='flex';">
                                    <div style="display: none; width: 100%; height: 100%; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 6px; align-items: center; justify-content: center; color: #667eea; font-weight: 700; font-size: 16px;">
                                        ${vehicle.brand.charAt(0)}
                                    </div>
                                ` : `
                                    <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #667eea; font-weight: 700; font-size: 16px;">
                                        ${vehicle.brand.charAt(0)}
                                    </div>
                                `}
                                </div>
                            <div style="flex: 1; min-width: 0;">
                                <h3 style="font-size: 16px; font-weight: 700; margin: 0 0 3px 0; color: #212529; word-wrap: break-word;">${vehicle.brand} ${vehicle.modelName}</h3>
                                <div style="display: flex; align-items: center; gap: 5px; font-size: 12px; color: #6c757d;">
                                    <i class="fas fa-hashtag" style="font-size: 10px;"></i>
                                    <span>${vehicle.vehicleNumber}</span>
                                    </div>
                                    </div>
                                    </div>
                        
                        <!-- Details Grid - Only Type and Added -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-radius: 8px; border: 1px solid #e9ecef;">
                                <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-car-side" style="color: #667eea; font-size: 12px;"></i>
                                    </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 8px; color: #6c757d; margin-bottom: 1px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Type</div>
                                    <div style="font-size: 12px; font-weight: 600; color: #212529;">${vehicle.vehicleType}</div>
                                    </div>
                                    </div>
                            <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-radius: 8px; border: 1px solid #e9ecef;">
                                <div style="width: 28px; height: 28px; background: linear-gradient(135deg, #f59e0b15 0%, #f59e0b25 100%); border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-calendar-alt" style="color: #f59e0b; font-size: 12px;"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 8px; color: #6c757d; margin-bottom: 1px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Added</div>
                                    <div style="font-size: 12px; font-weight: 600; color: #212529;">${formatDate(vehicle.createdAt)}</div>
                            </div>
                        </div>
                        </div>
                        
                        <!-- Action Buttons -->
                        <div style="display: flex; gap: 8px;">
                            <button onclick="window.editVehicle(${vehicle.id})" style="flex: 1; background: white; border: 1px solid #667eea; border-radius: 10px; padding: 10px; color: #667eea; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;" onmouseover="this.style.background='#667eea15'; this.style.transform='translateY(-1px)'" onmouseout="this.style.background='white'; this.style.transform='translateY(0)'">
                                <i class="fas fa-edit" style="font-size: 13px;"></i>
                                <span>Edit</span>
                            </button>
                            <button onclick="window.deleteVehicle(${vehicle.id})" style="flex: 1; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border: none; border-radius: 10px; padding: 10px; color: white; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.2);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 3px 10px rgba(239, 68, 68, 0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(239, 68, 68, 0.2)'">
                                <i class="fas fa-trash" style="font-size: 13px;"></i>
                                <span>Delete</span>
                            </button>
                        </div>
                    </div>
                `;
                }).join('') : `
                    <div style="text-align: center; padding: 60px 20px;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
                            <i class="fas fa-car" style="font-size: 36px; color: #667eea;"></i>
                        </div>
                        <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600; color: #212529;">No Vehicles Added</h3>
                        <p style="margin: 0; font-size: 14px; color: #6c757d;">Add your first vehicle to get started</p>
                    </div>
                `}
            </div>
        </div>
        
        <style>
            /* Custom dropdown styling with brand images */
            .custom-select-wrapper {
                position: relative;
                width: 100%;
            }
            
            .custom-select-trigger {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 12px;
                background-color: white;
                border: 1px solid #ddd;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s ease;
                min-height: 42px;
            }
            
            .custom-select-trigger:hover {
                border-color: var(--primary-color);
            }
            
            .custom-select-trigger.active {
                border-color: var(--primary-color);
                box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
            }
            
            .custom-select-trigger:disabled {
                background-color: #f5f5f5;
                cursor: not-allowed;
                opacity: 0.6;
            }
            
            .custom-select-placeholder {
                color: #999;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .custom-select-placeholder.selected {
                color: var(--text-primary);
            }
            
            .custom-select-placeholder img {
                width: 24px;
                height: 24px;
                object-fit: contain;
                border-radius: 4px;
            }
            
            .custom-select-trigger i {
                color: #999;
                transition: transform 0.2s;
            }
            
            .custom-select-trigger.active i {
                transform: rotate(180deg);
            }
            
            .custom-select-options {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #ddd;
                border-radius: 6px;
                margin-top: 4px;
                max-height: 250px;
                overflow-y: auto;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .custom-select-option {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                cursor: pointer;
                transition: background-color 0.2s;
                border-bottom: 1px solid #f0f0f0;
            }
            
            .custom-select-option:last-child {
                border-bottom: none;
            }
            
            .custom-select-option:hover {
                background-color: #f8f9fa;
            }
            
            .custom-select-option.selected {
                background-color: rgba(220, 38, 38, 0.1);
            }
            
            .custom-select-option img {
                width: 32px;
                height: 32px;
                object-fit: contain;
                border-radius: 4px;
                flex-shrink: 0;
                background: transparent;
                padding: 2px;
            }
            
            .custom-select-placeholder img {
                width: 24px;
                height: 24px;
                object-fit: contain;
                border-radius: 4px;
                flex-shrink: 0;
                background: transparent;
                padding: 2px;
            }
            
            .custom-select-option span {
                flex: 1;
                font-size: 14px;
                color: var(--text-primary);
            }
            
            .custom-select-option .brand-fallback {
                width: 28px;
                height: 28px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 600;
                font-size: 12px;
                flex-shrink: 0;
            }
        </style>
        
        <!-- Add/Edit Vehicle Modal -->
        <div id="vehicleModal" class="modal" style="display: none;" onclick="if(event.target === this) window.closeVehicleModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h2 id="vehicleModalTitle">Add Vehicle</h2>
                    <button class="modal-close" onclick="window.closeVehicleModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="vehicleForm" onsubmit="window.handleVehicleSubmit(event)">
                    <div class="form-group">
                        <label class="form-label">Vehicle Number</label>
                        <input type="text" class="form-input" id="vehicleNumberInput" name="vehicleNumber" required placeholder="e.g., MH-01-AB-1234">
                    </div>
                    <div class="form-group" style="position: relative;">
                        <label class="form-label">Vehicle Type</label>
                        <div class="custom-select-wrapper" id="vehicleTypeSelectWrapper">
                            <div class="custom-select-trigger" id="vehicleTypeSelectTrigger" onclick="window.toggleVehicleTypeDropdown()">
                                <span class="custom-select-placeholder">Select Vehicle Type</span>
                                <i class="fas fa-chevron-down"></i>
                            </div>
                            <div class="custom-select-options" id="vehicleTypeSelectOptions" style="display: none;">
                                <div class="custom-select-option" onclick="window.selectVehicleType('2W')">
                                    <span>2W</span>
                                </div>
                                <div class="custom-select-option" onclick="window.selectVehicleType('3W')">
                                    <span>3W</span>
                                </div>
                                <div class="custom-select-option" onclick="window.selectVehicleType('4W')">
                                    <span>4W</span>
                                </div>
                                <div class="custom-select-option" onclick="window.selectVehicleType('Commercial')">
                                    <span>Commercial</span>
                                </div>
                            </div>
                            <select id="vehicleTypeSelect" name="vehicleType" required style="display: none;">
                            <option value="">Select Vehicle Type</option>
                            <option value="2W">2W</option>
                            <option value="3W">3W</option>
                            <option value="4W">4W</option>
                            <option value="Commercial">Commercial</option>
                        </select>
                    </div>
                    </div>
                    <div class="form-group" style="position: relative;">
                        <label class="form-label">Brand / Manufacturer</label>
                        <div class="custom-select-wrapper" id="brandSelectWrapper">
                            <div class="custom-select-trigger" id="brandSelectTrigger" onclick="window.toggleBrandDropdown()">
                                <span class="custom-select-placeholder">Select Brand</span>
                                <i class="fas fa-chevron-down"></i>
                    </div>
                            <div class="custom-select-options" id="brandSelectOptions" style="display: none;"></div>
                            <select id="brandSelect" name="brand" required style="display: none;">
                                <option value="">Select Brand</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group" style="position: relative;">
                        <label class="form-label">Model Name</label>
                        <div class="custom-select-wrapper" id="modelSelectWrapper">
                            <div class="custom-select-trigger" id="modelSelectTrigger" onclick="window.toggleModelDropdown()">
                                <span class="custom-select-placeholder">Select Model</span>
                                <i class="fas fa-chevron-down"></i>
                    </div>
                            <div class="custom-select-options" id="modelSelectOptions" style="display: none;"></div>
                            <select id="modelSelect" name="modelName" required style="display: none;">
                                <option value="">Select Model</option>
                        </select>
                    </div>
                    </div>
                    <!-- Hidden fields for connector type and battery capacity (auto-filled from model selection) -->
                    <input type="hidden" id="connectorTypeSelect" name="connectorType" required>
                    <input type="hidden" id="batteryCapacityInput" name="batteryCapacity" required>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-outline" style="flex: 1;" onclick="window.closeVehicleModal()">Cancel</button>
                        <button type="submit" class="btn btn-primary" style="flex: 1;">Save</button>
                    </div>
                </form>
                    </div>
                </div>
    `;
    } catch (error) {
        console.error('Error loading vehicles:', error);
        showError('Failed to load vehicles');
        appMain.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Vehicles</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric'
    });
}

// Navigate to add vehicle page
window.navigateToAddVehicle = function() {
    sessionStorage.setItem('lastPage', 'add-vehicle');
    window.history.pushState({}, '', '?page=add-vehicle');
    loadAddVehiclePage();
};

// Load add vehicle page (full page form)
export async function loadAddVehiclePage() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'add-vehicle');
    
    updateActiveNav('vehicles');
    updatePageTitle('Add Vehicle');
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
    const appMain = document.getElementById('appMain');
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'instant' });
    
    appMain.innerHTML = `
        <div style="max-width: 600px; margin: 0 auto;">
            <!-- Back Button -->
            <button onclick="window.goBackToVehicles()" style="background: white; border: 1px solid #e9ecef; border-radius: 10px; padding: 10px 16px; margin-bottom: 20px; color: #667eea; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                <i class="fas fa-arrow-left" style="font-size: 14px;"></i>
                <span>Back</span>
            </button>
            
            <!-- Form Card -->
            <div style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 24px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                <h2 style="margin: 0 0 24px 0; font-size: 22px; font-weight: 700; color: #212529;">Add Vehicle</h2>
                
                <form id="addVehicleForm" onsubmit="window.handleAddVehicleSubmit(event)">
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #212529;">Vehicle Number</label>
                        <input type="text" id="addVehicleNumberInput" name="vehicleNumber" required placeholder="e.g., MH-01-AB-1234" style="width: 100%; padding: 12px 16px; border: 1px solid #ddd; border-radius: 10px; font-size: 14px; transition: all 0.2s; box-sizing: border-box;" onfocus="this.style.borderColor='#667eea'; this.style.boxShadow='0 0 0 3px rgba(102, 126, 234, 0.1)'" onblur="this.style.borderColor='#ddd'; this.style.boxShadow='none'">
                    </div>
                    
                    <div style="margin-bottom: 20px; position: relative;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #212529;">Vehicle Type</label>
                        <div class="custom-select-wrapper" id="addVehicleTypeSelectWrapper">
                            <div class="custom-select-trigger" id="addVehicleTypeSelectTrigger" onclick="window.toggleAddVehicleTypeDropdown()">
                                <span class="custom-select-placeholder">Select Vehicle Type</span>
                                <i class="fas fa-chevron-down"></i>
                            </div>
                            <div class="custom-select-options" id="addVehicleTypeSelectOptions" style="display: none;">
                                <div class="custom-select-option" onclick="window.selectAddVehicleType('2W')">
                                    <span>2W</span>
                                </div>
                                <div class="custom-select-option" onclick="window.selectAddVehicleType('3W')">
                                    <span>3W</span>
                                </div>
                                <div class="custom-select-option" onclick="window.selectAddVehicleType('4W')">
                                    <span>4W</span>
                                </div>
                                <div class="custom-select-option" onclick="window.selectAddVehicleType('Commercial')">
                                    <span>Commercial</span>
                                </div>
                            </div>
                            <select id="addVehicleTypeSelect" name="vehicleType" required style="display: none;">
                                <option value="">Select Vehicle Type</option>
                                <option value="2W">2W</option>
                                <option value="3W">3W</option>
                                <option value="4W">4W</option>
                                <option value="Commercial">Commercial</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px; position: relative;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #212529;">Brand / Manufacturer</label>
                        <div class="custom-select-wrapper" id="addBrandSelectWrapper">
                            <div class="custom-select-trigger" id="addBrandSelectTrigger" onclick="window.toggleAddBrandDropdown()" style="pointer-events: none; opacity: 0.6;">
                                <span class="custom-select-placeholder">Select Brand</span>
                                <i class="fas fa-chevron-down"></i>
                            </div>
                            <div class="custom-select-options" id="addBrandSelectOptions" style="display: none;"></div>
                            <select id="addBrandSelect" name="brand" required style="display: none;">
                                <option value="">Select Brand</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px; position: relative;">
                        <label style="display: block; margin-bottom: 8px; font-size: 14px; font-weight: 600; color: #212529;">Model Name</label>
                        <div class="custom-select-wrapper" id="addModelSelectWrapper">
                            <div class="custom-select-trigger" id="addModelSelectTrigger" onclick="window.toggleAddModelDropdown()" style="pointer-events: none; opacity: 0.6;">
                                <span class="custom-select-placeholder">Select Model</span>
                                <i class="fas fa-chevron-down"></i>
                            </div>
                            <div class="custom-select-options" id="addModelSelectOptions" style="display: none;"></div>
                            <select id="addModelSelect" name="modelName" required style="display: none;">
                                <option value="">Select Model</option>
                            </select>
                        </div>
                    </div>
                    
                    <!-- Hidden fields for connector type and battery capacity -->
                    <input type="hidden" id="addConnectorTypeSelect" name="connectorType" required>
                    <input type="hidden" id="addBatteryCapacityInput" name="batteryCapacity" required>
                    
                    <div style="display: flex; gap: 12px; margin-top: 24px;">
                        <button type="button" onclick="window.goBackToVehicles()" style="flex: 1; background: white; border: 1px solid #e9ecef; border-radius: 12px; padding: 14px; color: #6c757d; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                            Cancel
                        </button>
                        <button type="submit" style="flex: 1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; border-radius: 12px; padding: 14px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 3px 12px rgba(102, 126, 234, 0.25);" onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 15px rgba(102, 126, 234, 0.35)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 3px 12px rgba(102, 126, 234, 0.25)'">
                            Save Vehicle
                        </button>
                    </div>
                </form>
            </div>
        </div>
        
        <style>
            /* Custom dropdown styling with brand images */
            .custom-select-wrapper {
                position: relative;
                width: 100%;
            }
            
            .custom-select-trigger {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background-color: white;
                border: 1px solid #ddd;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s ease;
                min-height: 48px;
            }
            
            .custom-select-trigger:hover {
                border-color: #667eea;
            }
            
            .custom-select-trigger.active {
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            
            .custom-select-trigger:disabled {
                background-color: #f5f5f5;
                cursor: not-allowed;
                opacity: 0.6;
            }
            
            .custom-select-placeholder {
                color: #999;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .custom-select-placeholder.selected {
                color: #212529;
            }
            
            .custom-select-placeholder img {
                width: 24px;
                height: 24px;
                object-fit: contain;
                border-radius: 4px;
            }
            
            .custom-select-trigger i {
                color: #999;
                transition: transform 0.2s;
            }
            
            .custom-select-trigger.active i {
                transform: rotate(180deg);
            }
            
            .custom-select-options {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: white;
                border: 1px solid #ddd;
                border-radius: 10px;
                margin-top: 4px;
                max-height: 300px;
                overflow-y: auto;
                z-index: 1000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .custom-select-option {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 16px;
                cursor: pointer;
                transition: background-color 0.2s;
                border-bottom: 1px solid #f0f0f0;
            }
            
            .custom-select-option:last-child {
                border-bottom: none;
            }
            
            .custom-select-option:hover {
                background-color: #f8f9fa;
            }
            
            .custom-select-option.selected {
                background-color: rgba(102, 126, 234, 0.1);
            }
            
            .custom-select-option img {
                width: 32px;
                height: 32px;
                object-fit: contain;
                border-radius: 4px;
                flex-shrink: 0;
                background: transparent;
                padding: 2px;
            }
            
            .custom-select-placeholder img {
                width: 24px;
                height: 24px;
                object-fit: contain;
                border-radius: 4px;
                flex-shrink: 0;
                background: transparent;
                padding: 2px;
            }
            
            .custom-select-option span {
                flex: 1;
                font-size: 14px;
                color: #212529;
            }
            
            .custom-select-option .brand-fallback {
                width: 28px;
                height: 28px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 600;
                font-size: 12px;
                flex-shrink: 0;
            }
        </style>
    `;
    
    // Reset dropdowns
    window.resetAddVehicleDropdowns();
}

// Go back to vehicles page
window.goBackToVehicles = function() {
    sessionStorage.setItem('lastPage', 'vehicles');
    window.history.pushState({}, '', '?page=vehicles');
    loadVehiclesModule();
};

// Show add vehicle modal (kept for edit functionality)
window.showAddVehicleModal = function() {
    const modal = document.getElementById('vehicleModal');
    const form = document.getElementById('vehicleForm');
    const title = document.getElementById('vehicleModalTitle');
    
    if (modal && form && title) {
        title.textContent = 'Add Vehicle';
        form.reset();
        form.dataset.vehicleId = '';
        // Reset dropdowns
        window.resetVehicleDropdowns();
        modal.style.display = 'flex';
    }
};

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    const vehicleTypeWrapper = document.getElementById('vehicleTypeSelectWrapper');
    const brandWrapper = document.getElementById('brandSelectWrapper');
    const modelWrapper = document.getElementById('modelSelectWrapper');
    
    if (vehicleTypeWrapper && !vehicleTypeWrapper.contains(event.target)) {
        const vehicleTypeOptions = document.getElementById('vehicleTypeSelectOptions');
        const vehicleTypeTrigger = document.getElementById('vehicleTypeSelectTrigger');
        if (vehicleTypeOptions) vehicleTypeOptions.style.display = 'none';
        if (vehicleTypeTrigger) vehicleTypeTrigger.classList.remove('active');
    }
    
    if (brandWrapper && !brandWrapper.contains(event.target)) {
        const brandOptions = document.getElementById('brandSelectOptions');
        const brandTrigger = document.getElementById('brandSelectTrigger');
        if (brandOptions) brandOptions.style.display = 'none';
        if (brandTrigger) brandTrigger.classList.remove('active');
    }
    
    if (modelWrapper && !modelWrapper.contains(event.target)) {
        const modelOptions = document.getElementById('modelSelectOptions');
        const modelTrigger = document.getElementById('modelSelectTrigger');
        if (modelOptions) modelOptions.style.display = 'none';
        if (modelTrigger) modelTrigger.classList.remove('active');
    }
});

// Reset all dropdowns
window.resetVehicleDropdowns = function() {
    const brandSelect = document.getElementById('brandSelect');
    const modelSelect = document.getElementById('modelSelect');
    const connectorSelect = document.getElementById('connectorTypeSelect');
    const batteryInput = document.getElementById('batteryCapacityInput');
    
    if (brandSelect) {
        brandSelect.innerHTML = '<option value="">Select Brand</option>';
    }
    const brandTrigger = document.getElementById('brandSelectTrigger');
    const brandOptions = document.getElementById('brandSelectOptions');
    if (brandTrigger) {
        const placeholder = brandTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Brand';
            placeholder.classList.remove('selected');
        }
        brandTrigger.classList.remove('active');
        brandTrigger.style.pointerEvents = 'none';
        brandTrigger.style.opacity = '0.6';
    }
    if (brandOptions) {
        brandOptions.innerHTML = '';
        brandOptions.style.display = 'none';
    }
    if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Select Model</option>';
        modelSelect.disabled = true;
    }
    if (connectorSelect) {
        connectorSelect.value = '';
    }
    if (batteryInput) {
        batteryInput.value = '';
    }
};

// Toggle vehicle type dropdown
window.toggleVehicleTypeDropdown = function() {
    const trigger = document.getElementById('vehicleTypeSelectTrigger');
    const options = document.getElementById('vehicleTypeSelectOptions');
    const brandOptions = document.getElementById('brandSelectOptions');
    const modelOptions = document.getElementById('modelSelectOptions');
    
    if (trigger && options) {
        const isOpen = options.style.display !== 'none';
        
        // Close other dropdowns if open
        if (brandOptions) {
            brandOptions.style.display = 'none';
            const brandTrigger = document.getElementById('brandSelectTrigger');
            if (brandTrigger) brandTrigger.classList.remove('active');
        }
        if (modelOptions) {
            modelOptions.style.display = 'none';
            const modelTrigger = document.getElementById('modelSelectTrigger');
            if (modelTrigger) modelTrigger.classList.remove('active');
        }
        
        if (isOpen) {
            options.style.display = 'none';
            trigger.classList.remove('active');
        } else {
            options.style.display = 'block';
            trigger.classList.add('active');
        }
    }
};

// Select vehicle type from custom dropdown
window.selectVehicleType = function(vehicleType) {
    const trigger = document.getElementById('vehicleTypeSelectTrigger');
    const options = document.getElementById('vehicleTypeSelectOptions');
    const hiddenSelect = document.getElementById('vehicleTypeSelect');
    const placeholder = trigger?.querySelector('.custom-select-placeholder');
    
    if (hiddenSelect) {
        hiddenSelect.value = vehicleType;
    }
    
    // Update trigger display
    if (placeholder) {
        placeholder.textContent = vehicleType;
        placeholder.classList.add('selected');
    }
    
    // Close dropdown
    if (options) {
        options.style.display = 'none';
    }
    if (trigger) {
        trigger.classList.remove('active');
    }
    
    // Update brand dropdown
    window.updateBrandDropdown();
};

// Toggle brand dropdown
window.toggleBrandDropdown = function() {
    const trigger = document.getElementById('brandSelectTrigger');
    const options = document.getElementById('brandSelectOptions');
    const vehicleTypeOptions = document.getElementById('vehicleTypeSelectOptions');
    const modelOptions = document.getElementById('modelSelectOptions');
    
    if (trigger && options) {
        const isOpen = options.style.display !== 'none';
        
        // Close other dropdowns if open
        if (vehicleTypeOptions) {
            vehicleTypeOptions.style.display = 'none';
            const vehicleTypeTrigger = document.getElementById('vehicleTypeSelectTrigger');
            if (vehicleTypeTrigger) vehicleTypeTrigger.classList.remove('active');
        }
        if (modelOptions) {
            modelOptions.style.display = 'none';
            const modelTrigger = document.getElementById('modelSelectTrigger');
            if (modelTrigger) modelTrigger.classList.remove('active');
        }
        
        if (isOpen) {
            options.style.display = 'none';
            trigger.classList.remove('active');
        } else {
            options.style.display = 'block';
            trigger.classList.add('active');
        }
    }
};

// Toggle model dropdown
window.toggleModelDropdown = function() {
    const trigger = document.getElementById('modelSelectTrigger');
    const options = document.getElementById('modelSelectOptions');
    const vehicleTypeOptions = document.getElementById('vehicleTypeSelectOptions');
    const brandOptions = document.getElementById('brandSelectOptions');
    
    if (trigger && options) {
        const isOpen = options.style.display !== 'none';
        
        // Close other dropdowns if open
        if (vehicleTypeOptions) {
            vehicleTypeOptions.style.display = 'none';
            const vehicleTypeTrigger = document.getElementById('vehicleTypeSelectTrigger');
            if (vehicleTypeTrigger) vehicleTypeTrigger.classList.remove('active');
        }
        if (brandOptions) {
            brandOptions.style.display = 'none';
            const brandTrigger = document.getElementById('brandSelectTrigger');
            if (brandTrigger) brandTrigger.classList.remove('active');
        }
        
        if (isOpen) {
            options.style.display = 'none';
            trigger.classList.remove('active');
        } else {
            options.style.display = 'block';
            trigger.classList.add('active');
        }
    }
};

// Select brand from custom dropdown
window.selectBrand = function(brand) {
    const trigger = document.getElementById('brandSelectTrigger');
    const options = document.getElementById('brandSelectOptions');
    const hiddenSelect = document.getElementById('brandSelect');
    const placeholder = trigger?.querySelector('.custom-select-placeholder');
    
    if (hiddenSelect) {
        hiddenSelect.value = brand;
    }
    
    // Update trigger display with brand image
    if (placeholder) {
        const brandImage = BRAND_IMAGES[brand];
        if (brandImage) {
            placeholder.innerHTML = `
                <img src="${brandImage}" alt="${brand}" 
                     style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px; flex-shrink: 0; background: transparent; padding: 2px; display: block;"
                     onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='flex';"
                     onload="this.style.display='block'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='none';">
                <span class="brand-fallback" style="display: none;">${brand.charAt(0)}</span>
                <span>${brand}</span>
            `;
        } else {
            placeholder.innerHTML = `<span class="brand-fallback">${brand.charAt(0)}</span> <span>${brand}</span>`;
        }
        placeholder.classList.add('selected');
    }
    
    // Close dropdown
    if (options) {
        options.style.display = 'none';
    }
    if (trigger) {
        trigger.classList.remove('active');
    }
    
    // Update model dropdown
    window.updateModelDropdown();
};

// Select model from custom dropdown
window.selectModel = function(model) {
    const trigger = document.getElementById('modelSelectTrigger');
    const options = document.getElementById('modelSelectOptions');
    const hiddenSelect = document.getElementById('modelSelect');
    const placeholder = trigger?.querySelector('.custom-select-placeholder');
    
    if (hiddenSelect) {
        hiddenSelect.value = model;
    }
    
    // Update trigger display
    if (placeholder) {
        placeholder.textContent = model;
        placeholder.classList.add('selected');
    }
    
    // Close dropdown
    if (options) {
        options.style.display = 'none';
    }
    if (trigger) {
        trigger.classList.remove('active');
    }
    
    // Update vehicle specs
    window.updateVehicleSpecs();
};

// Update brand dropdown based on vehicle type
window.updateBrandDropdown = function() {
    const vehicleTypeSelect = document.getElementById('vehicleTypeSelect');
    const brandSelect = document.getElementById('brandSelect');
    const brandOptions = document.getElementById('brandSelectOptions');
    const brandTrigger = document.getElementById('brandSelectTrigger');
    const modelSelect = document.getElementById('modelSelect');
    const modelOptions = document.getElementById('modelSelectOptions');
    const modelTrigger = document.getElementById('modelSelectTrigger');
    const connectorSelect = document.getElementById('connectorTypeSelect');
    const batteryInput = document.getElementById('batteryCapacityInput');
    
    const vehicleType = vehicleTypeSelect?.value;
    
    // Reset brand and model dropdowns
    if (brandSelect) {
        brandSelect.innerHTML = '<option value="">Select Brand</option>';
    }
    if (brandOptions) {
        brandOptions.innerHTML = '';
        brandOptions.style.display = 'none';
    }
    if (brandTrigger) {
        const placeholder = brandTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.innerHTML = 'Select Brand';
            placeholder.classList.remove('selected');
        }
        brandTrigger.classList.remove('active');
        brandTrigger.style.pointerEvents = vehicleType ? 'auto' : 'none';
        brandTrigger.style.opacity = vehicleType ? '1' : '0.6';
    }
    
    if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Select Model</option>';
    }
    if (modelOptions) {
        modelOptions.innerHTML = '';
        modelOptions.style.display = 'none';
    }
    if (modelTrigger) {
        const placeholder = modelTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Model';
            placeholder.classList.remove('selected');
        }
        modelTrigger.classList.remove('active');
        modelTrigger.style.pointerEvents = 'none';
        modelTrigger.style.opacity = '0.6';
    }
    
    // Reset hidden fields
    if (connectorSelect) {
        connectorSelect.value = '';
    }
    if (batteryInput) {
        batteryInput.value = '';
    }
    
    if (!vehicleType || !EV_VEHICLES[vehicleType]) {
        return;
    }
    
    // Populate brands for selected vehicle type
    const brands = Object.keys(EV_VEHICLES[vehicleType]).sort();
    if (brandSelect && brandOptions) {
        brands.forEach(brand => {
            // Add to hidden select
            const option = document.createElement('option');
            option.value = brand;
            option.textContent = brand;
            brandSelect.appendChild(option);
            
            // Add to custom dropdown
            const customOption = document.createElement('div');
            customOption.className = 'custom-select-option';
            customOption.onclick = () => window.selectBrand(brand);
            
            const brandImage = BRAND_IMAGES[brand];
            if (brandImage) {
                customOption.innerHTML = `
                    <img src="${brandImage}" alt="${brand}" 
                         style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px; flex-shrink: 0; background: transparent; padding: 2px;"
                         onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='flex';"
                         onload="this.style.display='block'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='none';">
                    <span class="brand-fallback" style="display: none;">${brand.charAt(0)}</span>
                    <span>${brand}</span>
                `;
            } else {
                customOption.innerHTML = `
                    <span class="brand-fallback">${brand.charAt(0)}</span>
                    <span>${brand}</span>
                `;
            }
            
            brandOptions.appendChild(customOption);
        });
    }
};

// Update model dropdown based on brand
window.updateModelDropdown = function() {
    const vehicleTypeSelect = document.getElementById('vehicleTypeSelect');
    const brandSelect = document.getElementById('brandSelect');
    const modelSelect = document.getElementById('modelSelect');
    const modelOptions = document.getElementById('modelSelectOptions');
    const modelTrigger = document.getElementById('modelSelectTrigger');
    const connectorSelect = document.getElementById('connectorTypeSelect');
    const batteryInput = document.getElementById('batteryCapacityInput');
    
    const vehicleType = vehicleTypeSelect?.value;
    const brand = brandSelect?.value;
    
    // Reset model dropdown
    if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Select Model</option>';
    }
    if (modelOptions) {
        modelOptions.innerHTML = '';
        modelOptions.style.display = 'none';
    }
    if (modelTrigger) {
        const placeholder = modelTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Model';
            placeholder.classList.remove('selected');
        }
        modelTrigger.classList.remove('active');
        modelTrigger.style.pointerEvents = brand ? 'auto' : 'none';
        modelTrigger.style.opacity = brand ? '1' : '0.6';
    }
    
    // Reset hidden fields
    if (connectorSelect) {
        connectorSelect.value = '';
    }
    if (batteryInput) {
        batteryInput.value = '';
    }
    
    if (!vehicleType || !brand || !EV_VEHICLES[vehicleType] || !EV_VEHICLES[vehicleType][brand]) {
        return;
    }
    
    // Populate models for selected brand
    const models = Object.keys(EV_VEHICLES[vehicleType][brand]).sort();
    if (modelSelect && modelOptions) {
        models.forEach(model => {
            // Add to hidden select
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
            
            // Add to custom dropdown
            const customOption = document.createElement('div');
            customOption.className = 'custom-select-option';
            customOption.onclick = () => window.selectModel(model);
            customOption.innerHTML = `<span>${model}</span>`;
            modelOptions.appendChild(customOption);
        });
    }
};

// Update connector type and battery capacity based on model selection
window.updateVehicleSpecs = function() {
    const vehicleTypeSelect = document.getElementById('vehicleTypeSelect');
    const brandSelect = document.getElementById('brandSelect');
    const modelSelect = document.getElementById('modelSelect');
    const connectorSelect = document.getElementById('connectorTypeSelect');
    const batteryInput = document.getElementById('batteryCapacityInput');
    
    const vehicleType = vehicleTypeSelect?.value;
    const brand = brandSelect?.value;
    const model = modelSelect?.value;
    
    if (!vehicleType || !brand || !model || 
        !EV_VEHICLES[vehicleType] || 
        !EV_VEHICLES[vehicleType][brand] || 
        !EV_VEHICLES[vehicleType][brand][model]) {
        return;
    }
    
    const specs = EV_VEHICLES[vehicleType][brand][model];
    
    // Auto-populate hidden fields for connector type and battery capacity
    if (connectorSelect && specs.connectorType) {
        connectorSelect.value = specs.connectorType;
    }
    if (batteryInput && specs.batteryCapacity) {
        batteryInput.value = specs.batteryCapacity;
    }
    
    // Remove any validation errors
    if (connectorSelect && batteryInput && connectorSelect.value && batteryInput.value) {
        connectorSelect.setCustomValidity('');
        batteryInput.setCustomValidity('');
    }
};

// Close vehicle modal
window.closeVehicleModal = function() {
    const modal = document.getElementById('vehicleModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Edit vehicle
window.editVehicle = async function(vehicleId) {
    try {
        // Fetch vehicle data from API
        const response = await getVehicle(vehicleId);
        
        if (!response.success || !response.vehicle) {
            showError('Failed to load vehicle details');
            return;
        }
        
        const vehicle = response.vehicle;
        const modal = document.getElementById('vehicleModal');
        const form = document.getElementById('vehicleForm');
        const title = document.getElementById('vehicleModalTitle');
        
        if (modal && form && title) {
            title.textContent = 'Edit Vehicle';
            form.dataset.vehicleId = vehicleId;
            
            // Populate form with vehicle data
            const vehicleNumberInput = form.querySelector('#vehicleNumberInput');
            const vehicleTypeSelect = form.querySelector('#vehicleTypeSelect');
            const brandSelect = form.querySelector('#brandSelect');
            const modelSelect = form.querySelector('#modelSelect');
            const connectorSelect = form.querySelector('#connectorTypeSelect');
            const batteryInput = form.querySelector('#batteryCapacityInput');
            
            if (vehicleNumberInput) vehicleNumberInput.value = vehicle.vehicleNumber || '';
            if (vehicleTypeSelect) {
                vehicleTypeSelect.value = vehicle.vehicleType || '';
                
                // Update vehicle type custom dropdown
                const vehicleTypeTrigger = document.getElementById('vehicleTypeSelectTrigger');
                if (vehicleTypeTrigger && vehicle.vehicleType) {
                    const placeholder = vehicleTypeTrigger.querySelector('.custom-select-placeholder');
                    if (placeholder) {
                        placeholder.textContent = vehicle.vehicleType;
                        placeholder.classList.add('selected');
                    }
                }
                
                // Trigger brand dropdown update
                if (vehicle.vehicleType) {
                    window.updateBrandDropdown();
                    // Wait a bit for dropdown to populate, then set brand
                    setTimeout(() => {
                        if (brandSelect && vehicle.brand) {
                            // Set hidden select value
                            brandSelect.value = vehicle.brand;
                            
                            // Update custom dropdown display
                            const brandTrigger = document.getElementById('brandSelectTrigger');
                            if (brandTrigger) {
                                const placeholder = brandTrigger.querySelector('.custom-select-placeholder');
                                if (placeholder) {
                                    const brandImage = BRAND_IMAGES[vehicle.brand];
                                    if (brandImage) {
                                        placeholder.innerHTML = `
                                            <img src="${brandImage}" alt="${vehicle.brand}" 
                                                 style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px; flex-shrink: 0; background: transparent; padding: 2px; display: block;"
                                                 onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='flex';"
                                                 onload="this.style.display='block'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='none';">
                                            <span class="brand-fallback" style="display: none;">${vehicle.brand.charAt(0)}</span>
                                            <span>${vehicle.brand}</span>
                                        `;
                                    } else {
                                        placeholder.innerHTML = `<span class="brand-fallback">${vehicle.brand.charAt(0)}</span> <span>${vehicle.brand}</span>`;
                                    }
                                    placeholder.classList.add('selected');
                                }
                            }
                            
                            // Trigger model dropdown update
                            window.updateModelDropdown();
                            // Wait a bit for dropdown to populate, then set model
                            setTimeout(() => {
                                if (modelSelect && vehicle.modelName) {
                                    // Set hidden select value
                                    modelSelect.value = vehicle.modelName;
                                    
                                    // Update custom dropdown display
                                    const modelTrigger = document.getElementById('modelSelectTrigger');
                                    if (modelTrigger) {
                                        const placeholder = modelTrigger.querySelector('.custom-select-placeholder');
                                        if (placeholder) {
                                            placeholder.textContent = vehicle.modelName;
                                            placeholder.classList.add('selected');
                                        }
                                    }
                                    
                                    // Update specs if model exists in database
                                    window.updateVehicleSpecs();
                                    // If specs weren't auto-filled, use saved values
                                    if (connectorSelect && !connectorSelect.value && vehicle.connectorType) {
                                        connectorSelect.value = vehicle.connectorType;
                                    }
                                    if (batteryInput && !batteryInput.value && vehicle.batteryCapacity) {
                                        batteryInput.value = vehicle.batteryCapacity;
                                    }
                                }
                            }, 100);
                        }
                    }, 100);
                }
            }
            // Fallback: if vehicle not in database, set values directly
            if (connectorSelect && !connectorSelect.value && vehicle.connectorType) {
                connectorSelect.value = vehicle.connectorType;
            }
            if (batteryInput && !batteryInput.value && vehicle.batteryCapacity) {
                batteryInput.value = vehicle.batteryCapacity;
            }
            
            modal.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error loading vehicle for edit:', error);
        showError('Failed to load vehicle details');
    }
};

// Delete vehicle
window.deleteVehicle = async function(vehicleId) {
    // Use custom confirmation modal if available, otherwise use browser confirm
    const confirmed = window.showConfirmModal 
        ? await window.showConfirmModal('Delete Vehicle', 'Are you sure you want to delete this vehicle? This action cannot be undone.')
        : confirm('Are you sure you want to delete this vehicle?');
    
    if (!confirmed) {
        return;
    }
    
    try {
        const response = await deleteVehicleAPI(vehicleId);
        
        if (response.success) {
            showSuccess('Vehicle deleted successfully');
            await loadVehiclesModule();
        } else {
            showError(response.error || 'Failed to delete vehicle');
        }
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        showError('Failed to delete vehicle');
    }
};

// Handle vehicle form submit
window.handleVehicleSubmit = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const vehicleId = event.target.dataset.vehicleId;
    
    const vehicleType = formData.get('vehicleType');
    const brand = formData.get('brand')?.trim();
    const modelName = formData.get('modelName')?.trim();
    
    // Get connector type and battery capacity from hidden fields
    const connectorType = formData.get('connectorType');
    const batteryCapacity = parseFloat(formData.get('batteryCapacity'));
    
    // If model is selected but specs not auto-filled, try to get from database
    let finalConnectorType = connectorType;
    let finalBatteryCapacity = batteryCapacity;
    
    if (vehicleType && brand && modelName && EV_VEHICLES[vehicleType] && 
        EV_VEHICLES[vehicleType][brand] && EV_VEHICLES[vehicleType][brand][modelName]) {
        const specs = EV_VEHICLES[vehicleType][brand][modelName];
        finalConnectorType = specs.connectorType;
        finalBatteryCapacity = specs.batteryCapacity;
    }
    
    const vehicleData = {
        vehicleNumber: formData.get('vehicleNumber')?.trim(),
        vehicleType: vehicleType,
        brand: brand,
        modelName: modelName,
        connectorType: finalConnectorType,
        batteryCapacity: finalBatteryCapacity
    };
    
    // Client-side validation
    if (!vehicleData.vehicleNumber || !vehicleData.vehicleType || !vehicleData.brand || 
        !vehicleData.modelName) {
        showError('Please fill in all fields');
        return;
    }
    
    if (!finalConnectorType || !finalBatteryCapacity || finalBatteryCapacity <= 0) {
        showError('Please select a valid vehicle model. Connector type and battery capacity are automatically determined from the model.');
        return;
    }
    
    try {
        let response;
        if (vehicleId) {
            // Update existing vehicle
            response = await updateVehicle(vehicleId, vehicleData);
            if (response.success) {
                showSuccess('Vehicle updated successfully');
            } else {
                showError(response.error || 'Failed to update vehicle');
                return;
            }
        } else {
            // Create new vehicle
            response = await createVehicle(vehicleData);
            if (response.success) {
                showSuccess('Vehicle added successfully');
            } else {
                showError(response.error || 'Failed to add vehicle');
                return;
            }
        }
        
        window.closeVehicleModal();
        await loadVehiclesModule();
    } catch (error) {
        console.error('Error saving vehicle:', error);
        showError(error.message || 'Failed to save vehicle');
    }
};

// ========== Add Vehicle Page Functions ==========

// Reset all add vehicle dropdowns
window.resetAddVehicleDropdowns = function() {
    const brandSelect = document.getElementById('addBrandSelect');
    const modelSelect = document.getElementById('addModelSelect');
    const connectorSelect = document.getElementById('addConnectorTypeSelect');
    const batteryInput = document.getElementById('addBatteryCapacityInput');
    
    if (brandSelect) {
        brandSelect.innerHTML = '<option value="">Select Brand</option>';
    }
    const brandTrigger = document.getElementById('addBrandSelectTrigger');
    const brandOptions = document.getElementById('addBrandSelectOptions');
    if (brandTrigger) {
        const placeholder = brandTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Brand';
            placeholder.classList.remove('selected');
        }
        brandTrigger.classList.remove('active');
        brandTrigger.style.pointerEvents = 'none';
        brandTrigger.style.opacity = '0.6';
    }
    if (brandOptions) {
        brandOptions.innerHTML = '';
        brandOptions.style.display = 'none';
    }
    if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Select Model</option>';
        modelSelect.disabled = true;
    }
    const modelTrigger = document.getElementById('addModelSelectTrigger');
    const modelOptions = document.getElementById('addModelSelectOptions');
    if (modelTrigger) {
        const placeholder = modelTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Model';
            placeholder.classList.remove('selected');
        }
        modelTrigger.classList.remove('active');
        modelTrigger.style.pointerEvents = 'none';
        modelTrigger.style.opacity = '0.6';
    }
    if (modelOptions) {
        modelOptions.innerHTML = '';
        modelOptions.style.display = 'none';
    }
    if (connectorSelect) {
        connectorSelect.value = '';
    }
    if (batteryInput) {
        batteryInput.value = '';
    }
};

// Toggle add vehicle type dropdown
window.toggleAddVehicleTypeDropdown = function() {
    const trigger = document.getElementById('addVehicleTypeSelectTrigger');
    const options = document.getElementById('addVehicleTypeSelectOptions');
    const brandOptions = document.getElementById('addBrandSelectOptions');
    const modelOptions = document.getElementById('addModelSelectOptions');
    
    if (trigger && options) {
        const isOpen = options.style.display !== 'none';
        
        // Close other dropdowns if open
        if (brandOptions) {
            brandOptions.style.display = 'none';
            const brandTrigger = document.getElementById('addBrandSelectTrigger');
            if (brandTrigger) brandTrigger.classList.remove('active');
        }
        if (modelOptions) {
            modelOptions.style.display = 'none';
            const modelTrigger = document.getElementById('addModelSelectTrigger');
            if (modelTrigger) modelTrigger.classList.remove('active');
        }
        
        if (isOpen) {
            options.style.display = 'none';
            trigger.classList.remove('active');
        } else {
            options.style.display = 'block';
            trigger.classList.add('active');
        }
    }
};

// Select add vehicle type
window.selectAddVehicleType = function(vehicleType) {
    const trigger = document.getElementById('addVehicleTypeSelectTrigger');
    const options = document.getElementById('addVehicleTypeSelectOptions');
    const hiddenSelect = document.getElementById('addVehicleTypeSelect');
    const placeholder = trigger?.querySelector('.custom-select-placeholder');
    
    if (hiddenSelect) {
        hiddenSelect.value = vehicleType;
    }
    
    // Update trigger display
    if (placeholder) {
        placeholder.textContent = vehicleType;
        placeholder.classList.add('selected');
    }
    
    // Close dropdown
    if (options) {
        options.style.display = 'none';
    }
    if (trigger) {
        trigger.classList.remove('active');
    }
    
    // Update brand dropdown
    window.updateAddBrandDropdown();
};

// Toggle add brand dropdown
window.toggleAddBrandDropdown = function() {
    const trigger = document.getElementById('addBrandSelectTrigger');
    const options = document.getElementById('addBrandSelectOptions');
    const vehicleTypeOptions = document.getElementById('addVehicleTypeSelectOptions');
    const modelOptions = document.getElementById('addModelSelectOptions');
    
    if (trigger && options && trigger.style.pointerEvents !== 'none') {
        const isOpen = options.style.display !== 'none';
        
        // Close other dropdowns if open
        if (vehicleTypeOptions) {
            vehicleTypeOptions.style.display = 'none';
            const vehicleTypeTrigger = document.getElementById('addVehicleTypeSelectTrigger');
            if (vehicleTypeTrigger) vehicleTypeTrigger.classList.remove('active');
        }
        if (modelOptions) {
            modelOptions.style.display = 'none';
            const modelTrigger = document.getElementById('addModelSelectTrigger');
            if (modelTrigger) modelTrigger.classList.remove('active');
        }
        
        if (isOpen) {
            options.style.display = 'none';
            trigger.classList.remove('active');
        } else {
            options.style.display = 'block';
            trigger.classList.add('active');
        }
    }
};

// Select add brand
window.selectAddBrand = function(brand) {
    const trigger = document.getElementById('addBrandSelectTrigger');
    const options = document.getElementById('addBrandSelectOptions');
    const hiddenSelect = document.getElementById('addBrandSelect');
    const placeholder = trigger?.querySelector('.custom-select-placeholder');
    
    if (hiddenSelect) {
        hiddenSelect.value = brand;
    }
    
    // Update trigger display
    if (placeholder) {
        const brandImage = BRAND_IMAGES[brand];
        if (brandImage) {
            placeholder.innerHTML = `
                <img src="${brandImage}" alt="${brand}" 
                     style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px; flex-shrink: 0; background: transparent; padding: 2px; display: block;"
                     onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='flex';"
                     onload="this.style.display='block'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='none';">
                <span class="brand-fallback" style="display: none;">${brand.charAt(0)}</span>
                <span>${brand}</span>
            `;
        } else {
            placeholder.innerHTML = `<span class="brand-fallback">${brand.charAt(0)}</span> <span>${brand}</span>`;
        }
        placeholder.classList.add('selected');
    }
    
    // Close dropdown
    if (options) {
        options.style.display = 'none';
    }
    if (trigger) {
        trigger.classList.remove('active');
    }
    
    // Update model dropdown
    window.updateAddModelDropdown();
};

// Toggle add model dropdown
window.toggleAddModelDropdown = function() {
    const trigger = document.getElementById('addModelSelectTrigger');
    const options = document.getElementById('addModelSelectOptions');
    const vehicleTypeOptions = document.getElementById('addVehicleTypeSelectOptions');
    const brandOptions = document.getElementById('addBrandSelectOptions');
    
    if (trigger && options && trigger.style.pointerEvents !== 'none') {
        const isOpen = options.style.display !== 'none';
        
        // Close other dropdowns if open
        if (vehicleTypeOptions) {
            vehicleTypeOptions.style.display = 'none';
            const vehicleTypeTrigger = document.getElementById('addVehicleTypeSelectTrigger');
            if (vehicleTypeTrigger) vehicleTypeTrigger.classList.remove('active');
        }
        if (brandOptions) {
            brandOptions.style.display = 'none';
            const brandTrigger = document.getElementById('addBrandSelectTrigger');
            if (brandTrigger) brandTrigger.classList.remove('active');
        }
        
        if (isOpen) {
            options.style.display = 'none';
            trigger.classList.remove('active');
        } else {
            options.style.display = 'block';
            trigger.classList.add('active');
        }
    }
};

// Select add model
window.selectAddModel = function(model) {
    const trigger = document.getElementById('addModelSelectTrigger');
    const options = document.getElementById('addModelSelectOptions');
    const hiddenSelect = document.getElementById('addModelSelect');
    const placeholder = trigger?.querySelector('.custom-select-placeholder');
    
    if (hiddenSelect) {
        hiddenSelect.value = model;
    }
    
    // Update trigger display
    if (placeholder) {
        placeholder.textContent = model;
        placeholder.classList.add('selected');
    }
    
    // Close dropdown
    if (options) {
        options.style.display = 'none';
    }
    if (trigger) {
        trigger.classList.remove('active');
    }
    
    // Update vehicle specs
    window.updateAddVehicleSpecs();
};

// Update add brand dropdown based on vehicle type
window.updateAddBrandDropdown = function() {
    const vehicleTypeSelect = document.getElementById('addVehicleTypeSelect');
    const brandSelect = document.getElementById('addBrandSelect');
    const brandOptions = document.getElementById('addBrandSelectOptions');
    const brandTrigger = document.getElementById('addBrandSelectTrigger');
    const modelSelect = document.getElementById('addModelSelect');
    const modelOptions = document.getElementById('addModelSelectOptions');
    const modelTrigger = document.getElementById('addModelSelectTrigger');
    
    const vehicleType = vehicleTypeSelect?.value;
    
    // Reset brand dropdown
    if (brandSelect) {
        brandSelect.innerHTML = '<option value="">Select Brand</option>';
    }
    if (brandOptions) {
        brandOptions.innerHTML = '';
        brandOptions.style.display = 'none';
    }
    if (brandTrigger) {
        const placeholder = brandTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Brand';
            placeholder.classList.remove('selected');
        }
        brandTrigger.classList.remove('active');
        brandTrigger.style.pointerEvents = vehicleType ? 'auto' : 'none';
        brandTrigger.style.opacity = vehicleType ? '1' : '0.6';
    }
    
    // Reset model dropdown
    if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Select Model</option>';
        modelSelect.disabled = true;
    }
    if (modelOptions) {
        modelOptions.innerHTML = '';
        modelOptions.style.display = 'none';
    }
    if (modelTrigger) {
        const placeholder = modelTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Model';
            placeholder.classList.remove('selected');
        }
        modelTrigger.classList.remove('active');
        modelTrigger.style.pointerEvents = 'none';
        modelTrigger.style.opacity = '0.6';
    }
    
    if (!vehicleType || !EV_VEHICLES[vehicleType]) {
        return;
    }
    
    // Populate brands for selected vehicle type
    const brands = Object.keys(EV_VEHICLES[vehicleType]).sort();
    if (brandSelect && brandOptions) {
        brands.forEach(brand => {
            // Add to hidden select
            const option = document.createElement('option');
            option.value = brand;
            option.textContent = brand;
            brandSelect.appendChild(option);
            
            // Add to custom dropdown
            const customOption = document.createElement('div');
            customOption.className = 'custom-select-option';
            customOption.onclick = () => window.selectAddBrand(brand);
            
            const brandImage = BRAND_IMAGES[brand];
            if (brandImage) {
                customOption.innerHTML = `
                    <img src="${brandImage}" alt="${brand}" 
                         style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px; flex-shrink: 0; background: transparent; padding: 2px;"
                         onerror="this.onerror=null; this.style.display='none'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='flex';"
                         onload="this.style.display='block'; const fallback = this.nextElementSibling; if(fallback) fallback.style.display='none';">
                    <span class="brand-fallback" style="display: none;">${brand.charAt(0)}</span>
                    <span>${brand}</span>
                `;
            } else {
                customOption.innerHTML = `
                    <span class="brand-fallback">${brand.charAt(0)}</span>
                    <span>${brand}</span>
                `;
            }
            
            brandOptions.appendChild(customOption);
        });
    }
};

// Update add model dropdown based on brand
window.updateAddModelDropdown = function() {
    const vehicleTypeSelect = document.getElementById('addVehicleTypeSelect');
    const brandSelect = document.getElementById('addBrandSelect');
    const modelSelect = document.getElementById('addModelSelect');
    const modelOptions = document.getElementById('addModelSelectOptions');
    const modelTrigger = document.getElementById('addModelSelectTrigger');
    const connectorSelect = document.getElementById('addConnectorTypeSelect');
    const batteryInput = document.getElementById('addBatteryCapacityInput');
    
    const vehicleType = vehicleTypeSelect?.value;
    const brand = brandSelect?.value;
    
    // Reset model dropdown
    if (modelSelect) {
        modelSelect.innerHTML = '<option value="">Select Model</option>';
    }
    if (modelOptions) {
        modelOptions.innerHTML = '';
        modelOptions.style.display = 'none';
    }
    if (modelTrigger) {
        const placeholder = modelTrigger.querySelector('.custom-select-placeholder');
        if (placeholder) {
            placeholder.textContent = 'Select Model';
            placeholder.classList.remove('selected');
        }
        modelTrigger.classList.remove('active');
        modelTrigger.style.pointerEvents = brand ? 'auto' : 'none';
        modelTrigger.style.opacity = brand ? '1' : '0.6';
    }
    
    // Reset hidden fields
    if (connectorSelect) {
        connectorSelect.value = '';
    }
    if (batteryInput) {
        batteryInput.value = '';
    }
    
    if (!vehicleType || !brand || !EV_VEHICLES[vehicleType] || !EV_VEHICLES[vehicleType][brand]) {
        return;
    }
    
    // Populate models for selected brand
    const models = Object.keys(EV_VEHICLES[vehicleType][brand]).sort();
    if (modelSelect && modelOptions) {
        models.forEach(model => {
            // Add to hidden select
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
            
            // Add to custom dropdown
            const customOption = document.createElement('div');
            customOption.className = 'custom-select-option';
            customOption.onclick = () => window.selectAddModel(model);
            customOption.innerHTML = `<span>${model}</span>`;
            modelOptions.appendChild(customOption);
        });
    }
};

// Update add vehicle specs (connector type and battery capacity)
window.updateAddVehicleSpecs = function() {
    const vehicleTypeSelect = document.getElementById('addVehicleTypeSelect');
    const brandSelect = document.getElementById('addBrandSelect');
    const modelSelect = document.getElementById('addModelSelect');
    const connectorSelect = document.getElementById('addConnectorTypeSelect');
    const batteryInput = document.getElementById('addBatteryCapacityInput');
    
    const vehicleType = vehicleTypeSelect?.value;
    const brand = brandSelect?.value;
    const model = modelSelect?.value;
    
    if (vehicleType && brand && model && EV_VEHICLES[vehicleType] && 
        EV_VEHICLES[vehicleType][brand] && EV_VEHICLES[vehicleType][brand][model]) {
        const specs = EV_VEHICLES[vehicleType][brand][model];
        if (connectorSelect) {
            connectorSelect.value = specs.connectorType;
        }
        if (batteryInput) {
            batteryInput.value = specs.batteryCapacity;
        }
    }
};

// Handle add vehicle form submission
window.handleAddVehicleSubmit = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    const vehicleType = formData.get('vehicleType');
    const brand = formData.get('brand')?.trim();
    const modelName = formData.get('modelName')?.trim();
    
    // Get connector type and battery capacity from hidden fields
    const connectorType = formData.get('connectorType');
    const batteryCapacity = parseFloat(formData.get('batteryCapacity'));
    
    // If model is selected but specs not auto-filled, try to get from database
    let finalConnectorType = connectorType;
    let finalBatteryCapacity = batteryCapacity;
    
    if (vehicleType && brand && modelName && EV_VEHICLES[vehicleType] && 
        EV_VEHICLES[vehicleType][brand] && EV_VEHICLES[vehicleType][brand][modelName]) {
        const specs = EV_VEHICLES[vehicleType][brand][modelName];
        finalConnectorType = specs.connectorType;
        finalBatteryCapacity = specs.batteryCapacity;
    }
    
    const vehicleData = {
        vehicleNumber: formData.get('vehicleNumber')?.trim(),
        vehicleType: vehicleType,
        brand: brand,
        modelName: modelName,
        connectorType: finalConnectorType,
        batteryCapacity: finalBatteryCapacity
    };
    
    // Client-side validation
    if (!vehicleData.vehicleNumber || !vehicleData.vehicleType || !vehicleData.brand || 
        !vehicleData.modelName) {
        showError('Please fill in all fields');
        return;
    }
    
    if (!finalConnectorType || !finalBatteryCapacity || finalBatteryCapacity <= 0) {
        showError('Please select a valid vehicle model. Connector type and battery capacity are automatically determined from the model.');
        return;
    }
    
    try {
        const response = await createVehicle(vehicleData);
        if (response.success) {
            showSuccess('Vehicle added successfully');
            // Navigate back to vehicles page
            window.goBackToVehicles();
        } else {
            showError(response.error || 'Failed to add vehicle');
        }
    } catch (error) {
        console.error('Error adding vehicle:', error);
        showError(error.message || 'Failed to add vehicle');
    }
};

// Close dropdowns when clicking outside (for add vehicle page)
document.addEventListener('click', function(event) {
    const addVehicleTypeWrapper = document.getElementById('addVehicleTypeSelectWrapper');
    const addBrandWrapper = document.getElementById('addBrandSelectWrapper');
    const addModelWrapper = document.getElementById('addModelSelectWrapper');
    
    if (addVehicleTypeWrapper && !addVehicleTypeWrapper.contains(event.target)) {
        const addVehicleTypeOptions = document.getElementById('addVehicleTypeSelectOptions');
        const addVehicleTypeTrigger = document.getElementById('addVehicleTypeSelectTrigger');
        if (addVehicleTypeOptions) addVehicleTypeOptions.style.display = 'none';
        if (addVehicleTypeTrigger) addVehicleTypeTrigger.classList.remove('active');
    }
    
    if (addBrandWrapper && !addBrandWrapper.contains(event.target)) {
        const addBrandOptions = document.getElementById('addBrandSelectOptions');
        const addBrandTrigger = document.getElementById('addBrandSelectTrigger');
        if (addBrandOptions) addBrandOptions.style.display = 'none';
        if (addBrandTrigger) addBrandTrigger.classList.remove('active');
    }
    
    if (addModelWrapper && !addModelWrapper.contains(event.target)) {
        const addModelOptions = document.getElementById('addModelSelectOptions');
        const addModelTrigger = document.getElementById('addModelSelectTrigger');
        if (addModelOptions) addModelOptions.style.display = 'none';
        if (addModelTrigger) addModelTrigger.classList.remove('active');
    }
});

