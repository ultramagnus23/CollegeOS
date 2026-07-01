const express = require('express');
const { patchExpressAsyncHandling } = require('./middleware/safeAsyncHandler');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const securityConfig = require('./config/security');
const dbManager = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { validateStartupSchema } = require('./startup/schemaValidator');
const { checkSchemaContracts, formatSchemaContractReport } = require('./utils/schemaContractChecker');
const { requestMetricsMiddleware } = require('./observability');
const { MaterializedViewManager } = require('./services/materializedViewManager');
const { requestDiagnostics } = require('./middleware/requestDiagnostics');
const {
  requestIdMiddleware,
  securityValidation,
  securityLogger,
  validateContentType
} = require('./middleware/security');

patchExpressAsyncHandling(express);

// Import routes
const authRoutes = require('./routes/auth');
const collegeRoutes = require('./routes/colleges');
const applicationRoutes = require('./routes/applications');
const deadlineRoutes = require('./routes/deadlines');
const essayRoutes = require('./routes/essays');
const recommendationsRoutes = require('./routes/recommendations');
const timelineRoutes = require('./routes/timeline');
const chatbotRoutes = require('./routes/chatbot');
const chancingRoutes = require('./routes/chancing');
const mlRoutes = require('./routes/ml');
const fitRoutes = require('./routes/fit');
const tasksRoutes = require('./routes/tasks');
const riskRoutes = require('./routes/risk');
const warningsRoutes = require('./routes/warnings');
const automationRoutes = require('./routes/automation');
const documentsRoutes = require('./routes/documents');
const dashboardRoutes = require('./routes/dashboard');
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
const signalsRoutes = require('./routes/signals');
const chancesRoutes = require('./routes/chances');
const discoveryRoutes = require('./routes/discovery');
const indiaRoutes = require('./routes/india');
const mastersRoutes = require('./routes/masters');

// Create Express app
const app = express();

// Job instances for graceful shutdown
let deadlineSchedulerInstance = null;
let server = null;

function logRecommendationEnvDiagnostics() {
  const requiredEnv = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'EMBEDDING_MODEL',
    'PYTHON_PATH',
  ];
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.warn('Recommendation env vars missing', { missing });
  } else {
    logger.info('Recommendation env vars present', { keys: requiredEnv });
  }
}

// Trust proxy for proper IP detection behind reverse proxies
app.set('trust proxy', 1);

// ===== SECURITY MIDDLEWARE (Order matters!) =====

// Add request ID for tracing
app.use(requestIdMiddleware);

// Security headers with enhanced Helmet configuration
app.use(helmet({
  contentSecurityPolicy: securityConfig.helmet.contentSecurityPolicy,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  hsts: securityConfig.helmet.hsts,
  noSniff: true,
  referrerPolicy: securityConfig.helmet.referrerPolicy,
}));

// CORS with dynamic origin validation
app.use(cors(securityConfig.cors));

// Security logging
app.use(securityLogger);
app.use(requestMetricsMiddleware(logger));
app.use(requestDiagnostics(logger));

// Body parsing with strict size limits
app.use(express.json({ limit: securityConfig.requestLimits.json }));
app.use(express.urlencoded({ extended: true, limit: securityConfig.requestLimits.urlencoded }));

// Validate Content-Type
app.use(validateContentType);

// Input security validation (injection detection)
app.use(securityValidation);

// Rate limiting for all API routes
app.use('/api/', apiLimiter);

// Instant ping — no DB query. Used by the frontend warmup probe to detect
// when the Render free-tier process is up before making authenticated calls.
app.get('/ping', (_req, res) => res.json({ ok: true }));

// Health check — used by Render as the service health check URL.
// Returns DB connectivity status for operational monitoring.
// Rate-limited to prevent DB-query abuse from unauthenticated callers.
app.get('/health', apiLimiter, async (req, res) => {
  let dbConnected = false;
  try {
    const pool = dbManager.getDatabase();
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    await client.query('SELECT 1');
    client.release();
    dbConnected = true;
  } catch (_) {
    logger.warn('health check (/health) db probe failed');
    dbConnected = false;
  }
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    dbConnected,
  });
});

