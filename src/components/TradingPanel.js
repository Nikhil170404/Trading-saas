import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency, formatPercentage } from '../utils/helpers';

/**
 * Advanced Trading Panel Component
 * Handles buy/sell orders with validation, order types, and risk management
 */
const TradingPanel = ({
  isOpen,
  tradingData,
  portfolio,
  onClose,
  onExecute
}) => {
  // Form state
  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState('MARKET'); // MARKET, LIMIT, STOP_LOSS
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [timeInForce, setTimeInForce] = useState('DAY'); // DAY, GTC, IOC
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [riskWarning, setRiskWarning] = useState(null);

  // Extract trading data
  const { stock, action } = tradingData || {};
  const isValidTrade = stock && action;

  // ===== COMPUTED VALUES =====

  // Order calculations
  const orderCalculations = useMemo(() => {
    if (!isValidTrade || !quantity) return null;

    const price = orderType === 'LIMIT' && limitPrice ? parseFloat(limitPrice) : stock.price;
    const totalAmount = price * quantity;
    const estimatedFees = totalAmount * 0.001; // 0.1% estimated fees
    const totalCost = action === 'buy' ? totalAmount + estimatedFees : totalAmount - estimatedFees;

    return {
      price,
      totalAmount,
      estimatedFees,
      totalCost,
      pricePerShare: price
    };
  }, [isValidTrade, quantity, orderType, limitPrice, stock?.price, action]);

  // Position size and risk calculations
  const riskCalculations = useMemo(() => {
    if (!orderCalculations || action !== 'buy') return null;

    const positionSize = (orderCalculations.totalCost / portfolio.totalValue) * 100;
    const maxRecommendedSize = 10; // 10% max recommended position size
    const currentHolding = portfolio.holdings.find(h => h.symbol === stock.symbol);
    const currentValue = currentHolding ? currentHolding.quantity * currentHolding.currentPrice : 0;
    const newTotalValue = currentValue + orderCalculations.totalCost;
    const newPositionSize = (newTotalValue / portfolio.totalValue) * 100;

    return {
      positionSize,
      newPositionSize,
      maxRecommendedSize,
      isOverweight: newPositionSize > maxRecommendedSize,
      riskLevel: newPositionSize > 15 ? 'HIGH' : newPositionSize > 10 ? 'MEDIUM' : 'LOW'
    };
  }, [orderCalculations, action, portfolio, stock]);

  // Validation
  const validation = useMemo(() => {
    const newErrors = {};
    let isValid = true;

    if (!quantity || quantity <= 0) {
      newErrors.quantity = 'Quantity must be greater than 0';
      isValid = false;
    }

    if (orderType === 'LIMIT') {
      if (!limitPrice || parseFloat(limitPrice) <= 0) {
        newErrors.limitPrice = 'Limit price must be greater than 0';
        isValid = false;
      }
    }

    if (orderType === 'STOP_LOSS') {
      if (!stopPrice || parseFloat(stopPrice) <= 0) {
        newErrors.stopPrice = 'Stop price must be greater than 0';
        isValid = false;
      }
    }

    if (action === 'buy' && orderCalculations) {
      if (orderCalculations.totalCost > portfolio.availableCash) {
        newErrors.funds = `Insufficient funds. Available: ${formatCurrency(portfolio.availableCash)}`;
        isValid = false;
      }
    }

    if (action === 'sell') {
      const holding = portfolio.holdings.find(h => h.symbol === stock?.symbol);
      if (!holding || holding.quantity < quantity) {
        newErrors.shares = `Insufficient shares. Available: ${holding?.quantity || 0}`;
        isValid = false;
      }
    }

    return { errors: newErrors, isValid };
  }, [quantity, orderType, limitPrice, stopPrice, action, orderCalculations, portfolio, stock]);

  // ===== EFFECTS =====

  // Reset form when trading data changes
  useEffect(() => {
    if (isOpen && tradingData) {
      setQuantity(1);
      setOrderType('MARKET');
      setLimitPrice('');
      setStopPrice('');
      setTimeInForce('DAY');
      setErrors({});
      setRiskWarning(null);
      setShowAdvanced(false);
    }
  }, [isOpen, tradingData]);

  // Update errors when validation changes
  useEffect(() => {
    setErrors(validation.errors);
  }, [validation.errors]);

  // Risk warning for large positions
  useEffect(() => {
    if (riskCalculations?.isOverweight) {
      setRiskWarning({
        type: 'position_size',
        message: `This order would make ${stock?.symbol} ${riskCalculations.newPositionSize.toFixed(1)}% of your portfolio, exceeding the recommended ${riskCalculations.maxRecommendedSize}% limit.`,
        level: riskCalculations.riskLevel
      });
    } else {
      setRiskWarning(null);
    }
  }, [riskCalculations, stock]);

  // ===== EVENT HANDLERS =====

  const handleQuantityChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    setQuantity(Math.max(0, value));
  };

  const handleLimitPriceChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setLimitPrice(value);
    }
  };

  const handleStopPriceChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setStopPrice(value);
    }
  };

  const handleOrderTypeChange = (type) => {
    setOrderType(type);
    if (type === 'MARKET') {
      setLimitPrice('');
      setStopPrice('');
    } else if (type === 'LIMIT') {
      setLimitPrice(stock?.price?.toString() || '');
      setStopPrice('');
    } else if (type === 'STOP_LOSS') {
      setStopPrice(stock?.price?.toString() || '');
      setLimitPrice('');
    }
  };

  const handlePresetQuantity = (preset) => {
    if (!orderCalculations) return;

    let newQuantity;
    switch (preset) {
      case '25%':
        newQuantity = Math.floor(portfolio.availableCash * 0.25 / orderCalculations.price);
        break;
      case '50%':
        newQuantity = Math.floor(portfolio.availableCash * 0.50 / orderCalculations.price);
        break;
      case 'max':
        newQuantity = Math.floor(portfolio.availableCash / orderCalculations.price);
        break;
      default:
        newQuantity = quantity;
    }
    setQuantity(Math.max(1, newQuantity));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validation.isValid || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const orderData = {
        stock,
        action,
        quantity,
        orderType,
        limitPrice: orderType === 'LIMIT' ? parseFloat(limitPrice) : null,
        stopPrice: orderType === 'STOP_LOSS' ? parseFloat(stopPrice) : null,
        timeInForce,
        totalAmount: orderCalculations.totalCost,
        estimatedFees: orderCalculations.estimatedFees
      };

      await onExecute(orderData);
    } catch (error) {
      console.error('Order execution failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ===== ANIMATION VARIANTS =====

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const panelVariants = {
    hidden: { 
      opacity: 0, 
      y: 100, 
      scale: 0.95 
    },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 30
      }
    },
    exit: { 
      opacity: 0, 
      y: 100, 
      scale: 0.95,
      transition: { duration: 0.2 }
    }
  };

  // ===== RENDER =====

  if (!isValidTrade) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="trading-panel-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="trading-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            <div className="trading-panel-header">
              <div className="header-info">
                <h2 className="panel-title">
                  {action === 'buy' ? '📈 Buy Order' : '📉 Sell Order'}
                </h2>
                <div className="stock-info">
                  <span className="stock-symbol">{stock.symbol}</span>
                  <span className="stock-name">{stock.name}</span>
                  <span className="current-price">{formatCurrency(stock.price)}</span>
                  <span className={`price-change ${stock.change >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercentage(stock.changePercent).value}
                  </span>
                </div>
              </div>
              <motion.button
                className="close-btn"
                onClick={onClose}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                ✕
              </motion.button>
            </div>

            {/* Form */}
            <form className="trading-form" onSubmit={handleSubmit}>
              {/* Order Type Selection */}
              <div className="form-section">
                <label className="form-label">Order Type</label>
                <div className="order-type-tabs">
                  {['MARKET', 'LIMIT', 'STOP_LOSS'].map((type) => (
                    <motion.button
                      key={type}
                      type="button"
                      className={`order-type-btn ${orderType === type ? 'active' : ''}`}
                      onClick={() => handleOrderTypeChange(type)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {type.replace('_', ' ')}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Quantity and Price */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    Quantity
                    {action === 'buy' && orderCalculations && (
                      <span className="field-hint">
                        Max: {Math.floor(portfolio.availableCash / orderCalculations.price)}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    className={`form-input ${errors.quantity ? 'error' : ''}`}
                    value={quantity}
                    onChange={handleQuantityChange}
                    min="1"
                    step="1"
                  />
                  {errors.quantity && <span className="error-text">{errors.quantity}</span>}
                  
                  {action === 'buy' && (
                    <div className="quantity-presets">
                      <button type="button" onClick={() => handlePresetQuantity('25%')}>25%</button>
                      <button type="button" onClick={() => handlePresetQuantity('50%')}>50%</button>
                      <button type="button" onClick={() => handlePresetQuantity('max')}>Max</button>
                    </div>
                  )}
                </div>

                {orderType === 'LIMIT' && (
                  <div className="form-group">
                    <label className="form-label">
                      Limit Price
                      <span className="field-hint">Current: {formatCurrency(stock.price)}</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${errors.limitPrice ? 'error' : ''}`}
                      value={limitPrice}
                      onChange={handleLimitPriceChange}
                      placeholder={stock.price.toString()}
                    />
                    {errors.limitPrice && <span className="error-text">{errors.limitPrice}</span>}
                  </div>
                )}

                {orderType === 'STOP_LOSS' && (
                  <div className="form-group">
                    <label className="form-label">
                      Stop Price
                      <span className="field-hint">Current: {formatCurrency(stock.price)}</span>
                    </label>
                    <input
                      type="text"
                      className={`form-input ${errors.stopPrice ? 'error' : ''}`}
                      value={stopPrice}
                      onChange={handleStopPriceChange}
                      placeholder={stock.price.toString()}
                    />
                    {errors.stopPrice && <span className="error-text">{errors.stopPrice}</span>}
                  </div>
                )}
              </div>

              {/* Advanced Options */}
              <div className="form-section">
                <motion.button
                  type="button"
                  className="advanced-toggle"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  whileHover={{ scale: 1.02 }}
                >
                  {showAdvanced ? '▼' : '▶'} Advanced Options
                </motion.button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      className="advanced-options"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="form-group">
                        <label className="form-label">Time in Force</label>
                        <select
                          className="form-select"
                          value={timeInForce}
                          onChange={(e) => setTimeInForce(e.target.value)}
                        >
                          <option value="DAY">Day Order</option>
                          <option value="GTC">Good Till Cancelled</option>
                          <option value="IOC">Immediate or Cancel</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Risk Warning */}
              <AnimatePresence>
                {riskWarning && (
                  <motion.div
                    className={`risk-warning risk-${riskWarning.level.toLowerCase()}`}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="warning-icon">⚠️</div>
                    <div className="warning-content">
                      <div className="warning-title">Risk Warning</div>
                      <div className="warning-message">{riskWarning.message}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Order Summary */}
              {orderCalculations && (
                <div className="order-summary">
                  <h3>Order Summary</h3>
                  <div className="summary-rows">
                    <div className="summary-row">
                      <span>Shares</span>
                      <span>{quantity.toLocaleString()}</span>
                    </div>
                    <div className="summary-row">
                      <span>Price per Share</span>
                      <span>{formatCurrency(orderCalculations.pricePerShare)}</span>
                    </div>
                    <div className="summary-row">
                      <span>Subtotal</span>
                      <span>{formatCurrency(orderCalculations.totalAmount)}</span>
                    </div>
                    <div className="summary-row">
                      <span>Estimated Fees</span>
                      <span>{formatCurrency(orderCalculations.estimatedFees)}</span>
                    </div>
                    <div className="summary-row total">
                      <span>Total {action === 'buy' ? 'Cost' : 'Proceeds'}</span>
                      <span>{formatCurrency(orderCalculations.totalCost)}</span>
                    </div>
                  </div>

                  {/* Position Impact */}
                  {riskCalculations && (
                    <div className="position-impact">
                      <div className="impact-row">
                        <span>Position Size</span>
                        <span>{riskCalculations.newPositionSize.toFixed(1)}% of portfolio</span>
                      </div>
                      <div className="impact-row">
                        <span>Remaining Cash</span>
                        <span>{formatCurrency(portfolio.availableCash - orderCalculations.totalCost)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Messages */}
              {(errors.funds || errors.shares) && (
                <div className="form-errors">
                  {errors.funds && <div className="error-message">💰 {errors.funds}</div>}
                  {errors.shares && <div className="error-message">📊 {errors.shares}</div>}
                </div>
              )}

              {/* Action Buttons */}
              <div className="form-actions">
                <motion.button
                  type="button"
                  className="cancel-btn"
                  onClick={onClose}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                
                <motion.button
                  type="submit"
                  className={`submit-btn ${action}-btn`}
                  disabled={!validation.isValid || isSubmitting}
                  whileHover={validation.isValid ? { scale: 1.02 } : {}}
                  whileTap={validation.isValid ? { scale: 0.98 } : {}}
                >
                  {isSubmitting ? (
                    <motion.div
                      className="loading-spinner"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    >
                      ⟳
                    </motion.div>
                  ) : (
                    <>
                      {action === 'buy' ? '📈 Place Buy Order' : '📉 Place Sell Order'}
                    </>
                  )}
                </motion.button>
              </div>
            </form>

            {/* Disclaimer */}
            <div className="trading-disclaimer">
              <small>
                ⚠️ Trading involves risk. Past performance does not guarantee future results. 
                Please ensure you understand the risks before placing any orders.
              </small>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TradingPanel;