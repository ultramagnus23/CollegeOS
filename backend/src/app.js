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
const researchRoutes = require('./routes/research');
const profileRoutes = require('./routes/profile');
const recommendationsRoutes = require('./routes/recommendations');
const timelineRoutes = require('./routes/timeline');
const aiCounselorRoutes = require('./routes/aiCounselor');
const searchRoutes = require('./routes/search');
const intelligentSearchRoutes = require('./routes/intelligentSearch');
const chatbotRoutes = require('./routes/chatbot');
const chancingRoutes = require('./routes/chancing');
const mlRoutes = require('./routes/ml');
const fitRoutes = require('./routes/fit');
const tasksRoutes = require('./routes/tasks');
const riskRoutes = require('./routes/risk');

// Create Express app
const app = express();

// Trust proxy for proper IP detection behind reverse proxies
app.set('trust proxy', 1);

// Initialize database
dbManager.initialize();
dbManager.runMigrations();

// ===== SECURITY MIDDLEWARE (Order matters!) =====

// Add request ID for tracing
app.use(requestIdMiddleware);

// Security headers with enhanced Helmet configuration
// Note: CSP is enabled in all environments for better security
app.use(helmet({
  contentSecurityPolicy: securityConfig.helmet.contentSecurityPolicy,
  crossOriginEmbedderPolicy: false, // Needed for some integrations
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
app.use('/api/research', researchRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/counselor', aiCounselorRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/intelligent-search', intelligentSearchRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/chancing', chancingRoutes);
app.use('/api/ml', mlRoutes);
app.use('/api/fit', fitRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/risk', riskRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use(errorHandler);

// Start server
const PORT = config.port;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${config.nodeEnv} mode`);
  logger.info(`Database: ${config.database.path}`);
  
  // Start ML retraining jobs (only in production or if explicitly enabled)
  if (config.nodeEnv === 'production' || process.env.ENABLE_ML_JOBS === 'true') {
    try {
      const mlRetrainingJob = require('./jobs/mlRetraining');
      mlRetrainingJob.start();
      logger.info('ML retraining jobs started');
    } catch (error) {
      logger.warn('ML retraining jobs failed to start:', error.message);
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  
  // Stop ML jobs
  try {
    const mlRetrainingJob = require('./jobs/mlRetraining');
    mlRetrainingJob.stop();
  } catch (e) { /* ignore */ }
  
  server.close(() => {
    logger.info('HTTP server closed');
    dbManager.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  
  // Stop ML jobs
  try {
    const mlRetrainingJob = require('./jobs/mlRetraining');
    mlRetrainingJob.stop();
  } catch (e) { /* ignore */ }
  
  server.close(() => {
    logger.info('HTTP server closed');
    dbManager.close();
    process.exit(0);
  });
});

module.exports = app;