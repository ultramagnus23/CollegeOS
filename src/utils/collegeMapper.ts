/**
 * src/utils/collegeMapper.ts
 *
 * Centralized field normalization layer for the unified `colleges` table.
 *
 * Responsibilities:
 *   • snake_case → camelCase mapping
 *   • numeric coercion with null-safe defaults
 *   • ranking normalization (best rank across QS / US News / THE / child rows)
 *   • array normalization for majors (JSON string or string[])
 *   • observability: logs invalid rows, missing SAT data, missing rankings,
 *     malformed majors
 *
 * All consumers should import from this module instead of implementing their
 * own field-access logic, to avoid schema drift between components.
 */

import type { CollegeWithRelations } from '../lib/supabase';
import type { CollegeSearchResult, CollegeStats } from '../types/college';
import {
  CollegeSearchResultSchema,
  CollegeStatsSchema,
  CollegeSchema,
} from '../types/college';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Coerce a value to a finite number, returning null on failure. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : null;
}

/** Coerce a value to a boolean, returning null when indeterminate. */
function toBool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(s)) return true;
    if (['false', '0', 'no'].includes(s)) return false;
  }
  return null;
}

/**
 * Return the first non-null value from a variadic list.
 * Avoids repeated `?? null` chains in callers.
 */
function pick<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/**
 * Normalize an array-like value (JSON string, actual array, CSV) into a
 * de-duplicated string array.  Returns [] for anything unmappable.
 */
export function normalizeMajors(raw: unknown): string[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map(String).filter(Boolean))];
  }
  if (typeof raw === 'string') {
    // Try JSON first (e.g. top_majors stored as JSON)
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return [...new Set(parsed.map(String).filter(Boolean))];
      }
    } catch {
      // Not valid JSON — fall through to CSV split
    }
    return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
  }
  console.warn('[collegeMapper] normalizeMajors: unexpected type', typeof raw);
  return [];
}

/**
 * Derive the best numeric national ranking from flat ranking columns and/or a
 * nested `college_rankings` child array.  Returns the lowest (best) rank found,
 * or null if no ranking data is present.
 */
