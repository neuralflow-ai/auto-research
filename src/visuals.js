const axios = require('axios');
const { GEMINI_API_KEY, PERPLEXITY_API_KEY, YOUTUBE_API_KEY, PEXELS_API_KEY, GOOGLE_CSE_API_KEY, GOOGLE_CSE_ID } = require('./config');

// Main function to get visual links
async function getVisualLinks(topic, script = null) {
    console.log('[DEBUG] Starting visuals generation for topic:', topic.substring(0, 100) + '...');
    
    // Use the script if provided, otherwise use the topic
    let primaryQuery = script && script.length > 20 ? script : topic;
    let searchQuery = primaryQuery;
    let searchTerms = extractKeyTerms(primaryQuery);
    if (!searchTerms || searchTerms.length === 0) {
        searchTerms = primaryQuery.split(/\s+/).filter(w => w.length > 2);
    }
    console.log('[DEBUG] Extracted search terms:', searchTerms);
    
    let allLinks = [];
    let youtubeLinks = [];
    let newsLinks = [];

    // 1. ALWAYS get Perplexity links first (primary source)
    try {
        console.log('[DEBUG] Getting Perplexity links (primary source)...');
        const perplexityLinks = await getPerplexityLinks(primaryQuery);
        allLinks.push(...perplexityLinks);
        console.log('[DEBUG] Added', perplexityLinks.length, 'Perplexity links');
    } catch (error) {
        console.log('[DEBUG] Perplexity failed:', error.message);
    }
    
    // 2. ALWAYS get YouTube videos from API (secondary source)
    try {
        console.log('[DEBUG] Getting YouTube videos from API (secondary source)...');
        youtubeLinks = await getYouTubeVideos([searchQuery]);
        allLinks.push(...youtubeLinks);
        console.log('[DEBUG] Added', youtubeLinks.length, 'YouTube links');
    } catch (error) {
        console.log('[DEBUG] YouTube API failed:', error.message);
    }
    
    // 3. ALWAYS get news articles from Google CSE (secondary source)
    try {
        console.log('[DEBUG] Getting news articles from Google CSE (secondary source)...');
        newsLinks = await getNewsArticles([searchQuery]);
        allLinks.push(...newsLinks);
        console.log('[DEBUG] Added', newsLinks.length, 'news links');
    } catch (error) {
        console.log('[DEBUG] Google CSE failed:', error.message);
    }
    
    // 4. Validate and filter all links with STRICT relevance
    console.log('[DEBUG] STRICT VALIDATION: Validating', allLinks.length, 'total links...');
    let validLinks = await validateAndFilterLinks(allLinks, searchTerms);
    
    console.log('[DEBUG] STRICT FINAL RESULT:', validLinks.length, 'highly relevant links out of', allLinks.length);
    
    // If no relevant links found, fallback to top 5 YouTube and 5 news links
    if (validLinks.length === 0) {
        console.log('[DEBUG] ❌ NO RELEVANT LINKS FOUND - Falling back to top 5 YouTube and 5 news links');
        validLinks = [
            ...youtubeLinks.slice(0, 5),
            ...newsLinks.slice(0, 5)
        ];
    }
    
    // If still no links, try again using the original topic heading as the search query
    if (validLinks.length === 0 && script && script !== topic) {
        console.log('[DEBUG] ❌ Still no visuals - Retrying with original topic heading as search query');
        // Try again with topic as the query
        youtubeLinks = await getYouTubeVideos([topic]);
        newsLinks = await getNewsArticles([topic]);
        validLinks = [
            ...youtubeLinks.slice(0, 5),
            ...newsLinks.slice(0, 5)
        ];
    }
    
    // If still no links, fallback to any Perplexity links
    if (validLinks.length === 0 && allLinks.length > 0) {
        validLinks = allLinks.slice(0, 10);
    }
    
    return validLinks;
}

