const College = require('../models/College');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

function normalizeId(input) {
  return String(input ?? '').trim();
}

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

class CollegeService {
  static async getColleges(filters = {}) {
    try {
      const colleges = await College.findAll(filters);
      logger.debug(`Retrieved ${colleges.length} colleges`);
      return colleges;
    } catch (error) {
      logger.error('Failed to get colleges:', error);
      throw error;
    }
  }

  static async getCollegeById(id) {
    try {
      const normalizedId = normalizeId(id);
      const canonicalCollege = await CollegeService.getCanonicalCollegeById(normalizedId);
      if (canonicalCollege) return canonicalCollege;

      const numericId = Number.parseInt(normalizedId, 10);
      if (!Number.isNaN(numericId)) {
        const college = await College.findById(numericId);
        if (college) return college;
      }

      throw new Error('College not found');
    } catch (error) {
      logger.error(`Failed to get college ${id}:`, error);
      throw error;
    }
  }

  static async getCanonicalCollegeById(id) {
    const normalizedId = normalizeId(id);
    if (!normalizedId) return null;

    const dbManager = require('../config/database');
    const pool = dbManager.getDatabase();

    const params = [normalizedId];
    const lookupSql = isUuid(normalizedId)
      ? `
        SELECT i.id
        FROM canonical.institutions i
        WHERE i.id = $1::uuid
        LIMIT 1
      `
      : `
        SELECT DISTINCT i.id
        FROM canonical.institutions i
        JOIN canonical.institution_identity_map m ON m.institution_id = i.id
        WHERE m.source_pk = $1
        LIMIT 1
      `;

    const lookup = await pool.query(lookupSql, params);
    const institutionId = lookup.rows[0]?.id;
    if (!institutionId) return null;

    const institutionPromise = pool.query(
      `
      SELECT
        i.id,
        i.canonical_name,
        i.normalized_name,
        i.slug,
        i.aliases,
        i.country_code,
        i.region_code,
        i.state_region,
        i.city,
        i.latitude,
        i.longitude,
        i.institution_type,
        i.control_type,
        i.established_year,
        i.website,
        i.logo_url,
        i.canonical_external_ids,
        i.metadata,
        i.updated_at
      FROM canonical.institutions i
      WHERE i.id = $1::uuid
      LIMIT 1
      `,
      [institutionId]
    );

    const admissionsPromise = pool.query(
      `
      SELECT
        institution_id, data_year, acceptance_rate, yield_rate,
        sat_25, sat_50, sat_75, act_25, act_50, act_75, test_optional,
        application_volume, admit_volume, enrollment_volume
      FROM canonical.institution_admissions
      WHERE institution_id = $1::uuid
      ORDER BY data_year DESC NULLS LAST, updated_at DESC
      LIMIT 1
      `,
      [institutionId]
    );

    const financialsPromise = pool.query(
      `
      SELECT
        institution_id, data_year, tuition_in_state, tuition_out_state,
        tuition_international, cost_of_attendance, avg_financial_aid, avg_debt,
        percent_receiving_aid, merit_scholarship_flag, need_blind_flag,
        net_price_low_income, net_price_mid_income, net_price_high_income
      FROM canonical.institution_financials
      WHERE institution_id = $1::uuid
      ORDER BY data_year DESC NULLS LAST, updated_at DESC
      LIMIT 1
      `,
      [institutionId]
    );

    const outcomesPromise = pool.query(
      `
      SELECT
        institution_id, data_year, graduation_rate_4yr, graduation_rate_6yr,
        retention_rate, employment_rate, median_start_salary,
        median_mid_career_salary, grad_school_rate
      FROM canonical.institution_outcomes
      WHERE institution_id = $1::uuid
      ORDER BY data_year DESC NULLS LAST, updated_at DESC
      LIMIT 1
      `,
      [institutionId]
    );

    const deadlinesPromise = pool.query(
      `
      SELECT
        deadline_type, deadline_date, notification_date, is_binding, cycle_year
      FROM canonical.institution_deadlines
      WHERE institution_id = $1::uuid
      ORDER BY cycle_year DESC NULLS LAST, deadline_date ASC NULLS LAST, updated_at DESC
      `,
      [institutionId]
    );

    const requirementsPromise = pool.query(
      `
      SELECT
        requirement_category, requirement_name, requirement_value, requirement_payload
      FROM canonical.institution_requirements
      WHERE institution_id = $1::uuid
      ORDER BY requirement_category ASC, requirement_name ASC
      `,
      [institutionId]
    );

    const rankingsPromise = pool.query(
      `
      SELECT
        ranking_year, ranking_body, national_rank, global_rank, subject_rank, ranking_score
      FROM canonical.institution_rankings
      WHERE institution_id = $1::uuid
      ORDER BY ranking_year DESC NULLS LAST, ranking_body ASC
      `,
      [institutionId]
    );

    const demographicsPromise = pool.query(
      `
      SELECT
        institution_id, data_year, percent_international, gender_ratio,
        ethnic_distribution, percent_first_gen
      FROM canonical.institution_demographics
      WHERE institution_id = $1::uuid
      ORDER BY data_year DESC NULLS LAST, updated_at DESC
      LIMIT 1
      `,
      [institutionId]
    );

    const campusLifePromise = pool.query(
      `
      SELECT
        institution_id, housing_guarantee, campus_safety_score, athletics_division, club_count
      FROM canonical.institution_campus_life
      WHERE institution_id = $1::uuid
      LIMIT 1
      `,
      [institutionId]
    );

    const programsPromise = pool.query(
      `
      SELECT
        program_name, degree_type, field_category, enrollment, acceptance_rate
      FROM canonical.institution_programs
      WHERE institution_id = $1::uuid
      ORDER BY field_category ASC NULLS LAST, degree_type ASC NULLS LAST, program_name ASC
      `,
      [institutionId]
    );

    const completenessPromise = pool.query(
      `
      SELECT *
      FROM canonical.institution_completeness
      WHERE institution_id = $1::uuid
      LIMIT 1
      `,
      [institutionId]
    );

    const qualityScoresPromise = pool.query(
      `
      SELECT *
      FROM canonical.institution_quality_scores
      WHERE institution_id = $1::uuid
      LIMIT 1
      `,
      [institutionId]
    );

    const [
      institution,
      admissions,
      financials,
      outcomes,
      deadlines,
      requirements,
      rankings,
      demographics,
      campusLife,
      programs,
      completeness,
      qualityScores,
    ] = await Promise.all([
      institutionPromise,
      admissionsPromise,
      financialsPromise,
      outcomesPromise,
      deadlinesPromise,
      requirementsPromise,
      rankingsPromise,
      demographicsPromise,
      campusLifePromise,
      programsPromise,
      completenessPromise,
      qualityScoresPromise,
    ]);

    const institutionRow = institution.rows[0];
    if (!institutionRow) return null;

    return {
      institution: institutionRow,
      admissions: admissions.rows[0] || {},
      financials: financials.rows[0] || {},
      outcomes: outcomes.rows[0] || {},
      deadlines: deadlines.rows || [],
      requirements: requirements.rows || [],
      rankings: rankings.rows || [],
      demographics: demographics.rows[0] || {},
      campus_life: campusLife.rows[0] || {},
      programs: programs.rows || [],
      completeness: completeness.rows[0] || {},
      quality_scores: qualityScores.rows[0] || {},
    };
  }

