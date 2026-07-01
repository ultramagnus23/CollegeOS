/**
 * verified_data_guards.ts
 *
 * Regression-prevention guard for database writes. Built after this session's
 * data-integrity cleanup found: a chancing model trained on synthetic applicants,
 * a fabricated 50% default acceptance rate silently applied to 74% of colleges
 * (see backend/src/services/consolidatedChancingService.js:178,
 * backend/src/models/College.js:402), 207 fake tuition rows, and 1096+
 * fabricated masters derived-scores (admission_difficulty baseline 50.0,
 * funding_attractiveness baseline 0.0 — see docs/masters_enrichment_audit.md).
 *
 * This module is a SPEC + a real, usable TypeScript implementation. It does NOT
 * by itself protect the backend write paths — see docs/data_guardrails.md for
 * exactly which write paths still lack a guard and why a straight `import` of
 * this file cannot reach them.
 *
 * Provenance shape follows docs/data_provenance_design.md (source_attribution
 * JSONB shape, 9-value verification_status enum).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The 9-value verification_status enum from docs/data_provenance_design.md */
export type VerificationStatus =
  | 'verified'
  | 'government_verified'
  | 'scraped'
  | 'imported'
  | 'inferred'
  | 'estimated'
  | 'user_supplied'
  | 'unknown'
  | 'deprecated';

export interface ProvenanceMeta {
  source?: string | null;
  source_url?: string | null;
  source_type?: string | null;
  source_date?: string | null;
  confidence?: number | null;
  verification_status?: VerificationStatus | string | null;
  scrape_method?: string | null;
  raw_payload_reference?: unknown;
}

export interface GuardConfig {
  /** Below this, a record is flagged (not rejected). Default 0.5. */
  confidenceThreshold?: number;
  /**
   * Lookup of fieldName -> array of known-fabricated exact numeric baselines.
   * Merged with the built-in defaults (see KNOWN_FABRICATED_BASELINES below).
   */
  fabricatedBaselines?: Record<string, number[]>;
  /** Field-name substrings that should be treated as "money-like" for the round-number heuristic. */
  moneyLikeFieldHints?: string[];
  /** Disable the soft round-number-money heuristic entirely. Default false. */
  disableRoundMoneyHeuristic?: boolean;
}

export type GuardDecision = 'allow' | 'reject' | 'flag';

