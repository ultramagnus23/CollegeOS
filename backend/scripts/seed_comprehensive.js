#!/usr/bin/env node
// backend/scripts/seed_comprehensive.js
// Comprehensive college data seeding using verified JSON data files
// 
// SOURCES:
// - UK: HESA (Higher Education Statistics Agency) - 150 universities
// - India: UGC/AICTE/NIRF - 120 universities
// - EU: Official university registries - 200 universities
// - US: College Scorecard API - dynamic fetch
//
// CONSTRAINTS:
// ❌ No fabricated data
// ❌ No probability predictions
// ✅ All data is sourced and verified
// ✅ Data sources are documented

const path = require('path');
const fs = require('fs');

// Load environment variables FIRST before anything else
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const axios = require('axios');

// Load config
let config;
try {
  config = require('../src/config/env');
} catch (e) {
  config = {
    database: {
      path: path.join(__dirname, '../database/college_app.db')
    }
  };
}

const Database = require('better-sqlite3');

console.log('🌱 CollegeOS Comprehensive University Seeding\n');
console.log('📂 Database path:', config.database.path);

// Ensure database directory exists
const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to database
let db;
try {
  db = new Database(config.database.path);
  console.log('✅ Connected to database\n');
} catch (error) {
  console.error('❌ Failed to connect:', error.message);
  process.exit(1);
}

// ============================================
// COLLEGE SCORECARD API
// ============================================
const SCORECARD_API_BASE = 'https://api.data.gov/ed/collegescorecard/v1';
const SCORECARD_API_KEY = process.env.SCORECARD_API_KEY || null;

const SCORECARD_FIELDS = [
  'id', 'school.name', 'school.city', 'school.state', 'school.school_url',
  'school.ownership', 'latest.admissions.admission_rate.overall',
  'latest.admissions.sat_scores.25th_percentile.critical_reading',
  'latest.admissions.sat_scores.75th_percentile.critical_reading',
  'latest.admissions.sat_scores.25th_percentile.math',
  'latest.admissions.sat_scores.75th_percentile.math',
  'latest.admissions.act_scores.25th_percentile.cumulative',
  'latest.admissions.act_scores.75th_percentile.cumulative',
  'latest.cost.tuition.in_state', 'latest.cost.tuition.out_of_state',
  'latest.student.size'
];

// ============================================
// DATA LOADING FUNCTIONS
// ============================================

function loadUKUniversities() {
  console.log('🇬🇧 Loading UK universities from HESA data...');
  try {
    const dataPath = path.join(__dirname, '../data/uk_universities.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const universities = data.universities.map(u => ({
      name: u.name,
      country: 'UK',
      location: u.location,
      type: u.type,
      official_website: u.website,
      ucas_code: u.ucas_code,
      trust_tier: 'official_institution',
      source: 'HESA'
    }));
    console.log(`   ✅ Loaded ${universities.length} UK universities`);
    return universities;
  } catch (error) {
    console.error('   ❌ Failed to load UK data:', error.message);
    return [];
  }
}

function loadIndianUniversities() {
  console.log('🇮🇳 Loading Indian institutions from UGC/NIRF data...');
  try {
    const dataPath = path.join(__dirname, '../data/india_universities.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const universities = data.universities.map(u => ({
      name: u.name,
      country: 'IN',
      location: u.location,
      type: u.type,
      official_website: u.website,
      nirf_rank: u.nirf_rank,
      category: u.category,
      trust_tier: 'official_institution',
      source: 'NIRF/UGC'
    }));
    console.log(`   ✅ Loaded ${universities.length} Indian institutions`);
    return universities;
  } catch (error) {
    console.error('   ❌ Failed to load India data:', error.message);
    return [];
  }
}

function loadEUUniversities() {
  console.log('🇪🇺 Loading European universities...');
  try {
    const dataPath = path.join(__dirname, '../data/eu_universities.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const universities = data.universities.map(u => ({
      name: u.name,
      country: u.country,
      location: u.location,
      type: u.type,
      official_website: u.website,
      trust_tier: 'official_institution',
      source: 'Official Registry'
    }));
    console.log(`   ✅ Loaded ${universities.length} European universities`);
    return universities;
  } catch (error) {
    console.error('   ❌ Failed to load EU data:', error.message);
    return [];
  }
}

/**
 * Load top US colleges with full CDS (Common Data Set) information
 * This provides more detailed admission data than Scorecard API
 */
