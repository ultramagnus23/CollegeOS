'use strict';

const dbManager = require('../config/database');
const User = require('../models/User');
const { recordMalformedPayload, recordPartialSave, recordSuccess, recordValidationFailure } = require('./onboardingMetrics');
const { normalizeOnboardingPayload } = require('../utils/normalizeOnboardingPayload');
const { onboardingFieldMappings, parseOnboardingSchema } = require('../validation/onboardingSchema');
const { safeError, safeLog } = require('../utils/safeLogger');

class OnboardingValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'OnboardingValidationError';
    this.statusCode = 400;
    this.details = details;
  }
}

function _schemaLabelForMapping(mapping) {
  const expected = String(mapping.db_type || '').toLowerCase();
  if (expected.includes('integer')) return 'integer';
  if (expected.includes('numeric') || expected.includes('decimal') || expected.includes('real')) return 'numeric';
  if (expected.includes('boolean')) return 'boolean';
  if (expected.includes('array')) return 'array';
  if (expected.includes('json')) return 'json';
  return 'text';
}

async function auditOnboardingSchemaAgainstDb() {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'student_profiles')`
  );

  const dbMap = new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));

  return onboardingFieldMappings.map((mapping) => {
    const [table, column] = String(mapping.db_column).split('.');
    const key = `${table}.${column}`;
    const dbColumn = dbMap.get(key);
    if (!dbColumn) {
      return {
        ...mapping,
        actual_db_type: null,
        mismatch: true,
        reason: 'missing_column',
      };
    }

    const actualType = dbColumn.data_type === 'ARRAY' ? `array:${dbColumn.udt_name}` : dbColumn.data_type;
    const expectedType = _schemaLabelForMapping(mapping);
    const normalizedActual = String(actualType).toLowerCase();

    const typeMatches =
      (expectedType === 'integer' && (normalizedActual.includes('integer') || normalizedActual.includes('bigint') || normalizedActual.includes('smallint')))
      || (expectedType === 'numeric' && (normalizedActual.includes('numeric') || normalizedActual.includes('double') || normalizedActual.includes('real') || normalizedActual.includes('decimal')))
      || (expectedType === 'boolean' && normalizedActual.includes('boolean'))
      || (expectedType === 'array' && normalizedActual.includes('array'))
      || (expectedType === 'json' && (normalizedActual.includes('json') || normalizedActual.includes('text')))
      || (expectedType === 'text' && (normalizedActual.includes('text') || normalizedActual.includes('character')));

    return {
      ...mapping,
      actual_db_type: actualType,
      mismatch: !typeMatches,
      reason: typeMatches ? null : 'type_mismatch',
    };
  });
}

async function processOnboardingPayload({ payload, userId, requestId }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    recordMalformedPayload();
    throw new OnboardingValidationError('Invalid onboarding payload format', {
      invalidFields: ['body'],
      validationErrors: [{ field: 'body', message: 'Payload must be a JSON object' }],
      warnings: [],
    });
  }

  const normalizedResult = normalizeOnboardingPayload(payload);
  const parseResult = parseOnboardingSchema(normalizedResult.normalized);

  if (!parseResult.success) {
    recordValidationFailure();
    const validationErrors = parseResult.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    safeError('onboarding.validation_failed', {
      requestId,
      userId,
      invalidFields: validationErrors.map((entry) => entry.field),
      validationErrors,
    });

    throw new OnboardingValidationError('Onboarding validation failed', {
      invalidFields: validationErrors.map((entry) => entry.field),
      validationErrors,
      warnings: normalizedResult.warnings,
    });
  }

  const schemaAudit = await auditOnboardingSchemaAgainstDb();
  const mismatches = schemaAudit.filter((entry) => entry.mismatch);

  if (mismatches.length > 0) {
    safeLog('onboarding.schema_mismatch_detected', {
      requestId,
      userId,
      mismatchCount: mismatches.length,
      mismatches,
    }, 'warn');
  }

  let user;
  try {
    user = await User.updateOnboarding(userId, parseResult.data);
  } catch (error) {
    if (error && typeof error.code === 'string' && (error.code.startsWith('22') || error.code === '23514' || error.code === '23502')) {
      recordValidationFailure();
      throw new OnboardingValidationError('Onboarding payload contains invalid field types', {
        invalidFields: normalizedResult.invalidFields,
        validationErrors: [{ field: 'database_write', message: error.message }],
        warnings: normalizedResult.warnings,
      });
    }
    throw error;
  }

  if (normalizedResult.warnings.length > 0) {
    recordPartialSave();
  }
  recordSuccess();

  return {
    user,
    warnings: normalizedResult.warnings,
    invalidFields: normalizedResult.invalidFields,
    schemaAudit,
  };
}

module.exports = {
  OnboardingValidationError,
  auditOnboardingSchemaAgainstDb,
  processOnboardingPayload,
};
