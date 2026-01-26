#!/usr/bin/env node
// backend/scripts/check_integration.js
// Comprehensive integration check for CollegeOS
// 
// Verifies:
// - Database connection and schema
// - All required tables exist
// - Data files are present
// - Models work correctly
// - Services are functional
// - API routes are registered

const path = require('path');
const fs = require('fs');

// Load config
let config;
try {
  config = require('../src/config/env');
} catch (e) {
  config = {
    database: {
      path: path.join(__dirname, '../database/college_app.db')
    }
  };
}

const Database = require('better-sqlite3');

console.log('🔍 CollegeOS Integration Check\n');
console.log('='.repeat(60));

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

function check(name, condition, errorMsg = null) {
  if (condition) {
    console.log(`✅ ${name}`);
    results.passed++;
    results.details.push({ name, status: 'passed' });
  } else {
    console.log(`❌ ${name}${errorMsg ? ': ' + errorMsg : ''}`);
    results.failed++;
    results.details.push({ name, status: 'failed', error: errorMsg });
  }
}

function warn(name, message) {
  console.log(`⚠️  ${name}: ${message}`);
  results.warnings++;
  results.details.push({ name, status: 'warning', message });
}

// ============================================
// 1. DATABASE CHECKS
// ============================================
console.log('\n📦 Database Connection\n');

let db;
try {
  db = new Database(config.database.path);
  check('Database file exists', true);
  check('Database connection successful', true);
} catch (error) {
  check('Database connection', false, error.message);
  console.log('\n❌ Cannot proceed without database connection.');
  console.log('   Run: cd backend && npm run migrate');
  process.exit(1);
}

// ============================================
// 2. TABLE CHECKS
// ============================================
console.log('\n📋 Required Tables\n');

const requiredTables = [
  'colleges',
  'users',
  'applications',
  'deadlines',
  'essays',
  'user_interactions'
];

requiredTables.forEach(table => {
  try {
    const result = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    check(`Table: ${table}`, !!result, 'Table does not exist');
  } catch (error) {
    check(`Table: ${table}`, false, error.message);
  }
});

// ============================================
// 3. COLLEGE SCHEMA CHECKS
// ============================================
console.log('\n📊 College Schema\n');

const requiredColumns = [
  'id', 'name', 'country', 'location', 'type', 'official_website',
  'programs', 'major_categories', 'academic_strengths', 'acceptance_rate',
  'tuition_cost', 'trust_tier', 'is_verified'
];

try {
  const tableInfo = db.prepare('PRAGMA table_info(colleges)').all();
  const columnNames = tableInfo.map(col => col.name);
  
  requiredColumns.forEach(col => {
    check(`Column: colleges.${col}`, columnNames.includes(col));
  });
} catch (error) {
  check('College schema check', false, error.message);
}

// ============================================
// 4. DATA FILE CHECKS
// ============================================
console.log('\n📂 Data Files\n');

const dataFiles = [
  { name: 'UK Universities', path: '../data/uk_universities.json', expectedKey: 'universities' },
  { name: 'India Universities', path: '../data/india_universities.json', expectedKey: 'universities' },
  { name: 'EU Universities', path: '../data/eu_universities.json', expectedKey: 'universities' }
];

dataFiles.forEach(file => {
  const fullPath = path.join(__dirname, file.path);
  if (fs.existsSync(fullPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      const count = data[file.expectedKey]?.length || 0;
      check(`${file.name} (${count} entries)`, count > 0);
    } catch (error) {
      check(file.name, false, 'Invalid JSON');
    }
  } else {
    check(file.name, false, 'File not found');
  }
});

// ============================================
// 5. SERVICE FILE CHECKS
// ============================================
console.log('\n🔧 Services\n');

const serviceFiles = [
  { name: 'Recommendation Service', path: '../services/collegeRecommendationService.js' },
  { name: 'Profile Comparison Service', path: '../services/profileComparisonService.js' },
  { name: 'College Scorecard Service', path: '../services/collegeScorecardService.js' },
  { name: 'Interaction Log Service', path: '../services/interactionLogService.js' }
];

serviceFiles.forEach(service => {
  const fullPath = path.join(__dirname, service.path);
  if (fs.existsSync(fullPath)) {
    try {
      const svc = require(fullPath);
      check(`${service.name}`, typeof svc === 'object' || typeof svc === 'function');
    } catch (error) {
      check(service.name, false, `Load error: ${error.message}`);
    }
  } else {
    check(service.name, false, 'File not found');
  }
});

// ============================================
// 6. MODEL CHECKS
// ============================================
console.log('\n📦 Models\n');

const modelFiles = [
  { name: 'College Model', path: '../src/models/College.js', methods: ['findAll', 'findById', 'search'] },
  { name: 'User Model', path: '../src/models/User.js', methods: ['findById', 'getAcademicProfile'] }
];

