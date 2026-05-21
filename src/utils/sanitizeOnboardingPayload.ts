const isBlank = (value: unknown): boolean => typeof value === 'string' && value.trim() === '';

const cleanScalar = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isBlank(value)) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;
    const numericPattern = /^-?\d+(\.\d+)?$/;
    if (numericPattern.test(trimmed)) {
      const numeric = Number(trimmed);
      return Number.isFinite(numeric) ? numeric : null;
    }
    return trimmed;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  return value;
};

const sanitizeArray = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeUnknown(item))
    .filter((item) => item !== undefined);
};

const sanitizeObject = (value: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    const cleaned = sanitizeUnknown(rawValue);
    if (cleaned !== undefined) {
      out[key] = cleaned;
    }
  }
  return out;
};

const sanitizeUnknown = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return sanitizeArray(value);
  }

  if (value && typeof value === 'object') {
    return sanitizeObject(value as Record<string, unknown>);
  }

  return cleanScalar(value);
};

export function sanitizeOnboardingPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const sanitized = sanitizeObject(payload as Record<string, unknown>);

  // Keep booleans as booleans for known fields.
  for (const booleanField of ['need_financial_aid', 'can_take_loan']) {
    const val = sanitized[booleanField];
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      if (lower === 'true') sanitized[booleanField] = true;
      if (lower === 'false') sanitized[booleanField] = false;
    }
  }

  return sanitized;
}
