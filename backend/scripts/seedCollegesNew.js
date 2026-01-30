// backend/scripts/seedCollegesNew.js
// Comprehensive seed script with 1000+ colleges
// Matches new unified schema

const path = require('path');
const config = require('../src/config/env');
const Database = require('better-sqlite3');
const fs = require('fs');

console.log('🌱 CollegeOS Comprehensive Seeding Script\n');
console.log('📂 Database path:', config.database.path);

// Check for wrong database path (common issue)
// Check if path ends with database.sqlite or contains it without college_app.db
const isOldPath = config.database.path.endsWith('database.sqlite') || 
                  (config.database.path.includes('database.sqlite') && !config.database.path.includes('college_app.db'));
if (isOldPath) {
  console.error('\n⚠️  WARNING: You are using the OLD database path!');
  console.error('   Current path:', config.database.path);
  console.error('   Correct path should be: ./database/college_app.db');
  console.error('');
  console.error('This is likely caused by a .env file with:');
  console.error('   DATABASE_PATH=./database.sqlite');
  console.error('');
  console.error('SOLUTIONS:');
  console.error('  1. Delete or update your .env file to use:');
  console.error('     DATABASE_PATH=./database/college_app.db');
  console.error('');
  console.error('  2. Run fresh-start.sh which will fix this automatically:');
  console.error('     ./fresh-start.sh');
  console.error('');
  console.error('  3. Remove .env file and let system use defaults');
  console.error('');
  process.exit(1);
}

// Ensure database directory exists
const dbDir = path.dirname(config.database.path);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log('✅ Created database directory');
}

// Connect to database
const db = new Database(config.database.path);
console.log('✅ Connected to database\n');

// Check if schema is correct
try {
  const tableInfo = db.prepare("PRAGMA table_info(colleges)").all();
  const columnNames = tableInfo.map(col => col.name);
  
  // Check for required columns from new unified schema
  const requiredColumns = ['type', 'official_website', 'major_categories', 'cbse_requirements', 
                          'igcse_requirements', 'ib_requirements', 'studielink_required'];
  const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
  
  if (missingColumns.length > 0) {
    console.error('❌ ERROR: Database schema is outdated!');
    console.error('');
    console.error('Missing columns:', missingColumns.join(', '));
    console.error('');
    console.error('SOLUTION 1 (Recommended): Run fresh-start script');
    console.error('');
    console.error('  ./fresh-start.sh');
    console.error('');
    console.error('This will delete the old database and create a fresh one.');
    console.error('');
    console.error('SOLUTION 2: Run migrations manually');
    console.error('');
    console.error('  node scripts/runMigrations.js');
    console.error('');
    console.error('Then run this seed script again.');
    console.error('');
    console.error('See backend/MIGRATION_TROUBLESHOOTING.md for detailed help.');
    console.error('');
    db.close();
    process.exit(1);
  }
  
  console.log('✅ Database schema is up to date\n');
} catch (error) {
  if (error.message.includes('no such table')) {
    console.error('❌ ERROR: colleges table does not exist!');
    console.error('');
    console.error('SOLUTION: Run fresh-start script');
    console.error('');
    console.error('  ./fresh-start.sh');
    console.error('');
    console.error('This will create the database with the correct schema.');
    console.error('');
    console.error('See backend/MIGRATION_TROUBLESHOOTING.md for detailed help.');
    console.error('');
    db.close();
    process.exit(1);
  }
  throw error;
}

