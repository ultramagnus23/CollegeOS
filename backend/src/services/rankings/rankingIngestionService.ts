import { normalizeRankToScore, normalizeSource } from './rankingNormalizationService';
import { resolveInstitutionId } from './rankingResolver';
import { computePopularityScore } from './rankingScoring';

type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type RankingInputRecord = {
  institutionName?: string;
  slug?: string;
  alias?: string;
  sourcePk?: string | number;
  rankingSource: string;
  rankingYear: number;
  globalRank?: number | null;
  nationalRank?: number | null;
  subject?: string | null;
  subjectRank?: number | null;
  rankingScore?: number | null;
  sourceUrl?: string | null;
};

function parseCsv(csvText: string): RankingInputRecord[] {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    return {
      institutionName: row.institutionName || row.name,
      slug: row.slug || undefined,
      alias: row.alias || undefined,
      sourcePk: row.sourcePk || row.source_pk || undefined,
      rankingSource: row.rankingSource || row.source || 'OTHER',
      rankingYear: Number(row.rankingYear || row.year || new Date().getFullYear()),
      globalRank: row.globalRank ? Number(row.globalRank) : null,
      nationalRank: row.nationalRank ? Number(row.nationalRank) : null,
      subject: row.subject || null,
      subjectRank: row.subjectRank ? Number(row.subjectRank) : null,
      rankingScore: row.rankingScore ? Number(row.rankingScore) : null,
      sourceUrl: row.sourceUrl || row.source_url || null,
    };
  });
}

export function parseRankingPayload(payload: unknown): RankingInputRecord[] {
  if (Array.isArray(payload)) return payload as RankingInputRecord[];
  if (typeof payload === 'string') return parseCsv(payload);
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)) {
    return (payload as { data: RankingInputRecord[] }).data;
  }
  return [];
}

export async function ingestRankings(pool: Pool, payload: unknown) {
  const records = parseRankingPayload(payload);
  const upserted: Array<{ institutionId: string; source: string; year: number }> = [];

  for (const record of records) {
    const institutionId = await resolveInstitutionId(pool, record);
    if (!institutionId) continue;

    const rankingBody = normalizeSource(record.rankingSource);
    const rankingScore = record.rankingScore ?? normalizeRankToScore(record.globalRank ?? record.nationalRank ?? record.subjectRank);

    await pool.query(
      `INSERT INTO canonical.institution_rankings (
         institution_id, ranking_body, ranking_year,
         global_rank, national_rank, subject_rank, ranking_score
       )
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (institution_id, ranking_body, ranking_year)
       DO UPDATE SET
         global_rank = COALESCE(EXCLUDED.global_rank, canonical.institution_rankings.global_rank),
         national_rank = COALESCE(EXCLUDED.national_rank, canonical.institution_rankings.national_rank),
         subject_rank = COALESCE(EXCLUDED.subject_rank, canonical.institution_rankings.subject_rank),
         ranking_score = COALESCE(EXCLUDED.ranking_score, canonical.institution_rankings.ranking_score)`,
      [
        institutionId,
        rankingBody,
        record.rankingYear,
        record.globalRank ?? null,
        record.nationalRank ?? null,
        record.subjectRank ?? null,
        rankingScore,
      ]
    );

    upserted.push({ institutionId, source: rankingBody, year: Number(record.rankingYear) });
  }

  const touchedInstitutionIds = [...new Set(upserted.map((x) => x.institutionId))];
  for (const institutionId of touchedInstitutionIds) {
    const { rows } = await pool.query(
      `SELECT
         MIN(global_rank) AS best_global_rank,
         MAX(ranking_score) AS best_ranking_score
       FROM canonical.institution_rankings
       WHERE institution_id = $1::uuid`,
      [institutionId]
    );
    const bestGlobalRank = rows[0]?.best_global_rank != null ? Number(rows[0].best_global_rank) : null;
    const rankingOnlyScore = computePopularityScore({ globalRank: bestGlobalRank });
    await pool.query(
      `UPDATE canonical.institutions
          SET popularity_score = GREATEST(COALESCE(popularity_score, 0), $2)
        WHERE id = $1::uuid`,
      [institutionId, rankingOnlyScore]
    );
  }

  return {
    totalRecords: records.length,
    upserted: upserted.length,
    institutionsUpdated: touchedInstitutionIds.length,
  };
}
