const dbManager = require('../config/database');
const logger = require('../utils/logger');

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

function normalizeAcceptanceRate(rate) {
  if (rate === null || rate === undefined) return null;
  const n = Number(rate);
  if (isNaN(n)) return null;
  if (n > 100) { logger.warn('Invalid acceptance rate value', { rate: n }); return null; }
  return n > 1 ? n / 100 : n;
}

function safeJsonParse(str, def = []) {
  if (!str) return def;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return def; }
}

function getRegion(country) {
  const c = (country || '').toLowerCase();
  if (c === 'united states' || c === 'usa') return 'US';
  if (c === 'united kingdom' || c === 'uk') return 'UK';
  if (c === 'india') return 'India';
  return 'Europe';
}

function getCountryRequirements(country) {
  const c = (country || '').toLowerCase();
  if (c === 'united states' || c === 'usa') {
    return { applicationType:'Common App / Coalition App', applicationComponents:['Common Application','Application fee','High school transcript','Counselor recommendation','2 teacher recommendations','SAT/ACT scores (many test-optional)','Personal essay (650 words)'], financialAid:['FAFSA','CSS Profile'], testScores:'SAT/ACT', region:'US' };
  }
  if (c === 'united kingdom' || c === 'uk') {
    return { applicationType:'UCAS Application', applicationComponents:['UCAS Application form','Personal Statement (4000 characters)','Academic Reference','Predicted grades'], financialAid:['Student Finance'], testScores:'A-Levels or IB Diploma', region:'UK' };
  }
  if (c === 'india') {
    return { applicationType:'National Entrance Exams', applicationComponents:['JEE Main/Advanced','NEET','CAT','CUET','Class 12 board exam marks'], financialAid:['Government scholarships'], testScores:'JEE/NEET/CAT rank & Class 12 percentage', region:'India' };
  }
  return { applicationType:'National/University Portal', applicationComponents:['Online application form','Secondary school leaving certificate','Motivation letter','CV/Resume','Language proficiency certificate'], financialAid:['University-specific scholarships'], testScores:'Varies by country', region:'Europe' };
}

