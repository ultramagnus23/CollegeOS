'use strict';

function requestDiagnostics(logger = console) {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId = req.requestId || res.getHeader('X-Request-Id') || null;

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const statusCode = res.statusCode;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
      const payload = {
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      };

      if (typeof logger[level] === 'function') {
        logger[level]('request_diagnostics', payload);
      } else if (typeof logger.info === 'function') {
        logger.info('request_diagnostics', payload);
      }
    });

    next();
  };
}

module.exports = { requestDiagnostics };
