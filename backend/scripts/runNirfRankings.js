'use strict';

// NIRF ingestion: fetch India's official NIRF ranking pages, and for each ranked
// institution either MATCH an existing canonical Indian institution or CREATE it
// (many top Indian institutions — IIT Kanpur, JNU, BHU, AIIMS Delhi — are absent
// from our DB), then upsert its national rank into canonical.institution_rankings.
// NIRF is the authoritative open government source; nothing is fabricated.
//
//   node scripts/runNirfRankings.js --dry-run
//   node scripts/runNirfRankings.js

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { parseNirfRankings, normalize } = require('../src/scrapers/adapters/nirfRankings');

const YEAR = 2024;
const CATEGORIES = [
  { category: 'Overall', url: `https://www.nirfindia.org/Rankings/${YEAR}/OverallRanking.html` },
  { category: 'University', url: `https://www.nirfindia.org/Rankings/${YEAR}/UniversityRanking.html` },
  { category: 'Engineering', url: `https://www.nirfindia.org/Rankings/${YEAR}/EngineeringRanking.html` },
];

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const slugify = (s) => normalize(s).replace(/\s+/g, '-').slice(0, 80);

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'CollegeOS-NIRFBot/1.0 (+https://collegeos.app/bot)' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Load all Indian institutions once and match in-memory (avoids ~1,200 queries).
async function loadIndia(pool) {
  const r = await pool.query(`SELECT id, canonical_name FROM canonical.institutions WHERE country_code='IN'`);
  return r.rows.map((x) => ({ id: x.id, name: x.canonical_name, norm: normalize(x.canonical_name) }));
}
function matchInstitution(india, name) {
  const norm = normalize(name);
  let hit = india.find((i) => i.name === name) || india.find((i) => i.norm === norm);
  if (hit) return hit.id;
  // substring either direction; prefer the longest canonical name (most specific)
  const subs = india
    .filter((i) => i.norm.length >= 8 && (norm.includes(i.norm) || i.norm.includes(norm)))
    .sort((a, b) => b.norm.length - a.norm.length);
  return subs[0] ? subs[0].id : null;
}

async function createInstitution(pool, r) {
  const slug = `${slugify(r.name)}-nirf`;
  const meta = JSON.stringify({ source: 'NIRF', nirf_institute_id: r.institute_id, created_from: 'nirf-ranking', created_at: new Date().toISOString() });
  const res = await pool.query(
    `INSERT INTO canonical.institutions (canonical_name, normalized_name, slug, country_code, verification_status, source_priority, metadata)
     VALUES ($1, $2, $3, 'IN', 'unverified', 4, $4::jsonb)
     ON CONFLICT (slug) DO NOTHING
     RETURNING id`,
    [r.name, normalize(r.name), slug, meta]
  );
  if (res.rows[0]) return res.rows[0].id;
  const ex = await pool.query(`SELECT id FROM canonical.institutions WHERE slug = $1`, [slug]);
  return ex.rows[0] ? ex.rows[0].id : null;
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
  const stats = { parsed: 0, matched: 0, created: 0, ranked: 0 };
  const seen = new Set();
  try {
    const india = await loadIndia(pool);
    console.log(`[nirf] loaded ${india.length} existing Indian institutions for matching`);
    for (const cat of CATEGORIES) {
      let html;
      try { html = await fetchText(cat.url); } catch (e) { console.warn(`[nirf] ${cat.category} fetch failed: ${e.message}`); continue; }
      const parsed = parseNirfRankings(html);
      console.log(`[nirf] ${cat.category}: ${parsed.length} institutions`);
      for (const r of parsed) {
        if (seen.has(r.institute_id)) continue; // first category (Overall) wins the headline rank
        seen.add(r.institute_id);
        stats.parsed += 1;
        let id = matchInstitution(india, r.name);
        let created = false;
        if (!id && !dryRun) {
          id = await createInstitution(pool, r);
          if (id) { created = true; india.push({ id, name: r.name, norm: normalize(r.name) }); }
        }
        if (!id) { if (dryRun) { console.log(`  would create: ${r.name}`); stats.created += 1; } continue; }
        if (created) stats.created += 1; else stats.matched += 1;
        if (dryRun) continue;
        await pool.query(
          // ranking_year_key is a generated column (computed from ranking_year) — do not insert it.
          `INSERT INTO canonical.institution_rankings (institution_id, ranking_year, ranking_body, national_rank, source_attribution, raw_payload, created_at)
           VALUES ($1, $2, 'NIRF', $3, $4::jsonb, $5::jsonb, now())
           ON CONFLICT (institution_id, ranking_year_key, ranking_body) DO UPDATE SET
             national_rank = EXCLUDED.national_rank, source_attribution = EXCLUDED.source_attribution`,
          [id, String(YEAR), r.rank, JSON.stringify({ source: 'NIRF', category: cat.category, source_url: cat.url, confidence: 0.9 }), JSON.stringify(r)]
        );
        stats.ranked += 1;
      }
    }
    if (!dryRun && (stats.created || stats.ranked)) {
      try { await pool.query('REFRESH MATERIALIZED VIEW canonical.mv_college_cards'); console.log('MV refreshed'); } catch (e) { console.warn('MV refresh skipped:', e.message); }
    }
    console.log(`\nDone: ${JSON.stringify(stats)}`);
  } finally { await pool.end(); }
}

main().catch((e) => { console.error('runNirfRankings failed:', e.message); process.exit(1); });
