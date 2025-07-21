console.log('Starting WhatsApp bot...');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { generateUrduScript } = require('./ai');
const { getVisualLinks } = require('./visuals');
const axios = require('axios');
const { NEWSAPI_KEY } = require('./config');
const fs = require('fs');
const path = require('path');
const AGENDA_FILE = path.join(__dirname, '../agenda.json');

console.log('[DEBUG] NEWSAPI_KEY:', NEWSAPI_KEY ? NEWSAPI_KEY.slice(0, 6) + '...' : 'NOT SET');

// Helper function to calculate time ago
function getTimeAgo(publishedAt) {
    const now = new Date();
    const published = new Date(publishedAt);
    const diffMs = now - published;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 60) {
        return `${diffMinutes} منٹ پہلے`;
    } else if (diffHours < 24) {
        return `${diffHours} گھنٹے پہلے`;
    } else {
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} دن پہلے`;
    }
}

// In-memory agenda store
let latestAgendaItems = [];
let pendingEditorial = null;
let lastGeneratedScript = null;

const client = new Client({
    authStrategy: new LocalAuth(),
});

client.on('qr', (qr) => {
    console.log('[DEBUG] QR event triggered');
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above with WhatsApp.');
});

client.on('ready', () => {
    console.log('[DEBUG] WhatsApp client ready');
    console.log('🎯 Vision Point WhatsApp News Agent is ready!');
    console.log('🇵🇰 پاکستان کی آواز - Vision Point');
    console.log('💪 پاک فوج زندہ باد!');
});

const PERPLEXITY_NUMBER = '18334363285@s.whatsapp.net';

// Helper: Send a message to Perplexity
async function sendToPerplexity(client, text) {
    await client.sendMessage(PERPLEXITY_NUMBER, text);
}

// Helper: Wait for a reply from Perplexity
function waitForPerplexityReply(client, matchFn, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
        let timeout;
        const handler = async (msg) => {
            console.log('[DEBUG] Message received in waitForPerplexityReply:', msg.from, msg.body.substring(0, 100) + '...');
            
            const isFromPerplexity = msg.from === PERPLEXITY_NUMBER || 
                                   msg.from.includes('perplexity') || 
                                   msg.from.includes('18334363285') ||
                                   (msg.body && msg.body.length > 200 && 
                                    (msg.body.includes('السلام علیکم') || 
                                     msg.body.includes('ناظرین') || 
                                     msg.body.includes('پاکستان') ||
                                     msg.body.includes('ویژن پوائنٹ'))) ||
                                   (msg.body && msg.body.length > 100 && /https?:\/\//.test(msg.body)) ||
                                   msg.from === PERPLEXITY_NUMBER;
            
            if (isFromPerplexity) {
                console.log('[Perplexity Reply]', msg.body);
                if (matchFn(msg.body)) {
                    client.removeListener('message', handler);
                    clearTimeout(timeout);
                    resolve(msg.body);
                }
            }
        };
        client.on('message', handler);
        timeout = setTimeout(() => {
            client.removeListener('message', handler);
            reject(new Error('Perplexity reply timeout'));
        }, timeoutMs);
    });
}

client.on('message', async (message) => {
    console.log('[DEBUG] Message received:', message.body);

    // Agenda number selection
    if (/^\d+$/.test(message.body.trim())) {
        console.log('[DEBUG] Agenda number received:', message.body.trim());
        if (latestAgendaItems.length === 0) {
            try {
                if (fs.existsSync(AGENDA_FILE)) {
                    const fileData = fs.readFileSync(AGENDA_FILE, 'utf-8');
                    latestAgendaItems = JSON.parse(fileData);
                    console.log('[DEBUG] Loaded agenda from file, length:', latestAgendaItems.length);
                }
            } catch (err) {
                console.error('[DEBUG] Failed to read agenda file:', err.message);
            }
        }
        console.log('[DEBUG] latestAgendaItems length:', latestAgendaItems.length);
        if (latestAgendaItems.length === 0) {
            await message.reply('براہ کرم پہلے "agenda" کمانڈ بھیجیں تاکہ تازہ خبریں حاصل کی جا سکیں۔');
            return;
        }
        const idx = parseInt(message.body.trim(), 10) - 1;
        console.log('[DEBUG] Agenda index selected:', idx);
        if (idx >= 0 && idx < latestAgendaItems.length) {
            const agenda = latestAgendaItems[idx];
            console.log('[DEBUG] Selected agenda item:', agenda);
            await message.reply(`⏳ اسکرپٹ اور ویژولز تیار ہو رہے ہیں: ${agenda.title}`);
            
            // Generate script using Perplexity
            const scriptPrompt = `Create a dramatic, engaging 5-10 minute Urdu news script in the style of Pakistani news channels. Use Deep Research mode for accurate information.

