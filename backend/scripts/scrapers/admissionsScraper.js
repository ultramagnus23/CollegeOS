/**
 * Admissions Website Scraper — v3 (fixed)
 * -----------------------------------------
 * Fixes over v2:
 *   - test_policy values now match DB CHECK constraint:
 *       'required' | 'optional' | 'test-blind' | 'flexible'
 *     (was writing 'test_optional' and 'test_blind' — both wrong)
 *   - All DB writes wrapped in individual try/catch so one bad table
 *     never kills the whole college scrape
 *   - URL normalisation handles every edge case including bare domains
 *   - Puppeteer optional — graceful fallback to axios-only on Windows
 *   - application_requirements.interview_policy uses correct allowed values:
 *       'required' | 'recommended' | 'optional' | 'not_offered'
 *   - Resets failed queue entries that failed only due to CHECK violations
 */

const axios   = require('axios');
const cheerio = require('cheerio');

// ── URL utilities ─────────────────────────────────────────────────────────────

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  url = url.trim();
  if (!url) return null;
  if (url.startsWith('//'))   return 'https:' + url;
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

function buildAdmissionsUrls(college) {
  const base = getBase(college.official_website);
  if (!base) return [];

  const paths = [
    '/admissions',
    '/admission',
    '/apply',
    '/undergraduate-admissions',
    '/undergrad-admissions',
    '/future-students',
    '/admissions/apply',
    '/admissions/freshman',
    '/admissions/undergraduate',
    '/how-to-apply',
    '/prospective-students',
  ];

  const urls = [];
  const admUrl = normalizeUrl(college.admissions_url);
  if (admUrl) urls.push(admUrl);

  const home = normalizeUrl(college.official_website);
  if (home) urls.push(home);

  for (const p of paths) urls.push(base + p);

  return [...new Set(urls)];
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];
const ua = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const MIN_HTML = 3000;

// Circuit breaker per domain
const failures = new Map();
function circuitOpen(domain) {
  const f = failures.get(domain);
  if (!f) return false;
  if (Date.now() - f.lastFailure > 300_000) { failures.delete(domain); return false; }
  return f.count >= 3;
}
function recordFail(d) { const f = failures.get(d) || { count: 0, lastFailure: 0 }; f.count++; f.lastFailure = Date.now(); failures.set(d, f); }
function recordOk(d)   { failures.delete(d); }

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
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      maxRedirects: 6,
      validateStatus: s => s < 500,
    });
    if (resp.status === 403 || resp.status === 404) { recordFail(domain); return null; }
    const html = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    if (html.length < MIN_HTML) return null;
    recordOk(domain);
    return { html, url: norm, method: 'axios' };
  } catch { recordFail(domain); return null; }
}

// ── Puppeteer (optional) ──────────────────────────────────────────────────────

let browser = null;
let puppeteerAvailable = null;

async function getBrowser() {
  if (browser) return browser;
  if (puppeteerAvailable === false) return null;
  try {
    const puppeteer = require('puppeteer-extra');
    const Stealth   = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(Stealth());
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    puppeteerAvailable = true;
    return browser;
  } catch {
    if (puppeteerAvailable === null) console.warn('[admissions] Puppeteer unavailable — axios only');
    puppeteerAvailable = false;
    return null;
  }
}

async function puppeteerGet(url, timeout = 20000) {
  const norm = normalizeUrl(url);
  if (!norm) return null;
  const b = await getBrowser();
  if (!b) return null;
  const page = await b.newPage().catch(() => null);
  if (!page) return null;
  try {
    await page.setUserAgent(ua());
    await page.goto(norm, { waitUntil: 'domcontentloaded', timeout });
    await new Promise(r => setTimeout(r, 1500));
    const html = await page.content();
    if (html.length < MIN_HTML) return null;
    return { html, url: norm, method: 'puppeteer' };
  } catch { return null; }
  finally { await page.close().catch(() => {}); }
}

async function fetchPage(url) {
  return (await safeGet(url)) || (await puppeteerGet(url));
}

// ── Admissions relevance score ────────────────────────────────────────────────

const KEYWORDS = [
  'application deadline', 'apply now', 'how to apply', 'admission requirements',
  'early decision', 'early action', 'regular decision', 'common app',
  'sat', 'act', 'gpa', 'test optional', 'rolling admission',
  'application fee', 'transfer', 'freshman', 'first-year',
];
function admissionsScore(html) {
  const lc = html.toLowerCase();
  return KEYWORDS.reduce((n, kw) => n + (lc.includes(kw) ? 1 : 0), 0);
}

