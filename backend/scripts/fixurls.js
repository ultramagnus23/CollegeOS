/**
 * fixUrls.js — run once to fix broken URLs in your database
 *
 * Problem: 4,035 colleges have URLs like "www.school.edu" with no https://
 * This causes new URL() to throw, making the scraper return null for every one.
 *
 * Usage:  node scripts/fixUrls.js
 */

const dbManager = require('../src/config/database');

if (require.main === module) {
  async function main() {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
    dbManager.initialize();
    const pool = dbManager.getDatabase();

    console.log('Fixing broken college URLs...\n');

    const r1 = await pool.query(`
      UPDATE colleges
      SET official_website = 'https://' || official_website
      WHERE official_website IS NOT NULL
        AND official_website != ''
        AND official_website NOT LIKE 'http%'
    `);
    console.log(`✓ Fixed ${r1.rowCount} official_website URLs (added https://)`);

    const r2 = await pool.query(`
      UPDATE colleges
      SET admissions_url = 'https://' || admissions_url
      WHERE admissions_url IS NOT NULL
        AND admissions_url != ''
        AND admissions_url NOT LIKE 'http%'
    `);
    console.log(`✓ Fixed ${r2.rowCount} admissions_url URLs (added https://)`);

    const r3 = await pool.query(`
      UPDATE colleges
      SET official_website = TRIM(official_website)
      WHERE official_website != TRIM(official_website)
    `);
    console.log(`✓ Trimmed ${r3.rowCount} URLs with whitespace`);

    const r4 = await pool.query(`
      UPDATE scrape_queue
      SET status = 'pending', attempts = 0, last_error = NULL
      WHERE status = 'failed' AND last_error = 'no_data'
    `);
    console.log(`✓ Reset ${r4.rowCount} failed queue entries for retry`);

    const { rows: brokenRows } = await pool.query(`
      SELECT COUNT(*) as n FROM colleges
      WHERE official_website IS NOT NULL
        AND official_website != ''
        AND official_website NOT LIKE 'http%'
    `);
    const broken = parseInt(brokenRows[0].n);
    console.log(`\n${broken === 0 ? '✅' : '⚠️'} Remaining broken URLs: ${broken}`);

    const { rows: pendingRows } = await pool.query(`SELECT COUNT(*) as n FROM scrape_queue WHERE status = 'pending'`);
    console.log(`📋 Queue pending: ${parseInt(pendingRows[0].n)} colleges ready to retry`);

    console.log('\nDone. Run npm run scrape:admissions to retry.\n');
    await dbManager.close();
  }
  main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}