export interface FirebaseErrorInfo {
  code: string;
  message: string;
}

export interface FirebaseIdentity {
  uid: string;
  email: string;
  displayName: string;
}

export interface AuthFlowResult {
  status: 'success' | 'failed' | 'cancelled' | 'redirect_started' | 'noop';
  attemptId: string;
  code?: string;
  message?: string;
}

export interface NormalizedLoginResponse {
  hasUser: boolean;
  accessToken: string | null;
}

const FIREBASE_POPUP_CLOSED_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
]);

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/popup-blocked':
    'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.',
  'auth/unauthorized-domain':
    'This domain is not authorised in your Firebase project. Add it to Authentication → Settings → Authorised Domains.',
  'auth/operation-not-allowed':
    'Google sign-in is not enabled. Turn it on in Firebase Console → Authentication → Sign-in method.',
  'auth/invalid-api-key':
    'Firebase API key is invalid. Check your VITE_FIREBASE_API_KEY environment variable.',
  'auth/network-request-failed':
    'Network error. Check your connection and try again.',
  'auth/internal-error':
    'Firebase internal error. Verify your Firebase project configuration.',
};

interface AuthLogger {
  (event: string, payload?: Record<string, unknown>): void;
}

interface LoginResponse {
  data?: {
    user?: unknown;
    tokens?: { accessToken?: string };
  };
}

