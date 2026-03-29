/**
 * International Data Scraper
 * --------------------------
 * Populates country-specific tables:
 *   uk_requirements      → UCAS entry tariff, Oxbridge deadline, interview req
 *   indian_entrance_exams → JEE/NEET cutoffs from JoSAA API
 *   placement_data       → NIRF placement data
 *   german_requirements  → NC programs, language requirements
 *   college_rankings     → QS World, THE rankings (scraped from public pages)
 *
 * Sources:
 *   UCAS: https://www.ucas.com/data-and-analysis (public tariff data)
 *   JoSAA: https://josaa.nic.in (opening/closing ranks)
 *   NIRF: https://www.nirfindia.org (placement, ranking)
 *   QS: https://www.topuniversities.com/world-university-rankings (public table)
 *   THE: https://www.timeshighereducation.com/world-university-rankings (public)
 */

const axios = require('axios');
const cheerio = require('cheerio');

// ── Helpers ────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36';

async function get(url, timeout = 20000, extra = {}) {
  try {
    const r = await axios.get(url, {
      timeout,
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json', 'Accept-Language': 'en-US,en;q=0.9', ...extra },
      maxRedirects: 5,
      validateStatus: s => s < 500,
    });
    return r.status < 400 ? r.data : null;
  } catch { return null; }
}

