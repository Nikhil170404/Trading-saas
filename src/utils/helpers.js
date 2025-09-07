// ===== CONSTANTS =====
export const API_ENDPOINTS = {
  ALPHA_VANTAGE: 'https://www.alphavantage.co/query',
  NEWS_API: 'https://newsapi.org/v2/everything',
  YAHOO_FINANCE: 'https://query1.finance.yahoo.com/v8/finance/chart',
  DUCKDUCKGO: 'https://api.duckduckgo.com/',
  NSE_INDIA: 'https://www.nseindia.com/api',
  POLYGON: 'https://api.polygon.io'
};

export const STOCK_SYMBOLS = {
  INDIAN: [
    'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 
    'HINDUNILVR', 'BAJFINANCE', 'KOTAKBANK', 'LT', 'ASIANPAINT',
    'MARUTI', 'SBIN', 'NESTLEIND', 'WIPRO', 'HCLTECH',
    'AXISBANK', 'TITAN', 'SUNPHARMA', 'TECHM', 'ULTRACEMCO'
  ],
  US: [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA',
    'META', 'NVDA', 'NFLX', 'CRM', 'ADBE'
  ]
};

export const CACHE_DURATIONS = {
  STOCK_DATA: 5 * 60 * 1000, // 5 minutes
  NEWS_DATA: 30 * 60 * 1000, // 30 minutes
  CHART_DATA: 10 * 60 * 1000, // 10 minutes
  PORTFOLIO_DATA: 60 * 60 * 1000 // 1 hour
};

export const RATE_LIMITS = {
  ALPHA_VANTAGE: { calls: 5, window: 60 * 1000 }, // 5 per minute
  NEWS_API: { calls: 50, window: 60 * 60 * 1000 }, // 50 per hour
  YAHOO_FINANCE: { calls: 100, window: 60 * 1000 }, // 100 per minute
  DUCKDUCKGO: { calls: 30, window: 60 * 1000 } // 30 per minute
};

export const TECHNICAL_INDICATORS = {
  RSI_PERIOD: 14,
  SMA_SHORT: 20,
  SMA_LONG: 50,
  EMA_PERIOD: 12,
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9
};

export const MARKET_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  PRE_MARKET: 'PRE_MARKET',
  AFTER_HOURS: 'AFTER_HOURS'
};

export const ORDER_TYPES = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP_LOSS: 'STOP_LOSS',
  STOP_LIMIT: 'STOP_LIMIT'
};

export const RECOMMENDATION_TYPES = {
  STRONG_BUY: 'STRONG_BUY',
  BUY: 'BUY',
  HOLD: 'HOLD',
  SELL: 'SELL',
  STRONG_SELL: 'STRONG_SELL'
};

// ===== UTILITY FUNCTIONS =====

/**
 * Format number as currency
 * @param {number} value - The number to format
 * @param {string} currency - Currency symbol (default: ₹)
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, currency = '₹', decimals = 2) => {
  if (typeof value !== 'number' || isNaN(value)) return `${currency}0.00`;
  
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  
  return formatter.format(value).replace('₹', currency);
};

/**
 * Format large numbers with appropriate suffixes
 * @param {number} num - Number to format
 * @param {number} digits - Number of decimal places
 * @returns {string} Formatted number string
 */
export const formatNumber = (num, digits = 1) => {
  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "K" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "B" },
    { value: 1e12, symbol: "T" }
  ];
  
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  const item = lookup.slice().reverse().find(item => num >= item.value);
  
  return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
};

/**
 * Format percentage with proper styling
 * @param {number} value - Percentage value
 * @param {number} decimals - Number of decimal places
 * @returns {object} Object with formatted value and styling class
 */
export const formatPercentage = (value, decimals = 2) => {
  const formatted = `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
  const className = value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
  
  return {
    value: formatted,
    className: `change-${className}`,
    raw: value
  };
};

/**
 * Format volume numbers
 * @param {number} volume - Volume number
 * @returns {string} Formatted volume string
 */
export const formatVolume = (volume) => {
  if (!volume || volume === 0) return '0';
  
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`;
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
  
  return volume.toString();
};

/**
 * Format time ago string
 * @param {string|Date} timestamp - Timestamp to format
 * @returns {string} Human readable time ago string
 */
