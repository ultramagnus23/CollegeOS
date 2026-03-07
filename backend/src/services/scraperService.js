/**
 * scraperService.js
 *
 * Queue-based college data scraper with rate limiting.
 * Reads pending colleges from scrape_queue, runs a multi-step pipeline per college,
 * writes results to the DB, and logs every attempt in scraping_logs.
 *
 * Steps per college (in order):
 *   A. Admissions page → application_deadlines, college_requirements
 *   B. Financial aid page → college_financial_data
 *   C. Common Data Set → admitted_student_stats, college_financial_data
 *   D. CollegeVine public page → essay_prompts
 *   E. Niche public page → campus_life (letter-grade ratings)
 *
 * Rate limits:
 *   - 2 s minimum gap between requests to the same domain
 *   - Max 5 colleges processed concurrently
 */

'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  BATCH_SIZE: 5,
  BATCH_PAUSE_MS: 1000,           // pause between batches
  DOMAIN_MIN_GAP_MS: 2000,        // min ms between requests to same domain
  COLLEGEVINE_DELAY_MS: 3000,     // extra delay for CollegeVine
  REQUEST_TIMEOUT_MS: 20000,
  MAX_ATTEMPTS: 3,                // failures before permanently_failed
  STALE_DAYS: 30,                 // re-scrape if older than this
  USER_AGENT: 'Mozilla/5.0 (compatible; CollegeOSBot/1.0; +https://collegeos.app)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Domain rate-limiter  (shared across all concurrent scrapes)
// ─────────────────────────────────────────────────────────────────────────────
const lastRequestPerDomain = new Map();

