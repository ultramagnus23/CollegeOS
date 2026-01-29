/**
 * Import Comprehensive Colleges Script
 * 
 * This script imports rich college data from JSON files into the SQLite database.
 * It maps comprehensive fields (SAT/ACT scores, GPA, tuition, costs, majors, deadlines,
 * essay prompts) to the database schema.
 * 
 * Usage:
 *   node backend/scripts/importComprehensiveColleges.js [--force]
 * 
 * Options:
 *   --force  Clear existing data before importing
 */

const path = require('path');
const fs = require('fs');

// Database manager from backend config
const dbManager = require('../src/config/database');

// JSON data paths
const DATA_DIR = path.join(__dirname, '..', '..', 'src', 'data', 'colleges');
const US_COLLEGES_PATH = path.join(DATA_DIR, 'usColleges.json');
const INDIAN_COLLEGES_PATH = path.join(DATA_DIR, 'indianColleges.json');
const UK_COLLEGES_PATH = path.join(DATA_DIR, 'ukColleges.json');
const GERMAN_COLLEGES_PATH = path.join(DATA_DIR, 'germanColleges.json');

// Parse command line arguments
const args = process.argv.slice(2);
const forceMode = args.includes('--force');

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Safely parse JSON file with error handling
 */
function safeParseJsonFile(filePath, fileLabel) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${fileLabel}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse semicolon-separated string into array
 */
function parseList(str) {
  if (!str) return [];
  return str.split(';').map(s => s.trim()).filter(Boolean);
}

/**
 * Extract major categories from top majors (simplified categorization)
 */
