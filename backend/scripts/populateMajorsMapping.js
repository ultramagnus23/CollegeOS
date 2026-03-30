/**
 * Populate college_majors_offered table by mapping existing college_programs to master_majors
 * This creates the many-to-many relationship between colleges and the standardized major list
 */

const path = require('path');
const dbManager = require('../src/config/database');

// Mapping of program names to master major names
// This helps normalize the various names colleges use for similar programs
const PROGRAM_TO_MAJOR_MAP = {
  // STEM
  'Computer Science': 'Computer Science',
  'Computer Engineering': 'Computer Engineering',
  'Electrical Engineering': 'Electrical Engineering',
  'Mechanical Engineering': 'Mechanical Engineering',
  'Civil Engineering': 'Civil Engineering',
  'Chemical Engineering': 'Chemical Engineering',
  'Biomedical Engineering': 'Biomedical Engineering',
  'Aerospace Engineering': 'Aerospace Engineering',
  'Mathematics': 'Mathematics',
  'Statistics': 'Statistics',
  'Physics': 'Physics',
  'Chemistry': 'Chemistry',
  'Biology': 'Biology',
  'Biochemistry': 'Biochemistry',
  'Molecular Biology': 'Molecular Biology',
  'Neuroscience': 'Neuroscience',
  'Data Science': 'Data Science',
  'Information Technology': 'Information Technology',
  'Software Engineering': 'Software Engineering',
  'Environmental Science': 'Environmental Science',
  
  // Business
  'Business': 'Business Administration',
  'Business Administration': 'Business Administration',
  'Finance': 'Finance',
  'Accounting': 'Accounting',
  'Marketing': 'Marketing',
  'Economics': 'Economics',
  'Management': 'Management',
  'International Business': 'International Business',
  'Entrepreneurship': 'Entrepreneurship',
  
  // Humanities
  'English': 'English Literature',
  'English Literature': 'English Literature',
  'History': 'History',
  'Philosophy': 'Philosophy',
  'Religious Studies': 'Religious Studies',
  'Classics': 'Classics',
  'Linguistics': 'Linguistics',
  
  // Social Sciences
  'Psychology': 'Psychology',
  'Sociology': 'Sociology',
  'Political Science': 'Political Science',
  'International Relations': 'International Relations',
  'Anthropology': 'Anthropology',
  'Geography': 'Geography',
  
  // Arts
  'Visual Arts': 'Fine Arts',
  'Fine Arts': 'Fine Arts',
  'Music': 'Music',
  'Theater': 'Theater Arts',
  'Theater Arts': 'Theater Arts',
  'Film Studies': 'Film Studies',
  'Dance': 'Dance',
  'Graphic Design': 'Graphic Design',
  
  // Architecture
  'Architecture': 'Architecture',
  'Urban Planning': 'Urban Planning',
  'Interior Design': 'Interior Design',
  
  // Health
  'Nursing': 'Nursing',
  'Public Health': 'Public Health',
  'Health Sciences': 'Health Sciences',
  'Kinesiology': 'Kinesiology',
  
  // Education
  'Education': 'Education',
  'Elementary Education': 'Elementary Education',
  'Secondary Education': 'Secondary Education',
  
  // Communications
  'Communications': 'Communications',
  'Journalism': 'Journalism',
  'Public Relations': 'Public Relations',
  
  // Environmental
  'Environmental Studies': 'Environmental Studies',
  'Sustainability': 'Sustainability Studies',
  
  // Languages
  'Spanish': 'Spanish',
  'French': 'French',
  'German': 'German',
  'Chinese': 'Chinese',
  'Japanese': 'Japanese',
  
  // Interdisciplinary
  'Gender Studies': 'Gender Studies',
  'African American Studies': 'African American Studies',
  'Asian Studies': 'Asian Studies',
  'Latin American Studies': 'Latin American Studies',
  'American Studies': 'American Studies',
};

async function populateMajorsMapping() {
  try {
    console.log('🚀 Starting college_majors_offered population...\n');
    
    const pool = dbManager.getDatabase();

    // Get all master majors
    const masterMajors = (await pool.query('SELECT id, major_name FROM master_majors')).rows;
    console.log(`📚 Found ${masterMajors.length} master majors`);

    // Create a map for quick lookup
    const majorNameToId = {};
    masterMajors.forEach(major => {
      majorNameToId[major.major_name] = major.id;
    });

    // Get all college programs (only for colleges that exist)
    const programs = (await pool.query(`
      SELECT DISTINCT cp.college_id, cp.program_name
      FROM college_programs cp
      INNER JOIN colleges c ON cp.college_id = c.id
      WHERE cp.program_name IS NOT NULL AND cp.program_name != ''
    `)).rows;
    console.log(`🏫 Found ${programs.length} college program entries\n`);

    // Statistics
    let mappedCount = 0;
    let unmappedCount = 0;
    const unmappedPrograms = new Set();

    // Insert mappings
    console.log('⚡ Inserting mappings...');
    for (const program of programs) {
      const mappedMajor = PROGRAM_TO_MAJOR_MAP[program.program_name];

      if (mappedMajor && majorNameToId[mappedMajor]) {
        const majorId = majorNameToId[mappedMajor];
        await pool.query(
          `INSERT INTO college_majors_offered (college_id, major_id, program_name, is_offered)
           VALUES ($1, $2, $3, 1) ON CONFLICT DO NOTHING`,
          [program.college_id, majorId, program.program_name]
        );
        mappedCount++;
      } else {
        unmappedCount++;
        unmappedPrograms.add(program.program_name);
      }
    }

    // Get final count
    const finalCount = parseInt((await pool.query('SELECT COUNT(*) as count FROM college_majors_offered')).rows[0].count);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 POPULATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully mapped: ${mappedCount} program entries`);
    console.log(`❌ Unmapped programs: ${unmappedCount}`);
    console.log(`📈 Total unique college-major pairs: ${finalCount}`);
    
    if (unmappedPrograms.size > 0 && unmappedPrograms.size < 50) {
      console.log('\n⚠️  Unmapped program names:');
      Array.from(unmappedPrograms).sort().forEach(name => {
        console.log(`   - ${name}`);
      });
    } else if (unmappedPrograms.size >= 50) {
      console.log(`\n⚠️  ${unmappedPrograms.size} unique unmapped program names (too many to list)`);
    }
    
    // Show some examples
    console.log('\n📋 Sample mappings for Duke University (ID 1686):');
    const dukeMajors = (await pool.query(`
      SELECT m.major_name, m.major_category, cmo.program_name
      FROM college_majors_offered cmo
      JOIN master_majors m ON cmo.major_id = m.id
      WHERE cmo.college_id = 1686
      ORDER BY m.major_category, m.major_name
      LIMIT 10
    `)).rows;
    
    if (dukeMajors.length > 0) {
      dukeMajors.forEach(major => {
        console.log(`   ${major.major_category}: ${major.major_name} (as "${major.program_name}")`);
      });
    } else {
      console.log('   No majors mapped for Duke University');
    }
    
    console.log('\n✅ Population complete!\n');
    
  } catch (error) {
    console.error('❌ Error populating college_majors_offered:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  populateMajorsMapping()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { populateMajorsMapping };
