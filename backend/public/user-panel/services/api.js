// User Panel - API Service Layer
const API_BASE_URL = '/api/user';

// Helper function to get auth token
function getAuthToken() {
    return localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
}

// Helper function to get current user
function getCurrentUser() {
    const userStr = localStorage.getItem('currentUser');
    return userStr ? JSON.parse(userStr) : null;
}

// Export getCurrentUser
export { getCurrentUser };

// Generic API call function
async function apiCall(endpoint, options = {}) {
    const token = getAuthToken();
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };

    const config = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        // Handle non-JSON responses
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            throw new Error(`Server returned non-JSON response: ${text.substring(0, 100)}`);
        }

        // Handle 401 Unauthorized - token expired or invalid
        if (response.status === 401) {
            // Clear invalid token
            localStorage.removeItem('userToken');
            sessionStorage.removeItem('userToken');
            localStorage.removeItem('currentUser');
            
            // Redirect to login if not already on auth screen
            if (!window.location.href.includes('auth')) {
                window.location.href = '/user-panel';
            }
            
            throw new Error('Session expired. Please login again.');
        }

        if (!response.ok) {
            throw new Error(data.error || data.message || `API request failed with status ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        // Don't throw network errors for better UX
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Network error. Please check if the server is running.');
        }
        throw error;
    }
}

// ============================================
// AUTHENTICATION APIs
// ============================================

export async function login(email, password) {
    try {
        const response = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        return response;
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Login failed'
        };
    }
}

export async function register(userData) {
    try {
        const response = await apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        return response;
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Registration failed'
        };
    }
}

export async function logout() {
    return apiCall('/auth/logout', {
        method: 'POST'
    });
}

export async function getCurrentUserProfile() {
    try {
        return await apiCall('/auth/me');
    } catch (error) {
        console.error('[API] getCurrentUserProfile error:', error);
        return {
            success: false,
            error: error.message || 'Failed to fetch user profile'
        };
    }
}

export async function updateProfile(profileData) {
    try {
        const response = await apiCall('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
        return response;
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to update profile'
        };
    }
}

export async function changePassword(passwordData) {
    try {
        const response = await apiCall('/auth/change-password', {
            method: 'PUT',
            body: JSON.stringify(passwordData)
        });
        return response;
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to change password'
        };
    }
}

export async function forgotPassword(email) {
    try {
        const response = await apiCall('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        return response;
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to send reset link'
        };
    }
}

export async function resetPassword(token, password) {
    try {
        const response = await apiCall('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, password })
        });
        return response;
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to reset password'
        };
    }
}

// ============================================
// STATIONS APIs
// ============================================

export async function getStations(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    return apiCall(`/stations?${queryString}`);
}

export async function getStationDetails(stationId) {
    return apiCall(`/stations/${stationId}`);
}

export async function getStationChargingPoints(stationId) {
    return apiCall(`/stations/${stationId}/points`);
}

export async function getChargingPointDetail(chargingPointId) {
    try {
        return await apiCall(`/charging-points/${chargingPointId}`);
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to fetch charging point details'
        };
    }
}

// ============================================
// CHARGING CONTROL APIs
// ============================================

export async function startCharging(deviceId, connectorId, amount, chargingPointId = null, vehicleId = null) {
    try {
        return await apiCall('/charging/start', {
            method: 'POST',
            body: JSON.stringify({ 
                deviceId, 
                connectorId, 
                amount,
                chargingPointId,
                vehicleId
            })
        });
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to start charging'
        };
    }
}

export async function stopCharging(deviceId, connectorId, transactionId) {
    try {
        // Build request body - only include transactionId if it's valid
        const body = { deviceId, connectorId };
        if (transactionId && transactionId !== 'null' && transactionId !== 'undefined' && transactionId !== '') {
            body.transactionId = transactionId;
        }
        
        console.log('[API] Stop charging request:', body);
        
        const response = await apiCall('/charging/stop', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        
        console.log('[API] Stop charging response:', response);
        return response;
    } catch (error) {
        console.error('[API] Stop charging error:', error);
        return {
            success: false,
            error: error.message || 'Failed to stop charging'
        };
    }
}

export async function getActiveSession() {
    try {
        return await apiCall('/charging/active-session');
    } catch (error) {
        return {
            success: false,
            session: null,
            error: error.message || 'Failed to fetch active session'
        };
    }
}

// ============================================
// WALLET APIs
// ============================================

export async function getWalletBalance() {
    try {
        return await apiCall('/wallet/balance');
    } catch (error) {
        console.error('[API] getWalletBalance error:', error);
        return {
            success: false,
            balance: 0,
            error: error.message || 'Failed to fetch wallet balance'
        };
    }
}

export async function getWalletTransactions(params = {}) {
    try {
        const queryString = new URLSearchParams(params).toString();
        return await apiCall(`/wallet/transactions?${queryString}`);
    } catch (error) {
        console.error('[API] getWalletTransactions error:', error);
        return {
            success: false,
            transactions: [],
            error: error.message || 'Failed to fetch wallet transactions'
        };
    }
}

export async function createTopupOrder(amount) {
    try {
        return await apiCall('/wallet/topup', {
            method: 'POST',
            body: JSON.stringify({ amount })
        });
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to create top-up order'
        };
    }
}

export async function verifyTopupPayment(paymentData) {
    try {
        return await apiCall('/wallet/topup/verify', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        });
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to verify payment'
        };
    }
}

export async function recordFailedPayment(orderId, errorReason = null) {
    try {
        return await apiCall('/wallet/topup/failed', {
            method: 'POST',
            body: JSON.stringify({
                razorpay_order_id: orderId,
                error_reason: errorReason
            })
        });
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to record failed payment'
        };
    }
}

// ============================================
// VEHICLES APIs
// ============================================

export async function getVehicles() {
    try {
        return await apiCall('/vehicles');
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to fetch vehicles',
            vehicles: []
        };
    }
}

export async function getVehicle(vehicleId) {
    try {
        return await apiCall(`/vehicles/${vehicleId}`);
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to fetch vehicle'
        };
    }
}

export async function createVehicle(vehicleData) {
    try {
        return await apiCall('/vehicles', {
            method: 'POST',
            body: JSON.stringify(vehicleData)
        });
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to create vehicle'
        };
    }
}

export async function updateVehicle(vehicleId, vehicleData) {
    try {
        return await apiCall(`/vehicles/${vehicleId}`, {
            method: 'PUT',
            body: JSON.stringify(vehicleData)
        });
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to update vehicle'
        };
    }
}

export async function deleteVehicle(vehicleId) {
    try {
        return await apiCall(`/vehicles/${vehicleId}`, {
            method: 'DELETE'
        });
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Failed to delete vehicle'
        };
    }
}

// ============================================
// SESSIONS APIs
// ============================================

export async function getSessions(params = {}) {
    try {
        const queryString = new URLSearchParams(params).toString();
        return await apiCall(`/sessions?${queryString}`);
    } catch (error) {
        console.error('[API] getSessions error:', error);
        return {
            success: false,
            sessions: [],
            error: error.message || 'Failed to fetch sessions'
        };
    }
}

export async function getSessionDetails(sessionId) {
    return apiCall(`/sessions/${sessionId}`);
}

// ============================================
// EXPORT HELPERS
// ============================================

export { getAuthToken };

