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

function buildCollegeSlug(name, id) {
  if (!name || !id) return null;
  return `${String(name).toLowerCase().trim().replace(/\s+/g, '-')}-${id}`;
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
    const { rows } = await pool.query(
      `SELECT
         cc.*,
         LOWER(REGEXP_REPLACE(cc.name, '\\s+', '-', 'g')) || '-' || cc.id AS slug,
         ca.acceptance_rate,
         ca.sat_25,
         ca.sat_75,
         ca.sat_avg,
         ca.act_25,
         ca.act_75,
         ca.act_avg,
         ca.gpa_25,
         ca.gpa_75,
         ca.gpa_50,
         cfd.tuition_in_state,
         cfd.tuition_out_state,
         cfd.tuition_international,
         cfd.avg_net_price_0_30k,
         cfd.avg_net_price_30_48k,
         cfd.avg_net_price_48_75k,
         cfd.avg_net_price_75_110k,
         cfd.avg_net_price_110k_plus,
         ad.graduation_rate_4yr,
         ad.graduation_rate_6yr,
         ad.student_faculty_ratio,
         COALESCE(
           JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('name', cm.major_name, 'code', cm.major_code))
             FILTER (WHERE cm.id IS NOT NULL),
           '[]'::json
         ) AS majors,
         COALESCE(
           JSON_AGG(DISTINCT JSONB_BUILD_OBJECT('name', cp.program_name, 'description', cp.program_description))
             FILTER (WHERE cp.id IS NOT NULL),
           '[]'::json
         ) AS programs,
         COALESCE(
           JSON_AGG(DISTINCT JSONB_BUILD_OBJECT(
             'rd_deadline', cd.rd_deadline,
             'ed_deadline', cd.ed_deadline,
             'ea_deadline', cd.ea_deadline,
             'application_platforms', cd.application_platforms
           )) FILTER (WHERE cd.id IS NOT NULL),
           '[]'::json
         ) AS deadlines
       FROM public.clean_colleges cc
       LEFT JOIN public.college_admissions ca ON cc.id = ca.college_id
       LEFT JOIN public.college_financial_data cfd ON cc.id = cfd.college_id
       LEFT JOIN public.academic_details ad ON cc.id = ad.college_id
       LEFT JOIN public.college_majors cm ON cc.id = cm.college_id
       LEFT JOIN public.college_programs cp ON cc.id = cp.college_id
       LEFT JOIN public.college_deadlines cd ON cc.id = cd.college_id
       WHERE cc.id = $1
         AND cc.name IS NOT NULL
         AND cc.country IS NOT NULL
       GROUP BY cc.id, ca.id, cfd.id, ad.id`,
      [id]
    );
    if (!rows[0]) return null;
    const formattedCollege = this.formatCollege(rows[0]);
    formattedCollege.majors = rows[0].majors || [];
    formattedCollege.programsDetailed = rows[0].programs || [];
    formattedCollege.deadlines = rows[0].deadlines || [];
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
    const state = college.state || college.state_region || college.location_state || null;
    const city = college.city || college.location_city || null;
    const website = college.official_website || college.website_url || college.website || null;
    const slug = college.slug || buildCollegeSlug(college.name, college.id);
    return {
      id:college.id, name:college.name, country:college.country, region, location:college.location,
      slug,
      state,
      city,
      officialWebsite:website, official_website:website, admissionsUrl:college.admissions_url, programsUrl:college.programs_url, applicationPortalUrl:college.application_portal_url,
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
    let query = `
      SELECT
        c.*,
        LOWER(REGEXP_REPLACE(c.name, '\\s+', '-', 'g')) || '-' || c.id AS slug,
        ca.acceptance_rate,
        ca.sat_25,
        ca.sat_75,
        ca.sat_avg,
        ca.act_25,
        ca.act_75,
        ca.act_avg,
        ca.gpa_25,
        ca.gpa_75,
        ca.gpa_50,
        cfd.tuition_in_state,
        cfd.tuition_out_state,
        cfd.tuition_international AS cf_tuition_international,
        ad.graduation_rate_4yr AS graduation_rate,
        ad.graduation_rate_6yr,
        ad.student_faculty_ratio,
        (SELECT COUNT(*) FROM college_programs cp WHERE cp.college_id = c.id) as program_count,
        (SELECT ARRAY_AGG(cp.program_name) FROM college_programs cp WHERE cp.college_id = c.id) as program_names
      FROM public.clean_colleges c
      LEFT JOIN public.college_admissions ca ON c.id = ca.college_id
      LEFT JOIN public.college_financial_data cfd ON c.id = cfd.college_id
      LEFT JOIN public.academic_details ad ON c.id = ad.college_id
      WHERE c.name IS NOT NULL AND c.country IS NOT NULL
    `;

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
      query += ` AND (c.name ILIKE $${idx} OR c.city ILIKE $${idx} OR c.state ILIKE $${idx} OR c.country ILIKE $${idx} OR EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=c.id AND cp.program_name ILIKE $${idx}))`;
      params.push(p); idx++;
    }

    if (filters.minAcceptanceRate !== undefined) { query += ` AND ca.acceptance_rate >= $${idx++}`; params.push(filters.minAcceptanceRate); }
    if (filters.maxAcceptanceRate !== undefined) { query += ` AND ca.acceptance_rate <= $${idx++}`; params.push(filters.maxAcceptanceRate); }

    const validSorts = ['name','acceptance_rate','total_enrollment'];
    const sortField = validSorts.includes(filters.sortBy) ? filters.sortBy : 'name';
    const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
    if (sortField === 'acceptance_rate') {
      query += ` ORDER BY CASE WHEN ca.acceptance_rate IS NOT NULL THEN 1 ELSE 2 END, ca.acceptance_rate ${sortDir}, c.name ASC`;
    } else {
      query += ` ORDER BY c.${sortField} ${sortDir}`;
    }

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
    let query = 'SELECT COUNT(*) as count FROM public.clean_colleges WHERE name IS NOT NULL AND country IS NOT NULL';
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
      query += ` AND (name ILIKE $${idx} OR city ILIKE $${idx} OR state ILIKE $${idx} OR country ILIKE $${idx} OR EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=clean_colleges.id AND cp.program_name ILIKE $${idx}))`;
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
    if (region === 'Europe') query = `SELECT COUNT(*) as count FROM public.clean_colleges WHERE country NOT IN ('United States','USA','United Kingdom','UK','India')`;
    else if (region === 'United States') query = `SELECT COUNT(*) as count FROM public.clean_colleges WHERE country IN ('United States','USA')`;
    else if (region === 'United Kingdom') query = `SELECT COUNT(*) as count FROM public.clean_colleges WHERE country IN ('United Kingdom','UK')`;
    else if (region === 'India') query = `SELECT COUNT(*) as count FROM public.clean_colleges WHERE country='India'`;
    else query = `SELECT COUNT(*) as count FROM public.clean_colleges WHERE country=$1`;
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
