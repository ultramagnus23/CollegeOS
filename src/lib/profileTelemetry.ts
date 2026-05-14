export type ProfileTelemetryEvent =
  | 'profile_save_started'
  | 'profile_save_retry'
  | 'profile_save_failed'
  | 'profile_save_succeeded'
  | 'profile_hydration_mismatch'
  | 'onboarding_abandoned';

interface TelemetryPayload {
  event: ProfileTelemetryEvent;
  userId?: number | null;
  requestId?: string;
  attempt?: number;
  message?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const STORAGE_KEY = 'collegeos_profile_telemetry';

export const logProfileTelemetry = (payload: Omit<TelemetryPayload, 'timestamp'>) => {
  const entry: TelemetryPayload = {
    ...payload,
    timestamp: new Date().toISOString(),
  };

  try {
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    const existing = existingRaw ? (JSON.parse(existingRaw) as TelemetryPayload[]) : [];
    const next = [...existing.slice(-99), entry];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // swallow telemetry errors
  }

  if (import.meta.env.DEV) {
    console.info('[profile-telemetry]', entry);
  }
};

export const readProfileTelemetry = (): TelemetryPayload[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as TelemetryPayload[];
  } catch {
    return [];
  }
};
