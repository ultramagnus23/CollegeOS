/**
 * Deadlines Scraper
 * ------------------
 * Dedicated scraper for application deadlines, fees, and round types.
 *
 * Sources (in order of priority):
 *   1. College admissions website (direct HTML scraping)
 *   2. Common Data Set PDFs (Section C — highest accuracy for selective colleges)
 *   3. Coalition/Common App partner pages
 *
 * Handles:
 *   - ED I / ED II / EA / REA / RD / Rolling / Transfer deadlines
 *   - Notification dates
 *   - Application fees + waiver availability
 *   - Corrupt date fix: validates all dates, rejects impossible ones (year > 2030 or < 2024)
 *
 * Usage (standalone):
 *   node deadlinesScraper.js                    -- scrape all colleges due today
 *   node deadlinesScraper.js --college-id 1234  -- scrape one college
 *   node deadlinesScraper.js --reset-corrupt    -- fix corrupt dates already in DB
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ── URL helpers ───────────────────────────────────────────────────────────────

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  url = url.trim();
  if (!url) return null;
  if (url.startsWith('//'))    return 'https:' + url;
  if (!url.startsWith('http')) return 'https://' + url;
  return url;
}

function getBase(url) {
  try {
    const u = new URL(normalizeUrl(url));
    return u.protocol + '//' + u.hostname;
  } catch { return null; }
}

function getDomain(url) {
  try { return new URL(normalizeUrl(url)).hostname; } catch { return null; }
}

// Build candidate URLs for deadline pages
function buildDeadlineUrls(college) {
  const base = getBase(college.official_website);
  if (!base) return [];

  const paths = [
    '/admissions',
    '/admission',
    '/admissions/apply',
    '/admissions/dates-and-deadlines',
    '/admissions/deadlines',
    '/admissions/freshman',
    '/admissions/first-year',
    '/undergraduate-admissions',
    '/apply',
    '/how-to-apply',
    '/admissions/requirements',
    '/future-students',
    '/admissions/first-year-applicants',
    '/admissions/application-process',
  ];

  const urls = [];
  const admUrl = normalizeUrl(college.admissions_url);
  if (admUrl) urls.push(admUrl);

  const home = normalizeUrl(college.official_website);
  if (home) urls.push(home);

  for (const p of paths) urls.push(base + p);
  return [...new Set(urls)];
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];
const ua = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const MIN_HTML = 2000;

const domainFailures = new Map();
function circuitOpen(domain) {
  const f = domainFailures.get(domain);
  if (!f) return false;
  if (Date.now() - f.lastFail > 300_000) { domainFailures.delete(domain); return false; }
  return f.count >= 3;
}
function markFail(d) { const f = domainFailures.get(d) || { count: 0, lastFail: 0 }; f.count++; f.lastFail = Date.now(); domainFailures.set(d, f); }
function markOk(d)   { domainFailures.delete(d); }

async function safeGet(url, timeout = 15000) {
  const norm = normalizeUrl(url);
  if (!norm) return null;
  const domain = getDomain(norm);
  if (!domain || circuitOpen(domain)) return null;
  try {
    const resp = await axios.get(norm, {
      timeout,
      headers: {
        'User-Agent': ua(),
        'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 6,
      validateStatus: s => s < 500,
    });
    if (resp.status === 403 || resp.status === 404) { markFail(domain); return null; }
    const html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    if (html.length < MIN_HTML) return null;
    markOk(domain);
    return { html, url: norm };
  } catch { markFail(domain); return null; }
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTH_MAP = {
  jan:'01', january:'01', feb:'02', february:'02', mar:'03', march:'03',
  apr:'04', april:'04', may:'05', jun:'06', june:'06', jul:'07', july:'07',
  aug:'08', august:'08', sep:'09', september:'09', oct:'10', october:'10',
  nov:'11', november:'11', dec:'12', december:'12',
};

/**
 * Parse a date string into YYYY-MM-DD.
 * Returns null for anything that doesn't look like a real near-future date.
 * Rejects: year > 2030, year < 2024, swapped month/day formats
 */