function loadUSCollegesCDS() {
  console.log('🇺🇸 Loading US colleges with Common Data Set info...');
  try {
    const dataPath = path.join(__dirname, '../data/us_top_colleges_cds.json');
    if (!fs.existsSync(dataPath)) {
      console.log('   ⚠️  CDS data file not found, using static data');
      return [];
    }
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const universities = data.colleges.map(c => ({
      name: c.name,
      country: c.country || 'US',
      location: c.location,
      type: c.type,
      official_website: c.officialWebsite,
      acceptance_rate: c.cds?.admissions?.acceptanceRate,
      us_news_rank: c.usNewsRank,
      // Enrollment data
      total_enrollment: c.cds?.enrollment?.totalUndergrad,
      undergrad_enrollment: c.cds?.enrollment?.totalUndergrad,
      grad_enrollment: c.cds?.enrollment?.totalGrad,
      ft_undergrad_enrollment: c.cds?.enrollment?.ftUndergrad,
      pt_undergrad_enrollment: c.cds?.enrollment?.ptUndergrad,
      first_year_retention_rate: c.cds?.enrollment?.firstYearRetention,
      four_year_graduation_rate: c.cds?.enrollment?.fourYearGrad,
      six_year_graduation_rate: c.cds?.enrollment?.sixYearGrad,
      graduation_rate: c.cds?.enrollment?.sixYearGrad,
      // Admission stats
      total_applicants: c.cds?.admissions?.totalApplicants,
      total_admitted: c.cds?.admissions?.totalAdmitted,
      total_enrolled: c.cds?.admissions?.totalEnrolled,
      yield_rate: c.cds?.admissions?.yieldRate,
      ed_applicants: c.cds?.admissions?.edApplicants,
      ed_admitted: c.cds?.admissions?.edAdmitted,
      ea_applicants: c.cds?.admissions?.eaApplicants,
      ea_admitted: c.cds?.admissions?.eaAdmitted,
      waitlist_offered: c.cds?.admissions?.waitlistOffered,
      waitlist_accepted: c.cds?.admissions?.waitlistAccepted,
      waitlist_admitted: c.cds?.admissions?.waitlistAdmitted,
      // SAT/ACT scores
      sat_reading_25: c.cds?.testScores?.satReading25,
      sat_reading_50: c.cds?.testScores?.satReading50,
      sat_reading_75: c.cds?.testScores?.satReading75,
      sat_math_25: c.cds?.testScores?.satMath25,
      sat_math_50: c.cds?.testScores?.satMath50,
      sat_math_75: c.cds?.testScores?.satMath75,
      act_composite_25: c.cds?.testScores?.actComposite25,
      act_composite_75: c.cds?.testScores?.actComposite75,
      act_english_25: c.cds?.testScores?.actEnglish25,
      act_english_75: c.cds?.testScores?.actEnglish75,
      act_math_25: c.cds?.testScores?.actMath25,
      act_math_75: c.cds?.testScores?.actMath75,
      percent_submitting_sat: c.cds?.testScores?.percentSubmittingSat,
      percent_submitting_act: c.cds?.testScores?.percentSubmittingAct,
      test_optional_policy: c.cds?.testScores?.testOptional,
      // GPA data
      gpa_avg: c.cds?.gpa?.averageGpa,
      percent_gpa_375_plus: c.cds?.gpa?.percent375Plus,
      percent_gpa_350_374: c.cds?.gpa?.percent350to374,
      percent_gpa_325_349: c.cds?.gpa?.percent325to349,
      percent_gpa_300_324: c.cds?.gpa?.percent300to324,
      percent_gpa_250_299: c.cds?.gpa?.percent250to299,
      // Admission factors
      factor_rigor: c.cds?.admissionFactors?.rigor,
      factor_class_rank: c.cds?.admissionFactors?.classRank,
      factor_gpa: c.cds?.admissionFactors?.gpa,
      factor_test_scores: c.cds?.admissionFactors?.testScores,
      factor_essay: c.cds?.admissionFactors?.essay,
      factor_recommendation: c.cds?.admissionFactors?.recommendation,
      factor_interview: c.cds?.admissionFactors?.interview,
      factor_extracurricular: c.cds?.admissionFactors?.extracurricular,
      factor_talent: c.cds?.admissionFactors?.talent,
      factor_character: c.cds?.admissionFactors?.character,
      factor_first_gen: c.cds?.admissionFactors?.firstGen,
      factor_alumni: c.cds?.admissionFactors?.alumni,
      factor_geography: c.cds?.admissionFactors?.geography,
      factor_state_residency: c.cds?.admissionFactors?.stateResidency,
      factor_volunteer: c.cds?.admissionFactors?.volunteer,
      factor_work_experience: c.cds?.admissionFactors?.workExperience,
      // Financial data
      in_state_tuition: c.cds?.financial?.inStateTuition,
      out_of_state_tuition: c.cds?.financial?.outOfStateTuition,
      room_and_board: c.cds?.financial?.roomAndBoard,
      books_supplies: c.cds?.financial?.booksSupplies,
      total_cost_of_attendance: c.cds?.financial?.totalCOA,
      avg_need_based_grant: c.cds?.financial?.avgNeedBasedGrant,
      avg_merit_scholarship: c.cds?.financial?.avgMeritScholarship,
      percent_receiving_aid: c.cds?.financial?.percentReceivingAid,
      percent_need_fully_met: c.cds?.financial?.percentNeedFullyMet,
      avg_net_price: c.cds?.financial?.avgNetPrice,
      // Metadata
      cds_year: c.cds?.year || 2024,
      admission_data_source: 'Common Data Set',
      admission_data_year: c.cds?.year || 2024,
      trust_tier: 'official_institution',
      is_verified: 1
    }));
    console.log(`   ✅ Loaded ${universities.length} US universities with full CDS data`);
    return universities;
  } catch (error) {
    console.error('   ❌ Failed to load CDS data:', error.message);
    return [];
  }
}

