'use strict';

function nowIso() {
  return new Date().toISOString();
}

function safeMessage(error) {
  if (!error) return 'unknown_error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error.message === 'string') return error.message;
  return 'unknown_error';
}

function toStack(error) {
  if (error instanceof Error && error.stack) return error.stack;
  return undefined;
}

function reportError(logger, {
  category = 'runtime',
  error,
  requestId = null,
  workflowCorrelationId = null,
  onboardingCorrelationId = null,
  scraperCorrelationId = null,
  context = {},
  level = 'error',
}) {
  const payload = {
    category,
    timestamp: nowIso(),
    requestId,
    workflowCorrelationId,
    onboardingCorrelationId,
    scraperCorrelationId,
    message: safeMessage(error),
    stack: toStack(error),
    context,
  };

  const sink = logger && typeof logger[level] === 'function' ? logger[level].bind(logger) : console.error;
  sink('error_report', payload);
  return payload;
}

module.exports = {
  reportError,
};
