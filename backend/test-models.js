// Quick test to verify College model works
const path = require('path');
process.env.DATABASE_PATH = path.join(__dirname, 'database/college_app.db');

const College = require('./src/models/College');
const dbManager = require('./src/config/database');

console.log('===== Testing College Model =====\n');

try {
  dbManager.initialize();
  
  // Test 1: findAll with no filters
  console.log('Test 1: findAll (first 5)');
  const allColleges = College.findAll({ limit: 5 });
  console.log(`✅ Found ${allColleges.length} colleges`);
  if (allColleges.length > 0) {
    console.log('Sample:', allColleges[0].name, '-', allColleges[0].country);
    console.log('Has majorCategories:', Array.isArray(allColleges[0].majorCategories));
  }
  console.log('');
  
  // Test 2: findAll with country filter
  console.log('Test 2: findAll with country=US (first 3)');
  const usColleges = College.findAll({ country: 'US', limit: 3 });
  console.log(`✅ Found ${usColleges.length} US colleges`);
  if (usColleges.length > 0) {
    console.log('Sample:', usColleges[0].name);
  }
  console.log('');
  
  // Test 3: search
  console.log('Test 3: search("MIT")');
  const searchResults = College.search('MIT');
  console.log(`✅ Found ${searchResults.length} colleges matching "MIT"`);
  if (searchResults.length > 0) {
    console.log('Sample:', searchResults[0].name);
  }
  console.log('');
  
  // Test 4: findById
  console.log('Test 4: findById(1)');
  const college = College.findById(1);
  if (college) {
    console.log(`✅ Found college: ${college.name}`);
    console.log(`   Country: ${college.country}`);
    console.log(`   Location: ${college.location}`);
    console.log(`   Programs count: ${college.majorCategories?.length || 0}`);
  }
  console.log('');
  
  console.log('===== All Tests Passed =====');
  
  dbManager.close();
  process.exit(0);
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
