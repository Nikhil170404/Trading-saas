import { useState, useEffect, useCallback, useRef } from 'react';
import apiService from '../services/apiService';
import dataProcessor from '../services/dataProcessor';
import { 
  debounce, 
  storage, 
  errorHandler, 
  STOCK_SYMBOLS,
  getMarketStatus,
  performance as perfUtils
} from '../utils/helpers';

/**
 * Comprehensive hook for managing all app data
 * Handles stocks, portfolio, news, charts, and real-time updates
 */
export const useAppData = () => {
  // ===== STATE MANAGEMENT =====
  
  // Core data states
  const [stocks, setStocks] = useState([]);
  const [portfolio, setPortfolio] = useState({
    holdings: [],
    totalValue: 275000,
    availableCash: 50000,
    todayChange: 2450,
    metrics: null
  });
  const [news, setNews] = useState(new Map());
  const [chartData, setChartData] = useState(new Map());
  const [technicalAnalysis, setTechnicalAnalysis] = useState(new Map());
  
  // UI states
  const [loading, setLoading] = useState({
    stocks: true,
    portfolio: false,
    news: false,
    charts: false
  });
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedStock, setSelectedStock] = useState(null);
  
  // App states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [marketStatus, setMarketStatus] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(null);
  
  // Refs for cleanup and optimization
  const abortControllerRef = useRef(null);
  const updateTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);

  // ===== CORE DATA LOADING =====

  /**
   * Load stock data with error handling and retries
   */
  const loadStocks = useCallback(async (symbols = STOCK_SYMBOLS.INDIAN.slice(0, 10), isRefresh = false) => {
    // Mark performance start
    perfUtils.mark('stocks-load-start');
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (!isRefresh) {
      setLoading(prev => ({ ...prev, stocks: true }));
      setError(null);
    }

    try {
      const stockData = await apiService.getStockData(symbols);
      
      // Process technical analysis for each stock
      const processedStocks = await Promise.all(
        stockData.map(async (stock) => {
          try {
            // Get technical analysis
            const technical = dataProcessor.performTechnicalAnalysis(stock);
            setTechnicalAnalysis(prev => new Map(prev).set(stock.symbol, technical));
            
            // Load chart data in background
            loadChartData(stock.symbol);
            
            // Load news in background
            loadNewsData(stock.symbol, stock.name);
            
            return {
              ...stock,
              technicalScore: technical.technicalScore,
              recommendation: technical.recommendation.recommendation,
              signals: technical.signals.slice(0, 2) // Top 2 signals
            };
          } catch (error) {
            errorHandler.log(error, `processing stock ${stock.symbol}`);
            return stock;
          }
        })
      );

      setStocks(processedStocks);
      setLastUpdate(new Date());
      retryCountRef.current = 0; // Reset retry count on success
      
      // Mark performance end
      const duration = perfUtils.measure('stocks-load', 'stocks-load-start');
      if (duration) {
        console.log(`Stocks loaded in ${Math.round(duration)}ms`);
      }

    } catch (error) {
      if (error.name !== 'AbortError') {
        errorHandler.log(error, 'loading stocks');
        setError(errorHandler.formatErrorMessage(error));
        
        // Implement exponential backoff retry
        if (retryCountRef.current < 3 && isOnline) {
          retryCountRef.current++;
          const retryDelay = Math.pow(2, retryCountRef.current) * 1000;
          
          setTimeout(() => {
            loadStocks(symbols, true);
          }, retryDelay);
        }
      }
    } finally {
      setLoading(prev => ({ ...prev, stocks: false }));
    }
  }, [isOnline]);

  /**
   * Load portfolio data and calculate metrics
   */
  const loadPortfolio = useCallback(async () => {
    setLoading(prev => ({ ...prev, portfolio: true }));
    
    try {
      // Load portfolio from storage
      const savedPortfolio = storage.get('tradingPortfolio', {
        holdings: [],
        totalValue: 275000,
        availableCash: 50000,
        todayChange: 2450,
        transactions: []
      });

      // Update current prices for holdings
      if (savedPortfolio.holdings.length > 0) {
        const symbols = savedPortfolio.holdings.map(h => h.symbol);
        const currentPrices = await apiService.getStockData(symbols);
        
        savedPortfolio.holdings = savedPortfolio.holdings.map(holding => {
          const currentStock = currentPrices.find(s => s.symbol === holding.symbol);
          return {
            ...holding,
            currentPrice: currentStock ? currentStock.price : holding.avgPrice,
            change: currentStock ? currentStock.change : 0,
            changePercent: currentStock ? currentStock.changePercent : 0
          };
        });
      }

      // Calculate portfolio metrics
      const metrics = dataProcessor.calculatePortfolioMetrics(savedPortfolio.holdings, stocks);
      
      setPortfolio({
        ...savedPortfolio,
        metrics
      });

    } catch (error) {
      errorHandler.log(error, 'loading portfolio');
    } finally {
      setLoading(prev => ({ ...prev, portfolio: false }));
    }
  }, [stocks]);

  /**
   * Load news data for a specific stock
   */
  const loadNewsData = useCallback(async (symbol, companyName) => {
    try {
      setLoading(prev => ({ ...prev, news: true }));
      
      const newsData = await apiService.getNewsData(symbol, companyName);
      setNews(prev => new Map(prev).set(symbol, newsData));
      
    } catch (error) {
      errorHandler.log(error, `loading news for ${symbol}`);
    } finally {
      setLoading(prev => ({ ...prev, news: false }));
    }
  }, []);

  /**
   * Load chart data for a specific stock
   */
  const loadChartData = useCallback(async (symbol, interval = '15m', range = '1d') => {
    try {
      setLoading(prev => ({ ...prev, charts: true }));
      
      const data = await apiService.getChartData(symbol, interval, range);
      setChartData(prev => new Map(prev).set(symbol, data));
      
    } catch (error) {
      errorHandler.log(error, `loading chart data for ${symbol}`);
    } finally {
      setLoading(prev => ({ ...prev, charts: false }));
    }
  }, []);

  // ===== SEARCH AND FILTERING =====

  /**
   * Debounced search function
   */
  const debouncedSearch = useCallback(
    debounce(async (query) => {
      if (!query.trim()) {
        loadStocks(); // Load default stocks
        return;
      }

      try {
        setLoading(prev => ({ ...prev, stocks: true }));
        const searchResults = await apiService.searchStocks(query);
        setStocks(searchResults);
      } catch (error) {
        errorHandler.log(error, 'searching stocks');
        setError('Search failed. Please try again.');
      } finally {
        setLoading(prev => ({ ...prev, stocks: false }));
      }
    }, 500),
    []
  );

  /**
   * Handle search query changes
   */
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    debouncedSearch(query);
  }, [debouncedSearch]);

  /**
   * Filter stocks based on current filter
   */
  const filteredStocks = useCallback(() => {
    if (filter === 'all') return stocks;
    
    return stocks.filter(stock => {
      switch (filter) {
        case 'buy':
          return ['BUY', 'STRONG_BUY'].includes(stock.recommendation);
        case 'sell':
          return ['SELL', 'STRONG_SELL'].includes(stock.recommendation);
        case 'hold':
          return stock.recommendation === 'HOLD';
        case 'gainers':
          return stock.changePercent > 0;
        case 'losers':
          return stock.changePercent < 0;
        case 'active':
          return parseInt(stock.volume?.replace(/[MBK]/g, '') || 0) > 1000000;
        default:
          return true;
      }
    });
  }, [stocks, filter]);

  // ===== TRADING OPERATIONS =====

  /**
   * Execute a trade (buy/sell)
   */
  const executeTrade = useCallback(async (tradeData) => {
    try {
      const { stock, action, quantity, orderType = 'MARKET' } = tradeData;
      const totalAmount = stock.price * quantity;
      
      // Validate trade
      if (action === 'buy' && totalAmount > portfolio.availableCash) {
        throw new Error('Insufficient funds for this purchase');
      }
      
      const holding = portfolio.holdings.find(h => h.symbol === stock.symbol);
      if (action === 'sell' && (!holding || holding.quantity < quantity)) {
        throw new Error('Insufficient shares to sell');
      }

      // Create transaction record
      const transaction = {
        id: Date.now().toString(),
        symbol: stock.symbol,
        action: action.toUpperCase(),
        quantity,
        price: stock.price,
        totalAmount,
        orderType,
        timestamp: new Date().toISOString(),
        status: 'COMPLETED'
      };

      // Update portfolio
      const updatedPortfolio = { ...portfolio };
      
      if (action === 'buy') {
        updatedPortfolio.availableCash -= totalAmount;
        
        if (holding) {
          // Update existing holding
          const newQuantity = holding.quantity + quantity;
          const newAvgPrice = ((holding.avgPrice * holding.quantity) + totalAmount) / newQuantity;
          holding.quantity = newQuantity;
          holding.avgPrice = newAvgPrice;
        } else {
          // Add new holding
          updatedPortfolio.holdings.push({
            symbol: stock.symbol,
            name: stock.name,
            quantity,
            avgPrice: stock.price,
            currentPrice: stock.price,
            change: stock.change,
            changePercent: stock.changePercent
          });
        }
      } else {
        // Sell operation
        updatedPortfolio.availableCash += totalAmount;
        holding.quantity -= quantity;
        
        // Remove holding if quantity becomes zero
        if (holding.quantity === 0) {
          updatedPortfolio.holdings = updatedPortfolio.holdings.filter(h => h.symbol !== stock.symbol);
        }
      }

      // Add transaction to history
      updatedPortfolio.transactions = [
        transaction,
        ...(updatedPortfolio.transactions || [])
      ].slice(0, 100); // Keep last 100 transactions

      // Recalculate portfolio metrics
      updatedPortfolio.metrics = dataProcessor.calculatePortfolioMetrics(
        updatedPortfolio.holdings, 
        stocks
      );

      // Update state and storage
      setPortfolio(updatedPortfolio);
      storage.set('tradingPortfolio', updatedPortfolio);

      return {
        success: true,
        message: `${action.toUpperCase()} order for ${quantity} shares of ${stock.symbol} executed successfully`,
        transaction
      };

    } catch (error) {
      errorHandler.log(error, 'executing trade');
      return {
        success: false,
        message: error.message || 'Trade execution failed'
      };
    }
  }, [portfolio, stocks]);

  // ===== REAL-TIME UPDATES =====

  /**
   * Setup automatic refresh based on market status
   */
  const setupAutoRefresh = useCallback(() => {
    const status = getMarketStatus();
    setMarketStatus(status);
    
    // Clear existing interval
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    // Set refresh interval based on market status
    let interval = 300000; // 5 minutes default
    
    if (status.status === 'OPEN') {
      interval = 60000; // 1 minute during market hours
    } else if (status.status === 'PRE_MARKET') {
      interval = 180000; // 3 minutes during pre-market
    }

    const newInterval = setInterval(() => {
      if (isOnline && !loading.stocks) {
        loadStocks(STOCK_SYMBOLS.INDIAN.slice(0, 10), true); // Refresh current stocks
      }
    }, interval);

    setRefreshInterval(newInterval);
    
    return () => clearInterval(newInterval);
  }, [loadStocks, isOnline, loading.stocks, refreshInterval]);

  /**
   * Manual refresh function
   */
  const refreshData = useCallback(async () => {
    setError(null);
    await Promise.all([
      loadStocks(STOCK_SYMBOLS.INDIAN.slice(0, 10), true),
      loadPortfolio()
    ]);
  }, [loadStocks, loadPortfolio]);

  // ===== UTILITY FUNCTIONS =====

  /**
   * Get stock by symbol
   */
  const getStockBySymbol = useCallback((symbol) => {
    return stocks.find(stock => stock.symbol === symbol);
  }, [stocks]);

  /**
   * Get news for symbol
   */
  const getNewsForSymbol = useCallback((symbol) => {
    return news.get(symbol) || [];
  }, [news]);

  /**
   * Get chart data for symbol
   */
  const getChartDataForSymbol = useCallback((symbol) => {
    return chartData.get(symbol) || [];
  }, [chartData]);

  /**
   * Get technical analysis for symbol
   */
  const getTechnicalAnalysisForSymbol = useCallback((symbol) => {
    return technicalAnalysis.get(symbol) || null;
  }, [technicalAnalysis]);

  // ===== EFFECTS =====

  /**
   * Initial data loading
   */
  useEffect(() => {
    loadStocks();
    loadPortfolio();
    
    // Setup market status checking
    const statusInterval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000); // Check every minute

    return () => clearInterval(statusInterval);
  }, [loadStocks, loadPortfolio]);

  /**
   * Network status monitoring
   */
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setError(null);
      // Refresh data when coming back online
      if (stocks.length === 0) {
        loadStocks();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setError('You are offline. Data may not be current.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadStocks, stocks.length]);

  /**
   * Auto-refresh setup
   */
  useEffect(() => {
    const cleanup = setupAutoRefresh();
    return cleanup;
  }, [setupAutoRefresh]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [refreshInterval]);

  /**
   * Search effect
   */
  useEffect(() => {
    if (searchQuery) {
      debouncedSearch(searchQuery);
    }
  }, [searchQuery, debouncedSearch]);

  // ===== RETURN HOOK DATA =====

  return {
    // Data
    stocks: filteredStocks(),
    portfolio,
    marketStatus,
    lastUpdate,
    
    // UI State
    loading,
    error,
    searchQuery,
    filter,
    selectedStock,
    isOnline,
    
    // Actions
    setSearchQuery: handleSearch,
    setFilter,
    setSelectedStock,
    setError,
    
    // Operations
    loadStocks,
    loadPortfolio,
    executeTrade,
    refreshData,
    
    // Utilities
    getStockBySymbol,
    getNewsForSymbol,
    getChartDataForSymbol,
    getTechnicalAnalysisForSymbol,
    loadChartData,
    loadNewsData,
    
    // Computed values
    totalStocks: stocks.length,
    filteredStocksCount: filteredStocks().length,
    portfolioValue: portfolio.totalValue,
    portfolioChange: portfolio.todayChange,
    portfolioMetrics: portfolio.metrics,
    
    // Status indicators
    isLoading: Object.values(loading).some(Boolean),
    hasError: !!error,
    isMarketOpen: marketStatus?.status === 'OPEN',
    canTrade: isOnline && !loading.stocks,
    
    // Performance metrics
    lastLoadTime: lastUpdate,
    retryCount: retryCountRef.current
  };
};

export default useAppData;