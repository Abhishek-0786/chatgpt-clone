# MVC Refactoring Plan for Large Route Files

## Files to Refactor
1. `backend/routes/customer.js` (4253 lines)
2. `backend/routes/charger.js` (~1600 lines)
3. `backend/routes/cms.js` (~7000+ lines)

## Service Files to Create

### Customer Domain
- `backend/services/customerService.js` - Customer auth, profile, vehicles
- `backend/services/walletService.js` - Wallet operations, transactions
- `backend/services/paymentService.js` - Payment processing, Razorpay integration
- `backend/services/chargingService.js` - Charging session start/stop, meter calculations
- `backend/services/stationService.js` - Station listing, details (already created)

### Charger Domain
- `backend/services/chargerService.js` - Charger management, OCPP commands, data sync

### CMS Domain
- `backend/services/cmsService.js` - CMS dashboard, customer management
- `backend/services/tariffService.js` - Tariff CRUD operations
- `backend/services/chargingPointService.js` - Charging point management

## Controller Files to Create

### Customer Domain
- `backend/controllers/customerController.js` - Customer auth, profile, vehicles
- `backend/controllers/walletController.js` - Wallet balance, transactions
- `backend/controllers/paymentController.js` - Payment topup, webhook
- `backend/controllers/chargingController.js` - Charging start/stop
- `backend/controllers/stationController.js` - Station listing, details

### Charger Domain
- `backend/controllers/chargerController.js` - Charger operations

### CMS Domain
- `backend/controllers/cmsController.js` - CMS operations
- `backend/controllers/tariffController.js` - Tariff operations
- `backend/controllers/chargingPointController.js` - Charging point operations

## Helper Functions to Move to Libs

- `extractMeterValue()` → `backend/libs/ocpp.js` (if not already there)
- `generateSessionId()` → `backend/libs/chargingHelpers.js` (new file)
- `getOrCreateWallet()` → `backend/services/walletService.js`

## Refactoring Strategy

1. **Phase 1**: Create service files with business logic
2. **Phase 2**: Create controller files that call services
3. **Phase 3**: Update routes to only validate and call controllers
4. **Phase 4**: Update all imports
5. **Phase 5**: Test and verify

## Critical Safety Rules

- DO NOT change wallet deduction/refund logic
- DO NOT change payment processing logic
- DO NOT change charging session flow
- DO NOT change DB queries or table structure
- DO NOT change RabbitMQ queue names or message schema
- DO NOT alter OCPP logic

