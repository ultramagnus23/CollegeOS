/**
 * Seed script for verified university data
 * Seeds 2500+ universities from JSON data files
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Database path
const DB_PATH = path.join(__dirname, '..', 'database.sqlite');

// Data directory
const VERIFIED_DATA_DIR = path.join(__dirname, '..', 'data', 'verified');

// All data files to load
const DATA_FILES = [
  'top_200_verified.json',
  'universities_51_100.json',
  'universities_101_200.json',
  'universities_201_400.json',
  'universities_401_600.json',
  'universities_601_800.json',
  'universities_801_1000.json',
  'universities_1001_1200.json',
  'universities_1201_1400.json',
  'universities_1401_1600.json',
  'universities_1601_1800.json',
  'universities_1801_2000.json',
  'universities_2001_2200.json',
  'universities_2201_2500.json'
];

function loadAllUniversities() {
  const allUniversities = [];
  const seenNames = new Set();
  
  for (const file of DATA_FILES) {
    const filePath = path.join(VERIFIED_DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const uni of data) {
          // Deduplicate by name
          const key = uni.name?.toLowerCase().trim();
          if (key && !seenNames.has(key)) {
            seenNames.add(key);
            allUniversities.push(uni);
          }
        }
        console.log(`✓ Loaded ${data.length} universities from ${file}`);
      } catch (err) {
        console.error(`✗ Error loading ${file}:`, err.message);
      }
    } else {
      console.log(`  Skipped ${file} (not found)`);
    }
  }
  
  return allUniversities;
}

function seedDatabase(universities, forceReseed = false) {
  const db = new Database(DB_PATH);
  
  // Create colleges table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS colleges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(255) NOT NULL UNIQUE,
      website_url VARCHAR(500),
      location_city VARCHAR(100),
      location_state VARCHAR(100),
      location_country VARCHAR(100),
      institution_type VARCHAR(50),
      total_enrollment INTEGER,
      acceptance_rate DECIMAL(5,2),
      retention_rate DECIMAL(5,2),
      graduation_rate_4yr DECIMAL(5,2),
      student_faculty_ratio VARCHAR(20),
      sat_ebrw_25th INTEGER,
      sat_ebrw_75th INTEGER,
      sat_math_25th INTEGER,
      sat_math_75th INTEGER,
      sat_total_25th INTEGER,
      sat_total_75th INTEGER,
      act_composite_25th INTEGER,
      act_composite_75th INTEGER,
      avg_gpa DECIMAL(3,2),
      tuition_in_state INTEGER,
      tuition_out_of_state INTEGER,
      room_and_board INTEGER,
      avg_aid_package INTEGER,
      qs_ranking INTEGER,
      the_ranking INTEGER,
      popular_majors TEXT,
      campus_type VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  if (forceReseed) {
    console.log('\nClearing existing colleges...');
    db.exec('DELETE FROM colleges');
  }
  
  console.log('\nInserting universities...');
  
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO colleges (
      name, website_url, location_city, location_state, location_country,
      institution_type, total_enrollment, acceptance_rate, graduation_rate_4yr,
      tuition_out_of_state, qs_ranking, popular_majors, campus_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  let failed = 0;
  
  for (const uni of universities) {
    try {
      stmt.run(
        uni.name || 'Unknown',
        uni.website || null,
        uni.city || null,
        uni.state || null,
        uni.country || 'Unknown',
        uni.institution_type || 'Public',
        uni.student_population || null,
        uni.acceptance_rate || null,
        uni.graduation_rate_4yr || null,
        uni.tuition_international_usd || null,
        uni.qs_ranking || null,
        Array.isArray(uni.popular_majors) ? uni.popular_majors.join(', ') : (uni.popular_majors || null),
        uni.campus_type || null
      );
      inserted++;
    } catch (err) {
      failed++;
      console.error(`Failed to insert ${uni.name}:`, err.message);
    }
  }
  
  console.log(`\n=== SEEDING COMPLETE ===`);
  console.log(`✓ Inserted: ${inserted}`);
  console.log(`✗ Failed: ${failed}`);
  
  // Count final
  const row = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`📊 Total colleges in database: ${row.count}`);
  
  db.close();
  return { inserted, failed, total: row.count };
}

function main() {
  const args = process.argv.slice(2);
  const forceReseed = args.includes('--force') || args.includes('-f');
  const checkOnly = args.includes('--check') || args.includes('-c');
  
  console.log('=== VERIFIED UNIVERSITY DATA SEEDING ===\n');
  
  // Load all universities
  const universities = loadAllUniversities();
  console.log(`\n📚 Total unique universities loaded: ${universities.length}`);
  
  // Count by country
  const byCountry = {};
  for (const uni of universities) {
    const country = uni.country || 'Unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;
  }
  
  console.log('\n🌍 By Country (Top 20):');
  const sortedCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [country, count] of sortedCountries) {
    console.log(`  ${country}: ${count}`);
  }
  
  if (checkOnly) {
    console.log('\n(Check only mode - not seeding)');
    return;
  }
  
  // Seed to database
  try {
    const result = seedDatabase(universities, forceReseed);
    console.log(`\n🎓 Database now has ${result.total} colleges`);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

main();
