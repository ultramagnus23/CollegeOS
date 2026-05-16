import {
  supabase,
  isSupabaseConfigured,
  CollegeWithRelations,
} from './supabase';

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const COLLEGES_COLUMNS = [
  'id', 'name', 'slug', 'country',
  'city', 'state', 'latitude', 'longitude',
  'type', 'institution_type',
  'size_category', 'campus_setting',
  'total_enrollment', 'undergraduate_enrollment', 'graduate_enrollment',
  'website', 'website_url', 'official_website', 'logo_url', 'description',
  'acceptance_rate', 'sat_25', 'sat_75', 'act_25', 'act_75', 'gpa_25', 'gpa_75', 'act_avg',
  'tuition_domestic', 'tuition_international',
  'qs_rank', 'the_rank', 'ranking_us_news',
  'rd_deadline', 'ed_deadline', 'ea_deadline',
  'avg_institutional_grant', 'avg_merit_aid',
  'pct_receiving_merit_aid', 'pct_students_receiving_aid',
  'international_aid_available', 'international_aid_avg',
  'meets_full_need', 'css_profile_required',
  'median_earnings_6yr', 'median_earnings_10yr',
  'updated_at', 'popularity_score',
].join(', ');

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

function normalizeOrder(sortBy?: string): { column: string; ascending: boolean } {
  switch (sortBy) {
    case 'acceptance_rate':
      return { column: 'acceptance_rate', ascending: true };
    case 'tuition':
      return { column: 'tuition_international', ascending: true };
    case 'ranking':
      return { column: 'ranking_us_news', ascending: true };
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

  add('regularDecision', 'Regular Decision', c.rd_deadline);
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

  return timed('searchColleges', async () => {
    let q = client.from('colleges').select(COLLEGES_COLUMNS, { count: 'estimated' });

    if (query) q = q.ilike('name', `%${query}%`);
    if (country) q = q.eq('country', country);
    if (state) q = q.eq('state', state);
    if (type) q = q.eq('type', type);
    if (setting) q = q.eq('campus_setting', setting);
    if (minAcceptance !== undefined) q = q.gte('acceptance_rate', minAcceptance);
    if (maxAcceptance !== undefined) q = q.lte('acceptance_rate', maxAcceptance);
    if (maxTuition !== undefined) q = q.lte('tuition_international', maxTuition);

    const from = (safePage - 1) * safePageSize;
    const to = from + safePageSize - 1;

    const { data, error, count } = await q.order(column, { ascending }).range(from, to);
    if (error) throw error;

    const rows = ((data as CollegeWithRelations[] | null) ?? []).filter(Boolean);
    const total = count ?? 0;
    return {
      data: rows,
      count: total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.max(1, Math.ceil(total / safePageSize)),
    };
  });
}

export async function getCollegeById(id: number): Promise<CollegeWithRelations | null> {
  const client = requireClient();
  return timed('getCollegeById', async () => {
    const { data, error } = await client
      .from('colleges')
      .select(COLLEGES_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data as CollegeWithRelations;
  });
}

export async function getCollegeByName(name: string): Promise<CollegeWithRelations | null> {
  const client = requireClient();
  return timed('getCollegeByName', async () => {
    const { data, error } = await client
      .from('colleges')
      .select(COLLEGES_COLUMNS)
      .ilike('name', name)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data as CollegeWithRelations;
  });
}

export async function compareColleges(ids: number[]): Promise<CollegeWithRelations[]> {
  if (ids.length === 0) return [];
  const client = requireClient();
  const safeIds = ids.slice(0, 4);

  return timed('compareColleges', async () => {
    const { data, error } = await client
      .from('colleges')
      .select(COLLEGES_COLUMNS)
      .in('id', safeIds);

    if (error) throw error;
    return (data as CollegeWithRelations[]) ?? [];
  });
}

export async function getFeaturedColleges(limit = 12): Promise<CollegeWithRelations[]> {
  const client = requireClient();
  return timed('getFeaturedColleges', async () => {
    const { data, error } = await client
      .from('colleges')
      .select(COLLEGES_COLUMNS)
      .order('name', { ascending: true })
      .limit(Math.min(50, Math.max(1, limit)));

    if (error) throw error;
    return (data as CollegeWithRelations[]) ?? [];
  });
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
  const { data, error } = await client.from('colleges').select('state').not('state', 'is', null).limit(1000);
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { state: string | null }) => r.state).filter(Boolean) as string[])].sort();
}

export async function getDistinctCountries(): Promise<string[]> {
  const client = requireClient();
  const { data, error } = await client.from('colleges').select('country').not('country', 'is', null).limit(1000);
  if (error) throw error;
  return [...new Set((data ?? []).map((r: { country: string | null }) => r.country).filter(Boolean) as string[])].sort();
}

export { isSupabaseConfigured };