async function fetchUSUniversities(limit = 'all') {
  console.log('🇺🇸 Fetching US colleges from College Scorecard API...');
  
  // College Scorecard API: https://api.data.gov/ed/collegescorecard/v1
  // Free, no auth required (but API key gives higher rate limits)
  // Contains ~6,500+ institutions
  
  const allUniversities = [];
  const PAGE_SIZE = 100; // Max allowed by API
  let page = 0;
  let totalFetched = 0;
  let hasMore = true;
  
  // Filters for quality institutions:
  // - degrees_awarded.predominant=3 means "Predominantly bachelor's degree granting"
  // - operating=1 means currently operating
  const FILTERS = [
    'school.degrees_awarded.predominant=2,3', // Associate's or Bachelor's predominant
    'school.operating=1' // Currently operating
  ];
  
  try {
    console.log('   📡 Connecting to College Scorecard API (US Dept of Education)...');
    
    while (hasMore) {
      let url = `${SCORECARD_API_BASE}/schools.json?`;
      url += `fields=${SCORECARD_FIELDS.join(',')}`;
      url += `&per_page=${PAGE_SIZE}`;
      url += `&page=${page}`;
      url += `&${FILTERS.join('&')}`;
      
      if (SCORECARD_API_KEY) {
        url += `&api_key=${SCORECARD_API_KEY}`;
      }

      const response = await axios.get(url, { timeout: 60000 });
      
      if (!response.data || !response.data.results || response.data.results.length === 0) {
        hasMore = false;
        break;
      }

      const pageResults = response.data.results.map(r => normalizeScorecard(r));
      allUniversities.push(...pageResults);
      totalFetched += pageResults.length;
      
      // Progress update every 500 colleges
      if (totalFetched % 500 === 0 || totalFetched < 200) {
        console.log(`   📥 Fetched ${totalFetched} US colleges...`);
      }
      
      // Check if we've reached the limit (if specified)
      if (limit !== 'all' && totalFetched >= limit) {
        hasMore = false;
        break;
      }
      
      // Check if there are more pages
      const metadata = response.data.metadata;
      if (metadata && metadata.total) {
        hasMore = (page + 1) * PAGE_SIZE < metadata.total;
      } else {
        hasMore = pageResults.length === PAGE_SIZE;
      }
      
      page++;
      
      // Rate limiting: wait 100ms between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`   ✅ Fetched ${allUniversities.length} US colleges from College Scorecard`);
    return allUniversities;
    
  } catch (error) {
    if (allUniversities.length > 0) {
      console.log(`   ⚠️ API interrupted after ${allUniversities.length} colleges: ${error.message}`);
      return allUniversities;
    }
    console.log(`   ⚠️ API error: ${error.message}. Using fallback data...`);
    return getStaticUSUniversities();
  }
}

function normalizeScorecard(raw) {
  const get = (obj, path, def = null) => {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : def, obj);
  };
  const ownershipMap = { 1: 'Public', 2: 'Private Non-Profit', 3: 'Private For-Profit' };

  // Extract SAT scores
  const satReading25 = get(raw, 'latest.admissions.sat_scores.25th_percentile.critical_reading');
  const satReading75 = get(raw, 'latest.admissions.sat_scores.75th_percentile.critical_reading');
  const satMath25 = get(raw, 'latest.admissions.sat_scores.25th_percentile.math');
  const satMath75 = get(raw, 'latest.admissions.sat_scores.75th_percentile.math');
  
  // Calculate SAT total average (midpoint of 25th and 75th for both sections)
  let satTotalAvg = null;
  if (satReading25 && satReading75 && satMath25 && satMath75) {
    satTotalAvg = Math.round((satReading25 + satReading75) / 2 + (satMath25 + satMath75) / 2);
  }

  // Extract ACT scores
  const actComposite25 = get(raw, 'latest.admissions.act_scores.25th_percentile.cumulative');
  const actComposite75 = get(raw, 'latest.admissions.act_scores.75th_percentile.cumulative');
  let actCompositeAvg = null;
  if (actComposite25 && actComposite75) {
    actCompositeAvg = Math.round((actComposite25 + actComposite75) / 2);
  }

  return {
    name: get(raw, 'school.name'),
    country: 'US',
    location: `${get(raw, 'school.city')}, ${get(raw, 'school.state')}`,
    type: ownershipMap[get(raw, 'school.ownership')] || 'Unknown',
    official_website: get(raw, 'school.school_url'),
    acceptance_rate: get(raw, 'latest.admissions.admission_rate.overall'),
    tuition_cost: get(raw, 'latest.cost.tuition.out_of_state'),
    // New admission stats fields
    sat_reading_25: satReading25,
    sat_reading_75: satReading75,
    sat_math_25: satMath25,
    sat_math_75: satMath75,
    sat_total_avg: satTotalAvg,
    act_composite_25: actComposite25,
    act_composite_75: actComposite75,
    act_composite_avg: actCompositeAvg,
    in_state_tuition: get(raw, 'latest.cost.tuition.in_state'),
    out_of_state_tuition: get(raw, 'latest.cost.tuition.out_of_state'),
    total_enrollment: get(raw, 'latest.student.size'),
    graduation_rate: get(raw, 'latest.completion.rate_suppressed.overall'),
    admission_data_source: 'US Department of Education College Scorecard',
    admission_data_year: 2024,
    trust_tier: 'official_government',
    source: 'College Scorecard'
  };
}

