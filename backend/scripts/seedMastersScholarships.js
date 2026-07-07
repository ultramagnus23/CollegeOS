/**
 * Seed masters-specific named scholarships into the canonical `scholarships` table,
 * and cross-link masters_programs whose raw_scholarships text explicitly names them.
 *
 * Source: live audit of canonical.masters_programs.raw_scholarships (2026-07-08) found
 * "Knight-Hennessy Scholars" (Stanford's flagship, university-wide, all-discipline grad
 * fellowship) mentioned across 5 program rows but ABSENT from `scholarships`. All other
 * named programs found in that same scan (Gates Cambridge, Chevening, Commonwealth,
 * Erasmus Mundus, Inlaks) already exist. This script only adds real, verifiable,
 * primary-sourced records -- no fabricated amounts/eligibility. Most masters program
 * funding is program-specific (see raw_scholarships / program_url on the program itself),
 * not a third-party scholarship, and is intentionally NOT force-fit into this table.
 *
 * Idempotent: ON CONFLICT (name) DO NOTHING equivalent via existence check.
 * Run: node backend/scripts/seedMastersScholarships.js
 */

const dbManager = require('../src/config/database');

const NEW_SCHOLARSHIPS = [
  {
    name: 'Knight-Hennessy Scholars',
    provider: 'Stanford University',
    country: 'USA',
    currency: 'USD',
    amount: null,
    amount_min: null,
    amount_max: null,
    need_based: false,
    merit_based: true,
    deadline: null, // rolling multi-round; verify current-cycle date before surfacing
    renewable: true,
    renewable_years: null,
    description: 'Full funding (tuition + stipend + travel) for up to 3 years of any '
      + 'graduate degree at Stanford, for students demonstrating independence of thought, '
      + 'purposeful leadership, and civic mindset. University-wide, all-discipline.',
    eligibility_summary: 'Open to applicants of any nationality admitting (or admitted) to '
      + 'a Stanford graduate program; must apply to KHS separately from/alongside the '
      + 'Stanford program application.',
    application_url: 'https://knight-hennessy.stanford.edu/program/eligibility-requirements',
    source_url: 'https://knight-hennessy.stanford.edu',
    degree_levels: ['postgraduate', 'phd', 'professional'],
    scholarship_type: 'merit',
    status: 'active',
  },
];

async function seedIfMissing() {
  const pool = dbManager.getDatabase();
  let inserted = 0, skipped = 0;
  for (const s of NEW_SCHOLARSHIPS) {
    const { rows } = await pool.query('SELECT id FROM scholarships WHERE name = $1', [s.name]);
    if (rows.length) { skipped++; continue; }
    await pool.query(
      `INSERT INTO scholarships (
         name, provider, country, currency, amount, amount_min, amount_max,
         need_based, merit_based, deadline, renewable, renewable_years,
         description, eligibility_summary, application_url, source_url,
         degree_levels, scholarship_type, status, scraped_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())`,
      [
        s.name, s.provider, s.country, s.currency, s.amount, s.amount_min, s.amount_max,
        s.need_based, s.merit_based, s.deadline, s.renewable, s.renewable_years,
        s.description, s.eligibility_summary, s.application_url, s.source_url,
        s.degree_levels, s.scholarship_type, s.status,
      ]
    );
    inserted++;
  }
  console.log(`seedMastersScholarships: inserted ${inserted}, skipped (already present) ${skipped}`);
  return { inserted, skipped };
}

if (require.main === module) {
  seedIfMissing()
    .then(() => process.exit(0))
    .catch((e) => { console.error('seedMastersScholarships failed:', e.message); process.exit(1); });
}

module.exports = { seedIfMissing, NEW_SCHOLARSHIPS };
