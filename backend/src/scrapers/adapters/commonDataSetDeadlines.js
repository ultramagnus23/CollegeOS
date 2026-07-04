'use strict';

// ============================================================================
// Common Data Set (CDS) PDF adapter -- undergraduate deadlines.
//
// WHY THIS EXISTS: the existing usOfficialDeadlines.js adapter parses each
// school's marketing admissions HTML page, which has zero standardization
// across schools (one regex per site design) -- that's why it plateaus at a
// ~63-school hand-verified target list. The Common Data Set is a REAL,
// standardized annual survey nearly every US 4-year institution publishes
// (originally for the College Board/Peterson's/US News); every school's CDS
// uses the SAME section/question numbering (C14 = regular decision closing
// date, C21 = early decision closing date, C22 = early action closing date),
// so ONE parser generalizes across hundreds of schools instead of one
// regex per school.
//
// SOURCING: real CDS PDFs, primarily discovered via the College Transitions
// CDS repository (a public aggregator of schools' own self-published CDS
// files: https://www.collegetransitions.com/dataverse/common-data-set-repository/),
// hosted on Google Drive by that site. Each PDF is the school's own official
// self-reported CDS document -- a primary source, not a third-party estimate.
//
// Extraction is regex-based on the standardized CDS question labels, same
// posture as usOfficialDeadlines.js: a date is only emitted if a plausible
// month-day value follows the known CDS field label; unparseable PDFs are
// skipped, never fabricated.
// ============================================================================

const PARSER_NAME = 'commonDataSetDeadlines';
const PARSER_VERSION = '1.0.0';
const CYCLE_YEAR = '2025-2026';
const CYCLE_YEAR_KEY = 2026;
const CYCLE_START_YEAR = 2025;

function driveUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// name (must exact-match canonical.institutions.canonical_name) -> Google
// Drive file id (2024-25 CDS) or a direct https URL. Sourced 2026-07-04 from
// the College Transitions CDS repository + direct institutional-research
// site search for a couple of schools not listed there. Google Sheets-format
// entries on that page (Allegheny, Auburn, Cal State Fullerton, W&M, Elon)
// are skipped -- this parser only handles PDF text extraction.
const TARGETS = [
  ['Adelphi University', driveUrl('1qpkPRWwieFukaOofJ07eqFd9nSb8Os9W')],
  ['Agnes Scott College', driveUrl('1nRJ99g-JMFDwniZ1u1TgHYMONy-Lnxq-')],
  ['Alfred University', driveUrl('1-2US9PhaZrZuo3dGIhelSmsBCRbar3Ax')],
  ['American University', driveUrl('12DxzDmbQxx2vRyBudBN3jFlk-HWvxGIm')],
  ['Amherst College', driveUrl('1nyc6IMyEA2YcnGR-0O0PXFTQufJsn-bp')],
  ['Appalachian State University', driveUrl('1BSu4wJPfG2j8SpHEA3vUk1GBN3jGYg1n')],
  ['Arizona State University-Tempe', driveUrl('1MQ9KpAdeaF8NfcNMUjSFwbHlvh7NzmzF')],
  ['Austin College', driveUrl('1uMj-mqH5hxQW2QuwlOuo2keF4zTp2T8I')],
  ['Babson College', driveUrl('1FJBtof5Ijx3McnIUNpz7aFlpPoXbTjk6')],
  ['Bard College', driveUrl('18JnWkO0gn0m8SJCQkUBCwbwj3ASI8avH')],
  ['Barnard College', driveUrl('14vhVmc0XznYoJKVISzkYaaGwIxY2uLZA')],
  ['Bates College', driveUrl('1wCt4XWMTb2wcJMTu7OwayKgSnt_Aip10')],
  ['Baylor University', driveUrl('16aCRFHoaRKjSyEVitqj-6OTkNf7bJNM9')],
  ['Belmont University', driveUrl('1S3YOAXK782hvRvBduoIGgF02dXedYafp')],
  ['Beloit College', driveUrl('1Apb7fPlyQXqISvL3QAK8D6ck42jSjIj_')],
  ['Bennington College', driveUrl('1aZNXmdJBFlm4323lOhMSXaZ4KA8bUfMX')],
  ['Bentley University', driveUrl('10et1a0IuSwyI57Me-zG7gMPoKAPc26k-')],
  ['Binghamton University', driveUrl('1OEtsa2GOsTWIlmYhe3-ZA0fn-n63mtBb')],
  ['Boston College', driveUrl('1Wz4J6SRfCTTibOEHavBLweEnYAxG_oJR')],
  ['Boston University', driveUrl('1fytFte6I1NTerPCk46RMBBsXE1qAgiAv')],
  ['Bowdoin College', driveUrl('13Euz1Dl23nxhWLdLc-6sESXFzSmpLcb4')],
  ['Bradley University', driveUrl('1jV0iWll0uRYQr5alcn6WbbAot8IlLx1p')],
  ['Brandeis University', driveUrl('1uboViz1S-MMQXAMsHFh5WgJSohSTdrMO')],
  ['Brown University', driveUrl('1_2XjGF3xL3MAzLbkAauPAeTmfTPFAyYX')],
  ['Bryn Mawr College', driveUrl('1GHHBZasqXHUBlr7elAB4Sigve5-tCoNg')],
  ['Bucknell University', driveUrl('16UZKiEisEpRSEgaQavmXrShaypwqcRJl')],
  ['Butler University', driveUrl('1EwcVaexL3MUER9jj_mWnF4l2AF-JWB2Z')],
  ['California State Polytechnic University-Pomona', driveUrl('1lwH_X-KfROFlSNBf0fxZoTtnJuMd5F7H')],
  ['California Polytechnic State University-San Luis Obispo', driveUrl('1VrNsgkRcj2z9jsLiovwRDmT4DpDl0-7m')],
  ['California Institute of Technology', driveUrl('16JODH2rg6DZu5CUEeEQx_8UogBYooIM1')],
  ['California State University-Los Angeles', driveUrl('19xk9izL3dPFoI27yihvy13fym5RmCxns')],
  ['California State University-Long Beach', driveUrl('1Jmfc1Ed7ucf7wTBjEphzcAJReyYPu8jJ')],
  ['Carleton College', driveUrl('1WstOtBocYVh6OjCsaItre7Th0bYSBj-p')],
  ['Carnegie Mellon University', driveUrl('1HnxkIUM-bg8caT8Yxw5xB2yQP6gdDsKG')],
  ['Case Western Reserve University', driveUrl('1f_RKOyi-tvUNi1NNhTcppmW2vC4ypNOl')],
  ['Chapman University', driveUrl('1OK5t-z7CB1oRLJQTv2Du4gtpjTxIsneN')],
  ['Claremont McKenna College', driveUrl('1sM7h2ED1zlVpDJLGy8a072oSfQDwhhNn')],
  ['Clark University', driveUrl('1N1uTQ18c9lkIBOsljnsWBwl3PR0lQPxG')],
  ['Clarkson University', driveUrl('1WdWuUHlqhhfHLLRiY9lOmsgQ39It3q7m')],
  ['Clemson University', driveUrl('1lgFGWD7h6i7J0ZzYy1p-6c4d26Is1Kgj')],
  ['Coastal Carolina University', driveUrl('1hyAZ9FlsdI_z6JAY8ZiuulcTtLEwEWbe')],
  ['Colgate University', driveUrl('1IqjJEZCqBf_tRwZlSjj65BYUabxaHyoB')],
  ['College of Charleston', driveUrl('1Fn6DeJuD-KBiKm0rw6EC5oHwDGWdGtz3')],
  ['The College of New Jersey', driveUrl('1XaZFpI1Y5fyEwqtCaRpohM63rKb1Jd8W')],
  ['Colorado College', driveUrl('1p0TnSu0PlZq7aAOmPeu7z1K55ZpNW9jj')],
  ['Colorado State University-Fort Collins', driveUrl('104HAlHr6kClPur16ZTVt4jsCL8kyb04S')],
  ['Columbia University in the City of New York', driveUrl('1rwmOmrBle2xnIB7bkqJyA2_YKpEVc_g8')],
  ['Connecticut College', driveUrl('1UF-9IFl3HSUrllZwEO4NCwCb2NFqWjxH')],
  ['Cornell University', driveUrl('1Nf0ewDcnAshCu2HNkHNGTN45DNR3ZPo7')],
  ['Creighton University', driveUrl('19HfgYpxmfyQUsSnaLws8Kz29PWnAHwny')],
  ['Dartmouth College', driveUrl('1-NJW__ec_WpOlJWK8r_wgTM_4YNUCjoZ')],
  ['Davidson College', driveUrl('1qCqNmwDGxCfnue4NFnbw-5pf5CPhKgm8')],
  ['Denison University', driveUrl('1gmNXk-Ziz_x3o1ybWE3CAhrRtckOryqU')],
  ['DePaul University', driveUrl('1IdI_x1wH_nknqoRgU9P49Wvq7XZBO1Rb')],
  ['DePauw University', driveUrl('1H0BDWS4g91wjnlSqI9HfncCRb9rTBud2')],
  ['Dickinson College', driveUrl('1EBQXWzp_k2jN1JV9edCVRVTziRIB5Zfp')],
  ['Drexel University', driveUrl('1PaUMIYNGkh0aIf1CKJLxmYcOC6QOOXok')],
  ['Duke University', driveUrl('1GSANSJf5yJPlMSYCXYy_tImg1X4zUv-K')],
  ['Duquesne University', driveUrl('1H7YFLk-rFo0YUUz7qYdz2GjKa4FoMzeY')],
  ['Earlham College', driveUrl('19Ua2rP4LU9OYNEYmoZdRYlWDEGO4-ZBt')],
  ['East Carolina University', driveUrl('1de7FH5I8a0USlrRfFV2PKBJkznEwifZV')],
  ['Eckerd College', driveUrl('1moNC9WOY7sHso55hcW-0wq330tuqanEK')],
  ['Georgia Institute of Technology-Main Campus', 'https://irp.gatech.edu/files/CDS/CDS_2024-2025_FINAL_20FEB2025.pdf'],
];

