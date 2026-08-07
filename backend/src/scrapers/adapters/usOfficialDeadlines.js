'use strict';

// ============================================================================
// US official-source undergraduate deadline adapter.
//
// Sourcing posture: PRIMARY SOURCES ONLY. For each target we fetch the
// university's OWN admissions/deadlines page live and read the deadline date
// straight out of the page text. The date is NEVER hardcoded here — it is the
// regex-captured value from the fetched HTML. If a page doesn't load, or no date
// can be confidently extracted next to a deadline anchor, the row is SKIPPED
// (never fabricated), per the scraper framework contract.
//
// Each emitted row carries full provenance: source_url (the official page),
// source_type='official', last_verified, confidence_score, and the matched
// snippet in raw_payload/parser_trace so any date is auditable back to the page.
// ============================================================================

const { getCurrentCycle, yearForMonthInCycle } = require('../admissionsCycle');

const PARSER_NAME = 'usOfficialDeadlines';
const PARSER_VERSION = '1.1.0';

// Application cycle this run targets, derived from the clock at run time — NOT
// hardcoded. A hardcoded cycle silently expires: the scraper keeps running green
// while stamping freshly-scraped dates into a cycle that has already closed, so
// the app ends up with zero future deadlines and no failing signal anywhere.
// See backend/src/scrapers/admissionsCycle.js.

// Targets: canonical_name (for institution_id lookup) + official deadlines page.
// No dates here — those are read from the live page. Each target below has been
// verified to (a) load (HTTP 200), (b) expose deadline dates inline in the HTML,
// and (c) extract the CORRECT dates (checked against the page on 2026-06-21).
//
// Adding a target is deliberate, per-school work: many .edu admissions pages are
// JS-rendered SPAs (no dates in raw HTML), return 403 to bots, or move their URLs,
// so a date cannot be extracted reliably without per-school verification. Schools
// that don't parse are SKIPPED at runtime (never fabricated). Known-unparseable as
// of 2026-06-21: Stanford/Rice/Vanderbilt/GA Tech/Boston College (JS-rendered),
// Columbia/Williams/Wellesley (403 bot-block).
const TARGETS = [
  { name: 'Massachusetts Institute of Technology', url: 'https://mitadmissions.org/apply/firstyear/deadlines-requirements/' },
  { name: 'University of Notre Dame', url: 'https://admissions.nd.edu/apply/' },
  { name: 'University of Pennsylvania', url: 'https://admissions.upenn.edu/how-to-apply/first-year-applicants/application-requirements' },
  { name: 'Case Western Reserve University', url: 'https://case.edu/admission/apply' },
  { name: 'Rensselaer Polytechnic Institute', url: 'https://admissions.rpi.edu/undergraduate/apply' },
  { name: 'Princeton University', url: 'https://admission.princeton.edu/apply' },
  { name: 'Yale University', url: 'https://admissions.yale.edu/apply' },
  { name: 'The University of Texas at Austin', url: 'https://admissions.utexas.edu/apply/freshman' },
  { name: 'University of Virginia-Main Campus', url: 'https://admission.virginia.edu/apply' },
  { name: 'Tufts University', url: 'https://admissions.tufts.edu/apply' },
  { name: 'Pennsylvania State University-Main Campus', url: 'https://admissions.psu.edu/apply' },
  { name: 'University of Georgia', url: 'https://admissions.uga.edu' },
  { name: 'University of Maryland-College Park', url: 'https://admissions.umd.edu' },
  { name: 'Wake Forest University', url: 'https://admissions.wfu.edu/apply' },
  { name: 'Lehigh University', url: 'https://admissions.lehigh.edu/apply' },
  { name: 'Pomona College', url: 'https://www.pomona.edu/how-to-apply' },
  { name: 'Davidson College', url: 'https://www.davidson.edu/apply' },
  { name: 'Colgate University', url: 'https://www.colgate.edu/apply' },
  { name: 'Vassar College', url: 'https://www.vassar.edu/apply' },
  { name: 'Bates College', url: 'https://www.bates.edu/apply' },
  { name: 'Rutgers University-New Brunswick', url: 'https://admissions.rutgers.edu/apply' },
  { name: 'University of Iowa', url: 'https://admissions.uiowa.edu/apply' },
  { name: 'Loyola Marymount University', url: 'https://admission.lmu.edu/apply' },
  { name: 'Carnegie Mellon University', url: 'https://admission.enrollment.cmu.edu/admission/apply' },
  { name: 'Boston University', url: 'https://www.bu.edu/admissions/apply' },
  { name: 'Emory University', url: 'https://apply.emory.edu/apply' },
  { name: 'Elon University', url: 'https://www.elon.edu/apply' },
  { name: 'Denison University', url: 'https://www.denison.edu/apply' },
  { name: 'Franklin and Marshall College', url: 'https://www.fandm.edu/apply' },
  { name: 'Muhlenberg College', url: 'https://www.muhlenberg.edu/apply' },
  { name: 'Macalester College', url: 'https://www.macalester.edu/apply' },
  { name: 'Lawrence University', url: 'https://www.lawrence.edu/apply' },
];

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Deadline-type anchors, most specific first (ED2 before ED1 before EA).
const ANCHORS = [
  { type: 'early_decision_2', re: /early decision\s*(?:ii|2|two)\b/i, binding: true },
  { type: 'early_decision_1', re: /early decision\s*(?:i|1|one)?\b/i, binding: true },
  { type: 'early_action', re: /(?:restrictive|single[- ]choice)?\s*early action(?:\s*\(ea\))?/i, binding: false },
  { type: 'regular_decision', re: /regular (?:decision|action|admission)(?:\s*\(ra\))?/i, binding: false },
];

