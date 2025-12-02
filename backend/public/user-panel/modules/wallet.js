// Wallet Module
import { updateActiveNav, updatePageTitle, updateWalletBalance } from '../app.js';
import { getWalletBalance, getWalletTransactions, createTopupOrder, verifyTopupPayment, recordFailedPayment, getCurrentUserProfile, getCurrentUser } from '../services/api.js';
import { showError, showSuccess } from '../../utils/notifications.js';

// Infinite scroll state
let walletTransactionsPage = 1;
let walletTransactionsLoading = false;
let walletTransactionsHasMore = true;
let walletTransactionsObserver = null;

export async function loadWalletModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'wallet');
    
    updateActiveNav('wallet');
    updatePageTitle('Wallet');
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Reset infinite scroll state
        walletTransactionsPage = 1;
        walletTransactionsLoading = false;
        walletTransactionsHasMore = true;
        
        // Fetch wallet balance
        const balanceResponse = await getWalletBalance();
        const balance = balanceResponse.success ? balanceResponse.balance : 0;
        
        // Update wallet balance in header
        updateWalletBalance(balance);
        
        appMain.innerHTML = `
            <style>
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                .wallet-balance-card {
                    position: relative;
                    overflow: hidden;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 16px;
                    padding: 24px 20px;
                    color: white;
                    margin-bottom: 20px;
                    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
                }
                .wallet-balance-card::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    right: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                    animation: pulse 3s ease-in-out infinite;
                }
                .wallet-balance-card::after {
                    content: '';
                    position: absolute;
                    bottom: -20px;
                    left: -20px;
                    width: 80px;
                    height: 80px;
                    background: rgba(255,255,255,0.1);
                    border-radius: 50%;
                    animation: float 6s ease-in-out infinite;
                }
                .balance-content {
                    position: relative;
                    z-index: 1;
                    text-align: center;
                }
                .balance-label {
                    font-size: 12px;
                    opacity: 0.95;
                    margin-bottom: 8px;
                    font-weight: 500;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                }
                .balance-amount {
                    font-size: 36px;
                    font-weight: 700;
                    margin-bottom: 16px;
                    word-break: break-word;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    letter-spacing: -1px;
                }
                .top-up-btn {
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 12px;
                    font-weight: 700;
                    font-size: 15px;
                    transition: all 0.3s ease;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                }
                .top-up-btn:hover {
                    background: rgba(255,255,255,0.95);
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(0,0,0,0.25);
                }
                .top-up-btn:active {
                    transform: translateY(0);
                }
                .quick-topup-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                .quick-topup-title {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 16px;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .quick-topup-title::before {
                    content: '';
                    width: 4px;
                    height: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 2px;
                }
                .quick-amount-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                }
                .quick-amount-btn {
                    padding: 14px 12px;
                    border: 2px solid #e0e0e0;
                    border-radius: 12px;
                    background: white;
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--text-primary);
                    transition: all 0.2s ease;
                    cursor: pointer;
                }
                .quick-amount-btn:hover {
                    border-color: var(--primary-color);
                    background: rgba(220, 38, 69, 0.05);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(220, 38, 69, 0.15);
                }
                .quick-amount-btn.active {
                    border-color: var(--primary-color);
                    background: var(--primary-color);
                    color: white;
                    box-shadow: 0 4px 12px rgba(220, 38, 69, 0.3);
                }
                .transactions-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }
                .transactions-title {
                    font-size: 16px;
                    font-weight: 600;
                    margin-bottom: 16px;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .transactions-title::before {
                    content: '';
                    width: 4px;
                    height: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 2px;
                }
                .transaction-item {
                    padding: 12px 0;
                    border-bottom: 1px solid #f0f0f0;
                    transition: background-color 0.2s;
                }
                .transaction-item:last-child {
                    border-bottom: none;
                }
                .transaction-item:hover {
                    background-color: #fafafa;
                    margin: 0 -20px;
                    padding: 12px 20px;
                    border-radius: 8px;
                }
                .transaction-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    flex-shrink: 0;
                }
                .transaction-icon.credit {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                }
                .transaction-icon.debit {
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                }
                .transaction-icon.refund {
                    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                    color: white;
                }
                .transaction-details {
                    flex: 1;
                    min-width: 0;
                    margin-left: 10px;
                    overflow: hidden;
                }
                .transaction-description {
                    font-weight: 600;
                    font-size: 14px;
                    margin-bottom: 4px;
                    color: var(--text-primary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    line-height: 1.3;
                }
                .transaction-date {
                    font-size: 11px;
                    color: var(--text-secondary);
                    margin-bottom: 2px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .transaction-balance {
                    font-size: 11px;
                    color: var(--text-secondary);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .transaction-amount {
                    text-align: right;
                    flex-shrink: 0;
                    margin-left: 8px;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-end;
                }
                .transaction-amount-value {
                    font-size: 16px;
                    font-weight: 700;
                    margin-bottom: 4px;
                    white-space: nowrap;
                }
                .transaction-amount-balance {
                    font-size: 11px;
                    color: var(--text-secondary);
                    white-space: nowrap;
                }
                .transaction-item {
                    cursor: pointer;
                }
                .transaction-amount-value.credit {
                    color: #10b981;
                }
                .transaction-amount-value.debit {
                    color: #ef4444;
                }
                .transaction-amount-value.refund {
                    color: #3b82f6;
                }
            </style>
            <div style="max-width: 100%; overflow-x: hidden; padding-bottom: 20px;">
                <!-- Wallet Balance Card -->
                <div class="wallet-balance-card">
                    <div class="balance-content">
                        <div class="balance-label">Total Balance</div>
                        <div class="balance-amount">₹${parseFloat(balance || 0).toFixed(2)}</div>
                        <button class="top-up-btn" onclick="window.showTopUpModal()">
                            <i class="fas fa-plus"></i> Top Up Wallet
                        </button>
                    </div>
                </div>
                
                <!-- Quick Top-up Amounts -->
                <div class="quick-topup-card">
                    <div class="quick-topup-title">
                        <i class="fas fa-bolt" style="color: #667eea;"></i>
                        Quick Top-up
                    </div>
                    <div class="quick-amount-grid">
                        <button class="quick-amount-btn" onclick="window.topUpAmount(100)">₹100</button>
                        <button class="quick-amount-btn" onclick="window.topUpAmount(500)">₹500</button>
                        <button class="quick-amount-btn" onclick="window.topUpAmount(1000)">₹1000</button>
                    </div>
                </div>
                
                <!-- Transaction History -->
                <div class="transactions-card">
                    <div class="transactions-title">
                        <i class="fas fa-history" style="color: #667eea;"></i>
                        Transaction History
                    </div>
                    <div id="transactionsList" style="max-width: 100%; overflow-x: hidden;">
                        <div class="spinner"></div>
                    </div>
                    <!-- Sentinel element for infinite scroll (always visible) -->
                    <div id="walletScrollSentinel" style="height: 20px;"></div>
                    <!-- Loading indicator for infinite scroll -->
                    <div id="walletLoadingIndicator" style="display: none; text-align: center; padding: 16px; color: var(--text-secondary); font-size: 12px;">
                        <div class="spinner"></div>
                        <p style="margin-top: 10px;">Loading more transactions...</p>
                    </div>
                    <!-- End of list indicator -->
                    <div id="walletEndIndicator" style="display: none; text-align: center; padding: 16px; color: var(--text-secondary); font-size: 12px;">
                        <i class="fas fa-check-circle"></i> All transactions loaded
                    </div>
                </div>
            </div>
        `;
        
        // Load initial transactions
        await loadWalletTransactions();
        
        // Setup infinite scroll observer
        setupWalletInfiniteScroll();
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

