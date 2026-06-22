'use strict';

// Generic website-enrichment scraper — the "hit the college's own website, parse
// it, extract what's there" approach for NON-US institutions (US is covered by
// Scorecard). Works uniformly for India / EU / Australia / anywhere: fetch the
// homepage, read the meta/og:description and founding year straight from the page,
// and fill ONLY currently-empty fields (COALESCE — never clobber). Pages that are
// JS-only / 404 / yield nothing are skipped, never fabricated.
//
// Designed to run rolling + throttled (least-recently-updated first), e.g. a daily
// batch, so coverage grows over time without hammering any site.
//
//   node scripts/enrichFromWebsites.js --batch=10
//   node scripts/enrichFromWebsites.js --countries=IN,AU --batch=25 --dry-run
//   node scripts/enrichFromWebsites.js --countries=IN --batch=50

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const arg = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};

const CURRENT_YEAR = new Date().getFullYear();

const NAMED_ENTITIES = { amp: '&', rsquo: "'", lsquo: "'", apos: "'", quot: '"', nbsp: ' ', lt: '<', gt: '>' };
function decode(s) {
  // Single-pass entity decode: every &entity; is replaced exactly once and the
  // output is NOT re-scanned, so a decoded '&' cannot start a second decode (no
  // double-unescaping). Handles &#NN;, &#xNN;, and named entities.
  return String(s || '')
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

// Pure extractor (unit-tested). Returns only confidently-found fields.
function extractFromHtml(html) {
  const h = String(html || '');
  const out = {};

  // meta description / og:description — content can come before or after the name attr
  const metaPatterns = [
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*\bcontent=["']([^"']{20,400})["']/i,
    /<meta[^>]+\bcontent=["']([^"']{20,400})["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i,
  ];
  for (const re of metaPatterns) {
    const m = re.exec(h);
    if (m) { out.description = decode(m[1]); break; }
  }

  // founding year: "established/founded/since/estd 1969" (validate plausible)
  const ym = /(?:establish(?:ed)?|founded|inception|estd\.?|since)\b[^.<>]{0,20}?\b(1[0-9]{3}|20[0-2][0-9])\b/i.exec(h);
  if (ym) {
    const y = parseInt(ym[1], 10);
    if (y >= 1000 && y <= CURRENT_YEAR) out.established_year = y;
  }

  // acceptance rate — only when a page explicitly states it (rare; conservative).
  // Stored as a 0-1 fraction. Tuition/fees are intentionally NOT extracted: too
  // noisy (currency/unit/per-year ambiguity) -> high false-positive risk.
  const RW = '(?:acceptance|admit(?:ted)?|admission)\\s+rate';
  const am = new RegExp(`${RW}[^.%<>]{0,18}?([0-9]{1,2}(?:\\.[0-9])?)\\s*%|([0-9]{1,2}(?:\\.[0-9])?)\\s*%[^.<>]{0,18}?${RW}`, 'i').exec(h);
  if (am) {
    const r = parseFloat(am[1] || am[2]);
    if (r > 0 && r <= 100) out.acceptance_rate = +(r / 100).toFixed(4);
  }
  return out;
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CollegeOS-EnrichBot/1.0 (+https://collegeos.app/bot)' },
      redirect: 'follow', signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true, html: await res.text() };
  } catch (e) { return { ok: false, reason: e.message.slice(0, 40) }; }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const batch = Math.max(1, parseInt(arg('batch', '10'), 10));
  const countries = arg('countries', 'IN,AU,DE,FR,GB,CA,KR,IE,CH,JP,SE,NZ,SG,HK,NL').split(',').map((c) => c.trim().toUpperCase());
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });

  const { rows } = await pool.query(
    `SELECT id, canonical_name, website, country_code
       FROM canonical.institutions
      WHERE country_code = ANY($1)
        AND website IS NOT NULL AND website <> ''
      ORDER BY updated_at NULLS FIRST
      LIMIT $2`,
    [countries, batch]
  );
  console.log(`Enriching ${rows.length} institutions (countries=${countries.join(',')}, batch=${batch})${dryRun ? ' [DRY RUN]' : ''}`);

  const stats = { fetched: 0, enriched: 0, no_data: 0, fetch_failed: 0 };
  for (const inst of rows) {
    let url = inst.website.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const res = await fetchHtml(url); // eslint-disable-line no-await-in-loop
    if (!res.ok) { stats.fetch_failed += 1; console.log(`  ✗ ${inst.canonical_name} (${inst.country_code}) — ${res.reason}`); continue; }
    stats.fetched += 1;
    const ex = extractFromHtml(res.html);
    if (!ex.description && !ex.established_year && ex.acceptance_rate == null) { stats.no_data += 1; console.log(`  – ${inst.canonical_name} — no extractable data`); continue; }
    if (dryRun) { stats.enriched += 1; console.log(`  ~ ${inst.canonical_name}: ${JSON.stringify(ex)}`); continue; }

    // Acceptance rate -> canonical.institution_admissions (where the app reads it).
    // COALESCE on conflict so a website figure never overwrites authoritative
    // Scorecard data.
    if (ex.acceptance_rate != null) {
      try {
        await pool.query( // eslint-disable-line no-await-in-loop
          `INSERT INTO canonical.institution_admissions
             (institution_id, data_year, admissions_cycle, acceptance_rate, exam_requirements, source_attribution, raw_payload, created_at, updated_at)
           VALUES ($1, $2, '2025-2026', $3, '{}'::jsonb, $4::jsonb, '{}'::jsonb, now(), now())
           ON CONFLICT (institution_id, data_year, admissions_cycle) DO UPDATE SET
             acceptance_rate = COALESCE(canonical.institution_admissions.acceptance_rate, EXCLUDED.acceptance_rate),
             updated_at = now()`,
          [inst.id, CURRENT_YEAR, ex.acceptance_rate, JSON.stringify({ source: 'website', source_url: url, confidence: 0.5 })]
        );
        stats.acceptance_rates = (stats.acceptance_rates || 0) + 1;
      } catch (e) { console.warn(`  ! ${inst.canonical_name} acceptance_rate write failed: ${e.message.slice(0, 50)}`); }
    }
    const meta = JSON.stringify({ website_enrichment: { source_url: url, fetched_at: new Date().toISOString(), found: Object.keys(ex) } });
    await pool.query( // eslint-disable-line no-await-in-loop
      `UPDATE canonical.institutions SET
         description = COALESCE(NULLIF(description,''), $2),
         established_year = COALESCE(established_year, $3),
         metadata = COALESCE(metadata,'{}'::jsonb) || $4::jsonb,
         completeness_score = GREATEST(completeness_score, 0.30),
         updated_at = now()
       WHERE id = $1`,
      [inst.id, ex.description || null, ex.established_year || null, meta]
    );
    stats.enriched += 1;
    console.log(`  ✓ ${inst.canonical_name} (${inst.country_code}): ${Object.keys(ex).join(', ')}`);
  }

  if (!dryRun && stats.enriched > 0) {
    try { await pool.query('REFRESH MATERIALIZED VIEW canonical.mv_college_cards'); console.log('MV refreshed'); }
    catch (e) { console.warn('MV refresh skipped:', e.message); }
  }
  console.log(`\nDone: ${JSON.stringify(stats)}`);
  await pool.end();
}

if (require.main === module) {
  main().catch((e) => { console.error('enrichFromWebsites failed:', e.message); process.exit(1); });
}

module.exports = { extractFromHtml };