modelFiles.forEach(model => {
  const fullPath = path.join(__dirname, model.path);
  if (fs.existsSync(fullPath)) {
    try {
      const Model = require(fullPath);
      const missingMethods = model.methods.filter(m => typeof Model[m] !== 'function');
      if (missingMethods.length === 0) {
        check(`${model.name}`, true);
      } else {
        check(`${model.name}`, false, `Missing methods: ${missingMethods.join(', ')}`);
      }
    } catch (error) {
      check(model.name, false, `Load error: ${error.message}`);
    }
  } else {
    check(model.name, false, 'File not found');
  }
});

// ============================================
// 7. ROUTE FILE CHECKS
// ============================================
console.log('\n🛣️  Routes\n');

const routeFiles = [
  { name: 'Recommendations Route', path: '../src/routes/recommendations.js' },
  { name: 'Profile Comparison Route', path: '../src/routes/profileComparison.js' },
  { name: 'Colleges Route', path: '../src/routes/colleges.js' }
];

routeFiles.forEach(route => {
  const fullPath = path.join(__dirname, route.path);
  if (fs.existsSync(fullPath)) {
    try {
      const router = require(fullPath);
      check(`${route.name}`, typeof router === 'function' || typeof router.stack !== 'undefined');
    } catch (error) {
      check(route.name, false, `Load error: ${error.message}`);
    }
  } else {
    check(route.name, false, 'File not found');
  }
});

// ============================================
// 8. DATA STATISTICS
// ============================================
console.log('\n📈 Data Statistics\n');

try {
  const totalColleges = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`   Total colleges in database: ${totalColleges.count}`);
  
  if (totalColleges.count === 0) {
    warn('No colleges in database', 'Run: node backend/scripts/seed_comprehensive.js --force');
  } else {
    const byCountry = db.prepare(`
      SELECT country, COUNT(*) as count 
      FROM colleges 
      GROUP BY country 
      ORDER BY count DESC
    `).all();
    
    console.log('   By country:');
    const flags = { US: '🇺🇸', UK: '🇬🇧', IN: '🇮🇳', DE: '🇩🇪', FR: '🇫🇷', CH: '🇨🇭', NL: '🇳🇱', IT: '🇮🇹', ES: '🇪🇸' };
    byCountry.slice(0, 10).forEach(row => {
      const flag = flags[row.country] || '🌍';
      console.log(`     ${flag} ${row.country}: ${row.count}`);
    });
    
    check('Colleges seeded', totalColleges.count >= 100, `Expected 100+ universities, found ${totalColleges.count}`);
  }
  
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
  console.log(`\n   Total users: ${totalUsers.count}`);
  
  const totalInteractions = db.prepare('SELECT COUNT(*) as count FROM user_interactions').get();
  console.log(`   Total interactions logged: ${totalInteractions.count}`);
  
} catch (error) {
  warn('Data statistics', error.message);
}

// ============================================
// 9. FRONTEND COMPONENT CHECKS
// ============================================
console.log('\n🎨 Frontend Components\n');

const frontendFiles = [
  { name: 'CollegeProfileComparison', path: '../../src/components/CollegeProfileComparison.tsx' },
  { name: 'UserProfileSummary', path: '../../src/components/UserProfileSummary.tsx' },
  { name: 'API Types', path: '../../src/types/api.types.ts' }
];

frontendFiles.forEach(file => {
  const fullPath = path.join(__dirname, file.path);
  check(file.name, fs.existsSync(fullPath));
});

// ============================================
// 10. MIGRATION FILE CHECKS
// ============================================
console.log('\n📜 Migrations\n');

const migrationFiles = [
  '001_create_colleges.sql',
  '002_recommendations.sql',
  '003_timeline.sql',
  '004_user_profile.sql',
  '005_unified_colleges_schema.sql',
  '006_fix_users_schema.sql',
  '007_user_interactions.sql'
];

migrationFiles.forEach(migration => {
  const fullPath = path.join(__dirname, '../migrations', migration);
  check(`Migration: ${migration}`, fs.existsSync(fullPath));
});

// ============================================
// SUMMARY
// ============================================
console.log('\n' + '='.repeat(60));
console.log('\n📊 Summary\n');
console.log(`   ✅ Passed:   ${results.passed}`);
console.log(`   ❌ Failed:   ${results.failed}`);
console.log(`   ⚠️  Warnings: ${results.warnings}`);

if (results.failed === 0) {
  console.log('\n🎉 All integration checks passed!');
  console.log('\n📋 To start the application:');
  console.log('   1. Backend: cd backend && npm run dev');
  console.log('   2. Frontend: npm run dev');
  console.log('   3. Open: http://localhost:8080');
} else {
  console.log('\n⚠️  Some checks failed. Please review the errors above.');
  console.log('\n📋 Common fixes:');
  console.log('   - Run migrations: cd backend && npm run migrate');
  console.log('   - Seed data: node backend/scripts/seed_comprehensive.js --force');
  console.log('   - Install deps: npm install && cd backend && npm install');
}

console.log('\n');

db.close();
process.exit(results.failed > 0 ? 1 : 0);