// Health alias to avoid client-side blockers on "/health" URL patterns.
app.get('/status', apiLimiter, async (req, res) => {
  let dbConnected = false;
  try {
    const pool = dbManager.getDatabase();
    const client = await Promise.race([
      pool.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    await client.query('SELECT 1');
    client.release();
    dbConnected = true;
  } catch (_) {
    logger.warn('status check (/status) db probe failed');
    dbConnected = false;
  }
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    dbConnected,
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
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/chancing', chancingRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/fit', fitRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/risk', riskRoutes);
app.use('/api/warnings', warningsRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/dashboard', dashboardRoutes);
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
app.use('/api/signals', signalsRoutes);
app.use('/api/chances', chancesRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/india', indiaRoutes);
// Masters/grad track — dark behind MASTERS_TRACK_ENABLED (router self-gates with 404 when off).
app.use('/api/masters', mastersRoutes);

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

  try { require('./jobs/mlRetraining').stop(); } catch (e) { logger.warn('Failed to stop mlRetraining job', { error: e?.message }); }
  try { require('./jobs/dataRefresh').stop(); } catch (e) { logger.warn('Failed to stop dataRefresh job', { error: e?.message }); }
  try { require('./jobs/scraperScheduler').stop(); } catch (e) { logger.warn('Failed to stop scraperScheduler job', { error: e?.message }); }
  try { require('../jobs/orchestrator').stop(); } catch (e) { logger.warn('Failed to stop orchestrator job', { error: e?.message }); }
  if (deadlineSchedulerInstance) {
    try { deadlineSchedulerInstance.stop(); } catch (e) { logger.warn('Failed to stop deadline scheduler', { error: e?.message }); }
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
    const pool = dbManager.getDatabase();
    await validateStartupSchema(pool, logger);
    const schemaContractReport = await checkSchemaContracts(pool);
    logger.info('Schema contract report', formatSchemaContractReport(schemaContractReport));
    if (!schemaContractReport.ok) {
      throw new Error('Schema drift detected during startup');
    }
    const mvManager = new MaterializedViewManager({ pool, logger });
    await mvManager.ensureHealthy();
    logRecommendationEnvDiagnostics();

    // Seed colleges if the table is empty
    try {
      const { seedIfEmpty } = require('../scripts/seedColleges');
      await seedIfEmpty();
    } catch (seedErr) {
      logger.warn('College seeding skipped or failed:', { error: seedErr.message });
    }

    // Seed scholarships if the table is empty
    try {
      const { seedIfEmpty: seedScholarshipsIfEmpty } = require('../scripts/seedScholarships');
      await seedScholarshipsIfEmpty();
    } catch (scholarshipSeedErr) {
      logger.warn('Scholarship seeding skipped or failed:', { error: scholarshipSeedErr.message });
    }

    // Log college count so Render cold-start logs confirm data is available
    try {
      const { rows: colRows } = await pool.query('SELECT COUNT(*) AS count FROM canonical.mv_college_cards');
      logger.info(`Colleges table: ${colRows[0].count} rows`);
    } catch (_) {
      logger.warn('Could not read college row count');
    }

    const PORT = config.port;

    // Warm up exchange rates before the server starts accepting requests
    const { refreshExchangeRates } = require('./services/financialCostService');
    try {
      await refreshExchangeRates();
      logger.info('Exchange rates cached successfully');
    } catch (err) {
      logger.warn('Initial exchange rate fetch failed — falling back to DB seed', { error: err?.message });
    }

    server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${config.nodeEnv} mode`);
      logger.info('Database: PostgreSQL via DATABASE_URL');

      // Start keep-alive pings to prevent Render free-tier connection reaping
      startKeepAlive();

      // Legacy vector precompute disabled after canonical cutover.
      setImmediate(async () => {
        logger.info('Canonical cutover active: skipped legacy colleges vector precompute.');
      });

      // Refresh exchange rates every 6 hours
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

      // Scraper scheduling policy:
      // - Source of truth: GitHub Actions (Python pipeline)
      // - Legacy in-process JS schedulers are disabled by default
      // - Opt in only with ENABLE_LEGACY_SCRAPERS=true
      const legacyScrapersEnabled = process.env.ENABLE_LEGACY_SCRAPERS === 'true';
      if (legacyScrapersEnabled) {
        try {
          const dataRefreshJob = require('./jobs/dataRefresh');
          dataRefreshJob.start();
          logger.info('Data refresh cron jobs started');
        } catch (error) {
          logger.warn('Data refresh jobs failed to start:', { error: error.message });
        }

        try {
          const deadlineScrapingSchedulerModule = require('./jobs/deadlineScrapingScheduler');
          deadlineSchedulerInstance = typeof deadlineScrapingSchedulerModule === 'function'
            ? new deadlineScrapingSchedulerModule()
            : deadlineScrapingSchedulerModule;

          if (deadlineSchedulerInstance && typeof deadlineSchedulerInstance.setupCronJobs === 'function') {
            deadlineSchedulerInstance.setupCronJobs();
            logger.info('Deadline scraping scheduler started');
          } else {
            logger.warn('Deadline scraping scheduler module does not expose setupCronJobs()');
          }
        } catch (error) {
          logger.warn('Deadline scraping scheduler failed to start:', { error: error.message });
        }

        // Start Node orchestrator (additional Python scrapers + ML retrain)
        try {
          const orchestrator = require('../jobs/orchestrator');
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
      } else {
        logger.info('Scraper schedulers disabled in app runtime. Using GitHub Actions Python pipeline as source of truth.');
      }
    });
  } catch (err) {
    logger.error('Failed to start server:', { error: err.message });
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test' || process.env.ENABLE_APP_BOOT === 'true') {
  startServer();
}

module.exports = app;