  static async searchColleges(searchTerm, filters = {}) {
    try {
      const colleges = await College.search(searchTerm, filters);
      logger.debug(`Search "${sanitizeForLog(searchTerm)}" returned ${colleges.length} results`);
      return colleges;
    } catch (error) {
      logger.error('College search failed:', error);
      throw error;
    }
  }

  static async createCollege(data) {
    try {
      const college = await College.create(data);
      logger.info(`Created college: ${sanitizeForLog(data.name)}`);
      return college;
    } catch (error) {
      logger.error('Failed to create college:', error);
      throw error;
    }
  }

  static async getCollegeData(collegeId, dataType) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const data = (await pool.query(
        `SELECT * FROM college_data
         WHERE college_id = $1 AND data_type = $2 AND is_valid = true
         ORDER BY scraped_at DESC LIMIT 1`,
        [collegeId, dataType]
      )).rows[0];

      if (!data) {
        return {
          available: false,
          message: 'Data not available. Please visit the official website.',
          college: College.findById(collegeId)
        };
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return {
          available: false,
          message: 'Data is outdated. Please visit the official website.',
          college: College.findById(collegeId),
          lastUpdated: data.scraped_at
        };
      }

      return {
        available: true,
        data: JSON.parse(data.data_content),
        source: data.source_url,
        trustTier: data.trust_tier,
        scrapedAt: data.scraped_at
      };
    } catch (error) {
      logger.error('Failed to get college data:', error);
      throw error;
    }
  }

  static async getCountries() {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();
      const rows = (await pool.query('SELECT DISTINCT country FROM public.clean_colleges WHERE country IS NOT NULL ORDER BY country')).rows;
      return rows.map(row => row.country);
    } catch (error) {
      logger.error('Failed to get countries:', error);
      throw error;
    }
  }

  static async getPrograms() {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();
      const rows = (await pool.query(
        'SELECT DISTINCT program_name as category, degree_type FROM college_programs WHERE program_name IS NOT NULL ORDER BY program_name'
      )).rows;

      return rows;
    } catch (error) {
      logger.error('Failed to get programs:', error);
      throw error;
    }
  }

  static async getDatabaseStats() {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const stats = {};

      try {
        const v2Stats = (await pool.query(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN country = 'United States' THEN 1 ELSE 0 END) as us,
            SUM(CASE WHEN country = 'India' THEN 1 ELSE 0 END) as india,
            SUM(CASE WHEN country = 'United Kingdom' THEN 1 ELSE 0 END) as uk,
            SUM(CASE WHEN country = 'Germany' THEN 1 ELSE 0 END) as germany
          FROM colleges_v2
        `)).rows[0];
        stats.database = v2Stats;
      } catch (e) {
        const oldStats = (await pool.query(`
          SELECT COUNT(*) as total, COUNT(DISTINCT country) as countries FROM public.clean_colleges
        `)).rows[0];
        stats.database = oldStats;
      }

      try {
        const requestStats = (await pool.query(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
            SUM(request_count) as total_votes
          FROM requested_colleges
        `)).rows[0];
        stats.requests = requestStats;
      } catch (e) {
        stats.requests = { total: 0, pending: 0, approved: 0, total_votes: 0 };
      }

      const path = require('path');
      const fs = require('fs');
      try {
        const statsFile = path.join(__dirname, '..', '..', '..', 'src', 'data', 'colleges', 'stats.json');
        if (fs.existsSync(statsFile)) {
          const jsonStats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
          stats.expanded = jsonStats;
        }
      } catch (e) {
        // Ignore if file doesn't exist
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get database stats:', error);
      throw error;
    }
  }

  static async requestCollege(data) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const existing = (await pool.query(
        `SELECT * FROM requested_colleges WHERE LOWER(name) = LOWER($1) AND LOWER(country) = LOWER($2)`,
        [data.name, data.country]
      )).rows[0];

      if (existing) {
        await pool.query(
          `UPDATE requested_colleges
           SET request_count = request_count + 1, last_requested_at = NOW()
           WHERE id = $1`,
          [existing.id]
        );
        return { id: existing.id, isNew: false, requestCount: existing.request_count + 1 };
      }

      const result = (await pool.query(
        `INSERT INTO requested_colleges (name, website, city, state, country, request_reason, requested_by_user_id, requested_by_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [data.name, data.website, data.city, data.state, data.country, data.reason, data.userId, data.email]
      )).rows[0];

      logger.info(`New college request: ${sanitizeForLog(data.name)} (${sanitizeForLog(data.country)})`);

      return { id: result.id, isNew: true, requestCount: 1 };
    } catch (error) {
      logger.error('Failed to request college:', error);
      throw error;
    }
  }

  static async getPopularRequests(options = {}) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const { limit = 20, status = 'pending' } = options;

      const requests = (await pool.query(
        `SELECT * FROM requested_colleges
         WHERE status = $1
         ORDER BY request_count DESC, last_requested_at DESC
         LIMIT $2`,
        [status, limit]
      )).rows;

      return requests;
    } catch (error) {
      logger.error('Failed to get popular requests:', error);
      throw error;
    }
  }

  static async upvoteRequest(requestId) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const result = await pool.query(
        `UPDATE requested_colleges
         SET request_count = request_count + 1, last_requested_at = NOW()
         WHERE id = $1`,
        [requestId]
      );

      if (result.rowCount === 0) throw new Error('Request not found');

      return (await pool.query('SELECT * FROM requested_colleges WHERE id = $1', [requestId])).rows[0];
    } catch (error) {
      logger.error('Failed to upvote request:', error);
      throw error;
    }
  }

  static async contributeData(data) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const result = (await pool.query(
        `INSERT INTO college_data_contributions
         (college_id, requested_college_id, contributed_by_user_id, contributed_by_email, data_type, data_value, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          data.collegeId || null,
          data.requestedCollegeId || null,
          data.userId || null,
          data.email || null,
          data.dataType,
          data.dataValue,
          data.sourceUrl || null
        ]
      )).rows[0];

      logger.info(`Data contribution received for college ${sanitizeForLog(data.collegeId || data.requestedCollegeId)}: ${sanitizeForLog(data.dataType)}`);

      return { id: result.id, status: 'pending' };
    } catch (error) {
      logger.error('Failed to contribute data:', error);
      throw error;
    }
  }

  static async getContributions(options = {}) {
    try {
      const dbManager = require('../config/database');
      const pool = dbManager.getDatabase();

      const { collegeId, status = 'approved' } = options;

      const contributions = (await pool.query(
        `SELECT * FROM college_data_contributions
         WHERE college_id = $1 AND status = $2
         ORDER BY contributed_at DESC`,
        [collegeId, status]
      )).rows;

      return contributions;
    } catch (error) {
      logger.error('Failed to get contributions:', error);
      throw error;
    }
  }
}

module.exports = CollegeService;
