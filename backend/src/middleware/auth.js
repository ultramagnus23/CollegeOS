const AuthService = require('../services/authService');
const logger = require('../utils/logger');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logger.warn('AUTH_MIDDLEWARE_NO_HEADER', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        message: 'No token provided',
        errorType: 'MISSING_TOKEN'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('AUTH_MIDDLEWARE_INVALID_FORMAT', {
        path: req.path,
        method: req.method,
        format: authHeader.substring(0, 20)
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid token format. Expected: Bearer <token>',
        errorType: 'INVALID_FORMAT'
      });
    }
    
    const token = authHeader.substring(7);
    
    if (!token || token.trim() === '') {
      logger.warn('AUTH_MIDDLEWARE_EMPTY_TOKEN', {
        path: req.path,
        method: req.method
      });
      return res.status(401).json({
        success: false,
        message: 'Empty token provided',
        errorType: 'EMPTY_TOKEN'
      });
    }
    
    logger.info('AUTH_HEADER_INJECTED', {
      path: req.path,
      method: req.method,
      tokenPrefix: token.substring(0, 15) + '...',
      hasBearer: true
    });
    
    const decoded = AuthService.verifyToken(token);
    if (!decoded || !decoded.userId) {
      logger.warn('AUTH_MIDDLEWARE_INVALID_PAYLOAD', {
        path: req.path,
        method: req.method,
        decodedPayload: decoded ? Object.keys(decoded) : null
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload',
        errorType: 'INVALID_PAYLOAD'
      });
    }
    
    logger.info('AUTH_MIDDLEWARE_SUCCESS', {
      path: req.path,
      method: req.method,
      userId: decoded.userId,
      email: decoded.email
    });
    
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('AUTH_MIDDLEWARE_FAILURE', {
      path: req.path,
      method: req.method,
      error: error.message,
      errorType: error.name
    });
    
    // Determine error type for better client handling
    let errorType = 'INVALID_TOKEN';
    if (error.message.includes('expired')) {
      errorType = 'TOKEN_EXPIRED';
    } else if (error.message.includes('malformed')) {
      errorType = 'TOKEN_MALFORMED';
    }
    
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      errorType
    });
  }
};

/**
 * Optional authentication - allows request to proceed without auth
 * but still attaches user if valid token is provided
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      req.user = null;
      return next();
    }
    
    const token = authHeader.substring(7);
    const decoded = AuthService.verifyToken(token);
    if (!decoded || !decoded.userId) {
      req.user = null;
      return next();
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    // Invalid token, continue without user (don't fail the request)
    req.user = null;
    next();
  }
};

/**
 * Admin-only middleware — returns 403 if the authenticated user is not an admin.
 * Must be used after `authenticate`.
 */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: admin access required',
      errorType: 'FORBIDDEN'
    });
  }
  next();
};

module.exports = { authenticate, optionalAuth, adminOnly };