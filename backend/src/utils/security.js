/**
 * Security Utility Functions
 * Shared helpers for sanitizing user input across the backend
 */

const path = require('path');

const LOG_ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;
const LOG_CONTROL_PATTERN = /[\r\n\t]/g;
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Sanitize any value for safe logging.
 * Strips newlines, carriage returns, tabs, and ANSI escape codes.
 * @param {*} input - Value to sanitize
 * @returns {string} Sanitized string safe for logging
 */
function sanitizeLogInput(input) {
  return String(input ?? '')
    .replace(LOG_CONTROL_PATTERN, '_')
    .replace(LOG_ANSI_ESCAPE_PATTERN, '');
}

/**
 * Backwards-compatible alias for legacy call sites.
 * @param {*} input
 * @returns {string}
 */
function sanitizeForLog(input) {
  return sanitizeLogInput(input);
}

/**
 * Safely assign properties from source to target while blocking prototype pollution keys.
 * @param {Object} target
 * @param {Object} source
 * @param {Set<string>|string[]} [allowedKeys]
 * @returns {Object}
 */
function safeAssign(target, source, allowedKeys = null) {
  if (!source || typeof source !== 'object') return target;
  const allowSet = allowedKeys
    ? (allowedKeys instanceof Set ? allowedKeys : new Set(allowedKeys))
    : null;

  for (const key of Object.keys(source)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) continue;
    if (allowSet && !allowSet.has(key)) continue;
    target[key] = source[key];
  }
  return target;
}

/**
 * Validate and sanitize a file path against directory traversal.
 * @param {string} userInput - The user-supplied path component
 * @param {string} baseDir - The allowed base directory
 * @returns {string} The safe, resolved absolute path
 * @throws {Error} If the path escapes the base directory
 */
function sanitizePath(userInput, baseDir) {
  if (!userInput || !baseDir) {
    throw new Error('Both userInput and baseDir are required');
  }

  // Reject null bytes
  if (userInput.includes('\0')) {
    throw new Error('Invalid path: null bytes detected');
  }

  const resolvedBase = path.resolve(baseDir);
  const resolved = path.resolve(baseDir, path.normalize(userInput));

  // Ensure resolved path is within the base directory
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error('Invalid path: directory traversal detected');
  }

  return resolved;
}

/**
 * Strip prototype pollution keys from an object.
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object without dangerous prototype keys
 */
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const cleaned = Object.create(null);

  for (const key of Object.keys(obj)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) continue;
    const value = obj[key];
    cleaned[key] = (typeof value === 'object' && value !== null)
      ? sanitizeObject(value)
      : value;
  }

  return cleaned;
}

/**
 * Safely parse JSON with try/catch.
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Value to return if parsing fails (default: null)
 * @returns {*} Parsed value or fallback
 */
function safeJsonParse(str, fallback = null) {
  if (typeof str !== 'string') return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

module.exports = {
  sanitizeLogInput,
  sanitizeForLog,
  safeAssign,
  sanitizePath,
  sanitizeObject,
  safeJsonParse,
};
