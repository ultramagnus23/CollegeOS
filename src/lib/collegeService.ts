import { supabase, isSupabaseConfigured, CollegeWithRelations } from './supabase';
import { formatCountryName, normalizeCountryCode } from './country';
import {
  COLLEGE_CARD_COLUMNS,
  FRONTEND_CANONICAL_RELATION,
  parseFrontendCollegeCardOrThrow,
} from '../contracts/collegeContracts';
import type { FrontendCollegeCard } from '../contracts/frontendCollegeCardContract';

type CanonicalId = string | number;

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const CANONICAL_DEBUG = import.meta.env.DEV || import.meta.env.VITE_CANONICAL_DEBUG === '1';

type CanonicalCardRow = FrontendCollegeCard;

interface CanonicalCollegeDetail {
  institution: Record<string, unknown>;
  admissions: Record<string, unknown>;
  financials: Record<string, unknown>;
  outcomes: Record<string, unknown>;
  deadlines: Array<Record<string, unknown>>;
  requirements: Array<Record<string, unknown>>;
  rankings: Array<Record<string, unknown>>;
  demographics: Record<string, unknown>;
  campus_life: Record<string, unknown>;
  programs: Array<Record<string, unknown>>;
  completeness: Record<string, unknown>;
  quality_scores: Record<string, unknown>;
}

type CollegeRecord = CollegeWithRelations | CanonicalCollegeDetail;

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
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

function debugCanonical(label: string, payload: Record<string, unknown>) {
  if (!CANONICAL_DEBUG) return;
  console.debug(`[collegeService][debug] ${label}`, payload);
}

function normalizeOrder(sortBy?: string): { column: string; ascending: boolean } {
  switch (sortBy) {
    case 'acceptance_rate':
      return { column: 'acceptance_rate', ascending: true };
    case 'tuition':
      return { column: 'cost_of_attendance', ascending: true };
    case 'ranking':
      return { column: 'global_rank', ascending: true };
    case 'popularity':
      return { column: 'popularity_score', ascending: false };
    case 'name':
    default:
      return { column: 'canonical_name', ascending: true };
  }
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

async function resolveInstitutionId(id: CanonicalId): Promise<CanonicalId | null> {
  const client = requireClient();
  const rawId = String(id).trim();
  if (!rawId) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId);
  if (isUuid) return rawId;

  const { data } = await client
    .schema('canonical')
    .from('institution_identity_map')
    .select('institution_id')
    .eq('source_pk', rawId)
    .limit(1)
    .maybeSingle();

  return data?.institution_id ?? null;
}

async function getSearchIndexInstitutionIds(query: string): Promise<CanonicalId[]> {
  const client = requireClient();
  const normalized = query.trim();
  if (!normalized) return [];

  const { data } = await client
    .schema('canonical')
    .from('institution_search_index')
    .select('institution_id')
    .ilike('autocomplete_text', `%${normalized}%`)
    .limit(250);

  return (data ?? []).map((row: { institution_id: CanonicalId }) => row.institution_id).filter(Boolean);
}

async function enrichCardRows(baseRows: CanonicalCardRow[]): Promise<Array<Record<string, unknown>>> {
  const byCountry = new Map<string, { total: number; missingAdmissions: number; missingFinancials: number }>();
  const rows = baseRows.map((row) => {
    const countryCode = String(row.country_code ?? '').toUpperCase() || 'UNKNOWN';
    const acc = byCountry.get(countryCode) ?? { total: 0, missingAdmissions: 0, missingFinancials: 0 };
    acc.total += 1;
    const metadata = asRecord(row.metadata);
    const admissions = asRecord(metadata.admissions);
    const financials = asRecord(metadata.financials);
    const outcomes = asRecord(metadata.outcomes);
    const completeness = asRecord(metadata.completeness);
    const quality = asRecord(metadata.quality_scores);
    if (Object.keys(admissions).length === 0) acc.missingAdmissions += 1;
    if (Object.keys(financials).length === 0) acc.missingFinancials += 1;
    byCountry.set(countryCode, acc);
    return {
      ...row,
      sat_50: num(firstDefined(admissions.sat_50, row.sat_50)),
      act_50: num(firstDefined(admissions.act_50, row.act_50)),
      test_optional: bool(admissions.test_optional),
      tuition_international: num(firstDefined(financials.tuition_international, row.tuition_international)),
      cost_of_attendance: num(firstDefined(financials.cost_of_attendance, row.cost_of_attendance)),
      merit_scholarship_flag: bool(financials.merit_scholarship_flag),
      need_blind_flag: bool(financials.need_blind_flag),
      international_aid_available: bool(metadata.international_aid_available),
      graduation_rate_6yr: num(outcomes.graduation_rate_6yr),
      median_start_salary: num(firstDefined(outcomes.median_start_salary, row.median_start_salary)),
      completeness_score: num(completeness.overall_score),
      freshness_score: num(quality.freshness_score),
      data_quality_score: num(quality.final_quality_score),
    };
  });
  debugCanonical('card_hydration_summary', {
    countries: [...byCountry.entries()].map(([country_code, stat]) => ({ country_code, ...stat })),
  });
  return rows;
}