const DATE_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i;

// Single-pass entity decode: each &entity; is replaced exactly once and the
// replacement is NOT re-scanned, so there's no double-unescaping (a decoded '&'
// can't start a second decode). End-tag regexes allow whitespace before '>'
// (e.g. "</script >") so script/style bodies are reliably stripped.
const HTML_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  rsquo: "'", lsquo: "'", '#8217': "'", '#8216': "'", '#39': "'",
};

function cleanHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e) => (Object.prototype.hasOwnProperty.call(HTML_ENTITIES, e) ? HTML_ENTITIES[e] : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Map a deadline month to the correct calendar year within the cycle:
// Aug–Dec -> cycle start year; Jan–Jul -> entry year.
function yearForMonth(month, cycle) {
  return yearForMonthInCycle(month, cycle);
}

function toISODate(year, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Extract deadlines from cleaned page text. For each anchor type we look only in a
// tight window immediately AFTER the anchor phrase, and take the first plausible
// date there. Returns [{ deadline_type, deadline_date, is_binding, snippet }].
function extractDeadlines(cleanText, { windowChars = 60, cycle = getCurrentCycle() } = {}) {
  const out = [];
  const seen = new Set();
  for (const anchor of ANCHORS) {
    const m = anchor.re.exec(cleanText);
    if (!m) continue;
    const start = m.index + m[0].length;
    const window = cleanText.slice(start, start + windowChars);
    const dm = DATE_RE.exec(window);
    if (!dm) continue;
    const month = MONTHS[dm[1].toLowerCase()];
    const day = parseInt(dm[2], 10);
    if (!month || day < 1 || day > 31) continue;
    // Plausible UG deadline window: Sep (early) through Mar (late regular). Reject
    // stray dates (e.g. May reply dates, financial-aid notification dates).
    if (!(month >= 9 || month <= 3)) continue;
    if (seen.has(anchor.type)) continue;
    seen.add(anchor.type);
    const year = yearForMonth(month, cycle);
    out.push({
      deadline_type: anchor.type,
      deadline_date: toISODate(year, month, day),
      is_binding: anchor.binding,
      snippet: `${m[0].trim()} … ${dm[0]}`.slice(0, 120),
    });
  }
  return out;
}

async function fetchText(url, logger) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CollegeOS-DeadlineBot/1.0 (+https://collegeos.app/bot)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      logger.warn(`[${PARSER_NAME}] ${url} -> HTTP ${res.status}; skipping`);
      return null;
    }
    return await res.text();
  } catch (e) {
    logger.warn(`[${PARSER_NAME}] fetch failed for ${url}: ${e.message}; skipping`);
    return null;
  }
}

async function resolveInstitutionId(pool, name) {
  const r = await pool.query(
    `SELECT id FROM canonical.institutions WHERE canonical_name = $1 LIMIT 1`,
    [name]
  );
  return r.rows[0] ? r.rows[0].id : null;
}

