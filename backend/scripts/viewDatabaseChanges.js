#!/usr/bin/env node

/**
 * View Recent Database Changes
 * 
 * Shows recent changes from the scrape_audit_log table.
 * This lets you see what the scraper has been updating.
 * 
 * Usage:
 *   node scripts/viewDatabaseChanges.js [limit]
 *   node scripts/viewDatabaseChanges.js 100
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../database/college_app.db');
const DEFAULT_LIMIT = 50;

function viewRecentChanges(limit = DEFAULT_LIMIT) {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    
    console.log('\n' + '═'.repeat(70));
    console.log(`     Recent Database Changes (Last ${limit})`);
    console.log('═'.repeat(70) + '\n');

    // Get recent changes from audit log
    const changes = db.prepare(`
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
      LIMIT ?
    `).all(limit);

    if (changes.length === 0) {
      console.log('📭 No changes found in scrape_audit_log.');
      console.log('\nThis means either:');
      console.log('  1. Scraping hasn\'t run yet');
      console.log('  2. No data was changed (all up-to-date)');
      console.log('  3. Audit logging is not enabled\n');
      db.close();
      return;
    }

    // Group changes by college
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

    // Display grouped changes
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
        if (change.source_url) {
          console.log(`   Source: ${change.source_url}`);
        }
        if (change.extraction_method) {
          console.log(`   Method: ${change.extraction_method}`);
        }
      });
      
      console.log(`   Scraped: ${group.scraped_at}`);
      console.log(`   Fields Updated: ${group.changes.length}`);
      
      const avgConfidence = group.changes
        .filter(c => c.confidence_score !== null)
        .reduce((sum, c) => sum + parseFloat(c.confidence_score), 0) / group.changes.length;
      
      if (!isNaN(avgConfidence)) {
        console.log(`   Avg Confidence: ${avgConfidence.toFixed(2)}`);
      }
      
      console.log(''); // Empty line between colleges
    });

    console.log('─'.repeat(70));
    console.log(`Total: ${count} scraping sessions shown`);
    console.log(`Total changes: ${changes.length} fields updated`);
    console.log('─'.repeat(70) + '\n');

    db.close();
  } catch (error) {
    console.error('❌ Error reading database:', error.message);
    console.error('\nMake sure:');
    console.error('  1. Database exists: backend/database/college_app.db');
    console.error('  2. Migrations have been run: npm run migrate');
    console.error('  3. Scraping has been run at least once\n');
    process.exit(1);
  }
}

// Parse command line arguments
const limit = parseInt(process.argv[2]) || DEFAULT_LIMIT;

if (isNaN(limit) || limit < 1) {
  console.error('❌ Invalid limit. Please provide a positive number.');
  console.error('Usage: node scripts/viewDatabaseChanges.js [limit]');
  process.exit(1);
}

// Run
viewRecentChanges(limit);
