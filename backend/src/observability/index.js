'use strict';

const { sanitizeForLog } = require('../utils/safeLogger');

function requestMetricsMiddleware(logger = console) {
  return (req, res, next) => {
    const startedAt = Date.now();
    const requestId = req.requestId || null;

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      logger.info('http_request_completed', {
        requestId,
        method: sanitizeForLog(req.method),
        path: sanitizeForLog(req.originalUrl),
        statusCode: res.statusCode,
        durationMs,
        userAgent: sanitizeForLog(req.get('user-agent') || ''),
      });
    });

    next();
  };
}

module.exports = {
  requestMetricsMiddleware,
};