// Extract key search terms from topic/script
function extractKeyTerms(topic) {
    // Check if content is in Urdu (contains Urdu characters)
    const isUrdu = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(topic);
    
    if (isUrdu) {
        // For Urdu content, extract English terms and use common search terms
        const urduToEnglishMap = {
            'پاکستان': 'pakistan',
            'بھارت': 'india',
            'ٹرمپ': 'trump',
            'مودی': 'modi',
            'طیارے': 'fighter jets',
            'جنگی': 'military',
            'فوج': 'army',
            'حملہ': 'attack',
            'جنگ': 'war',
            'سیاسی': 'politics',
            'اقتصاد': 'economy',
            'امن': 'peace',
            'خفیہ': 'intelligence',
            'آپریشن': 'operation',
            'گرفتار': 'arrest',
            'مقاومت': 'resistance',
            'آزادی': 'freedom',
            'تحریک': 'movement',
            'کشمیر': 'kashmir',
            'بلوچستان': 'balochistan',
            'پنجاب': 'punjab',
            'سندھ': 'sindh',
            'اسلام آباد': 'islamabad',
            'لاہور': 'lahore',
            'کراچی': 'karachi',
            'پشاور': 'peshawar',
            'کوئٹہ': 'quetta'
        };
        
        // Extract English terms from Urdu text
        let englishTerms = [];
        for (const [urdu, english] of Object.entries(urduToEnglishMap)) {
            if (topic.includes(urdu)) {
                englishTerms.push(english);
            }
        }
        
        // If no specific terms found, use general search terms
        if (englishTerms.length === 0) {
            englishTerms = ['pakistan', 'india', 'trump', 'military', 'news', 'breaking', 'latest', 'politics'];
        }
        
        console.log('[DEBUG] Extracted English terms from Urdu:', englishTerms);
        return englishTerms;
    }
    
    // For English content, use the original logic
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'news', 'latest', 'breaking', 'update', 'report', 'story', 'video', 'watch', 'see', 'look', 'check', 'find', 'get', 'make', 'take', 'give', 'show', 'tell', 'say', 'know', 'think', 'feel', 'want', 'need', 'use', 'work', 'go', 'come', 'see', 'hear', 'read', 'write', 'speak', 'talk', 'ask', 'answer', 'question', 'problem', 'issue', 'matter', 'thing', 'way', 'time', 'day', 'year', 'month', 'week', 'hour', 'minute', 'second', 'now', 'then', 'here', 'there', 'where', 'when', 'why', 'how', 'what', 'who', 'which', 'whose', 'whom'];
    
    // Convert to lowercase and split into words
    let words = topic.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 2) // Remove short words
        .filter(word => !commonWords.includes(word)); // Remove common words
    
    // Prioritize important terms (names, places, specific topics)
    const importantTerms = words.filter(word => 
        word.length > 4 || // Longer words are usually more specific
        /^[A-Z]/.test(word) || // Capitalized words (names, places)
        /pakistan|india|china|russia|america|uk|france|germany|iran|iraq|syria|afghanistan|kashmir|balochistan|punjab|sindh|peshawar|karachi|lahore|islamabad|quetta|army|military|security|terrorism|politics|economy|corruption|elections|government|modi|bjp|rss|hindutva|islamophobia|muslim|hindu|communal|secular|democracy|constitution|minority|majority|violence|hate|speech|bigotry|discrimination|lynching|vigilante|fundamentalist|extremist|nationalist|patriotic|pakistan|fauj|pak|army|pakistan|army|pakistan|military|pakistan|security|pakistan|defense|pakistan|border|pakistan|kashmir|pakistan|balochistan|pakistan|punjab|pakistan|sindh|pakistan|peshawar|pakistan|karachi|pakistan|lahore|pakistan|islamabad|pakistan|quetta|pakistan|news|pakistan|politics|pakistan|economy|pakistan|corruption|pakistan|elections|pakistan|government|pakistan|democracy|pakistan|constitution|pakistan|minority|pakistan|majority|pakistan|violence|pakistan|hate|pakistan|speech|pakistan|bigotry|pakistan|discrimination|pakistan|lynching|pakistan|vigilante|pakistan|fundamentalist|pakistan|extremist|pakistan|nationalist|pakistan|patriotic/.test(word)
    );
    
    // Take the most relevant words (up to 15 for better coverage)
    const finalTerms = importantTerms.length > 0 ? importantTerms : words;
    const result = finalTerms.slice(0, 15);
    
    console.log('[DEBUG] Extracted key terms:', result);
    return result;
}

