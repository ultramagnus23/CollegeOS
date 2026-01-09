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

module.exports = { authenticate };