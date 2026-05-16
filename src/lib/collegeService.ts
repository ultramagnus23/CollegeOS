/**
 * src/lib/collegeService.ts
 *
 * Canonical Supabase service for unified `colleges` data access.
 *
 * CRITICAL:
 * - Uses ONLY `colleges` (and optional child tables still used by UI)
 * - Never queries legacy schema tables for admissions/academics/demographics
 * - Never uses SELECT *
 */
import {
  supabase,
  isSupabaseConfigured,
  CollegeWithRelations,
} from './supabase';
import {
  mapCollegeRow,
  normalizeBestRanking,
  normalizeMajors,
} from '../utils/collegeMapper';

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const COLLEGE_SYNC_DEBUG = import.meta.env.DEV;

type CollegeSchemaMode = 'canonical' | 'legacy';

const CANONICAL_COLLEGES_COLUMNS = [
  'id', 'name', 'slug', 'country', 'location',
  'type', 'institution_type',
  'website:website_url', 'website_url', 'official_website', 'logo_url', 'description',
  'acceptance_rate', 'act_avg',
  'tuition_cost',
  'avg_institutional_grant', 'avg_merit_aid',
  'pct_receiving_merit_aid', 'pct_students_receiving_aid',
  'international_aid_available', 'international_aid_avg',
  'meets_full_need', 'css_profile_required',
  'median_earnings_6yr', 'median_earnings_10yr',
  'rd_deadline', 'ed_deadline', 'ea_deadline',
  'popularity_score', 'updated_at',
].join(', ');

const LEGACY_COLLEGES_COLUMNS = [
  'id', 'name', 'slug', 'country', 'location',
  'institution_type', 'type',
  'website:website_url', 'website_url', 'official_website', 'logo_url', 'description',
  'acceptance_rate', 'act_avg',
  'tuition_cost',
  'avg_institutional_grant', 'avg_merit_aid',
  'pct_receiving_merit_aid', 'pct_students_receiving_aid',
  'international_aid_available', 'international_aid_avg',
  'meets_full_need', 'css_profile_required',
  'median_earnings_6yr', 'median_earnings_10yr',
  'rd_deadline', 'ed_deadline', 'ea_deadline',
  'popularity_score', 'updated_at',
].join(', ');

const LIST_SELECT = `
  ${CANONICAL_COLLEGES_COLUMNS},
  college_stats(*)
` as const;

const LEGACY_LIST_SELECT = `
  ${LEGACY_COLLEGES_COLUMNS},
  college_stats(*)
` as const;

const FLAT_LIST_SELECT = `${CANONICAL_COLLEGES_COLUMNS}` as const;
const LEGACY_FLAT_LIST_SELECT = `${LEGACY_COLLEGES_COLUMNS}` as const;

const FULL_SELECT = `
  ${CANONICAL_COLLEGES_COLUMNS},
  college_stats(*)
` as const;

const LEGACY_FULL_SELECT = `
  ${LEGACY_COLLEGES_COLUMNS},
  college_stats(*)
` as const;

const FLAT_FULL_SELECT = `${CANONICAL_COLLEGES_COLUMNS}` as const;
const LEGACY_FLAT_FULL_SELECT = `${LEGACY_COLLEGES_COLUMNS}` as const;

function debugCollegeSync(stage: string, payload: unknown) {
  if (!COLLEGE_SYNC_DEBUG) return;
  console.debug(`[CollegeSync] ${stage}`, payload);
}

function requireClient() {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}

function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  return fn().finally(() => {
    const ms = Math.round(performance.now() - started);
    console.info(`[collegeService] ${label} ${ms}ms`);
  });
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  const msg = [e.message, e.details, e.hint]
    .filter((part) => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  return msg.includes('column') && msg.includes('does not exist');
}

function isMissingRelationshipError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code.toUpperCase() : '';
  const msg = [e.message, e.details, e.hint]
    .filter((part) => typeof part === 'string')
    .join(' ')
    .toLowerCase();
  return code === 'PGRST200'
    || msg.includes('could not find a relationship')
    || msg.includes('no relationship found')
    || msg.includes('pgrst200');
}

