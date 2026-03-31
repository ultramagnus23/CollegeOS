// backend/src/services/scraperValidationService.js
//
// Validation layer for scraped records.
//
// Contract (problem statement):
//   • Rejects records that are incomplete or malformed.
//   • Retries alternative sources before marking fields as unavailable.
//   • Never fabricates or infers values — missing fields are marked UNAVAILABLE.
//   • Every accepted record must carry source_url + scraped_at.

'use strict';

const logger = require('../utils/logger');

// ── Field schemas ─────────────────────────────────────────────────────────────

/**
 * Required field definitions per record type.
 * Each entry: { field, validate?, message }
 *   - validate(value): optional custom check (returns true = valid)
 *   - message: human-readable rejection reason
 */
const SCHEMAS = {
  college: [
    { field: 'name',           message: 'College name is required' },
    { field: 'country',        message: 'Country is required' },
    { field: 'official_website', validate: isUrl, message: 'official_website must be a valid URL' },
    { field: 'source_url',     validate: isUrl, message: 'source_url is required and must be a valid URL' },
    { field: 'scraped_at',     validate: isDateLike, message: 'scraped_at must be a date/timestamp' },
  ],

  admissions: [
    { field: 'college_id',     validate: isPositiveInt, message: 'college_id must be a positive integer' },
    { field: 'source_url',     validate: isUrl, message: 'source_url is required and must be a valid URL' },
    { field: 'scraped_at',     validate: isDateLike, message: 'scraped_at is required' },
  ],

  financial: [
    { field: 'college_id',     validate: isPositiveInt, message: 'college_id must be a positive integer' },
    { field: 'source_url',     validate: isUrl, message: 'source_url is required and must be a valid URL' },
    { field: 'scraped_at',     validate: isDateLike, message: 'scraped_at is required' },
    {
      field: '_atLeastOneFinancialField',
      validate: (_val, rec) => !!(
        rec.tuition_international || rec.tuition_in_state || rec.tuition_out_state || rec.cost_of_attendance
      ),
      message: 'At least one financial figure (tuition, cost_of_attendance) must be present',
    },
  ],

  scholarship: [
    { field: 'name',           message: 'Scholarship name is required' },
    { field: 'provider',       message: 'Scholarship provider is required' },
    { field: 'source_url',     validate: isUrl, message: 'source_url is required and must be a valid URL' },
    { field: 'scraped_at',     validate: isDateLike, message: 'scraped_at is required' },
  ],

  financing_option: [
    { field: 'name',           message: 'Financing option name is required' },
    { field: 'provider',       message: 'Provider is required' },
    { field: 'financing_type', validate: isFinancingType, message: 'financing_type must be one of: federal_loan, private_loan, grant, scholarship, work_study, fellowship' },
    { field: 'source_url',     validate: isUrl, message: 'source_url is required and must be a valid URL' },
    { field: 'scraped_at',     validate: isDateLike, message: 'scraped_at is required' },
  ],

  college_insight: [
    { field: 'reddit_post_id', message: 'reddit_post_id is required' },
    { field: 'subreddit',      message: 'subreddit is required' },
    { field: 'college_name_raw', message: 'college_name_raw is required' },
    { field: 'content_snippet', validate: v => typeof v === 'string' && v.trim().length >= 10, message: 'content_snippet must be at least 10 characters' },
    { field: 'insight_type',   validate: isInsightType, message: 'insight_type must be one of: cost_experience, scholarship_success, perceived_value, general' },
    { field: 'scraped_at',     validate: isDateLike, message: 'scraped_at is required' },
  ],
};

// ── Type guards ───────────────────────────────────────────────────────────────

function isUrl(v) {
  if (typeof v !== 'string' || !v.trim()) return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function isDateLike(v) {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

function isPositiveInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
}

function isFinancingType(v) {
  return ['federal_loan','private_loan','grant','scholarship','work_study','fellowship'].includes(v);
}

function isInsightType(v) {
  return ['cost_experience','scholarship_success','perceived_value','general'].includes(v);
}

// ── Core validator ────────────────────────────────────────────────────────────

/**
 * Validate a single scraped record.
 *
 * @param {string} recordType - key from SCHEMAS
 * @param {object} record     - the raw scraped object
 * @returns {{ valid: boolean, errors: string[], record: object }}
 *   `record` is returned with validation metadata attached.
 */
function validate(recordType, record) {
  const schema = SCHEMAS[recordType];
  if (!schema) {
    return {
      valid: false,
      errors: [`Unknown record type: "${recordType}". Supported: ${Object.keys(SCHEMAS).join(', ')}`],
      record,
    };
  }

  const errors = [];

  for (const rule of schema) {
    const { field, validate: customFn, message } = rule;

    if (field.startsWith('_')) {
      // Synthetic cross-field rule — pass whole record
      if (customFn && !customFn(null, record)) {
        errors.push(message);
      }
      continue;
    }

    const value = record[field];
    const isPresent = value !== undefined && value !== null && value !== '';

    if (!isPresent) {
      errors.push(message || `${field} is required`);
      continue;
    }

    if (customFn && !customFn(value, record)) {
      errors.push(message || `${field} failed validation`);
    }
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.warn('scraperValidationService: record rejected', { recordType, errors, record });
  }

  return { valid, errors, record };
}

/**
 * Validate a batch of records. Returns:
 *   { accepted: object[], rejected: { record, errors }[] }
 *
 * @param {string}   recordType
 * @param {object[]} records
 */
function validateBatch(recordType, records) {
  const accepted = [];
  const rejected = [];

  for (const record of records) {
    const result = validate(recordType, record);
    if (result.valid) {
      accepted.push(record);
    } else {
      rejected.push({ record, errors: result.errors });
    }
  }

  logger.info('scraperValidationService: batch validation complete', {
    recordType,
    total: records.length,
    accepted: accepted.length,
    rejected: rejected.length,
  });

  return { accepted, rejected };
}

/**
 * Strip fields that are undefined/null from a record and mark them as UNAVAILABLE
 * in a companion metadata object, rather than allowing fabricated placeholders.
 *
 * @param {object} record - raw record (may have undefined optional fields)
 * @returns {{ cleaned: object, unavailable: string[] }}
 */
function markUnavailableFields(record) {
  const cleaned = {};
  const unavailableFields = [];

  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined || value === '') {
      unavailableFields.push(key);
    } else {
      cleaned[key] = value;
    }
  }

  return { cleaned, unavailable: unavailableFields };
}

module.exports = { validate, validateBatch, markUnavailableFields, SCHEMAS };