async function fetchRows({ pool, logger = console }) {
  const rows = [];
  const now = new Date().toISOString();
  const cycle = getCurrentCycle();
  logger.info?.(`[${PARSER_NAME}] targeting admissions cycle ${cycle.cycleYear} (entry year ${cycle.cycleYearKey})`);
  for (const target of TARGETS) {
    const institutionId = await resolveInstitutionId(pool, target.name); // eslint-disable-line no-await-in-loop
    if (!institutionId) {
      logger.warn(`[${PARSER_NAME}] no institution match for "${target.name}"; skipping`);
      continue;
    }
    const html = await fetchText(target.url, logger); // eslint-disable-line no-await-in-loop
    if (!html) continue;
    const clean = cleanHtml(html);
    const deadlines = extractDeadlines(clean, { cycle });
    if (!deadlines.length) {
      logger.warn(`[${PARSER_NAME}] no deadlines extracted from ${target.url}; skipping (not fabricating)`);
      continue;
    }
    let domain = '';
    try { domain = new URL(target.url).hostname; } catch { /* ignore */ }
    for (const d of deadlines) {
      rows.push({
        institution_id: institutionId,
        cycle_year: cycle.cycleYear,
        cycle_year_key: cycle.cycleYearKey,
        degree_level: 'undergraduate',
        applicant_type: 'international',
        intake_term: 'fall',
        deadline_type: d.deadline_type,
        deadline_date: d.deadline_date,
        deadline_date_key: d.deadline_date,
        is_binding: d.is_binding,
        is_rolling: false,
        is_estimated: false,
        source_url: target.url,
        source_domain: domain,
        source_type: 'official',
        parser_name: PARSER_NAME,
        parser_version: PARSER_VERSION,
        last_verified: now,
        confidence_score: 0.9,
        source_priority: 100,
        conflict_status: 'clean',
        raw_payload: JSON.stringify({ snippet: d.snippet, institution: target.name }),
        parser_trace: JSON.stringify({ parser: PARSER_NAME, version: PARSER_VERSION, matched: d.snippet }),
        created_at: now,
        updated_at: now,
      });
    }
    logger.info(`[${PARSER_NAME}] ${target.name}: extracted ${deadlines.length} deadline(s)`);
  }
  return rows;
}

const VALID_TYPES = new Set([
  'early_action', 'early_decision_1', 'early_decision_2', 'regular_decision',
  'rolling', 'priority', 'scholarship', 'transfer', 'ucas_equal_consideration',
]);

function validateRow(row) {
  if (!row.institution_id) return { valid: false, reason: 'missing institution_id' };
  if (!VALID_TYPES.has(row.deadline_type)) return { valid: false, reason: `bad deadline_type ${row.deadline_type}` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.deadline_date || '')) return { valid: false, reason: `bad deadline_date ${row.deadline_date}` };
  if (row.applicant_type !== 'international' && row.applicant_type !== 'domestic' && row.applicant_type !== 'transfer') {
    return { valid: false, reason: `bad applicant_type ${row.applicant_type}` };
  }
  return { valid: true };
}

const adapter = {
  name: 'us-official-deadlines',
  source: 'university official admissions pages (primary source)',
  table: 'canonical.institution_deadlines',
  columns: [
    'institution_id', 'cycle_year', 'cycle_year_key', 'degree_level', 'applicant_type',
    'intake_term', 'deadline_type', 'deadline_date', 'deadline_date_key', 'is_binding',
    'is_rolling', 'is_estimated', 'source_url', 'source_domain', 'source_type',
    'parser_name', 'parser_version', 'last_verified', 'confidence_score', 'source_priority',
    'conflict_status', 'raw_payload', 'parser_trace', 'created_at', 'updated_at',
  ],
  conflictColumns: ['institution_id', 'cycle_year_key', 'applicant_type', 'degree_level', 'intake_term', 'deadline_type'],
  fetchRows,
  validateRow,
  requireNewRows: true,
};

module.exports = {
  adapter,
  // exported for unit tests (pure, no network/DB):
  cleanHtml,
  extractDeadlines,
  yearForMonth,
  toISODate,
  TARGETS,
};
