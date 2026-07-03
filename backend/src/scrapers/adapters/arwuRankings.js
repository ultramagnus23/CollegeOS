'use strict';

// ============================================================================
// ARWU (Academic Ranking of World Universities / "Shanghai Ranking") adapter —
// an open, non-copyrighted-commercial global ranking published by ShanghaiRanking
// Consultancy. Per project policy (docs/undergrad_expansion_plan.md), ARWU and
// CWUR are the two global ranking sources safe to scrape in bulk (unlike QS/THE/
// US News/Niche, which are commercial and out of scope). Parses the public,
// server-side-rendered ranking HTML table and writes global_rank + national_rank +
// score into canonical.institution_rankings for matched institutions. Never
// fabricated — institutions that can't be matched to an existing canonical row
// are skipped + logged.
//
// Source shape (verified live 2026-07-02): shanghairanking.com/rankings/arwu/{YEAR}
// server-renders a <tbody> with one <tr> per institution: rank | name (+country) |
// national/regional rank | total score | five sub-indicator scores. The full
// ranked list (1000+ institutions) is paginated client-side via a Nuxt JS bundle
// that this adapter does not execute (no client-side JS execution — this adapter
// only parses static server-rendered HTML). The first SSR page reliably exposes
// the top 30 globally ranked institutions; that is the scope of this adapter.
// If ShanghaiRanking ever exposes a stable server-rendered pagination URL for
// deeper pages, extend SOURCES below rather than executing their JS payload.
// ============================================================================

const YEAR = 2024;
const RANKING_BODY = 'Shanghai ARWU';
const RANKING_URL = `https://www.shanghairanking.com/rankings/arwu/${YEAR}`;

const NAMED_ENTITIES = { amp: '&', rsquo: "'", lsquo: "'", apos: "'", quot: '"', nbsp: ' ', lt: '<', gt: '>' };
function strip(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const cp = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch { return ' '; }
      }
      const k = e.toLowerCase();
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, k) ? NAMED_ENTITIES[k] : ' ';
    })
    .replace(/\s+/g, ' ').trim();
}

// Pure parser. Each ranking row is a <tr> inside <tbody>; rank is the first
// "ranking" div, name is the "univ-name" span, location is the "location" div
// text, national/regional rank is the plain numeric cell right after the name
// cell, and total score is the first "sort-td" cell.
function parseArwuRankings(html) {
  const out = [];
  const tbodyStart = html.indexOf('<tbody');
  const tbodyEnd = html.indexOf('</tbody>', tbodyStart);
  if (tbodyStart === -1 || tbodyEnd === -1) return out;
  const tbody = html.slice(tbodyStart, tbodyEnd);
  const trs = tbody.split(/<tr[\s>]/i).slice(1);

  for (const tr of trs) {
    const rankMatch = tr.match(/class="ranking[^"]*"[^>]*>\s*([\d]+)\s*</);
    const nameMatch = tr.match(/class="univ-name"[^>]*>\s*([^<]+?)\s*</);
    const locMatch = tr.match(/class="location"[^>]*>[^<]*<img[^>]*>\s*([^<]+?)\s*</);
    if (!rankMatch || !nameMatch) continue;

    const rank = parseInt(rankMatch[1], 10);
    const name = strip(nameMatch[1]);
    if (!Number.isFinite(rank) || !name || name.length < 3) continue;
    const country = locMatch ? strip(locMatch[1]) : null;

    // Cells after the name cell: national/regional rank, then total score
    // (first "sort-td"). Extract by scanning <td> boundaries after the name cell.
    const afterName = tr.slice(tr.indexOf(nameMatch[0]) + nameMatch[0].length);
    const tdMatches = [...afterName.matchAll(/<td[^>]*>\s*([\d.]+)\s*(?:<!---->)?\s*<\/td>/g)];
    const national_rank = tdMatches[0] ? parseInt(tdMatches[0][1], 10) : null;
    const score = tdMatches[1] ? parseFloat(tdMatches[1][1]) : null;

    out.push({
      rank,
      name,
      country,
      national_rank: Number.isFinite(national_rank) ? national_rank : null,
      score: Number.isFinite(score) ? score : null,
    });
  }
  return out;
}

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Match an ARWU institution name to an existing canonical institution (global,
// not country-scoped — ARWU's location text doesn't reliably map to ISO country
// codes). exact -> normalized-equal -> ILIKE contains. Returns id or null.
async function matchInstitution(pool, name, cache) {
  if (cache.has(name)) return cache.get(name);
  let id = null;

  // Strip a trailing parenthetical abbreviation, e.g. "Massachusetts Institute
  // of Technology (MIT)" -> "Massachusetts Institute of Technology", and a
  // leading "The " (ARWU sometimes prefixes it, e.g. "The University of Tokyo").
  const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').replace(/^the\s+/i, '').trim();
  const candidates = [name];
  if (stripped !== name) candidates.push(stripped);
  // "University of California, Berkeley" -> "University of California-Berkeley"
  // (this canonical DB uses a hyphenated campus-suffix convention for UC/SUNY-
  // style multi-campus systems).
  for (const c of [...candidates]) {
    if (c.includes(',')) candidates.push(c.replace(/,\s*/g, '-'));
  }

  for (const candidate of candidates) {
    const exact = await pool.query(  
      `SELECT id FROM canonical.institutions WHERE canonical_name = $1 LIMIT 1`, [candidate]
    );
    if (exact.rows[0]) { id = exact.rows[0].id; break; }
  }

  if (!id) {
    for (const candidate of candidates) {
      const norm = normalize(candidate);
      const cand = await pool.query(  
        `SELECT id FROM canonical.institutions WHERE normalized_name = $1 LIMIT 1`, [norm]
      );
      if (cand.rows[0]) { id = cand.rows[0].id; break; }
    }
  }

  if (!id) {
    const ilike = await pool.query(
      `SELECT id FROM canonical.institutions WHERE canonical_name ILIKE $1 ORDER BY length(canonical_name) LIMIT 1`,
      [`%${stripped}%`]
    );
    if (ilike.rows[0]) id = ilike.rows[0].id;
  }

  cache.set(name, id);
  return id;
}

async function fetchText(url, logger) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CollegeOS-ARWUBot/1.0 (+https://collegeos.app/bot)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) { logger.warn(`[arwu] ${url} -> HTTP ${res.status}`); return null; }
    return await res.text();
  } catch (e) { logger.warn(`[arwu] fetch failed ${url}: ${e.message}`); return null; }
}

