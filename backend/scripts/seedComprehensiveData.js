/**
 * Seed Comprehensive College Database
 * 
 * This script seeds the database using the comprehensive schema (migration 011).
 * It reads from unified_colleges.json (produced by parseCollegeData.js) and
 * populates all related tables with proper source tracking and confidence scores.
 */

const fs = require('fs');
const path = require('path');

// Load database manager
const dbManager = require('../src/config/database');

// Data paths
const UNIFIED_DATA_FILE = path.join(__dirname, '..', 'data', 'unified_colleges.json');
const LEGACY_DATA_FILE = path.join(__dirname, '..', 'data', 'data.txt');
const MIGRATION_FILE = path.join(__dirname, '..', 'migrations', '011_comprehensive_college_schema.sql');

// Function to run the comprehensive schema migration
function runComprehensiveMigration(db) {
  console.log('📄 Running comprehensive college schema migration...');
  
  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error('❌ Migration file not found:', MIGRATION_FILE);
    return false;
  }
  
  try {
    const migrationSQL = fs.readFileSync(MIGRATION_FILE, 'utf8');
    
    // Use db.exec to run all statements at once
    db.exec(migrationSQL);
    console.log('  ✓ Migration executed successfully');
    return true;
  } catch (err) {
    // Check if it's an "already exists" error (which is fine)
    if (err.message.includes('already exists')) {
      console.log('  ✓ Tables already exist');
      return true;
    }
    console.error('❌ Migration failed:', err.message);
    return false;
  }
}

