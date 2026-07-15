'use strict';

// Extracts structured fields out of canonical.masters_programs.raw_admission_requirements /
// raw_test_requirements / raw_cost / raw_deadlines free text (62-71% filled, but the
// structured columns they should have populated -- min_gpa, min_toefl, min_ielts,
// gre_requirement, gmat_requirement, tuition_total/currency, acceptance_rate -- are
// 0.2-12% filled). Conservative regex/heuristic extraction: only writes a value when
// the match is unambiguous. Never guesses. Only fills currently-NULL target columns
// (never overwrites an existing structured value).
//
// Usage:
//   node scripts/parseMastersRawFields.js --sample     # print parsed values for 25 random
//                                                        # rows without writing, for manual review
//   node scripts/parseMastersRawFields.js --dry-run     # run against all rows, report counts, no writes
//   node scripts/parseMastersRawFields.js               # run against all rows and write

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const MODE_SAMPLE = process.argv.includes('--sample');
const DRY = process.argv.includes('--dry-run') || MODE_SAMPLE;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const CURRENCY_MAP = { '£': 'GBP', '$': 'USD', '€': 'EUR', 'CAD': 'CAD', 'AUD': 'AUD', 'C$': 'CAD', 'A$': 'AUD' };

function parseGpa(text) {
  if (!text) return null;
  // "GPA of 3.0", "GPA: 3.0", "3.0 GPA", "minimum GPA 3.0"
  const found = new Set();
  for (const m of text.matchAll(/GPA[^0-9]{0,15}([0-4]\.\d{1,2})/gi)) found.add(m[1]);
  for (const m of text.matchAll(/([0-4]\.\d{1,2})\s*(?:\/\s*4\.0)?\s*GPA/gi)) found.add(m[1]);
  // percentage-based "minimum of 70%" is too ambiguous re: scale -- skip.
  if (found.size !== 1) return null; // ambiguous (0 or conflicting matches) -- don't guess
  return { value: parseFloat([...found][0]), scale: 4.0 };
}

function parseToefl(text) {
  if (!text) return null;
  const m = text.match(/TOEFL[^0-9]{0,20}(\d{2,3})/i);
  if (m) {
    const v = parseInt(m[1], 10);
    if (v >= 40 && v <= 120) return v; // sanity bounds for TOEFL iBT
  }
  return null;
}

function parseIelts(text) {
  if (!text) return null;
  const m = text.match(/IELTS[^0-9]{0,20}(\d(?:\.\d)?)/i);
  if (m) {
    const v = parseFloat(m[1]);
    if (v >= 4.0 && v <= 9.0) return v;
  }
  return null;
}

