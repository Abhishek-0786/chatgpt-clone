# User Panel - Testing Guide

## How to Access

1. **Start your server** (if not already running):
   ```bash
   npm start
   # or
   node server.js
   ```

2. **Open in browser**:
   - Navigate to: `http://localhost:3000/user-panel.html`
   - Or: `http://localhost:3000/user-panel/user-panel.html` (if using subdirectory)

## Responsive Design

### Mobile View (< 768px)
- Bottom navigation bar
- Full-width cards
- Touch-friendly buttons

### Tablet View (768px - 1023px)
- Bottom navigation still visible
- Larger padding and spacing
- Better card layouts

### Desktop View (≥ 1024px)
- **Sidebar navigation** (left side)
- **Main content area** (right side)
- Bottom navigation hidden
- Grid layouts for better organization

## Testing Different Screen Sizes

### In Browser:
1. Open Developer Tools (F12)
2. Click the device toggle icon (or press `Ctrl+Shift+M`)
3. Select different device sizes or use custom dimensions

### Test Breakpoints:
- **Mobile**: 375px, 414px (iPhone sizes)
- **Tablet**: 768px, 1024px
- **Desktop**: 1280px, 1920px

## Current Features to Test

### ✅ Working (Frontend Only):
- [x] Login/Register UI
- [x] Dashboard layout
- [x] Stations list view
- [x] Wallet UI
- [x] Sessions list
- [x] Profile page
- [x] Navigation (mobile & desktop)
- [x] Responsive design

### ⚠️ Needs Backend:
- [ ] Authentication API (`/api/user/auth/login`, `/api/user/auth/register`)
- [ ] Stations API (`/api/user/stations`)
- [ ] Wallet API (`/api/user/wallet/*`)
- [ ] Sessions API (`/api/user/sessions`)
- [ ] Profile API (`/api/user/auth/me`)

## Testing Flow

1. **Open the page** → Should show login screen
2. **Try to login** → Will show error (backend not implemented yet)
3. **Check responsive design** → Resize browser window
4. **Test navigation** → Click different tabs (will show empty states)
5. **Check desktop view** → Resize to > 1024px width to see sidebar

## Mock Testing (Without Backend)

To test the UI without backend errors, you can:

1. **Temporarily modify `checkAuth()` in `modules/auth.js`**:
   ```javascript
   export async function checkAuth() {
       // For testing: return true to skip login
       return true; // Change to false for real auth
   }
   ```

2. **Or add mock data** in API service layer

## Next Steps

1. Implement backend APIs in `routes/user.js` (or similar)
2. Connect frontend to real APIs
3. Add real-time features (WebSocket)
4. Implement payment gateway (Razorpay)

