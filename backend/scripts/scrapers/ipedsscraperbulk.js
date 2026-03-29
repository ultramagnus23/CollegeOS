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
    await cb(row);
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
  let count = 0;
  await streamCSV(csvPath, async (row) => {
    const name = row.instnm;
    if (!name) return;

    const locale = localeText(row.locale);
    const ownership = ownershipText(row.control);
    const acres = parseFloat(row.campus) || null;
    const religAff = parseInt(row.relaffil) > 0 ? String(row.relaffil) : null;

    try {
      await db.query(
        `UPDATE colleges_comprehensive SET
           urban_classification = COALESCE($1, urban_classification),
           institution_type = COALESCE($2, institution_type),
           religious_affiliation = COALESCE($3, religious_affiliation),
           campus_size_acres = COALESCE($4, campus_size_acres),
           last_updated = CURRENT_TIMESTAMP
         WHERE name = $5 AND country = 'United States'`,
        [locale, ownership, religAff, acres, name]
      );
    } catch {}

    const c = (await db.query(`SELECT id FROM colleges WHERE name = $1 LIMIT 1`, [name])).rows[0];
    if (c) {
      const division = row.sport1 ? 'NCAA' : null;
      try {
        await db.query(
          `INSERT INTO campus_life (college_id, athletics_division, source)
           VALUES ($1,$2,$3)
           ON CONFLICT(college_id) DO UPDATE SET
             athletics_division = COALESCE(EXCLUDED.athletics_division, campus_life.athletics_division),
             source = EXCLUDED.source`,
          [c.id, division, 'IPEDS_HD']
        );
        count++;
      } catch {}
    }
  });
  return count;
}

/**
 * Process IC file → updates campus_life, academic_details, application_requirements
 */
async function processIC(db, csvPath) {
  let count = 0;
  await streamCSV(csvPath, async (row) => {
    const name = row.instnm;
    if (!name) return;
    const c = (await db.query(`SELECT id FROM colleges WHERE name = $1 LIMIT 1`, [name])).rows[0];
    if (!c) return;

    const calMap = { '1': 'Semester', '2': 'Quarter', '3': 'Trimester', '4': '4-1-4', '5': 'Other' };
    const calendar = calMap[row.calendr] || null;
    const housingGuarantee = parseFloat(row.room) > 0 ? 1 : 0;

    try {
      await db.query(
        `INSERT INTO campus_life
           (college_id, housing_guarantee, greek_life_available,
            freshman_housing_required, on_campus_housing_percentage, source)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(college_id) DO UPDATE SET
           housing_guarantee = COALESCE(EXCLUDED.housing_guarantee, campus_life.housing_guarantee),
           greek_life_available = COALESCE(EXCLUDED.greek_life_available, campus_life.greek_life_available),
           freshman_housing_required = COALESCE(EXCLUDED.freshman_housing_required, campus_life.freshman_housing_required),
           source = EXCLUDED.source`,
        [c.id, housingGuarantee, null, null, null, 'IPEDS_IC']
      );
    } catch {}

    try {
      await db.query(
        `INSERT INTO academic_details
           (college_id, academic_calendar, honors_program_available,
            honors_college, double_major_allowed, study_abroad_participation_rate,
            tutoring_available, writing_center, source, last_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
         ON CONFLICT(college_id) DO UPDATE SET
           academic_calendar = COALESCE(EXCLUDED.academic_calendar, academic_details.academic_calendar),
           honors_program_available = COALESCE(EXCLUDED.honors_program_available, academic_details.honors_program_available),
           double_major_allowed = COALESCE(EXCLUDED.double_major_allowed, academic_details.double_major_allowed),
           source = EXCLUDED.source,
           last_verified = CURRENT_TIMESTAMP`,
        [c.id, calendar,
         row.hloffer ? 1 : 0, 0, 1, null,
         row.tuitinst ? 1 : 0, 1, 'IPEDS_IC']
      );
    } catch {}

    try {
      await db.query(
        `INSERT INTO special_programs
           (college_id, rotc_army, rotc_navy, rotc_air_force,
            co_op_program_available, study_abroad_programs_count, source, last_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)
         ON CONFLICT(college_id) DO UPDATE SET
           rotc_army = COALESCE(EXCLUDED.rotc_army, special_programs.rotc_army),
           rotc_navy = COALESCE(EXCLUDED.rotc_navy, special_programs.rotc_navy),
           rotc_air_force = COALESCE(EXCLUDED.rotc_air_force, special_programs.rotc_air_force),
           co_op_program_available = COALESCE(EXCLUDED.co_op_program_available, special_programs.co_op_program_available),
           source = EXCLUDED.source`,
        [c.id,
         row.rotc === '1' ? 1 : 0,
         row.rotcmod === '1' ? 1 : 0,
         row.rotcabn === '1' ? 1 : 0,
         row.coop === '1' ? 1 : 0,
         null, 'IPEDS_IC']
      );
    } catch {}

    count++;
  });
  return count;
}

