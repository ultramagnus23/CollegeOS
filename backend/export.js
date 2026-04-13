const Database = require('better-sqlite3');
const fs = require('fs');

const db = new Database('./data/colleges.db');

// Export main colleges table
const colleges = db.prepare('SELECT * FROM colleges_comprehensive').all();
console.log('Exported colleges_comprehensive:', colleges.length, 'rows');
if (colleges.length > 0) console.log('Columns:', Object.keys(colleges[0]).join(', '));
fs.writeFileSync('./data/colleges_export.json', JSON.stringify(colleges, null, 2));

// Export supporting tables
const tables = [
  'college_admissions',
  'admitted_student_stats',
  'academic_outcomes',
  'college_financial_data',
  'college_programs',
  'student_demographics',
  'campus_life',
  'college_rankings',
  'predictive_metrics',
  'career_outcomes_detail',
  'academic_details',
  'application_requirements',
  'application_deadlines',
];

for (const table of tables) {
  try {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    fs.writeFileSync(`./data/${table}_export.json`, JSON.stringify(rows, null, 2));
    console.log(`Exported ${table}: ${rows.length} rows`);
  } catch(e) {
    console.log(`Skipped ${table}: ${e.message}`);
  }
}

console.log('\nDone. Check backend/data/ for all export files.');