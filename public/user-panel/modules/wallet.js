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
            <div style="max-width: 100%; overflow-x: hidden;">
                <!-- Wallet Balance Card -->
                <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; margin-bottom: 16px;">
                    <div style="text-align: center;">
                        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Total Balance</div>
                        <div style="font-size: 48px; font-weight: 700; margin-bottom: 16px; word-break: break-word;">
                            ₹${parseFloat(balance || 0).toFixed(2)}
                        </div>
                        <button class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);" onclick="window.showTopUpModal()">
                            <i class="fas fa-plus"></i> Top Up Wallet
                        </button>
                    </div>
                </div>
                
                <!-- Quick Top-up Amounts -->
                <div class="card" style="margin-bottom: 16px; overflow-x: hidden;">
                    <h3 class="card-title">Quick Top-up</h3>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; max-width: 100%;">
                        <button class="btn btn-outline" onclick="window.topUpAmount(100)" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 10px 8px; font-size: 14px;">₹100</button>
                        <button class="btn btn-outline" onclick="window.topUpAmount(500)" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 10px 8px; font-size: 14px;">₹500</button>
                        <button class="btn btn-outline" onclick="window.topUpAmount(1000)" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 10px 8px; font-size: 14px;">₹1000</button>
                    </div>
                </div>
                
                <!-- Transaction History -->
                <div class="card" style="margin-bottom: 16px;">
                    <h3 class="card-title">Transaction History</h3>
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
            if (description.length > 60) {
                description = description.substring(0, 57) + '...';
            }
            
            // Determine status badge and styling
            let statusBadge = '';
            let amountColor = txn.transactionType === 'credit' || txn.transactionType === 'refund' ? 'var(--success-color)' : 'var(--danger-color)';
            
            if (txn.status === 'pending') {
                statusBadge = '<span class="badge badge-warning" style="font-size: 10px; margin-top: 4px;">Pending</span>';
            } else if (txn.status === 'failed') {
                statusBadge = '<span class="badge badge-danger" style="font-size: 10px; margin-top: 4px;">Failed</span>';
                amountColor = 'var(--text-secondary)'; // Gray out failed transactions
            } else if (txn.status === 'completed') {
                // No badge for completed transactions
            }
            
            return `
            <div style="padding: 12px 0; border-bottom: 1px solid var(--border-color); word-wrap: break-word; overflow-wrap: break-word; ${txn.status === 'failed' ? 'opacity: 0.7;' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; margin-bottom: 4px; word-wrap: break-word; overflow-wrap: break-word;">${description}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${formatDate(txn.createdAt)}</div>
                        ${statusBadge}
                    </div>
                    <div style="text-align: right; flex-shrink: 0;">
                        <div style="font-size: 18px; font-weight: 600; color: ${amountColor}; white-space: nowrap;">
                            ${txn.status === 'failed' ? '' : (txn.transactionType === 'credit' || txn.transactionType === 'refund' ? '+' : '-')}₹${parseFloat(txn.amount || 0).toFixed(2)}
                        </div>
                        ${txn.status !== 'failed' ? `<div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap;">Balance: ₹${parseFloat(txn.balanceAfter || 0).toFixed(2)}</div>` : '<div style="font-size: 12px; color: var(--text-secondary); white-space: nowrap;">Not processed</div>'}
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

