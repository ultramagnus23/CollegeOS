const logger = require('../utils/logger');
const config = require('../config/env');
const { sanitizeForLog } = require('../utils/security');

// Generate a unique request ID for tracking
function generateRequestId() {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Determine if error details should be hidden
const isProduction = () => config.nodeEnv === 'production';

const errorHandler = (err, req, res, next) => {
  const errorId = req.requestId || generateRequestId();
  
  // Log comprehensive error details using structured fields (not template literals with user data)
  logger.error('Unhandled error caught', {
    errorId,
    endpoint: `${req.method} ${sanitizeForLog(req.originalUrl)}`,
    userId: req.user?.userId || 'Not authenticated',
    ip: req.ip,
    errorName: err.name || 'Unknown',
    errorMessage: err.message || 'No message',
    errorCode: err.code || 'No code',
  });
  
  if (req.body && Object.keys(req.body).length > 0) {
    // Don't log sensitive fields
    const safeKeys = Object.keys(req.body).filter(k => 
      !['password', 'token', 'refreshToken', 'secret'].includes(k.toLowerCase())
    );
    logger.error('Request body keys', { errorId, keys: safeKeys.join(', ') });
  }
  
  if (err.stack) {
    const stackLines = err.stack.split('\n').slice(0, 8);
    logger.error('Stack trace', { errorId, stack: stackLines.join('\n') });
  }
  
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
    message = 'Resource already exists';
    errorCode = 'DUPLICATE_ENTRY';
  } else if (err.message.includes('Invalid email or password')) {
    // Generic auth error - don't reveal if email exists
    status = 401;
    message = 'Invalid email or password';
    errorCode = 'AUTH_FAILED';
  } else if (err.message.includes('Invalid')) {
    status = 400;
    message = 'Invalid request';
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
  // PostgreSQL error codes
  } else if (err.code === '23505') {
    status = 400;
    message = isProduction() ? 'Resource already exists' : (err.detail || 'Unique constraint violation');
    errorCode = 'DUPLICATE_ENTRY';
  } else if (err.code === '23503') {
    status = 400;
    message = isProduction() ? 'Invalid reference' : (err.detail || 'Foreign key constraint violation');
    errorCode = 'FOREIGN_KEY_VIOLATION';
  } else if (err.code === '23502') {
    status = 400;
    message = isProduction() ? 'Missing required field' : (err.detail || `Not-null constraint violation: ${err.column || 'unknown column'}`);
    errorCode = 'NOT_NULL_VIOLATION';
  } else if (err.code === '23514') {
    status = 400;
    message = isProduction() ? 'Invalid field value' : (err.detail || 'Check constraint violation');
    errorCode = 'CHECK_VIOLATION';
  } else if (err.code === '42703') {
    status = 500;
    message = isProduction() ? 'Database error' : `Undefined column: ${err.message}`;
    errorCode = 'UNDEFINED_COLUMN';
  } else if (err.code === '42P01') {
    status = 500;
    message = isProduction() ? 'Database error' : `Undefined table: ${err.message}`;
    errorCode = 'UNDEFINED_TABLE';
  } else if (err.code && err.code.startsWith('22')) {
    // Class 22 = data exception (invalid type, out-of-range values, etc.)
    status = 400;
    message = isProduction() ? 'Invalid data' : (err.detail || err.message);
    errorCode = 'DATA_EXCEPTION';
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
      code: err.code,
      // PostgreSQL-specific diagnostic fields
      detail: err.detail || undefined,
      hint:   err.hint   || undefined,
      column: err.column || undefined,
      table:  err.table  || undefined,
    };
  }
  
  res.status(status).json(errorResponse);
};

module.exports = errorHandler;
