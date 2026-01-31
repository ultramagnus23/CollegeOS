const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'colleges.db');
const db = new Database(dbPath);

// Get comprehensive college data with all related tables
const colleges = db.prepare(`
  SELECT 
    c.*,
    ca.acceptance_rate,
    ca.early_decision_rate,
    ca.yield_rate,
    ca.application_volume,
    ca.test_optional_flag,
    s.gpa_25, s.gpa_50, s.gpa_75,
    s.sat_25, s.sat_50, s.sat_75,
    s.act_25, s.act_50, s.act_75,
    ao.graduation_rate_4yr,
    ao.graduation_rate_6yr,
    ao.retention_rate,
    ao.employment_rate,
    ao.median_start_salary,
    fd.tuition_in_state,
    fd.tuition_out_state,
    fd.tuition_international,
    fd.cost_of_attendance,
    fd.avg_financial_aid,
    fd.percent_receiving_aid,
    fd.need_blind_flag,
    cl.housing_guarantee,
    cl.campus_safety_score,
    cl.athletics_division,
    cl.club_count,
    cr.national_rank,
    cr.global_rank,
    cr.ranking_body
  FROM colleges_comprehensive c
  LEFT JOIN college_admissions ca ON c.id = ca.college_id
  LEFT JOIN admitted_student_stats s ON c.id = s.college_id
  LEFT JOIN academic_outcomes ao ON c.id = ao.college_id
  LEFT JOIN college_financial_data fd ON c.id = fd.college_id
  LEFT JOIN campus_life cl ON c.id = cl.college_id
  LEFT JOIN college_rankings cr ON c.id = cr.college_id
  ORDER BY c.name
`).all();

// Get programs/majors for each college
const programs = db.prepare(`
  SELECT college_id, program_name, degree_type, enrollment
  FROM college_programs
`).all();

// Group programs by college
const programsByCollege = {};
programs.forEach(p => {
  if (!programsByCollege[p.college_id]) {
    programsByCollege[p.college_id] = [];
  }
  programsByCollege[p.college_id].push({
    name: p.program_name,
    degree: p.degree_type,
    enrollment: p.enrollment
  });
});

// Add programs to colleges
colleges.forEach(c => {
  c.programs = programsByCollege[c.id] || [];
});

// Export full comprehensive data
const exportPath = path.join(__dirname, '..', 'data', 'comprehensive_colleges_export.json');
fs.writeFileSync(exportPath, JSON.stringify(colleges, null, 2));

console.log('=== COMPREHENSIVE COLLEGE DATA EXPORT ===');
console.log('Total colleges:', colleges.length);
console.log('Total programs:', programs.length);
console.log('\nData completeness:');

const stats = {
  withAcceptanceRate: colleges.filter(c => c.acceptance_rate).length,
  withGPA: colleges.filter(c => c.gpa_50).length,
  withSAT: colleges.filter(c => c.sat_50).length,
  withTuition: colleges.filter(c => c.tuition_out_state).length,
  withGradRate: colleges.filter(c => c.graduation_rate_4yr).length,
  withRankings: colleges.filter(c => c.national_rank || c.global_rank).length,
  withPrograms: colleges.filter(c => c.programs.length > 0).length
};

Object.entries(stats).forEach(([key, value]) => {
  const pct = ((value / colleges.length) * 100).toFixed(1);
  console.log(`  ${key}: ${value} (${pct}%)`);
});

console.log(`\nExported to: ${exportPath}`);
console.log(`File size: ${(fs.statSync(exportPath).size / 1024 / 1024).toFixed(2)} MB`);

db.close();
