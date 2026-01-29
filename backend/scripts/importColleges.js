/**
 * Import All Colleges Script
 * 
 * This script imports college data from JSON files into the SQLite database.
 * Run with: node backend/scripts/importColleges.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Database path
const DB_PATH = path.join(__dirname, '..', 'database', 'college_app.db');

// JSON data paths
const DATA_DIR = path.join(__dirname, '..', '..', 'src', 'data', 'colleges');
const US_COLLEGES_PATH = path.join(DATA_DIR, 'usColleges.json');
const INDIAN_COLLEGES_PATH = path.join(DATA_DIR, 'indianColleges.json');
const UK_COLLEGES_PATH = path.join(DATA_DIR, 'ukColleges.json');
const GERMAN_COLLEGES_PATH = path.join(DATA_DIR, 'germanColleges.json');

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
  
  // Run migration first
  const migrationPath = path.join(__dirname, '..', 'migrations', '007_comprehensive_colleges.sql');
  if (fs.existsSync(migrationPath)) {
    console.log('🔨 Running comprehensive colleges migration...');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    db.exec(migration);
    console.log('✅ Migration completed');
  }
  
  return db;
}

// ==========================================
// INSERT FUNCTIONS
// ==========================================

function insertUSCollege(college) {
  // Insert into main colleges table
  const insertCollege = db.prepare(`
    INSERT INTO colleges_v2 (
      name, website_url, location_city, location_state, location_country,
      institution_type, us_news_ranking, total_enrollment, acceptance_rate,
      average_gpa, student_faculty_ratio, four_year_grad_rate, six_year_grad_rate,
      entrance_exam_type
    ) VALUES (?, ?, ?, ?, 'United States', ?, ?, ?, ?, ?, ?, ?, ?, 'SAT_ACT')
  `);
  
  const result = insertCollege.run(
    college.name,
    college.website,
    college.city,
    college.state,
    college.institution_type,
    college.rank,
    college.total_enrollment,
    college.acceptance_rate,
    college.average_gpa,
    college.student_faculty_ratio,
    college.four_year_graduation_rate,
    college.six_year_graduation_rate
  );
  
  const collegeId = result.lastInsertRowid;
  
  // Insert test scores
  const insertTestScores = db.prepare(`
    INSERT INTO test_scores (
      college_id, sat_ebrw_25th, sat_ebrw_75th, sat_math_25th, sat_math_75th,
      sat_total_25th, sat_total_75th, act_composite_25th, act_composite_75th
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertTestScores.run(
    collegeId,
    college.sat_ebrw_25th_percentile,
    college.sat_ebrw_75th_percentile,
    college.sat_math_25th_percentile,
    college.sat_math_75th_percentile,
    college.sat_total_25th_percentile,
    college.sat_total_75th_percentile,
    college.act_composite_25th_percentile,
    college.act_composite_75th_percentile
  );
  
  // Insert financial data
  const insertFinancial = db.prepare(`
    INSERT INTO financial_data (
      college_id, currency, tuition_annual, room_and_board, total_cost,
      average_aid_package, percent_receiving_aid,
      net_price_0_30k, net_price_30_48k, net_price_48_75k,
      net_price_75_110k, net_price_110k_plus
    ) VALUES (?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertFinancial.run(
    collegeId,
    college.tuition_annual,
    college.room_and_board,
    college.total_cost_of_attendance,
    college.average_financial_aid_package,
    college.percent_receiving_aid,
    college.net_price_income_0_30k,
    college.net_price_income_30_48k,
    college.net_price_income_48_75k,
    college.net_price_income_75_110k,
    college.net_price_income_110k_plus
  );
  
  // Insert deadlines
  const insertDeadline = db.prepare(`
    INSERT INTO college_deadlines (college_id, deadline_type, deadline_date)
    VALUES (?, ?, ?)
  `);
  
  if (college.early_action_deadline) {
    insertDeadline.run(collegeId, 'early_action', college.early_action_deadline);
  }
  if (college.early_decision_deadline) {
    insertDeadline.run(collegeId, 'early_decision', college.early_decision_deadline);
  }
  if (college.regular_decision_deadline) {
    insertDeadline.run(collegeId, 'regular', college.regular_decision_deadline);
  }
  if (college.financial_aid_deadline) {
    insertDeadline.run(collegeId, 'financial_aid', college.financial_aid_deadline);
  }
  
  // Insert majors
  const insertMajor = db.prepare(`
    INSERT INTO college_majors (college_id, major_name, is_top_major)
    VALUES (?, ?, ?)
  `);
  
  const majors = (college.majors_offered || '').split(';').filter(m => m.trim());
  const topMajors = (college.top_majors || '').split(';').map(m => m.trim().toLowerCase());
  
  for (const major of majors) {
    const isTop = topMajors.includes(major.trim().toLowerCase()) ? 1 : 0;
    insertMajor.run(collegeId, major.trim(), isTop);
  }
  
  // Insert essay prompts
  const insertEssay = db.prepare(`
    INSERT INTO essay_prompts (college_id, prompt_text, word_limit, prompt_order)
    VALUES (?, ?, ?, ?)
  `);
  
  if (college.essay_prompt_1) {
    insertEssay.run(collegeId, college.essay_prompt_1, college.essay_prompt_1_word_limit, 1);
  }
  if (college.essay_prompt_2) {
    insertEssay.run(collegeId, college.essay_prompt_2, college.essay_prompt_2_word_limit, 2);
  }
  
  // Insert application requirements
  const insertReq = db.prepare(`
    INSERT INTO application_requirements (college_id, requirement_text)
    VALUES (?, ?)
  `);
  
  const requirements = (college.application_requirements || '').split(';').filter(r => r.trim());
  for (const req of requirements) {
    insertReq.run(collegeId, req.trim());
  }
  
  return collegeId;
}

function insertIndianCollege(college) {
  // Insert into main colleges table
  const insertCollege = db.prepare(`
    INSERT INTO colleges_v2 (
      name, website_url, location_city, location_state, location_country,
      institution_type, nirf_ranking, qs_ranking, total_enrollment,
      entrance_exam_type
    ) VALUES (?, ?, ?, ?, 'India', ?, ?, ?, ?, ?)
  `);
  
  const result = insertCollege.run(
    college.name,
    college.website,
    college.city,
    college.state,
    college.institution_type,
    college.nirf_ranking,
    college.qs_world_ranking,
    college.total_enrollment,
    college.entrance_exam
  );
  
  const collegeId = result.lastInsertRowid;
  
  // Insert entrance exam cutoffs
  const insertExam = db.prepare(`
    INSERT INTO indian_entrance_exams (
      college_id, exam_type,
      cutoff_general_opening, cutoff_general_closing,
      cutoff_obc_opening, cutoff_obc_closing,
      cutoff_sc_opening, cutoff_sc_closing,
      cutoff_st_opening, cutoff_st_closing,
      cutoff_cs, cutoff_ece, cutoff_eee, cutoff_mechanical
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertExam.run(
    collegeId,
    college.entrance_exam,
    college.jee_advanced_cutoff_general_opening,
    college.jee_advanced_cutoff_general_closing,
    college.jee_advanced_cutoff_obc_opening,
    college.jee_advanced_cutoff_obc_closing,
    college.jee_advanced_cutoff_sc_opening,
    college.jee_advanced_cutoff_sc_closing,
    college.jee_advanced_cutoff_st_opening,
    college.jee_advanced_cutoff_st_closing,
    college.bitsat_cutoff_cs || college.viteee_cutoff_cs,
    college.bitsat_cutoff_ece || college.viteee_cutoff_ece,
    college.bitsat_cutoff_eee || college.viteee_cutoff_eee,
    college.bitsat_cutoff_mechanical || college.viteee_cutoff_mechanical
  );
  
  // Insert financial data (in INR)
  const insertFinancial = db.prepare(`
    INSERT INTO financial_data (
      college_id, currency, tuition_annual, total_cost
    ) VALUES (?, 'INR', ?, ?)
  `);
  
  insertFinancial.run(
    collegeId,
    college.tuition_fees_inr_annual,
    college.total_cost_inr_annual
  );
  
  // Insert placement data
  const insertPlacement = db.prepare(`
    INSERT INTO placement_data (
      college_id, average_package_inr, highest_package_inr,
      placement_percentage, top_recruiters
    ) VALUES (?, ?, ?, ?, ?)
  `);
  
  insertPlacement.run(
    collegeId,
    college.placement_average_package_inr,
    college.placement_highest_package_inr,
    college.placement_percentage,
    college.top_recruiters
  );
  
  // Insert majors
  const insertMajor = db.prepare(`
    INSERT INTO college_majors (college_id, major_name, is_top_major)
    VALUES (?, ?, ?)
  `);
  
  const programs = (college.programs_offered || '').split(';').filter(m => m.trim());
  const topPrograms = (college.top_programs || '').split(';').map(m => m.trim().toLowerCase());
  
  for (const program of programs) {
    const isTop = topPrograms.includes(program.trim().toLowerCase()) ? 1 : 0;
    insertMajor.run(collegeId, program.trim(), isTop);
  }
  
  return collegeId;
}

function insertUKCollege(college) {
  // Insert into main colleges table
  const insertCollege = db.prepare(`
    INSERT INTO colleges_v2 (
      name, website_url, location_city, location_country,
      institution_type, qs_ranking, times_ranking, guardian_ranking,
      total_enrollment, acceptance_rate, entrance_exam_type
    ) VALUES (?, ?, ?, 'United Kingdom', 'University', ?, ?, ?, ?, ?, 'A_LEVELS')
  `);
  
  const result = insertCollege.run(
    college.name,
    college.website,
    college.city,
    college.qs_world_ranking,
    college.times_higher_ed_ranking,
    college.guardian_uk_ranking,
    college.total_enrollment,
    college.acceptance_rate
  );
  
  const collegeId = result.lastInsertRowid;
  
  // Insert test score requirements (A-levels, IB, etc.)
  const insertTestScores = db.prepare(`
    INSERT INTO test_scores (
      college_id, a_level_requirements, ib_requirements,
      gcse_requirements, ucas_points_required
    ) VALUES (?, ?, ?, ?, ?)
  `);
  
  insertTestScores.run(
    collegeId,
    college.a_level_requirements,
    college.ib_requirements,
    college.gcse_requirements,
    college.ucas_points_required
  );
  
  // Insert financial data (in GBP)
  const insertFinancial = db.prepare(`
    INSERT INTO financial_data (
      college_id, currency, tuition_domestic, tuition_international,
      living_costs_annual, total_cost
    ) VALUES (?, 'GBP', ?, ?, ?, ?)
  `);
  
  insertFinancial.run(
    collegeId,
    college.tuition_fees_uk_students_annual,
    college.tuition_fees_international_annual,
    college.living_costs_estimate_annual,
    college.total_cost_international
  );
  
  // Insert UK-specific requirements
  const insertUKReq = db.prepare(`
    INSERT INTO uk_requirements (
      college_id, interview_required, admissions_test_required, oxbridge_deadline
    ) VALUES (?, ?, ?, ?)
  `);
  
  insertUKReq.run(
    collegeId,
    college.interview_required,
    college.admissions_test_required,
    college.oxbridge_deadline
  );
  
  // Insert deadline
  const insertDeadline = db.prepare(`
    INSERT INTO college_deadlines (college_id, deadline_type, deadline_date)
    VALUES (?, ?, ?)
  `);
  
  if (college.application_deadline) {
    insertDeadline.run(collegeId, 'regular', college.application_deadline);
  }
  if (college.oxbridge_deadline) {
    insertDeadline.run(collegeId, 'oxbridge', college.oxbridge_deadline);
  }
  
  // Insert majors
  const insertMajor = db.prepare(`
    INSERT INTO college_majors (college_id, major_name, is_top_major)
    VALUES (?, ?, ?)
  `);
  
  const programs = (college.programs_offered || '').split(';').filter(m => m.trim());
  const topPrograms = (college.top_programs || '').split(';').map(m => m.trim().toLowerCase());
  
  for (const program of programs) {
    const isTop = topPrograms.includes(program.trim().toLowerCase()) ? 1 : 0;
    insertMajor.run(collegeId, program.trim(), isTop);
  }
  
  return collegeId;
}

function insertGermanCollege(college) {
  // Insert into main colleges table
  const insertCollege = db.prepare(`
    INSERT INTO colleges_v2 (
      name, website_url, location_city, location_country,
      institution_type, qs_ranking, times_ranking, total_enrollment,
      entrance_exam_type
    ) VALUES (?, ?, ?, 'Germany', 'University', ?, ?, ?, 'ABITUR')
  `);
  
  const result = insertCollege.run(
    college.name,
    college.website,
    college.city,
    college.qs_world_ranking,
    college.times_higher_ed_ranking,
    college.total_enrollment
  );
  
  const collegeId = result.lastInsertRowid;
  
  // Insert financial data (in EUR)
  const insertFinancial = db.prepare(`
    INSERT INTO financial_data (
      college_id, currency, tuition_domestic, tuition_international,
      semester_fee, monthly_living_costs
    ) VALUES (?, 'EUR', ?, ?, ?, ?)
  `);
  
  insertFinancial.run(
    collegeId,
    college.tuition_fees_eu_students,
    college.tuition_fees_non_eu_students,
    college.semester_fee,
    college.living_costs_monthly_estimate
  );
  
  // Insert German-specific requirements
  const insertGermanReq = db.prepare(`
    INSERT INTO german_requirements (
      college_id, german_language_requirement, english_language_requirement,
      abitur_grade_requirement, numerus_clausus_programs, programs_in_english,
      winter_semester_deadline, summer_semester_deadline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insertGermanReq.run(
    collegeId,
    college.german_language_requirement,
    college.english_language_requirement,
    college.abitur_grade_requirement,
    college.numerus_clausus_programs,
    college.programs_in_english,
    college.application_deadline_winter_semester,
    college.application_deadline_summer_semester
  );
  
  // Insert majors (including English-taught ones)
  const insertMajor = db.prepare(`
    INSERT INTO college_majors (college_id, major_name, is_top_major)
    VALUES (?, ?, ?)
  `);
  
  const programs = (college.programs_offered || '').split(';').filter(m => m.trim());
  const topPrograms = (college.top_programs || '').split(';').map(m => m.trim().toLowerCase());
  
  for (const program of programs) {
    const isTop = topPrograms.includes(program.trim().toLowerCase()) ? 1 : 0;
    insertMajor.run(collegeId, program.trim(), isTop);
  }
  
  return collegeId;
}

// ==========================================
// MAIN IMPORT FUNCTION
// ==========================================

function importColleges() {
  console.log('\n' + '='.repeat(60));
  console.log('🎓 COLLEGE DATA IMPORT SCRIPT');
  console.log('='.repeat(60) + '\n');
  
  initDatabase();
  
  const stats = {
    us: { success: 0, failed: 0 },
    india: { success: 0, failed: 0 },
    uk: { success: 0, failed: 0 },
    germany: { success: 0, failed: 0 }
  };
  
  // Start transaction for better performance
  const importAll = db.transaction(() => {
    // Import US colleges
    if (fs.existsSync(US_COLLEGES_PATH)) {
      console.log('📚 Importing US colleges...');
      const usColleges = JSON.parse(fs.readFileSync(US_COLLEGES_PATH, 'utf8'));
      
      for (const college of usColleges) {
        try {
          const id = insertUSCollege(college);
          console.log(`   ✅ [US] ${college.name} (ID: ${id})`);
          stats.us.success++;
        } catch (error) {
          console.error(`   ❌ [US] ${college.name}: ${error.message}`);
          stats.us.failed++;
        }
      }
    } else {
      console.log('⚠️  US colleges file not found');
    }
    
    // Import Indian colleges
    if (fs.existsSync(INDIAN_COLLEGES_PATH)) {
      console.log('\n📚 Importing Indian colleges...');
      const indianColleges = JSON.parse(fs.readFileSync(INDIAN_COLLEGES_PATH, 'utf8'));
      
      for (const college of indianColleges) {
        try {
          const id = insertIndianCollege(college);
          console.log(`   ✅ [IN] ${college.name} (ID: ${id})`);
          stats.india.success++;
        } catch (error) {
          console.error(`   ❌ [IN] ${college.name}: ${error.message}`);
          stats.india.failed++;
        }
      }
    } else {
      console.log('⚠️  Indian colleges file not found');
    }
    
    // Import UK colleges
    if (fs.existsSync(UK_COLLEGES_PATH)) {
      console.log('\n📚 Importing UK colleges...');
      const ukColleges = JSON.parse(fs.readFileSync(UK_COLLEGES_PATH, 'utf8'));
      
      for (const college of ukColleges) {
        try {
          const id = insertUKCollege(college);
          console.log(`   ✅ [UK] ${college.name} (ID: ${id})`);
          stats.uk.success++;
        } catch (error) {
          console.error(`   ❌ [UK] ${college.name}: ${error.message}`);
          stats.uk.failed++;
        }
      }
    } else {
      console.log('⚠️  UK colleges file not found');
    }
    
    // Import German colleges
    if (fs.existsSync(GERMAN_COLLEGES_PATH)) {
      console.log('\n📚 Importing German colleges...');
      const germanColleges = JSON.parse(fs.readFileSync(GERMAN_COLLEGES_PATH, 'utf8'));
      
      for (const college of germanColleges) {
        try {
          const id = insertGermanCollege(college);
          console.log(`   ✅ [DE] ${college.name} (ID: ${id})`);
          stats.germany.success++;
        } catch (error) {
          console.error(`   ❌ [DE] ${college.name}: ${error.message}`);
          stats.germany.failed++;
        }
      }
    } else {
      console.log('⚠️  German colleges file not found');
    }
  });
  
  try {
    importAll();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`🇺🇸 US Colleges:      ${stats.us.success} success, ${stats.us.failed} failed`);
    console.log(`🇮🇳 Indian Colleges:  ${stats.india.success} success, ${stats.india.failed} failed`);
    console.log(`🇬🇧 UK Colleges:      ${stats.uk.success} success, ${stats.uk.failed} failed`);
    console.log(`🇩🇪 German Colleges:  ${stats.germany.success} success, ${stats.germany.failed} failed`);
    console.log('─'.repeat(60));
    const total = stats.us.success + stats.india.success + stats.uk.success + stats.germany.success;
    const totalFailed = stats.us.failed + stats.india.failed + stats.uk.failed + stats.germany.failed;
    console.log(`📦 TOTAL: ${total} colleges imported, ${totalFailed} failed`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Transaction failed:', error.message);
    console.log('All changes have been rolled back.');
    process.exit(1);
  }
  
  // Verification queries
  console.log('🔍 VERIFICATION QUERIES\n');
  
  try {
    // Count by country
    const countByCountry = db.prepare(`
      SELECT location_country, COUNT(*) as count 
      FROM colleges_v2 
      GROUP BY location_country
    `).all();
    
    console.log('Colleges by Country:');
    for (const row of countByCountry) {
      console.log(`   ${row.location_country}: ${row.count}`);
    }
    
    // Count related data
    const testScoresCount = db.prepare('SELECT COUNT(*) as count FROM test_scores').get();
    const financialCount = db.prepare('SELECT COUNT(*) as count FROM financial_data').get();
    const majorsCount = db.prepare('SELECT COUNT(*) as count FROM college_majors').get();
    const deadlinesCount = db.prepare('SELECT COUNT(*) as count FROM college_deadlines').get();
    
    console.log('\nRelated Data Records:');
    console.log(`   Test Scores: ${testScoresCount.count}`);
    console.log(`   Financial Data: ${financialCount.count}`);
    console.log(`   Majors: ${majorsCount.count}`);
    console.log(`   Deadlines: ${deadlinesCount.count}`);
    
  } catch (error) {
    console.error('Verification queries failed:', error.message);
  }
  
  db.close();
  console.log('\n✅ Import complete. Database connection closed.\n');
}

// Run import
importColleges();
