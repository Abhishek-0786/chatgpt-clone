// CMS Main JavaScript
import { loadDashboardModule } from './modules/dashboard.js';
import { loadChargingStationsModule } from './modules/charging-stations.js';
import { loadChargingPointsModule } from './modules/charging-points.js';
import { loadChargingSessionsModule } from './modules/charging-sessions.js';
import { loadTariffManagementModule } from './modules/tariff-management.js';
import { loadCustomersModule } from './modules/customers.js';

// Export functions for global access
export { loadDashboardModule, loadChargingStationsModule, loadChargingPointsModule, loadChargingSessionsModule, loadTariffManagementModule, loadCustomersModule };

// Define loadModule function first
function loadModule(moduleName, pushState = true) {
    const moduleContent = document.getElementById('moduleContent');
    
    // Clear stations refresh interval when switching to a different module
    if (moduleName !== 'charging-stations') {
        import('./modules/charging-stations.js').then(module => {
            if (module.clearStationsRefreshInterval) {
                module.clearStationsRefreshInterval();
            }
        }).catch(() => {
            // Ignore errors if module not loaded
        });
    }
    
    // Clear points refresh interval when switching to a different module
    if (moduleName !== 'charging-points') {
        import('./modules/charging-points.js').then(module => {
            if (module.clearPointsRefreshInterval) {
                module.clearPointsRefreshInterval();
            }
        }).catch(() => {
            // Ignore errors if module not loaded
        });
    }
    
    // Update URL without reloading page
    if (pushState) {
        const url = `/cms?module=${moduleName}`;
        window.history.pushState({ module: moduleName }, '', url);
    }
    
    switch(moduleName) {
        case 'dashboard':
            loadDashboardModule();
            break;
        case 'charging-stations':
            loadChargingStationsModule();
            break;
        case 'charging-points':
            loadChargingPointsModule();
            break;
        case 'charging-sessions':
            loadChargingSessionsModule();
            break;
        case 'tariff-management':
            loadTariffManagementModule();
            break;
        case 'customers':
            loadCustomersModule();
            break;
        default:
            loadDashboardModule();
    }
}

// Make loadModule globally available
window.loadModule = loadModule;

