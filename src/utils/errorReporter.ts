export type ErrorCategory = 'auth' | 'onboarding' | 'workflow' | 'scraper' | 'network' | 'runtime';

export interface ErrorReportContext {
  requestId?: string | null;
  workflowCorrelationId?: string | null;
  onboardingCorrelationId?: string | null;
  scraperCorrelationId?: string | null;
  [key: string]: unknown;
}

export interface StructuredErrorReport {
  category: ErrorCategory;
  timestamp: string;
  message: string;
  stack?: string;
  context: ErrorReportContext;
}

function safeMessage(error: unknown): string {
  if (!error) return 'unknown_error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'unknown_error';
}

function safeStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

export function createCorrelationId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function reportError(
  category: ErrorCategory,
  error: unknown,
  context: ErrorReportContext = {},
  level: 'error' | 'warn' = 'error',
): StructuredErrorReport {
  const payload: StructuredErrorReport = {
    category,
    timestamp: new Date().toISOString(),
    message: safeMessage(error),
    stack: safeStack(error),
    context,
  };

  if (level === 'warn') {
    console.warn('[error-reporter]', payload);
  } else {
    console.error('[error-reporter]', payload);
  }

  return payload;
}