function extractMajorCategories(topMajors) {
  if (!topMajors) return [];
  
  const categoryMap = {
    'STEM': ['Computer Science', 'Engineering', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Data Science', 'Statistics'],
    'Business': ['Economics', 'Business', 'Finance', 'Management', 'Accounting', 'Marketing'],
    'Humanities': ['English', 'History', 'Philosophy', 'Classics', 'Literature', 'Languages'],
    'Social Sciences': ['Psychology', 'Sociology', 'Political Science', 'Anthropology', 'Politics', 'PPE'],
    'Arts': ['Art', 'Music', 'Theatre', 'Design', 'Architecture'],
    'Health': ['Medicine', 'Nursing', 'Public Health', 'Pre-Med', 'Pharmacy'],
    'Law': ['Law', 'Legal Studies']
  };
  
  const majors = parseList(topMajors);
  const categories = new Set();
  
  for (const major of majors) {
    for (const [category, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(kw => major.toLowerCase().includes(kw.toLowerCase()))) {
        categories.add(category);
      }
    }
  }
  
  return Array.from(categories);
}

/**
 * Build requirements JSON for US colleges (SAT/ACT)
 */
function buildUSRequirements(college) {
  return {
    satRange: {
      ebrw: { min: college.sat_ebrw_25th_percentile, max: college.sat_ebrw_75th_percentile },
      math: { min: college.sat_math_25th_percentile, max: college.sat_math_75th_percentile },
      total: { min: college.sat_total_25th_percentile, max: college.sat_total_75th_percentile }
    },
    actRange: {
      composite: { min: college.act_composite_25th_percentile, max: college.act_composite_75th_percentile }
    },
    averageGPA: college.average_gpa,
    applicationRequirements: parseList(college.application_requirements)
  };
}

/**
 * Build requirements JSON for Indian colleges (JEE/BITSAT/VITEEE)
 */
function buildIndianRequirements(college) {
  const requirements = {
    entranceExam: college.entrance_exam,
    applicationRequirements: parseList(college.admission_requirements)
  };
  
  // JEE Advanced cutoffs
  if (college.jee_advanced_cutoff_general_opening !== undefined) {
    requirements.jeeAdvanced = {
      general: { opening: college.jee_advanced_cutoff_general_opening, closing: college.jee_advanced_cutoff_general_closing },
      obc: { opening: college.jee_advanced_cutoff_obc_opening, closing: college.jee_advanced_cutoff_obc_closing },
      sc: { opening: college.jee_advanced_cutoff_sc_opening, closing: college.jee_advanced_cutoff_sc_closing },
      st: { opening: college.jee_advanced_cutoff_st_opening, closing: college.jee_advanced_cutoff_st_closing }
    };
  }
  
  // BITSAT cutoffs
  if (college.bitsat_cutoff_cs !== undefined) {
    requirements.bitsat = {
      cs: college.bitsat_cutoff_cs,
      ece: college.bitsat_cutoff_ece,
      eee: college.bitsat_cutoff_eee,
      mechanical: college.bitsat_cutoff_mechanical
    };
  }
  
  // VITEEE cutoffs
  if (college.viteee_cutoff_cs !== undefined) {
    requirements.viteee = {
      cs: college.viteee_cutoff_cs,
      ece: college.viteee_cutoff_ece,
      eee: college.viteee_cutoff_eee,
      mechanical: college.viteee_cutoff_mechanical
    };
  }
  
  return requirements;
}

/**
 * Build requirements JSON for UK colleges (A-Levels, IB)
 */
function buildUKRequirements(college) {
  return {
    aLevelRequirements: college.a_level_requirements,
    ibRequirements: college.ib_requirements,
    gcseRequirements: college.gcse_requirements,
    ucasPointsRequired: college.ucas_points_required,
    interviewRequired: college.interview_required, // Preserve original value (Yes/No/Course-dependent)
    admissionsTestRequired: college.admissions_test_required,
    applicationRequirements: parseList(college.admission_requirements)
  };
}

/**
 * Build requirements JSON for German colleges (Abitur, language)
 */
function buildGermanRequirements(college) {
  return {
    germanLanguageRequirement: college.german_language_requirement,
    englishLanguageRequirement: college.english_language_requirement,
    abiturGradeRequirement: college.abitur_grade_requirement,
    numerusClausus: college.numerus_clausus_programs,
    programsInEnglish: parseList(college.programs_in_english),
    applicationRequirements: parseList(college.admission_requirements)
  };
}

/**
 * Build research data JSON for US colleges
 */
function buildUSResearchData(college) {
  return {
    enrollment: college.total_enrollment,
    ranking: { usNews: college.rank },
    graduationRates: {
      fourYear: college.four_year_graduation_rate,
      sixYear: college.six_year_graduation_rate
    },
    studentFacultyRatio: college.student_faculty_ratio,
    financialData: {
      currency: 'USD',
      tuitionAnnual: college.tuition_annual,
      roomAndBoard: college.room_and_board,
      totalCostOfAttendance: college.total_cost_of_attendance,
      averageFinancialAidPackage: college.average_financial_aid_package,
      percentReceivingAid: college.percent_receiving_aid,
      netPriceByIncome: {
        '0-30k': college.net_price_income_0_30k,
        '30-48k': college.net_price_income_30_48k,
        '48-75k': college.net_price_income_48_75k,
        '75-110k': college.net_price_income_75_110k,
        '110k+': college.net_price_income_110k_plus
      }
    },
    essayPrompts: [
      college.essay_prompt_1 ? { prompt: college.essay_prompt_1, wordLimit: college.essay_prompt_1_word_limit } : null,
      college.essay_prompt_2 ? { prompt: college.essay_prompt_2, wordLimit: college.essay_prompt_2_word_limit } : null
    ].filter(Boolean),
    notablePrograms: parseList(college.notable_programs)
  };
}

/**
 * Build research data JSON for Indian colleges
 */
function buildIndianResearchData(college) {
  return {
    enrollment: college.total_enrollment,
    ranking: {
      nirf: college.nirf_ranking,
      qsWorld: college.qs_world_ranking
    },
    financialData: {
      currency: 'INR',
      tuitionAnnual: college.tuition_fees_inr_annual,
      hostelFees: college.hostel_fees_inr_annual,
      totalCostAnnual: college.total_cost_inr_annual
    },
    placement: {
      averagePackage: college.placement_average_package_inr,
      highestPackage: college.placement_highest_package_inr,
      placementPercentage: college.placement_percentage,
      topRecruiters: parseList(college.top_recruiters)
    },
    notablePrograms: parseList(college.notable_programs)
  };
}

/**
 * Build research data JSON for UK colleges
 */
function buildUKResearchData(college) {
  return {
    enrollment: college.total_enrollment,
    ranking: {
      qsWorld: college.qs_world_ranking,
      timesHigherEd: college.times_higher_ed_ranking,
      guardianUK: college.guardian_uk_ranking
    },
    acceptanceRate: college.acceptance_rate,
    financialData: {
      currency: 'GBP',
      tuitionDomestic: college.tuition_fees_uk_students_annual,
      tuitionInternational: college.tuition_fees_international_annual,
      livingCostsAnnual: college.living_costs_estimate_annual,
      totalCostInternational: college.total_cost_international
    },
    notablePrograms: parseList(college.notable_programs)
  };
}

/**
 * Build research data JSON for German colleges
 */
function buildGermanResearchData(college) {
  return {
    enrollment: college.total_enrollment,
    ranking: {
      qsWorld: college.qs_world_ranking,
      timesHigherEd: college.times_higher_ed_ranking
    },
    financialData: {
      currency: 'EUR',
      tuitionEU: college.tuition_fees_eu_students,
      tuitionNonEU: college.tuition_fees_non_eu_students,
      semesterFee: college.semester_fee,
      monthlyLivingCosts: college.living_costs_monthly_estimate
    },
    notablePrograms: parseList(college.notable_programs)
  };
}

/**
 * Build deadline templates JSON for US colleges
 */
function buildUSDeadlineTemplates(college) {
  return {
    earlyAction: college.early_action_deadline || null,
    earlyDecision: college.early_decision_deadline || null,
    regularDecision: college.regular_decision_deadline || null,
    financialAid: college.financial_aid_deadline || null
  };
}

/**
 * Build deadline templates JSON for Indian colleges
 */
function buildIndianDeadlineTemplates(college) {
  return {
    applicationStart: college.application_start_date || null,
    applicationEnd: college.application_end_date || null,
    counselingStart: college.counseling_start_date || null
  };
}

/**
 * Build deadline templates JSON for UK colleges
 */
function buildUKDeadlineTemplates(college) {
  return {
    regularDecision: college.application_deadline || null,
    oxbridge: college.oxbridge_deadline || null
  };
}

/**
 * Build deadline templates JSON for German colleges
 */
function buildGermanDeadlineTemplates(college) {
  return {
    winterSemester: college.application_deadline_winter_semester || null,
    summerSemester: college.application_deadline_summer_semester || null
  };
}

// ==========================================
// INSERT FUNCTIONS
// ==========================================

/**
 * Insert a college into the database with comprehensive data
 */
function insertCollege(db, college, country, buildRequirements, buildResearchData, buildDeadlines) {
  // Determine location based on country
  let location;
  if (country === 'United States') {
    location = `${college.city}, ${college.state}`;
  } else {
    location = college.city;
  }
  
  // Get programs
  const programs = parseList(college.majors_offered || college.programs_offered);
  const topMajors = parseList(college.top_majors || college.top_programs);
  const majorCategories = extractMajorCategories(college.top_majors || college.top_programs);
  
  // Insert into colleges table
  const insertCollege = db.prepare(`
    INSERT INTO colleges (
      name, country, location, official_website,
      academic_strengths, major_categories, trust_tier, is_verified
    ) VALUES (?, ?, ?, ?, ?, ?, 'official', 1)
  `);
  
  const result = insertCollege.run(
    college.name,
    country,
    location,
    college.website,
    topMajors.join(', '),
    majorCategories.join(', ')
  );
  
  const collegeId = result.lastInsertRowid;
  
  // Prepare insert for college_data
  const insertCollegeData = db.prepare(`
    INSERT INTO college_data (
      college_id, data_type, data_content, source_url, trust_tier, expires_at
    ) VALUES (?, ?, ?, ?, 'official', datetime('now', '+1 year'))
  `);
  
  // Insert requirements data
  const requirements = buildRequirements(college);
  insertCollegeData.run(
    collegeId,
    'requirements',
    JSON.stringify(requirements),
    college.website
  );
  
  // Insert research data
  const researchData = buildResearchData(college);
  insertCollegeData.run(
    collegeId,
    'research_data',
    JSON.stringify(researchData),
    college.website
  );
  
  // Insert deadline templates
  const deadlines = buildDeadlines(college);
  insertCollegeData.run(
    collegeId,
    'deadline_templates',
    JSON.stringify(deadlines),
    college.website
  );
  
  // Insert programs data
  insertCollegeData.run(
    collegeId,
    'programs',
    JSON.stringify({ programs, topPrograms: topMajors }),
    college.website
  );
  
  // Insert tuition/cost data separately for easy access
  const tuitionData = {
    tuitionAnnual: college.tuition_annual || college.tuition_fees_inr_annual || 
                   college.tuition_fees_international_annual || college.semester_fee,
    currency: country === 'United States' ? 'USD' : 
              country === 'India' ? 'INR' : 
              country === 'United Kingdom' ? 'GBP' : 'EUR'
  };
  insertCollegeData.run(
    collegeId,
    'tuition',
    JSON.stringify(tuitionData),
    college.website
  );
  
  return collegeId;
}

// ==========================================
// MAIN IMPORT FUNCTION
// ==========================================

function importComprehensiveColleges() {
  console.log('\n' + '='.repeat(60));
  console.log('🎓 COMPREHENSIVE COLLEGE DATA IMPORT SCRIPT');
  console.log('='.repeat(60) + '\n');
  
  // Initialize database
  const db = dbManager.initialize();
  console.log('✅ Database connected');
  
  // Run migrations to ensure tables exist
  dbManager.runMigrations();
  console.log('✅ Migrations applied');
  
  // Handle --force flag
  if (forceMode) {
    console.log('\n⚠️  Force mode enabled - clearing existing data...');
    
    // Delete existing college_data first (foreign key constraint)
    const deleteCollegeData = db.prepare('DELETE FROM college_data');
    const dataResult = deleteCollegeData.run();
    console.log(`   Deleted ${dataResult.changes} college_data records`);
    
    // Delete existing colleges
    const deleteColleges = db.prepare('DELETE FROM colleges');
    const collegeResult = deleteColleges.run();
    console.log(`   Deleted ${collegeResult.changes} college records`);
    
    console.log('✅ Existing data cleared\n');
  }
  
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
      const usColleges = safeParseJsonFile(US_COLLEGES_PATH, 'usColleges.json');
      
      for (const college of usColleges) {
        try {
          const id = insertCollege(
            db, 
            college, 
            'United States',
            buildUSRequirements,
            buildUSResearchData,
            buildUSDeadlineTemplates
          );
          console.log(`   ✅ [US] ${college.name} (ID: ${id})`);
          stats.us.success++;
        } catch (error) {
          console.error(`   ❌ [US] ${college.name}: ${error.message}`);
          stats.us.failed++;
        }
      }
    } else {
      console.log('⚠️  US colleges file not found:', US_COLLEGES_PATH);
    }
    
    // Import Indian colleges
    if (fs.existsSync(INDIAN_COLLEGES_PATH)) {
      console.log('\n📚 Importing Indian colleges...');
      const indianColleges = safeParseJsonFile(INDIAN_COLLEGES_PATH, 'indianColleges.json');
      
      for (const college of indianColleges) {
        try {
          const id = insertCollege(
            db,
            college,
            'India',
            buildIndianRequirements,
            buildIndianResearchData,
            buildIndianDeadlineTemplates
          );
          console.log(`   ✅ [IN] ${college.name} (ID: ${id})`);
          stats.india.success++;
        } catch (error) {
          console.error(`   ❌ [IN] ${college.name}: ${error.message}`);
          stats.india.failed++;
        }
      }
    } else {
      console.log('⚠️  Indian colleges file not found:', INDIAN_COLLEGES_PATH);
    }
    
    // Import UK colleges
    if (fs.existsSync(UK_COLLEGES_PATH)) {
      console.log('\n📚 Importing UK colleges...');
      const ukColleges = safeParseJsonFile(UK_COLLEGES_PATH, 'ukColleges.json');
      
      for (const college of ukColleges) {
        try {
          const id = insertCollege(
            db,
            college,
            'United Kingdom',
            buildUKRequirements,
            buildUKResearchData,
            buildUKDeadlineTemplates
          );
          console.log(`   ✅ [UK] ${college.name} (ID: ${id})`);
          stats.uk.success++;
        } catch (error) {
          console.error(`   ❌ [UK] ${college.name}: ${error.message}`);
          stats.uk.failed++;
        }
      }
    } else {
      console.log('⚠️  UK colleges file not found:', UK_COLLEGES_PATH);
    }
    
    // Import German colleges
    if (fs.existsSync(GERMAN_COLLEGES_PATH)) {
      console.log('\n📚 Importing German colleges...');
      const germanColleges = safeParseJsonFile(GERMAN_COLLEGES_PATH, 'germanColleges.json');
      
      for (const college of germanColleges) {
        try {
          const id = insertCollege(
            db,
            college,
            'Germany',
            buildGermanRequirements,
            buildGermanResearchData,
            buildGermanDeadlineTemplates
          );
          console.log(`   ✅ [DE] ${college.name} (ID: ${id})`);
          stats.germany.success++;
        } catch (error) {
          console.error(`   ❌ [DE] ${college.name}: ${error.message}`);
          stats.germany.failed++;
        }
      }
    } else {
      console.log('⚠️  German colleges file not found:', GERMAN_COLLEGES_PATH);
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
    dbManager.close();
    process.exit(1);
  }
  
  // Verification queries
  console.log('🔍 VERIFICATION QUERIES\n');
  
  try {
    // Count colleges by country
    const countByCountry = db.prepare(`
      SELECT country, COUNT(*) as count 
      FROM colleges 
      GROUP BY country
    `).all();
    
    console.log('Colleges by Country:');
    for (const row of countByCountry) {
      console.log(`   ${row.country}: ${row.count}`);
    }
    
    // Count college_data by type
    const countByType = db.prepare(`
      SELECT data_type, COUNT(*) as count 
      FROM college_data 
      GROUP BY data_type
    `).all();
    
    console.log('\nCollege Data by Type:');
    for (const row of countByType) {
      console.log(`   ${row.data_type}: ${row.count}`);
    }
    
    // Sample data verification
    const sampleCollege = db.prepare(`
      SELECT c.id, c.name, c.country, c.location, cd.data_type, cd.data_content
      FROM colleges c
      LEFT JOIN college_data cd ON c.id = cd.college_id
      WHERE c.name LIKE '%Princeton%' OR c.name LIKE '%IIT Bombay%' OR c.name LIKE '%Oxford%'
      LIMIT 5
    `).all();
    
    if (sampleCollege.length > 0) {
      console.log('\nSample Data Verification:');
      for (const row of sampleCollege) {
        console.log(`   ${row.name} (${row.country}): ${row.data_type}`);
      }
    }
    
  } catch (error) {
    console.error('Verification queries failed:', error.message);
  }
  
  dbManager.close();
  console.log('\n✅ Import complete. Database connection closed.\n');
}

// Run import
importComprehensiveColleges();
