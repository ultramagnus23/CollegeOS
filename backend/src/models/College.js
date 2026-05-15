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

function safeJsonParse(value, def = []) {
  if (!value) return def;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return def; }
}

function buildCollegeSlug(name, id) {
  if (!name || !id) return null;
  return `${String(name).toLowerCase().trim().replace(/\s+/g, '-')}-${id}`;
}

function pick(...vals) {
  for (const v of vals) if (v !== null && v !== undefined) return v;
  return null;
}

class College {
  static async create(data) {
    const pool = dbManager.getDatabase();
    const acceptanceRate = normalizeAcceptanceRate(data.acceptanceRate || data.acceptance_rate);

    const { rows } = await pool.query(
      `INSERT INTO colleges (
         name, country, state, city, official_website,
         acceptance_rate, tuition_domestic, tuition_international,
         ranking_qs, ranking_us_news, type, size_category,
         application_deadline, rd_deadline, ed_deadline, ea_deadline
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,$8,
         $9,$10,$11,$12,
         $13,$14,$15,$16
       ) RETURNING id`,
      [
        data.name,
        data.country || null,
        data.state || null,
        data.city || null,
        data.officialWebsite || data.official_website || null,
        acceptanceRate,
        data.tuitionDomestic || data.tuition_domestic || null,
        data.tuitionInternational || data.tuition_international || null,
        data.ranking_qs || null,
        data.ranking_us_news || null,
        data.type || null,
        data.size_category || null,
        data.application_deadline || null,
        data.rd_deadline || null,
        data.ed_deadline || null,
        data.ea_deadline || null,
      ]
    );

    return this.findById(rows[0].id);
  }

