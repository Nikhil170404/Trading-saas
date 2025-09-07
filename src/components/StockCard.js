import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatCurrency, formatPercentage, formatTimeAgo } from '../utils/helpers';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

/**
 * Advanced Stock Card Component with Mini Chart, News, and Technical Analysis
 */
const StockCard = ({
  stock,
  isSelected = false,
  onTrade,
  onSelect,
  newsData = [],
  chartData = [],
  technicalAnalysis = null,
  viewMode = 'grid'
}) => {
  // Local state for UI interactions
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('chart'); // chart, news, analysis
  const [isLoading, setIsLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  // ===== COMPUTED VALUES =====

  // Format price change
  const priceChange = useMemo(() => {
    return formatPercentage(stock.changePercent);
  }, [stock.changePercent]);

  // Chart configuration
  const chartConfig = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return null;
    }

    const isPositive = stock.change >= 0;
    const baseColor = isPositive ? '#00ff88' : '#ff4757';
    
    return {
      data: {
        labels: chartData.map(item => item.time),
        datasets: [{
          label: stock.symbol,
          data: chartData.map(item => item.close || item.price),
          borderColor: baseColor,
          backgroundColor: `${baseColor}15`,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: baseColor,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#242936',
            titleColor: '#ffffff',
            bodyColor: '#8892b0',
            borderColor: '#334155',
            borderWidth: 1,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: (context) => `Price: ${formatCurrency(context.parsed.y)}`,
              title: (tooltipItems) => `Time: ${tooltipItems[0].label}`
            }
          }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        elements: {
          point: { radius: 0 }
        },
        animation: {
          duration: 750,
          easing: 'easeInOutQuart'
        }
      }
    };
  }, [chartData, stock.symbol, stock.change]);

  // Technical analysis summary
  const technicalSummary = useMemo(() => {
    if (!technicalAnalysis) return null;

    const { technicalScore, recommendation, signals, rsi, trend } = technicalAnalysis;
    
    return {
      score: technicalScore,
      recommendation: recommendation?.recommendation || 'HOLD',
      confidence: recommendation?.confidence || 'MEDIUM',
      signals: signals?.slice(0, 2) || [],
      rsi: rsi,
      trend: trend,
      scoreColor: technicalScore >= 70 ? '#00ff88' : 
                  technicalScore >= 40 ? '#ffa726' : '#ff4757',
      scoreLabel: technicalScore >= 70 ? 'Bullish' : 
                  technicalScore >= 40 ? 'Neutral' : 'Bearish'
    };
  }, [technicalAnalysis]);

  // Recommendation styling
  const recommendationStyle = useMemo(() => {
    const rec = stock.recommendation || 'HOLD';
    
    const styles = {
      'STRONG_BUY': { color: '#00ff88', bg: 'rgba(0, 255, 136, 0.15)', border: 'rgba(0, 255, 136, 0.3)' },
      'BUY': { color: '#00ff88', bg: 'rgba(0, 255, 136, 0.15)', border: 'rgba(0, 255, 136, 0.3)' },
      'HOLD': { color: '#3742fa', bg: 'rgba(55, 66, 250, 0.15)', border: 'rgba(55, 66, 250, 0.3)' },
      'SELL': { color: '#ff4757', bg: 'rgba(255, 71, 87, 0.15)', border: 'rgba(255, 71, 87, 0.3)' },
      'STRONG_SELL': { color: '#ff4757', bg: 'rgba(255, 71, 87, 0.15)', border: 'rgba(255, 71, 87, 0.3)' }
    };
    
    return styles[rec] || styles.HOLD;
  }, [stock.recommendation]);

  // Latest news
  const latestNews = useMemo(() => {
    return newsData.slice(0, 3);
  }, [newsData]);

  // ===== EVENT HANDLERS =====

  const handleTradeClick = (action) => {
    setIsLoading(true);
    onTrade(stock, action);
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleCardClick = () => {
    onSelect();
    setShowDetails(!showDetails);
  };

  // ===== EFFECTS =====

  useEffect(() => {
    if (isSelected) {
      setShowDetails(true);
    }
  }, [isSelected]);

  // ===== ANIMATION VARIANTS =====

  const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { 
        type: "spring", 
        stiffness: 100, 
        damping: 15 
      }
    },
    exit: { 
      opacity: 0, 
      y: -20, 
      scale: 0.95,
      transition: { duration: 0.2 }
    }
  };

  const detailsVariants = {
    hidden: { height: 0, opacity: 0 },
    visible: { 
      height: 'auto', 
      opacity: 1,
      transition: { 
        height: { duration: 0.3 },
        opacity: { duration: 0.2, delay: 0.1 }
      }
    },
    exit: { 
      height: 0, 
      opacity: 0,
      transition: { 
        opacity: { duration: 0.1 },
        height: { duration: 0.2, delay: 0.1 }
      }
    }
  };

  // ===== RENDER =====

  return (
    <motion.div
      className={`stock-card ${isSelected ? 'selected' : ''} ${viewMode}`}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      whileHover={{ 
        y: -4,
        transition: { type: "spring", stiffness: 300 }
      }}
    >
      {/* Main Card Content */}
      <div className="stock-card-main" onClick={handleCardClick}>
        {/* Header */}
        <div className="stock-header">
          <div className="stock-info">
            <div className="stock-symbol-row">
              <h3 className="stock-symbol">{stock.symbol}</h3>
              {technicalSummary && (
                <div 
                  className="technical-score-badge"
                  style={{ backgroundColor: technicalSummary.scoreColor + '20', color: technicalSummary.scoreColor }}
                >
                  {technicalSummary.score}
                </div>
              )}
            </div>
            <p className="stock-name">{stock.name}</p>
          </div>
          
          <div className="stock-price-section">
            <div className={`stock-price ${stock.change >= 0 ? 'price-positive' : 'price-negative'}`}>
              {formatCurrency(stock.price)}
            </div>
            <div className={`stock-change ${priceChange.className}`}>
              {priceChange.value}
            </div>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="chart-container">
          {chartConfig ? (
            <motion.div 
              className="chart-wrapper"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Line data={chartConfig.data} options={chartConfig.options} />
            </motion.div>
          ) : (
            <div className="chart-placeholder">
              <div className="chart-skeleton">
                <div className="skeleton-line"></div>
                <div className="skeleton-line"></div>
                <div className="skeleton-line"></div>
              </div>
            </div>
          )}
        </div>

        {/* Stock Metadata */}
        <div className="stock-metadata">
          <div className="metadata-item">
            <span className="metadata-label">Volume</span>
            <span className="metadata-value">{stock.volume}</span>
          </div>
          <div className="metadata-item">
            <span className="metadata-label">H/L</span>
            <span className="metadata-value">
              {formatCurrency(stock.high)}/{formatCurrency(stock.low)}
            </span>
          </div>
          <div 
            className="stock-recommendation"
            style={{
              backgroundColor: recommendationStyle.bg,
              color: recommendationStyle.color,
              borderColor: recommendationStyle.border
            }}
          >
            {stock.recommendation?.replace('_', ' ') || 'HOLD'}
          </div>
        </div>

        {/* Trading Buttons */}
        <div className="trading-buttons">
          <motion.button
            className="trade-btn buy-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleTradeClick('buy');
            }}
            disabled={isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLoading ? (
              <motion.div
                className="loading-spinner"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                ⟳
              </motion.div>
            ) : (
              <>
                <span>📈</span>
                Buy
              </>
            )}
          </motion.button>
          
          <motion.button
            className="trade-btn sell-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleTradeClick('sell');
            }}
            disabled={isLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isLoading ? (
              <motion.div
                className="loading-spinner"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                ⟳
              </motion.div>
            ) : (
              <>
                <span>📉</span>
                Sell
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* Expandable Details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            className="stock-details"
            variants={detailsVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Tabs */}
            <div className="details-tabs">
              {['chart', 'news', 'analysis'].map((tab) => (
                <motion.button
                  key={tab}
                  className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {tab === 'chart' && '📊'}
                  {tab === 'news' && '📰'}
                  {tab === 'analysis' && '🔍'}
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </motion.button>
              ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                className="tab-content"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {/* Chart Tab */}
                {activeTab === 'chart' && (
                  <div className="chart-details">
                    <h4>Price Chart</h4>
                    <div className="detailed-chart">
                      {chartConfig ? (
                        <Line 
                          data={chartConfig.data} 
                          options={{
                            ...chartConfig.options,
                            scales: {
                              x: { 
                                display: true,
                                grid: { color: '#334155' },
                                ticks: { color: '#8892b0' }
                              },
                              y: { 
                                display: true,
                                grid: { color: '#334155' },
                                ticks: { color: '#8892b0' }
                              }
                            }
                          }} 
                        />
                      ) : (
                        <div className="no-chart">No chart data available</div>
                      )}
                    </div>
                    <div className="chart-stats">
                      <div className="stat">
                        <span>Open</span>
                        <span>{formatCurrency(stock.open || stock.price)}</span>
                      </div>
                      <div className="stat">
                        <span>Previous Close</span>
                        <span>{formatCurrency(stock.previousClose || stock.price - stock.change)}</span>
                      </div>
                      <div className="stat">
                        <span>Day Range</span>
                        <span>{formatCurrency(stock.low)} - {formatCurrency(stock.high)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* News Tab */}
                {activeTab === 'news' && (
                  <div className="news-details">
                    <h4>Latest News</h4>
                    {latestNews.length > 0 ? (
                      <div className="news-list">
                        {latestNews.map((newsItem, index) => (
                          <motion.div
                            key={index}
                            className="news-item"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                          >
                            <div className="news-content">
                              <h5 className="news-title">{newsItem.title}</h5>
                              <div className="news-meta">
                                <span className="news-source">{newsItem.source}</span>
                                <span className="news-time">{newsItem.time}</span>
                                <span className={`news-sentiment sentiment-${newsItem.sentiment}`}>
                                  {newsItem.sentiment === 'positive' && '📈'}
                                  {newsItem.sentiment === 'negative' && '📉'}
                                  {newsItem.sentiment === 'neutral' && '📊'}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-news">
                        <div className="no-news-icon">📰</div>
                        <p>No recent news available</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Analysis Tab */}
                {activeTab === 'analysis' && (
                  <div className="analysis-details">
                    <h4>Technical Analysis</h4>
                    {technicalSummary ? (
                      <div className="analysis-content">
                        {/* Overall Score */}
                        <div className="analysis-score">
                          <div className="score-circle">
                            <div 
                              className="score-progress"
                              style={{
                                background: `conic-gradient(${technicalSummary.scoreColor} ${technicalSummary.score * 3.6}deg, #334155 0deg)`
                              }}
                            >
                              <div className="score-inner">
                                <span className="score-number">{technicalSummary.score}</span>
                                <span className="score-label">{technicalSummary.scoreLabel}</span>
                              </div>
                            </div>
                          </div>
                          <div className="score-info">
                            <div className="recommendation-badge" style={{ color: technicalSummary.scoreColor }}>
                              {technicalSummary.recommendation}
                            </div>
                            <div className="confidence">
                              Confidence: {technicalSummary.confidence}
                            </div>
                          </div>
                        </div>

                        {/* Key Indicators */}
                        <div className="key-indicators">
                          {technicalSummary.rsi && (
                            <div className="indicator">
                              <span>RSI</span>
                              <span className={`indicator-value ${
                                technicalSummary.rsi < 30 ? 'oversold' : 
                                technicalSummary.rsi > 70 ? 'overbought' : 'neutral'
                              }`}>
                                {Math.round(technicalSummary.rsi)}
                              </span>
                            </div>
                          )}
                          <div className="indicator">
                            <span>Trend</span>
                            <span className={`indicator-value trend-${technicalSummary.trend.toLowerCase()}`}>
                              {technicalSummary.trend}
                            </span>
                          </div>
                        </div>

                        {/* Trading Signals */}
                        {technicalSummary.signals.length > 0 && (
                          <div className="trading-signals">
                            <h5>Trading Signals</h5>
                            {technicalSummary.signals.map((signal, index) => (
                              <div key={index} className={`signal signal-${signal.type.toLowerCase()}`}>
                                <span className="signal-type">{signal.type}</span>
                                <span className="signal-reason">{signal.reason}</span>
                                <span className="signal-confidence">{Math.round(signal.confidence * 100)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="no-analysis">
                        <div className="no-analysis-icon">🔍</div>
                        <p>Technical analysis not available</p>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hover Effects */}
      <div className="card-glow"></div>
    </motion.div>
  );
};

export default StockCard;