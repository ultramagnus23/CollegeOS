const dbManager = require('../src/config/database');

dbManager.initialize();

const db = dbManager.getDatabase();

// URL corrections mapping
const urlCorrections = {
  // Arizona State University
  'www.arizonastateuniversity.edu': 'www.asu.edu',
  'arizonastateuniversity.edu': 'asu.edu',
  
  // Massachusetts Institute of Technology  
  'massachusettsinstituteoftechnology.edu': 'mit.edu',
  'www.massachusettsinstituteoftechnology.edu': 'www.mit.edu',
  
  // Stanford University
  'stanforduniversity.edu': 'stanford.edu',
  'www.stanforduniversity.edu': 'www.stanford.edu',
  
  // Harvard University
  'harvarduniversity.edu': 'harvard.edu',
  'www.harvarduniversity.edu': 'www.harvard.edu',
  
  // University of Oxford
  'universityofoxford.ac.uk': 'ox.ac.uk',
  'www.universityofoxford.ac.uk': 'www.ox.ac.uk',
  
  // University of Cambridge
  'universityofcambridge.ac.uk': 'cam.ac.uk',
  'www.universityofcambridge.ac.uk': 'www.cam.ac.uk',
  
  // Yale University
  'yaleuniversity.edu': 'yale.edu',
  'www.yaleuniversity.edu': 'www.yale.edu',
  
  // Princeton University
  'princetonuniversity.edu': 'princeton.edu',
  'www.princetonuniversity.edu': 'www.princeton.edu',
  
  // Columbia University
  'columbiauniversity.edu': 'columbia.edu',
  'www.columbiauniversity.edu': 'www.columbia.edu',
  
  // University of California Berkeley
  'universityofcaliforniaberkeley.edu': 'berkeley.edu',
  'www.universityofcaliforniaberkeley.edu': 'www.berkeley.edu',
  
  // Add more as needed...
};

console.log('🔧 Fixing college URLs in database...\n');

// Get all colleges
const stmt = db.prepare('SELECT id, name, official_website, admissions_url FROM colleges');
const colleges = stmt.all();

let updatedCount = 0;

colleges.forEach(college => {
  let needsUpdate = false;
  let newOfficialWebsite = college.official_website;
  let newAdmissionsUrl = college.admissions_url;
  
  // Check official website
  if (newOfficialWebsite) {
    for (const [incorrect, correct] of Object.entries(urlCorrections)) {
      if (newOfficialWebsite.includes(incorrect)) {
        newOfficialWebsite = newOfficialWebsite.replace(incorrect, correct);
        needsUpdate = true;
        console.log(`✓ ${college.name}: ${incorrect} → ${correct}`);
      }
    }
  }
  
  // Check admissions URL
  if (newAdmissionsUrl) {
    for (const [incorrect, correct] of Object.entries(urlCorrections)) {
      if (newAdmissionsUrl.includes(incorrect)) {
        newAdmissionsUrl = newAdmissionsUrl.replace(incorrect, correct);
        needsUpdate = true;
      }
    }
  }
  
  // Update if needed
  if (needsUpdate) {
    const updateStmt = db.prepare(`
      UPDATE colleges 
      SET official_website = ?,
          admissions_url = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    updateStmt.run(newOfficialWebsite, newAdmissionsUrl, college.id);
    updatedCount++;
  }
});

console.log(`\n✅ Updated ${updatedCount} colleges with corrected URLs`);

dbManager.close();
