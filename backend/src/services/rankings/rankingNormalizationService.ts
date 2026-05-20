export type RankingSource = 'QS' | 'THE' | 'US_NEWS' | 'NIRF' | 'OTHER';
export type RankingSubject =
  | 'CS'
  | 'ENGINEERING'
  | 'BUSINESS'
  | 'MEDICINE'
  | 'PHYSICS'
  | 'MATHEMATICS'
  | 'ECONOMICS'
  | 'GENERAL';

export function normalizeSource(source: string): RankingSource {
  const s = String(source || '').trim().toUpperCase();
  if (s.includes('US') && s.includes('NEWS')) return 'US_NEWS';
  if (s.includes('NIRF')) return 'NIRF';
  if (s.includes('TIMES') || s === 'THE') return 'THE';
  if (s.includes('QS')) return 'QS';
  return 'OTHER';
}

export function normalizeSubject(subject: string | null | undefined): RankingSubject {
  const s = String(subject || '').trim().toLowerCase();
  if (!s) return 'GENERAL';
  if (s.includes('computer') || s === 'cs') return 'CS';
  if (s.includes('engineer')) return 'ENGINEERING';
  if (s.includes('business') || s.includes('management')) return 'BUSINESS';
  if (s.includes('medicine') || s.includes('medical')) return 'MEDICINE';
  if (s.includes('physics')) return 'PHYSICS';
  if (s.includes('math')) return 'MATHEMATICS';
  if (s.includes('econom')) return 'ECONOMICS';
  return 'GENERAL';
}

export function normalizeRankToScore(rank: number | null | undefined): number {
  if (!Number.isFinite(rank as number) || (rank as number) <= 0) return 0;
  const r = Number(rank);
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

