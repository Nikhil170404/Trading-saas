import {
  CACHE_DURATIONS,
  STOCK_SYMBOLS,
  formatTimeAgo,
  sanitizeInput,
  errorHandler,
  storage
} from '../utils/helpers';

/**
 * Self-Contained API Service with Realistic Mock Data
 * Works immediately without requiring a backend server
 */
class APIService {
  constructor() {
    this.cache = new Map();
    this.isOnline = navigator.onLine;
    this.mockDataEnabled = true; // Always use mock data for immediate functionality
    
    this.setupNetworkMonitoring();
    this.loadCacheFromStorage();
    this.initializeMockData();
  }

  /**
   * Setup network monitoring
   */
  setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('📡 Back online - mock data continues to work');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📡 Offline - using cached mock data');
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
   * Initialize realistic mock data
   */
  initializeMockData() {
    // Initialize stock prices with some persistence
    const savedPrices = storage.get('mockStockPrices', {});
    this.mockPrices = { ...this.getDefaultMockPrices(), ...savedPrices };
    
    // Update prices periodically to simulate market movement
    setInterval(() => {
      this.updateMockPrices();
    }, 30000); // Update every 30 seconds
  }

  /**
   * Get default mock prices for stocks
   */
  getDefaultMockPrices() {
    return {
      'RELIANCE': { price: 2847.50, basePrice: 2850 },
      'TCS': { price: 3324.25, basePrice: 3320 },
      'INFY': { price: 1456.75, basePrice: 1460 },
      'HDFCBANK': { price: 1734.20, basePrice: 1730 },
      'ICICIBANK': { price: 967.85, basePrice: 970 },
      'HINDUNILVR': { price: 2687.90, basePrice: 2690 },
      'BAJFINANCE': { price: 6789.45, basePrice: 6800 },
      'KOTAKBANK': { price: 1876.30, basePrice: 1880 },
      'LT': { price: 3456.80, basePrice: 3450 },
      'ASIANPAINT': { price: 2934.65, basePrice: 2940 },
      'MARUTI': { price: 10234.20, basePrice: 10250 },
      'SBIN': { price: 567.45, basePrice: 570 },
      'NESTLEIND': { price: 23456.75, basePrice: 23500 },
      'WIPRO': { price: 445.60, basePrice: 448 },
      'HCLTECH': { price: 1234.85, basePrice: 1230 },
      'AXISBANK': { price: 1098.25, basePrice: 1100 },
      'TITAN': { price: 3245.90, basePrice: 3250 },
      'SUNPHARMA': { price: 1067.35, basePrice: 1070 },
      'TECHM': { price: 1456.70, basePrice: 1460 },
      'ULTRACEMCO': { price: 8765.25, basePrice: 8800 }
    };
  }