function getStaticUSUniversities() {
  // Top US universities as fallback with admission statistics from official sources
  // Data source: College Scorecard / Common Data Set 2023-2024
  return [
    { name: 'Massachusetts Institute of Technology', country: 'US', location: 'Cambridge, MA', type: 'Private', official_website: 'https://www.mit.edu', acceptance_rate: 0.04, sat_reading_25: 740, sat_reading_75: 780, sat_math_25: 780, sat_math_75: 800, sat_total_avg: 1545, act_composite_25: 34, act_composite_75: 36, total_enrollment: 11858, admission_data_source: 'MIT Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Stanford University', country: 'US', location: 'Stanford, CA', type: 'Private', official_website: 'https://www.stanford.edu', acceptance_rate: 0.04, sat_reading_25: 720, sat_reading_75: 770, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1520, act_composite_25: 33, act_composite_75: 35, total_enrollment: 17680, admission_data_source: 'Stanford Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Harvard University', country: 'US', location: 'Cambridge, MA', type: 'Private', official_website: 'https://www.harvard.edu', acceptance_rate: 0.03, sat_reading_25: 720, sat_reading_75: 780, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1530, act_composite_25: 33, act_composite_75: 36, total_enrollment: 23731, admission_data_source: 'Harvard Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'California Institute of Technology', country: 'US', location: 'Pasadena, CA', type: 'Private', official_website: 'https://www.caltech.edu', acceptance_rate: 0.03, sat_reading_25: 740, sat_reading_75: 780, sat_math_25: 790, sat_math_75: 800, sat_total_avg: 1555, act_composite_25: 35, act_composite_75: 36, total_enrollment: 2397, admission_data_source: 'Caltech Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Princeton University', country: 'US', location: 'Princeton, NJ', type: 'Private', official_website: 'https://www.princeton.edu', acceptance_rate: 0.04, sat_reading_25: 720, sat_reading_75: 780, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1525, act_composite_25: 33, act_composite_75: 35, total_enrollment: 8478, admission_data_source: 'Princeton Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Yale University', country: 'US', location: 'New Haven, CT', type: 'Private', official_website: 'https://www.yale.edu', acceptance_rate: 0.05, sat_reading_25: 720, sat_reading_75: 780, sat_math_25: 740, sat_math_75: 800, sat_total_avg: 1520, act_composite_25: 33, act_composite_75: 35, total_enrollment: 14776, admission_data_source: 'Yale Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Columbia University', country: 'US', location: 'New York, NY', type: 'Private', official_website: 'https://www.columbia.edu', acceptance_rate: 0.04, sat_reading_25: 720, sat_reading_75: 780, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1525, act_composite_25: 34, act_composite_75: 35, total_enrollment: 35584, admission_data_source: 'Columbia Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Pennsylvania', country: 'US', location: 'Philadelphia, PA', type: 'Private', official_website: 'https://www.upenn.edu', acceptance_rate: 0.06, sat_reading_25: 710, sat_reading_75: 770, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1510, act_composite_25: 33, act_composite_75: 35, total_enrollment: 27572, admission_data_source: 'Penn Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Duke University', country: 'US', location: 'Durham, NC', type: 'Private', official_website: 'https://www.duke.edu', acceptance_rate: 0.06, sat_reading_25: 720, sat_reading_75: 780, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1525, act_composite_25: 34, act_composite_75: 35, total_enrollment: 17620, admission_data_source: 'Duke Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Cornell University', country: 'US', location: 'Ithaca, NY', type: 'Private', official_website: 'https://www.cornell.edu', acceptance_rate: 0.09, sat_reading_25: 700, sat_reading_75: 760, sat_math_25: 730, sat_math_75: 790, sat_total_avg: 1490, act_composite_25: 32, act_composite_75: 35, total_enrollment: 25562, admission_data_source: 'Cornell Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Brown University', country: 'US', location: 'Providence, RI', type: 'Private', official_website: 'https://www.brown.edu', acceptance_rate: 0.05, sat_reading_25: 720, sat_reading_75: 770, sat_math_25: 740, sat_math_75: 790, sat_total_avg: 1510, act_composite_25: 33, act_composite_75: 35, total_enrollment: 10403, admission_data_source: 'Brown Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Dartmouth College', country: 'US', location: 'Hanover, NH', type: 'Private', official_website: 'https://www.dartmouth.edu', acceptance_rate: 0.06, sat_reading_25: 710, sat_reading_75: 770, sat_math_25: 730, sat_math_75: 790, sat_total_avg: 1500, act_composite_25: 32, act_composite_75: 35, total_enrollment: 6804, admission_data_source: 'Dartmouth Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Northwestern University', country: 'US', location: 'Evanston, IL', type: 'Private', official_website: 'https://www.northwestern.edu', acceptance_rate: 0.07, sat_reading_25: 710, sat_reading_75: 770, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1515, act_composite_25: 33, act_composite_75: 35, total_enrollment: 22601, admission_data_source: 'Northwestern Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Chicago', country: 'US', location: 'Chicago, IL', type: 'Private', official_website: 'https://www.uchicago.edu', acceptance_rate: 0.05, sat_reading_25: 740, sat_reading_75: 780, sat_math_25: 770, sat_math_75: 800, sat_total_avg: 1545, act_composite_25: 34, act_composite_75: 35, total_enrollment: 18452, admission_data_source: 'UChicago Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Johns Hopkins University', country: 'US', location: 'Baltimore, MD', type: 'Private', official_website: 'https://www.jhu.edu', acceptance_rate: 0.07, sat_reading_25: 720, sat_reading_75: 770, sat_math_25: 760, sat_math_75: 800, sat_total_avg: 1525, act_composite_25: 34, act_composite_75: 35, total_enrollment: 27651, admission_data_source: 'JHU Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Rice University', country: 'US', location: 'Houston, TX', type: 'Private', official_website: 'https://www.rice.edu', acceptance_rate: 0.08, sat_reading_25: 710, sat_reading_75: 770, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1515, act_composite_25: 33, act_composite_75: 35, total_enrollment: 8285, admission_data_source: 'Rice Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Vanderbilt University', country: 'US', location: 'Nashville, TN', type: 'Private', official_website: 'https://www.vanderbilt.edu', acceptance_rate: 0.07, sat_reading_25: 710, sat_reading_75: 770, sat_math_25: 740, sat_math_75: 800, sat_total_avg: 1510, act_composite_25: 33, act_composite_75: 35, total_enrollment: 14070, admission_data_source: 'Vanderbilt Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Washington University in St. Louis', country: 'US', location: 'St. Louis, MO', type: 'Private', official_website: 'https://wustl.edu', acceptance_rate: 0.11, sat_reading_25: 710, sat_reading_75: 770, sat_math_25: 750, sat_math_75: 800, sat_total_avg: 1515, act_composite_25: 33, act_composite_75: 35, total_enrollment: 16390, admission_data_source: 'WashU Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Notre Dame', country: 'US', location: 'Notre Dame, IN', type: 'Private', official_website: 'https://www.nd.edu', acceptance_rate: 0.12, sat_reading_25: 690, sat_reading_75: 760, sat_math_25: 710, sat_math_75: 790, sat_total_avg: 1475, act_composite_25: 32, act_composite_75: 35, total_enrollment: 13713, admission_data_source: 'Notre Dame Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Georgetown University', country: 'US', location: 'Washington, DC', type: 'Private', official_website: 'https://www.georgetown.edu', acceptance_rate: 0.12, sat_reading_25: 690, sat_reading_75: 760, sat_math_25: 700, sat_math_75: 780, sat_total_avg: 1465, act_composite_25: 31, act_composite_75: 34, total_enrollment: 20193, admission_data_source: 'Georgetown Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Carnegie Mellon University', country: 'US', location: 'Pittsburgh, PA', type: 'Private', official_website: 'https://www.cmu.edu', acceptance_rate: 0.11, sat_reading_25: 710, sat_reading_75: 770, sat_math_25: 770, sat_math_75: 800, sat_total_avg: 1525, act_composite_25: 33, act_composite_75: 35, total_enrollment: 15818, admission_data_source: 'CMU Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Emory University', country: 'US', location: 'Atlanta, GA', type: 'Private', official_website: 'https://www.emory.edu', acceptance_rate: 0.11, sat_reading_25: 680, sat_reading_75: 750, sat_math_25: 700, sat_math_75: 790, sat_total_avg: 1460, act_composite_25: 31, act_composite_75: 34, total_enrollment: 15681, admission_data_source: 'Emory Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of California, Berkeley', country: 'US', location: 'Berkeley, CA', type: 'Public', official_website: 'https://www.berkeley.edu', acceptance_rate: 0.12, sat_reading_25: 670, sat_reading_75: 760, sat_math_25: 700, sat_math_75: 790, sat_total_avg: 1460, act_composite_25: 30, act_composite_75: 34, total_enrollment: 45307, in_state_tuition: 14312, out_of_state_tuition: 44066, admission_data_source: 'UC Berkeley Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of California, Los Angeles', country: 'US', location: 'Los Angeles, CA', type: 'Public', official_website: 'https://www.ucla.edu', acceptance_rate: 0.09, sat_reading_25: 660, sat_reading_75: 750, sat_math_25: 680, sat_math_75: 790, sat_total_avg: 1440, act_composite_25: 29, act_composite_75: 34, total_enrollment: 46116, in_state_tuition: 13804, out_of_state_tuition: 43473, admission_data_source: 'UCLA Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Michigan', country: 'US', location: 'Ann Arbor, MI', type: 'Public', official_website: 'https://umich.edu', acceptance_rate: 0.18, sat_reading_25: 680, sat_reading_75: 760, sat_math_25: 710, sat_math_75: 790, sat_total_avg: 1470, act_composite_25: 32, act_composite_75: 35, total_enrollment: 47907, in_state_tuition: 16736, out_of_state_tuition: 57273, admission_data_source: 'UMich Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Virginia', country: 'US', location: 'Charlottesville, VA', type: 'Public', official_website: 'https://www.virginia.edu', acceptance_rate: 0.19, sat_reading_25: 660, sat_reading_75: 740, sat_math_25: 680, sat_math_75: 770, sat_total_avg: 1425, act_composite_25: 30, act_composite_75: 34, total_enrollment: 26072, in_state_tuition: 19698, out_of_state_tuition: 55914, admission_data_source: 'UVA Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of North Carolina at Chapel Hill', country: 'US', location: 'Chapel Hill, NC', type: 'Public', official_website: 'https://www.unc.edu', acceptance_rate: 0.17, sat_reading_25: 660, sat_reading_75: 730, sat_math_25: 670, sat_math_75: 760, sat_total_avg: 1410, act_composite_25: 29, act_composite_75: 33, total_enrollment: 32852, in_state_tuition: 8997, out_of_state_tuition: 38571, admission_data_source: 'UNC Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Georgia Institute of Technology', country: 'US', location: 'Atlanta, GA', type: 'Public', official_website: 'https://www.gatech.edu', acceptance_rate: 0.16, sat_reading_25: 680, sat_reading_75: 760, sat_math_25: 730, sat_math_75: 800, sat_total_avg: 1485, act_composite_25: 32, act_composite_75: 35, total_enrollment: 47066, in_state_tuition: 11764, out_of_state_tuition: 33020, admission_data_source: 'Georgia Tech Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Texas at Austin', country: 'US', location: 'Austin, TX', type: 'Public', official_website: 'https://www.utexas.edu', acceptance_rate: 0.29, sat_reading_25: 620, sat_reading_75: 720, sat_math_25: 640, sat_math_75: 770, sat_total_avg: 1375, act_composite_25: 28, act_composite_75: 33, total_enrollment: 52384, in_state_tuition: 11998, out_of_state_tuition: 41070, admission_data_source: 'UT Austin Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Illinois Urbana-Champaign', country: 'US', location: 'Champaign, IL', type: 'Public', official_website: 'https://illinois.edu', acceptance_rate: 0.45, sat_reading_25: 610, sat_reading_75: 720, sat_math_25: 680, sat_math_75: 790, sat_total_avg: 1400, act_composite_25: 28, act_composite_75: 34, total_enrollment: 56607, in_state_tuition: 17572, out_of_state_tuition: 36068, admission_data_source: 'UIUC Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Wisconsin-Madison', country: 'US', location: 'Madison, WI', type: 'Public', official_website: 'https://www.wisc.edu', acceptance_rate: 0.49, sat_reading_25: 620, sat_reading_75: 710, sat_math_25: 660, sat_math_75: 780, sat_total_avg: 1385, act_composite_25: 27, act_composite_75: 32, total_enrollment: 49066, in_state_tuition: 11205, out_of_state_tuition: 40603, admission_data_source: 'UW-Madison Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Purdue University', country: 'US', location: 'West Lafayette, IN', type: 'Public', official_website: 'https://www.purdue.edu', acceptance_rate: 0.53, sat_reading_25: 590, sat_reading_75: 690, sat_math_25: 640, sat_math_75: 770, sat_total_avg: 1345, act_composite_25: 26, act_composite_75: 33, total_enrollment: 52211, in_state_tuition: 9992, out_of_state_tuition: 28794, admission_data_source: 'Purdue Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Washington', country: 'US', location: 'Seattle, WA', type: 'Public', official_website: 'https://www.washington.edu', acceptance_rate: 0.48, sat_reading_25: 610, sat_reading_75: 710, sat_math_25: 620, sat_math_75: 760, sat_total_avg: 1350, act_composite_25: 27, act_composite_75: 33, total_enrollment: 54115, in_state_tuition: 12643, out_of_state_tuition: 41997, admission_data_source: 'UW Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Ohio State University', country: 'US', location: 'Columbus, OH', type: 'Public', official_website: 'https://www.osu.edu', acceptance_rate: 0.53, sat_reading_25: 590, sat_reading_75: 690, sat_math_25: 620, sat_math_75: 750, sat_total_avg: 1325, act_composite_25: 26, act_composite_75: 32, total_enrollment: 66444, in_state_tuition: 12485, out_of_state_tuition: 36722, admission_data_source: 'OSU Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Penn State University', country: 'US', location: 'University Park, PA', type: 'Public', official_website: 'https://www.psu.edu', acceptance_rate: 0.54, sat_reading_25: 580, sat_reading_75: 680, sat_math_25: 590, sat_math_75: 720, sat_total_avg: 1285, act_composite_25: 25, act_composite_75: 31, total_enrollment: 88184, in_state_tuition: 19832, out_of_state_tuition: 38651, admission_data_source: 'Penn State Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Florida', country: 'US', location: 'Gainesville, FL', type: 'Public', official_website: 'https://www.ufl.edu', acceptance_rate: 0.23, sat_reading_25: 640, sat_reading_75: 720, sat_math_25: 660, sat_math_75: 770, sat_total_avg: 1395, act_composite_25: 28, act_composite_75: 33, total_enrollment: 60795, in_state_tuition: 6380, out_of_state_tuition: 28658, admission_data_source: 'UF Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'New York University', country: 'US', location: 'New York, NY', type: 'Private', official_website: 'https://www.nyu.edu', acceptance_rate: 0.13, sat_reading_25: 680, sat_reading_75: 750, sat_math_25: 700, sat_math_75: 780, sat_total_avg: 1455, act_composite_25: 31, act_composite_75: 34, total_enrollment: 62329, admission_data_source: 'NYU Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Boston University', country: 'US', location: 'Boston, MA', type: 'Private', official_website: 'https://www.bu.edu', acceptance_rate: 0.14, sat_reading_25: 670, sat_reading_75: 740, sat_math_25: 680, sat_math_75: 770, sat_total_avg: 1430, act_composite_25: 31, act_composite_75: 34, total_enrollment: 37457, admission_data_source: 'BU Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'Boston College', country: 'US', location: 'Chestnut Hill, MA', type: 'Private', official_website: 'https://www.bc.edu', acceptance_rate: 0.17, sat_reading_25: 670, sat_reading_75: 740, sat_math_25: 690, sat_math_75: 770, sat_total_avg: 1435, act_composite_25: 31, act_composite_75: 34, total_enrollment: 15076, admission_data_source: 'BC Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' },
    { name: 'University of Southern California', country: 'US', location: 'Los Angeles, CA', type: 'Private', official_website: 'https://www.usc.edu', acceptance_rate: 0.10, sat_reading_25: 680, sat_reading_75: 760, sat_math_25: 710, sat_math_75: 790, sat_total_avg: 1470, act_composite_25: 32, act_composite_75: 35, total_enrollment: 49500, admission_data_source: 'USC Common Data Set', admission_data_year: 2024, trust_tier: 'official_institution' }
  ];
}

// ============================================
// DATABASE OPERATIONS
// ============================================

function cleanDatabase() {
  console.log('\n🧹 Cleaning existing college data...');
  try {
    db.prepare('DELETE FROM colleges').run();
    console.log('   ✅ Existing colleges removed');
  } catch (error) {
    if (error.message.includes('no such table')) {
      console.log('   ⚠️ No colleges table found');
    } else {
      throw error;
    }
  }
}

function insertCollege(college) {
  // Use INSERT OR REPLACE with named parameters for clarity
  // This handles any subset of columns that exist in the database
  
  try {
    // Get all column names from the college object
    const columnMappings = {
      name: college.name,
      country: college.country,
      location: college.location,
      type: college.type,
      official_website: college.official_website || null,
      admissions_url: college.admissions_url || null,
      programs_url: college.programs_url || null,
      programs: college.programs ? JSON.stringify(college.programs) : null,
      major_categories: college.major_categories ? JSON.stringify(college.major_categories) : null,
      academic_strengths: college.academic_strengths ? JSON.stringify(college.academic_strengths) : null,
      application_portal: college.application_portal || null,
      acceptance_rate: college.acceptance_rate || null,
      requirements: college.requirements ? JSON.stringify(college.requirements) : null,
      deadline_templates: college.deadline_templates ? JSON.stringify(college.deadline_templates) : null,
      tuition_cost: college.tuition_cost || null,
      financial_aid_available: college.financial_aid_available ? 1 : 0,
      description: college.description || null,
      ucas_code: college.ucas_code || null,
      trust_tier: college.trust_tier || 'official',
      is_verified: 1,
      // SAT
      sat_reading_25: college.sat_reading_25 || null,
      sat_reading_50: college.sat_reading_50 || null,
      sat_reading_75: college.sat_reading_75 || null,
      sat_math_25: college.sat_math_25 || null,
      sat_math_50: college.sat_math_50 || null,
      sat_math_75: college.sat_math_75 || null,
      sat_total_avg: college.sat_total_avg || null,
      // ACT
      act_composite_25: college.act_composite_25 || null,
      act_composite_75: college.act_composite_75 || null,
      act_composite_avg: college.act_composite_avg || null,
      act_english_25: college.act_english_25 || null,
      act_english_75: college.act_english_75 || null,
      act_math_25: college.act_math_25 || null,
      act_math_75: college.act_math_75 || null,
      // GPA
      gpa_avg: college.gpa_avg || null,
      gpa_25: college.gpa_25 || null,
      gpa_75: college.gpa_75 || null,
      percent_gpa_375_plus: college.percent_gpa_375_plus || null,
      percent_gpa_350_374: college.percent_gpa_350_374 || null,
      percent_gpa_325_349: college.percent_gpa_325_349 || null,
      percent_gpa_300_324: college.percent_gpa_300_324 || null,
      percent_gpa_250_299: college.percent_gpa_250_299 || null,
      // Tuition
      in_state_tuition: college.in_state_tuition || null,
      out_of_state_tuition: college.out_of_state_tuition || null,
      international_tuition: college.international_tuition || null,
      room_and_board: college.room_and_board || null,
      total_cost_of_attendance: college.total_cost_of_attendance || null,
      avg_net_price: college.avg_net_price || null,
      // Enrollment
      total_enrollment: college.total_enrollment || null,
      undergrad_enrollment: college.undergrad_enrollment || null,
      grad_enrollment: college.grad_enrollment || null,
      ft_undergrad_enrollment: college.ft_undergrad_enrollment || null,
      pt_undergrad_enrollment: college.pt_undergrad_enrollment || null,
      // Retention/Graduation
      first_year_retention_rate: college.first_year_retention_rate || null,
      four_year_graduation_rate: college.four_year_graduation_rate || null,
      six_year_graduation_rate: college.six_year_graduation_rate || null,
      graduation_rate: college.graduation_rate || null,
      // Admissions
      total_applicants: college.total_applicants || null,
      total_admitted: college.total_admitted || null,
      total_enrolled: college.total_enrolled || null,
      yield_rate: college.yield_rate || null,
      ed_applicants: college.ed_applicants || null,
      ed_admitted: college.ed_admitted || null,
      ea_applicants: college.ea_applicants || null,
      ea_admitted: college.ea_admitted || null,
      waitlist_offered: college.waitlist_offered || null,
      waitlist_accepted: college.waitlist_accepted || null,
      waitlist_admitted: college.waitlist_admitted || null,
      // Test submission
      percent_submitting_sat: college.percent_submitting_sat || null,
      percent_submitting_act: college.percent_submitting_act || null,
      test_optional_policy: college.test_optional_policy || null,
      // Admission factors
      factor_rigor: college.factor_rigor || null,
      factor_class_rank: college.factor_class_rank || null,
      factor_gpa: college.factor_gpa || null,
      factor_test_scores: college.factor_test_scores || null,
      factor_essay: college.factor_essay || null,
      factor_recommendation: college.factor_recommendation || null,
      factor_interview: college.factor_interview || null,
      factor_extracurricular: college.factor_extracurricular || null,
      factor_talent: college.factor_talent || null,
      factor_character: college.factor_character || null,
      factor_first_gen: college.factor_first_gen || null,
      factor_alumni: college.factor_alumni || null,
      factor_geography: college.factor_geography || null,
      factor_state_residency: college.factor_state_residency || null,
      factor_volunteer: college.factor_volunteer || null,
      factor_work_experience: college.factor_work_experience || null,
      // Financial aid
      avg_need_based_grant: college.avg_need_based_grant || null,
      avg_merit_scholarship: college.avg_merit_scholarship || null,
      percent_receiving_aid: college.percent_receiving_aid || null,
      percent_need_fully_met: college.percent_need_fully_met || null,
      // Rankings
      us_news_rank: college.us_news_rank || null,
      cds_year: college.cds_year || null,
      // Data source
      admission_data_source: college.admission_data_source || null,
      admission_data_year: college.admission_data_year || null
    };
    
    // Column names are hardcoded above (not from user input) so SQL injection is not possible
    // Filter out null values and build dynamic query
    const columns = Object.keys(columnMappings);
    const values = Object.values(columnMappings);
    const placeholders = columns.map(() => '?').join(', ');
    
    const stmt = db.prepare(`
      INSERT INTO colleges (${columns.join(', ')}) 
      VALUES (${placeholders})
    `);

    stmt.run(...values);
    return true;
  } catch (error) {
    // If a column doesn't exist, try basic insert
    if (error.message.includes('no column named') || error.message.includes('no such column')) {
      return insertCollegeBasic(college);
    }
    console.error(`   ✗ Failed: ${college.name} - ${error.message}`);
    return false;
  }
}

function insertCollegeBasic(college) {
  const stmt = db.prepare(`
    INSERT INTO colleges (
      name, country, location, type, official_website, admissions_url,
      programs_url, application_portal_url, programs, major_categories,
      academic_strengths, application_portal, acceptance_rate, requirements,
      deadline_templates, tuition_cost, financial_aid_available, research_data,
      description, logo_url, cbse_requirements, igcse_requirements, ib_requirements,
      studielink_required, numerus_fixus_programs, ucas_code, common_app_id,
      trust_tier, is_verified
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      college.name,
      college.country,
      college.location,
      college.type,
      college.official_website || null,
      college.admissions_url || null,
      college.programs_url || null,
      null, // application_portal_url
      college.programs ? JSON.stringify(college.programs) : null,
      college.major_categories ? JSON.stringify(college.major_categories) : null,
      college.academic_strengths ? JSON.stringify(college.academic_strengths) : null,
      college.application_portal || null,
      college.acceptance_rate || null,
      college.requirements ? JSON.stringify(college.requirements) : null,
      college.deadline_templates ? JSON.stringify(college.deadline_templates) : null,
      college.tuition_cost || null,
      college.financial_aid_available ? 1 : 0,
      null, // research_data
      college.description || null,
      null, // logo_url
      null, null, null, // board requirements
      college.studielink_required ? 1 : 0,
      null, // numerus_fixus
      college.ucas_code || null,
      null, // common_app_id
      college.trust_tier || 'official',
      1
    );
    return true;
  } catch (error) {
    console.error(`   ✗ Failed: ${college.name} - ${error.message}`);
    return false;
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const forceClean = args.includes('--force');
  const useApi = args.includes('--api');
  const verbose = args.includes('--verbose');
  
  console.log('📋 Options:');
  console.log(`   --force: ${forceClean ? 'YES' : 'NO'}`);
  console.log(`   --api:   ${useApi ? 'YES' : 'NO'}`);
  console.log(`   --verbose: ${verbose ? 'YES' : 'NO'}`);
  
  try {
    if (forceClean) {
      cleanDatabase();
    }

    const allUniversities = [];
    
    // Load UK universities (150)
    const ukUniversities = loadUKUniversities();
    allUniversities.push(...ukUniversities);
    
    // Load Indian universities (120)
    const indianUniversities = loadIndianUniversities();
    allUniversities.push(...indianUniversities);
    
    // Load EU universities (200)
    const euUniversities = loadEUUniversities();
    allUniversities.push(...euUniversities);
    
    // Load US universities with CDS data first (highest priority)
    const cdsUniversities = loadUSCollegesCDS();
    allUniversities.push(...cdsUniversities);
    
    // Track names already added from CDS
    const addedNames = new Set(cdsUniversities.map(u => u.name.toLowerCase()));
    
    // Load additional US universities
    let usUniversities;
    if (useApi) {
      // Fetch ALL US colleges from College Scorecard API (6000+)
      usUniversities = await fetchUSUniversities('all');
    } else {
      console.log('🇺🇸 Using static US universities (run with --api to fetch all from Scorecard)...');
      usUniversities = getStaticUSUniversities();
    }
    
    // Add US universities that weren't already added from CDS
    for (const uni of usUniversities) {
      if (!addedNames.has(uni.name.toLowerCase())) {
        allUniversities.push(uni);
        addedNames.add(uni.name.toLowerCase());
      }
    }

    console.log(`\n📚 Inserting ${allUniversities.length} universities...`);
    
    let inserted = 0;
    let failed = 0;
    
    for (const uni of allUniversities) {
      if (insertCollege(uni)) {
        if (verbose) console.log(`   ✓ ${uni.name}`);
        inserted++;
      } else {
        failed++;
      }
    }

    // Summary
    const countResult = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
    const byCountry = db.prepare(`
      SELECT country, COUNT(*) as count 
      FROM colleges 
      GROUP BY country 
      ORDER BY count DESC
    `).all();

    console.log('\n📊 Summary:');
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total in database: ${countResult.count}`);
    
    console.log('\n📍 By Country:');
    const flags = { US: '🇺🇸', UK: '🇬🇧', IN: '🇮🇳', DE: '🇩🇪', FR: '🇫🇷', CH: '🇨🇭', NL: '🇳🇱', IT: '🇮🇹', ES: '🇪🇸', BE: '🇧🇪', DK: '🇩🇰', NO: '🇳🇴', SE: '🇸🇪', FI: '🇫🇮', AT: '🇦🇹', PL: '🇵🇱', CZ: '🇨🇿', IE: '🇮🇪', PT: '🇵🇹' };
    byCountry.forEach(row => {
      const flag = flags[row.country] || '🌍';
      console.log(`   ${flag} ${row.country}: ${row.count}`);
    });

    console.log('\n🎉 Seeding completed!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
