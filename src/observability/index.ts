import { safeTrackSince } from '@/utils/safePerformance';

const METRIC_PREFIX = '[OBS]';

function isMetricLoggingEnabled() {
  return import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_OBS === '1';
}

export function trackMetric(name: string, payload: Record<string, unknown> = {}) {
  if (!isMetricLoggingEnabled()) return;
  try {
    console.info(`${METRIC_PREFIX} ${name}`, payload);
  } catch {
    // no-op
  }
}

export function trackDuration(name: string, startedAt: number, payload: Record<string, unknown> = {}) {
  const durationMs = safeTrackSince(name, startedAt, payload);
  trackMetric(name, { ...payload, durationMs });
  return durationMs;
}
