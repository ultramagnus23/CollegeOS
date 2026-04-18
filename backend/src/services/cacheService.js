// backend/src/services/cacheService.js
// Redis-backed cache with a no-op fallback when REDIS_URL is not set.
//
// All cache operations are safe to call without try/catch — Redis errors
// are caught internally, logged, and surfaced as null / no-ops so the
// application continues to function without a Redis connection.
//
// The ioredis client is a singleton: one connection for the lifetime of
// the process.  Do not require() this module before the server starts.

'use strict';

const logger = require('../utils/logger');

// ── Singleton client ──────────────────────────────────────────────────────────

let _client = null;

function _getClient() {
  if (_client) return _client;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // Cache disabled — all reads return null, all writes are no-ops.
    logger.info('cacheService: REDIS_URL not set — running without cache');
    return null;
  }

  try {
    // Lazy-require so the module is still importable when ioredis is not installed.
    const Redis = require('ioredis');
    _client = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    _client.on('connect', () => logger.info('cacheService: Redis connected'));
    _client.on('error', (err) => logger.warn('cacheService: Redis error', { error: err.message }));
    _client.on('close', () => logger.warn('cacheService: Redis connection closed'));
  } catch (err) {
    logger.warn('cacheService: failed to initialise Redis client', { error: err.message });
    _client = null;
  }

  return _client;
}

// Initialise the client eagerly at module load time.
_getClient();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read a value from Redis.
 * Returns the parsed value on hit, or null on miss / error.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function get(key) {
  const client = _getClient();
  if (!client) return null;

  try {
    const raw = await client.get(key);
    if (raw === null) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn('cacheService.get failed', { key, error: err.message });
    return null;
  }
}

/**
 * Write a value to Redis with an expiry.
 * Silently no-ops on error or when Redis is unavailable.
 *
 * @param {string} key
 * @param {any}    value       Must be JSON-serialisable.
 * @param {number} ttlSeconds  Expiry in seconds.
 * @returns {Promise<void>}
 */
async function set(key, value, ttlSeconds) {
  const client = _getClient();
  if (!client) return;

  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn('cacheService.set failed', { key, error: err.message });
  }
}

/**
 * Delete a key from Redis.
 * Silently no-ops on error or when Redis is unavailable.
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
async function del(key) {
  const client = _getClient();
  if (!client) return;

  try {
    await client.del(key);
  } catch (err) {
    logger.warn('cacheService.del failed', { key, error: err.message });
  }
}

module.exports = { get, set, del };
