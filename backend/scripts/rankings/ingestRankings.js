#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const dbManager = require('../../src/config/database');

function normalizeSource(source) {
  const s = String(source || '').toUpperCase();
  if (s.includes('US') && s.includes('NEWS')) return 'US_NEWS';
  if (s.includes('NIRF')) return 'NIRF';
  if (s.includes('TIMES') || s === 'THE') return 'THE';
  if (s.includes('QS')) return 'QS';
  return 'OTHER';
}

function normalizeRankToScore(rank) {
  const r = Number(rank);
  if (!Number.isFinite(r) || r <= 0) return 0;
  if (r <= 10) return 100;
  if (r <= 25) return 95;
  if (r <= 50) return 90;
  if (r <= 100) return 85;
  if (r <= 200) return 78;
  if (r <= 300) return 70;
  if (r <= 500) return 62;
  if (r <= 1000) return 50;
  return 35;
}

function parseInput(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const text = fs.readFileSync(filePath, 'utf8');
  if (ext === '.json') return JSON.parse(text);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const out = {};
    headers.forEach((h, i) => { out[h] = cells[i] || null; });
    return out;
  });
}

async function resolveInstitutionId(pool, row) {
  const sourcePk = row.sourcePk || row.source_pk;
  if (sourcePk != null) {
    const mapped = await pool.query(
      `SELECT institution_id FROM canonical.institution_identity_map WHERE source_pk = $1::text LIMIT 1`,
      [String(sourcePk)]
    );
    if (mapped.rows[0]?.institution_id) return mapped.rows[0].institution_id;
  }
  const normalizedName = String(row.normalized_name || row.institutionName || row.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalizedName) return null;
  const byName = await pool.query(
    `SELECT id FROM canonical.institutions WHERE normalized_name = $1 LIMIT 1`,
    [normalizedName]
  );
  return byName.rows[0]?.id || null;
}

async function run(filePath) {
  if (!filePath) throw new Error('Usage: node backend/scripts/rankings/ingestRankings.js <file.csv|file.json>');
  dbManager.initialize();
  const pool = dbManager.getDatabase();
  const rows = parseInput(filePath);
  let upserted = 0;

  for (const row of rows) {
    const institutionId = await resolveInstitutionId(pool, row);
    if (!institutionId) continue;
    const globalRank = row.globalRank != null ? Number(row.globalRank) : (row.global_rank != null ? Number(row.global_rank) : null);
    const nationalRank = row.nationalRank != null ? Number(row.nationalRank) : (row.national_rank != null ? Number(row.national_rank) : null);
    const subjectRank = row.subjectRank != null ? Number(row.subjectRank) : (row.subject_rank != null ? Number(row.subject_rank) : null);
    const rankingScore = row.rankingScore != null ? Number(row.rankingScore) : normalizeRankToScore(globalRank || nationalRank || subjectRank);
    await pool.query(
      `INSERT INTO canonical.institution_rankings (
         institution_id, ranking_body, ranking_year, global_rank, national_rank, subject_rank, ranking_score
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (institution_id, ranking_body, ranking_year)
       DO UPDATE SET
         global_rank = COALESCE(EXCLUDED.global_rank, canonical.institution_rankings.global_rank),
         national_rank = COALESCE(EXCLUDED.national_rank, canonical.institution_rankings.national_rank),
         subject_rank = COALESCE(EXCLUDED.subject_rank, canonical.institution_rankings.subject_rank),
         ranking_score = COALESCE(EXCLUDED.ranking_score, canonical.institution_rankings.ranking_score)`,
      [
        institutionId,
        normalizeSource(row.rankingSource || row.source || row.ranking_body),
        Number(row.rankingYear || row.year || new Date().getFullYear()),
        globalRank,
        nationalRank,
        subjectRank,
        rankingScore,
      ]
    );
    upserted += 1;
  }

  console.log(JSON.stringify({ total: rows.length, upserted }, null, 2));
  await dbManager.close();
}

run(process.argv[2]).catch(async (error) => {
  console.error(error);
  try { await dbManager.close(); } catch (_) {}
  process.exit(1);
});

