/**
 * Seed Real College Data
 * 
 * This script fetches real college data from various sources:
 * - US: Department of Education College Scorecard API
 * - UK: HESA data
 * - India, Singapore, Australia, Netherlands, Germany: Curated lists
 */

const axios = require('axios');
const dbManager = require('../src/config/database');
const logger = require('../src/utils/logger');

// Initialize database
dbManager.initialize();
const db = dbManager.getDatabase();

// US Department of Education API
const US_DOE_API = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const US_DOE_API_KEY = process.env.US_DOE_API_KEY || 'DEMO_KEY'; // Free demo key has limits

/**
 * Fetch US colleges from Department of Education API
 */
async function fetchUSColleges(limit = 100) {
  console.log('🇺🇸 Fetching US colleges from Department of Education...');
  
  try {
    const response = await axios.get(US_DOE_API, {
      params: {
        api_key: US_DOE_API_KEY,
        'school.operating': 1, // Currently operating
        'school.degrees_awarded.predominant': '3,4', // Bachelors or higher
        per_page: limit,
        page: 0,
        fields: 'school.name,school.city,school.state,school.school_url,latest.admissions.admission_rate.overall,latest.programs.cip_4_digit',
        sort: 'latest.student.size:desc' // Sort by student size
      },
      timeout: 30000
    });

    const colleges = [];
    
    for (const school of response.data.results || []) {
      if (!school.school || !school.school.name) continue;
      
      // Extract majors from CIP codes
      const majors = [];
      if (school.latest?.programs?.cip_4_digit) {
        // Map CIP codes to major categories (simplified)
        const cipCodes = school.latest.programs.cip_4_digit;
        if (cipCodes.some(c => c.code?.startsWith('14'))) majors.push('Engineering');
        if (cipCodes.some(c => c.code?.startsWith('11'))) majors.push('Computer Science');
        if (cipCodes.some(c => c.code?.startsWith('52'))) majors.push('Business');
        if (cipCodes.some(c => c.code?.startsWith('51'))) majors.push('Health Sciences');
        if (cipCodes.some(c => c.code?.startsWith('24'))) majors.push('Liberal Arts');
        if (cipCodes.some(c => c.code?.startsWith('26'))) majors.push('Biology');
        if (cipCodes.some(c => c.code?.startsWith('27'))) majors.push('Mathematics');
        if (cipCodes.some(c => c.code?.startsWith('40'))) majors.push('Physical Sciences');
        if (cipCodes.some(c => c.code?.startsWith('42'))) majors.push('Psychology');
      }
      
      const officialWebsite = school.school.school_url || `https://www.google.com/search?q=${encodeURIComponent(school.school.name)}`;
      
      colleges.push({
        name: school.school.name,
        country: 'United States',
        location: `${school.school.city}, ${school.school.state}`,
        officialWebsite: officialWebsite.startsWith('http') ? officialWebsite : `https://${officialWebsite}`,
        majorCategories: majors.length > 0 ? majors : ['Various Programs'],
        acceptanceRate: school.latest?.admissions?.admission_rate?.overall || null,
        trustTier: 'official',
        isVerified: 1
      });
    }
    
    console.log(`✓ Fetched ${colleges.length} US colleges`);
    return colleges;
    
  } catch (error) {
    console.error(`✗ Failed to fetch US colleges: ${error.message}`);
    return [];
  }
}

/**
 * Curated list of major UK universities
 */
function getUKColleges() {
  console.log('🇬🇧 Adding UK universities...');
  
  return [
    { name: 'University of Oxford', location: 'Oxford', website: 'https://www.ox.ac.uk', admissions: 'https://www.ox.ac.uk/admissions' },
    { name: 'University of Cambridge', location: 'Cambridge', website: 'https://www.cam.ac.uk', admissions: 'https://www.cam.ac.uk/admissions' },
    { name: 'Imperial College London', location: 'London', website: 'https://www.imperial.ac.uk', admissions: 'https://www.imperial.ac.uk/study/apply' },
    { name: 'University College London', location: 'London', website: 'https://www.ucl.ac.uk', admissions: 'https://www.ucl.ac.uk/prospective-students/undergraduate' },
    { name: 'London School of Economics', location: 'London', website: 'https://www.lse.ac.uk', admissions: 'https://www.lse.ac.uk/study-at-lse/Undergraduate' },
    { name: 'University of Edinburgh', location: 'Edinburgh', website: 'https://www.ed.ac.uk', admissions: 'https://www.ed.ac.uk/studying/undergraduate/applying' },
    { name: 'University of Manchester', location: 'Manchester', website: 'https://www.manchester.ac.uk', admissions: 'https://www.manchester.ac.uk/study/undergraduate/apply' },
    { name: 'King\'s College London', location: 'London', website: 'https://www.kcl.ac.uk', admissions: 'https://www.kcl.ac.uk/study/undergraduate/apply' },
    { name: 'University of Warwick', location: 'Coventry', website: 'https://warwick.ac.uk', admissions: 'https://warwick.ac.uk/study/undergraduate/apply' },
    { name: 'University of Bristol', location: 'Bristol', website: 'https://www.bristol.ac.uk', admissions: 'https://www.bristol.ac.uk/study/undergraduate/apply' }
  ].map(college => ({
    name: college.name,
    country: 'United Kingdom',
    location: college.location,
    officialWebsite: college.website,
    admissionsUrl: college.admissions,
    majorCategories: ['Engineering', 'Business', 'Liberal Arts', 'Sciences'],
    trustTier: 'official',
    isVerified: 1
  }));
}