async function withCollegeSchemaFallback<T>(
  operation: string,
  run: (mode: CollegeSchemaMode, shape: 'relational' | 'flat') => Promise<T>
): Promise<T> {
  const attempts: Array<{ mode: CollegeSchemaMode; shape: 'relational' | 'flat' }> = [
    { mode: 'canonical', shape: 'relational' },
    { mode: 'legacy', shape: 'relational' },
    { mode: 'canonical', shape: 'flat' },
    { mode: 'legacy', shape: 'flat' },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return await run(attempt.mode, attempt.shape);
    } catch (error) {
      lastError = error;
      const compatibilityError = isMissingColumnError(error) || isMissingRelationshipError(error);
      if (!compatibilityError) throw error;
      debugCollegeSync(`${operation}.fallback`, {
        mode: attempt.mode,
        shape: attempt.shape,
        reason: (error as any)?.message ?? 'compatibility fallback',
      });
    }
  }
  throw lastError;
}

function getTypeColumn(mode: CollegeSchemaMode): 'type' | 'institution_type' {
  return mode === 'legacy' ? 'institution_type' : 'type';
}

function getListSelect(mode: CollegeSchemaMode, shape: 'relational' | 'flat'): string {
  if (shape === 'flat') return mode === 'legacy' ? LEGACY_FLAT_LIST_SELECT : FLAT_LIST_SELECT;
  return mode === 'legacy' ? LEGACY_LIST_SELECT : LIST_SELECT;
}

function getFullSelect(mode: CollegeSchemaMode, shape: 'relational' | 'flat'): string {
  if (shape === 'flat') return mode === 'legacy' ? LEGACY_FLAT_FULL_SELECT : FLAT_FULL_SELECT;
  return mode === 'legacy' ? LEGACY_FULL_SELECT : FULL_SELECT;
}

function normalizeOrder(sortBy?: string): { column: string; ascending: boolean } {
  switch (sortBy) {
    case 'acceptance_rate':
      return { column: 'acceptance_rate', ascending: true };
    case 'tuition':
      return { column: 'tuition_cost', ascending: true };
    case 'ranking':
      return { column: 'popularity_score', ascending: false };
    case 'name':
    default:
      return { column: 'name', ascending: true };
  }
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function buildDeadlineTemplates(c: Record<string, any>) {
  const templates: Record<string, { date: string; type: string }> = {};
  const add = (key: string, type: string, date: unknown) => {
    if (typeof date !== 'string' || !date.trim() || templates[key]) return;
    templates[key] = { date, type };
  };

  const normalizedDeadlines = Array.isArray(c.college_deadlines) ? c.college_deadlines : [];
  for (const deadline of normalizedDeadlines) {
    const rawType = String(deadline?.deadline_type ?? '').toLowerCase();
    const date = deadline?.deadline_date;
    if (rawType.includes('regular')) add('regularDecision', 'Regular Decision', date);
    else if (rawType.includes('early decision')) add('earlyDecision', 'Early Decision', date);
    else if (rawType.includes('early action')) add('earlyAction', 'Early Action', date);
    else if (rawType.includes('priority')) add('priority', 'Priority', date);
    else if (rawType.includes('financial')) add('financialAid', 'Financial Aid', date);
  }

  add('regularDecision', 'Regular Decision', c.rd_deadline ?? c.application_deadline);
  add('earlyDecision', 'Early Decision', c.ed_deadline);
  add('earlyAction', 'Early Action', c.ea_deadline);

  return Object.keys(templates).length > 0 ? templates : undefined;
}

export interface CollegeFilters {
  query?: string;
  country?: string;
  state?: string;
  type?: string;
  setting?: string;
  minAcceptance?: number;
  maxAcceptance?: number;
  maxTuition?: number;
  sortBy?: string;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  data: CollegeWithRelations[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function searchColleges(filters: CollegeFilters = {}): Promise<SearchResult> {
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
    sortBy,
    page = 1,
    pageSize = PAGE_SIZE,
  } = filters;

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || PAGE_SIZE));
  const { column, ascending } = normalizeOrder(sortBy);

  return timed('searchColleges', async () =>
    withCollegeSchemaFallback('searchColleges', async (mode, shape) => {
      let q = client.from('colleges').select(getListSelect(mode, shape), { count: 'estimated' });

      if (query) q = q.ilike('name', `%${query}%`);
      if (country) q = q.eq('country', country);
      if (state) q = q.ilike('location', `%${state}%`);
      if (type) q = q.eq(getTypeColumn(mode), type);
      if (minAcceptance !== undefined) q = q.gte('acceptance_rate', minAcceptance);
      if (maxAcceptance !== undefined) q = q.lte('acceptance_rate', maxAcceptance);
      if (maxTuition !== undefined) q = q.lte('tuition_cost', maxTuition);

      const from = (safePage - 1) * safePageSize;
      const to = from + safePageSize - 1;

      const { data, error, count } = await q.order(column, { ascending }).range(from, to);
      if (error) throw error;

      const rows = ((data as CollegeWithRelations[] | null) ?? []).filter(Boolean);
      rows.forEach((row) => mapCollegeRow(row, 'searchColleges'));

      const total = count ?? 0;
      return {
        data: rows,
        count: total,
        page: safePage,
        pageSize: safePageSize,
        totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      };
    })
  );
}

