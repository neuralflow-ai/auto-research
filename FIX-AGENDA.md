# Fix Agenda Command Issue

## Problem
The agenda command is not showing real news because the NEWSAPI_KEY is invalid.

## Solution

1. **Get a free NewsAPI key:**
   - Go to https://newsapi.org/
   - Sign up for a free account
   - Copy your API key

2. **Update your .env file:**
   - Open the `.env` file in the project root
   - Replace `your_newsapi_key_here` with your actual API key
   - Save the file

3. **Restart the bot:**
   - Stop the current bot (Ctrl+C)
   - Run `node src/whatsapp.js` again

## Example .env file:
```env
NEWSAPI_KEY=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
```

## Test the fix:
Run this command to test if your API key works:
```bash
node test-agenda.js
```

You should see: "✅ NewsAPI connection successful"

## Current Status
- ✅ Bot syntax is fixed
- ✅ Fallback news is working
- ❌ Real news API key needs to be configured
- ⚠️ Replace the placeholder API key with a real one

## Quick Test
After fixing the API key, send "agenda" to your WhatsApp bot and you should see real news headlines! 