// CDS PDFs vary in date format across schools: some use "MM-D" dash dates
// ("11-1", "1-2"), others spell the month out ("January 5"). Both are handled.
const DASH_DATE_RE = /\b(\d{1,2})[-/](\d{1,2})\b/;
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_NAME_DATE_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i;

function yearForMonth(month) {
  return month >= 8 ? CYCLE_START_YEAR : CYCLE_YEAR_KEY;
}

function toISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Looks for a date within `windowChars` of the label match (not requiring
// adjacency, since some schools put "Yes" or a line break between the CDS
// question label and its answer value).
function parseDateNear(text, windowChars = 150) {
  const dash = DASH_DATE_RE.exec(text.slice(0, windowChars));
  if (dash) {
    const month = parseInt(dash[1], 10);
    const day = parseInt(dash[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: toISODate(yearForMonth(month), month, day), snippet: dash[0] };
    }
  }
  const named = MONTH_NAME_DATE_RE.exec(text.slice(0, windowChars));
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = parseInt(named[2], 10);
    if (day >= 1 && day <= 31) {
      return { date: toISODate(yearForMonth(month), month, day), snippet: named[0] };
    }
  }
  return null;
}

// Extract deadlines from linear CDS text. Each CDS question label is followed
// closely (within a short window) by its answer value in the raw extracted
// text -- reliable for scalar fields like dates, unlike the C7/C8A checkbox
// tables which lose column alignment in linear PDF text extraction (not
// attempted here -- we do not guess which column an "X" belongs to).
// Each entry: [deadline_type, is_binding, array of label regexes to try (first
// match wins) -- multiple phrasings because different schools' CDS text
// extraction renders the same standardized question differently].
const FIELD_PATTERNS = [
  ['regular_decision', false, [
    /Application closing date \(fall\)/i,
    /Does your institution have an application closing\s*date\?\s*Yes/i,
  ]],
  ['early_decision_1', true, [
    /First or only early decision plan closing date/i,
  ]],
  ['early_decision_2', true, [
    /Other early decision plan closing date/i,
  ]],
  ['early_action', false, [
    /Early action closing date/i,
  ]],
];