  /**
   * Update mock prices to simulate market movement
   */
  updateMockPrices() {
    Object.keys(this.mockPrices).forEach(symbol => {
      const data = this.mockPrices[symbol];
      const volatility = 0.02; // 2% max change
      const randomChange = (Math.random() - 0.5) * 2 * volatility;
      
      // Add some momentum - prices tend to continue in same direction
      const momentum = Math.random() > 0.7 ? randomChange * 1.5 : randomChange;
      
      data.price = Math.max(
        data.basePrice * (1 + momentum),
        data.basePrice * 0.8 // Don't go below 80% of base price
      );
      data.price = Math.min(data.price, data.basePrice * 1.2); // Don't go above 120%
      data.price = Math.round(data.price * 100) / 100; // Round to 2 decimals
    });

    // Save updated prices
    storage.set('mockStockPrices', this.mockPrices);
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
    
    // Periodically save cache
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
      // Simulate network delay for realism
      await this.simulateNetworkDelay();

      const stockData = this.generateRealisticStockData(symbols);
      this.setCachedData(cacheKey, stockData, 60000); // 1 minute cache
      
      console.log(`📊 Generated stock data for ${symbols.length} symbols`);
      return stockData;

    } catch (error) {
      errorHandler.log(error, 'getting stock data');
      return this.generateRealisticStockData(symbols);
    }
  }

  /**
   * Generate realistic stock data with proper market simulation
   */
  generateRealisticStockData(symbols) {
    return symbols.map(symbol => {
      const mockData = this.mockPrices[symbol] || { 
        price: 1000 + Math.random() * 2000, 
        basePrice: 1000 + Math.random() * 2000 
      };
      
      const currentPrice = mockData.price;
      const previousClose = mockData.basePrice;
      const change = currentPrice - previousClose;
      const changePercent = (change / previousClose) * 100;
      
      // Calculate day's high and low
      const volatilityRange = currentPrice * 0.03; // 3% daily range
      const high = currentPrice + Math.random() * volatilityRange;
      const low = currentPrice - Math.random() * volatilityRange;
      const open = previousClose + (Math.random() - 0.5) * volatilityRange * 0.5;
      
      // Generate volume (more volume on big moves)
      const baseVolume = 1000000 + Math.random() * 3000000;
      const volumeMultiplier = 1 + Math.abs(changePercent) / 10;
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
   * Generate smart recommendations based on multiple factors
   */
  generateSmartRecommendation(changePercent, symbol) {
    // Base recommendation on price change
    let score = 0;
    
    if (changePercent > 3) score += 2;
    else if (changePercent > 1) score += 1;
    else if (changePercent < -3) score -= 2;
    else if (changePercent < -1) score -= 1;
    
    // Add sector-specific bias
    const sectorBias = this.getSectorBias(symbol);
    score += sectorBias;
    
    // Add some randomness for market sentiment
    const marketSentiment = (Math.random() - 0.5) * 2; // -1 to 1
    score += marketSentiment;
    
    // Convert score to recommendation
    if (score >= 2.5) return 'STRONG_BUY';
    if (score >= 1) return 'BUY';
    if (score <= -2.5) return 'STRONG_SELL';
    if (score <= -1) return 'SELL';
    return 'HOLD';
  }

  /**
   * Get sector bias for recommendations
   */
  getSectorBias(symbol) {
    const sectorTrends = {
      'TCS': 0.5, 'INFY': 0.5, 'WIPRO': 0.3, 'HCLTECH': 0.4, 'TECHM': 0.3, // Tech positive
      'HDFCBANK': 0.2, 'ICICIBANK': 0.2, 'KOTAKBANK': 0.1, 'AXISBANK': 0.1, 'SBIN': 0, // Banking neutral
      'RELIANCE': -0.1, 'LT': -0.2, // Industrial slightly negative
      'HINDUNILVR': 0.3, 'NESTLEIND': 0.4, // FMCG positive
      'BAJFINANCE': 0.1, // NBFC slight positive
      'ASIANPAINT': 0.2, 'TITAN': 0.3, // Consumer goods positive
      'MARUTI': -0.1, // Auto slight negative
      'SUNPHARMA': 0.2, // Pharma positive
      'ULTRACEMCO': -0.1 // Cement slight negative
    };
    
    return sectorTrends[symbol] || 0;
  }

  /**
   * Calculate realistic market cap
   */
  calculateMarketCap(symbol, price) {
    const shareMultipliers = {
      'RELIANCE': 6.765, 'TCS': 3.668, 'INFY': 4.261, 'HDFCBANK': 7.642,
      'ICICIBANK': 7.024, 'HINDUNILVR': 2.349, 'BAJFINANCE': 0.617,
      'KOTAKBANK': 3.719, 'LT': 1.407, 'ASIANPAINT': 0.959,
      'MARUTI': 0.302, 'SBIN': 8.926, 'NESTLEIND': 0.964,
      'WIPRO': 5.230, 'HCLTECH': 2.721, 'AXISBANK': 3.090,
      'TITAN': 0.890, 'SUNPHARMA': 2.394, 'TECHM': 0.979, 'ULTRACEMCO': 0.287
    };
    
    const multiplier = shareMultipliers[symbol] || 1;
    const marketCap = price * multiplier; // In billions
    
    if (marketCap >= 1000) return `₹${(marketCap / 1000).toFixed(1)}T`;
    return `₹${marketCap.toFixed(0)}B`;
  }

  /**
   * Generate realistic P/E ratios
   */
  generatePERatio(symbol) {
    const basePE = {
      'RELIANCE': 28, 'TCS': 31, 'INFY': 29, 'HDFCBANK': 18,
      'ICICIBANK': 16, 'HINDUNILVR': 65, 'BAJFINANCE': 35,
      'KOTAKBANK': 20, 'LT': 45, 'ASIANPAINT': 58,
      'MARUTI': 25, 'SBIN': 12, 'NESTLEIND': 75,
      'WIPRO': 24, 'HCLTECH': 26, 'AXISBANK': 14,
      'TITAN': 85, 'SUNPHARMA': 42, 'TECHM': 22, 'ULTRACEMCO': 38
    };
    
    const base = basePE[symbol] || 25;
    const variation = (Math.random() - 0.5) * 0.2; // ±10% variation
    return Math.round(base * (1 + variation) * 10) / 10;
  }

  /**
   * Generate dividend yields
   */
  generateDividendYield(symbol) {
    const baseDividend = {
      'RELIANCE': 0.35, 'TCS': 3.2, 'INFY': 2.8, 'HDFCBANK': 1.2,
      'ICICIBANK': 0.8, 'HINDUNILVR': 1.5, 'BAJFINANCE': 0.1,
      'KOTAKBANK': 0.5, 'LT': 1.8, 'ASIANPAINT': 0.6,
      'MARUTI': 2.1, 'SBIN': 5.2, 'NESTLEIND': 0.8,
      'WIPRO': 1.9, 'HCLTECH': 2.5, 'AXISBANK': 0.9,
      'TITAN': 0.3, 'SUNPHARMA': 0.7, 'TECHM': 2.3, 'ULTRACEMCO': 1.1
    };
    
    return baseDividend[symbol] || 1.0;
  }

  /**
   * Get news data with realistic mock content
   */
  async getNewsData(symbol, companyName) {
    const cacheKey = `news_${symbol}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      await this.simulateNetworkDelay(500);
      
      const newsData = this.generateRealisticNews(symbol, companyName);
      this.setCachedData(cacheKey, newsData, CACHE_DURATIONS.NEWS_DATA);
      
      return newsData;
    } catch (error) {
      errorHandler.log(error, 'getting news data');
      return this.generateRealisticNews(symbol, companyName);
    }
  }

  /**
   * Generate realistic news with current themes
   */
  generateRealisticNews(symbol, companyName) {
    const currentDate = new Date();
    const newsTemplates = [
      {
        title: `${companyName} reports strong Q3 results, beats street estimates`,
        description: `${companyName} (${symbol}) posted robust quarterly earnings with revenue growth of 12.5% YoY, driven by strong digital transformation initiatives.`,
        sentiment: 'positive',
        hours: 2
      },
      {
        title: `Analysts maintain 'Buy' rating on ${symbol} with target price revision`,
        description: `Leading brokerage firms have maintained their positive outlook on ${companyName} citing strong fundamentals and growth prospects.`,
        sentiment: 'positive',
        hours: 4
      },
      {
        title: `${companyName} announces strategic expansion into emerging markets`,
        description: `The company unveiled plans to strengthen its presence in Southeast Asian markets with an investment of ₹500 crores over the next two years.`,
        sentiment: 'positive',
        hours: 6
      },
      {
        title: `Market volatility impacts ${symbol}, analysts advise caution`,
        description: `Recent market turbulence has affected ${companyName}'s stock performance, though long-term fundamentals remain intact according to experts.`,
        sentiment: 'neutral',
        hours: 8
      },
      {
        title: `${companyName} management provides positive guidance for FY24`,
        description: `In the latest investor call, management expressed confidence about achieving double-digit growth targets despite global headwinds.`,
        sentiment: 'positive',
        hours: 12
      }
    ];

    const sources = [
      'Economic Times', 'Business Standard', 'Mint', 'Bloomberg Quint', 
      'Moneycontrol', 'Financial Express', 'CNBC TV18', 'ET Now'
    ];

    return newsTemplates.slice(0, 3).map((template, index) => ({
      title: template.title,
      description: template.description,
      url: `#news-${symbol}-${Date.now()}-${index}`,
      source: sources[index % sources.length],
      time: `${template.hours} hour${template.hours === 1 ? '' : 's'} ago`,
      sentiment: template.sentiment,
      publishedAt: new Date(currentDate.getTime() - template.hours * 3600000).toISOString()
    }));
  }

  /**
   * Get realistic chart data
   */
  async getChartData(symbol, interval = '1d', range = '1mo') {
    const cacheKey = `chart_${symbol}_${interval}_${range}`;
    const cached = this.getCachedData(cacheKey);
    if (cached) return cached;

    try {
      await this.simulateNetworkDelay(300);
      
      const chartData = this.generateRealisticChartData(symbol, interval, range);
      this.setCachedData(cacheKey, chartData, CACHE_DURATIONS.CHART_DATA);
      
      return chartData;
    } catch (error) {
      errorHandler.log(error, 'getting chart data');
      return this.generateRealisticChartData(symbol, interval, range);
    }
  }

  /**
   * Generate realistic chart data with proper market patterns
   */
  generateRealisticChartData(symbol, interval = '1d', range = '1mo') {
    const currentPrice = this.mockPrices[symbol]?.price || 1000;
    const dataPoints = this.getDataPointsForRange(range);
    const intervalMinutes = this.getIntervalMinutes(interval);
    
    const data = [];
    let price = currentPrice * 0.95; // Start slightly lower
    const trend = (Math.random() - 0.3) * 0.002; // Slight upward bias
    const volatility = 0.015; // 1.5% volatility
    
    for (let i = 0; i < dataPoints; i++) {
      const timestamp = new Date(Date.now() - (dataPoints - i) * intervalMinutes * 60000);
      
      // Add trend and random walk
      const randomChange = (Math.random() - 0.5) * 2 * volatility * price;
      const trendChange = trend * price;
      price = Math.max(price + randomChange + trendChange, price * 0.8);
      
      // Generate OHLC data
      const open = price;
      const close = price + (Math.random() - 0.5) * volatility * price * 0.5;
      const high = Math.max(open, close) + Math.random() * volatility * price * 0.3;
      const low = Math.min(open, close) - Math.random() * volatility * price * 0.3;
      const volume = Math.floor((50000 + Math.random() * 200000) * (1 + Math.abs(close - open) / open * 10));
      
      data.push({
        time: timestamp.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
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
   * Get number of data points for range
   */
  getDataPointsForRange(range) {
    const rangeMappings = {
      '1d': 25,    // 1 day, 15min intervals
      '5d': 65,    // 5 days, hourly intervals  
      '1mo': 60,   // 1 month, daily intervals
      '3mo': 90,   // 3 months, daily intervals
      '6mo': 120,  // 6 months, daily intervals
      '1y': 250,   // 1 year, daily intervals
      '2y': 500,   // 2 years, daily intervals
      '5y': 1250   // 5 years, daily intervals
    };
    
    return rangeMappings[range] || 25;
  }

  /**
   * Get interval in minutes
   */
  getIntervalMinutes(interval) {
    const intervalMappings = {
      '1m': 1,
      '2m': 2,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '1d': 1440,
      '5d': 7200,
      '1wk': 10080,
      '1mo': 43200
    };
    
    return intervalMappings[interval] || 15;
  }

  /**
   * Search stocks by query
   */
  async searchStocks(query) {
    if (!query || query.length < 1) return [];
    
    const sanitizedQuery = sanitizeInput(query).toUpperCase();
    
    // Search in available symbols
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
    const now = new Date();
    const indianTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
    const dayOfWeek = indianTime.getDay();
    const hours = indianTime.getHours();
    const minutes = indianTime.getMinutes();
    const currentTime = hours * 100 + minutes;
    
    let status = 'CLOSED';
    let message = 'Market is closed';
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      status = 'CLOSED';
      message = 'Market is closed (Weekend)';
    } else if (currentTime >= 915 && currentTime <= 1530) {
      status = 'OPEN';
      message = 'Market is open';
    } else if (currentTime < 915) {
      status = 'PRE_MARKET';
      message = 'Pre-market hours';
    }
    
    return { 
      status, 
      message,
      currentTime: indianTime.toISOString(),
      marketOpen: '09:15',
      marketClose: '15:30',
      timezone: 'Asia/Kolkata'
    };
  }

  /**
   * Simulate network delay for realism
   */
  async simulateNetworkDelay(ms = 200 + Math.random() * 300) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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
      'ULTRACEMCO': 'UltraTech Cement Limited',
      // US Stocks
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc.',
      'AMZN': 'Amazon.com Inc.',
      'TSLA': 'Tesla Inc.',
      'META': 'Meta Platforms Inc.',
      'NVDA': 'NVIDIA Corporation',
      'NFLX': 'Netflix Inc.',
      'CRM': 'Salesforce Inc.',
      'ADBE': 'Adobe Inc.'
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
   * Health check (always returns OK for mock service)
   */
  async checkHealth() {
    return {
      status: 'OK',
      message: 'Mock API service running perfectly',
      timestamp: new Date().toISOString(),
      mockDataEnabled: true,
      dataQuality: 'High-fidelity mock data with realistic market simulation'
    };
  }

  /**
   * Cleanup method
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

// Update mock prices every 30 seconds when market is open
setInterval(() => {
  apiService.getMarketStatus().then(status => {
    if (status.status === 'OPEN') {
      apiService.updateMockPrices();
    }
  });
}, 30000);

export default apiService;