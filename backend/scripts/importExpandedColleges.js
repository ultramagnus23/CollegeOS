/**
 * Import Expanded Colleges Script
 * 
 * This script imports the expanded college data (1050+ colleges) from the JSON files
 * into the main 'colleges' table that the frontend app actually uses.
 * 
 * Run with: node backend/scripts/importExpandedColleges.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Helper function to safely construct URLs
 */
function buildUrl(baseUrl, suffix) {
  if (!baseUrl) return null;
  const cleanBase = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
  return `${cleanBase}${suffix}`;
}

/**
 * Helper function to safely build description strings
 */
function safeString(value, fallback = '') {
  return value !== null && value !== undefined ? value : fallback;
}

// Database path
const DB_PATH = path.join(__dirname, '..', 'database', 'college_app.db');

// JSON data paths - Use EXPANDED files
const DATA_DIR = path.join(__dirname, '..', '..', 'src', 'data', 'colleges');
const US_COLLEGES_PATH = path.join(DATA_DIR, 'usCollegesExpanded.json');
const INDIAN_COLLEGES_PATH = path.join(DATA_DIR, 'indianCollegesExpanded.json');
const UK_COLLEGES_PATH = path.join(DATA_DIR, 'ukCollegesExpanded.json');
const GERMAN_COLLEGES_PATH = path.join(DATA_DIR, 'germanCollegesExpanded.json');

// Initialize database
let db;

function initDatabase() {
  console.log('📂 Database path:', DB_PATH);
  
  // Ensure directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  db = new Database(DB_PATH);
  console.log('✅ Connected to database');
  
  // Run migration 005 to ensure unified schema
  const migration005Path = path.join(__dirname, '..', 'migrations', '005_unified_colleges_schema.sql');
  if (fs.existsSync(migration005Path)) {
    console.log('🔨 Running unified colleges schema migration...');
    const migration = fs.readFileSync(migration005Path, 'utf8');
    db.exec(migration);
    console.log('✅ Migration 005 completed');
  }
  
  return db;
}

/**
 * Transform expanded college data to match the app's colleges table schema
 */
function transformUSCollege(college) {
  // Build programs array from majors if available
  const programs = college.majors || ['Computer Science', 'Engineering', 'Business', 'Sciences', 'Humanities'];
  
  // Build requirements object
  const requirements = {
    tests: ['SAT', 'ACT'],
    satRange: college.testScores?.satRange || null,
    actRange: college.testScores?.actRange || null,
    averageGPA: college.academics?.averageGPA || null,
    applicationPortal: 'Common App'
  };
  
  // Build deadline templates
  const deadlineTemplates = {
    early_decision: { date: 'November 1', type: 'early_decision' },
    early_action: { date: 'November 15', type: 'early_action' },
    regular_decision: { date: 'January 1', type: 'regular_decision' }
  };
  
  // Build location string
  const location = college.location 
    ? `${college.location.city}, ${college.location.state}` 
    : null;
  
  return {
    name: college.name,
    country: 'United States',
    location: location,
    type: college.type || 'Private',
    official_website: college.website,
    admissions_url: buildUrl(college.website, '/admissions'),
    programs_url: buildUrl(college.website, '/academics'),
    application_portal_url: 'https://www.commonapp.org',
    programs: JSON.stringify(programs),
    major_categories: JSON.stringify(['Engineering', 'Sciences', 'Business', 'Humanities', 'Arts']),
    academic_strengths: JSON.stringify(['Research', 'Innovation']),
    application_portal: 'Common App',
    acceptance_rate: college.acceptanceRate,
    requirements: JSON.stringify(requirements),
    deadline_templates: JSON.stringify(deadlineTemplates),
    tuition_cost: college.costs?.tuition || null,
    financial_aid_available: 1,
    research_data: JSON.stringify({
      enrollment: college.enrollment,
      tier: college.tier,
      rank: college.rank,
      graduationRates: college.academics?.graduationRates,
      studentFacultyRatio: college.academics?.studentFacultyRatio
    }),
    description: `${safeString(college.name, 'University')} is a ${(college.type || 'private').toLowerCase()} university located in ${location || 'the United States'}. Ranked #${safeString(college.rank, 'N/A')} with an acceptance rate of ${safeString(college.acceptanceRate, 'N/A')}%.`,
    trust_tier: college.tier === 1 ? 'verified' : (college.tier === 2 ? 'official' : 'standard'),
    is_verified: college.tier <= 2 ? 1 : 0
  };
}

