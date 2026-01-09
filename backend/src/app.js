const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const dbManager = require('./config/database');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

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
const aiCounselorRoutes = require('./routes/aiCounselor'); // NEW!
const searchRoutes = require('./routes/search');
// Create Express app
const app = express();

// Initialize database
dbManager.initialize();
dbManager.runMigrations();

// Security middleware
app.use(helmet());

// CORS configuration

app.use(cors({
  origin: 'http://localhost:8080',
  credentials: true
}));


// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
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
app.use('/api/counselor', aiCounselorRoutes);  // NEW!
app.use('/api/search', searchRoutes);

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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    dbManager.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    dbManager.close();
    process.exit(0);
  });
});

module.exports = app;