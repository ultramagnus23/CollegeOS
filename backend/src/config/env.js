require('dotenv').config();
const path = require('path');
const crypto = require('crypto');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Security: Generate secure random secrets for development only
// In production, secrets MUST be explicitly set via environment variables
function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (isProduction) {
    console.error('SECURITY ERROR: JWT_SECRET must be set in production!');
    process.exit(1);
  }
  // Generate a random secret for development (not persistent across restarts)
  console.warn('WARNING: Using auto-generated JWT_SECRET. Set JWT_SECRET env var for production.');
  return crypto.randomBytes(64).toString('hex');
}

function getRefreshSecret() {
  if (process.env.REFRESH_TOKEN_SECRET) {
    return process.env.REFRESH_TOKEN_SECRET;
  }
  if (isProduction) {
    console.error('SECURITY ERROR: REFRESH_TOKEN_SECRET must be set in production!');
    process.exit(1);
  }
  // Generate a random secret for development (not persistent across restarts)
  console.warn('WARNING: Using auto-generated REFRESH_TOKEN_SECRET. Set REFRESH_TOKEN_SECRET env var for production.');
  return crypto.randomBytes(64).toString('hex');
}

// Validate frontend URL in production
function getFrontendUrl() {
  const url = process.env.FRONTEND_URL || 'http://localhost:3000';
  if (isProduction && url.startsWith('http://localhost')) {
    console.warn('WARNING: FRONTEND_URL is set to localhost in production mode.');
  }
  return url;
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv,
  isProduction,
  
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../database/college_app.db')
  },
  
  jwt: {
    secret: getJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: getRefreshSecret(),
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
  },
  
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL
  },
  
  frontend: {
    url: getFrontendUrl()
  },
  
  scraping: {
    userAgent: process.env.SCRAPING_USER_AGENT || 'CollegeAppBot/1.0',
    delayMs: parseInt(process.env.SCRAPING_DELAY_MS) || 2000,
    cacheTtlHours: parseInt(process.env.CACHE_TTL_HOURS) || 24
  },
  
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  // API Keys - validated at runtime
  apiKeys: {
    huggingFace: process.env.HUGGINGFACE_API_KEY || null
  }
};