class College {
  static async create(data) {
    const pool = dbManager.getDatabase();
    const { rows: existing } = await pool.query(
      'SELECT id FROM colleges WHERE LOWER(name)=LOWER($1) AND LOWER(country)=LOWER($2)',
      [data.name, data.country]
    );
    if (existing.length > 0) return this.findById(existing[0].id);

    const acceptanceRate = normalizeAcceptanceRate(data.acceptanceRate || data.acceptance_rate);
    const { rows } = await pool.query(
      `INSERT INTO colleges (name,country,location,official_website,admissions_url,programs_url,application_portal_url,
        academic_strengths,acceptance_rate,tuition_domestic,tuition_international,student_population,
        average_gpa,sat_range,act_range,graduation_rate,ranking,trust_tier,is_verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [data.name, data.country, data.location||null, data.officialWebsite||data.official_website||'',
       data.admissionsUrl||data.admissions_url||null, data.programsUrl||data.programs_url||null,
       data.applicationPortalUrl||data.application_portal_url||null,
       JSON.stringify(data.academicStrengths||data.academic_strengths||[]),
       acceptanceRate, data.tuitionDomestic||data.tuition_domestic||null,
       data.tuitionInternational||data.tuition_international||null,
       data.studentPopulation||data.student_population||null,
       data.averageGpa||data.average_gpa||null,
       data.satRange||data.sat_range||null, data.actRange||data.act_range||null,
       data.graduationRate||data.graduation_rate||null, data.ranking||null,
       data.trustTier||data.trust_tier||'official', data.isVerified||data.is_verified||false]
    );
    return this.findById(rows[0].id);
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();

    // First try the comprehensive table (used by the Supabase-powered frontend).
    const { rows: compDirect } = await pool.query(
      'SELECT * FROM colleges_comprehensive WHERE id=$1', [id]
    );
    if (compDirect[0]) {
      const cc = compDirect[0];
      // Build a College-shaped object from colleges_comprehensive columns.
      const formattedCollege = this.formatCollege({
        id: cc.id,
        name: cc.name,
        country: cc.country,
        location: [cc.city, cc.state_region].filter(Boolean).join(', ') || cc.country,
        official_website: cc.website_url || null,
        admissions_url: null,
        acceptance_rate: null,
        tuition_domestic: null,
        tuition_international: null,
        student_population: cc.total_enrollment || null,
        average_gpa: null,
        sat_range: null,
        act_range: null,
        graduation_rate: null,
        ranking: null,
        trust_tier: 'official',
        is_verified: true,
        location_city: cc.city || null,
        location_state: cc.state_region || null,
        location_country: cc.country,
      });

      try {
        const [admR, statsR, finR] = await Promise.all([
          pool.query('SELECT * FROM college_admissions WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [cc.id]),
          pool.query('SELECT * FROM admitted_student_stats WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [cc.id]),
          pool.query('SELECT * FROM college_financial_data WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [cc.id]),
        ]);
        if (admR.rows[0]) {
          const a = admR.rows[0];
          // Normalise acceptance_rate to a 0–1 fraction
          const rawRate = a.acceptance_rate;
          const normRate = rawRate != null
            ? (rawRate > 1 ? rawRate / 100 : rawRate)
            : null;
          formattedCollege.acceptance_rate = normRate;
          formattedCollege.acceptanceRate = normRate;
        }
        if (statsR.rows[0]) {
          const s = statsR.rows[0];
          formattedCollege.sat_avg = s.sat_avg || s.sat_50 || null;
          formattedCollege.sat_total_50 = s.sat_avg || s.sat_50 || null;
          formattedCollege.sat_25 = s.sat_25 ?? null;
          formattedCollege.sat_75 = s.sat_75 ?? null;
          formattedCollege.act_avg = s.act_avg || s.act_50 || null;
          formattedCollege.act_25 = s.act_25 ?? null;
          formattedCollege.act_75 = s.act_75 ?? null;
          formattedCollege.gpa_50 = s.gpa_50 || null;
          formattedCollege.median_gpa = s.gpa_50 || null;
          formattedCollege.gpa_25 = s.gpa_25 ?? null;
          formattedCollege.gpa_75 = s.gpa_75 ?? null;
        }
        if (finR.rows[0]) {
          const f = finR.rows[0];
          formattedCollege.tuition_international = f.tuition_international || null;
          formattedCollege.tuition_domestic = f.tuition_in_state || null;
        }
      } catch (enrichErr) {
        logger.warn('College.findById: enrichment error for colleges_comprehensive', { id, error: enrichErr?.message });
      }

      return formattedCollege;
    }

    // Fall back to the legacy colleges table.
    const { rows } = await pool.query('SELECT * FROM colleges WHERE id=$1', [id]);
    if (!rows[0]) return null;
    const formattedCollege = this.formatCollege(rows[0]);

    try {
      const { rows: comp } = await pool.query(
        'SELECT * FROM colleges_comprehensive WHERE LOWER(name)=LOWER($1) AND LOWER(country)=LOWER($2)',
        [rows[0].name, rows[0].country]
      );
      if (comp.length > 0) {
        const c = comp[0];
        formattedCollege.comprehensiveData = {
          alternateName:c.alternate_names, stateRegion:c.state_region, city:c.city,
          urbanClassification:c.urban_classification, institutionType:c.institution_type,
          classification:c.classification, religiousAffiliation:c.religious_affiliation,
          foundingYear:c.founding_year, campusSizeAcres:c.campus_size_acres,
          undergraduateEnrollment:c.undergraduate_enrollment, graduateEnrollment:c.graduate_enrollment,
          totalEnrollment:c.total_enrollment, studentFacultyRatio:c.student_faculty_ratio,
          websiteUrl:c.website_url
        };

        const [admR, statsR, finR, outR, progR, demR, campR, rankR] = await Promise.all([
          pool.query('SELECT * FROM college_admissions WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [c.id]),
          pool.query('SELECT * FROM admitted_student_stats WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [c.id]),
          pool.query('SELECT * FROM college_financial_data WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [c.id]),
          pool.query('SELECT * FROM academic_outcomes WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [c.id]),
          pool.query('SELECT * FROM college_programs WHERE college_id=$1 LIMIT 20', [c.id]),
          pool.query('SELECT * FROM student_demographics WHERE college_id=$1 ORDER BY year DESC LIMIT 1', [c.id]),
          pool.query('SELECT * FROM campus_life WHERE college_id=$1', [c.id]),
          pool.query('SELECT * FROM college_rankings WHERE college_id=$1 ORDER BY year DESC', [c.id])
        ]);

        if (admR.rows[0]) {
          const a = admR.rows[0];
          formattedCollege.admissionsData = { year:a.year, acceptanceRate:a.acceptance_rate, earlyDecisionRate:a.early_decision_rate, earlyActionRate:a.early_action_rate, regularDecisionRate:a.regular_decision_rate, waitlistRate:a.waitlist_rate, transferAcceptanceRate:a.transfer_acceptance_rate, yieldRate:a.yield_rate, applicationVolume:a.application_volume, admitVolume:a.admit_volume, enrollmentVolume:a.enrollment_volume, internationalAcceptRate:a.international_accept_rate, inStateAcceptRate:a.in_state_accept_rate, outStateAcceptRate:a.out_state_accept_rate, testOptionalFlag:a.test_optional_flag, source:a.source, confidenceScore:a.confidence_score };
          // Expose flat acceptance_rate for calculateChance
          if (a.acceptance_rate != null) {
            const normRate = a.acceptance_rate > 1 ? a.acceptance_rate / 100 : a.acceptance_rate;
            formattedCollege.acceptance_rate = normRate;
            formattedCollege.acceptanceRate = normRate;
          }
        }
        if (statsR.rows[0]) {
          const s = statsR.rows[0];
          formattedCollege.studentStats = { year:s.year, gpa25:s.gpa_25, gpa50:s.gpa_50, gpa75:s.gpa_75, sat25:s.sat_25, sat50:s.sat_50, sat75:s.sat_75, act25:s.act_25, act50:s.act_50, act75:s.act_75, classRankTop10Percent:s.class_rank_top10_percent, avgCourseRigorIndex:s.avg_course_rigor_index, source:s.source, confidenceScore:s.confidence_score };
          // Expose flat percentile bands for calculateChance
          formattedCollege.sat_avg = s.sat_avg || s.sat_50 || null;
          formattedCollege.sat_25 = s.sat_25 ?? null;
          formattedCollege.sat_75 = s.sat_75 ?? null;
          formattedCollege.act_avg = s.act_avg || s.act_50 || null;
          formattedCollege.act_25 = s.act_25 ?? null;
          formattedCollege.act_75 = s.act_75 ?? null;
          formattedCollege.gpa_50 = s.gpa_50 || null;
          formattedCollege.gpa_25 = s.gpa_25 ?? null;
          formattedCollege.gpa_75 = s.gpa_75 ?? null;
        }
        if (finR.rows[0]) {
          const f = finR.rows[0];
          const avgNetPrice = f.avg_net_price || f.avg_financial_aid || null;
          formattedCollege.financialData = { year:f.year, tuitionInState:f.tuition_in_state, tuitionOutState:f.tuition_out_state, tuitionInternational:f.tuition_international, costOfAttendance:f.cost_of_attendance, avgFinancialAid:f.avg_financial_aid, avgNetPrice, percentReceivingAid:f.percent_receiving_aid, avgDebt:f.avg_debt, medianDebt:f.avg_debt, netPriceLowIncome:f.net_price_low_income, netPriceMidIncome:f.net_price_mid_income, netPriceHighIncome:f.net_price_high_income, meritScholarshipFlag:f.merit_scholarship_flag, needBlindFlag:f.need_blind_flag, loanDefaultRate:f.loan_default_rate, source:f.source, confidenceScore:f.confidence_score };
        }
        if (outR.rows[0]) {
          const o = outR.rows[0];
          formattedCollege.academicOutcomes = { year:o.year, graduationRate4yr:o.graduation_rate_4yr, graduationRate6yr:o.graduation_rate_6yr, retentionRate:o.retention_rate, dropoutRate:o.dropout_rate, avgTimeToDegree:o.avg_time_to_degree, employmentRate:o.employment_rate, gradSchoolRate:o.grad_school_rate, medianStartSalary:o.median_start_salary, medianSalary6yr:o.median_start_salary, medianMidCareerSalary:o.median_mid_career_salary, medianSalary10yr:o.median_mid_career_salary, salaryGrowthRate:o.salary_growth_rate, employedAt6MonthsRate:o.employed_6_months_rate, employedInFieldRate:o.employed_in_field_rate, internshipRate:o.internship_rate, source:o.source, confidenceScore:o.confidence_score };
        }
        if (progR.rows.length > 0) {
          formattedCollege.programs = progR.rows.map(p => ({ programName:p.program_name, degreeType:p.degree_type, enrollment:p.enrollment, acceptanceRate:p.acceptance_rate, accreditationStatus:p.accreditation_status, rankingScore:p.ranking_score, researchFunding:p.research_funding, coopAvailable:p.coop_available, licensingPassRate:p.licensing_pass_rate, source:p.source }));
        }
        if (demR.rows[0]) {
          const d = demR.rows[0];
          formattedCollege.demographics = { year:d.year, percentInternational:d.percent_international, genderRatio:d.gender_ratio, ethnicDistribution:safeJsonParse(d.ethnic_distribution, {}), percentFirstGen:d.percent_first_gen, socioeconomicIndex:d.socioeconomic_index, geographicDiversityIndex:d.geographic_diversity_index, legacyPercent:d.legacy_percent, athletePercent:d.athlete_percent, transferPercent:d.transfer_percent, percentMale:d.percent_male, percentFemale:d.percent_female, percentNonbinary:d.percent_nonbinary, percentWhite:d.percent_white, percentBlack:d.percent_black, percentHispanic:d.percent_hispanic, percentAsian:d.percent_asian, percentNativeAmerican:d.percent_native_american, percentPacificIslander:d.percent_pacific_islander, percentMultiracial:d.percent_multiracial, source:d.source };
        }
        if (campR.rows[0]) {
          const cl = campR.rows[0];
          formattedCollege.campusLife = { housingGuarantee:cl.housing_guarantee, campusSafetyScore:cl.campus_safety_score, costOfLivingIndex:cl.cost_of_living_index, climateZone:cl.climate_zone, studentSatisfactionScore:cl.student_satisfaction_score, athleticsDivision:cl.athletics_division, clubCount:cl.club_count, mentalHealthRating:cl.mental_health_rating, source:cl.source };
        }
        if (rankR.rows.length > 0) {
          formattedCollege.rankings = rankR.rows.map(r => ({ year:r.year, rankingBody:r.ranking_body, nationalRank:r.national_rank, globalRank:r.global_rank, subjectRank:r.subject_rank, employerReputationScore:r.employer_reputation_score, peerAssessmentScore:r.peer_assessment_score, prestigeIndex:r.prestige_index }));
        }
      }
    } catch (error) {
      logger.warn('Could not fetch comprehensive data for college', { collegeId: id, error: error.message });
    }
    return formattedCollege;
  }

  static formatCollege(college) {
    const academicStrengths = safeJsonParse(college.academic_strengths, []);
    const majorCategories = Array.isArray(college.program_names)
      ? college.program_names.filter(Boolean)
      : safeJsonParse(college.major_categories, []);
    const acceptanceRate = normalizeAcceptanceRate(college.acceptance_rate);
    const requirements = getCountryRequirements(college.country);
    const region = getRegion(college.country);
    const tuitionCost = college.tuition_in_state || college.tuition_domestic || college.tuition_out_of_state || college.cf_tuition_international || college.tuition_international;
    const enrollmentValue = college.total_enrollment || college.student_population;
    const gpaValue = college.gpa_50 || college.average_gpa;
    return {
      id:college.id, name:college.name, country:college.country, region, location:college.location,
      officialWebsite:college.official_website, admissionsUrl:college.admissions_url, programsUrl:college.programs_url, applicationPortalUrl:college.application_portal_url,
      academicStrengths, majorCategories, programs:majorCategories, programCount:college.program_count||majorCategories.length,
      acceptanceRate, acceptance_rate:acceptanceRate,
      tuitionDomestic:college.tuition_domestic||college.tuition_in_state, tuitionInternational:college.tuition_international||college.cf_tuition_international,
      tuition_cost:tuitionCost, tuitionInState:college.tuition_in_state, tuitionOutOfState:college.tuition_out_of_state,
      studentPopulation:college.student_population, enrollment:enrollmentValue, totalEnrollment:college.total_enrollment,
      undergraduateEnrollment:college.undergraduate_enrollment, graduateEnrollment:college.graduate_enrollment,
      averageGpa:gpaValue, averageGPA:gpaValue, gpa50:college.gpa_50, satAvg:college.sat_avg, actAvg:college.act_avg,
      satRange:college.sat_range, actRange:college.act_range, graduationRate:college.graduation_rate, ranking:college.ranking,
      requirements, trustTier:college.trust_tier, isVerified:college.is_verified, createdAt:college.created_at, updatedAt:college.updated_at
    };
  }

  static async findAll(filters = {}) {
    const pool = dbManager.getDatabase();
    const tablesExist = await this.checkComprehensiveTables(pool);

    let query = tablesExist
      ? `SELECT c.*,MAX(cc.total_enrollment) as total_enrollment,MAX(cc.undergraduate_enrollment) as undergraduate_enrollment,MAX(cc.graduate_enrollment) as graduate_enrollment,MAX(cf.tuition_in_state) as tuition_in_state,MAX(cf.tuition_out_state) as tuition_out_of_state,MAX(cf.tuition_international) as cf_tuition_international,MAX(ass.gpa_50) as gpa_50,MAX(ass.sat_50) as sat_avg,MAX(ass.act_50) as act_avg,(SELECT COUNT(*) FROM college_programs WHERE college_id=c.id) as program_count,(SELECT ARRAY_AGG(cp.program_name) FROM college_programs cp WHERE cp.college_id=c.id) as program_names FROM colleges c LEFT JOIN colleges_comprehensive cc ON c.id=cc.id LEFT JOIN college_financial_data cf ON c.id=cf.college_id LEFT JOIN admitted_student_stats ass ON c.id=ass.college_id WHERE 1=1`
      : `SELECT c.*,NULL as total_enrollment,NULL as undergraduate_enrollment,NULL as graduate_enrollment,NULL as tuition_in_state,NULL as tuition_out_of_state,NULL as cf_tuition_international,NULL as gpa_50,NULL as sat_avg,NULL as act_avg,0 as program_count,(SELECT ARRAY_AGG(cp.program_name) FROM college_programs cp WHERE cp.college_id=c.id) as program_names FROM colleges c WHERE 1=1`;

    const params = [];
    let idx = 1;

    if (filters.country) {
      const cl = filters.country.toLowerCase();
      if (cl === 'europe') query += ` AND c.country NOT IN ('United States','USA','United Kingdom','UK','India')`;
      else if (cl === 'united states' || cl === 'usa') query += ` AND (c.country='United States' OR c.country='USA')`;
      else if (cl === 'united kingdom' || cl === 'uk') query += ` AND (c.country='United Kingdom' OR c.country='UK')`;
      else { query += ` AND LOWER(c.country)=LOWER($${idx++})`; params.push(filters.country); }
    }

    if (filters.search) {
      const p = `%${filters.search}%`;
      query += ` AND (c.name ILIKE $${idx} OR c.location ILIKE $${idx} OR c.country ILIKE $${idx} OR EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=c.id AND cp.program_name ILIKE $${idx}) OR c.academic_strengths ILIKE $${idx})`;
      params.push(p); idx++;
    }

    if (filters.minAcceptanceRate !== undefined) { query += ` AND c.acceptance_rate>=$${idx++}`; params.push(filters.minAcceptanceRate); }
    if (filters.maxAcceptanceRate !== undefined) { query += ` AND c.acceptance_rate<=$${idx++}`; params.push(filters.maxAcceptanceRate); }

    if (tablesExist) query += ' GROUP BY c.id';

    const validSorts = ['name','acceptance_rate','ranking','student_population'];
    const sortField = validSorts.includes(filters.sortBy) ? filters.sortBy : 'name';
    const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
    query += ` ORDER BY c.${sortField} ${sortDir}`;

    const limit = Math.min(filters.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = filters.offset || 0;
    query += ` LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    return rows.map(c => this.formatCollege(c));
  }

