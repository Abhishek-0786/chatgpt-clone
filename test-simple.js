const https = require('https');
require('dotenv').config();

async function testSimple() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    const data = JSON.stringify({
        contents: [{
            parts: [{
                text: "Hi"
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
    
    console.log('Testing with a simple "Hi" message...');
    
    const req = https.request(options, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
            responseData += chunk;
        });
        
        res.on('end', () => {
            try {
                const result = JSON.parse(responseData);
                if (result.candidates && result.candidates[0] && result.candidates[0].content) {
                    console.log('✅ SUCCESS! Response:', result.candidates[0].content.parts[0].text);
                } else if (result.error) {
                    if (result.error.code === 429) {
                        console.log('⏰ Rate limit exceeded. Please wait a few minutes and try again.');
                        console.log('This is normal for free API keys.');
                    } else {
                        console.log('❌ Error:', result.error);
                    }
                } else {
                    console.log('❌ Unexpected response:', result);
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

testSimple();