SCRIPT STYLE REQUIREMENTS:
- Start with a dramatic headline and "ناظرین آج کی ویڈیو میں ہم بات کریں گے..."
- Use dramatic, emotional tone with multiple exclamation marks (!!!)
- Include phrases like "جی ہاں ناظرین", "ناظرین!", "لیکن سوال یہ ہے", "کیا یہی ہے"
- Use dramatic pauses with multiple commas (,,,)
- Include emotional appeals and patriotic elements
- Add rhetorical questions throughout
- Use dramatic language like "زلزلہ آگیا", "بے نقاب", "انکشاف"
- Include expert analysis and political commentary
- End with a dramatic conclusion
- Length: 5-10 minutes when read aloud
- Style: Dramatic Urdu news presentation with emotional intensity

Breaking News Story: ${agenda.title}
${agenda.url}`;
            
            await message.reply('⏳ Sending your content to Perplexity for script generation...');
            await sendToPerplexity(client, scriptPrompt);
            let script = '';
            try {
                script = await waitForPerplexityReply(client, (body) => body.length > 200, 60000);
                console.log('[DEBUG] Script received from Perplexity, length:', script.length);
                await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
            } catch (err) {
                console.error('[DEBUG] Script generation error:', err.message);
                try {
                    script = await generateUrduScript(agenda.title + '\n' + agenda.url);
                    await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
                } catch (fallbackErr) {
                    script = '❌ Could not generate script. Please try again later.';
                    await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
                }
            }
            
            // Generate visuals
            console.log('[DEBUG] Starting visuals generation...');
            try {
                const visualLinks = await getVisualLinks(script);
                if (visualLinks && visualLinks.length > 0) {
                    let visualsText = `🎬 **Visuals & Sources**\n\n`;
                    const youtubeLinks = visualLinks.filter(link => link.type === 'youtube');
                    const newsLinks = visualLinks.filter(link => link.type === 'news');
                    
                    if (youtubeLinks.length > 0) {
                        visualsText += `📺 **YouTube Videos (${youtubeLinks.length}):**\n\n`;
                        youtubeLinks.forEach((link, index) => {
                            visualsText += `${index + 1}. ${link.url}\n`;
                            if (link.title) visualsText += `   📝 ${link.title}\n`;
                            if (link.channel) visualsText += `   📺 ${link.channel}\n`;
                            visualsText += `\n`;
                        });
                    }
                    
                    if (newsLinks.length > 0) {
                        visualsText += `📰 **News Articles (${newsLinks.length}):**\n\n`;
                        newsLinks.forEach((link, index) => {
                            visualsText += `${index + 1}. ${link.url}\n`;
                            if (link.title) visualsText += `   📝 ${link.title}\n`;
                            visualsText += `\n`;
                        });
                    }
                    
                    visualsText += `\n✅ All links have been verified and are currently accessible.`;
                    await message.reply(visualsText);
                } else {
                    await message.reply('❌ Could not generate valid visuals. Please try again.');
                }
            } catch (err) {
                console.error('[DEBUG] Visuals generation error:', err.message);
                await message.reply('❌ Could not generate visuals. Please try again later.');
            }
            return;
        } else {
            await message.reply('درست نمبر بھیجیں۔');
        }
        return;
    }

    // Message filtering
    const trimmed = message.body.trimStart();
    const startsWithTopic = /^topic\s*:/i.test(trimmed);
    const startsWithVisuals = /^visuals\s*:/i.test(trimmed);
    const startsWithAgenda = /^agenda/i.test(trimmed);
    const startsWithHelp = /^help/i.test(trimmed) || /^ہیلپ/i.test(trimmed);
    if (!startsWithTopic && !startsWithVisuals && !startsWithAgenda && !startsWithHelp) {
        return;
    }

    // Editorial confirmation
    if (pendingEditorial && message.body.trim().toLowerCase() === 'yes') {
        await message.reply(`🇵🇰 *Vision Point - پاکستان کی آواز*\n📢 اسکرپٹ (اینکر پرامپٹر کے لیے):\n${pendingEditorial.script}`);
        let visualsMsg = `🎬 *ویژولز اور ایڈیٹر ہدایات:*\n`;
        pendingEditorial.visuals.forEach((v, i) => {
            visualsMsg += `\n${i + 1}. ${v}`;
        });
        visualsMsg += `\n\n🇵🇰 *پاکستان زندہ باد!* 💪`;
        await message.reply(visualsMsg);
        pendingEditorial = null;
        return;
    } else if (pendingEditorial && message.body.trim().toLowerCase() === 'no') {
        await message.reply('براہ کرم نیا مواد بھیجیں یا اپنی ہدایات واضح کریں۔');
        pendingEditorial = null;
        return;
    }

    // Agenda command
    if (/^\s*(agenda|new agenda)\s*$/i.test(message.body.trim())) {
        await message.reply('⏳ تازہ ترین عالمی خبروں کی تلاش جاری ہے...');
        try {
            let newsResults = [];
            
            console.log('[DEBUG] Using NewsAPI for news...');
            console.log('[DEBUG] NEWSAPI_KEY available:', !!NEWSAPI_KEY);
            
            if (!NEWSAPI_KEY) {
                console.log('[DEBUG] NEWSAPI_KEY not found, using fallback news');
                newsResults = [
                    {
                        title: 'Breaking: Latest developments in Pakistan - Dawn News',
                        url: 'https://www.dawn.com',
                        source: 'Dawn News',
                        region: 'Pakistan',
                        priority: 1,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Pakistan Army operations and security updates - Geo News',
                        url: 'https://www.geo.tv',
                        source: 'Geo News',
                        region: 'Pakistan',
                        priority: 1,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Global breaking news and international developments - BBC News',
                        url: 'https://www.bbc.com/news',
                        source: 'BBC News',
                        region: 'Global Breaking',
                        priority: 4,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Middle East conflict updates and regional news - Al Jazeera',
                        url: 'https://www.aljazeera.com',
                        source: 'Al Jazeera',
                        region: 'Middle East Conflict',
                        priority: 3,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Super powers news: China, USA, Russia developments - CNN',
                        url: 'https://www.cnn.com',
                        source: 'CNN',
                        region: 'Super Powers',
                        priority: 2,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    }
                ];
            } else {
                try {
                    // Pakistan Top Headlines
                    const pkRes = await axios.get('https://newsapi.org/v2/top-headlines', {
                        params: {
                            country: 'pk',
                            apiKey: NEWSAPI_KEY,
                            pageSize: 20
                        }
                    });
                    
                    if (pkRes.data.articles && pkRes.data.articles.length > 0) {
                        pkRes.data.articles.forEach((a, idx) => {
                            newsResults.push({
                                title: a.title,
                                url: a.url,
                                source: a.source.name,
                                region: 'Pakistan',
                                priority: 1,
                                publishedAt: a.publishedAt,
                                source: 'NewsAPI'
                            });
                        });
                        console.log('[DEBUG] Pakistan top headlines fetched:', pkRes.data.articles.length);
                    }
                    
                    // Pakistan Breaking News
                    const pkBreakingRes = await axios.get('https://newsapi.org/v2/everything', {
                        params: {
                            apiKey: NEWSAPI_KEY,
                            q: 'Pakistan AND (breaking OR latest OR today OR Trump OR fighter jets OR military OR army OR security OR terrorism OR Kashmir OR Balochistan OR elections OR government OR economy OR corruption OR Islamabad OR Lahore OR Karachi OR Peshawar OR Quetta)',
                            sortBy: 'publishedAt',
                            language: 'en',
                            pageSize: 15,
                            from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                        }
                    });
                    pkBreakingRes.data.articles.forEach((a, idx) => {
                        newsResults.push({
                            title: a.title,
                            url: a.url,
                            source: a.source.name,
                            region: 'Pakistan Breaking',
                            priority: 1,
                            publishedAt: a.publishedAt,
                            source: 'NewsAPI'
                        });
                    });
                    console.log('[DEBUG] Pakistan breaking news fetched:', pkBreakingRes.data.articles.length);
                    
                    // Super Powers News
                    const superPowersRes = await axios.get('https://newsapi.org/v2/everything', {
                        params: {
                            apiKey: NEWSAPI_KEY,
                            q: '(China OR USA OR United States OR Russia) AND (breaking OR latest OR today OR military OR economy OR politics OR Trump OR Biden OR Xi Jinping OR Putin OR trade OR technology OR AI OR conflict OR tension)',
                            sortBy: 'publishedAt',
                            language: 'en',
                            pageSize: 15,
                            from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                        }
                    });
                    superPowersRes.data.articles.forEach((a, idx) => {
                        newsResults.push({
                            title: a.title,
                            url: a.url,
                            source: a.source.name,
                            region: 'Super Powers',
                            priority: 2,
                            publishedAt: a.publishedAt,
                            source: 'NewsAPI'
                        });
                    });
                    console.log('[DEBUG] Super Powers news fetched:', superPowersRes.data.articles.length);
                    
                    // Middle East Conflict News
                    const middleEastRes = await axios.get('https://newsapi.org/v2/everything', {
                        params: {
                            apiKey: NEWSAPI_KEY,
                            q: '(Israel OR Palestine OR Gaza OR Hamas OR Hezbollah OR Iran OR Syria OR Lebanon OR Jordan OR Egypt OR Saudi Arabia OR Turkey OR Yemen OR Iraq) AND (conflict OR war OR attack OR missile OR rocket OR bombing OR fighting OR tension OR crisis OR breaking OR latest OR today)',
                            sortBy: 'publishedAt',
                            language: 'en',
                            pageSize: 12,
                            from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                        }
                    });
                    middleEastRes.data.articles.forEach((a, idx) => {
                        newsResults.push({
                            title: a.title,
                            url: a.url,
                            source: a.source.name,
                            region: 'Middle East Conflict',
                            priority: 3,
                            publishedAt: a.publishedAt,
                            source: 'NewsAPI'
                        });
                    });
                    console.log('[DEBUG] Middle East conflict news fetched:', middleEastRes.data.articles.length);
                    
                    // Global Breaking News
                    const globalRes = await axios.get('https://newsapi.org/v2/everything', {
                        params: {
                            apiKey: NEWSAPI_KEY,
                            q: '(Ukraine OR Russia OR North Korea OR Taiwan OR Afghanistan OR Kashmir OR Pakistan India OR Europe OR Asia OR Africa OR South America) AND (breaking OR latest OR today OR conflict OR war OR crisis OR tension OR military OR politics OR economy)',
                            sortBy: 'publishedAt',
                            language: 'en',
                            pageSize: 10,
                            from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                        }
                    });
                    globalRes.data.articles.forEach((a, idx) => {
                        newsResults.push({
                            title: a.title,
                            url: a.url,
                            source: a.source.name,
                            region: 'Global Breaking',
                            priority: 4,
                            publishedAt: a.publishedAt,
                            source: 'NewsAPI'
                        });
                    });
                    console.log('[DEBUG] Global breaking news fetched:', globalRes.data.articles.length);
                    
                    // Asia-Pacific Latest News
                    const asiaRes = await axios.get('https://newsapi.org/v2/everything', {
                        params: {
                            apiKey: NEWSAPI_KEY,
                            q: '(India OR Japan OR South Korea OR Philippines OR Vietnam OR Thailand OR Malaysia OR Indonesia OR Australia OR Singapore OR Bangladesh OR Sri Lanka) AND (breaking OR latest OR today OR politics OR economy OR military OR technology)',
                            sortBy: 'publishedAt',
                            language: 'en',
                            pageSize: 8,
                            from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                        }
                    });
                    asiaRes.data.articles.forEach((a, idx) => {
                        newsResults.push({
                            title: a.title,
                            url: a.url,
                            source: a.source.name,
                            region: 'Asia-Pacific',
                            priority: 5,
                            publishedAt: a.publishedAt,
                            source: 'NewsAPI'
                        });
                    });
                    console.log('[DEBUG] Asia-Pacific latest news fetched:', asiaRes.data.articles.length);
                    
                } catch (newsApiError) {
                    console.error('[DEBUG] NewsAPI failed:', newsApiError.message);
                    newsResults = [
                        {
                            title: 'Breaking: Latest developments in Pakistan',
                            url: 'https://www.dawn.com',
                            source: 'Dawn News',
                            region: 'Pakistan',
                            priority: 1,
                            publishedAt: new Date().toISOString(),
                            source: 'Fallback'
                        },
                        {
                            title: 'Global breaking news updates',
                            url: 'https://www.bbc.com/news',
                            source: 'BBC News',
                            region: 'Global Breaking',
                            priority: 4,
                            publishedAt: new Date().toISOString(),
                            source: 'Fallback'
                        }
                    ];
                    console.log('[DEBUG] Using fallback news items');
                }
            }
            
            // Remove duplicates and sort by priority and recency
            const uniqueNews = newsResults.filter((item, index, self) => 
                index === self.findIndex(t => t.title === item.title)
            );
            
            uniqueNews.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                return new Date(b.publishedAt) - new Date(a.publishedAt);
            });
            
            // Ensure good mix: Pakistan + Super Powers + Middle East + Global
            const pakistanNews = uniqueNews.filter(item => item.region === 'Pakistan' || item.region === 'Pakistan Breaking').slice(0, 8);
            const superPowersNews = uniqueNews.filter(item => item.region === 'Super Powers').slice(0, 8);
            const middleEastNews = uniqueNews.filter(item => item.region === 'Middle East Conflict').slice(0, 6);
            const globalNews = uniqueNews.filter(item => item.region === 'Global Breaking' || item.region === 'Asia-Pacific').slice(0, 8);
            
            const finalNews = [...pakistanNews, ...superPowersNews, ...middleEastNews, ...globalNews].slice(0, 30);
            
            latestAgendaItems = finalNews;
            
            try {
                fs.writeFileSync(AGENDA_FILE, JSON.stringify(latestAgendaItems, null, 2), 'utf-8');
            } catch (err) {
                console.error('[DEBUG] Failed to write agenda file:', err.message);
            }
            
            // Format numbered agenda with timestamps and source indicator
            let agendaMsg = '📰 *تازہ ترین عالمی خبریں (آج کی)*\n';
            agendaMsg += '🇵🇰 پاکستان + 🌍 سپر پاورز + ⚔️ مشرق وسطیٰ + 🌐 عالمی\n\n';
            
            finalNews.forEach((item, i) => {
                const timeAgo = getTimeAgo(item.publishedAt);
                const sourceIndicator = item.source === 'Fallback' ? '🔄 Fallback' : '📡 NewsAPI';
                agendaMsg += `${i + 1}. ${item.title}\n`;
                agendaMsg += `⏰ ${timeAgo} | 📰 ${item.source} | ${sourceIndicator}\n`;
                agendaMsg += `🔗 ${item.url}\n\n`;
            });
            
            agendaMsg += 'جس خبر پر اسکرپٹ چاہیے، اس کا نمبر بھیجیں۔';
            await message.reply(agendaMsg);
            
        } catch (err) {
            console.error('[AGENDA ERROR]', err.response?.status, err.response?.data || err.message);
            await message.reply('خبریں حاصل کرنے میں مسئلہ ہوا۔ بعد میں کوشش کریں۔');
        }
        return;
    }

    // Topic command
    if (/topic\s*:/i.test(message.body)) {
        console.log('[DEBUG] Processing topic command from:', message.from);
        const userContent = message.body;
        
        const scriptPrompt = `Create a dramatic, engaging 5-10 minute Urdu news script in the style of Pakistani news channels. Use Deep Research mode for accurate information.

