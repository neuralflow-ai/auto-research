// Test Yahoo News fallback functionality
const axios = require('axios');

// Function to fetch Yahoo News as fallback (copied from whatsapp.js)
async function fetchYahooNews() {
    try {
        console.log('[YAHOO NEWS] Starting Yahoo News fetch...');
        const newsResults = [];
        
        // Yahoo News RSS feeds
        const yahooFeeds = [
            { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline', region: 'Business', priority: 2 },
            { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC,^DJI,^IXIC', region: 'Markets', priority: 2 },
            { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC', region: 'US Markets', priority: 2 },
            { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^BSESN,^NSEI', region: 'India Markets', priority: 1 },
            { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^HSI,^GSPC', region: 'Asia Markets', priority: 1 }
        ];
        
        for (const feed of yahooFeeds) {
            try {
                console.log(`[YAHOO NEWS] Fetching ${feed.region} feed...`);
                const response = await axios.get(feed.url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                // Parse RSS XML
                const xmlText = response.data;
                const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/g);
                
                if (itemMatches) {
                    for (const item of itemMatches.slice(0, 5)) { // Take first 5 items per feed
                        const titleMatch = item.match(/<title>([^<]+)<\/title>/);
                        const linkMatch = item.match(/<link>([^<]+)<\/link>/);
                        const pubDateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);
                        
                        if (titleMatch && linkMatch) {
                            const title = titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                            const url = linkMatch[1];
                            const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString();
                            
                            newsResults.push({
                                title: title,
                                url: url,
                                source: 'Yahoo Finance',
                                region: feed.region,
                                priority: feed.priority,
                                publishedAt: pubDate,
                                source: 'Yahoo News'
                            });
                        }
                    }
                }
                
                console.log(`[YAHOO NEWS] ${feed.region} feed processed`);
                
            } catch (feedError) {
                console.log(`[YAHOO NEWS] Error fetching ${feed.region} feed:`, feedError.message);
                continue; // Continue with next feed
            }
        }
        
        // Also try some general news sources
        const generalFeeds = [
            'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC',
            'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^DJI'
        ];
        
        for (const feedUrl of generalFeeds) {
            try {
                const response = await axios.get(feedUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                const xmlText = response.data;
                const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/g);
                
                if (itemMatches) {
                    for (const item of itemMatches.slice(0, 3)) {
                        const titleMatch = item.match(/<title>([^<]+)<\/title>/);
                        const linkMatch = item.match(/<link>([^<]+)<\/link>/);
                        const pubDateMatch = item.match(/<pubDate>([^<]+)<\/pubDate>/);
                        
                        if (titleMatch && linkMatch) {
                            const title = titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
                            const url = linkMatch[1];
                            const pubDate = pubDateMatch ? new Date(pubDateMatch[1]).toISOString() : new Date().toISOString();
                            
                            newsResults.push({
                                title: title,
                                url: url,
                                source: 'Yahoo Finance',
                                region: 'Global Breaking',
                                priority: 4,
                                publishedAt: pubDate,
                                source: 'Yahoo News'
                            });
                        }
                    }
                }
                
            } catch (feedError) {
                console.log(`[YAHOO NEWS] Error fetching general feed:`, feedError.message);
            }
        }
        
        // Remove duplicates based on title
        const uniqueNews = newsResults.filter((item, index, self) => 
            index === self.findIndex(t => t.title === item.title)
        );
        
        console.log(`[YAHOO NEWS] Total unique articles fetched: ${uniqueNews.length}`);
        return uniqueNews;
        
    } catch (error) {
        console.error('[YAHOO NEWS] Error in fetchYahooNews:', error.message);
        throw error;
    }
}

// Test the Yahoo News fallback
async function testYahooFallback() {
    console.log('🧪 Testing Yahoo News fallback...\n');
    
    try {
        const yahooNews = await fetchYahooNews();
        
        if (yahooNews && yahooNews.length > 0) {
            console.log(`✅ Yahoo News fallback successful!`);
            console.log(`📊 Total articles: ${yahooNews.length}`);
            
            // Group by region
            const regions = {};
            yahooNews.forEach(article => {
                if (!regions[article.region]) {
                    regions[article.region] = [];
                }
                regions[article.region].push(article);
            });
            
            console.log('\n📰 Articles by region:');
            Object.keys(regions).forEach(region => {
                console.log(`   ${region}: ${regions[region].length} articles`);
                if (regions[region].length > 0) {
                    console.log(`   Sample: ${regions[region][0].title.substring(0, 60)}...`);
                }
            });
            
            console.log('\n🎉 Yahoo News fallback is working!');
            console.log('📱 The agenda command will now use Yahoo News when NewsAPI fails.');
            
        } else {
            console.log('❌ No Yahoo News articles found');
        }
        
    } catch (error) {
        console.log('❌ Yahoo News fallback test failed:', error.message);
    }
}

testYahooFallback(); 