'use strict';

const MAX_TEXT = 4000;

// Allowlist of valid trait keys (mirrors src/constants/onboardingOptions.ts TRAIT_OPTIONS).
// trait_weights is built by iterating THIS constant list and reading the user's value,
// so a property name written to the output is never user-controlled (prevents the
// remote-property-injection / prototype-pollution class entirely).
const ALLOWED_TRAIT_KEYS = [
  'Creative', 'Artistic', 'Experimental', 'Imaginative', 'Design-Oriented', 'Aesthetic Thinker', 'Visionary',
  'Organizer', 'Community Builder', 'Delegator', 'Strategic Leader', 'Persuasive', 'Analytical', 'Systems Thinker',
  'Problem Solver', 'Logical', 'Detail-Oriented', 'Research-Oriented', 'Empathetic', 'Collaborative', 'Mentor',
  'Communicator', 'Diplomatic', 'Listener', 'Disciplined', 'Consistent', 'Competitive', 'Ambitious', 'Independent',
  'Self-Starter', 'Entrepreneurial', 'Risk-Taker', 'Builder', 'Inventor', 'Product Thinker', 'Futurist', 'Humanitarian',
  'Culturally Curious', 'Ethical Thinker', 'Sustainability-Oriented', 'Policy-Oriented',
];

function isBlank(value) {
  return typeof value === 'string' && value.trim() === '';
}

function nullIfEmpty(value) {
  if (value === undefined || value === null) return null;
  if (isBlank(value)) return null;
  return value;
}

function safeString(value, options = {}) {
  const {
    maxLength = MAX_TEXT,
    trim = true,
    allowEmpty = false,
  } = options;

  const normalized = nullIfEmpty(value);
  if (normalized === null) return null;
  const stringValue = String(normalized);
  const prepared = trim ? stringValue.trim() : stringValue;
  if (!allowEmpty && prepared.length === 0) return null;
  return prepared.slice(0, maxLength);
}

function safeBoolean(value) {
  const normalized = nullIfEmpty(value);
  if (normalized === null) return null;
  if (typeof normalized === 'boolean') return normalized;
  if (typeof normalized === 'number') {
    if (normalized === 1) return true;
    if (normalized === 0) return false;
    return null;
  }
  if (typeof normalized === 'string') {
    const lower = normalized.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lower)) return true;
    if (['false', '0', 'no', 'n'].includes(lower)) return false;
  }
  return null;
}

function normalizeNumber(value) {
  const normalized = nullIfEmpty(value);
  if (normalized === null) return null;
  if (typeof normalized === 'boolean') return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function safeInteger(value, options = {}) {
  const { min = null, max = null } = options;
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  const intValue = Math.trunc(parsed);
  if (min !== null && intValue < min) return null;
  if (max !== null && intValue > max) return null;
  return intValue;
}

function safeFloat(value, options = {}) {
  const { min = null, max = null, precision = null } = options;
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  if (min !== null && parsed < min) return null;
  if (max !== null && parsed > max) return null;
  if (precision === null) return parsed;
  const factor = 10 ** precision;
  return Math.round(parsed * factor) / factor;
}

function safeArray(value, itemSanitizer, options = {}) {
  const { maxItems = 50 } = options;
  if (value === undefined || value === null) return [];

  const candidateArray = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(',') : []);

  const sanitized = [];
  for (const item of candidateArray) {
    if (sanitized.length >= maxItems) break;
    const cleaned = itemSanitizer(item);
    if (cleaned !== null && cleaned !== undefined && cleaned !== '') {
      sanitized.push(cleaned);
    }
  }

  return [...new Set(sanitized)];
}

function sanitizeWarningsPush(warnings, field, message) {
  warnings.push({ field, message });
}

