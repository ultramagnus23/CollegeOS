/**
 * src/lib/collegeService.ts
 *
 * Service layer for querying the `colleges_comprehensive` Supabase table and its
 * related child tables.  All functions return typed results and throw on error.
 *
 * Usage:
 *   import { searchColleges, getCollegeById } from '@/lib/collegeService';
 */
import {
  supabase,
  isSupabaseConfigured,
  CollegeWithRelations,
  CollegeRow,
} from './supabase';

const PAGE_SIZE = 20;

/** Full nested-select string used when fetching a college with all related data. */
const FULL_SELECT = `
  *,
  college_admissions(*),
  college_financial_data(*),
  academic_details(*),
  college_programs(*),
  student_demographics(*),
  campus_life(*),
  college_rankings(*),
  college_deadlines(*),
  college_contact(*)
` as const;

/** Lighter select string for list/search pages (omits large child tables). */
const LIST_SELECT = `
  *,
  college_admissions(acceptance_rate, test_optional, sat_avg, sat_range, act_range, gpa_50),
  college_financial_data(tuition_in_state, tuition_out_state, tuition_international, avg_net_price),
  academic_details(graduation_rate_4yr, median_salary_6yr),
  college_rankings(ranking_source, ranking_value, ranking_year)
` as const;

function requireClient() {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. ' +
        'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
    );
  }
  return supabase;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface CollegeFilters {
  /** Full-text search on college name (case-insensitive). */
  query?: string;
  /** Country name as stored in colleges_comprehensive.country. */
  country?: string;
  /** Two-letter US state abbreviation or full state name. */
  state?: string;
  /** 'public' | 'private' | 'for-profit' */
  type?: string;
  /** 'urban' | 'suburban' | 'rural' */
  setting?: string;
  /** Minimum acceptance rate (0–1). */
  minAcceptance?: number;
  /** Maximum acceptance rate (0–1). */
  maxAcceptance?: number;
  /** Maximum out-of-state tuition in USD. */
  maxTuition?: number;
  /** Sort field: 'name' | 'acceptance_rate' | 'tuition' | 'ranking' */
  sortBy?: string;
  /** 1-based page number (20 results per page). */
  page?: number;
}

