const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testLibrary() {
    try {
        console.log('Testing with GoogleGenerativeAI library...');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Try gemini-flash-latest
        console.log('Testing gemini-flash-latest...');
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent("Hello");
        console.log('✅ SUCCESS! Response:', result.response.text());
        
    } catch (error) {
        console.log('❌ gemini-flash-latest failed:', error.message);
        
        try {
            // Try gemini-2.0-flash
            console.log('Testing gemini-2.0-flash...');
            const genAI2 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model2 = genAI2.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result2 = await model2.generateContent("Hello");
            console.log('✅ SUCCESS! Response:', result2.response.text());
            
        } catch (error2) {
            console.log('❌ gemini-2.0-flash failed:', error2.message);
            
            try {
                // Try gemini-1.5-flash
                console.log('Testing gemini-1.5-flash...');
                const genAI3 = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model3 = genAI3.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result3 = await model3.generateContent("Hello");
                console.log('✅ SUCCESS! Response:', result3.response.text());
                
            } catch (error3) {
                console.log('❌ All models failed:', error3.message);
            }
        }
    }
}

testLibrary();