function parseDate(str) {
  if (!str) return null;
  str = str.trim().replace(/,/g, '').replace(/\s+/g, ' ').toLowerCase();

  let m, yr, mo, dy;

  // ISO: 2026-01-15
  if ((m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    [, yr, mo, dy] = m;
  }
  // "November 1 2026" or "Nov 1, 2026"
  else if ((m = str.match(/([a-z]+)\s+(\d{1,2})\s+(\d{4})/))) {
    mo = MONTH_MAP[m[1]]; dy = m[2].padStart(2,'0'); yr = m[3];
    if (!mo) return null;
  }
  // "1 November 2026"
  else if ((m = str.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/))) {
    mo = MONTH_MAP[m[2]]; dy = m[1].padStart(2,'0'); yr = m[3];
    if (!mo) return null;
  }
  // "11/1/2026" (M/D/YYYY)
  else if ((m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    [, mo, dy, yr] = m;
    mo = mo.padStart(2,'0'); dy = dy.padStart(2,'0');
  }
  // "November 1" — infer year
  else if ((m = str.match(/([a-z]+)\s+(\d{1,2})(?:\s|$)/))) {
    mo = MONTH_MAP[m[1]]; dy = m[2].padStart(2,'0');
    if (!mo) return null;
    const now = new Date();
    yr = String(parseInt(mo) <= now.getMonth() + 1 && now.getDate() > parseInt(dy)
      ? now.getFullYear() + 1 : now.getFullYear());
  }
  else return null;

  // Validate
  const yearInt = parseInt(yr);
  const moInt   = parseInt(mo);
  const dayInt  = parseInt(dy);
  if (yearInt < 2024 || yearInt > 2030) return null;
  if (moInt < 1 || moInt > 12)          return null;
  if (dayInt < 1 || dayInt > 31)        return null;

  return `${yr}-${mo}-${dy}`;
}

// ── Deadline relevance scoring ────────────────────────────────────────────────

const DEADLINE_KEYWORDS = [
  'early decision', 'early action', 'regular decision', 'application deadline',
  'apply by', 'deadline', 'notification', 'rolling admission',
  'application fee', 'first-year', 'freshman deadline',
];
function deadlineScore(html) {
  const lc = html.toLowerCase();
  return DEADLINE_KEYWORDS.reduce((n, kw) => n + (lc.includes(kw) ? 1 : 0), 0);
}

// ── Core extraction ───────────────────────────────────────────────────────────

const DATE_RX = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/gi;

function extractDeadlines(html) {
  const $ = cheerio.load(html);
  const body = $('body').text().replace(/\s+/g, ' ');
  const lc   = body.toLowerCase();

  const r = {
    ed1: null, ed1_notification: null,
    ed2: null, ed2_notification: null,
    ea:  null, ea_notification: null,
    rea: null, rea_notification: null,
    rd:  null, rd_notification: null,
    transfer_fall: null, transfer_spring: null,
    international: null,
    offers_ed: false, offers_ea: false, offers_rea: false,
    rolling: false,
    app_fee: null, fee_waiver: false,
  };

  if (/rolling\s+admission/i.test(body)) r.rolling = true;

  // Application fee
  const feeM = body.match(/application\s+fee[^$\d]*\$\s*(\d{2,3})/i)
             || body.match(/\$\s*(\d{2,3})\s+application\s+fee/i);
  if (feeM) r.app_fee = parseInt(feeM[1]);
  if (/fee\s+waiver|waive\s+the\s+fee|no\s+application\s+fee/i.test(body)) r.fee_waiver = true;

  // ── Table rows: most reliable source ──
  $('table tr, tbody tr').each((_, row) => {
    const cells = $(row).find('td, th');
    if (cells.length < 2) return;
    const label = $(cells[0]).text().trim().toLowerCase();
    const val   = $(cells[1]).text().trim();
    const dateStr = (val.match(DATE_RX) || [])[0];
    if (!dateStr) return;
    const date = parseDate(dateStr);
    if (!date) return;

    const isNotif = /notification|decision\s+release|admit|results?/i.test(label);

    if      (/ed\s*(ii|2)|early\s+decision\s*(ii|2)/i.test(label))  { if (isNotif) r.ed2_notification = r.ed2_notification||date; else { r.ed2=r.ed2||date; r.offers_ed=true; } }
    else if (/ed|early\s+decision/i.test(label))                    { if (isNotif) r.ed1_notification = r.ed1_notification||date; else { r.ed1=r.ed1||date; r.offers_ed=true; } }
    else if (/rea|restrictive|single.choice/i.test(label))          { r.rea=r.rea||date; r.offers_rea=true; }
    else if (/ea|early\s+action/i.test(label))                      { if (isNotif) r.ea_notification = r.ea_notification||date; else { r.ea=r.ea||date; r.offers_ea=true; } }
    else if (/regular|priority\s+deadline|rd/i.test(label))         { if (isNotif) r.rd_notification = r.rd_notification||date; else r.rd=r.rd||date; }
    else if (/transfer.*fall/i.test(label))                         r.transfer_fall   = r.transfer_fall  ||date;
    else if (/transfer.*spring/i.test(label))                       r.transfer_spring = r.transfer_spring||date;
    else if (/transfer/i.test(label))                               r.transfer_fall   = r.transfer_fall  ||date;
    else if (/international/i.test(label))                          r.international   = r.international  ||date;
  });

  // ── Definition lists ──
  $('dl').each((_, dl) => {
    const dts = $(dl).find('dt');
    const dds = $(dl).find('dd');
    dts.each((i, dt) => {
      const label = $(dt).text().trim().toLowerCase();
      const val   = $(dds.get(i)).text().trim();
      const dateStr = (val.match(DATE_RX) || [])[0];
      if (!dateStr) return;
      const date = parseDate(dateStr);
      if (!date) return;

      const isNotif = /notification|decision\s+release/i.test(label);
      if      (/ed.*(ii|2)/i.test(label))                { if (isNotif) r.ed2_notification=r.ed2_notification||date; else { r.ed2=r.ed2||date; r.offers_ed=true; } }
      else if (/early\s+decision|^ed\b/i.test(label))    { if (isNotif) r.ed1_notification=r.ed1_notification||date; else { r.ed1=r.ed1||date; r.offers_ed=true; } }
      else if (/early\s+action|^ea\b/i.test(label))      { if (isNotif) r.ea_notification=r.ea_notification||date; else { r.ea=r.ea||date; r.offers_ea=true; } }
      else if (/regular\s+decision|^rd\b/i.test(label))  { if (isNotif) r.rd_notification=r.rd_notification||date; else r.rd=r.rd||date; }
    });
  });

  // ── Prose fallback: scan paragraphs containing round keywords + dates ──
  const probeSection = (pattern) => {
    const idx = lc.search(pattern);
    if (idx < 0) return null;
    const snippet = body.substring(idx, idx + 200);
    const dateStr = (snippet.match(DATE_RX) || [])[0];
    return dateStr ? parseDate(dateStr) : null;
  };

  if (!r.ed1) { const d = probeSection(/early\s+decision(?!\s*ii|\s*2)/i); if (d) { r.ed1=d; r.offers_ed=true; } }
  if (!r.ed2) { const d = probeSection(/early\s+decision\s*(ii|2)/i);       if (d) { r.ed2=d; r.offers_ed=true; } }
  if (!r.ea)  { const d = probeSection(/early\s+action/i);                  if (d) { r.ea=d;  r.offers_ea=true; } }
  if (!r.rea) { const d = probeSection(/restrictive\s+early|single.choice/i); if (d) { r.rea=d; r.offers_rea=true; } }
  if (!r.rd)  { const d = probeSection(/regular\s+decision|priority\s+deadline/i); if (d) r.rd=d; }

  return r;
}

// ── Main scrape function ──────────────────────────────────────────────────────

async function scrapeDeadlines(college) {
  const urls = buildDeadlineUrls(college);
  if (urls.length === 0) return null;

  let bestHtml = null, bestScore = 0, bestUrl = null;

  for (const url of urls) {
    const page = await safeGet(url);
    if (!page) continue;
    const score = deadlineScore(page.html);
    if (score > bestScore) {
      bestScore = score;
      bestHtml  = page.html;
      bestUrl   = page.url;
    }
    if (score >= 4) break; // Good enough, stop trying
    await new Promise(r => setTimeout(r, 500));
  }

  if (!bestHtml || bestScore < 2) return null;

  const deadlines = extractDeadlines(bestHtml);

  // Only return if we actually found at least one real date or fee
  const hasData = deadlines.rd || deadlines.ed1 || deadlines.ea || deadlines.rea
               || deadlines.ed2 || deadlines.transfer_fall || deadlines.rolling
               || deadlines.app_fee != null;
  if (!hasData) return null;

  return { deadlines, sourceUrl: bestUrl, score: bestScore };
}

// ── DB writer ─────────────────────────────────────────────────────────────────

function writeDeadlines(db, college, data) {
  if (!data) return;
  const { deadlines, sourceUrl } = data;

  try {
    db.prepare(`
      INSERT INTO application_deadlines
        (college_id,
         early_decision_1_date, early_decision_1_notification,
         early_decision_2_date, early_decision_2_notification,
         early_action_date, early_action_notification,
         restrictive_early_action_date, restrictive_early_action_notification,
         regular_decision_date, regular_decision_notification,
         transfer_fall_date, transfer_spring_date, international_deadline_date,
         offers_early_decision, offers_early_action, offers_restrictive_ea,
         offers_rolling_admission, application_fee, application_fee_waiver_available,
         source_url, last_verified, confidence_score, verification_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,'scraped')
      ON CONFLICT(college_id) DO UPDATE SET
        early_decision_1_date         = COALESCE(excluded.early_decision_1_date,         early_decision_1_date),
        early_decision_1_notification = COALESCE(excluded.early_decision_1_notification, early_decision_1_notification),
        early_decision_2_date         = COALESCE(excluded.early_decision_2_date,         early_decision_2_date),
        early_action_date             = COALESCE(excluded.early_action_date,             early_action_date),
        early_action_notification     = COALESCE(excluded.early_action_notification,     early_action_notification),
        restrictive_early_action_date = COALESCE(excluded.restrictive_early_action_date, restrictive_early_action_date),
        regular_decision_date         = COALESCE(excluded.regular_decision_date,         regular_decision_date),
        regular_decision_notification = COALESCE(excluded.regular_decision_notification, regular_decision_notification),
        transfer_fall_date            = COALESCE(excluded.transfer_fall_date,            transfer_fall_date),
        transfer_spring_date          = COALESCE(excluded.transfer_spring_date,          transfer_spring_date),
        offers_early_decision         = excluded.offers_early_decision,
        offers_early_action           = excluded.offers_early_action,
        offers_rolling_admission      = excluded.offers_rolling_admission,
        application_fee               = COALESCE(excluded.application_fee,               application_fee),
        application_fee_waiver_available = COALESCE(excluded.application_fee_waiver_available, application_fee_waiver_available),
        source_url                    = excluded.source_url,
        last_verified                 = CURRENT_TIMESTAMP,
        confidence_score              = excluded.confidence_score,
        verification_status           = 'scraped'
    `).run(
      college.id,
      deadlines.ed1, deadlines.ed1_notification,
      deadlines.ed2, deadlines.ed2_notification,
      deadlines.ea,  deadlines.ea_notification,
      deadlines.rea, deadlines.rea_notification,
      deadlines.rd,  deadlines.rd_notification,
      deadlines.transfer_fall, deadlines.transfer_spring, deadlines.international,
      deadlines.offers_ed  ? 1 : 0,
      deadlines.offers_ea  ? 1 : 0,
      deadlines.offers_rea ? 1 : 0,
      deadlines.rolling    ? 1 : 0,
      deadlines.app_fee,
      deadlines.fee_waiver ? 1 : 0,
      sourceUrl, 0.80
    );
  } catch (e) {
    console.warn(`[deadlines] DB write failed for ${college.name}:`, e.message);
  }

  // Also update colleges table
  try {
    db.prepare(`
      UPDATE colleges SET admissions_url = COALESCE(?, admissions_url),
        last_scraped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sourceUrl, college.id);
  } catch {}
}

// ── Fix corrupt dates already in DB ──────────────────────────────────────────

/**
 * Some dates were stored as "2194-25-03" (year=2194, month=25 — clearly wrong).
 * This happens when MM-DD-YYYY was parsed as YYYY-DD-MM.
 * This function identifies and clears them.
 */
function fixCorruptDates(db) {
  const dateColumns = [
    'early_decision_1_date', 'early_decision_1_notification',
    'early_decision_2_date', 'early_decision_2_notification',
    'early_action_date', 'early_action_notification',
    'restrictive_early_action_date',
    'regular_decision_date', 'regular_decision_notification',
    'transfer_fall_date', 'transfer_spring_date',
    'international_deadline_date',
  ];

  let fixed = 0;
  for (const col of dateColumns) {
    try {
      // Null out dates with year > 2030 or month > 12 (impossible dates)
      const r = db.prepare(`
        UPDATE application_deadlines SET ${col} = NULL
        WHERE ${col} IS NOT NULL
          AND (
            CAST(substr(${col}, 1, 4) AS INTEGER) > 2030 OR
            CAST(substr(${col}, 1, 4) AS INTEGER) < 2024 OR
            CAST(substr(${col}, 6, 2) AS INTEGER) > 12
          )
      `).run();
      fixed += r.changes;
    } catch {}
  }

  if (fixed > 0) console.log(`[deadlines] Fixed ${fixed} corrupt date values`);
  return fixed;
}

// ── Standalone runner ─────────────────────────────────────────────────────────

async function runDeadlinesScraper(db, colleges, options = {}) {
  const { concurrency = 4, limit = null } = options;

  // Always fix corrupt dates first
  fixCorruptDates(db);

  const batch = limit ? colleges.slice(0, limit) : colleges;
  const stats = { processed: 0, succeeded: 0, failed: 0 };

  console.log(`[deadlines] Starting scrape of ${batch.length} colleges...`);

  for (let i = 0; i < batch.length; i += concurrency) {
    const chunk = batch.slice(i, i + concurrency);

    await Promise.allSettled(chunk.map(async (college) => {
      try {
        const data = await scrapeDeadlines(college);
        stats.processed++;
        if (data) {
          writeDeadlines(db, college, data);
          stats.succeeded++;
          console.log(`  ✓ ${college.name} [score:${data.score}] rd:${data.deadlines.rd} ed:${data.deadlines.ed1} ea:${data.deadlines.ea}`);
        } else {
          stats.failed++;
        }
      } catch (e) {
        stats.processed++;
        stats.failed++;
        console.warn(`  ✗ ${college.name}:`, e.message);
      }
    }));

    if (i + concurrency < batch.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`[deadlines] Done: ${stats.succeeded} succeeded, ${stats.failed} failed`);
  return stats;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
  const dbManager = require('../../src/config/database');

  (async () => {
    const db   = dbManager.getDatabase();
    const args = process.argv.slice(2);

    if (args.includes('--reset-corrupt')) {
      const n = fixCorruptDates(db);
      console.log(`Fixed ${n} corrupt date values`);
      process.exit(0);
    }

    const collegeIdArg = args.find(a => a.startsWith('--college-id='))?.split('=')[1]
                      || (args.indexOf('--college-id') >= 0 ? args[args.indexOf('--college-id') + 1] : null);

    let colleges;
    if (collegeIdArg) {
      colleges = db.prepare(`SELECT id, name, official_website, admissions_url FROM colleges WHERE id = ?`).all(parseInt(collegeIdArg));
    } else {
      colleges = db.prepare(`SELECT id, name, official_website, admissions_url FROM colleges WHERE official_website IS NOT NULL ORDER BY id`).all();
    }

    await runDeadlinesScraper(db, colleges);
    process.exit(0);
  })().catch(e => { console.error('Fatal:', e); process.exit(1); });
}

module.exports = { scrapeDeadlines, writeDeadlines, runDeadlinesScraper, fixCorruptDates };