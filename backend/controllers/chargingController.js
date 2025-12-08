const chargingService = require('../services/chargingService');

/**
 * Start charging session
 * POST /api/user/charging/start (customer)
 * POST /api/cms/charging/start (CMS)
 */
async function startCharging(req, res) {
  try {
    const customerId = req.customer ? req.customer.id : null; // null for CMS
    const { deviceId, connectorId, amount, chargingPointId, vehicleId, idTag } = req.body;

    const result = await chargingService.startChargingSession({
      customerId,
      deviceId,
      connectorId,
      amount,
      chargingPointId,
      vehicleId,
      idTag
    });

    res.json(result);
  } catch (error) {
    console.error('Error starting charging session:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to start charging session'
    });
  }
}

/**
 * Stop charging session
 * POST /api/user/charging/stop (customer)
 * POST /api/cms/charging/stop (CMS)
 */
async function stopCharging(req, res) {
  try {
    const customerId = req.customer ? req.customer.id : null; // null for CMS
    const { deviceId, connectorId, transactionId, sessionId } = req.body;

    const result = await chargingService.stopChargingSession({
      customerId,
      deviceId,
      connectorId,
      transactionId,
      sessionId
    });

    res.json(result);
  } catch (error) {
    console.error('Error stopping charging session:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to stop charging session'
    });
  }
}

/**
 * Get active charging session
 * GET /api/user/charging/active-session (customer only)
 */
async function getActiveSession(req, res) {
  try {
    const customerId = req.customer.id;

    const session = await chargingService.getActiveSession(customerId);

    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error fetching active session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active session'
    });
  }
}

/**
 * Get sessions for customer
 * GET /api/user/sessions (customer only)
 */
async function getSessions(req, res) {
  try {
    const customerId = req.customer.id;
    const { fromDate, toDate, page, limit } = req.query;

    const filters = {
      fromDate: fromDate || null,
      toDate: toDate || null,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    };

    const result = await chargingService.getSessions(customerId, filters);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
}

/**
 * Get session by ID
 * GET /api/user/sessions/:sessionId (customer only)
 */
async function getSessionById(req, res) {
  try {
    const customerId = req.customer.id;
    const { sessionId } = req.params;

    const session = await chargingService.getSessionById(customerId, sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session'
    });
  }
}

module.exports = {
  startCharging,
  stopCharging,
  getActiveSession,
  getSessions,
  getSessionById
};