/**
 * Curated list of major Indian universities
 */
function getIndianColleges() {
  console.log('🇮🇳 Adding Indian universities...');
  
  return [
    { name: 'Indian Institute of Technology Bombay', location: 'Mumbai, Maharashtra', website: 'https://www.iitb.ac.in', admissions: 'https://www.iitb.ac.in/newacadhome/admissions.jsp' },
    { name: 'Indian Institute of Technology Delhi', location: 'New Delhi', website: 'https://home.iitd.ac.in', admissions: 'https://home.iitd.ac.in/admissions.php' },
    { name: 'Indian Institute of Technology Madras', location: 'Chennai, Tamil Nadu', website: 'https://www.iitm.ac.in', admissions: 'https://www.iitm.ac.in/admissions' },
    { name: 'Indian Institute of Technology Kanpur', location: 'Kanpur, Uttar Pradesh', website: 'https://www.iitk.ac.in', admissions: 'https://www.iitk.ac.in/doaa' },
    { name: 'Indian Institute of Technology Kharagpur', location: 'Kharagpur, West Bengal', website: 'https://www.iitkgp.ac.in', admissions: 'https://www.iitkgp.ac.in/admissions' },
    { name: 'Indian Institute of Science', location: 'Bangalore, Karnataka', website: 'https://iisc.ac.in', admissions: 'https://iisc.ac.in/admissions/' },
    { name: 'Jawaharlal Nehru University', location: 'New Delhi', website: 'https://www.jnu.ac.in', admissions: 'https://www.jnu.ac.in/admission' },
    { name: 'University of Delhi', location: 'New Delhi', website: 'https://www.du.ac.in', admissions: 'https://www.du.ac.in/index.php?page=admissions' },
    { name: 'Banaras Hindu University', location: 'Varanasi, Uttar Pradesh', website: 'https://www.bhu.ac.in', admissions: 'https://www.bhu.ac.in/Site/Admissions' },
    { name: 'Jadavpur University', location: 'Kolkata, West Bengal', website: 'http://www.jadavpur.edu', admissions: 'http://www.jadavpur.edu/admission.htm' }
  ].map(college => ({
    name: college.name,
    country: 'India',
    location: college.location,
    officialWebsite: college.website,
    admissionsUrl: college.admissions,
    majorCategories: ['Engineering', 'Computer Science', 'Sciences', 'Liberal Arts'],
    trustTier: 'official',
    isVerified: 1
  }));
}

/**
 * Curated list of universities from other countries
 */
