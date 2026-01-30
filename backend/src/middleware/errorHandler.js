const logger = require('../utils/logger');

// Generate a unique request ID for tracking
function generateRequestId() {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

const errorHandler = (err, req, res, next) => {
  const errorId = generateRequestId();
  
  // Log comprehensive error details
  logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.error(`[${errorId}] UNHANDLED ERROR CAUGHT`);
  logger.error(`[${errorId}] Endpoint: ${req.method} ${req.originalUrl}`);
  logger.error(`[${errorId}] User ID: ${req.user?.userId || 'Not authenticated'}`);
  logger.error(`[${errorId}] Error Name: ${err.name || 'Unknown'}`);
  logger.error(`[${errorId}] Error Message: ${err.message || 'No message'}`);
  logger.error(`[${errorId}] Error Code: ${err.code || 'No code'}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    logger.error(`[${errorId}] Request Body Keys: ${Object.keys(req.body).join(', ')}`);
  }
  
  if (err.stack) {
    const stackLines = err.stack.split('\n').slice(0, 8);
    logger.error(`[${errorId}] Stack Trace:\n${stackLines.join('\n')}`);
  }
  logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Default error
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
  } else if (err.message.includes('Invalid')) {
    status = 400;
    message = err.message;
    errorCode = 'VALIDATION_ERROR';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    status = 400;
    message = 'Database constraint violation';
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
  }
  
  // Response object
  const errorResponse = {
    success: false,
    message,
    errorCode,
    errorId, // Include error ID so users can report it
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };
  
  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
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
