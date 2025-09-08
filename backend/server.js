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
  NEWS_API: process.env.NEWS_API_KEY,
  UPSTOX_ACCESS_TOKEN: process.env.UPSTOX_ACCESS_TOKEN,
  UPSTOX_API_KEY: process.env.UPSTOX_API_KEY,
  UPSTOX_API_SECRET: process.env.UPSTOX_API_SECRET
};

// Upstox configuration
const UPSTOX_CONFIG = {
  baseURL: 'https://api.upstox.com/v2',
  instrumentsURL: 'https://assets.upstox.com/market-quote/instruments/exchange/complete.json'
};

// Yahoo Finance URLs
const YAHOO_FINANCE_URLS = {
  chart: 'https://query1.finance.yahoo.com/v8/finance/chart',
  quote: 'https://query2.finance.yahoo.com/v1/finance/quoteBasic',
  search: 'https://query1.finance.yahoo.com/v1/finance/search'
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

// Enhanced API configuration with proper headers
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
    case 'upstox':
      return {
        ...baseHeaders,
        'Authorization': `Bearer ${API_KEYS.UPSTOX_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
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
        message = 'API access forbidden - check API permissions or rate limits';
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
    
    return res.status(status >= 500 ? 503 : status).json({
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
  CHART_DATA: 5 * 60 * 1000,     // 5 minutes
  INSTRUMENTS: 24 * 60 * 60 * 1000 // 24 hours
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

// ===== UPSTOX API IMPLEMENTATIONS =====

// Load Upstox instruments cache
let upstoxInstruments = new Map();

async function loadUpstoxInstruments() {
  try {
    const response = await axios.get(UPSTOX_CONFIG.instrumentsURL, {
      headers: getApiHeaders('yahoo'),
      timeout: 30000
    });

    if (response.data) {
      upstoxInstruments.clear();
      response.data.forEach(instrument => {
        if (instrument.segment === 'NSE_EQ' || instrument.segment === 'BSE_EQ') {
          upstoxInstruments.set(instrument.tradingsymbol, {
            instrument_key: instrument.instrument_key,
            name: instrument.name,
            exchange: instrument.exchange,
            segment: instrument.segment
          });
        }
      });
      console.log(`✅ Loaded ${upstoxInstruments.size} Upstox instruments`);
    }
  } catch (error) {
    console.warn('Failed to load Upstox instruments:', error.message);
  }
}

// Load instruments on startup
loadUpstoxInstruments();

// Upstox API request helper
async function makeUpstoxRequest(endpoint, options = {}) {
  if (!API_KEYS.UPSTOX_ACCESS_TOKEN) {
    throw new Error('Upstox access token not configured');
  }

  const url = `${UPSTOX_CONFIG.baseURL}${endpoint}`;
  const config = {
    ...options,
    headers: getApiHeaders('upstox'),
    timeout: 10000
  };

  const response = await axios(url, config);
  return response.data;
}

// Get stock data from Upstox
async function fetchFromUpstox(symbols) {
  if (!API_KEYS.UPSTOX_ACCESS_TOKEN) {
    throw new Error('Upstox access token not configured');
  }

  const results = [];
  
  for (const symbol of symbols.slice(0, 10)) {
    try {
      const instrumentData = upstoxInstruments.get(symbol);
      if (!instrumentData) continue;

      const response = await makeUpstoxRequest(
        `/market-quote/quotes?instrument_key=${instrumentData.instrument_key}`
      );

      if (response.status === 'success' && response.data) {
        const data = Object.values(response.data)[0];
        
        results.push({
          symbol: symbol,
          name: instrumentData.name,
          price: Math.round((data.last_price || 0) * 100) / 100,
          change: Math.round((data.last_price - data.previous_close || 0) * 100) / 100,
          changePercent: Math.round((data.previous_close ? 
            ((data.last_price - data.previous_close) / data.previous_close) * 100 : 0) * 100) / 100,
          volume: data.volume || 0,
          high: Math.round((data.ohlc?.high || data.last_price || 0) * 100) / 100,
          low: Math.round((data.ohlc?.low || data.last_price || 0) * 100) / 100,
          open: Math.round((data.ohlc?.open || data.previous_close || 0) * 100) / 100,
          previousClose: Math.round((data.previous_close || data.last_price || 0) * 100) / 100,
          source: 'Upstox'
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.warn(`Upstox failed for ${symbol}:`, error.message);
    }
  }
  
  return results;
}

// ===== YAHOO FINANCE IMPLEMENTATIONS =====

// Convert Indian symbols to Yahoo format
function convertToYahooSymbol(symbol) {
  const yahooSymbolMap = {
    'RELIANCE': 'RELIANCE.NS',
    'TCS': 'TCS.NS',
    'INFY': 'INFY.NS',
    'HDFCBANK': 'HDFCBANK.NS',
    'ICICIBANK': 'ICICIBANK.NS',
    'HINDUNILVR': 'HINDUNILVR.NS',
    'BAJFINANCE': 'BAJFINANCE.NS',
    'KOTAKBANK': 'KOTAKBANK.NS',
    'LT': 'LT.NS',
    'ASIANPAINT': 'ASIANPAINT.NS',
    'MARUTI': 'MARUTI.NS',
    'SBIN': 'SBIN.NS',
    'NESTLEIND': 'NESTLEIND.NS',
    'WIPRO': 'WIPRO.NS',
    'HCLTECH': 'HCLTECH.NS',
    'AXISBANK': 'AXISBANK.NS',
    'TITAN': 'TITAN.NS',
    'SUNPHARMA': 'SUNPHARMA.NS',
    'TECHM': 'TECHM.NS',
    'ULTRACEMCO': 'ULTRACEMCO.NS'
  };

  return yahooSymbolMap[symbol] || `${symbol}.NS`;
}

// Fetch stock data from Yahoo Finance
async function fetchFromYahoo(symbols) {
  const results = [];
  
  for (const symbol of symbols.slice(0, 10)) {
    try {
      const yahooSymbol = convertToYahooSymbol(symbol);
      
      const response = await axios.get(
        `${YAHOO_FINANCE_URLS.quote}?symbols=${yahooSymbol}`,
        {
          headers: getApiHeaders('yahoo'),
          timeout: 8000
        }
      );

      const quoteData = response.data?.quoteResponse?.result?.[0];
      
      if (quoteData && quoteData.regularMarketPrice) {
        results.push({
          symbol: symbol,
          name: quoteData.displayName || quoteData.shortName || getCompanyName(symbol),
          price: Math.round((quoteData.regularMarketPrice || 0) * 100) / 100,
          change: Math.round((quoteData.regularMarketChange || 0) * 100) / 100,
          changePercent: Math.round((quoteData.regularMarketChangePercent || 0) * 100) / 100,
          high: Math.round((quoteData.regularMarketDayHigh || quoteData.regularMarketPrice || 0) * 100) / 100,
          low: Math.round((quoteData.regularMarketDayLow || quoteData.regularMarketPrice || 0) * 100) / 100,
          open: Math.round((quoteData.regularMarketOpen || quoteData.regularMarketPreviousClose || 0) * 100) / 100,
          previousClose: Math.round((quoteData.regularMarketPreviousClose || quoteData.regularMarketPrice || 0) * 100) / 100,
          volume: quoteData.regularMarketVolume || 0,
          source: 'Yahoo Finance'
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.warn(`Yahoo Finance failed for ${symbol}:`, error.message);
    }
  }
  
  return results;
}

// ===== STOCK DATA ENDPOINT =====

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
    
    // Try different sources in order of preference
    const sources = source === 'auto' ? ['upstox', 'yahoo'] : [source];
    
    for (const currentSource of sources) {
      if (successfulRequests >= symbols.length) break;
      
      const remainingSymbols = symbols.filter(symbol => 
        !results.some(result => result.symbol === symbol)
      );
      
      if (remainingSymbols.length === 0) break;
      
      try {
        let sourceResults = [];
        
        switch (currentSource) {
          case 'upstox':
            sourceResults = await fetchFromUpstox(remainingSymbols);
            break;
          case 'yahoo':
            sourceResults = await fetchFromYahoo(remainingSymbols);
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
      recommendation: generateRecommendation(stock),
      volume: formatVolume(stock.volume)
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

// ===== CHART DATA ENDPOINT =====

app.get('/api/chart/:symbol', cacheMiddleware(CACHE_DURATIONS.CHART_DATA), async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = '15m', range = '1d' } = req.query;
    
    console.log(`📊 Fetching chart data for ${symbol}`);
    
    let chartData = null;
    
    // Try Yahoo Finance for chart data
    try {
      const yahooSymbol = convertToYahooSymbol(symbol);
      
      // Calculate period timestamps
      const endTime = Math.floor(Date.now() / 1000);
      const periodMap = {
        '1d': 24 * 60 * 60,
        '5d': 5 * 24 * 60 * 60,
        '1mo': 30 * 24 * 60 * 60,
        '3mo': 90 * 24 * 60 * 60,
        '6mo': 180 * 24 * 60 * 60,
        '1y': 365 * 24 * 60 * 60
      };
      const startTime = endTime - (periodMap[range] || periodMap['1d']);

      const response = await axios.get(
        `${YAHOO_FINANCE_URLS.chart}/${yahooSymbol}?period1=${startTime}&period2=${endTime}&interval=${interval}`,
        {
          headers: getApiHeaders('yahoo'),
          timeout: 15000
        }
      );

      const result = response.data?.chart?.result?.[0];
      
      if (result && result.timestamp && result.indicators?.quote?.[0]) {
        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];
        
        chartData = timestamps.map((timestamp, index) => ({
          timestamp: timestamp * 1000,
          time: new Date(timestamp * 1000).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          open: quotes.open[index] || 0,
          high: quotes.high[index] || 0,
          low: quotes.low[index] || 0,
          close: quotes.close[index] || 0,
          volume: quotes.volume[index] || 0
        })).filter(item => item.close > 0);
        
        console.log(`✅ Got chart data from Yahoo Finance for ${symbol}`);
      }
    } catch (error) {
      console.warn(`Yahoo Finance chart failed for ${symbol}:`, error.message);
    }
    
    // Try Upstox historical data as fallback
    if (!chartData && API_KEYS.UPSTOX_ACCESS_TOKEN) {
      try {
        const instrumentData = upstoxInstruments.get(symbol);
        if (instrumentData) {
          const toDate = new Date().toISOString().split('T')[0];
          const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const response = await makeUpstoxRequest(
            `/historical-candle/${instrumentData.instrument_key}/${interval}/${toDate}/${fromDate}`
          );

          if (response.status === 'success' && response.data?.candles) {
            chartData = response.data.candles.map(candle => ({
              timestamp: new Date(candle[0]).getTime(),
              time: new Date(candle[0]).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
              }),
              open: candle[1],
              high: candle[2],
              low: candle[3],
              close: candle[4],
              volume: candle[5]
            }));
            
            console.log(`✅ Got chart data from Upstox for ${symbol}`);
          }
        }
      } catch (error) {
        console.warn(`Upstox chart failed for ${symbol}:`, error.message);
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
      range,
      data: chartData,
      lastRefreshed: new Date().toISOString(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    handleApiError(error, res, 'Chart API', { symbol: req.params.symbol });
  }
});

// ===== NEWS ENDPOINT =====

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
    
    console.log(`🔍 Searching stocks for: ${q}`);
    
    // Search in Upstox instruments
    const searchQuery = q.toUpperCase();
    const results = [];
    
    for (const [symbol, data] of upstoxInstruments.entries()) {
      if (symbol.includes(searchQuery) || data.name.toUpperCase().includes(searchQuery)) {
        results.push({
          symbol: symbol,
          name: data.name,
          exchange: data.exchange,
          segment: data.segment,
          instrument_key: data.instrument_key
        });
        
        if (results.length >= 10) break;
      }
    }
    
    res.json({
      status: 'ok',
      query: q,
      results: results,
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

// ===== UPSTOX INSTRUMENTS ENDPOINT =====

app.get('/api/instruments', cacheMiddleware(CACHE_DURATIONS.INSTRUMENTS), async (req, res) => {
  try {
    const instruments = Array.from(upstoxInstruments.entries()).map(([symbol, data]) => ({
      symbol,
      ...data
    }));
    
    res.json({
      status: 'ok',
      count: instruments.length,
      instruments: instruments,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleApiError(error, res, 'Instruments API');
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
    message: 'TradePro Backend API with Upstox & Yahoo Finance',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
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
      chartData: true,
      search: true,
      marketStatus: true,
      upstoxIntegration: !!API_KEYS.UPSTOX_ACCESS_TOKEN,
      yahooFinance: true
    },
    instruments: {
      upstox: upstoxInstruments.size
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

function generateRecommendation(stock) {
  let score = 0;
  
  // Price momentum
  if (stock.changePercent > 3) score += 2;
  else if (stock.changePercent > 1) score += 1;
  else if (stock.changePercent < -3) score -= 2;
  else if (stock.changePercent < -1) score -= 1;
  
  // Volume analysis
  const volumeNum = parseInt(stock.volume?.toString().replace(/[MBK]/g, '') || 0);
  if (volumeNum > 1000000 && stock.changePercent > 0) score += 1;
  else if (volumeNum > 1000000 && stock.changePercent < 0) score -= 1;
  
  if (score >= 2) return 'STRONG_BUY';
  if (score >= 1) return 'BUY';
  if (score <= -2) return 'STRONG_SELL';
  if (score <= -1) return 'SELL';
  return 'HOLD';
}

function formatVolume(volume) {
  if (!volume || volume === 0) return '0';
  
  const num = parseInt(volume) || 0;
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  
  return num.toString();
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
      'GET /api/market/status',
      'GET /api/instruments'
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
  console.log(`🚀 TradePro Backend Server v3.0.0 with Upstox & Yahoo Finance running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 API Base URL: http://localhost:${PORT}/api`);
  console.log(`💾 Cache enabled with ${Object.keys(CACHE_DURATIONS).length} strategies`);
  
  // Validate and report API key status
  const allKeysValid = validateApiKeys();
  console.log(`🔑 API Keys: ${allKeysValid ? 'All configured' : 'Some missing'}`);
  
  console.log('\n📋 Available Endpoints:');
  console.log('  ✅ GET  /api/health - Health check');
  console.log('  ✅ POST /api/stocks/batch - Batch stock data (Upstox + Yahoo)');
  console.log('  ✅ GET  /api/news - Financial news');
  console.log('  ✅ GET  /api/search/stocks - Stock search (Upstox instruments)');
  console.log('  ✅ GET  /api/chart/:symbol - Chart data (Yahoo + Upstox)');
  console.log('  ✅ GET  /api/market/status - Market status');
  console.log('  ✅ GET  /api/instruments - Upstox instruments list');
  
  if (!allKeysValid) {
    console.log('\n⚠️  Some API keys are missing. Check your .env file:');
    Object.entries(API_KEYS).forEach(([key, value]) => {
      const status = value && value !== 'demo' ? '✅' : '❌';
      console.log(`  ${status} ${key}`);
    });
    console.log('\n📖 Setup instructions:');
    console.log('  1. Get Upstox API access: https://upstox.com/developer/apps');
    console.log('  2. Get News API key: https://newsapi.org/');
    console.log('  3. Add to .env file in backend folder');
  }
  
  console.log('\n🔥 Server ready with enhanced APIs and real-time capabilities!');
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