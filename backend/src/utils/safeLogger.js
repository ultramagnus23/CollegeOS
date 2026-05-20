'use strict';

const crypto = require('crypto');
const config = require('../config/env');
const logger = require('./logger');

const DEFAULT_MAX_LENGTH = 300;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*[A-Za-z]/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const WHITESPACE_PATTERN = /\s+/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\b/g;
const TOKEN_PATTERN = /\b(?:bearer|token)\s+[A-Za-z0-9\-._~+/=]+\b/gi;
const COOKIE_PATTERN = /\b(?:cookie|set-cookie)\s*:\s*[^;]+/gi;
const SESSION_PATTERN = /\b(?:session(?:id)?|sid)[\s:=_-]*[A-Za-z0-9._-]{6,}\b/gi;
const PASSWORD_PATTERN = /\b(?:password|passwd|pwd)\s*[:=]\s*[^,\s]+/gi;
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|email|jwt|password|profile|secret|session|token|body|headers?)/i;
const HASHED_IDENTIFIER_KEY_PATTERN = /(?:^|_)(user(?:id)?|account(?:id)?|owner(?:id)?|actor(?:id)?)(?:$|_)/i;
const OMIT_IN_PRODUCTION_KEY_PATTERN = /(^sql$|params|payload|stack|fullError)/i;

function hashIdentifier(value) {
  if (value === null || value === undefined || value === '') return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function truncateLogValue(value, maxLength = DEFAULT_MAX_LENGTH) {
  const stringValue = String(value ?? '');
  if (stringValue.length <= maxLength) return stringValue;
  return `${stringValue.slice(0, maxLength)}...[truncated]`;
}

function sanitizeString(value, maxLength = DEFAULT_MAX_LENGTH) {
  return truncateLogValue(
    String(value ?? '')
      .replace(ANSI_ESCAPE_PATTERN, '')
      .replace(CONTROL_CHAR_PATTERN, ' ')
      .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
      .replace(JWT_PATTERN, '[REDACTED_JWT]')
      .replace(TOKEN_PATTERN, '[REDACTED_TOKEN]')
      .replace(COOKIE_PATTERN, '[REDACTED_COOKIE]')
      .replace(SESSION_PATTERN, '[REDACTED_SESSION]')
      .replace(PASSWORD_PATTERN, '[REDACTED_PASSWORD]')
      .replace(WHITESPACE_PATTERN, ' ')
      .trim(),
    maxLength
  );
}

function sanitizeErrorObject(error) {
  if (!error) return null;
  const sanitized = {
    name: sanitizeString(error.name || 'Error'),
    message: sanitizeString(error.message || 'Unknown error'),
    code: error.code ? sanitizeString(error.code) : null,
  };

  if (!config.nodeEnv || config.nodeEnv !== 'production') {
    sanitized.stack = sanitizeString(error.stack || '');
    if (error.details) sanitized.details = sanitizeForLog(error.details);
    if (error.hint) sanitized.hint = sanitizeString(error.hint);
  }

  return sanitized;
}

function sanitizeForLog(value, options = {}) {
  const { key = '', maxLength = DEFAULT_MAX_LENGTH, depth = 0, seen = new WeakSet() } = options;

  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return sanitizeString(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return sanitizeString(value.toString(), maxLength);

  if (value instanceof Error) {
    return sanitizeErrorObject(value);
  }

  if (HASHED_IDENTIFIER_KEY_PATTERN.test(key)) {
    return hashIdentifier(value);
  }

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    if (depth >= 4) return '[TruncatedObject]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, 25).map((item) => sanitizeForLog(item, {
        key,
        maxLength,
        depth: depth + 1,
        seen,
      }));
    }

    const sanitizedObject = {};
    for (const [objectKey, objectValue] of Object.entries(value)) {
      if (config.nodeEnv === 'production' && OMIT_IN_PRODUCTION_KEY_PATTERN.test(objectKey)) {
        sanitizedObject[objectKey] = '[OMITTED_IN_PRODUCTION]';
        continue;
      }

      sanitizedObject[objectKey] = sanitizeForLog(objectValue, {
        key: objectKey,
        maxLength,
        depth: depth + 1,
        seen,
      });
    }
    return sanitizedObject;
  }

  return sanitizeString(String(value), maxLength);
}

function safeLog(event, payload = {}, level = 'info') {
  const sanitizedEvent = sanitizeString(event);
  const sanitizedPayload = sanitizeForLog(payload);
  logger.log({
    level,
    message: sanitizedEvent,
    ...(sanitizedPayload && typeof sanitizedPayload === 'object' ? sanitizedPayload : { value: sanitizedPayload }),
  });
}

function safeError(event, payload = {}) {
  safeLog(event, payload, 'error');
}

module.exports = {
  hashIdentifier,
  safeError,
  safeLog,
  sanitizeForLog,
  truncateLogValue,
};
