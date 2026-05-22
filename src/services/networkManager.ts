export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  retries: 2,
  baseDelayMs: 300,
  timeoutMs: 10000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetriableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('timeout') ||
    message.includes('abort')
  );
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export async function fetchWithResilience(input: RequestInfo | URL, init: RequestInit = {}, options: RetryOptions = {}) {
  const cfg = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= cfg.retries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), cfg.timeoutMs);

    try {
      if (!isOnline()) {
        throw new Error('offline');
      }

      const response = await fetch(input, {
        ...init,
        signal: init.signal || controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= cfg.retries || !isRetriableError(error)) {
        throw error;
      }
      const backoff = cfg.baseDelayMs * Math.pow(2, attempt);
      await sleep(backoff);
    }
    attempt += 1;
  }

  throw lastError || new Error('network_request_failed');
}
