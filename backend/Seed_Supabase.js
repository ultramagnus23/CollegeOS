// seed_supabase.js — place in backend/ folder
// Run: node seed_supabase.js
// Set DATABASE_URL env var to your Supabase connection string first

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = "postgresql://postgres:HRH2RkXxheHpq82U@db.vjxlpkqpwlgkdzheummp.supabase.co:5432/postgres"; // REPLACE with your Supabase connection string or set in .env

if (!DATABASE_URL) {
  console.error('ERROR: Set DATABASE_URL env var first');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTables(client) {
  console.log('Creating tables...');

  await client.query(`
    CREATE TABLE IF NOT EXISTS colleges_comprehensive (
      id SERIAL PRIMARY KEY,
      name VARCHAR(500) NOT NULL,
      alternate_names TEXT,
      country VARCHAR(200),
      state_region VARCHAR(200),
      city VARCHAR(200),
      urban_classification VARCHAR(100),
      institution_type VARCHAR(100),
      classification VARCHAR(200),
      religious_affiliation VARCHAR(200),
      founding_year INTEGER,
      campus_size_acres REAL,
      undergraduate_enrollment INTEGER,
      graduate_enrollment INTEGER,
      total_enrollment INTEGER,
      student_faculty_ratio VARCHAR(50),
      website_url VARCHAR(500),
      latitude REAL,
      longitude REAL,
      source VARCHAR(100),
      confidence_score REAL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(name)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS college_admissions (
      id SERIAL PRIMARY KEY,
      college_id INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
      acceptance_rate REAL,
      test_optional BOOLEAN,
      sat_avg INTEGER,
      sat_range VARCHAR(50),
      act_range VARCHAR(50),
      gpa_50 REAL,
      data_year INTEGER,
      confidence_score REAL
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS college_financial_data (
      id SERIAL PRIMARY KEY,
      college_id INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
      tuition_in_state INTEGER,
      tuition_out_state INTEGER,
      tuition_international INTEGER,
      avg_net_price INTEGER,
      data_year INTEGER,
      confidence_score REAL
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS academic_details (
      id SERIAL PRIMARY KEY,
      college_id INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
      graduation_rate_4yr REAL,
      retention_rate REAL,
      median_salary_6yr INTEGER,
      median_salary_10yr INTEGER,
      median_debt INTEGER,
      data_year INTEGER,
      confidence_score REAL
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS college_programs (
      id SERIAL PRIMARY KEY,
      college_id INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
      program_name VARCHAR(300),
      degree_type VARCHAR(100)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS student_demographics (
      id SERIAL PRIMARY KEY,
      college_id INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
      percent_male REAL,
      percent_female REAL,
      percent_white REAL,
      percent_black REAL,
      percent_hispanic REAL,
      percent_asian REAL,
      percent_international REAL,
      data_year INTEGER
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS campus_life (
      id SERIAL PRIMARY KEY,
      college_id INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
      housing_guarantee BOOLEAN,
      distance_only BOOLEAN
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS college_rankings (
      id SERIAL PRIMARY KEY,
      college_id INTEGER REFERENCES colleges_comprehensive(id) ON DELETE CASCADE,
      ranking_source VARCHAR(200),
      ranking_value VARCHAR(100),
      ranking_year INTEGER
    )
  `);

  console.log('Tables ready.');
}

async function main() {
  console.log('Reading unified_colleges.json...');
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'unified_colleges.json'), 'utf8')
  );
  const colleges = raw.colleges || raw;
  console.log(`Found ${colleges.length} colleges to seed.`);

  const client = await pool.connect();
  try {
    await createTables(client);

    let inserted = 0, skipped = 0, errors = 0;
    const BATCH = 50;

    for (let i = 0; i < colleges.length; i += BATCH) {
      const batch = colleges.slice(i, i + BATCH);

      for (const c of batch) {
        try {
          // Insert main college row
          const res = await client.query(`
            INSERT INTO colleges_comprehensive
              (name, alternate_names, country, state_region, city,
               urban_classification, institution_type, classification,
               religious_affiliation, founding_year, campus_size_acres,
               undergraduate_enrollment, graduate_enrollment, total_enrollment,
               student_faculty_ratio, website_url, latitude, longitude,
               source, confidence_score)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
            ON CONFLICT (name) DO UPDATE SET
              country = EXCLUDED.country,
              city = EXCLUDED.city,
              website_url = EXCLUDED.website_url
            RETURNING id
          `, [
            c.name, c.alternate_names, c.country, c.state_region, c.city,
            c.urban_classification, c.institution_type, c.classification,
            c.religious_affiliation, c.founding_year, c.campus_size_acres,
            c.undergraduate_enrollment, c.graduate_enrollment, c.total_enrollment,
            c.student_faculty_ratio, c.website_url,
            c.latitude, c.longitude,
            c._source, c._confidence
          ]);

          const collegeId = res.rows[0].id;

          // Admissions
          if (c.admissions) {
            await client.query(`
              INSERT INTO college_admissions
                (college_id, acceptance_rate, test_optional, sat_avg,
                 sat_range, act_range, gpa_50, data_year, confidence_score)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
              ON CONFLICT DO NOTHING
            `, [
              collegeId,
              c.admissions.acceptance_rate,
              c.admissions.test_optional_flag === 1,
              c.student_stats?.sat_avg,
              c.student_stats?.sat_range,
              c.student_stats?.act_range,
              c.student_stats?.gpa_50,
              c.admissions.year,
              c.admissions.confidence_score
            ]);
          }

          // Financial
          if (c.financial) {
            await client.query(`
              INSERT INTO college_financial_data
                (college_id, tuition_in_state, tuition_out_state,
                 tuition_international, avg_net_price, data_year, confidence_score)
              VALUES ($1,$2,$3,$4,$5,$6,$7)
              ON CONFLICT DO NOTHING
            `, [
              collegeId,
              c.financial.tuition_in_state,
              c.financial.tuition_out_state,
              c.financial.tuition_international,
              c.financial.avg_net_price,
              c.financial.year,
              c.financial.confidence_score
            ]);
          }

          // Outcomes
          if (c.outcomes) {
            await client.query(`
              INSERT INTO academic_details
                (college_id, graduation_rate_4yr, retention_rate,
                 median_salary_6yr, median_salary_10yr, median_debt,
                 data_year, confidence_score)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              ON CONFLICT DO NOTHING
            `, [
              collegeId,
              c.outcomes.graduation_rate_4yr,
              c.outcomes.retention_rate,
              c.outcomes.median_salary_6yr,
              c.outcomes.median_salary_10yr,
              c.outcomes.median_debt,
              c.outcomes.year,
              c.outcomes.confidence_score
            ]);
          }

          // Programs
          if (c.programs && c.programs.length > 0) {
            for (const prog of c.programs) {
              await client.query(`
                INSERT INTO college_programs (college_id, program_name, degree_type)
                VALUES ($1,$2,$3)
                ON CONFLICT DO NOTHING
              `, [collegeId, prog.program_name, prog.degree_type]);
            }
          }

          // Demographics
          if (c.demographics) {
            await client.query(`
              INSERT INTO student_demographics
                (college_id, percent_male, percent_female, percent_white,
                 percent_black, percent_hispanic, percent_asian,
                 percent_international, data_year)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
              ON CONFLICT DO NOTHING
            `, [
              collegeId,
              c.demographics.percent_male,
              c.demographics.percent_female,
              c.demographics.percent_white,
              c.demographics.percent_black,
              c.demographics.percent_hispanic,
              c.demographics.percent_asian,
              c.demographics.percent_international,
              c.demographics.year
            ]);
          }

          // Campus life
          if (c.campus_life) {
            await client.query(`
              INSERT INTO campus_life (college_id, housing_guarantee, distance_only)
              VALUES ($1,$2,$3)
              ON CONFLICT DO NOTHING
            `, [
              collegeId,
              c.campus_life.housing_guarantee,
              c.campus_life.distance_only
            ]);
          }

          // Rankings
          if (c.rankings && c.rankings.length > 0) {
            for (const r of c.rankings) {
              await client.query(`
                INSERT INTO college_rankings
                  (college_id, ranking_source, ranking_value, ranking_year)
                VALUES ($1,$2,$3,$4)
                ON CONFLICT DO NOTHING
              `, [collegeId, r.source, r.rank?.toString(), r.year]);
            }
          }

          inserted++;
        } catch(e) {
          errors++;
          if (errors <= 5) console.log(`  Error on ${c.name}: ${e.message.slice(0, 100)}`);
        }
      }

      console.log(`Progress: ${Math.min(i + BATCH, colleges.length)}/${colleges.length} processed, ${inserted} inserted`);
    }

    console.log(`\n✅ Done! ${inserted} colleges inserted, ${skipped} skipped, ${errors} errors`);
    console.log('Your Supabase database is seeded and ready.');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });