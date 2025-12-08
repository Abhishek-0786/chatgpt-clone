/**
 * Logs Routes
 * REST API fallback for when RabbitMQ is disabled
 * TODO: Remove REST fallback after full microservice migration
 */

const express = require('express');
const router = express.Router();
const logsController = require('../controllers/logsController');

/**
 * Store log (REST API fallback for when RabbitMQ is disabled)
 * POST /api/logs/store
 */
router.post('/store', logsController.storeLog);

module.exports = router;

