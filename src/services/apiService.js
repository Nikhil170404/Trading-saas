import {
  CACHE_DURATIONS,
  STOCK_SYMBOLS,
  formatTimeAgo,
  sanitizeInput,
  errorHandler,
  storage
} from '../utils/helpers';

/**
 * Self-Contained API Service - Works without backend
 * Provides realistic mock data with market simulation
 */
class APIService {
  constructor() {
    this.cache = new Map();
    this.isOnline = navigator.onLine;
    this.mockDataEnabled = true;
    this.backendAvailable = false; // Will check this dynamically
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    
    this.setupNetworkMonitoring();
    this.loadCacheFromStorage();
    this.initializeMockData();
    this.checkBackendHealth(); // Check if backend is available
  }

  /**
   * Check if backend is available
   */
  async checkBackendHealth() {
    try {
      const response = await fetch(`${this.baseURL}/health`, { 
        method: 'GET',
        timeout: 2000 
      });
      
      if (response.ok) {
        this.backendAvailable = true;
        console.log('✅ Backend server detected - using live API');
      } else {
        throw new Error('Backend not responding');
      }
    } catch (error) {
      this.backendAvailable = false;
      console.log('📱 Using self-contained mock data (backend not available)');
      console.log('💡 This is normal - the app works perfectly with mock data!');
    }
  }

