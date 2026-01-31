/**
 * Normalized Majors Database Seeder
 * 
 * This script:
 * 1. Creates the master majors catalog from parsed college data
 * 2. Normalizes major names using fuzzy matching and synonyms
 * 3. Maps colleges to majors using the join table
 * 4. Assigns CIP codes and STEM flags
 * 5. Tracks sources and confidence scores
 */

const fs = require('fs');
const path = require('path');

// Load database manager
const dbManager = require('../src/config/database');

// Data paths
const UNIFIED_DATA_FILE = path.join(__dirname, '..', 'data', 'unified_colleges.json');
const MIGRATION_FILE = path.join(__dirname, '..', 'migrations', '012_normalized_majors.sql');

// ==========================================
// MAJOR CLASSIFICATION DATA
// ==========================================

// CIP Code Categories (simplified classification)
const MAJOR_CATEGORIES = {
  'STEM': ['Computer Science', 'Engineering', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 
           'Data Science', 'Statistics', 'Information Technology', 'Biochemistry', 'Neuroscience',
           'Aerospace Engineering', 'Mechanical Engineering', 'Electrical Engineering', 
           'Chemical Engineering', 'Civil Engineering', 'Biomedical Engineering', 'Materials Science'],
  'Business': ['Business', 'Business Administration', 'Finance', 'Accounting', 'Marketing', 
               'Economics', 'Management', 'Entrepreneurship', 'International Business', 
               'Supply Chain', 'Operations', 'Real Estate', 'Hospitality'],
  'Arts': ['Art', 'Music', 'Theater', 'Dance', 'Film', 'Photography', 'Design', 
           'Graphic Design', 'Animation', 'Creative Writing', 'Fine Arts', 'Studio Art'],
  'Humanities': ['English', 'Literature', 'History', 'Philosophy', 'Classics', 'Religion',
                 'Languages', 'Linguistics', 'Cultural Studies', 'Journalism', 'Communications'],
  'Social Sciences': ['Psychology', 'Sociology', 'Political Science', 'Anthropology', 
                      'Geography', 'International Relations', 'Public Policy', 'Social Work',
                      'Criminal Justice', 'Gender Studies', 'Ethnic Studies'],
  'Health': ['Medicine', 'Nursing', 'Public Health', 'Pre-Med', 'Pharmacy', 'Dentistry',
             'Physical Therapy', 'Occupational Therapy', 'Health Sciences', 'Nutrition',
             'Kinesiology', 'Sports Medicine'],
  'Education': ['Education', 'Teaching', 'Curriculum', 'Educational Psychology', 
                'Special Education', 'Early Childhood'],
  'Law': ['Law', 'Legal Studies', 'Pre-Law', 'Criminal Justice'],
  'Agriculture': ['Agriculture', 'Environmental Science', 'Natural Resources', 'Forestry',
                  'Animal Science', 'Plant Science', 'Marine Biology'],
  'Architecture': ['Architecture', 'Urban Planning', 'Landscape Architecture', 'Interior Design']
};

// STEM subjects list for stem_flag
const STEM_SUBJECTS = [
  'Computer Science', 'Engineering', 'Mathematics', 'Physics', 'Chemistry', 
  'Biology', 'Data Science', 'Statistics', 'Biochemistry', 'Neuroscience',
  'Information Technology', 'Aerospace', 'Mechanical', 'Electrical', 
  'Chemical', 'Civil', 'Biomedical', 'Materials', 'Geology', 'Astronomy',
  'Bioinformatics', 'Cybersecurity', 'Artificial Intelligence', 'Machine Learning',
  'Robotics', 'Environmental Engineering', 'Industrial Engineering', 'Software'
];

