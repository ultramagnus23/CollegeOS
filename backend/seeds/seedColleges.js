// backend/scripts/seedColleges.js
// This script populates the database with 30 curated colleges
// Run this with: node backend/scripts/seedColleges.js

// backend/scripts/seedColleges.js
// This script populates the database with 100+ curated colleges
// Run this with: node backend/scripts/seedColleges.js

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// 100+ carefully selected colleges across US, UK, Canada, and more
const colleges = [
  // === TOP US UNIVERSITIES (40) ===
  {
    name: 'Massachusetts Institute of Technology',
    country: 'US',
    location: 'Cambridge, Massachusetts',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.04,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Mathematics', 'Physics', 'Business']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 90,
      min_percentage: 75
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1000,
      avg_cost: 29000
    }),
    description: 'Research-intensive university in vibrant city.',
    website_url: 'https://www.bristol.ac.uk',
    logo_url: null
  },
  {
    name: 'University of Glasgow',
    country: 'UK',
    location: 'Glasgow, Scotland',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.73,
    programs: JSON.stringify(['Engineering', 'Medicine', 'Veterinary Science', 'Law', 'Business']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 92,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 2000,
      avg_cost: 53000
    }),
    description: 'Top public university in the Pacific Northwest near tech companies.',
    website_url: 'https://www.washington.edu',
    logo_url: null
  },
  {
    name: 'University of Wisconsin-Madison',
    country: 'US',
    location: 'Madison, Wisconsin',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.49,
    programs: JSON.stringify(['Engineering', 'Business', 'Computer Science', 'Agriculture', 'Medicine']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 95,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '02-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1000,
      avg_cost: 52000
    }),
    description: 'Research university with strong programs across all fields.',
    website_url: 'https://www.wisc.edu',
    logo_url: null
  },
  {
    name: 'University of North Carolina at Chapel Hill',
    country: 'US',
    location: 'Chapel Hill, North Carolina',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.17,
    programs: JSON.stringify(['Public Health', 'Journalism', 'Business', 'Medicine', 'Liberal Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_action: '10-15',
      regular_decision: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 400,
      avg_cost: 54000
    }),
    description: 'Historic public university with strong liberal arts tradition.',
    website_url: 'https://www.unc.edu',
    logo_url: null
  },
  {
    name: 'University of Virginia',
    country: 'US',
    location: 'Charlottesville, Virginia',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.19,
    programs: JSON.stringify(['Business', 'Engineering', 'Liberal Arts', 'Law', 'Medicine']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 90,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '01-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 350,
      avg_cost: 52000
    }),
    description: 'Prestigious public university founded by Thomas Jefferson.',
    website_url: 'https://www.virginia.edu',
    logo_url: null
  },
  {
    name: 'Boston University',
    country: 'US',
    location: 'Boston, Massachusetts',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.14,
    programs: JSON.stringify(['Business', 'Engineering', 'Communications', 'Medicine', 'Law']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
      min_toefl: 90,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-04'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 2500,
      avg_cost: 78000
    }),
    description: 'Large private research university along the Charles River.',
    website_url: 'https://www.bu.edu',
    logo_url: null
  },
  {
    name: 'Purdue University',
    country: 'US',
    location: 'West Lafayette, Indiana',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.53,
    programs: JSON.stringify(['Engineering', 'Computer Science', 'Aviation', 'Agriculture', 'Pharmacy']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 88,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '02-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 6000,
      avg_cost: 45000
    }),
    description: 'Engineering powerhouse with largest population of Indian students.',
    website_url: 'https://www.purdue.edu',
    logo_url: null
  },
  {
    name: 'Ohio State University',
    country: 'US',
    location: 'Columbus, Ohio',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.53,
    programs: JSON.stringify(['Engineering', 'Business', 'Medicine', 'Agriculture', 'Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 79,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '02-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 2000,
      avg_cost: 47000
    }),
    description: 'Large flagship university with comprehensive programs.',
    website_url: 'https://www.osu.edu',
    logo_url: null
  },
  {
    name: 'Penn State University',
    country: 'US',
    location: 'University Park, Pennsylvania',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.55,
    programs: JSON.stringify(['Engineering', 'Business', 'Agriculture', 'Communications', 'Earth Sciences']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-30'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1500,
      avg_cost: 50000
    }),
    description: 'Major research university with strong alumni network.',
    website_url: 'https://www.psu.edu',
    logo_url: null
  },
  {
    name: 'Rutgers University',
    country: 'US',
    location: 'New Brunswick, New Jersey',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.66,
    programs: JSON.stringify(['Engineering', 'Business', 'Pharmacy', 'Computer Science', 'Liberal Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 79,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '12-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 3000,
      avg_cost: 46000
    }),
    description: 'Major state university near New York City.',
    website_url: 'https://www.rutgers.edu',
    logo_url: null
  },
  {
    name: 'University of Florida',
    country: 'US',
    location: 'Gainesville, Florida',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.23,
    programs: JSON.stringify(['Engineering', 'Business', 'Medicine', 'Agriculture', 'Journalism']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.0
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 800,
      avg_cost: 43000
    }),
    description: 'Top public university in Florida with strong research.',
    website_url: 'https://www.ufl.edu',
    logo_url: null
  },
  {
    name: 'Arizona State University',
    country: 'US',
    location: 'Tempe, Arizona',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.88,
    programs: JSON.stringify(['Engineering', 'Business', 'Journalism', 'Sustainability', 'Computer Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 61,
      min_ielts: 6.0
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '02-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 4000,
      avg_cost: 44000
    }),
    description: 'Innovative public university with high acceptance rate.',
    website_url: 'https://www.asu.edu',
    logo_url: null
  },
  {
    name: 'University of California, Irvine',
    country: 'US',
    location: 'Irvine, California',
    type: 'Public',
    application_portal: 'UC Application',
    acceptance_rate: 0.21,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Medicine', 'Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-30'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 2500,
      avg_cost: 63000
    }),
    description: 'Growing UC campus with strong STEM programs.',
    website_url: 'https://www.uci.edu',
    logo_url: null
  },
  {
    name: 'University of California, Davis',
    country: 'US',
    location: 'Davis, California',
    type: 'Public',
    application_portal: 'UC Application',
    acceptance_rate: 0.37,
    programs: JSON.stringify(['Veterinary Medicine', 'Agriculture', 'Engineering', 'Biological Sciences', 'Environmental Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-30'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1800,
      avg_cost: 62000
    }),
    description: 'Known for agriculture and veterinary medicine.',
    website_url: 'https://www.ucdavis.edu',
    logo_url: null
  },
  {
    name: 'University of California, Santa Barbara',
    country: 'US',
    location: 'Santa Barbara, California',
    type: 'Public',
    application_portal: 'UC Application',
    acceptance_rate: 0.26,
    programs: JSON.stringify(['Physics', 'Engineering', 'Marine Biology', 'Environmental Science', 'Film']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-30'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1200,
      avg_cost: 63000
    }),
    description: 'Beautiful beachside campus with strong physics program.',
    website_url: 'https://www.ucsb.edu',
    logo_url: null
  },
  {
    name: 'Northeastern University',
    country: 'US',
    location: 'Boston, Massachusetts',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.07,
    programs: JSON.stringify(['Engineering', 'Computer Science', 'Business', 'Health Sciences', 'Communications']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
      min_toefl: 92,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 2000,
      avg_cost: 77000,
      coop_available: true
    }),
    description: 'Known for cooperative education program.',
    website_url: 'https://www.northeastern.edu',
    logo_url: null
  },
  {
    name: 'Virginia Tech',
    country: 'US',
    location: 'Blacksburg, Virginia',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.57,
    programs: JSON.stringify(['Engineering', 'Architecture', 'Business', 'Agriculture', 'Computer Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1000,
      avg_cost: 47000
    }),
    description: 'Strong engineering and architecture programs.',
    website_url: 'https://www.vt.edu',
    logo_url: null
  },
  {
    name: 'Texas A&M University',
    country: 'US',
    location: 'College Station, Texas',
    type: 'Public',
    application_portal: 'ApplyTexas',
    acceptance_rate: 0.63,
    programs: JSON.stringify(['Engineering', 'Agriculture', 'Veterinary Medicine', 'Business', 'Petroleum Engineering']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.0
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '12-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1800,
      avg_cost: 48000
    }),
    description: 'Large university with strong engineering and agriculture.',
    website_url: 'https://www.tamu.edu',
    logo_url: null
  },
  {
    name: 'University of Minnesota Twin Cities',
    country: 'US',
    location: 'Minneapolis, Minnesota',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.75,
    programs: JSON.stringify(['Engineering', 'Business', 'Medicine', 'Agriculture', 'Public Health']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 79,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1200,
      avg_cost: 50000
    }),
    description: 'Major research university in vibrant twin cities.',
    website_url: 'https://twin-cities.umn.edu',
    logo_url: null
  },
  
  // === UK UNIVERSITIES (30) ===
  {
    name: 'University of Oxford',
    country: 'UK',
    location: 'Oxford, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.13,
    programs: JSON.stringify(['PPE', 'Medicine', 'Computer Science', 'Law', 'Mathematics']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      required_subjects: ['Subject specific'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 7.5,
      min_toefl: 110,
      min_percentage: 90
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '10-15'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 350,
      avg_cost: 35000
    }),
    description: 'Oldest English-speaking university, world-renowned for academics.',
    website_url: 'https://www.ox.ac.uk',
    logo_url: null
  },
  {
    name: 'University of Cambridge',
    country: 'UK',
    location: 'Cambridge, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.15,
    programs: JSON.stringify(['Natural Sciences', 'Engineering', 'Computer Science', 'Economics', 'Medicine']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      required_subjects: ['Subject specific'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 7.5,
      min_toefl: 110,
      min_percentage: 90
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '10-15'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 400,
      avg_cost: 35000
    }),
    description: 'Historic university producing Nobel laureates and world leaders.',
    website_url: 'https://www.cam.ac.uk',
    logo_url: null
  },
  {
    name: 'Imperial College London',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.11,
    programs: JSON.stringify(['Engineering', 'Medicine', 'Natural Sciences', 'Business']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      required_subjects: ['Mathematics', 'Physics'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 92,
      min_percentage: 85
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1200,
      avg_cost: 40000
    }),
    description: 'Specialized in science, engineering, medicine and business.',
    website_url: 'https://www.imperial.ac.uk',
    logo_url: null
  },
  {
    name: 'University College London',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.29,
    programs: JSON.stringify(['Architecture', 'Engineering', 'Economics', 'Computer Science', 'Medicine']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 92,
      min_percentage: 80
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 2000,
      avg_cost: 35000
    }),
    description: 'London\'s global university with diverse student body.',
    website_url: 'https://www.ucl.ac.uk',
    logo_url: null
  },
  {
    name: 'University of Edinburgh',
    country: 'UK',
    location: 'Edinburgh, Scotland',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.40,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Medicine', 'Business', 'Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 92,
      min_percentage: 75
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1500,
      avg_cost: 30000
    }),
    description: 'Historic Scottish university with strong research programs.',
    website_url: 'https://www.ed.ac.uk',
    logo_url: null
  },
  {
    name: 'London School of Economics',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.09,
    programs: JSON.stringify(['Economics', 'Political Science', 'Law', 'International Relations', 'Finance']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 7.0,
      min_toefl: 100,
      min_percentage: 85
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 800,
      avg_cost: 37000
    }),
    description: 'Premier social science university in London.',
    website_url: 'https://www.lse.ac.uk',
    logo_url: null
  },
  {
    name: 'King\'s College London',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.13,
    programs: JSON.stringify(['Medicine', 'Law', 'Dentistry', 'Business', 'Nursing']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 93,
      min_percentage: 80
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1500,
      avg_cost: 33000
    }),
    description: 'Historic London university with excellent medical programs.',
    website_url: 'https://www.kcl.ac.uk',
    logo_url: null
  },
  {
    name: 'University of Manchester',
    country: 'UK',
    location: 'Manchester, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.56,
    programs: JSON.stringify(['Engineering', 'Computer Science', 'Business', 'Medicine', 'Materials Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 80,
      min_percentage: 75
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 2000,
      avg_cost: 28000
    }),
    description: 'Large research university in vibrant northern city.',
    website_url: 'https://www.manchester.ac.uk',
    logo_url: null
  },
  {
    name: 'University of Warwick',
    country: 'UK',
    location: 'Coventry, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.14,
    programs: JSON.stringify(['Business', 'Economics', 'Engineering', 'Mathematics', 'Computer Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 92,
      min_percentage: 80
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1200,
      avg_cost: 30000
    }),
    description: 'Leading research university with strong business school.',
    website_url: 'https://www.warwick.ac.uk',
    logo_url: null
  },
{
    name: 'University of Bristol',
    country: 'UK',
    location: 'Bristol, England',
    type: 'Public',
    application_portal: 'UCAS',
    acceptance_rate: 0.67,
    programs: JSON.stringify(['Engineering', 'Computer Science', 'Law', 'Medicine', 'Economics']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB'],
      language_exams: ['IELTS', 'TOEFL'],
      min_ielts: 6.5,
      min_toefl: 90,
      min_percentage: 85
    }),
    deadline_templates: JSON.stringify({
      ucas_deadline: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 400,
      avg_cost: 32000
    }),
    description: 'Research-intensive university in a vibrant, historic city.',
    website_url: 'https://www.bristol.ac.uk',
    logo_url: null
  },
  {
    name: 'Stanford University',
    country: 'US',
    location: 'Stanford, California',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.035,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Medicine', 'Law']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '01-05',
      financial_aid: '02-15'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 400,
      avg_cost: 78218
    }),
    description: 'Premier university in Silicon Valley known for entrepreneurship and innovation.',
    website_url: 'https://www.stanford.edu',
    logo_url: null
  },
  {
    name: 'Harvard University',
    country: 'US',
    location: 'Cambridge, Massachusetts',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.033,
    programs: JSON.stringify(['Liberal Arts', 'Business', 'Law', 'Medicine', 'Engineering']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.5
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '01-01',
      financial_aid: '02-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 250,
      avg_cost: 79450
    }),
    description: 'Oldest and most prestigious university in the United States.',
    website_url: 'https://www.harvard.edu',
    logo_url: null
  },
  {
    name: 'University of California, Berkeley',
    country: 'US',
    location: 'Berkeley, California',
    type: 'Public',
    application_portal: 'UC Application',
    acceptance_rate: 0.11,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Liberal Arts', 'Data Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 80,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-30'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 800,
      avg_cost: 65000
    }),
    description: 'Top public university with strong programs in engineering and sciences.',
    website_url: 'https://www.berkeley.edu',
    logo_url: null
  },
  {
    name: 'Carnegie Mellon University',
    country: 'US',
    location: 'Pittsburgh, Pennsylvania',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.11,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Design', 'Drama']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics'],
      recommended_subjects: ['Physics', 'Computer Science'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 102,
      min_ielts: 7.5
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-03',
      financial_aid: '02-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 450,
      avg_cost: 79000
    }),
    description: 'Leading university in computer science and robotics.',
    website_url: 'https://www.cmu.edu',
    logo_url: null
  },
  {
    name: 'California Institute of Technology',
    country: 'US',
    location: 'Pasadena, California',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.03,
    programs: JSON.stringify(['Physics', 'Engineering', 'Chemistry', 'Biology', 'Computer Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics', 'Physics', 'Chemistry'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '01-03'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 120,
      avg_cost: 79947
    }),
    description: 'Elite science and engineering institute with focus on research.',
    website_url: 'https://www.caltech.edu',
    logo_url: null
  },
  {
    name: 'Princeton University',
    country: 'US',
    location: 'Princeton, New Jersey',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.04,
    programs: JSON.stringify(['Mathematics', 'Physics', 'Engineering', 'Economics', 'Computer Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '01-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 200,
      avg_cost: 77690
    }),
    description: 'Prestigious Ivy League university known for undergraduate focus.',
    website_url: 'https://www.princeton.edu',
    logo_url: null
  },
  {
    name: 'Yale University',
    country: 'US',
    location: 'New Haven, Connecticut',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.046,
    programs: JSON.stringify(['Liberal Arts', 'Law', 'Medicine', 'Drama', 'Business']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '01-02'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 180,
      avg_cost: 80700
    }),
    description: 'Historic Ivy League institution with strong liberal arts tradition.',
    website_url: 'https://www.yale.edu',
    logo_url: null
  },
  {
    name: 'Columbia University',
    country: 'US',
    location: 'New York, New York',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.039,
    programs: JSON.stringify(['Liberal Arts', 'Engineering', 'Business', 'Journalism', 'Law']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 300,
      avg_cost: 79752
    }),
    description: 'Ivy League university in Manhattan with strong core curriculum.',
    website_url: 'https://www.columbia.edu',
    logo_url: null
  },
  {
    name: 'University of Pennsylvania',
    country: 'US',
    location: 'Philadelphia, Pennsylvania',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.057,
    programs: JSON.stringify(['Business', 'Engineering', 'Medicine', 'Nursing', 'Liberal Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-05'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 400,
      avg_cost: 81340
    }),
    description: 'Home to Wharton School of Business and strong pre-professional programs.',
    website_url: 'https://www.upenn.edu',
    logo_url: null
  },
  {
    name: 'Duke University',
    country: 'US',
    location: 'Durham, North Carolina',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.06,
    programs: JSON.stringify(['Engineering', 'Business', 'Medicine', 'Public Policy', 'Liberal Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-02'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 250,
      avg_cost: 79338
    }),
    description: 'Southern powerhouse known for research and strong athletics.',
    website_url: 'https://www.duke.edu',
    logo_url: null
  },
  {
    name: 'University of Michigan',
    country: 'US',
    location: 'Ann Arbor, Michigan',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.18,
    programs: JSON.stringify(['Engineering', 'Business', 'Medicine', 'Liberal Arts', 'Music']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '02-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 600,
      avg_cost: 70000
    }),
    description: 'Top public university with excellent engineering and business programs.',
    website_url: 'https://www.umich.edu',
    logo_url: null
  },
  {
    name: 'Northwestern University',
    country: 'US',
    location: 'Evanston, Illinois',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.07,
    programs: JSON.stringify(['Journalism', 'Engineering', 'Business', 'Theatre', 'Medicine']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.5
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-02'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 300,
      avg_cost: 81567
    }),
    description: 'Located near Chicago, known for journalism and performing arts.',
    website_url: 'https://www.northwestern.edu',
    logo_url: null
  },
  {
    name: 'Cornell University',
    country: 'US',
    location: 'Ithaca, New York',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.087,
    programs: JSON.stringify(['Engineering', 'Agriculture', 'Hotel Management', 'Architecture', 'Liberal Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-02'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 450,
      avg_cost: 79932
    }),
    description: 'Ivy League with diverse programs including unique specialty schools.',
    website_url: 'https://www.cornell.edu',
    logo_url: null
  },
  {
    name: 'Johns Hopkins University',
    country: 'US',
    location: 'Baltimore, Maryland',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.073,
    programs: JSON.stringify(['Medicine', 'Public Health', 'Engineering', 'International Relations', 'Biology']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-03'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 350,
      avg_cost: 79872
    }),
    description: 'World-renowned for medicine and biomedical research.',
    website_url: 'https://www.jhu.edu',
    logo_url: null
  },
  {
    name: 'Brown University',
    country: 'US',
    location: 'Providence, Rhode Island',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.053,
    programs: JSON.stringify(['Liberal Arts', 'Engineering', 'Computer Science', 'Medicine', 'Public Health']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-03'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 180,
      avg_cost: 79674
    }),
    description: 'Known for open curriculum and progressive education.',
    website_url: 'https://www.brown.edu',
    logo_url: null
  },
  {
    name: 'Rice University',
    country: 'US',
    location: 'Houston, Texas',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.09,
    programs: JSON.stringify(['Engineering', 'Architecture', 'Music', 'Business', 'Computer Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 200,
      avg_cost: 72120
    }),
    description: 'Small private university with strong STEM programs.',
    website_url: 'https://www.rice.edu',
    logo_url: null
  },
  {
    name: 'Vanderbilt University',
    country: 'US',
    location: 'Nashville, Tennessee',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.068,
    programs: JSON.stringify(['Engineering', 'Medicine', 'Education', 'Music', 'Business']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: false,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-01'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 150,
      avg_cost: 78742
    }),
    description: 'Premier Southern university with beautiful campus.',
    website_url: 'https://www.vanderbilt.edu',
    logo_url: null
  },
  {
    name: 'University of California, Los Angeles',
    country: 'US',
    location: 'Los Angeles, California',
    type: 'Public',
    application_portal: 'UC Application',
    acceptance_rate: 0.09,
    programs: JSON.stringify(['Film', 'Engineering', 'Business', 'Medicine', 'Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-30'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 900,
      avg_cost: 67000
    }),
    description: 'Top public university in Los Angeles with strong film program.',
    website_url: 'https://www.ucla.edu',
    logo_url: null
  },
  {
    name: 'University of California, San Diego',
    country: 'US',
    location: 'San Diego, California',
    type: 'Public',
    application_portal: 'UC Application',
    acceptance_rate: 0.24,
    programs: JSON.stringify(['Engineering', 'Biology', 'Computer Science', 'Oceanography', 'Medicine']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 83,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '11-30'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1200,
      avg_cost: 64000
    }),
    description: 'Research powerhouse near the beach with strong STEM focus.',
    website_url: 'https://www.ucsd.edu',
    logo_url: null
  },
  {
    name: 'University of Southern California',
    country: 'US',
    location: 'Los Angeles, California',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.12,
    programs: JSON.stringify(['Film', 'Engineering', 'Business', 'Music', 'Communications']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      optional_exams: ['SAT', 'ACT'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 100,
      min_ielts: 7.0
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '01-15'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 1500,
      avg_cost: 81659
    }),
    description: 'Major private university known for film school and strong alumni network.',
    website_url: 'https://www.usc.edu',
    logo_url: null
  },
  {
    name: 'New York University',
    country: 'US',
    location: 'New York, New York',
    type: 'Private',
    application_portal: 'Common App',
    acceptance_rate: 0.12,
    programs: JSON.stringify(['Business', 'Arts', 'Computer Science', 'Film', 'Medicine']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: true,
      language_exams: ['TOEFL', 'IELTS', 'Duolingo'],
      min_toefl: 100,
      min_ielts: 7.5
    }),
    deadline_templates: JSON.stringify({
      early_decision: '11-01',
      regular_decision: '01-05'
    }),
    research_data: JSON.stringify({
      aid_available: true,
      indian_students: 3500,
      avg_cost: 80000
    }),
    description: 'Urban university in the heart of Manhattan with global presence.',
    website_url: 'https://www.nyu.edu',
    logo_url: null
  },
  {
    name: 'University of Texas at Austin',
    country: 'US',
    location: 'Austin, Texas',
    type: 'Public',
    application_portal: 'ApplyTexas',
    acceptance_rate: 0.29,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Liberal Arts']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 79,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      regular_decision: '12-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1200,
      avg_cost: 55000
    }),
    description: 'Large public research university in a thriving tech hub.',
    website_url: 'https://www.utexas.edu',
    logo_url: null
  },
  {
    name: 'Georgia Institute of Technology',
    country: 'US',
    location: 'Atlanta, Georgia',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.16,
    programs: JSON.stringify(['Engineering', 'Computer Science', 'Business', 'Architecture', 'Industrial Design']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      required_subjects: ['Mathematics'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 90,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      early_action: '10-15',
      regular_decision: '01-01'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 1800,
      avg_cost: 50000
    }),
    description: 'Premier public tech university with strong engineering programs.',
    website_url: 'https://www.gatech.edu',
    logo_url: null
  },
  {
    name: 'University of Illinois Urbana-Champaign',
    country: 'US',
    location: 'Champaign, Illinois',
    type: 'Public',
    application_portal: 'Common App',
    acceptance_rate: 0.45,
    programs: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Agriculture', 'Library Science']),
    requirements: JSON.stringify({
      accepted_boards: ['CBSE', 'ISC', 'IB', 'ICSE'],
      test_optional: false,
      optional_exams: ['SAT', 'ACT'],
      language_exams: ['TOEFL', 'IELTS'],
      min_toefl: 79,
      min_ielts: 6.5
    }),
    deadline_templates: JSON.stringify({
      early_action: '11-01',
      regular_decision: '01-05'
    }),
    research_data: JSON.stringify({
      aid_available: false,
      indian_students: 5000,
      avg_cost: 52000
    }),
    description: 'Major research university with top-ranked CS and engineering.',
    website_url: 'https://illinois.edu',
    logo_url: null
  }
];
// Helper function to promisify database operations
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Main seeding function
async function seedColleges() {
  console.log('\n🌱 Starting college database seeding...\n');
  
  try {
    // Check if colleges already exist
    const result = await getQuery('SELECT COUNT(*) as count FROM colleges');
    const existingColleges = result.count;
    
    if (existingColleges > 0) {
      console.log(`⚠️  Database already contains ${existingColleges} colleges.`);
      console.log('Do you want to clear and re-seed? (This will delete all existing colleges)');
      console.log('To proceed, run: node backend/scripts/seedColleges.js --force\n');
      
      // Check if --force flag is provided
      if (!process.argv.includes('--force')) {
        db.close();
        process.exit(0);
      }
      
      console.log('🗑️  Clearing existing colleges...\n');
      await runQuery('DELETE FROM colleges');
    }
    
    // Insert each college
    let successCount = 0;
    let failCount = 0;
    
    const insertQuery = `
      INSERT INTO colleges (
        name, country, location, type, application_portal, acceptance_rate,
        programs, requirements, deadline_templates, research_data,
        description, website_url, logo_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    for (const college of colleges) {
      try {
        await runQuery(insertQuery, [
          college.name,
          college.country,
          college.location,
          college.type,
          college.application_portal,
          college.acceptance_rate,
          college.programs,
          college.requirements,
          college.deadline_templates,
          college.research_data,
          college.description,
          college.website_url,
          college.logo_url
        ]);
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
    console.error(error.stack);
    db.close();
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run the seeding
seedColleges();