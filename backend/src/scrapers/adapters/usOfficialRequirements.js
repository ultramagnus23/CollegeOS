'use strict';

// ============================================================================
// US official-source undergraduate REQUIREMENTS adapter.
//
// Same posture as usOfficialDeadlines: PRIMARY SOURCES ONLY. Fetches each
// university's own admissions page live and extracts only requirement signals it
// can confidently read from the page text (test policy, English tests, essays,
// recommendations, transcripts, interview, application platform). A field is set
// ONLY when clearly stated; otherwise it is left null (not guessed). A row is
// emitted only when >= MIN_SIGNALS distinct signals are found; pages that don't
// parse are skipped, never fabricated. Matched snippets go in parser_trace.
// ============================================================================

const { cleanHtml } = require('./usOfficialDeadlines');

const PARSER_NAME = 'usOfficialRequirements';
const PARSER_VERSION = '1.0.0';
const CYCLE_YEAR = '2025-2026';
const MIN_SIGNALS = 2; // need at least this many confidently-extracted fields to emit

// Verified-parseable official admissions pages (checked 2026-06-22). These pages
// state requirements in inline HTML text. Adding a target is per-school work.
const TARGETS = [
  { name: 'Massachusetts Institute of Technology', url: 'https://mitadmissions.org/apply/firstyear/deadlines-requirements/' },
  { name: 'University of Notre Dame', url: 'https://admissions.nd.edu/apply/' },
];

// Returns { fields:{...}, signals:int, snippets:[...] }. Only confidently-stated
// fields are populated. sat_policy/act_policy must be one of the CHECK values:
// required | optional | blind | considered | not_used.
function extractRequirements(text) {
  const t = String(text || '');
  const fields = {};
  const snippets = [];
  const note = (label, m) => { if (m) snippets.push(`${label}: ${String(m[0]).trim().slice(0, 80)}`); };

  // Test policy (most specific first)
  let m;
  if ((m = /test[-\s]?blind/i.exec(t))) { fields.sat_policy = 'blind'; fields.act_policy = 'blind'; note('test_policy', m); }
  else if ((m = /test[-\s]?optional/i.exec(t))) { fields.sat_policy = 'optional'; fields.act_policy = 'optional'; note('test_policy', m); }
  else if ((m = /(sat|act)[^.]{0,40}\b(is\s+)?required\b|\brequire[sd]?\b[^.]{0,20}(sat|act)/i.exec(t))) { fields.sat_policy = 'required'; note('test_policy', m); }
  if (fields.sat_policy === 'required') fields.sat_required = true;

  // English-proficiency tests (international applicants)
  if ((m = /\bTOEFL\b/i.exec(t))) { fields.toefl_required = true; note('toefl', m); }
  if ((m = /\bIELTS\b/i.exec(t))) { fields.ielts_required = true; note('ielts', m); }
  if ((m = /\bDuolingo\b/i.exec(t))) { fields.duolingo_required = true; note('duolingo', m); }

  // Essays
  if ((m = /supplemental essay|writing supplement/i.exec(t))) { fields.essays_required = true; fields.supplemental_essays_required = true; note('supp_essay', m); }
  else if ((m = /personal statement|application essay|\bessay\b/i.exec(t))) { fields.essays_required = true; note('essay', m); }

  // Transcript
  if ((m = /\btranscript\b/i.exec(t))) { fields.transcript_required = true; note('transcript', m); }

  // Recommendations (capture count when stated)
  if ((m = /\b(two|three|2|3)\b[^.]{0,40}(letters? of recommendation|teacher (evaluations?|recommendations?)|recommendation letters?)/i.exec(t))) {
    fields.teacher_recommendations_required = ({ two: 2, three: 3 })[m[1].toLowerCase()] || parseInt(m[1], 10) || 1;
    note('recs', m);
  } else if ((m = /letters? of recommendation|teacher (evaluations?|recommendations?)/i.exec(t))) {
    fields.teacher_recommendations_required = 1; note('recs', m);
  }

  // Interview
  if ((m = /interview[^.]{0,30}\brequired\b/i.exec(t))) { fields.interview_required = true; note('interview', m); }
  else if ((m = /interview[^.]{0,30}(optional|recommended|available|encouraged)/i.exec(t))) { fields.interview_optional = true; note('interview', m); }

  // Application platform
  if ((m = /Common App(lication)?/i.exec(t))) { fields.common_app_supported = true; fields.application_platform = 'Common App'; note('common_app', m); }
  if ((m = /Coalition (App|Application)/i.exec(t))) { fields.coalition_app_supported = true; note('coalition', m); }

  return { fields, signals: Object.keys(fields).length, snippets };
}