export const formatTimeAgo = (timestamp) => {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString('en-IN', { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

/**
 * Debounce function to limit API calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function to limit function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Create a rate limiter for API calls
 * @param {number} maxCalls - Maximum number of calls
 * @param {number} timeWindow - Time window in milliseconds
 * @returns {Function} Rate limiter function
 */
export const createRateLimiter = (maxCalls, timeWindow) => {
  const calls = [];
  
  return async () => {
    const now = Date.now();
    
    // Remove calls outside the time window
    while (calls.length && calls[0] <= now - timeWindow) {
      calls.shift();
    }
    
    if (calls.length >= maxCalls) {
      const waitTime = calls[0] + timeWindow - now;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return createRateLimiter(maxCalls, timeWindow)();
    }
    
    calls.push(now);
    return true;
  };
};

/**
 * Validate stock symbol format
 * @param {string} symbol - Stock symbol to validate
 * @returns {boolean} True if valid symbol
 */
export const isValidStockSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') return false;
  
  // Basic validation: 1-10 alphanumeric characters
  const symbolRegex = /^[A-Z0-9]{1,10}$/;
  return symbolRegex.test(symbol.toUpperCase());
};

/**
 * Sanitize input to prevent XSS
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>\"'&]/g, '')
    .trim()
    .substring(0, 100); // Limit length
};

/**
 * Generate unique ID
 * @returns {string} Unique identifier
 */
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Deep clone an object
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
};

/**
 * Check if market is currently open (Indian market hours)
 * @returns {object} Market status information
 */
export const getMarketStatus = () => {
  const now = new Date();
  const indianTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
  const dayOfWeek = indianTime.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = indianTime.getHours();
  const minutes = indianTime.getMinutes();
  const currentTime = hours * 100 + minutes;
  
  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      status: MARKET_STATUS.CLOSED,
      message: 'Market is closed (Weekend)',
      nextOpen: getNextMarketOpen(indianTime)
    };
  }
  
  // Market hours: 9:15 AM to 3:30 PM (IST)
  const marketOpen = 915; // 9:15 AM
  const marketClose = 1530; // 3:30 PM
  
  if (currentTime >= marketOpen && currentTime <= marketClose) {
    return {
      status: MARKET_STATUS.OPEN,
      message: 'Market is open',
      timeToClose: getTimeToClose(indianTime)
    };
  } else if (currentTime < marketOpen) {
    return {
      status: MARKET_STATUS.PRE_MARKET,
      message: 'Pre-market hours',
      timeToOpen: getTimeToOpen(indianTime)
    };
  } else {
    return {
      status: MARKET_STATUS.CLOSED,
      message: 'Market is closed',
      nextOpen: getNextMarketOpen(indianTime)
    };
  }
};

/**
 * Get time until market opens
 * @param {Date} currentTime - Current time
 * @returns {string} Time until market opens
 */
const getTimeToOpen = (currentTime) => {
  const marketOpen = new Date(currentTime);
  marketOpen.setHours(9, 15, 0, 0);
  
  if (currentTime.getHours() >= 15 && currentTime.getMinutes() > 30) {
    marketOpen.setDate(marketOpen.getDate() + 1);
  }
  
  const diff = marketOpen - currentTime;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
};

/**
 * Get time until market closes
 * @param {Date} currentTime - Current time
 * @returns {string} Time until market closes
 */
const getTimeToClose = (currentTime) => {
  const marketClose = new Date(currentTime);
  marketClose.setHours(15, 30, 0, 0);
  
  const diff = marketClose - currentTime;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
};

/**
 * Get next market open time
 * @param {Date} currentTime - Current time
 * @returns {string} Next market open time
 */
