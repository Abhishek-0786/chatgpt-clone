const https = require('https');
require('dotenv').config();

async function testGeminiDirect() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.log('❌ No API key found in .env file');
        return;
    }
    
    const data = JSON.stringify({
        contents: [{
            parts: [{
                text: "Hello, how are you?"
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
    
    console.log('Testing direct API call to Gemini...');
    console.log('URL:', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent');
    
    const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
            responseData += chunk;
        });
        
        res.on('end', () => {
            try {
                const result = JSON.parse(responseData);
                if (result.candidates && result.candidates[0] && result.candidates[0].content) {
                    console.log('✅ SUCCESS! Direct API call worked!');
                    console.log('Response:', result.candidates[0].content.parts[0].text);
                } else {
                    console.log('❌ API call failed:', result);
                }
            } catch (error) {
                console.log('❌ Error parsing response:', error.message);
                console.log('Raw response:', responseData);
            }
        });
    });
    
    req.on('error', (error) => {
        console.log('❌ Request failed:', error.message);
    });
    
    req.write(data);
    req.end();
}

testGeminiDirect();
