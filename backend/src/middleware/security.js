/**
 * Security Middleware
 * Input sanitization, suspicious activity detection, and request logging
 */
const crypto = require('crypto');
const securityConfig = require('../config/security');
const { hashIdentifier, safeError, safeLog, sanitizeForLog } = require('../utils/safeLogger');

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId() {
  return crypto.randomUUID();
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
        safeLog('security.suspicious_request_body', {
          requestId: req.requestId,
          ip: sanitizeForLog(req.ip),
          path: sanitizeForLog(req.path),
          method: sanitizeForLog(req.method),
          issues: bodyIssues.map((issue) => ({
            path: sanitizeForLog(issue.path),
            pattern: sanitizeForLog(issue.pattern),
          })),
          userAgent: sanitizeForLog(req.get('User-Agent')),
        }, 'warn');
        
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
        safeLog('security.suspicious_query_params', {
          requestId: req.requestId,
          ip: sanitizeForLog(req.ip),
          path: sanitizeForLog(req.path),
          method: sanitizeForLog(req.method),
          issues: queryIssues.map((issue) => ({
            path: sanitizeForLog(issue.path),
            pattern: sanitizeForLog(issue.pattern),
          })),
          userAgent: sanitizeForLog(req.get('User-Agent')),
        }, 'warn');
        
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
    safeError('security.validation_error', {
      error,
      requestId: req.requestId,
      ip: sanitizeForLog(req.ip),
      path: sanitizeForLog(req.path),
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
  safeLog('security.incoming_request', {
    requestId: req.requestId,
    method: sanitizeForLog(req.method),
    path: sanitizeForLog(req.path),
    ip: sanitizeForLog(req.ip),
    userAgent: sanitizeForLog(req.get('User-Agent')),
    userId: req.user?.userId ? hashIdentifier(req.user.userId) : null,
  }, 'debug');

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId: req.requestId,
      method: sanitizeForLog(req.method),
      path: sanitizeForLog(req.path),
      statusCode: res.statusCode,
      durationMs: duration,
      ip: sanitizeForLog(req.ip),
      userId: req.user?.userId ? hashIdentifier(req.user.userId) : null,
    };

    // Log failed authentication attempts
    if (req.path.includes('/auth') && res.statusCode === 401) {
      safeLog('security.failed_authentication', logData, 'warn');
    }
    
    // Log errors
    if (res.statusCode >= 500) {
      safeError('security.server_error_response', logData);
    } else if (res.statusCode >= 400) {
      safeLog('security.client_error_response', logData, 'warn');
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
      safeLog('security.invalid_content_type', {
        requestId: req.requestId,
        contentType: sanitizeForLog(contentType),
        path: sanitizeForLog(req.path),
        ip: sanitizeForLog(req.ip),
      }, 'warn');
      
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
