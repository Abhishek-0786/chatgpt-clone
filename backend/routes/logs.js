/**
 * Logs Routes
 * REST API fallback for when RabbitMQ is disabled
 * TODO: Remove REST fallback after full microservice migration
 */

const express = require('express');
const router = express.Router();
const Charger = require('../models/Charger');
const ChargerData = require('../models/ChargerData');

/**
 * Store log (REST API fallback for when RabbitMQ is disabled)
 * POST /api/logs/store
 */
router.post('/store', async (req, res) => {
  try {
    const { deviceId, messageType, payload, direction, rawMessage, timestamp } = req.body;

    if (!deviceId || !messageType) {
      return res.status(400).json({
        success: false,
        error: 'deviceId and messageType are required'
      });
    }

    // Find or create charger
    let charger = await Charger.findOne({
      where: { deviceId },
      attributes: { exclude: ['chargerStatus'] }
    });

    if (!charger) {
      charger = await Charger.create({
        deviceId,
        name: deviceId,
        status: 'Available',
        vendor: 'Unknown',
        model: 'Unknown',
        serialNumber: 'Unknown',
        firmwareVersion: 'Unknown',
        connectorCount: 0,
        powerRating: 0
      });
    }

    // Extract connectorId from payload
    let connectorId = 0;
    if (payload && typeof payload.connectorId !== 'undefined') {
      connectorId = payload.connectorId || 0;
    }

    // Extract messageId from payload
    let messageId = null;
    if (payload && payload.id) {
      messageId = payload.id.toString();
    } else if (payload && payload.transactionId) {
      messageId = payload.transactionId.toString();
    }

    // Store log in database
    await ChargerData.create({
      chargerId: charger.id,
      deviceId,
      type: 'OCPP',
      connectorId,
      messageId,
      message: messageType,
      messageData: payload || {},
      raw: rawMessage || JSON.stringify(payload || {}),
      direction: direction || 'Incoming',
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    res.json({
      success: true,
      message: 'Log stored successfully'
    });
  } catch (error) {
    // Handle duplicate key errors gracefully
    if (error.name === 'SequelizeUniqueConstraintError' || 
        error.name === 'SequelizeValidationError') {
      return res.json({
        success: true,
        message: 'Log already exists (duplicate)'
      });
    }

    console.error('❌ Error storing log:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

