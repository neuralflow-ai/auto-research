# Vision Point WhatsApp Bot Setup Guide

## Required API Keys

To make the agenda command work properly, you need to set up the following API keys:

### 1. NewsAPI Key (Required for Agenda)
- Go to https://newsapi.org/
- Sign up for a free account
- Get your API key
- Add it to your `.env` file

### 2. YouTube Data API Key (Optional)
- Go to https://console.cloud.google.com/
- Create a new project or select existing one
- Enable YouTube Data API v3
- Create credentials (API key)
- Add it to your `.env` file

### 3. Google Custom Search API (Optional)
- Go to https://console.cloud.google.com/
- Enable Custom Search API
- Create credentials (API key)
- Create a Custom Search Engine at https://cse.google.com/
- Get your Search Engine ID
- Add both to your `.env` file

## Environment File Setup

Create a `.env` file in the root directory with the following content:

```env
# API Keys for Vision Point WhatsApp Bot
# Replace these with your actual API keys

# NewsAPI - Get from https://newsapi.org/
NEWSAPI_KEY=your_newsapi_key_here

# YouTube Data API - Get from https://console.cloud.google.com/
YOUTUBE_API_KEY=your_youtube_api_key_here

# Google Custom Search API - Get from https://console.cloud.google.com/
GOOGLE_CSE_API_KEY=your_google_cse_api_key_here
GOOGLE_CSE_ID=your_google_cse_id_here

# Perplexity API (if needed later)
PERPLEXITY_API_KEY=your_perplexity_api_key_here

# Gemini API (if needed)
GEMINI_API_KEY=your_gemini_api_key_here

# Pexels API (if needed)
PEXELS_API_KEY=your_pexels_api_key_here
```

## How to Use

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your API keys** in the `.env` file

3. **Run the bot:**
   ```bash
   node src/whatsapp.js
   ```

4. **Scan the QR code** with WhatsApp

5. **Use the commands:**
   - `agenda` - Get latest news headlines
   - `topic: [your topic]` - Generate news script for a topic
   - `visuals: [query]` - Get visuals and sources
   - `help` - Show help message

## Troubleshooting

### Agenda Command Not Working
- Make sure you have a valid NewsAPI key
- Check that the `.env` file is in the root directory
- Verify the API key is correctly formatted
- The bot will use fallback news if no API key is provided

### No News Showing
- Check your internet connection
- Verify your NewsAPI key is active
- Check the console logs for error messages

## Features

- **NewsAPI Integration**: Fetches real-time news from multiple sources
- **Fallback System**: Works even without API keys (limited functionality)
- **Urdu Script Generation**: Creates dramatic news scripts in Urdu
- **Visual Sources**: Provides YouTube videos and news articles
- **WhatsApp Integration**: Full WhatsApp bot functionality

## Support

If you encounter issues:
1. Check the console logs for error messages
2. Verify your API keys are correct
3. Ensure all dependencies are installed
4. Check your internet connection 