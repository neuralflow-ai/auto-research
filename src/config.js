require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

module.exports = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  PEXELS_API_KEY: process.env.PEXELS_API_KEY,
  GOOGLE_CSE_API_KEY: process.env.GOOGLE_CSE_API_KEY || 'AIzaSyAZbuNtPl0jY9xxBCFL2VOveMXvZRCPIzY',
  GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID,
  NEWSAPI_KEY: process.env.NEWSAPI_KEY,
  NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY, // Add this line for NewsData.io
}; 