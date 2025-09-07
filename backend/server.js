const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ===== SECURITY & PERFORMANCE MIDDLEWARE =====

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());

// Enhanced CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://your-domain.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced rate limiting
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: message,
      retryAfter: Math.ceil(windowMs / 1000)
    });
  }
});

// Different rate limits for different endpoints
app.use('/api/stocks', createRateLimit(60 * 1000, 100, 'Too many stock requests'));
app.use('/api/news', createRateLimit(60 * 1000, 50, 'Too many news requests'));
app.use('/api/search', createRateLimit(60 * 1000, 30, 'Too many search requests'));

// ===== API CONFIGURATION =====

const API_KEYS = {
  ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY,
  NEWS_API: process.env.NEWS_API_KEY,
  FINNHUB: process.env.FINNHUB_API_KEY,
  POLYGON: process.env.POLYGON_API_KEY
};

// Validate API keys on startup
const validateApiKeys = () => {
  const missing = [];
  Object.entries(API_KEYS).forEach(([key, value]) => {
    if (!value || value === 'demo') {
      missing.push(key);
    }
  });
  
  if (missing.length > 0) {
    console.warn(`⚠️ Missing API keys: ${missing.join(', ')}`);
    console.warn('Some features may not work properly');
  }
  
  return missing.length === 0;
};

// Enhanced API configuration with proper headers for real APIs
const getApiHeaders = (type) => {
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  switch (type) {
    case 'yahoo':
      return {
        ...baseHeaders,
        'Referer': 'https://finance.yahoo.com/',
        'Origin': 'https://finance.yahoo.com'
      };
    case 'alphavantage':
      return {
        ...baseHeaders,
        'Referer': 'https://www.alphavantage.co/'
      };
    case 'finnhub':
      return {
        ...baseHeaders,
        'Referer': 'https://finnhub.io/'
      };
    default:
      return baseHeaders;
  }
};

// ===== ENHANCED ERROR HANDLING =====

const handleApiError = (error, res, source, details = {}) => {
  console.error(`${source} API Error:`, {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
    ...details
  });
  
  if (error.response) {
    const status = error.response.status;
    let message = `${source} API Error`;
    
    switch (status) {
      case 401:
        message = 'API authentication failed - please check API keys';
        break;
      case 403:
        message = 'API access forbidden - check API permissions';
        break;
      case 429:
        message = 'API rate limit exceeded - please try again later';
        break;
      case 500:
        message = `${source} server error - please try again`;
        break;
      default:
        message = `${source} API Error: ${error.response.statusText}`;
    }
    
    return res.status(status).json({
      error: message,
      source,
      status,
      retryAfter: error.response.headers?.['retry-after'],
      details: process.env.NODE_ENV === 'development' ? error.response.data : undefined
    });
  }
  
  res.status(503).json({
    error: `${source} service temporarily unavailable`,
    message: 'Please try again in a few moments',
    source
  });
};

// ===== CACHING MIDDLEWARE =====

const cache = new Map();
const CACHE_DURATIONS = {
  STOCK_DATA: 2 * 60 * 1000,      // 2 minutes
  NEWS_DATA: 15 * 60 * 1000,     // 15 minutes
  SEARCH_DATA: 30 * 60 * 1000,   // 30 minutes
  CHART_DATA: 5 * 60 * 1000      // 5 minutes
};

const cacheMiddleware = (duration) => (req, res, next) => {
  const key = req.originalUrl;
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < duration) {
    console.log(`📦 Cache hit: ${key}`);
    return res.json(cached.data);
  }
  
  const originalJson = res.json;
  res.json = function(data) {
    if (res.statusCode === 200) {
      cache.set(key, {
        data,
        timestamp: Date.now()
      });
    }
    return originalJson.call(this, data);
  };
  
  next();
};

// Clean cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > Math.max(...Object.values(CACHE_DURATIONS))) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

// ===== REAL API IMPLEMENTATIONS =====

