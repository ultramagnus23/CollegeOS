#!/usr/bin/env node

/**
 * View Recent Database Changes
 *
 * Shows recent changes from the scrape_audit_log table.
 *
 * Usage:
 *   node scripts/viewDatabaseChanges.js [limit]
 *   node scripts/viewDatabaseChanges.js 100
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEFAULT_LIMIT = 50;

async function viewRecentChanges(limit = DEFAULT_LIMIT) {
  const dbManager = require('../src/config/database');
  dbManager.initialize();
  const pool = dbManager.getDatabase();

  try {
    console.log('\n' + '═'.repeat(70));
    console.log(`     Recent Database Changes (Last ${limit})`);
    console.log('═'.repeat(70) + '\n');

    const { rows: changes } = await pool.query(`
      SELECT
        sal.college_id,
        c.name as college_name,
        sal.field_name,
        sal.old_value,
        sal.new_value,
        sal.confidence_score,
        sal.source_url,
        sal.extraction_method,
        sal.scraped_at
      FROM scrape_audit_log sal
      JOIN colleges c ON sal.college_id = c.id
      ORDER BY sal.scraped_at DESC
      LIMIT $1
    `, [limit]);

    if (changes.length === 0) {
      console.log('📭 No changes found in scrape_audit_log.');
      console.log('\nThis means either:');
      console.log('  1. Scraping hasn\'t run yet');
      console.log('  2. No data was changed (all up-to-date)');
      console.log('  3. Audit logging is not enabled\n');
      await dbManager.close();
      return;
    }

    // Group changes by college + scraped_at
    const collegeChanges = {};
    changes.forEach(change => {
      const key = `${change.college_id}_${change.scraped_at}`;
      if (!collegeChanges[key]) {
        collegeChanges[key] = {
          college_id: change.college_id,
          college_name: change.college_name,
          scraped_at: change.scraped_at,
          changes: []
        };
      }
      collegeChanges[key].changes.push(change);
    });

    let count = 0;
    Object.values(collegeChanges).forEach(group => {
      count++;
      console.log(`College: ${group.college_name} (ID: ${group.college_id})`);

      group.changes.forEach((change, idx) => {
        const isLast = idx === group.changes.length - 1;
        const prefix = isLast ? '└─' : '├─';

        const oldVal = change.old_value === null ? 'null' : change.old_value;
        const newVal = change.new_value === null ? 'null' : change.new_value;

        console.log(`${prefix} ${change.field_name}: ${oldVal} → ${newVal}`);
        console.log(`   Confidence: ${change.confidence_score || 'N/A'}`);
        if (change.source_url) console.log(`   Source: ${change.source_url}`);
        if (change.extraction_method) console.log(`   Method: ${change.extraction_method}`);
      });

      console.log(`   Scraped: ${group.scraped_at}`);
      console.log(`   Fields Updated: ${group.changes.length}`);

      const avgConfidence = group.changes
        .filter(c => c.confidence_score !== null)
        .reduce((sum, c) => sum + parseFloat(c.confidence_score), 0) / group.changes.length;

      if (!isNaN(avgConfidence)) {
        console.log(`   Avg Confidence: ${avgConfidence.toFixed(2)}`);
      }

      console.log('');
    });

    console.log('─'.repeat(70));
    console.log(`Total: ${count} scraping sessions shown`);
    console.log(`Total changes: ${changes.length} fields updated`);
    console.log('─'.repeat(70) + '\n');
  } catch (error) {
    console.error('❌ Error reading database:', error.message);
    console.error('\nMake sure:');
    console.error('  1. DATABASE_URL is set in backend/.env');
    console.error('  2. Migrations have been run: npm run migrate');
    console.error('  3. Scraping has been run at least once\n');
    process.exit(1);
  } finally {
    await dbManager.close();
  }
}

const limit = parseInt(process.argv[2]) || DEFAULT_LIMIT;

if (isNaN(limit) || limit < 1) {
  console.error('❌ Invalid limit. Please provide a positive number.');
  console.error('Usage: node scripts/viewDatabaseChanges.js [limit]');
  process.exit(1);
}

viewRecentChanges(limit);
