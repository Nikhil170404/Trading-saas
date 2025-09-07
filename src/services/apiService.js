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
 * Enhanced Real Data API Service - No Mock Data
 * Fetches live data from multiple financial APIs with intelligent fallbacks
 */
class EnhancedRealAPIService {
  constructor() {
    this.cache = new Map();
    this.isOnline = navigator.onLine;
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    this.retryCount = new Map();
    this.rateLimiters = new Map();
    
    // WebSocket for real-time data
    this.websocket = null;
    this.wsCallbacks = new Map();
    this.wsReconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    this.setupNetworkMonitoring();
    this.loadCacheFromStorage();
    this.initializeRateLimiters();
    this.checkBackendHealth();
    this.setupWebSocket();
    
    console.log('🚀 Enhanced Real Data API Service initialized');
    console.log('📡 Features: Real APIs only, intelligent fallbacks, enhanced error handling');
    console.log('🛡️ Error handling: Graceful degradation, comprehensive retry logic');
    console.log('⚡ Performance: Optimized caching, rate limiting, WebSocket connectivity');
    console.log('✅ Ready to fetch live financial data from real APIs');
  }

  /**
   * Initialize rate limiters for different APIs
   */
  initializeRateLimiters() {
    // Backend API: 100 calls per minute
    this.rateLimiters.set('backend', createRateLimiter(100, 60000));
    
    // Finnhub WebSocket: Connection management
    this.rateLimiters.set('websocket', createRateLimiter(1, 1000));
  }

  /**
   * Setup WebSocket connection for real-time data
   */
  setupWebSocket() {
    if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('📡 Max WebSocket reconnection attempts reached');
      return;
    }