function normalizeOnboardingPayload(rawPayload = {}) {
  const payload = (rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload))
    ? rawPayload
    : {};
  const warnings = [];
  const invalidFields = [];

  const knownFields = new Set([
    'target_countries', 'targetCountries',
    'intended_majors', 'intendedMajors',
    'test_status', 'testStatus',
    'language_preferences', 'languagePreferences',
    'gpa', 'gpa_type', 'gpaType',
    'sat_score', 'satScore',
    'act_score', 'actScore',
    'ib_predicted', 'ibPredicted',
    'budget', 'max_budget_per_year', 'budgetRange',
    'intended_major', 'career_goals', 'careerGoals',
    'country', 'need_financial_aid', 'can_take_loan', 'family_income_usd',
    'subjects', 'activities',
    'grade_level', 'current_grade', 'graduation_year',
    'preferred_location', 'locationPreference',
    'gender',
    'name',
    'phone',
    'date_of_birth',
    'high_school_name', 'school_name',
    'curriculum_type',
    'curriculum_type_other', 'curriculum_other',
    'citizenship',
    'why_college', 'whyCollege',
    'interest_tags', 'skillsStrengths',
    'trait_weights', 'traitWeights',
    'preferred_college_size', 'campusSize',
    'preferred_setting',
  ]);

  const unknownFields = Object.keys(payload).filter((key) => !knownFields.has(key));
  if (unknownFields.length > 0) {
    sanitizeWarningsPush(warnings, 'unknown_fields', `Ignored unknown fields: ${unknownFields.join(', ')}`);
  }

  const targetCountries = safeArray(
    payload.target_countries ?? payload.targetCountries,
    (value) => safeString(value, { maxLength: 80 }),
    { maxItems: 20 },
  );

  const intendedMajors = safeArray(
    payload.intended_majors ?? payload.intendedMajors,
    (value) => safeString(value, { maxLength: 120 }),
    { maxItems: 20 },
  );

  const languagePreferences = safeArray(
    payload.language_preferences ?? payload.languagePreferences,
    (value) => safeString(value, { maxLength: 80 }),
    { maxItems: 20 },
  );

  const testStatusRaw = payload.test_status ?? payload.testStatus;
  const testStatusPayload = (testStatusRaw && typeof testStatusRaw === 'object' && !Array.isArray(testStatusRaw))
    ? testStatusRaw
    : {};

  const normalizedTestStatus = {
    sat_score: safeInteger(
      testStatusPayload.sat_score ?? testStatusPayload.sat,
      { min: 400, max: 1600 },
    ),
    act_score: safeInteger(
      testStatusPayload.act_score ?? testStatusPayload.act,
      { min: 1, max: 36 },
    ),
    ib_predicted: safeInteger(
      testStatusPayload.ib_predicted ?? testStatusPayload.ib,
      { min: 0, max: 45 },
    ),
  };

  const normalized = {
    target_countries: targetCountries,
    intended_majors: intendedMajors,
    test_status: normalizedTestStatus,
    language_preferences: languagePreferences,
    gpa: safeFloat(payload.gpa, { min: 0, max: 100, precision: 4 }),
    gpa_type: safeString(payload.gpa_type ?? payload.gpaType, { maxLength: 20 }),
    sat_score: safeInteger(payload.sat_score ?? payload.satScore, { min: 400, max: 1600 }),
    act_score: safeInteger(payload.act_score ?? payload.actScore, { min: 1, max: 36 }),
    budget: safeInteger(payload.budget, { min: 0, max: 5000000 }),
    max_budget_per_year: safeInteger(payload.max_budget_per_year ?? payload.budget, { min: 0, max: 5000000 }),
    intended_major: safeString(payload.intended_major, { maxLength: 255 }),
    career_goals: safeString(payload.career_goals ?? payload.careerGoals, { maxLength: 4000 }),
    country: safeString(payload.country, { maxLength: 100 }),
    need_financial_aid: safeBoolean(payload.need_financial_aid),
    can_take_loan: safeBoolean(payload.can_take_loan),
    family_income_usd: safeInteger(payload.family_income_usd, { min: 0, max: 100000000 }),
    subjects: safeArray(payload.subjects, (value) => safeString(value, { maxLength: 80 }), { maxItems: 60 }),
    activities: safeArray(
      payload.activities,
      (value) => {
        if (!value || typeof value !== 'object') return null;
        const name = safeString(value.name, { maxLength: 160 });
        if (!name) return null;
        return {
          name,
          type: safeString(value.type, { maxLength: 80 }),
          tier: safeInteger(value.tier, { min: 1, max: 4 }) ?? 3,
          yearsInvolved: safeInteger(value.yearsInvolved, { min: 0, max: 20 }) ?? 0,
          hoursPerWeek: safeInteger(value.hoursPerWeek, { min: 0, max: 80 }) ?? 0,
          weeksPerYear: safeInteger(value.weeksPerYear, { min: 0, max: 52 }) ?? 0,
          leadership: safeString(value.leadership, { maxLength: 200 }),
          achievements: safeString(value.achievements, { maxLength: 500 }),
        };
      },
      { maxItems: 30 },
    ),
    grade_level: safeString(payload.grade_level ?? payload.current_grade, { maxLength: 50 }),
    graduation_year: safeInteger(payload.graduation_year, { min: 2020, max: 2100 }),
    preferred_location: safeArray(
      payload.preferred_location ?? payload.locationPreference,
      (value) => safeString(value, { maxLength: 120 }),
      { maxItems: 10 },
    ),
    gender: safeString(payload.gender, { maxLength: 50 }),
    name: safeString(payload.name, { maxLength: 160 }),
    phone: safeString(payload.phone, { maxLength: 40 }),
    date_of_birth: safeString(payload.date_of_birth, { maxLength: 20 }),
    high_school_name: safeString(payload.high_school_name ?? payload.school_name, { maxLength: 255 }),
    curriculum_type: safeString(payload.curriculum_type, { maxLength: 100 }),
    curriculum_type_other: safeString(payload.curriculum_type_other ?? payload.curriculum_other, { maxLength: 100 }),
    citizenship: safeString(payload.citizenship, { maxLength: 80 }),
    why_college: safeString(payload.why_college ?? payload.whyCollege, { maxLength: 4000 }),
    interest_tags: safeArray(payload.interest_tags ?? payload.skillsStrengths, (value) => safeString(value, { maxLength: 80 }), { maxItems: 40 }),
    trait_weights: (() => {
      const raw = payload.trait_weights ?? payload.traitWeights;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      // Iterate the CONSTANT allowlist and read the user's value. The key written to
      // `out` is always one of our constants — never a user-supplied string — so this
      // cannot be exploited for property injection / prototype pollution.
      const out = {};
      for (const trait of ALLOWED_TRAIT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(raw, trait)) continue;
        const num = normalizeNumber(raw[trait]);
        if (num !== null) out[trait] = num;
      }
      return Object.keys(out).length > 0 ? out : null;
    })(),
    preferred_college_size: safeString(payload.preferred_college_size ?? payload.campusSize, { maxLength: 40 }),
    preferred_setting: safeString(payload.preferred_setting, { maxLength: 40 }),
  };

  if (payload.gpa !== undefined && normalized.gpa === null && payload.gpa !== null && payload.gpa !== '') {
    invalidFields.push('gpa');
    sanitizeWarningsPush(warnings, 'gpa', 'GPA ignored because value is invalid');
  }
  if (payload.sat_score === false || payload.satScore === false) {
    invalidFields.push('sat_score');
    sanitizeWarningsPush(warnings, 'sat_score', 'SAT score ignored because boolean values are invalid for numeric fields');
  }
  if (payload.act_score === false || payload.actScore === false) {
    invalidFields.push('act_score');
    sanitizeWarningsPush(warnings, 'act_score', 'ACT score ignored because boolean values are invalid for numeric fields');
  }
  if (payload.family_income_usd === false) {
    invalidFields.push('family_income_usd');
    sanitizeWarningsPush(warnings, 'family_income_usd', 'Family income ignored because boolean values are invalid for numeric fields');
  }

  if (normalized.gpa_type && !['gpa', 'percentage'].includes(String(normalized.gpa_type).toLowerCase())) {
    sanitizeWarningsPush(warnings, 'gpa_type', 'Invalid GPA type ignored; defaulting to percentage');
    normalized.gpa_type = 'percentage';
  }

  if (!normalized.max_budget_per_year && normalized.budget !== null) {
    normalized.max_budget_per_year = normalized.budget;
  }

  return {
    normalized,
    warnings,
    invalidFields,
    unknownFields,
  };
}

module.exports = {
  normalizeOnboardingPayload,
  safeArray,
  safeBoolean,
  safeFloat,
  safeInteger,
  safeString,
};