export interface SearchResult {
  data: CollegeWithRelations[];
  /** Total matching rows (before pagination). */
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Search / List ────────────────────────────────────────────────────────────

/**
 * Direct fallback query used when search_colleges_filtered RPC is unavailable
 * (e.g. the table is missing expected columns before migration 056 is run).
 * Supports name search and country filter only; uses PostgREST count for totals.
 */
async function searchCollegesDirect(
  client: NonNullable<typeof supabase>,
  filters: CollegeFilters
): Promise<SearchResult> {
  const { query, country, sortBy = 'name', page = 1 } = filters;

  let q = client
    .from('colleges_comprehensive')
    // 'estimated' uses PostgreSQL's planner stats — fast, no extra COUNT(*) scan.
    .select(LIST_SELECT, { count: 'estimated' });

  if (query) q = q.ilike('name', `%${query}%`);
  if (country) q = q.eq('country', country);

  // Simple name-based sort; acceptance_rate / tuition sorts require joins
  // and are not supported in the direct fallback.
  q = q
    .order('name', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, error, count } = await q;
  if (error) throw error;

  const total = count ?? 0;
  return {
    data: (data as CollegeWithRelations[]) ?? [],
    count: total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

/**
 * Search and filter colleges from `colleges_comprehensive`.
 *
 * Delegates to the `search_colleges_filtered` Postgres function (migration 047)
 * which joins college_admissions and college_financial_data **before** applying
 * LIMIT/OFFSET.  This means acceptance_rate and tuition filters always operate on
 * the full dataset and the returned `count`/`totalPages` are always accurate,
 * regardless of which page the caller requests.
 *
 * Two network calls are made:
 *   1. RPC → receives { total, ids[] } for the requested page.
 *   2. SELECT … WHERE id IN (ids) → fetches the full LIST_SELECT payload.
 *
 * If the RPC fails with a column-not-found error (42703) — which happens when
 * the table is missing the state / type / setting columns added by migration 056
 * — the function automatically falls back to searchCollegesDirect() so colleges
 * still load while the migration is pending.
 */
export async function searchColleges(
  filters: CollegeFilters = {}
): Promise<SearchResult> {
  const client = requireClient();

  const {
    query,
    country,
    state,
    type,
    setting,
    minAcceptance,
    maxAcceptance,
    maxTuition,
    sortBy = 'name',
    page = 1,
  } = filters;

  // The Supabase RPC (search_colleges_filtered) understands 'name', 'acceptance_rate',
  // and 'tuition'. Map 'popularity' to 'name' for the server-side call; the
  // returned page will then be re-sorted client-side by selectivity × enrollment.
  const rpcSortBy = sortBy === 'popularity' ? 'name' : sortBy;

  // ── Phase 1: get total count + ordered IDs via server-side RPC ────────────
  const { data: rpcData, error: rpcError } = await client.rpc(
    'search_colleges_filtered',
    {
      p_query:          query          ?? null,
      p_country:        country        ?? null,
      p_state:          state          ?? null,
      p_type:           type           ?? null,
      p_setting:        setting        ?? null,
      p_min_acceptance: minAcceptance  ?? null,
      p_max_acceptance: maxAcceptance  ?? null,
      p_max_tuition:    maxTuition     ?? null,
      p_sort_by:        rpcSortBy,
      p_page:           page,
      p_page_size:      PAGE_SIZE,
    }
  );

  // If the RPC fails with an undefined-column error (42703), the
  // colleges_comprehensive table is missing expected columns (state, type,
  // setting).  Run migration 056_fix_college_schema.sql in the Supabase SQL
  // Editor to permanently fix this.  In the meantime, fall back to a direct
  // paginated query so colleges still load (without server-side filter support
  // for state / type / setting until the migration is applied).
  if (rpcError) {
    const pgCode = (rpcError as { code?: string }).code;
    const msg    = (rpcError as { message?: string }).message ?? '';
    // 42703 = undefined_column (schema not migrated yet)
    // 57014 = query_canceled / statement_timeout
    // PGRST202 = function not found (PostgREST)
    // "upstream timeout" = Supabase edge timeout wrapper
    const isColumnError  = pgCode === '42703' || pgCode === 'PGRST202';
    // 57014 = query_canceled (PostgreSQL statement_timeout)
    // Supabase edge functions wrap timeouts with this exact message prefix.
    const isTimeoutError = pgCode === '57014'
      || msg.toLowerCase().startsWith('sql query ran into an upstream timeout');
    if (isColumnError || isTimeoutError) {
      console.warn(
        '[searchColleges] RPC failed (code', pgCode, ').',
        isColumnError
          ? 'Schema not migrated — run migration 056_fix_college_schema.sql in Supabase SQL Editor.'
          : 'Query timed out — ensure migration 056_fix_college_schema.sql has been run (it adds required indexes).',
        'Falling back to direct query.',
        rpcError.message
      );
      return searchCollegesDirect(client, filters);
    }
    throw rpcError;
  }

  // Migration 054 changed the RPC from RETURNS json (scalar) to
  // RETURNS TABLE(total int, ids json), so PostgREST always returns
  // [{total, ids}] consistently across all PostgREST versions.
  //
  // Defensive fallback chain handles all PostgREST / Supabase versions:
  //   • RETURNS TABLE  → rpcData = [{total, ids}]           → rpcData[0]
  //   • RETURNS json (new PostgREST) → rpcData = {total, ids}  → rpcData
  //   • RETURNS json (old PostgREST) → rpcData = [{search_colleges_filtered: {total,ids}}]
  //                                    → rpcData[0].search_colleges_filtered
  const outerRow  = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  // Handle old PostgREST scalar wrapping where the key is the function name
  const rpcRow    = (outerRow as any)?.search_colleges_filtered ?? outerRow;
  const total: number     = rpcRow?.total ?? 0;
  const safeIds: number[] = (rpcRow?.ids ?? []) as number[];

  console.log('[searchColleges] total:', total, 'ids:', safeIds.length);

  if (safeIds.length === 0) {
    return {
      data: [],
      count: total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }

  // ── Phase 2: fetch full rows for this page's IDs ──────────────────────────
  // NOTE: If this returns [] despite safeIds being non-empty, Row Level Security
  // is likely enabled on colleges_comprehensive without a public-read policy.
  // Run migration 054_supabase_rls_public_read.sql in the Supabase SQL editor.
  const { data, error } = await client
    .from('colleges_comprehensive')
    .select(LIST_SELECT)
    .in('id', safeIds);

  if (error) throw error;

  if ((!data || (data as any[]).length === 0) && safeIds.length > 0) {
    console.warn(
      '[searchColleges] Phase 2 returned 0 rows despite', safeIds.length,
      'IDs from the RPC. This is almost certainly caused by Row Level Security ' +
      'blocking the anon role on colleges_comprehensive. ' +
      'Run migration 054_supabase_rls_public_read.sql in the Supabase SQL editor to fix it.'
    );
  }

  // Re-order to match the sorted IDs from the RPC (the IN query has no ordering)
  const byId = new Map(
    ((data as CollegeWithRelations[]) ?? []).map((c) => [c.id, c])
  );
  const ordered = safeIds
    .map((id) => byId.get(id))
    .filter((c): c is CollegeWithRelations => c !== undefined);

  return {
    data: ordered,
    count: total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

// ─── Single College ───────────────────────────────────────────────────────────

/**
 * Fetch a single college by its numeric ID with all related data (admissions,
 * financials, academics, programs, demographics, campus life, rankings,
 * deadlines, contact info).
 */
export async function getCollegeById(
  id: number
): Promise<CollegeWithRelations | null> {
  const client = requireClient();

  const { data, error } = await client
    .from('colleges_comprehensive')
    .select(FULL_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as CollegeWithRelations | null;
}

/**
 * Fetch a single college by its exact name (case-insensitive).
 * Returns the first match or null.
 */
export async function getCollegeByName(
  name: string
): Promise<CollegeWithRelations | null> {
  const client = requireClient();

  const { data, error } = await client
    .from('colleges_comprehensive')
    .select(FULL_SELECT)
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CollegeWithRelations | null;
}

// ─── Compare ──────────────────────────────────────────────────────────────────

/**
 * Fetch up to 4 colleges by ID for side-by-side comparison.
 */
export async function compareColleges(
  ids: number[]
): Promise<CollegeWithRelations[]> {
  if (ids.length === 0) return [];
  const client = requireClient();

  const safeIds = ids.slice(0, 4);

  const { data, error } = await client
    .from('colleges_comprehensive')
    .select(FULL_SELECT)
    .in('id', safeIds);

  if (error) throw error;
  return (data as CollegeWithRelations[]) ?? [];
}

// ─── Featured ─────────────────────────────────────────────────────────────────

/**
 * Fetch a set of featured colleges for a homepage/discovery widget.
 * Returns colleges ordered by total_enrollment descending.
 */
export async function getFeaturedColleges(
  limit = 12
): Promise<CollegeWithRelations[]> {
  const client = requireClient();

  const { data, error } = await client
    .from('colleges_comprehensive')
    .select(LIST_SELECT)
    .not('total_enrollment', 'is', null)
    .order('total_enrollment', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data as CollegeWithRelations[]) ?? [];
}

// ─── Programs for a college ───────────────────────────────────────────────────

/**
 * Fetch the programs list for a single college, grouped by degree_type.
 * Returns a Map from degree_type → program names.
 */
export async function getCollegePrograms(
  collegeId: number
): Promise<Map<string, string[]>> {
  const client = requireClient();

  const { data, error } = await client
    .from('college_programs')
    .select('program_name, degree_type')
    .eq('college_id', collegeId)
    .order('degree_type', { ascending: true })
    .order('program_name', { ascending: true });

  if (error) throw error;

  const grouped = new Map<string, string[]>();
  for (const row of data ?? []) {
    const key = row.degree_type ?? 'Other';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row.program_name);
  }
  return grouped;
}

// ─── States list (for filter dropdowns) ──────────────────────────────────────

/**
 * Return the distinct list of US states present in `colleges_comprehensive`.
 */
export async function getDistinctStates(): Promise<string[]> {
  const client = requireClient();

  const { data, error } = await client.rpc('get_distinct_states');
  if (error) throw error;

  return (data ?? []).map((row: { state: string }) => row.state).filter(Boolean);
}

// ─── Countries list (for filter dropdowns) ────────────────────────────────────

/**
 * Return the distinct list of countries present in `colleges_comprehensive`.
 */
export async function getDistinctCountries(): Promise<string[]> {
  const client = requireClient();

  const { data, error } = await client.rpc('get_distinct_countries');
  if (error) throw error;

  return (data ?? []).map((row: { country: string }) => row.country).filter(Boolean);
}

// ─── Re-export config flag for convenience ────────────────────────────────────
export { isSupabaseConfigured };

// ─── Helper: get first admissions row ────────────────────────────────────────
export function getAdmissions(college: CollegeWithRelations) {
  return college.college_admissions?.[0] ?? null;
}

export function getFinancials(college: CollegeWithRelations) {
  return college.college_financial_data?.[0] ?? null;
}

export function getAcademics(college: CollegeWithRelations) {
  return college.academic_details?.[0] ?? null;
}

export function getCampusLife(college: CollegeWithRelations) {
  return college.campus_life?.[0] ?? null;
}

export function getDemographics(college: CollegeWithRelations) {
  return college.student_demographics?.[0] ?? null;
}

/**
 * Format an acceptance rate (0–1) as a human-readable percentage string.
 */
export function formatAcceptanceRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return 'N/A';
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

/**
 * Format a dollar amount as "$NNK" or "$N.NM".
 */
export function formatUSD(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount?.toLocaleString() ?? '0'}`;
}

// ─── Normalizers: CollegeWithRelations → page-compatible shapes ───────────────

/** Parse a "low-high" SAT/ACT range string into a percentile object. */
function parseRangeString(
  s: string | null | undefined
): { percentile25: number; percentile75: number } | null {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length !== 2) return null;
  const lo = parseInt(parts[0].trim(), 10);
  const hi = parseInt(parts[1].trim(), 10);
  return !isNaN(lo) && !isNaN(hi) ? { percentile25: lo, percentile75: hi } : null;
}

/**
 * Convert a `CollegeWithRelations` row into the flat shape expected by
 * the `Colleges.tsx` card list.
 */
export function normalizeToCard(c: any): any {
  // The search_colleges_filtered RPC returns flat columns directly on `c`
  // (e.g. c.acceptance_rate, c.tuition_international, c.ranking_qs).
  // If the row came from a SELECT with nested child tables instead, fall back
  // to reading those nested arrays so both code paths work.
  const admissions = c.college_admissions?.[0] ?? null;
  const financial  = c.college_financial_data?.[0] ?? null;
  const academics  = c.academic_details?.[0] ?? null;

  // Acceptance rate: flat RPC column first, then nested fallback
  const acceptanceRate =
    c.acceptance_rate ??
    admissions?.acceptance_rate ??
    null;

  // Tuition: flat RPC columns first, then nested fallback
  const tuitionCost =
    c.tuition_international ??
    c.tuition_domestic ??
    financial?.tuition_out_state ??
    financial?.tuition_international ??
    null;

  // Ranking: flat RPC columns first, then nested fallback
  const rankings = c.college_rankings ?? [];
  const nestedRank = rankings
    .map((r: any) => (r.ranking_value ? parseInt(r.ranking_value, 10) : NaN))
    .filter((n: number) => !isNaN(n) && n > 0)
    .sort((a: number, b: number) => a - b)[0] ?? null;
  const bestRank =
    c.ranking_qs ??
    c.ranking_us_news ??
    nestedRank ??
    null;

  // Programs: only available from nested SELECT, not from RPC
  const programs = c.college_programs ?? [];
  const programNames = programs
    .filter((p: any) => typeof p === 'object' && typeof p.program_name === 'string')
    .map((p: any) => p.program_name);

  return {
    id:                 c.id,
    name:               c.name,
    location:           c.location || [c.city, c.state ?? c.state_region].filter(Boolean).join(', ') || c.country || '',
    country:            c.country ?? '',
    type:               c.type ?? c.institution_type ?? 'Unknown',
    ranking:            bestRank,
    acceptance_rate:    acceptanceRate,
    acceptanceRate:     acceptanceRate,
    tuition_cost:       tuitionCost,
    averageGPA:         admissions?.gpa_50 ?? null,
    enrollment:         c.total_enrollment ?? null,
    description:        c.description ?? null,
    programs:           programNames,
    majorCategories:    programNames.slice(0, 6),
    academicStrengths:  [],
    testScores:         admissions
      ? {
          satRange:   parseRangeString(admissions.sat_range) ?? undefined,
          actRange:   parseRangeString(admissions.act_range) ?? undefined,
          averageGPA: admissions.gpa_50 ?? undefined,
        }
      : null,
    graduationRates:    academics
      ? { fourYear: academics.graduation_rate_4yr ?? null }
      : null,
    studentFacultyRatio: null,
  };
}

/**
 * Convert a `CollegeWithRelations` row into the rich shape expected by
 * `CollegeDetails.tsx`.
 */
export function normalizeToDetail(c: CollegeWithRelations): any {
  const admissions   = c.college_admissions?.[0]    ?? null;
  const financial    = c.college_financial_data?.[0] ?? null;
  const academics    = c.academic_details?.[0]       ?? null;
  const demographics = c.student_demographics?.[0]   ?? null;
  const campusLife   = c.campus_life?.[0]            ?? null;
  const contact      = c.college_contact?.[0]        ?? null;
  const programs     = c.college_programs            ?? [];
  const rankings     = c.college_rankings            ?? [];

  const bestRank = rankings
    .map((r) => (r.ranking_value ? parseInt(r.ranking_value, 10) : NaN))
    .filter((n) => !isNaN(n) && n > 0)
    .sort((a, b) => a - b)[0] ?? null;

  const satRange = parseRangeString(admissions?.sat_range);
  const actRange = parseRangeString(admissions?.act_range);

  const programNames = programs.map((p) => p.program_name).filter(Boolean);
  const degreeTypes  = [...new Set(programs.map((p) => p.degree_type ?? '').filter(Boolean))];

  return {
    id:                    c.id,
    name:                  c.name,
    country:               c.country ?? '',
    location:              [c.city, c.state ?? c.state_region].filter(Boolean).join(', '),
    official_website:      c.website ?? c.website_url ?? '',
    admissions_url:        contact?.admissions_url ?? undefined,
    type:                  c.type ?? c.institution_type ?? null,
    description:           c.description ?? null,
    ranking:               bestRank,
    enrollment:            c.total_enrollment ?? null,
    religious_affiliation: c.religious_affiliation ?? null,
    acceptance_rate:       admissions?.acceptance_rate ?? null,
    acceptanceRate:        admissions?.acceptance_rate ?? null,
    tuition_cost:          financial?.tuition_out_state ?? financial?.tuition_international ?? null,
    avg_net_price:         financial?.avg_net_price ?? null,
    median_debt:           academics?.median_debt        ?? null,
    median_salary_6yr:     academics?.median_salary_6yr  ?? null,
    median_salary_10yr:    academics?.median_salary_10yr ?? null,
    percent_male:          demographics?.percent_male          ?? null,
    percent_female:        demographics?.percent_female        ?? null,
    percent_white:         demographics?.percent_white         ?? null,
    percent_black:         demographics?.percent_black         ?? null,
    percent_hispanic:      demographics?.percent_hispanic      ?? null,
    percent_asian:         demographics?.percent_asian         ?? null,
    percent_international: demographics?.percent_international ?? null,
    programs:         programNames,
    major_categories: degreeTypes,
    majorCategories:  programNames.slice(0, 6),
    academic_strengths: [],
    testScores: admissions
      ? {
          satRange: satRange
            ? { percentile25: satRange.percentile25, percentile75: satRange.percentile75 }
            : undefined,
          actRange: actRange
            ? { percentile25: actRange.percentile25, percentile75: actRange.percentile75 }
            : undefined,
          averageGPA: admissions.gpa_50 ?? undefined,
        }
      : null,
    studentStats: admissions
      ? {
          gpa50:     admissions.gpa_50   ?? null,
          sat_range: admissions.sat_range ?? null,
          act_range: admissions.act_range ?? null,
        }
      : undefined,
    financialData: financial
      ? {
          tuitionInState:        financial.tuition_in_state        ?? null,
          tuitionOutState:       financial.tuition_out_state       ?? null,
          tuitionInternational:  financial.tuition_international   ?? null,
          avgNetPrice:           financial.avg_net_price           ?? null,
        }
      : undefined,
    academicOutcomes: academics
      ? {
          graduationRate4yr:     academics.graduation_rate_4yr  ?? null,
          retentionRate:         academics.retention_rate       ?? null,
          medianSalary6yr:       academics.median_salary_6yr   ?? null,
          medianStartSalary:     academics.median_salary_6yr   ?? null,
          medianSalary10yr:      academics.median_salary_10yr  ?? null,
          medianMidCareerSalary: academics.median_salary_10yr  ?? null,
        }
      : undefined,
    demographics: demographics
      ? {
          percentMale:          demographics.percent_male          ?? null,
          percentFemale:        demographics.percent_female        ?? null,
          percentWhite:         demographics.percent_white         ?? null,
          percentBlack:         demographics.percent_black         ?? null,
          percentHispanic:      demographics.percent_hispanic      ?? null,
          percentAsian:         demographics.percent_asian         ?? null,
          percentInternational: demographics.percent_international ?? null,
        }
      : undefined,
    comprehensiveData: {
      totalEnrollment:      c.total_enrollment    ?? null,
      city:                 c.city                ?? null,
      stateRegion:          c.state ?? c.state_region ?? null,
      institutionType:      c.type  ?? c.institution_type ?? null,
      religiousAffiliation: c.religious_affiliation ?? null,
      foundingYear:         c.founded_year ?? c.founding_year ?? null,
      websiteUrl:           c.website ?? c.website_url ?? null,
    },
    campusLife: campusLife
      ? {
          housingGuarantee:
            campusLife.housing_guarantee !== null
              ? (campusLife.housing_guarantee ? 'Guaranteed' : 'Not guaranteed')
              : null,
        }
      : undefined,
    rankings: rankings.map((r) => ({
      year:         r.ranking_year ?? new Date().getFullYear(),
      rankingBody:  r.ranking_source,
      nationalRank: r.ranking_value ? parseInt(r.ranking_value, 10) : null,
      globalRank:   null,
    })),
    graduationRates: academics
      ? { fourYear: academics.graduation_rate_4yr ?? null }
      : null,
    studentFacultyRatio: null,
  };
}
