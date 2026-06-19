// ============================================================================
// Citizenship-aware financial-aid guidance (single source of truth).
//
// HARD RULE (liability): FAFSA (US federal aid) is ONLY available to U.S.
// citizens and eligible noncitizens (e.g. permanent residents / certain
// statuses). It is NEVER available to international students on F-1/J-1 visas,
// including Indian citizens. This module makes "show FAFSA" structurally
// impossible unless the applicant is a U.S. person — callers derive the forms
// list from here rather than hard-coding FAFSA in a checklist.
//
// Sources (verify current cycle):
//  - FAFSA eligibility — https://studentaid.gov/understand-aid/eligibility/requirements/non-us-citizens
//  - CSS Profile (institutional aid, incl. many intl students) — https://cssprofile.collegeboard.org
//  - ISFAA (International Student Financial Aid Application) — used where CSS isn't
// Authoritative per-college need-blind/meets-full-need flags below are
// point-in-time (2024–2025) and MUST be shown alongside a "verify on the
// college's official aid page" note, because these policies change.
// ============================================================================

const US_TOKENS = new Set(['us', 'usa', 'u.s.', 'u.s.a.', 'united states', 'united states of america', 'american']);

export function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * A student is a "U.S. person" for FAFSA purposes if their citizenship (preferred)
 * — or, when citizenship is unknown, their country — is the United States.
 * Anything else (e.g. India) is treated as international → FAFSA-ineligible.
 */
export function isUSPerson(student = {}) {
  const citizenship = normalize(student.citizenship);
  if (citizenship) return US_TOKENS.has(citizenship);
  // Fall back to country of residence only when citizenship is not provided.
  return US_TOKENS.has(normalize(student.country));
}

export function isUSCollege(college = {}) {
  const c = normalize(college.country || college.country_code);
  return US_TOKENS.has(c) || c === 'us';
}

// Point-in-time (2024–2025) — need-blind for INTERNATIONAL applicants (rare).
// Always paired with a "verify" note in the UI.
const INTL_NEED_BLIND = new Set([
  'harvard university', 'yale university', 'princeton university',
  'massachusetts institute of technology', 'mit', 'amherst college',
  'bowdoin college', 'dartmouth college', 'minerva university',
]);
// Meets full demonstrated need for admitted INTERNATIONAL students (need-aware admit,
// but full need met once admitted). Non-exhaustive, point-in-time.
const INTL_MEETS_FULL_NEED = new Set([
  'stanford university', 'columbia university', 'university of pennsylvania',
  'brown university', 'cornell university', 'duke university',
  'northwestern university', 'university of chicago', 'vanderbilt university',
  'williams college', 'wellesley college', 'wesleyan university',
]);

function curatedIntlPolicy(collegeName) {
  const n = normalize(collegeName);
  if (INTL_NEED_BLIND.has(n)) return { needPolicy: 'need-blind-intl', meetsFullNeed: true };
  if (INTL_MEETS_FULL_NEED.has(n)) return { needPolicy: 'need-aware-intl', meetsFullNeed: true };
  return null;
}

/**
 * Resolve the correct financial-aid path for a (student, college) pair.
 * @returns {{
 *   fafsaEligible: boolean,
 *   isInternational: boolean,
 *   forms: Array<{name:string, required:boolean, note?:string, url?:string}>,
 *   needPolicy: 'need-blind-intl'|'need-aware-intl'|'domestic-only'|'unknown',
 *   meetsFullNeed: boolean|null,
 *   internationalAidAvailable: boolean|null,
 *   summary: string,
 *   warnings: string[],
 *   sources: string[]
 * }}
 */
