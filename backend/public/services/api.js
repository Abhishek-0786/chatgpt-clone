// API Service Layer - All API calls go here
// This makes it easy to switch from mock data to real backend

const API_BASE_URL = '/api/cms';

// Charging Stations API
export async function getChargingStations(params = {}) {
    try {
        // Build query parameters
        const queryParams = {
            page: params.page || 1,
            limit: params.limit || 10
        };
        
        // Add search parameter if provided
        if (params.search) {
            queryParams.search = params.search;
        }
        
        // Add status filter if provided
        if (params.status) {
            queryParams.status = params.status;
        }
        
        // Add organization filter if provided
        if (params.organization) {
            queryParams.organization = params.organization;
        }
        
        const queryString = new URLSearchParams(queryParams).toString();
        const response = await fetch(`${API_BASE_URL}/stations?${queryString}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching charging stations:', error);
        throw error;
    }
}


// Get Charging Points for a Station API
export async function getStationChargingPoints(stationId, params = {}) {
    try {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`${API_BASE_URL}/stations/${stationId}/points?${queryString}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching station charging points:', error);
        throw error;
    }
}

// Get Charging Sessions for a Station API
export async function getStationSessions(stationId, params = {}) {
    try {
        // TODO: Replace with actual API call
        // const queryString = new URLSearchParams(params).toString();
        // const response = await fetch(`${API_BASE_URL}/stations/${stationId}/sessions?${queryString}`, {
        //     method: 'GET',
        //     headers: {
        //         'Content-Type': 'application/json'
        //     }
        // });
        // 
        // if (!response.ok) {
        //     const errorData = await response.json().catch(() => ({}));
        //     throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        // }
        // 
        // const data = await response.json();
        // return data;
        
        // Mock data for now - empty sessions
        return {
            success: true,
            sessions: [],
            total: 0
        };
    } catch (error) {
        console.error('Error fetching station sessions:', error);
        throw error;
    }
}

// Charging Points API
export async function getChargingPoints(params = {}) {
    try {
        // Build query parameters
        const queryParams = {
            page: params.page || 1,
            limit: params.limit || 10
        };
        
        // Add search parameter if provided
        if (params.search) {
            queryParams.search = params.search;
        }
        
        // Add status filter if provided
        if (params.status) {
            queryParams.status = params.status;
        }
        
        // Add stationId filter if provided
        if (params.stationId) {
            queryParams.stationId = params.stationId;
        }
        
        const queryString = new URLSearchParams(queryParams).toString();
        const response = await fetch(`${API_BASE_URL}/charging-points?${queryString}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching charging points:', error);
        throw error;
    }
}

// Charging Sessions API
// Get active charging sessions
export async function getActiveSessions(params = {}) {
    try {
        const { page = 1, limit = 10, search = '' } = params;
        const queryParams = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString()
        });
        
        if (search) {
            queryParams.append('search', search);
        }
        
        const response = await fetch(`/api/cms/sessions/active?${queryParams.toString()}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        throw error;
    }
}

// Get completed charging sessions
export async function getCompletedSessions(params = {}) {
    try {
        const { page = 1, limit = 10, search = '', fromDate = '', toDate = '' } = params;
        const queryParams = new URLSearchParams({
            page: page.toString(),
            limit: limit.toString()
        });
        
        if (search) {
            queryParams.append('search', search);
        }
        
        if (fromDate) {
            queryParams.append('fromDate', fromDate);
        }
        
        if (toDate) {
            queryParams.append('toDate', toDate);
        }
        
        const response = await fetch(`/api/cms/sessions/completed?${queryParams.toString()}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching completed sessions:', error);
        throw error;
    }
}

// Legacy function for backward compatibility
export async function getChargingSessions(params = {}) {
    // TODO: Replace with actual API call
    // return await fetch(`${API_BASE_URL}/sessions?${new URLSearchParams(params)}`).then(res => res.json());
    
    return {
        sessions: [],
        total: 0,
        page: params.page || 1,
        limit: params.limit || 10
    };
}

// Tariff Management API
export async function getTariffs(params = {}) {
    try {
        // If params are provided (for tariff management list), use paginated endpoint
        if (Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`${API_BASE_URL}/tariffs?${queryString}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.errors?.[0]?.msg || errorData.error || errorData.message || `HTTP error! status: ${response.status}`;
                throw new Error(errorMessage);
            }
            
            const data = await response.json();
            return data;
        }
        
        // If no params (for charging point form dropdown), use dropdown endpoint
        const response = await fetch(`${API_BASE_URL}/tariffs/dropdown`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching tariffs:', error);
        throw error;
    }
}

// Customers API
export async function getCustomers(params = {}) {
    try {
        // Build query parameters
        const queryParams = {};
        
        if (params.searchTerm) {
            queryParams.searchTerm = params.searchTerm;
        }
        
        if (params.fromDate) {
            queryParams.fromDate = params.fromDate;
        }
        
        if (params.toDate) {
            queryParams.toDate = params.toDate;
        }
        
        const queryString = new URLSearchParams(queryParams).toString();
        const url = queryString ? `${API_BASE_URL}/customers?${queryString}` : `${API_BASE_URL}/customers`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching customers:', error);
        throw error;
    }
}

// Get Customer Details API
export async function getCustomerDetails(customerId) {
    try {
        const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching customer details:', error);
        throw error;
    }
}

// Get Customer Vehicles API
export async function getCustomerVehicles(customerId) {
    try {
        const response = await fetch(`${API_BASE_URL}/customers/${customerId}/vehicles`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching customer vehicles:', error);
        throw error;
    }
}

// Get Customer Sessions API
export async function getCustomerSessions(customerId, params = {}) {
    try {
        const queryParams = {};
        
        if (params.fromDate) {
            queryParams.fromDate = params.fromDate;
        }
        
        if (params.toDate) {
            queryParams.toDate = params.toDate;
        }
        
        if (params.page) {
            queryParams.page = params.page;
        }
        
        if (params.limit) {
            queryParams.limit = params.limit;
        }
        
        const queryString = new URLSearchParams(queryParams).toString();
        const url = queryString 
            ? `${API_BASE_URL}/customers/${customerId}/sessions?${queryString}` 
            : `${API_BASE_URL}/customers/${customerId}/sessions`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching customer sessions:', error);
        throw error;
    }
}

// Customer Wallet Transactions API
export async function getCustomerWalletTransactions(customerId, params = {}) {
    try {
        // Build query parameters
        const queryParams = {};
        
        if (params.fromDate) {
            queryParams.fromDate = params.fromDate;
        }
        
        if (params.toDate) {
            queryParams.toDate = params.toDate;
        }
        
        const queryString = new URLSearchParams(queryParams).toString();
        const url = queryString 
            ? `${API_BASE_URL}/customers/${customerId}/wallet-transactions?${queryString}` 
            : `${API_BASE_URL}/customers/${customerId}/wallet-transactions`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching customer wallet transactions:', error);
        throw error;
    }
}

// Create Charging Station API
export async function createStation(formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/stations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Show validation errors if available
            if (errorData.errors && errorData.errors.length > 0) {
                const errorMessages = errorData.errors.map(err => err.msg || err.message).join(', ');
                throw new Error(errorMessages);
            }
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating station:', error);
        throw error;
    }
}

// Get Stations for Dropdown API
export async function getStationsForDropdown() {
    try {
        const response = await fetch(`${API_BASE_URL}/stations/dropdown`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching stations for dropdown:', error);
        throw error;
    }
}

// Get Charging Station API
export async function getChargingStation(stationId) {
    try {
        const response = await fetch(`${API_BASE_URL}/stations/${stationId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching charging station:', error);
        throw error;
    }
}

// Update Charging Station API
export async function updateStation(stationId, formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/stations/${stationId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Show validation errors if available
            if (errorData.errors && errorData.errors.length > 0) {
                const errorMessages = errorData.errors.map(err => err.msg || err.message).join(', ');
                throw new Error(errorMessages);
            }
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating station:', error);
        throw error;
    }
}

// Delete Charging Station API (Soft Delete - sets deleted = true)
export async function deleteChargingStation(stationId) {
    try {
        const response = await fetch(`${API_BASE_URL}/stations/${stationId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting station:', error);
        throw error;
    }
}


// Create Charging Point API
export async function createChargingPoint(formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/charging-points`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Show validation errors if available
            if (errorData.errors && errorData.errors.length > 0) {
                const errorMessages = errorData.errors.map(err => err.msg || err.message).join(', ');
                throw new Error(errorMessages);
            }
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating charging point:', error);
        throw error;
    }
}

// Get Single Charging Point API
export async function getChargingPoint(chargingPointId) {
    try {
        const response = await fetch(`${API_BASE_URL}/charging-points/${chargingPointId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching charging point:', error);
        throw error;
    }
}

// Update Charging Point API
export async function updateChargingPoint(chargingPointId, formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/charging-points/${chargingPointId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Show validation errors if available
            if (errorData.errors && errorData.errors.length > 0) {
                const errorMessages = errorData.errors.map(err => err.msg || err.message).join(', ');
                throw new Error(errorMessages);
            }
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating charging point:', error);
        throw error;
    }
}

// Delete Charging Point API (Soft Delete - sets deleted = true)
export async function deleteChargingPoint(chargingPointId) {
    try {
        const response = await fetch(`${API_BASE_URL}/charging-points/${chargingPointId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting charging point:', error);
        throw error;
    }
}

// Create Tariff API
export async function createTariff(formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/tariffs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Show validation errors if available
            if (errorData.errors && errorData.errors.length > 0) {
                const errorMessages = errorData.errors.map(err => err.msg || err.message).join(', ');
                throw new Error(errorMessages);
            }
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating tariff:', error);
        throw error;
    }
}

// Update Tariff API
export async function updateTariff(tariffId, formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/tariffs/${tariffId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Show validation errors if available
            if (errorData.errors && errorData.errors.length > 0) {
                const errorMessages = errorData.errors.map(err => err.msg || err.message).join(', ');
                throw new Error(errorMessages);
            }
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating tariff:', error);
        throw error;
    }
}

// Get Single Tariff API
export async function getTariff(tariffId) {
    try {
        const response = await fetch(`${API_BASE_URL}/tariffs/${tariffId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching tariff:', error);
        throw error;
    }
}

// Delete Tariff API (Soft Delete - sets deleted = true)
export async function deleteTariff(tariffId) {
    try {
        const response = await fetch(`${API_BASE_URL}/tariffs/${tariffId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting tariff:', error);
        throw error;
    }
}

