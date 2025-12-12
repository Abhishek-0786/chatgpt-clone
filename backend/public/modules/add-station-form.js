// Add Station Form Module
import { createStation, getChargingStation, updateStation } from '../services/api.js';
import { getOrganizationsDropdown } from '../services/api.js';
import { loadChargingStationsModule } from './charging-stations.js';
import { showSuccess, showError, showWarning } from '../utils/notifications.js';

// Export function to open add station form
export function openAddStationForm() {
    const moduleContent = document.getElementById('moduleContent');
    moduleContent.innerHTML = `
        <style>
            .add-station-container {
                width: 100%;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }
            
            .form-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 30px;
            }
            
            .form-header h2 {
                font-size: 24px;
                font-weight: 600;
                margin: 0;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn {
                padding: 10px 20px;
                background-color: transparent;
                color: #dc3545;
                border: 1px solid #dc3545;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn:hover {
                background-color: #dc3545;
                color: white;
            }
            
            .form-section {
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                padding: 25px;
                margin-bottom: 25px;
            }
            
            .section-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 2px solid var(--border-color);
            }
            
            .section-icon {
                font-size: 20px;
                color: #007bff;
            }
            
            .section-title {
                font-size: 18px;
                font-weight: 600;
                margin: 0;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-row {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 20px;
            }
            
            .form-group {
                display: flex;
                flex-direction: column;
            }
            
            .form-group label {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 8px;
                color: var(--text-primary);
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-group label .required {
                color: #dc3545;
            }
            
            .form-group input,
            .form-group select,
            .form-group textarea {
                padding: 12px 15px;
                border: 1px solid var(--input-border);
                background-color: var(--input-bg);
                color: var(--text-primary);
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .form-group select {
                padding-right: 40px;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 15px center;
                background-size: 12px;
            }
            
            .form-group input:focus,
            .form-group select:focus,
            .form-group textarea:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .form-group textarea {
                resize: vertical;
                min-height: 100px;
            }
            
            .form-group.full-width {
                grid-column: 1 / -1;
            }
            
            .checkbox-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .checkbox-group input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            
            .checkbox-group label {
                margin: 0;
                font-weight: 500;
                color: var(--text-primary);
                cursor: pointer;
            }
            
            .custom-dropdown {
                position: relative;
                width: 100%;
            }
            
            .dropdown-input {
                padding: 12px 40px 12px 15px;
                border: 1px solid var(--input-border);
                border-radius: 4px;
                background-color: var(--input-bg);
                color: var(--text-primary);
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s, background-color 0.2s, color 0.2s;
            }
            
            .dropdown-input:hover {
                border-color: #007bff;
            }
            
            .dropdown-input.focused {
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .dropdown-placeholder {
                color: var(--text-muted);
            }
            
            .dropdown-placeholder.has-selection {
                color: var(--text-primary);
            }
            
            .dropdown-arrow {
                font-size: 12px;
                color: var(--text-secondary);
                transition: transform 0.2s;
            }
            
            .dropdown-input.open .dropdown-arrow {
                transform: rotate(180deg);
            }
            
            .dropdown-menu {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background-color: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                box-shadow: 0 4px 6px var(--shadow);
                margin-top: 4px;
                max-height: 300px;
                overflow-y: auto;
                z-index: 1000;
                display: none;
                padding: 8px 0;
            }
            
            .dropdown-menu.show {
                display: block;
            }
            
            .day-checkbox-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 15px;
                cursor: pointer;
                transition: background-color 0.2s;
            }
            
            .day-checkbox-item:hover {
                background-color: var(--bg-tertiary);
            }
            
            .day-checkbox-item input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            
            .day-checkbox-item label {
                margin: 0;
                font-weight: 500;
                cursor: pointer;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                font-size: 14px;
                color: var(--text-primary);
                flex: 1;
            }
            
            .dropdown-divider {
                height: 1px;
                background-color: var(--border-color);
                margin: 8px 0;
            }
            
            .amenities-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            
            .amenity-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 12px;
                border: 2px solid var(--border-color);
                background-color: var(--card-bg);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .amenity-item:hover {
                border-color: #007bff;
                background-color: var(--hover-bg);
            }
            
            .amenity-item.selected {
                border-color: #007bff;
                background-color: var(--hover-bg);
            }
            
            .amenity-item input[type="checkbox"] {
                width: 18px;
                height: 18px;
                cursor: pointer;
            }
            
            .amenity-item label {
                margin: 0;
                font-weight: 500;
                cursor: pointer;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-actions {
                display: flex;
                justify-content: flex-end;
                gap: 15px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid var(--border-color);
            }
            
            .save-btn {
                padding: 12px 30px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 16px;
                transition: background-color 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .save-btn:hover {
                background-color: #c82333;
            }
            
            .save-btn:disabled {
                background-color: #ccc;
                cursor: not-allowed;
            }
            
            .time-input-group {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .time-input-group span {
                color: var(--text-secondary);
                font-size: 14px;
                font-weight: 500;
            }
            
            .time-input {
                flex: 1;
            }
            
            .time-input::-webkit-calendar-picker-indicator {
                filter: invert(0);
                cursor: pointer;
                opacity: 1;
            }
            
            [data-theme="dark"] .time-input::-webkit-calendar-picker-indicator {
                filter: invert(1);
                opacity: 1;
            }
            
            .hidden {
                display: none;
            }
        </style>
        
        <div class="add-station-container">
            <div class="form-header">
                <h2>Add New Charging Station</h2>
                <button class="cancel-btn" onclick="window.cancelAddStation()">CANCEL</button>
            </div>
            
            <form id="addStationForm" onsubmit="window.handleAddStationSubmit(event)">
                <!-- Basic Details Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-user-cog section-icon"></i>
                        <h3 class="section-title">Basic details</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Charging station name<span class="required">*</span></label>
                            <input type="text" name="stationName" placeholder="Enter the name here" required>
                        </div>
                        <div class="form-group">
                            <label>Organization<span class="required">*</span></label>
                            <select name="organization" id="organizationSelect" required>
                                <option value="" disabled selected hidden>Select Organization</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Status<span class="required">*</span></label>
                            <select name="status" required>
                                <option value="" disabled selected hidden>Select Status</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                                <option value="Maintenance">Maintenance</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Specifications Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-cogs section-icon"></i>
                        <h3 class="section-title">Specifications</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Power capacity(kW)<span class="required">*</span></label>
                            <input type="number" name="powerCapacity" step="0.01" placeholder="Enter power capacity here" required>
                        </div>
                        <div class="form-group">
                            <label>Grid phase<span class="required">*</span></label>
                            <select name="gridPhase" required>
                                <option value="" disabled selected hidden>Select Grid Phase</option>
                                <option value="Single Phase">Single Phase</option>
                                <option value="Three Phase">Three Phase</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Location Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-map-marker-alt section-icon"></i>
                        <h3 class="section-title">Location</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Pin code<span class="required">*</span></label>
                            <input type="text" name="pinCode" placeholder="Enter the pin code here" required>
                        </div>
                        <div class="form-group">
                            <label>City/Town<span class="required">*</span></label>
                            <input type="text" name="city" placeholder="Enter the city/town here" required>
                        </div>
                        <div class="form-group">
                            <label>State<span class="required">*</span></label>
                            <input type="text" name="state" placeholder="Enter the state here" required>
                        </div>
                        <div class="form-group">
                            <label>Country<span class="required">*</span></label>
                            <select name="country" required>
                                <option value="" disabled selected hidden>Select Country</option>
                                <option value="AF">Afghanistan</option>
                                <option value="AL">Albania</option>
                                <option value="DZ">Algeria</option>
                                <option value="AR">Argentina</option>
                                <option value="AU">Australia</option>
                                <option value="AT">Austria</option>
                                <option value="BD">Bangladesh</option>
                                <option value="BE">Belgium</option>
                                <option value="BR">Brazil</option>
                                <option value="BG">Bulgaria</option>
                                <option value="CA">Canada</option>
                                <option value="CN">China</option>
                                <option value="CO">Colombia</option>
                                <option value="HR">Croatia</option>
                                <option value="CZ">Czech Republic</option>
                                <option value="DK">Denmark</option>
                                <option value="EG">Egypt</option>
                                <option value="FI">Finland</option>
                                <option value="FR">France</option>
                                <option value="DE">Germany</option>
                                <option value="GR">Greece</option>
                                <option value="HK">Hong Kong</option>
                                <option value="HU">Hungary</option>
                                <option value="IS">Iceland</option>
                                <option value="IN">India</option>
                                <option value="ID">Indonesia</option>
                                <option value="IE">Ireland</option>
                                <option value="IL">Israel</option>
                                <option value="IT">Italy</option>
                                <option value="JP">Japan</option>
                                <option value="KE">Kenya</option>
                                <option value="MY">Malaysia</option>
                                <option value="MX">Mexico</option>
                                <option value="NL">Netherlands</option>
                                <option value="NZ">New Zealand</option>
                                <option value="NG">Nigeria</option>
                                <option value="NO">Norway</option>
                                <option value="PK">Pakistan</option>
                                <option value="PH">Philippines</option>
                                <option value="PL">Poland</option>
                                <option value="PT">Portugal</option>
                                <option value="RO">Romania</option>
                                <option value="RU">Russia</option>
                                <option value="SA">Saudi Arabia</option>
                                <option value="SG">Singapore</option>
                                <option value="ZA">South Africa</option>
                                <option value="KR">South Korea</option>
                                <option value="ES">Spain</option>
                                <option value="SE">Sweden</option>
                                <option value="CH">Switzerland</option>
                                <option value="TW">Taiwan</option>
                                <option value="TH">Thailand</option>
                                <option value="TR">Turkey</option>
                                <option value="UA">Ukraine</option>
                                <option value="AE">United Arab Emirates</option>
                                <option value="GB">United Kingdom</option>
                                <option value="US">United States</option>
                                <option value="VN">Vietnam</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Latitude<span class="required">*</span></label>
                            <input type="text" name="latitude" placeholder="Enter the latitude here" required>
                        </div>
                        <div class="form-group">
                            <label>Longitude<span class="required">*</span></label>
                            <input type="text" name="longitude" placeholder="Enter the longitude here" required>
                        </div>
                        <div class="form-group full-width">
                            <label>Full Address<span class="required">*</span></label>
                            <textarea name="fullAddress" placeholder="Enter the full address here" required></textarea>
                        </div>
                    </div>
                </div>
                
                <!-- Other Details Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-info-circle section-icon"></i>
                        <h3 class="section-title">Other details</h3>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Timings</label>
                            <div class="time-input-group">
                                <input type="time" name="openingTime" class="time-input" value="17:14">
                                <span>to</span>
                                <input type="time" name="closingTime" class="time-input" value="17:14">
                            </div>
                            <div class="checkbox-group" style="margin-top: 10px;">
                                <input type="checkbox" name="open24Hours" id="open24Hours">
                                <label for="open24Hours">Open 24 hrs</label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Working Days<span class="required">*</span></label>
                            <div class="custom-dropdown" id="workingDaysDropdown">
                                <div class="dropdown-input" onclick="window.toggleWorkingDaysDropdown()">
                                    <span class="dropdown-placeholder" id="workingDaysPlaceholder">Select days</span>
                                    <i class="fas fa-chevron-down dropdown-arrow"></i>
                                </div>
                                <div class="dropdown-menu" id="workingDaysMenu">
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="workingDays" value="sunday" id="day-sunday" onchange="window.updateWorkingDaysDisplay()">
                                        <label for="day-sunday">Sunday</label>
                                    </div>
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="workingDays" value="monday" id="day-monday" onchange="window.updateWorkingDaysDisplay()">
                                        <label for="day-monday">Monday</label>
                                    </div>
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="workingDays" value="tuesday" id="day-tuesday" onchange="window.updateWorkingDaysDisplay()">
                                        <label for="day-tuesday">Tuesday</label>
                                    </div>
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="workingDays" value="wednesday" id="day-wednesday" onchange="window.updateWorkingDaysDisplay()">
                                        <label for="day-wednesday">Wednesday</label>
                                    </div>
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="workingDays" value="thursday" id="day-thursday" onchange="window.updateWorkingDaysDisplay()">
                                        <label for="day-thursday">Thursday</label>
                                    </div>
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="workingDays" value="friday" id="day-friday" onchange="window.updateWorkingDaysDisplay()">
                                        <label for="day-friday">Friday</label>
                                    </div>
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="workingDays" value="saturday" id="day-saturday" onchange="window.updateWorkingDaysDisplay()">
                                        <label for="day-saturday">Saturday</label>
                                    </div>
                                    <div class="dropdown-divider"></div>
                                    <div class="day-checkbox-item">
                                        <input type="checkbox" name="allDays" id="allDays" onchange="window.toggleAllDays(this)">
                                        <label for="allDays">All Days</label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Station Contact Number</label>
                            <input type="tel" name="contactNumber" placeholder="+91">
                        </div>
                        <div class="form-group">
                            <label>Incharge Name</label>
                            <input type="text" name="inchargeName" placeholder="Enter the Incharge Name here">
                        </div>
                        <div class="form-group">
                            <label>Station Owner Name</label>
                            <input type="text" name="ownerName" placeholder="Enter the Owner Name here">
                        </div>
                        <div class="form-group">
                            <label>Station Owner Contact No.</label>
                            <input type="tel" name="ownerContact" placeholder="+91">
                        </div>
                        <div class="form-group full-width">
                            <div class="checkbox-group">
                                <input type="checkbox" name="sessionStartStopSMS" id="sessionStartStopSMS">
                                <label for="sessionStartStopSMS">Session Start and Stop SMS</label>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Amenities Section -->
                <div class="form-section">
                    <div class="section-header">
                        <i class="fas fa-star section-icon"></i>
                        <h3 class="section-title">Amenities</h3>
                    </div>
                    <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 15px; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;">
                        Please choose all the available amenities at/near the charging station.
                    </p>
                    <div class="amenities-grid">
                        <div class="amenity-item">
                            <input type="checkbox" name="amenities" value="restaurant" id="amenity-restaurant">
                            <label for="amenity-restaurant"><i class="fas fa-utensils"></i> Restaurant</label>
                        </div>
                        <div class="amenity-item">
                            <input type="checkbox" name="amenities" value="hotel" id="amenity-hotel">
                            <label for="amenity-hotel"><i class="fas fa-bed"></i> Hotel</label>
                        </div>
                        <div class="amenity-item">
                            <input type="checkbox" name="amenities" value="mall" id="amenity-mall">
                            <label for="amenity-mall"><i class="fas fa-shopping-bag"></i> Mall</label>
                        </div>
                        <div class="amenity-item">
                            <input type="checkbox" name="amenities" value="hospital" id="amenity-hospital">
                            <label for="amenity-hospital"><i class="fas fa-hospital"></i> Hospital</label>
                        </div>
                        <div class="amenity-item">
                            <input type="checkbox" name="amenities" value="garage" id="amenity-garage">
                            <label for="amenity-garage"><i class="fas fa-wrench"></i> Garage</label>
                        </div>
                        <div class="amenity-item">
                            <input type="checkbox" name="amenities" value="atm" id="amenity-atm">
                            <label for="amenity-atm"><i class="fas fa-money-bill-wave"></i> ATM</label>
                        </div>
                        <div class="amenity-item">
                            <input type="checkbox" name="amenities" value="cafe" id="amenity-cafe">
                            <label for="amenity-cafe"><i class="fas fa-coffee"></i> Cafe</label>
                        </div>
                    </div>
                </div>
                
                <!-- Form Actions -->
                <div class="form-actions">
                    <button type="submit" class="save-btn" id="saveStationBtn">
                        SAVE & ADD STATION
                    </button>
                </div>
            </form>
        </div>
    `;
    
    // Initialize click outside handler
    setTimeout(() => {
        initializeClickOutsideHandler();
    }, 100);
    
    // Load organizations into dropdown
    loadOrganizations();
}

