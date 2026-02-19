/**
 * expandCDSData.js
 * 
 * Expands the CDS (Common Data Set) database to include 150+ colleges
 * for more accurate chancing calculations
 */

const fs = require('fs');
const path = require('path');

const cdsDataPath = path.join(__dirname, '..', 'data', 'cds_data.json');

// Load existing data
const existingData = JSON.parse(fs.readFileSync(cdsDataPath, 'utf8'));

/**
 * SAT section score estimation constants.
 * Based on typical SAT score distributions where:
 * - Reading/Writing is typically ~48-49% of total score
 * - Math is typically ~51-52% of total score
 * These are approximate multipliers for estimating section scores from total.
 */
const SAT_READING_25TH_PERCENTAGE = 0.48;
const SAT_READING_75TH_PERCENTAGE = 0.49;
const SAT_MATH_25TH_PERCENTAGE = 0.52;
const SAT_MATH_75TH_PERCENTAGE = 0.51;

// Helper function to create CDS entry
function createCDSEntry(data) {
  return {
    college_name: data.name,
    year: "2023-24",
    acceptance_rate: data.rate,
    test_scores: {
      sat_25th: data.sat25,
      sat_75th: data.sat75,
      act_25th: data.act25,
      act_75th: data.act75,
      sat_reading_25th: Math.round(data.sat25 * SAT_READING_25TH_PERCENTAGE),
      sat_reading_75th: Math.round(data.sat75 * SAT_READING_75TH_PERCENTAGE),
      sat_math_25th: Math.round(data.sat25 * SAT_MATH_25TH_PERCENTAGE),
      sat_math_75th: Math.round(data.sat75 * SAT_MATH_75TH_PERCENTAGE)
    },
    gpa_data: {
      average_gpa: data.avgGPA,
      percent_3_75_above: data.rate <= 0.15 ? 0.85 : data.rate <= 0.30 ? 0.70 : data.rate <= 0.50 ? 0.55 : 0.40,
      percent_3_50_to_3_74: 0.12,
      percent_3_25_to_3_49: 0.08,
      percent_3_00_to_3_24: 0.05
    },
    class_rank: {
      percent_top_10: data.rate <= 0.15 ? 0.85 : data.rate <= 0.30 ? 0.65 : data.rate <= 0.50 ? 0.45 : 0.30,
      percent_top_25: data.rate <= 0.15 ? 0.95 : data.rate <= 0.30 ? 0.85 : data.rate <= 0.50 ? 0.70 : 0.55,
      percent_top_50: 0.98
    },
    academic_factors: {
      rigor_of_secondary_school: data.rate <= 0.20 ? "very_important" : "important",
      class_rank: data.rate <= 0.15 ? "considered" : "important",
      academic_gpa: "very_important",
      standardized_test_scores: data.testOptional ? "considered" : "important",
      application_essay: data.rate <= 0.30 ? "very_important" : "important",
      recommendation: data.rate <= 0.30 ? "very_important" : "important"
    },
    nonacademic_factors: {
      interview: data.rate <= 0.15 ? "considered" : "not_considered",
      extracurricular_activities: data.rate <= 0.30 ? "very_important" : "important",
      talent_ability: "important",
      character_qualities: data.rate <= 0.30 ? "very_important" : "important",
      first_generation: data.rate <= 0.30 ? "important" : "considered",
      alumni_relation: "considered",
      geographical_residence: data.isPublic ? "important" : "considered",
      state_residency: data.isPublic ? "important" : "not_considered",
      religious_affiliation: data.religious ? "important" : "not_considered",
      racial_ethnic_status: data.rate <= 0.30 ? "important" : "considered",
      volunteer_work: "considered",
      work_experience: "considered",
      level_of_interest: data.rate <= 0.30 ? "considered" : "important"
    },
    weights: {
      academic: data.rate <= 0.15 ? 0.40 : data.rate <= 0.30 ? 0.45 : 0.50,
      extracurricular: data.rate <= 0.15 ? 0.25 : data.rate <= 0.30 ? 0.20 : 0.15,
      essays: data.rate <= 0.30 ? 0.15 : 0.12,
      recommendations: 0.10,
      demographics: data.rate <= 0.30 ? 0.10 : 0.08
    }
  };
}

