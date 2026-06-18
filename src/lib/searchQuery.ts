// Natural-language query parser for college discovery search.
// Turns inputs like "top cs usa", "cheap engineering canada", "colleges under 40k",
// "test optional", "high salary ai" into structured params for the
// canonical.search_colleges RPC. Pure, dependency-free, unit-testable.

export type SearchSort = 'relevance' | 'ranking' | 'tuition' | 'salary' | 'acceptance';

export interface ParsedSearch {
  entity: string | null; // school name / abbreviation for entity resolution
  keywords: string | null; // major / free-text for full-text matching
  country: string | null; // stored country_code form (mixed ISO / full-name)
  maxTuition: number | null;
  testOptional: boolean | null;
  sort: SearchSort;
}

// Country words -> the form actually stored in canonical (mixed ISO codes and
// full names, e.g. "CANADA" not "CA"). See audit 2026-06-18.
const COUNTRY_MAP: Array<[RegExp, string]> = [
  [/\b(usa|u\.?s\.?a?|america|american|united states)\b/, 'US'],
  [/\b(uk|u\.?k\.?|britain|british|england|english|scotland|united kingdom)\b/, 'GB'],
  [/\b(canada|canadian)\b/, 'CANADA'],
  [/\b(india|indian)\b/, 'IN'],
  [/\b(australia|australian|aussie)\b/, 'AUSTRALIA'],
  [/\b(germany|german|deutschland)\b/, 'DE'],
  [/\b(france|french)\b/, 'FR'],
  [/\b(ireland|irish)\b/, 'IE'],
  [/\b(south korea|korea|korean)\b/, 'SOUTH KOREA'],
  [/\b(japan|japanese)\b/, 'JAPAN'],
  [/\b(switzerland|swiss)\b/, 'SWITZERLAND'],
  [/\b(sweden|swedish)\b/, 'SWEDEN'],
];

// Major synonyms -> full-text keyword that matches institution_programs names
// (CIP titles, e.g. "Computer & Information Sciences", "Engineering", "Psychology").
const MAJOR_MAP: Array<[RegExp, string]> = [
  [/\b(cs|comp sci|computer science|computing|software|ai|artificial intelligence|machine learning|data science)\b/, 'computer science'],
  [/\b(engineering|eng|mechanical|electrical|civil engineering)\b/, 'engineering'],
  [/\b(psych|psychology)\b/, 'psychology'],
  [/\b(business|mba|management|finance|accounting)\b/, 'business'],
  [/\b(econ|economics)\b/, 'economics'],
  [/\b(bio|biology|biological|life sciences)\b/, 'biological'],
  [/\b(nursing|nurse)\b/, 'nursing'],
  [/\b(architecture|architect)\b/, 'architecture'],
  [/\b(law|legal)\b/, 'law'],
  [/\b(medicine|medical|pre-?med)\b/, 'health'],
  [/\b(art|arts|design|fine arts)\b/, 'arts'],
  [/\b(math|mathematics|statistics)\b/, 'mathematics'],
];

function parseTuitionCap(text: string): number | null {
  // "under 40k", "below $30,000", "< 25k", "less than 50000"
  const m = text.match(/(?:under|below|less than|cheaper than|max|<|≤)\s*\$?\s*([\d,]+)\s*(k|thousand)?/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return m[2] || n < 1000 ? n * 1000 : n;
}

export function parseSearchQuery(raw: string): ParsedSearch {
  const original = (raw ?? '').trim();
  let text = ` ${original.toLowerCase()} `;

  let country: string | null = null;
  for (const [re, code] of COUNTRY_MAP) {
    if (re.test(text)) { country = code; text = text.replace(re, ' '); break; }
  }

  let keywords: string | null = null;
  for (const [re, kw] of MAJOR_MAP) {
    if (re.test(text)) { keywords = kw; text = text.replace(re, ' '); break; }
  }

  const maxTuition = parseTuitionCap(text);
  if (maxTuition != null) text = text.replace(/(?:under|below|less than|cheaper than|max|<|≤)\s*\$?\s*[\d,]+\s*(k|thousand)?/i, ' ');

  const testOptional = /\btest[-\s]?optional\b/.test(text) ? true : null;
  if (testOptional) text = text.replace(/\btest[-\s]?optional\b/, ' ');

  let sort: SearchSort = 'relevance';
  if (/\b(top|best|elite|highest ranked|top ranked|t\d+|leading)\b/.test(text)) sort = 'ranking';
  else if (/\b(cheap|cheapest|affordable|low cost|budget|inexpensive|low tuition)\b/.test(text)) sort = 'tuition';
  else if (/\b(high salary|highest paid|high paying|best roi|top salary|best paying)\b/.test(text)) sort = 'salary';
  else if (/\b(easiest|high acceptance|easy to get)\b/.test(text)) sort = 'acceptance';
  text = text
    .replace(/\b(top|best|elite|highest ranked|top ranked|leading|cheap|cheapest|affordable|low cost|budget|inexpensive|low tuition|high salary|highest paid|high paying|best roi|top salary|best paying|easiest|high acceptance|easy to get)\b/g, ' ')
    .replace(/\b(colleges?|universit(?:y|ies)|schools?|in|for|with|the|and)\b/g, ' ');

  const residual = text.replace(/\s+/g, ' ').trim();
  const hasDiscoveryIntent = Boolean(country || keywords || maxTuition != null || testOptional || sort !== 'relevance');

  if (!hasDiscoveryIntent) {
    // Pure entity lookup: "uiuc", "carnegie mellon", "ivy league".
    return { entity: original || null, keywords: null, country: null, maxTuition: null, testOptional: null, sort: 'relevance' };
  }

  // Discovery query: residual (if meaningful) becomes additional keywords.
  if (!keywords && residual.length >= 3) keywords = residual;
  // A bare tuition cap with no explicit sort should order cheapest-first.
  if (sort === 'relevance' && maxTuition != null && !keywords) sort = 'tuition';

  return { entity: null, keywords, country, maxTuition, testOptional, sort };
}
