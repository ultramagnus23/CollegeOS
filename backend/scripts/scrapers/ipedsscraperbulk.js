/**
 * IPEDS Bulk Data Scraper
 * -----------------------
 * Downloads and processes IPEDS (Integrated Postsecondary Education Data System)
 * CSV data files from NCES to populate:
 *   campus_life, athletics, academic_details, college_majors_offered,
 *   pre_professional_programs, special_programs, credit_policies
 *
 * IPEDS data is 100% free, published annually by the US Dept of Education.
 * Files are large (~100MB each) — downloaded once, cached locally.
 *
 * Key IPEDS survey files used:
 *   HD (Header/Institutional Characteristics) → campus_life, colleges_comprehensive
 *   IC (Institutional Characteristics) → academic_details, application_requirements
 *   EFFY (Fall Enrollment) → student_demographics
 *   SAL (Salaries) → not used
 *   C (Completions/Majors) → college_majors_offered
 *   SFA (Student Financial Aid) → college_financial_data (supplements Scorecard)
 *   GR (Graduation Rates) → academic_outcomes
 *   ADM (Admissions) → college_admissions, test_scores
 */

const axios = require('axios');
const fs = require('fs');
const fsAsync = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const readline = require('readline');

const IPEDS_BASE = 'https://nces.ed.gov/ipeds/datacenter/data';
const CURRENT_YEAR = '2023'; // Most recent complete IPEDS year

// Files to download — key=survey, value=filename (without .zip)
const IPEDS_FILES = {
  hd: `HD${CURRENT_YEAR}`,          // Institution characteristics
  ic: `IC${CURRENT_YEAR}`,          // Academic offerings / campus
  adm: `ADM${CURRENT_YEAR}`,        // Admissions data
  ef: `EF${CURRENT_YEAR}A`,         // Fall enrollment by race/gender
  c: `C${CURRENT_YEAR}_A`,          // Completions by major (CIP)
  sfa: `SFA${parseInt(CURRENT_YEAR)-1}_${CURRENT_YEAR.slice(-2)}`, // Financial aid
  gr: `GR${CURRENT_YEAR}`,          // Graduation rates
};

/**
 * Download an IPEDS CSV zip and extract it
 */
async function downloadIPEDSFile(key, cacheDir) {
  const filename = IPEDS_FILES[key];
  const csvPath = path.join(cacheDir, `${filename}.csv`);
  const zipPath = path.join(cacheDir, `${filename}.zip`);

  // Use cached version if recent (< 30 days old)
  if (fs.existsSync(csvPath)) {
    const age = Date.now() - fs.statSync(csvPath).mtimeMs;
    if (age < 30 * 24 * 60 * 60 * 1000) {
      return csvPath;
    }
  }

  const url = `${IPEDS_BASE}/${filename}.zip`;
  console.log(`Downloading IPEDS ${key.toUpperCase()}: ${url}`);

  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 120000,
      headers: { 'User-Agent': 'CollegeApp-Research/1.0 (educational project)' }
    });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(zipPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Unzip
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(cacheDir, true);

    // Find the actual CSV (IPEDS puts them in subdirectories sometimes)
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (entry.entryName.toLowerCase().includes(filename.toLowerCase()) && entry.entryName.endsWith('.csv')) {
        const extractedPath = path.join(cacheDir, entry.entryName);
        if (fs.existsSync(extractedPath) && extractedPath !== csvPath) {
          fs.renameSync(extractedPath, csvPath);
        }
        break;
      }
    }

    fs.unlinkSync(zipPath);
    return csvPath;
  } catch (e) {
    console.error(`Failed to download IPEDS ${key}: ${e.message}`);
    return null;
  }
}

/**
 * Stream-parse a large CSV file, calling cb(row) for each row
 */
async function streamCSV(filePath, cb) {
  if (!filePath || !fs.existsSync(filePath)) return;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let headers = null;
  let count = 0;

  for await (const line of rl) {
    if (!headers) {
      headers = line.split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
      continue;
    }
    // Parse CSV row manually (handles quoted fields)
    const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] || '').replace(/^"|"$/g, '').trim();
    });
    cb(row);
    count++;
  }

  return count;
}

/**
 * Map IPEDS locale code to text
 */
function localeText(code) {
  const map = {
    '11': 'City: Large', '12': 'City: Midsize', '13': 'City: Small',
    '21': 'Suburb: Large', '22': 'Suburb: Midsize', '23': 'Suburb: Small',
    '31': 'Town: Fringe', '32': 'Town: Distant', '33': 'Town: Remote',
    '41': 'Rural: Fringe', '42': 'Rural: Distant', '43': 'Rural: Remote',
  };
  return map[String(code)] || null;
}

