'use strict';

/**
 * Firebase Admin bootstrap + ID-token verification.
 *
 * SECURITY: The Google sign-in endpoint must never trust a client-supplied
 * `googleId`/`email`. The browser obtains a signed Firebase ID token via the
 * Firebase JS SDK; the backend verifies that token here and derives the
 * identity from the verified claims. Without this, anyone could POST an
 * arbitrary email and take over that account.
 *
 * Configuration (any one of):
 *   - FIREBASE_SERVICE_ACCOUNT      : the service-account JSON, inline
 *   - FIREBASE_SERVICE_ACCOUNT_PATH : path to the service-account JSON file
 *   - GOOGLE_APPLICATION_CREDENTIALS: standard ADC path (auto-detected by SDK)
 *
 * If none are configured, verification is UNAVAILABLE. Callers must treat that
 * as fatal in production (see isVerificationAvailable / enforcement in the
 * auth controller).
 */

const fs = require('fs');
const logger = require('./logger');

let admin = null;
let app = null;
let initError = null;

function loadServiceAccount() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) {
    try {
      return JSON.parse(inline);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    }
  }
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null; // fall back to ADC (GOOGLE_APPLICATION_CREDENTIALS)
}

function init() {
  if (app || initError) return;
  try {
    // Lazy require so the dependency is only needed when Google auth is used.
    admin = require('firebase-admin');
  } catch (e) {
    initError = new Error('firebase-admin is not installed');
    return;
  }
  try {
    if (admin.apps && admin.apps.length) {
      app = admin.apps[0];
      return;
    }
    const serviceAccount = loadServiceAccount();
    if (serviceAccount) {
      app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      app = admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      initError = new Error('No Firebase credentials configured');
    }
  } catch (e) {
    initError = e;
  }
}

/**
 * @returns {boolean} true if ID-token verification can be performed.
 */
function isVerificationAvailable() {
  init();
  return Boolean(app) && !initError;
}

/**
 * Verify a Firebase ID token and return the decoded, trusted claims.
 * @param {string} idToken
 * @returns {Promise<{uid: string, email: string|null, name: string|null, emailVerified: boolean}>}
 * @throws {Error} if verification is unavailable or the token is invalid.
 */
async function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Missing Firebase ID token');
  }
  init();
  if (!isVerificationAvailable()) {
    throw new Error(`Firebase verification unavailable: ${initError ? initError.message : 'not initialized'}`);
  }
  const decoded = await admin.auth().verifyIdToken(idToken);
  return {
    uid: decoded.uid,
    email: decoded.email || null,
    name: decoded.name || null,
    emailVerified: Boolean(decoded.email_verified),
  };
}

module.exports = { isVerificationAvailable, verifyIdToken };