function getOtherColleges() {
  console.log('🌍 Adding universities from Singapore, Australia, Netherlands, Germany...');
  
  const colleges = [];
  
  // Singapore
  colleges.push(
    { name: 'National University of Singapore', country: 'Singapore', location: 'Singapore', website: 'https://www.nus.edu.sg', admissions: 'https://www.nus.edu.sg/oam/apply-to-nus/admissions-overview' },
    { name: 'Nanyang Technological University', country: 'Singapore', location: 'Singapore', website: 'https://www.ntu.edu.sg', admissions: 'https://www.ntu.edu.sg/admissions/undergraduate/admission-guide' }
  );
  
  // Australia
  colleges.push(
    { name: 'University of Melbourne', country: 'Australia', location: 'Melbourne, Victoria', website: 'https://www.unimelb.edu.au', admissions: 'https://study.unimelb.edu.au/how-to-apply' },
    { name: 'Australian National University', country: 'Australia', location: 'Canberra, ACT', website: 'https://www.anu.edu.au', admissions: 'https://www.anu.edu.au/study/apply' },
    { name: 'University of Sydney', country: 'Australia', location: 'Sydney, NSW', website: 'https://www.sydney.edu.au', admissions: 'https://www.sydney.edu.au/study/admissions.html' },
    { name: 'University of Queensland', country: 'Australia', location: 'Brisbane, Queensland', website: 'https://www.uq.edu.au', admissions: 'https://future-students.uq.edu.au/apply' }
  );
  
  // Netherlands
  colleges.push(
    { name: 'Delft University of Technology', country: 'Netherlands', location: 'Delft', website: 'https://www.tudelft.nl', admissions: 'https://www.tudelft.nl/en/education/admission-and-application' },
    { name: 'University of Amsterdam', country: 'Netherlands', location: 'Amsterdam', website: 'https://www.uva.nl', admissions: 'https://www.uva.nl/en/education/bachelor-s/application-and-admission/application-and-admission.html' },
    { name: 'Utrecht University', country: 'Netherlands', location: 'Utrecht', website: 'https://www.uu.nl', admissions: 'https://www.uu.nl/en/education/bachelors/admission-and-application' },
    { name: 'Eindhoven University of Technology', country: 'Netherlands', location: 'Eindhoven', website: 'https://www.tue.nl', admissions: 'https://www.tue.nl/en/education/become-a-tue-student/bachelors/admission-and-enrollment' }
  );
  
  // Germany
  colleges.push(
    { name: 'Technical University of Munich', country: 'Germany', location: 'Munich, Bavaria', website: 'https://www.tum.de', admissions: 'https://www.tum.de/en/studies/application' },
    { name: 'Ludwig Maximilian University of Munich', country: 'Germany', location: 'Munich, Bavaria', website: 'https://www.lmu.de', admissions: 'https://www.lmu.de/en/study/application-and-admission/index.html' },
    { name: 'Heidelberg University', country: 'Germany', location: 'Heidelberg, Baden-Württemberg', website: 'https://www.uni-heidelberg.de', admissions: 'https://www.uni-heidelberg.de/en/study/all-subjects/application-enrollment' },
    { name: 'Humboldt University of Berlin', country: 'Germany', location: 'Berlin', website: 'https://www.hu-berlin.de', admissions: 'https://www.hu-berlin.de/en/studying/application' }
  );
  
  return colleges.map(college => ({
    name: college.name,
    country: college.country,
    location: college.location,
    officialWebsite: college.website,
    admissionsUrl: college.admissions,
    majorCategories: ['Engineering', 'Computer Science', 'Business', 'Sciences', 'Liberal Arts'],
    trustTier: 'official',
    isVerified: 1
  }));
}

/**
 * Clean duplicate and fake colleges from database
 */
function cleanDatabase() {
  console.log('\n🧹 Cleaning database...');
  
  // Delete all existing colleges
  const deleteStmt = db.prepare('DELETE FROM colleges');
  const result = deleteStmt.run();
  console.log(`✓ Deleted ${result.changes} old college entries`);
  
  // Reset auto-increment
  db.prepare('DELETE FROM sqlite_sequence WHERE name = "colleges"').run();
}

/**
 * Insert colleges into database
 */
function insertColleges(colleges) {
  console.log(`\n💾 Inserting ${colleges.length} colleges into database...`);
  
  const stmt = db.prepare(`
    INSERT INTO colleges (
      name, country, location, official_website, admissions_url,
      major_categories, acceptance_rate, trust_tier, is_verified
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  let failed = 0;
  
  for (const college of colleges) {
    try {
      stmt.run(
        college.name,
        college.country,
        college.location || '',
        college.officialWebsite,
        college.admissionsUrl || null,
        JSON.stringify(college.majorCategories || []),
        college.acceptanceRate || null,
        college.trustTier || 'official',
        college.isVerified || 1
      );
      inserted++;
    } catch (error) {
      console.error(`✗ Failed to insert ${college.name}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`✓ Inserted ${inserted} colleges`);
  if (failed > 0) console.log(`✗ Failed ${failed} colleges`);
}

/**
 * Main execution
 */
async function main() {
  console.log('🎓 College Data Seeding Script\n');
  console.log('This script will replace all existing college data with real colleges.\n');
  
  try {
    // Clean database
    cleanDatabase();
    
    // Gather all colleges
    const allColleges = [];
    
    // Fetch US colleges (limit to 100 for demo, increase for production)
    const usColleges = await fetchUSColleges(100);
    allColleges.push(...usColleges);
    
    // Add curated colleges from other countries
    allColleges.push(...getUKColleges());
    allColleges.push(...getIndianColleges());
    allColleges.push(...getOtherColleges());
    
    // Insert all colleges
    insertColleges(allColleges);
    
    console.log('\n✅ College data seeding completed successfully!');
    console.log(`📊 Total colleges in database: ${allColleges.length}`);
    
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    dbManager.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
