const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGemini() {
    try {
        // Test with v1beta API first
        console.log('Testing with v1beta API...');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
            apiVersion: 'v1beta'
        });
        
        // Test gemini-1.5-flash with v1beta
        console.log('Testing gemini-1.5-flash with v1beta...');
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello, how are you?");
        console.log('✅ gemini-1.5-flash works with v1beta:', result.response.text());
        
    } catch (error) {
        console.log('❌ gemini-1.5-flash with v1beta failed:', error.message);
        
        try {
            // Test gemini-pro with v1beta
            console.log('Testing gemini-pro with v1beta...');
            const genAI2 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
                apiVersion: 'v1beta'
            });
            const model2 = genAI2.getGenerativeModel({ model: "gemini-pro" });
            const result2 = await model2.generateContent("Hello, how are you?");
            console.log('✅ gemini-pro works with v1beta:', result2.response.text());
            
        } catch (error2) {
            console.log('❌ gemini-pro with v1beta failed:', error2.message);
            
            // Test with different model names
            try {
                console.log('Testing with different model names...');
                const genAI3 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, {
                    apiVersion: 'v1beta'
                });
                const model3 = genAI3.getGenerativeModel({ model: "gemini-1.5-flash-001" });
                const result3 = await model3.generateContent("Hello, how are you?");
                console.log('✅ gemini-1.5-flash-001 works:', result3.response.text());
                
            } catch (error3) {
                console.log('❌ All models failed. Check your API key and permissions.');
                console.log('Error details:', error3.message);
            }
        }
    }
}

testGemini();