function transformIndianCollege(college) {
  const location = college.location 
    ? `${college.location.city}, ${college.location.state}` 
    : null;
  
  const requirements = {
    entranceExam: college.entranceExam,
    cutoffs: college.cutoffs || null,
    eligibility: college.eligibility || 'Class 12 with PCM'
  };
  
  return {
    name: college.name,
    country: 'India',
    location: location,
    type: college.type || 'Public',
    official_website: college.website,
    admissions_url: buildUrl(college.website, '/admissions'),
    programs_url: buildUrl(college.website, '/academics'),
    application_portal_url: college.entranceExam === 'JEE Advanced' 
      ? 'https://josaa.nic.in' 
      : college.website,
    programs: JSON.stringify(college.programs || ['B.Tech', 'M.Tech', 'PhD']),
    major_categories: JSON.stringify(['Engineering', 'Technology', 'Sciences']),
    academic_strengths: JSON.stringify(['Technical Excellence', 'Research']),
    application_portal: college.entranceExam === 'JEE Advanced' ? 'JoSAA' : 'Direct',
    acceptance_rate: college.acceptanceRate || null,
    requirements: JSON.stringify(requirements),
    deadline_templates: JSON.stringify({
      jee_advanced: { date: 'May', type: 'entrance_exam' },
      counseling: { date: 'June-July', type: 'counseling' }
    }),
    tuition_cost: college.fees?.tuition || null,
    financial_aid_available: 1,
    research_data: JSON.stringify({
      nirfRank: college.nirfRank,
      tier: college.tier,
      placements: college.placements,
      enrollment: college.enrollment
    }),
    description: `${safeString(college.name, 'Institution')} is a premier ${(college.type || 'public').toLowerCase()} institution in India${location ? ` located in ${location}` : ''}. NIRF Rank: #${safeString(college.nirfRank, 'N/A')}.`,
    cbse_requirements: JSON.stringify({ minPercent: 75 }),
    trust_tier: college.tier === 1 ? 'verified' : (college.tier === 2 ? 'official' : 'standard'),
    is_verified: college.tier <= 2 ? 1 : 0
  };
}

function transformUKCollege(college) {
  const location = college.location 
    ? `${college.location.city}, ${college.location.region || 'England'}` 
    : null;
  
  const requirements = {
    aLevels: college.requirements?.aLevels || 'AAA-A*A*A*',
    ibPoints: college.requirements?.ibPoints || '38-42',
    englishLanguage: college.requirements?.englishRequirement || 'IELTS 7.0'
  };
  
  return {
    name: college.name,
    country: 'United Kingdom',
    location: location,
    type: college.type || 'Public',
    official_website: college.website,
    admissions_url: buildUrl(college.website, '/admissions'),
    programs_url: buildUrl(college.website, '/courses'),
    application_portal_url: 'https://www.ucas.com',
    programs: JSON.stringify(college.programs || ['Computer Science', 'Engineering', 'Medicine', 'Law', 'Business']),
    major_categories: JSON.stringify(['Sciences', 'Engineering', 'Humanities', 'Medicine', 'Law']),
    academic_strengths: JSON.stringify(['Research', 'Global Reputation']),
    application_portal: 'UCAS',
    acceptance_rate: college.acceptanceRate || null,
    requirements: JSON.stringify(requirements),
    deadline_templates: JSON.stringify({
      oxbridge: { date: 'October 15', type: 'early' },
      medicine: { date: 'October 15', type: 'early' },
      regular: { date: 'January 25', type: 'regular' }
    }),
    tuition_cost: college.fees?.international || null,
    financial_aid_available: 1,
    research_data: JSON.stringify({
      qsRank: college.qsRank,
      tier: college.tier,
      enrollment: college.enrollment,
      russellGroup: college.russellGroup || false
    }),
    description: `${safeString(college.name, 'University')} is a prestigious ${(college.type || 'public').toLowerCase()} university in the UK${location ? ` located in ${location}` : ''}. QS World Rank: #${safeString(college.qsRank, 'N/A')}.`,
    ucas_code: college.ucasCode || null,
    trust_tier: college.tier === 1 ? 'verified' : (college.tier === 2 ? 'official' : 'standard'),
    is_verified: college.tier <= 2 ? 1 : 0
  };
}