export async function getCollegeById(id: number): Promise<CollegeWithRelations | null> {
  const client = requireClient();
  return timed('getCollegeById', async () =>
    withCollegeSchemaFallback('getCollegeById', async (mode, shape) => {
      const { data, error } = await client
        .from('colleges')
        .select(getFullSelect(mode, shape))
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      mapCollegeRow(data as CollegeWithRelations, 'getCollegeById');
      return data as CollegeWithRelations;
    })
  );
}

export async function getCollegeByName(name: string): Promise<CollegeWithRelations | null> {
  const client = requireClient();
  return timed('getCollegeByName', async () =>
    withCollegeSchemaFallback('getCollegeByName', async (mode, shape) => {
      const { data, error } = await client
        .from('colleges')
        .select(getFullSelect(mode, shape))
        .ilike('name', name)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      mapCollegeRow(data as CollegeWithRelations, 'getCollegeByName');
      return data as CollegeWithRelations;
    })
  );
}

export async function compareColleges(ids: number[]): Promise<CollegeWithRelations[]> {
  if (ids.length === 0) return [];
  const client = requireClient();
  const safeIds = ids.slice(0, 4);

  return timed('compareColleges', async () =>
    withCollegeSchemaFallback('compareColleges', async (mode, shape) => {
      const { data, error } = await client
        .from('colleges')
        .select(getFullSelect(mode, shape))
        .in('id', safeIds);

      if (error) throw error;
      const rows = (data as CollegeWithRelations[]) ?? [];
      rows.forEach((r) => mapCollegeRow(r, 'compareColleges'));
      return rows;
    })
  );
}

export async function getFeaturedColleges(limit = 12): Promise<CollegeWithRelations[]> {
  const client = requireClient();
  return timed('getFeaturedColleges', async () =>
    withCollegeSchemaFallback('getFeaturedColleges', async (mode, shape) => {
      const { data, error } = await client
        .from('colleges')
        .select(getListSelect(mode, shape))
        .order('name', { ascending: true })
        .limit(Math.min(50, Math.max(1, limit)));

      if (error) throw error;
      const rows = (data as CollegeWithRelations[]) ?? [];
      rows.forEach((r) => mapCollegeRow(r, 'getFeaturedColleges'));
      return rows;
    })
  );
}

