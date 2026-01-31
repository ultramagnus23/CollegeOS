/**
 * Seed script for verified university data
 * Seeds 2500+ universities from JSON data files into the database
 */

const fs = require('fs');
const path = require('path');

// Load database manager
const dbManager = require('../src/config/database');

// Data directory
const VERIFIED_DATA_DIR = path.join(__dirname, '..', 'data', 'verified');

// All data files to load - these contain 2500+ verified universities
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
  'universities_2201_2500.json',
  'additional_us_universities.json',
  'additional_uk_universities.json',
  'additional_asia_universities.json',
  'additional_europe_universities.json',
  // Additional files in verified folder
  'us_liberal_arts_colleges.json',
  'us_regional_universities.json',
  'us_universities_batch3.json',
  'us_universities_batch4.json',
  'uk_universities_expanded.json',
  'canada_universities.json',
  'australia_nz_universities.json',
  'asia_universities_expanded.json',
  'global_universities_expanded.json',
  'international_universities_1.json',
  'international_universities_2.json',
  'more_us_universities_1.json',
  'more_us_universities_2.json'
];

function loadAllUniversities() {
  const allUniversities = [];
  const seenNames = new Set();
  
  for (const file of DATA_FILES) {
    const filePath = path.join(VERIFIED_DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // Handle both array and object formats
        let data = Array.isArray(content) ? content : (content.universities || content.colleges || []);
        
        for (const uni of data) {
          // Deduplicate by name
          const key = uni.name ? uni.name.toLowerCase().trim() : null;
          if (key && !seenNames.has(key)) {
            seenNames.add(key);
            allUniversities.push(uni);
          }
        }
        console.log('✓ Loaded ' + data.length + ' universities from ' + file);
      } catch (err) {
        console.error('✗ Error loading ' + file + ':', err.message);
      }
    } else {
      // Silently skip files that don't exist
    }
  }
  
  return allUniversities;
}

function seedDatabase(universities) {
  console.log('\n🌱 Seeding database with ' + universities.length + ' universities...\n');
  
  // Initialize database
  dbManager.initialize();
  dbManager.runMigrations();
  const db = dbManager.getDatabase();
  
  // Clear existing colleges
  console.log('🗑️  Clearing existing college data...');
  db.exec('DELETE FROM colleges');
  
  // Prepare insert statement with all fields
  const insertStmt = db.prepare(`
    INSERT INTO colleges (
      name, country, location, official_website, admissions_url,
      programs_url, application_portal_url, academic_strengths, major_categories,
      acceptance_rate, tuition_domestic, tuition_international, student_population,
      average_gpa, sat_range, act_range, graduation_rate, ranking,
      trust_tier, is_verified, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  let inserted = 0;
  let errors = 0;
  
  // Insert each university
  const insertMany = db.transaction((unis) => {
    for (const uni of unis) {
      try {
        // Map fields from verified data format to database schema
        const name = uni.name || 'Unknown';
        const country = uni.country || 'Unknown';
        const location = uni.city || uni.location || country;
        const website = uni.website || uni.official_website || '';
        const admissionsUrl = uni.admissions_url || (website ? website + '/admissions' : '');
        const programsUrl = uni.programs_url || (website ? website + '/programs' : '');
        const applicationPortal = uni.application_portal || 'https://commonapp.org';
        
        // Build academic strengths and majors
        const strengths = uni.key_strengths || uni.academic_strengths || ['Research', 'Teaching'];
        const majors = uni.popular_majors || uni.major_categories || ['Liberal Arts', 'STEM', 'Business'];
        
        // Parse acceptance rate (convert from percentage to decimal if needed)
        let acceptanceRate = uni.acceptance_rate;
        if (acceptanceRate !== null && acceptanceRate !== undefined) {
          // If it's a percentage like 15.5, convert to decimal 0.155
          if (acceptanceRate > 1) {
            acceptanceRate = acceptanceRate / 100;
          }
        }
        
        // Tuition values
        const tuitionDomestic = uni.tuition_domestic_usd || uni.tuition_domestic || null;
        const tuitionInternational = uni.tuition_international_usd || uni.tuition_international || null;
        
        // Student population
        const studentPop = uni.student_population || uni.enrollment || null;
        
        // GPA (usually on 4.0 scale)
        const avgGpa = uni.average_gpa || null;
        
        // SAT/ACT ranges
        const satRange = uni.sat_range || null;
        const actRange = uni.act_range || null;
        
        // Graduation rate
        let gradRate = uni.graduation_rate_4yr || uni.graduation_rate || null;
        if (gradRate !== null && gradRate > 1) {
          gradRate = gradRate / 100;
        }
        
        // Ranking
        const ranking = uni.qs_ranking || uni.ranking || null;
        
        insertStmt.run(
          name,
          country,
          location,
          website,
          admissionsUrl,
          programsUrl,
          applicationPortal,
          JSON.stringify(Array.isArray(strengths) ? strengths : [strengths]),
          JSON.stringify(Array.isArray(majors) ? majors : [majors]),
          acceptanceRate,
          tuitionDomestic,
          tuitionInternational,
          studentPop,
          avgGpa,
          satRange,
          actRange,
          gradRate,
          ranking,
          'verified',
          1
        );
        inserted++;
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error('  ✗ Error inserting ' + (uni.name || 'unknown') + ':', err.message);
        }
      }
    }
  });
  
  insertMany(universities);
  
  console.log('\n✅ Inserted ' + inserted + ' universities');
  if (errors > 0) {
    console.log('⚠️  ' + errors + ' errors (duplicates or invalid data)');
  }
  
  // Verify count
  const count = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log('\n📊 Total universities in database: ' + count.count);
  
  // Show sample
  console.log('\n📋 Sample universities:');
  const sample = db.prepare('SELECT name, country, location FROM colleges LIMIT 10').all();
  sample.forEach(u => console.log('  • ' + u.name + ' (' + u.country + ')'));
  
  // Show by country
  console.log('\n🌍 Universities by country (Top 15):');
  const byCountry = db.prepare(`
    SELECT country, COUNT(*) as count 
    FROM colleges 
    GROUP BY country 
    ORDER BY count DESC 
    LIMIT 15
  `).all();
  byCountry.forEach(c => console.log('  ' + c.country + ': ' + c.count));
  
  dbManager.close();
  console.log('\n✅ Database seeding complete!');
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check') || args.includes('-c');
  
  console.log('=== VERIFIED UNIVERSITY DATA SEEDER ===\n');
  
  // Load all universities
  const universities = loadAllUniversities();
  console.log('\n📚 Total unique universities loaded: ' + universities.length);
  
  // Count by country
  const byCountry = {};
  for (const uni of universities) {
    const country = uni.country || 'Unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;
  }
  
  console.log('\n🌍 By Country (Top 15):');
  const sortedCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const entry of sortedCountries) {
    console.log('  ' + entry[0] + ': ' + entry[1]);
  }
  
  console.log('\n🌐 Total countries: ' + Object.keys(byCountry).length);
  
  if (checkOnly) {
    console.log('\n(Check only mode - not seeding to database)');
    return;
  }
  
  // Actually seed the database
  seedDatabase(universities);
}

main();
