'use strict';

// ============================================================================
// Placement-outcomes adapter. Fetches an institution's official placements page
// and extracts highest / average / median package + % placed straight from the
// page text. Packages are normalized to absolute INR (LPA*100,000, crore*1e7).
// A field is set ONLY when clearly stated next to its label; otherwise null. A
// row is emitted only when at least one package figure is found; never fabricated.
//
// India-first (placement stats are a primary decision factor there), but the
// extractor is source-agnostic — it works on any page that states the figures.
// ============================================================================

const { cleanHtml } = require('./usOfficialDeadlines');

const PARSER_NAME = 'institutionPlacements';
const PARSER_VERSION = '1.0.0';

// Verified target list (each checked to expose figures on its live page). Names
// MUST match canonical.institutions.canonical_name exactly (resolveInstitutionId
// joins on it). A page that doesn't expose figures is simply skipped — never
// fabricated.
const TARGETS = [
  { name: 'Ashoka University', url: 'https://www.ashoka.edu.in/placements/', cycle_year: '2024-2025' },

  // ---- IITs (official placement / career-services pages) ----
  { name: 'Indian Institute of Technology Bombay', url: 'https://www.iitb.ac.in/en/education/placements', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Delhi', url: 'https://tnp.iitd.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Madras', url: 'https://placement.iitm.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Kanpur', url: 'https://www.iitk.ac.in/spo/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Kharagpur', url: 'https://www.iitkgp.ac.in/placements', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Roorkee', url: 'https://tnp.iitr.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Guwahati', url: 'https://www.iitg.ac.in/cc/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Hyderabad', url: 'https://placements.iith.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Indore', url: 'https://placement.iiti.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Ropar', url: 'https://www.iitrpr.ac.in/placement', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Patna', url: 'https://www.iitp.ac.in/index.php/placement', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Gandhinagar', url: 'https://placement.iitgn.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Bhubaneswar', url: 'https://www.iitbbs.ac.in/placement.php', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Mandi', url: 'https://www.iitmandi.ac.in/placement/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Jodhpur', url: 'https://www.iitj.ac.in/placement/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Varanasi', url: 'https://www.iitbhu.ac.in/contents/institute/central/tpc', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Dhanbad', url: 'https://www.iitism.ac.in/placement', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Tirupati', url: 'https://www.iittp.ac.in/placement', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Palakkad', url: 'https://placement.iitpkd.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Bhilai', url: 'https://www.iitbhilai.ac.in/index.php?pid=placement', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Goa', url: 'https://www.iitgoa.ac.in/placement', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Jammu', url: 'https://placement.iitjammu.ac.in/', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Technology Dharwad', url: 'https://www.iitdh.ac.in/placement', cycle_year: '2024-2025' },

  // ---- Top IIMs ----
  { name: 'Indian Institute of Management Ahmedabad', url: 'https://www.iima.ac.in/placements', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Management Bangalore', url: 'https://www.iimb.ac.in/placements', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Management Calcutta', url: 'https://www.iimcal.ac.in/programs/placement', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Management Lucknow', url: 'https://www.iiml.ac.in/placements', cycle_year: '2024-2025' },
  { name: 'Indian Institute of Management Kozhikode', url: 'https://www.iimk.ac.in/placements', cycle_year: '2024-2025' },

  // ---- Top NITs ----
  { name: 'National Institute of Technology Tiruchirappalli', url: 'https://www.nitt.edu/home/academics/placement/', cycle_year: '2024-2025' },
  { name: 'National Institute of Technology Warangal', url: 'https://www.nitw.ac.in/main/CDC/', cycle_year: '2024-2025' },
  { name: 'National Institute of Technology Karnataka', url: 'https://www.nitk.ac.in/department/career-development-centre', cycle_year: '2024-2025' },

  // ---- Other top Indian institutions ----
  { name: 'Indian Institute of Science', url: 'https://placement.iisc.ac.in/', cycle_year: '2024-2025' },
  { name: 'Birla Institute of Technology and Science Pilani', url: 'https://www.bits-pilani.ac.in/placement/', cycle_year: '2024-2025' },
  { name: 'Xavier Labour Relations Institute', url: 'https://www.xlri.ac.in/placements/', cycle_year: '2024-2025' },
  { name: 'Vellore Institute of Technology', url: 'https://vit.ac.in/placement', cycle_year: '2024-2025' },
  { name: 'Manipal Academy of Higher Education', url: 'https://manipal.edu/mu/placements.html', cycle_year: '2024-2025' },
];

// LPA / lakh / crore -> absolute INR.
function toInr(value, unit) {
  const v = parseFloat(value);
  if (!Number.isFinite(v)) return null;
  const u = String(unit || '').toLowerCase();
  if (u.includes('crore') || u.includes('cr')) return Math.round(v * 10000000);
  return Math.round(v * 100000); // LPA / lakh / lpa
}

// Extract placement figures from cleaned page text. Returns { fields, snippets }.
function extractPlacements(text) {
  const t = String(text || '');
  const fields = {};
  const snippets = [];
  const NUM = '([0-9]+(?:\\.[0-9]+)?)\\s*(lpa|lakhs?|crore|cr)';

  const grab = (labelRe, key) => {
    // label-before-number allows a small gap ("Average CTC of 9.5 lakhs"); but
    // number-before-label must be TIGHT (stat widgets render "35 LPA <label>"
    // adjacent), else "Average" could grab an earlier figure that belongs to
    // "Highest". 12-char window keeps the number bound to its own label.
    const re = new RegExp(`(?:${labelRe})[^.]{0,30}?${NUM}|${NUM}[^.]{0,12}?(?:${labelRe})`, 'i');
    const m = re.exec(t);
    if (!m) return;
    // the number/unit are in either (m[1],m[2]) or (m[3],m[4]) depending on order
    const val = m[1] || m[3];
    const unit = m[2] || m[4];
    const inr = toInr(val, unit);
    if (inr != null) { fields[key] = inr; snippets.push(`${key}: ${m[0].trim().slice(0, 70)}`); }
  };

  grab('highest(?:\\s+salary)?(?:\\s+(?:offer|package|ctc))?', 'highest_package_inr');
  grab('average(?:\\s+salary)?(?:\\s+(?:offer|package|ctc))?', 'average_package_inr');
  grab('median(?:\\s+salary)?(?:\\s+(?:offer|package|ctc))?', 'median_package_inr');

  // placement rate: "92% placed" / "placement rate 92%"
  let m = /([0-9]{1,3})\s*%[^.]{0,20}?placed|placement rate[^.]{0,10}?([0-9]{1,3})\s*%/i.exec(t);
  if (m) { const r = parseInt(m[1] || m[2], 10); if (r >= 0 && r <= 100) { fields.placement_rate_pct = r; snippets.push(`rate: ${m[0].trim()}`); } }

  return { fields, snippets };
}

async function fetchText(url, logger) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CollegeOS-PlacementsBot/1.0 (+https://collegeos.app/bot)' },
      redirect: 'follow', signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { logger.warn(`[${PARSER_NAME}] ${url} -> HTTP ${res.status}; skipping`); return null; }
    return await res.text();
  } catch (e) { logger.warn(`[${PARSER_NAME}] fetch failed for ${url}: ${e.message}; skipping`); return null; }
}

async function resolveInstitutionId(pool, name) {
  const r = await pool.query(`SELECT id FROM canonical.institutions WHERE canonical_name = $1 LIMIT 1`, [name]);
  return r.rows[0] ? r.rows[0].id : null;
}

async function fetchRows({ pool, logger = console }) {
  const rows = [];
  const now = new Date().toISOString();
  for (const target of TARGETS) {
    const institutionId = await resolveInstitutionId(pool, target.name); // eslint-disable-line no-await-in-loop
    if (!institutionId) { logger.warn(`[${PARSER_NAME}] no match for "${target.name}"; skipping`); continue; }
    const html = await fetchText(target.url, logger); // eslint-disable-line no-await-in-loop
    if (!html) continue;
    const { fields, snippets } = extractPlacements(cleanHtml(html));
    if (fields.highest_package_inr == null && fields.average_package_inr == null && fields.median_package_inr == null) {
      logger.warn(`[${PARSER_NAME}] no package figures from ${target.url}; skipping (not fabricating)`);
      continue;
    }
    rows.push({
      institution_id: institutionId,
      cycle_year: target.cycle_year,
      ...fields,
      currency: 'INR',
      source_url: target.url,
      source_type: 'official',
      confidence_score: 0.85,
      raw_payload: JSON.stringify({ institution: target.name, matched: snippets }),
      created_at: now,
      updated_at: now,
    });
    logger.info(`[${PARSER_NAME}] ${target.name}: ${snippets.join(' | ')}`);
  }
  return rows;
}

function validateRow(row) {
  if (!row.institution_id) return { valid: false, reason: 'missing institution_id' };
  if (!row.cycle_year) return { valid: false, reason: 'missing cycle_year' };
  const anyPkg = row.highest_package_inr || row.average_package_inr || row.median_package_inr;
  if (!anyPkg) return { valid: false, reason: 'no package figure' };
  return { valid: true };
}

const adapter = {
  name: 'institution-placements',
  source: 'institution official placements pages (primary source)',
  table: 'canonical.institution_placements',
  columns: [
    'institution_id', 'cycle_year', 'highest_package_inr', 'average_package_inr',
    'median_package_inr', 'placement_rate_pct', 'currency', 'source_url',
    'source_type', 'confidence_score', 'raw_payload', 'created_at', 'updated_at',
  ],
  conflictColumns: ['institution_id', 'cycle_year'],
  fetchRows,
  validateRow,
  requireNewRows: true,
};

module.exports = { adapter, extractPlacements, toInr, TARGETS };
