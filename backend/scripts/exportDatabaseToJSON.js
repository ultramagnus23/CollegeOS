#!/usr/bin/env node

/**
 * Export Database to JSON
 *
 * Exports the entire database back to JSON format.
 * Useful for backups or external analysis tools.
 *
 * Creates: backend/data/unified_colleges_updated.json
 *
 * Usage:
 *   node scripts/exportDatabaseToJSON.js
 */

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const OUTPUT_PATH = path.join(__dirname, '../data/unified_colleges_updated.json');

async function exportDatabaseToJSON() {
  const dbManager = require('../src/config/database');
  dbManager.initialize();
  const pool = dbManager.getDatabase();

  try {
    console.log('\n' + '═'.repeat(70));
    console.log('     Export Database to JSON');
    console.log('═'.repeat(70) + '\n');

    console.log('📊 Reading colleges from database...');

    const { rows: colleges } = await pool.query(`
      SELECT
        c.*,
        cc.total_enrollment, cc.undergraduate_enrollment, cc.graduate_enrollment,
        cc.institution_type, cc.classification, cc.religious_affiliation,
        cc.founding_year, cc.campus_size_acres, cc.urban_classification,
        ca.acceptance_rate, ca.test_optional_flag,
        ass.sat_25, ass.sat_50, ass.sat_75, ass.act_25, ass.act_50, ass.act_75,
        ass.gpa_25, ass.gpa_50, ass.gpa_75,
        cfd.tuition_in_state, cfd.tuition_out_of_state, cfd.tuition_international,
        cfd.room_and_board, cfd.books_and_supplies, cfd.total_cost_of_attendance,
        cfd.average_net_price, cfd.median_debt,
        ao.graduation_rate_4yr, ao.graduation_rate_6yr, ao.retention_rate,
        ao.median_salary_6yr, ao.median_salary_10yr,
        sd.percent_male, sd.percent_female, sd.percent_white, sd.percent_black,
        sd.percent_hispanic, sd.percent_asian, sd.percent_international,
        cl.housing_guarantee, cl.distance_only,
        (SELECT STRING_AGG(program_name, '|') FROM college_programs WHERE college_id = c.id) as programs
      FROM colleges c
      LEFT JOIN colleges_comprehensive cc ON c.id = cc.college_id
      LEFT JOIN college_admissions ca ON c.id = ca.college_id
      LEFT JOIN admitted_student_stats ass ON c.id = ass.college_id
      LEFT JOIN college_financial_data cfd ON c.id = cfd.college_id
      LEFT JOIN academic_outcomes ao ON c.id = ao.college_id
      LEFT JOIN student_demographics sd ON c.id = sd.college_id
      LEFT JOIN campus_life cl ON c.id = cl.college_id
      ORDER BY c.id
    `);

    console.log(`✅ Found ${colleges.length} colleges\n`);

    console.log('🔄 Converting to JSON format...');

    const exportData = colleges.map(college => {
      if (college.programs) {
        college.programs = college.programs.split('|');
      }
      return {
        ...college,
        exported_at: new Date().toISOString(),
        source: 'CollegeOS Database Export'
      };
    });

    const output = {
      metadata: {
        export_date: new Date().toISOString(),
        source: 'CollegeOS Database',
        total_colleges: colleges.length,
        version: '2.0',
        note: 'This file was automatically generated from the database. It includes all scraped and updated data.'
      },
      colleges: exportData
    };

    console.log('💾 Writing to file...');

    const dataDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

    const stats = fs.statSync(OUTPUT_PATH);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('\n' + '═'.repeat(70));
    console.log('✅ Export Complete!');
    console.log('═'.repeat(70));
    console.log(`📁 File: ${OUTPUT_PATH}`);
    console.log(`📊 Colleges: ${colleges.length}`);
    console.log(`💾 Size: ${sizeMB} MB`);
    console.log(`🕐 Date: ${new Date().toISOString()}`);
    console.log('═'.repeat(70) + '\n');

    console.log('💡 Tips:');
    console.log('  - Use this file for backups');
    console.log('  - Import into external tools for analysis');
    console.log('  - Compare with original unified_colleges.json to see changes');
    console.log('  - This file contains all scraped and updated data\n');
  } catch (error) {
    console.error('\n❌ Error exporting database:', error.message);
    console.error('\nMake sure:');
    console.error('  1. DATABASE_URL is set in backend/.env');
    console.error('  2. Migrations have been run: npm run migrate');
    console.error('  3. Database has been seeded: npm run seed');
    console.error('  4. You have write permissions in backend/data/\n');
    process.exit(1);
  } finally {
    await dbManager.close();
  }
}

exportDatabaseToJSON();
