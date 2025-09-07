const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// API Keys (add these to your .env file)
const API_KEYS = {
  ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY || 'demo',
  NEWS_API: process.env.NEWS_API_KEY || '',
  FINNHUB: process.env.FINNHUB_API_KEY || '',
  POLYGON: process.env.POLYGON_API_KEY || ''
};

// Helper function to handle API errors
const handleApiError = (error, res, source) => {
  console.error(`${source} API Error:`, error.message);
  
  if (error.response) {
    return res.status(error.response.status).json({
      error: `${source} API Error: ${error.response.statusText}`,
      details: error.response.data
    });
  }
  
  res.status(500).json({
    error: `${source} Service Unavailable`,
    message: 'Please try again later'
  });
};

// ===== STOCK DATA ENDPOINTS =====

// Yahoo Finance Proxy
app.get('/api/stocks/yahoo/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '1d', range = '1d' } = req.query;
    
    const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
      params: { interval, range },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 10000
    });
    
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res, 'Yahoo Finance');
  }
});

// Alpha Vantage Proxy
app.get('/api/stocks/alphavantage', async (req, res) => {
  try {
    const { function: func, symbol, interval, outputsize = 'compact' } = req.query;
    
    if (!API_KEYS.ALPHA_VANTAGE || API_KEYS.ALPHA_VANTAGE === 'demo') {
      return res.status(400).json({
        error: 'Alpha Vantage API key not configured',
        message: 'Please add ALPHA_VANTAGE_API_KEY to your .env file'
      });
    }
    
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: func,
        symbol,
        interval,
        outputsize,
        apikey: API_KEYS.ALPHA_VANTAGE
      },
      timeout: 15000
    });
    
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res, 'Alpha Vantage');
  }
});

// Finnhub Proxy (Alternative free API)
app.get('/api/stocks/finnhub/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    if (!API_KEYS.FINNHUB) {
      return res.status(400).json({
        error: 'Finnhub API key not configured',
        message: 'Please add FINNHUB_API_KEY to your .env file'
      });
    }
    
    const response = await axios.get(`https://finnhub.io/api/v1/quote`, {
      params: {
        symbol: symbol,
        token: API_KEYS.FINNHUB
      },
      timeout: 10000
    });
    
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res, 'Finnhub');
  }
});

// NSE India Proxy (with proper headers)
app.get('/api/stocks/nse', async (req, res) => {
  try {
    const { index = 'NIFTY%2050' } = req.query;
    
    const response = await axios.get(`https://www.nseindia.com/api/equity-stockIndices`, {
      params: { index },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.nseindia.com/',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 15000
    });
    
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res, 'NSE India');
  }
});

// Multiple stocks endpoint
app.post('/api/stocks/batch', async (req, res) => {
  try {
    const { symbols, source = 'yahoo' } = req.body;
    
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'symbols array is required'
      });
    }
    
    const results = [];
    const errors = [];
    
    // Process symbols in batches to avoid overwhelming APIs
    const batchSize = 5;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (symbol) => {
        try {
          if (source === 'yahoo') {
            const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`, {
              params: { interval: '1d', range: '1d' },
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
              },
              timeout: 8000
            });
            return { symbol, data: response.data, source: 'yahoo' };
          }
          
          // Add other sources as needed
          return null;
        } catch (error) {
          errors.push({ symbol, error: error.message });
          return null;
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      });
      
      // Add small delay between batches
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    res.json({
      success: true,
      data: results,
      errors: errors,
      total: symbols.length,
      successful: results.length
    });
    
  } catch (error) {
    handleApiError(error, res, 'Batch Stock');
  }
});

// ===== NEWS ENDPOINTS =====

// News API Proxy
app.get('/api/news', async (req, res) => {
  try {
    const { q, language = 'en', sortBy = 'publishedAt', pageSize = 10 } = req.query;
    
    if (!API_KEYS.NEWS_API) {
      return res.status(400).json({
        error: 'News API key not configured',
        message: 'Please add NEWS_API_KEY to your .env file'
      });
    }
    
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q,
        language,
        sortBy,
        pageSize,
        apiKey: API_KEYS.NEWS_API
      },
      timeout: 10000
    });
    
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res, 'News API');
  }
});

// Financial news from Alpha Vantage
app.get('/api/news/financial', async (req, res) => {
  try {
    const { topics = 'technology,finance', sort = 'LATEST', limit = 50 } = req.query;
    
    if (!API_KEYS.ALPHA_VANTAGE || API_KEYS.ALPHA_VANTAGE === 'demo') {
      return res.status(400).json({
        error: 'Alpha Vantage API key not configured',
        message: 'Please add ALPHA_VANTAGE_API_KEY to your .env file'
      });
    }
    
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'NEWS_SENTIMENT',
        topics,
        sort,
        limit,
        apikey: API_KEYS.ALPHA_VANTAGE
      },
      timeout: 15000
    });
    
    res.json(response.data);
  } catch (error) {
    handleApiError(error, res, 'Financial News');
  }
});

// ===== MARKET STATUS ENDPOINT =====

app.get('/api/market/status', (req, res) => {
  const now = new Date();
  const indianTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const dayOfWeek = indianTime.getDay();
  const hours = indianTime.getHours();
  const minutes = indianTime.getMinutes();
  const currentTime = hours * 100 + minutes;
  
  let status = 'CLOSED';
  let message = 'Market is closed';
  
  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    status = 'CLOSED';
    message = 'Market is closed (Weekend)';
  }
  // Market hours: 9:15 AM to 3:30 PM (IST)
  else if (currentTime >= 915 && currentTime <= 1530) {
    status = 'OPEN';
    message = 'Market is open';
  } else if (currentTime < 915) {
    status = 'PRE_MARKET';
    message = 'Pre-market hours';
  }
  
  res.json({
    status,
    message,
    currentTime: indianTime.toISOString(),
    marketOpen: '09:15',
    marketClose: '15:30',
    timezone: 'Asia/Kolkata'
  });
});

// ===== HEALTH CHECK =====

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// ===== ERROR HANDLING =====

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: 'The requested API endpoint does not exist'
  });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong on our end'
  });
});

// ===== START SERVER =====

app.listen(PORT, () => {
  console.log(`🚀 TradePro Backend Server running on port ${PORT}`);
  console.log(`📊 API Documentation available at http://localhost:${PORT}/api/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Log API key status
  console.log('\n📋 API Keys Status:');
  console.log(`  Alpha Vantage: ${API_KEYS.ALPHA_VANTAGE !== 'demo' ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  News API: ${API_KEYS.NEWS_API ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Finnhub: ${API_KEYS.FINNHUB ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`  Polygon: ${API_KEYS.POLYGON ? '✅ Configured' : '❌ Not configured'}`);
});

module.exports = app;