export function getAdmissions(_college: CollegeWithRelations) { return null; }
export function getFinancials(college: CollegeWithRelations) {
  return {
    tuition_in_state: (college as any).tuition_domestic ?? null,
    tuition_out_state: (college as any).tuition_domestic ?? null,
    tuition_international: (college as any).tuition_international ?? null,
    avg_net_price: null,
  };
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
  const ranking = firstDefined(c.ranking_us_news, c.qs_rank, c.the_rank);
  const location = [c.city, c.state, c.country].filter(Boolean).join(', ');
  const tuitionCost = firstDefined(c.tuition_international, c.tuition_domestic);

  return {
    id: c.id,
    name: c.name,
    city: c.city ?? null,
    state: c.state ?? null,
    location,
    country: c.country ?? '',
    type: c.type ?? c.institution_type ?? 'Unknown',
    ranking,
    acceptance_rate: c.acceptance_rate ?? null,
    acceptanceRate: c.acceptance_rate ?? null,
    tuition_cost: tuitionCost,
    averageGPA: firstDefined(c.gpa_75, c.gpa_25),
    enrollment: c.total_enrollment ?? null,
    description: c.description ?? null,
    programs: Array.isArray(c.programs) ? c.programs : [],
    majorCategories: Array.isArray(c.major_categories) ? c.major_categories : [],
    academicStrengths: Array.isArray(c.academic_strengths) ? c.academic_strengths : [],
    testScores: (c.sat_25 != null || c.sat_75 != null || c.act_25 != null || c.act_75 != null)
      ? {
          satRange: c.sat_25 != null && c.sat_75 != null ? { percentile25: c.sat_25, percentile75: c.sat_75 } : undefined,
          actRange: c.act_25 != null && c.act_75 != null ? { percentile25: c.act_25, percentile75: c.act_75 } : undefined,
          averageGPA: firstDefined(c.gpa_75, c.gpa_25) ?? undefined,
        }
      : null,
    graduationRates: null,
    studentFacultyRatio: null,
  };
}

export function normalizeToDetail(c: CollegeWithRelations): any {
  const ranking = firstDefined((c as any).ranking_us_news, (c as any).qs_rank, (c as any).the_rank);
  const location = [c.city, c.state, c.country].filter(Boolean).join(', ');
  const tuitionCost = firstDefined((c as any).tuition_international, (c as any).tuition_domestic);

  return {
    id: c.id,
    name: c.name,
    city: c.city ?? null,
    state: c.state ?? null,
    country: c.country ?? '',
    location,
    official_website: (c as any).official_website ?? (c as any).website_url ?? (c as any).website ?? '',
    admissions_url: (c as any).admissions_url ?? undefined,
    type: (c as any).type ?? (c as any).institution_type ?? null,
    description: c.description ?? null,
    ranking,
    enrollment: (c as any).total_enrollment ?? null,
    acceptance_rate: (c as any).acceptance_rate ?? null,
    acceptanceRate: (c as any).acceptance_rate ?? null,
    tuition_cost: tuitionCost,
    avg_net_price: null,
    median_salary_6yr: (c as any).median_earnings_6yr ?? null,
    median_salary_10yr: (c as any).median_earnings_10yr ?? null,
    programs: Array.isArray((c as any).programs) ? (c as any).programs : [],
    major_categories: Array.isArray((c as any).major_categories) ? (c as any).major_categories : [],
    majorCategories: Array.isArray((c as any).major_categories) ? (c as any).major_categories : [],
    academic_strengths: Array.isArray((c as any).academic_strengths) ? (c as any).academic_strengths : [],
    testScores: ((c as any).sat_25 != null || (c as any).sat_75 != null || (c as any).act_25 != null || (c as any).act_75 != null || (c as any).gpa_25 != null || (c as any).gpa_75 != null)
      ? {
          satRange: (c as any).sat_25 != null && (c as any).sat_75 != null ? { percentile25: (c as any).sat_25, percentile75: (c as any).sat_75 } : undefined,
          actRange: (c as any).act_25 != null && (c as any).act_75 != null ? { percentile25: (c as any).act_25, percentile75: (c as any).act_75 } : undefined,
          averageGPA: firstDefined((c as any).gpa_75, (c as any).gpa_25) ?? undefined,
        }
      : null,
    studentStats: {
      gpa25: (c as any).gpa_25 ?? null,
      gpa50: firstDefined((c as any).gpa_75, (c as any).gpa_25),
      gpa75: (c as any).gpa_75 ?? null,
      sat25: (c as any).sat_25 ?? null,
      sat75: (c as any).sat_75 ?? null,
      act25: (c as any).act_25 ?? null,
      act75: (c as any).act_75 ?? null,
    },
    financialData: {
      tuitionInState: (c as any).tuition_domestic ?? null,
      tuitionOutState: (c as any).tuition_domestic ?? null,
      tuitionInternational: (c as any).tuition_international ?? null,
      avgNetPrice: null,
      avgFinancialAid: (c as any).avg_institutional_grant ?? (c as any).international_aid_avg ?? null,
      percentReceivingAid: (c as any).pct_students_receiving_aid ?? null,
    },
    academicOutcomes: {
      graduationRate4yr: null,
      retentionRate: null,
      medianSalary6yr: (c as any).median_earnings_6yr ?? null,
      medianStartSalary: (c as any).median_earnings_6yr ?? null,
      medianSalary10yr: (c as any).median_earnings_10yr ?? null,
      medianMidCareerSalary: (c as any).median_earnings_10yr ?? null,
    },
    demographics: undefined,
    comprehensiveData: {
      totalEnrollment: (c as any).total_enrollment ?? null,
      city: c.city ?? null,
      stateRegion: c.state ?? null,
      institutionType: (c as any).type ?? (c as any).institution_type ?? null,
      websiteUrl: (c as any).website_url ?? (c as any).official_website ?? (c as any).website ?? null,
    },
    campusLife: {
      housingGuarantee: null,
    },
    deadlineTemplates: buildDeadlineTemplates(c as Record<string, any>),
    updated_at: (c as any).updated_at ?? null,
    rankings: [],
    graduationRates: null,
    studentFacultyRatio: null,
  };
}