// Multiple stock data with intelligent fallback between real APIs
app.post('/api/stocks/batch', cacheMiddleware(CACHE_DURATIONS.STOCK_DATA), async (req, res) => {
  try {
    const { symbols, source = 'auto' } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'symbols array is required and must not be empty'
      });
    }
    
    if (symbols.length > 20) {
      return res.status(400).json({
        error: 'Too many symbols',
        message: 'Maximum 20 symbols allowed per request'
      });
    }
    
    console.log(`📈 Fetching batch data for ${symbols.length} symbols from ${source}`);
    
    const results = [];
    const errors = [];
    let successfulRequests = 0;
    
    // Try different real API sources in order of preference
    const sources = source === 'auto' ? ['finnhub', 'alpha_vantage', 'polygon'] : [source];
    
    for (const currentSource of sources) {
      if (successfulRequests >= symbols.length) break;
      
      const remainingSymbols = symbols.filter(symbol => 
        !results.some(result => result.symbol === symbol)
      );
      
      if (remainingSymbols.length === 0) break;
      
      try {
        let sourceResults = [];
        
        switch (currentSource) {
          case 'finnhub':
            sourceResults = await fetchFromFinnhub(remainingSymbols);
            break;
          case 'alpha_vantage':
            sourceResults = await fetchFromAlphaVantage(remainingSymbols);
            break;
          case 'polygon':
            sourceResults = await fetchFromPolygon(remainingSymbols);
            break;
          default:
            throw new Error(`Unknown source: ${currentSource}`);
        }
        
        results.push(...sourceResults);
        successfulRequests += sourceResults.length;
        
        console.log(`✅ Got ${sourceResults.length} results from ${currentSource}`);
        
      } catch (error) {
        console.warn(`❌ ${currentSource} failed:`, error.message);
        errors.push({
          source: currentSource,
          error: error.message,
          symbols: remainingSymbols
        });
      }
    }
    
    if (results.length === 0) {
      return res.status(503).json({
        error: 'All stock data sources failed',
        message: 'Unable to fetch stock data from any API provider',
        errors: errors,
        retryAfter: 60
      });
    }
    
    // Enhance results with additional data
    const enhancedResults = results.map(stock => ({
      ...stock,
      lastUpdated: new Date().toISOString(),
      source: stock.source || 'multiple'
    }));
    
    res.json({
      success: true,
      data: enhancedResults,
      errors: errors,
      total: symbols.length,
      successful: enhancedResults.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    handleApiError(error, res, 'Batch Stock API', { symbols: req.body.symbols });
  }
});

// Finnhub implementation (Primary - most reliable for real-time data)
async function fetchFromFinnhub(symbols) {
  if (!API_KEYS.FINNHUB) {
    throw new Error('Finnhub API key not configured');
  }
  
  const results = [];
  
  for (const symbol of symbols.slice(0, 10)) { // Limit for rate limits
    try {
      const response = await axios.get('https://finnhub.io/api/v1/quote', {
        params: {
          symbol: symbol,
          token: API_KEYS.FINNHUB
        },
        headers: getApiHeaders('finnhub'),
        timeout: 8000
      });
      
      const data = response.data;
      
      if (data.c && data.c > 0) { // Current price exists and is valid
        results.push({
          symbol: symbol,
          name: getCompanyName(symbol),
          price: Math.round(data.c * 100) / 100,
          change: Math.round((data.d || 0) * 100) / 100,
          changePercent: Math.round((data.dp || 0) * 100) / 100,
          volume: 0, // Finnhub quote doesn't include volume
          high: Math.round((data.h || data.c) * 100) / 100,
          low: Math.round((data.l || data.c) * 100) / 100,
          open: Math.round((data.o || data.pc) * 100) / 100,
          previousClose: Math.round((data.pc || data.c) * 100) / 100,
          source: 'Finnhub'
        });
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.warn(`Finnhub failed for ${symbol}:`, error.message);
    }
  }
  
  return results;
}

// Alpha Vantage implementation (Secondary)
async function fetchFromAlphaVantage(symbols) {
  if (!API_KEYS.ALPHA_VANTAGE) {
    throw new Error('Alpha Vantage API key not configured');
  }
  
  const results = [];
  
  for (const symbol of symbols.slice(0, 5)) { // Limit to avoid rate limits
    try {
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: `${symbol}.BSE`,
          apikey: API_KEYS.ALPHA_VANTAGE
        },
        headers: getApiHeaders('alphavantage'),
        timeout: 10000
      });
      
      const quote = response.data['Global Quote'];
      
      if (quote && quote['01. symbol']) {
        const price = parseFloat(quote['05. price']) || 0;
        const previousClose = parseFloat(quote['08. previous close']) || 0;
        const change = price - previousClose;
        const changePercent = previousClose ? (change / previousClose) * 100 : 0;
        
        results.push({
          symbol: symbol,
          name: getCompanyName(symbol),
          price: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          volume: parseInt(quote['06. volume']) || 0,
          high: parseFloat(quote['03. high']) || price,
          low: parseFloat(quote['04. low']) || price,
          open: parseFloat(quote['02. open']) || previousClose,
          previousClose: previousClose,
          source: 'Alpha Vantage'
        });
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 12000)); // 12 seconds between calls
      
    } catch (error) {
      console.warn(`Alpha Vantage failed for ${symbol}:`, error.message);
    }
  }
  
  return results;
}