function randomAttemptId(): string {
  const uuid = globalThis?.crypto?.randomUUID?.();
  if (uuid) return `auth_${uuid}`;
  return `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeError(error: unknown): FirebaseErrorInfo {
  if (!error || typeof error !== 'object') {
    return { code: 'unknown', message: 'Unknown authentication error' };
  }

  const source = error as Record<string, unknown>;
  return {
    code: typeof source.code === 'string' ? source.code : 'unknown',
    message: typeof source.message === 'string' ? source.message : 'Unknown authentication error',
  };
}

function resolveUserMessage(code: string): string {
  return FIREBASE_ERROR_MESSAGES[code] ?? 'Google sign-in failed. Please try again.';
}

function toFirebaseIdentity(firebaseUser: unknown): FirebaseIdentity | null {
  if (!firebaseUser || typeof firebaseUser !== 'object') return null;
  const source = firebaseUser as Record<string, unknown>;
  if (!source.uid) return null;

  return {
    uid: String(source.uid),
    email: typeof source.email === 'string' ? source.email : '',
    displayName: typeof source.displayName === 'string' ? source.displayName : '',
  };
}

export function createAuthEventLogger(logger: AuthLogger = console.info): AuthLogger {
  const isDev = (() => {
    try {
      return Boolean(import.meta?.env?.DEV);
    } catch {
      return false;
    }
  })();

  return (event: string, payload: Record<string, unknown> = {}) => {
    if (!isDev) return;
    try {
      logger('[auth]', { event, ...payload });
    } catch {
      // no-op
    }
  };
}

export function normalizeGoogleLoginResponse(response: unknown): NormalizedLoginResponse | null {
  if (!response || typeof response !== 'object') return null;
  const data = (response as LoginResponse).data && typeof (response as LoginResponse).data === 'object' ? (response as LoginResponse).data : null;
  if (!data) return null;
  const tokens = data.tokens && typeof data.tokens === 'object' ? data.tokens : null;
  const accessToken = tokens && typeof (tokens as Record<string, unknown>).accessToken === 'string' ? (tokens as Record<string, string>).accessToken : null;
  return {
    hasUser: Boolean(data.user),
    accessToken,
  };
}

interface GoogleSignInParams {
  auth: unknown;
  getRedirectResultFn?: (auth: unknown) => Promise<unknown>;
  loginWithGoogle: (uid: string, email: string, displayName: string | null) => Promise<LoginResponse>;
  log?: AuthLogger;
}

export async function completeRedirectGoogleSignIn({
  auth,
  getRedirectResultFn,
  loginWithGoogle,
  log = () => {},
}: GoogleSignInParams): Promise<AuthFlowResult> {
  const attemptId = randomAttemptId();
  log('redirect_result_check_started', { attemptId });

  try {
    const redirectResult = await getRedirectResultFn?.(auth);
    const identity = toFirebaseIdentity(redirectResult?.user);
    if (!identity) {
      log('redirect_result_not_found', { attemptId });
      return { status: 'noop', attemptId };
    }

    const backendResponse = await loginWithGoogle(identity.uid, identity.email, identity.displayName);
    const normalized = normalizeGoogleLoginResponse(backendResponse);
    log('redirect_backend_sync_completed', {
      attemptId,
      hasUser: Boolean(normalized?.hasUser),
      hasAccessToken: Boolean(normalized?.accessToken),
    });
    return { status: 'success', attemptId };
  } catch (error) {
    const safe = sanitizeError(error);
    log('redirect_result_failed', { attemptId, code: safe.code, message: safe.message });
    return {
      status: 'failed',
      attemptId,
      message: resolveUserMessage(safe.code),
      code: safe.code,
    };
  }
}

interface RunGoogleSignInParams {
  auth: unknown;
  googleProvider: unknown;
  signInWithPopupFn: (auth: unknown, provider: unknown) => Promise<unknown>;
  signInWithRedirectFn: (auth: unknown, provider: unknown) => Promise<void>;
  loginWithGoogle: (uid: string, email: string, displayName: string | null) => Promise<LoginResponse>;
  log?: AuthLogger;
}

export async function runGoogleSignInFlow({
  auth,
  googleProvider,
  signInWithPopupFn,
  signInWithRedirectFn,
  loginWithGoogle,
  log = () => {},
}: RunGoogleSignInParams): Promise<AuthFlowResult> {
  const attemptId = randomAttemptId();
  const startedAt = Date.now();
  log('attempt_started', { attemptId });

  try {
    const popupResult = await signInWithPopupFn(auth, googleProvider);
    const identity = toFirebaseIdentity(popupResult?.user);
    if (!identity) {
      log('popup_missing_identity', { attemptId });
      return {
        status: 'failed',
        attemptId,
        code: 'auth/malformed-response',
        message: 'Google sign-in failed due to an unexpected response.',
      };
    }

    const backendResponse = await loginWithGoogle(identity.uid, identity.email, identity.displayName);
    const normalized = normalizeGoogleLoginResponse(backendResponse);
    log('backend_sync_completed', {
      attemptId,
      hasUser: Boolean(normalized?.hasUser),
      hasAccessToken: Boolean(normalized?.accessToken),
      durationMs: Date.now() - startedAt,
    });
    return { status: 'success', attemptId };
  } catch (error) {
    const safe = sanitizeError(error);
    if (FIREBASE_POPUP_CLOSED_CODES.has(safe.code)) {
      log('popup_closed_by_user', { attemptId, code: safe.code });
      return { status: 'cancelled', attemptId, code: safe.code };
    }

    if (safe.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirectFn(auth, googleProvider);
        log('popup_blocked_redirect_started', { attemptId });
        return {
          status: 'redirect_started',
          attemptId,
          code: safe.code,
          message: resolveUserMessage(safe.code),
        };
      } catch (redirectError) {
        const redirectSafe = sanitizeError(redirectError);
        log('popup_blocked_redirect_failed', {
          attemptId,
          code: redirectSafe.code,
          message: redirectSafe.message,
        });
        return {
          status: 'failed',
          attemptId,
          code: redirectSafe.code,
          message: resolveUserMessage(redirectSafe.code),
        };
      }
    }

    log('popup_failed', { attemptId, code: safe.code, message: safe.message });
    return {
      status: 'failed',
      attemptId,
      code: safe.code,
      message: resolveUserMessage(safe.code),
    };
  }
}

export const authFlowConstants = {
  FIREBASE_POPUP_CLOSED_CODES,
  FIREBASE_ERROR_MESSAGES,
};
