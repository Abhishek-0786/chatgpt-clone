// Profile Module
import { updateActiveNav, updatePageTitle } from '../app.js';
import { getCurrentUserProfile, updateProfile, changePassword, logout } from '../services/api.js';
import { showSuccess, showError } from '../../utils/notifications.js';

export async function loadProfileModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'profile');
    
    updateActiveNav('profile');
    updatePageTitle('Profile');
    
    const appMain = document.getElementById('appMain');
    
    try {
        // Fetch user profile from API
        const response = await getCurrentUserProfile();
        const user = response.success ? response.user : null;
        
        if (!user) {
            showError('Failed to load profile. Please login again.');
            // Redirect to login
            document.getElementById('appContainer').style.display = 'none';
            document.getElementById('authScreen').style.display = 'block';
            const { loadAuthModule } = await import('./auth.js');
            await loadAuthModule();
            return;
        }
        
        // Format phone number for display (add +91 if Indian number)
        const formatPhone = (phone) => {
            if (!phone) return 'N/A';
            // If phone doesn't start with +, assume it's Indian and add +91
            if (phone.length === 10 && !phone.startsWith('+')) {
                return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
            }
            return phone;
        };
        
        appMain.innerHTML = `
            <!-- Profile Header -->
            <div class="card" style="text-align: center; padding: 32px 24px;">
                <div style="font-size: 64px; margin-bottom: 16px; color: var(--primary-color);">
                    <i class="fas fa-user-circle"></i>
                </div>
                <h2 style="margin-bottom: 8px; font-size: 24px; font-weight: 700;">${user?.fullName || 'User'}</h2>
                <div style="color: var(--text-secondary); margin-bottom: 16px; font-size: 15px;">${user?.email || 'N/A'}</div>
            </div>
            
            <!-- Profile Details -->
            <div class="card">
                <h3 class="card-title">Account Details</h3>
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500;">Full Name</div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--text-primary);">${user?.fullName || 'N/A'}</div>
                    </div>
                    <div style="border-top: 1px solid var(--border-color); padding-top: 20px;">
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500;">Email</div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--text-primary);">${user?.email || 'N/A'}</div>
                    </div>
                    <div style="border-top: 1px solid var(--border-color); padding-top: 20px;">
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 500;">Phone</div>
                        <div style="font-size: 16px; font-weight: 600; color: var(--text-primary);">${formatPhone(user?.phone) || 'N/A'}</div>
                    </div>
                </div>
            </div>
            
            <!-- Actions -->
            <div class="card">
                <h3 class="card-title">Settings</h3>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="btn btn-outline" onclick="window.editProfile()">
                        <i class="fas fa-edit"></i> Edit Profile
                    </button>
                    <button class="btn btn-outline" onclick="window.changePassword()">
                        <i class="fas fa-lock"></i> Change Password
                    </button>
                </div>
            </div>
            
            <!-- Logout -->
            <div style="padding: 16px;">
                <button class="btn btn-danger btn-full" onclick="window.handleLogout()">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
            
            <!-- Edit Profile Modal -->
            <div id="editProfileModal" class="modal" style="display: none;" onclick="if(event.target === this) window.closeEditProfileModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>Edit Profile</h2>
                        <button class="modal-close" onclick="window.closeEditProfileModal()" type="button">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="editProfileForm" onsubmit="window.handleEditProfileSubmit(event)">
                        <div class="form-group">
                            <label class="form-label">Full Name <span style="color: var(--primary-color);">*</span></label>
                            <input type="text" class="form-input" name="fullName" id="editFullName" required placeholder="Enter your full name">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email <span style="color: var(--primary-color);">*</span></label>
                            <input type="email" class="form-input" name="email" id="editEmail" required placeholder="Enter your email">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Phone No <span style="color: var(--primary-color);">*</span></label>
                            <input type="tel" class="form-input" name="phone" id="editPhone" required placeholder="Enter your phone number" pattern="[0-9]{10,15}">
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-outline" style="flex: 1;" onclick="window.closeEditProfileModal()">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary" style="flex: 1;" id="saveProfileBtn">
                                <span id="saveProfileText">Save Changes</span>
                                <span id="saveProfileLoader" style="display: none;">
                                    <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                                    Saving...
                                </span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
            
            <!-- Change Password Modal -->
            <div id="changePasswordModal" class="modal" style="display: none;" onclick="if(event.target === this) window.closeChangePasswordModal()">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>Change Password</h2>
                        <button class="modal-close" onclick="window.closeChangePasswordModal()" type="button">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <form id="changePasswordForm" onsubmit="window.handleChangePasswordSubmit(event)">
                        <div class="form-group">
                            <label class="form-label">Current Password <span style="color: var(--primary-color);">*</span></label>
                            <div style="position: relative;">
                                <input type="password" class="form-input" name="currentPassword" id="currentPassword" required placeholder="Enter current password" style="padding-right: 45px;">
                                <button type="button" onclick="window.togglePassword('currentPassword', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px; z-index: 10;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">New Password <span style="color: var(--primary-color);">*</span></label>
                            <div style="position: relative;">
                                <input type="password" class="form-input" name="newPassword" id="newPassword" required placeholder="Enter new password" minlength="6" style="padding-right: 45px;">
                                <button type="button" onclick="window.togglePassword('newPassword', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px; z-index: 10;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                            <small>Password must be at least 6 characters long</small>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Confirm New Password <span style="color: var(--primary-color);">*</span></label>
                            <div style="position: relative;">
                                <input type="password" class="form-input" name="confirmPassword" id="confirmPassword" required placeholder="Confirm new password" minlength="6" style="padding-right: 45px;">
                                <button type="button" onclick="window.togglePassword('confirmPassword', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px; z-index: 10;">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn btn-outline" style="flex: 1;" onclick="window.closeChangePasswordModal()">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn-primary" style="flex: 1;" id="changePasswordBtn">
                                <span id="changePasswordText">Change Password</span>
                                <span id="changePasswordLoader" style="display: none;">
                                    <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                                    Changing...
                                </span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile. Please try again.');
        appMain.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error Loading Profile</h3>
                <p>Please try again later</p>
                <button class="btn btn-primary" style="margin-top: 16px;" onclick="window.loadProfileModule()">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;
    }
}

// Handle logout
window.handleLogout = async function() {
    try {
        await logout();
        // Clear local storage
        localStorage.removeItem('userToken');
        localStorage.removeItem('currentUser');
        sessionStorage.clear();
        
        showSuccess('Logged out successfully');
        
        // Redirect to auth screen
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('authScreen').style.display = 'block';
        
        const { loadAuthModule } = await import('./auth.js');
        await loadAuthModule();
    } catch (error) {
        console.error('Logout error:', error);
        // Clear storage anyway
        localStorage.removeItem('userToken');
        localStorage.removeItem('currentUser');
        sessionStorage.clear();
        
        document.getElementById('appContainer').style.display = 'none';
        document.getElementById('authScreen').style.display = 'block';
        
        const { loadAuthModule } = await import('./auth.js');
        await loadAuthModule();
    }
};

// Store current user data for edit modal
let currentUserData = null;

// Edit profile - Open modal
window.editProfile = async function() {
    try {
        // Fetch current user data
        const response = await getCurrentUserProfile();
        if (!response.success || !response.user) {
            showError('Failed to load profile data');
            return;
        }
        
        currentUserData = response.user;
        const modal = document.getElementById('editProfileModal');
        const form = document.getElementById('editProfileForm');
        const fullNameInput = document.getElementById('editFullName');
        const emailInput = document.getElementById('editEmail');
        const phoneInput = document.getElementById('editPhone');
        
        if (modal && form && fullNameInput && emailInput && phoneInput) {
            // Populate form with current data
            fullNameInput.value = currentUserData.fullName || '';
            emailInput.value = currentUserData.email || '';
            phoneInput.value = currentUserData.phone || '';
            
            // Show modal
            modal.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error opening edit profile modal:', error);
        showError('Failed to load profile data');
    }
};

// Close edit profile modal
window.closeEditProfileModal = function() {
    const modal = document.getElementById('editProfileModal');
    const form = document.getElementById('editProfileForm');
    const saveBtn = document.getElementById('saveProfileBtn');
    const saveText = document.getElementById('saveProfileText');
    const saveLoader = document.getElementById('saveProfileLoader');
    
    if (modal) {
        modal.style.display = 'none';
    }
    
    if (form) {
        form.reset();
    }
    
    // Reset button state
    if (saveBtn) {
        saveBtn.disabled = false;
    }
    if (saveText) {
        saveText.style.display = 'inline';
    }
    if (saveLoader) {
        saveLoader.style.display = 'none';
    }
};

// Handle edit profile form submit
window.handleEditProfileSubmit = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    const fullName = formData.get('fullName')?.trim();
    const email = formData.get('email')?.trim();
    const phone = formData.get('phone')?.trim();
    
    // Validation
    if (!fullName || !email || !phone) {
        showError('All fields are required');
        return;
    }
    
    if (phone.length < 10 || phone.length > 15) {
        showError('Phone number must be between 10 and 15 digits');
        return;
    }
    
    // Get button elements for loading state
    const saveBtn = document.getElementById('saveProfileBtn');
    const saveText = document.getElementById('saveProfileText');
    const saveLoader = document.getElementById('saveProfileLoader');
    const fullNameInput = document.getElementById('editFullName');
    const emailInput = document.getElementById('editEmail');
    const phoneInput = document.getElementById('editPhone');
    
    // Show loading state
    saveBtn.disabled = true;
    saveText.style.display = 'none';
    saveLoader.style.display = 'inline';
    fullNameInput.disabled = true;
    emailInput.disabled = true;
    phoneInput.disabled = true;
    
    try {
        const response = await updateProfile({
            fullName,
            email,
            phone
        });
        
        if (response.success) {
            showSuccess('Profile updated successfully');
            
            // Update localStorage with new user data
            if (response.user) {
                localStorage.setItem('currentUser', JSON.stringify(response.user));
            }
            
            // Close modal
            window.closeEditProfileModal();
            
            // Reload profile page to show updated data
            await loadProfileModule();
        } else {
            showError(response.error || 'Failed to update profile');
            
            // Reset button state on error
            saveBtn.disabled = false;
            saveText.style.display = 'inline';
            saveLoader.style.display = 'none';
            fullNameInput.disabled = false;
            emailInput.disabled = false;
            phoneInput.disabled = false;
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showError(error.message || 'Failed to update profile');
        
        // Reset button state on error
        saveBtn.disabled = false;
        saveText.style.display = 'inline';
        saveLoader.style.display = 'none';
        fullNameInput.disabled = false;
        emailInput.disabled = false;
        phoneInput.disabled = false;
    }
};

// Change password - Open modal
window.changePassword = function() {
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    
    if (modal && form) {
        // Reset form
        form.reset();
        
        // Show modal
        modal.style.display = 'flex';
    }
};

// Close change password modal
window.closeChangePasswordModal = function() {
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    const changeBtn = document.getElementById('changePasswordBtn');
    const changeText = document.getElementById('changePasswordText');
    const changeLoader = document.getElementById('changePasswordLoader');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    if (modal) {
        modal.style.display = 'none';
    }
    
    if (form) {
        form.reset();
    }
    
    // Reset button state
    if (changeBtn) {
        changeBtn.disabled = false;
    }
    if (changeText) {
        changeText.style.display = 'inline';
    }
    if (changeLoader) {
        changeLoader.style.display = 'none';
    }
    
    // Reset input states
    if (currentPasswordInput) {
        currentPasswordInput.disabled = false;
    }
    if (newPasswordInput) {
        newPasswordInput.disabled = false;
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.disabled = false;
    }
};

// Handle change password form submit
window.handleChangePasswordSubmit = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    const currentPassword = formData.get('currentPassword')?.trim();
    const newPassword = formData.get('newPassword')?.trim();
    const confirmPassword = formData.get('confirmPassword')?.trim();
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showError('All fields are required');
        return;
    }
    
    if (newPassword.length < 6) {
        showError('New password must be at least 6 characters long');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showError('New password and confirm password do not match');
        return;
    }
    
    if (currentPassword === newPassword) {
        showError('New password must be different from current password');
        return;
    }
    
    // Get button elements for loading state
    const changeBtn = document.getElementById('changePasswordBtn');
    const changeText = document.getElementById('changePasswordText');
    const changeLoader = document.getElementById('changePasswordLoader');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    
    // Show loading state
    changeBtn.disabled = true;
    changeText.style.display = 'none';
    changeLoader.style.display = 'inline';
    currentPasswordInput.disabled = true;
    newPasswordInput.disabled = true;
    confirmPasswordInput.disabled = true;
    
    try {
        const response = await changePassword({
            currentPassword,
            newPassword,
            confirmPassword
        });
        
        if (response.success) {
            showSuccess('Password changed successfully');
            
            // Close modal
            window.closeChangePasswordModal();
        } else {
            showError(response.error || 'Failed to change password');
            
            // Reset button state on error
            changeBtn.disabled = false;
            changeText.style.display = 'inline';
            changeLoader.style.display = 'none';
            currentPasswordInput.disabled = false;
            newPasswordInput.disabled = false;
            confirmPasswordInput.disabled = false;
        }
    } catch (error) {
        console.error('Error changing password:', error);
        showError(error.message || 'Failed to change password');
        
        // Reset button state on error
        changeBtn.disabled = false;
        changeText.style.display = 'inline';
        changeLoader.style.display = 'none';
        currentPasswordInput.disabled = false;
        newPasswordInput.disabled = false;
        confirmPasswordInput.disabled = false;
    }
};

// Toggle password visibility (reused from auth module)
window.togglePassword = function(inputId, button) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    const icon = button.querySelector('i');
    if (!icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
};