// Polygon implementation (Tertiary)
async function fetchFromPolygon(symbols) {
  if (!API_KEYS.POLYGON) {
    throw new Error('Polygon API key not configured');
  }
  
  const results = [];
  
  for (const symbol of symbols.slice(0, 10)) {
    try {
      const response = await axios.get(`https://api.polygon.io/v2/last/trade/${symbol}`, {
        params: {
          apikey: API_KEYS.POLYGON
        },
        headers: getApiHeaders('polygon'),
        timeout: 8000
      });
      
      const data = response.data;
      
      if (data.status === 'OK' && data.results) {
        const result = data.results;
        results.push({
          symbol: symbol,
          name: getCompanyName(symbol),
          price: Math.round((result.p || 0) * 100) / 100,
          change: 0, // Polygon last trade doesn't include change
          changePercent: 0,
          volume: result.s || 0,
          high: Math.round((result.p || 0) * 100) / 100,
          low: Math.round((result.p || 0) * 100) / 100,
          open: Math.round((result.p || 0) * 100) / 100,
          previousClose: Math.round((result.p || 0) * 100) / 100,
          source: 'Polygon'
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.warn(`Polygon failed for ${symbol}:`, error.message);
    }
  }
  
  return results;
}

// ===== REAL NEWS ENDPOINTS =====

app.get('/api/news', cacheMiddleware(CACHE_DURATIONS.NEWS_DATA), async (req, res) => {
  try {
    const { q, language = 'en', sortBy = 'publishedAt', pageSize = 10 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Query parameter "q" is required'
      });
    }
    
    if (!API_KEYS.NEWS_API) {
      return res.status(503).json({
        error: 'News API not configured',
        message: 'News API key is not available'
      });
    }
    
    console.log(`📰 Fetching news for query: ${q}`);
    
    const response = await axios.get('https://newsapi.org/v2/everything', {
      params: {
        q: q + ' AND (stock OR market OR trading OR finance)',
        language,
        sortBy,
        pageSize: Math.min(parseInt(pageSize), 20),
        apiKey: API_KEYS.NEWS_API,
        domains: 'bloomberg.com,reuters.com,cnbc.com,marketwatch.com,economictimes.indiatimes.com,business-standard.com,moneycontrol.com'
      },
      timeout: 10000
    });
    
    if (response.data.status !== 'ok') {
      throw new Error(response.data.message || 'News API error');
    }
    
    // Filter and enhance articles
    const articles = response.data.articles
      .filter(article => 
        article.title && 
        article.description && 
        !article.title.includes('[Removed]') &&
        article.description.length > 50
      )
      .map(article => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source?.name || 'Unknown',
        publishedAt: article.publishedAt,
        urlToImage: article.urlToImage,
        sentiment: analyzeSentiment(article.title + ' ' + article.description)
      }));
    
    res.json({
      status: 'ok',
      totalResults: articles.length,
      articles: articles,
      query: q,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    handleApiError(error, res, 'News API', { query: req.query.q });
  }
});

// ===== REAL CHART DATA ENDPOINT =====

app.get('/api/chart/:symbol', cacheMiddleware(CACHE_DURATIONS.CHART_DATA), async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '15min', outputsize = 'compact' } = req.query;
    
    console.log(`📊 Fetching chart data for ${symbol}`);
    
    let chartData = null;
    
    // Try Finnhub first for chart data
    if (API_KEYS.FINNHUB) {
      try {
        const endTime = Math.floor(Date.now() / 1000);
        const startTime = endTime - (24 * 60 * 60); // 24 hours ago
        
        const response = await axios.get('https://finnhub.io/api/v1/stock/candle', {
          params: {
            symbol: symbol,
            resolution: '15',
            from: startTime,
            to: endTime,
            token: API_KEYS.FINNHUB
          },
          headers: getApiHeaders('finnhub'),
          timeout: 10000
        });
        
        const data = response.data;
        
        if (data.s === 'ok' && data.t && data.t.length > 0) {
          chartData = data.t.map((timestamp, index) => ({
            timestamp: timestamp * 1000,
            time: new Date(timestamp * 1000).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            }),
            open: data.o[index],
            high: data.h[index],
            low: data.l[index],
            close: data.c[index],
            volume: data.v[index]
          }));
          
          console.log(`✅ Got chart data from Finnhub for ${symbol}`);
        }
      } catch (error) {
        console.warn(`Finnhub chart failed for ${symbol}:`, error.message);
      }
    }
    
    // Try Alpha Vantage as fallback
    if (!chartData && API_KEYS.ALPHA_VANTAGE) {
      try {
        const response = await axios.get('https://www.alphavantage.co/query', {
          params: {
            function: 'TIME_SERIES_INTRADAY',
            symbol: `${symbol}.BSE`,
            interval,
            outputsize,
            apikey: API_KEYS.ALPHA_VANTAGE
          },
          headers: getApiHeaders('alphavantage'),
          timeout: 15000
        });
        
        const timeSeries = response.data[`Time Series (${interval})`];
        
        if (timeSeries) {
          chartData = Object.entries(timeSeries)
            .slice(0, 100)
            .reverse()
            .map(([timestamp, values]) => ({
              timestamp: new Date(timestamp).getTime(),
              time: new Date(timestamp).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
              }),
              open: parseFloat(values['1. open']),
              high: parseFloat(values['2. high']),
              low: parseFloat(values['3. low']),
              close: parseFloat(values['4. close']),
              volume: parseInt(values['5. volume'])
            }));
          
          console.log(`✅ Got chart data from Alpha Vantage for ${symbol}`);
        }
      } catch (error) {
        console.warn(`Alpha Vantage chart failed for ${symbol}:`, error.message);
      }
    }
    
    if (!chartData || chartData.length === 0) {
      return res.status(404).json({
        error: 'No chart data found',
        message: `No chart data available for ${symbol} from any API provider`,
        symbol: symbol
      });
    }
    
    res.json({
      status: 'ok',
      symbol,
      interval,
      data: chartData,
      lastRefreshed: new Date().toISOString(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    handleApiError(error, res, 'Chart API', { symbol: req.params.symbol });
  }
});

