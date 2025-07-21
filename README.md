# Vision Point AI WhatsApp News Agent

A real-time Urdu news assistant for Pakistani news channel **Vision Point**. Users send a news topic on WhatsApp, and the agent replies with a 1-minute Urdu news script (via Gemini AI) and direct video/image links (via Perplexity, YouTube, Pexels).

## Features
- WhatsApp integration (whatsapp-web.js)
- Gemini 1.5 Flash API for Urdu script
- Perplexity API for direct video/image links (fallback: YouTube, Pexels)
- Free tools only
- Modular, clean code

## Setup

1. **Clone & Install**
   ```bash
   git clone <repo-url>
   cd auto
   npm install
   ```

2. **Configure API Keys**
   Create a `.env` file in the root directory:
   ```env
   GEMINI_API_KEY=your_gemini_key
   PERPLEXITY_API_KEY=your_perplexity_key
   YOUTUBE_API_KEY=your_youtube_key
   PEXELS_API_KEY=your_pexels_key
   GOOGLE_CSE_API_KEY=AIzaSyAZbuNtPl0jY9xxBCFL2VOveMXvZRCPIzY
   GOOGLE_CSE_ID=your_custom_search_engine_id
   ```
   - [Gemini API](https://aistudio.google.com/app/apikey)
   - [Perplexity API](https://docs.perplexity.ai/docs/api)
   - [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
   - [Pexels API](https://www.pexels.com/api/)
   - [Google Custom Search Engine](https://cse.google.com/cse/) - Create a CSE and get the Search Engine ID

3. **Run the Agent**
   ```bash
   node src/whatsapp.js
   ```
   - On first run, a QR code will appear in the terminal.
   - **Scan the QR code with your WhatsApp mobile app** (Menu > Linked Devices > Link a Device).

4. **Usage**
   - Send a message to your WhatsApp (or the bot's number) in this format:
     ```
     TOPIC: پاکستان میں سیلاب کی صورتحال
     ```
   - The bot will reply with:
     - 1-minute Urdu news script
     - Direct video/image links

## Sample .env
```
GEMINI_API_KEY=
PERPLEXITY_API_KEY=
YOUTUBE_API_KEY=
PEXELS_API_KEY=
GOOGLE_CSE_API_KEY=AIzaSyAZbuNtPl0jY9xxBCFL2VOveMXvZRCPIzY
GOOGLE_CSE_ID=
```

## Notes
- Works locally or on Railway free tier
- All APIs used are free (with quotas)
- If Perplexity quota is exceeded, falls back to Google CSE, YouTube and Pexels
- Google CSE provides additional image and video search capabilities

---
**Vision Point** | Urdu News, Automated 