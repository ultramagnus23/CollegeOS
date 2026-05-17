/**
 * src/lib/supabase.ts
 *
 * Typed Supabase browser client.
 *
 * Environment variables required (Vite VITE_ prefix):
 *   VITE_SUPABASE_URL      — Project URL from Supabase Dashboard → Settings → API
 *   VITE_SUPABASE_ANON_KEY — Anon/public key (read-only, safe in browser)
 *
 * The client is exported as `supabase`. If the env vars are missing the module
 * exports `null` so callers can check `isSupabaseConfigured` instead of crashing.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (import.meta.env.DEV && !isSupabaseConfigured) {
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');
  console.warn('[Supabase] Missing env vars:', missing.join(', '));
}

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

// ─── Schema Types ─────────────────────────────────────────────────────────────
// These match the Supabase column names exactly.

export interface CollegeRow {
  id: number;
  name: string;
  slug?: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  institution_type: string | null;
  campus_setting: string | null;
  website_url: string | null;
  normalized_website?: string | null;
  control: string | null;
  size_category: string | null;
  total_enrollment: number | null;
  official_website?: string | null;
  logo_url: string | null;
  description: string | null;
  religious_affiliation: string | null;
  founded_year: number | null;
  latitude: number | null;
  longitude: number | null;
  acceptance_rate?: number | null;
  tuition_domestic?: number | null;
  tuition_international?: number | null;
  qs_rank?: number | null;
  ranking_us_news?: number | null;
  the_rank?: number | null;
  application_deadline?: string | null;
  rd_deadline?: string | null;
  ed_deadline?: string | null;
  ea_deadline?: string | null;
  data_source?: string | null;
  data_source_url?: string | null;
  data_quality_score?: number | null;
  needs_enrichment?: boolean | null;
  last_data_refresh?: string | null;
  last_updated_at?: string | null;
  updated_at?: string | null;
  avg_institutional_grant?: number | null;
  avg_merit_aid?: number | null;
  pct_receiving_merit_aid?: number | null;
  pct_students_receiving_aid?: number | null;
  international_aid_available?: boolean | number | null;
  international_aid_avg?: number | null;
  meets_full_need?: boolean | null;
  css_profile_required?: boolean | number | null;
  sat_25?: number | null;
  sat_75?: number | null;
  act_25?: number | null;
  act_75?: number | null;
  act_avg?: number | null;
  gpa_25?: number | null;
  gpa_75?: number | null;
  annual_cost_usd?: number | null;
  annual_cost_inr?: number | null;
  avg_net_price_usd?: number | null;
  avg_sat?: number | null;
  avg_act?: number | null;
  avg_gpa?: number | null;
  graduation_rate?: number | null;
  retention_rate?: number | null;
  international_student_pct?: number | null;
  first_gen_pct?: number | null;
  pct_receiving_aid?: number | null;
  enrollment?: number | null;
  college_type?: string | null;
  overall_ranking?: number | null;
  ranking_source?: string | null;
  majors_offered?: string[] | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  needs_enrichment?: boolean | null;
  data_quality_score?: number | null;
  data_source?: string | null;
  data_source_url?: string | null;
  last_updated_at?: string | null;
  // legacy compatibility fallbacks
  type?: string | null;
  website?: string | null;
  setting?: string | null;
  state_region?: string | null;
  urban_classification?: string | null;
  founding_year?: number | null;
}

// TODO: REMOVE LEGACY SCHEMA — CollegeAdmissions is the legacy child table.
// SAT/ACT/GPA data is now read directly from the `colleges` table columns
// (sat_25, sat_75, act_25, act_75, gpa_25, gpa_75).
/** @deprecated Use sat_25/sat_75/act_25/act_75/gpa_25/gpa_75 from CollegeRow directly. */
export interface CollegeAdmissions {
  id: number;
  college_id: number;
  acceptance_rate: number | null;
  test_optional: boolean | null;
  sat_avg: number | null;
  sat_range: string | null;
  act_range: string | null;
  gpa_50: number | null;
  data_year: number | null;
  confidence_score: number | null;
}

export interface CollegeFinancialData {
  id: number;
  college_id: number;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  tuition_international: number | null;
  avg_net_price: number | null;
  data_year: number | null;
  confidence_score: number | null;
}

// TODO: REMOVE LEGACY SCHEMA — AcademicDetails is the legacy child table.
// Academic outcomes are now read from median_earnings_6yr/median_earnings_10yr
// on the `colleges` table directly.
/** @deprecated Use median_earnings_6yr/median_earnings_10yr from CollegeRow directly. */
export interface AcademicDetails {
  id: number;
  college_id: number;
  graduation_rate_4yr: number | null;
  retention_rate: number | null;
  median_salary_6yr: number | null;
  median_salary_10yr: number | null;
  median_debt: number | null;
  data_year: number | null;
  confidence_score: number | null;
}

export interface CollegeProgram {
  id: number;
  college_id: number;
  program_name: string;
  degree_type: string | null;
}

// TODO: REMOVE LEGACY SCHEMA — StudentDemographics is the legacy child table.
// Demographics data is not present in the unified `colleges` table.
/** @deprecated Demographics fields are not available from the unified colleges table. */
export interface StudentDemographics {
  id: number;
  college_id: number;
  percent_male: number | null;
  percent_female: number | null;
  percent_white: number | null;
  percent_black: number | null;
  percent_hispanic: number | null;
  percent_asian: number | null;
  percent_international: number | null;
  data_year: number | null;
}

export interface CampusLife {
  id: number;
  college_id: number;
  housing_guarantee: boolean | null;
  distance_only: boolean | null;
}

export interface CollegeRanking {
  id: number;
  college_id: number;
  ranking_source: string;
  ranking_value: string | null;
  ranking_year: number | null;
}

export interface CollegeDeadline {
  id: number;
  college_id: number;
  deadline_type: string | null;  // 'Early Decision' | 'Early Action' | 'Regular Decision'
  deadline_date: string | null;  // ISO date string
  notification_date: string | null;
  is_binding: boolean | null;
  data_year: number | null;
}

export interface CollegeContact {
  id: number;
  college_id: number;
  admissions_email: string | null;
  admissions_phone: string | null;
  admissions_url: string | null;
  financial_aid_url: string | null;
  common_app: boolean | null;
  coalition_app: boolean | null;
  application_fee: number | null;
}

/**
 * A `colleges` table row joined with the allowed child-table arrays.
 *
 * NOTE: college_admissions, academic_details, and student_demographics are
 * intentionally excluded — their data is now read directly from the `colleges`
 * table columns (sat_25/75, act_25/75, gpa_25/75, median_earnings_6yr, etc.).
 */
export interface CollegeWithRelations extends CollegeRow {
  // TODO: REMOVE LEGACY SCHEMA — college_admissions join removed; use sat_25/75, act_25/75, gpa_25/75 from CollegeRow
  colleges: CollegeFinancialData[];
  college_programs: CollegeProgram[];
  campus_life: CampusLife[];
  college_rankings: CollegeRanking[];
  college_deadlines?: CollegeDeadline[];
  college_contact?: CollegeContact[];
}

/** Convenience helper: get the first item of a child-table array or null. */
export function firstChild<T>(arr: T[] | undefined): T | null {
  return arr && arr.length > 0 ? arr[0] : null;
}
