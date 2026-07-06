'use strict';

// Extracts early_decision_rate / early_action_rate from the SAME Common Data
// Set PDFs commonDataSetDeadlines.js already fetches for deadline dates --
// the applicant/admit counts sit right next to the dates we already parse,
// so this reuses TARGETS/fetchPdfText/resolveInstitutionId rather than
// re-fetching anything. Writes directly to canonical.institution_admissions
// (different conflict key than institution_deadlines, so this can't just be
// folded into the existing scraperFramework adapter, which targets one
// fixed table).
//
// Usage: node scripts/runCdsAdmissionRatesScraper.js [--dry-run]

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const {
  TARGETS, fetchPdfText, resolveInstitutionId, extractApplicationRates,
} = require('../src/scrapers/adapters/commonDataSetDeadlines');

const DRY = process.argv.includes('--dry-run');
const DATA_YEAR = new Date().getFullYear();

async function main() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

  let updated = 0;
  for (const [name, pdfUrl] of TARGETS) {
    const institutionId = await resolveInstitutionId(pool, name); // eslint-disable-line no-await-in-loop
    if (!institutionId) { console.log(`no institution match for "${name}"; skipping`); continue; } // eslint-disable-line no-continue
    const text = await fetchPdfText(pdfUrl, console); // eslint-disable-line no-await-in-loop
    if (!text) continue; // eslint-disable-line no-continue
    const rates = extractApplicationRates(text);
    if (rates.early_decision_rate == null && rates.early_action_rate == null) {
      console.log(`${name}: no ED/EA applicant counts found; skipping (not fabricating)`);
      continue; // eslint-disable-line no-continue
    }
    console.log(`${name}: ED=${rates.early_decision_rate ?? '-'} EA=${rates.early_action_rate ?? '-'}`);
    if (DRY) { updated++; continue; } // eslint-disable-line no-continue
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      `INSERT INTO canonical.institution_admissions
         (institution_id, data_year, admissions_cycle, early_decision_rate, early_action_rate, source_attribution, updated_at)
       VALUES ($1,$2,'regular',$3,$4,$5::jsonb, now())
       ON CONFLICT (institution_id, data_year, admissions_cycle) DO UPDATE SET
         early_decision_rate=COALESCE(EXCLUDED.early_decision_rate, canonical.institution_admissions.early_decision_rate),
         early_action_rate=COALESCE(EXCLUDED.early_action_rate, canonical.institution_admissions.early_action_rate),
         updated_at=now()`,
      [
        institutionId, DATA_YEAR, rates.early_decision_rate ?? null, rates.early_action_rate ?? null,
        JSON.stringify({ source: 'Common Data Set (self-reported)', source_url: pdfUrl, confidence: 0.85 }),
      ],
    );
    updated++;
  }

  console.log(`Done. ${updated} institutions with ED/EA rate data. dryRun=${DRY}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
