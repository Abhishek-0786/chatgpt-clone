// Wallet Module
import { updateActiveNav, updatePageTitle, updateWalletBalance } from '../app.js';
import { getWalletBalance, getWalletTransactions, createTopupOrder, verifyTopupPayment, getCurrentUserProfile, getCurrentUser } from '../services/api.js';
import { showError, showSuccess } from '../../utils/notifications.js';

export async function loadWalletModule() {
    updateActiveNav('wallet');
    updatePageTitle('Wallet');
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch wallet balance and transactions from API
        const [balanceResponse, transactionsResponse] = await Promise.all([
            getWalletBalance(),
            getWalletTransactions({ limit: 20 })
        ]);
        
        const balance = balanceResponse.success ? balanceResponse.balance : 0;
        const transactions = transactionsResponse.success ? transactionsResponse.transactions : [];
        
        // Update wallet balance in header
        updateWalletBalance(balance);
        
        appMain.innerHTML = `
            <!-- Wallet Balance Card -->
            <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <div style="text-align: center;">
                    <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Total Balance</div>
                    <div style="font-size: 48px; font-weight: 700; margin-bottom: 16px;">
                        ₹${parseFloat(balance || 0).toFixed(2)}
                    </div>
                    <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);" onclick="window.showTopUpModal()">
                        <i class="fas fa-plus"></i> Top Up Wallet
                    </button>
                </div>
            </div>
            
            <!-- Quick Top-up Amounts -->
            <div class="card">
                <h3 class="card-title">Quick Top-up</h3>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                    <button class="btn btn-outline" onclick="window.topUpAmount(100)">₹100</button>
                    <button class="btn btn-outline" onclick="window.topUpAmount(500)">₹500</button>
                    <button class="btn btn-outline" onclick="window.topUpAmount(1000)">₹1000</button>
                </div>
            </div>
            
            <!-- Transaction History -->
            <div class="card">
                <h3 class="card-title">Transaction History</h3>
                <div id="transactionsList">
                    ${transactions.length > 0 ? transactions.map(txn => `
                        <div style="padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-weight: 600; margin-bottom: 4px;">${txn.description || 'Transaction'}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${formatDate(txn.createdAt)}</div>
                                    ${txn.status === 'pending' ? `<span class="badge badge-warning" style="font-size: 10px; margin-top: 4px;">Pending</span>` : ''}
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 18px; font-weight: 600; color: ${txn.transactionType === 'credit' ? 'var(--success-color)' : 'var(--danger-color)'};">
                                        ${txn.transactionType === 'credit' ? '+' : '-'}₹${parseFloat(txn.amount || 0).toFixed(2)}
                                    </div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">Balance: ₹${parseFloat(txn.balanceAfter || 0).toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                    `).join('') : `
                        <div class="empty-state" style="padding: 40px 20px;">
                            <i class="fas fa-wallet"></i>
                            <p>No transactions yet</p>
                        </div>
                    `}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading wallet:', error);
        showError('Failed to load wallet');
        appMain.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Wallet</h3>
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
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show top up modal
window.showTopUpModal = function() {
    const modal = document.getElementById('topUpWalletModal');
    const form = document.getElementById('topUpWalletForm');
    const customAmountInput = document.getElementById('customAmountInput');
    const payNowBtn = document.getElementById('payNowBtn');
    const payNowText = document.getElementById('payNowText');
    const payNowLoader = document.getElementById('payNowLoader');
    
    if (modal && form && customAmountInput) {
        // Reset form
        form.reset();
        customAmountInput.value = '';
        
        // Reset button state
        if (payNowBtn && payNowText && payNowLoader) {
            payNowBtn.disabled = false;
            payNowText.style.display = 'flex';
            payNowLoader.style.display = 'none';
            customAmountInput.disabled = false;
        }
        
        // Reset quick amount buttons
        document.querySelectorAll('.quick-amount-btn').forEach(btn => {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
        });
        
        modal.style.display = 'flex';
    }
};

// Close top up modal
window.closeTopUpModal = function() {
    const modal = document.getElementById('topUpWalletModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Select quick amount
window.selectQuickAmount = function(amount) {
    const customAmountInput = document.getElementById('customAmountInput');
    const quickAmountBtns = document.querySelectorAll('.quick-amount-btn');
    
    if (customAmountInput) {
        customAmountInput.value = amount;
    }
    
    // Update button states
    quickAmountBtns.forEach(btn => {
        if (parseInt(btn.dataset.amount) === amount) {
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-primary');
        } else {
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-outline');
        }
    });
};

// Update custom amount (clear quick amount selection)
window.updateCustomAmount = function() {
    const customAmountInput = document.getElementById('customAmountInput');
    const quickAmountBtns = document.querySelectorAll('.quick-amount-btn');
    
    // Clear quick amount selection when user types custom amount
    quickAmountBtns.forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-outline');
    });
};

// Handle top up form submit
window.handleTopUpSubmit = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const amount = parseFloat(formData.get('amount') || document.getElementById('customAmountInput').value);
    
    if (!amount || amount < 1) {
        showError('Please enter a valid amount (minimum ₹1.00)');
        return;
    }
    
    // Get button elements
    const payNowBtn = document.getElementById('payNowBtn');
    const payNowText = document.getElementById('payNowText');
    const payNowLoader = document.getElementById('payNowLoader');
    const customAmountInput = document.getElementById('customAmountInput');
    
    // Show loading state
    if (payNowBtn && payNowText && payNowLoader) {
        payNowBtn.disabled = true;
        payNowText.style.display = 'none';
        payNowLoader.style.display = 'flex';
        if (customAmountInput) customAmountInput.disabled = true;
    }
    
    try {
        // Create Razorpay order
        const orderResponse = await createTopupOrder(amount);
        
        if (!orderResponse.success || !orderResponse.order) {
            showError(orderResponse.error || 'Failed to create payment order');
            // Reset button state on error
            if (payNowBtn && payNowText && payNowLoader) {
                payNowBtn.disabled = false;
                payNowText.style.display = 'flex';
                payNowLoader.style.display = 'none';
                if (customAmountInput) customAmountInput.disabled = false;
            }
            return;
        }
        
        const { order, key } = orderResponse;
        
        // Get customer details for prefill
        let customerPhone = null;
        let customerEmail = null;
        let customerName = null;
        
        try {
            // Try to get from localStorage first (faster)
            const currentUser = getCurrentUser();
            if (currentUser && currentUser.phone) {
                customerPhone = currentUser.phone;
                customerEmail = currentUser.email;
                customerName = currentUser.fullName;
            } else {
                // Fallback to API call
                const userResponse = await getCurrentUserProfile();
                if (userResponse.success && userResponse.user) {
                    customerPhone = userResponse.user.phone;
                    customerEmail = userResponse.user.email;
                    customerName = userResponse.user.fullName;
                }
            }
        } catch (error) {
            console.error('Error fetching user details for Razorpay prefill:', error);
            // Continue without prefill if there's an error
        }
        
        // Format phone number for Razorpay (remove +91 if present, keep only digits)
        let formattedPhone = null;
        if (customerPhone) {
            // Remove all non-digit characters except + at the start
            formattedPhone = customerPhone.replace(/[^\d+]/g, '');
            // Remove +91 prefix if present (Razorpay expects just the number)
            if (formattedPhone.startsWith('+91')) {
                formattedPhone = formattedPhone.substring(3);
            } else if (formattedPhone.startsWith('91') && formattedPhone.length > 10) {
                formattedPhone = formattedPhone.substring(2);
            }
            // Ensure it's exactly 10 digits
            if (formattedPhone.length === 10) {
                formattedPhone = formattedPhone;
            } else {
                formattedPhone = null; // Invalid format, don't prefill
            }
        }
        
        // Initialize Razorpay Checkout
        const options = {
            key: key,
            amount: order.amount, // Amount in paise
            currency: order.currency,
            name: 'GenX EV Charging',
            description: `Wallet Top-up - ₹${amount}`,
            order_id: order.id,
            handler: async function(response) {
                // Payment successful - verify payment
                try {
                    // Show loading again for verification
                    if (payNowBtn && payNowText && payNowLoader) {
                        payNowBtn.disabled = true;
                        payNowText.style.display = 'none';
                        payNowLoader.style.display = 'flex';
                    }
                    
                    const verifyResponse = await verifyTopupPayment({
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_signature: response.razorpay_signature
                    });
                    
                    // Reset button state
                    if (payNowBtn && payNowText && payNowLoader) {
                        payNowBtn.disabled = false;
                        payNowText.style.display = 'flex';
                        payNowLoader.style.display = 'none';
                        if (customAmountInput) customAmountInput.disabled = false;
                    }
                    
                    if (verifyResponse.success) {
                        showSuccess('Payment successful! Wallet updated.');
                        window.closeTopUpModal();
                        
                        // Reload wallet module to show updated balance
                        const { loadWalletModule } = await import('./wallet.js');
                        await loadWalletModule();
                        
                        // Also update dashboard if on dashboard
                        if (document.getElementById('appMain').querySelector('.dashboard-container')) {
                            const { loadDashboard } = await import('./dashboard.js');
                            await loadDashboard();
                        }
                    } else {
                        showError(verifyResponse.error || 'Payment verification failed');
                    }
                } catch (error) {
                    console.error('Error verifying payment:', error);
                    showError('Failed to verify payment. Please contact support.');
                    // Reset button state on error
                    if (payNowBtn && payNowText && payNowLoader) {
                        payNowBtn.disabled = false;
                        payNowText.style.display = 'flex';
                        payNowLoader.style.display = 'none';
                        if (customAmountInput) customAmountInput.disabled = false;
                    }
                }
            },
            prefill: {
                contact: formattedPhone || undefined,
                email: customerEmail || undefined,
                name: customerName || undefined
            },
            theme: {
                color: '#dc3545'
            },
            modal: {
                ondismiss: function() {
                    // User closed the payment modal - reset button state
                    if (payNowBtn && payNowText && payNowLoader) {
                        payNowBtn.disabled = false;
                        payNowText.style.display = 'flex';
                        payNowLoader.style.display = 'none';
                        if (customAmountInput) customAmountInput.disabled = false;
                    }
                    console.log('Payment cancelled by user');
                }
            }
        };
        
        const razorpay = new Razorpay(options);
        razorpay.open();
        
    } catch (error) {
        console.error('Error processing top-up:', error);
        showError(error.message || 'Failed to process top-up');
        // Reset button state on error
        if (payNowBtn && payNowText && payNowLoader) {
            payNowBtn.disabled = false;
            payNowText.style.display = 'flex';
            payNowLoader.style.display = 'none';
            if (customAmountInput) customAmountInput.disabled = false;
        }
    }
};

// Top up amount (for quick buttons on wallet page)
window.topUpAmount = function(amount) {
    window.showTopUpModal();
    // Set the amount after a small delay to ensure modal is open
    setTimeout(() => {
        window.selectQuickAmount(amount);
    }, 100);
};

