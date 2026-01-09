const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  // Default error
  let status = 500;
  let message = 'Internal server error';
  
  // Handle specific error types
  if (err.message === 'User not found' || err.message === 'College not found') {
    status = 404;
    message = err.message;
  } else if (err.message.includes('already exists') || err.message.includes('Invalid')) {
    status = 400;
    message = err.message;
  }
  
  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
