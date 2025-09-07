import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StockCard from './StockCard';
import Portfolio from './Portfolio';
import TradingPanel from './TradingPanel';
import useAppData from '../hooks/useAppData';
import { formatCurrency, formatPercentage, getMarketStatus } from '../utils/helpers';

/**
 * Main Dashboard Component
 * Orchestrates all trading app functionality with modern UI/UX
 */
const Dashboard = () => {
  // Get all app data from custom hook
  const {
    stocks,
    portfolio,
    marketStatus,
    loading,
    error,
    searchQuery,
    filter,
    selectedStock,
    isOnline,
    setSearchQuery,
    setFilter,
    setSelectedStock,
    setError,
    executeTrade,
    refreshData,
    getNewsForSymbol,
    getChartDataForSymbol,
    getTechnicalAnalysisForSymbol,
    isLoading,
    hasError,
    isMarketOpen,
    canTrade,
    lastLoadTime
  } = useAppData();

  // Local UI state
  const [showTradingPanel, setShowTradingPanel] = useState(false);
  const [tradingData, setTradingData] = useState(null);
  const [notification, setNotification] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid, list, detailed
  const [sortBy, setSortBy] = useState('default'); // default, price, change, volume, name
  const [showFilters, setShowFilters] = useState(false);

  // Filter options
  const filterOptions = [
    { key: 'all', label: 'All Stocks', icon: '📊' },
    { key: 'buy', label: 'Buy Signals', icon: '📈' },
    { key: 'sell', label: 'Sell Signals', icon: '📉' },
    { key: 'hold', label: 'Hold', icon: '⚖️' },
    { key: 'gainers', label: 'Top Gainers', icon: '🚀' },
    { key: 'losers', label: 'Top Losers', icon: '📊' },
    { key: 'active', label: 'Most Active', icon: '🔥' }
  ];

  // Sort options
  const sortOptions = [
    { key: 'default', label: 'Default' },
    { key: 'price', label: 'Price' },
    { key: 'change', label: 'Change %' },
    { key: 'volume', label: 'Volume' },
    { key: 'name', label: 'Name' }
  ];

  // ===== COMPUTED VALUES =====

  // Sorted stocks based on current sort option
  const sortedStocks = useMemo(() => {
    if (sortBy === 'default') return stocks;
    
    return [...stocks].sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return b.price - a.price;
        case 'change':
          return b.changePercent - a.changePercent;
        case 'volume':
          const aVol = parseInt(a.volume?.replace(/[MBK]/g, '') || 0);
          const bVol = parseInt(b.volume?.replace(/[MBK]/g, '') || 0);
          return bVol - aVol;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [stocks, sortBy]);

  // Portfolio summary stats
  const portfolioStats = useMemo(() => {
    if (!portfolio.metrics) return null;
    
    return {
      totalValue: portfolio.totalValue,
      todayChange: portfolio.todayChange,
      totalGainLoss: portfolio.metrics.totalGainLoss,
      gainLossPercent: portfolio.metrics.totalGainLossPercent,
      holdings: portfolio.holdings.length,
      availableCash: portfolio.availableCash,
      diversificationScore: portfolio.metrics.diversification?.score || 0,
      riskLevel: portfolio.metrics.riskMetrics?.level || 'MODERATE'
    };
  }, [portfolio]);

  // Market status info
  const marketInfo = useMemo(() => {
    const status = getMarketStatus();
    return {
      ...status,
      statusColor: status.status === 'OPEN' ? '#00ff88' : 
                   status.status === 'PRE_MARKET' ? '#ffa726' : '#8892b0',
      statusIcon: status.status === 'OPEN' ? '🟢' : 
                  status.status === 'PRE_MARKET' ? '🟡' : '🔴'
    };
  }, []);

  // ===== EVENT HANDLERS =====

  /**
   * Handle trade initiation
   */
  const handleTrade = (stock, action) => {
    if (!canTrade) {
      showNotification('Trading is currently unavailable', 'error');
      return;
    }

    setTradingData({ stock, action });
    setShowTradingPanel(true);
  };

  /**
   * Handle trade execution
   */
  const handleExecuteTrade = async (tradeDetails) => {
    try {
      const result = await executeTrade(tradeDetails);
      
      if (result.success) {
        showNotification(result.message, 'success');
        setShowTradingPanel(false);
        setTradingData(null);
      } else {
        showNotification(result.message, 'error');
      }
    } catch (error) {
      showNotification('Trade execution failed', 'error');
    }
  };

  /**
   * Handle search input
   */
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  /**
   * Handle filter change
   */
  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setShowFilters(false);
  };

  /**
   * Handle stock selection for detailed view
   */
  const handleStockSelect = (stock) => {
    setSelectedStock(selectedStock?.symbol === stock.symbol ? null : stock);
  };

  /**
   * Show notification
   */
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type, id: Date.now() });
    setTimeout(() => setNotification(null), 4000);
  };

  /**
   * Handle refresh
   */
  const handleRefresh = async () => {
    try {
      await refreshData();
      showNotification('Data refreshed successfully', 'success');
    } catch (error) {
      showNotification('Failed to refresh data', 'error');
    }
  };

  // ===== EFFECTS =====

  /**
   * Auto-dismiss errors after 5 seconds
   */
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, setError]);

  // ===== ANIMATION VARIANTS =====

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    }
  };

  // ===== RENDER =====

  return (
    <motion.div
      className="dashboard"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <motion.header className="header" variants={itemVariants}>
        <div className="header-content">
          {/* Logo */}
          <motion.div 
            className="logo"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            TradePro
          </motion.div>

          {/* Search Bar */}
          <div className="search-container">
            <div className="search-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="Search stocks (e.g., RELIANCE, TCS)..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
              <motion.button
                className="search-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                🔍
              </motion.button>
            </div>
          </div>

          {/* Header Actions */}
          <div className="header-actions">
            {/* Market Status */}
            <motion.div 
              className="market-status"
              whileHover={{ scale: 1.05 }}
            >
              <span className="status-icon">{marketInfo.statusIcon}</span>
              <div className="status-info">
                <div className="status-text">{marketInfo.status.replace('_', ' ')}</div>
                <div className="status-time">{marketInfo.message}</div>
              </div>
            </motion.div>

            {/* Refresh Button */}
            <motion.button
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={isLoading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.span
                animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
                transition={{ duration: 1, repeat: isLoading ? Infinity : 0 }}
              >
                🔄
              </motion.span>
            </motion.button>

            {/* Connection Status */}
            <div className={`connection-status ${isOnline ? 'online' : 'offline'}`}>
              <span className="status-dot"></span>
              {isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <div className="container">
        {/* Portfolio Summary */}
        <motion.div variants={itemVariants}>
          <Portfolio 
            portfolio={portfolio}
            stats={portfolioStats}
            onViewDetails={() => {}} // TODO: Implement portfolio details modal
          />
        </motion.div>

        {/* Filters and Controls */}
        <motion.div className="controls-section" variants={itemVariants}>
          <div className="filter-panel">
            <div className="filter-header">
              <h3 className="filter-title">Market Overview</h3>
              <div className="filter-controls">
                {/* View Mode Toggle */}
                <div className="view-mode-toggle">
                  {['grid', 'list'].map((mode) => (
                    <motion.button
                      key={mode}
                      className={`view-btn ${viewMode === mode ? 'active' : ''}`}
                      onClick={() => setViewMode(mode)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {mode === 'grid' ? '⊞' : '☰'}
                    </motion.button>
                  ))}
                </div>

                {/* Sort Dropdown */}
                <select
                  className="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  {sortOptions.map(option => (
                    <option key={option.key} value={option.key}>
                      Sort: {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter Buttons */}
            <div className="filter-buttons">
              {filterOptions.map((option) => (
                <motion.button
                  key={option.key}
                  className={`filter-btn ${filter === option.key ? 'active' : ''}`}
                  onClick={() => handleFilterChange(option.key)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="filter-icon">{option.icon}</span>
                  {option.label}
                </motion.button>
              ))}
            </div>

            {/* Active Filters Display */}
            {(filter !== 'all' || searchQuery) && (
              <div className="active-filters">
                <span className="filters-label">Active filters:</span>
                {filter !== 'all' && (
                  <span className="filter-tag">
                    {filterOptions.find(f => f.key === filter)?.label}
                    <button onClick={() => setFilter('all')}>×</button>
                  </span>
                )}
                {searchQuery && (
                  <span className="filter-tag">
                    Search: "{searchQuery}"
                    <button onClick={() => setSearchQuery('')}>×</button>
                  </span>
                )}
              </div>
            )}
          </div>
        </motion.div>

        {/* Error Display */}
        <AnimatePresence>
          {hasError && (
            <motion.div
              className="error-message"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <span className="error-icon">⚠️</span>
              {error}
              <button 
                className="error-close"
                onClick={() => setError(null)}
              >
                ×
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stocks Grid/List */}
        <motion.div variants={itemVariants}>
          {loading.stocks && stocks.length === 0 ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading market data...</p>
            </div>
          ) : (
            <>
              {/* Results Count */}
              <div className="results-info">
                <span className="results-count">
                  {sortedStocks.length} stock{sortedStocks.length !== 1 ? 's' : ''} found
                </span>
                {lastLoadTime && (
                  <span className="last-update">
                    Last updated: {lastLoadTime.toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Stocks Display */}
              {sortedStocks.length === 0 ? (
                <div className="no-results">
                  <div className="no-results-icon">📊</div>
                  <h3>No stocks found</h3>
                  <p>
                    {searchQuery 
                      ? `No results for "${searchQuery}". Try a different search term.`
                      : 'No stocks match your current filters. Try adjusting your criteria.'
                    }
                  </p>
                  {(searchQuery || filter !== 'all') && (
                    <motion.button
                      className="clear-filters-btn"
                      onClick={() => {
                        setSearchQuery('');
                        setFilter('all');
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Clear All Filters
                    </motion.button>
                  )}
                </div>
              ) : (
                <motion.div 
                  className={`stock-grid ${viewMode}`}
                  layout
                >
                  <AnimatePresence>
                    {sortedStocks.map((stock) => (
                      <StockCard
                        key={stock.symbol}
                        stock={stock}
                        isSelected={selectedStock?.symbol === stock.symbol}
                        onTrade={handleTrade}
                        onSelect={() => handleStockSelect(stock)}
                        newsData={getNewsForSymbol(stock.symbol)}
                        chartData={getChartDataForSymbol(stock.symbol)}
                        technicalAnalysis={getTechnicalAnalysisForSymbol(stock.symbol)}
                        viewMode={viewMode}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Trading Panel */}
      <AnimatePresence>
        {showTradingPanel && tradingData && (
          <TradingPanel
            isOpen={showTradingPanel}
            tradingData={tradingData}
            portfolio={portfolio}
            onClose={() => {
              setShowTradingPanel(false);
              setTradingData(null);
            }}
            onExecute={handleExecuteTrade}
          />
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            className={`notification ${notification.type}`}
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: "spring", stiffness: 100 }}
          >
            <span className="notification-icon">
              {notification.type === 'success' ? '✅' : 
               notification.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="notification-message">{notification.message}</span>
            <button
              className="notification-close"
              onClick={() => setNotification(null)}
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Elements */}
      <div className="dashboard-bg">
        <div className="bg-gradient"></div>
        <div className="bg-pattern"></div>
      </div>
    </motion.div>
  );
};

export default Dashboard;