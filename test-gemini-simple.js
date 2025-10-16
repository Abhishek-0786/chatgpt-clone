const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGeminiSimple() {
    try {
        console.log('Testing with basic GoogleGenerativeAI...');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Try the most basic model name
        console.log('Testing with model: gemini-pro');
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello, how are you?");
        console.log('✅ SUCCESS! Response:', result.response.text());
        
    } catch (error) {
        console.log('❌ gemini-pro failed:', error.message);
        
        // Check if it's an API key issue
        if (error.message.includes('API key') || error.message.includes('authentication')) {
            console.log('🔑 API Key issue detected. Please check:');
            console.log('1. Your API key is correct');
            console.log('2. Your API key has the right permissions');
            console.log('3. Go to https://aistudio.google.com/app/apikey to verify');
        }
        
        if (error.message.includes('404')) {
            console.log('📋 Model not found. This might mean:');
            console.log('1. The model name is incorrect');
            console.log('2. Your API key doesn\'t have access to this model');
            console.log('3. The model is not available in your region');
        }
    }
}

testGeminiSimple();
