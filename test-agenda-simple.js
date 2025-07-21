// Test the simplified agenda queries
const axios = require('axios');
const NEWSAPI_KEY = '0ed0497788ab44dda4313b3cb1b8bd0b';

async function testQueries() {
    console.log('🧪 Testing simplified agenda queries...\n');
    
    const queries = [
        { name: 'Pakistan', q: 'Pakistan', region: 'Pakistan' },
        { name: 'Pakistan Breaking', q: 'Pakistan breaking news', region: 'Pakistan Breaking' },
        { name: 'Super Powers', q: 'China USA Russia breaking news', region: 'Super Powers' },
        { name: 'Middle East', q: 'Israel Palestine Gaza breaking news', region: 'Middle East Conflict' },
        { name: 'Global', q: 'breaking news world', region: 'Global Breaking' },
        { name: 'Asia-Pacific', q: 'India Japan Asia breaking news', region: 'Asia-Pacific' }
    ];
    
    let totalResults = 0;
    
    for (const query of queries) {
        try {
            const response = await axios.get('https://newsapi.org/v2/everything', {
                params: {
                    apiKey: NEWSAPI_KEY,
                    q: query.q,
                    sortBy: 'publishedAt',
                    language: 'en',
                    pageSize: 5
                }
            });
            
            const count = response.data.articles?.length || 0;
            totalResults += count;
            
            console.log(`✅ ${query.name}: ${count} articles`);
            if (count > 0) {
                console.log(`   Sample: ${response.data.articles[0].title.substring(0, 60)}...`);
            }
        } catch (error) {
            console.log(`❌ ${query.name}: Error - ${error.message}`);
        }
    }
    
    console.log(`\n📊 Total results: ${totalResults} articles`);
    
    if (totalResults > 0) {
        console.log('\n🎉 Agenda command should work now!');
        console.log('📱 Send "agenda" to your WhatsApp bot to test.');
    } else {
        console.log('\n⚠️ No results found. Check API key or try again later.');
    }
}

testQueries().catch(console.error); 