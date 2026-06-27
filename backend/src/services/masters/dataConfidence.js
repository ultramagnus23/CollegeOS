'use strict';
/**
 * dataConfidence.js — Phase 3 "confidence-level table" as the single source of
 * truth, consumed by Phase 4's per-field badges.
 *
 * GROUND TRUTH: a confidence is only ever shown where a REAL, identifiable data
 * source exists. Categories with no real public source (research/advisor fit,
 * funding likelihood, true admit probability) are marked `available: false` —
 * the UI must then show NO badge and NO number, never a low-confidence figure
 * next to an invented value.
 *
 * The numeric confidence is a DATA-QUALITY score (presence + freshness +, for
 * self-reports, sample size) — the same kind of metric undergrad shows as
 * "Completeness · Freshness · Confidence". It is NOT an admission prediction.
 */

// Per-category real source + the ceiling confidence when data is present & fresh.
// `available: false` ⇒ no real source ⇒ never render a badge or a number.
const CATEGORY = {
  institution: {
    label: 'Institution data',
    source: 'IPEDS (institution-level)',
    tier: 'High',
    ceiling: 95,
    available: true,
  },
  outcomes: {
    label: 'Salary outcomes',
    source: 'BLS OEWS / NACE / Scorecard Field-of-Study (by CIP)',
    tier: 'Medium-High',
    ceiling: 80,
    available: true,
  },
  program_page: {
    label: 'Program details',
    source: 'Official program page',
    tier: 'High (freshness-gated)',
    ceiling: 90,
    available: true,
  },
  self_reported: {
    label: 'Self-reported applicant data',
    source: 'GradCafe-style self-reports (self-selected, small sample)',
    tier: 'Low-Medium',
    ceiling: 55,
    available: true,
  },
  // No real structured public source — do NOT render these.
  research_fit:       { label: 'Research / advisor fit',  available: false, reason: 'No public data source exists for graduate programs.' },
  funding_likelihood: { label: 'Funding likelihood',      available: false, reason: 'Not available in structured public data.' },
  admit_probability:  { label: 'Admit probability',       available: false, reason: 'No program-level admit-rate source exists (unlike undergrad/IPEDS).' },
};

const SELF_REPORT_MIN_N = 5; // below this, a self-reported band is not shown at all

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Compute a section's badge data from ACTUAL data presence — never invented.
 *
 * @param {string} category  key of CATEGORY
 * @param {object} signals
 * @param {boolean} signals.present       is a real value stored for this section?
 * @param {string|Date|null} signals.lastScrapedAt  freshness anchor (program_page/outcomes)
 * @param {number} [signals.sampleSize]   row count for self_reported
 * @returns {{available:boolean, source?:string, tier?:string, completeness?:number,
 *            freshness?:number, confidence?:number, reason?:string, sampleSize?:number}}
 */
function sectionConfidence(category, signals = {}) {
  const def = CATEGORY[category];
  if (!def) return { available: false, reason: 'unknown category' };
  if (!def.available) return { available: false, label: def.label, reason: def.reason };

  const { present, lastScrapedAt, sampleSize } = signals;

  // Self-reported: gated by sample size; below the floor we show nothing.
  if (category === 'self_reported') {
    const n = Number(sampleSize) || 0;
    if (!present || n < SELF_REPORT_MIN_N) {
      return { available: false, label: def.label, reason: `Too few self-reports (N=${n}).`, sampleSize: n };
    }
    // Confidence grows with sample size but is capped low (self-selected data).
    const confidence = clamp(Math.round(def.ceiling * Math.min(1, n / 50)), 10, def.ceiling);
    return { available: true, label: def.label, source: def.source, tier: def.tier,
             completeness: 100, confidence, sampleSize: n };
  }

  if (!present) {
    return { available: false, label: def.label, reason: 'No data ingested yet for this section.' };
  }

  // Freshness for time-sensitive sources (program_page, outcomes).
  let freshness = 100;
  if (lastScrapedAt && (category === 'program_page' || category === 'outcomes')) {
    const days = (Date.now() - new Date(lastScrapedAt).getTime()) / 86_400_000;
    // 100% at 0d, decaying to 0 by 365d.
    freshness = clamp(Math.round(100 - (days / 365) * 100), 0, 100);
  }
  const completeness = 100; // present ⇒ the section's value exists
  const confidence = clamp(Math.round(def.ceiling * (freshness / 100)), 0, def.ceiling);
  return { available: true, label: def.label, source: def.source, tier: def.tier,
           completeness, freshness, confidence };
}

module.exports = { CATEGORY, SELF_REPORT_MIN_N, sectionConfidence };