// ===== SEARCH ENDPOINT =====

app.get('/api/search/stocks', cacheMiddleware(CACHE_DURATIONS.SEARCH_DATA), async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 1) {
      return res.status(400).json({
        error: 'Invalid query',
        message: 'Query parameter "q" must be at least 1 character'
      });
    }
    
    if (!API_KEYS.ALPHA_VANTAGE) {
      return res.status(503).json({
        error: 'Search API not configured',
        message: 'Alpha Vantage API key required for search'
      });
    }
    
    console.log(`🔍 Searching stocks for: ${q}`);
    
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'SYMBOL_SEARCH',
        keywords: q,
        apikey: API_KEYS.ALPHA_VANTAGE
      },
      headers: getApiHeaders('alphavantage'),
      timeout: 10000
    });
    
    if (response.data['Error Message']) {
      throw new Error(response.data['Error Message']);
    }
    
    const bestMatches = response.data.bestMatches || [];
    
    res.json({
      status: 'ok',
      query: q,
      results: bestMatches.map(match => ({
        symbol: match['1. symbol'],
        name: match['2. name'],
        type: match['3. type'],
        region: match['4. region'],
        marketOpen: match['5. marketOpen'],
        marketClose: match['6. marketClose'],
        timezone: match['7. timezone'],
        currency: match['8. currency'],
        matchScore: match['9. matchScore']
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    handleApiError(error, res, 'Search API', { query: req.query.q });
  }
});

// ===== MARKET STATUS ENDPOINT =====

app.get('/api/market/status', (req, res) => {
  try {
    const now = new Date();
    const indianTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const dayOfWeek = indianTime.getDay();
    const hours = indianTime.getHours();
    const minutes = indianTime.getMinutes();
    const currentTime = hours * 100 + minutes;
    
    let status = 'CLOSED';
    let message = 'Market is closed';
    let nextAction = null;
    
    // Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      status = 'CLOSED';
      message = 'Market is closed (Weekend)';
      nextAction = getNextMarketOpen(indianTime);
    }
    // Market hours: 9:15 AM to 3:30 PM (IST)
    else if (currentTime >= 915 && currentTime <= 1530) {
      status = 'OPEN';
      message = 'Market is open';
      nextAction = getMarketClose(indianTime);
    } else if (currentTime < 915) {
      status = 'PRE_MARKET';
      message = 'Pre-market hours';
      nextAction = getMarketOpen(indianTime);
    } else {
      status = 'CLOSED';
      message = 'Market is closed';
      nextAction = getNextMarketOpen(indianTime);
    }
    
    res.json({
      status,
      message,
      currentTime: indianTime.toISOString(),
      localTime: indianTime.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'full',
        timeStyle: 'medium'
      }),
      marketOpen: '09:15',
      marketClose: '15:30',
      timezone: 'Asia/Kolkata',
      nextAction,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      error: 'Market status error',
      message: error.message
    });
  }
});