export function normalizeBestRanking(
  c: Record<string, unknown>,
  childRankings?: Array<{ ranking_value?: string | null; ranking_year?: number | null }>
): number | null {
  const candidates: number[] = [];

  const addNum = (v: unknown) => {
    const n = toNum(v);
    if (n !== null && n > 0) candidates.push(n);
  };

  // Flat columns on colleges
  addNum(c.ranking_qs);
  addNum(c.ranking_us_news);
  addNum(c.ranking_the);

  // Nested college_rankings rows
  if (Array.isArray(childRankings)) {
    for (const row of childRankings) {
      addNum(row.ranking_value);
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : null;
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

interface MissingDataReport {
  id: number | null;
  name: string;
  missingSat: boolean;
  missingRanking: boolean;
  malformedMajors: boolean;
}

/** Log a structured warning for a college row that is missing expected data. */
function logMissingData(report: MissingDataReport, source: string): void {
  const fields: string[] = [];
  if (report.missingSat) fields.push('SAT/ACT data');
  if (report.missingRanking) fields.push('ranking');
  if (report.malformedMajors) fields.push('majors');
  if (fields.length === 0) return;
  console.warn(
    `[collegeMapper] ${source} — college "${report.name}" (id=${report.id ?? 'n/a'}) missing: ${fields.join(', ')}`
  );
}

// ---------------------------------------------------------------------------
// Primary mapping functions
// ---------------------------------------------------------------------------

/**
 * Map a raw `colleges` table row (CollegeWithRelations) into a flat
 * camelCase object suitable for UI consumption.
 *
 * This is the single source of truth for column aliasing, coercion, and
 * null-safe defaults.  Do NOT replicate field-access logic elsewhere.
 *
 * Observability: logs invalid/incomplete rows in development.
 */
export function mapCollegeRow(
  c: CollegeWithRelations,
  source = 'mapCollegeRow'
): Record<string, unknown> {
  const raw = c as unknown as Record<string, unknown>;

  // ------------------------------------------------------------------
  // Child table lookups (allowed tables: college_financial_data,
  // college_programs, campus_life, college_rankings, college_deadlines,
  // college_contact)
  // ------------------------------------------------------------------
  const financial  = c.college_financial_data?.[0] ?? null;
  const campusLife = c.campus_life?.[0]            ?? null;
  const contact    = c.college_contact?.[0]        ?? null;
  const programs   = c.college_programs            ?? [];
  const childRankings = c.college_rankings         ?? [];

  // ------------------------------------------------------------------
  // SAT / ACT / GPA  — read directly from colleges (unified schema)
  // ------------------------------------------------------------------
  const sat25 = toNum(raw.sat_25);
  const sat75 = toNum(raw.sat_75);
  const act25 = toNum(raw.act_25);
  const act75 = toNum(raw.act_75);
  const actAvg = toNum(raw.act_avg);
  const gpa25 = toNum(raw.gpa_25);
  const gpa75 = toNum(raw.gpa_75);

  // ------------------------------------------------------------------
  // Tuition
  // ------------------------------------------------------------------
  const tuitionDomestic = toNum(
    pick(raw.tuition_domestic, financial?.tuition_in_state)
  );
  const tuitionInternational = toNum(
    pick(raw.tuition_international, financial?.tuition_international)
  );
  const tuitionCost = tuitionDomestic ?? tuitionInternational ?? null;

  // ------------------------------------------------------------------
  // Acceptance rate
  // ------------------------------------------------------------------
  const acceptanceRate = toNum(raw.acceptance_rate);

  // ------------------------------------------------------------------
  // Rankings
  // ------------------------------------------------------------------
  const rankingQs = toNum(raw.ranking_qs);
  const rankingUsNews = toNum(raw.ranking_us_news);
  const rankingThe = toNum(raw.ranking_the);
  const bestRanking = normalizeBestRanking(raw, childRankings);

  // ------------------------------------------------------------------
  // Majors / programs
  // ------------------------------------------------------------------
  let majors: string[] = [];
  let malformedMajors = false;

  if (programs.length > 0) {
    majors = [...new Set(programs.map((p) => p.program_name).filter(Boolean))];
  } else if (raw.top_majors !== null && raw.top_majors !== undefined) {
    try {
      majors = normalizeMajors(raw.top_majors);
    } catch {
      malformedMajors = true;
      console.warn('[collegeMapper] Failed to parse top_majors for college', raw.id);
    }
  }

  // ------------------------------------------------------------------
  // Location
  // ------------------------------------------------------------------
  const location = pick<string>(
    raw.location as string | null,
    [raw.city as string | null, raw.state as string | null].filter(Boolean).join(', ') || null,
    raw.country as string | null
  );

  // ------------------------------------------------------------------
  // Website
  // ------------------------------------------------------------------
  const website = pick<string>(
    raw.website as string | null,
    raw.official_website as string | null,
    raw.website_url as string | null
  );

  // ------------------------------------------------------------------
  // Last updated timestamp
  // ------------------------------------------------------------------
  const lastUpdatedAt = pick<string>(
    raw.last_updated_at as string | null,
    raw.last_data_refresh as string | null,
    raw.updated_at as string | null
  );

  // ------------------------------------------------------------------
  // Observability
  // ------------------------------------------------------------------
  const missingSat = sat25 === null && sat75 === null && act25 === null && act75 === null;
  const missingRanking = bestRanking === null;

  logMissingData(
    { id: toNum(raw.id), name: String(raw.name ?? ''), missingSat, missingRanking, malformedMajors },
    source
  );

  return {
    // Identity
    id: c.id,
    name: c.name,
    slug: (raw.slug as string | null) ?? null,
    // Location
    country: c.country ?? null,
    state: c.state ?? null,
    city: c.city ?? null,
    location,
    // Institution metadata
    type: pick(raw.type as string | null, raw.institution_type as string | null),
    sizeCategory: c.size_category ?? null,
    totalEnrollment: toNum(raw.total_enrollment),
    website,
    officialWebsite: pick<string>(raw.official_website as string | null, website),
    logoUrl: c.logo_url ?? null,
    description: c.description ?? null,
    religiousAffiliation: c.religious_affiliation ?? null,
    setting: c.setting ?? null,
    foundedYear: toNum(raw.founded_year ?? raw.founding_year),
    // Admissions (directly from colleges — unified schema)
    acceptanceRate,
    sat25,
    sat75,
    act25,
    act75,
    actAvg,
    gpa25,
    gpa75,
    testOptional: toBool(raw.test_optional),
    // Tuition & financial
    tuitionDomestic,
    tuitionInternational,
    tuitionCost,
    avgNetPrice: toNum(financial?.avg_net_price),
    avgInstitutionalGrant: toNum(raw.avg_institutional_grant),
    avgMeritAid: toNum(raw.avg_merit_aid),
    pctReceivingMeritAid: toNum(raw.pct_receiving_merit_aid),
    pctStudentsReceivingAid: toNum(raw.pct_students_receiving_aid),
    internationalAidAvailable: toBool(raw.international_aid_available),
    internationalAidAvg: toNum(raw.international_aid_avg),
    meetsFullNeed: toBool(raw.meets_full_need),
    cssProfileRequired: toBool(raw.css_profile_required),
    // Financial detail (from college_financial_data child table)
    tuitionInState: toNum(financial?.tuition_in_state),
    tuitionOutState: toNum(financial?.tuition_out_state),
    // Academic outcomes (from colleges — migrated from academic_details)
    medianEarnings6yr: toNum(raw.median_earnings_6yr),
    medianEarnings10yr: toNum(raw.median_earnings_10yr),
    // Rankings
    rankingQs,
    rankingUsNews,
    rankingThe,
    bestRanking,
    ranking: bestRanking,
    rankings: childRankings.map((r) => ({
      year: r.ranking_year ?? new Date().getFullYear(),
      rankingBody: r.ranking_source,
      nationalRank: r.ranking_value ? parseInt(r.ranking_value, 10) : null,
      globalRank: null,
    })),
    // Deadlines
    applicationDeadline: (raw.application_deadline as string | null) ?? null,
    rdDeadline: (raw.rd_deadline as string | null) ?? null,
    edDeadline: (raw.ed_deadline as string | null) ?? null,
    eaDeadline: (raw.ea_deadline as string | null) ?? null,
    // Programs
    programs,
    majors,
    majorCategories: majors.slice(0, 6),
    programNames: majors,
    // Campus life (from campus_life child table)
    housingGuarantee: campusLife?.housing_guarantee != null
      ? (campusLife.housing_guarantee ? 'Guaranteed' : 'Not guaranteed')
      : null,
    // Contact (from college_contact child table)
    admissionsUrl: contact?.admissions_url ?? null,
    admissionsEmail: contact?.admissions_email ?? null,
    admissionsPhone: contact?.admissions_phone ?? null,
    financialAidUrl: contact?.financial_aid_url ?? null,
    commonApp: toBool(contact?.common_app),
    applicationFee: toNum(contact?.application_fee),
    // Data quality
    dataSource: (raw.data_source as string | null) ?? null,
    dataSourceUrl: (raw.data_source_url as string | null) ?? null,
    dataQualityScore: toNum(raw.data_quality_score),
    needsEnrichment: toBool(raw.needs_enrichment),
    lastUpdatedAt,
    updatedAt: (raw.updated_at as string | null) ?? null,
  };
}

/**
 * Extract a `CollegeStats` snapshot from a mapped row.
 * Returns a strongly-typed object suitable for chancing/recommendation math.
 */
export function extractStats(mapped: ReturnType<typeof mapCollegeRow>): CollegeStats {
  const rawStats = {
    acceptanceRate: (mapped.acceptanceRate as number | null) ?? null,
    sat25: (mapped.sat25 as number | null) ?? null,
    sat75: (mapped.sat75 as number | null) ?? null,
    act25: (mapped.act25 as number | null) ?? null,
    act75: (mapped.act75 as number | null) ?? null,
    actAvg: (mapped.actAvg as number | null) ?? null,
    gpa25: (mapped.gpa25 as number | null) ?? null,
    gpa75: (mapped.gpa75 as number | null) ?? null,
    tuitionDomestic: (mapped.tuitionDomestic as number | null) ?? null,
    tuitionInternational: (mapped.tuitionInternational as number | null) ?? null,
    bestRanking: (mapped.bestRanking as number | null) ?? null,
    rankingQs: (mapped.rankingQs as number | null) ?? null,
    rankingUsNews: (mapped.rankingUsNews as number | null) ?? null,
    rankingThe: (mapped.rankingThe as number | null) ?? null,
    medianEarnings6yr: (mapped.medianEarnings6yr as number | null) ?? null,
    medianEarnings10yr: (mapped.medianEarnings10yr as number | null) ?? null,
    avgInstitutionalGrant: (mapped.avgInstitutionalGrant as number | null) ?? null,
    pctStudentsReceivingAid: (mapped.pctStudentsReceivingAid as number | null) ?? null,
  };

  const parsed = CollegeStatsSchema.safeParse(rawStats);
  if (!parsed.success) {
    console.warn('[collegeMapper] Invalid CollegeStats row, applying null-safe defaults', parsed.error.flatten());
    return CollegeStatsSchema.parse({
      acceptanceRate: null,
      sat25: null,
      sat75: null,
      act25: null,
      act75: null,
      actAvg: null,
      gpa25: null,
      gpa75: null,
      tuitionDomestic: null,
      tuitionInternational: null,
      bestRanking: null,
      rankingQs: null,
      rankingUsNews: null,
      rankingThe: null,
      medianEarnings6yr: null,
      medianEarnings10yr: null,
      avgInstitutionalGrant: null,
      pctStudentsReceivingAid: null,
    });
  }
  return parsed.data;
}

/**
 * Map a raw row to the lightweight `CollegeSearchResult` shape used by
 * list/card views.
 */
export function toSearchResult(c: CollegeWithRelations): CollegeSearchResult {
  const m = mapCollegeRow(c, 'toSearchResult');
  const rawResult = {
    id: c.id,
    name: c.name,
    country: (m.country as string | null) ?? null,
    location: (m.location as string | null) ?? null,
    type: (m.type as string | null) ?? null,
    acceptanceRate: (m.acceptanceRate as number | null) ?? null,
    tuitionCost: (m.tuitionCost as number | null) ?? null,
    ranking: (m.bestRanking as number | null) ?? null,
    enrollment: (m.totalEnrollment as number | null) ?? null,
    description: (m.description as string | null) ?? null,
    majors: (m.majors as string[]) ?? [],
    testScores:
      m.sat25 !== null || m.sat75 !== null || m.act25 !== null || m.act75 !== null
        ? {
            sat25: (m.sat25 as number | null) ?? null,
            sat75: (m.sat75 as number | null) ?? null,
            act25: (m.act25 as number | null) ?? null,
            act75: (m.act75 as number | null) ?? null,
          }
        : null,
    dataSource: (m.dataSource as string | null) ?? null,
    dataSourceUrl: (m.dataSourceUrl as string | null) ?? null,
    dataQualityScore: (m.dataQualityScore as number | null) ?? null,
    lastUpdatedAt: (m.lastUpdatedAt as string | null) ?? null,
  };

  const parsed = CollegeSearchResultSchema.safeParse(rawResult);
  if (!parsed.success) {
    console.warn(
      `[collegeMapper] Invalid CollegeSearchResult for college id=${c.id}, dropping row`,
      parsed.error.flatten()
    );
    return CollegeSearchResultSchema.parse({
      id: c.id,
      name: c.name || 'Unknown College',
      majors: [],
      testScores: null,
    });
  }
  return parsed.data;
}

/**
 * Validate and normalize a mapped row against the canonical College schema.
 * Invalid rows are logged and transformed with null-safe defaults.
 */
export function normalizeCollege(mapped: ReturnType<typeof mapCollegeRow>) {
  const parsed = CollegeSchema.safeParse(mapped);
  if (!parsed.success) {
    console.warn('[collegeMapper] Invalid College row', parsed.error.flatten());
    return null;
  }
  return parsed.data;
}

export function normalizeCollegeSearchResult(c: CollegeWithRelations) {
  return toSearchResult(c);
}

export function normalizeRecommendation<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== 'object') {
    console.warn('[collegeMapper] Invalid recommendation row');
    return {} as T;
  }
  return row;
}

export function normalizeCollegeApplication<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== 'object') {
    console.warn('[collegeMapper] Invalid college application row');
    return {} as T;
  }
  return row;
}
