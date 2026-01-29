// Types for comprehensive college data across different countries

// Base college interface with common fields
export interface BaseCollege {
  rank: number;
  name: string;
  website: string;
  city: string;
  country?: string;
  total_enrollment: number;
}

// US College with comprehensive data from Common Data Set
export interface USCollege extends BaseCollege {
  state: string;
  institution_type: 'Private' | 'Public';
  acceptance_rate: number;
  
  // SAT Scores
  sat_ebrw_25th_percentile: number;
  sat_ebrw_75th_percentile: number;
  sat_math_25th_percentile: number;
  sat_math_75th_percentile: number;
  sat_total_25th_percentile: number;
  sat_total_75th_percentile: number;
  
  // ACT Scores
  act_composite_25th_percentile: number;
  act_composite_75th_percentile: number;
  
  // Academic
  average_gpa: number;
  
  // Costs
  tuition_annual: number;
  room_and_board: number;
  total_cost_of_attendance: number;
  
  // Financial Aid
  average_financial_aid_package: number;
  percent_receiving_aid: number;
  net_price_income_0_30k: number;
  net_price_income_30_48k: number;
  net_price_income_48_75k: number;
  net_price_income_75_110k: number;
  net_price_income_110k_plus: number;
  
  // Outcomes
  four_year_graduation_rate: number;
  six_year_graduation_rate: number;
  student_faculty_ratio: string;
  
  // Deadlines
  early_action_deadline: string | null;
  early_decision_deadline: string | null;
  regular_decision_deadline: string;
  financial_aid_deadline: string;
  
  // Programs
  majors_offered: string;
  top_majors: string;
  notable_programs: string;
  
  // Essays
  essay_prompt_1: string;
  essay_prompt_1_word_limit: number;
  essay_prompt_2: string | null;
  essay_prompt_2_word_limit: number | null;
  
  // Requirements
  application_requirements: string;
}

// Indian College with JEE/NEET specific data
export interface IndianCollege extends BaseCollege {
  state: string;
  country: 'India';
  institution_type: 'Public' | 'Private';
  nirf_ranking: number;
  qs_world_ranking: number | null;
  entrance_exam: string;
  
  // JEE Advanced Cutoffs (for IITs)
  jee_advanced_cutoff_general_opening: number | null;
  jee_advanced_cutoff_general_closing: number | null;
  jee_advanced_cutoff_obc_opening: number | null;
  jee_advanced_cutoff_obc_closing: number | null;
  jee_advanced_cutoff_sc_opening: number | null;
  jee_advanced_cutoff_sc_closing: number | null;
  jee_advanced_cutoff_st_opening: number | null;
  jee_advanced_cutoff_st_closing: number | null;
  
  // Optional: JEE Main cutoffs (for NITs)
  jee_main_cutoff_general_opening?: number;
  jee_main_cutoff_general_closing?: number;
  
  // Optional: BITSAT cutoffs
  bitsat_cutoff_cs?: number;
  bitsat_cutoff_ece?: number;
  bitsat_cutoff_eee?: number;
  bitsat_cutoff_mechanical?: number;
  
  // Optional: VITEEE cutoffs
  viteee_cutoff_cs?: number;
  viteee_cutoff_ece?: number;
  viteee_cutoff_eee?: number;
  viteee_cutoff_mechanical?: number;
  
  // Costs (in INR)
  tuition_fees_inr_annual: number;
  hostel_fees_inr_annual: number;
  total_cost_inr_annual: number;
  
  // Placements
  placement_average_package_inr: number;
  placement_highest_package_inr: number;
  placement_percentage: number;
  top_recruiters: string;
  
  // Programs
  programs_offered: string;
  top_programs: string;
  notable_programs: string;
  
  // Application Timeline
  application_start_date: string;
  application_end_date: string;
  counseling_start_date: string;
  admission_requirements: string;
}

// UK College with UCAS specific data
export interface UKCollege extends BaseCollege {
  country: 'United Kingdom';
  qs_world_ranking: number;
  times_higher_ed_ranking: number;
  guardian_uk_ranking: number;
  acceptance_rate: number;
  
  // Entry Requirements
  a_level_requirements: string;
  ib_requirements: string;
  gcse_requirements: string;
  ucas_points_required: number;
  
  // Costs (in GBP)
  tuition_fees_uk_students_annual: number;
  tuition_fees_international_annual: number;
  living_costs_estimate_annual: number;
  total_cost_international: number;
  
  // Admission
  interview_required: string;
  admissions_test_required: string;
  
  // Programs
  programs_offered: string;
  top_programs: string;
  notable_programs: string;
  
  // Deadlines
  application_deadline: string;
  oxbridge_deadline: string | null;
  admission_requirements: string;
}

// German College with Abitur specific data
export interface GermanCollege extends BaseCollege {
  country: 'Germany';
  qs_world_ranking: number;
  times_higher_ed_ranking: number;
  
  // Costs (most programs are free)
  tuition_fees_eu_students: number;
  tuition_fees_non_eu_students: number;
  semester_fee: number;
  living_costs_monthly_estimate: number;
  
  // Language Requirements
  german_language_requirement: string;
  english_language_requirement: string;
  
  // Admission
  abitur_grade_requirement: string;
  numerus_clausus_programs: string;
  
  // Programs
  programs_offered: string;
  programs_in_english: string;
  top_programs: string;
  notable_programs: string;
  
  // Deadlines
  application_deadline_winter_semester: string;
  application_deadline_summer_semester: string;
  admission_requirements: string;
}

// Union type for any college
export type College = USCollege | IndianCollege | UKCollege | GermanCollege;
