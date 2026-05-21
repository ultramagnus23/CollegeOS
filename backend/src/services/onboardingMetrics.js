'use strict';

const { safeLog } = require('../utils/safeLogger');

const metrics = {
  onboarding_validation_failures: 0,
  onboarding_partial_saves: 0,
  onboarding_success_total: 0,
  malformed_payload_count: 0,
};

function recordValidationFailure() {
  metrics.onboarding_validation_failures += 1;
}

function recordPartialSave() {
  metrics.onboarding_partial_saves += 1;
}

function recordMalformedPayload() {
  metrics.malformed_payload_count += 1;
}

function recordSuccess() {
  metrics.onboarding_success_total += 1;
}

function getSnapshot() {
  const total = metrics.onboarding_success_total + metrics.onboarding_validation_failures;
  return {
    ...metrics,
    onboarding_success_rate: total > 0 ? Number((metrics.onboarding_success_total / total).toFixed(4)) : 1,
  };
}

function logSnapshot(context = {}) {
  safeLog('onboarding.metrics', {
    context,
    metrics: getSnapshot(),
  });
}

module.exports = {
  getSnapshot,
  logSnapshot,
  recordMalformedPayload,
  recordPartialSave,
  recordSuccess,
  recordValidationFailure,
};
