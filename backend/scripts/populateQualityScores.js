// backend/scripts/populateQualityScores.js
// Rerunnable repair job: (re)computes canonical.institution_quality_scores for
// every institution via canonical.recompute_quality_scores() (migration 109).
// Scores are derived only from data already in the canonical layer — coverage
// (completeness), lineage (sections populated), freshness (updated_at),
// consistency (impossible-value penalties). No external calls, no fabrication.
//
// Usage: node scripts/populateQualityScores.js
// Requires DATABASE_URL in backend/.env.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dbManager = require('../src/config/database');

async function main() {
  const pool = dbManager.initialize();
  const client = await pool.connect();
  try {
    console.log('\n🔄 Recomputing institution quality scores...\n');
    const { rows: updated } = await client.query('SELECT canonical.recompute_quality_scores() AS rows_written');
    console.log(`✅ Wrote ${updated[0].rows_written} institution_quality_scores rows.\n`);

    const { rows: summary } = await client.query(`
      SELECT
        count(*)::int                                        AS total,
        round(avg(final_quality_score), 1)                   AS avg_final,
        count(*) FILTER (WHERE final_quality_score >= 80)::int AS ge80,
        count(*) FILTER (WHERE final_quality_score <  50)::int AS lt50,
        round(avg(freshness_score), 1)                       AS avg_freshness,
        round(avg(lineage_score), 1)                         AS avg_lineage,
        round(avg(consistency_score), 1)                     AS avg_consistency
      FROM canonical.institution_quality_scores
    `);
    console.table(summary);
  } catch (err) {
    console.error('\n❌ populateQualityScores failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await dbManager.close();
  }
}

main();
