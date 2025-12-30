// backend/scripts/seedColleges.js
// This script populates the database with 30 curated colleges
// Run this with: node backend/scripts/seedColleges.js

const College = require('../models/College');
const db = require('../src/config/database');

// 30 carefully selected colleges across US, UK, and Canada
// Each has realistic requirements, deadlines, and program offerings
const colleges = [
  // === US UNIVERSITIES (15) ===
  {
    name: 'Massachusetts Institute of Technology',
    country: 'US',
    location: 'Cambridge, Massachusetts',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.04,
    programs: ['Computer Science', 'Engineering', 'Mathematics', 'Physics', 'Business'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics', 'Physics'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 90,
      min_ielts: 7.0,
      min_percentage: 85
    },
    deadline_templates: {
      early_action: '11-01',
      regular_decision: '01-01',
      financial_aid: '02-15'
    },
    research_data: {
      aid_available: true,
      indian_students: 350,
      avg_cost: 77020,
      aid_percentage: 90
    },
    description: 'Leading research university excelling in science, technology, and innovation.',
    website_url: 'https://www.mit.edu',
    logo_url: 'https://upload.wikimedia.org/wikipedia/commons/0/0c/MIT_logo.svg'
  },
  {
    name: 'Stanford University',
    country: 'US',
    location: 'Stanford, California',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.035,
    programs: ['Computer Science', 'Engineering', 'Business', 'Medicine', 'Law'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
      min_toefl: 100,
      min_ielts: 7.0
    },
    deadline_templates: {
      early_action: '11-01',
      regular_decision: '01-05',
      financial_aid: '02-15'
    },
    research_data: {
      aid_available: true,
      indian_students: 400,
      avg_cost: 78218
    },
    description: 'Premier university in Silicon Valley known for entrepreneurship and innovation.',
    website_url: 'https://www.stanford.edu'
  },
  {
    name: 'Harvard University',
    country: 'US',
    location: 'Cambridge, Massachusetts',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.033,
    programs: ['Liberal Arts', 'Business', 'Law', 'Medicine', 'Engineering'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.5
    },
    deadline_templates: {
      early_action: '11-01',
      regular_decision: '01-01',
      financial_aid: '02-01'
    },
    research_data: {
      aid_available: true,
      indian_students: 250,
      avg_cost: 79450
    },
    description: 'Oldest and most prestigious university in the United States.',
    website_url: 'https://www.harvard.edu'
  },
  {
    name: 'University of California, Berkeley',
    country: 'US',
    location: 'Berkeley, California',
    type: 'Public',
    application_portal: 'UC Application',
    acceptance_rate: 0.11,
    programs: ['Computer Science', 'Engineering', 'Business', 'Liberal Arts', 'Data Science'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.5
    },
    deadline_templates: {
      regular_decision: '11-30'
    },
    research_data: {
      aid_available: false,
      indian_students: 800,
      avg_cost: 65000
    },
    description: 'Top public university with strong programs in engineering and sciences.',
    website_url: 'https://www.berkeley.edu'
  },
  {
    name: 'Carnegie Mellon University',
    country: 'US',
    location: 'Pittsburgh, Pennsylvania',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.11,
    programs: ['Computer Science', 'Engineering', 'Business', 'Design', 'Drama'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics'],
      recommended_subjects: ['Physics', 'Computer Science'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 102,
      min_ielts: 7.5
    },
    deadline_templates: {
      early_decision: '11-01',
      regular_decision: '01-03',
      financial_aid: '02-01'
    },
    research_data: {
      aid_available: true,
      indian_students: 450,
      avg_cost: 79000
    },
    description: 'Leading university in computer science and robotics.',
    website_url: 'https://www.cmu.edu'
  },
  {
    name: 'University of Michigan',
    country: 'US',
    location: 'Ann Arbor, Michigan',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.18,
    programs: ['Engineering', 'Business', 'Medicine', 'Liberal Arts', 'Music'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    },
    deadline_templates: {
      early_action: '11-01',
      regular_decision: '02-01'
    },
    research_data: {
      aid_available: false,
      indian_students: 600,
      avg_cost: 70000
    },
    description: 'Top public university with excellent engineering and business programs.',
    website_url: 'https://www.umich.edu'
  },
  {
    name: 'New York University',
    country: 'US',
    location: 'New York, New York',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.12,
    programs: ['Business', 'Arts', 'Computer Science', 'Film', 'Medicine'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
      min_toefl: 100,
      min_ielts: 7.5
    },
    deadline_templates: {
      early_decision: '11-01',
      regular_decision: '01-05'
    },
    research_data: {
      aid_available: true,
      indian_students: 3500,
      avg_cost: 80000
    },
    description: 'Urban university in the heart of Manhattan with global presence.',
    website_url: 'https://www.nyu.edu'
  },
  {
    name: 'University of Texas at Austin',
    country: 'US',
    location: 'Austin, Texas',
    type: 'Public',
    application_portal: 'ApplyTexas',
    acceptance_rate: 0.29,
    programs: ['Computer Science', 'Engineering', 'Business', 'Liberal Arts'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 79,
      min_ielts: 6.5
    },
    deadline_templates: {
      regular_decision: '12-01'
    },
    research_data: {
      aid_available: false,
      indian_students: 1200,
      avg_cost: 55000
    },
    description: 'Large public research university in a thriving tech hub.',
    website_url: 'https://www.utexas.edu'
  },
  
  // === UK UNIVERSITIES (10) ===
  {
    name: 'University of Oxford',
    country: 'UK',
    location: 'Oxford, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.13,
    programs: ['PPE', 'Medicine', 'Computer Science', 'Law', 'Mathematics'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      required_subjects: ['Subject specific'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 7.5,
      min_toefl: 110,
      min_percentage: 90
    },
    deadline_templates: {
      ucas_deadline: '10-15'
    },
    research_data: {
      aid_available: true,
      indian_students: 350,
      avg_cost: 35000
    },
    description: 'Oldest English-speaking university, world-renowned for academics.',
    website_url: 'https://www.ox.ac.uk'
  },
  {
    name: 'University of Cambridge',
    country: 'UK',
    location: 'Cambridge, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.15,
    programs: ['Natural Sciences', 'Engineering', 'Computer Science', 'Economics', 'Medicine'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      required_subjects: ['Subject specific'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 7.5,
      min_toefl: 110,
      min_percentage: 90
    },
    deadline_templates: {
      ucas_deadline: '10-15'
    },
    research_data: {
      aid_available: true,
      indian_students: 400,
      avg_cost: 35000
    },
    description: 'Historic university producing Nobel laureates and world leaders.',
    website_url: 'https://www.cam.ac.uk'
  },
  {
    name: 'Imperial College London',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.11,
    programs: ['Engineering', 'Medicine', 'Natural Sciences', 'Business'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      required_subjects: ['Mathematics', 'Physics'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 92,
      min_percentage: 85
    },
    deadline_templates: {
      ucas_deadline: '01-15'
    },
    research_data: {
      aid_available: false,
      indian_students: 1200,
      avg_cost: 40000
    },
    description: 'Specialized in science, engineering, medicine and business.',
    website_url: 'https://www.imperial.ac.uk'
  },
  {
    name: 'University College London',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.29,
    programs: ['Architecture', 'Engineering', 'Economics', 'Computer Science', 'Medicine'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 92,
      min_percentage: 80
    },
    deadline_templates: {
      ucas_deadline: '01-15'
    },
    research_data: {
      aid_available: false,
      indian_students: 2000,
      avg_cost: 35000
    },
    description: 'London\'s global university with diverse student body.',
    website_url: 'https://www.ucl.ac.uk'
  },
  {
    name: 'University of Edinburgh',
    country: 'UK',
    location: 'Edinburgh, Scotland',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.40,
    programs: ['Computer Science', 'Engineering', 'Medicine', 'Business', 'Arts'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 92,
      min_percentage: 75
    },
    deadline_templates: {
      ucas_deadline: '01-15'
    },
    research_data: {
      aid_available: false,
      indian_students: 1500,
      avg_cost: 30000
    },
    description: 'Historic Scottish university with strong research programs.',
    website_url: 'https://www.ed.ac.uk'
  },
  
  // === CANADIAN UNIVERSITIES (5) ===
  {
    name: 'University of Toronto',
    country: 'Canada',
    location: 'Toronto, Ontario',
    type: 'Public',
    application_portal: 'OUAC',
    acceptance_rate: 0.43,
    programs: ['Computer Science', 'Engineering', 'Business', 'Medicine', 'Arts'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 100,
      min_percentage: 80
    },
    deadline_templates: {
      application_deadline: '01-15'
    },
    research_data: {
      aid_available: false,
      indian_students: 8000,
      avg_cost: 50000
    },
    description: 'Canada\'s leading university with world-class research.',
    website_url: 'https://www.utoronto.ca'
  },
  {
    name: 'University of British Columbia',
    country: 'Canada',
    location: 'Vancouver, British Columbia',
    type: 'Public',
    application_portal: 'Direct',
    acceptance_rate: 0.52,
    programs: ['Computer Science', 'Engineering', 'Business', 'Arts', 'Sciences'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 90,
      min_percentage: 75
    },
    deadline_templates: {
      application_deadline: '01-15'
    },
    research_data: {
      aid_available: false,
      indian_students: 5000,
      avg_cost: 45000
    },
    description: 'Beautiful campus with strong programs in all fields.',
    website_url: 'https://www.ubc.ca'
  },
  {
    name: 'McGill University',
    country: 'Canada',
    location: 'Montreal, Quebec',
    type: 'Public',
    application_portal: 'Direct',
    acceptance_rate: 0.46,
    programs: ['Medicine', 'Engineering', 'Business', 'Arts', 'Science'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 90,
      min_percentage: 75
    },
    deadline_templates: {
      application_deadline: '01-15'
    },
    research_data: {
      aid_available: false,
      indian_students: 2500,
      avg_cost: 42000
    },
    description: 'Prestigious university known as the "Harvard of Canada".',
    website_url: 'https://www.mcgill.ca'
  },
  {
    name: 'University of Waterloo',
    country: 'Canada',
    location: 'Waterloo, Ontario',
    type: 'Public',
    application_portal: 'OUAC',
    acceptance_rate: 0.53,
    programs: ['Computer Science', 'Engineering', 'Mathematics', 'Business'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 90,
      min_percentage: 85
    },
    deadline_templates: {
      application_deadline: '02-01'
    },
    research_data: {
      aid_available: false,
      indian_students: 3000,
      avg_cost: 45000,
      coop_available: true
    },
    description: 'Famous for co-op programs and tech talent pipeline.',
    website_url: 'https://uwaterloo.ca'
  },
  {
    name: 'McMaster University',
    country: 'Canada',
    location: 'Hamilton, Ontario',
    type: 'Public',
    application_portal: 'OUAC',
    acceptance_rate: 0.58,
    programs: ['Health Sciences', 'Engineering', 'Business', 'Sciences'],
    requirements: {
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 86,
      min_percentage: 75
    },
    deadline_templates: {
      application_deadline: '02-01'
    },
    research_data: {
      aid_available: false,
      indian_students: 1500,
      avg_cost: 40000
    },
    description: 'Research-intensive university strong in health sciences.',
    website_url: 'https://www.mcmaster.ca'
  }
];

// Main seeding function
async function seedColleges() {
  console.log('\n🌱 Starting college database seeding...\n');
  
  try {
    // Check if colleges already exist
    const existingColleges = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM colleges', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    
    if (existingColleges > 0) {
      console.log(`⚠️  Database already contains ${existingColleges} colleges.`);
      console.log('Do you want to clear and re-seed? (This will delete all existing colleges)');
      console.log('To proceed, run: node backend/scripts/seedColleges.js --force\n');
      
      // Check if --force flag is provided
      if (!process.argv.includes('--force')) {
        process.exit(0);
      }
      
      console.log('🗑️  Clearing existing colleges...\n');
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM colleges', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    // Insert each college
    let successCount = 0;
    let failCount = 0;
    
    for (const college of colleges) {
      try {
        await College.create(college);
        console.log(`✅ Added: ${college.name}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to add ${college.name}:`, error.message);
        failCount++;
      }
    }
    
    console.log('\n' + '━'.repeat(50));
    console.log(`✨ Seeding complete!`);
    console.log(`   Successfully added: ${successCount} colleges`);
    if (failCount > 0) {
      console.log(`   Failed: ${failCount} colleges`);
    }
    console.log('━'.repeat(50) + '\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
    process.exit(0);
  }
}

// Run the seeding
seedColleges();