// ===== HEALTH CHECK =====

app.get('/api/health', (req, res) => {
  const apiKeysStatus = {};
  Object.entries(API_KEYS).forEach(([key, value]) => {
    apiKeysStatus[key] = value && value !== 'demo' ? 'configured' : 'missing';
  });
  
  res.json({
    status: 'OK',
    message: 'TradePro Backend API is running',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    apiKeys: apiKeysStatus,
    cache: {
      size: cache.size,
      enabled: true
    },
    features: {
      stockData: true,
      newsData: !!API_KEYS.NEWS_API,
      chartData: !!(API_KEYS.ALPHA_VANTAGE || API_KEYS.FINNHUB),
      search: !!API_KEYS.ALPHA_VANTAGE,
      marketStatus: true
    }
  });
});

// ===== UTILITY FUNCTIONS =====

function getCompanyName(symbol) {
  const companies = {
    'RELIANCE': 'Reliance Industries Ltd',
    'TCS': 'Tata Consultancy Services',
    'INFY': 'Infosys Limited',
    'HDFCBANK': 'HDFC Bank Limited',
    'ICICIBANK': 'ICICI Bank Limited',
    'HINDUNILVR': 'Hindustan Unilever Ltd',
    'BAJFINANCE': 'Bajaj Finance Limited',
    'KOTAKBANK': 'Kotak Mahindra Bank',
    'LT': 'Larsen & Toubro Ltd',
    'ASIANPAINT': 'Asian Paints Limited',
    'MARUTI': 'Maruti Suzuki India Ltd',
    'SBIN': 'State Bank of India',
    'NESTLEIND': 'Nestle India Limited',
    'WIPRO': 'Wipro Limited',
    'HCLTECH': 'HCL Technologies Ltd',
    'AXISBANK': 'Axis Bank Limited',
    'TITAN': 'Titan Company Limited',
    'SUNPHARMA': 'Sun Pharmaceutical Industries',
    'TECHM': 'Tech Mahindra Limited',
    'ULTRACEMCO': 'UltraTech Cement Limited'
  };
  return companies[symbol] || symbol;
}