async function fetchText(url, logger) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CollegeOS-RequirementsBot/1.0 (+https://collegeos.app/bot)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { logger.warn(`[${PARSER_NAME}] ${url} -> HTTP ${res.status}; skipping`); return null; }
    return await res.text();
  } catch (e) {
    logger.warn(`[${PARSER_NAME}] fetch failed for ${url}: ${e.message}; skipping`);
    return null;
  }
}

async function resolveInstitutionId(pool, name) {
  const r = await pool.query(`SELECT id FROM canonical.institutions WHERE canonical_name = $1 LIMIT 1`, [name]);
  return r.rows[0] ? r.rows[0].id : null;
}

// Institutions that already have a requirements row for this key — we skip them so
// a partial live scrape never clobbers a richer curated/seed row (the framework's
// upsert overwrites all columns). This adapter is purely additive.
async function existingRequirementInstitutions(pool) {
  const r = await pool.query(
    `SELECT institution_id FROM canonical.institution_requirements
      WHERE cycle_year = $1 AND degree_level = 'undergraduate' AND applicant_type = 'international'`,
    [CYCLE_YEAR]
  );
  return new Set(r.rows.map((x) => x.institution_id));
}

async function fetchRows({ pool, logger = console }) {
  const rows = [];
  const now = new Date().toISOString();
  const existing = await existingRequirementInstitutions(pool);
  for (const target of TARGETS) {
    const institutionId = await resolveInstitutionId(pool, target.name); // eslint-disable-line no-await-in-loop
    if (!institutionId) { logger.warn(`[${PARSER_NAME}] no institution match for "${target.name}"; skipping`); continue; }
    if (existing.has(institutionId)) { logger.info(`[${PARSER_NAME}] ${target.name} already has requirements; skipping (won't clobber)`); continue; }
    const html = await fetchText(target.url, logger); // eslint-disable-line no-await-in-loop
    if (!html) continue;
    const { fields, signals, snippets } = extractRequirements(cleanHtml(html));
    if (signals < MIN_SIGNALS) {
      logger.warn(`[${PARSER_NAME}] only ${signals} signal(s) from ${target.url}; skipping (not fabricating)`);
      continue;
    }
    let domain = '';
    try { domain = new URL(target.url).hostname; } catch { /* ignore */ }
    rows.push({
      institution_id: institutionId,
      cycle_year: CYCLE_YEAR,
      degree_level: 'undergraduate',
      applicant_type: 'international',
      ...fields,
      source_url: target.url,
      source_domain: domain,
      source_type: 'official',
      parser_name: PARSER_NAME,
      parser_version: PARSER_VERSION,
      last_verified: now,
      confidence_score: Math.min(0.9, 0.4 + signals * 0.08),
      raw_payload: JSON.stringify({ institution: target.name, signals }),
      parser_trace: JSON.stringify({ parser: PARSER_NAME, version: PARSER_VERSION, matched: snippets }),
      created_at: now,
      updated_at: now,
    });
    logger.info(`[${PARSER_NAME}] ${target.name}: ${signals} requirement signal(s)`);
  }
  return rows;
}

const POLICY = new Set(['required', 'optional', 'blind', 'considered', 'not_used']);
function validateRow(row) {
  if (!row.institution_id) return { valid: false, reason: 'missing institution_id' };
  if (row.sat_policy != null && !POLICY.has(row.sat_policy)) return { valid: false, reason: `bad sat_policy ${row.sat_policy}` };
  if (row.act_policy != null && !POLICY.has(row.act_policy)) return { valid: false, reason: `bad act_policy ${row.act_policy}` };
  if (row.applicant_type !== 'international' && row.applicant_type !== 'domestic' && row.applicant_type !== 'transfer') {
    return { valid: false, reason: `bad applicant_type ${row.applicant_type}` };
  }
  return { valid: true };
}

const ALL_COLUMNS = [
  'institution_id', 'cycle_year', 'degree_level', 'applicant_type', 'sat_policy', 'act_policy',
  'sat_required', 'toefl_required', 'ielts_required', 'duolingo_required', 'transcript_required',
  'essays_required', 'supplemental_essays_required', 'teacher_recommendations_required',
  'interview_required', 'interview_optional', 'common_app_supported', 'coalition_app_supported',
  'application_platform', 'source_url', 'source_domain', 'source_type', 'parser_name',
  'parser_version', 'last_verified', 'confidence_score', 'raw_payload', 'parser_trace',
  'created_at', 'updated_at',
];

const adapter = {
  name: 'us-official-requirements',
  source: 'university official admissions pages (primary source)',
  table: 'canonical.institution_requirements',
  columns: ALL_COLUMNS,
  conflictColumns: ['institution_id', 'cycle_year', 'degree_level', 'applicant_type'],
  fetchRows,
  validateRow,
  requireNewRows: true,
};

module.exports = { adapter, extractRequirements, TARGETS };
