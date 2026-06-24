'use strict';
/**
 * mastersChancingService.js — Phase 5 of docs/MASTERS_TRACK_PLAN.md.
 *
 * v1 is a RULES-BASED competitiveness band per applicable admission pathway, NOT
 * an admit probability. We deliberately never emit a percentage:
 *   - Compare the applicant against the pathway that actually fits them (e.g. an
 *     MBA work-experience pathway does not weigh GRE if 5+ yrs experience).
 *   - Compare vs scraped PUBLISHED minimums first, then GradCafe-derived
 *     percentile bands (only when N >= MIN_SAMPLE self-reports exist).
 *   - Where neither exists: no band, just the stated requirements as a checklist.
 *
 * Pure functions only (no DB / no network) so this is unit-tested directly.
 */

const MIN_SAMPLE = 15; // GradCafe self-reports needed to show a band (CT-confirmed default)

const BAND = Object.freeze({
  BELOW: 'below_typical',
  WITHIN: 'within_typical',
  ABOVE: 'above_typical',
  INSUFFICIENT: 'insufficient_data',
});

const BAND_LABEL = Object.freeze({
  [BAND.BELOW]: 'Below typical range',
  [BAND.WITHIN]: 'Within typical range',
  [BAND.ABOVE]: 'Above typical range',
  [BAND.INSUFFICIENT]: 'Insufficient applicant data for this program',
});

