import axios from 'axios';
import {
  API_ENDPOINTS,
  CACHE_DURATIONS,
  RATE_LIMITS,
  STOCK_SYMBOLS,
  createRateLimiter,
  formatTimeAgo,
  sanitizeInput,
  errorHandler,
  storage
} from '../utils/helpers';

/**
 * Comprehensive API Service for Trading App
 * Handles multiple free APIs with fallbacks and rate limiting
 */
class APIService {
  constructor() {
    this.cache = new Map();
    this.rateLimiters = new Map();
    this.apiKeys = {
      alphaVantage: process.env.REACT_APP_ALPHA_VANTAGE_KEY || 'demo',
      newsAPI: process.env.REACT_APP_NEWS_API_KEY || '',
      polygonIO: process.env.REACT_APP_POLYGON_KEY || '',
      finnhub: process.env.REACT_APP_FINNHUB_KEY || ''
    };
    
    this.setupRateLimiters();
    this.setupAxiosInterceptors();
    this.loadCacheFromStorage();
  }

  /**
   * Setup rate limiters for different APIs
   */
  setupRateLimiters() {
    Object.entries(RATE_LIMITS).forEach(([api, config]) => {
      this.rateLimiters.set(api.toLowerCase(), createRateLimiter(config.calls, config.window));
    });
  }

