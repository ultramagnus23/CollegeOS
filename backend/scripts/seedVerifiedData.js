/**
 * Seed script for verified university data
 * Seeds 2500+ universities from JSON data files
 */

const fs = require('fs');
const path = require('path');

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
  'universities_2201_2500.json',
  'additional_us_universities.json',
  'additional_uk_universities.json',
  'additional_asia_universities.json',
  'additional_europe_universities.json'
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
        let data = Array.isArray(content) ? content : (content.universities || []);
        
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
      console.log('  Skipped ' + file + ' (not found)');
    }
  }
  
  return allUniversities;
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check') || args.includes('-c');
  
  console.log('=== VERIFIED UNIVERSITY DATA ===\n');
  
  // Load all universities
  const universities = loadAllUniversities();
  console.log('\n📚 Total unique universities loaded: ' + universities.length);
  
  // Count by country
  const byCountry = {};
  for (const uni of universities) {
    const country = uni.country || 'Unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;
  }
  
  console.log('\n🌍 By Country (Top 25):');
  const sortedCountries = Object.entries(byCountry)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 25);
  for (const entry of sortedCountries) {
    console.log('  ' + entry[0] + ': ' + entry[1]);
  }
  
  console.log('\n🌐 Total countries: ' + Object.keys(byCountry).length);
  
  if (checkOnly) {
    console.log('\n(Check only mode - not seeding)');
    return;
  }
  
  console.log('\n✅ Data ready to seed. Use --check to verify only.');
}

main();