const getNextMarketOpen = (currentTime) => {
  const nextOpen = new Date(currentTime);
  nextOpen.setHours(9, 15, 0, 0);
  
  // If it's weekend or after market hours, move to next weekday
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
  
  return nextOpen.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Calculate technical indicators
 * @param {Array} prices - Array of price values
 * @returns {object} Technical indicators
 */
export const calculateTechnicalIndicators = (prices) => {
  if (!prices || prices.length < 2) {
    return {
      rsi: null,
      sma20: null,
      sma50: null,
      ema: null,
      trend: 'NEUTRAL'
    };
  }
  
  const rsi = calculateRSI(prices, TECHNICAL_INDICATORS.RSI_PERIOD);
  const sma20 = calculateSMA(prices, TECHNICAL_INDICATORS.SMA_SHORT);
  const sma50 = calculateSMA(prices, TECHNICAL_INDICATORS.SMA_LONG);
  const ema = calculateEMA(prices, TECHNICAL_INDICATORS.EMA_PERIOD);
  
  // Determine trend
  let trend = 'NEUTRAL';
  if (sma20 && sma50 && sma20.length > 0 && sma50.length > 0) {
    const latestSma20 = sma20[sma20.length - 1];
    const latestSma50 = sma50[sma50.length - 1];
    
    if (latestSma20 > latestSma50) {
      trend = 'BULLISH';
    } else if (latestSma20 < latestSma50) {
      trend = 'BEARISH';
    }
  }
  
  return {
    rsi: rsi ? rsi[rsi.length - 1] : null,
    sma20: sma20 ? sma20[sma20.length - 1] : null,
    sma50: sma50 ? sma50[sma50.length - 1] : null,
    ema: ema ? ema[ema.length - 1] : null,
    trend
  };
};

/**
 * Calculate Simple Moving Average
 * @param {Array} prices - Array of prices
 * @param {number} period - Period for SMA
 * @returns {Array} SMA values
 */
export const calculateSMA = (prices, period) => {
  if (!prices || prices.length < period) return null;
  
  const sma = [];
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
};

/**
 * Calculate Exponential Moving Average
 * @param {Array} prices - Array of prices
 * @param {number} period - Period for EMA
 * @returns {Array} EMA values
 */
export const calculateEMA = (prices, period) => {
  if (!prices || prices.length < period) return null;
  
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  // Start with SMA for first value
  const initialSMA = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  ema.push(initialSMA);
  
  for (let i = period; i < prices.length; i++) {
    const value = (prices[i] * multiplier) + (ema[ema.length - 1] * (1 - multiplier));
    ema.push(value);
  }
  
  return ema;
};

/**
 * Calculate Relative Strength Index (RSI)
 * @param {Array} prices - Array of prices
 * @param {number} period - Period for RSI (default: 14)
 * @returns {Array} RSI values
 */
export const calculateRSI = (prices, period = 14) => {
  if (!prices || prices.length < period + 1) return null;
  
  const gains = [];
  const losses = [];
  
  // Calculate gains and losses
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  if (gains.length < period) return null;
  
  const rsi = [];
  
  // Calculate initial average gain and loss
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Calculate first RSI value
  const rs1 = avgGain / (avgLoss || 0.0001); // Prevent division by zero
  rsi.push(100 - (100 / (1 + rs1)));
  
  // Calculate subsequent RSI values
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    const rs = avgGain / (avgLoss || 0.0001);
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  return rsi;
};

/**
 * Generate trading recommendation based on technical analysis
 * @param {object} indicators - Technical indicators
 * @param {number} currentPrice - Current stock price
 * @param {number} changePercent - Price change percentage
 * @returns {object} Trading recommendation
 */
export const generateRecommendation = (indicators, currentPrice, changePercent) => {
  let score = 0;
  const signals = [];
  
  // RSI signals
  if (indicators.rsi) {
    if (indicators.rsi < 30) {
      score += 2;
      signals.push('RSI oversold - bullish signal');
    } else if (indicators.rsi > 70) {
      score -= 2;
      signals.push('RSI overbought - bearish signal');
    } else if (indicators.rsi >= 40 && indicators.rsi <= 60) {
      score += 1;
      signals.push('RSI in neutral zone');
    }
  }
  
  // Moving average signals
  if (indicators.sma20 && indicators.sma50) {
    if (indicators.sma20 > indicators.sma50) {
      score += 1;
      signals.push('SMA20 above SMA50 - bullish trend');
    } else {
      score -= 1;
      signals.push('SMA20 below SMA50 - bearish trend');
    }
  }
  
  // Price momentum
  if (changePercent > 2) {
    score += 1;
    signals.push('Strong positive momentum');
  } else if (changePercent < -2) {
    score -= 1;
    signals.push('Strong negative momentum');
  }
  
  // Trend analysis
  if (indicators.trend === 'BULLISH') {
    score += 1;
    signals.push('Overall bullish trend');
  } else if (indicators.trend === 'BEARISH') {
    score -= 1;
    signals.push('Overall bearish trend');
  }
  
  // Generate recommendation
  let recommendation;
  let confidence;
  
  if (score >= 3) {
    recommendation = RECOMMENDATION_TYPES.STRONG_BUY;
    confidence = 'HIGH';
  } else if (score >= 1) {
    recommendation = RECOMMENDATION_TYPES.BUY;
    confidence = score >= 2 ? 'HIGH' : 'MEDIUM';
  } else if (score <= -3) {
    recommendation = RECOMMENDATION_TYPES.STRONG_SELL;
    confidence = 'HIGH';
  } else if (score <= -1) {
    recommendation = RECOMMENDATION_TYPES.SELL;
    confidence = score <= -2 ? 'HIGH' : 'MEDIUM';
  } else {
    recommendation = RECOMMENDATION_TYPES.HOLD;
    confidence = 'MEDIUM';
  }
  
  return {
    recommendation,
    confidence,
    score,
    signals: signals.slice(0, 3) // Limit to top 3 signals
  };
};

/**
 * Local storage utilities with error handling
 */
export const storage = {
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      return false;
    }
  },
  
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return defaultValue;
    }
  },
  
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error removing from localStorage:', error);
      return false;
    }
  },
  
  clear: () => {
    try {
      localStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }
};

/**
 * Error handling utilities
 */
export const errorHandler = {
  log: (error, context = '') => {
    console.error(`Error ${context}:`, error);
    
    // In production, send to error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: Sentry, LogRocket, etc.
      // errorReportingService.captureException(error, { context });
    }
  },
  
  formatErrorMessage: (error) => {
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    return 'An unexpected error occurred';
  }
};

/**
 * Performance monitoring utilities
 */
export const performance = {
  mark: (name) => {
    if (window.performance && window.performance.mark) {
      window.performance.mark(name);
    }
  },
  
  measure: (name, startMark, endMark) => {
    if (window.performance && window.performance.measure) {
      try {
        window.performance.measure(name, startMark, endMark);
        const measure = window.performance.getEntriesByName(name)[0];
        return measure ? measure.duration : null;
      } catch (error) {
        console.warn('Performance measurement failed:', error);
        return null;
      }
    }
    return null;
  }
};