// Get YouTube videos using YouTube Data API
async function getYouTubeVideos(searchTerms) {
    if (!YOUTUBE_API_KEY) {
        console.log('[DEBUG] No YouTube API key available');
        return [];
    }
    
    const links = [];
    const searchVariations = [
        searchTerms.join(' '),
        searchTerms.join(' ') + ' news',
        searchTerms.join(' ') + ' latest',
        searchTerms.join(' ') + ' breaking',
        searchTerms.join(' ') + ' analysis',
        searchTerms.join(' ') + ' 2024',
        searchTerms.join(' ') + ' update',
        searchTerms.slice(0, 3).join(' '), // Use first 3 terms only
        searchTerms.slice(0, 5).join(' ') + ' pakistan india', // Add context
        searchTerms.slice(0, 4).join(' ') + ' politics news' // Political context
    ];
    
    for (const searchQuery of searchVariations) {
        try {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: {
                    part: 'snippet',
                    q: searchQuery,
                    type: 'video',
                        maxResults: 8, // Increased from 5 to 8
                    order: 'relevance',
                        publishedAfter: '2023-01-01T00:00:00Z', // More lenient date filter
                    key: YOUTUBE_API_KEY
                }
            });
            
            const videos = response.data.items || [];
            for (const video of videos) {
                const videoUrl = `https://www.youtube.com/watch?v=${video.id.videoId}`;
                const title = video.snippet.title;
                const channel = video.snippet.channelTitle;
                const description = video.snippet.description;
                
                links.push({
                    url: videoUrl,
                    title: title,
                    channel: channel,
                    description: description,
                    type: 'youtube',
                    source: 'youtube_api'
                });
            }
        } catch (error) {
            console.log('[DEBUG] YouTube search failed for query:', searchQuery, error.message);
        }
    }
    
    return links;
}

// Get news articles using Google Custom Search API
async function getNewsArticles(searchTerms) {
    if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_ID) {
        console.log('[DEBUG] No Google CSE credentials available');
        return [];
    }
    
    const links = [];
    const searchQuery = searchTerms.join(' ') + ' news';
    
    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: GOOGLE_CSE_API_KEY,
                cx: GOOGLE_CSE_ID,
                q: searchQuery,
                num: 10,
                dateRestrict: 'm1', // Last month
                sort: 'date'
            }
        });
        
        const items = response.data.items || [];
        for (const item of items) {
            links.push({
                url: item.link,
                title: item.title,
                snippet: item.snippet,
                type: 'news',
                source: 'google_cse'
            });
        }
    } catch (error) {
        console.log('[DEBUG] Google CSE failed:', error.message);
    }
    
    return links;
}

// Use Perplexity as primary source
async function getPerplexityLinks(topic) {
    if (!PERPLEXITY_API_KEY) {
        console.log('[DEBUG] No Perplexity API key available');
        return [];
    }
    
    try {
        const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: 'llama-3.1-sonar-large-128k-online',
            messages: [{
                role: 'user',
                content: `Find 15-20 working YouTube videos and news articles about: ${topic}

IMPORTANT REQUIREMENTS:
- Only provide real, working links that are currently accessible
- Focus on recent content (2023-2025)
- Include both YouTube videos and news articles
- Ensure all links are properly formatted
- Provide 10-15 YouTube videos and 5-10 news articles
- Make sure links are relevant to the topic
- Test that all links work before providing them

Format your response with clear sections:
YouTube Videos:
1. [link]
2. [link]
...

News Articles:
1. [link]
2. [link]
...`
            }],
            max_tokens: 3000
        }, {
            headers: {
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        
        const content = response.data.choices[0].message.content;
        console.log('[DEBUG] Perplexity response:', content.substring(0, 200) + '...');
        return extractLinksFromText(content);
    } catch (error) {
        console.log('[DEBUG] Perplexity API failed:', error.message);
        return [];
    }
}

// Extract links from text
function extractLinksFromText(text) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    console.log('[DEBUG] Extracted URLs from Perplexity:', urls.length);
    
    const links = urls.map(url => {
        // Clean the URL (remove any trailing punctuation or spaces)
        const cleanUrl = url.replace(/[.,;!?)\]]*$/, '');
        
        return {
            url: cleanUrl,
            type: cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be') ? 'youtube' : 'news',
            source: 'perplexity'
        };
    });
    
    console.log('[DEBUG] Processed links:', links.length, 'YouTube:', links.filter(l => l.type === 'youtube').length, 'News:', links.filter(l => l.type === 'news').length);
    
    return links;
}