  static formatCollege(c) {
    const acceptanceRate = normalizeAcceptanceRate(c.acceptance_rate);
    const website = pick(c.official_website, c.website, c.website_url);
    const programNames = Array.isArray(c.program_names) ? c.program_names.filter(Boolean) : [];
    const majorCategories = programNames.length > 0 ? programNames : safeJsonParse(c.top_majors, []);

    return {
      id: c.id,
      slug: c.slug || buildCollegeSlug(c.name, c.id),
      name: c.name,
      country: c.country,
      state: c.state || null,
      city: c.city || null,
      location: [c.city, c.state, c.country].filter(Boolean).join(', ') || c.country,
      officialWebsite: website,
      official_website: website,
      type: c.type || c.institution_type || null,
      size_category: c.size_category || null,
      description: c.description || null,
      acceptanceRate,
      acceptance_rate: acceptanceRate,
      sat_25: c.sat_25 ?? null,
      sat_75: c.sat_75 ?? null,
      act_25: c.act_25 ?? null,
      act_75: c.act_75 ?? null,
      gpa_25: c.gpa_25 ?? null,
      gpa_75: c.gpa_75 ?? null,
      tuitionDomestic: c.tuition_domestic ?? null,
      tuitionInternational: c.tuition_international ?? null,
      tuition_cost: pick(c.tuition_domestic, c.tuition_international),
      totalEnrollment: c.total_enrollment ?? null,
      enrollment: c.total_enrollment ?? null,
      ranking_qs: c.ranking_qs ?? null,
      ranking_us_news: c.ranking_us_news ?? null,
      ranking_the: c.ranking_the ?? null,
      majorCategories,
      programs: majorCategories,
      programCount: majorCategories.length,
      data_source: c.data_source ?? null,
      data_source_url: c.data_source_url ?? null,
      data_quality_score: c.data_quality_score ?? null,
      last_updated_at: pick(c.last_updated_at, c.last_data_refresh, c.updated_at),
      application_deadline: c.application_deadline ?? null,
      rd_deadline: c.rd_deadline ?? null,
      ed_deadline: c.ed_deadline ?? null,
      ea_deadline: c.ea_deadline ?? null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    };
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT
         c.id, c.name, c.country, c.state, c.city,
         COALESCE(
           to_jsonb(c) ->> 'official_website',
           to_jsonb(c) ->> 'website_url',
           to_jsonb(c) ->> 'website'
         ) AS official_website,
         COALESCE(
           to_jsonb(c) ->> 'website',
           to_jsonb(c) ->> 'website_url',
           to_jsonb(c) ->> 'official_website'
         ) AS website,
         to_jsonb(c) ->> 'website_url' AS website_url,
         COALESCE(
           to_jsonb(c) ->> 'type',
           to_jsonb(c) ->> 'institution_type'
         ) AS type,
         to_jsonb(c) ->> 'institution_type' AS institution_type,
         c.size_category, c.description,
         c.acceptance_rate, c.sat_25, c.sat_75, c.act_25, c.act_75, c.gpa_25, c.gpa_75,
         c.tuition_domestic, c.tuition_international,
         c.total_enrollment,
         c.ranking_qs, c.ranking_us_news, c.ranking_the,
         c.top_majors,
         c.data_source, c.data_source_url, c.data_quality_score,
         c.last_data_refresh, c.last_updated_at, c.updated_at, c.created_at,
         c.application_deadline, c.rd_deadline, c.ed_deadline, c.ea_deadline,
         LOWER(REGEXP_REPLACE(c.name, '\\s+', '-', 'g')) || '-' || c.id AS slug,
         (SELECT ARRAY_AGG(cp.program_name) FROM college_programs cp WHERE cp.college_id = c.id) AS program_names
       FROM public.colleges c
       WHERE c.id = $1`,
      [id]
    );

    if (!rows[0]) return null;
    return this.formatCollege(rows[0]);
  }

  static async findAll(filters = {}) {
    const pool = dbManager.getDatabase();

    let query = `
      SELECT
        c.id, c.name, c.country, c.state, c.city,
        COALESCE(
          to_jsonb(c) ->> 'official_website',
          to_jsonb(c) ->> 'website_url',
          to_jsonb(c) ->> 'website'
        ) AS official_website,
        COALESCE(
          to_jsonb(c) ->> 'website',
          to_jsonb(c) ->> 'website_url',
          to_jsonb(c) ->> 'official_website'
        ) AS website,
        to_jsonb(c) ->> 'website_url' AS website_url,
        COALESCE(
          to_jsonb(c) ->> 'type',
          to_jsonb(c) ->> 'institution_type'
        ) AS type,
        to_jsonb(c) ->> 'institution_type' AS institution_type,
        c.size_category, c.description,
        c.acceptance_rate, c.sat_25, c.sat_75, c.act_25, c.act_75, c.gpa_25, c.gpa_75,
        c.tuition_domestic, c.tuition_international,
        c.total_enrollment,
        c.ranking_qs, c.ranking_us_news, c.ranking_the,
        c.top_majors,
        c.data_source, c.data_source_url, c.data_quality_score,
        c.last_data_refresh, c.last_updated_at, c.updated_at, c.created_at,
        c.application_deadline, c.rd_deadline, c.ed_deadline, c.ea_deadline,
        LOWER(REGEXP_REPLACE(c.name, '\\s+', '-', 'g')) || '-' || c.id AS slug,
        0::numeric AS relevance_score,
        (SELECT ARRAY_AGG(cp.program_name) FROM college_programs cp WHERE cp.college_id = c.id) AS program_names
      FROM public.colleges c
      WHERE c.name IS NOT NULL
        AND LENGTH(TRIM(c.name)) > 1
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
      const rawSearch = String(filters.search).trim();
      const p = `%${rawSearch}%`;
      const lowerSearch = rawSearch.toLowerCase();
      query = query.replace(
        '0::numeric AS relevance_score,',
        `(CASE
          WHEN LOWER(c.name) = LOWER($${idx + 1}) THEN 400
          WHEN LOWER(c.name) LIKE LOWER($${idx + 2}) THEN 250
          WHEN REGEXP_REPLACE(UPPER(c.name), '[^A-Z]', '', 'g') = UPPER($${idx + 3}) THEN 220
          WHEN c.name ILIKE $${idx} THEN 150
          WHEN EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=c.id AND cp.program_name ILIKE $${idx}) THEN 110
          WHEN c.city ILIKE $${idx} OR c.state ILIKE $${idx} OR c.country ILIKE $${idx} THEN 90
          ELSE 0
        END
        + COALESCE((1000 - LEAST(COALESCE(c.ranking_us_news, c.ranking_qs, c.ranking_the, 1000), 1000)) * 0.03, 0)
        + COALESCE(c.total_enrollment, 0) * 0.0001
        + COALESCE((1 - COALESCE(c.acceptance_rate, 0.5)) * 10, 0)
        )::numeric AS relevance_score,`
      );
      query += ` AND (
        c.name ILIKE $${idx}
        OR c.city ILIKE $${idx}
        OR c.state ILIKE $${idx}
        OR c.country ILIKE $${idx}
        OR REGEXP_REPLACE(UPPER(c.name), '[^A-Z]', '', 'g') = UPPER($${idx + 3})
        OR to_tsvector('simple', COALESCE(c.name,'')) @@ plainto_tsquery('simple', $${idx + 1})
        OR EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=c.id AND cp.program_name ILIKE $${idx})
      )`;
      params.push(p, rawSearch, `${lowerSearch}%`, rawSearch.replace(/[^A-Za-z]/g, ''));
      idx += 4;
    }

    if (filters.minAcceptanceRate !== undefined) {
      query += ` AND c.acceptance_rate >= $${idx++}`;
      params.push(filters.minAcceptanceRate);
    }

    if (filters.maxAcceptanceRate !== undefined) {
      query += ` AND c.acceptance_rate <= $${idx++}`;
      params.push(filters.maxAcceptanceRate);
    }