// Shared logic for GRE/GMAT: isolate the sentence(s)/clauses mentioning the exam
// (split on '.', ';', or newline) and classify only from that local context, so a
// negation elsewhere in a long paragraph can't be missed and a negation attached to
// the OTHER exam ("GMAT optional, GRE required") can't bleed across.
function classifyExamRequirement(text, examWord) {
  if (!text) return null;
  const clauses = text.split(/[.;\n]/);
  const relevant = clauses.filter((c) => new RegExp(`\\b${examWord}\\b`, 'i').test(c));
  if (relevant.length === 0) return null;

  const joined = relevant.join(' ').toLowerCase();
  const negated = /\b(not|no|n't|neither|nor|without|waived|isn't|is not|are not|aren't)\b/.test(joined);
  const hasOptional = /\boptional\b/.test(joined);
  const hasRequired = /\brequired\b/.test(joined);

  // schema enum is required | optional | waived | not_accepted | unknown -- map our
  // negation detection onto 'waived' (closest match to "not required") unless the
  // text explicitly says the exam isn't accepted at all.
  if (negated && /not accepted|neither.*accepted/.test(joined)) return 'not_accepted';
  if (negated && hasRequired) return 'waived'; // "not required" / "neither required nor accepted"
  if (negated) return 'waived'; // "GRE not accepted", "no GRE" -- treated as not needed
  if (hasOptional) return 'optional';
  if (hasRequired) return 'required';
  return null;
}

function parseGreRequirement(text) {
  return classifyExamRequirement(text, 'gre');
}

function parseGmatRequirement(text) {
  return classifyExamRequirement(text, 'gmat');
}

function parseCost(text) {
  if (!text) return null;
  if (/fully funded|full funding|stipend/i.test(text) && !/\d/.test(text)) return null; // no numeric figure to extract
  // reject ranges outright ("68000-70000", "£14,000 - €16,000") -- too ambiguous to pick a bound
  if (/[\d,]{3,9}\s*(?:-|–|to)\s*(?:[£$€]|CAD|AUD|USD|EUR|GBP|SGD)?\s*[\d,]{3,9}/i.test(text)) return null;

  const isValid = (v) => v > 100 && v < 500000;

  // 1. Most authoritative: an explicit trailing 3-letter ISO code right after the number
  //    ("$108,421 CAD", "24000 CAD") -- wins over any symbol earlier in the same number.
  let m = text.match(/([\d,]{4,9}(?:\.\d+)?)\s?(CAD|AUD|USD|EUR|GBP|SGD)\b/i);
  if (m) {
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (isValid(value)) return { value, currency: m[2].toUpperCase() };
  }

  // 2. Two-char symbol prefixes that are NOT plain USD ("S$", "A$", "C$")
  const prefixTests = [
    [/S\$\s?([\d,]{4,9}(?:\.\d+)?)/, 'SGD'],
    [/A\$\s?([\d,]{4,9}(?:\.\d+)?)/, 'AUD'],
    [/C\$\s?([\d,]{4,9}(?:\.\d+)?)/, 'CAD'],
    [/AUD\s?\$?\s?([\d,]{4,9}(?:\.\d+)?)/i, 'AUD'],
    [/CAD\s?\$?\s?([\d,]{4,9}(?:\.\d+)?)/i, 'CAD'],
    [/USD\s?\$?\s?([\d,]{4,9}(?:\.\d+)?)/i, 'USD'],
    [/EUR\s?([\d,]{4,9}(?:\.\d+)?)/i, 'EUR'],
    [/GBP\s?([\d,]{4,9}(?:\.\d+)?)/i, 'GBP'],
    [/£\s?([\d,]{4,9}(?:\.\d+)?)/, 'GBP'],
    [/€\s?([\d,]{4,9}(?:\.\d+)?)/, 'EUR'],
  ];
  for (const [re, currency] of prefixTests) {
    const pm = text.match(re);
    if (pm) {
      const value = parseFloat(pm[1].replace(/,/g, ''));
      if (isValid(value)) return { value, currency };
    }
  }

  // 3. Bare "$" -- only trust it as USD if no other currency code/symbol appears
  //    anywhere else in the text (otherwise it's ambiguous which one the amount is in).
  if (!/CAD|AUD|EUR|GBP|SGD|[£€]/i.test(text)) {
    m = text.match(/\$\s?([\d,]{4,9}(?:\.\d+)?)/);
    if (m) {
      const value = parseFloat(m[1].replace(/,/g, ''));
      if (isValid(value)) return { value, currency: 'USD' };
    }
  }
  return null;
}

async function main() {
  const { rows } = await pool.query(`
    SELECT id, min_gpa, min_toefl, min_ielts, gre_requirement, gmat_requirement,
           tuition_total, tuition_currency,
           raw_admission_requirements, raw_test_requirements, raw_cost
    FROM canonical.masters_programs
    ${MODE_SAMPLE ? 'ORDER BY random() LIMIT 25' : ''}
  `);

  let counts = { gpa: 0, toefl: 0, ielts: 0, gre: 0, gmat: 0, cost: 0 };
  let updates = [];

  for (const r of rows) {
    const combinedAdmTest = [r.raw_admission_requirements, r.raw_test_requirements].filter(Boolean).join(' \n ');
    const set = {};

    if (r.min_gpa === null) {
      const gpa = parseGpa(combinedAdmTest);
      if (gpa) { set.min_gpa = gpa.value; set.min_gpa_scale = gpa.scale; counts.gpa++; }
    }
    if (r.min_toefl === null) {
      const toefl = parseToefl(r.raw_test_requirements) || parseToefl(r.raw_admission_requirements);
      if (toefl) { set.min_toefl = toefl; counts.toefl++; }
    }
    if (r.min_ielts === null) {
      const ielts = parseIelts(r.raw_test_requirements) || parseIelts(r.raw_admission_requirements);
      if (ielts) { set.min_ielts = ielts; counts.ielts++; }
    }
    if (!r.gre_requirement) {
      const gre = parseGreRequirement(combinedAdmTest);
      if (gre) { set.gre_requirement = gre; counts.gre++; }
    }
    if (!r.gmat_requirement) {
      const gmat = parseGmatRequirement(combinedAdmTest);
      if (gmat) { set.gmat_requirement = gmat; counts.gmat++; }
    }
    if (r.tuition_total === null) {
      const cost = parseCost(r.raw_cost);
      if (cost) { set.tuition_total = cost.value; set.tuition_currency = cost.currency; counts.cost++; }
    }

    if (Object.keys(set).length > 0) {
      updates.push({ id: r.id, set, raw: MODE_SAMPLE ? { adm: r.raw_admission_requirements, test: r.raw_test_requirements, cost: r.raw_cost } : undefined });
    }
  }

  if (MODE_SAMPLE) {
    for (const u of updates) {
      console.log('----', u.id);
      console.log('  parsed:', JSON.stringify(u.set));
      console.log('  adm  :', (u.raw.adm || '').slice(0, 150));
      console.log('  test :', (u.raw.test || '').slice(0, 150));
      console.log('  cost :', (u.raw.cost || '').slice(0, 150));
    }
    console.log('\nSample size:', rows.length, 'rows with at least one parsed field:', updates.length);
    console.log(counts);
    await pool.end();
    return;
  }

  console.log(`Scanned ${rows.length} rows. Rows with >=1 new field parsed: ${updates.length}`);
  console.log('Per-field counts:', counts);

  if (DRY) {
    console.log('[DRY RUN] no writes performed');
    await pool.end();
    return;
  }

  let written = 0;
  for (const u of updates) {
    const cols = Object.keys(u.set);
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const params = cols.map((c) => u.set[c]);
    params.push(u.id);
    await pool.query(
      `UPDATE canonical.masters_programs SET ${setClause}, updated_at = now() WHERE id = $${params.length}`,
      params
    );
    written++;
  }
  console.log(`Wrote updates to ${written} rows.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
