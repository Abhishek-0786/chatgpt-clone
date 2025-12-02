// Add Tariff Form Module
import { createTariff, updateTariff, getTariff } from '../services/api.js';
import { loadTariffManagementModule } from './tariff-management.js';
import { showSuccess, showError, showWarning } from '../utils/notifications.js';

// Export function to open add tariff form modal
export function openAddTariffForm() {
    const moduleContent = document.getElementById('moduleContent');
    
    // Create modal overlay
    const modalHTML = `
        <style>
            .tariff-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                padding: 20px;
            }
            
            .tariff-modal {
                background-color: #ffffff;
                border-radius: 8px;
                width: 100%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 25px;
                border-bottom: 1px solid #e0e0e0;
            }
            
            .modal-header h3 {
                font-size: 20px;
                font-weight: 600;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .modal-header h3 i {
                color: #007bff;
            }
            
            .close-btn {
                background: none;
                border: none;
                font-size: 24px;
                color: #666;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.2s;
            }
            
            .close-btn:hover {
                background-color: #f0f0f0;
                color: #333;
            }
            
            .modal-body {
                padding: 25px;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-group label {
                display: block;
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 8px;
                color: #333;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-group label .required {
                color: #dc3545;
            }
            
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 12px 15px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s;
            }
            
            .form-group select {
                padding-right: 40px;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 15px center;
                background-size: 12px;
            }
            
            .form-group input:focus,
            .form-group select:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .currency-prefix {
                position: relative;
            }
            
            .currency-prefix input {
                padding-left: 30px;
            }
            
            .currency-symbol {
                position: absolute;
                left: 15px;
                top: 50%;
                transform: translateY(-50%);
                color: #666;
                font-weight: 500;
            }
            
            .modal-footer {
                display: flex;
                justify-content: flex-end;
                gap: 15px;
                padding: 20px 25px;
                border-top: 1px solid #e0e0e0;
            }
            
            .cancel-btn {
                padding: 12px 24px;
                background-color: transparent;
                color: #666;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn:hover {
                background-color: #f8f9fa;
                border-color: #d0d0d0;
            }
            
            .save-btn {
                padding: 12px 24px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
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
        </style>
        
        <div class="tariff-modal-overlay" id="tariffModalOverlay" onclick="window.closeTariffModal(event)">
            <div class="tariff-modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-dollar-sign"></i>
                        Add new Tariff
                    </h3>
                    <button class="close-btn" onclick="window.closeTariffModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="addTariffForm" onsubmit="window.handleAddTariffSubmit(event)">
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Tariff Name<span class="required">*</span></label>
                            <input type="text" name="tariffName" placeholder="Enter name here" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Currency<span class="required">*</span></label>
                            <select name="currency" id="addCurrencySelect" onchange="window.updateCurrencySymbol('add')" required>
                                <option value="" disabled selected hidden>Select Currency</option>
                                <option value="INR">INR</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Base Charges<span class="required">*</span></label>
                            <div class="currency-prefix">
                                <span class="currency-symbol" id="addCurrencySymbol">₹</span>
                                <input type="number" name="baseCharges" step="0.01" placeholder="Enter Electricity charge" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Tax (%)</label>
                            <input type="number" name="tax" step="0.01" placeholder="0" value="0" min="0" max="100">
                        </div>
                        
                        <div class="form-group">
                            <label>Status<span class="required">*</span></label>
                            <select name="status" required>
                                <option value="" disabled selected hidden>Select Status</option>
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="cancel-btn" onclick="window.closeTariffModal()">CANCEL</button>
                        <button type="submit" class="save-btn" id="saveTariffBtn">ADD TARIFF</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Insert modal before the tariff management content
    const tariffContent = document.getElementById('tariff-management-content');
    if (tariffContent) {
        tariffContent.insertAdjacentHTML('beforebegin', modalHTML);
    } else {
        moduleContent.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // Set initial currency symbol based on default (INR)
    updateCurrencySymbol('add');
}

// Close modal
export function closeTariffModal(event) {
    // Only close if clicking on overlay, not on modal itself
    if (event && event.target.id !== 'tariffModalOverlay') {
        return;
    }
    
    const modal = document.getElementById('tariffModalOverlay');
    if (modal) {
        modal.remove();
    }
}

// Handle form submission
export async function handleAddTariffSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Get all form values
    const baseChargesValue = formData.get('baseCharges');
    const taxValue = formData.get('tax');
    
    // Get current user from localStorage - use username
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
    
    const tariffData = {
        tariffName: formData.get('tariffName'),
        currency: formData.get('currency'),
        baseCharges: parseFloat(baseChargesValue),
        tax: parseFloat(taxValue),
        status: formData.get('status'),
        createdBy: createdBy
    };
    
    // Validate required fields
    if (!tariffData.tariffName || !tariffData.currency || !tariffData.status) {
        showWarning('Please fill all required fields');
        return;
    }
    
    // Validate numeric fields
    if (isNaN(tariffData.baseCharges) || tariffData.baseCharges < 0) {
        showWarning('Base charges must be a valid positive number');
        return;
    }
    
    if (isNaN(tariffData.tax) || tariffData.tax < 0 || tariffData.tax > 100) {
        showWarning('Tax must be a valid number between 0 and 100');
        return;
    }
    
    // Disable submit button
    const saveBtn = document.getElementById('saveTariffBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Adding...';
    
    try {
        const response = await createTariff(tariffData);
        
        if (response.success) {
            showSuccess('Tariff added successfully!');
            closeTariffModal();
            // Reload tariff list
            loadTariffManagementModule();
        } else {
            showError(response.error || 'Failed to add tariff');
        }
    } catch (error) {
        console.error('Error adding tariff:', error);
        showError(error.message || 'Failed to add tariff');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'ADD TARIFF';
    }
}

// Export function to open edit tariff form modal
export async function openEditTariffForm(tariffId) {
    try {
        // Fetch tariff data
        const response = await getTariff(tariffId);
        if (!response.success || !response.tariff) {
            showError('Failed to load tariff data');
            return;
        }
        
        const tariff = response.tariff;
        const moduleContent = document.getElementById('moduleContent');
        
        // Create modal overlay with pre-filled data
        const modalHTML = `
        <style>
            .tariff-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                padding: 20px;
            }
            
            .tariff-modal {
                background-color: #ffffff;
                border-radius: 8px;
                width: 100%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            }
            
            .modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 25px;
                border-bottom: 1px solid #e0e0e0;
            }
            
            .modal-header h3 {
                font-size: 20px;
                font-weight: 600;
                margin: 0;
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .modal-header h3 i {
                color: #007bff;
            }
            
            .close-btn {
                background: none;
                border: none;
                font-size: 24px;
                color: #666;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.2s;
            }
            
            .close-btn:hover {
                background-color: #f0f0f0;
                color: #333;
            }
            
            .modal-body {
                padding: 25px;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-group label {
                display: block;
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 8px;
                color: #333;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .form-group label .required {
                color: #dc3545;
            }
            
            .form-group input,
            .form-group select {
                width: 100%;
                padding: 12px 15px;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                font-size: 14px;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                transition: border-color 0.2s;
            }
            
            .form-group select {
                padding-right: 40px;
                appearance: none;
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23333' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 15px center;
                background-size: 12px;
            }
            
            .form-group input:focus,
            .form-group select:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
            }
            
            .currency-prefix {
                position: relative;
            }
            
            .currency-prefix input {
                padding-left: 30px;
            }
            
            .currency-symbol {
                position: absolute;
                left: 15px;
                top: 50%;
                transform: translateY(-50%);
                color: #666;
                font-weight: 500;
            }
            
            .modal-footer {
                display: flex;
                justify-content: flex-end;
                gap: 15px;
                padding: 20px 25px;
                border-top: 1px solid #e0e0e0;
            }
            
            .cancel-btn {
                padding: 12px 24px;
                background-color: transparent;
                color: #666;
                border: 1px solid #e0e0e0;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            }
            
            .cancel-btn:hover {
                background-color: #f8f9fa;
                border-color: #d0d0d0;
            }
            
            .save-btn {
                padding: 12px 24px;
                background-color: #dc3545;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
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
        </style>
        
        <div class="tariff-modal-overlay" id="tariffModalOverlay" onclick="window.closeTariffModal(event)">
            <div class="tariff-modal" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>
                        <i class="fas fa-edit"></i>
                        Edit Tariff
                    </h3>
                    <button class="close-btn" onclick="window.closeTariffModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="editTariffForm" onsubmit="window.handleUpdateTariffSubmit(event, '${tariffId}')">
                    <div class="modal-body">
                        <div class="form-group">
                            <label>Tariff Name<span class="required">*</span></label>
                            <input type="text" name="tariffName" value="${tariff.tariffName || ''}" placeholder="Enter name here" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Currency<span class="required">*</span></label>
                            <select name="currency" id="editCurrencySelect" onchange="window.updateCurrencySymbol('edit')" required>
                                <option value="" disabled hidden>Select Currency</option>
                                <option value="INR" ${tariff.currency === 'INR' ? 'selected' : ''}>INR</option>
                                <option value="USD" ${tariff.currency === 'USD' ? 'selected' : ''}>USD</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>Base Charges<span class="required">*</span></label>
                            <div class="currency-prefix">
                                <span class="currency-symbol" id="editCurrencySymbol">${tariff.currency === 'USD' ? '$' : '₹'}</span>
                                <input type="number" name="baseCharges" step="0.01" value="${tariff.baseCharges || ''}" placeholder="Enter Electricity charge" required>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label>Tax (%)</label>
                            <input type="number" name="tax" step="0.01" value="${tariff.tax || 0}" placeholder="0" min="0" max="100">
                        </div>
                        
                        <div class="form-group">
                            <label>Status<span class="required">*</span></label>
                            <select name="status" required>
                                <option value="" disabled hidden>Select Status</option>
                                <option value="Active" ${tariff.status === 'Active' ? 'selected' : ''}>Active</option>
                                <option value="Inactive" ${tariff.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="cancel-btn" onclick="window.closeTariffModal()">CANCEL</button>
                        <button type="submit" class="save-btn" id="updateTariffBtn">UPDATE TARIFF</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
        // Insert modal before the tariff management content
        const tariffContent = document.getElementById('tariff-management-content');
        if (tariffContent) {
            tariffContent.insertAdjacentHTML('beforebegin', modalHTML);
        } else {
            moduleContent.insertAdjacentHTML('beforeend', modalHTML);
        }
        
        // Set initial currency symbol based on existing tariff currency
        updateCurrencySymbol('edit');
    } catch (error) {
        console.error('Error opening edit tariff form:', error);
        showError(error.message || 'Failed to load tariff data');
    }
}

// Handle update form submission
export async function handleUpdateTariffSubmit(event, tariffId) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Get all form values
    const baseChargesValue = formData.get('baseCharges');
    const taxValue = formData.get('tax');
    
    const tariffData = {
        tariffName: formData.get('tariffName'),
        currency: formData.get('currency'),
        baseCharges: parseFloat(baseChargesValue),
        tax: parseFloat(taxValue),
        status: formData.get('status')
    };
    
    // Validate required fields
    if (!tariffData.tariffName || !tariffData.currency || !tariffData.status) {
        showWarning('Please fill all required fields');
        return;
    }
    
    // Validate numeric fields
    if (isNaN(tariffData.baseCharges) || tariffData.baseCharges < 0) {
        showWarning('Base charges must be a valid positive number');
        return;
    }
    
    if (isNaN(tariffData.tax) || tariffData.tax < 0 || tariffData.tax > 100) {
        showWarning('Tax must be a valid number between 0 and 100');
        return;
    }
    
    // Disable submit button
    const updateBtn = document.getElementById('updateTariffBtn');
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating...';
    
    try {
        const response = await updateTariff(tariffId, tariffData);
        
        if (response.success) {
            showSuccess('Tariff updated successfully!');
            closeTariffModal();
            // Reload tariff list
            loadTariffManagementModule();
        } else {
            showError(response.error || 'Failed to update tariff');
        }
    } catch (error) {
        console.error('Error updating tariff:', error);
        showError(error.message || 'Failed to update tariff');
    } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = 'UPDATE TARIFF';
    }
}

// Update currency symbol based on selected currency
export function updateCurrencySymbol(formType) {
    const currencySelect = document.getElementById(`${formType}CurrencySelect`);
    const currencySymbol = document.getElementById(`${formType}CurrencySymbol`);
    
    if (currencySelect && currencySymbol) {
        const selectedCurrency = currencySelect.value;
        if (selectedCurrency === 'USD') {
            currencySymbol.textContent = '$';
        } else if (selectedCurrency === 'INR') {
            currencySymbol.textContent = '₹';
        } else {
            // Default to INR symbol if nothing selected
            currencySymbol.textContent = '₹';
        }
    }
}

// Make functions globally available
window.openAddTariffForm = openAddTariffForm;
window.openEditTariffForm = openEditTariffForm;
window.closeTariffModal = closeTariffModal;
window.handleAddTariffSubmit = handleAddTariffSubmit;
window.handleUpdateTariffSubmit = handleUpdateTariffSubmit;
window.updateCurrencySymbol = updateCurrencySymbol;

