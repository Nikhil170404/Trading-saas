import {
  CACHE_DURATIONS,
  STOCK_SYMBOLS,
  formatTimeAgo,
  sanitizeInput,
  errorHandler,
  storage,
  createRateLimiter
} from '../utils/helpers';

/**
 * Enhanced API Service with Upstox API and Yahoo Finance
 * Provides real-time data, historical charts, and comprehensive market data
 */
class EnhancedApiService {
  constructor() {
    this.cache = new Map();
    this.isOnline = navigator.onLine;
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    this.retryCount = new Map();
    this.rateLimiters = new Map();
    
    // Upstox API configuration
    this.upstoxConfig = {
      baseURL: 'https://api.upstox.com/v2',
      accessToken: process.env.REACT_APP_UPSTOX_ACCESS_TOKEN,
      apiKey: process.env.REACT_APP_UPSTOX_API_KEY,
      apiSecret: process.env.REACT_APP_UPSTOX_API_SECRET,
      websocketURL: null
    };
    
    // Yahoo Finance URLs
    this.yahooFinanceUrls = {
      chart: 'https://query1.finance.yahoo.com/v8/finance/chart',
      quote: 'https://query2.finance.yahoo.com/v1/finance/quoteBasic',
      search: 'https://query1.finance.yahoo.com/v1/finance/search'
    };
    
    // WebSocket for real-time data
    this.websocket = null;
    this.wsCallbacks = new Map();
    this.wsReconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    // Upstox instruments cache
    this.instrumentsCache = new Map();
    
    this.setupNetworkMonitoring();
    this.loadCacheFromStorage();
    this.initializeRateLimiters();
    this.initializeUpstox();
    
    console.log('🚀 Enhanced API Service with Upstox & Yahoo Finance initialized');
    console.log('📡 Features: Upstox real-time data, Yahoo Finance charts, WebSocket connectivity');
    console.log('🛡️ Error handling: Intelligent fallbacks, comprehensive retry logic');
    console.log('⚡ Performance: Optimized caching, rate limiting, multi-source data');
    console.log('✅ Ready to fetch live financial data from multiple sources');
  }

  /**
   * Initialize rate limiters for different APIs
   */
  initializeRateLimiters() {
    this.rateLimiters.set('upstox', createRateLimiter(100, 60000)); // 100 per minute
    this.rateLimiters.set('yahoo', createRateLimiter(200, 60000)); // 200 per minute
    this.rateLimiters.set('backend', createRateLimiter(100, 60000)); // 100 per minute
  }

  /**
   * Initialize Upstox API
   */
  async initializeUpstox() {
    try {
      if (!this.upstoxConfig.accessToken && this.upstoxConfig.apiKey) {
        console.log('📋 Upstox API key found. Access token needed for live data.');
        console.log('🔗 Visit: https://upstox.com/developer/apps to create an app');
        console.log('📝 Add access token to .env: REACT_APP_UPSTOX_ACCESS_TOKEN=your_token');
      }
      
      // Load instruments list
      await this.loadUpstoxInstruments();
      
      // Setup WebSocket if access token is available
      if (this.upstoxConfig.accessToken) {
        await this.setupUpstoxWebSocket();
      }
      
    } catch (error) {
      console.warn('Upstox initialization failed:', error.message);
    }
  }

  /**
   * Load Upstox instruments list
   */
  async loadUpstoxInstruments() {
    const cacheKey = 'upstox_instruments';
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      this.instrumentsCache = new Map(cached);
      console.log(`📦 Loaded ${this.instrumentsCache.size} Upstox instruments from cache`);
      return;
    }

    try {
      // Get instruments from Upstox public URL
      const response = await fetch('https://assets.upstox.com/market-quote/instruments/exchange/complete.json', {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.ok) {
        const instruments = await response.json();
        
        // Process and cache instruments
        instruments.forEach(instrument => {
          if (instrument.segment === 'NSE_EQ' || instrument.segment === 'BSE_EQ') {
            this.instrumentsCache.set(instrument.tradingsymbol, {
              instrument_key: instrument.instrument_key,
              name: instrument.name,
              exchange: instrument.exchange,
              segment: instrument.segment,
              lot_size: instrument.lot_size || 1
            });
          }
        });

        this.setCachedData(cacheKey, Array.from(this.instrumentsCache.entries()), 24 * 60 * 60 * 1000); // 24 hours
        console.log(`✅ Loaded ${this.instrumentsCache.size} Upstox instruments`);
      }
    } catch (error) {
      console.warn('Failed to load Upstox instruments:', error.message);
    }
  }