function transformGermanCollege(college) {
  const location = college.location 
    ? `${college.location.city}, ${college.location.state || 'Germany'}` 
    : null;
  
  const requirements = {
    abitur: college.requirements?.abitur || '1.0-2.5',
    germanLevel: college.requirements?.germanLevel || 'C1',
    englishLevel: college.requirements?.englishLevel || 'B2'
  };
  
  return {
    name: college.name,
    country: 'Germany',
    location: location,
    type: college.type || 'Public',
    official_website: college.website,
    admissions_url: buildUrl(college.website, '/studium'),
    programs_url: buildUrl(college.website, '/studiengaenge'),
    application_portal_url: 'https://www.uni-assist.de',
    programs: JSON.stringify(college.programs || ['Engineering', 'Computer Science', 'Natural Sciences', 'Economics']),
    major_categories: JSON.stringify(['Engineering', 'Sciences', 'Medicine', 'Economics']),
    academic_strengths: JSON.stringify(['Research', 'Technical Excellence', 'Innovation']),
    application_portal: 'uni-assist',
    acceptance_rate: college.acceptanceRate || null,
    requirements: JSON.stringify(requirements),
    deadline_templates: JSON.stringify({
      winter_semester: { date: 'July 15', type: 'regular' },
      summer_semester: { date: 'January 15', type: 'regular' }
    }),
    tuition_cost: college.fees?.tuition || 0, // Most German public unis are free
    financial_aid_available: 1,
    research_data: JSON.stringify({
      qsRank: college.qsRank,
      tier: college.tier,
      enrollment: college.enrollment,
      tu9: college.tu9 || false,
      excellenceInitiative: college.excellenceInitiative || false
    }),
    description: `${safeString(college.name, 'University')} is a ${(college.type || 'public').toLowerCase()} university in Germany${location ? ` located in ${location}` : ''}. ${college.tu9 ? 'Member of TU9 alliance. ' : ''}QS World Rank: #${safeString(college.qsRank, 'N/A')}.`,
    studielink_required: 0,
    trust_tier: college.tier === 1 ? 'verified' : (college.tier === 2 ? 'official' : 'standard'),
    is_verified: college.tier <= 2 ? 1 : 0
  };
}

