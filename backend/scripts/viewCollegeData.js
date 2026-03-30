#!/usr/bin/env node

/**
 * View College Data
 *
 * Shows all data for a specific college from the database.
 * Includes data from all comprehensive tables.
 *
 * Usage:
 *   node scripts/viewCollegeData.js "College Name"
 *   node scripts/viewCollegeData.js "Duke University"
 *   node scripts/viewCollegeData.js "Stanford"
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function viewCollegeData(searchName) {
  const dbManager = require('../src/config/database');
  dbManager.initialize();
  const pool = dbManager.getDatabase();

  try {
    const { rows: colleges } = await pool.query(`
      SELECT id, name, city, state, country, website_url
      FROM colleges
      WHERE name ILIKE $1
      ORDER BY
        CASE
          WHEN name = $2 THEN 0
          WHEN name ILIKE $3 THEN 1
          ELSE 2
        END,
        name
      LIMIT 5
    `, [`%${searchName}%`, searchName, `${searchName}%`]);

    if (colleges.length === 0) {
      console.log(`\n❌ No colleges found matching "${searchName}"\n`);
      console.log('Try:');
      console.log('  - Checking spelling');
      console.log('  - Using partial name (e.g., "Duke" instead of "Duke University")');
      console.log('  - Using different keywords\n');
      await dbManager.close();
      process.exit(1);
    }

    if (colleges.length > 1) {
      console.log(`\n📋 Found ${colleges.length} matching colleges:\n`);
      colleges.forEach((c, idx) => {
        console.log(`${idx + 1}. ${c.name} (${c.city}, ${c.state || c.country})`);
      });
      console.log('\n💡 Tip: Use the exact name for best results\n');
      await dbManager.close();
      return;
    }

    const college = colleges[0];

    console.log('\n' + '═'.repeat(70));
    console.log(`     ${college.name}`);
    console.log('═'.repeat(70));
    console.log(`ID: ${college.id}`);
    console.log(`Location: ${college.city}, ${college.state || college.country}`);
    console.log(`Website: ${college.website_url || 'N/A'}`);
    console.log('═'.repeat(70) + '\n');

    const queries = {
      'Basic Info': `SELECT * FROM colleges WHERE id = $1`,
      'Comprehensive': `SELECT * FROM colleges_comprehensive WHERE college_id = $1`,
      'Admissions': `SELECT * FROM college_admissions WHERE college_id = $1`,
      'Student Stats': `SELECT * FROM admitted_student_stats WHERE college_id = $1`,
      'Financial': `SELECT * FROM college_financial_data WHERE college_id = $1`,
      'Academic Outcomes': `SELECT * FROM academic_outcomes WHERE college_id = $1`,
      'Demographics': `SELECT * FROM student_demographics WHERE college_id = $1`,
      'Campus Life': `SELECT * FROM campus_life WHERE college_id = $1`,
      'Rankings': `SELECT * FROM college_rankings WHERE college_id = $1`
    };

    for (const [section, query] of Object.entries(queries)) {
      try {
        const { rows } = await pool.query(query, [college.id]);
        const data = rows[0];

        console.log(`\n${section}:`);
        console.log('─'.repeat(70));

        if (data) {
          const entries = Object.entries(data).filter(([key]) =>
            key !== 'id' && key !== 'college_id'
          );

          if (entries.length > 0) {
            entries.forEach(([key, value]) => {
              if (value !== null && value !== '') {
                const displayValue = typeof value === 'string' && value.length > 60
                  ? value.substring(0, 57) + '...'
                  : value;
                console.log(`  ${key}: ${displayValue}`);
              }
            });
          } else {
            console.log('  (No data available)');
          }
        } else {
          console.log('  (No data available)');
        }
      } catch (err) {
        console.log(`  (Table not available: ${err.message})`);
      }
    }

    // Show recent scraping history
    console.log('\n\nRecent Scraping History:');
    console.log('─'.repeat(70));

    const { rows: history } = await pool.query(`
      SELECT
        field_name,
        old_value,
        new_value,
        confidence_score,
        source_url,
        scraped_at
      FROM scrape_audit_log
      WHERE college_id = $1
      ORDER BY scraped_at DESC
      LIMIT 20
    `, [college.id]);

    if (history.length > 0) {
      history.forEach(h => {
        console.log(`\n  ${h.field_name}:`);
        console.log(`    ${h.old_value || 'null'} → ${h.new_value || 'null'}`);
        console.log(`    Confidence: ${h.confidence_score || 'N/A'}`);
        if (h.source_url) console.log(`    Source: ${h.source_url}`);
        console.log(`    Updated: ${h.scraped_at}`);
      });
    } else {
      console.log('  No scraping history found.');
      console.log('  This college hasn\'t been scraped yet, or audit logging is disabled.');
    }

    console.log('\n' + '═'.repeat(70) + '\n');
  } catch (error) {
    console.error('❌ Error reading database:', error.message);
    console.error('\nMake sure:');
    console.error('  1. DATABASE_URL is set in backend/.env');
    console.error('  2. Migrations have been run: npm run migrate');
    console.error('  3. Database has been seeded: npm run seed\n');
    process.exit(1);
  } finally {
    await dbManager.close();
  }
}

const searchName = process.argv.slice(2).join(' ');

if (!searchName) {
  console.error('\n❌ Please provide a college name to search for.\n');
  console.error('Usage: node scripts/viewCollegeData.js "College Name"');
  console.error('Example: node scripts/viewCollegeData.js "Duke University"\n');
  process.exit(1);
}

viewCollegeData(searchName);
