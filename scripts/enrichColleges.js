#!/usr/bin/env node
/**
 * Master college enrichment pipeline.
 * Usage: node scripts/enrichColleges.js
 */

import { createClient } from '@supabase/supabase-js';

const SCORECARD_FIELDS = [
  'school.name',
  'school.city',
  'school.state',
  'school.school_url',
  'school.carnegie_basic',
  'latest.admissions.admission_rate.overall',
  'latest.admissions.sat_scores.average.overall',
  'latest.admissions.act_scores.midpoint.cumulative',
  'latest.student.size',
  'latest.cost.attendance.academic_year',
  'latest.cost.avg_net_price.public',
  'latest.cost.tuition.in_state',
  'latest.cost.tuition.out_of_state',
  'latest.aid.pell_grant_rate',
  'latest.student.demographics.first_generation',
  'latest.student.demographics.share_international',
  'latest.completion.rate_suppressed.overall',
  'latest.student.retention_rate.overall.full_time',
].join(',');

const SCORED_FIELDS = [
  'acceptance_rate',
  'enrollment',
  'annual_cost_usd',
  'avg_sat',
  'avg_act',
  'avg_gpa',
  'international_student_pct',
  'graduation_rate',
  'majors_offered',
  'website_url',
  'campus_setting',
  'college_type',
  'overall_ranking',
];

const USD_TO_INR_RATE = Number(process.env.USD_TO_INR_RATE || 83);
const DELAY_MS = 500;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeString(v) {
  return String(v || '').trim().toLowerCase();
}

function isUsCollege(country) {
  const c = normalizeString(country);
  return c === 'united states' || c === 'usa' || c === 'us';
}

function isUkCollege(country) {
  const c = normalizeString(country);
  return ['united kingdom', 'uk', 'england', 'scotland', 'wales', 'northern ireland'].includes(c);
}

function isIndiaCollege(country) {
  return normalizeString(country) === 'india';
}

function computeQualityScore(record) {
  const filled = SCORED_FIELDS.filter((field) => {
    const value = record[field];
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return !Number.isNaN(value);
    return true;
  }).length;
  return Math.round((filled / SCORED_FIELDS.length) * 100);
}