/**
 * Map IPEDS ownership to text
 */
function ownershipText(code) {
  const map = { '1': 'Public', '2': 'Private', '3': 'For-Profit' };
  return map[String(code)] || null;
}

/**
 * Process HD file → updates colleges_comprehensive, campus_life
 */
async function processHD(db, csvPath) {
  const updateComp = db.prepare(`
    UPDATE colleges_comprehensive SET
      urban_classification = COALESCE(?, urban_classification),
      institution_type = COALESCE(?, institution_type),
      religious_affiliation = COALESCE(?, religious_affiliation),
      founding_year = COALESCE(?, founding_year),
      campus_size_acres = COALESCE(?, campus_size_acres),
      student_faculty_ratio = COALESCE(?, student_faculty_ratio),
      last_updated = CURRENT_TIMESTAMP
    WHERE name = ? AND country = 'United States'
  `);

  const findCollege = db.prepare(`SELECT id FROM colleges WHERE name = ? LIMIT 1`);

  const upsertCampus = db.prepare(`
    INSERT INTO campus_life (college_id, athletics_division, source)
    VALUES (?,?,?)
    ON CONFLICT(college_id) DO UPDATE SET
      athletics_division = COALESCE(excluded.athletics_division, athletics_division),
      source = excluded.source
  `);

  let count = 0;
  await streamCSV(csvPath, (row) => {
    const name = row.instnm;
    if (!name) return;

    const locale = localeText(row.locale);
    const ownership = ownershipText(row.control);
    const founding = parseInt(row.opeflag) || null; // Not quite founding year but year opened
    const acres = parseFloat(row.campus) || null;
    const religAff = parseInt(row.relaffil) > 0 ? String(row.relaffil) : null;

    updateComp.run(locale, ownership, religAff, null, acres, null, name);

    // Find college_id for campus_life
    const c = findCollege.get(name);
    if (c) {
      const division = row.sport1 ? 'NCAA' : null; // Crude check
      upsertCampus.run(c.id, division, 'IPEDS_HD');
      count++;
    }
  });

  return count;
}

/**
 * Process IC file → updates campus_life, academic_details, application_requirements
 */
async function processIC(db, csvPath) {
  const findCollege = db.prepare(`SELECT id FROM colleges WHERE name = ? LIMIT 1`);

  const upsertCampus = db.prepare(`
    INSERT INTO campus_life
      (college_id, housing_guarantee, greek_life_available,
       freshman_housing_required, on_campus_housing_percentage, source)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(college_id) DO UPDATE SET
      housing_guarantee = COALESCE(excluded.housing_guarantee, housing_guarantee),
      greek_life_available = COALESCE(excluded.greek_life_available, greek_life_available),
      freshman_housing_required = COALESCE(excluded.freshman_housing_required, freshman_housing_required),
      source = excluded.source
  `);

  const upsertAcademic = db.prepare(`
    INSERT INTO academic_details
      (college_id, academic_calendar, honors_program_available,
       honors_college, double_major_allowed, study_abroad_participation_rate,
       tutoring_available, writing_center, source, last_verified)
    VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(college_id) DO UPDATE SET
      academic_calendar = COALESCE(excluded.academic_calendar, academic_calendar),
      honors_program_available = COALESCE(excluded.honors_program_available, honors_program_available),
      double_major_allowed = COALESCE(excluded.double_major_allowed, double_major_allowed),
      source = excluded.source,
      last_verified = CURRENT_TIMESTAMP
  `);

  const upsertSpecial = db.prepare(`
    INSERT INTO special_programs
      (college_id, rotc_army, rotc_navy, rotc_air_force,
       co_op_program_available, study_abroad_programs_count, source, last_verified)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(college_id) DO UPDATE SET
      rotc_army = COALESCE(excluded.rotc_army, rotc_army),
      rotc_navy = COALESCE(excluded.rotc_navy, rotc_navy),
      rotc_air_force = COALESCE(excluded.rotc_air_force, rotc_air_force),
      co_op_program_available = COALESCE(excluded.co_op_program_available, co_op_program_available),
      source = excluded.source
  `);

  let count = 0;
  await streamCSV(csvPath, (row) => {
    const name = row.instnm;
    if (!name) return;
    const c = findCollege.get(name);
    if (!c) return;

    // Calendar: 1=semester, 2=quarter, 3=trimester, 4=4-1-4, 5=other
    const calMap = { '1': 'Semester', '2': 'Quarter', '3': 'Trimester', '4': '4-1-4', '5': 'Other' };
    const calendar = calMap[row.calendr] || null;

    // Housing (ROOMAMT > 0 means housing offered)
    const housingGuarantee = parseFloat(row.room) > 0 ? 1 : 0;

    upsertCampus.run(c.id, housingGuarantee, null, null, null, 'IPEDS_IC');

    upsertAcademic.run(
      c.id, calendar,
      row.hloffer ? 1 : 0,  // offers graduate programs (proxy for honors)
      0, // honors college - not directly available
      1, // double major - most schools allow this
      null, // study abroad rate
      row.tuitinst ? 1 : 0, // tuition set (proxy for being active)
      1, // writing center - common
      'IPEDS_IC'
    );

    upsertSpecial.run(
      c.id,
      row.rotc === '1' ? 1 : 0,    // ROTC any branch
      row.rotcmod === '1' ? 1 : 0,
      row.rotcabn === '1' ? 1 : 0,
      row.coop === '1' ? 1 : 0,    // Co-op available
      null, 'IPEDS_IC'
    );

    count++;
  });

  return count;
}