// Validate and filter links with STRICT relevance checking
async function validateAndFilterLinks(links, searchTerms) {
    const validLinks = [];
    const topicKeywords = searchTerms.map(term => term.toLowerCase());
    
    console.log('[DEBUG] STRICT VALIDATION: Validating', links.length, 'links...');
    console.log('[DEBUG] Topic keywords for relevance:', topicKeywords);
    
    // If no topic keywords, reject all links for safety
    if (!topicKeywords || topicKeywords.length === 0) {
        console.log('[DEBUG] ❌ NO TOPIC KEYWORDS - Rejecting all links for safety');
        return [];
    }
    
    for (const link of links) {
        try {
            if (link.type === 'youtube') {
                // Step 1: Validate YouTube link
                const isValid = await validateYouTubeLink(link.url);
                if (!isValid) {
                    console.log('[DEBUG] ❌ Invalid YouTube link:', link.url);
                    continue;
                }
                
                // Step 2: Check STRICT relevance (require 3+ keywords)
                const isRelevant = await checkYouTubeRelevanceStrict(link.url, topicKeywords);
                    if (isRelevant) {
                        validLinks.push(link);
                    console.log('[DEBUG] ✅ STRICT: Valid & Highly Relevant YouTube:', link.url);
                } else {
                    console.log('[DEBUG] ❌ STRICT: YouTube not relevant enough:', link.url);
                }
            } else {
                // Step 1: Validate news link
                const isValid = await validateNewsLink(link.url);
                if (!isValid) {
                    console.log('[DEBUG] ❌ Invalid news link:', link.url);
                    continue;
                }
                
                // Step 2: Check STRICT relevance (require 2+ keywords)
                const isRelevant = await checkNewsRelevanceStrict(link.url, topicKeywords);
                if (isRelevant) {
                    validLinks.push(link);
                    console.log('[DEBUG] ✅ STRICT: Valid & Highly Relevant news:', link.url);
                } else {
                    console.log('[DEBUG] ❌ STRICT: News not relevant enough:', link.url);
                }
            }
        } catch (error) {
            console.log('[DEBUG] Error validating link:', link.url, error.message);
        }
    }
    
    // Remove duplicates based on URL
    const uniqueLinks = validLinks.filter((link, index, self) => 
        index === self.findIndex(l => l.url === link.url)
    );
    
    console.log('[DEBUG] STRICT FILTERING COMPLETE:', uniqueLinks.length, 'highly relevant links out of', links.length);
    
    // Only return links if we have at least 3 relevant results
    if (uniqueLinks.length < 3) {
        console.log('[DEBUG] ❌ INSUFFICIENT RELEVANT LINKS - Returning empty to avoid irrelevant content');
        return [];
    }
    
    return uniqueLinks;
}

// Validate YouTube link
async function validateYouTubeLink(url) {
    try {
        // Basic URL format validation
        if (!url.includes('youtube.com/watch?v=') && !url.includes('youtu.be/')) {
            return false;
        }
        
        // Extract video ID
        const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
        if (!videoId) {
            return false;
        }
        
        // If we have YouTube API key, do a quick check
        if (YOUTUBE_API_KEY) {
            try {
                const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
                    params: {
                        part: 'snippet',
                        id: videoId,
                        key: YOUTUBE_API_KEY
                    },
                    timeout: 3000
                });
                return response.data.items && response.data.items.length > 0;
            } catch (apiError) {
                // If API fails, still accept the video (be lenient)
                console.log('[DEBUG] YouTube API validation failed, accepting anyway:', apiError.message);
                return true;
            }
        }
        
        // If no API key, accept the video if URL format is correct
        return true;
    } catch (error) {
        console.log('[DEBUG] YouTube validation error, accepting anyway:', error.message);
        return true; // Be very lenient
    }
}

// Check YouTube relevance with STRICT requirements
async function checkYouTubeRelevanceStrict(url, topicKeywords) {
    try {
        // Extract video ID from URL
        const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
        if (!videoId) {
            return false;
        }
        
        // If no topic keywords, reject
        if (!topicKeywords || topicKeywords.length === 0) {
            console.log('[DEBUG] STRICT: No topic keywords, rejecting video');
            return false;
        }
        
        // If no YouTube API key, check URL for relevance
        if (!YOUTUBE_API_KEY) {
            const urlLower = url.toLowerCase();
            const urlKeywords = topicKeywords.filter(keyword => urlLower.includes(keyword));
            const isRelevant = urlKeywords.length >= 2; // Require 2+ keywords in URL
            if (isRelevant) {
                console.log('[DEBUG] STRICT URL relevance: Found keywords:', urlKeywords);
            } else {
                console.log('[DEBUG] STRICT: URL not relevant enough, need 2+ keywords, found:', urlKeywords.length);
            }
            return isRelevant;
        }
        
        try {
            // Get video details using YouTube Data API
            const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
                params: {
                    part: 'snippet',
                    id: videoId,
                    key: YOUTUBE_API_KEY
                },
                timeout: 5000
            });
            
            if (response.data.items && response.data.items.length > 0) {
                const video = response.data.items[0];
                const title = video.snippet.title.toLowerCase();
                const description = video.snippet.description.toLowerCase();
                const tags = (video.snippet.tags || []).join(' ').toLowerCase();
                
                // Combine all video text for relevance checking
                const allVideoText = `${title} ${description} ${tags}`;
                
                // Count how many topic keywords are found in the video
                const foundKeywords = topicKeywords.filter(keyword => allVideoText.includes(keyword));
                
                // STRICT: Require at least 3 keyword matches for high relevance
                const isRelevant = foundKeywords.length >= 3;
                
                if (isRelevant) {
                    console.log('[DEBUG] STRICT YouTube relevance: Found keywords:', foundKeywords, 'in:', video.snippet.title);
                } else {
                    console.log('[DEBUG] STRICT: YouTube not relevant enough, need 3+ keywords, found:', foundKeywords.length);
                }
                
                return isRelevant;
            }
        } catch (apiError) {
            console.log('[DEBUG] YouTube API error for strict relevance check:', apiError.message);
            // If API fails, check URL for relevance as fallback
        const urlLower = url.toLowerCase();
            const urlKeywords = topicKeywords.filter(keyword => urlLower.includes(keyword));
            const isRelevant = urlKeywords.length >= 2; // Require 2+ keywords in URL
            if (isRelevant) {
                console.log('[DEBUG] STRICT URL fallback: Found keywords:', urlKeywords);
            }
            return isRelevant;
        }
        
        return false;
    } catch (error) {
        console.log('[DEBUG] Error in strict YouTube relevance check:', error.message);
        return false;
    }
}

