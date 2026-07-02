/**
 * verifiedDataGuards.js
 *
 * Regression-prevention guardrails so fabricated data cannot silently
 * re-enter the database the way it did before this repo's 2026-07 data
 * integrity cleanup (see docs/synthetic_data_inventory.md,
 * docs/data_audit_report.md, docs/masters_enrichment_audit.md,
 * docs/data_provenance_design.md).
 *
 * This module is a SAFETY NET, not a guarantee. Its two hard rejections
 * (missing `source`, `verification_status === 'unknown'`) are the real
 * teeth. Everything else (pattern/heuristic matching against known
 * fabricated values) is advisory — see docs/data_guardrails.md for the
 * full honesty statement about what this can and cannot catch.
 *
 * CommonJS by design: the backend (backend/src/**) is a plain Node/Express
 * CommonJS codebase with no tsconfig and no TS build step (confirmed via
 * backend/package.json — no "type": "module", no typescript devDependency
 * used for src/, jest runs .js directly). The actual write paths this module
 * must guard (backend/src/models/College.js, backend/src/services/
 * consolidatedChancingService.js, scraper/sources/masters_enrichment.py)
 * are Node CommonJS and Python — not the Vite/TS frontend. Putting the
 * primary implementation in src/lib/*.ts (frontend) would make it
 * syntactically foreign to the very call sites it needs to guard, and would
 * require a build step just to `require()` it from backend code. So the
 * canonical, enforced implementation lives here, in the backend, as .js.
 *
 * A parallel frontend module exists at src/lib/verified_data_guards.ts for
 * validating API *responses* client-side (e.g. flagging low-confidence data
 * in the UI). It is a separate, independently-written implementation of the
 * same spec (not a re-export) - see docs/data_guardrails.md for the honest
 * statement that the two are not automatically kept in sync and must be
 * updated together when the fabricated-value reference list changes. The
 * Python scraper (scraper/sources/masters_enrichment.py) is a
 * separate language runtime and is NOT wired to this module in this pass;
 * it is named as an open integration point in docs/data_guardrails.md.
 */

'use strict';

// ---------------------------------------------------------------------------
// Known-fabricated value reference table
// ---------------------------------------------------------------------------
// These are the ACTUAL fabricated values found and remediated during the
// 2026-07 audit (see docs/synthetic_data_inventory.md rows 1, 5, 6 and
// docs/data_audit_report.md). Keyed by logical field name -> array of exact
// values that are known hardcoded baselines/defaults for that field.
//
// IMPORTANT: a value appearing here means "this exact number was previously
// used as a fabricated default for this field" — it is NOT proof that every
// future occurrence is fake (see the acceptance_rate honesty note below).
// Matching this list always triggers REJECT for the *specific* fields where
// the audit proved the value was a literal unexplained default with no
// other corroborating source field, and FLAG for fields where the same
// number could plausibly be real.
const KNOWN_FABRICATED_VALUES = {
  // consolidatedChancingService.js:178 — missing acceptance_rate silently
  // defaulted to 0.50 for 6,319 of 8,500 colleges (74%). Fixed in-app by
  // returning null instead. This entry exists so any future write path
  // that tries to persist a bare 0.5/50 default gets caught too.
  acceptance_rate: [0.5],
  admission_difficulty: [50.0], // scraper/sources/masters_enrichment.py baseline
  funding_attractiveness: [0.0], // scraper/sources/masters_enrichment.py baseline
};

// Fields where an exact match against KNOWN_FABRICATED_VALUES is treated as
// a hard REJECT (the audit found no legitimate case where this exact value
// arrives without being the unexplained default). Everything else in
// KNOWN_FABRICATED_VALUES is a FLAG only.
const HARD_REJECT_FIELDS = new Set(['admission_difficulty', 'funding_attractiveness']);

const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

// Verification statuses considered by the design doc
// (docs/data_provenance_design.md). 'unknown' means "no signal at all" and
// must never reach a write path that presents a value as real.
const REJECTED_VERIFICATION_STATUSES = new Set(['unknown']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `value` is null, undefined, or an empty/whitespace string.
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Heuristic signal (NOT an automatic reject): is this a money value that is
 * an exact multiple of 1000 with no cents? Round-number money fields are one
 * of the two patterns confirmed in the 207 manual_seed institution_financials
 * rows (docs/data_audit_report.md: "Ashoka University tuition shown as
 * $12,000"). Round numbers can genuinely occur (a college's real published
 * tuition can legitimately be $12,000), so this is a flag-only signal to be
 * combined with other evidence (e.g. missing source), never a standalone
 * rejection.
 */
function isSuspiciouslyRoundMoneyValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value === 0) return false; // zero is handled by other checks, not "round"
  return value % 1000 === 0;
}

