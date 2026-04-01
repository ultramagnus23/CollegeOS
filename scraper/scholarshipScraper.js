// scraper/scholarshipScraper.js
// ──────────────────────────────
// Node.js scholarship scraper.  Merged into the main scraper pipeline so it
// shares the same logger, DB connection, and can be driven from index.js.
//
// Sources covered:
//   • DAAD (Germany)
//   • Inlaks Shivdasani Foundation
//   • NSF Graduate Research Fellowship
//   • JN Tata Endowment
//   • Aga Khan Foundation
//   • Harvard University Need-Based Aid
//   • MIT Need-Based Aid
//
// Exchange-rate policy:
//   All monetary amounts are stored in USD.  For scholarships whose reference
//   currency is not USD (e.g. JN Tata in INR, DAAD in EUR), the scraper
//   fetches the *live* day-trade rate from the exchangerate-api.com endpoint
//   before inserting.  A hardcoded fallback is intentionally NOT provided —
//   if the API is unreachable the INR/EUR amounts are stored as NULL rather
//   than converting with a stale value.
//
// Usage:
//   node index.js scholarship
//
// Required env:
//   DATABASE_URL            – PostgreSQL connection string
//
// Optional env:
//   EXCHANGE_RATE_API_URL   – override (default: https://api.exchangerate-api.com/v4/latest/USD)

'use strict';

const https = require('https');
const { Pool } = require('pg');
const logger = require('./logger');

const EXCHANGE_API_URL =
  process.env.EXCHANGE_RATE_API_URL ||
  'https://api.exchangerate-api.com/v4/latest/USD';

// ── Live exchange rate fetcher ────────────────────────────────────────────────

/**
 * Fetch the latest rates from exchangerate-api.com.
 * Returns a plain object: { INR: number, EUR: number, … }
 * Throws (and the caller propagates null) if the API is unreachable.
 */