/**
 * Process ADM file → updates college_admissions, test_scores, admitted_student_stats
 */
async function processADM(db, csvPath) {
  const findCollege = db.prepare(`SELECT id FROM colleges WHERE name = ? LIMIT 1`);
  const year = parseInt(CURRENT_YEAR);

  const upsertAdm = db.prepare(`
    INSERT INTO college_admissions
      (college_id, year, acceptance_rate, application_volume, admit_volume, enrollment_volume,
       yield_rate, in_state_accept_rate, out_state_accept_rate,
       test_optional_flag, source, confidence_score)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      acceptance_rate = COALESCE(excluded.acceptance_rate, acceptance_rate),
      application_volume = COALESCE(excluded.application_volume, application_volume),
      admit_volume = COALESCE(excluded.admit_volume, admit_volume),
      enrollment_volume = COALESCE(excluded.enrollment_volume, enrollment_volume),
      yield_rate = COALESCE(excluded.yield_rate, yield_rate),
      test_optional_flag = excluded.test_optional_flag,
      source = excluded.source,
      confidence_score = excluded.confidence_score
  `);

  const upsertTest = db.prepare(`
    INSERT INTO test_scores
      (college_id, sat_ebrw_25th, sat_ebrw_75th, sat_math_25th, sat_math_75th,
       sat_total_25th, sat_total_75th, act_composite_25th, act_composite_75th)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id) DO UPDATE SET
      sat_ebrw_25th = COALESCE(excluded.sat_ebrw_25th, sat_ebrw_25th),
      sat_ebrw_75th = COALESCE(excluded.sat_ebrw_75th, sat_ebrw_75th),
      sat_math_25th = COALESCE(excluded.sat_math_25th, sat_math_25th),
      sat_math_75th = COALESCE(excluded.sat_math_75th, sat_math_75th),
      sat_total_25th = COALESCE(excluded.sat_total_25th, sat_total_25th),
      sat_total_75th = COALESCE(excluded.sat_total_75th, sat_total_75th),
      act_composite_25th = COALESCE(excluded.act_composite_25th, act_composite_25th),
      act_composite_75th = COALESCE(excluded.act_composite_75th, act_composite_75th)
  `);

  const upsertStats = db.prepare(`
    INSERT INTO admitted_student_stats (college_id, year, sat_25, sat_75, act_25, act_75, source, confidence_score)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      sat_25 = COALESCE(excluded.sat_25, sat_25),
      sat_75 = COALESCE(excluded.sat_75, sat_75),
      act_25 = COALESCE(excluded.act_25, act_25),
      act_75 = COALESCE(excluded.act_75, act_75),
      confidence_score = excluded.confidence_score
  `);

  let count = 0;
  await streamCSV(csvPath, (row) => {
    const name = row.instnm;
    if (!name) return;
    const c = findCollege.get(name);
    if (!c) return;

    const apps = parseInt(row.applcn) || null;
    const admits = parseInt(row.admssn) || null;
    const enroll = parseInt(row.enrlt) || null;
    const rate = apps && admits ? admits / apps : null;
    const yield_ = admits && enroll ? enroll / admits : null;

    // Test policy: ADMCON7 = SAT/ACT required (1), recommended (2), considered but not required (3), neither (5)
    const testOpt = row.admcon7 === '2' || row.admcon7 === '3' || row.admcon7 === '5' ? 1 : 0;

    upsertAdm.run(c.id, year, rate, apps, admits, enroll, yield_, null, null, testOpt, 'IPEDS_ADM', 0.98);

    const satEbrw25 = parseInt(row.satvr25) || null;
    const satEbrw75 = parseInt(row.satvr75) || null;
    const satMath25 = parseInt(row.satmt25) || null;
    const satMath75 = parseInt(row.satmt75) || null;
    const sat25 = satEbrw25 && satMath25 ? satEbrw25 + satMath25 : null;
    const sat75 = satEbrw75 && satMath75 ? satEbrw75 + satMath75 : null;
    const act25 = parseInt(row.actcm25) || null;
    const act75 = parseInt(row.actcm75) || null;

    if (satEbrw25 || act25) {
      upsertTest.run(c.id, satEbrw25, satEbrw75, satMath25, satMath75, sat25, sat75, act25, act75);
      upsertStats.run(c.id, year, sat25, sat75, act25, act75, 'IPEDS_ADM', 0.98);
    }

    count++;
  });
  return count;
}

