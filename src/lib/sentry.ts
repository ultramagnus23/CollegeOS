// Error monitoring, gated entirely behind VITE_SENTRY_DSN. If it's unset (the
// default — no Sentry project has been created yet), every function here is a
// no-op, so the app behaves exactly as it did before this file existed.
// To activate: create a project at sentry.io, set VITE_SENTRY_DSN in the
// frontend env (Vercel project settings, or a local .env for dev).

let initialized = false;

async function ensureInit(): Promise<typeof import('@sentry/react') | null> {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return null;
  const Sentry = await import('@sentry/react');
  if (!initialized) {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
      beforeSend(event) {
        // Strip auth tokens if they ever end up in a captured request/breadcrumb.
        if (event.request?.headers) {
          delete (event.request.headers as Record<string, unknown>).Authorization;
          delete (event.request.headers as Record<string, unknown>).authorization;
        }
        return event;
      },
    });
    initialized = true;
  }
  return Sentry;
}

export async function captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  const Sentry = await ensureInit();
  if (!Sentry) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function isEnabled(): boolean {
  return Boolean(import.meta.env.VITE_SENTRY_DSN);
}