export interface GuardResult {
  decision: GuardDecision;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Known-fabricated exact value table
//
// Seeded from the ACTUAL fabrication incidents found and fixed this session.
// See docs/data_guardrails.md "Extending this table" for how to add new entries
// as new fabrication patterns are discovered.
// ---------------------------------------------------------------------------

export const KNOWN_FABRICATED_BASELINES: Record<string, number[]> = {
  // backend/src/services/consolidatedChancingService.js:178 (`clamp(... : 0.50 ...)`)
  // backend/src/models/College.js:402 (`COALESCE(c.acceptance_rate, 0.5)`)
  acceptance_rate: [0.5],
  // scraper/sources/masters_enrichment.py compute_admission_difficulty (pre-patch):
  // hardcoded 50.0 baseline returned even with zero real inputs.
  admission_difficulty: [50.0],
  // scraper/sources/masters_enrichment.py compute_funding_attractiveness (pre-patch):
  // hardcoded 0.0 baseline returned even with zero real inputs.
  funding_attractiveness: [0.0],
};

const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

const DEFAULT_MONEY_FIELD_HINTS = [
  'tuition',
  'cost_of_attendance',
  'financial_aid',
  'stipend',
  'salary',
  'fee',
  'price',
  'debt',
  'funding',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNullish(v: unknown): boolean {
  return v === null || v === undefined;
}

function extractProvenance(record: Record<string, unknown>): ProvenanceMeta | null {
  // Support both a flat record (fields directly on the record) and a record
  // carrying a nested `source_attribution` / `_provenance` object, per
  // docs/data_provenance_design.md's standardized shape.
  const nested =
    (record.source_attribution as ProvenanceMeta | undefined) ??
    (record._provenance as ProvenanceMeta | undefined);

  if (nested && typeof nested === 'object') {
    return nested;
  }

  const flatKeys: (keyof ProvenanceMeta)[] = [
    'source',
    'source_url',
    'source_type',
    'source_date',
    'confidence',
    'verification_status',
    'scrape_method',
    'raw_payload_reference',
  ];
  const hasAnyFlatKey = flatKeys.some((k) => k in record);
  if (!hasAnyFlatKey) return null;

  return {
    source: record.source as string | undefined,
    source_url: record.source_url as string | undefined,
    source_type: record.source_type as string | undefined,
    source_date: record.source_date as string | undefined,
    confidence: record.confidence as number | undefined,
    verification_status: record.verification_status as VerificationStatus | undefined,
    scrape_method: record.scrape_method as string | undefined,
    raw_payload_reference: record.raw_payload_reference,
  };
}

function isSuspiciouslyRoundMoney(value: number): boolean {
  if (!Number.isFinite(value) || value === 0) return false;
  // Exact multiples of 500 or 1000 with zero fractional cents.
  if (!Number.isInteger(value)) return false;
  return value % 500 === 0;
}

function fieldLooksMoneyLike(fieldName: string, hints: string[]): boolean {
  const lower = fieldName.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Validate a single field's value before it is written to the database.
 *
 * `record` is the full row/object being written (so provenance metadata that
 * lives alongside the field, e.g. `source`, `confidence`, can be inspected).
 * `fieldName` is the specific field on `record` being checked (e.g.
 * 'acceptance_rate'). The value itself is read from `record[fieldName]`.
 */
export function validateBeforeWrite(
  record: Record<string, unknown>,
  fieldName: string,
  config: GuardConfig = {}
): GuardResult {
  const reasons: string[] = [];
  let decision: GuardDecision = 'allow';

  const confidenceThreshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const fabricatedBaselines: Record<string, number[]> = {
    ...KNOWN_FABRICATED_BASELINES,
    ...(config.fabricatedBaselines ?? {}),
  };
  const moneyHints = config.moneyLikeFieldHints ?? DEFAULT_MONEY_FIELD_HINTS;

  const provenance = extractProvenance(record);
  const value = record[fieldName];

  // --- 1. Reject if `source` is null/undefined/empty string. ---------------
  const source = provenance?.source;
  const sourceMissing = isNullish(source) || (typeof source === 'string' && source.trim() === '');
  if (sourceMissing) {
    decision = 'reject';
    reasons.push(`Missing/empty "source" on record for field "${fieldName}".`);
  }

  // --- 2. Reject if verification_status is 'unknown' or absent entirely. ---
  const status = provenance?.verification_status;
  if (provenance === null || isNullish(status) || status === 'unknown') {
    decision = 'reject';
    reasons.push(
      provenance === null
        ? `No provenance metadata object found at all for field "${fieldName}" (treated as equivalent to verification_status='unknown').`
        : `verification_status is 'unknown' (or missing) for field "${fieldName}".`
    );
  }

  // --- 3. Flag (not reject) if confidence is below threshold. --------------
  const confidence = provenance?.confidence;
  if (typeof confidence === 'number' && confidence < confidenceThreshold) {
    if (decision !== 'reject') decision = 'flag';
    reasons.push(
      `confidence ${confidence} is below threshold ${confidenceThreshold} for field "${fieldName}".`
    );
  }

  // --- 4. Reject known-fabricated exact baseline values when no source. ----
  const knownBad = fabricatedBaselines[fieldName];
  if (knownBad && typeof value === 'number' && knownBad.includes(value)) {
    // Only an automatic reject when there's no source at all — a genuine,
    // independently-sourced value that happens to equal the baseline (e.g. a
    // real 50% acceptance rate at some school) is not itself proof of fraud.
    if (sourceMissing) {
      decision = 'reject';
      reasons.push(
        `Value ${value} for "${fieldName}" exactly matches a known-fabricated baseline ` +
          `(${JSON.stringify(knownBad)}) and has no source attached.`
      );
    } else {
      if (decision !== 'reject') decision = 'flag';
      reasons.push(
        `Value ${value} for "${fieldName}" matches a known-fabricated baseline ` +
          `(${JSON.stringify(knownBad)}) — has a source, so only flagged for manual review, not rejected.`
      );
    }
  }

  // --- 5. Soft heuristic: suspiciously-round money values. Flag only. ------
  if (
    !config.disableRoundMoneyHeuristic &&
    typeof value === 'number' &&
    fieldLooksMoneyLike(fieldName, moneyHints) &&
    isSuspiciouslyRoundMoney(value)
  ) {
    if (decision === 'allow') decision = 'flag';
    reasons.push(
      `Value ${value} for money-like field "${fieldName}" is a suspiciously round number ` +
        `(exact multiple of 500 with no cents). This is a SOFT SIGNAL ONLY, not proof of ` +
        `fabrication — real tuition/stipend values are sometimes genuinely round. Flagged for ` +
        `human review, never auto-rejected on this signal alone.`
    );
  }

  if (reasons.length === 0) {
    reasons.push(`Field "${fieldName}" passed all guard checks.`);
  }

  return { decision, reasons };
}

// ---------------------------------------------------------------------------
// Inline test block
//
// Exported (not auto-run) so importing this module for real use never has the
// side effect of executing test assertions. Run manually with:
//   npx tsx -e "require('./src/lib/verified_data_guards.ts').runInlineTests()"
// or call runInlineTests() from a real test file once one exists for this module.
// ---------------------------------------------------------------------------

export function runInlineTests() {
  let failures = 0;
  const check = (label: string, cond: boolean) => {
    console.assert(cond, `FAIL: ${label}`);
    if (!cond) failures++;
    else console.log(`PASS: ${label}`);
  };

  // 1. Rejects a record with null source.
  const r1 = validateBeforeWrite(
    { acceptance_rate: 0.42, source: null, verification_status: 'scraped', confidence: 0.9 },
    'acceptance_rate'
  );
  check('rejects null source', r1.decision === 'reject');

  // 2. Rejects acceptance_rate=0.5 with no source.
  const r2 = validateBeforeWrite(
    { acceptance_rate: 0.5, verification_status: 'unknown' },
    'acceptance_rate'
  );
  check('rejects fabricated 0.5 baseline with no source', r2.decision === 'reject');

  // 3. Allows acceptance_rate=0.42 with a real source and status='scraped'.
  const r3 = validateBeforeWrite(
    {
      acceptance_rate: 0.42,
      source: 'college_scorecard',
      verification_status: 'scraped',
      confidence: 0.9,
    },
    'acceptance_rate'
  );
  check('allows real 0.42 acceptance_rate with source+status+high confidence', r3.decision === 'allow');

  // 4. Flags a low-confidence record instead of rejecting it.
  const r4 = validateBeforeWrite(
    {
      acceptance_rate: 0.33,
      source: 'nirf_scrape',
      verification_status: 'scraped',
      confidence: 0.2,
    },
    'acceptance_rate'
  );
  check('flags (not rejects) low-confidence record', r4.decision === 'flag');

  // Bonus: masters admission_difficulty fabricated baseline, no source -> reject.
  const r5 = validateBeforeWrite(
    { admission_difficulty: 50.0, verification_status: 'unknown' },
    'admission_difficulty'
  );
  check('rejects masters admission_difficulty=50.0 baseline with no source', r5.decision === 'reject');

  // Bonus: funding_attractiveness fabricated baseline, no source -> reject.
  const r6 = validateBeforeWrite(
    { funding_attractiveness: 0.0, verification_status: 'unknown' },
    'funding_attractiveness'
  );
  check('rejects masters funding_attractiveness=0.0 baseline with no source', r6.decision === 'reject');

  // Bonus: suspiciously round tuition, real source -> flag only, never reject on this alone.
  const r7 = validateBeforeWrite(
    {
      tuition_domestic: 50000,
      source: 'ipeds',
      verification_status: 'government_verified',
      confidence: 0.95,
    },
    'tuition_domestic'
  );
  check('flags round tuition value as soft signal (not reject)', r7.decision === 'flag');

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED.`);
    if (typeof process !== 'undefined' && typeof process.exit === 'function') {
      process.exit(1);
    }
  } else {
    console.log('\nAll verified_data_guards inline tests passed.');
  }
  return failures === 0;
}
