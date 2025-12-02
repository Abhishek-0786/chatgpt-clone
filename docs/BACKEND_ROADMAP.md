# Backend Implementation Roadmap

## Current Status ✅
- ✅ Frontend modules complete (Charging Stations, Charging Points, Charging Sessions, Tariff Management, Customers)
- ✅ Mock API calls in `public/services/api.js`
- ✅ Express server setup with existing routes (auth, chat, charger)
- ✅ Database models exist (User, Chat, Message, Charger, ChargerData)

---

## Phase 1: Database Schema Design 📊

### 1.1 Charging Stations Table
```sql
CREATE TABLE charging_stations (
    id SERIAL PRIMARY KEY,
    station_id VARCHAR(255) UNIQUE NOT NULL,
    station_name VARCHAR(255) NOT NULL,
    organization VARCHAR(100) NOT NULL, -- 'massive_mobility' or '1c_ev_charging'
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) NOT NULL,
    pincode VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    status VARCHAR(50) NOT NULL, -- 'Active', 'Inactive', 'Maintenance'
    grid_phase VARCHAR(50) NOT NULL, -- 'Single Phase' or 'Three Phase'
    working_days TEXT[], -- Array of days: ['sunday', 'monday', ...]
    opening_time TIME,
    closing_time TIME,
    contact_person VARCHAR(255),
    contact_number VARCHAR(20),
    email VARCHAR(255),
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 1.2 Charging Points Table
```sql
CREATE TABLE charging_points (
    id SERIAL PRIMARY KEY,
    charging_point_name VARCHAR(255) NOT NULL,
    station_id VARCHAR(255) NOT NULL, -- Foreign key to charging_stations.station_id
    device_id VARCHAR(255) UNIQUE,
    tariff_id INTEGER, -- Foreign key to tariffs.id
    charger_type VARCHAR(50) NOT NULL, -- 'AC' or 'DC'
    phase VARCHAR(50) NOT NULL, -- 'Phase R', 'Phase Y', 'Phase B'
    oem_list VARCHAR(100) NOT NULL, -- 'Massive Mobility', 'EVRE', 'Okaya'
    max_power DECIMAL(10, 2),
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 1.3 Connectors Table
```sql
CREATE TABLE connectors (
    id SERIAL PRIMARY KEY,
    charging_point_id INTEGER NOT NULL, -- Foreign key to charging_points.id
    connector_id VARCHAR(10) NOT NULL, -- '1', '2', or '3'
    connector_type VARCHAR(50) NOT NULL, -- 'type2', 'ccs2', 'type1', 'gbt', 'nacs', 'ac_socket'
    power DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(charging_point_id, connector_id) -- One connector ID per charging point
);
```

### 1.4 Tariffs Table
```sql
CREATE TABLE tariffs (
    id SERIAL PRIMARY KEY,
    tariff_id VARCHAR(255) UNIQUE NOT NULL,
    tariff_name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL, -- 'INR' or 'USD'
    base_charges DECIMAL(10, 2) NOT NULL,
    tax DECIMAL(5, 2) NOT NULL, -- Percentage
    status VARCHAR(50) NOT NULL, -- 'Active' or 'Inactive'
    created_by VARCHAR(255),
    deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 1.5 Customers Table
```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255),
    default_vehicle VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 1.6 Wallet Transactions Table
```sql
CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL, -- Foreign key to customers.id
    transaction_type VARCHAR(50) NOT NULL, -- 'Credit' or 'Debit'
    amount DECIMAL(10, 2) NOT NULL,
    balance DECIMAL(10, 2) NOT NULL, -- Balance after transaction
    description TEXT,
    reference_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 1.7 Charging Sessions Table (if not exists)
```sql
CREATE TABLE charging_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    customer_id INTEGER, -- Foreign key to customers.id
    charging_point_id INTEGER NOT NULL, -- Foreign key to charging_points.id
    connector_id INTEGER, -- Foreign key to connectors.id
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    energy_consumed DECIMAL(10, 2), -- kWh
    billed_amount DECIMAL(10, 2),
    status VARCHAR(50) NOT NULL, -- 'Active', 'Completed', 'Cancelled'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Phase 2: Create Sequelize Models 🗂️

### Files to Create:
1. `models/ChargingStation.js`
2. `models/ChargingPoint.js`
3. `models/Connector.js`
4. `models/Tariff.js`
5. `models/Customer.js`
6. `models/WalletTransaction.js`
7. `models/ChargingSession.js` (if not exists)

### Update `models/index.js` to include all new models

---

## Phase 3: Create Backend API Routes 🛣️

### Create `routes/cms.js` with following endpoints:

#### Charging Stations Routes:
- `GET /api/cms/stations` - Get all stations (with filters, pagination, soft delete filter)
- `GET /api/cms/stations/:stationId` - Get single station details
- `POST /api/cms/stations` - Create new station
- `PUT /api/cms/stations/:stationId` - Update station
- `DELETE /api/cms/stations/:stationId` - Soft delete station (set deleted = true)