// Synonym mapping for normalization
const MAJOR_SYNONYMS = {
  'Computer Science': ['Comp Sci', 'CS', 'Computer Studies', 'Computing', 'Computational Science', 'Info Sci'],
  'Business Administration': ['Business Admin', 'BBA', 'Business Management', 'General Business'],
  'Economics': ['Econ', 'Economic Studies', 'Economic Theory'],
  'Political Science': ['Poli Sci', 'Politics', 'Government', 'Political Studies'],
  'Psychology': ['Psych', 'Psychological Science', 'Behavioral Science'],
  'Biology': ['Bio', 'Biological Sciences', 'Life Sciences'],
  'Mechanical Engineering': ['Mech Eng', 'ME', 'Mechanical'],
  'Electrical Engineering': ['EE', 'Elec Eng', 'Electrical & Computer Engineering', 'ECE'],
  'Chemical Engineering': ['Chem Eng', 'ChemE', 'ChE'],
  'Civil Engineering': ['CE', 'Civil Eng'],
  'Biomedical Engineering': ['BME', 'Biomed Eng'],
  'Communications': ['Communication Studies', 'Comm', 'Media Studies', 'Mass Communication'],
  'English': ['English Literature', 'English Studies', 'English Language'],
  'Mathematics': ['Math', 'Applied Math', 'Pure Mathematics', 'Mathematical Sciences'],
  'Physics': ['Phys', 'Physical Sciences', 'Applied Physics'],
  'Chemistry': ['Chem', 'Chemical Sciences'],
  'Nursing': ['BSN', 'RN', 'Registered Nursing', 'Nursing Science'],
  'Pre-Med': ['Pre-Medicine', 'Premed', 'Pre Medical'],
  'International Relations': ['IR', 'International Affairs', 'Global Studies', 'International Studies'],
  'Public Health': ['Public Health Sciences', 'Community Health', 'Population Health'],
  'Finance': ['Financial Economics', 'Financial Studies', 'Corporate Finance'],
  'Marketing': ['Marketing Management', 'Digital Marketing', 'Marketing Communications'],
  'Accounting': ['Accountancy', 'Financial Accounting', 'Managerial Accounting'],
  'Architecture': ['Architectural Studies', 'Arch', 'Architectural Design'],
  'Environmental Science': ['Env Sci', 'Environmental Studies', 'Ecology'],
  'Data Science': ['Data Analytics', 'Data Analysis', 'Big Data', 'Analytics'],
  'Information Technology': ['IT', 'Info Tech', 'Information Systems', 'MIS'],
  'Journalism': ['News', 'Media', 'Broadcast Journalism', 'Print Journalism'],
  'Art': ['Fine Arts', 'Studio Art', 'Visual Arts', 'Art History'],
  'Music': ['Musical Studies', 'Music Performance', 'Music Theory', 'Composition'],
  'Philosophy': ['Phil', 'Philosophical Studies', 'Ethics'],
  'History': ['Historical Studies', 'Hist', 'American History', 'World History'],
  'Sociology': ['Soc', 'Sociological Studies', 'Social Studies'],
  'Anthropology': ['Anthro', 'Cultural Anthropology', 'Physical Anthropology'],
  'Geography': ['Geo', 'Geographic Studies', 'Physical Geography', 'Human Geography'],
  'Linguistics': ['Language Studies', 'Applied Linguistics', 'Computational Linguistics'],
  'Theater': ['Theatre', 'Drama', 'Dramatic Arts', 'Performing Arts'],
  'Film': ['Cinema', 'Film Studies', 'Cinematography', 'Motion Pictures'],
  'Statistics': ['Stats', 'Statistical Science', 'Applied Statistics'],
  'Biochemistry': ['BioChem', 'Biological Chemistry', 'Molecular Biology'],
  'Neuroscience': ['Neuro', 'Brain Science', 'Cognitive Neuroscience'],
  'Sports Medicine': ['Athletic Training', 'Exercise Science', 'Sports Science', 'Kinesiology']
};

// CIP Code mappings (simplified)
const CIP_CODES = {
  'Computer Science': '11.0701',
  'Business Administration': '52.0201',
  'Engineering': '14.0101',
  'Biology': '26.0101',
  'Psychology': '42.0101',
  'Economics': '45.0601',
  'Political Science': '45.1001',
  'Mathematics': '27.0101',
  'Physics': '40.0801',
  'Chemistry': '40.0501',
  'English': '23.0101',
  'History': '54.0101',
  'Nursing': '51.3801',
  'Medicine': '51.1201',
  'Law': '22.0101',
  'Architecture': '04.0201',
  'Art': '50.0701',
  'Music': '50.0901',
  'Education': '13.0101',
  'Accounting': '52.0301',
  'Finance': '52.0801',
  'Marketing': '52.1401',
  'Communications': '09.0100',
  'Journalism': '09.0401',
  'Sociology': '45.1101',
  'Anthropology': '45.0201',
  'Philosophy': '38.0101',
  'Environmental Science': '03.0104',
  'Data Science': '30.7001',
  'Information Technology': '11.0103',
  'Public Health': '51.2201'
};

