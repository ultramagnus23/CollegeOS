const AuthService = require('../services/authService');
const logger = require('../utils/logger');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logger.warn('Authentication failed: No Authorization header');
      return res.status(401).json({
        success: false,
        message: 'No token provided',
        errorType: 'MISSING_TOKEN'
      });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
      logger.warn('Authentication failed: Invalid Authorization header format', {
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
      logger.warn('Authentication failed: Empty token');
      return res.status(401).json({
        success: false,
        message: 'Empty token provided',
        errorType: 'EMPTY_TOKEN'
      });
    }
    
    const decoded = AuthService.verifyToken(token);
    
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication failed:', error);
    
    // Determine error type for better client handling
    let errorType = 'INVALID_TOKEN';
    if (error.message.includes('expired')) {
      errorType = 'TOKEN_EXPIRED';
    } else if (error.message.includes('malformed')) {
      errorType = 'TOKEN_MALFORMED';
    }
    
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token',
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
    
    req.user = decoded;
    next();
  } catch (error) {
    // Invalid token, continue without user (don't fail the request)
    req.user = null;
    next();
  }
};

module.exports = { authenticate, optionalAuth };