function insertCollege(data) {
  const stmt = db.prepare(`
    INSERT INTO colleges (
      name, country, location, type,
      official_website, admissions_url, programs_url, application_portal_url,
      programs, major_categories, academic_strengths,
      application_portal, acceptance_rate, requirements, deadline_templates,
      tuition_cost, financial_aid_available, research_data, description,
      cbse_requirements, igcse_requirements, ib_requirements,
      studielink_required, numerus_fixus_programs, ucas_code, common_app_id,
      trust_tier, is_verified
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);
  
  const result = stmt.run(
    data.name,
    data.country,
    data.location,
    data.type,
    data.official_website,
    data.admissions_url,
    data.programs_url,
    data.application_portal_url,
    data.programs,
    data.major_categories,
    data.academic_strengths,
    data.application_portal,
    data.acceptance_rate,
    data.requirements,
    data.deadline_templates,
    data.tuition_cost,
    data.financial_aid_available || 0,
    data.research_data,
    data.description,
    data.cbse_requirements || null,
    data.igcse_requirements || null,
    data.ib_requirements || null,
    data.studielink_required || 0,
    data.numerus_fixus_programs || null,
    data.ucas_code || null,
    data.common_app_id || null,
    data.trust_tier || 'official',
    data.is_verified || 0
  );
  
  return result.lastInsertRowid;
}

// ==========================================
// MAIN IMPORT FUNCTION
// ==========================================

function importColleges() {
  console.log('\n' + '='.repeat(60));
  console.log('🎓 EXPANDED COLLEGE DATA IMPORT SCRIPT');
  console.log('='.repeat(60) + '\n');
  
  initDatabase();
  
  const stats = {
    us: { success: 0, skipped: 0, failed: 0 },
    india: { success: 0, skipped: 0, failed: 0 },
    uk: { success: 0, skipped: 0, failed: 0 },
    germany: { success: 0, skipped: 0, failed: 0 }
  };
  
  // Start transaction for better performance
  const importAll = db.transaction(() => {
    // Import US colleges
    if (fs.existsSync(US_COLLEGES_PATH)) {
      console.log('📚 Importing US colleges from expanded data...');
      const usCollegesData = fs.readFileSync(US_COLLEGES_PATH, 'utf8');
      const usColleges = JSON.parse(usCollegesData);
      if (!Array.isArray(usColleges)) {
        console.error('   ❌ US colleges file is not a valid array');
        return;
      }
      console.log(`   Found ${usColleges.length} US colleges`);
      console.log(`   Found ${usColleges.length} US colleges`);
      
      for (const college of usColleges) {
        try {
          const transformed = transformUSCollege(college);
          const id = insertCollege(transformed);
          stats.us.success++;
          if (stats.us.success <= 10) {
            console.log(`   ✅ [US] ${college.name} (ID: ${id})`);
          } else if (stats.us.success === 11) {
            console.log(`   ... importing remaining US colleges ...`);
          }
        } catch (error) {
          if (error.message.includes('UNIQUE constraint failed')) {
            stats.us.skipped++;
          } else {
            console.error(`   ❌ [US] ${college.name}: ${error.message}`);
            stats.us.failed++;
          }
        }
      }
      console.log(`   📊 US colleges completed: ${stats.us.success} imported`);
    } else {
      console.log('⚠️  US expanded colleges file not found at:', US_COLLEGES_PATH);
    }
    
    // Import Indian colleges
    if (fs.existsSync(INDIAN_COLLEGES_PATH)) {
      console.log('\n📚 Importing Indian colleges from expanded data...');
      const indianCollegesData = fs.readFileSync(INDIAN_COLLEGES_PATH, 'utf8');
      const indianColleges = JSON.parse(indianCollegesData);
      if (!Array.isArray(indianColleges)) {
        console.error('   ❌ Indian colleges file is not a valid array');
        return;
      }
      console.log(`   Found ${indianColleges.length} Indian colleges`);
      
      for (const college of indianColleges) {
        try {
          const transformed = transformIndianCollege(college);
          const id = insertCollege(transformed);
          stats.india.success++;
          if (stats.india.success <= 10) {
            console.log(`   ✅ [IN] ${college.name} (ID: ${id})`);
          } else if (stats.india.success === 11) {
            console.log(`   ... importing remaining Indian colleges ...`);
          }
        } catch (error) {
          if (error.message.includes('UNIQUE constraint failed')) {
            stats.india.skipped++;
          } else {
            console.error(`   ❌ [IN] ${college.name}: ${error.message}`);
            stats.india.failed++;
          }
        }
      }
      console.log(`   📊 Indian colleges completed: ${stats.india.success} imported`);
    } else {
      console.log('⚠️  Indian expanded colleges file not found');
    }
    
    // Import UK colleges
    if (fs.existsSync(UK_COLLEGES_PATH)) {
      console.log('\n📚 Importing UK colleges from expanded data...');
      const ukCollegesData = fs.readFileSync(UK_COLLEGES_PATH, 'utf8');
      const ukColleges = JSON.parse(ukCollegesData);
      if (!Array.isArray(ukColleges)) {
        console.error('   ❌ UK colleges file is not a valid array');
        return;
      }
      console.log(`   Found ${ukColleges.length} UK colleges`);
      
      for (const college of ukColleges) {
        try {
          const transformed = transformUKCollege(college);
          const id = insertCollege(transformed);
          stats.uk.success++;
          if (stats.uk.success <= 10) {
            console.log(`   ✅ [UK] ${college.name} (ID: ${id})`);
          } else if (stats.uk.success === 11) {
            console.log(`   ... importing remaining UK colleges ...`);
          }
        } catch (error) {
          if (error.message.includes('UNIQUE constraint failed')) {
            stats.uk.skipped++;
          } else {
            console.error(`   ❌ [UK] ${college.name}: ${error.message}`);
            stats.uk.failed++;
          }
        }
      }
      console.log(`   📊 UK colleges completed: ${stats.uk.success} imported`);
    } else {
      console.log('⚠️  UK expanded colleges file not found');
    }
    
    // Import German colleges
    if (fs.existsSync(GERMAN_COLLEGES_PATH)) {
      console.log('\n📚 Importing German colleges from expanded data...');
      const germanCollegesData = fs.readFileSync(GERMAN_COLLEGES_PATH, 'utf8');
      const germanColleges = JSON.parse(germanCollegesData);
      if (!Array.isArray(germanColleges)) {
        console.error('   ❌ German colleges file is not a valid array');
        return;
      }
      console.log(`   Found ${germanColleges.length} German colleges`);
      
      for (const college of germanColleges) {
        try {
          const transformed = transformGermanCollege(college);
          const id = insertCollege(transformed);
          stats.germany.success++;
          if (stats.germany.success <= 10) {
            console.log(`   ✅ [DE] ${college.name} (ID: ${id})`);
          } else if (stats.germany.success === 11) {
            console.log(`   ... importing remaining German colleges ...`);
          }
        } catch (error) {
          if (error.message.includes('UNIQUE constraint failed')) {
            stats.germany.skipped++;
          } else {
            console.error(`   ❌ [DE] ${college.name}: ${error.message}`);
            stats.germany.failed++;
          }
        }
      }
      console.log(`   📊 German colleges completed: ${stats.germany.success} imported`);
    } else {
      console.log('⚠️  German expanded colleges file not found');
    }
  });
  
  try {
    importAll();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`🇺🇸 US Colleges:      ${stats.us.success} imported, ${stats.us.skipped} skipped, ${stats.us.failed} failed`);
    console.log(`🇮🇳 Indian Colleges:  ${stats.india.success} imported, ${stats.india.skipped} skipped, ${stats.india.failed} failed`);
    console.log(`🇬🇧 UK Colleges:      ${stats.uk.success} imported, ${stats.uk.skipped} skipped, ${stats.uk.failed} failed`);
    console.log(`🇩🇪 German Colleges:  ${stats.germany.success} imported, ${stats.germany.skipped} skipped, ${stats.germany.failed} failed`);
    console.log('─'.repeat(60));
    const total = stats.us.success + stats.india.success + stats.uk.success + stats.germany.success;
    const totalSkipped = stats.us.skipped + stats.india.skipped + stats.uk.skipped + stats.germany.skipped;
    const totalFailed = stats.us.failed + stats.india.failed + stats.uk.failed + stats.germany.failed;
    console.log(`📦 TOTAL: ${total} imported, ${totalSkipped} skipped (duplicates), ${totalFailed} failed`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Transaction failed:', error.message);
    console.log('All changes have been rolled back.');
    db.close();
    process.exit(1);
  }
  
  // Verification queries
  console.log('🔍 VERIFICATION QUERIES\n');
  
  try {
    // Count by country
    const countByCountry = db.prepare(`
      SELECT country, COUNT(*) as count 
      FROM colleges 
      GROUP BY country
      ORDER BY count DESC
    `).all();
    
    console.log('Colleges by Country (in main colleges table):');
    for (const row of countByCountry) {
      console.log(`   ${row.country}: ${row.count}`);
    }
    
    // Total count
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
    console.log(`\n   TOTAL in database: ${totalCount.count} colleges`);
    
    // Sample a few colleges
    console.log('\n📋 Sample Colleges (first 5):');
    const sample = db.prepare('SELECT id, name, country, acceptance_rate FROM colleges LIMIT 5').all();
    for (const college of sample) {
      console.log(`   [${college.id}] ${college.name} (${college.country}) - ${college.acceptance_rate}% acceptance`);
    }
    
  } catch (error) {
    console.error('Verification queries failed:', error.message);
  }
  
  db.close();
  console.log('\n✅ Import complete! The app should now show 1050+ colleges.\n');
}

// Run import
importColleges();
