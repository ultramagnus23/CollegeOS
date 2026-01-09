require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    path: process.env.DATABASE_PATH || './database/college_app.db'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
  },
  
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL
  },
  
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000'
  },
  
  scraping: {
    userAgent: process.env.SCRAPING_USER_AGENT || 'CollegeAppBot/1.0',
    delayMs: parseInt(process.env.SCRAPING_DELAY_MS) || 2000,
    cacheTtlHours: parseInt(process.env.CACHE_TTL_HOURS) || 24
  },
  
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  }
};