// Always-shown honesty caveats (mirrors the Phase 6 disclosure, surfaced inline).
const CHANCING_DISCLOSURES = Object.freeze([
  'This is a competitiveness band, not an admit probability — that number does not exist publicly for most masters programs.',
  'We cannot assess research/advisor fit, your SOP, LOR strength, or interviews — often the biggest factors.',
  'Bands derived from self-reported data are based on a limited, self-selected sample, not official statistics.',
]);

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Normalize a GPA to a 0–4 scale so applicant and program minimums are comparable. */
function gpaToFourScale(gpa, scale) {
  if (gpa == null || !Number.isFinite(Number(gpa))) return null;
  const g = Number(gpa);
  const s = Number(scale);
  if (!Number.isFinite(s) || s <= 0) return clamp(g, 0, 4); // assume already 4-scale
  if (Math.abs(s - 4) < 0.01) return clamp(g, 0, 4);
  return clamp((g / s) * 4, 0, 4);
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

/** Build p25/p50/p75 for a numeric field across datapoints, or null if N < MIN_SAMPLE. */
function bandsFromDatapoints(datapoints, field, minSample = MIN_SAMPLE) {
  const vals = (datapoints || [])
    .map((d) => d && d[field])
    .filter((v) => v != null && Number.isFinite(Number(v)))
    .map(Number)
    .sort((a, b) => a - b);
  if (vals.length < minSample) return null;
  return { p25: percentile(vals, 25), p50: percentile(vals, 50), p75: percentile(vals, 75), n: vals.length };
}

function classifyAgainstBand(value, band) {
  if (value == null || band == null) return null;
  if (value < band.p25) return BAND.BELOW;
  if (value > band.p75) return BAND.ABOVE;
  return BAND.WITHIN;
}

/** Aggregate several per-field bands into one: any BELOW -> BELOW; all ABOVE -> ABOVE; else WITHIN. */
function aggregateBands(bands) {
  const present = bands.filter(Boolean);
  if (present.length === 0) return null;
  if (present.includes(BAND.BELOW)) return BAND.BELOW;
  if (present.every((b) => b === BAND.ABOVE)) return BAND.ABOVE;
  return BAND.WITHIN;
}

/** Does this pathway apply to this applicant at all? */
function pathwayApplies(pathwayType, profile) {
  const years = Number(profile.work_experience_years || 0);
  switch (pathwayType) {
    case 'work_experience_substitution':
    case 'executive_part_time':
      return years >= 3;
    case 'standard_test_based':
      return profile.gre_quant != null || profile.gre_verbal != null || profile.gmat_total != null;
    case 'test_waived_holistic':
    case 'direct_entry_no_test':
    case 'conditional_admission':
    case 'bridge_certificate':
    case 'portfolio_based':
      return true;
    default:
      return true;
  }
}

/**
 * Assess one pathway. Returns { pathwayType, applies, band, label, basis, perField }.
 * basis ∈ 'published_minimum' | 'self_reported_band' | 'none'.
 */
function assessPathway(pathway, profile, program, datapoints) {
  const pathwayType = pathway.pathway_type || pathway.pathwayType;
  const applies = pathwayApplies(pathwayType, profile);
  if (!applies) {
    return { pathwayType, applies: false, band: null, label: null, basis: 'none', perField: {} };
  }

  const perField = {};

  // 1) Published minimum GPA is the strongest hard signal.
  const applicantGpa = gpaToFourScale(profile.undergrad_gpa, profile.undergrad_gpa_scale);
  const minGpa = gpaToFourScale(program.min_gpa, program.min_gpa_scale);
  let publishedBand = null;
  if (applicantGpa != null && minGpa != null) {
    publishedBand = applicantGpa < minGpa ? BAND.BELOW : BAND.WITHIN;
    perField.gpa_vs_published_min = publishedBand;
  }

  // 2) Self-reported percentile bands (only for fields this pathway weighs).
  const weighs = new Set(pathway.weighted_fields || pathway.weightedFields || []);
  const fieldBands = [];
  const considerField = (profileField, dpField) => {
    if (weighs.size && !weighs.has(profileField)) return;
    const band = bandsFromDatapoints(datapoints, dpField);
    const cls = classifyAgainstBand(profile[profileField], band);
    if (cls) {
      perField[profileField] = cls;
      fieldBands.push(cls);
    }
  };
  considerField('gre_quant', 'gre_quant');
  considerField('gre_verbal', 'gre_verbal');
  considerField('gmat_total', 'gmat_total');
  if (applicantGpa != null) {
    const gpaBand = bandsFromDatapoints(
      (datapoints || []).map((d) => ({ gpa4: gpaToFourScale(d.gpa, d.gpa_scale) })),
      'gpa4',
    );
    const cls = classifyAgainstBand(applicantGpa, gpaBand);
    if (cls) {
      perField.gpa_self_reported = cls;
      fieldBands.push(cls);
    }
  }

  const selfReportedBand = aggregateBands(fieldBands);

  // Combine: a published BELOW dominates; otherwise prefer the self-reported aggregate.
  let band;
  let basis;
  if (publishedBand === BAND.BELOW) {
    band = BAND.BELOW;
    basis = 'published_minimum';
  } else if (selfReportedBand) {
    band = selfReportedBand;
    basis = 'self_reported_band';
  } else if (publishedBand) {
    band = publishedBand;
    basis = 'published_minimum';
  } else {
    band = BAND.INSUFFICIENT;
    basis = 'none';
  }

  return { pathwayType, applies: true, band, label: BAND_LABEL[band], basis, perField };
}

/** Stated-requirements checklist shown regardless of whether a band exists. */
function buildChecklist(program) {
  return [
    { requirement: 'GRE', value: program.gre_requirement || 'unknown' },
    { requirement: 'GMAT', value: program.gmat_requirement || 'unknown' },
    { requirement: 'Minimum GPA', value: program.min_gpa != null ? `${program.min_gpa}/${program.min_gpa_scale || '?'}` : 'not published' },
    { requirement: 'Min TOEFL', value: program.min_toefl != null ? String(program.min_toefl) : 'not published' },
    { requirement: 'Funding', value: program.funding_availability || 'unknown' },
    { requirement: 'STEM-designated', value: program.is_stem_designated == null ? 'unknown' : (program.is_stem_designated ? 'yes' : 'no') },
  ];
}

/**
 * Main entry. Inputs are already-fetched plain objects (the route/service does the DB).
 * @param {object} profile   masters_profile row (snake_case fields)
 * @param {object} program   masters_programs row
 * @param {Array}  pathways  masters_program_pathways rows for the program
 * @param {Array}  datapoints masters_admission_datapoints rows for the program
 * @returns {object} assessment
 */
function assessProgram(profile, program, pathways = [], datapoints = []) {
  const assessed = (pathways.length ? pathways : [{ pathway_type: 'standard_test_based', weighted_fields: ['gre_quant', 'gre_verbal', 'undergrad_gpa'] }])
    .map((p) => assessPathway(p, profile, program, datapoints))
    .filter((a) => a.applies);

  // Overall = the best (most favorable) band among applicable pathways, because an
  // applicant only needs ONE pathway to admit them.
  const order = [BAND.ABOVE, BAND.WITHIN, BAND.BELOW, BAND.INSUFFICIENT];
  let overallBand = BAND.INSUFFICIENT;
  for (const b of order) {
    if (assessed.some((a) => a.band === b)) { overallBand = b; break; }
  }

  return {
    programId: program.id ?? null,
    overall: { band: overallBand, label: BAND_LABEL[overallBand] },
    pathways: assessed,
    checklist: buildChecklist(program),
    sampleSize: (datapoints || []).length,
    disclosures: CHANCING_DISCLOSURES,
  };
}

module.exports = {
  MIN_SAMPLE,
  BAND,
  BAND_LABEL,
  CHANCING_DISCLOSURES,
  gpaToFourScale,
  percentile,
  bandsFromDatapoints,
  classifyAgainstBand,
  aggregateBands,
  pathwayApplies,
  assessPathway,
  buildChecklist,
  assessProgram,
};