export async function getCollegePrograms(collegeId: number): Promise<Map<string, string[]>> {
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

export async function getDistinctStates(): Promise<string[]> {
  const client = requireClient();
  const { data, error } = await client.from('colleges').select('location').not('location', 'is', null).limit(1000);
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { location: string | null }) => r.location).filter(Boolean) as string[])].sort();
}

export async function getDistinctCountries(): Promise<string[]> {
  const client = requireClient();
  const { data, error } = await client.from('colleges').select('country').not('country', 'is', null).limit(1000);
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { country: string | null }) => r.country).filter(Boolean) as string[])].sort();
}

export { isSupabaseConfigured };

// TODO: REMOVE LEGACY SCHEMA — legacy nested tables removed from canonical flow.
export function getAdmissions(_college: CollegeWithRelations) { return null; }
export function getFinancials(college: CollegeWithRelations) {
  return (college as any).college_stats?.[0] ?? college.college_financial_data?.[0] ?? null;
}
export function getAcademics(_college: CollegeWithRelations) { return null; }
export function getCampusLife(college: CollegeWithRelations) { return college.campus_life?.[0] ?? null; }
export function getDemographics(_college: CollegeWithRelations) { return null; }

export function formatAcceptanceRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return 'N/A';
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

export function formatUSD(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'N/A';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount.toLocaleString()}`;
}

export function normalizeToCard(c: any): any {
  const mapped = mapCollegeRow(c as CollegeWithRelations, 'normalizeToCard') as Record<string, any>;
  const ranking = normalizeBestRanking(c as Record<string, unknown>, c.college_rankings ?? undefined);
  const majors = mapped.programs?.length
    ? mapped.programs.map((p: { program_name?: string }) => p.program_name).filter(Boolean)
    : normalizeMajors(c.top_majors);

  const acceptanceRate = mapped.acceptanceRate ?? null;

  return {
    id: c.id,
    name: c.name,
    location: mapped.location ?? ([c.city, c.state].filter(Boolean).join(', ') || c.country || ''),
    country: c.country ?? '',
    type: mapped.type ?? 'Unknown',
    ranking,
    acceptance_rate: acceptanceRate,
    acceptanceRate,
    tuition_cost: mapped.tuitionCost ?? null,
    averageGPA: firstDefined(mapped.gpa75, mapped.gpa25),
    enrollment: mapped.totalEnrollment ?? null,
    description: mapped.description ?? null,
    programs: majors,
    majorCategories: majors.slice(0, 6),
    academicStrengths: [],
    data_source: mapped.dataSource ?? null,
    data_source_url: mapped.dataSourceUrl ?? null,
    last_updated_at: mapped.lastUpdatedAt ?? null,
    data_quality_score: mapped.dataQualityScore ?? null,
    needs_enrichment: mapped.needsEnrichment ?? null,
    testScores: (mapped.sat25 != null || mapped.sat75 != null || mapped.act25 != null || mapped.act75 != null)
      ? {
          satRange: mapped.sat25 != null && mapped.sat75 != null ? { percentile25: mapped.sat25, percentile75: mapped.sat75 } : undefined,
          actRange: mapped.act25 != null && mapped.act75 != null ? { percentile25: mapped.act25, percentile75: mapped.act75 } : undefined,
          averageGPA: firstDefined(mapped.gpa75, mapped.gpa25) ?? undefined,
        }
      : null,
    graduationRates: null,
    studentFacultyRatio: null,
  };
}

export function normalizeToDetail(c: CollegeWithRelations): any {
  const mapped = mapCollegeRow(c, 'normalizeToDetail') as Record<string, any>;
  const programNames = Array.isArray(mapped.programs)
    ? mapped.programs.map((p: { program_name?: string }) => p.program_name).filter(Boolean)
    : normalizeMajors(c.top_majors);

  const rankings = Array.isArray(mapped.rankings) ? mapped.rankings : [];
  const bestRank = normalizeBestRanking(c as unknown as Record<string, unknown>, c.college_rankings ?? undefined);

  return {
    id: c.id,
    name: c.name,
    country: c.country ?? '',
    location: mapped.location ?? [c.city, c.state].filter(Boolean).join(', '),
    official_website: mapped.officialWebsite ?? mapped.website ?? '',
    admissions_url: mapped.admissionsUrl ?? undefined,
    type: mapped.type ?? null,
    description: mapped.description ?? null,
    ranking: bestRank,
    enrollment: mapped.totalEnrollment ?? null,
    religious_affiliation: mapped.religiousAffiliation ?? null,
    acceptance_rate: mapped.acceptanceRate ?? null,
    acceptanceRate: mapped.acceptanceRate ?? null,
    tuition_cost: mapped.tuitionCost ?? null,
    avg_net_price: mapped.avgNetPrice ?? null,
    median_salary_6yr: mapped.medianEarnings6yr ?? null,
    median_salary_10yr: mapped.medianEarnings10yr ?? null,
    programs: programNames,
    major_categories: programNames.slice(0, 6),
    majorCategories: programNames.slice(0, 6),
    academic_strengths: [],
    testScores: (mapped.sat25 != null || mapped.sat75 != null || mapped.act25 != null || mapped.act75 != null || mapped.gpa25 != null || mapped.gpa75 != null)
      ? {
          satRange: mapped.sat25 != null && mapped.sat75 != null ? { percentile25: mapped.sat25, percentile75: mapped.sat75 } : undefined,
          actRange: mapped.act25 != null && mapped.act75 != null ? { percentile25: mapped.act25, percentile75: mapped.act75 } : undefined,
          averageGPA: firstDefined(mapped.gpa75, mapped.gpa25) ?? undefined,
        }
      : null,
    studentStats: {
      gpa25: mapped.gpa25 ?? null,
      gpa50: firstDefined(mapped.gpa75, mapped.gpa25),
      gpa75: mapped.gpa75 ?? null,
      sat25: mapped.sat25 ?? null,
      sat75: mapped.sat75 ?? null,
      act25: mapped.act25 ?? null,
      act75: mapped.act75 ?? null,
    },
    financialData: {
      tuitionInState: mapped.tuitionInState ?? null,
      tuitionOutState: mapped.tuitionOutState ?? null,
      tuitionInternational: mapped.tuitionInternational ?? null,
      avgNetPrice: mapped.avgNetPrice ?? null,
      avgFinancialAid: mapped.avgInstitutionalGrant ?? mapped.internationalAidAvg ?? null,
      percentReceivingAid: mapped.pctStudentsReceivingAid ?? null,
    },
    academicOutcomes: {
      graduationRate4yr: null,
      retentionRate: null,
      medianSalary6yr: mapped.medianEarnings6yr ?? null,
      medianStartSalary: mapped.medianEarnings6yr ?? null,
      medianSalary10yr: mapped.medianEarnings10yr ?? null,
      medianMidCareerSalary: mapped.medianEarnings10yr ?? null,
    },
    demographics: undefined,
    comprehensiveData: {
      totalEnrollment: mapped.totalEnrollment ?? null,
      city: c.city ?? null,
      stateRegion: c.state ?? null,
      institutionType: mapped.type ?? null,
      religiousAffiliation: mapped.religiousAffiliation ?? null,
      foundingYear: mapped.foundedYear ?? null,
      websiteUrl: mapped.website ?? mapped.officialWebsite ?? null,
    },
    campusLife: {
      housingGuarantee: mapped.housingGuarantee ?? null,
    },
    deadlineTemplates: buildDeadlineTemplates(c as Record<string, any>),
    data_source: mapped.dataSource ?? null,
    data_source_url: mapped.dataSourceUrl ?? null,
    last_updated_at: mapped.lastUpdatedAt ?? null,
    updated_at: mapped.updatedAt ?? null,
    needs_enrichment: mapped.needsEnrichment ?? null,
    data_quality_score: mapped.dataQualityScore ?? null,
    rankings,
    graduationRates: null,
    studentFacultyRatio: null,
  };
}
