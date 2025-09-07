import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { errorHandler, performance as perfUtils } from './utils/helpers';

// ===== PERFORMANCE MONITORING =====

// Mark app start time
perfUtils.mark('app-start');

// Monitor Core Web Vitals
if ('PerformanceObserver' in window) {
  // Largest Contentful Paint (LCP)
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    const lastEntry = entries[entries.length - 1];
    console.log('LCP:', lastEntry.startTime);
  }).observe({ entryTypes: ['largest-contentful-paint'] });

  // First Input Delay (FID)
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
      console.log('FID:', entry.processingStart - entry.startTime);
    });
  }).observe({ entryTypes: ['first-input'] });

  // Cumulative Layout Shift (CLS)
  let clsScore = 0;
  new PerformanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
      if (!entry.hadRecentInput) {
        clsScore += entry.value;
      }
    });
    console.log('CLS:', clsScore);
  }).observe({ entryTypes: ['layout-shift'] });
}

// ===== ERROR BOUNDARY =====

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error to error reporting service
    errorHandler.log(error, 'React Error Boundary', {
      componentStack: errorInfo.componentStack,
      errorBoundary: true
    });

    console.error('Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-boundary-icon">⚠️</div>
            <h1 className="error-boundary-title">Oops! Something went wrong</h1>
            <p className="error-boundary-message">
              We're sorry for the inconvenience. The application encountered an unexpected error.
            </p>
            
            <div className="error-boundary-actions">
              <button
                className="error-boundary-btn primary"
                onClick={() => window.location.reload()}
              >
                Reload Application
              </button>
              <button
                className="error-boundary-btn secondary"
                onClick={() => {
                  this.setState({ hasError: false, error: null, errorInfo: null });
                }}
              >
                Try Again
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <details className="error-boundary-details">
                <summary>Technical Details (Development Only)</summary>
                <div className="error-boundary-stack">
                  <h3>Error:</h3>
                  <pre>{this.state.error && this.state.error.toString()}</pre>
                  
                  <h3>Component Stack:</h3>
                  <pre>{this.state.errorInfo.componentStack}</pre>
                  
                  <h3>Error Stack:</h3>
                  <pre>{this.state.error && this.state.error.stack}</pre>
                </div>
              </details>
            )}
            
            <div className="error-boundary-footer">
              <p>If this problem persists, please contact support.</p>
              <p>Error ID: {Date.now().toString(36)}</p>
            </div>
          </div>

          <style jsx>{`
            .error-boundary {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              background: linear-gradient(135deg, #0a0e1a 0%, #141824 100%);
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: #ffffff;
            }
            
            .error-boundary-content {
              max-width: 600px;
              text-align: center;
              background: rgba(36, 41, 54, 0.8);
              backdrop-filter: blur(20px);
              border: 1px solid #334155;
              border-radius: 16px;
              padding: 40px;
              box-shadow: 0 20px 25px rgba(0, 0, 0, 0.4);
            }
            
            .error-boundary-icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            
            .error-boundary-title {
              font-size: 28px;
              font-weight: 700;
              margin-bottom: 16px;
              color: #ffffff;
            }
            
            .error-boundary-message {
              font-size: 16px;
              line-height: 1.6;
              margin-bottom: 32px;
              color: #8892b0;
            }
            
            .error-boundary-actions {
              display: flex;
              gap: 16px;
              justify-content: center;
              margin-bottom: 32px;
              flex-wrap: wrap;
            }
            
            .error-boundary-btn {
              padding: 12px 24px;
              border: none;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              min-width: 140px;
            }
            
            .error-boundary-btn.primary {
              background: linear-gradient(135deg, #00ff88 0%, #00d4aa 100%);
              color: #ffffff;
            }
            
            .error-boundary-btn.secondary {
              background: transparent;
              color: #8892b0;
              border: 1px solid #334155;
            }
            
            .error-boundary-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(0, 255, 136, 0.3);
            }
            
            .error-boundary-details {
              margin-top: 32px;
              text-align: left;
              background: #1a1f2e;
              border-radius: 8px;
              padding: 16px;
            }
            
            .error-boundary-details summary {
              cursor: pointer;
              font-weight: 600;
              margin-bottom: 16px;
              color: #ffa726;
            }
            
            .error-boundary-stack {
              font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
              font-size: 12px;
            }
            
            .error-boundary-stack h3 {
              margin: 16px 0 8px 0;
              color: #ff4757;
            }
            
            .error-boundary-stack pre {
              background: #0f1419;
              padding: 12px;
              border-radius: 4px;
              overflow-x: auto;
              white-space: pre-wrap;
              word-break: break-word;
              color: #64748b;
              border: 1px solid #334155;
            }
            
            .error-boundary-footer {
              margin-top: 32px;
              padding-top: 24px;
              border-top: 1px solid #334155;
              font-size: 14px;
              color: #64748b;
            }
            
            .error-boundary-footer p {
              margin: 8px 0;
            }

            @media (max-width: 768px) {
              .error-boundary-content {
                padding: 24px;
                margin: 0 16px;
              }
              
              .error-boundary-title {
                font-size: 24px;
              }
              
              .error-boundary-actions {
                flex-direction: column;
                align-items: center;
              }
              
              .error-boundary-btn {
                width: 100%;
                max-width: 200px;
              }
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}

// ===== APPLICATION BOOTSTRAP =====

/**
 * Initialize and render the application
 */
const initializeApplication = () => {
  // Get the root element
  const container = document.getElementById('root');
  
  if (!container) {
    console.error('Root element not found');
    return;
  }

  // Create React root
  const root = createRoot(container);

  // Development mode checks
  if (process.env.NODE_ENV === 'development') {
    console.log('🚀 Starting TradePro in development mode');
    console.log('📊 Performance monitoring enabled');
    console.log('🔧 React StrictMode enabled');
  }

  // Render the application
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

  // Mark render complete
  perfUtils.mark('app-render-complete');
  
  // Measure total startup time
  const startupTime = perfUtils.measure('app-startup', 'app-start', 'app-render-complete');
  if (startupTime) {
    console.log(`⚡ App startup completed in ${Math.round(startupTime)}ms`);
  }
};

// ===== SERVICE WORKER REGISTRATION =====

/**
 * Register service worker for PWA functionality
 */
const registerServiceWorker = () => {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registered successfully:', registration.scope);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('🔄 New content available, please refresh');
                    // Show update notification to user
                    showUpdateNotification();
                  } else {
                    console.log('📱 Content cached for offline use');
                  }
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('❌ Service Worker registration failed:', error);
        });
    });
  }
};

/**
 * Show update notification to user
 */
const showUpdateNotification = () => {
  // Create a simple update notification
  const notification = document.createElement('div');
  notification.className = 'update-notification';
  notification.innerHTML = `
    <div class="update-content">
      <span>🔄 New version available!</span>
      <button onclick="window.location.reload()" class="update-btn">Update</button>
      <button onclick="this.parentElement.parentElement.remove()" class="dismiss-btn">×</button>
    </div>
  `;
  
  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #252837;
    color: white;
    padding: 16px;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    border: 1px solid #334155;
  `;

  document.body.appendChild(notification);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 10000);
};

