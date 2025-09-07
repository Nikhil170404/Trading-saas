import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './components/Dashboard';
import { errorHandler, performance as perfUtils } from './utils/helpers';
import './styles/App.css';

/**
 * Main App Component
 * Entry point for the Trading SaaS Application
 */
function App() {
  // App-level state
  const [isLoading, setIsLoading] = useState(true);
  const [appError, setAppError] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [appVersion] = useState('1.0.0');

  // ===== INITIALIZATION =====

  useEffect(() => {
    initializeApp();
  }, []);

  /**
   * Initialize the application
   */
  const initializeApp = async () => {
    try {
      // Mark app start performance
      perfUtils.mark('app-init-start');

      // Initialize error handling
      setupErrorHandling();

      // Setup network monitoring
      setupNetworkMonitoring();

      // Setup PWA install prompt
      setupPWAInstallPrompt();

      // Check for app updates
      checkForUpdates();

      // Initialize theme
      initializeTheme();

      // Load critical resources
      await loadCriticalResources();

      // Mark initialization complete
      const initDuration = perfUtils.measure('app-init', 'app-init-start');
      if (initDuration) {
        console.log(`App initialized in ${Math.round(initDuration)}ms`);
      }

    } catch (error) {
      errorHandler.log(error, 'app initialization');
      setAppError('Failed to initialize application. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Setup global error handling
   */
  const setupErrorHandling = () => {
    // Global error handler
    window.addEventListener('error', (event) => {
      errorHandler.log(event.error, 'global error');
      console.error('Global error:', event.error);
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      errorHandler.log(event.reason, 'unhandled promise rejection');
      console.error('Unhandled promise rejection:', event.reason);
      event.preventDefault();
    });
  };

  /**
   * Setup network status monitoring
   */
  const setupNetworkMonitoring = () => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('App is back online');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('App is offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup function will be handled by React
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  };

  /**
   * Setup PWA install prompt
   */
  const setupPWAInstallPrompt = () => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      
      // Show install banner after a delay if not already installed
      setTimeout(() => {
        if (!window.matchMedia('(display-mode: standalone)').matches) {
          setShowInstallBanner(true);
        }
      }, 30000); // Show after 30 seconds
    });

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('App is running in standalone mode (installed)');
    }
  };

  /**
   * Check for app updates
   */
  const checkForUpdates = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('New service worker activated, reloading...');
        window.location.reload();
      });

      // Check for updates every 5 minutes
      setInterval(() => {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ command: 'CHECK_FOR_UPDATES' });
        }
      }, 300000);
    }
  };

  /**
   * Initialize theme
   */
  const initializeTheme = () => {
    // Force dark theme for this app
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('dark-theme');
  };

  /**
   * Load critical resources
   */
  const loadCriticalResources = async () => {
    // Preload critical images or data if needed
    const criticalResources = [
      // Add any critical resources here
    ];

    await Promise.allSettled(criticalResources);
  };

  // ===== EVENT HANDLERS =====

  /**
   * Handle PWA install
   */
  const handleInstallApp = async () => {
    if (!installPrompt) return;

    try {
      const result = await installPrompt.prompt();
      console.log('Install prompt result:', result.outcome);
      
      if (result.outcome === 'accepted') {
        setShowInstallBanner(false);
        setInstallPrompt(null);
      }
    } catch (error) {
      console.error('Install prompt failed:', error);
    }
  };

  /**
   * Dismiss install banner
   */
  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    // Remember user's choice
    localStorage.setItem('installBannerDismissed', 'true');
  };

  /**
   * Handle app error recovery
   */
  const handleErrorRecovery = () => {
    setAppError(null);
    window.location.reload();
  };

  // ===== EFFECTS =====

  useEffect(() => {
    // Check if install banner was previously dismissed
    const wasDismissed = localStorage.getItem('installBannerDismissed');
    if (wasDismissed) {
      setShowInstallBanner(false);
    }
  }, []);

  // ===== ANIMATION VARIANTS =====

  const appVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        duration: 0.5,
        ease: "easeOut"
      }
    }
  };

  const loadingVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { duration: 0.3 }
    },
    exit: { 
      opacity: 0,
      transition: { duration: 0.3 }
    }
  };

  // ===== RENDER =====

  return (
    <motion.div 
      className="app"
      variants={appVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Loading Screen */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="app-loading"
            variants={loadingVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="loading-content">
              <motion.div
                className="loading-logo"
                animate={{ 
                  scale: [1, 1.1, 1],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                📈 TradePro
              </motion.div>
              <motion.div
                className="loading-spinner"
                animate={{ rotate: 360 }}
                transition={{ 
                  duration: 1,
                  repeat: Infinity,
                  ease: "linear"
                }}
              >
                <div className="spinner-ring"></div>
              </motion.div>
              <div className="loading-text">
                Initializing Trading Platform...
              </div>
              <div className="loading-subtext">
                Loading market data and portfolio
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Screen */}
      <AnimatePresence>
        {appError && (
          <motion.div
            className="app-error"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <div className="error-content">
              <div className="error-icon">⚠️</div>
              <h2 className="error-title">Something went wrong</h2>
              <p className="error-message">{appError}</p>
              <div className="error-actions">
                <motion.button
                  className="error-retry-btn"
                  onClick={handleErrorRecovery}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Try Again
                </motion.button>
              </div>
              <div className="error-details">
                <details>
                  <summary>Technical Details</summary>
                  <p>Version: {appVersion}</p>
                  <p>Online: {isOnline ? 'Yes' : 'No'}</p>
                  <p>User Agent: {navigator.userAgent}</p>
                </details>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App Content */}
      <AnimatePresence>
        {!isLoading && !appError && (
          <motion.div
            className="app-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Dashboard />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install Banner */}
      <AnimatePresence>
        {showInstallBanner && installPrompt && (
          <motion.div
            className="install-banner"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="install-content">
              <div className="install-icon">📱</div>
              <div className="install-text">
                <div className="install-title">Install TradePro</div>
                <div className="install-subtitle">Get the full app experience</div>
              </div>
            </div>
            <div className="install-actions">
              <motion.button
                className="install-btn"
                onClick={handleInstallApp}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Install
              </motion.button>
              <motion.button
                className="dismiss-btn"
                onClick={dismissInstallBanner}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                ✕
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Indicator */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            className="offline-indicator"
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
          >
            <div className="offline-content">
              <span className="offline-icon">📡</span>
              <span className="offline-text">You're offline. Some features may be limited.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App Version Info (Development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="dev-info">
          <div className="dev-version">v{appVersion}</div>
          <div className="dev-status">
            {isOnline ? '🟢' : '🔴'} {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      )}

      {/* Background Elements */}
      <div className="app-background">
        <div className="bg-gradient-1"></div>
        <div className="bg-gradient-2"></div>
        <div className="bg-pattern"></div>
      </div>
    </motion.div>
  );
}

export default App;