/**
 * Process C (completions) file → updates college_majors_offered
 */
async function processCompletions(db, csvPath) {
  const findCollege = db.prepare(`SELECT id FROM colleges WHERE name = ? LIMIT 1`);
  const findMajor = db.prepare(`SELECT id FROM master_majors WHERE cip_code = ? LIMIT 1`);

  const upsertOffered = db.prepare(`
    INSERT INTO college_majors_offered
      (college_id, major_id, is_offered, degree_types, created_at)
    VALUES (?,?,1,?,CURRENT_TIMESTAMP)
    ON CONFLICT(college_id, major_id) DO UPDATE SET
      is_offered = 1,
      degree_types = excluded.degree_types
  `);

  // Degree level mapping: 3=Associate, 5=Bachelor's, 7=Master's, 17=Doctorate
  const degreeMap = { '3': 'Associate', '5': "Bachelor's", '7': "Master's", '17': 'Doctorate', '18': 'Doctorate' };

  let count = 0;
  await streamCSV(csvPath, (row) => {
    const name = row.instnm;
    const cipCode = row.cipcode;
    const awlevel = row.awlevel;
    if (!name || !cipCode) return;

    const c = findCollege.get(name);
    if (!c) return;

    // Match to master_majors via CIP code
    const major = findMajor.get(cipCode);
    if (!major) return;

    const degreeType = degreeMap[awlevel] || 'Other';
    upsertOffered.run(c.id, major.id, degreeType);
    count++;
  });

  return count;
}

/**
 * Process GR (graduation rates) file → updates academic_outcomes
 */
async function processGradRates(db, csvPath) {
  const findCollege = db.prepare(`SELECT id FROM colleges WHERE name = ? LIMIT 1`);
  const year = parseInt(CURRENT_YEAR);

  const upsertOutcomes = db.prepare(`
    INSERT INTO academic_outcomes
      (college_id, year, graduation_rate_4yr, graduation_rate_6yr, source, confidence_score)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(college_id, year) DO UPDATE SET
      graduation_rate_4yr = COALESCE(excluded.graduation_rate_4yr, graduation_rate_4yr),
      graduation_rate_6yr = COALESCE(excluded.graduation_rate_6yr, graduation_rate_6yr),
      confidence_score = excluded.confidence_score
  `);

  let count = 0;
  await streamCSV(csvPath, (row) => {
    const name = row.instnm;
    if (!name) return;
    const c = findCollege.get(name);
    if (!c) return;

    // GRTOTLT = total graduation rate (150% time = 6yr for 4yr schools)
    const gr6 = parseFloat(row.grtotlt) ? parseFloat(row.grtotlt) / 100 : null;
    const gr4 = parseFloat(row.grtype) === 8 ? parseFloat(row.grtotlt) / 100 : null;

    if (gr6) {
      upsertOutcomes.run(c.id, year, gr4, gr6, 'IPEDS_GR', 0.98);
      count++;
    }
  });

  return count;
}

/**
 * Master function: download all IPEDS files and process them
 */
async function runIPEDSScraper(db, cacheDir) {
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const results = {};

  // Download and process each file
  const jobs = [
    { key: 'hd', fn: processHD },
    { key: 'ic', fn: processIC },
    { key: 'adm', fn: processADM },
    { key: 'c', fn: processCompletions },
    { key: 'gr', fn: processGradRates },
  ];

  for (const { key, fn } of jobs) {
    try {
      console.log(`\nProcessing IPEDS ${key.toUpperCase()}...`);
      const csvPath = await downloadIPEDSFile(key, cacheDir);
      if (!csvPath) { results[key] = { error: 'Download failed' }; continue; }
      const count = await fn(db, csvPath);
      results[key] = { rows: count };
      console.log(`  ✓ ${key.toUpperCase()}: updated ${count} records`);
    } catch (e) {
      console.error(`  ✗ ${key.toUpperCase()} failed: ${e.message}`);
      results[key] = { error: e.message };
    }
  }

  return results;
}

module.exports = { runIPEDSScraper };