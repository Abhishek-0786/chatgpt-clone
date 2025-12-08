const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const chatController = require('../controllers/chatController');

const router = express.Router();

// Get all chats for user
router.get('/', authenticateToken, chatController.getAllChats);

// Create new chat
router.post('/', authenticateToken, chatController.createChat);

// Get chat with messages
router.get('/:chatId', authenticateToken, chatController.getChat);

// Update chat settings (system instructions, AI model)
router.put('/:chatId', authenticateToken, chatController.updateChat);

// Send message and get AI response
router.post('/:chatId/messages', [
  authenticateToken,
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 4000 })
    .withMessage('Message too long')
], (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}, chatController.sendMessage);

// Delete chat
router.delete('/:chatId', authenticateToken, chatController.deleteChat);

module.exports = router;
