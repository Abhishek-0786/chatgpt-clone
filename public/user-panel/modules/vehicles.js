// Vehicles Module - Manage User Vehicles
import { updateActiveNav, updatePageTitle } from '../app.js';
import { getVehicles, getVehicle, createVehicle, updateVehicle, deleteVehicle as deleteVehicleAPI } from '../services/api.js';
import { showSuccess, showError } from '../../utils/notifications.js';

export async function loadVehiclesModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'vehicles');
    
    updateActiveNav('vehicles');
    updatePageTitle('My Vehicles');
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch vehicles from API
        const response = await getVehicles();
        const vehicles = response.success && response.vehicles ? response.vehicles : [];
    
    appMain.innerHTML = `
        <div class="vehicles-container">
            <!-- Add Vehicle Button -->
            <div style="margin-bottom: 16px;">
                <button class="btn btn-primary" onclick="window.showAddVehicleModal()">
                    <i class="fas fa-plus"></i> Add Vehicle
                </button>
            </div>
            
            <!-- Vehicles List -->
            <div id="vehiclesList">
                ${vehicles.length > 0 ? vehicles.map(vehicle => `
                    <div class="card">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                            <div style="flex: 1;">
                                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                                    <div style="font-size: 32px; color: var(--primary-color);">
                                        <i class="fas fa-car"></i>
                                    </div>
                                    <div>
                                        <h3 style="font-size: 20px; font-weight: 600; margin-bottom: 4px;">${vehicle.brand} ${vehicle.modelName}</h3>
                                        <div style="font-size: 14px; color: var(--text-secondary);">${vehicle.vehicleNumber}</div>
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                                    <div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">Vehicle Type</div>
                                        <div style="font-size: 14px; font-weight: 500;">${vehicle.vehicleType}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">Brand</div>
                                        <div style="font-size: 14px; font-weight: 500;">${vehicle.brand}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">Model</div>
                                        <div style="font-size: 14px; font-weight: 500;">${vehicle.modelName}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">Connector Type</div>
                                        <div style="font-size: 14px; font-weight: 500;">${vehicle.connectorType}</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">Battery Capacity</div>
                                        <div style="font-size: 14px; font-weight: 500;">${vehicle.batteryCapacity} kWh</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 12px; color: var(--text-secondary);">Added</div>
                                        <div style="font-size: 14px; font-weight: 500;">${formatDate(vehicle.createdAt)}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; margin-top: 16px;">
                            <button class="btn btn-outline" style="flex: 1;" onclick="window.editVehicle(${vehicle.id})">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-danger" style="flex: 1;" onclick="window.deleteVehicle(${vehicle.id})">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `).join('') : `
                    <div class="empty-state">
                        <i class="fas fa-car"></i>
                        <h3>No Vehicles Added</h3>
                        <p>Add your first vehicle to get started</p>
                    </div>
                `}
            </div>
        </div>
        
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
                        <input type="text" class="form-input" name="vehicleNumber" required placeholder="e.g., MH-01-AB-1234">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Vehicle Type</label>
                        <select class="form-input" name="vehicleType" required>
                            <option value="">Select Vehicle Type</option>
                            <option value="2W">2W</option>
                            <option value="3W">3W</option>
                            <option value="4W">4W</option>
                            <option value="Commercial">Commercial</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Brand / Manufacturer</label>
                        <input type="text" class="form-input" name="brand" required placeholder="e.g., Tesla, Tata, Mahindra">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Model Name</label>
                        <input type="text" class="form-input" name="modelName" required placeholder="e.g., Model 3, Nexon EV">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Connector Type / Charging Port</label>
                        <select class="form-input" name="connectorType" required>
                            <option value="">Select Connector Type</option>
                            <option value="Type 2">Type 2</option>
                            <option value="CCS">CCS</option>
                            <option value="CHAdeMO">CHAdeMO</option>
                            <option value="GB/T">GB/T</option>
                            <option value="Bharat AC">Bharat AC</option>
                            <option value="Bharat DC">Bharat DC</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Battery Capacity (kWh)</label>
                        <input type="number" class="form-input" name="batteryCapacity" required min="0" step="0.1" placeholder="e.g., 75.0">
                        <small>Enter battery capacity in kWh</small>
                    </div>
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

// Show add vehicle modal
window.showAddVehicleModal = function() {
    const modal = document.getElementById('vehicleModal');
    const form = document.getElementById('vehicleForm');
    const title = document.getElementById('vehicleModalTitle');
    
    if (modal && form && title) {
        title.textContent = 'Add Vehicle';
        form.reset();
        form.dataset.vehicleId = '';
        modal.style.display = 'flex';
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
            form.querySelector('input[name="vehicleNumber"]').value = vehicle.vehicleNumber || '';
            form.querySelector('select[name="vehicleType"]').value = vehicle.vehicleType || '';
            form.querySelector('input[name="brand"]').value = vehicle.brand || '';
            form.querySelector('input[name="modelName"]').value = vehicle.modelName || '';
            form.querySelector('select[name="connectorType"]').value = vehicle.connectorType || '';
            form.querySelector('input[name="batteryCapacity"]').value = vehicle.batteryCapacity || '';
            
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
    
    const vehicleData = {
        vehicleNumber: formData.get('vehicleNumber')?.trim(),
        vehicleType: formData.get('vehicleType'),
        brand: formData.get('brand')?.trim(),
        modelName: formData.get('modelName')?.trim(),
        connectorType: formData.get('connectorType'),
        batteryCapacity: parseFloat(formData.get('batteryCapacity'))
    };
    
    // Client-side validation
    if (!vehicleData.vehicleNumber || !vehicleData.vehicleType || !vehicleData.brand || 
        !vehicleData.modelName || !vehicleData.connectorType || !vehicleData.batteryCapacity) {
        showError('Please fill in all fields');
        return;
    }
    
    if (!vehicleData.batteryCapacity || vehicleData.batteryCapacity <= 0) {
        showError('Please enter a valid battery capacity (must be greater than 0)');
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