#### Charging Points Routes:
- `GET /api/cms/points` - Get all charging points (with filters, pagination, soft delete filter)
- `GET /api/cms/points/:pointId` - Get single charging point details
- `POST /api/cms/points` - Create new charging point (with connectors)
- `PUT /api/cms/points/:pointId` - Update charging point
- `DELETE /api/cms/points/:pointId` - Soft delete charging point

#### Tariff Management Routes:
- `GET /api/cms/tariffs` - Get all tariffs (with pagination, soft delete filter)
- `GET /api/cms/tariffs/:tariffId` - Get single tariff details
- `POST /api/cms/tariffs` - Create new tariff
- `PUT /api/cms/tariffs/:tariffId` - Update tariff
- `DELETE /api/cms/tariffs/:tariffId` - Soft delete tariff

#### Customers Routes:
- `GET /api/cms/customers` - Get all customers (with search, date filters)
- `GET /api/cms/customers/:customerId` - Get single customer details
- `GET /api/cms/customers/:customerId/wallet-transactions` - Get wallet transactions

#### Charging Sessions Routes:
- `GET /api/cms/sessions` - Get all sessions (with filters, pagination)

---

## Phase 4: Connect Frontend to Backend 🔌

### Update `public/services/api.js`:
- Replace all `TODO` comments with actual `fetch()` calls
- Update `API_BASE_URL` if needed
- Handle errors properly
- Add authentication headers if required

### Example:
```javascript
export async function getChargingStations(params = {}) {
    try {
        const queryString = new URLSearchParams(params).toString();
        const response = await fetch(`${API_BASE_URL}/stations?${queryString}`, {
            headers: {
                'Content-Type': 'application/json',
                // Add auth token if needed
                // 'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching charging stations:', error);
        throw error;
    }
}
```

---

## Phase 5: Implementation Order 📋

### Step 1: Database Setup
1. Create all database tables (using migrations or direct SQL)
2. Test database connections

### Step 2: Models
1. Create all Sequelize models
2. Define relationships between models
3. Test model associations

### Step 3: Routes (Priority Order)
1. **Tariff Management** (simplest, no dependencies)
   - Create, Read, Delete, Update
   
2. **Charging Stations** (depends on nothing)
   - Create, Read, Delete, Update
   
3. **Charging Points** (depends on Stations and Tariffs)
   - Create, Read, Delete, Update
   - Handle connectors creation
   
4. **Customers** (standalone)
   - Read operations
   - Wallet transactions
   
5. **Charging Sessions** (depends on Points and Customers)
   - Read operations

### Step 4: Frontend Integration
1. Update `api.js` one module at a time
2. Test each module after integration
3. Handle error cases

### Step 5: Testing
1. Test all CRUD operations
2. Test soft delete functionality
3. Test filters and pagination
4. Test form validations
5. Test error handling

---

## Phase 6: Additional Features 🎯

### After Basic CRUD:
1. **Edit Functionality**
   - Pre-fill forms with existing data
   - Update API calls

2. **View Details Pages**
   - Station details page
   - Charging point details page
   - Customer details page

3. **Image Upload** (for Charging Stations)
   - AWS S3 integration
   - Image upload endpoint
   - Image URL storage in database

4. **Authentication & Authorization**
   - Protect CMS routes with JWT
   - Role-based access control (if needed)

5. **Data Validation**
   - Server-side validation
   - Input sanitization
   - SQL injection prevention

---

## Quick Start Checklist ✅

- [ ] Design database schema
- [ ] Create database tables
- [ ] Create Sequelize models
- [ ] Create `routes/cms.js`
- [ ] Add CMS routes to `server.js`
- [ ] Implement Charging Stations API
- [ ] Implement Charging Points API
- [ ] Implement Tariff Management API
- [ ] Implement Customers API
- [ ] Implement Charging Sessions API
- [ ] Update `public/services/api.js` with real API calls
- [ ] Test all endpoints
- [ ] Test frontend-backend integration
- [ ] Add error handling
- [ ] Add authentication (if needed)

---

## Notes 📝

1. **Soft Delete**: All delete operations should set `deleted = true` instead of actually deleting records
2. **Filtering**: All GET endpoints should filter out records where `deleted = true`
3. **Pagination**: Implement pagination for list endpoints
4. **Error Handling**: Always return proper error messages and status codes
5. **Validation**: Validate all inputs on the server side
6. **Relationships**: Properly define foreign key relationships in models

---

## Next Immediate Steps 🚀

1. **Start with Database Schema** - Create all tables
2. **Create Models** - Start with Tariff (simplest)
3. **Create Routes** - Start with Tariff routes
4. **Test** - Use Postman or similar to test endpoints
5. **Connect Frontend** - Update `api.js` for Tariff module
6. **Repeat** - Move to next module (Charging Stations)

---

**Ready to start? Let me know which phase you want to begin with!** 🎯