    try {
      this.websocket = new WebSocket('wss://ws.finnhub.io?token=d1n8t71r01qovv8hp8mgd1n8t71r01qovv8hp8n0');
      
      this.websocket.onopen = () => {
        console.log('📡 WebSocket connected for real-time data');
        this.wsReconnectAttempts = 0;
        
        // Subscribe to popular stocks
        const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
        symbols.forEach(symbol => {
          this.websocket.send(JSON.stringify({
            type: 'subscribe',
            symbol: symbol
          }));
        });
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'trade') {
            this.handleRealTimeUpdate(data);
          }
        } catch (error) {
          console.warn('WebSocket message parse error:', error);
        }
      };

      this.websocket.onclose = (event) => {
        console.log(`📡 WebSocket disconnected (code: ${event.code})`);
        this.wsReconnectAttempts++;
        
        if (this.wsReconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.wsReconnectAttempts), 30000);
          setTimeout(() => this.setupWebSocket(), delay);
        }
      };

      this.websocket.onerror = (error) => {
        console.warn('WebSocket error:', error);
      };
    } catch (error) {
      console.warn('WebSocket setup failed:', error);
      this.wsReconnectAttempts++;
    }
  }

  /**
   * Handle real-time price updates
   */
  handleRealTimeUpdate(data) {
    if (this.wsCallbacks.has(data.s)) {
      this.wsCallbacks.get(data.s)(data);
    }
    
    // Update cache with real-time data
    const cacheKey = `realtime_${data.s}`;
    this.setCachedData(cacheKey, {
      symbol: data.s,
      price: data.p,
      timestamp: data.t,
      volume: data.v
    }, 10000); // 10 second cache for real-time data
  }

  /**
   * Subscribe to real-time updates for a symbol
   */
  subscribeToRealTime(symbol, callback) {
    this.wsCallbacks.set(symbol, callback);
    
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'subscribe',
        symbol: symbol
      }));
    }
  }

  /**
   * Check backend health and API connectivity
   */
  async checkBackendHealth() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.baseURL}/health`, { 
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Backend server connected:', data.message);
        return true;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('⚠️ Backend health check timeout');
      } else {
        console.warn('⚠️ Backend server not available:', error.message);
      }
    }
    return false;
  }

  /**
   * Setup network monitoring
   */
  setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📡 Back online - resuming API calls');
      this.setupWebSocket(); // Reconnect WebSocket
      this.checkBackendHealth();
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
   * Load cache from localStorage
   */
  loadCacheFromStorage() {
    try {
      const savedCache = storage.get('realApiCache', {});
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
   * Save cache to localStorage
   */
  saveCacheToStorage() {
    try {
      const cacheObject = {};
      this.cache.forEach((value, key) => {
        cacheObject[key] = value;
      });
      storage.set('realApiCache', cacheObject);
    } catch (error) {
      console.warn('Cache saving failed:', error);
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
    this.cache.delete(key);
    return null;
  }

  setCachedData(key, data, duration = CACHE_DURATIONS.STOCK_DATA) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      duration
    });
    
    // Periodically save to storage
    if (Math.random() < 0.1) {
      this.saveCacheToStorage();
    }
  }

  /**
   * Make rate-limited API request with enhanced error handling
   */
  async makeRateLimitedRequest(apiType, requestFn, retries = 3) {
    const rateLimiter = this.rateLimiters.get(apiType);
    if (rateLimiter) {
      await rateLimiter();
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        
        // Exponential backoff for retries
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Enhanced fetch stock data with comprehensive error handling
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
      
      const stockData = await this.makeRateLimitedRequest('backend', async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        const response = await fetch(`${this.baseURL}/stocks/batch`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ 
            symbols, 
            source: 'auto' // Let backend choose best API
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Backend API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.data || data.data.length === 0) {
          throw new Error('No stock data received from backend');
        }
        
        return data.data;
      });

      // Process and enhance the data
      const processedData = await this.processStockData(stockData);
      
      // Cache the results
      this.setCachedData(cacheKey, processedData, CACHE_DURATIONS.STOCK_DATA);
      
      console.log(`✅ Successfully fetched data for ${processedData.length} stocks`);
      return processedData;

    } catch (error) {
      errorHandler.log(error, 'fetching real stock data');
      
      // If network error or API down, check if we have any cached data
      const fallbackCache = storage.get('lastKnownStockData', null);
      if (fallbackCache && Date.now() - fallbackCache.timestamp < 24 * 60 * 60 * 1000) { // 24 hours
        console.warn('Using fallback cached data due to API failure');
        return fallbackCache.data;
      }
      
      throw new Error(`Failed to fetch stock data: ${error.message}`);
    }
  }

  /**
   * Process and enhance stock data
   */
  async processStockData(stockData) {
    const enhancedData = stockData.map(stock => ({
      ...stock,
      // Add technical indicators
      recommendation: stock.recommendation || this.generateRecommendation(stock),
      marketCap: this.calculateMarketCap(stock.symbol, stock.price),
      pe: this.estimatePERatio(stock.symbol),
      dividend: this.estimateDividendYield(stock.symbol),
      
      // Format volume
      volume: this.formatVolume(stock.volume),
      
      // Ensure all numbers are properly formatted
      price: Math.round(stock.price * 100) / 100,
      change: Math.round(stock.change * 100) / 100,
      changePercent: Math.round(stock.changePercent * 100) / 100,
      high: Math.round(stock.high * 100) / 100,
      low: Math.round(stock.low * 100) / 100,
      open: Math.round(stock.open * 100) / 100,
      previousClose: Math.round(stock.previousClose * 100) / 100
    }));

    // Store as fallback cache
    storage.set('lastKnownStockData', {
      data: enhancedData,
      timestamp: Date.now()
    });

    return enhancedData;
  }

  /**
   * Get real news data with enhanced error handling
   */
  async getNewsData(symbol, companyName) {
    const cacheKey = `news_${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    if (!this.isOnline) {
      throw new Error('No internet connection for news');
    }

    try {
      console.log(`📰 Fetching real news for ${symbol}...`);
      
      const newsData = await this.makeRateLimitedRequest('backend', async () => {
        const query = `${symbol} OR "${companyName}"`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(
          `${this.baseURL}/news?q=${encodeURIComponent(query)}&pageSize=10`,
          { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `News API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'ok') {
          throw new Error(data.message || 'News API error');
        }
        
        return this.processNewsData(data.articles);
      });
      
      if (!newsData || newsData.length === 0) {
        console.warn(`No news found for ${symbol}`);
        return [];
      }
      
      this.setCachedData(cacheKey, newsData, CACHE_DURATIONS.NEWS_DATA);
      console.log(`✅ Fetched ${newsData.length} news articles for ${symbol}`);
      
      return newsData;
      
    } catch (error) {
      errorHandler.log(error, `fetching news for ${symbol}`);
      
      // Return empty array instead of throwing for news failures
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
   * Get real chart data with enhanced error handling
   */
  async getChartData(symbol, interval = '15min', range = '1d') {
    const cacheKey = `chart_${symbol}_${interval}_${range}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    if (!this.isOnline) {
      throw new Error('No internet connection for chart data');
    }

    try {
      console.log(`📊 Fetching real chart data for ${symbol}...`);
      
      const chartData = await this.makeRateLimitedRequest('backend', async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(
          `${this.baseURL}/chart/${symbol}?interval=${interval}`,
          { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Chart API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'ok' || !data.data || data.data.length === 0) {
          throw new Error(data.message || 'No chart data available');
        }
        
        return data.data;
      });
      
      this.setCachedData(cacheKey, chartData, CACHE_DURATIONS.CHART_DATA);
      console.log(`✅ Fetched ${chartData.length} chart data points for ${symbol}`);
      
      return chartData;
      
    } catch (error) {
      errorHandler.log(error, `fetching chart data for ${symbol}`);
      
      // For chart data, we can throw the error since it's more critical for UX
      throw new Error(`Failed to fetch chart data: ${error.message}`);
    }
  }

  /**
   * Search stocks with enhanced error handling
   */
  async searchStocks(query) {
    if (!query || query.length < 1) return [];
    
    const sanitizedQuery = sanitizeInput(query).toUpperCase();
    
    try {
      // First check if it's a known symbol
      const allSymbols = [...STOCK_SYMBOLS.INDIAN, ...STOCK_SYMBOLS.US];
      const exactMatches = allSymbols.filter(symbol => 
        symbol === sanitizedQuery || 
        this.getCompanyName(symbol).toUpperCase().includes(sanitizedQuery)
      );
      
      if (exactMatches.length > 0) {
        return await this.getStockData(exactMatches.slice(0, 10));
      }
      
      // Try backend search
      const searchResults = await this.makeRateLimitedRequest('backend', async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(
          `${this.baseURL}/search/stocks?q=${encodeURIComponent(sanitizedQuery)}`,
          { signal: controller.signal }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Search API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== 'ok') {
          throw new Error(data.message || 'Search API error');
        }
        
        return data.results;
      });
      
      if (searchResults && searchResults.length > 0) {
        const symbols = searchResults.map(r => r.symbol).slice(0, 5);
        return await this.getStockData(symbols);
      }
      
      return [];
      
    } catch (error) {
      errorHandler.log(error, 'searching stocks');
      console.warn('Stock search failed:', error.message);
      return [];
    }
  }

  /**
   * Get current market status
   */
  async getMarketStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.baseURL}/market/status`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Market status API failed:', error.message);
    }
    
    // Fallback to client-side calculation
    return this.calculateMarketStatusFallback();
  }

  /**
   * Fallback market status calculation
   */
  calculateMarketStatusFallback() {
    const now = new Date();
    const indianTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const dayOfWeek = indianTime.getDay();
    const hours = indianTime.getHours();
    const minutes = indianTime.getMinutes();
    const currentTime = hours * 100 + minutes;
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { status: 'CLOSED', message: 'Market closed (Weekend)' };
    } else if (currentTime >= 915 && currentTime <= 1530) {
      return { status: 'OPEN', message: 'Market is open' };
    } else if (currentTime < 915) {
      return { status: 'PRE_MARKET', message: 'Pre-market hours' };
    } else {
      return { status: 'CLOSED', message: 'Market closed' };
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Generate recommendation based on technical analysis
   */
  generateRecommendation(stock) {
    let score = 0;
    
    // Price momentum
    if (stock.changePercent > 3) score += 2;
    else if (stock.changePercent > 1) score += 1;
    else if (stock.changePercent < -3) score -= 2;
    else if (stock.changePercent < -1) score -= 1;
    
    // Market context (simplified)
    const marketSentiment = 0.1;
    score += marketSentiment;
    
    if (score >= 2) return 'STRONG_BUY';
    if (score >= 0.5) return 'BUY';
    if (score <= -2) return 'STRONG_SELL';
    if (score <= -0.5) return 'SELL';
    return 'HOLD';
  }

  /**
   * Calculate approximate market cap
   */
  calculateMarketCap(symbol, price) {
    const shareMultipliers = {
      'RELIANCE': 6.765, 'TCS': 3.668, 'INFY': 4.261, 'HDFCBANK': 7.642,
      'ICICIBANK': 7.024, 'HINDUNILVR': 2.349, 'BAJFINANCE': 0.617,
      'KOTAKBANK': 3.719, 'LT': 1.407, 'ASIANPAINT': 0.959,
      'AAPL': 15.6, 'MSFT': 7.4, 'GOOGL': 12.8, 'AMZN': 10.3, 'TSLA': 3.2
    };
    
    const multiplier = shareMultipliers[symbol] || 1;
    const marketCap = price * multiplier;
    
    if (marketCap >= 1000) return `₹${(marketCap / 1000).toFixed(1)}T`;
    return `₹${marketCap.toFixed(0)}B`;
  }

  /**
   * Estimate P/E ratio
   */
  estimatePERatio(symbol) {
    const basePE = {
      'RELIANCE': 28, 'TCS': 31, 'INFY': 29, 'HDFCBANK': 18,
      'ICICIBANK': 16, 'HINDUNILVR': 65, 'BAJFINANCE': 35,
      'AAPL': 29, 'MSFT': 35, 'GOOGL': 25, 'AMZN': 60, 'TSLA': 65
    };
    
    return basePE[symbol] || 25;
  }

  /**
   * Estimate dividend yield
   */
  estimateDividendYield(symbol) {
    const baseDividend = {
      'RELIANCE': 0.35, 'TCS': 3.2, 'INFY': 2.8, 'HDFCBANK': 1.2,
      'ICICIBANK': 0.8, 'HINDUNILVR': 1.5, 'BAJFINANCE': 0.1,
      'AAPL': 0.5, 'MSFT': 0.7, 'GOOGL': 0, 'AMZN': 0, 'TSLA': 0
    };
    
    return baseDividend[symbol] || 1.0;
  }

  /**
   * Get company name
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
   * Format volume
   */
  formatVolume(volume) {
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
   * Health check
   */
  async checkHealth() {
    const backendHealth = await this.checkBackendHealth();
    
    return {
      status: 'OK',
      message: 'Enhanced real data API service operational',
      timestamp: new Date().toISOString(),
      backend: backendHealth,
      websocket: this.websocket?.readyState === WebSocket.OPEN,
      cache: this.cache.size,
      online: this.isOnline,
      wsReconnectAttempts: this.wsReconnectAttempts
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Clean old cache entries
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > value.duration) {
        this.cache.delete(key);
      }
    }
    
    // Save cache to storage
    this.saveCacheToStorage();
    
    // Close WebSocket
    if (this.websocket) {
      this.websocket.close();
    }
    
    console.log('🧹 Enhanced API service cleaned up');
  }
}

// Create and export singleton
const enhancedRealApiService = new EnhancedRealAPIService();

// Cleanup every 5 minutes
setInterval(() => enhancedRealApiService.cleanup(), 300000);

// Cleanup on page unload
window.addEventListener('beforeunload', () => enhancedRealApiService.cleanup());

export default enhancedRealApiService;