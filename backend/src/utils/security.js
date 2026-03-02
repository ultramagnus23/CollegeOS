/**
 * Security Utility Functions
 * Shared helpers for sanitizing user input across the backend
 */

const path = require('path');

/**
 * Sanitize a string for safe logging.
 * Strips newlines, carriage returns, and ANSI escape codes to prevent log injection.
 * @param {*} input - Value to sanitize
 * @returns {string} Sanitized string safe for logging
 */
function sanitizeForLog(input) {
  if (input === null || input === undefined) return '';
  const str = String(input);
  // Strip newlines, carriage returns, and ANSI escape codes
  return str
    .replace(/[\r\n]+/g, ' ')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
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

  const resolved = path.resolve(baseDir, path.normalize(userInput));

  // Ensure resolved path starts with the base directory
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep) && resolved !== path.resolve(baseDir)) {
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

  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
  const cleaned = Object.create(null);

  for (const key of Object.keys(obj)) {
    if (dangerousKeys.includes(key)) continue;
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
  sanitizeForLog,
  sanitizePath,
  sanitizeObject,
  safeJsonParse,
};
