/**
 * src/config/featureFlags.ts
 *
 * Client-side feature flags. The masters/grad track ships dark behind
 * MASTERS_TRACK_ENABLED so the existing undergrad onboarding/dashboard flow is
 * never altered for users until the flag is turned on (Phase 0 of
 * docs/MASTERS_TRACK_PLAN.md). Set VITE_MASTERS_TRACK_ENABLED=true to enable.
 */

const readBooleanEnv = (value: unknown): boolean =>
  String(value ?? '').toLowerCase() === 'true';

// import.meta.env is injected by Vite at build time.
const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};

export const featureFlags = {
  mastersTrackEnabled: readBooleanEnv(env.VITE_MASTERS_TRACK_ENABLED),
} as const;

export const isMastersTrackEnabled = (): boolean => featureFlags.mastersTrackEnabled;
