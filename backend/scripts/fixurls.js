/**
 * fixUrls.js — run once to fix broken URLs in your database
 * 
 * Problem: 4,035 colleges have URLs like "www.school.edu" with no https://
 * This causes new URL() to throw, making the scraper return null for every one.
 *
 * Usage:  node scripts/fixUrls.js
 */

const dbManager = require('../src/config/database');
const db = dbManager.getDatabase();

console.log('Fixing broken college URLs...\n');

// Fix missing https:// on official_website
const r1 = db.prepare(`
  UPDATE colleges
  SET official_website = 'https://' || official_website
  WHERE official_website IS NOT NULL
    AND official_website != ''
    AND official_website NOT LIKE 'http%'
`).run();
console.log(`✓ Fixed ${r1.changes} official_website URLs (added https://)`);

// Fix missing https:// on admissions_url  
const r2 = db.prepare(`
  UPDATE colleges
  SET admissions_url = 'https://' || admissions_url
  WHERE admissions_url IS NOT NULL
    AND admissions_url != ''
    AND admissions_url NOT LIKE 'http%'
`).run();
console.log(`✓ Fixed ${r2.changes} admissions_url URLs (added https://)`);

// Strip any trailing whitespace from URLs
const r3 = db.prepare(`
  UPDATE colleges
  SET official_website = TRIM(official_website)
  WHERE official_website != TRIM(official_website)
`).run();
console.log(`✓ Trimmed ${r3.changes} URLs with whitespace`);

// Reset failed queue entries so they get retried
const r4 = db.prepare(`
  UPDATE scrape_queue
  SET status = 'pending', attempts = 0, last_error = NULL
  WHERE status = 'failed' AND last_error = 'no_data'
`).run();
console.log(`✓ Reset ${r4.changes} failed queue entries for retry`);

// Verify
const broken = db.prepare(`
  SELECT COUNT(*) as n FROM colleges
  WHERE official_website IS NOT NULL
    AND official_website != ''
    AND official_website NOT LIKE 'http%'
`).get();
console.log(`\n${broken.n === 0 ? '✅' : '⚠️'} Remaining broken URLs: ${broken.n}`);

const pending = db.prepare(`SELECT COUNT(*) as n FROM scrape_queue WHERE status = 'pending'`).get();
console.log(`📋 Queue pending: ${pending.n} colleges ready to retry`);

console.log('\nDone. Run npm run scrape:admissions to retry.\n');