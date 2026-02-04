// backend/scripts/seedColleges.js
// Simple seed script that matches the actual database schema
// This is the RECOMMENDED seed script to use

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'college_app.db');

console.log('📂 Database path:', DB_PATH);

let db;
try {
  db = new Database(DB_PATH);
  // Disable foreign key checks for seeding
  db.pragma('foreign_keys = OFF');
  console.log('✅ Connected to SQLite database');
} catch (err) {
  console.error('❌ Error connecting to database:', err.message);
  console.error('💡 Tip: Run migrations first: node scripts/runMigrations.js');
  process.exit(1);
}

// Sample colleges data matching the actual schema
const colleges = [
  // Top US Universities
  {
    name: 'Harvard University',
    country: 'US',
    location: 'Cambridge, MA',
    type: 'Private',
    official_website: 'https://www.harvard.edu',
    admissions_url: 'https://college.harvard.edu/admissions',
    programs_url: 'https://www.harvard.edu/programs',
    application_portal_url: 'https://apply.college.harvard.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.032,
    tuition_cost: 57261,
    major_categories: JSON.stringify(['Business', 'Computer Science', 'Economics', 'Biology', 'Political Science']),
    academic_strengths: JSON.stringify(['Research', 'Law', 'Medicine', 'Business']),
    common_app_id: 'HARV',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Harvard University is a private Ivy League research university in Cambridge, Massachusetts.'
  },
  {
    name: 'Stanford University',
    country: 'US',
    location: 'Stanford, CA',
    type: 'Private',
    official_website: 'https://www.stanford.edu',
    admissions_url: 'https://admission.stanford.edu',
    programs_url: 'https://www.stanford.edu/academics',
    application_portal_url: 'https://apply.stanford.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.036,
    tuition_cost: 56169,
    major_categories: JSON.stringify(['Computer Science', 'Engineering', 'Biology', 'Economics', 'Human Biology']),
    academic_strengths: JSON.stringify(['Engineering', 'Computer Science', 'Business', 'Medicine']),
    common_app_id: 'STAN',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Stanford University is a private research university in Stanford, California.'
  },
  {
    name: 'Massachusetts Institute of Technology',
    country: 'US',
    location: 'Cambridge, MA',
    type: 'Private',
    official_website: 'https://www.mit.edu',
    admissions_url: 'https://mitadmissions.org',
    programs_url: 'https://www.mit.edu/education',
    application_portal_url: 'https://apply.mitadmissions.org',
    application_portal: 'Direct',
    acceptance_rate: 0.038,
    tuition_cost: 57986,
    major_categories: JSON.stringify(['Computer Science', 'Engineering', 'Physics', 'Mathematics', 'Biology']),
    academic_strengths: JSON.stringify(['Engineering', 'Computer Science', 'Research', 'Innovation']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'MIT is a private research university in Cambridge, Massachusetts.'
  },
  {
    name: 'Yale University',
    country: 'US',
    location: 'New Haven, CT',
    type: 'Private',
    official_website: 'https://www.yale.edu',
    admissions_url: 'https://admissions.yale.edu',
    programs_url: 'https://www.yale.edu/academics',
    application_portal_url: 'https://apply.yale.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.046,
    tuition_cost: 62250,
    major_categories: JSON.stringify(['Economics', 'Political Science', 'History', 'Biology', 'Psychology']),
    academic_strengths: JSON.stringify(['Law', 'Drama', 'Arts', 'Liberal Arts']),
    common_app_id: 'YALE',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Yale University is a private Ivy League research university in New Haven, Connecticut.'
  },
  {
    name: 'Princeton University',
    country: 'US',
    location: 'Princeton, NJ',
    type: 'Private',
    official_website: 'https://www.princeton.edu',
    admissions_url: 'https://admission.princeton.edu',
    programs_url: 'https://www.princeton.edu/academics',
    application_portal_url: 'https://apply.princeton.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.040,
    tuition_cost: 59710,
    major_categories: JSON.stringify(['Computer Science', 'Economics', 'Public Policy', 'History', 'Operations Research']),
    academic_strengths: JSON.stringify(['Engineering', 'Public Policy', 'Sciences']),
    common_app_id: 'PRIN',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Princeton University is a private Ivy League research university in Princeton, New Jersey.'
  },
  {
    name: 'Columbia University',
    country: 'US',
    location: 'New York, NY',
    type: 'Private',
    official_website: 'https://www.columbia.edu',
    admissions_url: 'https://undergrad.admissions.columbia.edu',
    programs_url: 'https://www.columbia.edu/academics',
    application_portal_url: 'https://apply.college.columbia.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.039,
    tuition_cost: 65524,
    major_categories: JSON.stringify(['Computer Science', 'Economics', 'Political Science', 'Psychology', 'English']),
    academic_strengths: JSON.stringify(['Journalism', 'Business', 'Law', 'Medicine']),
    common_app_id: 'COLU',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Columbia University is a private Ivy League research university in New York City.'
  },
  {
    name: 'University of Pennsylvania',
    country: 'US',
    location: 'Philadelphia, PA',
    type: 'Private',
    official_website: 'https://www.upenn.edu',
    admissions_url: 'https://admissions.upenn.edu',
    programs_url: 'https://www.upenn.edu/academics',
    application_portal_url: 'https://apply.upenn.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.059,
    tuition_cost: 63452,
    major_categories: JSON.stringify(['Finance', 'Economics', 'Nursing', 'Biology', 'Philosophy']),
    academic_strengths: JSON.stringify(['Business', 'Medicine', 'Nursing', 'Law']),
    common_app_id: 'PENN',
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Pennsylvania is a private Ivy League research university in Philadelphia.'
  },
  {
    name: 'Duke University',
    country: 'US',
    location: 'Durham, NC',
    type: 'Private',
    official_website: 'https://www.duke.edu',
    admissions_url: 'https://admissions.duke.edu',
    programs_url: 'https://www.duke.edu/academics',
    application_portal_url: 'https://apply.duke.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.060,
    tuition_cost: 62688,
    major_categories: JSON.stringify(['Computer Science', 'Economics', 'Public Policy', 'Biology', 'Engineering']),
    academic_strengths: JSON.stringify(['Medicine', 'Business', 'Law', 'Public Policy']),
    common_app_id: 'DUKE',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Duke University is a private research university in Durham, North Carolina.'
  },
  {
    name: 'Northwestern University',
    country: 'US',
    location: 'Evanston, IL',
    type: 'Private',
    official_website: 'https://www.northwestern.edu',
    admissions_url: 'https://admissions.northwestern.edu',
    programs_url: 'https://www.northwestern.edu/academics',
    application_portal_url: 'https://apply.northwestern.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.070,
    tuition_cost: 62391,
    major_categories: JSON.stringify(['Economics', 'Journalism', 'Engineering', 'Computer Science', 'Psychology']),
    academic_strengths: JSON.stringify(['Journalism', 'Business', 'Theater', 'Engineering']),
    common_app_id: 'NWST',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Northwestern University is a private research university in Evanston, Illinois.'
  },
  {
    name: 'California Institute of Technology',
    country: 'US',
    location: 'Pasadena, CA',
    type: 'Private',
    official_website: 'https://www.caltech.edu',
    admissions_url: 'https://admissions.caltech.edu',
    programs_url: 'https://www.caltech.edu/academics',
    application_portal_url: 'https://apply.caltech.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.027,
    tuition_cost: 60864,
    major_categories: JSON.stringify(['Physics', 'Engineering', 'Computer Science', 'Chemistry', 'Mathematics']),
    academic_strengths: JSON.stringify(['Physics', 'Engineering', 'Space Science', 'Chemistry']),
    common_app_id: 'CALT',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Caltech is a private research university in Pasadena, California.'
  },
  // UK Universities
  {
    name: 'University of Oxford',
    country: 'UK',
    location: 'Oxford, England',
    type: 'Public',
    official_website: 'https://www.ox.ac.uk',
    admissions_url: 'https://www.ox.ac.uk/admissions',
    programs_url: 'https://www.ox.ac.uk/courses',
    application_portal_url: 'https://www.ucas.com',
    application_portal: 'UCAS',
    acceptance_rate: 0.142,
    tuition_cost: 48620,
    major_categories: JSON.stringify(['Philosophy', 'Politics', 'Economics', 'Law', 'Medicine']),
    academic_strengths: JSON.stringify(['Humanities', 'Sciences', 'Law', 'Medicine']),
    ucas_code: 'O33',
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Oxford is a collegiate research university in Oxford, England.'
  },
  {
    name: 'University of Cambridge',
    country: 'UK',
    location: 'Cambridge, England',
    type: 'Public',
    official_website: 'https://www.cam.ac.uk',
    admissions_url: 'https://www.undergraduate.study.cam.ac.uk',
    programs_url: 'https://www.cam.ac.uk/courses',
    application_portal_url: 'https://www.ucas.com',
    application_portal: 'UCAS',
    acceptance_rate: 0.178,
    tuition_cost: 48620,
    major_categories: JSON.stringify(['Natural Sciences', 'Engineering', 'Mathematics', 'Economics', 'Computer Science']),
    academic_strengths: JSON.stringify(['Sciences', 'Engineering', 'Mathematics', 'Medicine']),
    ucas_code: 'C05',
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Cambridge is a collegiate research university in Cambridge, England.'
  },
  {
    name: 'Imperial College London',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    official_website: 'https://www.imperial.ac.uk',
    admissions_url: 'https://www.imperial.ac.uk/study/apply',
    programs_url: 'https://www.imperial.ac.uk/study/courses',
    application_portal_url: 'https://www.ucas.com',
    application_portal: 'UCAS',
    acceptance_rate: 0.112,
    tuition_cost: 42000,
    major_categories: JSON.stringify(['Engineering', 'Computer Science', 'Medicine', 'Physics', 'Mathematics']),
    academic_strengths: JSON.stringify(['Engineering', 'Medicine', 'Sciences', 'Business']),
    ucas_code: 'I50',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Imperial College London is a public research university in London focused on science and technology.'
  },
  {
    name: 'London School of Economics',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    official_website: 'https://www.lse.ac.uk',
    admissions_url: 'https://www.lse.ac.uk/study-at-lse',
    programs_url: 'https://www.lse.ac.uk/study-at-lse/undergraduate',
    application_portal_url: 'https://www.ucas.com',
    application_portal: 'UCAS',
    acceptance_rate: 0.088,
    tuition_cost: 25270,
    major_categories: JSON.stringify(['Economics', 'Finance', 'Political Science', 'International Relations', 'Law']),
    academic_strengths: JSON.stringify(['Economics', 'Political Science', 'Social Sciences', 'Law']),
    ucas_code: 'L72',
    trust_tier: 'official',
    is_verified: 1,
    description: 'LSE is a public research university in London specializing in social sciences.'
  },
  {
    name: 'University College London',
    country: 'UK',
    location: 'London, England',
    type: 'Public',
    official_website: 'https://www.ucl.ac.uk',
    admissions_url: 'https://www.ucl.ac.uk/prospective-students',
    programs_url: 'https://www.ucl.ac.uk/prospective-students/undergraduate/degrees',
    application_portal_url: 'https://www.ucas.com',
    application_portal: 'UCAS',
    acceptance_rate: 0.130,
    tuition_cost: 28500,
    major_categories: JSON.stringify(['Medicine', 'Architecture', 'Law', 'Economics', 'Engineering']),
    academic_strengths: JSON.stringify(['Medicine', 'Architecture', 'Arts', 'Sciences']),
    ucas_code: 'U80',
    trust_tier: 'official',
    is_verified: 1,
    description: 'UCL is a public research university in London and a member of the Russell Group.'
  },
  // Canadian Universities
  {
    name: 'University of Toronto',
    country: 'Canada',
    location: 'Toronto, Ontario',
    type: 'Public',
    official_website: 'https://www.utoronto.ca',
    admissions_url: 'https://www.utoronto.ca/admissions',
    programs_url: 'https://www.utoronto.ca/academics',
    application_portal_url: 'https://www.ouac.on.ca',
    application_portal: 'OUAC',
    acceptance_rate: 0.430,
    tuition_cost: 59310,
    major_categories: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Life Sciences', 'Social Sciences']),
    academic_strengths: JSON.stringify(['Research', 'Medicine', 'Engineering', 'Business']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Toronto is a public research university in Toronto, Ontario.'
  },
  {
    name: 'McGill University',
    country: 'Canada',
    location: 'Montreal, Quebec',
    type: 'Public',
    official_website: 'https://www.mcgill.ca',
    admissions_url: 'https://www.mcgill.ca/admissions',
    programs_url: 'https://www.mcgill.ca/undergraduate-admissions/programs',
    application_portal_url: 'https://www.mcgill.ca/admissions/apply',
    application_portal: 'Direct',
    acceptance_rate: 0.380,
    tuition_cost: 52290,
    major_categories: JSON.stringify(['Medicine', 'Engineering', 'Arts', 'Science', 'Music']),
    academic_strengths: JSON.stringify(['Medicine', 'Law', 'Music', 'Sciences']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'McGill University is a public research university in Montreal, Quebec.'
  },
  {
    name: 'University of British Columbia',
    country: 'Canada',
    location: 'Vancouver, BC',
    type: 'Public',
    official_website: 'https://www.ubc.ca',
    admissions_url: 'https://you.ubc.ca/admissions',
    programs_url: 'https://you.ubc.ca/programs',
    application_portal_url: 'https://account.you.ubc.ca/apply',
    application_portal: 'Direct',
    acceptance_rate: 0.460,
    tuition_cost: 44091,
    major_categories: JSON.stringify(['Computer Science', 'Commerce', 'Engineering', 'Sciences', 'Arts']),
    academic_strengths: JSON.stringify(['Forestry', 'Mining', 'Sustainability', 'Research']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'UBC is a public research university with campuses in Vancouver and Kelowna.'
  },
  // European Universities
  {
    name: 'ETH Zurich',
    country: 'Switzerland',
    location: 'Zurich, Switzerland',
    type: 'Public',
    official_website: 'https://ethz.ch',
    admissions_url: 'https://ethz.ch/en/studies/registration-application.html',
    programs_url: 'https://ethz.ch/en/studies/programmes.html',
    application_portal_url: 'https://www.lehrbetrieb.ethz.ch/eApply/',
    application_portal: 'Direct',
    acceptance_rate: 0.270,
    tuition_cost: 1460,
    major_categories: JSON.stringify(['Engineering', 'Computer Science', 'Physics', 'Mathematics', 'Architecture']),
    academic_strengths: JSON.stringify(['Engineering', 'Sciences', 'Technology', 'Research']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'ETH Zurich is a public research university in Zurich, Switzerland.'
  },
  {
    name: 'Technical University of Munich',
    country: 'Germany',
    location: 'Munich, Germany',
    type: 'Public',
    official_website: 'https://www.tum.de',
    admissions_url: 'https://www.tum.de/en/studies/application',
    programs_url: 'https://www.tum.de/en/studies/degree-programs',
    application_portal_url: 'https://campus.tum.de',
    application_portal: 'Direct',
    acceptance_rate: 0.080,
    tuition_cost: 0,
    major_categories: JSON.stringify(['Engineering', 'Computer Science', 'Natural Sciences', 'Medicine', 'Economics']),
    academic_strengths: JSON.stringify(['Engineering', 'Technology', 'Sciences', 'Innovation']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'TUM is a public research university in Munich, Germany.'
  },
  {
    name: 'University of Amsterdam',
    country: 'Netherlands',
    location: 'Amsterdam, Netherlands',
    type: 'Public',
    official_website: 'https://www.uva.nl',
    admissions_url: 'https://www.uva.nl/en/education/admissions',
    programs_url: 'https://www.uva.nl/en/programmes',
    application_portal_url: 'https://www.studielink.nl',
    application_portal: 'Studielink',
    acceptance_rate: 0.350,
    tuition_cost: 13800,
    major_categories: JSON.stringify(['Social Sciences', 'Economics', 'Law', 'Humanities', 'Sciences']),
    academic_strengths: JSON.stringify(['Social Sciences', 'Economics', 'Media Studies', 'Psychology']),
    studielink_required: 1,
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Amsterdam is a public research university in Amsterdam.'
  },
  {
    name: 'Delft University of Technology',
    country: 'Netherlands',
    location: 'Delft, Netherlands',
    type: 'Public',
    official_website: 'https://www.tudelft.nl',
    admissions_url: 'https://www.tudelft.nl/en/education/admission-and-application',
    programs_url: 'https://www.tudelft.nl/en/education/programmes',
    application_portal_url: 'https://www.studielink.nl',
    application_portal: 'Studielink',
    acceptance_rate: 0.300,
    tuition_cost: 14500,
    major_categories: JSON.stringify(['Aerospace Engineering', 'Computer Science', 'Architecture', 'Civil Engineering', 'Mechanical Engineering']),
    academic_strengths: JSON.stringify(['Engineering', 'Architecture', 'Technology', 'Design']),
    studielink_required: 1,
    trust_tier: 'official',
    is_verified: 1,
    description: 'TU Delft is a public technical university in Delft, Netherlands.'
  },
  // Australian Universities
  {
    name: 'University of Melbourne',
    country: 'Australia',
    location: 'Melbourne, Victoria',
    type: 'Public',
    official_website: 'https://www.unimelb.edu.au',
    admissions_url: 'https://study.unimelb.edu.au/how-to-apply',
    programs_url: 'https://study.unimelb.edu.au/find',
    application_portal_url: 'https://apply.unimelb.edu.au',
    application_portal: 'Direct',
    acceptance_rate: 0.700,
    tuition_cost: 45000,
    major_categories: JSON.stringify(['Arts', 'Science', 'Commerce', 'Engineering', 'Biomedicine']),
    academic_strengths: JSON.stringify(['Medicine', 'Law', 'Arts', 'Research']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Melbourne is a public research university in Melbourne, Australia.'
  },
  {
    name: 'Australian National University',
    country: 'Australia',
    location: 'Canberra, ACT',
    type: 'Public',
    official_website: 'https://www.anu.edu.au',
    admissions_url: 'https://www.anu.edu.au/study/apply',
    programs_url: 'https://programsandcourses.anu.edu.au',
    application_portal_url: 'https://apply.anu.edu.au',
    application_portal: 'Direct',
    acceptance_rate: 0.350,
    tuition_cost: 46650,
    major_categories: JSON.stringify(['Politics', 'International Relations', 'Science', 'Law', 'Asia-Pacific Studies']),
    academic_strengths: JSON.stringify(['Political Science', 'Asia-Pacific Studies', 'Sciences', 'Research']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'ANU is Australia\'s national research university in Canberra.'
  },
  {
    name: 'University of Sydney',
    country: 'Australia',
    location: 'Sydney, NSW',
    type: 'Public',
    official_website: 'https://www.sydney.edu.au',
    admissions_url: 'https://www.sydney.edu.au/study/how-to-apply.html',
    programs_url: 'https://www.sydney.edu.au/courses',
    application_portal_url: 'https://www.sydney.edu.au/study/how-to-apply.html',
    application_portal: 'Direct',
    acceptance_rate: 0.300,
    tuition_cost: 49000,
    major_categories: JSON.stringify(['Medicine', 'Law', 'Business', 'Engineering', 'Arts']),
    academic_strengths: JSON.stringify(['Medicine', 'Law', 'Business', 'Veterinary Science']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Sydney is Australia\'s first university, founded in 1850.'
  },
  // Asian Universities
  {
    name: 'National University of Singapore',
    country: 'Singapore',
    location: 'Singapore',
    type: 'Public',
    official_website: 'https://www.nus.edu.sg',
    admissions_url: 'https://www.nus.edu.sg/oam',
    programs_url: 'https://www.nus.edu.sg/oam/undergraduate-programmes',
    application_portal_url: 'https://www.nus.edu.sg/oam/apply-to-nus',
    application_portal: 'Direct',
    acceptance_rate: 0.040,
    tuition_cost: 17550,
    major_categories: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Law', 'Medicine']),
    academic_strengths: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Research']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'NUS is a national research university in Singapore.'
  },
  {
    name: 'University of Hong Kong',
    country: 'Hong Kong',
    location: 'Hong Kong',
    type: 'Public',
    official_website: 'https://www.hku.hk',
    admissions_url: 'https://admissions.hku.hk',
    programs_url: 'https://www.hku.hk/programmes',
    application_portal_url: 'https://www.als.hku.hk/admission',
    application_portal: 'Direct',
    acceptance_rate: 0.100,
    tuition_cost: 22500,
    major_categories: JSON.stringify(['Business', 'Law', 'Medicine', 'Engineering', 'Architecture']),
    academic_strengths: JSON.stringify(['Law', 'Medicine', 'Business', 'Dentistry']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'HKU is a public research university in Hong Kong.'
  },
  {
    name: 'University of Tokyo',
    country: 'Japan',
    location: 'Tokyo, Japan',
    type: 'Public',
    official_website: 'https://www.u-tokyo.ac.jp',
    admissions_url: 'https://www.u-tokyo.ac.jp/en/prospective-students',
    programs_url: 'https://www.u-tokyo.ac.jp/en/academics',
    application_portal_url: 'https://www.u-tokyo.ac.jp/en/prospective-students/undergraduate_admissions.html',
    application_portal: 'Direct',
    acceptance_rate: 0.340,
    tuition_cost: 4900,
    major_categories: JSON.stringify(['Engineering', 'Law', 'Medicine', 'Economics', 'Sciences']),
    academic_strengths: JSON.stringify(['Sciences', 'Engineering', 'Medicine', 'Research']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Tokyo is Japan\'s top national research university.'
  },
  {
    name: 'Seoul National University',
    country: 'South Korea',
    location: 'Seoul, South Korea',
    type: 'Public',
    official_website: 'https://www.snu.ac.kr',
    admissions_url: 'https://en.snu.ac.kr/apply',
    programs_url: 'https://en.snu.ac.kr/academics',
    application_portal_url: 'https://admission.snu.ac.kr',
    application_portal: 'Direct',
    acceptance_rate: 0.210,
    tuition_cost: 6500,
    major_categories: JSON.stringify(['Engineering', 'Business', 'Medicine', 'Law', 'Sciences']),
    academic_strengths: JSON.stringify(['Engineering', 'Sciences', 'Medicine', 'Social Sciences']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'SNU is South Korea\'s premier national research university.'
  },
  // More US Universities
  {
    name: 'Brown University',
    country: 'US',
    location: 'Providence, RI',
    type: 'Private',
    official_website: 'https://www.brown.edu',
    admissions_url: 'https://admission.brown.edu',
    programs_url: 'https://www.brown.edu/academics',
    application_portal_url: 'https://apply.brown.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.051,
    tuition_cost: 65656,
    major_categories: JSON.stringify(['Computer Science', 'Economics', 'Biology', 'Engineering', 'Political Science']),
    academic_strengths: JSON.stringify(['Liberal Arts', 'Open Curriculum', 'Research']),
    common_app_id: 'BRWN',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Brown University is a private Ivy League research university in Providence, Rhode Island.'
  },
  {
    name: 'Dartmouth College',
    country: 'US',
    location: 'Hanover, NH',
    type: 'Private',
    official_website: 'https://www.dartmouth.edu',
    admissions_url: 'https://admissions.dartmouth.edu',
    programs_url: 'https://www.dartmouth.edu/academics',
    application_portal_url: 'https://apply.dartmouth.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.062,
    tuition_cost: 63246,
    major_categories: JSON.stringify(['Economics', 'Government', 'Computer Science', 'Engineering', 'Biology']),
    academic_strengths: JSON.stringify(['Liberal Arts', 'Business', 'Engineering']),
    common_app_id: 'DART',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Dartmouth College is a private Ivy League research university in Hanover, New Hampshire.'
  },
  {
    name: 'Cornell University',
    country: 'US',
    location: 'Ithaca, NY',
    type: 'Private',
    official_website: 'https://www.cornell.edu',
    admissions_url: 'https://admissions.cornell.edu',
    programs_url: 'https://www.cornell.edu/academics',
    application_portal_url: 'https://apply.cornell.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.073,
    tuition_cost: 65204,
    major_categories: JSON.stringify(['Computer Science', 'Engineering', 'Biology', 'Hotel Administration', 'Economics']),
    academic_strengths: JSON.stringify(['Engineering', 'Agriculture', 'Hotel Management', 'Veterinary']),
    common_app_id: 'CORN',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Cornell University is a private Ivy League land-grant research university in Ithaca, New York.'
  },
  {
    name: 'University of Chicago',
    country: 'US',
    location: 'Chicago, IL',
    type: 'Private',
    official_website: 'https://www.uchicago.edu',
    admissions_url: 'https://collegeadmissions.uchicago.edu',
    programs_url: 'https://www.uchicago.edu/academics',
    application_portal_url: 'https://apply.uchicago.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.054,
    tuition_cost: 65619,
    major_categories: JSON.stringify(['Economics', 'Mathematics', 'Biology', 'Political Science', 'Computer Science']),
    academic_strengths: JSON.stringify(['Economics', 'Law', 'Business', 'Social Sciences']),
    common_app_id: 'UCHI',
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Chicago is a private research university in Chicago, Illinois.'
  },
  {
    name: 'Johns Hopkins University',
    country: 'US',
    location: 'Baltimore, MD',
    type: 'Private',
    official_website: 'https://www.jhu.edu',
    admissions_url: 'https://apply.jhu.edu',
    programs_url: 'https://www.jhu.edu/academics',
    application_portal_url: 'https://apply.jhu.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.072,
    tuition_cost: 62840,
    major_categories: JSON.stringify(['Neuroscience', 'Public Health', 'Biomedical Engineering', 'Economics', 'International Studies']),
    academic_strengths: JSON.stringify(['Medicine', 'Public Health', 'Biomedical Engineering', 'Research']),
    common_app_id: 'JHOP',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Johns Hopkins University is a private research university in Baltimore, Maryland.'
  },
  {
    name: 'Rice University',
    country: 'US',
    location: 'Houston, TX',
    type: 'Private',
    official_website: 'https://www.rice.edu',
    admissions_url: 'https://admission.rice.edu',
    programs_url: 'https://www.rice.edu/academics',
    application_portal_url: 'https://apply.rice.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.079,
    tuition_cost: 58128,
    major_categories: JSON.stringify(['Engineering', 'Computer Science', 'Economics', 'Biology', 'Architecture']),
    academic_strengths: JSON.stringify(['Engineering', 'Sciences', 'Architecture', 'Music']),
    common_app_id: 'RICE',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Rice University is a private research university in Houston, Texas.'
  },
  {
    name: 'Vanderbilt University',
    country: 'US',
    location: 'Nashville, TN',
    type: 'Private',
    official_website: 'https://www.vanderbilt.edu',
    admissions_url: 'https://admissions.vanderbilt.edu',
    programs_url: 'https://www.vanderbilt.edu/academics',
    application_portal_url: 'https://apply.vanderbilt.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.063,
    tuition_cost: 62194,
    major_categories: JSON.stringify(['Economics', 'Medicine', 'Human and Organizational Development', 'Neuroscience', 'Computer Science']),
    academic_strengths: JSON.stringify(['Medicine', 'Education', 'Music', 'Business']),
    common_app_id: 'VAND',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Vanderbilt University is a private research university in Nashville, Tennessee.'
  },
  {
    name: 'University of Notre Dame',
    country: 'US',
    location: 'Notre Dame, IN',
    type: 'Private',
    official_website: 'https://www.nd.edu',
    admissions_url: 'https://admissions.nd.edu',
    programs_url: 'https://www.nd.edu/academics',
    application_portal_url: 'https://apply.nd.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.128,
    tuition_cost: 62693,
    major_categories: JSON.stringify(['Finance', 'Political Science', 'Economics', 'Engineering', 'Theology']),
    academic_strengths: JSON.stringify(['Business', 'Law', 'Engineering', 'Theology']),
    common_app_id: 'NDME',
    trust_tier: 'official',
    is_verified: 1,
    description: 'The University of Notre Dame is a private Catholic research university in Notre Dame, Indiana.'
  },
  {
    name: 'Carnegie Mellon University',
    country: 'US',
    location: 'Pittsburgh, PA',
    type: 'Private',
    official_website: 'https://www.cmu.edu',
    admissions_url: 'https://admission.cmu.edu',
    programs_url: 'https://www.cmu.edu/academics',
    application_portal_url: 'https://apply.cmu.edu',
    application_portal: 'Common App',
    acceptance_rate: 0.110,
    tuition_cost: 63829,
    major_categories: JSON.stringify(['Computer Science', 'Engineering', 'Business', 'Drama', 'Design']),
    academic_strengths: JSON.stringify(['Computer Science', 'Robotics', 'Drama', 'Business']),
    common_app_id: 'CMU',
    trust_tier: 'official',
    is_verified: 1,
    description: 'Carnegie Mellon University is a private research university in Pittsburgh, Pennsylvania.'
  },
  {
    name: 'University of California, Berkeley',
    country: 'US',
    location: 'Berkeley, CA',
    type: 'Public',
    official_website: 'https://www.berkeley.edu',
    admissions_url: 'https://admissions.berkeley.edu',
    programs_url: 'https://www.berkeley.edu/academics',
    application_portal_url: 'https://apply.universityofcalifornia.edu',
    application_portal: 'UC Application',
    acceptance_rate: 0.113,
    tuition_cost: 44066,
    major_categories: JSON.stringify(['Computer Science', 'Engineering', 'Economics', 'Biology', 'Political Science']),
    academic_strengths: JSON.stringify(['Engineering', 'Computer Science', 'Business', 'Sciences']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'UC Berkeley is a public land-grant research university in Berkeley, California.'
  },
  {
    name: 'University of California, Los Angeles',
    country: 'US',
    location: 'Los Angeles, CA',
    type: 'Public',
    official_website: 'https://www.ucla.edu',
    admissions_url: 'https://admission.ucla.edu',
    programs_url: 'https://www.ucla.edu/academics',
    application_portal_url: 'https://apply.universityofcalifornia.edu',
    application_portal: 'UC Application',
    acceptance_rate: 0.088,
    tuition_cost: 44830,
    major_categories: JSON.stringify(['Biology', 'Business Economics', 'Political Science', 'Psychology', 'Computer Science']),
    academic_strengths: JSON.stringify(['Medicine', 'Film', 'Theater', 'Engineering']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'UCLA is a public land-grant research university in Los Angeles, California.'
  },
  {
    name: 'Georgetown University',
    country: 'US',
    location: 'Washington, DC',
    type: 'Private',
    official_website: 'https://www.georgetown.edu',
    admissions_url: 'https://uadmissions.georgetown.edu',
    programs_url: 'https://www.georgetown.edu/academics',
    application_portal_url: 'https://apply.georgetown.edu',
    application_portal: 'Direct',
    acceptance_rate: 0.120,
    tuition_cost: 63580,
    major_categories: JSON.stringify(['International Affairs', 'Government', 'Finance', 'Economics', 'Nursing']),
    academic_strengths: JSON.stringify(['Foreign Service', 'Law', 'Business', 'Medicine']),
    trust_tier: 'official',
    is_verified: 1,
    description: 'Georgetown University is a private Jesuit research university in Washington, D.C.'
  }
];

function seedDatabase() {
  console.log('\n🌱 Starting database seeding...\n');
  
  // Check if colleges table exists
  try {
    db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  } catch (err) {
    console.error('❌ Colleges table does not exist. Run migrations first:');
    console.error('   node scripts/runMigrations.js');
    process.exit(1);
  }
  
  // Get current count
  const before = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`📊 Current college count: ${before.count}`);
  
  // Clear existing data if requested
  if (process.argv.includes('--force') || process.argv.includes('-f')) {
    console.log('🗑️  Clearing existing college data (--force flag)...');
    db.exec('DELETE FROM colleges');
  }
  
  // Prepare insert statement matching the actual schema
  const insertStmt = db.prepare(`
    INSERT INTO colleges (
      name, country, location, type, official_website, admissions_url,
      programs_url, application_portal_url, application_portal, acceptance_rate,
      tuition_cost, major_categories, academic_strengths, description,
      common_app_id, ucas_code, studielink_required, trust_tier, is_verified
    ) VALUES (
      @name, @country, @location, @type, @official_website, @admissions_url,
      @programs_url, @application_portal_url, @application_portal, @acceptance_rate,
      @tuition_cost, @major_categories, @academic_strengths, @description,
      @common_app_id, @ucas_code, @studielink_required, @trust_tier, @is_verified
    )
  `);
  
  let inserted = 0;
  let skipped = 0;
  
  const insertMany = db.transaction((colleges) => {
    for (const college of colleges) {
      try {
        // Check if college already exists
        const existing = db.prepare('SELECT id FROM colleges WHERE name = ?').get(college.name);
        if (existing) {
          skipped++;
          continue;
        }
        
        insertStmt.run({
          name: college.name,
          country: college.country,
          location: college.location || null,
          type: college.type || null,
          official_website: college.official_website,
          admissions_url: college.admissions_url || null,
          programs_url: college.programs_url || null,
          application_portal_url: college.application_portal_url || null,
          application_portal: college.application_portal || null,
          acceptance_rate: college.acceptance_rate || null,
          tuition_cost: college.tuition_cost || null,
          major_categories: college.major_categories || null,
          academic_strengths: college.academic_strengths || null,
          description: college.description || null,
          common_app_id: college.common_app_id || null,
          ucas_code: college.ucas_code || null,
          studielink_required: college.studielink_required || 0,
          trust_tier: college.trust_tier || 'official',
          is_verified: college.is_verified || 0
        });
        inserted++;
      } catch (err) {
        console.error(`⚠️  Error inserting ${college.name}: ${err.message}`);
      }
    }
  });
  
  insertMany(colleges);
  
  // Get final count
  const after = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  
  console.log('\n' + '━'.repeat(60));
  console.log(`✅ Seeding complete!`);
  console.log(`   Inserted: ${inserted} colleges`);
  console.log(`   Skipped: ${skipped} (already exist)`);
  console.log(`   Total: ${after.count} colleges in database`);
  console.log('━'.repeat(60) + '\n');
}

// Run seeding
try {
  seedDatabase();
} catch (err) {
  console.error('❌ Seeding failed:', err.message);
  process.exit(1);
} finally {
  if (db) {
    db.close();
  }
}