function extractDeadlines(text) {
  const out = [];
  const seen = new Set();
  for (const [type, binding, patterns] of FIELD_PATTERNS) {
    for (const pattern of patterns) {
      const m = pattern.exec(text);
      if (!m) continue;
      const after = text.slice(m.index + m[0].length);
      const found = parseDateNear(after);
      if (found) {
        if (!seen.has(type)) {
          out.push({ deadline_type: type, deadline_date: found.date, is_binding: binding, snippet: found.snippet });
          seen.add(type);
        }
        break;
      }
    }
  }
  return out;
}

async function resolveInstitutionId(pool, name) {
  const r = await pool.query(`SELECT id FROM canonical.institutions WHERE canonical_name = $1 LIMIT 1`, [name]);
  return r.rows[0] ? r.rows[0].id : null;
}

async function fetchPdfText(url, logger) {
  // Deferred require: pdf-parse is a scraper-only dependency, not needed by the
  // main backend app; keeping it out of the top-level require list avoids
  // adding a prod dependency for a script-only code path.
  let pdfParse;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    pdfParse = require('pdf-parse');
  } catch (e) {
    throw new Error('pdf-parse is not installed; run `npm install pdf-parse` in backend/ to use this adapter');
  }
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
    if (!res.ok) { logger.warn(`[${PARSER_NAME}] ${url} -> HTTP ${res.status}; skipping`); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) { logger.warn(`[${PARSER_NAME}] ${url} -> body too small (${buf.length}b), likely a Drive confirm page; skipping`); return null; }
    const parsed = await pdfParse(buf);
    return parsed.text;
  } catch (e) {
    logger.warn(`[${PARSER_NAME}] fetch/parse failed for ${url}: ${e.message}; skipping`);
    return null;
  }
}

async function fetchRows({ pool, logger = console }) {
  const rows = [];
  const now = new Date().toISOString();
  for (const [name, url] of TARGETS) {
    const institutionId = await resolveInstitutionId(pool, name); // eslint-disable-line no-await-in-loop
    if (!institutionId) { logger.warn(`[${PARSER_NAME}] no institution match for "${name}"; skipping`); continue; }
    const text = await fetchPdfText(url, logger); // eslint-disable-line no-await-in-loop
    if (!text) continue;
    const deadlines = extractDeadlines(text);
    if (!deadlines.length) { logger.warn(`[${PARSER_NAME}] no deadlines extracted for ${name}; skipping (not fabricating)`); continue; }
    for (const d of deadlines) {
      rows.push({
        institution_id: institutionId,
        cycle_year: CYCLE_YEAR,
        cycle_year_key: CYCLE_YEAR_KEY,
        degree_level: 'undergraduate',
        applicant_type: 'international',
        intake_term: 'fall',
        deadline_type: d.deadline_type,
        deadline_date: d.deadline_date,
        deadline_date_key: d.deadline_date,
        is_binding: d.is_binding,
        is_rolling: false,
        is_estimated: false,
        source_url: url,
        source_domain: 'Common Data Set (self-reported)',
        source_type: 'official',
        parser_name: PARSER_NAME,
        parser_version: PARSER_VERSION,
        last_verified: now,
        confidence_score: 0.85,
        source_priority: 95,
        conflict_status: 'clean',
        raw_payload: JSON.stringify({ snippet: d.snippet, institution: name }),
        parser_trace: JSON.stringify({ parser: PARSER_NAME, version: PARSER_VERSION, matched: d.snippet }),
        created_at: now,
        updated_at: now,
      });
    }
    logger.info(`[${PARSER_NAME}] ${name}: extracted ${deadlines.length} deadline(s)`);
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
  return { valid: true };
}

const adapter = {
  name: 'common-data-set-deadlines',
  source: 'Common Data Set (school self-reported, standardized survey)',
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

module.exports = { adapter, extractDeadlines, parseDateNear, TARGETS };