function buildDeadlineTemplates(deadlines: Array<Record<string, unknown>>): Record<string, { date: string; type: string }> | undefined {
  const templates: Record<string, { date: string; type: string }> = {};
  for (const item of deadlines) {
    const type = String(item.deadline_type ?? '').trim();
    const date = String(item.deadline_date ?? '').trim();
    if (!type || !date) continue;
    if (/regular/i.test(type) && !templates.regularDecision) templates.regularDecision = { date, type };
    if (/early\s*decision/i.test(type) && !templates.earlyDecision) templates.earlyDecision = { date, type };
    if (/early\s*action/i.test(type) && !templates.earlyAction) templates.earlyAction = { date, type };
  }
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
  data: CollegeRecord[];
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

  return timed('searchColleges', async () => {
    let q = client.schema('canonical').from('mv_college_cards').select(COLLEGE_CARD_COLUMNS, { count: 'estimated' });

    if (query?.trim()) {
      const ids = await getSearchIndexInstitutionIds(query);
      if (ids.length > 0) {
        q = q.in('id', ids as string[]);
      } else {
        q = q.ilike('canonical_name', `%${query.trim()}%`);
      }
    }

    if (country) q = q.eq('country_code', country);
    if (minAcceptance !== undefined) q = q.gte('acceptance_rate', minAcceptance);
    if (maxAcceptance !== undefined) q = q.lte('acceptance_rate', maxAcceptance);
    if (maxTuition !== undefined) q = q.lte('cost_of_attendance', maxTuition);

    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    const { data, error, count } = await q.order(column, { ascending }).range(from, to);
    if (error) throw error;

    const parsedRows = (data ?? []).map((raw) => parseFrontendCollegeCardOrThrow(raw as unknown)) as CanonicalCardRow[];

    const enrichedRows = await enrichCardRows(parsedRows);
    const sortedRows =
      sortBy === 'ranking'
        ? [...enrichedRows].sort((a, b) => (num(a.global_rank) ?? 999999) - (num(b.global_rank) ?? 999999))
        : enrichedRows;

    const total = count ?? 0;
    return {
      data: sortedRows as CollegeRecord[],
      count: total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  });
}

export async function getCollegeById(id: CanonicalId): Promise<CollegeRecord | null> {
  const client = requireClient();
  return timed('getCollegeById', async () => {
    const institutionId = await resolveInstitutionId(id);
    if (!institutionId) return null;

    const [institutionRes, admissionsRes, financialsRes, outcomesRes, deadlinesRes, requirementsRes, rankingsRes, demographicsRes, campusLifeRes, programsRes, completenessRes, qualityRes] = await Promise.all([
      client.schema('canonical').from('institutions').select('id, canonical_name, normalized_name, slug, aliases, country_code, region_code, state_region, city, latitude, longitude, institution_type, control_type, established_year, website, logo_url, canonical_external_ids, metadata, updated_at').eq('id', institutionId as string).maybeSingle(),
      client.schema('canonical').from('institution_admissions').select('institution_id, data_year, acceptance_rate, yield_rate, sat_25, sat_50, sat_75, act_25, act_50, act_75, test_optional, application_volume, admit_volume, enrollment_volume').eq('institution_id', institutionId as string).order('data_year', { ascending: false, nullsFirst: false }).limit(1),
      client.schema('canonical').from('institution_financials').select('institution_id, data_year, tuition_in_state, tuition_out_state, tuition_international, cost_of_attendance, avg_financial_aid, avg_debt, percent_receiving_aid, merit_scholarship_flag, need_blind_flag, net_price_low_income, net_price_mid_income, net_price_high_income').eq('institution_id', institutionId as string).order('data_year', { ascending: false, nullsFirst: false }).limit(1),
      client.schema('canonical').from('institution_outcomes').select('institution_id, data_year, graduation_rate_4yr, graduation_rate_6yr, retention_rate, employment_rate, median_start_salary, median_mid_career_salary, grad_school_rate').eq('institution_id', institutionId as string).order('data_year', { ascending: false, nullsFirst: false }).limit(1),
      client.schema('canonical').from('institution_deadlines').select('deadline_type, deadline_date, notification_date, is_binding, cycle_year').eq('institution_id', institutionId as string).order('cycle_year', { ascending: false, nullsFirst: false }),
      client.schema('canonical').from('institution_requirements').select('requirement_category, requirement_name, requirement_value, requirement_payload').eq('institution_id', institutionId as string),
      client.schema('canonical').from('institution_rankings').select('ranking_year, ranking_body, national_rank, global_rank, subject_rank, ranking_score').eq('institution_id', institutionId as string).order('ranking_year', { ascending: false, nullsFirst: false }),
      client.schema('canonical').from('institution_demographics').select('institution_id, data_year, percent_international, gender_ratio, ethnic_distribution, percent_first_gen').eq('institution_id', institutionId as string).order('data_year', { ascending: false, nullsFirst: false }).limit(1),
      client.schema('canonical').from('institution_campus_life').select('institution_id, housing_guarantee, campus_safety_score, athletics_division, club_count').eq('institution_id', institutionId as string).limit(1),
      client.schema('canonical').from('institution_programs').select('program_name, degree_type, field_category, enrollment, acceptance_rate').eq('institution_id', institutionId as string).order('program_name', { ascending: true }),
      client.schema('canonical').from('institution_completeness').select('institution_id, overall_score, section_scores, missing_required_fields').eq('institution_id', institutionId as string).maybeSingle(),
      client.schema('canonical').from('institution_quality_scores').select('institution_id, freshness_score, final_quality_score, confidence_penalty').eq('institution_id', institutionId as string).maybeSingle(),
    ]);

    if (institutionRes.error) throw institutionRes.error;
    if (!institutionRes.data) return null;

    const detail = {
      institution: institutionRes.data as Record<string, unknown>,
      admissions: (admissionsRes.data?.[0] ?? {}) as Record<string, unknown>,
      financials: (financialsRes.data?.[0] ?? {}) as Record<string, unknown>,
      outcomes: (outcomesRes.data?.[0] ?? {}) as Record<string, unknown>,
      deadlines: (deadlinesRes.data ?? []) as Array<Record<string, unknown>>,
      requirements: (requirementsRes.data ?? []) as Array<Record<string, unknown>>,
      rankings: (rankingsRes.data ?? []) as Array<Record<string, unknown>>,
      demographics: (demographicsRes.data?.[0] ?? {}) as Record<string, unknown>,
      campus_life: (campusLifeRes.data?.[0] ?? {}) as Record<string, unknown>,
      programs: (programsRes.data ?? []) as Array<Record<string, unknown>>,
      completeness: (completenessRes.data ?? {}) as Record<string, unknown>,
      quality_scores: (qualityRes.data ?? {}) as Record<string, unknown>,
    } satisfies CanonicalCollegeDetail;

    const institution = detail.institution as Record<string, unknown>;
    debugCanonical('detail_hydration', {
      institution_id: institution.id ?? institutionId,
      country_code: institution.country_code ?? null,
      admissions_present: Object.keys(detail.admissions ?? {}).length > 0,
      financials_present: Object.keys(detail.financials ?? {}).length > 0,
      rankings_count: Array.isArray(detail.rankings) ? detail.rankings.length : 0,
      completeness_score: (detail.completeness as Record<string, unknown>)?.overall_score ?? null,
      quality_score: (detail.quality_scores as Record<string, unknown>)?.final_quality_score ?? null,
    });

    return detail;
  });
}

export async function getCollegeByName(name: string): Promise<CollegeRecord | null> {
  const result = await searchColleges({ query: name, page: 1, pageSize: 1 });
  return result.data[0] ?? null;
}

export async function compareColleges(ids: CanonicalId[]): Promise<CollegeRecord[]> {
  if (ids.length === 0) return [];
  const rows = await Promise.all(ids.slice(0, 4).map((id) => getCollegeById(id)));
  return rows.filter(Boolean) as CollegeRecord[];
}

export async function getFeaturedColleges(limit = 12): Promise<CollegeRecord[]> {
  const result = await searchColleges({ page: 1, pageSize: Math.min(50, Math.max(1, limit)), sortBy: 'popularity' });
  return result.data;
}

export async function getCollegePrograms(collegeId: CanonicalId): Promise<Map<string, string[]>> {
  const detail = await getCollegeById(collegeId);
  const grouped = new Map<string, string[]>();
  if (!detail || !('programs' in detail) || !Array.isArray(detail.programs)) return grouped;

  for (const item of detail.programs as Array<Record<string, unknown>>) {
    const degree = str(item.degree_type) ?? 'Other';
    const program = str(item.program_name);
    if (!program) continue;
    if (!grouped.has(degree)) grouped.set(degree, []);
    grouped.get(degree)?.push(program);
  }

  return grouped;
}

export async function getDistinctStates(): Promise<string[]> {
  const client = requireClient();
  const { data, error } = await client
    .schema('canonical')
    .from('institutions')
    .select('state_region')
    .not('state_region', 'is', null)
    .limit(1000);
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { state_region: string | null }) => r.state_region).filter(Boolean) as string[])].sort();
}