async function fetchRows({ pool, logger = console }) {
  const rows = [];
  const cache = new Map();
  const now = new Date().toISOString();
  let matched = 0; let unmatched = 0;

  const html = await fetchText(RANKING_URL, logger);
  if (!html) return rows;

  const parsed = parseArwuRankings(html);
  logger.info(`[arwu] parsed ${parsed.length} ranked institutions`);

  for (const r of parsed) {
    const institutionId = await matchInstitution(pool, r.name, cache);  
    if (!institutionId) { unmatched += 1; logger.warn(`[arwu] no canonical match: "${r.name}"`); continue; }
    matched += 1;
    rows.push({
      institution_id: institutionId,
      ranking_year: YEAR,
      ranking_body: RANKING_BODY,
      global_rank: r.rank,
      national_rank: r.national_rank,
      ranking_score: r.score,
      source_attribution: JSON.stringify({ source: 'ARWU', source_url: RANKING_URL, confidence: 0.9, last_verified_at: now }),
      raw_payload: JSON.stringify({ name: r.name, country: r.country, rank: r.rank, national_rank: r.national_rank, score: r.score }),
      created_at: now,
    });
  }
  logger.info(`[arwu] matched ${matched}, unmatched ${unmatched}`);
  return rows;
}

function validateRow(row) {
  if (!row.institution_id) return { valid: false, reason: 'missing institution_id' };
  if (!Number.isFinite(row.global_rank)) return { valid: false, reason: 'bad rank' };
  return { valid: true };
}

const adapter = {
  name: 'arwu-rankings',
  source: 'ARWU / Shanghai Ranking — shanghairanking.com (open, non-commercial academic ranking)',
  table: 'canonical.institution_rankings',
  // NOTE: ranking_year_key is a GENERATED ALWAYS AS (...) STORED column — it
  // cannot appear in an INSERT column list (Postgres rejects non-DEFAULT writes
  // to generated columns). ON CONFLICT can still target it, since Postgres
  // matches conflict targets against any unique index, including one on a
  // generated column (institution_rankings_uq_institution_body_year covers the
  // equivalent (institution_id, ranking_body, ranking_year) shape and is used
  // here instead — see verification note below).
  columns: [
    'institution_id', 'ranking_year', 'ranking_body',
    'global_rank', 'national_rank', 'ranking_score', 'source_attribution', 'raw_payload', 'created_at',
  ],
  conflictColumns: ['institution_id', 'ranking_body', 'ranking_year'],
  fetchRows,
  validateRow,
  requireNewRows: false, // top-30 overlaps with already-seeded rows; re-runs are refresh/verify, not expansion
};

module.exports = { adapter, parseArwuRankings, normalize };