  /**
   * Setup axios interceptors for request/response handling
   */
  setupAxiosInterceptors() {
    // Request interceptor
    axios.interceptors.request.use(
      (config) => {
        config.timeout = 10000; // 10 second timeout
        config.headers['User-Agent'] = 'TradingApp/1.0';
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.code === 'ECONNABORTED') {
          error.message = 'Request timeout - please try again';
        } else if (!error.response) {
          error.message = 'Network error - please check your connection';
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Load cache from localStorage on initialization
   */
  loadCacheFromStorage() {
    try {
      const savedCache = storage.get('apiCache', {});
      Object.entries(savedCache).forEach(([key, value]) => {
        if (value.timestamp && Date.now() - value.timestamp < value.duration) {
          this.cache.set(key, value);
        }
      });
    } catch (error) {
      errorHandler.log(error, 'loading cache from storage');
    }
  }

  /**
   * Save cache to localStorage
   */
  saveCacheToStorage() {
    try {
      const cacheObject = {};
      this.cache.forEach((value, key) => {
        cacheObject[key] = value;
      });
      storage.set('apiCache', cacheObject);
    } catch (error) {
      errorHandler.log(error, 'saving cache to storage');
    }
  }

  /**
   * Generic cache management
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.duration) {
      return cached.data;
    }
    return null;
  }

  setCachedData(key, data, duration = CACHE_DURATIONS.STOCK_DATA) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      duration
    });
    
    // Periodically save cache to storage
    if (Math.random() < 0.1) { // 10% chance
      this.saveCacheToStorage();
    }
  }

  /**
   * Main method to get stock data with multiple fallbacks
   */
  async getStockData(symbols = STOCK_SYMBOLS.INDIAN.slice(0, 10)) {
    const cacheKey = `stocks_${symbols.join('_')}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      let stockData;

      // Try Alpha Vantage first (best for accuracy)
      if (this.apiKeys.alphaVantage && this.apiKeys.alphaVantage !== 'demo') {
        try {
          stockData = await this.getAlphaVantageData(symbols);
          if (stockData && stockData.length > 0) {
            this.setCachedData(cacheKey, stockData);
            return stockData;
          }
        } catch (error) {
          errorHandler.log(error, 'Alpha Vantage API');
        }
      }

      // Fallback to Yahoo Finance
      try {
        stockData = await this.getYahooFinanceData(symbols);
        if (stockData && stockData.length > 0) {
          this.setCachedData(cacheKey, stockData);
          return stockData;
        }
      } catch (error) {
        errorHandler.log(error, 'Yahoo Finance API');
      }

      // Fallback to NSE India for Indian stocks
      if (symbols.some(symbol => STOCK_SYMBOLS.INDIAN.includes(symbol))) {
        try {
          stockData = await this.getNSEData(symbols);
          if (stockData && stockData.length > 0) {
            this.setCachedData(cacheKey, stockData);
            return stockData;
          }
        } catch (error) {
          errorHandler.log(error, 'NSE India API');
        }
      }

      // Final fallback to mock data
      stockData = this.getMockStockData(symbols);
      this.setCachedData(cacheKey, stockData, 60000); // Cache mock data for 1 minute
      return stockData;

    } catch (error) {
      errorHandler.log(error, 'getting stock data');
      return this.getMockStockData(symbols);
    }
  }

  /**
   * Alpha Vantage API implementation
   */
  async getAlphaVantageData(symbols) {
    await this.rateLimiters.get('alpha_vantage')();
    
    const stockPromises = symbols.slice(0, 5).map(async (symbol) => {
      try {
        const response = await axios.get(API_ENDPOINTS.ALPHA_VANTAGE, {
          params: {
            function: 'GLOBAL_QUOTE',
            symbol: this.formatSymbolForAPI(symbol, 'alpha_vantage'),
            apikey: this.apiKeys.alphaVantage
          }
        });

        const quote = response.data['Global Quote'];
        if (!quote || Object.keys(quote).length === 0) {
          throw new Error('No data received');
        }

        return this.formatAlphaVantageResponse(quote);
      } catch (error) {
        errorHandler.log(error, `Alpha Vantage - ${symbol}`);
        return null;
      }
    });

    const results = await Promise.allSettled(stockPromises);
    return results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);
  }

  /**
   * Yahoo Finance API implementation
   */
  async getYahooFinanceData(symbols) {
    await this.rateLimiters.get('yahoo_finance')();
    
    const stockPromises = symbols.map(async (symbol) => {
      try {
        const formattedSymbol = this.formatSymbolForAPI(symbol, 'yahoo');
        const response = await axios.get(`${API_ENDPOINTS.YAHOO_FINANCE}/${formattedSymbol}`, {
          params: {
            interval: '1d',
            range: '1d'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        const result = response.data.chart?.result?.[0];
        if (!result) throw new Error('No data received');

        return this.formatYahooFinanceResponse(result, symbol);
      } catch (error) {
        errorHandler.log(error, `Yahoo Finance - ${symbol}`);
        return null;
      }
    });

    const results = await Promise.allSettled(stockPromises);
    return results
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);
  }

  /**
   * NSE India API implementation
   */
  async getNSEData(symbols) {
    try {
      // NSE API requires specific headers and is often rate-limited
      const response = await axios.get(`${API_ENDPOINTS.NSE_INDIA}/equity-stockIndices?index=NIFTY%2050`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.data && response.data.data) {
        return response.data.data
          .filter(stock => symbols.includes(stock.symbol))
          .map(stock => this.formatNSEResponse(stock));
      }
    } catch (error) {
      errorHandler.log(error, 'NSE India API');
    }
    
    return [];
  }

  /**
   * Get news data with multiple sources
   */
  async getNewsData(symbol, companyName) {
    const cacheKey = `news_${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      let newsData = [];

      // Try NewsAPI first
      if (this.apiKeys.newsAPI) {
        try {
          await this.rateLimiters.get('news_api')();
          newsData = await this.getNewsAPIData(symbol, companyName);
          if (newsData.length > 0) {
            this.setCachedData(cacheKey, newsData, CACHE_DURATIONS.NEWS_DATA);
            return newsData;
          }
        } catch (error) {
          errorHandler.log(error, 'NewsAPI');
        }
      }

      // Fallback to DuckDuckGo
      try {
        await this.rateLimiters.get('duckduckgo')();
        newsData = await this.getDuckDuckGoNews(symbol, companyName);
        if (newsData.length > 0) {
          this.setCachedData(cacheKey, newsData, CACHE_DURATIONS.NEWS_DATA);
          return newsData;
        }
      } catch (error) {
        errorHandler.log(error, 'DuckDuckGo News');
      }

      // Final fallback to mock news
      newsData = this.getMockNewsData(symbol, companyName);
      this.setCachedData(cacheKey, newsData, 300000); // 5 minutes for mock data
      return newsData;

    } catch (error) {
      errorHandler.log(error, 'getting news data');
      return this.getMockNewsData(symbol, companyName);
    }
  }

  /**
   * NewsAPI implementation
   */
  async getNewsAPIData(symbol, companyName) {
    const query = `${symbol} OR "${companyName}" stock market financial`;
    
    const response = await axios.get(API_ENDPOINTS.NEWS_API, {
      params: {
        q: sanitizeInput(query),
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 10,
        apiKey: this.apiKeys.newsAPI
      }
    });

    if (response.data.articles) {
      return response.data.articles.map(article => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source.name,
        publishedAt: article.publishedAt,
        time: formatTimeAgo(article.publishedAt),
        sentiment: this.analyzeSentiment(article.title + ' ' + (article.description || ''))
      }));
    }

    return [];
  }

  /**
   * DuckDuckGo search implementation for news
   */
  async getDuckDuckGoNews(symbol, companyName) {
    const queries = [
      `${symbol} stock news today`,
      `${companyName} financial news recent`,
      `${symbol} earnings market analysis`
    ];

    const newsResults = [];

    for (const query of queries.slice(0, 2)) {
      try {
        const response = await axios.get(API_ENDPOINTS.DUCKDUCKGO, {
          params: {
            q: sanitizeInput(query),
            format: 'json',
            no_html: '1',
            skip_disambig: '1'
          }
        });

        if (response.data.Results) {
          response.data.Results.slice(0, 3).forEach(result => {
            newsResults.push({
              title: result.Text,
              description: result.Text,
              url: result.FirstURL,
              source: this.extractDomain(result.FirstURL),
              time: 'Recent',
              sentiment: this.analyzeSentiment(result.Text)
            });
          });
        }
      } catch (error) {
        errorHandler.log(error, `DuckDuckGo search for ${query}`);
      }
    }

    return newsResults;
  }

  /**
   * Get chart data for a specific symbol
   */
  async getChartData(symbol, interval = '1d', range = '1mo') {
    const cacheKey = `chart_${symbol}_${interval}_${range}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      // Try Alpha Vantage for intraday data
      if (this.apiKeys.alphaVantage && this.apiKeys.alphaVantage !== 'demo') {
        try {
          await this.rateLimiters.get('alpha_vantage')();
          const chartData = await this.getAlphaVantageChartData(symbol, interval);
          if (chartData && chartData.length > 0) {
            this.setCachedData(cacheKey, chartData, CACHE_DURATIONS.CHART_DATA);
            return chartData;
          }
        } catch (error) {
          errorHandler.log(error, 'Alpha Vantage chart data');
        }
      }

      // Fallback to Yahoo Finance
      try {
        await this.rateLimiters.get('yahoo_finance')();
        const chartData = await this.getYahooChartData(symbol, interval, range);
        if (chartData && chartData.length > 0) {
          this.setCachedData(cacheKey, chartData, CACHE_DURATIONS.CHART_DATA);
          return chartData;
        }
      } catch (error) {
        errorHandler.log(error, 'Yahoo Finance chart data');
      }

      // Generate realistic mock chart data
      const chartData = this.generateMockChartData(symbol);
      this.setCachedData(cacheKey, chartData, 300000); // 5 minutes for mock data
      return chartData;

    } catch (error) {
      errorHandler.log(error, 'getting chart data');
      return this.generateMockChartData(symbol);
    }
  }

  /**
   * Alpha Vantage chart data
   */
  async getAlphaVantageChartData(symbol, interval) {
    const intervalMap = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '60min'
    };

    const alphaInterval = intervalMap[interval] || '15min';
    const formattedSymbol = this.formatSymbolForAPI(symbol, 'alpha_vantage');

    const response = await axios.get(API_ENDPOINTS.ALPHA_VANTAGE, {
      params: {
        function: 'TIME_SERIES_INTRADAY',
        symbol: formattedSymbol,
        interval: alphaInterval,
        apikey: this.apiKeys.alphaVantage,
        outputsize: 'compact'
      }
    });

    const timeSeries = response.data[`Time Series (${alphaInterval})`];
    if (!timeSeries) return [];

    return Object.entries(timeSeries)
      .slice(0, 50)
      .reverse()
      .map(([timestamp, values]) => ({
        time: new Date(timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        timestamp: new Date(timestamp).getTime(),
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume'])
      }));
  }

  /**
   * Yahoo Finance chart data
   */
  async getYahooChartData(symbol, interval, range) {
    const formattedSymbol = this.formatSymbolForAPI(symbol, 'yahoo');
    
    const response = await axios.get(`${API_ENDPOINTS.YAHOO_FINANCE}/${formattedSymbol}`, {
      params: { interval, range },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const result = response.data.chart?.result?.[0];
    if (!result || !result.timestamp) return [];

    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    if (!quote) return [];

    return timestamps.map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      timestamp: timestamp * 1000,
      open: quote.open?.[index] || 0,
      high: quote.high?.[index] || 0,
      low: quote.low?.[index] || 0,
      close: quote.close?.[index] || 0,
      volume: quote.volume?.[index] || 0
    })).filter(item => item.close > 0);
  }

  // ===== FORMATTING METHODS =====

  /**
   * Format symbol for different APIs
   */
  formatSymbolForAPI(symbol, apiType) {
    switch (apiType) {
      case 'yahoo':
        return STOCK_SYMBOLS.INDIAN.includes(symbol) ? `${symbol}.NS` : symbol;
      case 'alpha_vantage':
        return STOCK_SYMBOLS.INDIAN.includes(symbol) ? `${symbol}.BSE` : symbol;
      default:
        return symbol;
    }
  }

  /**
   * Format Alpha Vantage response
   */
  formatAlphaVantageResponse(quote) {
    const symbol = quote['01. symbol'].replace('.BSE', '').replace('.NS', '');
    const price = parseFloat(quote['05. price']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    return {
      symbol,
      name: this.getCompanyName(symbol),
      price,
      change,
      changePercent,
      volume: this.formatVolume(quote['06. volume']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      open: parseFloat(quote['02. open']),
      previousClose: parseFloat(quote['08. previous close']),
      recommendation: this.generateBasicRecommendation(changePercent),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Format Yahoo Finance response
   */
  formatYahooFinanceResponse(result, originalSymbol) {
    const meta = result.meta;
    const price = meta.regularMarketPrice || meta.previousClose || 0;
    const previousClose = meta.previousClose || price;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
      symbol: originalSymbol,
      name: this.getCompanyName(originalSymbol),
      price,
      change,
      changePercent,
      volume: this.formatVolume(meta.regularMarketVolume || 0),
      high: meta.regularMarketDayHigh || price,
      low: meta.regularMarketDayLow || price,
      open: meta.regularMarketOpen || price,
      previousClose,
      recommendation: this.generateBasicRecommendation(changePercent),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Format NSE response
   */
  formatNSEResponse(stock) {
    return {
      symbol: stock.symbol,
      name: stock.meta?.companyName || this.getCompanyName(stock.symbol),
      price: stock.lastPrice,
      change: stock.change,
      changePercent: stock.pChange,
      volume: this.formatVolume(stock.totalTradedVolume),
      high: stock.dayHigh,
      low: stock.dayLow,
      open: stock.open,
      previousClose: stock.previousClose,
      recommendation: this.generateBasicRecommendation(stock.pChange),
      lastUpdated: new Date().toISOString()
    };
  }

  // ===== UTILITY METHODS =====

  /**
   * Get company name for symbol
   */
  getCompanyName(symbol) {
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

  /**
   * Format volume numbers
   */
  formatVolume(volume) {
    const num = parseInt(volume) || 0;
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  }

  /**
   * Generate basic recommendation based on price change
   */
  generateBasicRecommendation(changePercent) {
    if (changePercent > 3) return 'STRONG_BUY';
    if (changePercent > 1) return 'BUY';
    if (changePercent < -3) return 'STRONG_SELL';
    if (changePercent < -1) return 'SELL';
    return 'HOLD';
  }

  /**
   * Analyze sentiment of text
   */
  analyzeSentiment(text) {
    const positiveWords = [
      'gain', 'rise', 'up', 'profit', 'growth', 'strong', 'bull', 'buy', 
      'positive', 'surge', 'rally', 'bullish', 'outperform', 'upgrade'
    ];
    const negativeWords = [
      'fall', 'drop', 'down', 'loss', 'decline', 'weak', 'bear', 'sell', 
      'negative', 'crash', 'plunge', 'bearish', 'underperform', 'downgrade'
    ];
    
    const textLower = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch {
      return 'Unknown Source';
    }
  }

  // ===== MOCK DATA GENERATORS =====

  /**
   * Generate mock stock data
   */
  getMockStockData(symbols = STOCK_SYMBOLS.INDIAN.slice(0, 10)) {
    return symbols.map(symbol => {
      const basePrice = 1000 + Math.random() * 3000;
      const change = (Math.random() - 0.5) * 200;
      const changePercent = (change / basePrice) * 100;
      
      return {
        symbol,
        name: this.getCompanyName(symbol),
        price: Math.round(basePrice * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        volume: this.formatVolume(Math.floor(Math.random() * 5000000) + 500000),
        high: Math.round((basePrice + Math.abs(change) + Math.random() * 50) * 100) / 100,
        low: Math.round((basePrice - Math.abs(change) - Math.random() * 50) * 100) / 100,
        open: Math.round((basePrice + (Math.random() - 0.5) * 20) * 100) / 100,
        previousClose: Math.round((basePrice - change) * 100) / 100,
        recommendation: this.generateBasicRecommendation(changePercent),
        lastUpdated: new Date().toISOString()
      };
    });
  }

  /**
   * Generate mock news data
   */
  getMockNewsData(symbol, companyName) {
    const newsTemplates = [
      `${companyName} reports strong quarterly earnings, beats estimates`,
      `Analysts upgrade ${symbol} stock rating on robust business outlook`,
      `${companyName} announces strategic expansion into new markets`,
      `${symbol} shows resilient performance amid market volatility`,
      `${companyName} management provides positive guidance for upcoming quarter`,
      `Technical analysis suggests ${symbol} stock may continue upward trend`,
      `${companyName} declares dividend, shareholders approve board decisions`,
      `Market experts bullish on ${symbol} long-term growth prospects`
    ];

    const sources = [
      'Economic Times', 'Business Standard', 'Mint', 'Bloomberg Quint', 
      'Moneycontrol', 'Financial Express', 'The Hindu BusinessLine', 'Reuters India'
    ];

    return newsTemplates.slice(0, 5).map((template, index) => ({
      title: template,
      description: `Latest developments and analysis for ${companyName} (${symbol}) in the financial markets.`,
      url: `#news-${symbol}-${index}`,
      source: sources[index % sources.length],
      time: `${index + 1} hour${index === 0 ? '' : 's'} ago`,
      sentiment: ['positive', 'positive', 'positive', 'neutral', 'positive'][index],
      publishedAt: new Date(Date.now() - (index + 1) * 3600000).toISOString()
    }));
  }

  /**
   * Generate realistic mock chart data
   */
  generateMockChartData(symbol) {
    const data = [];
    const basePrice = 1000 + Math.random() * 2000;
    let currentPrice = basePrice;
    const now = new Date();

    for (let i = 30; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 15 * 60000); // 15-minute intervals
      const volatility = 0.02; // 2% volatility
      const change = (Math.random() - 0.5) * 2 * volatility * currentPrice;
      
      currentPrice = Math.max(currentPrice + change, currentPrice * 0.95);
      
      const open = currentPrice;
      const close = currentPrice + (Math.random() - 0.5) * volatility * currentPrice;
      const high = Math.max(open, close) + Math.random() * volatility * currentPrice * 0.5;
      const low = Math.min(open, close) - Math.random() * volatility * currentPrice * 0.5;
      
      data.push({
        time: timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: timestamp.getTime(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.floor(Math.random() * 100000) + 10000
      });
      
      currentPrice = close;
    }

    return data;
  }

  /**
   * Search stocks by query
   */
  async searchStocks(query) {
    if (!query || query.length < 1) return [];
    
    const sanitizedQuery = sanitizeInput(query).toUpperCase();
    
    // First check if it's a direct symbol match
    const allSymbols = [...STOCK_SYMBOLS.INDIAN, ...STOCK_SYMBOLS.US];
    const directMatch = allSymbols.find(symbol => symbol === sanitizedQuery);
    
    if (directMatch) {
      return await this.getStockData([directMatch]);
    }
    
    // Search by partial symbol or company name
    const matchingSymbols = allSymbols.filter(symbol => 
      symbol.includes(sanitizedQuery) || 
      this.getCompanyName(symbol).toUpperCase().includes(sanitizedQuery)
    ).slice(0, 10);
    
    if (matchingSymbols.length > 0) {
      return await this.getStockData(matchingSymbols);
    }
    
    return [];
  }

  /**
   * Cleanup method to clear old cache entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > value.duration) {
        this.cache.delete(key);
      }
    }
    this.saveCacheToStorage();
  }
}

// Create and export singleton instance
const apiService = new APIService();

// Cleanup cache every 10 minutes
setInterval(() => {
  apiService.cleanup();
}, 600000);

export default apiService;