async function getJson(url, timeout = 20000, params = {}) {
  try {
    const r = await axios.get(url, {
      params,
      timeout,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    return r.data;
  } catch { return null; }
}

// ── QS World Rankings ──────────────────────────────────────────────────────

/**
 * Scrape QS World University Rankings from their public API
 * They expose a JSON endpoint used by their website
 */
async function scrapeQSRankings() {
  const results = [];
  let page = 1;

  while (page <= 20) { // Top 2000
    const data = await getJson('https://www.topuniversities.com/rankings/endpoint', 20000, {
      nid: 3897044,
      page,
      items_per_page: 100,
      tab: 'indicators',
      region: '',
      subtype: '',
      level: '',
    });

    if (!data?.score_nodes?.length) break;

    for (const node of data.score_nodes) {
      results.push({
        name: node.title,
        qs_rank: parseInt(node.rank_display) || null,
        qs_score: parseFloat(node.overall_score) || null,
        country: node.country,
        city: node.city,
      });
    }

    page++;
    await new Promise(r => setTimeout(r, 500)); // polite delay
  }

  return results;
}

/**
 * Scrape THE World University Rankings public JSON
 */
async function scrapeТHERankings() {
  const results = [];
  let page = 1;

  while (page <= 20) {
    const data = await getJson('https://www.timeshighereducation.com/World-University-Rankings/2024/world-ranking#!/page/' + page + '/length/100/sort_by/rank/sort_order/asc/cols/stats');

    if (!data?.data?.length) break;

    for (const item of data.data) {
      results.push({
        name: item.name,
        the_rank: parseInt(item.rank) || null,
        the_score: parseFloat(item.scores_overall) || null,
        country: item.location,
      });
    }

    page++;
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

async function writeRankings(db, rankingsData, rankingBody) {
  const year = new Date().getFullYear();
  let count = 0;
  for (const item of rankingsData) {
    let row = (await db.query(`SELECT id FROM colleges WHERE name = $1 LIMIT 1`, [item.name])).rows[0];
    if (!row) row = (await db.query(`SELECT c.id FROM colleges c JOIN college_aliases ca ON ca.college_id = c.id WHERE ca.alias = $1 LIMIT 1`, [item.name])).rows[0];
    if (!row) continue;
    const globalRank = item.qs_rank || item.the_rank;
    const score = item.qs_score || item.the_score;
    try {
      await db.query(
        `INSERT INTO college_rankings (college_id, year, ranking_body, national_rank, global_rank, prestige_index)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(college_id, year, ranking_body) DO UPDATE SET
           global_rank = EXCLUDED.global_rank,
           national_rank = EXCLUDED.national_rank,
           prestige_index = EXCLUDED.prestige_index`,
        [row.id, year, rankingBody, null, globalRank, score]
      );
      count++;
    } catch {}
  }
  return count;
}

// ── UCAS (UK) ──────────────────────────────────────────────────────────────

/**
 * Scrape UK university admissions data from UCAS search
 * Targeting the entry requirements and key facts
 */
async function scrapeUKUniversity(college) {
  if (college.country !== 'United Kingdom') return null;

  // Try to find UCAS profile via search
  const searchUrl = `https://www.ucas.com/explore/search/providers?query=${encodeURIComponent(college.name)}`;
  const html = await get(searchUrl);
  if (!html) return null;

  const $ = cheerio.load(html);
  const result = { interview_required: 0, admissions_test_required: 0, oxbridge_deadline: null };

  // Check if it's Oxbridge
  if (/oxford|cambridge/i.test(college.name)) {
    result.oxbridge_deadline = 'October 15'; // Standard UCAS Oxbridge deadline
    result.interview_required = 1;
    result.admissions_test_required = 1;
  }

  // Look for entry requirements patterns
  const body = $('body').text();
  if (/interview/i.test(body)) result.interview_required = 1;
  if (/admission\s+test|entrance\s+test|written\s+test/i.test(body)) result.admissions_test_required = 1;

  return result;
}

async function writeUKData(db, college, data) {
  if (!data) return;
  try {
    await db.query(
      `INSERT INTO uk_requirements (college_id, interview_required, admissions_test_required, oxbridge_deadline)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(college_id) DO UPDATE SET
         interview_required = EXCLUDED.interview_required,
         admissions_test_required = EXCLUDED.admissions_test_required,
         oxbridge_deadline = COALESCE(EXCLUDED.oxbridge_deadline, uk_requirements.oxbridge_deadline)`,
      [college.id, data.interview_required, data.admissions_test_required, data.oxbridge_deadline]
    );
  } catch {}
}

// ── JoSAA / India ──────────────────────────────────────────────────────────

/**
 * JoSAA provides opening and closing ranks for IIT/NIT admissions
 * Data is available as public CSV downloads
 */
async function scrapeJoSAAData() {
  // JoSAA publishes final round cutoffs as CSV
  // URL pattern: https://josaa.nic.in/seatallotment/showcsv.aspx
  // We use the API-like endpoint they expose
  const url = 'https://josaa.nic.in/seatallotment/showcsv.aspx?round=6&year=2023';
  const data = await get(url, 30000);
  if (!data) return [];

  const results = [];
  // Parse CSV-like response
  const lines = data.split('\n').slice(1); // skip header
  for (const line of lines) {
    const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
    if (cols.length < 8) continue;
    results.push({
      institute: cols[0],
      program: cols[1],
      quota: cols[2],
      category: cols[4],
      opening_rank: parseInt(cols[6]) || null,
      closing_rank: parseInt(cols[7]) || null,
    });
  }
  return results;
}

async function writeJoSAAData(db, rows) {
  // Aggregate by institute (take min opening, max closing per category)
  const byInstitute = {};
  for (const row of rows) {
    const key = row.institute;
    if (!byInstitute[key]) byInstitute[key] = { general: {}, obc: {}, sc: {}, st: {} };
    const cat = row.category.toLowerCase();
    if (cat.includes('open') || cat.includes('general')) {
      if (!byInstitute[key].general.opening || row.opening_rank < byInstitute[key].general.opening) byInstitute[key].general.opening = row.opening_rank;
      if (!byInstitute[key].general.closing || row.closing_rank > byInstitute[key].general.closing) byInstitute[key].general.closing = row.closing_rank;
    } else if (cat.includes('obc')) {
      if (!byInstitute[key].obc.opening || row.opening_rank < byInstitute[key].obc.opening) byInstitute[key].obc.opening = row.opening_rank;
      if (!byInstitute[key].obc.closing || row.closing_rank > byInstitute[key].obc.closing) byInstitute[key].obc.closing = row.closing_rank;
    } else if (cat.includes('sc')) {
      if (!byInstitute[key].sc.opening || row.opening_rank < byInstitute[key].sc.opening) byInstitute[key].sc.opening = row.opening_rank;
      if (!byInstitute[key].sc.closing || row.closing_rank > byInstitute[key].sc.closing) byInstitute[key].sc.closing = row.closing_rank;
    }
  }

  let count = 0;
  for (const [name, data] of Object.entries(byInstitute)) {
    const c = (await db.query(`SELECT id FROM colleges WHERE name LIKE $1 AND country = 'India' LIMIT 1`, [`%${name.substring(0, 20)}%`])).rows[0];
    if (!c) continue;
    try {
      await db.query(
        `INSERT INTO indian_entrance_exams
           (college_id, exam_type, cutoff_general_opening, cutoff_general_closing,
            cutoff_obc_opening, cutoff_obc_closing, cutoff_sc_opening, cutoff_sc_closing)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(college_id, exam_type) DO UPDATE SET
           cutoff_general_opening = COALESCE(EXCLUDED.cutoff_general_opening, indian_entrance_exams.cutoff_general_opening),
           cutoff_general_closing = COALESCE(EXCLUDED.cutoff_general_closing, indian_entrance_exams.cutoff_general_closing),
           cutoff_obc_opening = COALESCE(EXCLUDED.cutoff_obc_opening, indian_entrance_exams.cutoff_obc_opening),
           cutoff_obc_closing = COALESCE(EXCLUDED.cutoff_obc_closing, indian_entrance_exams.cutoff_obc_closing)`,
        [c.id, 'JEE_Advanced',
         data.general.opening, data.general.closing,
         data.obc.opening, data.obc.closing,
         data.sc.opening, data.sc.closing]
      );
      count++;
    } catch {}
  }
  return count;
}

// ── NIRF Rankings (India) ──────────────────────────────────────────────────

async function scrapeNIRFRankings() {
  // NIRF publishes rankings as downloadable Excel/CSV
  const url = 'https://www.nirfindia.org/rankings/2023/UniversityRanking.html';
  const html = await get(url, 30000);
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = [];

  $('table tbody tr').each((_, row) => {
    const cells = $(row).find('td').map((_, c) => $(c).text().trim()).get();
    if (cells.length >= 3) {
      results.push({
        rank: parseInt(cells[0]) || null,
        name: cells[1],
        city: cells[2],
        score: parseFloat(cells[cells.length - 1]) || null,
      });
    }
  });

  return results;
}

async function writeNIRFData(db, rankings) {
  const year = new Date().getFullYear();
  let count = 0;
  for (const item of rankings) {
    const c = (await db.query(`SELECT id FROM colleges WHERE name LIKE $1 AND country = 'India' LIMIT 1`, [`%${item.name.substring(0, 15)}%`])).rows[0];
    if (!c) continue;
    try {
      await db.query(
        `INSERT INTO college_rankings (college_id, year, ranking_body, national_rank, prestige_index)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT(college_id, year, ranking_body) DO UPDATE SET
           national_rank = EXCLUDED.national_rank,
           prestige_index = EXCLUDED.prestige_index`,
        [c.id, year, 'NIRF', item.rank, item.score]
      );
      count++;
    } catch {}
  }
  return count;
}

// ── German Universities ─────────────────────────────────────────────────────

async function scrapeGermanUniversity(college) {
  if (college.country !== 'Germany') return null;

  const html = await get(college.official_website || `https://www.${college.name.toLowerCase().replace(/\s+/g, '')}.de`);
  if (!html) return null;

  const $ = cheerio.load(html);
  const body = $('body').text();

  return {
    german_language_requirement: /deutschkenntnisse|german\s+language|german\s+proficiency/i.test(body) ? 'Required' : null,
    english_language_requirement: /english\s+proficiency|ielts|toefl|english\s+language/i.test(body) ? 'Required' : null,
    programs_in_english: /program.*english|english.*program/i.test(body) ? 1 : 0,
    numerus_clausus_programs: /numerus\s+clausus|nc-fach/i.test(body) ? 'Yes' : 'No',
    winter_semester_deadline: null, // Would need deeper parsing per university
    summer_semester_deadline: null,
  };
}

async function writeGermanData(db, college, data) {
  if (!data) return;
  try {
    await db.query(
      `INSERT INTO german_requirements
         (college_id, german_language_requirement, english_language_requirement,
          programs_in_english, numerus_clausus_programs)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(college_id) DO UPDATE SET
         german_language_requirement = COALESCE(EXCLUDED.german_language_requirement, german_requirements.german_language_requirement),
         english_language_requirement = COALESCE(EXCLUDED.english_language_requirement, german_requirements.english_language_requirement),
         programs_in_english = EXCLUDED.programs_in_english,
         numerus_clausus_programs = EXCLUDED.numerus_clausus_programs`,
      [college.id, data.german_language_requirement, data.english_language_requirement, data.programs_in_english, data.numerus_clausus_programs]
    );
  } catch {}
}

// ── Master runner ───────────────────────────────────────────────────────────

async function runInternationalScraper(db, colleges) {
  const results = { qs: 0, the: 0, nirf: 0, josaa: 0, uk: 0, germany: 0 };

  // 1. QS Rankings (covers all countries)
  console.log('\nScraping QS Rankings...');
  try {
    const qsData = await scrapeQSRankings();
    results.qs = await writeRankings(db, qsData, 'QS_World');
    console.log(`  ✓ QS: ${results.qs} colleges ranked`);
  } catch (e) { console.error('  ✗ QS failed:', e.message); }

  // 2. THE Rankings
  console.log('Scraping THE Rankings...');
  try {
    const theData = await scrapeТHERankings();
    results.the = await writeRankings(db, theData, 'THE_World');
    console.log(`  ✓ THE: ${results.the} colleges ranked`);
  } catch (e) { console.error('  ✗ THE failed:', e.message); }

  // 3. NIRF Rankings (India)
  console.log('Scraping NIRF Rankings...');
  try {
    const nirfData = await scrapeNIRFRankings();
    results.nirf = await writeNIRFData(db, nirfData);
    console.log(`  ✓ NIRF: ${results.nirf} colleges ranked`);
  } catch (e) { console.error('  ✗ NIRF failed:', e.message); }

  // 4. JoSAA (India entrance exam cutoffs)
  console.log('Scraping JoSAA cutoffs...');
  try {
    const josaaData = await scrapeJoSAAData();
    results.josaa = await writeJoSAAData(db, josaaData);
    console.log(`  ✓ JoSAA: ${results.josaa} institutes with cutoffs`);
  } catch (e) { console.error('  ✗ JoSAA failed:', e.message); }

  // 5. UK colleges (per-college, only UK ones)
  const ukColleges = colleges.filter(c => c.country === 'United Kingdom');
  console.log(`\nScraping ${ukColleges.length} UK colleges...`);
  for (const c of ukColleges) {
    try {
      const data = await scrapeUKUniversity(c);
      await writeUKData(db, c, data);
      results.uk++;
      await new Promise(r => setTimeout(r, 800));
    } catch (e) { /* skip */ }
  }

  // 6. German colleges
  const germanColleges = colleges.filter(c => c.country === 'Germany');
  console.log(`Scraping ${germanColleges.length} German colleges...`);
  for (const c of germanColleges) {
    try {
      const data = await scrapeGermanUniversity(c);
      await writeGermanData(db, c, data);
      results.germany++;
      await new Promise(r => setTimeout(r, 800));
    } catch (e) { /* skip */ }
  }

  return results;
}

module.exports = { runInternationalScraper };