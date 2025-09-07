import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatPercentage } from '../utils/helpers';

/**
 * Advanced Portfolio Component with Holdings, Performance, and Analytics
 */
const Portfolio = ({ portfolio, stats, onViewDetails }) => {
  // Local state
  const [activeView, setActiveView] = useState('overview'); // overview, holdings, performance, analytics
  const [sortBy, setSortBy] = useState('value'); // value, gainLoss, quantity, symbol
  const [sortOrder, setSortOrder] = useState('desc'); // asc, desc
  const [showAllHoldings, setShowAllHoldings] = useState(false);

  // ===== COMPUTED VALUES =====

  // Portfolio summary data
  const portfolioSummary = useMemo(() => {
    if (!stats) return null;

    const gainLossFormatted = formatPercentage(stats.gainLossPercent);
    const todayChangeFormatted = formatPercentage((stats.todayChange / stats.totalValue) * 100);

    return {
      totalValue: stats.totalValue,
      todayChange: stats.todayChange,
      totalGainLoss: stats.totalGainLoss,
      gainLossPercent: stats.gainLossPercent,
      holdings: stats.holdings,
      availableCash: stats.availableCash,
      diversificationScore: stats.diversificationScore,
      riskLevel: stats.riskLevel,
      gainLossFormatted,
      todayChangeFormatted,
      investedValue: stats.totalValue - stats.totalGainLoss
    };
  }, [stats]);

  // Sorted holdings
  const sortedHoldings = useMemo(() => {
    if (!portfolio.holdings) return [];

    const holdings = [...portfolio.holdings].map(holding => ({
      ...holding,
      currentValue: holding.quantity * holding.currentPrice,
      investedValue: holding.quantity * holding.avgPrice,
      gainLoss: (holding.quantity * holding.currentPrice) - (holding.quantity * holding.avgPrice),
      gainLossPercent: ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100,
      todayChange: holding.quantity * (holding.change || 0)
    }));

    holdings.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'value':
          aValue = a.currentValue;
          bValue = b.currentValue;
          break;
        case 'gainLoss':
          aValue = a.gainLossPercent;
          bValue = b.gainLossPercent;
          break;
        case 'quantity':
          aValue = a.quantity;
          bValue = b.quantity;
          break;
        case 'symbol':
          aValue = a.symbol;
          bValue = b.symbol;
          break;
        default:
          aValue = a.currentValue;
          bValue = b.currentValue;
      }

      if (typeof aValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return holdings;
  }, [portfolio.holdings, sortBy, sortOrder]);

  // Portfolio allocation breakdown
  const allocationData = useMemo(() => {
    if (!portfolio.holdings || portfolio.holdings.length === 0) return [];

    const totalValue = portfolio.holdings.reduce((sum, holding) => 
      sum + (holding.quantity * holding.currentPrice), 0
    );

    return portfolio.holdings.map(holding => {
      const value = holding.quantity * holding.currentPrice;
      const percentage = (value / totalValue) * 100;
      
      return {
        ...holding,
        value,
        percentage,
        color: getColorForStock(holding.symbol)
      };
    }).sort((a, b) => b.percentage - a.percentage);
  }, [portfolio.holdings]);

  // Performance metrics
  const performanceMetrics = useMemo(() => {
    if (!portfolio.metrics?.performance) return null;

    const { performance } = portfolio.metrics;
    return {
      winRate: performance.winRate,
      avgGain: performance.avgGain,
      avgLoss: performance.avgLoss,
      bestPerformer: performance.bestPerformer,
      worstPerformer: performance.worstPerformer,
      totalPositions: performance.totalPositions,
      winners: performance.winners,
      losers: performance.losers
    };
  }, [portfolio.metrics]);

  // Risk metrics
  const riskMetrics = useMemo(() => {
    if (!portfolio.metrics?.riskMetrics) return null;

    return {
      level: portfolio.metrics.riskMetrics.level,
      beta: portfolio.metrics.riskMetrics.beta,
      volatility: portfolio.metrics.riskMetrics.volatility,
      description: portfolio.metrics.riskMetrics.description
    };
  }, [portfolio.metrics]);

  // ===== UTILITY FUNCTIONS =====

  function getColorForStock(symbol) {
    // Generate consistent colors for stocks
    const colors = [
      '#00ff88', '#3742fa', '#ff4757', '#ffa726', '#8c7ae6',
      '#00d4aa', '#2196F3', '#ff6b6b', '#4834d4', '#ff9ff3'
    ];
    const index = symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  }

  function getRiskColor(level) {
    switch (level) {
      case 'LOW': return '#00ff88';
      case 'MODERATE': return '#ffa726';
      case 'HIGH': return '#ff4757';
      default: return '#8892b0';
    }
  }

  // ===== EVENT HANDLERS =====

  const handleSort = (newSortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc');
    }
  };

  // ===== ANIMATION VARIANTS =====

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { type: "spring", stiffness: 100 }
    }
  };

  // ===== RENDER =====

  if (!portfolioSummary) {
    return (
      <div className="portfolio-summary">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading portfolio...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="portfolio-summary"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Portfolio Header */}
      <motion.div className="portfolio-header" variants={itemVariants}>
        <div className="portfolio-title">
          <h2>Portfolio Overview</h2>
          <div className="portfolio-timestamp">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
        <div className="portfolio-actions">
          <motion.button
            className="view-details-btn"
            onClick={onViewDetails}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            📊 View Details
          </motion.button>
        </div>
      </motion.div>

      {/* Main Portfolio Value */}
      <motion.div className="portfolio-main-value" variants={itemVariants}>
        <div className="total-value">
          <span className="value-label">Total Portfolio Value</span>
          <span className="value-amount">{formatCurrency(portfolioSummary.totalValue)}</span>
        </div>
        <div className="value-changes">
          <div className={`today-change ${portfolioSummary.todayChange >= 0 ? 'positive' : 'negative'}`}>
            <span className="change-label">Today</span>
            <span className="change-amount">
              {portfolioSummary.todayChange >= 0 ? '+' : ''}{formatCurrency(portfolioSummary.todayChange)}
            </span>
            <span className="change-percent">
              ({portfolioSummary.todayChangeFormatted.value})
            </span>
          </div>
          <div className={`total-change ${portfolioSummary.totalGainLoss >= 0 ? 'positive' : 'negative'}`}>
            <span className="change-label">Total</span>
            <span className="change-amount">
              {portfolioSummary.totalGainLoss >= 0 ? '+' : ''}{formatCurrency(portfolioSummary.totalGainLoss)}
            </span>
            <span className="change-percent">
              ({portfolioSummary.gainLossFormatted.value})
            </span>
          </div>
        </div>
      </motion.div>

      {/* Portfolio Stats Grid */}
      <motion.div className="portfolio-stats" variants={itemVariants}>
        <div className="stat-item">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <span className="stat-label">Available Cash</span>
            <span className="stat-value">{formatCurrency(portfolioSummary.availableCash)}</span>
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <span className="stat-label">Holdings</span>
            <span className="stat-value">{portfolioSummary.holdings}</span>
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <span className="stat-label">Diversification</span>
            <span className="stat-value">{portfolioSummary.diversificationScore}/100</span>
          </div>
        </div>
        
        <div className="stat-item">
          <div className="stat-icon">⚖️</div>
          <div className="stat-content">
            <span className="stat-label">Risk Level</span>
            <span 
              className="stat-value"
              style={{ color: getRiskColor(portfolioSummary.riskLevel) }}
            >
              {portfolioSummary.riskLevel}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Navigation Tabs */}
      <motion.div className="portfolio-tabs" variants={itemVariants}>
        {['overview', 'holdings', 'performance', 'analytics'].map((tab) => (
          <motion.button
            key={tab}
            className={`tab-btn ${activeView === tab ? 'active' : ''}`}
            onClick={() => setActiveView(tab)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {tab === 'overview' && '📊'}
            {tab === 'holdings' && '💼'}
            {tab === 'performance' && '📈'}
            {tab === 'analytics' && '🔍'}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </motion.button>
        ))}
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeView}
          className="tab-content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {/* Overview Tab */}
          {activeView === 'overview' && (
            <div className="overview-content">
              {/* Allocation Chart */}
              {allocationData.length > 0 && (
                <div className="allocation-section">
                  <h3>Portfolio Allocation</h3>
                  <div className="allocation-chart">
                    <div className="allocation-bars">
                      {allocationData.slice(0, 5).map((item, index) => (
                        <motion.div
                          key={item.symbol}
                          className="allocation-bar"
                          initial={{ width: 0 }}
                          animate={{ width: `${item.percentage}%` }}
                          transition={{ delay: index * 0.1, duration: 0.8 }}
                          style={{ backgroundColor: item.color }}
                        >
                          <span className="allocation-label">
                            {item.symbol} ({item.percentage.toFixed(1)}%)
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Top Holdings */}
              {sortedHoldings.length > 0 && (
                <div className="top-holdings">
                  <h3>Top Holdings</h3>
                  <div className="holdings-preview">
                    {sortedHoldings.slice(0, 3).map((holding, index) => (
                      <motion.div
                        key={holding.symbol}
                        className="holding-preview-item"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <div className="holding-info">
                          <span className="holding-symbol">{holding.symbol}</span>
                          <span className="holding-quantity">{holding.quantity} shares</span>
                        </div>
                        <div className="holding-values">
                          <span className="holding-value">{formatCurrency(holding.currentValue)}</span>
                          <span className={`holding-change ${holding.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                            {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Holdings Tab */}
          {activeView === 'holdings' && (
            <div className="holdings-content">
              <div className="holdings-header">
                <h3>All Holdings ({sortedHoldings.length})</h3>
                <div className="holdings-controls">
                  <select
                    className="sort-select"
                    value={`${sortBy}-${sortOrder}`}
                    onChange={(e) => {
                      const [newSortBy, newSortOrder] = e.target.value.split('-');
                      setSortBy(newSortBy);
                      setSortOrder(newSortOrder);
                    }}
                  >
                    <option value="value-desc">Value (High to Low)</option>
                    <option value="value-asc">Value (Low to High)</option>
                    <option value="gainLoss-desc">Gain/Loss % (High to Low)</option>
                    <option value="gainLoss-asc">Gain/Loss % (Low to High)</option>
                    <option value="symbol-asc">Symbol (A to Z)</option>
                    <option value="symbol-desc">Symbol (Z to A)</option>
                  </select>
                </div>
              </div>

              {sortedHoldings.length === 0 ? (
                <div className="no-holdings">
                  <div className="no-holdings-icon">💼</div>
                  <h4>No Holdings Yet</h4>
                  <p>Start building your portfolio by buying some stocks!</p>
                </div>
              ) : (
                <div className="holdings-table">
                  <div className="holdings-list">
                    {(showAllHoldings ? sortedHoldings : sortedHoldings.slice(0, 5)).map((holding) => (
                      <motion.div
                        key={holding.symbol}
                        className="holding-row"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                      >
                        <div className="holding-main">
                          <div className="holding-stock">
                            <span className="stock-symbol">{holding.symbol}</span>
                            <span className="stock-name">{holding.name}</span>
                          </div>
                          <div className="holding-quantity">
                            {holding.quantity} shares @ {formatCurrency(holding.avgPrice)}
                          </div>
                        </div>
                        
                        <div className="holding-values">
                          <div className="current-value">
                            <span className="value-label">Current Value</span>
                            <span className="value-amount">{formatCurrency(holding.currentValue)}</span>
                          </div>
                          
                          <div className="gain-loss">
                            <span className={`gain-loss-amount ${holding.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                              {holding.gainLoss >= 0 ? '+' : ''}{formatCurrency(holding.gainLoss)}
                            </span>
                            <span className={`gain-loss-percent ${holding.gainLoss >= 0 ? 'positive' : 'negative'}`}>
                              ({holding.gainLossPercent >= 0 ? '+' : ''}{holding.gainLossPercent.toFixed(2)}%)
                            </span>
                          </div>
                          
                          <div className="today-change">
                            <span className="change-label">Today</span>
                            <span className={`change-amount ${holding.todayChange >= 0 ? 'positive' : 'negative'}`}>
                              {holding.todayChange >= 0 ? '+' : ''}{formatCurrency(holding.todayChange)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  
                  {sortedHoldings.length > 5 && (
                    <motion.button
                      className="show-more-btn"
                      onClick={() => setShowAllHoldings(!showAllHoldings)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {showAllHoldings ? 'Show Less' : `Show All ${sortedHoldings.length} Holdings`}
                    </motion.button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Performance Tab */}
          {activeView === 'performance' && performanceMetrics && (
            <div className="performance-content">
              <div className="performance-overview">
                <div className="performance-metric">
                  <div className="metric-icon">🎯</div>
                  <div className="metric-content">
                    <span className="metric-label">Win Rate</span>
                    <span className="metric-value">{performanceMetrics.winRate}%</span>
                    <span className="metric-detail">
                      {performanceMetrics.winners} winners, {performanceMetrics.losers} losers
                    </span>
                  </div>
                </div>

                <div className="performance-metric">
                  <div className="metric-icon">📈</div>
                  <div className="metric-content">
                    <span className="metric-label">Avg Gain</span>
                    <span className="metric-value positive">{formatCurrency(performanceMetrics.avgGain)}</span>
                    <span className="metric-detail">Per winning position</span>
                  </div>
                </div>

                <div className="performance-metric">
                  <div className="metric-icon">📉</div>
                  <div className="metric-content">
                    <span className="metric-label">Avg Loss</span>
                    <span className="metric-value negative">{formatCurrency(performanceMetrics.avgLoss)}</span>
                    <span className="metric-detail">Per losing position</span>
                  </div>
                </div>
              </div>

              {/* Best/Worst Performers */}
              <div className="performers">
                {performanceMetrics.bestPerformer && (
                  <div className="performer best-performer">
                    <h4>🏆 Best Performer</h4>
                    <div className="performer-info">
                      <span className="performer-symbol">{performanceMetrics.bestPerformer.symbol}</span>
                      <span className="performer-return positive">
                        +{performanceMetrics.bestPerformer.gainLossPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}

                {performanceMetrics.worstPerformer && (
                  <div className="performer worst-performer">
                    <h4>📉 Worst Performer</h4>
                    <div className="performer-info">
                      <span className="performer-symbol">{performanceMetrics.worstPerformer.symbol}</span>
                      <span className="performer-return negative">
                        {performanceMetrics.worstPerformer.gainLossPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeView === 'analytics' && (
            <div className="analytics-content">
              {/* Risk Analysis */}
              {riskMetrics && (
                <div className="risk-analysis">
                  <h3>Risk Analysis</h3>
                  <div className="risk-metrics">
                    <div className="risk-level">
                      <span className="risk-label">Overall Risk Level</span>
                      <span 
                        className="risk-value"
                        style={{ color: getRiskColor(riskMetrics.level) }}
                      >
                        {riskMetrics.level}
                      </span>
                    </div>
                    {riskMetrics.beta && (
                      <div className="risk-beta">
                        <span className="risk-label">Portfolio Beta</span>
                        <span className="risk-value">{riskMetrics.beta}</span>
                      </div>
                    )}
                    <div className="risk-description">
                      {riskMetrics.description}
                    </div>
                  </div>
                </div>
              )}

              {/* Diversification Analysis */}
              {portfolio.metrics?.diversification && (
                <div className="diversification-analysis">
                  <h3>Diversification Analysis</h3>
                  <div className="diversification-score">
                    <div className="score-circle">
                      <div 
                        className="score-progress"
                        style={{
                          background: `conic-gradient(${portfolioSummary.diversificationScore >= 70 ? '#00ff88' : portfolioSummary.diversificationScore >= 40 ? '#ffa726' : '#ff4757'} ${portfolioSummary.diversificationScore * 3.6}deg, #334155 0deg)`
                        }}
                      >
                        <div className="score-inner">
                          <span className="score-number">{portfolioSummary.diversificationScore}</span>
                          <span className="score-label">Score</span>
                        </div>
                      </div>
                    </div>
                    <div className="diversification-info">
                      <div className="diversification-level">
                        {portfolio.metrics.diversification.level}
                      </div>
                      <div className="sector-count">
                        {portfolio.metrics.diversification.sectors} sectors
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {portfolio.metrics?.recommendations && portfolio.metrics.recommendations.length > 0 && (
                <div className="portfolio-recommendations">
                  <h3>Recommendations</h3>
                  <div className="recommendations-list">
                    {portfolio.metrics.recommendations.map((rec, index) => (
                      <motion.div
                        key={index}
                        className={`recommendation recommendation-${rec.priority.toLowerCase()}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <div className="recommendation-header">
                          <span className="recommendation-icon">
                            {rec.type === 'DIVERSIFICATION' && '🎯'}
                            {rec.type === 'RISK_MANAGEMENT' && '⚠️'}
                            {rec.type === 'PERFORMANCE' && '📊'}
                            {rec.type === 'REBALANCING' && '⚖️'}
                          </span>
                          <span className="recommendation-title">{rec.title}</span>
                          <span className={`recommendation-priority priority-${rec.priority.toLowerCase()}`}>
                            {rec.priority}
                          </span>
                        </div>
                        <div className="recommendation-description">
                          {rec.description}
                        </div>
                        <div className="recommendation-action">
                          <strong>Action:</strong> {rec.action}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

export default Portfolio;