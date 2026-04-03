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
 * Search and filter colleges from `colleges_comprehensive`.
 * Accepts all `CollegeFilters` fields.  Returns a paginated result.
 */
export async function searchColleges(
  filters: CollegeFilters = {}
): Promise<SearchResult> {
  const client = requireClient();

  const {
    query,
    state,
    type,
    setting,
    minAcceptance,
    maxAcceptance,
    maxTuition,
    page = 1,
  } = filters;

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = client
    .from('colleges_comprehensive')
    .select(LIST_SELECT, { count: 'exact' });

  if (query) q = q.ilike('name', `%${query}%`);
  if (state) q = q.eq('state', state);
  if (type) q = q.eq('type', type);
  if (setting) q = q.eq('setting', setting);

  // acceptance_rate and tuition live in child tables; Supabase does not support
  // filtering on embedded rows directly, so those are applied post-fetch below.
  q = q.range(from, to).order('name', { ascending: true });

  const { data, error, count } = await q;
  if (error) throw error;

  let results = (data as CollegeWithRelations[]) ?? [];

  // Post-fetch filter on acceptance_rate (from college_admissions[0])
  if (minAcceptance !== undefined || maxAcceptance !== undefined) {
    results = results.filter((c) => {
      const rate = c.college_admissions?.[0]?.acceptance_rate;
      if (rate === null || rate === undefined) return false;
      if (minAcceptance !== undefined && rate < minAcceptance) return false;
      if (maxAcceptance !== undefined && rate > maxAcceptance) return false;
      return true;
    });
  }

  // Post-fetch filter on tuition (from college_financial_data[0])
  if (maxTuition !== undefined) {
    results = results.filter((c) => {
      const tuition =
        c.college_financial_data?.[0]?.tuition_out_state ??
        c.college_financial_data?.[0]?.tuition_international;
      if (tuition === null || tuition === undefined) return true; // keep unknowns
      return tuition <= maxTuition;
    });
  }

  const total = count ?? 0;

  return {
    data: results,
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

  const { data, error } = await client
    .from('colleges_comprehensive')
    .select('state')
    .not('state', 'is', null)
    .order('state', { ascending: true });

  if (error) throw error;

  const seen = new Set<string>();
  const states: string[] = [];
  for (const row of data ?? []) {
    if (row.state && !seen.has(row.state)) {
      seen.add(row.state);
      states.push(row.state);
    }
  }
  return states;
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
 * Handles both decimal (0.08) and percentage (8) formats.
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
  return `$${amount.toLocaleString()}`;
}