// Helper function to create college object
function createCollege(name, country, location, type, acceptance_rate, tuition_cost, application_portal, options = {}) {
  // Use provided URLs or generate fallback
  const websiteUrl = options.website || `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.edu`;
  const admissionsUrl = options.admissions_url || `${websiteUrl}/admissions`;
  
  // Build requirements with test score data if provided
  const requirements = {
    accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE', 'A-Levels', 'IGCSE'],
    language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
    min_toefl: Math.floor(80 + Math.random() * 25),
    min_ielts: Number((6.0 + Math.random() * 1.5).toFixed(1)),
    min_percentage: Math.floor(70 + Math.random() * 25),
    sat_required: country === 'US',
    act_accepted: country === 'US'
  };
  
  // Add SAT/ACT ranges if provided
  if (options.sat_range) {
    requirements.satRange = {
      total: { min: options.sat_range.low, max: options.sat_range.high }
    };
  }
  if (options.act_range) {
    requirements.actRange = {
      composite: { min: options.act_range.low, max: options.act_range.high }
    };
  }
  if (options.avg_gpa) {
    requirements.averageGPA = options.avg_gpa;
  }
  
  return {
    name,
    country,
    location,
    type,
    official_website: websiteUrl,
    admissions_url: admissionsUrl,
    programs_url: options.programs_url || `${websiteUrl}/programs`,
    application_portal_url: application_portal === 'Common App' ? 'https://commonapp.org' : 
                           application_portal === 'UCAS' ? 'https://ucas.com' :
                           application_portal === 'Studielink' ? 'https://studielink.nl' : null,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Medicine', 'Liberal Arts', 'Data Science', 'Psychology', 'Biology', 'Mathematics', 'Physics']),
    major_categories: JSON.stringify(['STEM', 'Business', 'Liberal Arts', 'Health Sciences']),
    academic_strengths: JSON.stringify(['Research', 'Innovation', 'Industry Partnerships']),
    application_portal,
    acceptance_rate,
    requirements: JSON.stringify(requirements),
    deadline_templates: JSON.stringify({
      early_action: country === 'US' ? '11-01' : null,
      early_decision: country === 'US' ? '11-15' : null,
      regular_decision: country === 'US' ? '01-01' : country === 'UK' ? '01-15' : '05-01',
      rolling: type === 'Public' && Math.random() > 0.7
    }),
    tuition_cost,
    financial_aid_available: tuition_cost > 50000 && Math.random() > 0.3 ? 1 : 0,
    research_data: JSON.stringify({
      international_students: Math.floor(500 + Math.random() * 5000),
      avg_class_size: Math.floor(15 + Math.random() * 30),
      student_faculty_ratio: Math.floor(8 + Math.random() * 15),
      avg_gpa: options.avg_gpa || null
    }),
    description: `${type} university in ${location} offering comprehensive programs with strong academic reputation and research opportunities.`,
    logo_url: null,
    cbse_requirements: JSON.stringify({
      min_percentage: 75 + Math.floor(Math.random() * 20),
      required_subjects: ['Mathematics', 'English', 'Science'],
      boards_accepted: ['CBSE', 'ISC', 'State Boards']
    }),
    igcse_requirements: JSON.stringify({
      min_grades: 'AAABB',
      required_subjects: ['Mathematics', 'English', 'Sciences'],
      a_level_required: country === 'UK'
    }),
    ib_requirements: JSON.stringify({
      min_score: 28 + Math.floor(Math.random() * 14),
      required_subjects: ['Math', 'English'],
      higher_level_required: 2
    }),
    studielink_required: country === 'Netherlands' ? 1 : 0,
    numerus_fixus_programs: country === 'Netherlands' && Math.random() > 0.7 ? 
      JSON.stringify(['Medicine', 'Psychology']) : null,
    ucas_code: country === 'UK' ? name.substring(0, 4).toUpperCase() + Math.floor(Math.random() * 100) : null,
    common_app_id: country === 'US' && Math.random() > 0.3 ? Math.floor(10000 + Math.random() * 90000).toString() : null,
    trust_tier: options.verified ? 'official' : 'generated',
    is_verified: options.verified ? 1 : 0,
    last_scraped_at: null
  };
}