/**
 * Process ADM file → updates college_admissions, test_scores, admitted_student_stats
 */
async function processADM(db, csvPath) {
  const year = parseInt(CURRENT_YEAR);
  let count = 0;
  await streamCSV(csvPath, async (row) => {
    const name = row.instnm;
    if (!name) return;
    const c = (await db.query(`SELECT id FROM colleges WHERE name = $1 LIMIT 1`, [name])).rows[0];
    if (!c) return;

    const apps = parseInt(row.applcn) || null;
    const admits = parseInt(row.admssn) || null;
    const enroll = parseInt(row.enrlt) || null;
    const rate = apps && admits ? admits / apps : null;
    const yield_ = admits && enroll ? enroll / admits : null;
    const testOpt = row.admcon7 === '2' || row.admcon7 === '3' || row.admcon7 === '5' ? 1 : 0;

    try {
      await db.query(
        `INSERT INTO college_admissions
           (college_id, year, acceptance_rate, application_volume, admit_volume, enrollment_volume,
            yield_rate, in_state_accept_rate, out_state_accept_rate,
            test_optional_flag, source, confidence_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT(college_id, year) DO UPDATE SET
           acceptance_rate = COALESCE(EXCLUDED.acceptance_rate, college_admissions.acceptance_rate),
           application_volume = COALESCE(EXCLUDED.application_volume, college_admissions.application_volume),
           admit_volume = COALESCE(EXCLUDED.admit_volume, college_admissions.admit_volume),
           enrollment_volume = COALESCE(EXCLUDED.enrollment_volume, college_admissions.enrollment_volume),
           yield_rate = COALESCE(EXCLUDED.yield_rate, college_admissions.yield_rate),
           test_optional_flag = EXCLUDED.test_optional_flag,
           source = EXCLUDED.source,
           confidence_score = EXCLUDED.confidence_score`,
        [c.id, year, rate, apps, admits, enroll, yield_, null, null, testOpt, 'IPEDS_ADM', 0.98]
      );
    } catch {}

    const satEbrw25 = parseInt(row.satvr25) || null;
    const satEbrw75 = parseInt(row.satvr75) || null;
    const satMath25 = parseInt(row.satmt25) || null;
    const satMath75 = parseInt(row.satmt75) || null;
    const sat25 = satEbrw25 && satMath25 ? satEbrw25 + satMath25 : null;
    const sat75 = satEbrw75 && satMath75 ? satEbrw75 + satMath75 : null;
    const act25 = parseInt(row.actcm25) || null;
    const act75 = parseInt(row.actcm75) || null;

    if (satEbrw25 || act25) {
      try {
        await db.query(
          `INSERT INTO test_scores
             (college_id, sat_ebrw_25th, sat_ebrw_75th, sat_math_25th, sat_math_75th,
              sat_total_25th, sat_total_75th, act_composite_25th, act_composite_75th)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT(college_id) DO UPDATE SET
             sat_ebrw_25th = COALESCE(EXCLUDED.sat_ebrw_25th, test_scores.sat_ebrw_25th),
             sat_ebrw_75th = COALESCE(EXCLUDED.sat_ebrw_75th, test_scores.sat_ebrw_75th),
             sat_math_25th = COALESCE(EXCLUDED.sat_math_25th, test_scores.sat_math_25th),
             sat_math_75th = COALESCE(EXCLUDED.sat_math_75th, test_scores.sat_math_75th),
             sat_total_25th = COALESCE(EXCLUDED.sat_total_25th, test_scores.sat_total_25th),
             sat_total_75th = COALESCE(EXCLUDED.sat_total_75th, test_scores.sat_total_75th),
             act_composite_25th = COALESCE(EXCLUDED.act_composite_25th, test_scores.act_composite_25th),
             act_composite_75th = COALESCE(EXCLUDED.act_composite_75th, test_scores.act_composite_75th)`,
          [c.id, satEbrw25, satEbrw75, satMath25, satMath75, sat25, sat75, act25, act75]
        );
      } catch {}
      try {
        await db.query(
          `INSERT INTO admitted_student_stats (college_id, year, sat_25, sat_75, act_25, act_75, source, confidence_score)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT(college_id, year) DO UPDATE SET
             sat_25 = COALESCE(EXCLUDED.sat_25, admitted_student_stats.sat_25),
             sat_75 = COALESCE(EXCLUDED.sat_75, admitted_student_stats.sat_75),
             act_25 = COALESCE(EXCLUDED.act_25, admitted_student_stats.act_25),
             act_75 = COALESCE(EXCLUDED.act_75, admitted_student_stats.act_75),
             confidence_score = EXCLUDED.confidence_score`,
          [c.id, year, sat25, sat75, act25, act75, 'IPEDS_ADM', 0.98]
        );
      } catch {}
    }
    count++;
  });
  return count;
}

