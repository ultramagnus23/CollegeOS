// backend/scripts/seedCollegesNew.js
// Comprehensive seed script with 1000+ colleges
// Matches new unified schema

const path = require('path');
const config = require('../src/config/env');
const Database = require('better-sqlite3');
const fs = require('fs');

console.log('🌱 CollegeOS Comprehensive Seeding Script\n');
console.log('📂 Database path:', config.database.path);

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
    console.error('SOLUTION: Run migrations first to update the schema:');
    console.error('');
    console.error('  node scripts/runMigrations.js');
    console.error('');
    console.error('Then run this seed script again.');
    console.error('');
    db.close();
    process.exit(1);
  }
  
  console.log('✅ Database schema is up to date\n');
} catch (error) {
  if (error.message.includes('no such table')) {
    console.error('❌ ERROR: colleges table does not exist!');
    console.error('');
    console.error('SOLUTION: Run migrations first to create the tables:');
    console.error('');
    console.error('  node scripts/runMigrations.js');
    console.error('');
    console.error('Then run this seed script again.');
    console.error('');
    db.close();
    process.exit(1);
  }
  throw error;
}

// Helper function to create college object
function createCollege(name, country, location, type, acceptance_rate, tuition_cost, application_portal) {
  return {
    name,
    country,
    location,
    type,
    official_website: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.edu`,
    admissions_url: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.edu/admissions`,
    programs_url: `https://www.${name.toLowerCase().replace(/[^a-z0-9]/g, '')}.edu/programs`,
    application_portal_url: application_portal === 'Common App' ? 'https://commonapp.org' : 
                           application_portal === 'UCAS' ? 'https://ucas.com' :
                           application_portal === 'Studielink' ? 'https://studielink.nl' : null,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Medicine', 'Liberal Arts', 'Data Science', 'Psychology', 'Biology', 'Mathematics', 'Physics']),
    major_categories: JSON.stringify(['STEM', 'Business', 'Liberal Arts', 'Health Sciences']),
    academic_strengths: JSON.stringify(['Research', 'Innovation', 'Industry Partnerships']),
    application_portal,
    acceptance_rate,
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE', 'A-Levels', 'IGCSE'],
      language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
      min_toefl: Math.floor(80 + Math.random() * 25),
      min_ielts: Number((6.0 + Math.random() * 1.5).toFixed(1)),
      min_percentage: Math.floor(70 + Math.random() * 25),
      sat_required: country === 'US',
      act_accepted: country === 'US'
    }),
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
      student_faculty_ratio: Math.floor(8 + Math.random() * 15)
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
    trust_tier: 'official',
    is_verified: 1,
    last_scraped_at: null
  };
}