// Generate comprehensive college data
function generateColleges() {
  const colleges = [];
  
  // === US UNIVERSITIES (450) ===
  console.log('Generating US universities...');
  
  // Top US Universities with VERIFIED real data and URLs
  const topUS = [
    { name: 'Massachusetts Institute of Technology', location: 'Cambridge, MA', acceptance_rate: 0.04, tuition: 77020, website: 'https://www.mit.edu', admissions_url: 'https://admissions.mit.edu', sat_range: {low: 1510, high: 1580}, act_range: {low: 34, high: 36}, avg_gpa: 4.17 },
    { name: 'Stanford University', location: 'Stanford, CA', acceptance_rate: 0.035, tuition: 78218, website: 'https://www.stanford.edu', admissions_url: 'https://admission.stanford.edu', sat_range: {low: 1500, high: 1580}, act_range: {low: 33, high: 36}, avg_gpa: 3.96 },
    { name: 'Harvard University', location: 'Cambridge, MA', acceptance_rate: 0.033, tuition: 79450, website: 'https://www.harvard.edu', admissions_url: 'https://college.harvard.edu/admissions', sat_range: {low: 1480, high: 1580}, act_range: {low: 33, high: 36}, avg_gpa: 4.18 },
    { name: 'California Institute of Technology', location: 'Pasadena, CA', acceptance_rate: 0.03, tuition: 79947, website: 'https://www.caltech.edu', admissions_url: 'https://www.admissions.caltech.edu', sat_range: {low: 1530, high: 1580}, act_range: {low: 35, high: 36}, avg_gpa: 4.19 },
    { name: 'Princeton University', location: 'Princeton, NJ', acceptance_rate: 0.04, tuition: 77690, website: 'https://www.princeton.edu', admissions_url: 'https://admission.princeton.edu', sat_range: {low: 1500, high: 1580}, act_range: {low: 33, high: 35}, avg_gpa: 3.93 },
    { name: 'Yale University', location: 'New Haven, CT', acceptance_rate: 0.046, tuition: 80700, website: 'https://www.yale.edu', admissions_url: 'https://admissions.yale.edu', sat_range: {low: 1490, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 4.14 },
    { name: 'Columbia University', location: 'New York, NY', acceptance_rate: 0.039, tuition: 79752, website: 'https://www.columbia.edu', admissions_url: 'https://undergrad.admissions.columbia.edu', sat_range: {low: 1500, high: 1560}, act_range: {low: 34, high: 35}, avg_gpa: 4.14 },
    { name: 'University of Pennsylvania', location: 'Philadelphia, PA', acceptance_rate: 0.057, tuition: 81340, website: 'https://www.upenn.edu', admissions_url: 'https://admissions.upenn.edu', sat_range: {low: 1500, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 3.94 },
    { name: 'Duke University', location: 'Durham, NC', acceptance_rate: 0.06, tuition: 79338, website: 'https://www.duke.edu', admissions_url: 'https://admissions.duke.edu', sat_range: {low: 1480, high: 1570}, act_range: {low: 33, high: 35}, avg_gpa: 3.94 },
    { name: 'Carnegie Mellon University', location: 'Pittsburgh, PA', acceptance_rate: 0.11, tuition: 79000, website: 'https://www.cmu.edu', admissions_url: 'https://admission.enrollment.cmu.edu', sat_range: {low: 1480, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 3.89 },
    { name: 'University of California, Berkeley', location: 'Berkeley, CA', acceptance_rate: 0.11, tuition: 45000, website: 'https://www.berkeley.edu', admissions_url: 'https://admissions.berkeley.edu', sat_range: {low: 1300, high: 1530}, act_range: {low: 29, high: 35}, avg_gpa: 3.91 },
    { name: 'University of California, Los Angeles', location: 'Los Angeles, CA', acceptance_rate: 0.09, tuition: 44000, website: 'https://www.ucla.edu', admissions_url: 'https://admission.ucla.edu', sat_range: {low: 1290, high: 1510}, act_range: {low: 29, high: 34}, avg_gpa: 3.92 },
    { name: 'University of California, San Diego', location: 'San Diego, CA', acceptance_rate: 0.24, tuition: 43000, website: 'https://ucsd.edu', admissions_url: 'https://admissions.ucsd.edu', sat_range: {low: 1280, high: 1490}, act_range: {low: 28, high: 34}, avg_gpa: 4.06 },
    { name: 'Northwestern University', location: 'Evanston, IL', acceptance_rate: 0.07, tuition: 81567, website: 'https://www.northwestern.edu', admissions_url: 'https://admissions.northwestern.edu', sat_range: {low: 1470, high: 1550}, act_range: {low: 33, high: 35}, avg_gpa: 4.07 },
    { name: 'Cornell University', location: 'Ithaca, NY', acceptance_rate: 0.087, tuition: 79932, website: 'https://www.cornell.edu', admissions_url: 'https://admissions.cornell.edu', sat_range: {low: 1430, high: 1540}, act_range: {low: 32, high: 35}, avg_gpa: 4.05 },
    { name: 'Johns Hopkins University', location: 'Baltimore, MD', acceptance_rate: 0.073, tuition: 79872, website: 'https://www.jhu.edu', admissions_url: 'https://apply.jhu.edu', sat_range: {low: 1480, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 3.92 },
    { name: 'Brown University', location: 'Providence, RI', acceptance_rate: 0.053, tuition: 79674, website: 'https://www.brown.edu', admissions_url: 'https://admission.brown.edu', sat_range: {low: 1480, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 4.08 },
    { name: 'Rice University', location: 'Houston, TX', acceptance_rate: 0.09, tuition: 72120, website: 'https://www.rice.edu', admissions_url: 'https://admission.rice.edu', sat_range: {low: 1490, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 4.12 },
    { name: 'Vanderbilt University', location: 'Nashville, TN', acceptance_rate: 0.068, tuition: 78742, website: 'https://www.vanderbilt.edu', admissions_url: 'https://admissions.vanderbilt.edu', sat_range: {low: 1470, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 3.89 },
    { name: 'University of Southern California', location: 'Los Angeles, CA', acceptance_rate: 0.12, tuition: 81659, website: 'https://www.usc.edu', admissions_url: 'https://admission.usc.edu', sat_range: {low: 1400, high: 1530}, act_range: {low: 31, high: 34}, avg_gpa: 3.81 },
    { name: 'New York University', location: 'New York, NY', acceptance_rate: 0.12, tuition: 80000, website: 'https://www.nyu.edu', admissions_url: 'https://www.nyu.edu/admissions.html', sat_range: {low: 1420, high: 1540}, act_range: {low: 31, high: 35}, avg_gpa: 3.69 },
    { name: 'University of Texas at Austin', location: 'Austin, TX', acceptance_rate: 0.29, tuition: 42000, website: 'https://www.utexas.edu', admissions_url: 'https://admissions.utexas.edu', sat_range: {low: 1230, high: 1470}, act_range: {low: 27, high: 33}, avg_gpa: 3.82 },
    { name: 'Georgia Institute of Technology', location: 'Atlanta, GA', acceptance_rate: 0.16, tuition: 38000, website: 'https://www.gatech.edu', admissions_url: 'https://admission.gatech.edu', sat_range: {low: 1390, high: 1530}, act_range: {low: 31, high: 35}, avg_gpa: 4.09 },
    { name: 'University of Illinois Urbana-Champaign', location: 'Champaign, IL', acceptance_rate: 0.45, tuition: 40000, website: 'https://illinois.edu', admissions_url: 'https://admissions.illinois.edu', sat_range: {low: 1310, high: 1510}, act_range: {low: 28, high: 34}, avg_gpa: 3.79 },
    { name: 'University of Washington', location: 'Seattle, WA', acceptance_rate: 0.48, tuition: 41000, website: 'https://www.washington.edu', admissions_url: 'https://admit.washington.edu', sat_range: {low: 1240, high: 1460}, act_range: {low: 27, high: 33}, avg_gpa: 3.79 },
    { name: 'University of Wisconsin-Madison', location: 'Madison, WI', acceptance_rate: 0.49, tuition: 39000, website: 'https://www.wisc.edu', admissions_url: 'https://admissions.wisc.edu', sat_range: {low: 1280, high: 1470}, act_range: {low: 27, high: 32}, avg_gpa: 3.85 },
    { name: 'University of North Carolina at Chapel Hill', location: 'Chapel Hill, NC', acceptance_rate: 0.17, tuition: 37000, website: 'https://www.unc.edu', admissions_url: 'https://admissions.unc.edu', sat_range: {low: 1300, high: 1490}, act_range: {low: 28, high: 33}, avg_gpa: 4.39 },
    { name: 'University of Virginia', location: 'Charlottesville, VA', acceptance_rate: 0.19, tuition: 39000, website: 'https://www.virginia.edu', admissions_url: 'https://admission.virginia.edu', sat_range: {low: 1340, high: 1510}, act_range: {low: 30, high: 34}, avg_gpa: 4.31 },
    { name: 'Boston University', location: 'Boston, MA', acceptance_rate: 0.14, tuition: 78000, website: 'https://www.bu.edu', admissions_url: 'https://www.bu.edu/admissions', sat_range: {low: 1370, high: 1500}, act_range: {low: 31, high: 34}, avg_gpa: 3.71 },
    { name: 'Purdue University', location: 'West Lafayette, IN', acceptance_rate: 0.53, tuition: 32000, website: 'https://www.purdue.edu', admissions_url: 'https://www.admissions.purdue.edu', sat_range: {low: 1180, high: 1410}, act_range: {low: 25, high: 32}, avg_gpa: 3.69 },
    { name: 'Ohio State University', location: 'Columbus, OH', acceptance_rate: 0.53, tuition: 35000, website: 'https://www.osu.edu', admissions_url: 'https://undergrad.osu.edu/apply', sat_range: {low: 1240, high: 1430}, act_range: {low: 27, high: 32}, avg_gpa: 3.83 },
    { name: 'Pennsylvania State University', location: 'University Park, PA', acceptance_rate: 0.55, tuition: 38000, website: 'https://www.psu.edu', admissions_url: 'https://admissions.psu.edu', sat_range: {low: 1170, high: 1370}, act_range: {low: 25, high: 30}, avg_gpa: 3.59 },
    { name: 'University of Michigan', location: 'Ann Arbor, MI', acceptance_rate: 0.18, tuition: 57570, website: 'https://umich.edu', admissions_url: 'https://admissions.umich.edu', sat_range: {low: 1360, high: 1530}, act_range: {low: 31, high: 34}, avg_gpa: 3.90 },
    { name: 'University of Florida', location: 'Gainesville, FL', acceptance_rate: 0.23, tuition: 28000, website: 'https://www.ufl.edu', admissions_url: 'https://admissions.ufl.edu', sat_range: {low: 1300, high: 1470}, act_range: {low: 28, high: 33}, avg_gpa: 4.40 },
    { name: 'Dartmouth College', location: 'Hanover, NH', acceptance_rate: 0.065, tuition: 77152, website: 'https://home.dartmouth.edu', admissions_url: 'https://admissions.dartmouth.edu', sat_range: {low: 1460, high: 1560}, act_range: {low: 32, high: 35}, avg_gpa: 4.06 },
    { name: 'Washington University in St. Louis', location: 'St. Louis, MO', acceptance_rate: 0.13, tuition: 79000, website: 'https://wustl.edu', admissions_url: 'https://admissions.wustl.edu', sat_range: {low: 1480, high: 1560}, act_range: {low: 33, high: 35}, avg_gpa: 4.05 },
    { name: 'Emory University', location: 'Atlanta, GA', acceptance_rate: 0.13, tuition: 75038, website: 'https://www.emory.edu', admissions_url: 'https://apply.emory.edu', sat_range: {low: 1420, high: 1530}, act_range: {low: 32, high: 34}, avg_gpa: 3.88 },
    { name: 'University of Notre Dame', location: 'Notre Dame, IN', acceptance_rate: 0.15, tuition: 77505, website: 'https://www.nd.edu', admissions_url: 'https://admissions.nd.edu', sat_range: {low: 1410, high: 1530}, act_range: {low: 32, high: 35}, avg_gpa: 4.06 },
    { name: 'Georgetown University', location: 'Washington, DC', acceptance_rate: 0.12, tuition: 81000, website: 'https://www.georgetown.edu', admissions_url: 'https://uadmissions.georgetown.edu', sat_range: {low: 1400, high: 1540}, act_range: {low: 32, high: 35}, avg_gpa: 3.93 },
    { name: 'Tufts University', location: 'Medford, MA', acceptance_rate: 0.10, tuition: 77608, website: 'https://www.tufts.edu', admissions_url: 'https://admissions.tufts.edu', sat_range: {low: 1430, high: 1530}, act_range: {low: 32, high: 35}, avg_gpa: 4.04 },
    { name: 'Boston College', location: 'Chestnut Hill, MA', acceptance_rate: 0.17, tuition: 64000, website: 'https://www.bc.edu', admissions_url: 'https://www.bc.edu/admission', sat_range: {low: 1390, high: 1520}, act_range: {low: 32, high: 34}, avg_gpa: 4.03 },
    { name: 'Northeastern University', location: 'Boston, MA', acceptance_rate: 0.07, tuition: 77000, website: 'https://www.northeastern.edu', admissions_url: 'https://admissions.northeastern.edu', sat_range: {low: 1430, high: 1530}, act_range: {low: 32, high: 35}, avg_gpa: 4.02 },
    { name: 'University of California, Irvine', location: 'Irvine, CA', acceptance_rate: 0.21, tuition: 42000, website: 'https://uci.edu', admissions_url: 'https://admissions.uci.edu', sat_range: {low: 1190, high: 1420}, act_range: {low: 26, high: 32}, avg_gpa: 4.00 },
    { name: 'University of California, Davis', location: 'Davis, CA', acceptance_rate: 0.37, tuition: 43000, website: 'https://www.ucdavis.edu', admissions_url: 'https://admissions.ucdavis.edu', sat_range: {low: 1170, high: 1400}, act_range: {low: 25, high: 32}, avg_gpa: 3.99 },
    { name: 'University of California, Santa Barbara', location: 'Santa Barbara, CA', acceptance_rate: 0.26, tuition: 42000, website: 'https://www.ucsb.edu', admissions_url: 'https://admissions.sa.ucsb.edu', sat_range: {low: 1230, high: 1460}, act_range: {low: 27, high: 33}, avg_gpa: 4.12 }
  ];
  
  topUS.forEach(college => {
    colleges.push(createCollege(college.name, 'US', college.location, 
      college.tuition > 50000 ? 'Private' : 'Public', 
      college.acceptance_rate, college.tuition, 'Common App', {
        website: college.website,
        admissions_url: college.admissions_url,
        sat_range: college.sat_range,
        act_range: college.act_range,
        avg_gpa: college.avg_gpa,
        verified: true
      }));
  });
  
  // Generate 400 more US colleges
  const usStates = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI', 'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI', 'CO', 'MN', 'SC', 'AL', 'LA', 'OR', 'KY', 'IA'];
  const usCities = ['Springfield', 'Franklin', 'Madison', 'Arlington', 'Georgetown', 'Riverside', 'Salem', 'Clayton', 'Fairfield', 'Ashland', 'Burlington', 'Manchester', 'Oxford', 'Cambridge'];
  
  for (let i = 0; i < 400; i++) {
    const state = usStates[i % usStates.length];
    const city = usCities[i % usCities.length];
    const type = i % 3 === 0 ? 'Private' : 'Public';
    const name = type === 'Private' 
      ? `${city} College`
      : `${city} State University`;
    const tuition = type === 'Private' ? 40000 + Math.random() * 40000 : 25000 + Math.random() * 30000;
    
    colleges.push(createCollege(name, 'US', `${city}, ${state}`, type,
      0.3 + Math.random() * 0.6, tuition, 'Common App'));
  }
  
  // === UK UNIVERSITIES (200) ===
  console.log('Generating UK universities...');
  
  const topUK = [
    { name: 'University of Oxford', location: 'Oxford', acceptance_rate: 0.13, tuition: 35000 },
    { name: 'University of Cambridge', location: 'Cambridge', acceptance_rate: 0.15, tuition: 35000 },
    { name: 'Imperial College London', location: 'London', acceptance_rate: 0.11, tuition: 40000 },
    { name: 'UCL', location: 'London', acceptance_rate: 0.29, tuition: 35000 },
    { name: 'University of Edinburgh', location: 'Edinburgh', acceptance_rate: 0.40, tuition: 30000 },
    { name: 'LSE', location: 'London', acceptance_rate: 0.09, tuition: 37000 },
    { name: 'King\'s College London', location: 'London', acceptance_rate: 0.13, tuition: 33000 },
    { name: 'University of Manchester', location: 'Manchester', acceptance_rate: 0.56, tuition: 28000 },
    { name: 'University of Warwick', location: 'Coventry', acceptance_rate: 0.14, tuition: 30000 },
    { name: 'University of Bristol', location: 'Bristol', acceptance_rate: 0.58, tuition: 29000 }
  ];
  
  topUK.forEach(college => {
    colleges.push(createCollege(college.name, 'UK', college.location, 'Public',
      college.acceptance_rate, college.tuition, 'UCAS'));
  });
  
  const ukCities = ['Birmingham', 'Leeds', 'Glasgow', 'Liverpool', 'Sheffield', 'Newcastle', 'Nottingham', 'Southampton', 'Leicester', 'Cardiff', 'York', 'Bath', 'Durham', 'Exeter', 'Aberdeen', 'St Andrews'];
  for (let i = 0; i < 190; i++) {
    const city = ukCities[i % ukCities.length];
    colleges.push(createCollege(`University of ${city}`, 'UK', city, 'Public',
      0.45 + Math.random() * 0.45, 22000 + Math.random() * 15000, 'UCAS'));
  }
  
  // === CANADA (150) ===
  console.log('Generating Canadian universities...');
  
  const topCanada = [
    { name: 'University of Toronto', location: 'Toronto, ON', acceptance_rate: 0.43, tuition: 50000 },
    { name: 'UBC', location: 'Vancouver, BC', acceptance_rate: 0.52, tuition: 45000 },
    { name: 'McGill University', location: 'Montreal, QC', acceptance_rate: 0.46, tuition: 42000 },
    { name: 'University of Waterloo', location: 'Waterloo, ON', acceptance_rate: 0.53, tuition: 45000 },
    { name: 'McMaster University', location: 'Hamilton, ON', acceptance_rate: 0.58, tuition: 40000 }
  ];
  
  topCanada.forEach(college => {
    colleges.push(createCollege(college.name, 'Canada', college.location, 'Public',
      college.acceptance_rate, college.tuition, 'Direct'));
  });
  
  const canadaCities = ['Calgary', 'Edmonton', 'Ottawa', 'Victoria', 'Winnipeg', 'Halifax', 'Regina', 'Saskatoon', 'Quebec City', 'London'];
  for (let i = 0; i < 145; i++) {
    const city = canadaCities[i % canadaCities.length];
    colleges.push(createCollege(`University of ${city}`, 'Canada', city, 'Public',
      0.55 + Math.random() * 0.35, 30000 + Math.random() * 20000, 'Direct'));
  }
  
  // === NETHERLANDS (50) ===
  console.log('Generating Netherlands universities...');
  
  const netherlandsColleges = [
    { name: 'TU Delft', location: 'Delft', acceptance_rate: 0.30, tuition: 12000 },
    { name: 'University of Amsterdam', location: 'Amsterdam', acceptance_rate: 0.40, tuition: 11000 },
    { name: 'Utrecht University', location: 'Utrecht', acceptance_rate: 0.45, tuition: 11500 },
    { name: 'Leiden University', location: 'Leiden', acceptance_rate: 0.50, tuition: 11000 },
    { name: 'Erasmus University Rotterdam', location: 'Rotterdam', acceptance_rate: 0.52, tuition: 12000 }
  ];
  
  netherlandsColleges.forEach(college => {
    colleges.push(createCollege(college.name, 'Netherlands', college.location, 'Public',
      college.acceptance_rate, college.tuition, 'Studielink'));
  });
  
  const netherlandsCities = ['Eindhoven', 'Groningen', 'Maastricht', 'Nijmegen', 'Tilburg', 'The Hague', 'Enschede'];
  for (let i = 0; i < 45; i++) {
    const city = netherlandsCities[i % netherlandsCities.length];
    colleges.push(createCollege(`University of ${city}`, 'Netherlands', city, 'Public',
      0.40 + Math.random() * 0.40, 10000 + Math.random() * 4000, 'Studielink'));
  }
  
  // === AUSTRALIA (100) ===
  console.log('Generating Australian universities...');
  
  const ausCities = ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra', 'Newcastle', 'Wollongong'];
  for (let i = 0; i < 100; i++) {
    const city = ausCities[i % ausCities.length];
    colleges.push(createCollege(`University of ${city}`, 'Australia', city, 'Public',
      0.70 + Math.random() * 0.25, 35000 + Math.random() * 15000, 'Direct'));
  }
  
  // === GERMANY (50) ===
  console.log('Generating German universities...');
  
  const germanCities = ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne', 'Stuttgart', 'Dresden', 'Heidelberg', 'Bonn', 'Freiburg'];
  for (let i = 0; i < 50; i++) {
    const city = germanCities[i % germanCities.length];
    colleges.push(createCollege(`University of ${city}`, 'Germany', city, 'Public',
      0.30 + Math.random() * 0.50, 500 + Math.random() * 2000, 'Direct'));
  }
  
  // === INDIA (100) ===
  console.log('Generating Indian universities...');
  
  const indianInstitutes = [
    { name: 'IIT Bombay', location: 'Mumbai', acceptance_rate: 0.01, tuition: 3000 },
    { name: 'IIT Delhi', location: 'New Delhi', acceptance_rate: 0.01, tuition: 3000 },
    { name: 'IIT Madras', location: 'Chennai', acceptance_rate: 0.01, tuition: 3000 },
    { name: 'IIT Kanpur', location: 'Kanpur', acceptance_rate: 0.01, tuition: 3000 },
    { name: 'IIT Kharagpur', location: 'Kharagpur', acceptance_rate: 0.01, tuition: 3000 },
    { name: 'BITS Pilani', location: 'Pilani', acceptance_rate: 0.05, tuition: 5000 },
    { name: 'Delhi University', location: 'New Delhi', acceptance_rate: 0.30, tuition: 1000 },
    { name: 'Jawaharlal Nehru University', location: 'New Delhi', acceptance_rate: 0.10, tuition: 500 },
    { name: 'University of Mumbai', location: 'Mumbai', acceptance_rate: 0.40, tuition: 1500 },
    { name: 'University of Calcutta', location: 'Kolkata', acceptance_rate: 0.45, tuition: 1200 }
  ];
  
  indianInstitutes.forEach(college => {
    colleges.push(createCollege(college.name, 'India', college.location, 'Public',
      college.acceptance_rate, college.tuition, 'Direct'));
  });
  
  const indianCities = ['Bangalore', 'Hyderabad', 'Pune', 'Ahmedabad', 'Chennai', 'Kolkata', 'Jaipur', 'Lucknow', 'Chandigarh'];
  for (let i = 0; i < 90; i++) {
    const city = indianCities[i % indianCities.length];
    colleges.push(createCollege(`University of ${city}`, 'India', city, 'Public',
      0.30 + Math.random() * 0.50, 500 + Math.random() * 2000, 'Direct'));
  }
  
  console.log(`\n✅ Generated ${colleges.length} colleges total`);
  return colleges;
}

// Main seeding function
async function seed() {
  console.log('🌱 Starting comprehensive college seeding...\n');
  
  try {
    // Check if we need to clear existing data
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM colleges');
    const { count } = countStmt.get();
    
    if (count > 0) {
      console.log(`⚠️  Found ${count} existing colleges`);
      if (!process.argv.includes('--force')) {
        console.log('❌ Run with --force to clear and reseed\n');
        db.close();
        process.exit(0);
      }
      console.log('🗑️  Clearing existing data...\n');
      db.prepare('DELETE FROM colleges').run();
    }
    
    const colleges = generateColleges();
    
    // Prepare insert statement
    const insertStmt = db.prepare(`
      INSERT INTO colleges (
        name, country, location, type, official_website, admissions_url,
        programs_url, application_portal_url, programs, major_categories,
        academic_strengths, application_portal, acceptance_rate, requirements,
        deadline_templates, tuition_cost, financial_aid_available, research_data,
        description, logo_url, cbse_requirements, igcse_requirements,
        ib_requirements, studielink_required, numerus_fixus_programs,
        ucas_code, common_app_id, trust_tier, is_verified
      ) VALUES (
        @name, @country, @location, @type, @official_website, @admissions_url,
        @programs_url, @application_portal_url, @programs, @major_categories,
        @academic_strengths, @application_portal, @acceptance_rate, @requirements,
        @deadline_templates, @tuition_cost, @financial_aid_available, @research_data,
        @description, @logo_url, @cbse_requirements, @igcse_requirements,
        @ib_requirements, @studielink_required, @numerus_fixus_programs,
        @ucas_code, @common_app_id, @trust_tier, @is_verified
      )
    `);
    
    // Insert in batches for better performance
    const insertMany = db.transaction((colleges) => {
      for (const college of colleges) {
        insertStmt.run(college);
      }
    });
    
    console.log('📝 Inserting colleges into database...');
    insertMany(colleges);
    
    // Verify
    const finalCount = countStmt.get();
    
    console.log('\n' + '='.repeat(70));
    console.log('✨ SUCCESS! Database seeded with colleges');
    console.log('='.repeat(70));
    console.log(`Total colleges: ${finalCount.count}`);
    console.log(`   US: ${colleges.filter(c => c.country === 'US').length}`);
    console.log(`   UK: ${colleges.filter(c => c.country === 'UK').length}`);
    console.log(`   Canada: ${colleges.filter(c => c.country === 'Canada').length}`);
    console.log(`   Netherlands: ${colleges.filter(c => c.country === 'Netherlands').length}`);
    console.log(`   Australia: ${colleges.filter(c => c.country === 'Australia').length}`);
    console.log(`   Germany: ${colleges.filter(c => c.country === 'Germany').length}`);
    console.log(`   India: ${colleges.filter(c => c.country === 'India').length}`);
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\n❌ SEEDING FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    db.close();
    console.log('✅ Database connection closed\n');
  }
}

// Run seeding
seed();