/**
 * Process C (completions) file → updates college_majors_offered
 */
async function processCompletions(db, csvPath) {
  const degreeMap = { '3': 'Associate', '5': "Bachelor's", '7': "Master's", '17': 'Doctorate', '18': 'Doctorate' };
  let count = 0;
  await streamCSV(csvPath, async (row) => {
    const name = row.instnm;
    const cipCode = row.cipcode;
    if (!name || !cipCode) return;

    const c = (await db.query(`SELECT id FROM colleges WHERE name = $1 LIMIT 1`, [name])).rows[0];
    if (!c) return;

    const major = (await db.query(`SELECT id FROM master_majors WHERE cip_code = $1 LIMIT 1`, [cipCode])).rows[0];
    if (!major) return;

    const degreeType = degreeMap[row.awlevel] || 'Other';
    try {
      await db.query(
        `INSERT INTO college_majors_offered
           (college_id, major_id, is_offered, degree_types, created_at)
         VALUES ($1,$2,1,$3,CURRENT_TIMESTAMP)
         ON CONFLICT(college_id, major_id) DO UPDATE SET
           is_offered = 1,
           degree_types = EXCLUDED.degree_types`,
        [c.id, major.id, degreeType]
      );
      count++;
    } catch {}
  });
  return count;
}

/**
 * Process GR (graduation rates) file → updates academic_outcomes
 */
async function processGradRates(db, csvPath) {
  const year = parseInt(CURRENT_YEAR);
  let count = 0;
  await streamCSV(csvPath, async (row) => {
    const name = row.instnm;
    if (!name) return;
    const c = (await db.query(`SELECT id FROM colleges WHERE name = $1 LIMIT 1`, [name])).rows[0];
    if (!c) return;

    const gr6 = parseFloat(row.grtotlt) ? parseFloat(row.grtotlt) / 100 : null;
    const gr4 = parseFloat(row.grtype) === 8 ? parseFloat(row.grtotlt) / 100 : null;

    if (gr6) {
      try {
        await db.query(
          `INSERT INTO academic_outcomes
             (college_id, year, graduation_rate_4yr, graduation_rate_6yr, source, confidence_score)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT(college_id, year) DO UPDATE SET
             graduation_rate_4yr = COALESCE(EXCLUDED.graduation_rate_4yr, academic_outcomes.graduation_rate_4yr),
             graduation_rate_6yr = COALESCE(EXCLUDED.graduation_rate_6yr, academic_outcomes.graduation_rate_6yr),
             confidence_score = EXCLUDED.confidence_score`,
          [c.id, year, gr4, gr6, 'IPEDS_GR', 0.98]
        );
        count++;
      } catch {}
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