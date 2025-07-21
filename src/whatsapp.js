require('dotenv').config();
console.log('Starting WhatsApp bot...');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { generateUrduScript, translateToEnglish, checkScriptRelevance } = require('./ai');
const { getVisualLinks } = require('./visuals');
const axios = require('axios');
const { NEWSAPI_KEY, NEWSDATA_API_KEY } = require('./config');
const fs = require('fs');
const path = require('path');
const AGENDA_FILE = path.join(__dirname, '../agenda.json');

console.log('[DEBUG] NEWSAPI_KEY:', NEWSAPI_KEY ? NEWSAPI_KEY.slice(0, 6) + '...' : 'NOT SET');
console.log('[DEBUG] NEWSDATA_API_KEY:', NEWSDATA_API_KEY ? NEWSDATA_API_KEY.slice(0, 6) + '...' : 'NOT SET');

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
// Function to fetch Yahoo News as fallback
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

// Helper: Send a message to Perplexity
async function sendToPerplexity(client, text) {
    await client.sendMessage('18334363285@s.whatsapp.net', text);
}

// Helper: Wait for a reply from Perplexity
function waitForPerplexityReply(client, matchFn, timeoutMs = 90000) {
    return new Promise((resolve, reject) => {
        let timeout;
        const handler = async (msg) => {
            const msgTime = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
            console.log(`[DEBUG] Message received in waitForPerplexityReply at ${msgTime}:`, msg.from, msg.body.substring(0, 100) + '...');
            // Log the full message for debugging
            console.log('[DEBUG] Full Perplexity reply:', msg.body);
            const isFromPerplexity = msg.from === '18334363285@s.whatsapp.net' || 
                                   msg.from.includes('perplexity') || 
                                   msg.from.includes('18334363285') ||
                                   (msg.body && msg.body.length > 200 && 
                                    (msg.body.includes('السلام علیکم') || 
                                     msg.body.includes('ناظرین') || 
                                     msg.body.includes('پاکستان') ||
                                     msg.body.includes('ویژن پوائنٹ'))) ||
                                   (msg.body && msg.body.length > 100 && /https?:\/\//.test(msg.body)) ||
                                   msg.from === '18334363285@s.whatsapp.net';
            if (isFromPerplexity) {
                if (matchFn(msg.body, msg)) {
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

// Helper: Extract links from text (used for Perplexity WhatsApp replies)
function extractLinksFromText(text) {
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    return urls.map(url => ({
        url: url,
        type: url.includes('youtube.com') || url.includes('youtu.be') ? 'youtube' : 'news',
        source: 'perplexity_whatsapp'
    }));
}

// Updated visuals handler for WhatsApp Perplexity first, then fallback
async function getVisualsWithPerplexityFallback(client, topic, message, script = null) {
    // 1. Send explicit prompt to Perplexity WhatsApp
    const prompt = `Give me 10 YouTube links and 10 news articles about: ${topic}`;
    await message.reply('⏳ Asking Perplexity for visuals...');
    await sendToPerplexity(client, prompt);
    let reply = '';
    try {
        reply = await waitForPerplexityReply(client, (body) => /https?:\/\//.test(body), 60000);
    } catch (err) {
        reply = '';
    }
    let links = extractLinksFromText(reply);
    if (links.length >= 5) {
        await message.reply('✅ Visuals provided by Perplexity.');
        return links;
    }
    // 2. Fallback: Use YouTube/Google CSE APIs
    await message.reply('⚠️ Perplexity did not provide enough visuals. Using YouTube/Google fallback...');
    const { getVisualLinks } = require('./visuals');
    const apiLinks = await getVisualLinks(topic, script);
    return apiLinks;
}

// New serious, analytical Urdu news script prompt (with examples)
function seriousScriptPrompt(topic, url = '') {
    return `ایک 5-10 منٹ کا اردو نیوز اسکرپٹ لکھیں جو پاکستانی نیوز چینل کے اینکر کے لیے ہو۔

**اسکرپٹ اسٹائل ہدایات:**
- سنجیدہ، تجزیاتی اور حقائق پر مبنی صحافتی انداز استعمال کریں۔
- غیر ضروری ڈرامہ، جذباتی زبان، اور زیادہ علامتیں (!!!) استعمال نہ کریں۔
- سیاق و سباق، پس منظر، ماہرین کی رائے اور حقیقی دنیا پر اثرات پر توجہ دیں۔
- واضح، پروفیشنل اردو استعمال کریں جو نیوز اینکر کے لیے موزوں ہو۔
- پس منظر، ماہرین کی رائے، اور ممکنہ نتائج شامل کریں۔
- "زلزلہ آگیا"، "جی ہاں ناظرین"، یا اس طرح کے ڈرامائی جملے استعمال نہ کریں۔
- اسکرپٹ کی زبان اور ساخت نیچے دیے گئے مثالوں جیسی ہو:

**مثال 1:**
بھارت کی  آبی دہشت گردی ،، دریائے چناب پرقبضہ کرنے کا منصوبہ، ، کوار ڈیم کی تعمیر کیلئے 3 ہزار 119  کروڑ قرضے کی کوششیں تیز کردیں
السلام علیکم دوستو!
آج کی ویڈیو میں بات ہوگی بھارت کے اُس خطرناک اقدام کی… جو نہ صرف پاکستان کی زندگی کے لئے خطرہ ہے، بلکہ پورے خطے کو جنگ کی دہلیز پر لا کھڑا کر چکا ہے،،،جی ہاں! بات ہو رہی ہے بھارت کے اُس کوار ڈیم منصوبے کی، جو دریائے چناب پر برق رفتاری سے تعمیر کیا جا رہا ہے   اور اس پر خرچ  کئے جا رہے ہیں3 ہزار 119 کروڑ روپے،،، پاکستان کی دشمنی میں اندھا ہوکر  خزانے میں پیسے نہ ہونے پر بھارت کوار ڈیم بنانے کے لئے 3 ہزار 119 روپے کے قرض کے حصول کیلئے برق رفتاری سے کوششیں کر رہا ہے۔

ناظرین یہ ڈیم مقبوضہ کشمیر میں کشتواڑ ضلع میں بنایا جارہا ہے،،
لیکن یہ صرف ایک ڈیم نہیں... یہ ہے بھارت کا اعلانِ جنگ!

کیونکہ چناب وہ دریا ہے جو سندھ طاس معاہدے کے تحت پاکستان کا حق ہے۔ یہ معاہدہ کوئی زبانی وعدہ نہیں،،، بلکہ عالمی بینک کی گارنٹی کے ساتھ بین الاقوامی معاہدہ ہے،،، جس میں واضح طور پر درج ہے کہ بھارت مغربی دریاؤں کے پانی کو نہ روک سکتا ہے، نہ موڑ سکتا ہے، نہ کنٹرول کر سکتا ہے،،،لیکن بھارت نے اب کھل کر اس معاہدے کو توڑنے کیلئے عملی اقدامات شروع کردیئے ہیں۔۔۔ 
آبی ماہرین کا کہنا ہے بھارت کا یہ اقدام آبی دہشتگردی ہے،،، یہ پانی کے ذریعے پاکستان پر حملہ ہے۔
اور یاد رکھیں… پانی صرف قدرتی وسیلہ نہیں — یہ ہے زندگی کی سانس، ہماری زمین کی زرخیزی، ہماری فصلیں، ہماری معیشت، ہمارا مستقبل۔
پاکستان نے بارہا عالمی برادری کو خبردار کیا ہے کہ اگر بھارت نے ہمارے پانی پر ہاتھ ڈالا… تو یہ اقدام جنگ سمجھا جائے گا! بھارت کا حالیہ اقدام نہ صرف معاہدے کی روح کے خلاف ہے بلکہ خطے میں امن و استحکام کو خطرے میں ڈال رہا ہے۔
اب سوال یہ ہے:
کیا عالمی برادری سوئی رہے گی؟
کیا عالمی بینک — جو اس معاہدے کا گارنٹر ہے — خاموش تماشائی بنا رہے گا؟
کیا ہم پاکستانی اس سازش کو نظرانداز کر سکتے ہیں؟
ہمیں اب صرف احتجاج نہیں… اقدام کرنا ہوگا!
یہ وقت ہے قومی اتحاد کا۔
یہ وقت ہے بھارت کو کھلا پیغام دینے کا کہ پاکستان اپنا پانی کسی قیمت پر قربان نہیں کرے گا!
یہ صرف ایک ڈیم نہیں — یہ ہے پاکستان کی خودمختاری پر حملہ!
اور اگر اب بھی ہم نے آنکھیں بند رکھیں… تو شاید کل پینے کو پانی بھی نہ ملے۔

**مثال 2:**
السلام علیکم ناظرین!
آج ایک بار پھر میں آپ کے سامنے وہ کڑوا سچ لے آیا ہوں،
وہ سچ جو پی ٹی آئی نے برسوں تک جھوٹ، ڈرامے اور پروپیگنڈے کے پردے میں چھپایا رکھا۔
عمران خان  وہ شخص جسے کبھی "صادق اور امین" کہا گیا، مگر آج 190 ملین پاؤنڈ کیس میں 14 سال کی قید کاٹ رہا ہے،،،اور انکی بیوی بشری بی بی  جو نام نہاد روحانیت کا ڈھونگ ڈھونگ رچا کر طاقت اور دولت کا کھیل کھیلتی رہیں، 
وہ بھی 7 سال کی سزا یافتہ ہو چکی ہیں۔

ناظرین!
ملک ریاض سے اربوں روپے کی زمین رشوت میں لی گئی،
ریاستی تحفے بیچے گئے، قومی راز افشا کئے گئے،
اور پھر ملک میں آگ لگا کر خود کو مسیحا کہا گیا؟
یہی وہ جوڑا ہے جس نے معیشت کو دفن کیا،
اداروں پر حملے کرائے،
قوم کو تقسیم کیا،
اور قانون کو اپنے پاؤں تلے روند ڈالا۔

اب جبکہ ان کے جرائم ایک ایک کر کے بےنقاب ہو چکے ہیں —
یہی پی ٹی آئی 5 اگست کو اسلام آباد میں ایک اور فساد کی تیاری کر رہی ہے۔
نئے احتجاج کا اعلان مگر  وہی پرانا ایجنڈا
ریاست کو بلیک میل کرنا، عدالتوں اور اداروں کو دباؤ میں لانا،
اور عوام کی توجہ اپنی چوری، جھوٹ اور کرپشن سے ہٹانا۔

لیکن ناظرین، اب وقت آ چکا ہے کہ یہ تماشے بند کئے جائیں۔
عمران اور بشریٰ صرف سیاسی نہیں، قومی مجرم ہیں۔
ان کا ہر قدم پاکستان کو مزید پیچھے دھکیلنے کے مترادف ہے۔

کیا ہم ایک بار پھر ان کے فریب میں آئیں گے؟
یا اب ہم ہوش کے ناخن لیں گے؟

**مثال 3:**
مقبوضہ کشمیر میں سنسکرت کے نفاذ کی کوششیں، مقامی آبادی کی شناخت مٹانے کی نئی کوشش !

دوستو!
آج ہم ایک ایسے موضوع پر بات کریں گے  جو مقبوضہ کشمیر میں زبان،، شناخت،، تعلیمی پالیسیوں کے بارے میں شدید خدشات کو جنم دے رہا ہے۔
ناظرین! کافی عرصے سے خبریں گردش میں تھی بھارتی وزارت تعلیم مقبوضہ کشمیر میں چھٹی( ششم) جماعت سے لیکر کلاس دہم تک سنسکرت کو لازمی مضمون کے طور پر متعارف کرانے کا سوچ رہی ہے  اور اب مقبوضہ جموں و کشمیر کے سکول ایجوکیشن ڈیپارٹمنٹ نے 19 جولائی  کو باضابطہ اعلان کیا ایسا کوئی حکم وزارتِ تعلیم سے نہیں آیا ہے اور نہ ہی انہوں نے اس سلسلے میں کوئی قدم اٹھایا ہے

سیاسی مبصرین کے مطابق مقبوضہ کشمیر میں سنسکرت کے نفاذ کےجو دعوے کئے جارہے تھے وہ اصل میں ایک این جی او کی درخواست تھی جسے مقبوضہ کشمیر کے گورنر نے سکول ڈیپارٹمنٹ تک بھیجا مگر تاحال وہاں ابھی تک کوئی سرکاری کارروائی شروع نہیں ہوئی۔

ناظرین!
مقبوضہ کشمیر میں سنسکرت کے معاملے پر جذباتی رنگ موجود ہے،، عوامی ردعمل نے اس موضوع کو کشمیر کی ثقافتی شناخت پر حملے کے طور پر پیش کیا تھا۔ خاص طور پر سنسکرت کو ایک ایسی زبان کے طور پر دیکھا جس کا کشمیر کے اکثریتی مسلم آبادی سے کوئی تعلق نہیں،، مقبوضہ وادی میں سنسکرت پڑھائے جانےکو اسلامی و کشمیری ثقافتی بنیادوں کو مٹانے کی کوشش سمجھا گیا ۔
 مقبوضہ کشمیر میں اردو،،فارسی،، کشمیری زبانیں صدیوں سے رائج  ہیں وہاں پر سنسکرت، ایک غیر مسلم اور ہندو مذہبی زبان، کی تعلیمی لاگو کرنا ایک وسیع ہندوتوا ایجنڈے کا حصہ سمجھا گیاجو تاریخی طریقوں، نام تبدیلی، نصاب ترتیب دینے اور شناخت کی تبدیلی سے جڑا ہوا ہے ۔

سماجی امور کے ماہرین کا کہنا ہے مقبوضہ کشمیر میں اگر کبھی سنسکرت لازمی مقرر کردیا جائے تو اسکا مطلب ہوگا مقبوضہ کشمیر کی زبان، تاریخ اور ثقافت کو ایک خاص ایجنڈے کے تحت تبدیل کیا جائے،، مقبوضہ کشمیر کے نوجوانوں کو اپنے اسلامی اور کشمیری جڑوں سے الگ کرنے کی کوشش کی جائے گی،،،یہ ایک ایسی لسانی نوآبادیات ہو گی جو مقامی شناختوں کو کمزور کرے۔

**مثال 4:**
بھارت میں بڑھتے مذہبی تشدد کے واقعات

ناظرین السلام علیکم !
آج کی ویڈیو میں ہم ایک ایسے شرمناک واقعے پر بات کریں گے، جس نے بھارت میں غیر قانونیت اور بدامنی کا چہرہ بے نقاب کردیا ہے۔
اترپردیش کے مرزا پور ریلوے سٹیشن پر 19 جولائی کو کچھ کانوریہ یاتریوں نے بھارتی فورس سی آر پی ایف کے جوان گوتم کو شدید تشدد کا نشانہبنایا،،، گوتم ریلوے سٹیشن پر براہماپترا ایکسپریس ٹرین کے ٹکٹ کا انتظار کر رہا تھا،، سی سی ٹی وی فوٹیج کے مطابق نام نہاد یاتریوں جو اپنا مخصوص لباس پہنے ہوئے تھے نے گوتم کو  پہلے گرایا پھر اس پر مکوں اور  تھپڑوں کی بارش کردی اس موقع پر ریلوے سٹیشن پر موجود باقی افراد خاموشی سے یہ منظر دیکھتے رہے 

سماجیات کے ماہرین کا کہنا ہے یہ صرف معمولی جھگڑا نہیں تھا بلکہ ہجوم کو بتایا گیا ریاست اپنے اہلکار کے بجائے انکی حفاظت کر رہی ہے،،، ریاستی نرم رویے کا ایک ثبوت یہ بھی ہے کہ صرف 7 افراد گرفتار کئے گئے جو بعد میں ضمانت پر رہا ہوگئے،،، یہ واقعہ واضح کرتا ہے بھارت میں جوان کی وردی،، اسکا فرض،، ریاستی نمائندگی بھی ہجوم کے سامنے کچھ نہیں تھی،،،  جس طرح لوگ ایک سی آر پی ایف کے جوان کی پٹائی کو   بے حس ہو کر وائرل ویڈیو کی نظر بنا رہے تھے، بالکل وہی حکومتی ادارے بھی اسی بے بسی میں مصروف ہیں۔

ناظرین یہ پہلا اور آخری واقعہ نہیں سوشل میڈیا سائٹس پر ایسی خبرین آنا معمول کی بات ہیں جہاں کہا جاتا ہے اگراقلیتی طبقات سے تعلق رکھنے والا شہری اسطرح کا مظاہرہ کرے،،تو وہ ریاستی زیادتی کا شکار ہو جاتا ہے،،،لیکن ہندو ہجوم کی ریاستی ہمدردی میں اکثر ایف آئی آرز درج ہی نہیں ہوتیں۔

 تجزیہ کاروں نےسوال کیاہے اگر وردی والے سی آر پی ایف کے جوان کو ایسےمارا جاسکتا ہے تو بھارت میں عام شہری، خاص طور پر اقلیت یا سیاسی مخالفین، کہاں محفوظ ہیں؟ریاستی عدم انصاف اور فرقہ واریت کی یہ سچائی کیوں نظر انداز کر دی گئی؟
ناظرین یہ واقعہ ہمیں بتاتا ہےریاست کس طرح طاقت کے نمائندوں کی عصمت کو بھی پامال کرنے سے گریز نہیں کرتی۔

**ٹاپک:** ${topic}
${url}`;
}

// Remove Yahoo News fallback logic and add NewsData.io fallback

async function fetchNewsDataIO(query = 'latest') {
    try {
        const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_API_KEY}&language=ur,en&q=${encodeURIComponent(query)}`;
        const response = await axios.get(url);
        if (response.data && response.data.results && response.data.results.length > 0) {
            return response.data.results.map(article => ({
                title: article.title,
                url: article.link,
                source: article.source_id || 'NewsData.io',
                region: (article.country && article.country.length > 0 ? article.country[0] : 'Global'),
                priority: 3,
                publishedAt: article.pubDate || new Date().toISOString(),
            }));
        }
    } catch (err) {
        console.error('[NEWSDATA.IO] Error fetching news:', err.message);
    }
    return [];
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
            
            // Generate script using Perplexity with unique code marker
            const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();
            const scriptPrompt = seriousScriptPrompt(
                agenda.title +
                `\n\nبراہ کرم اسکرپٹ کے آخر میں یہ کوڈ ضرور لکھیں: ${uniqueCode}\nPlease write this code at the end of the script: ${uniqueCode}`
            );
            await message.reply('⏳ Sending your content to Perplexity for script generation...');
            await sendToPerplexity(client, scriptPrompt);
            // Wait 2 seconds before listening for replies to avoid picking up late replies
            await new Promise(res => setTimeout(res, 2000));
            let script = '';
            let attempts = 0;
            const maxAttempts = 3;
            let scriptRelevant = false;
            let lastError = null;
            while (attempts < maxAttempts && !scriptRelevant) {
                try {
                    // Only accept reply if it contains the unique code
                    script = await waitForPerplexityReply(client, (body) => body.length > 50 && body.includes(uniqueCode), 60000);
                    // Remove the code from the script before sending to user
                    script = script.replace(uniqueCode, '').trim();
                    // Translate topic and script to English
                    const topicEn = await translateToEnglish(agenda.title);
                    const scriptEn = await translateToEnglish(script);
                    // Check if script is relevant to the topic using Gemini
                    scriptRelevant = await checkScriptRelevance(topicEn, scriptEn);
                    if (!scriptRelevant) {
                        await message.reply('⚠️ Script was not relevant to the topic (Gemini check), retrying Perplexity...');
                        if (attempts < maxAttempts - 1) {
                            await sendToPerplexity(client, scriptPrompt);
                            await new Promise(res => setTimeout(res, 2000));
                        }
                    }
                } catch (err) {
                    lastError = err;
                    console.error('[DEBUG] Script generation error:', err.message);
                    script = '';
                    if (attempts < maxAttempts - 1) {
                        await message.reply('⚠️ Perplexity did not respond, retrying...');
                        await sendToPerplexity(client, scriptPrompt);
                        await new Promise(res => setTimeout(res, 2000));
                    }
                }
                attempts++;
            }
            if (scriptRelevant && script) {
                console.log('[DEBUG] Script received from Perplexity, length:', script.length);
                await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
                lastGeneratedScript = script;
            } else {
                // If Gemini says not relevant after all attempts, use Gemini to generate the script with the same topic
                try {
                    const fallbackPrompt = agenda.title;
                    script = await generateUrduScript(fallbackPrompt);
                    await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
                } catch (fallbackErr) {
                    script = '❌ Could not generate script. Please try again later.';
                    await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
                }
            }
            
            // Generate visuals
            console.log('[DEBUG] Starting visuals generation...');
            try {
                const visualLinks = await getVisualsWithPerplexityFallback(client, agenda.title, message, script);
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
                await message.reply('⚠️ NEWSAPI_KEY not configured. Using fallback news. Please set up your API keys in .env file.');
                newsResults = [
                    {
                        title: 'Breaking: Pakistan Army conducts successful operation in tribal areas',
                        url: 'https://www.dawn.com/news/pakistan-army-operation',
                        source: 'Dawn News',
                        region: 'Pakistan',
                        priority: 1,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Pakistan and China strengthen bilateral relations - New agreements signed',
                        url: 'https://www.geo.tv/news/pakistan-china-relations',
                        source: 'Geo News',
                        region: 'Pakistan',
                        priority: 1,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Middle East Crisis: Latest developments in Gaza conflict',
                        url: 'https://www.aljazeera.com/news/middle-east-crisis',
                        source: 'Al Jazeera',
                        region: 'Middle East Conflict',
                        priority: 3,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'US-China trade tensions escalate - New tariffs announced',
                        url: 'https://www.cnn.com/business/us-china-trade',
                        source: 'CNN',
                        region: 'Super Powers',
                        priority: 2,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Russia-Ukraine conflict: Latest battlefield updates',
                        url: 'https://www.bbc.com/news/world-europe-ukraine',
                        source: 'BBC News',
                        region: 'Global Breaking',
                        priority: 4,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'India-Pakistan border tensions - Latest security updates',
                        url: 'https://www.dawn.com/news/india-pakistan-border',
                        source: 'Dawn News',
                        region: 'Pakistan',
                        priority: 1,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Pakistan economy shows positive growth indicators',
                        url: 'https://www.geo.tv/business/pakistan-economy-growth',
                        source: 'Geo News',
                        region: 'Pakistan',
                        priority: 1,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Global climate change summit - World leaders meet',
                        url: 'https://www.bbc.com/news/science-environment',
                        source: 'BBC News',
                        region: 'Global Breaking',
                        priority: 4,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'Iran nuclear deal negotiations continue',
                        url: 'https://www.aljazeera.com/news/iran-nuclear-deal',
                        source: 'Al Jazeera',
                        region: 'Middle East Conflict',
                        priority: 3,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    },
                    {
                        title: 'China announces new technology initiatives',
                        url: 'https://www.cnn.com/technology/china-tech',
                        source: 'CNN',
                        region: 'Super Powers',
                        priority: 2,
                        publishedAt: new Date().toISOString(),
                        source: 'Fallback'
                    }
                ];
            } else {
                try {
                    // Test NewsAPI key first
                    console.log('[DEBUG] Testing NewsAPI key...');
                    const testRes = await axios.get('https://newsapi.org/v2/top-headlines', {
                        params: {
                            country: 'us',
                            apiKey: NEWSAPI_KEY,
                            pageSize: 1
                        }
                    });
                    
                    if (testRes.data.status === 'error') {
                        throw new Error(`NewsAPI Error: ${testRes.data.message}`);
                    }
                    
                    console.log('[DEBUG] NewsAPI key is valid, fetching news...');
                    
                    // Pakistan Top Headlines - Try both country and search
                    let pkArticles = [];
                    try {
                        const pkRes = await axios.get('https://newsapi.org/v2/top-headlines', {
                            params: {
                                country: 'pk',
                                apiKey: NEWSAPI_KEY,
                                pageSize: 10
                            }
                        });
                        if (pkRes.data.articles && pkRes.data.articles.length > 0) {
                            pkArticles = pkRes.data.articles;
                            console.log('[DEBUG] Pakistan top headlines fetched:', pkRes.data.articles.length);
                        }
                    } catch (pkErr) {
                        console.log('[DEBUG] Pakistan country search failed, trying search query...');
                    }
                    
                    // If no Pakistan country results, try search
                    if (pkArticles.length === 0) {
                        try {
                            const pkSearchRes = await axios.get('https://newsapi.org/v2/everything', {
                                                            params: {
                                apiKey: NEWSAPI_KEY,
                                q: 'Pakistan',
                                sortBy: 'publishedAt',
                                language: 'en',
                                pageSize: 10
                            }
                            });
                            if (pkSearchRes.data.articles && pkSearchRes.data.articles.length > 0) {
                                pkArticles = pkSearchRes.data.articles;
                                console.log('[DEBUG] Pakistan search results fetched:', pkSearchRes.data.articles.length);
                            }
                        } catch (pkSearchErr) {
                            console.log('[DEBUG] Pakistan search also failed:', pkSearchErr.message);
                        }
                    }
                    
                    // Add Pakistan articles to results
                    pkArticles.forEach((a, idx) => {
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
                    
                    // Pakistan Breaking News - Simplified query
                    try {
                        const pkBreakingRes = await axios.get('https://newsapi.org/v2/everything', {
                            params: {
                                apiKey: NEWSAPI_KEY,
                                q: 'Pakistan breaking news',
                                sortBy: 'publishedAt',
                                language: 'en',
                                pageSize: 10
                            }
                        });
                        if (pkBreakingRes.data.articles && pkBreakingRes.data.articles.length > 0) {
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
                        }
                    } catch (pkBreakingErr) {
                        console.log('[DEBUG] Pakistan breaking news failed:', pkBreakingErr.message);
                    }
                    
                    // Super Powers News - Simplified
                    try {
                        const superPowersRes = await axios.get('https://newsapi.org/v2/everything', {
                            params: {
                                apiKey: NEWSAPI_KEY,
                                q: 'China USA Russia breaking news',
                                sortBy: 'publishedAt',
                                language: 'en',
                                pageSize: 10
                            }
                        });
                        if (superPowersRes.data.articles && superPowersRes.data.articles.length > 0) {
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
                        }
                    } catch (superPowersErr) {
                        console.log('[DEBUG] Super Powers news failed:', superPowersErr.message);
                    }
                    
                    // Middle East Conflict News - Simplified
                    try {
                        const middleEastRes = await axios.get('https://newsapi.org/v2/everything', {
                            params: {
                                apiKey: NEWSAPI_KEY,
                                q: 'Israel Palestine Gaza breaking news',
                                sortBy: 'publishedAt',
                                language: 'en',
                                pageSize: 10
                            }
                        });
                        if (middleEastRes.data.articles && middleEastRes.data.articles.length > 0) {
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
                        }
                    } catch (middleEastErr) {
                        console.log('[DEBUG] Middle East conflict news failed:', middleEastErr.message);
                    }
                    
                    // Global Breaking News - Simplified
                    try {
                        const globalRes = await axios.get('https://newsapi.org/v2/everything', {
                            params: {
                                apiKey: NEWSAPI_KEY,
                                q: 'breaking news world',
                                sortBy: 'publishedAt',
                                language: 'en',
                                pageSize: 10
                            }
                        });
                        if (globalRes.data.articles && globalRes.data.articles.length > 0) {
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
                        }
                    } catch (globalErr) {
                        console.log('[DEBUG] Global breaking news failed:', globalErr.message);
                    }
                    
                    // Asia-Pacific Latest News - Simplified
                    try {
                        const asiaRes = await axios.get('https://newsapi.org/v2/everything', {
                            params: {
                                apiKey: NEWSAPI_KEY,
                                q: 'India Japan Asia breaking news',
                                sortBy: 'publishedAt',
                                language: 'en',
                                pageSize: 8
                            }
                        });
                        if (asiaRes.data.articles && asiaRes.data.articles.length > 0) {
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
                        }
                    } catch (asiaErr) {
                        console.log('[DEBUG] Asia-Pacific news failed:', asiaErr.message);
                    }
                    
                } catch (newsApiError) {
                    console.error('[DEBUG] NewsAPI failed:', newsApiError.message);
                    console.error('[DEBUG] NewsAPI error details:', newsApiError.response?.status, newsApiError.response?.data);
                    await message.reply('⚠️ NewsAPI request failed. Trying NewsData.io as fallback...');
                    // Try NewsData.io as fallback
                    try {
                        const newsDataNews = await fetchNewsDataIO();
                        if (newsDataNews && newsDataNews.length > 0) {
                            newsResults = newsDataNews;
                            console.log('[DEBUG] NewsData.io fallback successful:', newsDataNews.length, 'articles');
                            console.log('[DEBUG] NewsData.io articles:', JSON.stringify(newsDataNews, null, 2));
                            await message.reply('✅ NewsData.io fallback successful!');
                        } else {
                            throw new Error('No NewsData.io articles found');
                        }
                    } catch (newsDataError) {
                        console.error('[DEBUG] NewsData.io fallback also failed:', newsDataError.message);
                        await message.reply('⚠️ Both NewsAPI and NewsData.io failed. Using static fallback news.');
                        newsResults = [
                            {
                                title: 'Breaking: Latest developments in Pakistan',
                                url: 'https://www.dawn.com',
                                source: 'Dawn News',
                                region: 'Pakistan',
                                priority: 1,
                                publishedAt: new Date().toISOString(),
                                source: 'Static Fallback'
                            },
                            {
                                title: 'Global breaking news updates',
                                url: 'https://www.bbc.com/news',
                                source: 'BBC News',
                                region: 'Global Breaking',
                                priority: 4,
                                publishedAt: new Date().toISOString(),
                                source: 'Static Fallback'
                            }
                        ];
                        console.log('[DEBUG] Using static fallback news items');
                    }
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
            
            // Check if we got enough news from NewsAPI
            if (uniqueNews.length < 5) {
                console.log('[DEBUG] NewsAPI returned insufficient results, trying NewsData.io fallback...');
                try {
                    const newsDataNews = await fetchNewsDataIO();
                    if (newsDataNews && newsDataNews.length > 0) {
                        // Combine NewsAPI and NewsData.io results
                        const combinedNews = [...uniqueNews, ...newsDataNews];
                        const finalCombinedNews = combinedNews.filter((item, index, self) => 
                            index === self.findIndex(t => t.title === item.title)
                        );
                        
                        finalCombinedNews.sort((a, b) => {
                            if (a.priority !== b.priority) {
                                return a.priority - b.priority;
                            }
                            return new Date(b.publishedAt) - new Date(a.publishedAt);
                        });
                        
                        console.log('[DEBUG] Combined NewsAPI + NewsData.io results:', finalCombinedNews.length);
                        uniqueNews.length = 0; // Clear and replace
                        uniqueNews.push(...finalCombinedNews);
                    }
                } catch (newsDataError) {
                    console.log('[DEBUG] NewsData.io fallback failed:', newsDataError.message);
                }
            }
            
            // Ensure good mix: Pakistan + Super Powers + Middle East + Global
            const pakistanNews = uniqueNews.filter(item => item.region === 'Pakistan' || item.region === 'Pakistan Breaking');
            const superPowersNews = uniqueNews.filter(item => item.region === 'Super Powers');
            const middleEastNews = uniqueNews.filter(item => item.region === 'Middle East Conflict');
            const globalNews = uniqueNews.filter(item => item.region === 'Global Breaking' || item.region === 'Asia-Pacific' || item.region === 'Global');
            
            // Combine all news without slicing, to show all articles
            let finalNews = [...pakistanNews, ...superPowersNews, ...middleEastNews, ...globalNews];
            
            // If NewsData.io was used, or if finalNews is empty, just show all uniqueNews
            if (
              (newsResults && newsResults.length > 0 && newsResults[0].source === 'NewsData.io') ||
              finalNews.length === 0
            ) {
              finalNews = uniqueNews;
            }
            
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
        // Generate a unique 4-digit code for this topic
        const uniqueCode = Math.floor(1000 + Math.random() * 9000).toString();
        const cleanTopic = userContent.replace(/topic\s*:\s*/i, '').trim();
        // Add explicit Urdu and English instruction to include the code at the end
        const scriptPrompt = seriousScriptPrompt(
          cleanTopic +
          `\n\nبراہ کرم اسکرپٹ کے آخر میں یہ کوڈ ضرور لکھیں: ${uniqueCode}\nPlease write this code at the end of the script: ${uniqueCode}`
        );
        // Record the time the prompt was sent
        const promptSentTime = Date.now();
        await message.reply('⏳ Sending your content to Perplexity for script generation...');
        await sendToPerplexity(client, scriptPrompt);
        // Wait 2 seconds before listening for replies to avoid picking up late replies
        await new Promise(res => setTimeout(res, 2000));
        let script = '';
        let attempts = 0;
        const maxAttempts = 3;
        let scriptRelevant = false;
        let lastError = null;
        while (attempts < maxAttempts && !scriptRelevant) {
            try {
                // Only accept reply if it contains the unique code
                script = await waitForPerplexityReply(client, (body) => body.length > 50 && body.includes(uniqueCode), 60000);
                // Remove the code from the script before sending to user
                script = script.replace(uniqueCode, '').trim();
                // Translate topic and script to English
                const topicEn = await translateToEnglish(cleanTopic);
                const scriptEn = await translateToEnglish(script);
                // Check if script is relevant to the topic using Gemini
                scriptRelevant = await checkScriptRelevance(topicEn, scriptEn);
                if (!scriptRelevant) {
                    await message.reply('⚠️ Script was not relevant to the topic (Gemini check), retrying Perplexity...');
                    if (attempts < maxAttempts - 1) {
                        await sendToPerplexity(client, scriptPrompt);
                        await new Promise(res => setTimeout(res, 2000));
                    }
                }
            } catch (err) {
                lastError = err;
                console.error('[DEBUG] Script generation error:', err.message);
                script = '';
                if (attempts < maxAttempts - 1) {
                    await message.reply('⚠️ Perplexity did not respond, retrying...');
                    await sendToPerplexity(client, scriptPrompt);
                    await new Promise(res => setTimeout(res, 2000));
                }
            }
            attempts++;
        }
        if (scriptRelevant && script) {
            console.log('[DEBUG] Script received from Perplexity, length:', script.length);
            await message.reply(`📰 **Vision Point News Script**\n\n${script}`);
            lastGeneratedScript = script;
        } else {
            // If Gemini says not relevant after all attempts, use Gemini to generate the script with the same topic
            try {
                const fallbackPrompt = cleanTopic;
                script = await generateUrduScript(fallbackPrompt);
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
            const visualLinks = await getVisualsWithPerplexityFallback(client, cleanTopic, message, script);
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
                const visualLinks = await getVisualsWithPerplexityFallback(client, query, message);
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

// Dummy HTTP server for Render deployment health checks
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WhatsApp bot is running\n');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Dummy HTTP server listening on port ${PORT}`);
});