# CMS Dashboard - Recommended Components

Based on the existing CMS modules and available backend APIs, here's what should be present in the dashboard:

## 1. Key Metrics Cards (Top Section)
**Already implemented, but can be enhanced:**

- ✅ **Total Customers** - With month-over-month change
- ✅ **Active Sessions** - Currently charging sessions
- ✅ **Total Sessions** - All-time sessions count
- ✅ **Total Revenue** - Sum of all completed sessions
- ✅ **Energy Delivered** - Total kWh delivered
- ✅ **Charging Stations** - Total stations with online count
- ✅ **Charging Points** - Total chargers with available count
- ✅ **Avg Session Duration** - Average time per session

**Enhancements to add:**
- **Today's Revenue** - Revenue generated today
- **Today's Sessions** - Sessions started today
- **Today's Energy** - Energy delivered today
- **Offline Stations** - Count of offline stations (alert if > 0)
- **Faulted Chargers** - Count of chargers with faults (alert if > 0)

---

## 2. Station Status Overview
**New section to add:**

Visual breakdown showing:
- **Online Stations** - Count and percentage
- **Offline Stations** - Count and percentage (with alert if any)
- **Total Stations** - Visual pie/bar chart
- **Quick View** - List of offline stations (if any) with link to stations module

---

## 3. Charger Status Overview
**New section to add:**

Visual breakdown showing:
- **Available Chargers** - Ready to use
- **Busy Chargers** - Currently charging
- **Unavailable Chargers** - Offline or maintenance
- **Faulted Chargers** - With issues (alert)
- **Visual Chart** - Pie chart or bar chart showing distribution
- **Quick View** - List of faulted chargers (if any) with link to charging points module

---

## 4. Revenue & Sessions Trends
**Charts section (currently placeholders):**

### Sessions Overview Chart
- Line/Area chart showing sessions over time
- Period selector: Last 7 Days / Last 30 Days / Last 90 Days
- Show daily/weekly session counts
- Include active vs completed sessions

### Revenue Overview Chart
- Bar/Line chart showing revenue over time
- Same period selector
- Show daily/weekly revenue
- Include trend indicators (up/down arrows)

**Additional charts to add:**
- **Energy Delivered Trend** - kWh delivered over time
- **Average Session Duration Trend** - How duration changes over time
- **Peak Hours Chart** - When most sessions occur (hourly breakdown)

---

## 5. Recent Activity Sections
**Already implemented, but can be enhanced:**

### Recent Sessions
- ✅ Last 5-10 sessions
- ✅ Customer name, station, amount, time
- ✅ Link to view all sessions
- **Enhancement:** Add status badge (Active/Completed/Stopped)
- **Enhancement:** Add energy consumed
- **Enhancement:** Click to view session details

### Recent Customers
- ✅ Last 5-10 new customers
- ✅ Name, phone, registration date
- ✅ Link to view all customers
- **Enhancement:** Add customer status (Active/Inactive)
- **Enhancement:** Add total sessions count for each
- **Enhancement:** Click to view customer ledger

---

## 6. Quick Stats (Today vs Overall)
**New section to add:**

Side-by-side comparison:
- **Today's Stats:**
  - Sessions today
  - Revenue today
  - Energy today
  - New customers today
  
- **This Week's Stats:**
  - Sessions this week
  - Revenue this week
  - Energy this week
  - New customers this week

- **This Month's Stats:**
  - Sessions this month
  - Revenue this month
  - Energy this month
  - New customers this month

---

## 7. Top Performing Stations
**New section to add:**

Table/cards showing:
- **Top 5 Stations by Revenue**
  - Station name
  - Total revenue
  - Total sessions
  - Energy delivered
  - Link to station details

- **Top 5 Stations by Sessions**
  - Station name
  - Session count
  - Average revenue per session
  - Link to station details

---

## 8. Alerts & Notifications
**New section to add:**

Alert cards for:
- ⚠️ **Offline Stations** - List stations that are offline
- ⚠️ **Faulted Chargers** - List chargers with faults
- ⚠️ **Low Balance Customers** - Customers with wallet balance < ₹100
- ⚠️ **Failed Payments** - Recent failed payment attempts
- ℹ️ **Maintenance Due** - Stations/chargers due for maintenance (if tracking)

---

## 9. Quick Actions
**New section to add:**

Quick action buttons:
- ➕ **Add New Station** - Link to add station form
- ➕ **Add New Charging Point** - Link to add charging point form
- ➕ **Add New Tariff** - Link to tariff management
- 📊 **View Reports** - Link to detailed reports (if exists)
- 🔄 **Refresh Data** - Manual refresh button

---

## 10. System Health
**New section to add:**

Health indicators:
- **API Status** - Backend connectivity
- **Database Status** - Database connectivity
- **OCPP Status** - OCPP server status (if applicable)
- **Last Data Sync** - When data was last updated

---

## Backend API Enhancements Needed

To support the above features, the backend API `/api/cms/dashboard/stats` should be enhanced to return:

```javascript
{
  // Existing stats...
  
  // New additions:
  todayStats: {
    sessions: 0,
    revenue: 0,
    energy: 0,
    newCustomers: 0
  },
  weekStats: {
    sessions: 0,
    revenue: 0,
    energy: 0,
    newCustomers: 0
  },
  monthStats: {
    sessions: 0,
    revenue: 0,
    energy: 0,
    newCustomers: 0
  },
  stationStatus: {
    online: 0,
    offline: 0,
    offlineStations: [] // List of offline station names
  },
  chargerStatus: {
    available: 0,
    busy: 0,
    unavailable: 0,
    faulted: 0,
    faultedChargers: [] // List of faulted charger names
  },
  topStationsByRevenue: [], // Top 5 stations
  topStationsBySessions: [], // Top 5 stations
  alerts: {
    offlineStations: [],
    faultedChargers: [],
    lowBalanceCustomers: []
  },
  trends: {
    sessions: [], // Daily data for selected period
    revenue: [], // Daily data for selected period
    energy: [] // Daily data for selected period
  }
}
```

---

## Priority Implementation Order

1. **High Priority:**
   - Station Status Overview
   - Charger Status Overview
   - Today's Stats section
   - Alerts section (offline stations, faulted chargers)

2. **Medium Priority:**
   - Revenue & Sessions Trends charts (implement actual charts)
   - Top Performing Stations
   - Enhanced Recent Activity (with click actions)

3. **Low Priority:**
   - Quick Actions section
   - System Health indicators
   - Peak Hours chart
   - Additional trend charts

---

## Design Recommendations

- Use **Chart.js** or **ApexCharts** for visualizations
- Keep the existing color scheme and design language
- Make cards clickable where appropriate (link to relevant modules)
- Add loading states for all data sections
- Implement auto-refresh every 30-60 seconds for real-time data
- Make it responsive for mobile/tablet views

---

## Summary

The dashboard should provide:
1. **Quick Overview** - Key metrics at a glance
2. **Status Monitoring** - Station and charger health
3. **Trend Analysis** - Visual charts for revenue, sessions, energy
4. **Recent Activity** - Latest sessions and customers
5. **Alerts** - Important issues that need attention
6. **Quick Access** - Links to all major modules
7. **Performance Insights** - Top performing stations

This will give administrators a complete picture of their charging network at a glance.