function analyzeSentiment(text) {
  const positiveWords = ['gain', 'rise', 'growth', 'strong', 'buy', 'positive', 'bullish', 'up', 'surge', 'boost'];
  const negativeWords = ['fall', 'drop', 'loss', 'weak', 'sell', 'negative', 'bearish', 'down', 'crash', 'decline'];
  
  const textLower = text.toLowerCase();
  const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;
  const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function getMarketOpen(currentTime) {
  const marketOpen = new Date(currentTime);
  marketOpen.setHours(9, 15, 0, 0);
  return marketOpen.toISOString();
}

function getMarketClose(currentTime) {
  const marketClose = new Date(currentTime);
  marketClose.setHours(15, 30, 0, 0);
  return marketClose.toISOString();
}

function getNextMarketOpen(currentTime) {
  const nextOpen = new Date(currentTime);
  nextOpen.setHours(9, 15, 0, 0);
  
  // Move to next weekday if needed
  if (currentTime.getDay() === 6) { // Saturday
    nextOpen.setDate(nextOpen.getDate() + 2);
  } else if (currentTime.getDay() === 0) { // Sunday
    nextOpen.setDate(nextOpen.getDate() + 1);
  } else if (currentTime.getHours() > 15 || 
             (currentTime.getHours() === 15 && currentTime.getMinutes() > 30)) {
    nextOpen.setDate(nextOpen.getDate() + 1);
    
    // Skip weekend
    if (nextOpen.getDay() === 6) {
      nextOpen.setDate(nextOpen.getDate() + 2);
    } else if (nextOpen.getDay() === 0) {
      nextOpen.setDate(nextOpen.getDate() + 1);
    }
  }
  
  return nextOpen.toISOString();
}

// ===== ERROR HANDLING =====

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.path} does not exist`,
    availableEndpoints: [
      'GET /api/health',
      'POST /api/stocks/batch',
      'GET /api/news',
      'GET /api/search/stocks',
      'GET /api/chart/:symbol',
      'GET /api/market/status'
    ]
  });
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// ===== GRACEFUL SHUTDOWN =====

const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  cache.clear();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ===== START SERVER =====

const server = app.listen(PORT, () => {
  console.log(`🚀 TradePro Backend Server v2.1.0 running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
  console.log(`💾 Cache enabled with ${Object.keys(CACHE_DURATIONS).length} strategies`);
  
  // Validate and report API key status
  const allKeysValid = validateApiKeys();
  console.log(`🔑 API Keys: ${allKeysValid ? 'All configured' : 'Some missing'}`);
  
  console.log('\n📋 Available Endpoints:');
  console.log('  ✅ GET  /api/health - Health check');
  console.log('  ✅ POST /api/stocks/batch - Batch stock data');
  console.log('  ✅ GET  /api/news - Financial news');
  console.log('  ✅ GET  /api/search/stocks - Stock search');
  console.log('  ✅ GET  /api/chart/:symbol - Chart data');
  console.log('  ✅ GET  /api/market/status - Market status');
  
  if (!allKeysValid) {
    console.log('\n⚠️  Some API keys are missing. Check your .env file:');
    Object.entries(API_KEYS).forEach(([key, value]) => {
      const status = value && value !== 'demo' ? '✅' : '❌';
      console.log(`  ${status} ${key}`);
    });
  }
  
  console.log('\n🔥 Server ready to handle real API requests!');
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please use a different port.`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
  }
});

module.exports = app;