  /**
   * Setup network monitoring
   */
  setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📡 Back online');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📡 Offline - using cached data');
    });
  }

  /**
   * Load cache from localStorage
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
      storage.set('apiCache', cacheObject);
    } catch (error) {
      console.warn('Cache saving failed:', error);
    }
  }

  /**
   * Initialize realistic mock data
   */
  initializeMockData() {
    // Initialize stock prices with persistence
    const savedPrices = storage.get('mockStockPrices', {});
    this.mockPrices = { ...this.getDefaultMockPrices(), ...savedPrices };
    
    // Update prices periodically
    setInterval(() => {
      this.updateMockPrices();
    }, 30000); // Every 30 seconds

    console.log('📊 Mock data initialized with realistic prices');
  }

  /**
   * Get default mock prices for stocks
   */
  getDefaultMockPrices() {
    return {
      'RELIANCE': { price: 2847.50, basePrice: 2850, volume: 2.5 },
      'TCS': { price: 3324.25, basePrice: 3320, volume: 1.8 },
      'INFY': { price: 1456.75, basePrice: 1460, volume: 3.2 },
      'HDFCBANK': { price: 1734.20, basePrice: 1730, volume: 4.1 },
      'ICICIBANK': { price: 967.85, basePrice: 970, volume: 5.3 },
      'HINDUNILVR': { price: 2687.90, basePrice: 2690, volume: 1.2 },
      'BAJFINANCE': { price: 6789.45, basePrice: 6800, volume: 0.8 },
      'KOTAKBANK': { price: 1876.30, basePrice: 1880, volume: 2.1 },
      'LT': { price: 3456.80, basePrice: 3450, volume: 1.5 },
      'ASIANPAINT': { price: 2934.65, basePrice: 2940, volume: 0.9 },
      'MARUTI': { price: 10234.20, basePrice: 10250, volume: 0.6 },
      'SBIN': { price: 567.45, basePrice: 570, volume: 8.9 },
      'NESTLEIND': { price: 23456.75, basePrice: 23500, volume: 0.3 },
      'WIPRO': { price: 445.60, basePrice: 448, volume: 4.7 },
      'HCLTECH': { price: 1234.85, basePrice: 1230, volume: 2.8 },
      'AXISBANK': { price: 1098.25, basePrice: 1100, volume: 3.4 },
      'TITAN': { price: 3245.90, basePrice: 3250, volume: 1.1 },
      'SUNPHARMA': { price: 1067.35, basePrice: 1070, volume: 2.3 },
      'TECHM': { price: 1456.70, basePrice: 1460, volume: 1.9 },
      'ULTRACEMCO': { price: 8765.25, basePrice: 8800, volume: 0.4 }
    };
  }

  /**
   * Update mock prices to simulate real market movement
   */
  updateMockPrices() {
    const marketStatus = this.getCurrentMarketStatus();
    if (marketStatus.status !== 'OPEN') return; // Only update during market hours

    Object.keys(this.mockPrices).forEach(symbol => {
      const data = this.mockPrices[symbol];
      const volatility = 0.015; // 1.5% max change per update
      const randomChange = (Math.random() - 0.5) * 2 * volatility;
      
      // Add some momentum and sector correlation
      const momentum = this.calculateMomentum(symbol);
      const sectorInfluence = this.getSectorInfluence(symbol);
      
      const totalChange = randomChange + momentum + sectorInfluence;
      
      data.price = Math.max(
        data.basePrice * (1 + totalChange),
        data.basePrice * 0.85 // Don't go below 85% of base
      );
      data.price = Math.min(data.price, data.basePrice * 1.15); // Don't go above 115%
      data.price = Math.round(data.price * 100) / 100;

      // Update volume based on price movement
      data.volume = data.volume * (1 + Math.abs(totalChange) * 2);
    });

    storage.set('mockStockPrices', this.mockPrices);
  }

  /**
   * Calculate momentum for realistic price movement
   */
  calculateMomentum(symbol) {
    const recentMoves = storage.get(`momentum_${symbol}`, []);
    const momentum = recentMoves.reduce((sum, move) => sum + move, 0) / Math.max(recentMoves.length, 1);
    
    // Add current random component
    const newMove = (Math.random() - 0.5) * 0.01;
    recentMoves.push(newMove);
    
    // Keep only last 5 moves
    if (recentMoves.length > 5) recentMoves.shift();
    storage.set(`momentum_${symbol}`, recentMoves);
    
    return momentum * 0.3; // 30% momentum influence
  }

  /**
   * Get sector influence for correlated movement
   */
  getSectorInfluence(symbol) {
    const sectors = {
      'TECH': ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
      'BANKING': ['HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'AXISBANK', 'SBIN'],
      'CONSUMER': ['HINDUNILVR', 'NESTLEIND', 'TITAN', 'ASIANPAINT']
    };

    let sectorMove = 0;
    Object.entries(sectors).forEach(([sector, symbols]) => {
      if (symbols.includes(symbol)) {
        sectorMove = (Math.random() - 0.5) * 0.005; // Small sector influence
      }
    });

    return sectorMove;
  }

  /**
   * Get current market status
   */
  getCurrentMarketStatus() {
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
    
    if (Math.random() < 0.1) {
      this.saveCacheToStorage();
    }
  }

  /**
   * Main method to get stock data
   */
  async getStockData(symbols = STOCK_SYMBOLS.INDIAN.slice(0, 10)) {
    const cacheKey = `stocks_${symbols.join('_')}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      // Try backend first if available
      if (this.backendAvailable && this.isOnline) {
        try {
          const stockData = await this.getStockDataFromBackend(symbols);
          if (stockData && stockData.length > 0) {
            this.setCachedData(cacheKey, stockData);
            return stockData;
          }
        } catch (error) {
          console.warn('Backend API failed, falling back to mock data');
          this.backendAvailable = false;
        }
      }

      // Use mock data (always works)
      await this.simulateNetworkDelay(200);
      const stockData = this.generateRealisticStockData(symbols);
      this.setCachedData(cacheKey, stockData, 60000);
      
      console.log(`📊 Generated stock data for ${symbols.length} symbols`);
      return stockData;

    } catch (error) {
      console.warn('Stock data error:', error);
      return this.generateRealisticStockData(symbols);
    }
  }

  /**
   * Try to get data from backend (if available)
   */
  async getStockDataFromBackend(symbols) {
    const response = await fetch(`${this.baseURL}/stocks/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols, source: 'yahoo' })
    });

    if (!response.ok) throw new Error(`Backend error: ${response.status}`);
    
    const data = await response.json();
    return data.success ? data.data : null;
  }

  /**
   * Generate realistic stock data
   */
  generateRealisticStockData(symbols) {
    return symbols.map(symbol => {
      const mockData = this.mockPrices[symbol] || { 
        price: 1000 + Math.random() * 2000, 
        basePrice: 1000 + Math.random() * 2000,
        volume: 1.0
      };
      
      const currentPrice = mockData.price;
      const previousClose = mockData.basePrice;
      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;
      
      // Calculate day's range
      const volatilityRange = currentPrice * 0.02;
      const high = currentPrice + Math.random() * volatilityRange;
      const low = currentPrice - Math.random() * volatilityRange;
      const open = previousClose + (Math.random() - 0.5) * volatilityRange * 0.5;
      
      // Generate realistic volume
      const baseVolume = mockData.volume * 1000000;
      const volumeMultiplier = 1 + Math.abs(changePercent) / 5;
      const volume = Math.floor(baseVolume * volumeMultiplier);

      return {
        symbol,
        name: this.getCompanyName(symbol),
        price: Math.round(currentPrice * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        volume: this.formatVolume(volume),
        high: Math.round(Math.max(high, currentPrice) * 100) / 100,
        low: Math.round(Math.min(low, currentPrice) * 100) / 100,
        open: Math.round(open * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        recommendation: this.generateSmartRecommendation(changePercent, symbol),
        lastUpdated: new Date().toISOString(),
        marketCap: this.calculateMarketCap(symbol, currentPrice),
        pe: this.generatePERatio(symbol),
        dividend: this.generateDividendYield(symbol)
      };
    });
  }

  /**
   * Generate smart recommendations
   */
  generateSmartRecommendation(changePercent, symbol) {
    let score = 0;
    
    // Price momentum
    if (changePercent > 3) score += 2;
    else if (changePercent > 1) score += 1;
    else if (changePercent < -3) score -= 2;
    else if (changePercent < -1) score -= 1;
    
    // Sector bias
    score += this.getSectorBias(symbol);
    
    // Market sentiment
    score += (Math.random() - 0.5) * 1.5;
    
    if (score >= 2) return 'STRONG_BUY';
    if (score >= 0.5) return 'BUY';
    if (score <= -2) return 'STRONG_SELL';
    if (score <= -0.5) return 'SELL';
    return 'HOLD';
  }

  /**
   * Get sector bias
   */
  getSectorBias(symbol) {
    const sectorTrends = {
      'TCS': 0.4, 'INFY': 0.4, 'WIPRO': 0.2, 'HCLTECH': 0.3, 'TECHM': 0.2,
      'HDFCBANK': 0.1, 'ICICIBANK': 0.1, 'KOTAKBANK': 0.0, 'AXISBANK': 0.0, 'SBIN': -0.1,
      'RELIANCE': -0.1, 'LT': -0.2,
      'HINDUNILVR': 0.3, 'NESTLEIND': 0.4, 'TITAN': 0.3, 'ASIANPAINT': 0.2,
      'BAJFINANCE': 0.1, 'MARUTI': -0.1, 'SUNPHARMA': 0.2, 'ULTRACEMCO': -0.1
    };
    
    return sectorTrends[symbol] || 0;
  }

  /**
   * Calculate market cap
   */
  calculateMarketCap(symbol, price) {
    const shareMultipliers = {
      'RELIANCE': 6.765, 'TCS': 3.668, 'INFY': 4.261, 'HDFCBANK': 7.642,
      'ICICIBANK': 7.024, 'HINDUNILVR': 2.349, 'BAJFINANCE': 0.617,
      'KOTAKBANK': 3.719, 'LT': 1.407, 'ASIANPAINT': 0.959
    };
    
    const multiplier = shareMultipliers[symbol] || 1;
    const marketCap = price * multiplier;
    
    if (marketCap >= 1000) return `₹${(marketCap / 1000).toFixed(1)}T`;
    return `₹${marketCap.toFixed(0)}B`;
  }

  /**
   * Generate P/E ratios
   */
  generatePERatio(symbol) {
    const basePE = {
      'RELIANCE': 28, 'TCS': 31, 'INFY': 29, 'HDFCBANK': 18,
      'ICICIBANK': 16, 'HINDUNILVR': 65, 'BAJFINANCE': 35
    };
    
    const base = basePE[symbol] || 25;
    const variation = (Math.random() - 0.5) * 0.2;
    return Math.round(base * (1 + variation) * 10) / 10;
  }

  /**
   * Generate dividend yields
   */
  generateDividendYield(symbol) {
    const baseDividend = {
      'RELIANCE': 0.35, 'TCS': 3.2, 'INFY': 2.8, 'HDFCBANK': 1.2,
      'ICICIBANK': 0.8, 'HINDUNILVR': 1.5, 'BAJFINANCE': 0.1
    };
    
    return baseDividend[symbol] || 1.0;
  }

  /**
   * Get news data
   */
  async getNewsData(symbol, companyName) {
    const cacheKey = `news_${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      // Try backend first
      if (this.backendAvailable && this.isOnline) {
        try {
          const response = await fetch(`${this.baseURL}/news?q=${symbol}&pageSize=5`);
          if (response.ok) {
            const data = await response.json();
            if (data.articles) {
              const newsData = data.articles.map(article => ({
                title: article.title,
                description: article.description,
                url: article.url,
                source: article.source.name,
                time: formatTimeAgo(article.publishedAt),
                sentiment: this.analyzeSentiment(article.title)
              }));
              this.setCachedData(cacheKey, newsData, CACHE_DURATIONS.NEWS_DATA);
              return newsData;
            }
          }
        } catch (error) {
          console.warn('News API failed, using mock news');
        }
      }

      // Use mock news
      await this.simulateNetworkDelay(300);
      const newsData = this.generateRealisticNews(symbol, companyName);
      this.setCachedData(cacheKey, newsData, CACHE_DURATIONS.NEWS_DATA);
      return newsData;

    } catch (error) {
      console.warn('News error:', error);
      return this.generateRealisticNews(symbol, companyName);
    }
  }

  /**
   * Generate realistic news
   */
  generateRealisticNews(symbol, companyName) {
    const templates = [
      {
        title: `${companyName} reports strong Q3 earnings, beats estimates`,
        description: `${companyName} posted robust quarterly results with 12% YoY growth`,
        sentiment: 'positive',
        hours: 2
      },
      {
        title: `Analysts maintain BUY rating on ${symbol}`,
        description: `Strong fundamentals and growth prospects drive positive outlook`,
        sentiment: 'positive', 
        hours: 5
      },
      {
        title: `${companyName} announces strategic expansion plans`,
        description: `Company unveils ₹500 crore investment in new markets`,
        sentiment: 'positive',
        hours: 8
      }
    ];

    const sources = ['Economic Times', 'Business Standard', 'Mint', 'Moneycontrol'];

    return templates.map((template, index) => ({
      title: template.title,
      description: template.description,
      url: `#news-${symbol}-${index}`,
      source: sources[index % sources.length],
      time: `${template.hours} hours ago`,
      sentiment: template.sentiment,
      publishedAt: new Date(Date.now() - template.hours * 3600000).toISOString()
    }));
  }

  /**
   * Get chart data
   */
  async getChartData(symbol, interval = '1d', range = '1mo') {
    const cacheKey = `chart_${symbol}_${interval}_${range}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      // Try backend first
      if (this.backendAvailable && this.isOnline) {
        try {
          const response = await fetch(`${this.baseURL}/stocks/yahoo/${symbol}.NS?interval=${interval}&range=${range}`);
          if (response.ok) {
            const data = await response.json();
            const result = data.chart?.result?.[0];
            if (result) {
              const chartData = this.formatChartData(result);
              this.setCachedData(cacheKey, chartData, CACHE_DURATIONS.CHART_DATA);
              return chartData;
            }
          }
        } catch (error) {
          console.warn('Chart API failed, using mock chart');
        }
      }

      // Use mock chart
      await this.simulateNetworkDelay(250);
      const chartData = this.generateRealisticChartData(symbol, interval, range);
      this.setCachedData(cacheKey, chartData, CACHE_DURATIONS.CHART_DATA);
      return chartData;

    } catch (error) {
      console.warn('Chart error:', error);
      return this.generateRealisticChartData(symbol, interval, range);
    }
  }

  /**
   * Format chart data from API response
   */
  formatChartData(result) {
    const timestamps = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    if (!quote) return [];

    return timestamps.map((timestamp, index) => ({
      time: new Date(timestamp * 1000).toLocaleTimeString('en-US', { 
        hour: '2-digit', minute: '2-digit' 
      }),
      timestamp: timestamp * 1000,
      open: quote.open?.[index] || 0,
      high: quote.high?.[index] || 0,
      low: quote.low?.[index] || 0,
      close: quote.close?.[index] || 0,
      volume: quote.volume?.[index] || 0
    })).filter(item => item.close > 0);
  }

  /**
   * Generate realistic chart data
   */
  generateRealisticChartData(symbol, interval = '1d', range = '1mo') {
    const currentPrice = this.mockPrices[symbol]?.price || 1000;
    const dataPoints = this.getDataPointsForRange(range);
    const intervalMinutes = this.getIntervalMinutes(interval);
    
    const data = [];
    let price = currentPrice * 0.98;
    const trend = (Math.random() - 0.4) * 0.001; // Slight upward bias
    const volatility = 0.012;
    
    for (let i = 0; i < dataPoints; i++) {
      const timestamp = new Date(Date.now() - (dataPoints - i) * intervalMinutes * 60000);
      
      const randomChange = (Math.random() - 0.5) * 2 * volatility * price;
      const trendChange = trend * price;
      price = Math.max(price + randomChange + trendChange, price * 0.85);
      
      const open = price;
      const close = price + (Math.random() - 0.5) * volatility * price * 0.4;
      const high = Math.max(open, close) + Math.random() * volatility * price * 0.2;
      const low = Math.min(open, close) - Math.random() * volatility * price * 0.2;
      const volume = Math.floor((30000 + Math.random() * 150000) * (1 + Math.abs(close - open) / open * 5));
      
      data.push({
        time: timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timestamp: timestamp.getTime(),
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume
      });
      
      price = close;
    }

    return data;
  }

  /**
   * Get data points for range
   */
  getDataPointsForRange(range) {
    const mappings = {
      '1d': 25, '5d': 65, '1mo': 60, '3mo': 90, '6mo': 120, '1y': 250
    };
    return mappings[range] || 25;
  }

  /**
   * Get interval in minutes
   */
  getIntervalMinutes(interval) {
    const mappings = {
      '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '1d': 1440
    };
    return mappings[interval] || 15;
  }

  /**
   * Search stocks
   */
  async searchStocks(query) {
    if (!query || query.length < 1) return [];
    
    const sanitizedQuery = sanitizeInput(query).toUpperCase();
    const allSymbols = [...STOCK_SYMBOLS.INDIAN, ...STOCK_SYMBOLS.US];
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
   * Get market status
   */
  async getMarketStatus() {
    return this.getCurrentMarketStatus();
  }

  /**
   * Simulate network delay
   */
  async simulateNetworkDelay(ms = 150 + Math.random() * 200) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Analyze sentiment
   */
  analyzeSentiment(text) {
    const positiveWords = ['gain', 'rise', 'growth', 'strong', 'buy', 'positive', 'bullish'];
    const negativeWords = ['fall', 'drop', 'loss', 'weak', 'sell', 'negative', 'bearish'];
    
    const textLower = text.toLowerCase();
    const positiveCount = positiveWords.filter(word => textLower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => textLower.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
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
   * Health check
   */
  async checkHealth() {
    return {
      status: 'OK',
      message: this.backendAvailable ? 'Connected to backend API' : 'Using high-quality mock data',
      timestamp: new Date().toISOString(),
      backend: this.backendAvailable,
      mockData: !this.backendAvailable
    };
  }

  /**
   * Cleanup
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

// Create and export singleton
const apiService = new APIService();

// Cleanup every 10 minutes
setInterval(() => apiService.cleanup(), 600000);

// Update prices every 30 seconds during market hours
setInterval(async () => {
  const status = await apiService.getMarketStatus();
  if (status.status === 'OPEN') {
    apiService.updateMockPrices();
  }
}, 30000);

console.log('🚀 TradePro API Service initialized');
console.log('💡 App works perfectly with or without backend server');

export default apiService;