/**
 * Checks a numeric value against the known-fabricated-values reference list
 * for a given field name. Returns { matched: boolean, hardReject: boolean }.
 */
function matchesKnownFabricatedValue(fieldName, value) {
  const knownValues = KNOWN_FABRICATED_VALUES[fieldName];
  if (!knownValues || typeof value !== 'number') {
    return { matched: false, hardReject: false };
  }
  const matched = knownValues.some((known) => value === known);
  return { matched, hardReject: matched && HARD_REJECT_FIELDS.has(fieldName) };
}

/**
 * Extracts an effective `source` string from a record, supporting both the
 * pre-provenance-system shape (`source_attribution.source`, possibly `{}`)
 * and the eventual standardized shape from
 * docs/data_provenance_design.md (`source_attribution.source` at the
 * top level — never nested under a job-name key per that design's rule #1).
 */
function extractSource(record) {
  if (record.source) return record.source;
  const attribution = record.source_attribution;
  if (attribution && typeof attribution === 'object') {
    if (typeof attribution.source === 'string' && attribution.source.trim() !== '') {
      return attribution.source;
    }
  }
  return null;
}

/**
 * Extracts an effective `verification_status`. Falls back to 'unknown' when
 * the pre-provenance-system record has an empty/absent source_attribution,
 * since that is exactly the shape docs/data_provenance_design.md maps to
 * 'unknown' (§4: "source_attribution = '{}' ... => unknown").
 */
function extractVerificationStatus(record) {
  if (typeof record.verification_status === 'string' && record.verification_status.trim() !== '') {
    return record.verification_status;
  }
  const attribution = record.source_attribution;
  const attributionIsEmpty =
    attribution === undefined ||
    attribution === null ||
    (typeof attribution === 'object' && Object.keys(attribution).length === 0);
  if (attributionIsEmpty) return 'unknown';
  return null; // no explicit status, but attribution has *something* in it — not a hard unknown
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} FieldConfig
 * @property {number} [confidenceThreshold] - override the default 0.5 flag threshold
 * @property {string[]} [moneyFields] - field names on `record` to run the
 *   round-number heuristic against (in addition to any field found in
 *   KNOWN_FABRICATED_VALUES)
 * @property {Object.<string, number[]>} [extraFabricatedValues] - additional
 *   {fieldName: [values]} entries merged with KNOWN_FABRICATED_VALUES for
 *   this call only (does not mutate the module-level table)
 * @property {Set<string>} [extraHardRejectFields] - field names from
 *   extraFabricatedValues that should hard-reject on match, merged with
 *   HARD_REJECT_FIELDS for this call only
 */

/**
 * validateBeforeWrite
 *
 * Validates a record before it is written to a canonical/domain table (or
 * any table that will eventually surface to a user as "real" data).
 *
 * @param {Object} record - the record about to be written. Expected shape is
 *   flexible: may carry a top-level `source` and `verification_status`
 *   (matching docs/data_provenance_design.md's target scalar columns), or
 *   the legacy `source_attribution` JSONB shape, or both. Any other
 *   arbitrary data fields (e.g. `acceptance_rate`, `tuition_domestic`,
 *   `admission_difficulty`) are checked against the fabricated-value
 *   reference table by field name.
 * @param {FieldConfig} [fieldConfig] - optional per-call configuration.
 * @returns {{ decision: 'allow'|'reject'|'flag', reasons: string[] }}
 *   `decision` is 'reject' if any hard-reject rule fired (source missing,
 *   verification_status unknown, or a hard-reject fabricated-value match).
 *   Otherwise 'flag' if any soft-flag rule fired (low confidence, a
 *   flag-only fabricated-value match, or a round-number money heuristic).
 *   Otherwise 'allow'. `reasons` always lists every rule that fired,
 *   regardless of severity, so a caller can log/display everything even
 *   when the overall decision is 'reject'.
 */
