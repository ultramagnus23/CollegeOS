// Product analytics, gated entirely behind VITE_POSTHOG_KEY. If it's unset
// (the default — no PostHog project has been created yet), every function
// here is a no-op, so the app behaves identically to before this file existed.
// To activate: create a free project at posthog.com (or self-host), set
// VITE_POSTHOG_KEY (and optionally VITE_POSTHOG_HOST for self-hosted/EU
// instances) in the frontend env.

let posthogInstance: typeof import('posthog-js').default | null = null;
let initPromise: Promise<typeof import('posthog-js').default | null> | null = null;

function ensureInit(): Promise<typeof import('posthog-js').default | null> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const key = import.meta.env.VITE_POSTHOG_KEY;
    if (!key) return null;
    const { default: posthog } = await import('posthog-js');
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      // Autocapture is off deliberately -- this is a college-planning app
      // handling minors' academic/financial data; only explicitly tracked
      // events below are sent, nothing scraped from the DOM automatically.
      autocapture: false,
      capture_pageview: false,
      persistence: 'localStorage',
    });
    posthogInstance = posthog;
    return posthog;
  })();
  return initPromise;
}

export function isEnabled(): boolean {
  return Boolean(import.meta.env.VITE_POSTHOG_KEY);
}

export async function trackEvent(name: string, properties?: Record<string, unknown>): Promise<void> {
  const ph = await ensureInit();
  if (!ph) return;
  ph.capture(name, properties);
}

export async function trackPageview(path: string): Promise<void> {
  const ph = await ensureInit();
  if (!ph) return;
  ph.capture('$pageview', { $current_url: path });
}

export async function identifyUser(userId: string, traits?: Record<string, unknown>): Promise<void> {
  const ph = await ensureInit();
  if (!ph) return;
  ph.identify(userId, traits);
}

export async function resetUser(): Promise<void> {
  if (!posthogInstance) return;
  posthogInstance.reset();
}