// Load organizations into dropdown
async function loadOrganizations() {
    try {
        const response = await getOrganizationsDropdown();
        if (response.success && response.data && response.data.organizations) {
            const select = document.getElementById('organizationSelect');
            if (select) {
                // Clear existing options except the first placeholder
                select.innerHTML = '<option value="" disabled selected hidden>Select Organization</option>';
                
                // Add organizations
                response.data.organizations.forEach(org => {
                    const option = document.createElement('option');
                    option.value = org.id;
                    option.textContent = org.organizationName;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading organizations:', error);
        showError('Failed to load organizations. Please refresh the page.');
    }
}

// Cancel add station
export function cancelAddStation() {
    // Update URL and reload charging stations module
    const url = `/cms?module=charging-stations`;
    window.history.pushState({ module: 'charging-stations' }, '', url);
    loadChargingStationsModule();
}

// Handle form submission
export async function handleAddStationSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Validate required dropdown fields (extra validation)
    const organization = formData.get('organization');
    const status = formData.get('status');
    const gridPhase = formData.get('gridPhase');
    const country = formData.get('country');
    
    // Check if any required dropdown is empty (empty string means placeholder is still selected)
    if (!organization || organization === '') {
        showWarning('Please select an Organization');
        return;
    }
    
    if (!status || status === '') {
        showWarning('Please select a Status');
        return;
    }
    
    if (!gridPhase || gridPhase === '') {
        showWarning('Please select a Grid Phase');
        return;
    }
    
    if (!country || country === '') {
        showWarning('Please select a Country');
        return;
    }
    
    // Get current user from localStorage for createdBy
    let createdBy = 'Admin'; // Default fallback
    try {
        const currentUser = localStorage.getItem('currentUser');
        if (currentUser) {
            const user = JSON.parse(currentUser);
            // Use username as requested
            if (user.username) {
                createdBy = user.username;
            } else if (user.firstName && user.lastName) {
                createdBy = `${user.firstName} ${user.lastName}`;
            } else if (user.firstName) {
                createdBy = user.firstName;
            }
        }
    } catch (error) {
        console.error('Error getting user info:', error);
        // Keep default 'Admin' if error
    }
    
    // Get all form values
    const stationData = {
        // Basic details
        stationName: formData.get('stationName'),
        organizationId: parseInt(organization), // Changed from organization to organizationId
        status: status, // Already validated above
        
        // Specifications
        powerCapacity: parseFloat(formData.get('powerCapacity')),
        gridPhase: gridPhase, // Already validated above
        
        // Location
        pinCode: formData.get('pinCode'),
        city: formData.get('city'),
        state: formData.get('state'),
        country: country, // Already validated above
        latitude: parseFloat(formData.get('latitude')),
        longitude: parseFloat(formData.get('longitude')),
        fullAddress: formData.get('fullAddress'),
        
        // Other details
        openingTime: formData.get('openingTime'),
        closingTime: formData.get('closingTime'),
        open24Hours: formData.has('open24Hours'),
        workingDays: formData.getAll('workingDays'), // Now it's an array of selected days
        allDays: formData.has('allDays'),
        contactNumber: formData.get('contactNumber'),
        inchargeName: formData.get('inchargeName'),
        ownerName: formData.get('ownerName'),
        ownerContact: formData.get('ownerContact'),
        sessionStartStopSMS: formData.has('sessionStartStopSMS'),
        
        // Amenities
        amenities: formData.getAll('amenities'),
        
        // Created by
        createdBy: createdBy
    };
    
    // Disable submit button
    const saveBtn = document.getElementById('saveStationBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
        // Call API
        const response = await createStation(stationData);
        
        if (response.success) {
            showSuccess('Station added successfully!');
            // Reload stations list
            cancelAddStation();
        } else {
            showError(response.error || 'Failed to add station');
        }
    } catch (error) {
        console.error('Error adding station:', error);
        showError(error.message || 'Failed to add station');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'SAVE & ADD STATION';
    }
}

// Toggle working days dropdown
export function toggleWorkingDaysDropdown() {
    const dropdown = document.getElementById('workingDaysDropdown');
    const menu = document.getElementById('workingDaysMenu');
    const input = dropdown.querySelector('.dropdown-input');
    
    const isOpen = menu.classList.contains('show');
    
    if (isOpen) {
        menu.classList.remove('show');
        input.classList.remove('open');
    } else {
        // Close other dropdowns if any
        document.querySelectorAll('.dropdown-menu.show').forEach(m => {
            m.classList.remove('show');
            m.closest('.custom-dropdown')?.querySelector('.dropdown-input')?.classList.remove('open');
        });
        
        menu.classList.add('show');
        input.classList.add('open', 'focused');
    }
}

// Update working days display text
export function updateWorkingDaysDisplay() {
    const checkboxes = document.querySelectorAll('input[name="workingDays"]:checked');
    const placeholder = document.getElementById('workingDaysPlaceholder');
    
    if (checkboxes.length === 0) {
        placeholder.textContent = 'Select days';
        placeholder.classList.remove('has-selection');
    } else if (checkboxes.length === 7) {
        placeholder.textContent = 'All Days';
        placeholder.classList.add('has-selection');
    } else {
        const dayNames = Array.from(checkboxes).map(cb => {
            const day = cb.value;
            return day.charAt(0).toUpperCase() + day.slice(1);
        });
        placeholder.textContent = dayNames.join(', ');
        placeholder.classList.add('has-selection');
    }
}

// Toggle all days checkbox
export function toggleAllDays(checkbox) {
    const dayCheckboxes = document.querySelectorAll('input[name="workingDays"]');
    dayCheckboxes.forEach(dayCheckbox => {
        dayCheckbox.checked = checkbox.checked;
    });
    updateWorkingDaysDisplay();
}

// Close dropdown when clicking outside (initialize after form loads)
let clickOutsideHandlerInitialized = false;
function initializeClickOutsideHandler() {
    if (clickOutsideHandlerInitialized) return;
    clickOutsideHandlerInitialized = true;
    
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('workingDaysDropdown');
        if (dropdown && !dropdown.contains(event.target)) {
            const menu = document.getElementById('workingDaysMenu');
            const input = dropdown.querySelector('.dropdown-input');
            if (menu && menu.classList.contains('show')) {
                menu.classList.remove('show');
                input.classList.remove('open', 'focused');
            }
        }
    });
}

// Export function to open edit station form
export async function openEditStationForm(stationId) {
    try {
        // Fetch station data
        const response = await getChargingStation(stationId);
        if (!response.success || !response.station) {
            showError('Failed to load station data');
            return;
        }
        
        const station = response.station;
        
        // First, open the add form to get the structure
        openAddStationForm();
        
        // Wait for DOM to be ready, then fill in the values
        setTimeout(async () => {
            // Wait for organizations to load
            await waitForOrganizations();
            fillEditFormData(station, stationId);
        }, 200);
        
    } catch (error) {
        console.error('Error opening edit station form:', error);
        showError(error.message || 'Failed to load station data');
    }
}

// Wait for organizations to load
async function waitForOrganizations() {
    const maxAttempts = 10;
    let attempts = 0;
    
    while (attempts < maxAttempts) {
        const select = document.getElementById('organizationSelect');
        if (select && select.options.length > 1) {
            return; // Organizations loaded
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
}

// Helper function to fill form data for edit
function fillEditFormData(station, stationId) {
    // Change form title and submit button
    const formHeader = document.querySelector('.form-header h2');
    if (formHeader) {
        formHeader.textContent = 'Edit Station';
    }
    
    const form = document.getElementById('addStationForm');
    if (form) {
        form.id = 'editStationForm';
        form.onsubmit = (e) => {
            e.preventDefault();
            handleUpdateStationSubmit(e, stationId);
        };
    }
    
    const saveBtn = document.getElementById('saveStationBtn');
    if (saveBtn) {
        saveBtn.textContent = 'UPDATE STATION';
    }
    
    // Fill in all form fields
    if (station.stationName) {
        const input = document.querySelector('input[name="stationName"]');
        if (input) input.value = station.stationName;
    }
    
    if (station.organizationId) {
        const select = document.getElementById('organizationSelect');
        if (select) {
            select.value = station.organizationId;
        }
    } else if (station.organization) {
        // Fallback for old data - try to find organization by name
        const select = document.getElementById('organizationSelect');
        if (select) {
            // This is a fallback - ideally all stations should have organizationId
            // For now, we'll just log a warning
            console.warn('Station has organization string instead of organizationId:', station.organization);
        }
    }
    
    // Use storedStatus if available (for editing), otherwise fall back to status
    const statusToUse = station.storedStatus || station.status;
    if (statusToUse) {
        const select = document.querySelector('select[name="status"]');
        if (select) {
            // Backend and frontend use same values (Active, Inactive, Maintenance)
            select.value = statusToUse;
        }
    }
    
    if (station.powerCapacity) {
        const input = document.querySelector('input[name="powerCapacity"]');
        if (input) input.value = station.powerCapacity;
    }
    
    if (station.gridPhase) {
        const select = document.querySelector('select[name="gridPhase"]');
        if (select) {
            // Backend and frontend use same values (Single Phase, Three Phase)
            select.value = station.gridPhase;
        }
    }
    
    if (station.pinCode) {
        const input = document.querySelector('input[name="pinCode"]');
        if (input) input.value = station.pinCode;
    }
    
    if (station.city) {
        const input = document.querySelector('input[name="city"]');
        if (input) input.value = station.city;
    }
    
    if (station.state) {
        const input = document.querySelector('input[name="state"]');
        if (input) input.value = station.state;
    }
    
    // Set country - always try to set it, even if null/empty
    if (station.country !== undefined && station.country !== null) {
        const select = document.querySelector('select[name="country"]');
        if (select) {
            select.value = station.country;
            // Trigger change event to update any dependent UI
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    if (station.latitude) {
        const input = document.querySelector('input[name="latitude"]');
        if (input) input.value = station.latitude;
    }
    
    if (station.longitude) {
        const input = document.querySelector('input[name="longitude"]');
        if (input) input.value = station.longitude;
    }
    
    if (station.fullAddress) {
        const textarea = document.querySelector('textarea[name="fullAddress"]');
        if (textarea) textarea.value = station.fullAddress;
    }
    
    if (station.openingTime) {
        const input = document.querySelector('input[name="openingTime"]');
        if (input) {
            // Convert time format if needed
            const time = station.openingTime.includes(':') ? station.openingTime.substring(0, 5) : station.openingTime;
            input.value = time;
        }
    }
    
    if (station.closingTime) {
        const input = document.querySelector('input[name="closingTime"]');
        if (input) {
            const time = station.closingTime.includes(':') ? station.closingTime.substring(0, 5) : station.closingTime;
            input.value = time;
        }
    }
    
    if (station.open24Hours) {
        const checkbox = document.getElementById('open24Hours');
        if (checkbox) checkbox.checked = station.open24Hours;
    }
    
    // Set working days checkboxes - handle case-insensitive matching
    if (station.workingDays && Array.isArray(station.workingDays) && station.workingDays.length > 0) {
        // First, uncheck all working days checkboxes
        const allDayCheckboxes = document.querySelectorAll('input[name="workingDays"]');
        allDayCheckboxes.forEach(cb => cb.checked = false);
        
        // Then check the ones from the station data (case-insensitive)
        station.workingDays.forEach(day => {
            const dayLower = day.toLowerCase();
            const checkbox = document.getElementById(`day-${dayLower}`);
            if (checkbox) {
                checkbox.checked = true;
            } else {
                // Try to find by value attribute as fallback
                const checkboxByValue = document.querySelector(`input[name="workingDays"][value="${dayLower}"]`);
                if (checkboxByValue) {
                    checkboxByValue.checked = true;
                }
            }
        });
        updateWorkingDaysDisplay();
    } else {
        // If no working days, uncheck all
        const allDayCheckboxes = document.querySelectorAll('input[name="workingDays"]');
        allDayCheckboxes.forEach(cb => cb.checked = false);
        updateWorkingDaysDisplay();
    }
    
    // Set all days checkbox
    if (station.allDays) {
        const allDaysCheckbox = document.getElementById('allDays');
        if (allDaysCheckbox) {
            allDaysCheckbox.checked = true;
        }
    }
    
    if (station.contactNumber) {
        const input = document.querySelector('input[name="contactNumber"]');
        if (input) input.value = station.contactNumber;
    }
    
    if (station.inchargeName) {
        const input = document.querySelector('input[name="inchargeName"]');
        if (input) input.value = station.inchargeName;
    }
    
    if (station.ownerName) {
        const input = document.querySelector('input[name="ownerName"]');
        if (input) input.value = station.ownerName;
    }
    
    if (station.ownerContact) {
        const input = document.querySelector('input[name="ownerContact"]');
        if (input) input.value = station.ownerContact;
    }
    
    if (station.sessionStartStopSMS) {
        const checkbox = document.getElementById('sessionStartStopSMS');
        if (checkbox) checkbox.checked = station.sessionStartStopSMS;
    }
    
    // Set amenities checkboxes - handle case-insensitive matching
    if (station.amenities && Array.isArray(station.amenities) && station.amenities.length > 0) {
        // First, uncheck all amenities checkboxes
        const allAmenityCheckboxes = document.querySelectorAll('input[name="amenities"]');
        allAmenityCheckboxes.forEach(cb => cb.checked = false);
        
        // Then check the ones from the station data (case-insensitive)
        station.amenities.forEach(amenity => {
            const amenityLower = amenity.toLowerCase();
            const checkbox = document.querySelector(`input[name="amenities"][value="${amenityLower}"]`);
            if (checkbox) {
                checkbox.checked = true;
            } else {
                // Try exact match as fallback
                const checkboxExact = document.querySelector(`input[name="amenities"][value="${amenity}"]`);
                if (checkboxExact) {
                    checkboxExact.checked = true;
                }
            }
        });
    } else {
        // If no amenities, uncheck all
        const allAmenityCheckboxes = document.querySelectorAll('input[name="amenities"]');
        allAmenityCheckboxes.forEach(cb => cb.checked = false);
    }
}

// Handle update form submission
export async function handleUpdateStationSubmit(event, stationId) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const organization = formData.get('organization');
    const status = formData.get('status');
    const gridPhase = formData.get('gridPhase');
    const country = formData.get('country');

    if (!organization || organization === '') {
        showWarning('Please select an Organization');
        return;
    }
    
    if (!status || status === '') {
        showWarning('Please select a Status');
        return;
    }
    
    if (!gridPhase || gridPhase === '') {
        showWarning('Please select a Grid Phase');
        return;
    }
    
    if (!country || country === '') {
        showWarning('Please select a Country');
        return;
    }
    
    // Get all form values
    const stationData = {
        stationName: formData.get('stationName'),
        organization: organization,
        status: status,
        powerCapacity: formData.get('powerCapacity') ? parseFloat(formData.get('powerCapacity')) : null,
        gridPhase: gridPhase,
        pinCode: formData.get('pinCode') || null,
        city: formData.get('city') || null,
        state: formData.get('state') || null,
        country: country,
        latitude: formData.get('latitude') ? parseFloat(formData.get('latitude')) : null,
        longitude: formData.get('longitude') ? parseFloat(formData.get('longitude')) : null,
        fullAddress: formData.get('fullAddress') || null,
        openingTime: formData.get('openingTime') || null,
        closingTime: formData.get('closingTime') || null,
        open24Hours: formData.has('open24Hours'),
        workingDays: formData.getAll('workingDays'),
        allDays: formData.has('allDays'),
        contactNumber: formData.get('contactNumber') || null,
        inchargeName: formData.get('inchargeName') || null,
        ownerName: formData.get('ownerName') || null,
        ownerContact: formData.get('ownerContact') || null,
        sessionStartStopSMS: formData.has('sessionStartStopSMS'),
        amenities: formData.getAll('amenities')
    };
    
    // Disable submit button
    const saveBtn = document.getElementById('saveStationBtn') || document.querySelector('#editStationForm button[type="submit"]');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Updating...';
    }
    
    try {
        const response = await updateStation(stationId, stationData);
        
        if (response.success) {
            showSuccess('Station updated successfully!');
            cancelAddStation(); // This will reload the stations list
        } else {
            showError(response.error || 'Failed to update station');
        }
    } catch (error) {
        console.error('Error updating station:', error);
        showError(error.message || 'Failed to update station');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'UPDATE STATION';
        }
    }
}

// Make functions globally available
window.openAddStationForm = openAddStationForm;
window.openEditStationForm = openEditStationForm;
window.cancelAddStation = cancelAddStation;
window.handleAddStationSubmit = handleAddStationSubmit;
window.handleUpdateStationSubmit = handleUpdateStationSubmit;
window.toggleWorkingDaysDropdown = toggleWorkingDaysDropdown;
window.updateWorkingDaysDisplay = updateWorkingDaysDisplay;
window.toggleAllDays = toggleAllDays;

