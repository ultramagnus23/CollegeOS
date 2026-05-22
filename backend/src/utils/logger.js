const winston = require('winston');
const config = require('../config/env');
const { sanitizeLogInput } = require('./security');

const sanitizeLogMeta = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeLogInput(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: sanitizeLogInput(value.name),
      message: sanitizeLogInput(value.message),
      stack: sanitizeLogInput(value.stack),
    };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeLogMeta(item));
  if (typeof value === 'object') {
    const cleaned = Object.create(null);
    for (const [key, nested] of Object.entries(value)) {
      cleaned[key] = sanitizeLogMeta(nested);
    }
    return cleaned;
  }
  return sanitizeLogInput(String(value));
};

const sanitizeLogRecord = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = sanitizeLogInput(info.message);
  } else if (info.message !== undefined) {
    info.message = sanitizeLogMeta(info.message);
  }

  for (const [key, value] of Object.entries(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'stack') continue;
    info[key] = sanitizeLogMeta(value);
  }

  if (typeof info.stack === 'string') {
    info.stack = sanitizeLogInput(info.stack);
  }
  return info;
});

const logger = winston.createLogger({
  level: config.nodeEnv === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    sanitizeLogRecord(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (config.nodeEnv === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;