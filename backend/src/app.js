const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const securityConfig = require('./config/security');
const dbManager = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const {
  requestIdMiddleware,
  securityValidation,
  securityLogger,
  validateContentType
} = require('./middleware/security');

// Import routes
const authRoutes = require('./routes/auth');
const collegeRoutes = require('./routes/colleges');
const applicationRoutes = require('./routes/applications');
const deadlineRoutes = require('./routes/deadlines');
const essayRoutes = require('./routes/essays');
const recommendationsRoutes = require('./routes/recommendations');
const timelineRoutes = require('./routes/timeline');
const searchRoutes = require('./routes/search');
const chatbotRoutes = require('./routes/chatbot');
const chancingRoutes = require('./routes/chancing');
const mlRoutes = require('./routes/ml');
const fitRoutes = require('./routes/fit');
const tasksRoutes = require('./routes/tasks');
const riskRoutes = require('./routes/risk');
const warningsRoutes = require('./routes/warnings');
const automationRoutes = require('./routes/automation');
const documentsRoutes = require('./routes/documents');
const scholarshipsRoutes = require('./routes/scholarships');
const recommendersRoutes = require('./routes/recommenders');
const analyticsRoutes = require('./routes/analytics');
const eligibilityRoutes = require('./routes/eligibility');
const notificationRoutes = require('./routes/notifications');
const financingRoutes = require('./routes/financing');
const financialRoutes = require('./routes/financial');
const insightsRoutes = require('./routes/insights');
const currencyRatesRoutes = require('./routes/currencyRates');
const studentProfileRoutes = require('./routes/studentProfile');
const grantsRoutes = require('./routes/grants');
const loansRoutes = require('./routes/loans');
const chanceRoutes = require('./routes/chance');
const adminRoutes = require('./routes/admin');

// Create Express app
const app = express();

// Job instances for graceful shutdown
let deadlineSchedulerInstance = null;
let server = null;

// Trust proxy for proper IP detection behind reverse proxies
app.set('trust proxy', 1);

// ===== SECURITY MIDDLEWARE (Order matters!) =====

// Add request ID for tracing
app.use(requestIdMiddleware);

// Security headers with enhanced Helmet configuration
app.use(helmet({
  contentSecurityPolicy: securityConfig.helmet.contentSecurityPolicy,
  crossOriginEmbedderPolicy: false,
  hsts: securityConfig.helmet.hsts,
  noSniff: true,
  referrerPolicy: securityConfig.helmet.referrerPolicy,
}));

// CORS with dynamic origin validation
app.use(cors(securityConfig.cors));

// Security logging
app.use(securityLogger);

// Body parsing with strict size limits
app.use(express.json({ limit: securityConfig.requestLimits.json }));
app.use(express.urlencoded({ extended: true, limit: securityConfig.requestLimits.urlencoded }));

// Validate Content-Type
app.use(validateContentType);

// Input security validation (injection detection)
app.use(securityValidation);

// Rate limiting for all API routes
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'College App Backend is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/colleges', collegeRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/deadlines', deadlineRoutes);
app.use('/api/essays', essayRoutes);
app.use('/api/profile', studentProfileRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/chancing', chancingRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/fit', fitRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/warnings', warningsRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/scholarships', scholarshipsRoutes);
app.use('/api/recommenders', recommendersRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/financing', financingRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/currency-rates', currencyRatesRoutes);
app.use('/api/grants', grantsRoutes);
app.use('/api/loans', loansRoutes);
app.use('/api/chance', chanceRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown helper
function gracefulShutdown(signal) {
  logger.info(`${signal} received: closing HTTP server`);

  try { require('./jobs/mlRetraining').stop(); } catch (e) { /* ignore */ }
  try { require('./jobs/dataRefresh').stop(); } catch (e) { /* ignore */ }
  try { require('./jobs/scraperScheduler').stop(); } catch (e) { /* ignore */ }
  try { require('../../jobs/orchestrator').stop(); } catch (e) { /* ignore */ }
  if (deadlineSchedulerInstance) {
    try { deadlineSchedulerInstance.stop(); } catch (e) { /* ignore */ }
  }

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      await dbManager.close();
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server (async to allow awaiting migrations + seeding)
async function startServer() {
  try {
    // Initialize pg pool
    dbManager.initialize();

    // Verify the connection before doing anything else
    const { testConnection, startKeepAlive } = require('./config/database');
    await testConnection();

    // Run migrations
    await dbManager.runMigrations();

    // Seed colleges if the table is empty
    try {
      const { seedIfEmpty } = require('../../scripts/seedColleges');
      await seedIfEmpty();
    } catch (seedErr) {
      logger.warn('College seeding skipped or failed:', { error: seedErr.message });
    }

    const PORT = config.port;
    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${config.nodeEnv} mode`);
      logger.info('Database: PostgreSQL via DATABASE_URL');

      // Start keep-alive pings to prevent Render free-tier connection reaping
      startKeepAlive();

      // Warm up exchange rates on boot and refresh every 6 hours
      const { refreshExchangeRates } = require('./services/financialCostService');
      refreshExchangeRates().catch(() => {});
      setInterval(refreshExchangeRates, 6 * 60 * 60 * 1000);

      // Start ML retraining jobs
      if (config.nodeEnv === 'production' || process.env.ENABLE_ML_JOBS === 'true') {
        try {
          const mlRetrainingJob = require('./jobs/mlRetraining');
          mlRetrainingJob.start();
          logger.info('ML retraining jobs started');
        } catch (error) {
          logger.warn('ML retraining jobs failed to start:', { error: error.message });
        }
      }

      // Start data refresh cron jobs
      if (config.nodeEnv === 'production' || process.env.ENABLE_SCRAPING_JOBS === 'true') {
        try {
          const dataRefreshJob = require('./jobs/dataRefresh');
          dataRefreshJob.start();
          logger.info('Data refresh cron jobs started');
        } catch (error) {
          logger.warn('Data refresh jobs failed to start:', { error: error.message });
        }

        try {
          const DeadlineScrapingScheduler = require('./jobs/deadlineScrapingScheduler');
          deadlineSchedulerInstance = new DeadlineScrapingScheduler();
          deadlineSchedulerInstance.setupCronJobs();
          logger.info('Deadline scraping scheduler started');
        } catch (error) {
          logger.warn('Deadline scraping scheduler failed to start:', { error: error.message });
        }

        // Start Node orchestrator (additional Python scrapers + ML retrain)
        try {
          const orchestrator = require('../../jobs/orchestrator');
          orchestrator.start();
          logger.info('Orchestrator started');
        } catch (error) {
          logger.warn('Orchestrator failed to start:', { error: error.message });
        }

        // Start Reddit / scholarship / admissions scraper scheduler
        try {
          const scraperScheduler = require('./jobs/scraperScheduler');
          scraperScheduler.start();
          logger.info('Scraper scheduler started');
        } catch (error) {
          logger.warn('Scraper scheduler failed to start:', { error: error.message });
        }
      }
    });
  } catch (err) {
    logger.error('Failed to start server:', { error: err.message });
    process.exit(1);
  }
}

startServer();

module.exports = app;