// ==========================================
// NORMALIZATION FUNCTIONS
// ==========================================

/**
 * Normalize a major name to its canonical form
 */
function normalizeMajorName(rawName) {
  if (!rawName) return null;
  
  let name = rawName.trim();
  
  // Check synonym mappings
  for (const [canonical, synonyms] of Object.entries(MAJOR_SYNONYMS)) {
    // Check exact match with synonyms (case-insensitive)
    for (const syn of synonyms) {
      if (name.toLowerCase() === syn.toLowerCase()) {
        return canonical;
      }
    }
    // Check if canonical name matches
    if (name.toLowerCase() === canonical.toLowerCase()) {
      return canonical;
    }
  }
  
  // Title case the name if no match found
  return name.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Determine the category for a major
 */
function getMajorCategory(majorName) {
  const lowerName = majorName.toLowerCase();
  
  for (const [category, keywords] of Object.entries(MAJOR_CATEGORIES)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'Other';
}

/**
 * Check if a major is STEM
 */
function isStemMajor(majorName) {
  const lowerName = majorName.toLowerCase();
  
  for (const stem of STEM_SUBJECTS) {
    if (lowerName.includes(stem.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get CIP code for a major
 */
function getCipCode(majorName) {
  // Direct match
  if (CIP_CODES[majorName]) {
    return CIP_CODES[majorName];
  }
  
  // Fuzzy match
  const lowerName = majorName.toLowerCase();
  for (const [major, code] of Object.entries(CIP_CODES)) {
    if (lowerName.includes(major.toLowerCase()) || major.toLowerCase().includes(lowerName)) {
      return code;
    }
  }
  
  return null;
}

/**
 * Get synonyms for a major as JSON array
 */
function getSynonyms(majorName) {
  const synonyms = MAJOR_SYNONYMS[majorName];
  return synonyms ? JSON.stringify(synonyms) : null;
}

// ==========================================
// DATABASE OPERATIONS
// ==========================================

/**
 * Run the normalized majors migration
 */
function runMigration(db) {
  console.log('📄 Running normalized majors migration...');
  
  if (!fs.existsSync(MIGRATION_FILE)) {
    console.error('❌ Migration file not found:', MIGRATION_FILE);
    return false;
  }
  
  try {
    const migrationSQL = fs.readFileSync(MIGRATION_FILE, 'utf8');
    db.exec(migrationSQL);
    console.log('  ✓ Migration executed successfully');
    return true;
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('  ✓ Tables already exist');
      return true;
    }
    console.error('❌ Migration failed:', err.message);
    return false;
  }
}

/**
 * Load unified college data
 */
function loadCollegeData() {
  console.log('📖 Loading college data...');
  
  if (!fs.existsSync(UNIFIED_DATA_FILE)) {
    console.error('❌ unified_colleges.json not found');
    console.log('   Please run: npm run parse:colleges first');
    return null;
  }
  
  try {
    const content = JSON.parse(fs.readFileSync(UNIFIED_DATA_FILE, 'utf8'));
    console.log(`  ✓ Loaded ${content.colleges.length} colleges`);
    return content;
  } catch (err) {
    console.error('❌ Error loading data:', err.message);
    return null;
  }
}

/**
 * Extract all unique majors from college data
 */
function extractUniqueMajors(colleges) {
  console.log('🔍 Extracting unique majors...');
  
  const majorSet = new Map(); // normalized_name -> { count, sources }
  
  for (const college of colleges) {
    if (!college.programs || !Array.isArray(college.programs)) continue;
    
    for (const program of college.programs) {
      if (!program.program_name) continue;
      
      const normalized = normalizeMajorName(program.program_name);
      if (!normalized) continue;
      
      if (majorSet.has(normalized)) {
        majorSet.get(normalized).count++;
      } else {
        majorSet.set(normalized, {
          name: normalized,
          category: getMajorCategory(normalized),
          isStem: isStemMajor(normalized),
          cipCode: getCipCode(normalized),
          synonyms: getSynonyms(normalized),
          count: 1
        });
      }
    }
  }
  
  const majors = Array.from(majorSet.values());
  console.log(`  ✓ Found ${majors.length} unique majors`);
  
  // Sort by count (most common first)
  majors.sort((a, b) => b.count - a.count);
  
  return majors;
}

/**
 * Seed the majors master catalog
 */
function seedMajorsCatalog(db, majors) {
  console.log('🌱 Seeding majors catalog...');
  
  // Clear existing data
  try {
    db.exec('DELETE FROM majors_fts');
  } catch (e) { /* Table may not exist */ }
  
  db.exec('DELETE FROM majors');
  
  const insertStmt = db.prepare(`
    INSERT INTO majors (major_name, major_category, cip_code, stem_flag, synonyms)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  const majorIdMap = new Map(); // name -> id
  
  const transaction = db.transaction((majors) => {
    for (const major of majors) {
      try {
        const result = insertStmt.run(
          major.name,
          major.category,
          major.cipCode,
          major.isStem ? 1 : 0,
          major.synonyms
        );
        majorIdMap.set(major.name, result.lastInsertRowid);
        inserted++;
      } catch (err) {
        // Skip duplicates
      }
    }
  });
  
  transaction(majors);
  console.log(`  ✓ Inserted ${inserted} majors into catalog`);
  
  // Rebuild FTS index
  try {
    db.exec("INSERT INTO majors_fts(majors_fts) VALUES('rebuild')");
    console.log('  ✓ FTS index rebuilt');
  } catch (err) {
    console.log('  ⚠️ FTS rebuild skipped:', err.message);
  }
  
  return majorIdMap;
}

/**
 * Get college ID by name and country
 */
function getCollegeIdMap(db) {
  console.log('📋 Building college ID map...');
  
  const colleges = db.prepare(`
    SELECT id, name, country FROM colleges_comprehensive
  `).all();
  
  const map = new Map();
  for (const college of colleges) {
    const key = `${college.name}|${college.country}`;
    map.set(key, college.id);
  }
  
  console.log(`  ✓ Found ${map.size} colleges in database`);
  return map;
}

/**
 * Seed the college-majors join table
 */
function seedCollegeMajors(db, colleges, majorIdMap, collegeIdMap) {
  console.log('🔗 Linking colleges to majors...');
  
  // Clear existing data
  db.exec('DELETE FROM college_majors_normalized');
  
  const insertStmt = db.prepare(`
    INSERT INTO college_majors_normalized (
      college_id, major_id, degree_type, enrollment, 
      acceptance_rate, popularity_index, ranking_in_school,
      offered_flag, year, source, confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let inserted = 0;
  let skipped = 0;
  const currentYear = new Date().getFullYear();
  
  const transaction = db.transaction((colleges) => {
    for (const college of colleges) {
      if (!college.programs || !Array.isArray(college.programs)) continue;
      
      const collegeKey = `${college.name}|${college.country}`;
      const collegeId = collegeIdMap.get(collegeKey);
      
      if (!collegeId) {
        skipped++;
        continue;
      }
      
      // Track rankings within this college
      const programRankings = [];
      
      for (let i = 0; i < college.programs.length; i++) {
        const program = college.programs[i];
        if (!program.program_name) continue;
        
        const normalizedName = normalizeMajorName(program.program_name);
        const majorId = majorIdMap.get(normalizedName);
        
        if (!majorId) {
          continue;
        }
        
        // Calculate popularity index (inverse of ranking)
        const popularityIndex = 1 - (i / college.programs.length);
        
        try {
          insertStmt.run(
            collegeId,
            majorId,
            program.degree_type || "Bachelor's",
            program.enrollment || null,
            program.acceptance_rate || null,
            popularityIndex,
            i + 1,  // ranking_in_school (1 = most popular)
            1,      // offered_flag
            currentYear,
            program.source || 'unified_colleges.json',
            college._confidence || 0.8
          );
          inserted++;
        } catch (err) {
          // Skip duplicates
        }
      }
    }
  });
  
  transaction(colleges);
  console.log(`  ✓ Created ${inserted} college-major relationships`);
  if (skipped > 0) {
    console.log(`  ⚠️ Skipped ${skipped} colleges (not in database)`);
  }
  
  return inserted;
}

/**
 * Print statistics and sample queries
 */
function printStatistics(db) {
  console.log('\n📊 Database Statistics:');
  
  // Major counts
  const majorCount = db.prepare('SELECT COUNT(*) as count FROM majors').get();
  console.log(`  Total majors in catalog: ${majorCount.count}`);
  
  // College-major relationship counts
  const relCount = db.prepare('SELECT COUNT(*) as count FROM college_majors_normalized').get();
  console.log(`  Total college-major relationships: ${relCount.count}`);
  
  // STEM majors count
  const stemCount = db.prepare('SELECT COUNT(*) as count FROM majors WHERE stem_flag = 1').get();
  console.log(`  STEM majors: ${stemCount.count}`);
  
  // Top majors by college count
  console.log('\n🎓 Top 10 Most Common Majors:');
  const topMajors = db.prepare(`
    SELECT m.major_name, m.major_category, COUNT(cm.college_id) as college_count
    FROM majors m
    JOIN college_majors_normalized cm ON m.id = cm.major_id
    GROUP BY m.id
    ORDER BY college_count DESC
    LIMIT 10
  `).all();
  
  for (const major of topMajors) {
    console.log(`  ${major.major_name} (${major.major_category}): ${major.college_count} colleges`);
  }
  
  // Majors by category
  console.log('\n📚 Majors by Category:');
  const byCategory = db.prepare(`
    SELECT major_category, COUNT(*) as count
    FROM majors
    GROUP BY major_category
    ORDER BY count DESC
  `).all();
  
  for (const cat of byCategory) {
    console.log(`  ${cat.major_category}: ${cat.count}`);
  }
}

/**
 * Demonstrate example queries
 */
function runExampleQueries(db) {
  console.log('\n🔎 Example Query Results:');
  
  // Example 1: Colleges offering Computer Science
  console.log('\n1. Top 5 Colleges Offering Computer Science:');
  try {
    const csColleges = db.prepare(`
      SELECT c.name, c.country, cm.popularity_index
      FROM colleges_comprehensive c
      JOIN college_majors_normalized cm ON c.id = cm.college_id
      JOIN majors m ON cm.major_id = m.id
      WHERE m.major_name = 'Computer Science'
        AND cm.offered_flag = 1
      ORDER BY cm.popularity_index DESC
      LIMIT 5
    `).all();
    
    for (const college of csColleges) {
      console.log(`  - ${college.name} (${college.country})`);
    }
  } catch (e) {
    console.log('  Query failed:', e.message);
  }
  
  // Example 2: STEM majors search
  console.log('\n2. Full-Text Search for "engineering":');
  try {
    const searchResults = db.prepare(`
      SELECT major_name, major_category 
      FROM majors_fts 
      WHERE majors_fts MATCH 'engineering'
      LIMIT 5
    `).all();
    
    for (const major of searchResults) {
      console.log(`  - ${major.major_name} (${major.major_category})`);
    }
  } catch (e) {
    console.log('  Query failed:', e.message);
  }
}

// ==========================================
// MAIN FUNCTION
// ==========================================

function main() {
  console.log('='.repeat(60));
  console.log('  NORMALIZED MAJORS DATABASE SEEDER');
  console.log('='.repeat(60));
  console.log();
  
  // Load college data
  const data = loadCollegeData();
  if (!data) {
    process.exit(1);
  }
  
  // Initialize database
  console.log('\n🔧 Initializing database...');
  dbManager.initialize();
  dbManager.runMigrations();
  const db = dbManager.getDatabase();
  console.log('✅ Database initialized');
  
  // Run normalized majors migration
  if (!runMigration(db)) {
    process.exit(1);
  }
  
  // Extract unique majors
  const majors = extractUniqueMajors(data.colleges);
  
  // Seed majors catalog
  const majorIdMap = seedMajorsCatalog(db, majors);
  
  // Get college ID map
  const collegeIdMap = getCollegeIdMap(db);
  
  // Seed college-majors relationships
  seedCollegeMajors(db, data.colleges, majorIdMap, collegeIdMap);
  
  // Print statistics
  printStatistics(db);
  
  // Run example queries
  runExampleQueries(db);
  
  // Close database
  dbManager.close();
  
  console.log('\n✅ Normalized majors database seeding complete!');
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { 
  normalizeMajorName, 
  getMajorCategory, 
  isStemMajor, 
  getCipCode,
  main 
};
