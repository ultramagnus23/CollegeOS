// backend/src/services/admissionOutcomeScraper.js
// Scrapes admission outcome data from Reddit r/collegeresults and College Scorecard API.
// Parsed records are stored in the admission_outcomes table.

const axios = require('axios');
const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

const REDDIT_URL = 'https://www.reddit.com/r/collegeresults.json';
const SCORECARD_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT || 'CollegeOS/1.0 (admission outcomes aggregator)';
const SCORECARD_API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || '';

function parseRedditPost(post) {
  try {
    const title = (post?.data?.title || '').replace(/[\r\n]+/g, ' ');
    if (!title) return null;

    const acceptedRe = /\b(accepted|admit(?:ted)?|yes)\b/i;
    const rejectedRe = /\b(rejected?|denied?|no)\b/i;
    let admitted = null;
    if (acceptedRe.test(title)) admitted = true;
    else if (rejectedRe.test(title)) admitted = false;
    if (admitted === null) return null;

    const satMatch = title.match(/SAT[\s:]*(\d{3,4})/i);
    const satTotal = satMatch ? parseInt(satMatch[1], 10) : null;

    const gpaMatch = title.match(/(?:GPA[\s:]*(\d+(?:\.\d+)?))|(\d+\.\d+)\s*GPA/i);
    const gpa = gpaMatch ? parseFloat(gpaMatch[1] || gpaMatch[2]) : null;

    const yearMatch = title.match(/(?:class\s+of\s+)?(\b20[12]\d\b)/i);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

    const collegeMatch = title.match(/^([^|[\]–\-,]+)/);
    let college_name = collegeMatch ? collegeMatch[1].replace(/accepted|rejected|denied|admit/gi, '').trim() : null;
    if (!college_name || college_name.length < 2) return null;

    if (!satTotal && !gpa) return null;

    return {
      college_name,
      sat_total: satTotal,
      gpa,
      admitted: admitted ? 1 : 0,
      year,
      source: 'reddit_collegeresults',
    };
  } catch {
    return null;
  }
}

async function scrapeReddit(limit = 100) {
  const records = [];
  try {
    const response = await axios.get(`${REDDIT_URL}?limit=${limit}`, {
      headers: { 'User-Agent': REDDIT_USER_AGENT },
      timeout: 10000,
    });

    const posts = response?.data?.data?.children || [];
    for (const post of posts) {
      const record = parseRedditPost(post);
      if (record) records.push(record);
    }
    logger.info('Reddit scrape complete', { parsed: records.length, total: posts.length });
  } catch (error) {
    logger.warn('Reddit scrape failed', { error: sanitizeForLog(error?.message) });
  }
  return records;
}

async function scrapeCollegeScorecard(perPage = 20) {
  const records = [];
  if (!SCORECARD_API_KEY) {
    logger.warn('COLLEGE_SCORECARD_API_KEY not set; skipping Scorecard scrape');
    return records;
  }

  try {
    const params = new URLSearchParams({
      api_key: SCORECARD_API_KEY,
      fields: 'school.name,latest.admissions.sat_scores.average.overall,latest.student.students.enrolled,latest.admissions.admission_rate.overall',
      per_page: String(perPage),
      page: '0',
    });

    const response = await axios.get(`${SCORECARD_URL}?${params.toString()}`, {
      timeout: 15000,
    });

    const schools = response?.data?.results || [];
    const year = new Date().getFullYear();

    for (const school of schools) {
      const name = school['school.name'];
      const sat = school['latest.admissions.sat_scores.average.overall'];

      if (!name) continue;

      if (sat && sat > 0) {
        records.push({
          college_name: name,
          sat_total: Math.round(sat),
          gpa: null,
          admitted: 1,
          year,
          source: 'college_scorecard',
        });
      }
    }

    logger.info('College Scorecard scrape complete', { records: records.length });
  } catch (error) {
    logger.warn('College Scorecard scrape failed', { error: sanitizeForLog(error?.message) });
  }

  return records;
}

/**
 * Insert scraped records into the admission_outcomes table, skipping duplicates.
 * Returns the number of newly inserted rows.
 */
async function insertOutcomes(records) {
  if (!records.length) return 0;

  const pool = dbManager.getDatabase();
  let inserted = 0;

  for (const row of records) {
    const result = await pool.query(
      `INSERT INTO admission_outcomes
        (college_name, sat_total, gpa, admitted, year, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        row.college_name,
        row.sat_total ?? null,
        row.gpa ?? null,
        row.admitted,
        row.year ?? null,
        row.source ?? null,
      ]
    );
    inserted += result.rowCount;
  }

  return inserted;
}

/**
 * Run the full scrape pipeline: Reddit + Scorecard → insert into DB.
 * @returns {{ inserted: number, reddit: number, scorecard: number }}
 */
async function scrapeAndStore() {
  const [redditRecords, scorecardRecords] = await Promise.all([
    scrapeReddit(),
    scrapeCollegeScorecard(),
  ]);

  const all = [...redditRecords, ...scorecardRecords];
  const inserted = await insertOutcomes(all);

  logger.info('Admission outcome scrape complete', {
    reddit: redditRecords.length,
    scorecard: scorecardRecords.length,
    inserted,
  });

  return { inserted, reddit: redditRecords.length, scorecard: scorecardRecords.length };
}

module.exports = { scrapeAndStore, scrapeReddit, scrapeCollegeScorecard, insertOutcomes };