  /**
   * Setup Upstox WebSocket connection
   */
  async setupUpstoxWebSocket() {
    if (!this.upstoxConfig.accessToken) return;

    try {
      // Get WebSocket URL
      const wsUrlResponse = await this.makeUpstoxRequest('/feed/market-data-feed/authorize', {
        method: 'GET'
      });

      if (wsUrlResponse && wsUrlResponse.data && wsUrlResponse.data.authorizedRedirectUri) {
        this.upstoxConfig.websocketURL = wsUrlResponse.data.authorizedRedirectUri;
        this.connectUpstoxWebSocket();
      }
    } catch (error) {
      console.warn('Failed to setup Upstox WebSocket:', error.message);
    }
  }

  /**
   * Connect to Upstox WebSocket
   */
  connectUpstoxWebSocket() {
    if (!this.upstoxConfig.websocketURL) return;

    try {
      this.websocket = new WebSocket(this.upstoxConfig.websocketURL);
      
      this.websocket.onopen = () => {
        console.log('📡 Upstox WebSocket connected');
        this.wsReconnectAttempts = 0;
      };

      this.websocket.onmessage = (event) => {
        this.handleUpstoxWebSocketMessage(event);
      };

      this.websocket.onclose = () => {
        console.log('📡 Upstox WebSocket disconnected');
        if (this.wsReconnectAttempts < this.maxReconnectAttempts) {
          this.wsReconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
          setTimeout(() => this.connectUpstoxWebSocket(), delay);
        }
      };

      this.websocket.onerror = (error) => {
        console.warn('Upstox WebSocket error:', error);
      };

    } catch (error) {
      console.warn('Upstox WebSocket connection failed:', error.message);
    }
  }

  /**
   * Handle Upstox WebSocket messages
   */
  handleUpstoxWebSocketMessage(event) {
    try {
      const data = JSON.parse(event.data);
      
      if (data.feeds) {
        Object.entries(data.feeds).forEach(([instrumentKey, feedData]) => {
          if (feedData.ltpc) {
            // Update real-time price cache
            const symbol = this.getSymbolFromInstrumentKey(instrumentKey);
            if (symbol) {
              this.setCachedData(`realtime_${symbol}`, {
                symbol,
                price: feedData.ltpc.ltp,
                change: feedData.ltpc.ltp - feedData.ltpc.cp,
                changePercent: ((feedData.ltpc.ltp - feedData.ltpc.cp) / feedData.ltpc.cp) * 100,
                volume: feedData.ltpc.ltq,
                timestamp: Date.now()
              }, 5000); // 5 second cache

              // Trigger callbacks
              if (this.wsCallbacks.has(symbol)) {
                this.wsCallbacks.get(symbol)(feedData);
              }
            }
          }
        });
      }
    } catch (error) {
      console.warn('Failed to parse Upstox WebSocket message:', error);
    }
  }

  /**
   * Get symbol from Upstox instrument key
   */
  getSymbolFromInstrumentKey(instrumentKey) {
    for (const [symbol, data] of this.instrumentsCache.entries()) {
      if (data.instrument_key === instrumentKey) {
        return symbol;
      }
    }
    return null;
  }

