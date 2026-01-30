// backend/scripts/seedFromJSON.js
// Comprehensive seed script that reads from JSON data files
// Creates 2500+ colleges from global dataset (85 countries)

const path = require('path');
const fs = require('fs');

// Load database manager
const dbManager = require('../src/config/database');

console.log('🌍 CollegeOS Global College Database Seeder\n');

// Initialize database and run migrations
dbManager.initialize();
dbManager.runMigrations();
const db = dbManager.getDatabase();

console.log('✅ Database initialized\n');

// Path to college data files
const dataDir = path.join(__dirname, '../data/colleges');

// Get all JSON files in the data directory
function loadCollegeDataFiles() {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  console.log(`📁 Found ${files.length} college data files\n`);
  
  let allColleges = [];
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`  📄 ${file}: ${data.length} colleges`);
    allColleges = allColleges.concat(data);
  }
  
  console.log(`\n📊 Total colleges loaded: ${allColleges.length}\n`);
  return allColleges;
}

// Map new schema to actual database schema
function mapToDbSchema(college) {
  // Build location string
  const city = college.City || '';
  const state = college.Region_State_Province || '';
  const location = city && state ? `${city}, ${state}` : city || state;
  
  // Build academic strengths from key programs
  const academicStrengths = college.Key_Programs_Specializations || '';
  
  // Build major categories
  const majorCategories = college.Key_Programs_Specializations ? 
    JSON.stringify(college.Key_Programs_Specializations.split(', ')) : null;
  
  // For colleges without Website_URL, create a placeholder that indicates it needs verification
  const websiteUrl = college.Website_URL || 
    `https://www.google.com/search?q=${encodeURIComponent(college.Institution_Name + ' official website')}`;
  
  return {
    name: college.Institution_Name,
    country: college.Country || 'Unknown',
    location: location,
    official_website: websiteUrl,
    admissions_url: college.Website_URL ? college.Website_URL + '/admissions' : null,
    programs_url: college.Website_URL ? college.Website_URL + '/programs' : null,
    application_portal_url: null,
    academic_strengths: academicStrengths,
    major_categories: majorCategories,
    trust_tier: college.Website_URL ? 'official' : 'unverified',
    is_verified: college.Website_URL ? 1 : 0
  };
}

// Clear existing colleges (optional)
function clearExistingColleges() {
  console.log('🗑️  Clearing existing college data...');
  db.exec('DELETE FROM colleges');
  console.log('✅ Existing data cleared\n');
}

// Seed colleges from JSON data
function seedColleges(colleges) {
  console.log(`🌱 Seeding ${colleges.length} colleges...\n`);
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO colleges (
      name, country, location, official_website, admissions_url,
      programs_url, application_portal_url, academic_strengths,
      major_categories, trust_tier, is_verified, created_at, updated_at
    ) VALUES (
      @name, @country, @location, @official_website, @admissions_url,
      @programs_url, @application_portal_url, @academic_strengths,
      @major_categories, @trust_tier, @is_verified, datetime('now'), datetime('now')
    )
  `);
  
  let inserted = 0;
  let errors = 0;
  
  for (const college of colleges) {
    try {
      const mapped = mapToDbSchema(college);
      insertStmt.run(mapped);
      inserted++;
    } catch (err) {
      console.error(`❌ Failed to insert ${college.Institution_Name}: ${err.message}`);
      errors++;
    }
  }
  
  console.log(`\n✅ Successfully inserted: ${inserted} colleges`);
  if (errors > 0) console.log(`⚠️  Errors: ${errors}`);
  
  return inserted;
}

// Show statistics
function showStats() {
  console.log('\n📊 Database Statistics:\n');
  
  const total = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`   Total colleges: ${total.count}`);
  
  const byCountry = db.prepare(`
    SELECT country, COUNT(*) as count 
    FROM colleges 
    GROUP BY country 
    ORDER BY count DESC
    LIMIT 15
  `).all();
  
  console.log('\n   By Country (Top 15):');
  byCountry.forEach(row => {
    console.log(`     ${row.country}: ${row.count}`);
  });
  
  const verified = db.prepare('SELECT COUNT(*) as count FROM colleges WHERE is_verified = 1').get();
  console.log(`\n   With verified URLs: ${verified.count}`);
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const forceReseed = args.includes('--force') || args.includes('-f');
  const checkOnly = args.includes('--check') || args.includes('-c');
  
  // If check-only mode, just show stats
  if (checkOnly || !forceReseed) {
    console.log('📊 Check mode - showing current statistics only\n');
    console.log('   (Use --force flag to reseed database)\n');
    showStats();
    return;
  }
  
  // Clear existing colleges when force reseeding
  clearExistingColleges();
  
  // Load and seed colleges from JSON files
  const colleges = loadCollegeDataFiles();
  const inserted = seedColleges(colleges);
  
  // Show final statistics
  showStats();
  
  console.log('\n🎉 Global college database seeding complete!\n');
}

main();
