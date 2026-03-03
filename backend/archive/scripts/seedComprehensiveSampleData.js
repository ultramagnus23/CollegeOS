/**
 * Seed Comprehensive College Data
 * Seeds sample data for the expanded CollegeVine-depth schema
 * Includes special requirements tracking (peer rec, portfolio, audition)
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'colleges.db');
const db = sqlite3(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('Starting comprehensive data seeding...\n');

// ==========================================
// SAMPLE COLLEGES WITH SPECIAL REQUIREMENTS
// ==========================================

const sampleColleges = [
  {
    name: 'Dartmouth College',
    country: 'United States',
    state_region: 'New Hampshire',
    city: 'Hanover',
    urban_classification: 'Rural',
    institution_type: 'Private Non-Profit',
    classification: 'Research University',
    founding_year: 1769,
    undergraduate_enrollment: 4556,
    graduate_enrollment: 2138,
    website_url: 'https://dartmouth.edu'
  },
  {
    name: 'Davidson College',
    country: 'United States',
    state_region: 'North Carolina',
    city: 'Davidson',
    urban_classification: 'Suburban',
    institution_type: 'Private Non-Profit',
    classification: 'Liberal Arts College',
    founding_year: 1837,
    undergraduate_enrollment: 1973,
    website_url: 'https://davidson.edu'
  },
  {
    name: 'Rhode Island School of Design',
    country: 'United States',
    state_region: 'Rhode Island',
    city: 'Providence',
    urban_classification: 'Urban',
    institution_type: 'Private Non-Profit',
    classification: 'Art School',
    founding_year: 1877,
    undergraduate_enrollment: 2024,
    website_url: 'https://risd.edu'
  },
  {
    name: 'Juilliard School',
    country: 'United States',
    state_region: 'New York',
    city: 'New York City',
    urban_classification: 'Urban',
    institution_type: 'Private Non-Profit',
    classification: 'Conservatory',
    founding_year: 1905,
    undergraduate_enrollment: 489,
    website_url: 'https://juilliard.edu'
  },
  {
    name: 'Bates College',
    country: 'United States',
    state_region: 'Maine',
    city: 'Lewiston',
    urban_classification: 'Small Town',
    institution_type: 'Private Non-Profit',
    classification: 'Liberal Arts College',
    founding_year: 1855,
    undergraduate_enrollment: 1792,
    website_url: 'https://bates.edu'
  },
  {
    name: 'MIT',
    country: 'United States',
    state_region: 'Massachusetts',
    city: 'Cambridge',
    urban_classification: 'Urban',
    institution_type: 'Private Non-Profit',
    classification: 'Research University',
    founding_year: 1861,
    undergraduate_enrollment: 4638,
    graduate_enrollment: 6990,
    website_url: 'https://mit.edu'
  },
  {
    name: 'Stanford University',
    country: 'United States',
    state_region: 'California',
    city: 'Stanford',
    urban_classification: 'Suburban',
    institution_type: 'Private Non-Profit',
    classification: 'Research University',
    founding_year: 1885,
    undergraduate_enrollment: 8049,
    graduate_enrollment: 9368,
    website_url: 'https://stanford.edu'
  },
  {
    name: 'Harvard University',
    country: 'United States',
    state_region: 'Massachusetts',
    city: 'Cambridge',
    urban_classification: 'Urban',
    institution_type: 'Private Non-Profit',
    classification: 'Research University',
    founding_year: 1636,
    undergraduate_enrollment: 7153,
    graduate_enrollment: 13120,
    website_url: 'https://harvard.edu'
  }
];

// Insert colleges
const insertCollege = db.prepare(`
  INSERT OR IGNORE INTO colleges_comprehensive 
  (name, country, state_region, city, urban_classification, institution_type, 
   classification, founding_year, undergraduate_enrollment, graduate_enrollment, 
   total_enrollment, website_url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const college of sampleColleges) {
  const total = (college.undergraduate_enrollment || 0) + (college.graduate_enrollment || 0);
  insertCollege.run(
    college.name, college.country, college.state_region, college.city,
    college.urban_classification, college.institution_type, college.classification,
    college.founding_year, college.undergraduate_enrollment, college.graduate_enrollment || null,
    total, college.website_url
  );
}
console.log(`Inserted ${sampleColleges.length} sample colleges`);

// Get college IDs
const getCollegeId = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ?');

// ==========================================
// APPLICATION REQUIREMENTS (Special Requirements)
// ==========================================

const insertAppRequirements = db.prepare(`
  INSERT OR REPLACE INTO application_requirements
  (college_id, common_app_accepted, coalition_app_accepted, supplemental_essays_required,
   supplemental_essay_count, interview_policy, peer_recommendation_required,
   peer_recommendation_details, portfolio_required, portfolio_programs,
   audition_required, audition_programs, graded_paper_required, graded_paper_details,
   toefl_minimum, ielts_minimum, demonstrated_interest_tracked, legacy_preference,
   application_fee, fee_waiver_available, source, confidence_score)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

// Dartmouth - Peer Recommendation Required
const dartmouthId = getCollegeId.get('Dartmouth College')?.id;
if (dartmouthId) {
  insertAppRequirements.run(
    dartmouthId, 1, 1, 1, 2, 'recommended', 1,
    'Dartmouth requires a peer recommendation from a classmate who knows you well. This should complement your counselor and teacher recommendations.',
    0, null, 0, null, 0, null,
    100, 7.0, 1, 1, 80, 1, 'dartmouth.edu', 0.95
  );
  console.log('Added Dartmouth application requirements (PEER REC REQUIRED)');
}

// Davidson - Peer Recommendation Required
const davidsonId = getCollegeId.get('Davidson College')?.id;
if (davidsonId) {
  insertAppRequirements.run(
    davidsonId, 1, 1, 1, 2, 'recommended', 1,
    'Davidson values a peer recommendation that provides unique insight into your character, interests, and contributions to your community.',
    0, null, 0, null, 0, null,
    100, 7.0, 1, 0, 50, 1, 'davidson.edu', 0.95
  );
  console.log('Added Davidson application requirements (PEER REC REQUIRED)');
}

// RISD - Portfolio Required
const risdId = getCollegeId.get('Rhode Island School of Design')?.id;
if (risdId) {
  insertAppRequirements.run(
    risdId, 1, 0, 1, 1, 'optional', 0, null,
    1, JSON.stringify(['All Programs']),
    0, null, 0, null,
    93, 6.5, 0, 0, 60, 1, 'risd.edu', 0.95
  );
  console.log('Added RISD application requirements (PORTFOLIO REQUIRED)');
}

// Juilliard - Audition Required
const juilliardId = getCollegeId.get('Juilliard School')?.id;
if (juilliardId) {
  insertAppRequirements.run(
    juilliardId, 0, 0, 1, 1, 'not_offered', 0, null,
    0, null,
    1, JSON.stringify(['Music', 'Dance', 'Drama']),
    0, null,
    89, 6.5, 0, 0, 110, 1, 'juilliard.edu', 0.95
  );
  console.log('Added Juilliard application requirements (AUDITION REQUIRED)');
}

// Bates - Graded Paper Required (Optional but encouraged)
const batesId = getCollegeId.get('Bates College')?.id;
if (batesId) {
  insertAppRequirements.run(
    batesId, 1, 1, 1, 3, 'optional', 0, null,
    0, null, 0, null,
    1, 'Bates strongly encourages submission of a graded analytical writing sample from a humanities or social science course.',
    100, 7.0, 1, 0, 60, 1, 'bates.edu', 0.95
  );
  console.log('Added Bates application requirements (GRADED PAPER ENCOURAGED)');
}

// MIT - Portfolio for Architecture
const mitId = getCollegeId.get('MIT')?.id;
if (mitId) {
  insertAppRequirements.run(
    mitId, 1, 0, 1, 5, 'optional', 0, null,
    1, JSON.stringify(['Architecture (Course 4)']),
    0, null, 0, null,
    100, 7.0, 0, 0, 75, 1, 'mit.edu', 0.95
  );
  console.log('Added MIT application requirements');
}

// Stanford - Standard requirements
const stanfordId = getCollegeId.get('Stanford University')?.id;
if (stanfordId) {
  insertAppRequirements.run(
    stanfordId, 1, 1, 1, 3, 'not_offered', 0, null,
    0, null, 0, null, 0, null,
    100, 7.0, 0, 0, 90, 1, 'stanford.edu', 0.95
  );
  console.log('Added Stanford application requirements');
}

// Harvard - Standard requirements
const harvardId = getCollegeId.get('Harvard University')?.id;
if (harvardId) {
  insertAppRequirements.run(
    harvardId, 1, 0, 1, 2, 'recommended', 0, null,
    0, null, 0, null, 0, null,
    100, 7.0, 0, 1, 85, 1, 'harvard.edu', 0.95
  );
  console.log('Added Harvard application requirements');
}

// ==========================================
// APPLICATION DEADLINES
// ==========================================

const insertDeadlines = db.prepare(`
  INSERT OR REPLACE INTO application_deadlines
  (college_id, academic_year, early_decision_1_deadline, early_decision_1_notification,
   early_decision_2_deadline, regular_decision_deadline, regular_decision_notification,
   fafsa_priority_deadline, enrollment_deposit_deadline, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

if (dartmouthId) {
  insertDeadlines.run(dartmouthId, '2024-2025', '2024-11-01', '2024-12-15', '2025-01-02', '2025-01-02', '2025-04-01', '2025-02-01', '2025-05-01', 'dartmouth.edu');
}
if (mitId) {
  insertDeadlines.run(mitId, '2024-2025', null, null, null, '2025-01-01', '2025-03-14', '2025-02-15', '2025-05-01', 'mit.edu');
}
if (stanfordId) {
  insertDeadlines.run(stanfordId, '2024-2025', null, null, null, '2025-01-02', '2025-04-01', '2025-02-15', '2025-05-01', 'stanford.edu');
}
if (harvardId) {
  insertDeadlines.run(harvardId, '2024-2025', null, null, null, '2025-01-01', '2025-04-01', '2025-02-01', '2025-05-01', 'harvard.edu');
}

console.log('Added application deadlines');

// ==========================================
// ADMISSIONS DATA
// ==========================================

const insertAdmissions = db.prepare(`
  INSERT OR REPLACE INTO college_admissions
  (college_id, year, acceptance_rate, early_decision_rate, yield_rate,
   application_volume, test_optional_flag, test_optional_permanent, superscore_sat, superscore_act,
   source, confidence_score)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const admissionsData = [
  { name: 'Dartmouth College', rate: 6.2, edRate: 18.0, yield: 58, apps: 28841, testOpt: 1, superscore: 1 },
  { name: 'Davidson College', rate: 17.5, edRate: 45.0, yield: 48, apps: 7200, testOpt: 1, superscore: 1 },
  { name: 'MIT', rate: 3.9, edRate: null, yield: 85, apps: 26914, testOpt: 0, superscore: 0 },
  { name: 'Stanford University', rate: 3.6, edRate: null, yield: 87, apps: 56378, testOpt: 1, superscore: 1 },
  { name: 'Harvard University', rate: 3.2, edRate: null, yield: 85, apps: 57435, testOpt: 1, superscore: 1 },
  { name: 'Rhode Island School of Design', rate: 16.8, edRate: 26.0, yield: 45, apps: 4200, testOpt: 1, superscore: 1 },
  { name: 'Juilliard School', rate: 6.0, edRate: null, yield: 78, apps: 2800, testOpt: 1, superscore: 0 },
  { name: 'Bates College', rate: 13.0, edRate: 48.0, yield: 42, apps: 8400, testOpt: 1, superscore: 1 }
];

for (const data of admissionsData) {
  const collegeId = getCollegeId.get(data.name)?.id;
  if (collegeId) {
    insertAdmissions.run(
      collegeId, 2024, data.rate, data.edRate, data.yield, data.apps,
      data.testOpt, data.testOpt, data.superscore, data.superscore,
      'CDS 2023-2024', 0.9
    );
  }
}
console.log('Added admissions data');

// ==========================================
// ADMITTED STUDENT STATS
// ==========================================

const insertStats = db.prepare(`
  INSERT OR REPLACE INTO admitted_student_stats
  (college_id, year, gpa_25, gpa_50, gpa_75, sat_25, sat_50, sat_75, 
   act_25, act_50, act_75, source, confidence_score)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const statsData = [
  { name: 'Dartmouth College', gpa: [3.8, 3.95, 4.0], sat: [1470, 1520, 1560], act: [33, 34, 35] },
  { name: 'MIT', gpa: [3.9, 3.97, 4.0], sat: [1520, 1550, 1580], act: [34, 35, 36] },
  { name: 'Stanford University', gpa: [3.85, 3.95, 4.0], sat: [1500, 1540, 1570], act: [33, 35, 36] },
  { name: 'Harvard University', gpa: [3.9, 3.97, 4.0], sat: [1480, 1530, 1580], act: [33, 35, 36] },
  { name: 'Davidson College', gpa: [3.7, 3.9, 4.0], sat: [1380, 1450, 1510], act: [31, 33, 34] },
  { name: 'Bates College', gpa: [3.6, 3.85, 4.0], sat: [1350, 1420, 1490], act: [31, 33, 34] }
];

for (const data of statsData) {
  const collegeId = getCollegeId.get(data.name)?.id;
  if (collegeId) {
    insertStats.run(
      collegeId, 2024,
      data.gpa[0], data.gpa[1], data.gpa[2],
      data.sat[0], data.sat[1], data.sat[2],
      data.act[0], data.act[1], data.act[2],
      'CDS 2023-2024', 0.9
    );
  }
}
console.log('Added admitted student stats');

// ==========================================
// CAMPUS LIFE DATA
// ==========================================

const insertCampusLife = db.prepare(`
  INSERT OR REPLACE INTO campus_life
  (college_id, housing_guarantee, campus_safety_score, climate_zone, 
   student_satisfaction_score, athletics_division, club_count, mental_health_rating,
   campus_setting, campus_walkability_score, greek_life_percentage, dining_hall_rating,
   source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const campusData = [
  { name: 'Dartmouth College', housing: 'All Years', safety: 8.5, climate: 'Cold', satisfaction: 8.8, 
    division: 'NCAA Division I', clubs: 350, mental: 8.0, setting: 'rural', walkability: 9, greek: 55.0, dining: 8.5 },
  { name: 'MIT', housing: 'Freshman Only', safety: 8.2, climate: 'Cold', satisfaction: 8.5,
    division: 'NCAA Division III', clubs: 500, mental: 7.5, setting: 'urban', walkability: 9, greek: 40.0, dining: 7.5 },
  { name: 'Stanford University', housing: 'Freshman Only', safety: 8.8, climate: 'Mild', satisfaction: 9.2,
    division: 'NCAA Division I', clubs: 650, mental: 8.5, setting: 'suburban', walkability: 8, greek: 20.0, dining: 8.5 },
  { name: 'Harvard University', housing: 'All Years', safety: 8.5, climate: 'Cold', satisfaction: 8.8,
    division: 'NCAA Division I', clubs: 450, mental: 8.0, setting: 'urban', walkability: 9, greek: 0, dining: 8.0 }
];

for (const data of campusData) {
  const collegeId = getCollegeId.get(data.name)?.id;
  if (collegeId) {
    insertCampusLife.run(
      collegeId, data.housing, data.safety, data.climate, data.satisfaction,
      data.division, data.clubs, data.mental, data.setting, data.walkability,
      data.greek, data.dining, 'Niche.com, CDS'
    );
  }
}
console.log('Added campus life data');

// ==========================================
// FINANCIAL DATA
// ==========================================

const insertFinancial = db.prepare(`
  INSERT OR REPLACE INTO college_financial_data
  (college_id, year, tuition_in_state, tuition_out_state, cost_of_attendance,
   avg_financial_aid, percent_receiving_aid, meets_full_need, need_blind_flag,
   css_profile_required, source, confidence_score)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const financialData = [
  { name: 'Dartmouth College', tuition: 62430, coa: 87865, aid: 62500, pctAid: 52, fullNeed: 1, needBlind: 1, css: 1 },
  { name: 'MIT', tuition: 59750, coa: 82730, aid: 61000, pctAid: 58, fullNeed: 1, needBlind: 1, css: 1 },
  { name: 'Stanford University', tuition: 61731, coa: 87225, aid: 64000, pctAid: 52, fullNeed: 1, needBlind: 1, css: 1 },
  { name: 'Harvard University', tuition: 59076, coa: 85060, aid: 63000, pctAid: 55, fullNeed: 1, needBlind: 1, css: 1 },
  { name: 'Davidson College', tuition: 60470, coa: 78575, aid: 55000, pctAid: 48, fullNeed: 1, needBlind: 1, css: 1 },
  { name: 'Bates College', tuition: 64020, coa: 82970, aid: 54000, pctAid: 45, fullNeed: 1, needBlind: 1, css: 1 }
];

for (const data of financialData) {
  const collegeId = getCollegeId.get(data.name)?.id;
  if (collegeId) {
    insertFinancial.run(
      collegeId, 2024, data.tuition, data.tuition, data.coa,
      data.aid, data.pctAid, data.fullNeed, data.needBlind, data.css,
      'CDS 2023-2024', 0.9
    );
  }
}
console.log('Added financial data');

// ==========================================
// ACADEMIC DETAILS
// ==========================================

const insertAcademic = db.prepare(`
  INSERT OR REPLACE INTO academic_details
  (college_id, class_size_under_20_percent, class_size_20_to_49_percent, class_size_50_plus_percent,
   average_class_size, honors_program_available, double_major_allowed, pass_fail_option,
   academic_calendar, undergraduate_research_opportunities, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const academicData = [
  { name: 'Dartmouth College', under20: 64, mid: 25, over50: 11, avg: 18, honors: 0, double: 1, pf: 1, cal: 'quarter', research: 1 },
  { name: 'MIT', under20: 58, mid: 28, over50: 14, avg: 20, honors: 0, double: 1, pf: 1, cal: 'semester', research: 1 },
  { name: 'Stanford University', under20: 68, mid: 20, over50: 12, avg: 16, honors: 0, double: 1, pf: 1, cal: 'quarter', research: 1 },
  { name: 'Harvard University', under20: 72, mid: 18, over50: 10, avg: 14, honors: 0, double: 1, pf: 1, cal: 'semester', research: 1 },
  { name: 'Davidson College', under20: 80, mid: 15, over50: 5, avg: 12, honors: 0, double: 1, pf: 1, cal: 'semester', research: 1 },
  { name: 'Bates College', under20: 78, mid: 18, over50: 4, avg: 14, honors: 0, double: 1, pf: 1, cal: '4-1-4', research: 1 }
];

for (const data of academicData) {
  const collegeId = getCollegeId.get(data.name)?.id;
  if (collegeId) {
    insertAcademic.run(
      collegeId, data.under20, data.mid, data.over50, data.avg,
      data.honors, data.double, data.pf, data.cal, data.research, 'CDS 2023-2024'
    );
  }
}
console.log('Added academic details');

// ==========================================
// SUMMARY
// ==========================================

console.log('\n=== Seeding Complete ===');

const counts = {
  colleges: db.prepare('SELECT COUNT(*) as c FROM colleges_comprehensive').get().c,
  requirements: db.prepare('SELECT COUNT(*) as c FROM application_requirements').get().c,
  deadlines: db.prepare('SELECT COUNT(*) as c FROM application_deadlines').get().c,
  admissions: db.prepare('SELECT COUNT(*) as c FROM college_admissions').get().c,
  stats: db.prepare('SELECT COUNT(*) as c FROM admitted_student_stats').get().c,
  campus: db.prepare('SELECT COUNT(*) as c FROM campus_life').get().c,
  financial: db.prepare('SELECT COUNT(*) as c FROM college_financial_data').get().c,
  academic: db.prepare('SELECT COUNT(*) as c FROM academic_details').get().c
};

console.log('\nDatabase Summary:');
console.log(`- Colleges: ${counts.colleges}`);
console.log(`- Application Requirements: ${counts.requirements}`);
console.log(`- Application Deadlines: ${counts.deadlines}`);
console.log(`- Admissions Data: ${counts.admissions}`);
console.log(`- Student Stats: ${counts.stats}`);
console.log(`- Campus Life: ${counts.campus}`);
console.log(`- Financial Data: ${counts.financial}`);
console.log(`- Academic Details: ${counts.academic}`);

// Show special requirements colleges
console.log('\n=== Colleges with Special Requirements ===');
const peerRecColleges = db.prepare(`
  SELECT c.name FROM colleges_comprehensive c
  JOIN application_requirements ar ON c.id = ar.college_id
  WHERE ar.peer_recommendation_required = 1
`).all();
console.log('Peer Recommendation Required:', peerRecColleges.map(c => c.name).join(', '));

const portfolioColleges = db.prepare(`
  SELECT c.name FROM colleges_comprehensive c
  JOIN application_requirements ar ON c.id = ar.college_id
  WHERE ar.portfolio_required = 1
`).all();
console.log('Portfolio Required:', portfolioColleges.map(c => c.name).join(', '));

const auditionColleges = db.prepare(`
  SELECT c.name FROM colleges_comprehensive c
  JOIN application_requirements ar ON c.id = ar.college_id
  WHERE ar.audition_required = 1
`).all();
console.log('Audition Required:', auditionColleges.map(c => c.name).join(', '));

const gradedPaperColleges = db.prepare(`
  SELECT c.name FROM colleges_comprehensive c
  JOIN application_requirements ar ON c.id = ar.college_id
  WHERE ar.graded_paper_required = 1
`).all();
console.log('Graded Paper Required:', gradedPaperColleges.map(c => c.name).join(', '));

db.close();
console.log('\nDone!');
