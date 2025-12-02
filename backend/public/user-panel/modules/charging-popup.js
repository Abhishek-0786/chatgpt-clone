// Start Charging Popup Module
import { startCharging, stopCharging, getVehicles } from '../services/api.js';
import { showSuccess, showError } from '../../utils/notifications.js';

// Show start charging popup
window.showStartChargingPopup = async function(chargingPointId, deviceId, deviceName, connectorId, pricePerKwh) {
    // Check if user has vehicles BEFORE showing popup
    const vehiclesResponse = await getVehicles();
    const vehicles = vehiclesResponse.success && vehiclesResponse.vehicles ? vehiclesResponse.vehicles : [];
    
    // If no vehicles, show error and redirect to vehicles page
    if (vehicles.length === 0) {
        showError('Please add a vehicle before starting charging');
        // Navigate to vehicles page after a short delay
        setTimeout(() => {
            window.loadVehiclesModule();
        }, 1500);
        return;
    }
    
    const modal = document.getElementById('startChargingModal');
    const form = document.getElementById('startChargingForm');
    const chargerNameInput = document.getElementById('chargingChargerName');
    const priceDisplay = document.getElementById('pricePerKwhDisplay');
    
    if (modal && form && chargerNameInput) {
        chargerNameInput.value = deviceName || 'Charger';
        form.dataset.chargingPointId = chargingPointId || '';
        form.dataset.deviceId = deviceId || '';
        form.dataset.connectorId = connectorId || '';
        form.dataset.pricePerKwh = pricePerKwh || 0;
        
        // Display price per kWh
        if (priceDisplay && pricePerKwh) {
            priceDisplay.textContent = `₹${parseFloat(pricePerKwh).toFixed(2)}`;
        }
        
        // Reset amount input and hide estimated cost
        const amountInput = document.getElementById('chargingAmountInput');
        const estimatedCostGroup = document.getElementById('estimatedCostGroup');
        if (amountInput) {
            amountInput.value = '';
        }
        if (estimatedCostGroup) {
            estimatedCostGroup.style.display = 'none';
        }
        
        modal.style.display = 'flex';
    }
};

// Calculate estimated cost as user types amount
window.calculateEstimatedCost = function() {
    const amountInput = document.getElementById('chargingAmountInput');
    const form = document.getElementById('startChargingForm');
    const pricePerKwh = parseFloat(form?.dataset.pricePerKwh || 0);
    const estimatedCostGroup = document.getElementById('estimatedCostGroup');
    const estimatedEnergy = document.getElementById('estimatedEnergy');
    const estimatedCost = document.getElementById('estimatedCost');
    
    if (!amountInput || !form || !pricePerKwh || pricePerKwh === 0) {
        if (estimatedCostGroup) {
            estimatedCostGroup.style.display = 'none';
        }
        return;
    }
    
    const amount = parseFloat(amountInput.value) || 0;
    
    if (amount > 0 && estimatedCostGroup && estimatedEnergy && estimatedCost) {
        // Calculate estimated energy: amount / price per kWh
        const estimatedKwh = amount / pricePerKwh;
        
        // Total cost = amount (since they're entering the amount they want to charge)
        const totalCost = amount;
        
        estimatedEnergy.textContent = `${estimatedKwh.toFixed(2)} kWh`;
        estimatedCost.textContent = `₹${totalCost.toFixed(2)}`;
        estimatedCostGroup.style.display = 'block';
    } else {
        if (estimatedCostGroup) {
            estimatedCostGroup.style.display = 'none';
        }
    }
};

// Close start charging modal
window.closeStartChargingModal = function() {
    const modal = document.getElementById('startChargingModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Handle start charging form submit
window.handleStartCharging = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const amount = parseFloat(formData.get('amount'));
    const chargingPointId = event.target.dataset.chargingPointId;
    const deviceId = event.target.dataset.deviceId;
    const connectorId = parseInt(event.target.dataset.connectorId);
    
    if (!amount || amount < 1) {
        showError('Please enter a valid amount (minimum ₹1.00)');
        return;
    }
    
    // Get submit button for loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    
    try {
        // Show loading state
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
        }
        
        // Call API to start charging
        const response = await startCharging(deviceId, connectorId, amount, chargingPointId);
        
        if (response.success) {
            showSuccess(`Charging started! Amount deducted: ₹${amount.toFixed(2)}`);
            window.closeStartChargingModal();
            
            // Navigate to active session page (locked - user must stop charging to leave)
            // Wait a bit longer to ensure session is created and available
            setTimeout(async () => {
                try {
                    const { loadActiveSession } = await import('./active-session.js');
                    await loadActiveSession();
                } catch (error) {
                    console.error('[Start Charging] Error loading active session:', error);
                    // Retry after another delay
                    setTimeout(async () => {
                        const { loadActiveSession } = await import('./active-session.js');
                        await loadActiveSession();
                    }, 2000);
                }
            }, 1500); // Increased delay to 1.5 seconds
        } else {
            showError(response.error || 'Failed to start charging');
            // Reset button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            }
        }
    } catch (error) {
        console.error('Error starting charging:', error);
        showError(error.message || 'Failed to start charging');
        // Reset button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
};

// Stop charging
window.stopCharging = async function(chargingPointId, deviceId, connectorId, transactionId) {
    // Use custom confirmation modal if available, otherwise use browser confirm
    const confirmed = window.showConfirmModal 
        ? await window.showConfirmModal('Stop Charging', 'Are you sure you want to stop charging? Any unused amount will be refunded to your wallet.')
        : confirm('Are you sure you want to stop charging?');
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Call API to stop charging
        const response = await stopCharging(deviceId, connectorId, transactionId);
        
        if (response.success) {
            let message = 'Charging stopped successfully';
            if (response.session && response.session.refundAmount > 0) {
                message += `. Refund: ₹${response.session.refundAmount.toFixed(2)}`;
            }
            showSuccess(message);
            
            // Navigate back - check if we came from station detail or dashboard
            setTimeout(async () => {
                try {
                    // Check if we have station info in session storage (set when navigating from station detail)
                    const lastStationId = sessionStorage.getItem('lastStationId');
                    const lastStationName = sessionStorage.getItem('lastStationName');
                    
                    if (lastStationId) {
                        // Reload station detail page
                        const { loadStationDetail } = await import('./station-detail.js');
                        await loadStationDetail(lastStationId, lastStationName);
                    } else {
                        // Navigate to dashboard
                        const { loadDashboard } = await import('./dashboard.js');
                        await loadDashboard();
                    }
                } catch (error) {
                    // If navigation fails, try to reload current page
                    window.location.reload();
                }
            }, 1000);
        } else {
            showError(response.error || 'Failed to stop charging');
        }
    } catch (error) {
        console.error('Error stopping charging:', error);
        showError(error.message || 'Failed to stop charging');
    }
};

