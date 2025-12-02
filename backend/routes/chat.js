const express = require('express');
const { body, validationResult } = require('express-validator');
const { Chat, Message, User } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const https = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const router = express.Router();

// Function to call OpenAI API
const callOpenAIAPI = async (messages, systemInstructions) => {
  try {
    const messagesArray = [];
    
    if (systemInstructions && systemInstructions.trim()) {
      console.log('Adding system instructions to OpenAI:', systemInstructions);
      messagesArray.push({
        role: 'system',
        content: systemInstructions
      });
    } else {
      console.log('No system instructions for OpenAI');
    }

    messagesArray.push(...messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    })));

    // Try gpt-5-nano first, fallback to gpt-4o-mini
    let response;
    try {
      response = await openai.chat.completions.create({
        model: 'gpt-5-nano',
        messages: messagesArray,
        max_tokens: 1000,
        temperature: 0.7
      });
    } catch (modelError) {
      console.log('gpt-5-nano not available, trying gpt-4o-mini...');
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messagesArray,
        max_tokens: 1000,
        temperature: 0.7
      });
    }

    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    if (error.code === 'invalid_api_key') {
      throw new Error('Invalid OpenAI API key. Please check your API key.');
    } else if (error.code === 'model_not_found') {
      throw new Error('Model not found. Please check the model name.');
    } else if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please check your billing.');
    } else {
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }
};

// Function to call Gemini API directly
const callGeminiAPI = (prompt) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('Gemini API Key:', apiKey ? 'Present' : 'Missing');
    console.log('Gemini prompt (first 200 chars):', prompt.substring(0, 200) + '...');
    
    const data = JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    });
    
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: '/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.candidates && result.candidates[0] && result.candidates[0].content) {
            resolve(result.candidates[0].content.parts[0].text);
          } else {
            reject(new Error('Invalid response from Gemini API: ' + JSON.stringify(result)));
          }
        } catch (error) {
          reject(new Error('Error parsing Gemini response: ' + error.message));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error('Request to Gemini API failed: ' + error.message));
    });
    
    req.write(data);
    req.end();
  });
};

// Get all chats for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const chats = await Chat.findAll({
      where: { userId: req.user.id },
      order: [['updatedAt', 'DESC']],
      include: [{
        model: Message,
        as: 'messages',
        limit: 1,
        order: [['createdAt', 'DESC']]
      }]
    });

    res.json({ chats });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new chat
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title = 'New Chat' } = req.body;
    
    const chat = await Chat.create({
      userId: req.user.id,
      title
    });

    res.status(201).json({ chat });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get chat with messages
router.get('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const chat = await Chat.findOne({
      where: { 
        id: chatId, 
        userId: req.user.id 
      },
      include: [{
        model: Message,
        as: 'messages',
        order: [['createdAt', 'ASC']]
      }]
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ chat });
  } catch (error) {
    console.error('Error fetching chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update chat settings (system instructions, AI model)
router.put('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { systemInstructions, aiModel } = req.body;
    
    // Verify chat belongs to user
    const chat = await Chat.findOne({
      where: { 
        id: chatId, 
        userId: req.user.id 
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Update chat settings
    if (systemInstructions !== undefined) {
      chat.systemInstructions = systemInstructions;
    }
    if (aiModel !== undefined) {
      chat.aiModel = aiModel;
    }
    
    await chat.save();

    res.json({ 
      message: 'Chat settings updated successfully',
      chat: {
        id: chat.id,
        systemInstructions: chat.systemInstructions,
        aiModel: chat.aiModel
      }
    });
  } catch (error) {
    console.error('Error updating chat:', error);
    res.status(500).json({ error: 'Failed to update chat settings' });
  }
});

// Send message and get AI response
router.post('/:chatId/messages', [
  authenticateToken,
  body('content')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 4000 })
    .withMessage('Message too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { chatId } = req.params;
    const { content, systemInstructions, aiModel } = req.body;

    // Verify chat belongs to user
    const chat = await Chat.findOne({
      where: { 
        id: chatId, 
        userId: req.user.id 
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Update chat with system instructions and AI model if provided
    if (systemInstructions !== undefined) {
      chat.systemInstructions = systemInstructions;
    }
    if (aiModel !== undefined) {
      chat.aiModel = aiModel;
    }
    await chat.save();

    // Save user message
    const userMessage = await Message.create({
      chatId: chat.id,
      role: 'user',
      content
    });

    // Get chat history for context (excluding the user message we just created)
    const messages = await Message.findAll({
      where: { chatId: chat.id },
      order: [['createdAt', 'ASC']],
      limit: 20 // Limit context to last 20 messages
    });
    
    // Check if this is the first message (before we added the user message)
    const isFirstMessage = messages.length === 1; // Only the user message we just created

    // Get AI response based on selected model
    let aiResponse;
    if (chat.aiModel === 'openai') {
      console.log('Using OpenAI API with system instructions:', chat.systemInstructions);
      const openaiMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      aiResponse = await callOpenAIAPI(openaiMessages, chat.systemInstructions);
    } else {
      console.log('Using Gemini API with system instructions:', chat.systemInstructions);
      // Convert messages to Gemini format
      const prompt = messages.map(msg => 
        `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`
      ).join('\n\n') + '\n\nAssistant:';
      
      // Add system instructions to prompt if available
      let fullPrompt = prompt;
      if (chat.systemInstructions && chat.systemInstructions.trim()) {
        fullPrompt = `System Instructions: ${chat.systemInstructions}\n\n${prompt}`;
        console.log('Full prompt with system instructions:', fullPrompt.substring(0, 200) + '...');
      } else {
        console.log('No system instructions provided');
      }
      
      aiResponse = await callGeminiAPI(fullPrompt);
    }
    
    // Estimate token count
    const tokensUsed = Math.ceil(aiResponse.length / 4);

    // Save AI response
    const aiMessage = await Message.create({
      chatId: chat.id,
      role: 'assistant',
      content: aiResponse,
      tokens: tokensUsed
    });

    // Update chat title if it's the first message
    if (isFirstMessage) {
      // Create a more user-friendly title from the first message
      let title = content.trim();
      
      // If message is too long, truncate it intelligently
      if (title.length > 50) {
        // Try to cut at a word boundary
        const truncated = title.substring(0, 47);
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 20) {
          title = truncated.substring(0, lastSpace) + '...';
        } else {
          title = truncated + '...';
        }
      }
      
      console.log('Updating chat title to:', title);
      await chat.update({ title });
    }

    // Get updated chat with new title
    const updatedChat = await Chat.findByPk(chat.id);
    
    res.json({
      userMessage: userMessage.toJSON(),
      aiMessage: aiMessage.toJSON(),
      chat: {
        id: updatedChat.id,
        title: updatedChat.title,
        systemInstructions: updatedChat.systemInstructions,
        aiModel: updatedChat.aiModel,
        updatedAt: updatedChat.updatedAt
      }
    });

  } catch (error) {
    console.error('Error sending message:', error);
    
    if (error.message && error.message.includes('quota')) {
      return res.status(402).json({ error: 'Gemini API quota exceeded' });
    }
    
    if (error.message && error.message.includes('API key')) {
      return res.status(401).json({ error: 'Invalid Gemini API key' });
    }
    
    res.status(500).json({ error: `Chat error: ${error.message}` });
  }
});

// Delete chat
router.delete('/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const chat = await Chat.findOne({
      where: { 
        id: chatId, 
        userId: req.user.id 
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Delete all messages first
    await Message.destroy({ where: { chatId: chat.id } });
    
    // Delete chat
    await chat.destroy();

    res.json({ message: 'Chat deleted successfully' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
