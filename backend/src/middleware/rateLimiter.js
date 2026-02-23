/**
 * Rate Limiting Middleware
 * Protects against brute-force attacks and API abuse
 */
const rateLimit = require('express-rate-limit');
const securityConfig = require('../config/security');
const logger = require('../utils/logger');

// Log rate limit hits for security monitoring
const rateLimitHandler = (req, res, options) => {
  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent'),
  });
  res.status(429).json(options.message);
};

// General API rate limiter (100 requests per 15 minutes)
const apiLimiter = rateLimit({
  ...securityConfig.rateLimits.general,
  handler: rateLimitHandler,
});

// Strict auth rate limiter (10 attempts per hour)
const authLimiter = rateLimit({
  ...securityConfig.rateLimits.auth,
  handler: rateLimitHandler,
});

// Very strict limiter for sensitive operations (5 per hour)
const sensitiveLimiter = rateLimit({
  ...securityConfig.rateLimits.sensitive,
  handler: rateLimitHandler,
});

// Batch endpoint limiter (20 per minute per user)
const batchLimiter = rateLimit({
  ...securityConfig.rateLimits.batch,
  handler: rateLimitHandler,
});

// Polling endpoint limiter (60 per hour per user)
const pollingLimiter = rateLimit({
  ...securityConfig.rateLimits.polling,
  handler: rateLimitHandler,
});

// Per-route rate limiting for specific endpoints
const createRouteLimiter = (windowMs, maxRequests, message) => {
  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      success: false,
      message: message || 'Too many requests for this endpoint',
      code: 'ROUTE_RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
    handler: rateLimitHandler,
  });
};

module.exports = {
  apiLimiter,
  authLimiter,
  sensitiveLimiter,
  batchLimiter,
  pollingLimiter,
  createRouteLimiter,
};
