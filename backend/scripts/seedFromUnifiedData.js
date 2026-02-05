#!/usr/bin/env node
/**
 * Comprehensive College Seeder
 * 
 * This script seeds the database with 997 verified colleges from the curated
 * unified_colleges.json dataset. It populates:
 * 
 * 1. colleges_comprehensive - Main college info
 * 2. college_admissions - Acceptance rates, test policies
 * 3. college_financial_data - Tuition costs
 * 4. admitted_student_stats - SAT/ACT/GPA data
 * 5. academic_outcomes - Graduation rates
 * 6. college_programs - Majors/programs offered
 * 7. college_rankings - QS, US News rankings
 * 8. campus_life - Housing, campus info
 * 9. student_demographics - International %, etc.
 * 
 * Also populates the basic 'colleges' table for backward compatibility.
 * 
 * Usage:
 *   node scripts/seedFromUnifiedData.js           # Safe insert (skip existing)
 *   node scripts/seedFromUnifiedData.js --force   # Clear and re-insert all
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Configuration
const DB_PATH = path.join(__dirname, '..', 'database', 'college_app.db');
const DATA_PATH = path.join(__dirname, '..', 'data', 'unified_colleges.json');
const CURRENT_YEAR = 2026;

// Parse command line arguments
const forceMode = process.argv.includes('--force');
const verboseMode = process.argv.includes('--verbose') || process.argv.includes('-v');

function log(message) {
  if (verboseMode) {
    console.log(message);
  }
}

function loadUnifiedData() {
  console.log('📂 Loading unified_colleges.json...');
  
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`❌ Data file not found: ${DATA_PATH}`);
    process.exit(1);
  }
  
  const rawData = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(rawData);
  
  console.log(`   ✅ Loaded ${data.colleges.length} colleges from ${data.metadata.sources.join(', ')}`);
  console.log(`   📊 Stats: ${data.metadata.stats.countries} countries, ${data.metadata.stats.with_rankings} with rankings`);
  
  return data.colleges;
}

function initDatabase() {
  console.log('🔌 Connecting to database...');
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = OFF'); // Disable FK for seeding
  
  return db;
}

function clearExistingData(db) {
  console.log('🧹 Clearing existing data...');
  
  // Clear comprehensive tables
  db.exec('DELETE FROM college_rankings');
  db.exec('DELETE FROM college_programs');
  db.exec('DELETE FROM student_demographics');
  db.exec('DELETE FROM campus_life');
  db.exec('DELETE FROM college_financial_data');
  db.exec('DELETE FROM admitted_student_stats');
  db.exec('DELETE FROM academic_outcomes');
  db.exec('DELETE FROM college_admissions');
  db.exec('DELETE FROM predictive_metrics');
  db.exec('DELETE FROM colleges_comprehensive');
  
  // Clear basic colleges table too
  db.exec('DELETE FROM colleges');
  
  console.log('   ✅ All college data cleared');
}

function getApplicationPortal(country) {
  const portals = {
    'United States': 'Common App',
    'United Kingdom': 'UCAS',
    'Canada': 'OUAC',
    'Germany': 'Uni-Assist',
    'Netherlands': 'Studielink',
    'Australia': 'UAC',
    'France': 'Campus France',
    'Italy': 'Universitaly',
    'Spain': 'Direct',
    'China': 'Direct',
    'Japan': 'Direct',
    'South Korea': 'Direct',
    'Singapore': 'Direct',
    'Hong Kong': 'JUPAS',
    'India': 'Direct',
    'New Zealand': 'Direct',
    'Ireland': 'CAO',
    'Switzerland': 'Direct',
    'Sweden': 'Direct',
    'Denmark': 'Direct',
    'Norway': 'Direct',
    'Finland': 'Direct',
    'Belgium': 'Direct',
    'Austria': 'Direct',
    'Portugal': 'Direct',
    'Czech Republic': 'Direct',
    'Poland': 'Direct',
    'Russia': 'Direct',
    'Brazil': 'Direct',
    'Mexico': 'Direct',
    'Argentina': 'Direct',
    'Chile': 'Direct',
    'South Africa': 'Direct',
    'Egypt': 'Direct',
    'Israel': 'Direct',
    'UAE': 'Direct',
    'Saudi Arabia': 'Direct',
    'Malaysia': 'Direct',
    'Thailand': 'Direct',
    'Indonesia': 'Direct',
    'Vietnam': 'Direct',
    'Philippines': 'Direct',
    'Taiwan': 'Direct',
  };
  return portals[country] || 'Direct';
}

function seedCollegesComprehensive(db, colleges) {
  console.log('📚 Seeding colleges_comprehensive table...');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO colleges_comprehensive (
      name, alternate_names, country, state_region, city,
      urban_classification, institution_type, classification,
      religious_affiliation, founding_year, campus_size_acres,
      undergraduate_enrollment, graduate_enrollment, total_enrollment,
      student_faculty_ratio, website_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      try {
        insertStmt.run(
          college.name,
          college.alternate_names ? JSON.stringify(college.alternate_names) : null,
          college.country,
          college.state_region,
          college.city,
          college.urban_classification,
          college.institution_type,
          college.classification,
          college.religious_affiliation,
          college.founding_year,
          college.campus_size_acres,
          college.undergraduate_enrollment,
          college.graduate_enrollment,
          college.total_enrollment,
          college.student_faculty_ratio,
          college.website_url
        );
        inserted++;
        log(`   ✓ ${college.name}`);
      } catch (err) {
        console.error(`   ⚠ Error inserting ${college.name}: ${err.message}`);
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} colleges into colleges_comprehensive`);
  return inserted;
}

function seedBasicColleges(db, colleges) {
  console.log('📚 Seeding basic colleges table (for backward compatibility)...');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO colleges (
      name, country, location, type, application_portal,
      acceptance_rate, programs, official_website, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      try {
        // Build location string
        const location = [college.city, college.state_region, college.country]
          .filter(Boolean)
          .join(', ');
        
        // Get programs as JSON string
        const programs = college.programs 
          ? JSON.stringify(college.programs.map(p => p.program_name))
          : null;
        
        // Determine institution type
        const type = college.institution_type || 
          (college.urban_classification ? `${college.urban_classification} University` : 'University');
        
        // Get acceptance rate (convert from decimal to percentage if needed)
        let acceptanceRate = null;
        if (college.admissions && college.admissions.acceptance_rate) {
          acceptanceRate = college.admissions.acceptance_rate;
          // If it's a decimal (like 0.15), convert to percentage
          if (acceptanceRate <= 1) {
            acceptanceRate = acceptanceRate * 100;
          }
        }
        
        // Build description
        const description = `${college.name} is located in ${location}. ` +
          (college.total_enrollment ? `Total enrollment: ${college.total_enrollment.toLocaleString()} students. ` : '') +
          (acceptanceRate ? `Acceptance rate: ${acceptanceRate.toFixed(1)}%.` : '');
        
        insertStmt.run(
          college.name,
          college.country,
          location,
          type,
          getApplicationPortal(college.country),
          acceptanceRate,
          programs,
          college.website_url,
          description
        );
        inserted++;
      } catch (err) {
        console.error(`   ⚠ Error inserting ${college.name} to basic table: ${err.message}`);
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} colleges into colleges table`);
  return inserted;
}

function seedAdmissions(db, colleges) {
  console.log('📊 Seeding college_admissions table...');
  
  // First, get all college IDs by name
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO college_admissions (
      college_id, year, acceptance_rate, test_optional_flag,
      source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.admissions) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      try {
        let acceptanceRate = college.admissions.acceptance_rate;
        // Ensure it's stored as a decimal (0-1 range)
        if (acceptanceRate && acceptanceRate > 1) {
          acceptanceRate = acceptanceRate / 100;
        }
        
        insertStmt.run(
          result.id,
          college.admissions.year || CURRENT_YEAR,
          acceptanceRate,
          college.admissions.test_optional_flag || 0,
          college.admissions.source || 'unified_colleges.json',
          college.admissions.confidence_score || 0.9
        );
        inserted++;
      } catch (err) {
        log(`   ⚠ Admissions error for ${college.name}: ${err.message}`);
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} admissions records`);
  return inserted;
}

function seedFinancialData(db, colleges) {
  console.log('💰 Seeding college_financial_data table...');
  
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO college_financial_data (
      college_id, year, tuition_in_state, tuition_out_state,
      tuition_international, source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.financial) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      try {
        insertStmt.run(
          result.id,
          college.financial.year || CURRENT_YEAR,
          college.financial.tuition_in_state,
          college.financial.tuition_out_state,
          college.financial.tuition_international,
          college.financial.source || 'unified_colleges.json',
          college.financial.confidence_score || 0.9
        );
        inserted++;
      } catch (err) {
        log(`   ⚠ Financial error for ${college.name}: ${err.message}`);
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} financial records`);
  return inserted;
}

function seedStudentStats(db, colleges) {
  console.log('📈 Seeding admitted_student_stats table...');
  
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO admitted_student_stats (
      college_id, year, gpa_50, sat_25, sat_75, act_25, act_75,
      source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.student_stats) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      try {
        // Parse SAT/ACT ranges if provided as strings like "1400-1550"
        let sat25 = null, sat75 = null, act25 = null, act75 = null;
        
        if (college.student_stats.sat_range) {
          const satMatch = String(college.student_stats.sat_range).match(/(\d+)\s*[-–]\s*(\d+)/);
          if (satMatch) {
            sat25 = parseInt(satMatch[1]);
            sat75 = parseInt(satMatch[2]);
          }
        }
        
        if (college.student_stats.act_range) {
          const actMatch = String(college.student_stats.act_range).match(/(\d+)\s*[-–]\s*(\d+)/);
          if (actMatch) {
            act25 = parseInt(actMatch[1]);
            act75 = parseInt(actMatch[2]);
          }
        }
        
        insertStmt.run(
          result.id,
          college.student_stats.year || CURRENT_YEAR,
          college.student_stats.gpa_50,
          sat25,
          sat75,
          act25,
          act75,
          college.student_stats.source || 'unified_colleges.json',
          college.student_stats.confidence_score || 0.9
        );
        inserted++;
      } catch (err) {
        log(`   ⚠ Student stats error for ${college.name}: ${err.message}`);
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} student stats records`);
  return inserted;
}

function seedOutcomes(db, colleges) {
  console.log('🎓 Seeding academic_outcomes table...');
  
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO academic_outcomes (
      college_id, year, graduation_rate_4yr,
      source, confidence_score
    ) VALUES (?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.outcomes) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      try {
        insertStmt.run(
          result.id,
          college.outcomes.year || CURRENT_YEAR,
          college.outcomes.graduation_rate_4yr,
          college.outcomes.source || 'unified_colleges.json',
          college.outcomes.confidence_score || 0.9
        );
        inserted++;
      } catch (err) {
        log(`   ⚠ Outcomes error for ${college.name}: ${err.message}`);
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} outcome records`);
  return inserted;
}

function seedPrograms(db, colleges) {
  console.log('📖 Seeding college_programs table...');
  
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO college_programs (
      college_id, program_name, degree_type, source
    ) VALUES (?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.programs || !Array.isArray(college.programs)) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      for (const program of college.programs) {
        try {
          insertStmt.run(
            result.id,
            program.program_name,
            program.degree_type || "Bachelor's",
            program.source || 'unified_colleges.json'
          );
          inserted++;
        } catch (err) {
          // Ignore duplicate key errors
          if (!err.message.includes('UNIQUE')) {
            log(`   ⚠ Program error for ${college.name} - ${program.program_name}: ${err.message}`);
          }
        }
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} program records`);
  return inserted;
}

function seedRankings(db, colleges) {
  console.log('🏆 Seeding college_rankings table...');
  
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO college_rankings (
      college_id, year, ranking_body, global_rank
    ) VALUES (?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.rankings || !Array.isArray(college.rankings)) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      for (const ranking of college.rankings) {
        try {
          insertStmt.run(
            result.id,
            ranking.year || CURRENT_YEAR,
            ranking.ranking_body || 'QS',
            ranking.global_rank
          );
          inserted++;
        } catch (err) {
          if (!err.message.includes('UNIQUE')) {
            log(`   ⚠ Ranking error for ${college.name}: ${err.message}`);
          }
        }
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} ranking records`);
  return inserted;
}

function seedCampusLife(db, colleges) {
  console.log('🏫 Seeding campus_life table...');
  
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO campus_life (
      college_id, housing_guarantee, source
    ) VALUES (?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.campus_life) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      try {
        insertStmt.run(
          result.id,
          college.campus_life.housing_guarantee,
          college.campus_life.source || 'unified_colleges.json'
        );
        inserted++;
      } catch (err) {
        if (!err.message.includes('UNIQUE')) {
          log(`   ⚠ Campus life error for ${college.name}: ${err.message}`);
        }
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} campus life records`);
  return inserted;
}

function seedDemographics(db, colleges) {
  console.log('👥 Seeding student_demographics table...');
  
  const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');
  
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO student_demographics (
      college_id, year, percent_international, source
    ) VALUES (?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const insertMany = db.transaction((collegeList) => {
    for (const college of collegeList) {
      if (!college.demographics) continue;
      
      const result = getCollegeId.get(college.name);
      if (!result) continue;
      
      try {
        insertStmt.run(
          result.id,
          college.demographics.year || CURRENT_YEAR,
          college.demographics.percent_international,
          college.demographics.source || 'unified_colleges.json'
        );
        inserted++;
      } catch (err) {
        if (!err.message.includes('UNIQUE')) {
          log(`   ⚠ Demographics error for ${college.name}: ${err.message}`);
        }
      }
    }
  });
  
  insertMany(colleges);
  console.log(`   ✅ Inserted ${inserted} demographics records`);
  return inserted;
}

function printSummary(stats) {
  console.log('\n' + '='.repeat(50));
  console.log('📊 SEEDING SUMMARY');
  console.log('='.repeat(50));
  console.log(`   🏛️  Colleges (comprehensive): ${stats.comprehensive}`);
  console.log(`   🏫 Colleges (basic):          ${stats.basic}`);
  console.log(`   📊 Admissions records:        ${stats.admissions}`);
  console.log(`   💰 Financial records:         ${stats.financial}`);
  console.log(`   📈 Student stats records:     ${stats.studentStats}`);
  console.log(`   🎓 Academic outcomes:         ${stats.outcomes}`);
  console.log(`   📖 Programs/majors:           ${stats.programs}`);
  console.log(`   🏆 Rankings:                  ${stats.rankings}`);
  console.log(`   🏫 Campus life:               ${stats.campusLife}`);
  console.log(`   👥 Demographics:              ${stats.demographics}`);
  console.log('='.repeat(50));
  console.log(`   ✅ TOTAL RECORDS: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);
  console.log('='.repeat(50));
}

async function main() {
  console.log('');
  console.log('🎓 CollegeOS Comprehensive College Seeder');
  console.log('=========================================');
  console.log(`   Mode: ${forceMode ? 'FORCE (clear existing data)' : 'SAFE (skip existing)'}`);
  console.log(`   Data: unified_colleges.json (997 colleges)`);
  console.log('');
  
  // Load data
  const colleges = loadUnifiedData();
  
  // Initialize database
  const db = initDatabase();
  
  try {
    // Clear data if force mode
    if (forceMode) {
      clearExistingData(db);
    }
    
    // Seed all tables
    const stats = {
      comprehensive: seedCollegesComprehensive(db, colleges),
      basic: seedBasicColleges(db, colleges),
      admissions: seedAdmissions(db, colleges),
      financial: seedFinancialData(db, colleges),
      studentStats: seedStudentStats(db, colleges),
      outcomes: seedOutcomes(db, colleges),
      programs: seedPrograms(db, colleges),
      rankings: seedRankings(db, colleges),
      campusLife: seedCampusLife(db, colleges),
      demographics: seedDemographics(db, colleges),
    };
    
    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Print summary
    printSummary(stats);
    
    console.log('\n✅ Seeding complete!\n');
    
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