// Load wallet transactions with pagination
async function loadWalletTransactions() {
    if (walletTransactionsLoading || !walletTransactionsHasMore) {
        return;
    }
    
    walletTransactionsLoading = true;
    const loadingIndicator = document.getElementById('walletLoadingIndicator');
    const transactionsList = document.getElementById('transactionsList');
    
    try {
        if (walletTransactionsPage === 1) {
            transactionsList.innerHTML = '<div class="spinner"></div>';
        } else if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
        }
        
        const response = await getWalletTransactions({ 
            page: walletTransactionsPage, 
            limit: 20 
        });
        
        if (!response.success) {
            throw new Error(response.error || 'Failed to load transactions');
        }
        
        const transactions = response.transactions || [];
        const pagination = response.pagination || {};
        const totalPages = pagination.totalPages || 1;
        const hasMore = walletTransactionsPage < totalPages;
        
        if (transactions.length === 0 && walletTransactionsPage === 1) {
            transactionsList.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px;">
                    <i class="fas fa-wallet"></i>
                    <p>No transactions yet</p>
                </div>
            `;
            walletTransactionsHasMore = false;
            const endIndicator = document.getElementById('walletEndIndicator');
            if (endIndicator) endIndicator.style.display = 'none';
            return;
        }
        
        // Remove spinner on first load
        if (walletTransactionsPage === 1) {
            transactionsList.innerHTML = '';
        }
        
        // Append new transactions
        const transactionsHTML = transactions.map(txn => {
            // Truncate long descriptions to prevent overflow
            let description = txn.description || 'Transaction';
            // Keep description short for compact display
            if (description.length > 35) {
                description = description.substring(0, 32) + '...';
            }
            
            // Determine transaction type and icon
            const isCredit = txn.transactionType === 'credit' || txn.transactionType === 'refund';
            const isRefund = txn.transactionType === 'refund';
            const transactionClass = isRefund ? 'refund' : (isCredit ? 'credit' : 'debit');
            
            // Get icon based on transaction type
            let icon = 'fa-wallet';
            if (isRefund) {
                icon = 'fa-undo';
            } else if (isCredit) {
                icon = 'fa-arrow-down';
            } else {
                icon = 'fa-arrow-up';
            }
            
            // Determine status badge and styling
            let statusBadge = '';
            let amountClass = transactionClass;
            
            if (txn.status === 'pending') {
                statusBadge = '<span class="badge badge-warning" style="font-size: 9px; padding: 2px 6px; margin-top: 4px; display: inline-block; border-radius: 4px;">Pending</span>';
                amountClass = 'pending';
            } else if (txn.status === 'failed') {
                statusBadge = '<span class="badge badge-danger" style="font-size: 9px; padding: 2px 6px; margin-top: 4px; display: inline-block; border-radius: 4px;">Failed</span>';
                amountClass = 'failed';
            }
            
            const amountPrefix = txn.status === 'failed' ? '' : (isCredit ? '+' : '-');
            const amountValue = `₹${parseFloat(txn.amount || 0).toFixed(2)}`;
            const balanceText = txn.status !== 'failed' 
                ? `₹${parseFloat(txn.balanceAfter || 0).toFixed(2)}`
                : 'Not processed';
            
            // Format date more compactly
            const dateStr = formatDate(txn.createdAt);
            
            // Store transaction data in data attribute for easy access
            const transactionData = JSON.stringify({
                id: txn.id,
                description: txn.description,
                transactionType: txn.transactionType,
                amount: txn.amount,
                status: txn.status,
                balanceAfter: txn.balanceAfter,
                createdAt: txn.createdAt,
                transactionId: txn.transactionId,
                orderId: txn.orderId,
                error: txn.error
            });
            // Escape HTML entities for safe attribute usage
            const escapedData = transactionData.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            
            return `
            <div class="transaction-item" data-transaction="${escapedData}" onclick="window.showTransactionDetailsFromElement(this)" style="${txn.status === 'failed' ? 'opacity: 0.6;' : ''}">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="transaction-icon ${transactionClass}">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="transaction-details">
                        <div class="transaction-description" title="${txn.description || 'Transaction'}">${description}</div>
                        <div class="transaction-date" style="margin-top: 2px;">${dateStr}</div>
                        ${statusBadge}
                    </div>
                    <div class="transaction-amount">
                        <div class="transaction-amount-value ${amountClass}" style="color: ${txn.status === 'failed' ? 'var(--text-secondary)' : (amountClass === 'credit' ? '#10b981' : amountClass === 'refund' ? '#3b82f6' : '#ef4444')};">
                            ${amountPrefix}${amountValue}
                        </div>
                        <div class="transaction-amount-balance">${balanceText}</div>
                    </div>
                </div>
            </div>
        `;
        }).join('');
        
        transactionsList.insertAdjacentHTML('beforeend', transactionsHTML);
        
        walletTransactionsPage++;
        walletTransactionsHasMore = hasMore;
        
        // Show/hide end indicator
        const endIndicator = document.getElementById('walletEndIndicator');
        if (!hasMore && transactions.length > 0) {
            if (endIndicator) endIndicator.style.display = 'block';
        } else {
            if (endIndicator) endIndicator.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading wallet transactions:', error);
        showError('Failed to load transactions');
        if (walletTransactionsPage === 1) {
            transactionsList.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px;">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Failed to load transactions</p>
                </div>
            `;
        }
    } finally {
        walletTransactionsLoading = false;
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

// Setup infinite scroll observer
function setupWalletInfiniteScroll() {
    // Clean up existing observer
    if (walletTransactionsObserver) {
        walletTransactionsObserver.disconnect();
    }
    
    // Create intersection observer
    walletTransactionsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && walletTransactionsHasMore && !walletTransactionsLoading) {
                console.log('Loading more wallet transactions...', { currentPage: walletTransactionsPage, hasMore: walletTransactionsHasMore });
                loadWalletTransactions();
            }
        });
    }, {
        root: null,
        rootMargin: '100px', // Start loading 100px before reaching bottom
        threshold: 0.1
    });
    
    // Observe the sentinel element (always visible, better for infinite scroll)
    const sentinel = document.getElementById('walletScrollSentinel');
    if (sentinel) {
        walletTransactionsObserver.observe(sentinel);
        console.log('Wallet infinite scroll observer set up');
    } else {
        console.error('Wallet sentinel element not found for infinite scroll');
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
        
        // Store order ID for tracking failed attempts
        const currentOrderId = order.id;
        let paymentAttempted = false;
        let paymentSucceeded = false;
        let paymentVerificationInProgress = false; // Track if verification is happening
        let paymentHandlerCalled = false; // Track if handler was called (payment succeeded in Razorpay)
        
        // Initialize Razorpay Checkout
        const options = {
            key: key,
            amount: order.amount, // Amount in paise
            currency: order.currency,
            name: 'GenX EV Charging',
            description: `Wallet Top-up - ₹${amount}`,
            order_id: order.id,
            handler: async function(response) {
                // Mark that payment succeeded in Razorpay
                paymentHandlerCalled = true;
                paymentSucceeded = true;
                paymentVerificationInProgress = true;
                
                console.log('[Razorpay Handler] Payment succeeded, starting verification...', {
                    orderId: response.razorpay_order_id,
                    paymentId: response.razorpay_payment_id
                });
                
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
                    
                    console.log('[Razorpay Handler] Verification response:', verifyResponse);
                    
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
                        // Payment verification failed - DO NOT mark as failed because payment succeeded in Razorpay
                        // The money will be captured by Razorpay, we need to contact support
                        paymentSucceeded = false;
                        console.error('[Razorpay Handler] Verification failed:', verifyResponse.error);
                        console.error('[Razorpay Handler] Payment succeeded in Razorpay but verification failed. Payment ID:', response.razorpay_payment_id);
                        showError('Payment received but verification failed. Please contact support with payment ID: ' + response.razorpay_payment_id);
                        // DO NOT record as failed - payment was captured by Razorpay
                    }
                } catch (error) {
                    // Payment verification error - DO NOT mark as failed because payment succeeded in Razorpay
                    paymentSucceeded = false;
                    console.error('[Razorpay Handler] Error verifying payment:', error);
                    console.error('[Razorpay Handler] Payment ID:', response.razorpay_payment_id);
                    showError('Payment received but verification failed. Please contact support with payment ID: ' + response.razorpay_payment_id);
                    // DO NOT record as failed - payment was captured by Razorpay
                    // Reset button state on error
                    if (payNowBtn && payNowText && payNowLoader) {
                        payNowBtn.disabled = false;
                        payNowText.style.display = 'flex';
                        payNowLoader.style.display = 'none';
                        if (customAmountInput) customAmountInput.disabled = false;
                    }
                } finally {
                    paymentVerificationInProgress = false;
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
                ondismiss: async function() {
                    const modalClosedAt = Date.now();
                    const modalOpenDuration = modalClosedAt - modalOpenTime;
                    
                    console.log('[Razorpay Modal] ondismiss called', { 
                        paymentAttempted, 
                        paymentSucceeded, 
                        paymentHandlerCalled,
                        paymentVerificationInProgress,
                        modalOpenDuration: `${modalOpenDuration}ms`
                    });
                    
                    // If modal was open for less than 1 second, user just closed it immediately
                    // Don't record as failed (user didn't attempt payment)
                    if (modalOpenDuration < 1000) {
                        console.log('[Razorpay Modal] Modal closed too quickly (<1s), user did not attempt payment');
                        return;
                    }
                    
                    // Wait to see if payment handler is being called
                    // This prevents race condition where ondismiss is called before handler
                    console.log('[Razorpay Modal] Waiting 3 seconds to check if payment succeeded...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Only record as failed if handler was NOT called
                    // If handler was called, payment succeeded in Razorpay (even if verification fails)
                    if (!paymentHandlerCalled && !paymentSucceeded && !paymentVerificationInProgress) {
                        // Double-check: wait a bit more to ensure handler isn't still processing
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // Final check after waiting
                        if (!paymentHandlerCalled && !paymentSucceeded && !paymentVerificationInProgress) {
                            console.log('[Razorpay Modal] Recording payment as failed after ${modalOpenDuration}ms');
                            try {
                                await recordFailedPayment(currentOrderId, 'Payment attempt failed or cancelled');
                                console.log('[Razorpay Modal] Failed payment attempt recorded from ondismiss');
                            } catch (error) {
                                console.error('Error recording failed payment:', error);
                            }
                        } else {
                            console.log('[Razorpay Modal] Payment handler was called during wait, not recording as failed');
                        }
                    } else {
                        console.log('[Razorpay Modal] Not recording failed payment:', { 
                            paymentHandlerCalled,
                            paymentSucceeded, 
                            paymentVerificationInProgress 
                        });
                    }
                    
                    // Reset button state
                    if (payNowBtn && payNowText && payNowLoader) {
                        payNowBtn.disabled = false;
                        payNowText.style.display = 'flex';
                        payNowLoader.style.display = 'none';
                        if (customAmountInput) customAmountInput.disabled = false;
                    }
                }
            }
        };
        
        const razorpay = new Razorpay(options);
        
        // Track when user actually attempts payment (not just opens modal)
        // Set a timeout to detect if user interacts with payment options
        const modalOpenTime = Date.now();
        let checkPaymentAttempt = setInterval(() => {
            // If modal has been open for more than 2 seconds, assume user is attempting payment
            if (Date.now() - modalOpenTime > 2000) {
                paymentAttempted = true;
                clearInterval(checkPaymentAttempt);
                console.log('[Razorpay Modal] Payment attempt detected (modal open for 2+ seconds)');
            }
        }, 500);
        
        // Listen for Razorpay payment failed event
        // When this fires, we know the user definitely attempted payment
        razorpay.on('payment.failed', async function(response) {
            paymentAttempted = true; // User definitely attempted payment
            clearInterval(checkPaymentAttempt);
            console.log('[Razorpay Event] payment.failed event:', response);
            console.log('[Razorpay Event] Payment attempt confirmed - waiting for ondismiss to record failure');
            // Don't record as failed here - wait for ondismiss to confirm handler wasn't called
        });
        
        razorpay.open();
        
        // Clear interval when modal is closed (handled in ondismiss)
        setTimeout(() => {
            clearInterval(checkPaymentAttempt);
        }, 300000); // Clear after 5 minutes max
        
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

// Show transaction details page - smooth navigation without reload
window.showTransactionDetailsFromElement = async function(element) {
    try {
        // Get transaction data from data attribute
        const transactionDataString = element.getAttribute('data-transaction');
        
        if (!transactionDataString) {
            showError('Transaction data not available');
            return;
        }
        
        // Unescape HTML entities and parse transaction data
        const unescapedData = transactionDataString.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        const transaction = JSON.parse(unescapedData);
        
        if (!transaction) {
            showError('Transaction data not available');
            return;
        }
        
        // Store transaction data in sessionStorage
        sessionStorage.setItem('transactionDetail', JSON.stringify(transaction));
        sessionStorage.setItem('lastPage', 'transaction-detail');
        
        // Navigate instantly without page reload - use pushState for smooth navigation
        window.history.pushState({ page: 'transaction-detail' }, '', '?page=transaction-detail');
        
        // Scroll to top first
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        // Load the transaction detail page immediately without reload
        await loadTransactionDetailPage();
        
    } catch (error) {
        console.error('Error showing transaction details:', error);
        showError('Failed to load transaction details: ' + error.message);
    }
};

// Go back to wallet page
window.goBackToWallet = async function() {
    sessionStorage.setItem('lastPage', 'wallet');
    window.history.pushState({ page: 'wallet' }, '', '?page=wallet');
    await loadWalletModule();
};

// Load transaction details page
export async function loadTransactionDetailPage() {
    try {
        // Get transaction data from sessionStorage
        const transactionDataString = sessionStorage.getItem('transactionDetail');
        
        if (!transactionDataString) {
            showError('Transaction data not found');
            // Redirect back to wallet
            sessionStorage.setItem('lastPage', 'wallet');
            window.location.href = '?page=wallet';
            return;
        }
        
        const transaction = JSON.parse(transactionDataString);
        
        if (!transaction) {
            showError('Invalid transaction data');
            sessionStorage.setItem('lastPage', 'wallet');
            window.location.href = '?page=wallet';
            return;
        }
        
        // Determine transaction type and styling
        const isCredit = transaction.transactionType === 'credit' || transaction.transactionType === 'refund';
        const isRefund = transaction.transactionType === 'refund';
        const transactionClass = isRefund ? 'refund' : (isCredit ? 'credit' : 'debit');
        
        // Get icon based on transaction type
        let icon = 'fa-wallet';
        let iconColor = '#667eea';
        if (isRefund) {
            icon = 'fa-undo';
            iconColor = '#3b82f6';
        } else if (isCredit) {
            icon = 'fa-arrow-down';
            iconColor = '#10b981';
        } else {
            icon = 'fa-arrow-up';
            iconColor = '#ef4444';
        }
        
        const amountPrefix = transaction.status === 'failed' ? '' : (isCredit ? '+' : '-');
        const amountValue = `₹${parseFloat(transaction.amount || 0).toFixed(2)}`;
        const amountColor = transaction.status === 'failed' ? 'var(--text-secondary)' : (transactionClass === 'credit' ? '#10b981' : transactionClass === 'refund' ? '#3b82f6' : '#ef4444');
        
        // Escape HTML in description and other text fields
        const escapeHtml = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        };
        
        // Get status badge styling
        let statusBadgeClass = '';
        let statusBadgeColor = '';
        if (transaction.status === 'completed') {
            statusBadgeClass = 'badge-success';
            statusBadgeColor = '#10b981';
        } else if (transaction.status === 'pending') {
            statusBadgeClass = 'badge-warning';
            statusBadgeColor = '#f59e0b';
        } else if (transaction.status === 'failed') {
            statusBadgeClass = 'badge-danger';
            statusBadgeColor = '#ef4444';
        }
        
        // Create gradient for header based on transaction type
        const headerGradient = isRefund 
            ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
            : isCredit 
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        
        // Update page title and navigation
        updateActiveNav('wallet');
        updatePageTitle('Transaction Details');
        
        // Refresh wallet balance
        const balanceResponse = await getWalletBalance();
        if (balanceResponse.success) {
            updateWalletBalance(balanceResponse.balance);
        }
        
        const appMain = document.getElementById('appMain');
        
        // Scroll to top immediately
        window.scrollTo({ top: 0, behavior: 'instant' });
        
        // Create full page HTML with compact design and matching widths
        const pageHTML = `
            <div style="min-height: 100vh; background: #f5f7fa; padding-bottom: 80px;">
                <!-- Header with Gradient - Compact like wallet balance card -->
                <div style="background: ${headerGradient}; padding: 20px; position: relative; overflow: hidden; border-radius: 16px; margin: 0px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);">
                    <!-- Decorative circles -->
                    <div style="position: absolute; top: -50%; right: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);"></div>
                    <div style="position: absolute; bottom: -20px; left: -20px; width: 80px; height: 80px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                    
                    <!-- Content Row -->
                    <div style="display: flex; align-items: center; gap: 12px; position: relative; z-index: 1;">
                        <!-- Back button -->
                        <button onclick="window.goBackToWallet()" style="background: rgba(255, 255, 255, 0.2); border: none; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; flex-shrink: 0;" onmouseover="this.style.background='rgba(255, 255, 255, 0.3)'; this.style.transform='scale(1.1)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.2)'; this.style.transform='scale(1)'">
                            <i class="fas fa-arrow-left" style="color: white; font-size: 14px;"></i>
                        </button>
                        
                        <!-- Icon -->
                        <div style="width: 40px; height: 40px; background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);">
                            <i class="fas ${icon}" style="font-size: 20px; color: white;"></i>
                        </div>
                        
                        <!-- Amount and Status -->
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 28px; font-weight: 700; color: white; margin-bottom: 6px; text-shadow: 0 2px 10px rgba(0,0,0,0.2); letter-spacing: -0.5px; line-height: 1.2;">
                                ${amountPrefix}${amountValue}
                            </div>
                            <div style="display: inline-block; background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(10px); padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.3);">
                                <span style="font-size: 10px; font-weight: 600; color: white; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.95;">
                                    ${transaction.status === 'completed' ? '✓ Completed' : transaction.status === 'pending' ? '⏳ Pending' : transaction.status === 'failed' ? '✕ Failed' : transaction.status || 'Unknown'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Content Section -->
                <div style="padding: 0 0px;">
                    <!-- Description Card - White with decorative bubbles -->
                    <div style="position: relative; overflow: hidden; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; margin-bottom: 12px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                        <div style="position: absolute; top: -30px; right: -30px; width: 100px; height: 100px; background: linear-gradient(135deg, ${iconColor}08 0%, ${iconColor}15 100%); border-radius: 50%;"></div>
                        <div style="position: absolute; bottom: -20px; left: -20px; width: 80px; height: 80px; background: linear-gradient(135deg, ${iconColor}08 0%, ${iconColor}15 100%); border-radius: 50%;"></div>
                        <div style="position: relative; z-index: 1; display: flex; align-items: flex-start; gap: 12px;">
                            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, ${iconColor}15 0%, ${iconColor}25 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-file-alt" style="color: ${iconColor}; font-size: 18px;"></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 10px; color: #6c757d; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Description</div>
                                <div style="font-size: 14px; font-weight: 600; color: #212529; line-height: 1.5; word-wrap: break-word;">${escapeHtml(transaction.description || 'Transaction')}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Details Grid -->
                    <div style="display: grid; gap: 12px; margin-bottom: 12px;">
                        <!-- Transaction Type -->
                        <div style="position: relative; overflow: hidden; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                            <div style="position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: linear-gradient(135deg, #667eea08 0%, #667eea15 100%); border-radius: 50%;"></div>
                            <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;">
                                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-tag" style="color: #667eea; font-size: 18px;"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 10px; color: #6c757d; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Type</div>
                                    <div style="font-size: 14px; font-weight: 600; color: #212529; text-transform: capitalize;">${escapeHtml(transaction.transactionType || 'N/A')}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Date & Time -->
                        <div style="position: relative; overflow: hidden; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                            <div style="position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: linear-gradient(135deg, #f59e0b08 0%, #f59e0b15 100%); border-radius: 50%;"></div>
                            <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;">
                                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #f59e0b15 0%, #f59e0b25 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-calendar-alt" style="color: #f59e0b; font-size: 18px;"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 10px; color: #6c757d; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Date & Time</div>
                                    <div style="font-size: 14px; font-weight: 600; color: #212529;">${formatDate(transaction.createdAt)}</div>
                                </div>
                            </div>
                        </div>
                        
                        ${transaction.balanceAfter !== null && transaction.balanceAfter !== undefined ? `
                        <!-- Balance After -->
                        <div style="position: relative; overflow: hidden; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                            <div style="position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: linear-gradient(135deg, #10b98108 0%, #10b98115 100%); border-radius: 50%;"></div>
                            <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;">
                                <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #10b98115 0%, #10b98125 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                    <i class="fas fa-wallet" style="color: #10b981; font-size: 18px;"></i>
                                </div>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 10px; color: #6c757d; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Balance After</div>
                                    <div style="font-size: 14px; font-weight: 600; color: #212529;">₹${parseFloat(transaction.balanceAfter || 0).toFixed(2)}</div>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    
                    ${transaction.transactionId || transaction.orderId ? `
                    <!-- Transaction IDs Card -->
                    <div style="position: relative; overflow: hidden; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 0; padding: 18px 16px; margin-bottom: 12px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.25);">
                        <div style="position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: rgba(255, 255, 255, 0.1); border-radius: 50%;"></div>
                        <div style="position: relative; z-index: 1;">
                            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.9); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                                <i class="fas fa-fingerprint" style="font-size: 12px;"></i>
                                Transaction Information
                            </div>
                            ${transaction.transactionId ? `
                            <div style="margin-bottom: ${transaction.orderId ? '12px' : '0'};">
                                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.9); margin-bottom: 5px; font-weight: 600;">Transaction ID</div>
                                <div style="font-size: 11px; font-weight: 500; color: #212529; font-family: 'Courier New', monospace; word-break: break-all; background: rgba(255, 255, 255, 0.95); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.3);">${escapeHtml(transaction.transactionId)}</div>
                            </div>
                            ` : ''}
                            ${transaction.orderId ? `
                            <div>
                                <div style="font-size: 10px; color: rgba(255, 255, 255, 0.9); margin-bottom: 5px; font-weight: 600;">Order ID</div>
                                <div style="font-size: 11px; font-weight: 500; color: #212529; font-family: 'Courier New', monospace; word-break: break-all; background: rgba(255, 255, 255, 0.95); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.3);">${escapeHtml(transaction.orderId)}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${transaction.status === 'failed' && transaction.error ? `
                    <!-- Error Card -->
                    <div style="background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); border: 1px solid #fca5a5; border-radius: 12px; padding: 14px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: flex-start; gap: 12px;">
                            <div style="width: 36px; height: 36px; background: rgba(239, 68, 68, 0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 16px;"></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 11px; color: #991b1b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;">Error Details</div>
                                <div style="font-size: 12px; color: #991b1b; line-height: 1.5; word-wrap: break-word;">${escapeHtml(transaction.error)}</div>
                            </div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        appMain.innerHTML = pageHTML;
        
        // Ensure scroll to top after content is loaded
        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }, 0);
        
    } catch (error) {
        console.error('Error showing transaction details:', error);
        showError('Failed to load transaction details: ' + error.message);
    }
};

// Close transaction details modal
window.closeTransactionDetails = function() {
    const modal = document.getElementById('transactionDetailModal');
    if (modal) {
        modal.remove();
    }
};

