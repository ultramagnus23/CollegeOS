const METRIC_PREFIX = '[OBS]';

export function trackMetric(name: string, payload: Record<string, unknown> = {}) {
  if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_FRONTEND_OBS === '1') {
    console.info(`${METRIC_PREFIX} ${name}`, payload);
  }
}

export function trackDuration(name: string, startedAt: number, payload: Record<string, unknown> = {}) {
  const durationMs = Math.max(0, Date.now() - startedAt);
  trackMetric(name, { ...payload, durationMs });
  return durationMs;
}