function validateBeforeWrite(record, fieldConfig = {}) {
  const reasons = [];
  let hasReject = false;
  let hasFlag = false;

  if (!record || typeof record !== 'object') {
    return { decision: 'reject', reasons: ['record must be a non-null object'] };
  }

  const confidenceThreshold =
    typeof fieldConfig.confidenceThreshold === 'number'
      ? fieldConfig.confidenceThreshold
      : DEFAULT_CONFIDENCE_THRESHOLD;

  const fabricatedValues = fieldConfig.extraFabricatedValues
    ? { ...KNOWN_FABRICATED_VALUES, ...fieldConfig.extraFabricatedValues }
    : KNOWN_FABRICATED_VALUES;

  const hardRejectFields = fieldConfig.extraHardRejectFields
    ? new Set([...HARD_REJECT_FIELDS, ...fieldConfig.extraHardRejectFields])
    : HARD_REJECT_FIELDS;

  // --- Rule 1: source must be present -------------------------------------
  const source = extractSource(record);
  if (isEmpty(source)) {
    hasReject = true;
    reasons.push(
      "reject: 'source' is null/empty — no provenance means the value cannot be trusted " +
        '(this is the core rule; every prior fabrication incident had a missing or ' +
        "empty source, e.g. institution_financials rows with source_attribution = '{}')"
    );
  }

  // --- Rule 2: verification_status must not be 'unknown' -----------------
  const verificationStatus = extractVerificationStatus(record);
  if (verificationStatus !== null && REJECTED_VERIFICATION_STATUSES.has(verificationStatus)) {
    hasReject = true;
    reasons.push(
      `reject: verification_status is 'unknown' — per docs/data_provenance_design.md ` +
        `this means no signal at all (empty source_attribution + no corroborating data)`
    );
  }

  // --- Rule 3: confidence below threshold => flag (not reject) ------------
  const confidence =
    typeof record.confidence === 'number'
      ? record.confidence
      : record.source_attribution && typeof record.source_attribution.confidence === 'number'
      ? record.source_attribution.confidence
      : null;
  if (confidence !== null && confidence < confidenceThreshold) {
    hasFlag = true;
    reasons.push(
      `flag: confidence ${confidence} is below threshold ${confidenceThreshold} — ` +
        'allowed through but should be surfaced to reviewers/UI, not silently trusted ' +
        "(the 207 manual_seed rows had confidence 0.85 despite being fake, so confidence " +
        'alone is not sufficient — this is a secondary signal only)'
    );
  }

  // --- Rule 4: known-fabricated exact-value matches -----------------------
  const dataFields = Object.keys(fabricatedValues);
  for (const fieldName of dataFields) {
    if (!(fieldName in record)) continue;
    const { matched, hardReject } = matchesKnownFabricatedValue(fieldName, record[fieldName]);
    if (!matched) continue;
    if (hardRejectFields.has(fieldName) || hardReject) {
      hasReject = true;
      reasons.push(
        `reject: ${fieldName} = ${record[fieldName]} exactly matches a known hardcoded ` +
          `fabricated baseline for this field (see KNOWN_FABRICATED_VALUES)`
      );
    } else {
      hasFlag = true;
      reasons.push(
        `flag: ${fieldName} = ${record[fieldName]} exactly matches a value previously used ` +
          `as a fabricated default — could be real, but warrants a second look (see the ` +
          `acceptance_rate honesty note in docs/data_guardrails.md: this heuristic cannot, ` +
          `by itself, distinguish "genuinely 50% acceptance rate" from "someone defaulted to 0.5" ` +
          `— the null-source rule above is the actual defense for that case)`
      );
    }
  }

  // --- Rule 5: round-number money heuristic (flag only) -------------------
  const moneyFields = fieldConfig.moneyFields || [];
  for (const fieldName of moneyFields) {
    if (!(fieldName in record)) continue;
    if (isSuspiciouslyRoundMoneyValue(record[fieldName])) {
      hasFlag = true;
      reasons.push(
        `flag: ${fieldName} = ${record[fieldName]} is an exact multiple of 1000 with no cents — ` +
          'a heuristic signal only (real tuition can legitimately be a round number), ' +
          'not an automatic rejection; combine with the source/confidence checks above'
      );
    }
  }

  let decision = 'allow';
  if (hasReject) decision = 'reject';
  else if (hasFlag) decision = 'flag';

  return { decision, reasons };
}

module.exports = {
  validateBeforeWrite,
  isSuspiciouslyRoundMoneyValue,
  matchesKnownFabricatedValue,
  extractSource,
  extractVerificationStatus,
  KNOWN_FABRICATED_VALUES,
  HARD_REJECT_FIELDS,
  DEFAULT_CONFIDENCE_THRESHOLD,
};
