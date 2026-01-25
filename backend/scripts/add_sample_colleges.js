const dbManager = require('../src/config/database');

dbManager.initialize();

const db = dbManager.getDatabase();

const sampleColleges = [
  {
    name: 'Massachusetts Institute of Technology',
    country: 'United States',
    location: 'Cambridge, MA',
    official_website: 'https://www.mit.edu',
    admissions_url: 'https://www.mit.edu/admissions',
    major_categories: JSON.stringify(['Engineering', 'Computer Science', 'Physics', 'Mathematics']),
    academic_strengths: JSON.stringify(['Research', 'Innovation', 'STEM Excellence']),
    trust_tier: 'official'
  },
  {
    name: 'Stanford University',
    country: 'United States',
    location: 'Stanford, CA',
    official_website: 'https://www.stanford.edu',
    admissions_url: 'https://www.stanford.edu/admission',
    major_categories: JSON.stringify(['Engineering', 'Computer Science', 'Business', 'Medicine']),
    academic_strengths: JSON.stringify(['Entrepreneurship', 'Innovation', 'Research']),
    trust_tier: 'official'
  },
  {
    name: 'University of Oxford',
    country: 'United Kingdom',
    location: 'Oxford',
    official_website: 'https://www.ox.ac.uk',
    admissions_url: 'https://www.ox.ac.uk/admissions',
    major_categories: JSON.stringify(['Philosophy', 'Mathematics', 'Medicine', 'Law']),
    academic_strengths: JSON.stringify(['Research', 'Tutorial System', 'History']),
    trust_tier: 'official'
  },
  {
    name: 'University of Cambridge',
    country: 'United Kingdom',
    location: 'Cambridge',
    official_website: 'https://www.cam.ac.uk',
    admissions_url: 'https://www.cam.ac.uk/admissions',
    major_categories: JSON.stringify(['Engineering', 'Mathematics', 'Natural Sciences', 'Computer Science']),
    academic_strengths: JSON.stringify(['Research', 'Academia', 'Nobel Laureates']),
    trust_tier: 'official'
  },
  {
    name: 'TU Delft',
    country: 'Netherlands',
    location: 'Delft',
    official_website: 'https://www.tudelft.nl',
    admissions_url: 'https://www.tudelft.nl/en/education/admission-and-application',
    major_categories: JSON.stringify(['Engineering', 'Architecture', 'Applied Sciences']),
    academic_strengths: JSON.stringify(['Engineering', 'Research', 'Innovation']),
    trust_tier: 'official'
  }
];

const stmt = db.prepare(`
  INSERT INTO colleges (
    name, country, location, official_website, admissions_url,
    major_categories, academic_strengths, trust_tier, is_verified
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const college of sampleColleges) {
  try {
    stmt.run(
      college.name,
      college.country,
      college.location,
      college.official_website,
      college.admissions_url,
      college.major_categories,
      college.academic_strengths,
      college.trust_tier,
      1
    );
    console.log(`✓ Added: ${college.name}`);
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      console.log(`- Skipped (exists): ${college.name}`);
    } else {
      console.error(`✗ Error adding ${college.name}:`, error.message);
    }
  }
}

dbManager.close();
console.log('\nSample colleges added successfully!');