// SQL Statements
const SQL = {
  insertCollege: `
    INSERT INTO colleges_comprehensive (
      name, alternate_names, country, state_region, city,
      urban_classification, institution_type, classification,
      religious_affiliation, founding_year, campus_size_acres,
      undergraduate_enrollment, graduate_enrollment, total_enrollment,
      student_faculty_ratio, website_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertAdmissions: `
    INSERT INTO college_admissions (
      college_id, year, acceptance_rate, early_decision_rate, early_action_rate,
      regular_decision_rate, waitlist_rate, transfer_acceptance_rate, yield_rate,
      application_volume, admit_volume, enrollment_volume,
      international_accept_rate, in_state_accept_rate, out_state_accept_rate,
      test_optional_flag, source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertStudentStats: `
    INSERT INTO admitted_student_stats (
      college_id, year, gpa_25, gpa_50, gpa_75,
      sat_25, sat_50, sat_75, act_25, act_50, act_75,
      class_rank_top10_percent, avg_course_rigor_index,
      source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertOutcomes: `
    INSERT INTO academic_outcomes (
      college_id, year, graduation_rate_4yr, graduation_rate_6yr,
      retention_rate, dropout_rate, avg_time_to_degree,
      employment_rate, grad_school_rate, median_start_salary, internship_rate,
      source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertFinancial: `
    INSERT INTO college_financial_data (
      college_id, year, tuition_in_state, tuition_out_state, tuition_international,
      cost_of_attendance, avg_financial_aid, percent_receiving_aid, avg_debt,
      net_price_low_income, net_price_mid_income, net_price_high_income,
      merit_scholarship_flag, need_blind_flag, loan_default_rate,
      source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertProgram: `
    INSERT INTO college_programs (
      college_id, program_name, degree_type, enrollment, acceptance_rate,
      accreditation_status, ranking_score, research_funding,
      coop_available, licensing_pass_rate, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertDemographics: `
    INSERT INTO student_demographics (
      college_id, year, percent_international, gender_ratio,
      ethnic_distribution, percent_first_gen, socioeconomic_index,
      geographic_diversity_index, legacy_percent, athlete_percent,
      transfer_percent, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertCampusLife: `
    INSERT INTO campus_life (
      college_id, housing_guarantee, campus_safety_score,
      cost_of_living_index, climate_zone, student_satisfaction_score,
      athletics_division, club_count, mental_health_rating, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertRanking: `
    INSERT INTO college_rankings (
      college_id, year, ranking_body, national_rank, global_rank,
      subject_rank, employer_reputation_score, peer_assessment_score, prestige_index
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  
  insertPredictive: `
    INSERT INTO predictive_metrics (
      college_id, year, application_growth_rate, admit_rate_trend,
      yield_trend, major_demand_pressure, enrollment_volatility,
      policy_change_flag, regional_applicant_density
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
};

// Parse SAT range string to get 25th and 75th percentiles
function parseSatRange(satRange) {
  if (!satRange) return { sat_25: null, sat_50: null, sat_75: null };
  
  const match = satRange.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (match) {
    const low = parseInt(match[1]);
    const high = parseInt(match[2]);
    return {
      sat_25: low,
      sat_50: Math.round((low + high) / 2),
      sat_75: high
    };
  }
  return { sat_25: null, sat_50: null, sat_75: null };
}

// Parse ACT range string
function parseActRange(actRange) {
  if (!actRange) return { act_25: null, act_50: null, act_75: null };
  
  const match = actRange.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (match) {
    const low = parseInt(match[1]);
    const high = parseInt(match[2]);
    return {
      act_25: low,
      act_50: Math.round((low + high) / 2),
      act_75: high
    };
  }
  return { act_25: null, act_50: null, act_75: null };
}

// Load unified data
function loadUnifiedData() {
  console.log('📖 Loading unified college data...');
  
  // First try unified file
  if (fs.existsSync(UNIFIED_DATA_FILE)) {
    try {
      const content = JSON.parse(fs.readFileSync(UNIFIED_DATA_FILE, 'utf8'));
      console.log(`✓ Loaded ${content.colleges.length} colleges from unified_colleges.json`);
      console.log(`  Generated: ${content.metadata.generated_at}`);
      console.log(`  Schema: ${content.metadata.schema_version}`);
      return content;
    } catch (err) {
      console.error('❌ Error loading unified data:', err.message);
    }
  }
  
  // Fall back to data.txt
  console.log('⚠️ unified_colleges.json not found, running parser first...');
  const parser = require('./parseCollegeData');
  return parser.main();
}

// Seed a single college and all related tables
function seedCollege(db, college, statements) {
  // Insert main college record
  const result = statements.insertCollege.run(
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
  
  const collegeId = result.lastInsertRowid;
  
  // Insert admissions data
  if (college.admissions) {
    const adm = college.admissions;
    try {
      statements.insertAdmissions.run(
        collegeId,
        adm.year || new Date().getFullYear(),
        adm.acceptance_rate,
        adm.early_decision_rate || null,
        adm.early_action_rate || null,
        adm.regular_decision_rate || null,
        adm.waitlist_rate || null,
        adm.transfer_acceptance_rate || null,
        adm.yield_rate || null,
        adm.application_volume || null,
        adm.admit_volume || null,
        adm.enrollment_volume || null,
        adm.international_accept_rate || null,
        adm.in_state_accept_rate || null,
        adm.out_state_accept_rate || null,
        adm.test_optional_flag || 0,
        adm.source || 'unified_colleges.json',
        adm.confidence_score || 0.5
      );
    } catch (err) {
      // Ignore duplicate key errors
    }
  }
  
  // Insert student stats
  if (college.student_stats) {
    const stats = college.student_stats;
    const sat = parseSatRange(stats.sat_range);
    const act = parseActRange(stats.act_range);
    
    try {
      statements.insertStudentStats.run(
        collegeId,
        stats.year || new Date().getFullYear(),
        stats.gpa_25 || null,
        stats.gpa_50 || null,
        stats.gpa_75 || null,
        sat.sat_25,
        sat.sat_50,
        sat.sat_75,
        act.act_25,
        act.act_50,
        act.act_75,
        stats.class_rank_top10_percent || null,
        stats.avg_course_rigor_index || null,
        stats.source || 'unified_colleges.json',
        stats.confidence_score || 0.5
      );
    } catch (err) {
      // Ignore duplicate key errors
    }
  }
  
  // Insert outcomes
  if (college.outcomes) {
    const out = college.outcomes;
    try {
      statements.insertOutcomes.run(
        collegeId,
        out.year || new Date().getFullYear(),
        out.graduation_rate_4yr,
        out.graduation_rate_6yr || null,
        out.retention_rate || null,
        out.dropout_rate || null,
        out.avg_time_to_degree || null,
        out.employment_rate || null,
        out.grad_school_rate || null,
        out.median_start_salary || null,
        out.internship_rate || null,
        out.source || 'unified_colleges.json',
        out.confidence_score || 0.5
      );
    } catch (err) {
      // Ignore duplicate key errors
    }
  }
  
  // Insert financial data
  if (college.financial) {
    const fin = college.financial;
    try {
      statements.insertFinancial.run(
        collegeId,
        fin.year || new Date().getFullYear(),
        fin.tuition_in_state,
        fin.tuition_out_state || null,
        fin.tuition_international,
        fin.cost_of_attendance || null,
        fin.avg_financial_aid || null,
        fin.percent_receiving_aid || null,
        fin.avg_debt || null,
        fin.net_price_low_income || null,
        fin.net_price_mid_income || null,
        fin.net_price_high_income || null,
        fin.merit_scholarship_flag || 0,
        fin.need_blind_flag || 0,
        fin.loan_default_rate || null,
        fin.source || 'unified_colleges.json',
        fin.confidence_score || 0.5
      );
    } catch (err) {
      // Ignore duplicate key errors
    }
  }
  
  // Insert programs
  if (college.programs && Array.isArray(college.programs)) {
    for (const prog of college.programs) {
      try {
        statements.insertProgram.run(
          collegeId,
          prog.program_name,
          prog.degree_type || "Bachelor's",
          prog.enrollment || null,
          prog.acceptance_rate || null,
          prog.accreditation_status || null,
          prog.ranking_score || null,
          prog.research_funding || null,
          prog.coop_available || 0,
          prog.licensing_pass_rate || null,
          prog.source || 'unified_colleges.json'
        );
      } catch (err) {
        // Ignore duplicate key errors
      }
    }
  }
  
  // Insert demographics
  if (college.demographics) {
    const demo = college.demographics;
    try {
      statements.insertDemographics.run(
        collegeId,
        demo.year || new Date().getFullYear(),
        demo.percent_international,
        demo.gender_ratio || null,
        demo.ethnic_distribution ? JSON.stringify(demo.ethnic_distribution) : null,
        demo.percent_first_gen || null,
        demo.socioeconomic_index || null,
        demo.geographic_diversity_index || null,
        demo.legacy_percent || null,
        demo.athlete_percent || null,
        demo.transfer_percent || null,
        demo.source || 'unified_colleges.json'
      );
    } catch (err) {
      // Ignore duplicate key errors
    }
  }
  
  // Insert campus life
  if (college.campus_life) {
    const campus = college.campus_life;
    try {
      statements.insertCampusLife.run(
        collegeId,
        campus.housing_guarantee,
        campus.campus_safety_score || null,
        campus.cost_of_living_index || null,
        campus.climate_zone || null,
        campus.student_satisfaction_score || null,
        campus.athletics_division || null,
        campus.club_count || null,
        campus.mental_health_rating || null,
        campus.source || 'unified_colleges.json'
      );
    } catch (err) {
      // Ignore duplicate key errors
    }
  }
  
  // Insert rankings
  if (college.rankings && Array.isArray(college.rankings)) {
    for (const rank of college.rankings) {
      try {
        statements.insertRanking.run(
          collegeId,
          rank.year || new Date().getFullYear(),
          rank.ranking_body,
          rank.national_rank || null,
          rank.global_rank || null,
          rank.subject_rank || null,
          rank.employer_reputation_score || null,
          rank.peer_assessment_score || null,
          rank.prestige_index || null
        );
      } catch (err) {
        // Ignore duplicate key errors
      }
    }
  }
  
  return collegeId;
}

// Main seeding function
function seedDatabase() {
  console.log('='.repeat(60));
  console.log('  COMPREHENSIVE COLLEGE DATABASE SEEDER');
  console.log('='.repeat(60));
  console.log();
  
  // Load data
  const data = loadUnifiedData();
  if (!data || !data.colleges || data.colleges.length === 0) {
    console.error('❌ No college data to seed');
    process.exit(1);
  }
  
  // Initialize database
  console.log('\n🔧 Initializing database...');
  dbManager.initialize();
  dbManager.runMigrations();
  const db = dbManager.getDatabase();
  console.log('✅ Database initialized');
  
  // Run comprehensive schema migration
  if (!runComprehensiveMigration(db)) {
    console.error('❌ Failed to run comprehensive migration');
    process.exit(1);
  }
  
  // Clear existing comprehensive data
  console.log('\n🗑️  Clearing existing comprehensive college data...');
  const tablesToClear = [
    'predictive_metrics',
    'college_rankings',
    'campus_life',
    'student_demographics',
    'college_programs',
    'college_financial_data',
    'academic_outcomes',
    'admitted_student_stats',
    'college_admissions',
    'colleges_comprehensive'
  ];
  
  // First clear FTS table
  try {
    db.exec('DELETE FROM colleges_comprehensive_fts');
    console.log('  ✓ Cleared colleges_comprehensive_fts');
  } catch (err) {
    // Table may not exist yet
  }
  
  for (const table of tablesToClear) {
    try {
      db.exec(`DELETE FROM ${table}`);
      console.log(`  ✓ Cleared ${table}`);
    } catch (err) {
      console.log(`  - Skipped ${table} (may not exist)`);
    }
  }
  
  // Prepare statements
  console.log('\n📝 Preparing statements...');
  const statements = {};
  for (const [name, sql] of Object.entries(SQL)) {
    try {
      statements[name] = db.prepare(sql);
    } catch (err) {
      console.error(`  ❌ Failed to prepare ${name}: ${err.message}`);
    }
  }
  
  // Seed colleges
  console.log(`\n🌱 Seeding ${data.colleges.length} colleges...`);
  
  let inserted = 0;
  let errors = 0;
  const errorSample = [];
  
  const transaction = db.transaction((colleges) => {
    for (const college of colleges) {
      try {
        seedCollege(db, college, statements);
        inserted++;
        
        if (inserted % 500 === 0) {
          console.log(`  ✓ Processed ${inserted} colleges...`);
        }
      } catch (err) {
        errors++;
        if (errorSample.length < 5) {
          errorSample.push({ name: college.name, error: err.message });
        }
      }
    }
  });
  
  transaction(data.colleges);
  
  // Rebuild FTS index for searchability
  console.log('\n🔍 Rebuilding full-text search index...');
  try {
    // Use FTS5 rebuild command for content-sync tables
    db.exec("INSERT INTO colleges_comprehensive_fts(colleges_comprehensive_fts) VALUES('rebuild')");
    console.log('  ✓ FTS index rebuilt');
  } catch (err) {
    console.log('  ⚠️ FTS rebuild error:', err.message);
    // Try alternative approach - delete and reinsert
    try {
      db.exec("INSERT INTO colleges_comprehensive_fts(colleges_comprehensive_fts) VALUES('delete-all')");
      db.exec(`
        INSERT INTO colleges_comprehensive_fts(rowid, name, alternate_names, country, state_region, city, classification)
        SELECT id, name, alternate_names, country, state_region, city, classification
        FROM colleges_comprehensive
      `);
      console.log('  ✓ FTS index rebuilt (alternative method)');
    } catch (err2) {
      console.log('  ⚠️ FTS alternative rebuild error:', err2.message);
    }
  }
  
  // Print results
  console.log('\n' + '='.repeat(60));
  console.log('  SEEDING COMPLETE');
  console.log('='.repeat(60));
  console.log(`  ✅ Inserted: ${inserted} colleges`);
  if (errors > 0) {
    console.log(`  ⚠️  Errors: ${errors}`);
    if (errorSample.length > 0) {
      console.log('  Sample errors:');
      for (const err of errorSample) {
        console.log(`    - ${err.name}: ${err.error}`);
      }
    }
  }
  
  // Print statistics
  console.log('\n📊 Database Statistics:');
  
  const tables = [
    'colleges_comprehensive',
    'college_admissions',
    'admitted_student_stats',
    'academic_outcomes',
    'college_financial_data',
    'college_programs',
    'student_demographics',
    'campus_life',
    'college_rankings',
    'predictive_metrics'
  ];
  
  for (const table of tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      console.log(`  ${table}: ${count.count} records`);
    } catch (err) {
      console.log(`  ${table}: N/A`);
    }
  }
  
  // Show sample by country
  console.log('\n🌍 Colleges by Country (Top 15):');
  try {
    const byCountry = db.prepare(`
      SELECT country, COUNT(*) as count 
      FROM colleges_comprehensive 
      GROUP BY country 
      ORDER BY count DESC 
      LIMIT 15
    `).all();
    
    for (const row of byCountry) {
      console.log(`  ${row.country}: ${row.count}`);
    }
  } catch (err) {
    console.log('  Unable to query by country');
  }
  
  // Show sample colleges
  console.log('\n📋 Sample Colleges:');
  try {
    const sample = db.prepare(`
      SELECT c.name, c.country, c.city, a.acceptance_rate, r.global_rank
      FROM colleges_comprehensive c
      LEFT JOIN college_admissions a ON c.id = a.college_id
      LEFT JOIN college_rankings r ON c.id = r.college_id AND r.ranking_body = 'QS'
      ORDER BY r.global_rank ASC NULLS LAST
      LIMIT 10
    `).all();
    
    for (const row of sample) {
      const rate = row.acceptance_rate ? `${(row.acceptance_rate * 100).toFixed(1)}%` : 'N/A';
      const rank = row.global_rank ? `#${row.global_rank}` : 'Unranked';
      console.log(`  • ${row.name} (${row.country}) - ${rate}, ${rank}`);
    }
  } catch (err) {
    console.log('  Unable to query sample colleges');
  }
  
  // Close database
  dbManager.close();
  console.log('\n✅ Database seeding complete!');
}

// Run if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase, loadUnifiedData };
