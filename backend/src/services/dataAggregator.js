// backend/src/services/dataAggregator.js
// Aggregate data from multiple sources and manage data provenance

const webScraper = require('./webScraper');
const dbManager = require('../config/database');
const logger = require('../utils/logger');

class DataAggregator {
  async aggregateCollegeData(collegeId, sources = {}) {
    const aggregated = {
      collegeId,
      deadlines: [],
      requirements: [],
      programs: [],
      sources: [],
      aggregatedAt: new Date().toISOString()
    };

    if (sources.admissions) {
      const admissionsData = await webScraper.scrapeAdmissions(sources.admissions);
      if (admissionsData) {
        aggregated.deadlines.push(...admissionsData.deadlines);
        aggregated.requirements.push(...admissionsData.requirements);
        aggregated.sources.push({ type: 'admissions', url: sources.admissions, trustTier: 'official' });
        await webScraper.scrapeAndSave(collegeId, 'deadlines', sources.admissions);
        await webScraper.scrapeAndSave(collegeId, 'requirements', sources.admissions);
      }
    }

    if (sources.programs) {
      const programsData = await webScraper.scrapePrograms(sources.programs);
      if (programsData && programsData.length > 0) {
        aggregated.programs.push(...programsData);
        aggregated.sources.push({ type: 'programs', url: sources.programs, trustTier: 'official' });
        await webScraper.scrapeAndSave(collegeId, 'programs', sources.programs);
      }
    }

    return aggregated;
  }

  async getCachedData(collegeId) {
    try {
      const pool = dbManager.getDatabase();
      const rows = (await pool.query(
        `SELECT * FROM college_data
         WHERE college_id = $1 AND is_valid = true AND expires_at > NOW()
         ORDER BY scraped_at DESC`,
        [collegeId]
      )).rows;

      const cached = { deadlines: [], requirements: [], programs: [] };

      rows.forEach(row => {
        try {
          const content = JSON.parse(row.data_content);
          if (row.data_type === 'deadlines' && content.deadlines) {
            cached.deadlines.push(...content.deadlines);
          } else if (row.data_type === 'requirements' && content.requirements) {
            cached.requirements.push(...content.requirements);
          } else if (row.data_type === 'programs' && Array.isArray(content)) {
            cached.programs.push(...content);
          }
        } catch (parseError) {
          logger.error('Error parsing college_data', { rowId: row.id, error: parseError.message });
        }
      });

      cached.deadlines = [...new Set(cached.deadlines)];
      cached.requirements = [...new Set(cached.requirements)];
      cached.programs = [...new Set(cached.programs)];

      return cached;
    } catch (error) {
      logger.error('Error getting cached data', { error: error.message });
      return null;
    }
  }

  async isCacheValid(collegeId) {
    try {
      const pool = dbManager.getDatabase();
      const result = (await pool.query(
        `SELECT COUNT(*) as count FROM college_data
         WHERE college_id = $1 AND is_valid = true AND expires_at > NOW()`,
        [collegeId]
      )).rows[0];
      return parseInt(result.count) > 0;
    } catch (error) {
      logger.error('Error checking cache validity', { error: error.message });
      return false;
    }
  }

  async invalidateCache(collegeId) {
    try {
      const pool = dbManager.getDatabase();
      await pool.query(
        `UPDATE college_data SET is_valid = false WHERE college_id = $1`,
        [collegeId]
      );
      logger.debug('Invalidated cache for college', { collegeId });
    } catch (error) {
      logger.error('Error invalidating cache', { error: error.message });
    }
  }
}

const dataAggregator = new DataAggregator();
module.exports = dataAggregator;
