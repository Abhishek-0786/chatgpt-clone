const https = require('https');
require('dotenv').config();

async function listAvailableModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        console.log('❌ No API key found in .env file');
        return;
    }
    
    console.log('Fetching available models...');
    
    const options = {
        hostname: 'generativelanguage.googleapis.com',
        port: 443,
        path: '/v1beta/models?key=' + apiKey,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
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
                if (result.models) {
                    console.log('✅ Available models:');
                    result.models.forEach(model => {
                        console.log(`- ${model.name}`);
                        if (model.supportedGenerationMethods) {
                            console.log(`  Supported methods: ${model.supportedGenerationMethods.join(', ')}`);
                        }
                    });
                } else {
                    console.log('❌ Error:', result);
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
    
    req.end();
}

listAvailableModels();