  static async checkComprehensiveTables(pool) {
    try {
      const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('colleges_comprehensive','college_financial_data','admitted_student_stats')`);
      return rows.length === 3;
    } catch {
      return false;
    }
  }

  static async getCount(filters = {}) {
    const pool = dbManager.getDatabase();
    let query = 'SELECT COUNT(*) as count FROM colleges WHERE 1=1';
    const params = [];
    let idx = 1;
    if (filters.country) {
      const cl = filters.country.toLowerCase();
      if (cl === 'europe') query += ` AND country NOT IN ('United States','USA','United Kingdom','UK','India')`;
      else if (cl === 'united states'||cl==='usa') query += ` AND (country='United States' OR country='USA')`;
      else if (cl === 'united kingdom'||cl==='uk') query += ` AND (country='United Kingdom' OR country='UK')`;
      else { query += ` AND LOWER(country)=LOWER($${idx++})`; params.push(filters.country); }
    }
    if (filters.search) {
      const p = `%${filters.search}%`;
      query += ` AND (name ILIKE $${idx} OR location ILIKE $${idx} OR country ILIKE $${idx} OR EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=colleges.id AND cp.program_name ILIKE $${idx}) OR academic_strengths ILIKE $${idx})`;
      params.push(p); idx++;
    }
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count);
  }

  static async search(searchTerm, filters = {}) {
    return this.findAll({ ...filters, search: searchTerm });
  }

  static async getCountByRegion(region) {
    const pool = dbManager.getDatabase();
    let query;
    if (region === 'Europe') query = `SELECT COUNT(*) as count FROM colleges WHERE country NOT IN ('United States','USA','United Kingdom','UK','India')`;
    else if (region === 'United States') query = `SELECT COUNT(*) as count FROM colleges WHERE country IN ('United States','USA')`;
    else if (region === 'United Kingdom') query = `SELECT COUNT(*) as count FROM colleges WHERE country IN ('United Kingdom','UK')`;
    else if (region === 'India') query = `SELECT COUNT(*) as count FROM colleges WHERE country='India'`;
    else query = `SELECT COUNT(*) as count FROM colleges WHERE country=$1`;
    const { rows } = await pool.query(query, region === 'Europe'||region==='United States'||region==='United Kingdom'||region==='India' ? [] : [region]);
    return parseInt(rows[0].count);
  }

  static async getCountryFilters() {
    const [us, india, uk, europe] = await Promise.all([
      this.getCountByRegion('United States'),
      this.getCountByRegion('India'),
      this.getCountByRegion('United Kingdom'),
      this.getCountByRegion('Europe')
    ]);
    return [
      { value:'United States', label:'United States', count:us },
      { value:'India', label:'India', count:india },
      { value:'United Kingdom', label:'United Kingdom', count:uk },
      { value:'Europe', label:'Europe', count:europe }
    ];
  }

  static async getAllMajors() {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT DISTINCT program_name FROM college_programs WHERE program_name IS NOT NULL ORDER BY program_name');
    return rows.map(r => r.program_name);
  }

  static async update(id, data) {
    const pool = dbManager.getDatabase();
    const fieldMap = { name:'name', country:'country', location:'location', officialWebsite:'official_website', admissionsUrl:'admissions_url', programsUrl:'programs_url', applicationPortalUrl:'application_portal_url', academicStrengths:'academic_strengths', acceptanceRate:'acceptance_rate', tuitionDomestic:'tuition_domestic', tuitionInternational:'tuition_international', studentPopulation:'student_population', averageGpa:'average_gpa', satRange:'sat_range', actRange:'act_range', graduationRate:'graduation_rate', ranking:'ranking', trustTier:'trust_tier', isVerified:'is_verified' };
    const updates = [];
    const params = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        let value = data[key];
        if (key === 'academicStrengths') value = JSON.stringify(value);
        if (key === 'acceptanceRate') value = normalizeAcceptanceRate(value);
        updates.push(`${col}=$${idx++}`);
        params.push(value);
      }
    }
    if (updates.length === 0) return this.findById(id);
    updates.push('updated_at=NOW()');
    params.push(id);
    await pool.query(`UPDATE colleges SET ${updates.join(',')} WHERE id=$${idx}`, params);
    return this.findById(id);
  }

  static async delete(id) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM colleges WHERE id=$1', [id]);
    return rowCount > 0;
  }
}

module.exports = College;
