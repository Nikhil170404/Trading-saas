import {
  calculateTechnicalIndicators,
  generateRecommendation,
  formatCurrency,
  formatPercentage,
  storage,
  errorHandler
} from '../utils/helpers';

/**
 * Advanced Data Processing Service for Trading App
 * Handles technical analysis, pattern recognition, portfolio calculations, and AI insights
 */
class DataProcessor {
  constructor() {
    this.technicalCache = new Map();
    this.portfolioCache = new Map();
    this.patternCache = new Map();
  }

  // ===== TECHNICAL ANALYSIS =====

  /**
   * Comprehensive technical analysis for a stock
   * @param {Object} stockData - Stock data with price history
   * @param {Array} priceHistory - Array of historical prices
   * @returns {Object} Technical analysis results
   */
  performTechnicalAnalysis(stockData, priceHistory = []) {
    const cacheKey = `tech_${stockData.symbol}`;
    const cached = this.technicalCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes cache
      return cached.data;
    }

    try {
      // Generate price history if not provided
      if (!priceHistory || priceHistory.length < 20) {
        priceHistory = this.generatePriceHistory(stockData.price, stockData.changePercent);
      }

      // Calculate basic technical indicators
      const indicators = calculateTechnicalIndicators(priceHistory);
      
      // Advanced technical analysis
      const analysis = {
        // Basic indicators
        ...indicators,
        
        // Support and resistance levels
        supportResistance: this.calculateSupportResistance(priceHistory),
        
        // Volume analysis
        volumeAnalysis: this.analyzeVolume(stockData),
        
        // Momentum indicators
        momentum: this.calculateMomentum(priceHistory),
        
        // Pattern recognition
        patterns: this.detectPatterns(priceHistory),
        
        // Volatility analysis
        volatility: this.calculateVolatility(priceHistory),
        
        // Trading signals
        signals: this.generateTradingSignals(indicators, stockData),
        
        // Price targets
        priceTargets: this.calculatePriceTargets(stockData, indicators),
        
        // Risk assessment
        riskMetrics: this.calculateRiskMetrics(stockData, priceHistory),
        
        // Overall score
        technicalScore: 0
      };

      // Calculate overall technical score
      analysis.technicalScore = this.calculateTechnicalScore(analysis);
      
      // Generate comprehensive recommendation
      analysis.recommendation = generateRecommendation(
        indicators, 
        stockData.price, 
        stockData.changePercent
      );

      // Cache the results
      this.technicalCache.set(cacheKey, {
        data: analysis,
        timestamp: Date.now()
      });

      return analysis;

    } catch (error) {
      errorHandler.log(error, 'technical analysis');
      return this.getDefaultTechnicalAnalysis();
    }
  }

  /**
   * Calculate support and resistance levels
   */
  calculateSupportResistance(prices) {
    if (prices.length < 10) return { support: null, resistance: null };

    const sortedPrices = [...prices].sort((a, b) => a - b);
    const priceRanges = this.groupPricesByProximity(sortedPrices);
    
    const support = priceRanges.length > 0 ? priceRanges[0].avg : Math.min(...prices);
    const resistance = priceRanges.length > 1 ? priceRanges[priceRanges.length - 1].avg : Math.max(...prices);

    return {
      support: Math.round(support * 100) / 100,
      resistance: Math.round(resistance * 100) / 100,
      strength: this.calculateLevelStrength(prices, support, resistance)
    };
  }

  /**
   * Group prices by proximity to find significant levels
   */
  groupPricesByProximity(sortedPrices, tolerance = 0.02) {
    const groups = [];
    let currentGroup = [sortedPrices[0]];

    for (let i = 1; i < sortedPrices.length; i++) {
      const price = sortedPrices[i];
      const groupAvg = currentGroup.reduce((sum, p) => sum + p, 0) / currentGroup.length;
      
      if (Math.abs(price - groupAvg) / groupAvg <= tolerance) {
        currentGroup.push(price);
      } else {
        if (currentGroup.length >= 3) { // Significant level needs at least 3 touches
          groups.push({
            avg: groupAvg,
            count: currentGroup.length,
            prices: [...currentGroup]
          });
        }
        currentGroup = [price];
      }
    }

    // Add the last group if significant
    if (currentGroup.length >= 3) {
      const groupAvg = currentGroup.reduce((sum, p) => sum + p, 0) / currentGroup.length;
      groups.push({
        avg: groupAvg,
        count: currentGroup.length,
        prices: [...currentGroup]
      });
    }

    return groups.sort((a, b) => a.avg - b.avg);
  }

  /**
   * Calculate strength of support/resistance levels
   */
  calculateLevelStrength(prices, support, resistance) {
    const supportTouches = prices.filter(price => Math.abs(price - support) / support <= 0.01).length;
    const resistanceTouches = prices.filter(price => Math.abs(price - resistance) / resistance <= 0.01).length;

    return {
      support: Math.min(supportTouches / 2, 5), // Scale 0-5
      resistance: Math.min(resistanceTouches / 2, 5)
    };
  }

  /**
   * Analyze volume patterns
   */
  analyzeVolume(stockData) {
    // For now, use basic volume analysis since we don't have historical volume data
    const volumeNum = parseInt(stockData.volume?.replace(/[MBK]/g, '')) || 0;
    
    return {
      current: stockData.volume,
      trend: volumeNum > 1000000 ? 'HIGH' : volumeNum > 500000 ? 'NORMAL' : 'LOW',
      analysis: this.getVolumeAnalysis(volumeNum, stockData.changePercent),
      score: this.calculateVolumeScore(volumeNum, stockData.changePercent)
    };
  }

  /**
   * Get volume analysis description
   */
  getVolumeAnalysis(volume, changePercent) {
    if (volume > 2000000 && changePercent > 2) {
      return 'High volume with positive price movement indicates strong buying interest';
    } else if (volume > 2000000 && changePercent < -2) {
      return 'High volume with negative price movement indicates strong selling pressure';
    } else if (volume < 500000) {
      return 'Low volume suggests limited interest and potential for low liquidity';
    } else {
      return 'Normal volume levels indicate steady trading activity';
    }
  }

  /**
   * Calculate volume score (0-10)
   */
  calculateVolumeScore(volume, changePercent) {
    let score = 5; // Neutral base

    if (volume > 2000000) score += 2;
    else if (volume > 1000000) score += 1;
    else if (volume < 500000) score -= 1;

    if (changePercent > 0 && volume > 1000000) score += 1;
    else if (changePercent < 0 && volume > 1000000) score -= 1;

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Calculate momentum indicators
   */
  calculateMomentum(prices) {
    if (prices.length < 10) return { strength: 'WEAK', direction: 'NEUTRAL', score: 0 };

    const recentPrices = prices.slice(-10);
    const earlierPrices = prices.slice(-20, -10);
    
    const recentAvg = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    const earlierAvg = earlierPrices.reduce((sum, price) => sum + price, 0) / earlierPrices.length;
    
    const momentumPercent = ((recentAvg - earlierAvg) / earlierAvg) * 100;
    
    let strength, direction;
    
    if (Math.abs(momentumPercent) > 3) strength = 'STRONG';
    else if (Math.abs(momentumPercent) > 1) strength = 'MODERATE';
    else strength = 'WEAK';
    
    if (momentumPercent > 0.5) direction = 'BULLISH';
    else if (momentumPercent < -0.5) direction = 'BEARISH';
    else direction = 'NEUTRAL';

    return {
      strength,
      direction,
      percent: Math.round(momentumPercent * 100) / 100,
      score: this.calculateMomentumScore(momentumPercent)
    };
  }

  /**
   * Calculate momentum score (0-10)
   */
  calculateMomentumScore(momentumPercent) {
    const absPercent = Math.abs(momentumPercent);
    let score = 5; // Neutral

    if (momentumPercent > 0) {
      score += Math.min(absPercent * 0.5, 3); // Max +3 for positive momentum
    } else {
      score -= Math.min(absPercent * 0.5, 3); // Max -3 for negative momentum
    }

    return Math.max(0, Math.min(10, Math.round(score)));
  }

  /**
   * Detect chart patterns
   */
  detectPatterns(prices) {
    if (prices.length < 20) return [];

    const patterns = [];
    
    // Moving Average Patterns
    const sma20 = this.calculateSimpleMovingAverage(prices, 20);
    const sma50 = this.calculateSimpleMovingAverage(prices, 50);
    
    if (sma20 && sma50 && sma20.length > 0 && sma50.length > 0) {
      const currentSMA20 = sma20[sma20.length - 1];
      const currentSMA50 = sma50[sma50.length - 1];
      const prevSMA20 = sma20[sma20.length - 2];
      const prevSMA50 = sma50[sma50.length - 2];
      
      // Golden Cross
      if (currentSMA20 > currentSMA50 && prevSMA20 <= prevSMA50) {
        patterns.push({
          name: 'Golden Cross',
          type: 'BULLISH',
          confidence: 0.8,
          description: 'SMA20 crossed above SMA50 - Strong bullish signal'
        });
      }
      
      // Death Cross
      if (currentSMA20 < currentSMA50 && prevSMA20 >= prevSMA50) {
        patterns.push({
          name: 'Death Cross',
          type: 'BEARISH',
          confidence: 0.8,
          description: 'SMA20 crossed below SMA50 - Strong bearish signal'
        });
      }
    }

    // Trend Patterns
    const trendPattern = this.detectTrendPattern(prices);
    if (trendPattern) {
      patterns.push(trendPattern);
    }

    // Reversal Patterns
    const reversalPattern = this.detectReversalPattern(prices);
    if (reversalPattern) {
      patterns.push(reversalPattern);
    }

    // Breakout Patterns
    const breakoutPattern = this.detectBreakoutPattern(prices);
    if (breakoutPattern) {
      patterns.push(breakoutPattern);
    }

    return patterns;
  }

  /**
   * Detect trend patterns
   */
  detectTrendPattern(prices) {
    const recent = prices.slice(-10);
    const slope = this.calculateSlope(recent);
    
    if (slope > 0.02) {
      return {
        name: 'Uptrend',
        type: 'BULLISH',
        confidence: Math.min(slope * 10, 0.9),
        description: 'Consistent upward price movement'
      };
    } else if (slope < -0.02) {
      return {
        name: 'Downtrend',
        type: 'BEARISH',
        confidence: Math.min(Math.abs(slope) * 10, 0.9),
        description: 'Consistent downward price movement'
      };
    }
    
    return null;
  }

  /**
   * Detect reversal patterns
   */
  detectReversalPattern(prices) {
    if (prices.length < 15) return null;
    
    const recent = prices.slice(-5);
    const earlier = prices.slice(-15, -10);
    
    const recentAvg = recent.reduce((sum, price) => sum + price, 0) / recent.length;
    const earlierAvg = earlier.reduce((sum, price) => sum + price, 0) / earlier.length;
    
    const changePercent = ((recentAvg - earlierAvg) / earlierAvg) * 100;
    
    if (changePercent > 5) {
      return {
        name: 'Bullish Reversal',
        type: 'BULLISH',
        confidence: 0.7,
        description: 'Recent price action suggests upward reversal'
      };
    } else if (changePercent < -5) {
      return {
        name: 'Bearish Reversal',
        type: 'BEARISH',
        confidence: 0.7,
        description: 'Recent price action suggests downward reversal'
      };
    }
    
    return null;
  }

  /**
   * Detect breakout patterns
   */
  detectBreakoutPattern(prices) {
    if (prices.length < 20) return null;
    
    const recent = prices.slice(-20);
    const max = Math.max(...recent.slice(0, -5));
    const min = Math.min(...recent.slice(0, -5));
    const current = recent[recent.length - 1];
    const range = max - min;
    
    if (current > max + (range * 0.05)) {
      return {
        name: 'Bullish Breakout',
        type: 'BULLISH',
        confidence: 0.75,
        description: 'Price broke above resistance level'
      };
    } else if (current < min - (range * 0.05)) {
      return {
        name: 'Bearish Breakdown',
        type: 'BEARISH',
        confidence: 0.75,
        description: 'Price broke below support level'
      };
    }
    
    return null;
  }

  /**
   * Calculate volatility
   */
  calculateVolatility(prices) {
    if (prices.length < 10) return { level: 'UNKNOWN', percentage: 0, description: 'Insufficient data' };

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252); // Annualized volatility

    const volatilityPercent = volatility * 100;
    
    let level, description;
    
    if (volatilityPercent > 40) {
      level = 'VERY_HIGH';
      description = 'Extremely volatile - high risk, high potential reward';
    } else if (volatilityPercent > 25) {
      level = 'HIGH';
      description = 'High volatility - significant price swings expected';
    } else if (volatilityPercent > 15) {
      level = 'MODERATE';
      description = 'Moderate volatility - normal price fluctuations';
    } else {
      level = 'LOW';
      description = 'Low volatility - stable price movement';
    }

    return {
      level,
      percentage: Math.round(volatilityPercent * 100) / 100,
      description,
      score: this.calculateVolatilityScore(volatilityPercent)
    };
  }

  /**
   * Calculate volatility score (0-10, where 5 is optimal)
   */
  calculateVolatilityScore(volatilityPercent) {
    // Optimal volatility is around 15-25%
    if (volatilityPercent >= 15 && volatilityPercent <= 25) {
      return 8; // Good volatility
    } else if (volatilityPercent >= 10 && volatilityPercent <= 35) {
      return 6; // Acceptable volatility
    } else if (volatilityPercent < 10) {
      return 4; // Too low volatility
    } else {
      return Math.max(1, 8 - Math.floor((volatilityPercent - 25) / 5)); // Decreasing score for high volatility
    }
  }

  /**
   * Generate trading signals
   */
  generateTradingSignals(indicators, stockData) {
    const signals = [];
    
    // RSI Signals
    if (indicators.rsi) {
      if (indicators.rsi < 30) {
        signals.push({
          type: 'BUY',
          strength: 'STRONG',
          reason: 'RSI indicates oversold condition',
          confidence: 0.8
        });
      } else if (indicators.rsi > 70) {
        signals.push({
          type: 'SELL',
          strength: 'STRONG',
          reason: 'RSI indicates overbought condition',
          confidence: 0.8
        });
      }
    }

    // Moving Average Signals
    if (indicators.sma20 && indicators.sma50) {
      if (indicators.sma20 > indicators.sma50 && stockData.price > indicators.sma20) {
        signals.push({
          type: 'BUY',
          strength: 'MODERATE',
          reason: 'Price above rising moving averages',
          confidence: 0.7
        });
      } else if (indicators.sma20 < indicators.sma50 && stockData.price < indicators.sma20) {
        signals.push({
          type: 'SELL',
          strength: 'MODERATE',
          reason: 'Price below falling moving averages',
          confidence: 0.7
        });
      }
    }

    // Momentum Signals
    if (stockData.changePercent > 3) {
      signals.push({
        type: 'BUY',
        strength: 'MODERATE',
        reason: 'Strong positive momentum',
        confidence: 0.6
      });
    } else if (stockData.changePercent < -3) {
      signals.push({
        type: 'SELL',
        strength: 'MODERATE',
        reason: 'Strong negative momentum',
        confidence: 0.6
      });
    }

    return signals.slice(0, 3); // Limit to top 3 signals
  }

  /**
   * Calculate price targets
   */
  calculatePriceTargets(stockData, indicators) {
    const currentPrice = stockData.price;
    const volatility = stockData.changePercent ? Math.abs(stockData.changePercent) : 2;
    
    // Simple price targets based on volatility and technical levels
    const shortTermRange = currentPrice * (volatility / 100) * 2;
    const mediumTermRange = currentPrice * (volatility / 100) * 4;
    const longTermRange = currentPrice * (volatility / 100) * 8;

    return {
      shortTerm: {
        upside: Math.round((currentPrice + shortTermRange) * 100) / 100,
        downside: Math.round((currentPrice - shortTermRange) * 100) / 100,
        timeframe: '1-2 weeks'
      },
      mediumTerm: {
        upside: Math.round((currentPrice + mediumTermRange) * 100) / 100,
        downside: Math.round((currentPrice - mediumTermRange) * 100) / 100,
        timeframe: '1-3 months'
      },
      longTerm: {
        upside: Math.round((currentPrice + longTermRange) * 100) / 100,
        downside: Math.round((currentPrice - longTermRange) * 100) / 100,
        timeframe: '6-12 months'
      }
    };
  }

  /**
   * Calculate risk metrics
   */
  calculateRiskMetrics(stockData, priceHistory) {
    const volatility = this.calculateVolatility(priceHistory);
    const beta = this.estimateBeta(stockData);
    
    return {
      volatility: volatility.level,
      beta: beta.value,
      riskLevel: this.determineRiskLevel(volatility.percentage, beta.value),
      maxLoss: this.calculateMaxPotentialLoss(stockData.price, volatility.percentage),
      riskRewardRatio: this.calculateRiskRewardRatio(stockData, volatility.percentage),
      description: this.getRiskDescription(volatility.level, beta.interpretation)
    };
  }

  /**
   * Estimate beta (market correlation)
   */
  estimateBeta(stockData) {
    // Simple beta estimation based on sector and volatility
    const sectorBetas = {
      'TECH': 1.3,
      'FINANCE': 1.1,
      'PHARMA': 0.9,
      'FMCG': 0.8,
      'AUTO': 1.2,
      'DEFAULT': 1.0
    };

    const sector = this.determineSector(stockData.symbol);
    const baseBeta = sectorBetas[sector] || sectorBetas.DEFAULT;
    
    // Adjust based on volatility
    const volatilityAdjustment = (Math.abs(stockData.changePercent || 0) / 100) * 0.2;
    const estimatedBeta = baseBeta + volatilityAdjustment;

    return {
      value: Math.round(estimatedBeta * 100) / 100,
      interpretation: estimatedBeta > 1.2 ? 'HIGH' : estimatedBeta > 0.8 ? 'MODERATE' : 'LOW'
    };
  }

  /**
   * Determine sector based on symbol
   */
  determineSector(symbol) {
    const sectorMap = {
      'TCS': 'TECH', 'INFY': 'TECH', 'WIPRO': 'TECH', 'HCLTECH': 'TECH', 'TECHM': 'TECH',
      'HDFCBANK': 'FINANCE', 'ICICIBANK': 'FINANCE', 'KOTAKBANK': 'FINANCE', 'AXISBANK': 'FINANCE', 'SBIN': 'FINANCE',
      'HINDUNILVR': 'FMCG', 'NESTLEIND': 'FMCG', 'TITAN': 'FMCG',
      'SUNPHARMA': 'PHARMA',
      'MARUTI': 'AUTO'
    };
    
    return sectorMap[symbol] || 'DEFAULT';
  }

  /**
   * Determine overall risk level
   */
  determineRiskLevel(volatilityPercent, beta) {
    const volatilityRisk = volatilityPercent > 30 ? 3 : volatilityPercent > 20 ? 2 : 1;
    const betaRisk = beta > 1.3 ? 3 : beta > 1.0 ? 2 : 1;
    
    const combinedRisk = (volatilityRisk + betaRisk) / 2;
    
    if (combinedRisk >= 2.5) return 'HIGH';
    if (combinedRisk >= 1.5) return 'MODERATE';
    return 'LOW';
  }

  /**
   * Calculate maximum potential loss (1-day 95% confidence)
   */
  calculateMaxPotentialLoss(price, volatilityPercent) {
    const dailyVolatility = volatilityPercent / Math.sqrt(252); // Convert to daily
    const maxLoss = price * dailyVolatility * 1.96; // 95% confidence interval
    
    return {
      amount: Math.round(maxLoss * 100) / 100,
      percentage: Math.round((maxLoss / price) * 10000) / 100
    };
  }

  /**
   * Calculate risk-reward ratio
   */
  calculateRiskRewardRatio(stockData, volatilityPercent) {
    const expectedReturn = Math.abs(stockData.changePercent || 2); // Use recent change as proxy
    const risk = volatilityPercent / 16; // Approximate daily risk
    
    const ratio = expectedReturn / risk;
    
    return {
      ratio: Math.round(ratio * 100) / 100,
      interpretation: ratio > 2 ? 'GOOD' : ratio > 1 ? 'FAIR' : 'POOR'
    };
  }

  /**
   * Get risk description
   */
  getRiskDescription(volatilityLevel, betaInterpretation) {
    if (volatilityLevel === 'VERY_HIGH' || betaInterpretation === 'HIGH') {
      return 'High-risk investment suitable for aggressive investors';
    } else if (volatilityLevel === 'HIGH' || betaInterpretation === 'MODERATE') {
      return 'Moderate to high risk, suitable for growth-oriented investors';
    } else if (volatilityLevel === 'MODERATE') {
      return 'Moderate risk, suitable for balanced portfolios';
    } else {
      return 'Lower risk, suitable for conservative investors';
    }
  }

  /**
   * Calculate overall technical score (0-100)
   */
  calculateTechnicalScore(analysis) {
    let score = 50; // Start with neutral score
    
    // RSI contribution (±10 points)
    if (analysis.rsi) {
      if (analysis.rsi < 30) score += 8; // Oversold - bullish
      else if (analysis.rsi > 70) score -= 8; // Overbought - bearish
      else if (analysis.rsi >= 40 && analysis.rsi <= 60) score += 2; // Neutral zone
    }
    
    // Trend contribution (±15 points)
    if (analysis.trend === 'BULLISH') score += 12;
    else if (analysis.trend === 'BEARISH') score -= 12;
    
    // Momentum contribution (±10 points)
    if (analysis.momentum) {
      if (analysis.momentum.direction === 'BULLISH' && analysis.momentum.strength !== 'WEAK') {
        score += analysis.momentum.strength === 'STRONG' ? 8 : 5;
      } else if (analysis.momentum.direction === 'BEARISH' && analysis.momentum.strength !== 'WEAK') {
        score -= analysis.momentum.strength === 'STRONG' ? 8 : 5;
      }
    }
    
    // Volume contribution (±5 points)
    if (analysis.volumeAnalysis && analysis.volumeAnalysis.score) {
      score += (analysis.volumeAnalysis.score - 5); // Adjust from 0-10 to ±5
    }
    
    // Pattern contribution (±10 points)
    if (analysis.patterns && analysis.patterns.length > 0) {
      const patternScore = analysis.patterns.reduce((sum, pattern) => {
        const points = pattern.confidence * (pattern.type === 'BULLISH' ? 5 : -5);
        return sum + points;
      }, 0);
      score += Math.max(-10, Math.min(10, patternScore));
    }
    
    // Ensure score is within bounds
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ===== PORTFOLIO CALCULATIONS =====

  /**
   * Calculate comprehensive portfolio metrics
   */
  calculatePortfolioMetrics(holdings, marketData) {
    try {
      const portfolioData = {
        totalValue: 0,
        todayChange: 0,
        totalGainLoss: 0,
        totalGainLossPercent: 0,
        diversification: this.calculateDiversification(holdings),
        riskMetrics: this.calculatePortfolioRisk(holdings, marketData),
        performance: this.calculatePortfolioPerformance(holdings),
        allocation: this.calculateAllocation(holdings),
        recommendations: this.generatePortfolioRecommendations(holdings, marketData)
      };

      // Calculate totals
      holdings.forEach(holding => {
        const currentValue = holding.quantity * holding.currentPrice;
        const investedValue = holding.quantity * holding.avgPrice;
        
        portfolioData.totalValue += currentValue;
        portfolioData.totalGainLoss += (currentValue - investedValue);
        
        // Today's change
        const marketStock = marketData.find(stock => stock.symbol === holding.symbol);
        if (marketStock) {
          portfolioData.todayChange += holding.quantity * marketStock.change;
        }
      });

      portfolioData.totalGainLossPercent = holdings.length > 0 
        ? (portfolioData.totalGainLoss / (portfolioData.totalValue - portfolioData.totalGainLoss)) * 100 
        : 0;

      return portfolioData;
    } catch (error) {
      errorHandler.log(error, 'portfolio calculations');
      return this.getDefaultPortfolioMetrics();
    }
  }

  /**
   * Calculate portfolio diversification score
   */
  calculateDiversification(holdings) {
    if (holdings.length === 0) return { score: 0, level: 'NONE' };

    const sectors = {};
    let totalValue = 0;

    holdings.forEach(holding => {
      const value = holding.quantity * holding.currentPrice;
      const sector = this.determineSector(holding.symbol);
      
      sectors[sector] = (sectors[sector] || 0) + value;
      totalValue += value;
    });

    // Calculate Herfindahl-Hirschman Index for diversification
    let hhi = 0;
    Object.values(sectors).forEach(sectorValue => {
      const marketShare = sectorValue / totalValue;
      hhi += marketShare * marketShare;
    });

    // Convert HHI to diversification score (0-100)
    const diversificationScore = Math.max(0, (1 - hhi) * 100);
    
    let level;
    if (diversificationScore > 80) level = 'EXCELLENT';
    else if (diversificationScore > 60) level = 'GOOD';
    else if (diversificationScore > 40) level = 'MODERATE';
    else if (diversificationScore > 20) level = 'POOR';
    else level = 'VERY_POOR';

    return {
      score: Math.round(diversificationScore),
      level,
      sectors: Object.keys(sectors).length,
      sectorBreakdown: this.calculateSectorBreakdown(sectors, totalValue)
    };
  }

  /**
   * Calculate sector breakdown
   */
  calculateSectorBreakdown(sectors, totalValue) {
    return Object.entries(sectors).map(([sector, value]) => ({
      sector,
      value,
      percentage: Math.round((value / totalValue) * 10000) / 100
    })).sort((a, b) => b.value - a.value);
  }

  /**
   * Calculate portfolio risk metrics
   */
  calculatePortfolioRisk(holdings, marketData) {
    if (holdings.length === 0) {
      return { level: 'NONE', beta: 0, volatility: 0 };
    }

    let weightedBeta = 0;
    let weightedVolatility = 0;
    let totalValue = 0;

    holdings.forEach(holding => {
      const value = holding.quantity * holding.currentPrice;
      const weight = value;
      
      // Get market data for this holding
      const marketStock = marketData.find(stock => stock.symbol === holding.symbol);
      if (marketStock) {
        const stockBeta = this.estimateBeta(marketStock).value;
        const stockVolatility = Math.abs(marketStock.changePercent || 0);
        
        weightedBeta += stockBeta * weight;
        weightedVolatility += stockVolatility * weight;
      }
      
      totalValue += value;
    });

    if (totalValue === 0) {
      return { level: 'NONE', beta: 0, volatility: 0 };
    }

    const portfolioBeta = weightedBeta / totalValue;
    const portfolioVolatility = weightedVolatility / totalValue;

    return {
      level: this.determineRiskLevel(portfolioVolatility * 16, portfolioBeta), // Annualized volatility estimate
      beta: Math.round(portfolioBeta * 100) / 100,
      volatility: Math.round(portfolioVolatility * 100) / 100,
      description: this.getPortfolioRiskDescription(portfolioBeta, portfolioVolatility)
    };
  }

  /**
   * Get portfolio risk description
   */
  getPortfolioRiskDescription(beta, volatility) {
    if (beta > 1.3 && volatility > 3) {
      return 'High-risk portfolio with significant market sensitivity';
    } else if (beta > 1.0 && volatility > 2) {
      return 'Moderate to high risk with above-average market correlation';
    } else if (beta < 0.8 && volatility < 2) {
      return 'Conservative portfolio with lower market sensitivity';
    } else {
      return 'Balanced portfolio with moderate risk characteristics';
    }
  }

  /**
   * Calculate portfolio performance metrics
   */
  calculatePortfolioPerformance(holdings) {
    if (holdings.length === 0) {
      return { winRate: 0, avgGain: 0, avgLoss: 0, bestPerformer: null, worstPerformer: null };
    }

    let winners = 0;
    let losers = 0;
    let totalGains = 0;
    let totalLosses = 0;
    let gainCount = 0;
    let lossCount = 0;
    
    let bestPerformer = null;
    let worstPerformer = null;
    let bestGainPercent = -Infinity;
    let worstLossPercent = Infinity;

    holdings.forEach(holding => {
      const currentValue = holding.quantity * holding.currentPrice;
      const investedValue = holding.quantity * holding.avgPrice;
      const gainLoss = currentValue - investedValue;
      const gainLossPercent = (gainLoss / investedValue) * 100;

      if (gainLoss > 0) {
        winners++;
        totalGains += gainLoss;
        gainCount++;
        
        if (gainLossPercent > bestGainPercent) {
          bestGainPercent = gainLossPercent;
          bestPerformer = { ...holding, gainLossPercent };
        }
      } else if (gainLoss < 0) {
        losers++;
        totalLosses += Math.abs(gainLoss);
        lossCount++;
        
        if (gainLossPercent < worstLossPercent) {
          worstLossPercent = gainLossPercent;
          worstPerformer = { ...holding, gainLossPercent };
        }
      }
    });

    return {
      winRate: holdings.length > 0 ? Math.round((winners / holdings.length) * 100) : 0,
      avgGain: gainCount > 0 ? Math.round((totalGains / gainCount) * 100) / 100 : 0,
      avgLoss: lossCount > 0 ? Math.round((totalLosses / lossCount) * 100) / 100 : 0,
      bestPerformer,
      worstPerformer,
      totalPositions: holdings.length,
      winners,
      losers
    };
  }

  /**
   * Calculate allocation breakdown
   */
  calculateAllocation(holdings) {
    if (holdings.length === 0) return [];

    let totalValue = 0;
    const allocations = holdings.map(holding => {
      const value = holding.quantity * holding.currentPrice;
      totalValue += value;
      return { ...holding, value };
    });

    return allocations
      .map(allocation => ({
        ...allocation,
        percentage: Math.round((allocation.value / totalValue) * 10000) / 100
      }))
      .sort((a, b) => b.value - a.value);
  }

  /**
   * Generate portfolio recommendations
   */
  generatePortfolioRecommendations(holdings, marketData) {
    const recommendations = [];
    
    // Diversification recommendations
    const diversification = this.calculateDiversification(holdings);
    if (diversification.score < 60) {
      recommendations.push({
        type: 'DIVERSIFICATION',
        priority: 'HIGH',
        title: 'Improve Portfolio Diversification',
        description: 'Consider adding stocks from different sectors to reduce concentration risk',
        action: 'Add positions in underrepresented sectors'
      });
    }

    // Risk recommendations
    const riskMetrics = this.calculatePortfolioRisk(holdings, marketData);
    if (riskMetrics.level === 'HIGH') {
      recommendations.push({
        type: 'RISK_MANAGEMENT',
        priority: 'MEDIUM',
        title: 'High Portfolio Risk Detected',
        description: 'Your portfolio has high volatility and market sensitivity',
        action: 'Consider adding defensive stocks or reducing position sizes'
      });
    }

    // Performance recommendations
    const performance = this.calculatePortfolioPerformance(holdings);
    if (performance.winRate < 50) {
      recommendations.push({
        type: 'PERFORMANCE',
        priority: 'MEDIUM',
        title: 'Review Underperforming Positions',
        description: `${performance.losers} of ${performance.totalPositions} positions are currently losing`,
        action: 'Consider reviewing investment thesis for losing positions'
      });
    }

    // Rebalancing recommendations
    const allocation = this.calculateAllocation(holdings);
    const topPosition = allocation[0];
    if (topPosition && topPosition.percentage > 30) {
      recommendations.push({
        type: 'REBALANCING',
        priority: 'MEDIUM',
        title: 'Position Concentration Risk',
        description: `${topPosition.symbol} represents ${topPosition.percentage}% of your portfolio`,
        action: 'Consider reducing position size to limit concentration risk'
      });
    }

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }

  // ===== UTILITY METHODS =====

  /**
   * Generate price history if not available
   */
  generatePriceHistory(currentPrice, changePercent) {
    const history = [];
    let price = currentPrice;
    const volatility = Math.abs(changePercent || 2) / 100;

    // Generate 50 data points going backwards
    for (let i = 49; i >= 0; i--) {
      const randomChange = (Math.random() - 0.5) * 2 * volatility * price;
      price = Math.max(price - randomChange, price * 0.5); // Prevent unrealistic drops
      history.unshift(Math.round(price * 100) / 100);
    }

    return history;
  }

  /**
   * Calculate simple moving average
   */
  calculateSimpleMovingAverage(prices, period) {
    if (prices.length < period) return null;

    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  /**
   * Calculate slope of price array
   */
  calculateSlope(prices) {
    const n = prices.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope / (sumY / n); // Normalize by average price
  }

  /**
   * Get default technical analysis for error cases
   */
  getDefaultTechnicalAnalysis() {
    return {
      rsi: null,
      sma20: null,
      sma50: null,
      ema: null,
      trend: 'NEUTRAL',
      supportResistance: { support: null, resistance: null },
      volumeAnalysis: { trend: 'NORMAL', analysis: 'Normal trading activity', score: 5 },
      momentum: { strength: 'WEAK', direction: 'NEUTRAL', score: 5 },
      patterns: [],
      volatility: { level: 'MODERATE', percentage: 20, description: 'Moderate volatility' },
      signals: [],
      priceTargets: { shortTerm: {}, mediumTerm: {}, longTerm: {} },
      riskMetrics: { riskLevel: 'MODERATE' },
      technicalScore: 50,
      recommendation: { recommendation: 'HOLD', confidence: 'LOW' }
    };
  }

  /**
   * Get default portfolio metrics for error cases
   */
  getDefaultPortfolioMetrics() {
    return {
      totalValue: 0,
      todayChange: 0,
      totalGainLoss: 0,
      totalGainLossPercent: 0,
      diversification: { score: 0, level: 'NONE' },
      riskMetrics: { level: 'NONE', beta: 0, volatility: 0 },
      performance: { winRate: 0, avgGain: 0, avgLoss: 0 },
      allocation: [],
      recommendations: []
    };
  }
}

// Create and export singleton instance
const dataProcessor = new DataProcessor();

export default dataProcessor;