// Generate comprehensive college data
function generateColleges() {
  const colleges = [];
  
  // === US UNIVERSITIES (450) ===
  console.log('Generating US universities...');
  
  // Top US Universities with real data
  const topUS = [
    { name: 'MIT', location: 'Cambridge, MA', acceptance_rate: 0.04, tuition: 77020 },
    { name: 'Stanford University', location: 'Stanford, CA', acceptance_rate: 0.035, tuition: 78218 },
    { name: 'Harvard University', location: 'Cambridge, MA', acceptance_rate: 0.033, tuition: 79450 },
    { name: 'Caltech', location: 'Pasadena, CA', acceptance_rate: 0.03, tuition: 79947 },
    { name: 'Princeton University', location: 'Princeton, NJ', acceptance_rate: 0.04, tuition: 77690 },
    { name: 'Yale University', location: 'New Haven, CT', acceptance_rate: 0.046, tuition: 80700 },
    { name: 'Columbia University', location: 'New York, NY', acceptance_rate: 0.039, tuition: 79752 },
    { name: 'University of Pennsylvania', location: 'Philadelphia, PA', acceptance_rate: 0.057, tuition: 81340 },
    { name: 'Duke University', location: 'Durham, NC', acceptance_rate: 0.06, tuition: 79338 },
    { name: 'Carnegie Mellon University', location: 'Pittsburgh, PA', acceptance_rate: 0.11, tuition: 79000 },
    { name: 'UC Berkeley', location: 'Berkeley, CA', acceptance_rate: 0.11, tuition: 45000 },
    { name: 'UCLA', location: 'Los Angeles, CA', acceptance_rate: 0.09, tuition: 44000 },
    { name: 'UC San Diego', location: 'San Diego, CA', acceptance_rate: 0.24, tuition: 43000 },
    { name: 'Northwestern University', location: 'Evanston, IL', acceptance_rate: 0.07, tuition: 81567 },
    { name: 'Cornell University', location: 'Ithaca, NY', acceptance_rate: 0.087, tuition: 79932 },
    { name: 'Johns Hopkins University', location: 'Baltimore, MD', acceptance_rate: 0.073, tuition: 79872 },
    { name: 'Brown University', location: 'Providence, RI', acceptance_rate: 0.053, tuition: 79674 },
    { name: 'Rice University', location: 'Houston, TX', acceptance_rate: 0.09, tuition: 72120 },
    { name: 'Vanderbilt University', location: 'Nashville, TN', acceptance_rate: 0.068, tuition: 78742 },
    { name: 'University of Southern California', location: 'Los Angeles, CA', acceptance_rate: 0.12, tuition: 81659 },
    { name: 'NYU', location: 'New York, NY', acceptance_rate: 0.12, tuition: 80000 },
    { name: 'UT Austin', location: 'Austin, TX', acceptance_rate: 0.29, tuition: 42000 },
    { name: 'Georgia Tech', location: 'Atlanta, GA', acceptance_rate: 0.16, tuition: 38000 },
    { name: 'UIUC', location: 'Champaign, IL', acceptance_rate: 0.45, tuition: 40000 },
    { name: 'University of Washington', location: 'Seattle, WA', acceptance_rate: 0.48, tuition: 41000 },
    { name: 'UW Madison', location: 'Madison, WI', acceptance_rate: 0.49, tuition: 39000 },
    { name: 'UNC Chapel Hill', location: 'Chapel Hill, NC', acceptance_rate: 0.17, tuition: 37000 },
    { name: 'UVA', location: 'Charlottesville, VA', acceptance_rate: 0.19, tuition: 39000 },
    { name: 'Boston University', location: 'Boston, MA', acceptance_rate: 0.14, tuition: 78000 },
    { name: 'Purdue University', location: 'West Lafayette, IN', acceptance_rate: 0.53, tuition: 32000 },
    { name: 'Ohio State University', location: 'Columbus, OH', acceptance_rate: 0.53, tuition: 35000 },
    { name: 'Penn State University', location: 'University Park, PA', acceptance_rate: 0.55, tuition: 38000 },
    { name: 'Rutgers University', location: 'New Brunswick, NJ', acceptance_rate: 0.66, tuition: 33000 },
    { name: 'University of Florida', location: 'Gainesville, FL', acceptance_rate: 0.23, tuition: 28000 },
    { name: 'Arizona State University', location: 'Tempe, AZ', acceptance_rate: 0.88, tuition: 30000 },
    { name: 'UC Irvine', location: 'Irvine, CA', acceptance_rate: 0.21, tuition: 42000 },
    { name: 'UC Davis', location: 'Davis, CA', acceptance_rate: 0.37, tuition: 43000 },
    { name: 'UC Santa Barbara', location: 'Santa Barbara, CA', acceptance_rate: 0.26, tuition: 42000 },
    { name: 'Northeastern University', location: 'Boston, MA', acceptance_rate: 0.07, tuition: 77000 },
    { name: 'Virginia Tech', location: 'Blacksburg, VA', acceptance_rate: 0.57, tuition: 35000 },
    { name: 'Texas A&M', location: 'College Station, TX', acceptance_rate: 0.63, tuition: 36000 },
    { name: 'University of Minnesota', location: 'Minneapolis, MN', acceptance_rate: 0.75, tuition: 34000 },
    { name: 'Dartmouth College', location: 'Hanover, NH', acceptance_rate: 0.065, tuition: 77152 },
    { name: 'Washington University', location: 'St. Louis, MO', acceptance_rate: 0.13, tuition: 79000 },
    { name: 'Emory University', location: 'Atlanta, GA', acceptance_rate: 0.13, tuition: 75038 },
    { name: 'Notre Dame', location: 'Notre Dame, IN', acceptance_rate: 0.15, tuition: 77505 },
    { name: 'Georgetown University', location: 'Washington, DC', acceptance_rate: 0.12, tuition: 81000 },
    { name: 'Tufts University', location: 'Medford, MA', acceptance_rate: 0.10, tuition: 77608 },
    { name: 'Wake Forest', location: 'Winston-Salem, NC', acceptance_rate: 0.22, tuition: 61000 },
    { name: 'Boston College', location: 'Boston, MA', acceptance_rate: 0.17, tuition: 64000 }
  ];
  
  topUS.forEach(college => {
    colleges.push(createCollege(college.name, 'US', college.location, 
      college.tuition > 50000 ? 'Private' : 'Public', 
      college.acceptance_rate, college.tuition, 'Common App'));
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