// Handle browser back/forward buttons
window.addEventListener('popstate', function(event) {
    const urlParams = new URLSearchParams(window.location.search);
    let module = urlParams.get('module');
    const stationId = urlParams.get('station');
    const pointId = urlParams.get('point');
    const customerId = urlParams.get('customer');
    const action = urlParams.get('action');
    
    // If no module specified, default to dashboard
    if (!module) {
        module = 'dashboard';
    }
    
    // Update active menu item
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === module) {
            item.classList.add('active');
        }
    });
    
    // Handle station detail view
    if (stationId && module === 'charging-stations' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load station detail view with active tab
        import('./modules/station-detail-view.js').then(detailModule => {
            detailModule.loadStationDetailView(stationId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading station detail:', error);
            loadModule(module, false);
        });
    } else if (stationId && module === 'charging-stations' && action === 'edit') {
        // Load edit station form
        import('./modules/add-station-form.js').then(formModule => {
            formModule.openEditStationForm(stationId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(module, false);
        });
    } else if (pointId && module === 'charging-points' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load charging point detail view with active tab
        import('./modules/charging-point-detail-view.js').then(detailModule => {
            window.currentChargingPointId = pointId;
            detailModule.loadChargingPointDetailView(pointId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading charging point detail:', error);
            loadModule(module, false);
        });
    } else if (pointId && module === 'charging-points' && action === 'edit') {
        // Load edit charging point form
        import('./modules/add-charging-point-form.js').then(formModule => {
            formModule.openEditChargingPointForm(pointId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(module, false);
        });
    } else if (customerId && module === 'customers' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load customer detail view with active tab
        import('./modules/customer-detail-view.js').then(detailModule => {
            detailModule.loadCustomerDetailView(customerId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading customer detail:', error);
            loadModule(module, false);
        });
    } else {
        // Load regular module without pushing new state (to avoid infinite loop)
        loadModule(module, false);
    }
});

// Handle initial page load - check URL for module
function initializeCMS() {
    // FIRST: Check URL and set active menu item BEFORE any module loads
    const urlParams = new URLSearchParams(window.location.search);
    let moduleFromUrl = urlParams.get('module');
    
    // If no module specified, default to dashboard only on first visit
    if (!moduleFromUrl) {
        moduleFromUrl = 'dashboard';
        // Update URL to include dashboard module
        window.history.replaceState({ module: 'dashboard' }, '', '/cms?module=dashboard');
    }
    
    // Update active menu item based on URL IMMEDIATELY
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-module') === moduleFromUrl) {
            item.classList.add('active');
        }
    });
    
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    
    sidebarToggle.addEventListener('click', function() {
        sidebar.classList.toggle('collapsed');
    });

    // Menu item click handlers
    menuItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all items
            menuItems.forEach(mi => mi.classList.remove('active'));
            
            // Add active class to clicked item
            this.classList.add('active');
            
            // Load module
            const module = this.getAttribute('data-module');
            loadModule(module);
        });
    });
    
    // Show module content area
    const moduleContent = document.getElementById('moduleContent');
    if (moduleContent) {
        moduleContent.style.display = 'block';
    }
    
    // Check for additional URL parameters (station, point, customer, action) on initial load
    const stationId = urlParams.get('station');
    const pointId = urlParams.get('point');
    const customerId = urlParams.get('customer');
    const action = urlParams.get('action');
    
    // Handle station detail view on initial load
    if (stationId && moduleFromUrl === 'charging-stations' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load station detail view with active tab
        import('./modules/station-detail-view.js').then(detailModule => {
            detailModule.loadStationDetailView(stationId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading station detail:', error);
            loadModule(moduleFromUrl, false);
        });
    } else if (stationId && moduleFromUrl === 'charging-stations' && action === 'edit') {
        // Load edit station form
        import('./modules/add-station-form.js').then(formModule => {
            formModule.openEditStationForm(stationId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(moduleFromUrl, false);
        });
    } else if (pointId && moduleFromUrl === 'charging-points' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load charging point detail view with active tab
        import('./modules/charging-point-detail-view.js').then(detailModule => {
            window.currentChargingPointId = pointId;
            detailModule.loadChargingPointDetailView(pointId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading charging point detail:', error);
            loadModule(moduleFromUrl, false);
        });
    } else if (pointId && moduleFromUrl === 'charging-points' && action === 'edit') {
        // Load edit charging point form
        import('./modules/add-charging-point-form.js').then(formModule => {
            formModule.openEditChargingPointForm(pointId);
        }).catch(error => {
            console.error('Error loading edit form:', error);
            loadModule(moduleFromUrl, false);
        });
    } else if (customerId && moduleFromUrl === 'customers' && !action) {
        // Get tab parameter from URL (default to 'details')
        const tabFromUrl = urlParams.get('tab') || 'details';
        // Load customer detail view with active tab
        import('./modules/customer-detail-view.js').then(detailModule => {
            detailModule.loadCustomerDetailView(customerId, tabFromUrl);
        }).catch(error => {
            console.error('Error loading customer detail:', error);
            loadModule(moduleFromUrl, false);
        });
    } else {
        // Load regular module from URL (without pushing state on initial load)
        loadModule(moduleFromUrl, false);
    }
    
    // Push initial state if not already in history
    if (!window.location.search.includes('module=')) {
        window.history.replaceState({ module: moduleFromUrl }, '', `/cms?module=${moduleFromUrl}`);
    }
}

// Authentication check
async function checkCMSAuth() {
    const authToken = localStorage.getItem('authToken');
    
    if (!authToken) {
        // No token, redirect to home page
        window.location.href = '/';
        return false;
    }

    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            // Invalid token, redirect to home
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            window.location.href = '/';
            return false;
        }

        const data = await response.json();
        const user = data.user || data;
        
        // Store user info
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        // Update user profile in header
        updateUserProfile(user);
        
        return true;
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        window.location.href = '/';
        return false;
    }
}

// Update user profile in header
function updateUserProfile(user) {
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    
    if (userNameEl && user) {
        // Get full name or username
        const displayName = user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.username || user.email || 'User';
        userNameEl.textContent = displayName;
    }
    
    if (userAvatarEl && user) {
        // Get initials from name or username
        const name = user.firstName && user.lastName 
            ? `${user.firstName} ${user.lastName}`.trim()
            : user.username || user.email || 'U';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        userAvatarEl.textContent = initials;
    }
}

