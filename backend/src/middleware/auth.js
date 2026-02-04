const AuthService = require('../services/authService');
const logger = require('../utils/logger');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = AuthService.verifyToken(token);
    
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication failed:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
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