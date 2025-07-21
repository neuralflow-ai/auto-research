// Simple test script to verify agenda functionality
const { NEWSAPI_KEY } = require('./src/config');

console.log('Testing agenda functionality...');
console.log('NEWSAPI_KEY available:', !!NEWSAPI_KEY);
console.log('NEWSAPI_KEY preview:', NEWSAPI_KEY ? NEWSAPI_KEY.slice(0, 6) + '...' : 'NOT SET');

if (!NEWSAPI_KEY) {
    console.log('✅ Using fallback news (expected behavior when API key is not set)');
    console.log('📝 To get real news, create a .env file with your NEWSAPI_KEY');
    console.log('🔗 Get free API key from: https://newsapi.org/');
} else {
    console.log('✅ NEWSAPI_KEY is configured');
    console.log('📝 Testing API connection...');
    
    const axios = require('axios');
    
    axios.get('https://newsapi.org/v2/top-headlines', {
        params: {
            country: 'us',
            apiKey: NEWSAPI_KEY,
            pageSize: 1
        }
    })
    .then(response => {
        if (response.data.status === 'error') {
            console.log('❌ NewsAPI Error:', response.data.message);
        } else {
            console.log('✅ NewsAPI connection successful');
            console.log('📰 Sample article:', response.data.articles[0]?.title);
        }
    })
    .catch(error => {
        console.log('❌ NewsAPI connection failed:', error.message);
        if (error.response?.data) {
            console.log('📋 Error details:', error.response.data);
        }
    });
}

console.log('\n📋 Setup Instructions:');
console.log('1. Create a .env file in the project root');
console.log('2. Add your API keys:');
console.log('   NEWSAPI_KEY=your_api_key_here');
console.log('   YOUTUBE_API_KEY=your_youtube_key_here');
console.log('   GOOGLE_CSE_API_KEY=your_google_key_here');
console.log('   GOOGLE_CSE_ID=your_google_cse_id_here');
console.log('3. Restart the WhatsApp bot');
console.log('\n🔗 Get API keys from:');
console.log('- NewsAPI: https://newsapi.org/');
console.log('- YouTube: https://console.cloud.google.com/');
console.log('- Google CSE: https://programmablesearchengine.google.com/'); 