// Setup user dropdown
function setupUserDropdown() {
    const userProfile = document.getElementById('userProfileDropdown');
    const userDropdown = document.getElementById('userDropdown');
    const logoutLink = document.getElementById('logoutLink');
    const profileLink = document.getElementById('profileLink');
    const changePasswordLink = document.getElementById('changePasswordLink');
    
    if (!userProfile || !userDropdown) return;
    
    // Toggle dropdown on click
    userProfile.addEventListener('click', function(e) {
        e.stopPropagation();
        const isVisible = userDropdown.style.display === 'block';
        userDropdown.style.display = isVisible ? 'none' : 'block';
        userProfile.classList.toggle('active', !isVisible);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!userProfile.contains(e.target)) {
            userDropdown.style.display = 'none';
            userProfile.classList.remove('active');
        }
    });
    
    // Logout handler
    if (logoutLink) {
        logoutLink.addEventListener('click', function(e) {
            e.preventDefault();
            handleCMSLogout();
        });
    }
    
    // Change Password handler
    if (changePasswordLink) {
        changePasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            userDropdown.style.display = 'none';
            openChangePasswordModal();
        });
    }
}

// Handle CMS logout
function handleCMSLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = '/home.html';
}

// Open change password modal
function openChangePasswordModal() {
    const modal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    modal.show();
    
    // Reset form
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').style.display = 'none';
    document.getElementById('changePasswordSuccess').style.display = 'none';
}

// Setup change password form
function setupChangePasswordForm() {
    const form = document.getElementById('changePasswordForm');
    if (!form) return;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        await handleChangePassword();
    });
    
    // Password toggle handlers
    const toggleCurrentPassword = document.getElementById('toggleCurrentPassword');
    const toggleNewPassword = document.getElementById('toggleNewPassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    
    if (toggleCurrentPassword) {
        toggleCurrentPassword.addEventListener('click', function() {
            const input = document.getElementById('currentPassword');
            const eye = document.getElementById('currentPasswordEye');
            if (input.type === 'password') {
                input.type = 'text';
                eye.classList.remove('fa-eye');
                eye.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                eye.classList.remove('fa-eye-slash');
                eye.classList.add('fa-eye');
            }
        });
    }
    
    if (toggleNewPassword) {
        toggleNewPassword.addEventListener('click', function() {
            const input = document.getElementById('newPassword');
            const eye = document.getElementById('newPasswordEye');
            if (input.type === 'password') {
                input.type = 'text';
                eye.classList.remove('fa-eye');
                eye.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                eye.classList.remove('fa-eye-slash');
                eye.classList.add('fa-eye');
            }
        });
    }
    
    if (toggleConfirmPassword) {
        toggleConfirmPassword.addEventListener('click', function() {
            const input = document.getElementById('confirmPassword');
            const eye = document.getElementById('confirmPasswordEye');
            if (input.type === 'password') {
                input.type = 'text';
                eye.classList.remove('fa-eye');
                eye.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                eye.classList.remove('fa-eye-slash');
                eye.classList.add('fa-eye');
            }
        });
    }
}

// Handle change password
async function handleChangePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('changePasswordError');
    const successDiv = document.getElementById('changePasswordSuccess');
    const submitBtn = document.getElementById('changePasswordSubmitBtn');
    const btnText = document.getElementById('changePasswordBtnText');
    const btnSpinner = document.getElementById('changePasswordBtnSpinner');
    
    // Hide previous messages
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        errorDiv.textContent = 'Please fill in all fields';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPassword.length < 6) {
        errorDiv.textContent = 'New password must be at least 6 characters long';
        errorDiv.style.display = 'block';
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';
    
    try {
        const authToken = localStorage.getItem('authToken');
        const response = await fetch('/api/auth/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                currentPassword,
                newPassword,
                confirmPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            successDiv.textContent = data.message || 'Password changed successfully';
            successDiv.style.display = 'block';
            
            // Clear form
            document.getElementById('changePasswordForm').reset();
            
            // Close modal after 2 seconds
            setTimeout(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
                if (modal) modal.hide();
            }, 2000);
        } else {
            errorDiv.textContent = data.error || 'Failed to change password';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Change password error:', error);
        errorDiv.textContent = 'Failed to change password. Please try again.';
        errorDiv.style.display = 'block';
    } finally {
        // Hide loading state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnSpinner.style.display = 'none';
    }
}

// Initialize CMS on page load
document.addEventListener('DOMContentLoaded', async function() {
    // First check authentication
    const isAuthenticated = await checkCMSAuth();
    
    if (isAuthenticated) {
        // Setup user dropdown
        setupUserDropdown();
        
        // Setup change password form
        setupChangePasswordForm();
        
        // Initialize CMS
        initializeCMS();
    }
});