    const sortable = {
      name: 'c.name',
      acceptance_rate: 'c.acceptance_rate',
      total_enrollment: 'c.total_enrollment',
      ranking: 'COALESCE(c.ranking_us_news, c.ranking_qs, c.ranking_the, 999999)',
    };

    const sortField = sortable[filters.sortBy] || 'c.name';
    const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
    if (filters.search && !filters.sortBy) {
      query += ' ORDER BY relevance_score DESC, c.name ASC';
    } else {
      query += ` ORDER BY ${sortField} ${sortDir}, c.name ASC`;
    }

    const limit = Math.min(filters.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = Number(filters.offset || 0);
    query += ` LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    return rows.map((r) => this.formatCollege(r));
  }

  static async getCount(filters = {}) {
    const pool = dbManager.getDatabase();
    let query = 'SELECT COUNT(*) AS count FROM public.colleges c WHERE c.name IS NOT NULL AND LENGTH(TRIM(c.name)) > 1';
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
      const rawSearch = String(filters.search).trim();
      const p = `%${rawSearch}%`;
      query += ` AND (
        c.name ILIKE $${idx}
        OR c.city ILIKE $${idx}
        OR c.state ILIKE $${idx}
        OR c.country ILIKE $${idx}
        OR REGEXP_REPLACE(UPPER(c.name), '[^A-Z]', '', 'g') = UPPER($${idx + 2})
        OR to_tsvector('simple', COALESCE(c.name,'')) @@ plainto_tsquery('simple', $${idx + 1})
        OR EXISTS (SELECT 1 FROM college_programs cp WHERE cp.college_id=c.id AND cp.program_name ILIKE $${idx})
      )`;
      params.push(p, rawSearch, rawSearch.replace(/[^A-Za-z]/g, ''));
      idx += 3;
    }

    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  static async search(searchTerm, filters = {}) {
    return this.findAll({ ...filters, search: searchTerm });
  }

  static async getCountByRegion(region) {
    const pool = dbManager.getDatabase();
    let query;
    let params = [];
    if (region === 'Europe') query = `SELECT COUNT(*) as count FROM public.colleges WHERE country NOT IN ('United States','USA','United Kingdom','UK','India')`;
    else if (region === 'United States') query = `SELECT COUNT(*) as count FROM public.colleges WHERE country IN ('United States','USA')`;
    else if (region === 'United Kingdom') query = `SELECT COUNT(*) as count FROM public.colleges WHERE country IN ('United Kingdom','UK')`;
    else if (region === 'India') query = `SELECT COUNT(*) as count FROM public.colleges WHERE country='India'`;
    else { query = `SELECT COUNT(*) as count FROM public.colleges WHERE country=$1`; params = [region]; }
    const { rows } = await pool.query(query, params);
    return parseInt(rows[0].count, 10);
  }

  static async getCountryFilters() {
    const [us, india, uk, europe] = await Promise.all([
      this.getCountByRegion('United States'),
      this.getCountByRegion('India'),
      this.getCountByRegion('United Kingdom'),
      this.getCountByRegion('Europe'),
    ]);
    return [
      { value: 'United States', label: 'United States', count: us },
      { value: 'India', label: 'India', count: india },
      { value: 'United Kingdom', label: 'United Kingdom', count: uk },
      { value: 'Europe', label: 'Europe', count: europe },
    ];
  }

  static async getAllMajors() {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      'SELECT DISTINCT program_name FROM college_programs WHERE program_name IS NOT NULL ORDER BY program_name'
    );
    return rows.map((r) => r.program_name);
  }

  static async update(id, data) {
    const pool = dbManager.getDatabase();
    const fieldMap = {
      name: 'name',
      country: 'country',
      state: 'state',
      city: 'city',
      officialWebsite: 'official_website',
      acceptanceRate: 'acceptance_rate',
      tuitionDomestic: 'tuition_domestic',
      tuitionInternational: 'tuition_international',
      rankingQs: 'ranking_qs',
      rankingUsNews: 'ranking_us_news',
      rankingThe: 'ranking_the',
      type: 'type',
      sizeCategory: 'size_category',
      description: 'description',
      applicationDeadline: 'application_deadline',
      rdDeadline: 'rd_deadline',
      edDeadline: 'ed_deadline',
      eaDeadline: 'ea_deadline',
    };

    const updates = [];
    const params = [];
    let idx = 1;

    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        let value = data[key];
        if (key === 'acceptanceRate') value = normalizeAcceptanceRate(value);
        updates.push(`${col}=$${idx++}`);
        params.push(value);
      }
    }

    if (updates.length === 0) return this.findById(id);

    updates.push('updated_at = NOW()');
    params.push(id);

    await pool.query(`UPDATE colleges SET ${updates.join(', ')} WHERE id = $${idx}`, params);
    return this.findById(id);
  }

  static async delete(id) {
    const pool = dbManager.getDatabase();
    const { rowCount } = await pool.query('DELETE FROM colleges WHERE id=$1', [id]);
    return rowCount > 0;
  }
}

module.exports = College;
