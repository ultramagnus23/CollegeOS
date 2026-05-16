import type { CollegeSearchResult } from '@/types/college';

export interface SearchRankingInput {
  term?: string;
  userCountry?: string;
}

export function rankSearchResults(rows: CollegeSearchResult[], input: SearchRankingInput = {}): CollegeSearchResult[] {
  const q = (input.term ?? '').trim().toLowerCase();

  return [...rows]
    .map((row) => {
      let score = 0;
      if (!q) score += 10;

      const name = row.name.toLowerCase();
      const location = ([((row as any).city ?? ''), ((row as any).state ?? ''), (row.country ?? '')].filter(Boolean).join(' ') || '').toLowerCase();
      const majors = (row.majors ?? []).join(' ').toLowerCase();

      if (q && name === q) score += 80;
      else if (q && name.startsWith(q)) score += 50;
      else if (q && name.includes(q)) score += 35;
      if (q && location.includes(q)) score += 15;
      if (q && majors.includes(q)) score += 10;

      if (input.userCountry && row.country === input.userCountry) score += 8;
      if (row.ranking != null) score += Math.max(0, 20 - row.ranking / 50);
      if (row.acceptanceRate != null) score += 5;

      return { row, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row);
}
