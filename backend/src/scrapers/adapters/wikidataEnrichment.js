'use strict';

// ============================================================================
// Wikidata enrichment adapter — a REAL, live scraper proving the framework
// end-to-end. Wikidata is used because it is a robust JSON API (no fragile HTML
// parsing): resolve each institution name → QID (wbsearchentities), then read
// claims (wbgetentities) for official website (P856) and inception (P571).
//
// Enriches canonical.institutions.metadata for institutions seeded by the India
// criteria seeder. Does NOT fabricate: institutions it cannot resolve on Wikidata
// are skipped, not written. Idempotent (ON CONFLICT (id) DO UPDATE).
// ============================================================================

const USER_AGENT = 'CollegeOS-scraper/1.0 (education data enrichment)';
const SEARCH_API = 'https://www.wikidata.org/w/api.php';

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function resolveQid(name) {
  const url = `${SEARCH_API}?action=wbsearchentities&format=json&language=en&type=item&limit=1&search=${encodeURIComponent(name)}`;
  const j = await getJson(url);
  return j?.search?.[0]?.id || null;
}

async function fetchFacts(name) {
  try {
    const qid = await resolveQid(name);
    if (!qid) return null;
    const url = `${SEARCH_API}?action=wbgetentities&format=json&props=claims&ids=${qid}`;
    const j = await getJson(url);
    const claims = j?.entities?.[qid]?.claims || {};
    const website = claims.P856?.[0]?.mainsnak?.datavalue?.value || null;
    const inception = claims.P571?.[0]?.mainsnak?.datavalue?.value?.time || null;
    const foundedYear = inception ? parseInt(String(inception).replace(/^\+/, '').slice(0, 4), 10) || null : null;
    return { qid, website, foundedYear };
  } catch {
    return null; // network/parse failure → skip (never fabricate)
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = {
  name: 'wikidata_institution_enrichment',
  source: 'Wikidata',
  sourceUrl: 'https://www.wikidata.org',
  table: 'canonical.institutions',
  columns: ['id', 'canonical_name', 'normalized_name', 'slug', 'metadata'],
  conflictColumns: ['id'],

  validateRow(row) {
    if (!row.id || !UUID_RE.test(String(row.id))) return { valid: false, reason: 'missing/invalid id' };
    if (!row.canonical_name) return { valid: false, reason: 'missing canonical_name' };
    return { valid: true };
  },

  async fetchRows(ctx) {
    // Bound to the institutions seeded by the India criteria seeder so the run is
    // verifiable; widen this WHERE clause to enrich any cohort.
    const { rows: insts } = await ctx.pool.query(
      `SELECT id, canonical_name, normalized_name, slug, metadata
         FROM canonical.institutions
        WHERE metadata->>'seed' = 'india_admission_criteria'
        ORDER BY canonical_name
        LIMIT $1`,
      [ctx.limit || 50],
    );

    const out = [];
    for (const inst of insts) {
      await new Promise((r) => setTimeout(r, 300)); // be polite to Wikidata's API
      const facts = await fetchFacts(inst.canonical_name);
      if (!facts || !facts.qid) {
        ctx.logger?.warn?.(`[wikidata] unresolved (skipped): ${inst.canonical_name}`);
        continue;
      }
      const existing = inst.metadata && typeof inst.metadata === 'object' ? inst.metadata : {};
      const merged = {
        ...existing,
        wikidata_id: facts.qid,
        official_website: facts.website || existing.official_website || null,
        founded_year: facts.foundedYear || existing.founded_year || null,
        source_attribution: {
          source: 'Wikidata',
          source_url: `https://www.wikidata.org/wiki/${facts.qid}`,
          updated_at: new Date().toISOString(),
          confidence_score: 0.8,
        },
      };
      out.push({
        id: inst.id,
        canonical_name: inst.canonical_name,
        normalized_name: inst.normalized_name,
        slug: inst.slug,
        metadata: JSON.stringify(merged),
      });
    }
    return out;
  },
};