export function getAidGuidance(student = {}, college = {}) {
  const usPerson = isUSPerson(student);
  const isInternational = !usPerson;
  const usCollege = isUSCollege(college);
  const forms = [];
  const warnings = [];
  const sources = [];

  // DB flags (may be null/absent) take precedence over the curated fallback.
  const dbNeedBlindIntl = college.international_need_blind ?? null;
  const dbNeedAwareIntl = college.need_aware_intl ?? null;
  const dbMeetsFullNeed = college.meets_full_need ?? null;
  const dbIntlAidAvailable = college.international_aid_available ?? null;
  const cssRequired = college.css_profile_required === true;

  const curated = curatedIntlPolicy(college.name);
  let needPolicy = 'unknown';
  if (dbNeedBlindIntl === true) needPolicy = 'need-blind-intl';
  else if (dbNeedAwareIntl === true) needPolicy = 'need-aware-intl';
  else if (curated) needPolicy = curated.needPolicy;

  let meetsFullNeed = dbMeetsFullNeed != null ? !!dbMeetsFullNeed
    : (curated ? curated.meetsFullNeed : null);
  let internationalAidAvailable = dbIntlAidAvailable != null ? !!dbIntlAidAvailable
    : (curated ? true : null);

  if (usPerson && usCollege) {
    // U.S. citizen / eligible noncitizen at a U.S. college — federal + institutional.
    forms.push({ name: 'FAFSA', required: true, note: 'Federal & state aid (U.S. citizens & eligible noncitizens).', url: 'https://studentaid.gov' });
    if (cssRequired) {
      forms.push({ name: 'CSS Profile', required: true, note: 'Required by this college for institutional aid.', url: 'https://cssprofile.collegeboard.org' });
    } else {
      forms.push({ name: 'CSS Profile', required: false, note: 'Some colleges also require this for institutional aid — check the college.', url: 'https://cssprofile.collegeboard.org' });
    }
    sources.push('https://studentaid.gov/understand-aid/eligibility');
  } else if (isInternational && usCollege) {
    // International applicant at a U.S. college — NEVER FAFSA.
    if (internationalAidAvailable === false) {
      warnings.push('This college does not offer need-based aid to international students. Focus on merit scholarships and external funding.');
    }
    forms.push({ name: 'CSS Profile', required: cssRequired, note: cssRequired ? 'Required for international institutional aid at this college.' : 'Used by many U.S. colleges for international aid — confirm with the college.', url: 'https://cssprofile.collegeboard.org' });
    forms.push({ name: 'ISFAA / college international aid form', required: false, note: 'Used where CSS Profile is not — check the college’s international aid page.', url: college.financial_aid_url || null });
    sources.push('https://cssprofile.collegeboard.org');
  } else if (isInternational && !usCollege) {
    // International applicant at a non-U.S. college — institution/country specific.
    forms.push({ name: 'College international financial-aid form', required: false, note: 'Aid for non-residents is institution-specific; most government aid (e.g. UK Student Finance) is residents-only.', url: college.financial_aid_url || null });
  } else {
    // U.S. person at a non-U.S. college — typically institutional scholarships only.
    forms.push({ name: 'College financial-aid / scholarship form', required: false, note: 'U.S. federal aid (FAFSA) generally does not apply abroad except at a few FAFSA-eligible foreign schools.', url: college.financial_aid_url || null });
  }

  // Universal safety net: aid policies change; always direct to the official page.
  warnings.push('Always verify the exact forms and deadlines on the college’s official financial-aid page for the current cycle.');

  const policyText = needPolicy === 'need-blind-intl' ? 'need-blind for international applicants'
    : needPolicy === 'need-aware-intl' ? 'need-aware for international applicants (meets full need once admitted)'
    : needPolicy === 'domestic-only' ? 'need-based aid for domestic students only'
    : 'aid policy for international applicants not confirmed';

  const summary = isInternational
    ? `As an international applicant you are NOT eligible for FAFSA. ${usCollege ? `This college is ${policyText}.` : 'Aid for non-residents here is institution-specific.'}`
    : `As a U.S. applicant, complete the FAFSA${cssRequired ? ' and CSS Profile' : ''}.`;

  return {
    fafsaEligible: usPerson && usCollege,
    isInternational,
    forms: forms.filter((f) => f && f.name),
    needPolicy,
    meetsFullNeed,
    internationalAidAvailable,
    summary,
    warnings,
    sources,
  };
}
