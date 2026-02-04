/**
 * Security Middleware
 * Input sanitization, suspicious activity detection, and request logging
 */
const securityConfig = require('../config/security');
const logger = require('../utils/logger');

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Add request ID to all requests for tracing
 */
const requestIdMiddleware = (req, res, next) => {
  req.requestId = generateRequestId();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

/**
 * Check for suspicious patterns in request data
 */
const detectSuspiciousPatterns = (data, path = '') => {
  const issues = [];
  
  if (typeof data === 'string') {
    for (const pattern of securityConfig.suspiciousPatterns) {
      if (pattern.test(data)) {
        issues.push({ path, pattern: pattern.toString() });
      }
    }
  } else if (typeof data === 'object' && data !== null) {
    for (const [key, value] of Object.entries(data)) {
      const nestedPath = path ? `${path}.${key}` : key;
      issues.push(...detectSuspiciousPatterns(value, nestedPath));
    }
  }
  
  return issues;
};

/**
 * Security validation middleware - checks for injection attempts
 */
const securityValidation = (req, res, next) => {
  try {
    // Check request body for suspicious patterns
    if (req.body) {
      const bodyIssues = detectSuspiciousPatterns(req.body);
      if (bodyIssues.length > 0) {
        logger.warn('Suspicious request body detected', {
          requestId: req.requestId,
          ip: req.ip,
          path: req.path,
          method: req.method,
          issues: bodyIssues,
          userAgent: req.get('User-Agent'),
        });
        
        return res.status(400).json({
          success: false,
          message: 'Invalid input detected',
          code: 'SECURITY_VALIDATION_FAILED',
        });
      }
    }

    // Check query parameters for suspicious patterns
    if (req.query && Object.keys(req.query).length > 0) {
      const queryIssues = detectSuspiciousPatterns(req.query);
      if (queryIssues.length > 0) {
        logger.warn('Suspicious query parameters detected', {
          requestId: req.requestId,
          ip: req.ip,
          path: req.path,
          method: req.method,
          issues: queryIssues,
          userAgent: req.get('User-Agent'),
        });
        
        return res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          code: 'SECURITY_VALIDATION_FAILED',
        });
      }
    }

    next();
  } catch (error) {
    // SECURITY FIX: Don't silently bypass on errors - reject the request
    logger.error('Security validation error', { 
      error: error.message,
      requestId: req.requestId,
      ip: req.ip,
      path: req.path
    });
    return res.status(500).json({
      success: false,
      message: 'Security validation failed',
      code: 'SECURITY_VALIDATION_ERROR',
    });
  }
};

/**
 * Log security-relevant request details
 */
const securityLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.debug('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId,
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.userId,
    };

    // Log failed authentication attempts
    if (req.path.includes('/auth') && res.statusCode === 401) {
      logger.warn('Failed authentication attempt', logData);
    }
    
    // Log errors
    if (res.statusCode >= 500) {
      logger.error('Server error response', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('Client error response', logData);
    }
  });

  next();
};

/**
 * Validate Content-Type for POST/PUT/PATCH requests
 */
const validateContentType = (req, res, next) => {
  const methodsRequiringBody = ['POST', 'PUT', 'PATCH'];
  
  if (methodsRequiringBody.includes(req.method)) {
    const contentType = req.get('Content-Type');
    
    // Skip for empty bodies
    if (req.headers['content-length'] === '0') {
      return next();
    }
    
    // Allow JSON and form data
    if (contentType && !contentType.includes('application/json') && 
        !contentType.includes('application/x-www-form-urlencoded')) {
      logger.warn('Invalid Content-Type', {
        requestId: req.requestId,
        contentType,
        path: req.path,
        ip: req.ip,
      });
      
      return res.status(415).json({
        success: false,
        message: 'Unsupported Media Type. Use application/json.',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      });
    }
  }
  
  next();
};

module.exports = {
  requestIdMiddleware,
  securityValidation,
  securityLogger,
  validateContentType,
};
