const DEV_PREFIX = '[safe-performance]';

function isDevEnvironment() {
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

function devLog(message, payload) {
  if (!isDevEnvironment()) return;
  if (payload === undefined) {
    console.info(`${DEV_PREFIX} ${message}`);
    return;
  }
  console.info(`${DEV_PREFIX} ${message}`, payload);
}

function nowMs() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.performance?.now) {
      return globalThis.performance.now();
    }
  } catch {
    // ignore
  }
  return Date.now();
}

export function safeMeasure(name) {
  const startedAt = nowMs();
  return (payload = {}) => {
    try {
      const durationMs = Math.max(0, Math.round((nowMs() - startedAt) * 100) / 100);
      devLog(`${name}`, { ...payload, durationMs });
      return durationMs;
    } catch {
      return 0;
    }
  };
}

export async function safeAsyncMeasure(name, promise) {
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

export function safeTrackDuration(name, fn) {
  const end = safeMeasure(name);
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then((value) => {
          end({ ok: true });
          return value;
        })
        .catch((error) => {
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

export function safeTrackSince(name, startedAt, payload = {}) {
  try {
    const endAt = nowMs();
    const durationMs = Math.max(0, Math.round((endAt - startedAt) * 100) / 100);
    devLog(`${name}`, { ...payload, durationMs });
    return durationMs;
  } catch {
    return 0;
  }
}
