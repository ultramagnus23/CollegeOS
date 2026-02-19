const logger = require('../utils/logger');
const config = require('../config/env');

// Generate a unique request ID for tracking
function generateRequestId() {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Determine if error details should be hidden
const isProduction = () => config.nodeEnv === 'production';

const errorHandler = (err, req, res, next) => {
  const errorId = req.requestId || generateRequestId();
  
  // Log comprehensive error details (always, for debugging)
  logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.error(`[${errorId}] UNHANDLED ERROR CAUGHT`);
  logger.error(`[${errorId}] Endpoint: ${req.method} ${req.originalUrl}`);
  logger.error(`[${errorId}] User ID: ${req.user?.userId || 'Not authenticated'}`);
  logger.error(`[${errorId}] IP: ${req.ip}`);
  logger.error(`[${errorId}] Error Name: ${err.name || 'Unknown'}`);
  logger.error(`[${errorId}] Error Message: ${err.message || 'No message'}`);
  logger.error(`[${errorId}] Error Code: ${err.code || 'No code'}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    // Don't log sensitive fields
    const safeKeys = Object.keys(req.body).filter(k => 
      !['password', 'token', 'refreshToken', 'secret'].includes(k.toLowerCase())
    );
    logger.error(`[${errorId}] Request Body Keys: ${safeKeys.join(', ')}`);
  }
  
  if (err.stack) {
    const stackLines = err.stack.split('\n').slice(0, 8);
    logger.error(`[${errorId}] Stack Trace:\n${stackLines.join('\n')}`);
  }
  logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Default error response
  let status = 500;
  let message = 'Internal server error';
  let errorCode = 'INTERNAL_ERROR';
  
  // Handle specific error types
  if (err.message === 'User not found') {
    status = 404;
    message = err.message;
    errorCode = 'USER_NOT_FOUND';
  } else if (err.message === 'College not found') {
    status = 404;
    message = err.message;
    errorCode = 'COLLEGE_NOT_FOUND';
  } else if (err.message === 'Application not found') {
    status = 404;
    message = err.message;
    errorCode = 'APPLICATION_NOT_FOUND';
  } else if (err.message.includes('already exists')) {
    status = 400;
    message = err.message;
    errorCode = 'DUPLICATE_ENTRY';
  } else if (err.message.includes('Invalid email or password')) {
    // Generic auth error - don't reveal if email exists
    status = 401;
    message = 'Invalid email or password';
    errorCode = 'AUTH_FAILED';
  } else if (err.message.includes('Invalid')) {
    status = 400;
    message = err.message;
    errorCode = 'VALIDATION_ERROR';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    status = 400;
    // Don't reveal database structure
    message = isProduction() ? 'Invalid request' : 'Database constraint violation';
    errorCode = 'DB_CONSTRAINT_ERROR';
  } else if (err.code === 'SQLITE_ERROR') {
    status = 500;
    message = 'Database error';
    errorCode = 'DB_ERROR';
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token';
    errorCode = 'INVALID_TOKEN';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token expired';
    errorCode = 'TOKEN_EXPIRED';
  } else if (err.message === 'Not allowed by CORS') {
    status = 403;
    message = 'Origin not allowed';
    errorCode = 'CORS_ERROR';
  }
  
  // Build response object
  const errorResponse = {
    success: false,
    message,
    errorCode,
    errorId, // Include error ID so users can report it
    timestamp: new Date().toISOString(),
  };
  
  // Only include additional details in development
  if (!isProduction()) {
    errorResponse.path = req.originalUrl;
    errorResponse.method = req.method;
    errorResponse.stack = err.stack;
    errorResponse.details = {
      name: err.name,
      originalMessage: err.message,
      code: err.code
    };
  }
  
  res.status(status).json(errorResponse);
};

module.exports = errorHandler;
