import { api } from './api';
import {
  CanonicalProfile,
  canonicalPartialProfileSchema,
  canonicalProfileSchema,
  canonicalProfileToApiPayload,
  normalizeApiProfileToCanonical,
} from '@/types/profile';
import { logProfileTelemetry } from '@/lib/profileTelemetry';
import { canonicalizeProfile, normalizeProfile, sanitizeProfile } from '@/utils/onboarding';

interface SaveOptions {
  userId?: number | null;
  expectedVersion?: number;
  maxRetries?: number;
  abortPrevious?: boolean;
}

let canonicalCache: CanonicalProfile | null = null;
let latestSeq = 0;
let activeController: AbortController | null = null;

const inflight = new Map<string, Promise<CanonicalProfile>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const hashPayload = (value: unknown) => JSON.stringify(value);

export const getCanonicalProfileCache = (): CanonicalProfile | null => canonicalCache;

export const setCanonicalProfileCache = (profile: CanonicalProfile | null) => {
  canonicalCache = profile;
};

export const fetchCanonicalProfile = async (): Promise<CanonicalProfile> => {
  const response = await api.getExtendedProfile();
  const normalized = normalizeApiProfileToCanonical((response as { data?: unknown })?.data ?? response);
  canonicalCache = normalized;
  return normalized;
};

export const saveCanonicalProfile = async (
  patch: Partial<CanonicalProfile>,
  options: SaveOptions = {},
): Promise<CanonicalProfile> => {
  const normalizedPatch = normalizeProfile(patch as Record<string, unknown>);
  const sanitizedPatch = sanitizeProfile(normalizedPatch);
  const canonicalizedPatch = canonicalizeProfile(sanitizedPatch);
  const validatedPatch = canonicalPartialProfileSchema.parse(canonicalizedPatch);

  const base = canonicalCache ?? (await fetchCanonicalProfile());
  const candidate = canonicalProfileSchema.parse({
    ...base,
    ...validatedPatch,
  });

  const payload = canonicalProfileToApiPayload(candidate);
  const requestId = `profile-save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const payloadHash = hashPayload({ payload, expectedVersion: options.expectedVersion ?? base.version });

  if (inflight.has(payloadHash)) {
    return inflight.get(payloadHash)!;
  }

  if (options.abortPrevious !== false) {
    activeController?.abort();
    activeController = new AbortController();
  } else if (!activeController) {
    activeController = new AbortController();
  }

  const controller = activeController;
  const seq = ++latestSeq;

  const task = (async () => {
    const maxRetries = options.maxRetries ?? 3;

    logProfileTelemetry({
      event: 'profile_save_started',
      userId: options.userId ?? null,
      requestId,
      metadata: { expectedVersion: options.expectedVersion ?? base.version },
    });

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        await api.canonicalSyncProfile({
          profile: payload,
          expectedVersion: options.expectedVersion ?? base.version,
          requestId,
        }, { signal: controller?.signal });

        const refreshed = await fetchCanonicalProfile();

        if (seq < latestSeq) {
          return canonicalCache ?? refreshed;
        }

        canonicalCache = refreshed;
        window.dispatchEvent(new CustomEvent('profile:updated', { detail: { requestId, profile: refreshed } }));

        logProfileTelemetry({
          event: 'profile_save_succeeded',
          userId: options.userId ?? null,
          requestId,
          attempt,
          metadata: { version: refreshed.version },
        });

        return refreshed;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          logProfileTelemetry({
            event: 'profile_save_retry',
            userId: options.userId ?? null,
            requestId,
            attempt,
            message: error instanceof Error ? error.message : 'Unknown save error',
          });
          await sleep(250 * attempt);
        }
      }
    }

    logProfileTelemetry({
      event: 'profile_save_failed',
      userId: options.userId ?? null,
      requestId,
      message: lastError instanceof Error ? lastError.message : 'Unknown save error',
    });

    throw lastError instanceof Error ? lastError : new Error('Failed to save canonical profile');
  })();

  inflight.set(payloadHash, task);

  try {
    return await task;
  } finally {
    inflight.delete(payloadHash);
  }
};