// ===== DEVELOPMENT HELPERS =====

if (process.env.NODE_ENV === 'development') {
  // Enable React DevTools profiler
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__.settings = {
      ...window.__REACT_DEVTOOLS_GLOBAL_HOOK__.settings,
      profilerEnabled: true
    };
  }

  // Add global debugging helpers
  window.tradingApp = {
    version: '1.0.0',
    performance: perfUtils,
    errorHandler,
    clearCache: () => {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then((names) => {
          names.forEach(name => caches.delete(name));
        });
      }
      console.log('🧹 Cache cleared');
    },
    reload: () => window.location.reload(),
    info: () => {
      console.log('📊 TradePro Debug Info:');
      console.log('Version:', '1.0.0');
      console.log('Environment:', process.env.NODE_ENV);
      console.log('React Version:', React.version);
      console.log('Online:', navigator.onLine);
      console.log('Service Worker:', 'serviceWorker' in navigator);
      console.log('Local Storage:', Object.keys(localStorage).length, 'items');
    }
  };
  
  // Log startup info
  console.log('🔧 Development tools available via window.tradingApp');
}

// ===== CRITICAL CSS INJECTION =====

/**
 * Inject critical CSS for loading states
 */
const injectCriticalCSS = () => {
  const criticalCSS = `
    .update-content {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .update-btn, .dismiss-btn {
      background: #00ff88;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    
    .dismiss-btn {
      background: transparent;
      color: #8892b0;
      padding: 6px 8px;
    }
    
    .update-btn:hover {
      background: #00d4aa;
    }
    
    .dismiss-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  `;

  const style = document.createElement('style');
  style.textContent = criticalCSS;
  document.head.appendChild(style);
};

// ===== STARTUP SEQUENCE =====

// 1. Inject critical CSS
injectCriticalCSS();

// 2. Register service worker
registerServiceWorker();

// 3. Initialize application
initializeApplication();

// ===== CLEANUP =====

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  perfUtils.mark('app-unload');
  console.log('👋 TradePro unloading...');
});

// Report any remaining uncaught errors
window.addEventListener('error', (event) => {
  console.error('💥 Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('💥 Unhandled promise rejection:', event.reason);
});