function mapCarnegieType(code) {
  if (code === 15 || code === 16) return 'research_university';
  if (code === 21) return 'liberal_arts';
  if ([18, 19, 20].includes(code)) return 'technical';
  return null;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function fetchText(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

function containsName(rowText, collegeName) {
  return normalizeString(rowText).includes(normalizeString(collegeName));
}

async function enrichFromCollegeScorecard(collegeName) {
  const apiKey = process.env.SCORECARD_API_KEY;
  if (!apiKey) return null;

  const url = new URL('https://api.data.gov/ed/collegescorecard/v1/schools');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('school.name', collegeName);
  url.searchParams.set('_fields', SCORECARD_FIELDS);
  url.searchParams.set('_per_page', '1');

  const json = await fetchJson(url.toString());
  const row = json?.results?.[0];
  if (!row) return null;

  const annualCostUsd = row?.latest?.cost?.attendance?.academic_year ?? null;
  const carnegie = row?.school?.carnegie_basic ?? null;

  return {
    source: 'college_scorecard',
    sourceUrl: 'https://collegescorecard.ed.gov/data/',
    fields: {
      website_url: row?.school?.school_url ?? null,
      college_type: mapCarnegieType(carnegie),
      acceptance_rate: row?.latest?.admissions?.admission_rate?.overall != null
        ? row.latest.admissions.admission_rate.overall * 100
        : null,
      avg_sat: row?.latest?.admissions?.sat_scores?.average?.overall ?? null,
      avg_act: row?.latest?.admissions?.act_scores?.midpoint?.cumulative ?? null,
      enrollment: row?.latest?.student?.size ?? null,
      annual_cost_usd: annualCostUsd,
      annual_cost_inr: annualCostUsd != null ? Math.round(annualCostUsd * USD_TO_INR_RATE) : null,
      avg_net_price_usd: row?.latest?.cost?.avg_net_price?.public ?? null,
      tuition_in_state_usd: row?.latest?.cost?.tuition?.in_state ?? null,
      tuition_out_state_usd: row?.latest?.cost?.tuition?.out_of_state ?? null,
      pct_receiving_aid: row?.latest?.aid?.pell_grant_rate != null
        ? row.latest.aid.pell_grant_rate * 100
        : null,
      first_gen_pct: row?.latest?.student?.demographics?.first_generation != null
        ? row.latest.student.demographics.first_generation * 100
        : null,
      international_student_pct: row?.latest?.student?.demographics?.share_international != null
        ? row.latest.student.demographics.share_international * 100
        : null,
      graduation_rate: row?.latest?.completion?.rate_suppressed?.overall != null
        ? row.latest.completion.rate_suppressed.overall * 100
        : null,
      retention_rate: row?.latest?.student?.retention_rate?.overall?.full_time != null
        ? row.latest.student.retention_rate.overall.full_time * 100
        : null,
      campus_setting: row?.school?.city ? 'urban' : null,
    },
  };
}

async function enrichFromWikidata(collegeName) {
  const query = `
    SELECT ?college ?collegeLabel ?website ?enrollment ?country ?countryLabel WHERE {
      ?college wdt:P31 wd:Q3918.
      ?college rdfs:label "${collegeName.replace(/"/g, '\\"')}"@en.
      OPTIONAL { ?college wdt:P856 ?website. }
      OPTIONAL { ?college wdt:P1082 ?enrollment. }
      OPTIONAL { ?college wdt:P17 ?country. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 1
  `;
  const endpoint = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const json = await fetchJson(endpoint, {
    headers: {
      'User-Agent': 'CollegeOS-Enrichment/1.0 (contact: your@email.com)',
      Accept: 'application/sparql-results+json',
    },
  });

  const row = json?.results?.bindings?.[0];
  if (!row) return null;

  const entityUrl = row?.college?.value || '';
  const entityId = entityUrl.split('/').pop();
  const sourceUrl = entityId ? `https://www.wikidata.org/wiki/${entityId}` : 'https://www.wikidata.org/';

  return {
    source: 'wikidata',
    sourceUrl,
    fields: {
      website_url: row?.website?.value ?? null,
      enrollment: row?.enrollment?.value ? Number(row.enrollment.value) : null,
      country: row?.countryLabel?.value ?? null,
      campus_setting: null,
    },
  };
}

async function enrichFromUcas(collegeName) {
  const pageUrl = 'https://www.ucas.com/data-and-analysis/undergraduate-statistics-and-reports';
  const html = await fetchText(pageUrl);
  const csvMatches = [...html.matchAll(/https?:\/\/[^"'\\s]+\.csv/gi)].map((m) => m[0]);
  if (csvMatches.length === 0) return null;

  for (const csvUrl of csvMatches.slice(0, 3)) {
    try {
      const csv = await fetchText(csvUrl);
      const lines = csv.split('\n').filter(Boolean);
      if (lines.length < 2) continue;
      const header = lines[0].split(',').map((h) => normalizeString(h));
      const matchLine = lines.find((line) => containsName(line, collegeName));
      if (!matchLine) continue;
      const cols = matchLine.split(',');
      const idx = (name) => header.findIndex((h) => h.includes(name));
      const acceptanceIdx = idx('accept');
      const enrollmentIdx = idx('enrol');
      const intlIdx = idx('international');

      const acceptanceRate = acceptanceIdx >= 0 ? Number(cols[acceptanceIdx]?.replace(/[^\d.]/g, '')) : null;
      const enrollment = enrollmentIdx >= 0 ? Number(cols[enrollmentIdx]?.replace(/[^\d.]/g, '')) : null;
      const international_student_pct = intlIdx >= 0 ? Number(cols[intlIdx]?.replace(/[^\d.]/g, '')) : null;

      return {
        source: 'ucas',
        sourceUrl: csvUrl,
        fields: {
          acceptance_rate: Number.isFinite(acceptanceRate) ? acceptanceRate : null,
          enrollment: Number.isFinite(enrollment) ? enrollment : null,
          international_student_pct: Number.isFinite(international_student_pct) ? international_student_pct : null,
        },
      };
    } catch {
      // continue to next CSV
    }
  }
  return null;
}

async function enrichFromNirf(collegeName) {
  const url = 'https://www.nirfindia.org/rankings';
  const html = await fetchText(url);
  const rankRegex = new RegExp(`(\\d+)\\s*[\\|,:-]\\s*${collegeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const match = html.match(rankRegex);
  if (!match) return null;
  return {
    source: 'nirf',
    sourceUrl: 'https://www.nirfindia.org/rankings/2024/OverallRanking.html',
    fields: {
      overall_ranking: Number(match[1]),
      ranking_source: 'NIRF 2024',
    },
  };
}

async function enrichFromQs(collegeName) {
  const rankingsUrl = 'https://www.topuniversities.com/university-rankings';
  const html = await fetchText(rankingsUrl);
  const escaped = collegeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rankMatch = html.match(new RegExp(`(?:Rank|#)\\s*(\\d{1,4})[^\\n]{0,120}${escaped}`, 'i'));
  if (!rankMatch) return null;
  return {
    source: 'qs_rankings',
    sourceUrl: rankingsUrl,
    fields: {
      overall_ranking: Number(rankMatch[1]),
      ranking_source: 'QS',
    },
  };
}

function nonNullKeys(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === ''))
    .map(([k]) => k);
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: colleges, error } = await supabase
    .from('colleges')
    .select('*')
    .eq('needs_enrichment', true)
    .order('data_quality_score', { ascending: true });

  if (error) throw error;
  if (!colleges || colleges.length === 0) {
    console.log('No colleges need enrichment.');
    return;
  }

  let processed = 0;
  let sumQuality = 0;
  let reached70 = 0;

  for (const college of colleges) {
    const merged = { ...college };
    let sourceUsed = 'manual';
    let sourceUrl = merged.data_source_url || null;

    const sourceHandlers = [
      async () => (isUsCollege(college.country) ? enrichFromCollegeScorecard(college.name) : null),
      async () => enrichFromWikidata(college.name),
      async () => (isUkCollege(college.country) ? enrichFromUcas(college.name) : null),
      async () => (isIndiaCollege(college.country) ? enrichFromNirf(college.name) : null),
      async () => enrichFromQs(college.name),
    ];

    for (const getSource of sourceHandlers) {
      let result = null;
      try {
        result = await getSource();
      } catch {
        result = null;
      }
      if (!result) continue;

      Object.assign(merged, result.fields);
      sourceUsed = result.source;
      sourceUrl = result.sourceUrl;

      const score = computeQualityScore(merged);
      if (score >= 70) break;
    }

    const qualityScore = computeQualityScore(merged);
    const updatePayload = {
      ...Object.fromEntries(Object.entries(merged).filter(([k]) => !['id', 'created_at'].includes(k))),
      data_source: sourceUsed,
      data_source_url: sourceUrl,
      last_updated_at: new Date().toISOString(),
      data_quality_score: qualityScore,
      needs_enrichment: qualityScore < 70,
    };

    const { error: updateError } = await supabase
      .from('colleges')
      .update(updatePayload)
      .eq('id', college.id);

    if (updateError) {
      console.error(`❌ ${college.name}: update failed - ${updateError.message}`);
      await delay(DELAY_MS);
      continue;
    }

    processed += 1;
    sumQuality += qualityScore;
    if (qualityScore >= 70) reached70 += 1;

    const filledFields = nonNullKeys(updatePayload);
    console.log(
      `✅ ${college.name} | fields: ${filledFields.length} | source: ${sourceUsed} | quality: ${qualityScore}`
    );

    await delay(DELAY_MS);
  }

  const avg = processed > 0 ? (sumQuality / processed).toFixed(1) : '0.0';
  console.log('\n──────── Enrichment Summary ────────');
  console.log(`Total processed: ${processed}`);
  console.log(`Average quality score: ${avg}`);
  console.log(`Reached 70+: ${reached70}`);
  console.log('────────────────────────────────────');
}

main().catch((err) => {
  console.error('Enrichment failed:', err.message);
  process.exit(1);
});