export async function getDistinctCountries(): Promise<string[]> {
  const client = requireClient();
  const { data, error } = await client.schema('canonical').from('mv_college_cards').select('country_code').not('country_code', 'is', null).limit(1000);
  if (error) throw error;
  debugCanonical('canonical_country_source', { relation: FRONTEND_CANONICAL_RELATION });
  return [...new Set((data ?? []).map((r: { country_code: string | null }) => r.country_code).filter(Boolean) as string[])].sort();
}

export { isSupabaseConfigured };

export function getAdmissions(college: CollegeRecord) {
  if ('admissions' in college) return college.admissions;
  return null;
}

export function getFinancials(college: CollegeRecord) {
  if ('financials' in college) return college.financials;
  return {
    tuition_in_state: (college as unknown as Record<string, unknown>).tuition_domestic ?? null,
    tuition_out_state: (college as unknown as Record<string, unknown>).tuition_domestic ?? null,
    tuition_international: (college as unknown as Record<string, unknown>).tuition_international ?? null,
    avg_net_price: null,
  };
}

export function getAcademics(college: CollegeRecord) {
  if ('outcomes' in college) return college.outcomes;
  return null;
}

export function getCampusLife(college: CollegeRecord) {
  if ('campus_life' in college) return college.campus_life;
  return (college as unknown as Record<string, unknown>).campus_life ?? null;
}

