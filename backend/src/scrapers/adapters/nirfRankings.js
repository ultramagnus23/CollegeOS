'use strict';

// ============================================================================
// NIRF (National Institutional Ranking Framework) adapter — India's official
// government rankings (nirfindia.org). Parses the public ranking HTML tables and
// writes national_rank + score into canonical.institution_rankings for matched
// Indian institutions. Open government source; never fabricated — institutions
// that can't be matched to an existing canonical row are skipped + logged.
//
// Table shape (verified 2026-06-23): columns = Institute ID | Name | City |
// State | Score | Rank.
// ============================================================================

const YEAR = 2024;
const RANKING_BODY = 'NIRF';

// NIRF "Overall" ranks the top institutions across all categories — the headline
// national rank. (Category pages like EngineeringRanking exist too; the rankings
// unique key is per (institution, year, body), so we ingest the Overall rank.)
const SOURCES = [
  { category: 'Overall', url: `https://www.nirfindia.org/Rankings/${YEAR}/OverallRanking.html` },
];

function strip(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&#0?39;|&rsquo;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Pure parser. The ranking table cells can't be parsed by position because each
// Name cell embeds a nested "More Details" sub-table (101 nested <tbody>s). The
// reliable signal is the "Institute ID cell -> Name cell" pair, and NIRF lists
// rows in RANK ORDER — so rank = order of first appearance. Dedupes by Institute
// ID (nested sub-tables repeat the id).
function parseNirfRankings(html) {
  const out = [];
  const seen = new Set();
  const re = /<td[^>]*>\s*(IR-[A-Za-z]-[A-Za-z]-\d+)\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*</gi;
  let m;
  let order = 0;
  while ((m = re.exec(html)) !== null) {
    const institute_id = m[1].trim();
    if (seen.has(institute_id)) continue;
    const name = strip(m[2]);
    if (!name || name.length < 3) continue;
    seen.add(institute_id);
    order += 1;
    out.push({ institute_id, name, rank: order, score: null, rank_raw: String(order) });
  }
  return out;
}

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Match a NIRF institution name to an existing canonical Indian institution:
// exact -> normalized-equal -> ILIKE. Returns id or null (never creates a row).
async function matchInstitution(pool, name, cache) {
  if (cache.has(name)) return cache.get(name);
  let id = null;
  const exact = await pool.query(
    `SELECT id FROM canonical.institutions WHERE country_code='IN' AND canonical_name = $1 LIMIT 1`, [name]
  );
  if (exact.rows[0]) id = exact.rows[0].id;
  if (!id) {
    const norm = normalize(name);
    const cand = await pool.query(
      `SELECT id, canonical_name FROM canonical.institutions WHERE country_code='IN'
         AND lower(regexp_replace(canonical_name,'[^A-Za-z0-9]+',' ','g')) = $1 LIMIT 1`, [norm]
    );
    if (cand.rows[0]) id = cand.rows[0].id;
  }
  if (!id) {
    // our name contains theirs (rare for NIRF's longer names)
    const ilike = await pool.query(
      `SELECT id FROM canonical.institutions WHERE country_code='IN' AND canonical_name ILIKE $1 ORDER BY length(canonical_name) LIMIT 1`,
      [`%${name}%`]
    );
    if (ilike.rows[0]) id = ilike.rows[0].id;
  }
  if (!id) {
    // theirs contains ours — handles NIRF city suffixes ("Indian Institute of
    // Science, Bengaluru" ⊇ our "Indian Institute of Science"). Longest match wins
    // (most specific) to avoid matching a generic stem.
    const rev = await pool.query(
      `SELECT id, canonical_name FROM canonical.institutions
         WHERE country_code='IN' AND length(canonical_name) >= 12 AND $1 ILIKE '%' || canonical_name || '%'
         ORDER BY length(canonical_name) DESC LIMIT 1`,
      [name]
    );
    if (rev.rows[0]) id = rev.rows[0].id;
  }
  cache.set(name, id);
  return id;
}

async function fetchText(url, logger) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'CollegeOS-NIRFBot/1.0 (+https://collegeos.app/bot)' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
    if (!res.ok) { logger.warn(`[nirf] ${url} -> HTTP ${res.status}`); return null; }
    return await res.text();
  } catch (e) { logger.warn(`[nirf] fetch failed ${url}: ${e.message}`); return null; }
}

async function fetchRows({ pool, logger = console }) {
  const rows = [];
  const cache = new Map();
  const now = new Date().toISOString();
  let matched = 0; let unmatched = 0;
  for (const src of SOURCES) {
    const html = await fetchText(src.url, logger); // eslint-disable-line no-await-in-loop
    if (!html) continue;
    const parsed = parseNirfRankings(html);
    logger.info(`[nirf] ${src.category}: parsed ${parsed.length} ranked institutions`);
    for (const r of parsed) {
      const institutionId = await matchInstitution(pool, r.name, cache); // eslint-disable-line no-await-in-loop
      if (!institutionId) { unmatched += 1; logger.warn(`[nirf] no canonical match: "${r.name}"`); continue; }
      matched += 1;
      rows.push({
        institution_id: institutionId,
        ranking_year: String(YEAR),
        ranking_year_key: YEAR,
        ranking_body: RANKING_BODY,
        national_rank: r.rank,
        ranking_score: r.score,
        source_attribution: JSON.stringify({ source: 'NIRF', category: src.category, source_url: src.url, confidence: 0.9, last_verified_at: now }),
        raw_payload: JSON.stringify({ institute_id: r.institute_id, name: r.name, city: r.city, state: r.state, rank_raw: r.rank_raw, score: r.score }),
        created_at: now,
      });
    }
  }
  logger.info(`[nirf] matched ${matched}, unmatched ${unmatched}`);
  return rows;
}

function validateRow(row) {
  if (!row.institution_id) return { valid: false, reason: 'missing institution_id' };
  if (!Number.isFinite(row.national_rank)) return { valid: false, reason: 'bad rank' };
  return { valid: true };
}

const adapter = {
  name: 'nirf-rankings',
  source: 'NIRF — nirfindia.org (open government rankings)',
  table: 'canonical.institution_rankings',
  columns: [
    'institution_id', 'ranking_year', 'ranking_year_key', 'ranking_body',
    'national_rank', 'ranking_score', 'source_attribution', 'raw_payload', 'created_at',
  ],
  conflictColumns: ['institution_id', 'ranking_year_key', 'ranking_body'],
  fetchRows,
  validateRow,
  requireNewRows: true,
};

module.exports = { adapter, parseNirfRankings, normalize };
