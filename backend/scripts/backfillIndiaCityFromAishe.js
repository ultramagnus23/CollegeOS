'use strict';

// Backfills city/address for canonical.institutions (country_code='IN') from the
// AISHE (All India Survey on Higher Education) college directory -- real
// government open data, originally data.gov.in/catalog/institutions-aishe-survey,
// mirrored as a flat CSV at:
//   https://raw.githubusercontent.com/PriyanKishoreMS/colleges-api/master/data/colleges.csv
// Matches by exact normalized institution name (~96/492 of our current India
// institutions are individually-named colleges that appear verbatim in the
// AISHE list; most of our 492 are universities, which AISHE lists separately
// from its ~43k affiliated-college directory, hence the low match count).
// Only fills city/address when currently NULL -- never overwrites.
//
// Usage: node scripts/backfillIndiaCityFromAishe.js <path-to-colleges.csv> [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry-run');
const csvPath = process.argv[2];
if (!csvPath || !fs.existsSync(csvPath)) {
  console.error('Usage: node backfillIndiaCityFromAishe.js <path-to-colleges.csv> [--dry-run]');
  process.exit(1);
}

function normalize(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvLine(line) {
  // id,state,name,address_line1,address_line2,city,district,pin_code -- name/address may be quoted
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  const lines = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1);
  const byName = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const [, state, name, addr1, addr2, city, district] = cols;
    if (!name) continue;
    byName.set(normalize(name), { state, addr1, addr2, city, district });
  }
  console.log(`Parsed ${byName.size} AISHE college rows`);

  const { rows: insts } = await pool.query(
    `SELECT id, canonical_name FROM canonical.institutions WHERE country_code = 'IN' AND (city IS NULL OR address IS NULL)`
  );
  console.log(`${insts.length} Indian institutions missing city/address`);

  let updated = 0;
  for (const inst of insts) {
    const match = byName.get(normalize(inst.canonical_name));
    if (!match) continue;
    const city = match.city || match.district || null;
    const address = [match.addr1, match.addr2].filter(Boolean).join(', ') || null;
    if (!city && !address) continue;
    if (DRY) { updated++; continue; }
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `UPDATE canonical.institutions
         SET city = COALESCE(city, $1), address = COALESCE(address, $2),
             state_region = COALESCE(state_region, $3), updated_at = now()
       WHERE id = $4`,
      [city, address, match.state || null, inst.id]
    );
    updated++;
  }

  console.log(`Done. Matched & updated ${updated} institutions. dryRun=${DRY}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
