const crypto = require('crypto');
const config = require('../config/env');
const { hashIdentifier, safeError, sanitizeForLog } = require('../utils/safeLogger');

// Generate a unique request ID for tracking
function generateRequestId() {
  return crypto.randomUUID();
}

// Determine if error details should be hidden
const isProduction = () => config.nodeEnv === 'production';

const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || generateRequestId();

  safeError('http.unhandled_error', {
    requestId,
    endpoint: {
      method: sanitizeForLog(req.method),
      path: sanitizeForLog(req.originalUrl),
    },
    userId: req.user?.userId ? hashIdentifier(req.user.userId) : null,
    ip: sanitizeForLog(req.ip),
    error: err,
  });

  if (req.body && Object.keys(req.body).length > 0) {
    safeError('http.request_body_summary', {
      requestId,
      keyCount: Object.keys(req.body).length,
      keys: Object.keys(req.body).map((key) => sanitizeForLog(key)),
    });
  }

  // Default error response
  let status = 500;
  let message = 'Internal server error';
  let errorCode = 'INTERNAL_ERROR';

  // Handle specific error types
  if (err?.message === 'User not found') {
    status = 404;
    message = err.message;
    errorCode = 'USER_NOT_FOUND';
  } else if (err?.message === 'College not found') {
    status = 404;
    message = err.message;
    errorCode = 'COLLEGE_NOT_FOUND';
  } else if (err?.message === 'Application not found') {
    status = 404;
    message = err.message;
    errorCode = 'APPLICATION_NOT_FOUND';
  } else if (err?.message && err.message.includes('already exists')) {
    status = 400;
    message = 'Resource already exists';
    errorCode = 'DUPLICATE_ENTRY';
  } else if (err?.message && err.message.includes('Invalid email or password')) {
    // Generic auth error - don't reveal if email exists
    status = 401;
    message = 'Invalid email or password';
    errorCode = 'AUTH_FAILED';
  } else if (err?.message && err.message.includes('Invalid')) {
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
  } else if (err?.message === 'Not allowed by CORS') {
    status = 403;
    message = 'Origin not allowed';
    errorCode = 'CORS_ERROR';
  }

  // Build response object
  const errorResponse = {
    success: false,
    error: sanitizeForLog(status >= 500 && isProduction() ? 'Internal server error' : message),
    requestId,
  };

  // Only include additional details in development
  if (!isProduction()) {
    errorResponse.details = {
      path: sanitizeForLog(req.originalUrl),
      method: sanitizeForLog(req.method),
      errorCode: sanitizeForLog(errorCode),
      name: sanitizeForLog(err?.name),
      originalMessage: sanitizeForLog(err?.message),
      code: sanitizeForLog(err?.code),
      // PostgreSQL-specific diagnostic fields
      detail: err?.detail ? sanitizeForLog(err.detail) : undefined,
      hint: err?.hint ? sanitizeForLog(err.hint) : undefined,
      column: err?.column ? sanitizeForLog(err.column) : undefined,
      table: err?.table ? sanitizeForLog(err.table) : undefined,
      stack: err?.stack ? sanitizeForLog(err.stack) : undefined,
    };
  }

  res.status(status).json(errorResponse);
};

module.exports = errorHandler;
