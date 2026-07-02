'use strict';

// Error monitoring, gated entirely behind SENTRY_DSN. If it's unset (the
// default — no Sentry project has been created yet), every function here is a
// no-op, so the app behaves exactly as it did before this file existed.
// To activate: create a project at sentry.io, set SENTRY_DSN in backend/.env
// (or the SENTRY_DSN GitHub secret / Render env var for deployed environments).

const DSN = process.env.SENTRY_DSN || '';
let Sentry = null;

if (DSN) {
  // Lazy require so environments without the DSN never pay for loading the SDK.
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
    // Errors already go through safeLogger's sanitizeForLog before reaching
    // our own logs; beforeSend is a second layer specifically for whatever
    // Sentry's own stack/breadcrumb capture picks up that our logger doesn't
    // see, since Sentry receives the raw error object independently.
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
}

function isEnabled() {
  return Boolean(Sentry);
}

function captureException(err, context = {}) {
  if (!Sentry) return;
  Sentry.captureException(err, { extra: context });
}

function captureMessage(message, level = 'info') {
  if (!Sentry) return;
  Sentry.captureMessage(message, level);
}

function setUser(userId) {
  if (!Sentry) return;
  // Hash rather than store the raw ID, matching the hashIdentifier pattern
  // already used for user IDs elsewhere in logging (backend/src/utils/safeLogger.js).
  Sentry.setUser(userId ? { id: String(userId) } : null);
}

module.exports = { isEnabled, captureException, captureMessage, setUser, Sentry };
