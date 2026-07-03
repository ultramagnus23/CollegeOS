// backend/scripts/generateEmbeddings.js
//
// Generates and upserts canonical.institution_embeddings for institutions that
// don't have one yet, using the existing embeddingService.js (deterministic
// text-hashing embedding — see that file for the algorithm; no ML API call,
// no external cost, real deterministic feature hashing over real institution
// text fields, not fabricated data).
//
// Usage:
//   node scripts/generateEmbeddings.js --batch=1000
//   node scripts/generateEmbeddings.js --batch=10 --dry

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dbManager = require('../src/config/database');
const { upsertInstitutionEmbedding, EMBEDDING_MODEL } = require('../src/services/recommendation/embeddingService');

const arg = (name, def) => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split('=')[1] : def;
};
const DRY = process.argv.includes('--dry');
const BATCH = Math.max(1, parseInt(arg('batch', '1000'), 10) || 1000);

async function main() {
  const pool = dbManager.initialize();
  const client = await pool.connect();
  client.on('error', (err) => console.error('  pg client error (continuing):', err.message));
  const summary = { selected: 0, generated: 0, errors: 0 };
  try {
    const { rows: targets } = await client.query(
      `SELECT c.id, c.canonical_name AS name, c.country_code AS country, c.institution_type,
              c.description,
              c.metadata,
              COALESCE(c.employment_rate::text, '') || ' ' || COALESCE(c.graduation_rate_4yr::text, '') AS outcomes_summary,
              COALESCE(c.global_rank::text, '') AS rankings_summary,
              ARRAY(SELECT program_name FROM canonical.institution_programs ip WHERE ip.institution_id = c.id LIMIT 50) AS programs
       FROM canonical.mv_college_cards c
       LEFT JOIN canonical.institution_embeddings ie
         ON ie.institution_id = c.id AND ie.model_name = $1
       WHERE ie.institution_id IS NULL
       ORDER BY c.popularity_score DESC NULLS LAST, c.id
       LIMIT $2`,
      [EMBEDDING_MODEL, BATCH],
    );
    summary.selected = targets.length;
    console.log(`Generating embeddings for ${targets.length} institutions without one${DRY ? ' [DRY RUN]' : ''}`);

    for (let i = 0; i < targets.length; i += 1) {
      const inst = targets[i];
      if (DRY) {
        if (i < 5) console.log(`  would embed: ${inst.name}`);
        continue;
      }
      try {
        await upsertInstitutionEmbedding(inst); // eslint-disable-line no-await-in-loop
        summary.generated += 1;
      } catch (e) {
        summary.errors += 1;
        console.error(`  embed ${inst.name} failed:`, e.message);
      }
      if ((i + 1) % 200 === 0) process.stdout.write(`  progress ${i + 1}/${targets.length}\r`);
    }

    console.log('\nDone:', JSON.stringify(summary));
  } catch (e) {
    console.error('FATAL', e.message); process.exitCode = 1;
  } finally {
    client.release();
    await dbManager.close();
  }
}

main();