export function getDemographics(college: CollegeRecord) {
  if ('demographics' in college) return college.demographics;
  return null;
}

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

export function normalizeToCard(c: Record<string, unknown>): Record<string, unknown> {
  const meta = asRecord(c.metadata);
  const ranking = firstDefined(num(c.global_rank), num(meta.ranking_us_news), num(meta.qs_rank));
  const city = str(c.city) ?? str(meta.city);
  const state = str(meta.state_region) ?? str(meta.state);
  const rawCountryCode = str(c.country_code) ?? str(meta.country_code) ?? null;
  const countryCode = normalizeCountryCode(rawCountryCode ?? str(meta.country) ?? '');
  const country = formatCountryName(rawCountryCode ?? str(meta.country));
  const location = [city, state, country].filter(Boolean).join(', ');
  debugCanonical('card_normalization', {
    institution_id: c.id ?? null,
    country_code: countryCode,
    country_display: country,
    admissions_present: num(c.acceptance_rate) != null || num(c.sat_50) != null || num(c.act_50) != null,
    financials_present: num(c.tuition_international) != null || num(c.cost_of_attendance) != null,
    completeness_score: num(c.completeness_score),
  });

  return {
    id: c.id,
    name: str(c.canonical_name) ?? str(meta.name) ?? 'Unknown',
    city,
    state,
    location,
    country,
    countryCode: countryCode ?? undefined,
    type: str(meta.institution_type) ?? 'Unknown',
    popularity_score: num(c.popularity_score) ?? 0,
    global_rank: num(c.global_rank),
    ranking,
    acceptance_rate: num(c.acceptance_rate),
    acceptanceRate: num(c.acceptance_rate),
    tuition_cost: num(c.cost_of_attendance),
    tuitionCost: num(c.cost_of_attendance),
    enrollment: firstDefined(num(meta.total_enrollment), num(meta.enrollment)),
    description: str(c.description) ?? str(meta.description),
    programs: Array.isArray(meta.programs) ? meta.programs : [],
    majorCategories: Array.isArray(meta.major_categories) ? meta.major_categories : [],
    majors: Array.isArray(meta.major_categories) ? meta.major_categories : [],
    academicStrengths: Array.isArray(meta.academic_strengths) ? meta.academic_strengths : [],
    testScores: (num(c.sat_50) != null || num(c.act_50) != null)
      ? {
          sat25: null,
          sat75: null,
          sat50: num(c.sat_50),
          act25: null,
          act75: null,
          act50: num(c.act_50),
        }
      : null,
    sat_median: num(c.sat_50),
    act_median: num(c.act_50),
    median_start_salary: num(c.median_start_salary),
    graduation_rate_4yr: num(c.graduation_rate_4yr),
    graduation_rate_6yr: num(c.graduation_rate_6yr),
    employment_rate: num(c.employment_rate),
    test_optional: bool(c.test_optional),
    need_blind_flag: bool(c.need_blind_flag),
    merit_scholarship_flag: bool(c.merit_scholarship_flag),
    international_aid_available: bool(c.international_aid_available) ?? false,
    completeness_score: num(c.completeness_score) ?? 0,
    freshness_score: num(c.freshness_score) ?? 0,
    data_quality_score: num(c.data_quality_score) ?? 0,
    official_website: str(c.website),
    logo_url: str(c.logo_url),
  };
}