  /**
   * Make authenticated request to Upstox API
   */
  async makeUpstoxRequest(endpoint, options = {}) {
    if (!this.upstoxConfig.accessToken) {
      throw new Error('Upstox access token not configured');
    }

    const url = `${this.upstoxConfig.baseURL}${endpoint}`;
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.upstoxConfig.accessToken}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`Upstox API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Enhanced stock data fetching with multiple sources
   */
  async getStockData(symbols = STOCK_SYMBOLS.INDIAN.slice(0, 10)) {
    const cacheKey = `stocks_${symbols.join('_')}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      console.log('📦 Using cached stock data');
      return cached;
    }

    if (!this.isOnline) {
      throw new Error('No internet connection available');
    }

    try {
      console.log(`📈 Fetching real stock data for ${symbols.length} symbols...`);
      
      const results = [];
      const errors = [];

      // Try multiple sources in parallel
      const promises = symbols.map(async (symbol) => {
        const stockData = await this.getStockDataForSymbol(symbol);
        if (stockData) {
          results.push(stockData);
        } else {
          errors.push(`Failed to fetch data for ${symbol}`);
        }
      });

      await Promise.allSettled(promises);

      if (results.length === 0) {
        throw new Error('No stock data retrieved from any source');
      }

      // Cache results
      this.setCachedData(cacheKey, results, CACHE_DURATIONS.STOCK_DATA);
      
      console.log(`✅ Successfully fetched data for ${results.length} stocks`);
      return results;

    } catch (error) {
      errorHandler.log(error, 'fetching enhanced stock data');
      throw new Error(`Failed to fetch stock data: ${error.message}`);
    }
  }

  /**
   * Get stock data for individual symbol from multiple sources
   */
  async getStockDataForSymbol(symbol) {
    const sources = ['upstox', 'yahoo', 'backend'];
    
    for (const source of sources) {
      try {
        let stockData = null;
        
        switch (source) {
          case 'upstox':
            stockData = await this.getUpstoxStockData(symbol);
            break;
          case 'yahoo':
            stockData = await this.getYahooStockData(symbol);
            break;
          case 'backend':
            stockData = await this.getBackendStockData(symbol);
            break;
        }
        
        if (stockData) {
          stockData.source = source;
          return this.enhanceStockData(stockData);
        }
      } catch (error) {
        console.warn(`${source} failed for ${symbol}:`, error.message);
      }
    }
    
    return null;
  }

  /**
   * Get stock data from Upstox API
   */
  async getUpstoxStockData(symbol) {
    if (!this.upstoxConfig.accessToken) return null;

    const instrumentData = this.instrumentsCache.get(symbol);
    if (!instrumentData) return null;

    try {
      await this.rateLimiters.get('upstox')();

      // Get quote data
      const response = await this.makeUpstoxRequest(
        `/market-quote/quotes?instrument_key=${instrumentData.instrument_key}`
      );

      if (response.status === 'success' && response.data) {
        const data = Object.values(response.data)[0];
        
        return {
          symbol,
          name: instrumentData.name,
          price: data.last_price || 0,
          change: data.last_price - data.previous_close || 0,
          changePercent: data.previous_close ? 
            ((data.last_price - data.previous_close) / data.previous_close) * 100 : 0,
          high: data.ohlc?.high || data.last_price,
          low: data.ohlc?.low || data.last_price,
          open: data.ohlc?.open || data.previous_close,
          previousClose: data.previous_close || data.last_price,
          volume: data.volume || 0,
          instrumentKey: instrumentData.instrument_key
        };
      }
    } catch (error) {
      console.warn(`Upstox API failed for ${symbol}:`, error.message);
    }

    return null;
  }

  /**
   * Get stock data from Yahoo Finance
   */
  async getYahooStockData(symbol) {
    try {
      await this.rateLimiters.get('yahoo')();

      // Convert Indian symbols to Yahoo format
      const yahooSymbol = this.convertToYahooSymbol(symbol);
      
      const response = await fetch(
        `${this.yahooFinanceUrls.quote}?symbols=${yahooSymbol}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const quoteData = data.quoteResponse?.result?.[0];
        
        if (quoteData) {
          return {
            symbol,
            name: quoteData.displayName || quoteData.shortName || symbol,
            price: quoteData.regularMarketPrice || 0,
            change: quoteData.regularMarketChange || 0,
            changePercent: quoteData.regularMarketChangePercent || 0,
            high: quoteData.regularMarketDayHigh || quoteData.regularMarketPrice,
            low: quoteData.regularMarketDayLow || quoteData.regularMarketPrice,
            open: quoteData.regularMarketOpen || quoteData.regularMarketPreviousClose,
            previousClose: quoteData.regularMarketPreviousClose || quoteData.regularMarketPrice,
            volume: quoteData.regularMarketVolume || 0
          };
        }
      }
    } catch (error) {
      console.warn(`Yahoo Finance failed for ${symbol}:`, error.message);
    }

    return null;
  }

  /**
   * Get stock data from backend
   */
  async getBackendStockData(symbol) {
    try {
      await this.rateLimiters.get('backend')();

      const response = await fetch(`${this.baseURL}/stocks/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [symbol] })
      });

      if (response.ok) {
        const data = await response.json();
        return data.data?.[0] || null;
      }
    } catch (error) {
      console.warn(`Backend API failed for ${symbol}:`, error.message);
    }

    return null;
  }

  /**
   * Convert Indian stock symbol to Yahoo Finance format
   */
  convertToYahooSymbol(symbol) {
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

  /**
   * Enhanced chart data fetching with Yahoo Finance
   */
  async getChartData(symbol, interval = '15m', range = '1d') {
    const cacheKey = `chart_${symbol}_${interval}_${range}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    if (!this.isOnline) {
      throw new Error('No internet connection for chart data');
    }

    try {
      console.log(`📊 Fetching chart data for ${symbol}...`);
      
      // Try Yahoo Finance first
      const chartData = await this.getYahooChartData(symbol, interval, range);
      
      if (chartData && chartData.length > 0) {
        this.setCachedData(cacheKey, chartData, CACHE_DURATIONS.CHART_DATA);
        console.log(`✅ Fetched ${chartData.length} chart data points for ${symbol}`);
        return chartData;
      }

      // Fallback to Upstox historical data
      if (this.upstoxConfig.accessToken) {
        const upstoxChartData = await this.getUpstoxHistoricalData(symbol, interval);
        if (upstoxChartData && upstoxChartData.length > 0) {
          this.setCachedData(cacheKey, upstoxChartData, CACHE_DURATIONS.CHART_DATA);
          return upstoxChartData;
        }
      }

      throw new Error('No chart data available from any source');
      
    } catch (error) {
      errorHandler.log(error, `fetching chart data for ${symbol}`);
      throw new Error(`Failed to fetch chart data: ${error.message}`);
    }
  }

  /**
   * Get chart data from Yahoo Finance
   */
  async getYahooChartData(symbol, interval = '15m', range = '1d') {
    try {
      await this.rateLimiters.get('yahoo')();

      const yahooSymbol = this.convertToYahooSymbol(symbol);
      
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

      const url = `${this.yahooFinanceUrls.chart}/${yahooSymbol}?period1=${startTime}&period2=${endTime}&interval=${interval}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const result = data.chart?.result?.[0];
        
        if (result && result.timestamp && result.indicators?.quote?.[0]) {
          const timestamps = result.timestamp;
          const quotes = result.indicators.quote[0];
          
          return timestamps.map((timestamp, index) => ({
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
        }
      }
    } catch (error) {
      console.warn(`Yahoo chart data failed for ${symbol}:`, error.message);
    }

    return [];
  }

  /**
   * Get historical data from Upstox
   */
  async getUpstoxHistoricalData(symbol, interval = '15min') {
    if (!this.upstoxConfig.accessToken) return [];

    const instrumentData = this.instrumentsCache.get(symbol);
    if (!instrumentData) return [];

    try {
      await this.rateLimiters.get('upstox')();

      const toDate = new Date().toISOString().split('T')[0];
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const response = await this.makeUpstoxRequest(
        `/historical-candle/${instrumentData.instrument_key}/${interval}/${toDate}/${fromDate}`
      );

      if (response.status === 'success' && response.data?.candles) {
        return response.data.candles.map(candle => ({
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
      }
    } catch (error) {
      console.warn(`Upstox historical data failed for ${symbol}:`, error.message);
    }

    return [];
  }

  /**
   * Enhanced news data fetching
   */
  async getNewsData(symbol, companyName) {
    const cacheKey = `news_${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    if (!this.isOnline) {
      return [];
    }

    try {
      console.log(`📰 Fetching news for ${symbol}...`);
      
      // Try backend news API first
      const response = await fetch(
        `${this.baseURL}/news?q=${encodeURIComponent(`${symbol} OR "${companyName}"`)}&pageSize=10`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok' && data.articles) {
          const processedNews = this.processNewsData(data.articles);
          this.setCachedData(cacheKey, processedNews, CACHE_DURATIONS.NEWS_DATA);
          console.log(`✅ Fetched ${processedNews.length} news articles for ${symbol}`);
          return processedNews;
        }
      }
      
      console.warn(`No news found for ${symbol}`);
      return [];
      
    } catch (error) {
      errorHandler.log(error, `fetching news for ${symbol}`);
      console.warn(`News fetch failed for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Process news data
   */
  processNewsData(articles) {
    if (!articles) return [];
    
    return articles
      .filter(article => article.title && article.description)
      .slice(0, 5)
      .map(article => ({
        title: article.title,
        description: article.description,
        url: article.url,
        source: article.source?.name || article.source || 'Unknown',
        time: formatTimeAgo(article.publishedAt),
        publishedAt: article.publishedAt,
        sentiment: this.analyzeSentiment(article.title + ' ' + article.description),
        urlToImage: article.urlToImage
      }));
  }

  /**
   * Enhance stock data with additional calculations
   */
  enhanceStockData(stock) {
    return {
      ...stock,
      // Ensure all numbers are properly formatted
      price: Math.round(stock.price * 100) / 100,
      change: Math.round(stock.change * 100) / 100,
      changePercent: Math.round(stock.changePercent * 100) / 100,
      high: Math.round(stock.high * 100) / 100,
      low: Math.round(stock.low * 100) / 100,
      open: Math.round(stock.open * 100) / 100,
      previousClose: Math.round(stock.previousClose * 100) / 100,
      
      // Add technical indicators
      recommendation: this.generateRecommendation(stock),
      
      // Format volume
      volume: this.formatVolume(stock.volume),
      
      // Add metadata
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Generate trading recommendation
   */
  generateRecommendation(stock) {
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

  /**
   * Format volume numbers
   */
  formatVolume(volume) {
    if (!volume || volume === 0) return '0';
    
    const num = parseInt(volume) || 0;
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    
    return num.toString();
  }

  /**
   * Analyze sentiment (basic implementation)
   */
  analyzeSentiment(text) {
    const positiveWords = ['gain', 'rise', 'growth', 'strong', 'buy', 'positive', 'bullish', 'up', 'surge', 'boost'];
    const negativeWords = ['fall', 'drop', 'loss', 'weak', 'sell', 'negative', 'bearish', 'down', 'crash', 'decline'];
    
    const textLower = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Subscribe to real-time updates
   */
  subscribeToRealTime(symbol, callback) {
    this.wsCallbacks.set(symbol, callback);
    
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN && this.upstoxConfig.accessToken) {
      const instrumentData = this.instrumentsCache.get(symbol);
      if (instrumentData) {
        const subscriptionMessage = {
          guid: Date.now().toString(),
          method: 'sub',
          data: {
            mode: 'ltpc',
            instrumentKeys: [instrumentData.instrument_key]
          }
        };
        
        this.websocket.send(JSON.stringify(subscriptionMessage));
      }
    }
  }

  /**
   * Setup network monitoring
   */
  setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📡 Back online - resuming API calls');
      if (this.upstoxConfig.accessToken) {
        this.setupUpstoxWebSocket();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📡 Offline - using cached data only');
      if (this.websocket) {
        this.websocket.close();
      }
    });
  }

  /**
   * Generic cache management
   */
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.duration) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCachedData(key, data, duration = CACHE_DURATIONS.STOCK_DATA) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      duration
    });
  }

  /**
   * Load cache from localStorage
   */
  loadCacheFromStorage() {
    try {
      const savedCache = storage.get('enhancedApiCache', {});
      let loadedCount = 0;
      
      Object.entries(savedCache).forEach(([key, value]) => {
        if (value.timestamp && Date.now() - value.timestamp < value.duration) {
          this.cache.set(key, value);
          loadedCount++;
        }
      });
      
      console.log(`📦 Loaded ${loadedCount} cached items from storage`);
    } catch (error) {
      console.warn('Cache loading failed:', error);
    }
  }

  /**
   * Health check
   */
  async checkHealth() {
    const upstoxHealth = this.upstoxConfig.accessToken ? 'configured' : 'missing_token';
    const backendHealth = await this.checkBackendHealth();
    
    return {
      status: 'OK',
      message: 'Enhanced API service with Upstox & Yahoo Finance',
      timestamp: new Date().toISOString(),
      upstox: upstoxHealth,
      backend: backendHealth,
      websocket: this.websocket?.readyState === WebSocket.OPEN,
      cache: this.cache.size,
      online: this.isOnline,
      instruments: this.instrumentsCache.size
    };
  }

  /**
   * Check backend health
   */
  async checkBackendHealth() {
    try {
      const response = await fetch(`${this.baseURL}/health`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.websocket) {
      this.websocket.close();
    }
    
    // Save cache to storage
    const cacheObject = {};
    this.cache.forEach((value, key) => {
      cacheObject[key] = value;
    });
    storage.set('enhancedApiCache', cacheObject);
    
    console.log('🧹 Enhanced API service cleaned up');
  }
}

// Create and export singleton
const enhancedApiService = new EnhancedApiService();

export default enhancedApiService;