// Validate news link
async function validateNewsLink(url) {
    try {
        const response = await axios.get(url, {
            timeout: 8000,
            validateStatus: () => true
        });
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// Check news relevance with STRICT requirements
async function checkNewsRelevanceStrict(url, topicKeywords) {
    try {
        // If no topic keywords, reject
        if (!topicKeywords || topicKeywords.length === 0) {
            console.log('[DEBUG] STRICT: No topic keywords, rejecting news');
            return false;
        }
        
        // Check URL for relevance first
        const urlLower = url.toLowerCase();
        const urlKeywords = topicKeywords.filter(keyword => urlLower.includes(keyword));
        if (urlKeywords.length >= 2) { // Require 2+ keywords in URL
            console.log('[DEBUG] STRICT News URL relevance: Found keywords:', urlKeywords);
            return true;
        }
        
        // Try to get page content for relevance checking
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const content = response.data.toLowerCase();
            let totalKeywords = 0;
            let foundKeywords = [];
            
            // Check title tag
            const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (titleMatch) {
                const title = titleMatch[1].toLowerCase();
                const titleKeywords = topicKeywords.filter(keyword => title.includes(keyword));
                totalKeywords += titleKeywords.length;
                foundKeywords = foundKeywords.concat(titleKeywords);
                if (titleKeywords.length >= 2) {
                    console.log('[DEBUG] STRICT News title relevance: Found keywords:', titleKeywords);
                    return true;
                }
            }
            
            // Check meta description
            const descMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
            if (descMatch) {
                const description = descMatch[1].toLowerCase();
                const descKeywords = topicKeywords.filter(keyword => description.includes(keyword));
                totalKeywords += descKeywords.length;
                foundKeywords = foundKeywords.concat(descKeywords);
                if (descKeywords.length >= 2) {
                    console.log('[DEBUG] STRICT News description relevance: Found keywords:', descKeywords);
                    return true;
                }
            }
            
            // Check h1, h2 tags
            const headingMatch = content.match(/<h[12][^>]*>([^<]+)<\/h[12]>/gi);
            if (headingMatch) {
                const headings = headingMatch.join(' ').toLowerCase();
                const headingKeywords = topicKeywords.filter(keyword => headings.includes(keyword));
                totalKeywords += headingKeywords.length;
                foundKeywords = foundKeywords.concat(headingKeywords);
                if (headingKeywords.length >= 2) {
                    console.log('[DEBUG] STRICT News headings relevance: Found keywords:', headingKeywords);
                    return true;
                }
            }
            
            // Check if total keywords across all sections is sufficient
            if (totalKeywords >= 3) {
                console.log('[DEBUG] STRICT News total relevance: Found keywords across sections:', foundKeywords);
                return true;
            }
            
            console.log('[DEBUG] STRICT: News not relevant enough, need 2+ keywords in any section or 3+ total, found:', totalKeywords);
            
        } catch (pageError) {
            console.log('[DEBUG] Could not fetch page content for strict relevance check:', pageError.message);
        }
        
        return false;
    } catch (error) {
        console.log('[DEBUG] Error in strict news relevance check:', error.message);
        return false;
    }
}

module.exports = { getVisualLinks }; 