export function normalizeToDetail(input: CollegeRecord): Record<string, unknown> {
  if ('institution' in input) {
    const i = asRecord(input.institution);
    const admissions = asRecord(input.admissions);
    const financials = asRecord(input.financials);
    const outcomes = asRecord(input.outcomes);
    const demographics = asRecord(input.demographics);
    const campusLife = asRecord(input.campus_life);
    const requirements = Array.isArray(input.requirements) ? input.requirements : [];
    const rankings = Array.isArray(input.rankings) ? input.rankings : [];
    const programs = Array.isArray(input.programs) ? input.programs : [];
    const meta = asRecord(i.metadata);

    const countryCode = normalizeCountryCode(str(i.country_code) ?? str(meta.country_code) ?? str(meta.country));
    const countryName = formatCountryName(str(i.country_code) ?? str(meta.country));
    return {
      id: i.id,
      name: str(i.canonical_name),
      city: str(i.city),
      state: str(i.state_region),
      country: countryName,
      country_code: countryCode,
      countryCode: countryCode,
      location: [str(i.city), str(i.state_region), countryName].filter(Boolean).join(', '),
      official_website: str(i.website) ?? '',
      logo_url: str(i.logo_url),
      type: str(i.institution_type),
      description: str(meta.description),
      ranking: firstDefined(num(rankings[0]?.national_rank), num(rankings[0]?.global_rank)),
      acceptance_rate: num(admissions.acceptance_rate),
      acceptanceRate: num(admissions.acceptance_rate),
      tuition_cost: firstDefined(num(financials.cost_of_attendance), num(financials.tuition_international)),
      studentStats: {
        sat25: num(admissions.sat_25),
        sat50: num(admissions.sat_50),
        sat75: num(admissions.sat_75),
        act25: num(admissions.act_25),
        act50: num(admissions.act_50),
        act75: num(admissions.act_75),
        gpa25: null,
        gpa50: null,
        gpa75: null,
      },
      admissionsData: {
        acceptanceRate: num(admissions.acceptance_rate),
        testOptionalFlag: bool(admissions.test_optional) ? 1 : 0,
        applicationVolume: num(admissions.application_volume),
        admitVolume: num(admissions.admit_volume),
        enrollmentVolume: num(admissions.enrollment_volume),
      },
      financialData: {
        tuitionInState: num(financials.tuition_in_state),
        tuitionOutState: num(financials.tuition_out_state),
        tuitionInternational: num(financials.tuition_international),
        costOfAttendance: num(financials.cost_of_attendance),
        avgFinancialAid: num(financials.avg_financial_aid),
        avgDebt: num(financials.avg_debt),
        medianDebt: null,
        percentReceivingAid: num(financials.percent_receiving_aid),
        netPriceLowIncome: num(financials.net_price_low_income),
        netPriceMidIncome: num(financials.net_price_mid_income),
        netPriceHighIncome: num(financials.net_price_high_income),
      },
      academicOutcomes: {
        graduationRate4yr: num(outcomes.graduation_rate_4yr),
        graduationRate6yr: num(outcomes.graduation_rate_6yr),
        retentionRate: num(outcomes.retention_rate),
        employmentRate: num(outcomes.employment_rate),
        medianStartSalary: num(outcomes.median_start_salary),
        medianSalary6yr: num(outcomes.median_start_salary),
        medianMidCareerSalary: num(outcomes.median_mid_career_salary),
        medianSalary10yr: num(outcomes.median_mid_career_salary),
        gradSchoolRate: num(outcomes.grad_school_rate),
      },
      demographics: {
        percentInternational: num(demographics.percent_international),
        genderRatio: str(demographics.gender_ratio),
        ethnicDistribution: asRecord(demographics.ethnic_distribution),
        percentFirstGen: num(demographics.percent_first_gen),
      },
      campusLife: {
        housingGuarantee: str(campusLife.housing_guarantee),
        campusSafetyScore: num(campusLife.campus_safety_score),
        athleticsDivision: str(campusLife.athletics_division),
        clubCount: num(campusLife.club_count),
      },
      rankings: rankings.map((r) => ({
        year: num((r as Record<string, unknown>).ranking_year) ?? null,
        rankingBody: str((r as Record<string, unknown>).ranking_body),
        nationalRank: num((r as Record<string, unknown>).national_rank),
        globalRank: num((r as Record<string, unknown>).global_rank),
        subjectRank: num((r as Record<string, unknown>).subject_rank),
      })),
      programs: programs.map((p) => ({
        programName: str((p as Record<string, unknown>).program_name),
        degreeType: str((p as Record<string, unknown>).degree_type),
        fieldCategory: str((p as Record<string, unknown>).field_category),
        enrollment: num((p as Record<string, unknown>).enrollment),
      })),
      requirements: requirements,
      deadlines: input.deadlines,
      deadlineTemplates: buildDeadlineTemplates(input.deadlines),
      completeness: input.completeness,
      quality_scores: input.quality_scores,
      data_quality_score: num((input.quality_scores as Record<string, unknown>)?.final_quality_score),
      freshness_score: num((input.quality_scores as Record<string, unknown>)?.freshness_score),
      completeness_score: num((input.completeness as Record<string, unknown>)?.overall_score),
      comprehensiveData: {
        stateRegion: str(i.state_region),
        city: str(i.city),
        institutionType: str(i.institution_type),
        religiousAffiliation: str(meta.religious_affiliation),
        foundingYear: num(i.established_year),
        totalEnrollment: num(meta.total_enrollment),
        websiteUrl: str(i.website),
      },
      data_source: 'canonical',
      data_source_url: null,
      last_updated_at: str(i.updated_at),
      updated_at: str(i.updated_at),
      graduationRates: {
        fourYear: num(outcomes.graduation_rate_4yr),
        sixYear: num(outcomes.graduation_rate_6yr),
        retentionRate: num(outcomes.retention_rate),
      },
      testScores: {
        satRange: num(admissions.sat_25) != null && num(admissions.sat_75) != null
          ? { percentile25: num(admissions.sat_25) as number, percentile75: num(admissions.sat_75) as number }
          : undefined,
        actRange: num(admissions.act_25) != null && num(admissions.act_75) != null
          ? { percentile25: num(admissions.act_25) as number, percentile75: num(admissions.act_75) as number }
          : undefined,
      },
    };
  }

  // Legacy fallback
  const c = input as unknown as Record<string, unknown>;
  const location = [c.city, c.state, c.country].filter(Boolean).join(', ');
  return {
    ...c,
    location,
    official_website: firstDefined(c.official_website as string, c.website_url as string, c.website as string) ?? '',
  };
}
