const fs = require('fs');
const path = require('path');
const dbManager = require('../src/config/database');
const logger = require('../src/utils/logger');

logger.info('Starting database seeding...');

try {
  const db = dbManager.initialize();
  
  // Read seed data
  const seedPath = path.join(__dirname, '../seeds/core_colleges.json');
  
  if (!fs.existsSync(seedPath)) {
    logger.warn('Seed file not found. Creating sample data...');
    
    // Create sample colleges
    const sampleColleges = [
      {
        name: 'Harvard University',
        country: 'USA',
        officialWebsite: 'https://www.harvard.edu',
        admissionsUrl: 'https://college.harvard.edu/admissions',
        programsUrl: 'https://www.harvard.edu/programs',
        academicStrengths: ['STEM', 'Business', 'Law', 'Medicine'],
        majorCategories: ['Computer Science', 'Economics', 'Engineering', 'Biology']
      },
      {
        name: 'University of Oxford',
        country: 'UK',
        officialWebsite: 'https://www.ox.ac.uk',
        admissionsUrl: 'https://www.ox.ac.uk/admissions',
        programsUrl: 'https://www.ox.ac.uk/admissions/undergraduate/courses',
        academicStrengths: ['Humanities', 'Sciences', 'Medicine'],
        majorCategories: ['PPE', 'Medicine', 'Engineering', 'Computer Science']
      },
      {
        name: 'National University of Singapore',
        country: 'Singapore',
        officialWebsite: 'https://www.nus.edu.sg',
        admissionsUrl: 'https://www.nus.edu.sg/oam/apply-to-nus',
        programsUrl: 'https://www.nus.edu.sg/programmes',
        academicStrengths: ['Engineering', 'Computer Science', 'Business'],
        majorCategories: ['Computer Science', 'Engineering', 'Business', 'Medicine']
      },
      {
        name: 'University of Melbourne',
        country: 'Australia',
        officialWebsite: 'https://www.unimelb.edu.au',
        admissionsUrl: 'https://study.unimelb.edu.au/how-to-apply',
        programsUrl: 'https://study.unimelb.edu.au/find',
        academicStrengths: ['Sciences', 'Arts', 'Medicine', 'Engineering'],
        majorCategories: ['Medicine', 'Engineering', 'Arts', 'Commerce']
      },
      {
        name: 'Tsinghua University',
        country: 'China',
        officialWebsite: 'https://www.tsinghua.edu.cn/en',
        admissionsUrl: 'https://www.tsinghua.edu.cn/en/Admissions.htm',
        programsUrl: 'https://www.tsinghua.edu.cn/en/Academics.htm',
        academicStrengths: ['Engineering', 'Computer Science', 'Sciences'],
        majorCategories: ['Computer Science', 'Engineering', 'Physics', 'Economics']
      }
    ];
    
    const stmt = db.prepare(`
      INSERT INTO colleges (
        name, country, official_website, admissions_url, programs_url,
        academic_strengths, major_categories, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    
    sampleColleges.forEach(college => {
      stmt.run(
        college.name,
        college.country,
        college.officialWebsite,
        college.admissionsUrl,
        college.programsUrl,
        JSON.stringify(college.academicStrengths),
        JSON.stringify(college.majorCategories)
      );
    });
    
    logger.info(`Seeded ${sampleColleges.length} sample colleges`);
  }
  
  logger.info('Database seeding completed successfully');
  process.exit(0);
} catch (error) {
  logger.error('Seeding failed:', error);
  process.exit(1);
}