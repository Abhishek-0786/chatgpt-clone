// Authentication Module
import { login, register } from '../services/api.js';
import { showSuccess, showError } from '../../utils/notifications.js';

// Check if user is authenticated
export async function checkAuth() {
    // TEMPORARY: Bypass auth for testing - set to false for real authentication
    const BYPASS_AUTH = false; // Set to true to skip login during development
    
    if (BYPASS_AUTH) {
        // Set mock user data for testing
        if (!localStorage.getItem('currentUser')) {
            localStorage.setItem('currentUser', JSON.stringify({
                id: 1,
                name: 'Test User',
                email: 'test@example.com',
                phone: '+1234567890'
            }));
        }
        if (!localStorage.getItem('userToken')) {
            localStorage.setItem('userToken', 'mock-token-for-testing');
        }
        return true;
    }
    
    const token = localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
    if (!token) {
        return false;
    }
    
    // Verify token with backend
    try {
        const { getCurrentUserProfile } = await import('../services/api.js');
        const response = await getCurrentUserProfile();
        if (response.success && response.user) {
            // Update stored user data
            localStorage.setItem('currentUser', JSON.stringify(response.user));
            return true;
        } else {
            // Token invalid - clear it
            localStorage.removeItem('userToken');
            sessionStorage.removeItem('userToken');
            localStorage.removeItem('currentUser');
            return false;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        // If it's a network error, assume token is valid (server might be down)
        // If it's 401, token is invalid
        if (error.message && error.message.includes('401') || error.message.includes('Session expired')) {
            localStorage.removeItem('userToken');
            sessionStorage.removeItem('userToken');
            localStorage.removeItem('currentUser');
            return false;
        }
        // For other errors, assume token might be valid (could be server issue)
        return !!token;
    }
}

// Load auth module (login/register screen)
export async function loadAuthModule() {
    const authScreen = document.getElementById('authScreen');
    
    authScreen.innerHTML = `
        <div class="auth-container">
            <div class="auth-header">
                <div class="auth-logo">
                    <i class="fas fa-bolt"></i>
                </div>
                <h1>GenX EV Charging</h1>
                <p>Charge your vehicle, power your journey</p>
            </div>
            
            <div class="auth-tabs">
                <button class="auth-tab active" data-tab="login" onclick="window.switchAuthTab('login')">Login</button>
                <button class="auth-tab" data-tab="register" onclick="window.switchAuthTab('register')">Register</button>
            </div>
            
            <!-- Login Form -->
            <div id="loginForm" class="auth-form active">
                <form onsubmit="window.handleLogin(event)">
                    <div class="form-group">
                        <label class="form-label">Email <span style="color: var(--primary-color);">*</span></label>
                        <input type="email" class="form-input" name="email" required placeholder="Enter your email">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Password <span style="color: var(--primary-color);">*</span></label>
                        <div style="position: relative;">
                            <input type="password" class="form-input" name="password" id="loginPassword" required placeholder="Enter your password" style="padding-right: 45px;">
                            <button type="button" onclick="window.togglePassword('loginPassword', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px; z-index: 10;">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group" style="text-align: right; margin-top: -8px; margin-bottom: 16px;">
                        <a href="#" onclick="window.showForgotPassword(); return false;" style="color: var(--primary-color); font-size: 14px; text-decoration: none;">Forgot Password?</a>
                    </div>
                    <button type="submit" class="btn btn-primary btn-full">Login</button>
                </form>
            </div>
            
            <!-- Register Form -->
            <div id="registerForm" class="auth-form">
                <form onsubmit="window.handleRegister(event)">
                    <div class="form-group">
                        <label class="form-label">Full Name <span style="color: var(--primary-color);">*</span></label>
                        <input type="text" class="form-input" name="fullName" required placeholder="Enter your full name">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email <span style="color: var(--primary-color);">*</span></label>
                        <input type="email" class="form-input" name="email" required placeholder="Enter your email">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Phone No <span style="color: var(--primary-color);">*</span></label>
                        <input type="tel" class="form-input" name="phone" required placeholder="Enter your phone number" pattern="[0-9]{10,15}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Password <span style="color: var(--primary-color);">*</span></label>
                        <div style="position: relative;">
                            <input type="password" class="form-input" name="password" id="registerPassword" required placeholder="Create a password" minlength="6" style="padding-right: 45px;">
                            <button type="button" onclick="window.togglePassword('registerPassword', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px; z-index: 10;">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Confirm Password <span style="color: var(--primary-color);">*</span></label>
                        <div style="position: relative;">
                            <input type="password" class="form-input" name="confirmPassword" id="confirmPassword" required placeholder="Confirm your password" minlength="6" style="padding-right: 45px;">
                            <button type="button" onclick="window.togglePassword('confirmPassword', this)" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px; z-index: 10;">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary btn-full">Register</button>
                </form>
            </div>
            
        </div>
        
        <!-- Forgot Password Modal (outside auth-container for proper positioning) -->
        <div id="forgotPasswordModal" class="auth-modal" style="display: none;" onclick="if(event.target === this) window.closeForgotPassword()">
            <div class="auth-modal-content" onclick="event.stopPropagation()">
                <div class="auth-modal-header">
                    <h3>Forgot Password</h3>
                    <button class="auth-modal-close" onclick="window.closeForgotPassword()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="auth-modal-body">
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">Enter your email address and we'll send you a link to reset your password.</p>
                    <form onsubmit="window.handleForgotPassword(event)" id="forgotPasswordForm">
                        <div class="form-group" style="margin-bottom: 24px;">
                            <label class="form-label">Email <span style="color: var(--primary-color);">*</span></label>
                            <input type="email" class="form-input" name="email" id="forgotPasswordEmail" required placeholder="Enter your email">
                        </div>
                        <button type="submit" class="btn btn-primary btn-full" id="sendResetLinkBtn">
                            <span id="sendResetLinkText">Send Reset Link</span>
                            <span id="sendResetLinkLoader" style="display: none; align-items: center; justify-content: center;">
                                <i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>
                                Sending...
                            </span>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `;
}

// Switch between login and register tabs
window.switchAuthTab = function(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Form`).classList.add('active');
};

// Handle login
window.handleLogin = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    try {
        const response = await login(
            formData.get('email'),
            formData.get('password')
        );
        
        if (response.success) {
            // Store token and user data
            localStorage.setItem('userToken', response.token);
            localStorage.setItem('currentUser', JSON.stringify(response.user));
            
            showSuccess('Login successful!');
            
            // Hide auth screen and show app
            document.getElementById('authScreen').style.display = 'none';
            document.getElementById('appContainer').style.display = 'flex';
            
            // Load dashboard
            const { loadDashboard } = await import('./dashboard.js');
            await loadDashboard();
        } else {
            showError(response.error || 'Login failed');
        }
    } catch (error) {
        showError(error.message || 'Login failed. Please try again.');
    }
};

// Handle register
window.handleRegister = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    
    // Validate required fields
    const fullName = formData.get('fullName')?.trim();
    const email = formData.get('email')?.trim();
    const phone = formData.get('phone')?.trim();
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    
    if (!fullName || !email || !phone || !password || !confirmPassword) {
        showError('All fields are required');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }
    
    try {
        const response = await register({
            fullName,
            email,
            phone,
            password,
            confirmPassword
        });
        
        if (response.success) {
            showSuccess('Registration successful! Please login.');
            window.switchAuthTab('login');
            // Clear form
            event.target.reset();
        } else {
            showError(response.error || 'Registration failed');
        }
    } catch (error) {
        showError(error.message || 'Registration failed. Please try again.');
    }
};

// Show forgot password modal
window.showForgotPassword = function() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.style.display = 'flex';
        // Close on outside click
        modal.onclick = function(e) {
            if (e.target === modal) {
                window.closeForgotPassword();
            }
        };
    }
};

// Close forgot password modal
window.closeForgotPassword = function() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.style.display = 'none';
        // Clear form and reset button state
        const form = modal.querySelector('form');
        if (form) form.reset();
        
        // Reset button to normal state
        const submitBtn = document.getElementById('sendResetLinkBtn');
        const btnText = document.getElementById('sendResetLinkText');
        const btnLoader = document.getElementById('sendResetLinkLoader');
        const emailInput = document.getElementById('forgotPasswordEmail');
        
        if (submitBtn) {
            submitBtn.disabled = false;
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
            if (emailInput) emailInput.disabled = false;
        }
    }
};

// Handle forgot password
window.handleForgotPassword = async function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const email = formData.get('email')?.trim();
    
    if (!email) {
        showError('Email is required');
        return;
    }
    
    // Get button and input elements
    const submitBtn = document.getElementById('sendResetLinkBtn');
    const btnText = document.getElementById('sendResetLinkText');
    const btnLoader = document.getElementById('sendResetLinkLoader');
    const emailInput = document.getElementById('forgotPasswordEmail');
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline';
    emailInput.disabled = true;
    
    try {
        const { forgotPassword } = await import('../services/api.js');
        const response = await forgotPassword(email);
        
        if (response.success) {
            showSuccess(response.message || 'Password reset link sent to your email');
            // Close modal after a short delay
            setTimeout(() => {
                window.closeForgotPassword();
            }, 1500);
        } else {
            showError(response.error || 'Failed to send reset link');
            // Reset button state on error
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            emailInput.disabled = false;
        }
    } catch (error) {
        showError(error.message || 'Failed to send reset link. Please try again.');
        // Reset button state on error
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
        emailInput.disabled = false;
    }
};

// Toggle password visibility
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

