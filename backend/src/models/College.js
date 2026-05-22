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
         qs_rank, ranking_us_news, type, size_category,
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
        data.qs_rank || null,
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
      qs_rank: c.qs_rank ?? null,
      ranking_us_news: c.ranking_us_news ?? null,
      the_rank: c.the_rank ?? null,
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
         c.id,
         c.canonical_name AS name,
         c.country_code AS country,
         c.state_region AS state,
         c.city,
         c.website AS official_website,
         c.website,
         c.website AS website_url,
         c.institution_type AS type,
         c.institution_type,
         NULL::text AS size_category,
         c.description,
         c.acceptance_rate,
         c.sat_50 AS sat_25,
         c.sat_50 AS sat_75,
         c.act_50 AS act_25,
         c.act_50 AS act_75,
         NULL::numeric AS gpa_25,
         NULL::numeric AS gpa_75,
         c.cost_of_attendance AS tuition_domestic,
         c.cost_of_attendance AS tuition_international,
         NULLIF((c.metadata->>'total_enrollment'),'')::numeric AS total_enrollment,
         NULL::int AS qs_rank,
         c.global_rank AS ranking_us_news,
         NULL::int AS the_rank,
         c.metadata->'major_categories' AS top_majors,
         'canonical.mv_college_cards'::text AS data_source,
         NULL::text AS data_source_url,
         1::numeric AS data_quality_score,
         NULL::timestamptz AS last_data_refresh,
         c.updated_at AS last_updated_at,
         c.updated_at,
         c.updated_at AS created_at,
         NULL::date AS application_deadline,
         NULL::date AS rd_deadline,
         NULL::date AS ed_deadline,
         NULL::date AS ea_deadline,
         LOWER(REGEXP_REPLACE(c.canonical_name, '\\s+', '-', 'g')) || '-' || c.id AS slug,
         (SELECT ARRAY_AGG(cp.program_name) FROM canonical.institution_programs cp WHERE cp.institution_id = c.id) AS program_names
       FROM canonical.mv_college_cards c
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
        c.id,
        c.canonical_name AS name,
        c.country_code AS country,
        c.state_region AS state,
        c.city,
        c.website AS official_website,
        c.website,
        c.website AS website_url,
        c.institution_type AS type,
        c.institution_type,
        NULL::text AS size_category,
        c.description,
        c.acceptance_rate,
        c.sat_50 AS sat_25,
        c.sat_50 AS sat_75,
        c.act_50 AS act_25,
        c.act_50 AS act_75,
        NULL::numeric AS gpa_25,
        NULL::numeric AS gpa_75,
        c.cost_of_attendance AS tuition_domestic,
        c.cost_of_attendance AS tuition_international,
        NULLIF((c.metadata->>'total_enrollment'),'')::numeric AS total_enrollment,
        NULL::int AS qs_rank,
        c.global_rank AS ranking_us_news,
        NULL::int AS the_rank,
        c.metadata->'major_categories' AS top_majors,
        'canonical.mv_college_cards'::text AS data_source,
        NULL::text AS data_source_url,
        1::numeric AS data_quality_score,
        NULL::timestamptz AS last_data_refresh,
        c.updated_at AS last_updated_at,
        c.updated_at,
        c.updated_at AS created_at,
        NULL::date AS application_deadline,
        NULL::date AS rd_deadline,
        NULL::date AS ed_deadline,
        NULL::date AS ea_deadline,
        LOWER(REGEXP_REPLACE(c.canonical_name, '\\s+', '-', 'g')) || '-' || c.id AS slug,
        COALESCE(c.popularity_score, 0)::numeric AS relevance_score,
        (SELECT ARRAY_AGG(cp.program_name) FROM canonical.institution_programs cp WHERE cp.institution_id = c.id) AS program_names
      FROM canonical.mv_college_cards c
      WHERE c.canonical_name IS NOT NULL
        AND LENGTH(TRIM(c.canonical_name)) > 1
    `;

    const params = [];
    let idx = 1;

    if (filters.country) {
      const cl = filters.country.toLowerCase();
      if (cl === 'europe') query += ` AND UPPER(c.country_code) NOT IN ('US','USA','GB','UK','IN')`;
      else if (cl === 'united states' || cl === 'usa') query += ` AND UPPER(c.country_code) IN ('US','USA')`;
      else if (cl === 'united kingdom' || cl === 'uk') query += ` AND UPPER(c.country_code) IN ('GB','UK')`;
      else { query += ` AND UPPER(c.country_code)=UPPER($${idx++})`; params.push(filters.country); }
    }

    if (filters.search) {
      const rawSearch = String(filters.search).trim();
      const p = `%${rawSearch}%`;
      const lowerSearch = rawSearch.toLowerCase();
      query = query.replace(
        '0::numeric AS relevance_score,',
        `(CASE
          WHEN LOWER(c.canonical_name) = LOWER($${idx + 1}) THEN 400
          WHEN LOWER(c.canonical_name) LIKE LOWER($${idx + 2}) THEN 250
          WHEN REGEXP_REPLACE(UPPER(c.canonical_name), '[^A-Z]', '', 'g') = UPPER($${idx + 3}) THEN 220
          WHEN c.canonical_name ILIKE $${idx} THEN 150
          WHEN EXISTS (SELECT 1 FROM canonical.institution_programs cp WHERE cp.institution_id=c.id AND cp.program_name ILIKE $${idx}) THEN 110
          WHEN c.city ILIKE $${idx} OR c.state_region ILIKE $${idx} OR c.country_code ILIKE $${idx} THEN 90
          ELSE 0
        END
        + COALESCE((1000 - LEAST(COALESCE(c.global_rank, 1000), 1000)) * 0.03, 0)
        + COALESCE(NULLIF((c.metadata->>'total_enrollment'),'')::numeric, 0) * 0.0001
        + COALESCE((1 - COALESCE(c.acceptance_rate, 0.5)) * 10, 0)
        )::numeric AS relevance_score,`
      );
      query += ` AND (
        c.canonical_name ILIKE $${idx}
        OR c.city ILIKE $${idx}
        OR c.state_region ILIKE $${idx}
        OR c.country_code ILIKE $${idx}
        OR REGEXP_REPLACE(UPPER(c.canonical_name), '[^A-Z]', '', 'g') = UPPER($${idx + 3})
        OR to_tsvector('simple', COALESCE(c.canonical_name,'')) @@ plainto_tsquery('simple', $${idx + 1})
        OR EXISTS (SELECT 1 FROM canonical.institution_programs cp WHERE cp.institution_id=c.id AND cp.program_name ILIKE $${idx})
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
      name: 'c.canonical_name',
      acceptance_rate: 'c.acceptance_rate',
      total_enrollment: `NULLIF((c.metadata->>'total_enrollment'),'')::numeric`,
      ranking: 'COALESCE(c.global_rank, 999999)',
    };

    const sortField = sortable[filters.sortBy] || 'c.canonical_name';
    const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
    if (filters.search && !filters.sortBy) {
      query += ' ORDER BY relevance_score DESC, c.canonical_name ASC';
    } else {
      query += ` ORDER BY ${sortField} ${sortDir}, c.canonical_name ASC`;
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
    let query = 'SELECT COUNT(*) AS count FROM canonical.mv_college_cards c WHERE c.canonical_name IS NOT NULL AND LENGTH(TRIM(c.canonical_name)) > 1';
    const params = [];
    let idx = 1;

    if (filters.country) {
      const cl = filters.country.toLowerCase();
      if (cl === 'europe') query += ` AND UPPER(c.country_code) NOT IN ('US','USA','GB','UK','IN')`;
      else if (cl === 'united states' || cl === 'usa') query += ` AND UPPER(c.country_code) IN ('US','USA')`;
      else if (cl === 'united kingdom' || cl === 'uk') query += ` AND UPPER(c.country_code) IN ('GB','UK')`;
      else { query += ` AND UPPER(c.country_code)=UPPER($${idx++})`; params.push(filters.country); }
    }

    if (filters.search) {
      const rawSearch = String(filters.search).trim();
      const p = `%${rawSearch}%`;
      query += ` AND (
        c.canonical_name ILIKE $${idx}
        OR c.city ILIKE $${idx}
        OR c.state_region ILIKE $${idx}
        OR c.country_code ILIKE $${idx}
        OR REGEXP_REPLACE(UPPER(c.canonical_name), '[^A-Z]', '', 'g') = UPPER($${idx + 2})
        OR to_tsvector('simple', COALESCE(c.canonical_name,'')) @@ plainto_tsquery('simple', $${idx + 1})
        OR EXISTS (SELECT 1 FROM canonical.institution_programs cp WHERE cp.institution_id=c.id AND cp.program_name ILIKE $${idx})
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
    if (region === 'Europe') query = `SELECT COUNT(*) as count FROM canonical.mv_college_cards WHERE UPPER(country_code) NOT IN ('US','USA','GB','UK','IN')`;
    else if (region === 'United States') query = `SELECT COUNT(*) as count FROM canonical.mv_college_cards WHERE UPPER(country_code) IN ('US','USA')`;
    else if (region === 'United Kingdom') query = `SELECT COUNT(*) as count FROM canonical.mv_college_cards WHERE UPPER(country_code) IN ('GB','UK')`;
    else if (region === 'India') query = `SELECT COUNT(*) as count FROM canonical.mv_college_cards WHERE UPPER(country_code)='IN'`;
    else { query = `SELECT COUNT(*) as count FROM canonical.mv_college_cards WHERE UPPER(country_code)=UPPER($1)`; params = [region]; }
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
      rankingQs: 'qs_rank',
      rankingUsNews: 'ranking_us_news',
      rankingThe: 'the_rank',
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