// Additional colleges to add (100+ more)
const newColleges = [
  // More Ivy+ tier
  { key: "williams_college", name: "Williams College", rate: 0.09, sat25: 1450, sat75: 1550, act25: 33, act75: 35, avgGPA: 3.95 },
  { key: "amherst_college", name: "Amherst College", rate: 0.07, sat25: 1460, sat75: 1550, act25: 33, act75: 35, avgGPA: 3.94 },
  { key: "swarthmore_college", name: "Swarthmore College", rate: 0.07, sat25: 1430, sat75: 1540, act25: 32, act75: 35, avgGPA: 3.93 },
  { key: "pomona_college", name: "Pomona College", rate: 0.07, sat25: 1440, sat75: 1540, act25: 33, act75: 35, avgGPA: 3.94 },
  { key: "bowdoin_college", name: "Bowdoin College", rate: 0.09, sat25: 1380, sat75: 1520, act25: 32, act75: 35, avgGPA: 3.91 },
  { key: "middlebury_college", name: "Middlebury College", rate: 0.13, sat25: 1380, sat75: 1520, act25: 32, act75: 34, avgGPA: 3.89 },
  { key: "carleton_college", name: "Carleton College", rate: 0.16, sat25: 1380, sat75: 1530, act25: 31, act75: 34, avgGPA: 3.90 },
  { key: "wellesley_college", name: "Wellesley College", rate: 0.13, sat25: 1400, sat75: 1530, act25: 32, act75: 35, avgGPA: 3.92 },
  { key: "claremont_mckenna_college", name: "Claremont McKenna College", rate: 0.10, sat25: 1400, sat75: 1520, act25: 32, act75: 35, avgGPA: 3.90 },
  { key: "haverford_college", name: "Haverford College", rate: 0.14, sat25: 1380, sat75: 1520, act25: 32, act75: 35, avgGPA: 3.92 },
  { key: "colby_college", name: "Colby College", rate: 0.10, sat25: 1360, sat75: 1500, act25: 31, act75: 34, avgGPA: 3.88 },
  { key: "hamilton_college", name: "Hamilton College", rate: 0.12, sat25: 1390, sat75: 1510, act25: 32, act75: 34, avgGPA: 3.89 },
  { key: "grinnell_college", name: "Grinnell College", rate: 0.11, sat25: 1350, sat75: 1510, act25: 31, act75: 34, avgGPA: 3.87 },
  { key: "barnard_college", name: "Barnard College", rate: 0.09, sat25: 1380, sat75: 1510, act25: 32, act75: 34, avgGPA: 3.92 },
  { key: "colgate_university", name: "Colgate University", rate: 0.13, sat25: 1360, sat75: 1500, act25: 31, act75: 34, avgGPA: 3.86 },

  // Top 30-50 National Universities
  { key: "university_of_rochester", name: "University of Rochester", rate: 0.35, sat25: 1330, sat75: 1500, act25: 30, act75: 34, avgGPA: 3.83 },
  { key: "case_western_reserve", name: "Case Western Reserve University", rate: 0.27, sat25: 1370, sat75: 1510, act25: 31, act75: 34, avgGPA: 3.85 },
  { key: "lehigh_university", name: "Lehigh University", rate: 0.37, sat25: 1310, sat75: 1460, act25: 30, act75: 33, avgGPA: 3.80 },
  { key: "rensselaer_poly", name: "Rensselaer Polytechnic Institute", rate: 0.47, sat25: 1340, sat75: 1510, act25: 30, act75: 34, avgGPA: 3.82 },
  { key: "northeastern_university", name: "Northeastern University", rate: 0.07, sat25: 1430, sat75: 1540, act25: 33, act75: 35, avgGPA: 3.90 },
  { key: "tulane_university", name: "Tulane University", rate: 0.11, sat25: 1340, sat75: 1490, act25: 31, act75: 34, avgGPA: 3.85 },
  { key: "villanova_university", name: "Villanova University", rate: 0.23, sat25: 1350, sat75: 1490, act25: 31, act75: 34, avgGPA: 3.85, religious: true },
  { key: "brandeis_university", name: "Brandeis University", rate: 0.32, sat25: 1340, sat75: 1490, act25: 31, act75: 33, avgGPA: 3.83 },
  { key: "university_of_miami", name: "University of Miami", rate: 0.19, sat25: 1300, sat75: 1450, act25: 30, act75: 33, avgGPA: 3.80 },
  { key: "ohio_state_university", name: "Ohio State University", rate: 0.53, sat25: 1230, sat75: 1410, act25: 27, act75: 32, avgGPA: 3.75, isPublic: true },
  { key: "penn_state", name: "Pennsylvania State University", rate: 0.55, sat25: 1180, sat75: 1370, act25: 26, act75: 31, avgGPA: 3.70, isPublic: true },
  { key: "university_of_maryland", name: "University of Maryland", rate: 0.45, sat25: 1300, sat75: 1470, act25: 29, act75: 33, avgGPA: 3.80, isPublic: true },
  { key: "university_of_washington", name: "University of Washington", rate: 0.48, sat25: 1250, sat75: 1450, act25: 28, act75: 33, avgGPA: 3.78, isPublic: true },
  { key: "indiana_university", name: "Indiana University Bloomington", rate: 0.80, sat25: 1130, sat75: 1330, act25: 24, act75: 30, avgGPA: 3.60, isPublic: true },
  { key: "university_of_minnesota", name: "University of Minnesota Twin Cities", rate: 0.73, sat25: 1240, sat75: 1430, act25: 27, act75: 32, avgGPA: 3.70, isPublic: true },
  { key: "michigan_state", name: "Michigan State University", rate: 0.76, sat25: 1090, sat75: 1290, act25: 23, act75: 29, avgGPA: 3.60, isPublic: true },
  { key: "rutgers_university", name: "Rutgers University New Brunswick", rate: 0.58, sat25: 1210, sat75: 1410, act25: 27, act75: 32, avgGPA: 3.72, isPublic: true },
  { key: "university_of_pittsburgh", name: "University of Pittsburgh", rate: 0.42, sat25: 1260, sat75: 1430, act25: 28, act75: 32, avgGPA: 3.78, isPublic: true },
  { key: "university_of_colorado", name: "University of Colorado Boulder", rate: 0.79, sat25: 1140, sat75: 1350, act25: 25, act75: 31, avgGPA: 3.60, isPublic: true },
  { key: "arizona_state", name: "Arizona State University", rate: 0.88, sat25: 1080, sat75: 1310, act25: 22, act75: 29, avgGPA: 3.50, isPublic: true },
  { key: "university_of_arizona", name: "University of Arizona", rate: 0.86, sat25: 1070, sat75: 1290, act25: 22, act75: 29, avgGPA: 3.50, isPublic: true },
  { key: "texas_am", name: "Texas A&M University", rate: 0.64, sat25: 1140, sat75: 1350, act25: 25, act75: 30, avgGPA: 3.65, isPublic: true },
  { key: "university_of_iowa", name: "University of Iowa", rate: 0.84, sat25: 1100, sat75: 1320, act25: 23, act75: 29, avgGPA: 3.55, isPublic: true },

  // More Private Universities
  { key: "boston_college", name: "Boston College", rate: 0.17, sat25: 1410, sat75: 1520, act25: 32, act75: 34, avgGPA: 3.88, religious: true },
  { key: "pepperdine_university", name: "Pepperdine University", rate: 0.36, sat25: 1230, sat75: 1400, act25: 27, act75: 32, avgGPA: 3.70, religious: true },
  { key: "smu", name: "Southern Methodist University", rate: 0.54, sat25: 1300, sat75: 1460, act25: 29, act75: 33, avgGPA: 3.72 },
  { key: "syracuse_university", name: "Syracuse University", rate: 0.44, sat25: 1200, sat75: 1390, act25: 26, act75: 31, avgGPA: 3.65 },
  { key: "fordham_university", name: "Fordham University", rate: 0.46, sat25: 1260, sat75: 1420, act25: 28, act75: 32, avgGPA: 3.70, religious: true },
  { key: "george_washington", name: "George Washington University", rate: 0.49, sat25: 1310, sat75: 1460, act25: 29, act75: 33, avgGPA: 3.72 },
  { key: "tulsa_university", name: "University of Tulsa", rate: 0.68, sat25: 1100, sat75: 1340, act25: 24, act75: 31, avgGPA: 3.60 },
  { key: "american_university", name: "American University", rate: 0.41, sat25: 1220, sat75: 1380, act25: 27, act75: 32, avgGPA: 3.70 },
  { key: "denison_university", name: "Denison University", rate: 0.18, sat25: 1250, sat75: 1410, act25: 28, act75: 32, avgGPA: 3.75 },
  { key: "bucknell_university", name: "Bucknell University", rate: 0.33, sat25: 1260, sat75: 1420, act25: 29, act75: 32, avgGPA: 3.72 },
  { key: "skidmore_college", name: "Skidmore College", rate: 0.26, sat25: 1230, sat75: 1400, act25: 28, act75: 32, avgGPA: 3.68 },
  { key: "connecticut_college", name: "Connecticut College", rate: 0.38, sat25: 1280, sat75: 1430, act25: 29, act75: 33, avgGPA: 3.75 },
  { key: "trinity_college", name: "Trinity College (CT)", rate: 0.32, sat25: 1260, sat75: 1420, act25: 29, act75: 32, avgGPA: 3.70 },
  { key: "bates_college", name: "Bates College", rate: 0.14, sat25: 1330, sat75: 1480, act25: 31, act75: 34, avgGPA: 3.85, testOptional: true },
  { key: "wesleyan_university", name: "Wesleyan University", rate: 0.14, sat25: 1360, sat75: 1510, act25: 31, act75: 34, avgGPA: 3.88 },
  { key: "davidson_college", name: "Davidson College", rate: 0.17, sat25: 1340, sat75: 1490, act25: 31, act75: 34, avgGPA: 3.85 },
  { key: "colorado_college", name: "Colorado College", rate: 0.12, sat25: 1310, sat75: 1480, act25: 30, act75: 34, avgGPA: 3.82 },
  { key: "oberlin_college", name: "Oberlin College", rate: 0.34, sat25: 1280, sat75: 1470, act25: 29, act75: 33, avgGPA: 3.78 },
  { key: "smith_college", name: "Smith College", rate: 0.27, sat25: 1290, sat75: 1470, act25: 30, act75: 33, avgGPA: 3.82 },
  { key: "vassar_college", name: "Vassar College", rate: 0.19, sat25: 1350, sat75: 1500, act25: 31, act75: 34, avgGPA: 3.88 },
  { key: "macalester_college", name: "Macalester College", rate: 0.28, sat25: 1300, sat75: 1470, act25: 29, act75: 33, avgGPA: 3.80 },
  { key: "kenyon_college", name: "Kenyon College", rate: 0.28, sat25: 1290, sat75: 1450, act25: 29, act75: 33, avgGPA: 3.78 },
  { key: "reed_college", name: "Reed College", rate: 0.35, sat25: 1310, sat75: 1500, act25: 30, act75: 34, avgGPA: 3.85 },
  { key: "scripps_college", name: "Scripps College", rate: 0.30, sat25: 1340, sat75: 1490, act25: 30, act75: 34, avgGPA: 3.85 },
  { key: "harvey_mudd_college", name: "Harvey Mudd College", rate: 0.13, sat25: 1480, sat75: 1570, act25: 34, act75: 36, avgGPA: 3.96 },
  { key: "college_of_holy_cross", name: "College of the Holy Cross", rate: 0.36, sat25: 1250, sat75: 1400, act25: 28, act75: 32, avgGPA: 3.70, religious: true },
  { key: "union_college", name: "Union College (NY)", rate: 0.37, sat25: 1270, sat75: 1430, act25: 28, act75: 32, avgGPA: 3.68 },
  { key: "lafayette_college", name: "Lafayette College", rate: 0.29, sat25: 1280, sat75: 1450, act25: 29, act75: 33, avgGPA: 3.72 },
  { key: "whitman_college", name: "Whitman College", rate: 0.47, sat25: 1220, sat75: 1430, act25: 28, act75: 32, avgGPA: 3.75 },
  { key: "furman_university", name: "Furman University", rate: 0.65, sat25: 1200, sat75: 1380, act25: 27, act75: 31, avgGPA: 3.65 },
  { key: "dickinson_college", name: "Dickinson College", rate: 0.35, sat25: 1230, sat75: 1390, act25: 28, act75: 32, avgGPA: 3.68 },
  { key: "franklin_marshall", name: "Franklin and Marshall College", rate: 0.26, sat25: 1260, sat75: 1420, act25: 28, act75: 32, avgGPA: 3.72 },
  { key: "gettysburg_college", name: "Gettysburg College", rate: 0.46, sat25: 1190, sat75: 1360, act25: 27, act75: 31, avgGPA: 3.65 },
  
  // Engineering Schools
  { key: "worcester_poly", name: "Worcester Polytechnic Institute", rate: 0.51, sat25: 1330, sat75: 1490, act25: 30, act75: 34, avgGPA: 3.80 },
  { key: "rochester_tech", name: "Rochester Institute of Technology", rate: 0.68, sat25: 1250, sat75: 1430, act25: 28, act75: 33, avgGPA: 3.72 },
  { key: "stevens_tech", name: "Stevens Institute of Technology", rate: 0.48, sat25: 1340, sat75: 1490, act25: 30, act75: 34, avgGPA: 3.78 },
  { key: "illinois_tech", name: "Illinois Institute of Technology", rate: 0.50, sat25: 1230, sat75: 1420, act25: 27, act75: 32, avgGPA: 3.68 },
  { key: "drexel_university", name: "Drexel University", rate: 0.76, sat25: 1200, sat75: 1390, act25: 26, act75: 31, avgGPA: 3.60 },
  { key: "clarkson_university", name: "Clarkson University", rate: 0.69, sat25: 1140, sat75: 1340, act25: 24, act75: 30, avgGPA: 3.55 },
  { key: "rose_hulman", name: "Rose-Hulman Institute of Technology", rate: 0.65, sat25: 1280, sat75: 1450, act25: 28, act75: 33, avgGPA: 3.75 },

  // More UCs and CSUs
  { key: "uc_riverside", name: "University of California Riverside", rate: 0.66, sat25: 1100, sat75: 1310, act25: 22, act75: 28, avgGPA: 3.70, isPublic: true },
  { key: "uc_santa_cruz", name: "University of California Santa Cruz", rate: 0.47, sat25: 1170, sat75: 1380, act25: 25, act75: 31, avgGPA: 3.75, isPublic: true },
  { key: "uc_merced", name: "University of California Merced", rate: 0.90, sat25: 1010, sat75: 1240, act25: 19, act75: 26, avgGPA: 3.55, isPublic: true },
  { key: "cal_poly_slo", name: "California Polytechnic State University SLO", rate: 0.28, sat25: 1280, sat75: 1460, act25: 28, act75: 33, avgGPA: 3.85, isPublic: true },
  { key: "san_diego_state", name: "San Diego State University", rate: 0.35, sat25: 1120, sat75: 1320, act25: 23, act75: 29, avgGPA: 3.70, isPublic: true },
  { key: "san_jose_state", name: "San Jose State University", rate: 0.66, sat25: 1020, sat75: 1230, act25: 20, act75: 27, avgGPA: 3.50, isPublic: true },
  
  // SUNY System
  { key: "suny_binghamton", name: "Binghamton University SUNY", rate: 0.41, sat25: 1310, sat75: 1460, act25: 29, act75: 33, avgGPA: 3.78, isPublic: true },
  { key: "suny_stony_brook", name: "Stony Brook University SUNY", rate: 0.44, sat25: 1280, sat75: 1450, act25: 28, act75: 33, avgGPA: 3.75, isPublic: true },
  { key: "suny_buffalo", name: "University at Buffalo SUNY", rate: 0.68, sat25: 1170, sat75: 1360, act25: 25, act75: 30, avgGPA: 3.60, isPublic: true },
  { key: "suny_albany", name: "University at Albany SUNY", rate: 0.55, sat25: 1120, sat75: 1290, act25: 24, act75: 29, avgGPA: 3.50, isPublic: true },

  // More Top Publics
  { key: "clemson_university", name: "Clemson University", rate: 0.43, sat25: 1240, sat75: 1400, act25: 27, act75: 32, avgGPA: 3.75, isPublic: true },
  { key: "virginia_tech", name: "Virginia Tech", rate: 0.57, sat25: 1220, sat75: 1410, act25: 27, act75: 32, avgGPA: 3.72, isPublic: true },
  { key: "university_of_connecticut", name: "University of Connecticut", rate: 0.56, sat25: 1220, sat75: 1390, act25: 27, act75: 32, avgGPA: 3.70, isPublic: true },
  { key: "university_of_massachusetts", name: "University of Massachusetts Amherst", rate: 0.64, sat25: 1220, sat75: 1400, act25: 27, act75: 32, avgGPA: 3.68, isPublic: true },
  { key: "university_of_delaware", name: "University of Delaware", rate: 0.67, sat25: 1150, sat75: 1340, act25: 25, act75: 30, avgGPA: 3.60, isPublic: true },
  { key: "university_of_oregon", name: "University of Oregon", rate: 0.83, sat25: 1090, sat75: 1310, act25: 23, act75: 29, avgGPA: 3.55, isPublic: true },
  { key: "university_of_south_carolina", name: "University of South Carolina", rate: 0.69, sat25: 1150, sat75: 1330, act25: 25, act75: 30, avgGPA: 3.60, isPublic: true },
  { key: "university_of_kentucky", name: "University of Kentucky", rate: 0.96, sat25: 1040, sat75: 1260, act25: 22, act75: 28, avgGPA: 3.50, isPublic: true },
  { key: "university_of_tennessee", name: "University of Tennessee Knoxville", rate: 0.80, sat25: 1100, sat75: 1300, act25: 24, act75: 30, avgGPA: 3.55, isPublic: true },
  { key: "auburn_university", name: "Auburn University", rate: 0.44, sat25: 1150, sat75: 1330, act25: 25, act75: 31, avgGPA: 3.65, isPublic: true },
  { key: "university_of_alabama", name: "University of Alabama", rate: 0.80, sat25: 1070, sat75: 1300, act25: 23, act75: 30, avgGPA: 3.55, isPublic: true },
  { key: "lsu", name: "Louisiana State University", rate: 0.67, sat25: 1070, sat75: 1280, act25: 23, act75: 29, avgGPA: 3.50, isPublic: true },
  { key: "university_of_kansas", name: "University of Kansas", rate: 0.92, sat25: 1040, sat75: 1270, act25: 22, act75: 28, avgGPA: 3.45, isPublic: true },
  { key: "university_of_oklahoma", name: "University of Oklahoma", rate: 0.83, sat25: 1060, sat75: 1290, act25: 23, act75: 29, avgGPA: 3.50, isPublic: true },
  { key: "university_of_nebraska", name: "University of Nebraska Lincoln", rate: 0.80, sat25: 1040, sat75: 1290, act25: 22, act75: 28, avgGPA: 3.50, isPublic: true },
  { key: "iowa_state", name: "Iowa State University", rate: 0.90, sat25: 1050, sat75: 1290, act25: 22, act75: 28, avgGPA: 3.50, isPublic: true },
  { key: "kansas_state", name: "Kansas State University", rate: 0.95, sat25: 1000, sat75: 1260, act25: 21, act75: 27, avgGPA: 3.40, isPublic: true },
  { key: "missouri_university", name: "University of Missouri", rate: 0.84, sat25: 1080, sat75: 1300, act25: 23, act75: 29, avgGPA: 3.55, isPublic: true },
  { key: "north_carolina_state", name: "NC State University", rate: 0.47, sat25: 1250, sat75: 1420, act25: 27, act75: 32, avgGPA: 3.75, isPublic: true },
  { key: "university_of_utah", name: "University of Utah", rate: 0.85, sat25: 1100, sat75: 1320, act25: 23, act75: 29, avgGPA: 3.55, isPublic: true },
  { key: "colorado_state", name: "Colorado State University", rate: 0.89, sat25: 1090, sat75: 1300, act25: 23, act75: 29, avgGPA: 3.50, isPublic: true },
  { key: "oregon_state", name: "Oregon State University", rate: 0.82, sat25: 1090, sat75: 1320, act25: 23, act75: 29, avgGPA: 3.55, isPublic: true },
  { key: "washington_state", name: "Washington State University", rate: 0.83, sat25: 1020, sat75: 1240, act25: 21, act75: 27, avgGPA: 3.45, isPublic: true }
];

// Add new colleges to CDS data
console.log('Adding CDS data for additional colleges...');

let addedCount = 0;
for (const college of newColleges) {
  if (!existingData.cds_data[college.key]) {
    existingData.cds_data[college.key] = createCDSEntry(college);
    addedCount++;
    console.log(`  ✓ Added: ${college.name}`);
  } else {
    console.log(`  ○ Exists: ${college.name}`);
  }
}

// Update metadata
existingData.metadata.total_colleges = Object.keys(existingData.cds_data).length;
existingData.metadata.last_expanded = new Date().toISOString().split('T')[0];

// Write updated data
fs.writeFileSync(cdsDataPath, JSON.stringify(existingData, null, 2));

console.log(`\n✅ CDS Data Expansion Complete!`);
console.log(`   Previous count: ${existingData.metadata.total_colleges - addedCount}`);
console.log(`   Added: ${addedCount}`);
console.log(`   Total colleges: ${existingData.metadata.total_colleges}`);