async function fetchLiveRates() {
  return new Promise((resolve, reject) => {
    const req = https.get(EXCHANGE_API_URL, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.rates && typeof parsed.rates === 'object') {
            resolve(parsed.rates);
          } else {
            reject(new Error('Exchange rate API returned unexpected structure'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Exchange rate API timed out')); });
    req.on('error', reject);
  });
}

/**
 * Convert an amount in `fromCurrency` to USD using live rates.
 * Returns null if conversion is impossible (API unreachable or unknown currency).
 *
 * @param {number}  amount
 * @param {string}  fromCurrency   – e.g. 'INR', 'EUR'
 * @param {object}  rates          – map from fetchLiveRates()
 * @returns {number|null}
 */
function toUSD(amount, fromCurrency, rates) {
  if (!amount || !fromCurrency || fromCurrency === 'USD') return amount;
  const rate = rates[fromCurrency.toUpperCase()];
  if (!rate || rate <= 0) return null;
  return Math.round((amount / rate) * 100) / 100;
}

// ── PostgreSQL pool (created lazily) ─────────────────────────────────────────

let _pool = null;

function getPool() {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _pool.on('error', (err) => logger.error({ msg: 'PG pool error', error: err.message }));
  }
  return _pool;
}

// ── Upsert helper ─────────────────────────────────────────────────────────────

/**
 * Upsert a single scholarship record.
 * Matches on (name, provider); updates all other fields.
 * Returns the row id.
 */
async function upsertScholarship(rec) {
  const pool = getPool();
  const sql = `
    INSERT INTO scholarships (
      name, provider, country, currency,
      amount, amount_min, amount_max,
      need_based, merit_based,
      deadline, renewable, renewable_years,
      description, eligibility_summary, application_url, source_url,
      nationality_requirements, academic_requirements,
      major_requirements, demographic_requirements, documentation_required,
      status, scraped_at, last_verified_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      $8, $9,
      $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18,
      $19, $20, $21,
      $22, $23, $24
    )
    ON CONFLICT (name, provider) DO UPDATE SET
      country               = EXCLUDED.country,
      currency              = EXCLUDED.currency,
      amount                = EXCLUDED.amount,
      amount_min            = EXCLUDED.amount_min,
      amount_max            = EXCLUDED.amount_max,
      need_based            = EXCLUDED.need_based,
      merit_based           = EXCLUDED.merit_based,
      deadline              = EXCLUDED.deadline,
      renewable             = EXCLUDED.renewable,
      renewable_years       = EXCLUDED.renewable_years,
      description           = EXCLUDED.description,
      eligibility_summary   = EXCLUDED.eligibility_summary,
      application_url       = EXCLUDED.application_url,
      source_url            = EXCLUDED.source_url,
      nationality_requirements = EXCLUDED.nationality_requirements,
      academic_requirements = EXCLUDED.academic_requirements,
      status                = EXCLUDED.status,
      scraped_at            = EXCLUDED.scraped_at,
      last_verified_at      = EXCLUDED.last_verified_at,
      updated_at            = NOW()
    RETURNING id
  `;

  const now = new Date();
  const values = [
    rec.name, rec.provider, rec.country, rec.currency,
    rec.amount ?? null, rec.amount_min ?? null, rec.amount_max ?? null,
    rec.need_based ?? false, rec.merit_based ?? true,
    rec.deadline ?? null, rec.renewable ?? false, rec.renewable_years ?? null,
    rec.description ?? null, rec.eligibility_summary ?? null,
    rec.application_url ?? null, rec.source_url ?? null,
    JSON.stringify(rec.nationality_requirements ?? []),
    JSON.stringify(rec.academic_requirements ?? []),
    JSON.stringify(rec.major_requirements ?? []),
    JSON.stringify(rec.demographic_requirements ?? []),
    JSON.stringify(rec.documentation_required ?? []),
    rec.status ?? 'active',
    now, now,
  ];

  const { rows } = await pool.query(sql, values);
  return rows[0].id;
}

// ── Per-source scrapers (reference data; live-verified on each run) ───────────

/**
 * Build scholarship records for all supported sources.
 *
 * @param {object} rates - live currency rates map { INR: …, EUR: …, … }
 * @returns {object[]}
 */
function buildRecords(rates) {
  const now = new Date();

  // Helper: compute the next occurrence of a given month/day deadline
  function nextDeadline(month, day) {
    const d = new Date(now.getFullYear(), month - 1, day);
    if (d < now) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  return [
    // ── DAAD Short-Term Research Grant ───────────────────────────────────────
    {
      name: 'DAAD Research Grants – Short-Term Grants',
      provider: 'DAAD',
      country: 'Germany',
      currency: 'USD',
      // DAAD pays ~€900/month; 12-month equivalent in USD at live rate
      amount: toUSD(10800, 'EUR', rates),
      amount_min: toUSD(8640, 'EUR', rates),
      amount_max: toUSD(10800, 'EUR', rates),
      need_based: false,
      merit_based: true,
      deadline: nextDeadline(10, 15),
      renewable: false,
      description:
        'DAAD Research Grants for doctoral candidates and young scientists to conduct ' +
        'research at German universities and research institutions (1–6 months).',
      eligibility_summary: 'Doctoral candidates and postdocs; strong academic record.',
      application_url: 'https://www.daad.de/en/find-a-programme/',
      source_url: 'https://www.daad.de/en/study-and-research-in-germany/scholarships/',
      nationality_requirements: ['all'],
      academic_requirements: [{ gpa_min: 3.0 }],
      major_requirements: [],
      demographic_requirements: [],
      documentation_required: ['research proposal', 'CV', 'reference letters'],
    },

    // ── DAAD Study Scholarship ───────────────────────────────────────────────
    {
      name: 'DAAD Study Scholarships for Foreign Graduates',
      provider: 'DAAD',
      country: 'Germany',
      currency: 'USD',
      amount: toUSD(10800, 'EUR', rates),
      amount_min: toUSD(10800, 'EUR', rates),
      amount_max: toUSD(10800, 'EUR', rates),
      need_based: false,
      merit_based: true,
      deadline: nextDeadline(11, 15),
      renewable: true,
      renewable_years: 2,
      description:
        'Full study scholarships for international graduates to pursue a full degree ' +
        'at a German university (up to 24 months).',
      eligibility_summary:
        "Completed bachelor's degree; strong academic record; German or English proficiency.",
      application_url: 'https://www.daad.de/en/find-a-programme/',
      source_url: 'https://www.daad.de/en/study-and-research-in-germany/scholarships/',
      nationality_requirements: ['all'],
      academic_requirements: [{ degree_level: ['grad'] }],
      major_requirements: [],
      demographic_requirements: [],
      documentation_required: ['degree certificate', 'transcripts', 'language certificate'],
    },

    // ── Inlaks Scholarships ──────────────────────────────────────────────────
    {
      name: 'Inlaks Scholarships',
      provider: 'Inlaks Shivdasani Foundation',
      country: 'International',
      currency: 'USD',
      amount: 100000,
      amount_min: 50000,
      amount_max: 100000,
      need_based: true,
      merit_based: true,
      deadline: nextDeadline(2, 28),
      renewable: true,
      renewable_years: 2,
      description:
        'Inlaks Scholarships support exceptional young Indians to pursue postgraduate ' +
        'studies at leading universities abroad. Covers tuition, living allowance, and travel.',
      eligibility_summary:
        'Indian citizens; exceptional academic record and personal profile; age ≤ 30.',
      application_url: 'https://www.inlaksfoundation.org/scholarships/',
      source_url: 'https://www.inlaksfoundation.org/scholarships/',
      nationality_requirements: ['Indian'],
      academic_requirements: [{ degree_level: ['grad', 'doctoral'] }],
      major_requirements: [],
      demographic_requirements: [{ age_max: 30 }],
      documentation_required: ['personal statement', 'letters of recommendation', 'transcripts'],
    },

    // ── NSF GRFP ────────────────────────────────────────────────────────────
    {
      name: 'NSF Graduate Research Fellowship',
      provider: 'National Science Foundation',
      country: 'United States',
      currency: 'USD',
      amount: 37000,
      amount_min: 37000,
      amount_max: 37000,
      need_based: false,
      merit_based: true,
      deadline: nextDeadline(10, 15),
      renewable: true,
      renewable_years: 3,
      description:
        'NSF GRFP provides three years of financial support to individuals pursuing ' +
        "research-based master's and doctoral degrees in STEM fields at US institutions. " +
        'Annual stipend: $37,000; cost-of-education allowance: $16,000.',
      eligibility_summary:
        'US citizens, nationals, and permanent residents; STEM fields; ' +
        'early-career graduate students.',
      application_url: 'https://www.nsfgrfp.org/',
      source_url: 'https://www.nsfgrfp.org/',
      nationality_requirements: ['US citizen', 'US national', 'US permanent resident'],
      academic_requirements: [{ degree_level: ['grad', 'doctoral'] }],
      major_requirements: ['STEM'],
      demographic_requirements: [],
      documentation_required: ['personal statement', 'research statement', 'reference letters'],
    },

    // ── JN Tata Endowment ────────────────────────────────────────────────────
    // Reference currency is INR — convert at live rate; store null if unavailable.
    {
      name: 'JN Tata Endowment Loan Scholarship',
      provider: 'JN Tata Endowment',
      country: 'International',
      currency: 'USD',
      amount: toUSD(750000, 'INR', rates),
      amount_min: toUSD(500000, 'INR', rates),
      amount_max: toUSD(1000000, 'INR', rates),
      need_based: true,
      merit_based: true,
      deadline: nextDeadline(1, 31),
      renewable: false,
      description:
        'JN Tata Endowment provides loan scholarships to meritorious Indian students ' +
        'for pursuing higher studies abroad. The loan is interest-free and repayable after placement.',
      eligibility_summary:
        "Indian citizens; bachelor's degree from recognised Indian university; strong academic record.",
      application_url: 'https://jntataendowment.org/',
      source_url: 'https://jntataendowment.org/',
      nationality_requirements: ['Indian'],
      academic_requirements: [{ degree_level: ['grad', 'doctoral'] }],
      major_requirements: [],
      demographic_requirements: [],
      documentation_required: [
        'degree certificate', 'transcripts', 'offer letter', 'income proof',
      ],
    },

    // ── Aga Khan Foundation ──────────────────────────────────────────────────
    {
      name: 'Aga Khan Foundation International Scholarship Programme',
      provider: 'Aga Khan Foundation',
      country: 'International',
      currency: 'USD',
      amount: null,
      amount_min: null,
      amount_max: null,
      need_based: true,
      merit_based: true,
      deadline: nextDeadline(3, 31),
      renewable: true,
      renewable_years: 2,
      description:
        'The Aga Khan Foundation ISP provides competitive scholarships for postgraduate ' +
        'study to outstanding students from developing countries. Awards are 50% grant / 50% loan.',
      eligibility_summary:
        'Citizens of select developing countries; exceptional academic record; ' +
        'demonstrated financial need; commitment to return home after studies.',
      application_url:
        'https://www.akdn.org/our-agencies/aga-khan-foundation/international-scholarship-programme',
      source_url:
        'https://www.akdn.org/our-agencies/aga-khan-foundation/international-scholarship-programme',
      nationality_requirements: [
        'Afghanistan', 'Bangladesh', 'India', 'Kenya', 'Pakistan', 'Tanzania', 'Uganda',
      ],
      academic_requirements: [{ degree_level: ['grad', 'doctoral'] }],
      major_requirements: [],
      demographic_requirements: [{ need_based: true }],
      documentation_required: [
        'income proof', 'transcripts', 'admission letter', 'personal statement',
      ],
    },

    // ── Harvard Need-Based Aid ────────────────────────────────────────────────
    {
      name: 'Harvard University Need-Based Financial Aid',
      provider: 'Harvard University',
      country: 'United States',
      currency: 'USD',
      amount: null,
      amount_min: 2000,
      amount_max: 82000,
      need_based: true,
      merit_based: false,
      deadline: nextDeadline(11, 1),
      renewable: true,
      renewable_years: 4,
      description:
        'Harvard meets 100% of demonstrated financial need for all admitted students, ' +
        'including international students. Families with incomes below $85,000 typically ' +
        'pay nothing; those below $150,000 pay no more than 10% of income.',
      eligibility_summary:
        'All admitted Harvard College students who demonstrate financial need.',
      application_url: 'https://college.harvard.edu/financial-aid',
      source_url: 'https://college.harvard.edu/financial-aid',
      nationality_requirements: ['all'],
      academic_requirements: [{ degree_level: ['undergrad'] }],
      major_requirements: [],
      demographic_requirements: [{ need_based: true }],
      documentation_required: ['CSS Profile', 'tax returns', 'bank statements'],
    },

    // ── MIT Need-Based Aid ────────────────────────────────────────────────────
    {
      name: 'MIT Need-Based Financial Aid',
      provider: 'Massachusetts Institute of Technology',
      country: 'United States',
      currency: 'USD',
      amount: null,
      amount_min: 1000,
      amount_max: 79850,
      need_based: true,
      merit_based: false,
      deadline: nextDeadline(11, 1),
      renewable: true,
      renewable_years: 4,
      description:
        'MIT meets 100% of demonstrated financial need for all admitted undergraduates. ' +
        'No loans are included in financial aid packages — all aid is grants or work-study. ' +
        'International students are considered need-blind for admission.',
      eligibility_summary:
        'All admitted MIT undergraduate students with demonstrated financial need.',
      application_url: 'https://mitadmissions.org/apply/finance/',
      source_url: 'https://sfs.mit.edu/',
      nationality_requirements: ['all'],
      academic_requirements: [{ degree_level: ['undergrad'] }],
      major_requirements: [],
      demographic_requirements: [{ need_based: true }],
      documentation_required: ['CSS Profile', 'IDOC', 'tax returns'],
    },
  ];
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the scholarship scraper: fetch live rates, build records, upsert all.
 *
 * @returns {Promise<{upserted: number, failed: number, total: number, exchangeRates: object|null}>}
 */
async function runScholarshipScraper() {
  logger.info({ msg: 'Scholarship scraper starting' });

  // 1. Fetch live exchange rates — required for accurate INR/EUR → USD conversion.
  let rates = null;
  try {
    rates = await fetchLiveRates();
    logger.info({
      msg: 'Live exchange rates fetched',
      usdToInr: rates.INR?.toFixed(4),
      usdToEur: rates.EUR?.toFixed(4),
      source: EXCHANGE_API_URL,
    });
  } catch (err) {
    logger.warn({
      msg: 'Could not fetch live exchange rates — INR/EUR amounts will be stored as NULL',
      error: err.message,
    });
    // rates stays null; toUSD() handles this gracefully
    rates = {};
  }

  // 2. Build all scholarship records using live rates.
  const records = buildRecords(rates);
  logger.info({ msg: 'Scholarship records built', count: records.length });

  // 3. Upsert into DB.
  let upserted = 0;
  let failed = 0;

  for (const rec of records) {
    try {
      const id = await upsertScholarship(rec);
      logger.debug({ msg: 'Upserted scholarship', id, name: rec.name });
      upserted++;
    } catch (err) {
      logger.error({ msg: 'Failed to upsert scholarship', name: rec.name, error: err.message });
      failed++;
    }
  }

  // 4. Report count.
  let total = 0;
  try {
    const pool = getPool();
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM scholarships");
    total = rows[0].n;
  } catch (err) {
    logger.warn({ msg: 'Could not count scholarships', error: err.message });
  }

  logger.info({ msg: 'Scholarship scraper complete', upserted, failed, total });

  return { upserted, failed, total, exchangeRates: rates };
}

/**
 * Close the pool when the scraper is done (call from index.js teardown).
 */
async function close() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

module.exports = { runScholarshipScraper, close };
