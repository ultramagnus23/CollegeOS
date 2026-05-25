import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completeRedirectGoogleSignIn,
  normalizeGoogleLoginResponse,
  runGoogleSignInFlow,
} from '../../src/services/authFlow.js';
import { safeAsyncMeasure, safeMeasure, safeTrackDuration } from '../../src/utils/safePerformance.js';

test('runGoogleSignInFlow succeeds for valid popup user', async () => {
  let loginCalled = false;
  const result = await runGoogleSignInFlow({
    auth: {},
    googleProvider: {},
    signInWithPopupFn: async () => ({
      user: { uid: 'u-1', email: 'test@example.com', displayName: 'Test User' },
    }),
    signInWithRedirectFn: async () => {},
    loginWithGoogle: async () => {
      loginCalled = true;
      return { data: { user: { id: 1 }, tokens: { accessToken: 'token' } } };
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(loginCalled, true);
});

test('runGoogleSignInFlow handles popup cancellation gracefully', async () => {
  const result = await runGoogleSignInFlow({
    auth: {},
    googleProvider: {},
    signInWithPopupFn: async () => {
      const error = new Error('closed');
      error.code = 'auth/popup-closed-by-user';
      throw error;
    },
    signInWithRedirectFn: async () => {},
    loginWithGoogle: async () => ({ data: {} }),
  });

  assert.equal(result.status, 'cancelled');
});

test('runGoogleSignInFlow starts redirect when popup is blocked', async () => {
  let redirectCalled = false;
  const result = await runGoogleSignInFlow({
    auth: {},
    googleProvider: {},
    signInWithPopupFn: async () => {
      const error = new Error('popup blocked');
      error.code = 'auth/popup-blocked';
      throw error;
    },
    signInWithRedirectFn: async () => {
      redirectCalled = true;
    },
    loginWithGoogle: async () => ({ data: {} }),
  });

  assert.equal(result.status, 'redirect_started');
  assert.equal(redirectCalled, true);
});

test('runGoogleSignInFlow reports offline/network failures', async () => {
  const result = await runGoogleSignInFlow({
    auth: {},
    googleProvider: {},
    signInWithPopupFn: async () => {
      const error = new Error('Network request failed');
      error.code = 'auth/network-request-failed';
      throw error;
    },
    signInWithRedirectFn: async () => {},
    loginWithGoogle: async () => ({ data: {} }),
  });

  assert.equal(result.status, 'failed');
  assert.match(result.message, /Network error/i);
});

test('runGoogleSignInFlow handles malformed Firebase popup response', async () => {
  const result = await runGoogleSignInFlow({
    auth: {},
    googleProvider: {},
    signInWithPopupFn: async () => ({ user: null }),
    signInWithRedirectFn: async () => {},
    loginWithGoogle: async () => ({ data: {} }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'auth/malformed-response');
});

test('completeRedirectGoogleSignIn processes redirect success', async () => {
  let loginCalled = false;
  const result = await completeRedirectGoogleSignIn({
    auth: {},
    getRedirectResultFn: async () => ({
      user: { uid: 'u-2', email: 'redirect@example.com', displayName: 'Redirect User' },
    }),
    loginWithGoogle: async () => {
      loginCalled = true;
      return { data: { user: { id: 2 }, tokens: { accessToken: 'token-2' } } };
    },
  });

  assert.equal(result.status, 'success');
  assert.equal(loginCalled, true);
});

test('completeRedirectGoogleSignIn handles no redirect result', async () => {
  const result = await completeRedirectGoogleSignIn({
    auth: {},
    getRedirectResultFn: async () => null,
    loginWithGoogle: async () => ({ data: {} }),
  });

  assert.equal(result.status, 'noop');
});

test('normalizeGoogleLoginResponse is safe for malformed payloads', () => {
  assert.equal(normalizeGoogleLoginResponse(null), null);
  assert.equal(normalizeGoogleLoginResponse({ data: {} }).accessToken, null);
  assert.equal(
    normalizeGoogleLoginResponse({ data: { user: { id: 1 }, tokens: { accessToken: 'abc' } } }).accessToken,
    'abc',
  );
});

test('safe performance helpers never throw for standard usage', async () => {
  const end = safeMeasure('test.measure');
  const duration = end({ ok: true });
  assert.equal(typeof duration, 'number');

  const measuredValue = await safeAsyncMeasure('test.async', Promise.resolve('ok'));
  assert.equal(measuredValue, 'ok');

  const tracked = safeTrackDuration('test.track', () => 'value');
  assert.equal(tracked, 'value');
});