// ── Date parsing ──────────────────────────────────────────────────────────────

const MONTHS = {
  jan:'01', january:'01', feb:'02', february:'02', mar:'03', march:'03',
  apr:'04', april:'04', may:'05', jun:'06', june:'06', jul:'07', july:'07',
  aug:'08', august:'08', sep:'09', september:'09', oct:'10', october:'10',
  nov:'11', november:'11', dec:'12', december:'12',
};

function parseDate(str) {
  if (!str) return null;
  str = str.replace(/\s+/g, ' ').trim().toLowerCase().replace(/,/g, '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  let m;
  if ((m = str.match(/([a-z]+)\s+(\d{1,2})\s+(\d{4})/))) {
    const mo = MONTHS[m[1]]; if (!mo) return null;
    return `${m[3]}-${mo}-${m[2].padStart(2, '0')}`;
  }
  if ((m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)))
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if ((m = str.match(/([a-z]+)\s+(\d{1,2})(?:\s|$)/))) {
    const mo = MONTHS[m[1]]; if (!mo) return null;
    const now = new Date();
    const yr = parseInt(mo) <= now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
    return `${yr}-${mo}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

// ── Data extraction ───────────────────────────────────────────────────────────

function extractDeadlines(html) {
  const $ = cheerio.load(html);
  const body = $('body').text();

  const r = {
    ed1: null, ed1_notification: null,
    ed2: null, ed2_notification: null,
    ea:  null, ea_notification:  null,
    rea: null,
    rd:  null, rd_notification:  null,
    transfer_fall: null, transfer_spring: null,
    international: null,
    offers_ed: false, offers_ea: false, offers_rea: false,
    rolling: false,
    app_fee: null, fee_waiver: false,
  };

  if (/rolling\s+admission/i.test(body))  r.rolling = true;
  const feeM = body.match(/application\s+fee[^$\d]*\$\s*(\d{2,3})/i);
  if (feeM) r.app_fee = parseInt(feeM[1]);
  if (/fee\s+waiver/i.test(body)) r.fee_waiver = true;

  const DATE_RX = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?|\d{1,2}\/\d{1,2}\/\d{4}/i;

  $('table tr, dl, .deadline, [class*="deadline"], [class*="date"], [class*="apply"]').each((_, el) => {
    const text = $(el).text().trim();
    const lc   = text.toLowerCase();
    const dateStr = (text.match(DATE_RX) || [])[0];
    if (!dateStr) return;
    const date = parseDate(dateStr);
    if (!date) return;

    const isNotif = /notification|decision\s+release|admit/i.test(lc);

    if (/early\s+decision\s*(ii|2|two)/i.test(lc)) {
      if (isNotif) r.ed2_notification = r.ed2_notification || date;
      else         { r.ed2 = r.ed2 || date; }
    } else if (/early\s+decision/i.test(lc)) {
      if (isNotif) r.ed1_notification = r.ed1_notification || date;
      else         { r.ed1 = r.ed1 || date; r.offers_ed = true; }
    } else if (/restrictive|single[\s-]choice/i.test(lc)) {
      r.rea = r.rea || date; r.offers_rea = true;
    } else if (/early\s+action/i.test(lc)) {
      if (isNotif) r.ea_notification = r.ea_notification || date;
      else         { r.ea = r.ea || date; r.offers_ea = true; }
    } else if (/regular\s+decision|priority\s+deadline/i.test(lc)) {
      if (isNotif) r.rd_notification = r.rd_notification || date;
      else         r.rd = r.rd || date;
    } else if (/transfer.*fall/i.test(lc))   r.transfer_fall   = r.transfer_fall   || date;
    else if (/transfer.*spring/i.test(lc))   r.transfer_spring = r.transfer_spring || date;
    else if (/international/i.test(lc))      r.international   = r.international   || date;
  });

  // Prose fallbacks
  const findNear = (rx) => {
    const m = body.match(new RegExp(rx.source + '[^.\\n]{0,80}?' + DATE_RX.source, 'i'));
    return m ? parseDate(m[0].match(DATE_RX)?.[0]) : null;
  };
  if (!r.rd)  r.rd  = findNear(/regular\s+decision/);
  if (!r.ea)  { const d = findNear(/early\s+action/);  if (d) { r.ea  = d; r.offers_ea  = true; } }
  if (!r.ed1) { const d = findNear(/early\s+decision/); if (d) { r.ed1 = d; r.offers_ed = true; } }

  return r;
}

function extractRequirements(html) {
  const $ = cheerio.load(html);
  const body = $('body').text();

  // ── test_policy must be exactly one of: 'required' | 'optional' | 'test-blind' | 'flexible'
  let test_policy = 'optional'; // safe default — matches CHECK constraint
  if      (/test[\s-]blind/i.test(body))                                                  test_policy = 'test-blind';
  else if (/test[\s-]optional|testing\s+optional/i.test(body))                           test_policy = 'optional';
  else if (/sat\s*(or|and)\s*act\s+(?:is\s+)?required|standardized\s+testing\s+required/i.test(body)) test_policy = 'required';
  else if (/flexible.*test|test.*flexible/i.test(body))                                  test_policy = 'flexible';

  const r = {
    test_policy,
    sat_required:    test_policy === 'required',
    act_required:    test_policy === 'required',
    common_app:      /common\s+app(?:lication)?/i.test(body),
    coalition_app:   /coalition\s+app(?:lication)?/i.test(body),
    questbridge:     /questbridge/i.test(body),
    supplemental_essays_count: null,
    interview_offered:  false,
    interview_required: false,
    portfolio_required: false,
    teacher_recs_required:    null,
    counselor_rec_required:   false,
    peer_rec_required:        false,
    demonstrated_interest:    false,
    toefl_minimum:  null,
    ielts_minimum:  null,
    duolingo_minimum: null,
    css_profile:    /css\s+profile/i.test(body),
    fafsa_required: /fafsa/i.test(body),
    english_years:  null,
    math_years:     null,
    science_years:  null,
    lab_science_years: null,
    social_studies_years: null,
    foreign_language_years: null,
    calculus_required: false,
  };

  // Supplemental essays
  const essM = body.match(/(\d+)\s+(?:required\s+)?supplemental\s+essay/i)
            || body.match(/(\d+)\s+short\s+(?:answer|essay)/i);
  if (essM) r.supplemental_essays_count = parseInt(essM[1]);

  // Interviews
  if (/interview\s+(?:is\s+)?required/i.test(body))                               { r.interview_offered = true; r.interview_required = true; }
  else if (/interview\s+(?:offered|available|optional|recommended)/i.test(body))  r.interview_offered = true;

  // Recs
  const recM = body.match(/(\d+)\s+(?:teacher|instructor|academic)\s+recommendation/i);
  if (recM)                               r.teacher_recs_required = parseInt(recM[1]);
  else if (/two\s+teacher/i.test(body))   r.teacher_recs_required = 2;
  if (/counselor\s+recommendation|school\s+report/i.test(body)) r.counselor_rec_required = true;
  if (/peer\s+recommendation/i.test(body))                       r.peer_rec_required = true;
  if (/demonstrated\s+interest/i.test(body))                     r.demonstrated_interest = true;

  // English proficiency
  const toeflM = body.match(/toefl[^\d]*?(\d{2,3})/i);
  if (toeflM) r.toefl_minimum = parseInt(toeflM[1]);
  const ieltsM = body.match(/ielts[^\d]*?(\d(?:\.\d)?)/i);
  if (ieltsM) r.ielts_minimum = parseFloat(ieltsM[1]);
  const duoM = body.match(/duolingo[^\d]*?(\d{2,3})/i);
  if (duoM) r.duolingo_minimum = parseInt(duoM[1]);

  // Course requirements
  const courses = [
    [/(\d)\s*years?\s*of\s*english/i,                             'english_years'],
    [/(\d)\s*years?\s*of\s*math(?:ematics)?/i,                   'math_years'],
    [/(\d)\s*years?\s*of\s*science/i,                            'science_years'],
    [/(\d)\s*years?\s*of\s*lab(?:oratory)?\s*science/i,          'lab_science_years'],
    [/(\d)\s*years?\s*of\s*(?:social\s*studies|history)/i,       'social_studies_years'],
    [/(\d)\s*years?\s*of\s*(?:foreign|world|modern)\s*language/i,'foreign_language_years'],
  ];
  for (const [rx, field] of courses) {
    const m = body.match(rx);
    if (m) r[field] = parseInt(m[1]);
  }
  if (/calculus\s+(?:is\s+)?required/i.test(body)) r.calculus_required = true;

  return r;
}

function extractEssayPrompts(html, collegeId) {
  const $ = cheerio.load(html);
  const prompts = [];
  const seen = new Set();

  $('p, li, blockquote, .prompt, [class*="prompt"], [class*="essay"], [class*="question"]').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text.length < 30 || text.length > 700) return;
    if (!/[?]|(describe|explain|tell us|discuss|share|reflect|why|what|how)\b/i.test(text)) return;
    if (seen.has(text)) return;
    seen.add(text);
    const wlM = text.match(/\b(\d{2,4})\s*words?\b/i);
    prompts.push({
      college_id: collegeId,
      prompt_text: text,
      word_limit: wlM ? parseInt(wlM[1]) : null,
      is_required: true,
      prompt_order: prompts.length + 1,
    });
    if (prompts.length >= 8) return false;
  });

  return prompts;
}

// ── Main scrape ───────────────────────────────────────────────────────────────

async function scrapeAdmissionsPage(college) {
  const urls = buildAdmissionsUrls(college);
  if (urls.length === 0) return null;

  let best = null, bestScore = 0;

  for (const url of urls) {
    const page = await fetchPage(url);
    if (!page) continue;
    const score = admissionsScore(page.html);
    if (score > bestScore) { bestScore = score; best = page; }
    if (score >= 5) break;
    await new Promise(r => setTimeout(r, 400));
  }

  if (!best || bestScore < 2) return null;

  return {
    sourceUrl:    best.url,
    method:       best.method,
    score:        bestScore,
    deadlines:    extractDeadlines(best.html),
    requirements: extractRequirements(best.html),
    essayPrompts: extractEssayPrompts(best.html, college.id),
  };
}

// ── DB writers ────────────────────────────────────────────────────────────────

async function writeAdmissionsData(db, college, data) {
  if (!data) return;
  const { deadlines, requirements, essayPrompts } = data;

  // application_deadlines
  try {
    await db.query(
      `INSERT INTO application_deadlines
        (college_id,
         early_decision_1_date, early_decision_1_notification,
         early_decision_2_date, early_decision_2_notification,
         early_action_date, early_action_notification,
         restrictive_early_action_date,
         regular_decision_date, regular_decision_notification,
         transfer_fall_date, transfer_spring_date, international_deadline_date,
         offers_early_decision, offers_early_action, offers_restrictive_ea,
         offers_rolling_admission, application_fee, application_fee_waiver_available,
         source_url, last_verified, confidence_score, verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,CURRENT_TIMESTAMP,$21,'scraped')
       ON CONFLICT(college_id) DO UPDATE SET
         early_decision_1_date    = COALESCE(EXCLUDED.early_decision_1_date,    application_deadlines.early_decision_1_date),
         early_decision_2_date    = COALESCE(EXCLUDED.early_decision_2_date,    application_deadlines.early_decision_2_date),
         early_action_date        = COALESCE(EXCLUDED.early_action_date,        application_deadlines.early_action_date),
         regular_decision_date    = COALESCE(EXCLUDED.regular_decision_date,    application_deadlines.regular_decision_date),
         transfer_fall_date       = COALESCE(EXCLUDED.transfer_fall_date,       application_deadlines.transfer_fall_date),
         offers_early_decision    = EXCLUDED.offers_early_decision,
         offers_early_action      = EXCLUDED.offers_early_action,
         offers_rolling_admission = EXCLUDED.offers_rolling_admission,
         application_fee          = COALESCE(EXCLUDED.application_fee,          application_deadlines.application_fee),
         source_url               = EXCLUDED.source_url,
         last_verified            = CURRENT_TIMESTAMP,
         confidence_score         = EXCLUDED.confidence_score,
         verification_status      = 'scraped'`,
      [
        college.id,
        deadlines.ed1, deadlines.ed1_notification,
        deadlines.ed2, deadlines.ed2_notification,
        deadlines.ea,  deadlines.ea_notification,
        deadlines.rea,
        deadlines.rd,  deadlines.rd_notification,
        deadlines.transfer_fall, deadlines.transfer_spring, deadlines.international,
        deadlines.offers_ed  ? 1 : 0,
        deadlines.offers_ea  ? 1 : 0,
        deadlines.offers_rea ? 1 : 0,
        deadlines.rolling    ? 1 : 0,
        deadlines.app_fee, deadlines.fee_waiver ? 1 : 0,
        data.sourceUrl, 0.75,
      ]
    );
  } catch (e) { console.warn(`[admissions] deadline write failed for ${college.name}:`, e.message); }

  // college_requirements
  // test_policy CHECK: 'required' | 'optional' | 'test-blind' | 'flexible'
  try {
    await db.query(
      `INSERT INTO college_requirements
        (college_id, test_policy, sat_required, act_required,
         common_app_essay_required, supplemental_essays_count,
         teacher_recommendations_required, counselor_recommendation_required,
         peer_recommendation_required, interview_offered, interview_required,
         portfolio_required, demonstrated_interest_considered,
         toefl_required_international, toefl_minimum_score,
         ielts_required_international, ielts_minimum_score,
         source_url, last_verified, confidence_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,CURRENT_TIMESTAMP,$19)
       ON CONFLICT(college_id) DO UPDATE SET
         test_policy                   = COALESCE(EXCLUDED.test_policy,                   college_requirements.test_policy),
         sat_required                  = EXCLUDED.sat_required,
         act_required                  = EXCLUDED.act_required,
         supplemental_essays_count     = COALESCE(EXCLUDED.supplemental_essays_count,     college_requirements.supplemental_essays_count),
         interview_offered             = EXCLUDED.interview_offered,
         interview_required            = EXCLUDED.interview_required,
         toefl_minimum_score           = COALESCE(EXCLUDED.toefl_minimum_score,           college_requirements.toefl_minimum_score),
         ielts_minimum_score           = COALESCE(EXCLUDED.ielts_minimum_score,           college_requirements.ielts_minimum_score),
         last_verified                 = CURRENT_TIMESTAMP,
         confidence_score              = EXCLUDED.confidence_score`,
      [
        college.id,
        requirements.test_policy,
        requirements.sat_required    ? 1 : 0,
        requirements.act_required    ? 1 : 0,
        1,
        requirements.supplemental_essays_count,
        requirements.teacher_recs_required,
        requirements.counselor_rec_required  ? 1 : 0,
        requirements.peer_rec_required       ? 1 : 0,
        requirements.interview_offered       ? 1 : 0,
        requirements.interview_required      ? 1 : 0,
        requirements.portfolio_required      ? 1 : 0,
        requirements.demonstrated_interest   ? 1 : 0,
        requirements.toefl_minimum           ? 1 : 0,
        requirements.toefl_minimum,
        requirements.ielts_minimum           ? 1 : 0,
        requirements.ielts_minimum,
        data.sourceUrl, 0.70,
      ]
    );
  } catch (e) { console.warn(`[admissions] requirements write failed for ${college.name}:`, e.message); }

  // course_requirements
  try {
    await db.query(
      `INSERT INTO course_requirements
        (college_id, english_years_required, math_years_required,
         science_years_required, lab_science_years_required,
         social_studies_years_required, foreign_language_years_required,
         calculus_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(college_id) DO UPDATE SET
         english_years_required          = COALESCE(EXCLUDED.english_years_required,          course_requirements.english_years_required),
         math_years_required             = COALESCE(EXCLUDED.math_years_required,             course_requirements.math_years_required),
         science_years_required          = COALESCE(EXCLUDED.science_years_required,          course_requirements.science_years_required),
         lab_science_years_required      = COALESCE(EXCLUDED.lab_science_years_required,      course_requirements.lab_science_years_required),
         social_studies_years_required   = COALESCE(EXCLUDED.social_studies_years_required,   course_requirements.social_studies_years_required),
         foreign_language_years_required = COALESCE(EXCLUDED.foreign_language_years_required, course_requirements.foreign_language_years_required),
         calculus_required               = EXCLUDED.calculus_required`,
      [
        college.id,
        requirements.english_years, requirements.math_years,
        requirements.science_years, requirements.lab_science_years,
        requirements.social_studies_years, requirements.foreign_language_years,
        requirements.calculus_required ? 1 : 0,
      ]
    );
  } catch (e) { console.warn(`[admissions] course_requirements write failed for ${college.name}:`, e.message); }

  // application_requirements
  // interview_policy CHECK: 'required' | 'recommended' | 'optional' | 'not_offered'
  try {
    const interviewPolicy = requirements.interview_required ? 'required'
      : requirements.interview_offered ? 'optional'
      : 'not_offered';

    await db.query(
      `INSERT INTO application_requirements
        (college_id, common_app_accepted, coalition_app_accepted, questbridge_accepted,
         supplemental_essays_required, supplemental_essay_count,
         interview_policy,
         toefl_minimum, ielts_minimum, duolingo_minimum,
         demonstrated_interest_tracked,
         application_fee, fee_waiver_available,
         css_profile_required,
         source, confidence_score)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT(college_id) DO UPDATE SET
         common_app_accepted      = EXCLUDED.common_app_accepted,
         coalition_app_accepted   = EXCLUDED.coalition_app_accepted,
         questbridge_accepted     = EXCLUDED.questbridge_accepted,
         supplemental_essay_count = COALESCE(EXCLUDED.supplemental_essay_count, application_requirements.supplemental_essay_count),
         interview_policy         = EXCLUDED.interview_policy,
         toefl_minimum            = COALESCE(EXCLUDED.toefl_minimum,            application_requirements.toefl_minimum),
         ielts_minimum            = COALESCE(EXCLUDED.ielts_minimum,            application_requirements.ielts_minimum),
         application_fee          = COALESCE(EXCLUDED.application_fee,          application_requirements.application_fee),
         source                   = EXCLUDED.source,
         confidence_score         = EXCLUDED.confidence_score`,
      [
        college.id,
        requirements.common_app    ? 1 : 0,
        requirements.coalition_app ? 1 : 0,
        requirements.questbridge   ? 1 : 0,
        requirements.supplemental_essays_count ? 1 : 0,
        requirements.supplemental_essays_count,
        interviewPolicy,
        requirements.toefl_minimum, requirements.ielts_minimum, requirements.duolingo_minimum,
        requirements.demonstrated_interest ? 1 : 0,
        deadlines.app_fee, deadlines.fee_waiver ? 1 : 0,
        requirements.css_profile ? 1 : 0,
        data.sourceUrl, 0.70,
      ]
    );
  } catch (e) { console.warn(`[admissions] application_requirements write failed for ${college.name}:`, e.message); }

  // essay_prompts
  if (essayPrompts.length > 0) {
    try {
      await db.query(`DELETE FROM essay_prompts WHERE college_id = $1`, [college.id]);
      for (const p of essayPrompts) {
        await db.query(
          `INSERT INTO essay_prompts (college_id, prompt_text, word_limit, is_required, prompt_order)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [p.college_id, p.prompt_text, p.word_limit, p.is_required ? 1 : 0, p.prompt_order]
        );
      }
    } catch (e) { console.warn(`[admissions] essay_prompts write failed for ${college.name}:`, e.message); }
  }

  // Update main colleges table
  try {
    await db.query(
      `UPDATE colleges SET
        admissions_url  = COALESCE($1, admissions_url),
        last_scraped_at = CURRENT_TIMESTAMP,
        updated_at      = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [data.sourceUrl, college.id]
    );
  } catch { /* non-critical */ }
}

// ── One-time data fixes (call once on startup) ────────────────────────────────

/**
 * Fix broken URLs and reset failed queue entries caused by CHECK constraint errors.
 * Safe to call every startup — no-op if already clean.
 */
async function runStartupFixes(db) {
  // Fix missing https:// prefix on all URL columns
  const urlFix = await db.query(
    `UPDATE colleges
     SET official_website = 'https://' || official_website
     WHERE official_website IS NOT NULL
       AND official_website != ''
       AND official_website NOT LIKE 'http%'`
  );
  if (urlFix.rowCount > 0) console.log(`[admissions] Fixed ${urlFix.rowCount} broken URLs`);

  // Reset queue entries that failed only due to CHECK constraint (not genuinely dead)
  const queueFix = await db.query(
    `UPDATE scrape_queue
     SET status = 'pending', attempts = 0, last_error = NULL
     WHERE status = 'failed'
       AND last_error LIKE '%CHECK constraint%'`
  );
  if (queueFix.rowCount > 0) console.log(`[admissions] Reset ${queueFix.rowCount} CHECK-failed queue entries for retry`);

  // Null out tuition_international where it equals tuition_out_state
  const tuitFix = await db.query(
    `UPDATE college_financial_data
     SET tuition_international = NULL
     WHERE tuition_international = tuition_out_state
       AND tuition_international IS NOT NULL`
  );
  if (tuitFix.rowCount > 0) console.log(`[admissions] Cleared ${tuitFix.rowCount} wrongly-copied tuition_international values`);
}

async function closeBrowser() {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
}

module.exports = { scrapeAdmissionsPage, writeAdmissionsData, runStartupFixes, closeBrowser };