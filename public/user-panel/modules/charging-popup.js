// Start Charging Popup Module
import { startCharging } from '../services/api.js';
import { showSuccess, showError } from '../../utils/notifications.js';

// Show start charging popup
window.showStartChargingPopup = function(chargingPointId, deviceId, deviceName, connectorId, pricePerKwh) {
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
    
    try {
        // TODO: Call API to start charging
        // const response = await startCharging(deviceId, connectorId, amount);
        
        // TEMPORARY: Mock success
        showSuccess(`Charging started! Amount: ₹${amount.toFixed(2)}`);
        window.closeStartChargingModal();
        
        // Navigate to active session page (locked - user must stop charging to leave)
        setTimeout(async () => {
            const { loadActiveSession } = await import('./active-session.js');
            await loadActiveSession();
        }, 500);
    } catch (error) {
        console.error('Error starting charging:', error);
        showError(error.message || 'Failed to start charging');
    }
};

// Stop charging
window.stopCharging = async function(chargingPointId, deviceId, connectorId, transactionId) {
    if (!confirm('Are you sure you want to stop charging?')) {
        return;
    }
    
    try {
        // TODO: Call API to stop charging
        // const response = await stopCharging(deviceId, connectorId, transactionId);
        
        // TEMPORARY: Mock success
        showSuccess('Charging stopped successfully');
        
        // Reload current view to update charger status
        setTimeout(() => {
            const appMain = document.getElementById('appMain');
            if (appMain) {
                // Check if we're on charger detail page
                const chargerDetailBackBtn = appMain.querySelector('button[onclick*="goBackToStationDetail"]');
                if (chargerDetailBackBtn) {
                    // We're on charger detail page, reload it
                    window.location.reload();
                } else {
                    // Check if we're on station detail page
                    const stationDetailBackBtn = appMain.querySelector('button[onclick*="loadStationsModule"]');
                    if (stationDetailBackBtn) {
                        // We're on station detail view, reload it
                        window.location.reload();
                    } else {
                        // Go back to stations list
                        window.loadStationsModule();
                    }
                }
            }
        }, 1000);
    } catch (error) {
        console.error('Error stopping charging:', error);
        showError(error.message || 'Failed to stop charging');
    }
};

