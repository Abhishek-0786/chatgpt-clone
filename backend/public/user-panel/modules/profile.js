// Profile Module
import { updateActiveNav, updatePageTitle, refreshWalletBalance } from '../app.js';
import { getCurrentUserProfile, updateProfile, changePassword, logout } from '../services/api.js';
import { showSuccess, showError } from '../../utils/notifications.js';

export async function loadProfileModule() {
    // Store current page in sessionStorage for refresh persistence
    sessionStorage.setItem('lastPage', 'profile');
    
    updateActiveNav('profile');
    updatePageTitle('Profile');
    
    // Refresh wallet balance
    await refreshWalletBalance();
    
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
            <!-- Profile Header - Gradient Card -->
            <div style="position: relative; overflow: hidden; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);">
                <!-- Decorative circles -->
                <div style="position: absolute; top: -50%; right: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);"></div>
                <div style="position: absolute; bottom: -20px; left: -20px; width: 80px; height: 80px; background: rgba(255,255,255,0.1); border-radius: 50%;"></div>
                
                <!-- Profile Content -->
                <div style="display: flex; align-items: center; gap: 16px; position: relative; z-index: 1;">
                    <!-- Avatar -->
                    <div style="width: 64px; height: 64px; background: rgba(255, 255, 255, 0.25); backdrop-filter: blur(10px); border: 2px solid rgba(255, 255, 255, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);">
                        <i class="fas fa-user" style="font-size: 32px; color: white;"></i>
                    </div>
                    
                    <!-- User Info -->
                    <div style="flex: 1; min-width: 0;">
                        <h2 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 700; color: white; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2); line-height: 1.2;">${user?.fullName || 'User'}</h2>
                        <div style="color: rgba(255, 255, 255, 0.9); font-size: 13px; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2); word-break: break-word;">${user?.email || 'N/A'}</div>
                    </div>
                </div>
            </div>
            
            <!-- Account Details -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 4px;">Account Details</div>
                
                <div style="display: grid; gap: 12px;">
                    <!-- Full Name Card -->
                    <div style="position: relative; overflow: hidden; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                        <div style="position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: linear-gradient(135deg, #667eea08 0%, #667eea15 100%); border-radius: 50%;"></div>
                        <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-user" style="color: #667eea; font-size: 18px;"></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 10px; color: #6c757d; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Full Name</div>
                                <div style="font-size: 14px; font-weight: 600; color: #212529; word-wrap: break-word;">${user?.fullName || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Email Card -->
                    <div style="position: relative; overflow: hidden; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                        <div style="position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: linear-gradient(135deg, #f59e0b08 0%, #f59e0b15 100%); border-radius: 50%;"></div>
                        <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #f59e0b15 0%, #f59e0b25 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-envelope" style="color: #f59e0b; font-size: 18px;"></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 10px; color: #6c757d; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Email</div>
                                <div style="font-size: 14px; font-weight: 600; color: #212529; word-wrap: break-word;">${user?.email || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Phone Card -->
                    <div style="position: relative; overflow: hidden; background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);">
                        <div style="position: absolute; top: -20px; right: -20px; width: 80px; height: 80px; background: linear-gradient(135deg, #10b98108 0%, #10b98115 100%); border-radius: 50%;"></div>
                        <div style="position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #10b98115 0%, #10b98125 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-phone" style="color: #10b981; font-size: 18px;"></i>
                            </div>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 10px; color: #6c757d; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600;">Phone</div>
                                <div style="font-size: 14px; font-weight: 600; color: #212529; word-wrap: break-word;">${formatPhone(user?.phone) || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Settings Actions -->
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 4px;">Settings</div>
                
                <div style="display: grid; gap: 12px;">
                    <!-- Edit Profile Button -->
                    <button onclick="window.editProfile()" style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 15px rgba(0, 0, 0, 0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 10px rgba(0, 0, 0, 0.05)'">
                        <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #667eea15 0%, #667eea25 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-edit" style="color: #667eea; font-size: 18px;"></i>
                        </div>
                        <div style="flex: 1; text-align: left;">
                            <div style="font-size: 15px; font-weight: 600; color: #212529;">Edit Profile</div>
                            <div style="font-size: 12px; color: #6c757d; margin-top: 2px;">Update your personal information</div>
                        </div>
                        <i class="fas fa-chevron-right" style="color: #6c757d; font-size: 14px;"></i>
                    </button>
                    
                    <!-- Change Password Button -->
                    <button onclick="window.changePassword()" style="background: white; border: 1px solid #e9ecef; border-radius: 16px; padding: 18px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 15px rgba(0, 0, 0, 0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 10px rgba(0, 0, 0, 0.05)'">
                        <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #f59e0b15 0%, #f59e0b25 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <i class="fas fa-lock" style="color: #f59e0b; font-size: 18px;"></i>
                        </div>
                        <div style="flex: 1; text-align: left;">
                            <div style="font-size: 15px; font-weight: 600; color: #212529;">Change Password</div>
                            <div style="font-size: 12px; color: #6c757d; margin-top: 2px;">Update your account password</div>
                        </div>
                        <i class="fas fa-chevron-right" style="color: #6c757d; font-size: 14px;"></i>
                    </button>
                </div>
            </div>
            
            <!-- Logout Button -->
            <div style="padding: 0 4px;">
                <button onclick="window.handleLogout()" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border: none; border-radius: 16px; padding: 16px; width: 100%; color: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3); display: flex; align-items: center; justify-content: center; gap: 10px;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(239, 68, 68, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(239, 68, 68, 0.3)'">
                    <i class="fas fa-sign-out-alt"></i>
                    <span>Logout</span>
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