SCRIPT STYLE REQUIREMENTS:
- Start with a dramatic headline and "ناظرین آج کی ویڈیو میں ہم بات کریں گے..."
- Use dramatic, emotional tone with multiple exclamation marks (!!!)
- Include phrases like "جی ہاں ناظرین", "ناظرین!", "لیکن سوال یہ ہے", "کیا یہی ہے"
- Use dramatic pauses with multiple commas (,,,)
- Include emotional appeals and patriotic elements
- Add rhetorical questions throughout
- Use dramatic language like "زلزلہ آگیا", "بے نقاب", "انکشاف"
- Include expert analysis and political commentary
- End with a dramatic conclusion
- Length: 5-10 minutes when read aloud
- Style: Dramatic Urdu news presentation with emotional intensity

Topic: ${userContent.replace(/topic\s*:\s*/i, '').trim()}`;

        await message.reply('⏳ Sending your content to Perplexity for script generation...');
        await sendToPerplexity(client, scriptPrompt);
        let script = '';
        try {
            script = await waitForPerplexityReply(client, (body) => body.length > 50, 60000);
            console.log('[DEBUG] Script received from Perplexity, length:', script.length);
            await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
            lastGeneratedScript = script;
        } catch (err) {
            console.error('[DEBUG] Script generation error:', err.message);
            try {
                script = await generateUrduScript(userContent);
                await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
            } catch (fallbackErr) {
                script = '❌ Could not generate script. Please try again later.';
                await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
            }
        }
        
        // Generate visuals
        console.log('[DEBUG] Starting visuals generation...');
        await message.reply('🎬 Generating visuals and sources...');
        
        try {
            const visualLinks = await getVisualLinks(script);
            if (visualLinks && visualLinks.length > 0) {
                let visualsText = `🎬 **Visuals & Sources**\n\n`;
                const youtubeLinks = visualLinks.filter(link => link.type === 'youtube');
                const newsLinks = visualLinks.filter(link => link.type === 'news');
                
                if (youtubeLinks.length > 0) {
                    visualsText += `📺 **YouTube Videos (${youtubeLinks.length}):**\n\n`;
                    youtubeLinks.forEach((link, index) => {
                        visualsText += `${index + 1}. ${link.url}\n`;
                        if (link.title) visualsText += `   📝 ${link.title}\n`;
                        if (link.channel) visualsText += `   📺 ${link.channel}\n`;
                        visualsText += `\n`;
                    });
                }
                
                if (newsLinks.length > 0) {
                    visualsText += `📰 **News Articles (${newsLinks.length}):**\n\n`;
                    newsLinks.forEach((link, index) => {
                        visualsText += `${index + 1}. ${link.url}\n`;
                        if (link.title) visualsText += `   📝 ${link.title}\n`;
                        visualsText += `\n`;
                    });
                }
                
                visualsText += `\n✅ All links have been verified and are currently accessible.`;
                await message.reply(visualsText);
            } else {
                await message.reply('❌ Could not generate valid visuals. Please try again.');
            }
        } catch (error) {
            console.error('[ERROR] Visuals generation failed:', error);
            await message.reply('❌ Visuals generation failed. Please try again.');
        }
        return;
    }

    // Visuals command
    const visualsMatch = message.body.match(/^\s*visuals\s*:\s*([\s\S]*)/i);
    if (visualsMatch) {
        const query = visualsMatch[1].trim();
        if (query) {
            await message.reply('⏳ Generating visuals and sources...');
            
            try {
                const visualLinks = await getVisualLinks(query);
                if (visualLinks && visualLinks.length > 0) {
                    let visualsText = `🎬 **Visuals & Sources**\n\n`;
                    const youtubeLinks = visualLinks.filter(link => link.type === 'youtube');
                    const newsLinks = visualLinks.filter(link => link.type === 'news');
                    
                    if (youtubeLinks.length > 0) {
                        visualsText += `📺 **YouTube Videos (${youtubeLinks.length}):**\n\n`;
                        youtubeLinks.forEach((link, index) => {
                            visualsText += `${index + 1}. ${link.url}\n`;
                            if (link.title) visualsText += `   📝 ${link.title}\n`;
                            if (link.channel) visualsText += `   📺 ${link.channel}\n`;
                            visualsText += `\n`;
                        });
                    }
                    
                    if (newsLinks.length > 0) {
                        visualsText += `📰 **News Articles (${newsLinks.length}):**\n\n`;
                        newsLinks.forEach((link, index) => {
                            visualsText += `${index + 1}. ${link.url}\n`;
                            if (link.title) visualsText += `   📝 ${link.title}\n`;
                            visualsText += `\n`;
                        });
                    }
                    
                    visualsText += `\n✅ All links have been verified and are currently accessible.`;
                    await message.reply(visualsText);
                } else {
                    await message.reply('❌ Could not generate valid visuals. Please try again.');
                }
            } catch (error) {
                console.error('[ERROR] Visuals generation failed:', error);
                await message.reply('❌ Visuals generation failed. Please try again.');
            }
            return;
        }
        if (!query) {
            await message.reply('براہ کرم "visuals:" کے بعد موضوع یا اسکرپٹ لکھیں، یا پہلے "topic:" کمانڈ استعمال کریں۔');
            return;
        }
        return;
    }

    // Editorial input
    if ((message.body.length > 200 || message.body.length > 2000) && !/topic\s*:/i.test(message.body)) {
        await message.reply('⏳ مواد کا تجزیہ اور متعلقہ اسکرپٹ و ویژولز تیار کیے جا رہے ہیں...');
        const script = await generateUrduScript(message.body);
        const paragraphs = message.body.split(/\n\s*\n|\n|\r\n/).filter(p => p.trim().length > 0);
        let ytLinks = [];
        let articleLinks = [];
        const { YOUTUBE_API_KEY, GOOGLE_CSE_API_KEY, GOOGLE_CSE_ID } = require('./config');
        
        function isUrdu(text) {
            return /[\u0600-\u06FF]/.test(text);
        }
        
        async function translateToEnglish(text) {
            try {
                const res = await axios.post('https://libretranslate.de/translate', {
                    q: text,
                    source: 'ur',
                    target: 'en',
                    format: 'text'
                }, { headers: { 'accept': 'application/json' } });
                return res.data.translatedText || text;
            } catch (err) {
                return text;
            }
        }
        
        for (let i = 0; i < paragraphs.length; i++) {
            let query = paragraphs[i].trim();
            if (isUrdu(query)) {
                query = await translateToEnglish(query);
            }
            
            try {
                const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        type: 'video',
                        q: query,
                        key: YOUTUBE_API_KEY,
                        maxResults: 10,
                    },
                });
                ytLinks = ytLinks.concat(ytRes.data.items.map(item => `https://www.youtube.com/watch?v=${item.id.videoId}`));
            } catch (err) {}
            
            try {
                if (GOOGLE_CSE_ID) {
                    const params = {
                        key: GOOGLE_CSE_API_KEY,
                        cx: GOOGLE_CSE_ID,
                        q: query,
                        num: 5,
                        safe: 'active'
                    };
                    const response = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
                    if (response.data.items && response.data.items.length > 0) {
                        articleLinks = articleLinks.concat(
                            response.data.items
                                .filter(item => item.link && !item.link.match(/(youtube|youtu\.be|vimeo|dailymotion|facebook|fb\.watch|twitter|tiktok)\./i))
                                .map(item => `${item.link}\n${item.title || ''}`)
                        );
                    }
                }
            } catch (err) {}
        }
        
        ytLinks = [...new Set(ytLinks)];
        articleLinks = [...new Set(articleLinks)];
        
        if (ytLinks.length === 0) {
            let fallbackQuery = message.body.trim();
            if (isUrdu(fallbackQuery)) {
                fallbackQuery = await translateToEnglish(fallbackQuery);
            }
            try {
                const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        type: 'video',
                        q: fallbackQuery,
                        key: YOUTUBE_API_KEY,
                        maxResults: 20,
                    },
                });
                ytLinks = ytRes.data.items.map(item => `https://www.youtube.com/watch?v=${item.id.videoId}`);
                ytLinks = [...new Set(ytLinks)];
            } catch (err) {}
        }
        
        if (articleLinks.length === 0) {
            let fallbackQuery = message.body.trim();
            if (isUrdu(fallbackQuery)) {
                fallbackQuery = await translateToEnglish(fallbackQuery);
            }
            try {
                if (GOOGLE_CSE_ID) {
                    const params = {
                        key: GOOGLE_CSE_API_KEY,
                        cx: GOOGLE_CSE_ID,
                        q: fallbackQuery,
                        num: 10,
                        safe: 'active'
                    };
                    const response = await axios.get('https://www.googleapis.com/customsearch/v1', { params });
                    if (response.data.items && response.data.items.length > 0) {
                        articleLinks = response.data.items
                            .filter(item => item.link && !item.link.match(/(youtube|youtu\.be|vimeo|dailymotion|facebook|fb\.watch|twitter|tiktok)\./i))
                            .map(item => `${item.link}\n${item.title || ''}`);
                        articleLinks = [...new Set(articleLinks)];
                    }
                }
            } catch (err) {}
        }
        
        if (ytLinks.length > 20) ytLinks = ytLinks.slice(0, 20);
        if (articleLinks.length > 10) articleLinks = articleLinks.slice(0, 10);
        
        let summaryMsg = `*خلاصہ اور جائزہ:*\n`;
        summaryMsg += `\n*اسکرپٹ کا آغاز:*\n${script.substring(0, 200)}...\n`;
        summaryMsg += `\n*یوٹیوب لنکس (10-20):*\n` + ytLinks.map((l, i) => `${i + 1}. ${l}`).join('\n');
        summaryMsg += `\n\n*خبریں/آرٹیکلز:*\n` + (articleLinks.length ? articleLinks.map((l, i) => `${i + 1}. ${l}`).join('\n') : '');
        summaryMsg += `\n\nکیا یہ اسکرپٹ اور ویژولز آپ کے مواد سے متعلق اور درست ہیں؟ (yes/no)`;
        pendingEditorial = { script, visuals: [...ytLinks, ...articleLinks] };
        await message.reply(summaryMsg);
        return;
    }

    // Help command
    if (message.body.toLowerCase().includes('help') || message.body.toLowerCase().includes('ہیلپ')) {
        const helpMsg = `🇵🇰 *Vision Point - پاکستان کی آواز* 💪\n\n*استعمال کرنے کا طریقہ:*\nTOPIC: [آپ کا موضوع]\n\n*مثال:*
TOPIC: پاک فوج کی شاندار کامیابی\nTOPIC: پاکستان میں سیلاب کی صورتحال\nTOPIC: پاکستان کرکٹ ٹیم کی جیت\n\n*خصوصیات:*
📢 پروفیشنل اردو نیوز اسکرپٹ\n🎬 متعلقہ ویڈیوز اور تصاویر\n🇵🇰 پاکستان کی محبت اور پاک فوج کی عزت\n\n*پاکستان زندہ باد!* 💪`;
        await message.reply(helpMsg);
        return;
    }
});

client.initialize();
console.log('Client initialization called.'); 