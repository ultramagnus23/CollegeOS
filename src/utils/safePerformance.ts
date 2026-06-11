interface PerformancePayload {
  ok?: boolean;
  durationMs: number;
  error?: string;
  [key: string]: unknown;
}

type MeasureEndFn = (payload?: PerformancePayload) => number;

type TrackFn<T = unknown> = () => T | Promise<T>;

const DEV_PREFIX = '[safe-performance]';

function isDevEnvironment(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta?.env) {
      if (typeof import.meta.env.DEV === 'boolean') return import.meta.env.DEV;
      if (typeof import.meta.env.MODE === 'string') return import.meta.env.MODE !== 'production';
    }
  } catch {
    // ignore
  }

  if (typeof process !== 'undefined' && process?.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }

  return false;
}

function devLog(message: string, payload?: PerformancePayload) {
  if (!isDevEnvironment()) return;
  if (payload === undefined) {
    console.info(`${DEV_PREFIX} ${message}`);
    return;
  }
  console.info(`${DEV_PREFIX} ${message}`, payload);
}

function nowMs(): number {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.performance?.now) {
      return globalThis.performance.now();
    }
  } catch {
    // ignore
  }
  return Date.now();
}

export function safeMeasure(name: string): MeasureEndFn {
  const startedAt = nowMs();
  return (payload: PerformancePayload = {}): number => {
    try {
      const durationMs = Math.max(0, Math.round((nowMs() - startedAt) * 100) / 100);
      devLog(`${name}`, { ...payload, durationMs });
      return durationMs;
    } catch {
      return 0;
    }
  };
}

export async function safeAsyncMeasure<T>(name: string, promise: Promise<T>): Promise<T> {
  const end = safeMeasure(name);
  try {
    const result = await promise;
    end({ ok: true });
    return result;
  } catch (error) {
    end({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}

export function safeTrackDuration<T = unknown>(name: string, fn: TrackFn<T>): T | Promise<T> {
  const end = safeMeasure(name);
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return (result as Promise<T>)
        .then((value: T) => {
          end({ ok: true });
          return value;
        })
        .catch((error: unknown) => {
          end({
            ok: false,
            error: error instanceof Error ? error.message : 'unknown_error',
          });
          throw error;
        });
    }

    end({ ok: true });
    return result;
  } catch (error) {
    end({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    throw error;
  }
}

export function safeTrackSince(name: string, startedAt: number, payload: PerformancePayload = {}): number {
  try {
    const endAt = nowMs();
    const durationMs = Math.max(0, Math.round((endAt - startedAt) * 100) / 100);
    devLog(`${name}`, { ...payload, durationMs });
    return durationMs;
  } catch {
    return 0;
  }
}