async function rateLimitedFetch(url, extraDelayMs = 0) {
  const domain = new URL(url).hostname;
  const now = Date.now();
  const last = lastRequestPerDomain.get(domain) || 0;
  const gap = CONFIG.DOMAIN_MIN_GAP_MS + extraDelayMs;
  const wait = Math.max(0, last + gap - now);
  if (wait > 0) {
    await sleep(wait);
  }
  lastRequestPerDomain.set(domain, Date.now());

  const response = await axios.get(url, {
    timeout: CONFIG.REQUEST_TIMEOUT_MS,
    headers: {
      'User-Agent': CONFIG.USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxRedirects: 5,
    validateStatus: status => status < 500,
  });
  return response;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────
const VALIDATORS = {
  acceptanceRate: v => typeof v === 'number' && v >= 0 && v <= 100,
  satScore: v => typeof v === 'number' && v >= 400 && v <= 1600,
  actScore: v => typeof v === 'number' && v >= 1 && v <= 36,
  tuition: v => typeof v === 'number' && v > 0 && v <= 150000,
  date: v => {
    if (!v) return false;
    const d = new Date(v);
    return !isNaN(d.getTime());
  },
};

function validate(key, value) {
  const fn = VALIDATORS[key];
  if (!fn) return true;
  return fn(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the first dollar amount near a keyword */
function extractDollarAmount(text, keyword) {
  const re = new RegExp(
    `(?:${keyword})[^$\\d]{0,80}\\$([\\d,]+)`,
    'i'
  );
  const m = text.match(re);
  if (m) {
    const v = parseInt(m[1].replace(/,/g, ''), 10);
    return isNaN(v) ? null : v;
  }
  return null;
}

/**
 * Try to find a date (e.g. "November 1", "January 15") near a keyword.
 * Returns a string like "2025-11-01" or null.
 */
function extractDateNearKeyword(text, keyword) {
  const MONTHS = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  // Build a window around the keyword
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return null;

  const window = text.slice(Math.max(0, idx - 20), idx + 120);
  const re = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\w*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;
  const m = re.exec(window);
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase().slice(0, 3)];
  const day = m[2].padStart(2, '0');
  // Assume upcoming academic cycle: if the month/day has passed for current year, use next year
  const now = new Date();
  let year = now.getFullYear();
  const provisional = new Date(`${year}-${month}-${day}`);
  if (provisional < now) year += 1;
  return `${year}-${month}-${day}`;
}

/** Convert Niche letter grade to numeric score (1–10 scale) */
function nicheGradeToScore(grade) {
  const map = { 'A+': 10, 'A': 9.3, 'A-': 8.7, 'B+': 8.0, 'B': 7.3, 'B-': 6.7, 'C+': 6.0, 'C': 5.3, 'C-': 4.7, 'D': 3.3 };
  return map[grade?.trim().toUpperCase()] ?? null;
}

/** Derive a slug from a college name for CollegeVine/Niche URLs */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+the\s+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─────────────────────────────────────────────────────────────────────────────
// scraping_logs writer
// ─────────────────────────────────────────────────────────────────────────────
function writeLog(db, { college_id, scrape_type, url_visited, started_at, completed_at, status, fields_updated, error_message, confidence_score }) {
  try {
    db.prepare(`
      INSERT INTO scraping_logs
        (college_id, scrape_type, url_visited, started_at, completed_at,
         status, deadlines_found, changes_detected, error_message, confidence_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      college_id, scrape_type, url_visited,
      started_at, completed_at, status,
      fields_updated || 0, fields_updated || 0,
      error_message || null, confidence_score || null,
    );
  } catch (err) {
    logger.warn('Failed to write scraping_log', { error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step A — Admissions page
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeAdmissions(db, college) {
  const url = college.admissions_url || college.official_website;
  if (!url) return 0;

  const started_at = new Date().toISOString();
  let status = 'failure';
  let fields = 0;
  let errorMsg = null;

  try {
    const res = await rateLimitedFetch(url);
    if (res.status === 404 || res.status === 403) {
      writeLog(db, { college_id: college.id, scrape_type: 'admissions', url_visited: url, started_at, completed_at: new Date().toISOString(), status: 'failure', error_message: `HTTP ${res.status}` });
      return 0;
    }

    const $ = cheerio.load(res.data);
    const text = $('body').text().replace(/\s+/g, ' ');

    // Extract deadlines
    const ed1Date   = extractDateNearKeyword(text, 'Early Decision');
    const eaDate    = extractDateNearKeyword(text, 'Early Action');
    const rdDate    = extractDateNearKeyword(text, 'Regular Decision');
    const transferDate = extractDateNearKeyword(text, 'Transfer');

    // Extract application fee
    const feeMatch = text.match(/\$(\d+)\s*application\s*fee/i) || text.match(/application\s*fee[^$\d]{0,30}\$(\d+)/i);
    const appFee = feeMatch ? parseInt(feeMatch[1], 10) : null;

    // Extract test policy
    let testPolicy = null;
    if (/test[- ]blind/i.test(text)) testPolicy = 'test-blind';
    else if (/test[- ]optional/i.test(text)) testPolicy = 'optional';
    else if (/sat\s*(?:or\s*act\s*)?(?:is\s*)?required/i.test(text)) testPolicy = 'required';
    else if (/act\s*(?:or\s*sat\s*)?(?:is\s*)?required/i.test(text)) testPolicy = 'required';

    // Write to application_deadlines
    const deadlineUpdates = [];
    if (ed1Date && validate('date', ed1Date)) deadlineUpdates.push(['early_decision_1_date', ed1Date]);
    if (eaDate && validate('date', eaDate))   deadlineUpdates.push(['early_action_date', eaDate]);
    if (rdDate && validate('date', rdDate))   deadlineUpdates.push(['regular_decision_date', rdDate]);
    if (transferDate && validate('date', transferDate)) deadlineUpdates.push(['transfer_fall_date', transferDate]);

    if (deadlineUpdates.length > 0 || appFee !== null) {
      // Upsert row
      const existingRow = db.prepare('SELECT id FROM application_deadlines WHERE college_id = ?').get(college.id);
      if (existingRow) {
        for (const [col, val] of deadlineUpdates) {
          db.prepare(`UPDATE application_deadlines SET ${col} = ? WHERE college_id = ?`).run(val, college.id);
        }
        if (appFee !== null) db.prepare('UPDATE application_deadlines SET application_fee = ? WHERE college_id = ?').run(appFee, college.id);
      } else {
        const obj = { college_id: college.id, confidence_score: 0.7 };
        for (const [col, val] of deadlineUpdates) obj[col] = val;
        if (appFee !== null) obj.application_fee = appFee;

        const cols = Object.keys(obj).join(', ');
        const placeholders = Object.keys(obj).map(() => '?').join(', ');
        db.prepare(`INSERT OR IGNORE INTO application_deadlines (${cols}) VALUES (${placeholders})`).run(...Object.values(obj));
      }
      fields += deadlineUpdates.length + (appFee !== null ? 1 : 0);
    }

    // Write test policy to college_requirements
    if (testPolicy) {
      const existing = db.prepare('SELECT id FROM college_requirements WHERE college_id = ?').get(college.id);
      if (existing) {
        db.prepare('UPDATE college_requirements SET test_policy = ? WHERE college_id = ?').run(testPolicy, college.id);
      } else {
        db.prepare('INSERT OR IGNORE INTO college_requirements (college_id, test_policy) VALUES (?, ?)').run(college.id, testPolicy);
      }
      fields++;
    }

    status = fields > 0 ? 'success' : 'partial';
  } catch (err) {
    errorMsg = err.message;
    logger.warn('Admissions scrape error', { college: sanitizeForLog(college.name), error: sanitizeForLog(err.message) });
  }

  writeLog(db, {
    college_id: college.id, scrape_type: 'admissions', url_visited: url,
    started_at, completed_at: new Date().toISOString(),
    status, fields_updated: fields, error_message: errorMsg, confidence_score: 0.70,
  });

  return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step B — Financial aid page
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeFinancial(db, college, compId) {
  if (!compId) return 0;

  // Try several URL patterns to find the financial aid page
  const baseUrl = college.official_website || '';
  const admissionsUrl = college.admissions_url || '';
  const candidates = [];

  if (admissionsUrl) {
    candidates.push(admissionsUrl.replace(/admissions/i, 'financial-aid'));
    candidates.push(admissionsUrl.replace(/admissions/i, 'financial'));
  }
  if (baseUrl) {
    candidates.push(baseUrl.replace(/\/?$/, '/financial-aid'));
    candidates.push(baseUrl.replace(/\/?$/, '/financial-aid/tuition'));
    candidates.push(baseUrl.replace(/\/?$/, '/tuition'));
  }

  let text = null;
  let usedUrl = null;
  const started_at = new Date().toISOString();

  for (const url of candidates) {
    try {
      if (!url || url.includes('undefined')) continue;
      const res = await rateLimitedFetch(url);
      if (res.status === 200 && res.data) {
        const $ = cheerio.load(res.data);
        text = $('body').text().replace(/\s+/g, ' ');
        usedUrl = url;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  if (!text) {
    writeLog(db, {
      college_id: college.id, scrape_type: 'financial', url_visited: candidates[0] || null,
      started_at, completed_at: new Date().toISOString(), status: 'failure',
      error_message: 'No financial aid page found',
    });
    return 0;
  }

  // Extract tuition values
  const tuitionInState  = extractDollarAmount(text, 'in-state tuition') || extractDollarAmount(text, 'resident tuition');
  const tuitionOutState = extractDollarAmount(text, 'out-of-state tuition') || extractDollarAmount(text, 'non-resident tuition') || extractDollarAmount(text, 'tuition');
  const coa             = extractDollarAmount(text, 'cost of attendance') || extractDollarAmount(text, 'total cost');
  const avgAid          = extractDollarAmount(text, 'average award') || extractDollarAmount(text, 'average financial aid') || extractDollarAmount(text, 'average grant');

  // % receiving aid
  const pctMatch = text.match(/(\d{1,3})\s*%\s*(?:of\s*students\s*)?receive(?:d)?\s*(?:financial\s*)?aid/i);
  const pctAid = pctMatch ? parseFloat(pctMatch[1]) : null;

  // Need-blind flag and full-need policy
  const needBlind = /need-blind/i.test(text) ? 1 : null;
  const meetsFullNeed = /meets?\s*100\s*%\s*(?:of\s*)?(?:demonstrated\s*)?need/i.test(text) ? 1 : null;

  // Validate and build update object
  const year = new Date().getFullYear();
  const obj = { college_id: compId, year };
  let fields = 0;

  if (tuitionInState && validate('tuition', tuitionInState)) { obj.tuition_in_state = tuitionInState; fields++; }
  if (tuitionOutState && validate('tuition', tuitionOutState)) { obj.tuition_out_state = tuitionOutState; fields++; }
  if (coa && validate('tuition', coa)) { obj.cost_of_attendance = coa; fields++; }
  if (avgAid && validate('tuition', avgAid)) { obj.avg_financial_aid = avgAid; fields++; }
  if (pctAid !== null) { obj.percent_receiving_aid = pctAid; fields++; }
  if (needBlind !== null) { obj.need_blind_flag = needBlind; fields++; }
  if (meetsFullNeed !== null) { obj.meets_full_need = meetsFullNeed; fields++; }
  obj.source = usedUrl;
  obj.confidence_score = 0.70;

  if (fields > 0) {
    const cols = Object.keys(obj).join(', ');
    const placeholders = Object.keys(obj).map(() => '?').join(', ');
    db.prepare(`INSERT OR REPLACE INTO college_financial_data (${cols}) VALUES (${placeholders})`).run(...Object.values(obj));
  }

  const status = fields > 0 ? 'success' : 'partial';
  writeLog(db, {
    college_id: college.id, scrape_type: 'financial', url_visited: usedUrl,
    started_at, completed_at: new Date().toISOString(), status, fields_updated: fields,
    confidence_score: 0.70,
  });

  return fields;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step C — Common Data Set
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeCDS(db, college, compId) {
  if (!compId) return 0;

  const baseUrl = college.official_website;
  if (!baseUrl) return 0;

  const started_at = new Date().toISOString();

  // Try to find CDS link on the official website
  let cdsUrl = null;
  try {
    const res = await rateLimitedFetch(baseUrl);
    if (res.status === 200) {
      const $ = cheerio.load(res.data);
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (/common[-_]data[-_]set|cds|institutional[-_]research/i.test(href) && !cdsUrl) {
          cdsUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        }
      });
    }
  } catch {
    // ignore, CDS discovery is best-effort
  }

  if (!cdsUrl) {
    writeLog(db, {
      college_id: college.id, scrape_type: 'cds', url_visited: baseUrl,
      started_at, completed_at: new Date().toISOString(), status: 'partial',
      error_message: 'CDS URL not found on website',
    });
    return 0;
  }

  let text = null;
  try {
    const res = await rateLimitedFetch(cdsUrl);
    if (res.status === 200) {
      const $ = cheerio.load(res.data);
      text = $('body').text().replace(/\s+/g, ' ');
    }
  } catch (err) {
    writeLog(db, {
      college_id: college.id, scrape_type: 'cds', url_visited: cdsUrl,
      started_at, completed_at: new Date().toISOString(), status: 'failure',
      error_message: sanitizeForLog(err.message),
    });
    return 0;
  }

  if (!text) return 0;

  let fields = 0;

  // Section C: Test scores
  const satP25 = extractCDSScore(text, 'SAT', '25');
  const satP75 = extractCDSScore(text, 'SAT', '75');
  const actP25 = extractCDSScore(text, 'ACT', '25');
  const actP75 = extractCDSScore(text, 'ACT', '75');

  // Acceptance rate
  const arMatch = text.match(/(?:admission|acceptance)\s*rate[^%\d]{0,30}(\d{1,3}\.?\d*)\s*%/i);
  const acceptanceRate = arMatch ? parseFloat(arMatch[1]) : null;

  // GPA median
  const gpaMatch = text.match(/(?:median|average|mean)\s*(?:high\s*school\s*)?GPA[^0-9.]{0,20}([\d.]{3,5})/i);
  const gpaMedian = gpaMatch ? parseFloat(gpaMatch[1]) : null;

  // Enrollment
  const enrollMatch = text.match(/(?:total\s*enrollment|enrolled)[^0-9]{0,20}([\d,]+)/i);
  const enrollment = enrollMatch ? parseInt(enrollMatch[1].replace(/,/g, ''), 10) : null;

  const statsObj = { college_id: compId, year: new Date().getFullYear(), source: cdsUrl, confidence_score: 0.95 };
  if (satP25 && validate('satScore', satP25)) { statsObj.sat_25 = satP25; fields++; }
  if (satP75 && validate('satScore', satP75)) { statsObj.sat_75 = satP75; fields++; }
  if (actP25 && validate('actScore', actP25)) { statsObj.act_25 = actP25; fields++; }
  if (actP75 && validate('actScore', actP75)) { statsObj.act_75 = actP75; fields++; }
  if (gpaMedian) { statsObj.gpa_50 = gpaMedian; fields++; }

  if (fields > 0) {
    const cols = Object.keys(statsObj).join(', ');
    const phs  = Object.keys(statsObj).map(() => '?').join(', ');
    db.prepare(`INSERT OR REPLACE INTO admitted_student_stats (${cols}) VALUES (${phs})`).run(...Object.values(statsObj));
  }

  // Update acceptance rate on colleges table
  if (acceptanceRate && validate('acceptanceRate', acceptanceRate)) {
    db.prepare('UPDATE colleges SET acceptance_rate = ? WHERE id = ?').run(acceptanceRate / 100, college.id);
    fields++;
  }

  // Update enrollment on colleges_comprehensive
  if (enrollment) {
    db.prepare('UPDATE colleges_comprehensive SET total_enrollment = ? WHERE id = ?').run(enrollment, compId);
    fields++;
  }

  writeLog(db, {
    college_id: college.id, scrape_type: 'cds', url_visited: cdsUrl,
    started_at, completed_at: new Date().toISOString(),
    status: fields > 0 ? 'success' : 'partial',
    fields_updated: fields, confidence_score: 0.95,
  });

  return fields;
}

/** Extract a SAT or ACT percentile score from CDS text */
function extractCDSScore(text, test, percentile) {
  const re = new RegExp(
    `${test}[^\\d]{0,60}${percentile}(?:th|st|nd|rd)?\\s*(?:percentile)?[^\\d]{0,30}(\\d{3,4})`,
    'i'
  );
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step D — CollegeVine public page (essay prompts)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeCollegeVine(db, college) {
  const slug = toSlug(college.name);
  const url = `https://www.collegevine.com/colleges/${slug}`;
  const started_at = new Date().toISOString();

  try {
    const res = await rateLimitedFetch(url, CONFIG.COLLEGEVINE_DELAY_MS);
    if (res.status === 404) {
      writeLog(db, { college_id: college.id, scrape_type: 'collegevine', url_visited: url, started_at, completed_at: new Date().toISOString(), status: 'failure', error_message: 'Page not found' });
      return 0;
    }
    if (res.status === 429) {
      logger.warn('CollegeVine rate-limited', { college: sanitizeForLog(college.name) });
      await sleep(30000); // back off 30s
      writeLog(db, { college_id: college.id, scrape_type: 'collegevine', url_visited: url, started_at, completed_at: new Date().toISOString(), status: 'failure', error_message: 'Rate limited (429)' });
      return 0;
    }

    const $ = cheerio.load(res.data);
    const promptStmt = db.prepare(`
      INSERT OR IGNORE INTO essay_prompts (college_id, prompt_text, word_limit, is_required, prompt_order)
      VALUES (?, ?, ?, 1, ?)
    `);

    let inserted = 0;
    // CollegeVine essay prompt containers typically have class names containing "prompt" or "essay"
    $('[class*="prompt"], [class*="essay"], [class*="supplement"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length < 40 || text.length > 2000) return;

      // Try to extract word limit from text
      const wlMatch = text.match(/(\d+)\s*words?/i);
      const wordLimit = wlMatch ? parseInt(wlMatch[1], 10) : null;

      promptStmt.run(college.id, text.slice(0, 1000), wordLimit, inserted + 1);
      inserted++;
    });

    writeLog(db, {
      college_id: college.id, scrape_type: 'collegevine', url_visited: url,
      started_at, completed_at: new Date().toISOString(),
      status: inserted > 0 ? 'success' : 'partial',
      fields_updated: inserted, confidence_score: 0.60,
    });
    return inserted;
  } catch (err) {
    writeLog(db, {
      college_id: college.id, scrape_type: 'collegevine', url_visited: url,
      started_at, completed_at: new Date().toISOString(), status: 'failure',
      error_message: sanitizeForLog(err.message),
    });
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step E — Niche.com public page (campus_life ratings)
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeNiche(db, college, compId) {
  const slug = toSlug(college.name);
  const url = `https://www.niche.com/colleges/${slug}/`;
  const started_at = new Date().toISOString();

  try {
    const res = await rateLimitedFetch(url);
    if (res.status !== 200) {
      writeLog(db, { college_id: college.id, scrape_type: 'niche', url_visited: url, started_at, completed_at: new Date().toISOString(), status: 'failure', error_message: `HTTP ${res.status}` });
      return 0;
    }

    const $ = cheerio.load(res.data);
    const text = $('body').text().replace(/\s+/g, ' ');

    // Extract letter grades for categories
    const grades = {};
    const gradeRe = /\b(Academics|Campus Life|Professors|Value|Diversity|Athletics|Housing|Food|Parties|Safety)\b[^A-D]{0,40}(A\+|A-|A|B\+|B-|B|C\+|C-|C|D)/gi;
    let m;
    while ((m = gradeRe.exec(text)) !== null) {
      grades[m[1].toLowerCase()] = nicheGradeToScore(m[2]);
    }

    // Extract athletics division
    const divMatch = text.match(/NCAA\s+Division\s+(I{1,3}|1|2|3)\b/i);
    const athleticsDivision = divMatch ? `NCAA Division ${divMatch[1]}` : null;

    // Build update
    const updates = [];
    const params = [];

    if (grades.academics)    { updates.push('student_satisfaction_score = ?'); params.push(grades.academics); }
    if (grades['campus life']){ updates.push('cost_of_living_index = ?'); params.push(grades['campus life']); } // best available mapping
    if (athleticsDivision)   { updates.push('athletics_division = ?'); params.push(athleticsDivision); }

    let fields = updates.length;

    if (compId && fields > 0) {
      params.push(compId);
      db.prepare(`UPDATE campus_life SET ${updates.join(', ')} WHERE college_id = ?`).run(...params);
    }

    writeLog(db, {
      college_id: college.id, scrape_type: 'niche', url_visited: url,
      started_at, completed_at: new Date().toISOString(),
      status: fields > 0 ? 'success' : 'partial',
      fields_updated: fields, confidence_score: 0.65,
    });
    return fields;
  } catch (err) {
    writeLog(db, {
      college_id: college.id, scrape_type: 'niche', url_visited: url,
      started_at, completed_at: new Date().toISOString(), status: 'failure',
      error_message: sanitizeForLog(err.message),
    });
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-college pipeline
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeCollege(db, queueRow) {
  const college = db.prepare('SELECT * FROM colleges WHERE id = ?').get(queueRow.college_id);
  if (!college) {
    logger.warn('College not found for queue row', { queueId: queueRow.id, collegeId: queueRow.college_id });
    return false;
  }

  // Check staleness
  if (college.last_scraped_at) {
    const daysSince = (Date.now() - new Date(college.last_scraped_at).getTime()) / 86400000;
    if (daysSince < CONFIG.STALE_DAYS) {
      logger.info('College recently scraped — skipping', { name: sanitizeForLog(college.name), daysSince: Math.round(daysSince) });
      db.prepare('UPDATE scrape_queue SET status = ? WHERE id = ?').run('completed', queueRow.id);
      return true;
    }
  }

  logger.info('Scraping college', { name: sanitizeForLog(college.name), id: college.id });

  // Find matching colleges_comprehensive id
  const compRow = db.prepare(
    'SELECT id FROM colleges_comprehensive WHERE LOWER(name) = LOWER(?) AND LOWER(country) = LOWER(?) LIMIT 1'
  ).get(college.name, college.country);
  const compId = compRow ? compRow.id : null;

  let totalFields = 0;
  let pipelineError = null;

  try {
    const [admFields, finFields, cdsFields, cvFields, nicheFields] = await Promise.all([
      scrapeAdmissions(db, college).catch(e => { logger.warn('Admissions step failed', { error: sanitizeForLog(e.message) }); return 0; }),
      scrapeFinancial(db, college, compId).catch(e => { logger.warn('Financial step failed', { error: sanitizeForLog(e.message) }); return 0; }),
      scrapeCDS(db, college, compId).catch(e => { logger.warn('CDS step failed', { error: sanitizeForLog(e.message) }); return 0; }),
      scrapeCollegeVine(db, college).catch(e => { logger.warn('CollegeVine step failed', { error: sanitizeForLog(e.message) }); return 0; }),
      scrapeNiche(db, college, compId).catch(e => { logger.warn('Niche step failed', { error: sanitizeForLog(e.message) }); return 0; }),
    ]);
    totalFields = admFields + finFields + cdsFields + cvFields + nicheFields;
  } catch (err) {
    pipelineError = err.message;
    logger.error('Unexpected pipeline error', { college: sanitizeForLog(college.name), error: sanitizeForLog(err.message) });
  }

  // Update last_scraped_at on the colleges row
  db.prepare('UPDATE colleges SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = ?').run(college.id);

  // Update scrape_queue
  const newAttempts = (queueRow.attempts || 0) + 1;
  const success = totalFields > 0 && !pipelineError;
  const newStatus = success
    ? 'completed'
    : newAttempts >= CONFIG.MAX_ATTEMPTS
      ? 'permanently_failed'
      : 'failed';

  db.prepare(`
    UPDATE scrape_queue SET status = ?, attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newStatus, newAttempts, pipelineError || null, queueRow.id);

  logger.info('Finished scraping college', {
    name: sanitizeForLog(college.name),
    status: newStatus,
    fieldsUpdated: totalFields,
  });

  return success;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main batch loop
// ─────────────────────────────────────────────────────────────────────────────
class ScraperService {
  constructor() {
    this.running = false;
  }

  /**
   * Process up to `maxBatches` batches from the queue.
   * Pass Infinity to drain the whole queue.
   */
  async run(maxBatches = Infinity) {
    if (this.running) {
      logger.warn('ScraperService already running');
      return;
    }
    this.running = true;
    const db = dbManager.getDatabase();
    let batchCount = 0;
    let totalProcessed = 0;

    try {
      while (batchCount < maxBatches) {
        const batch = db.prepare(`
          SELECT sq.*
          FROM scrape_queue sq
          WHERE sq.status IN ('pending', 'failed')
            AND sq.attempts < ?
          ORDER BY sq.priority ASC, sq.id ASC
          LIMIT ?
        `).all(CONFIG.MAX_ATTEMPTS, CONFIG.BATCH_SIZE);

        if (batch.length === 0) {
          logger.info('Scrape queue empty — all done');
          break;
        }

        // Mark as in_progress
        const ids = batch.map(r => r.id);
        db.prepare(`UPDATE scrape_queue SET status = 'in_progress' WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);

        // Process concurrently (up to BATCH_SIZE at once)
        const results = await Promise.allSettled(batch.map(row => scrapeCollege(db, row)));
        const succeeded = results.filter(r => r.status === 'fulfilled' && r.value).length;

        totalProcessed += batch.length;
        batchCount++;
        logger.info(`Batch ${batchCount} complete`, { processed: batch.length, succeeded, totalSoFar: totalProcessed });

        await sleep(CONFIG.BATCH_PAUSE_MS);
      }
    } finally {
      this.running = false;
    }

    logger.info('ScraperService run complete', { totalProcessed });
    return { totalProcessed };
  }
}

module.exports = new ScraperService();
