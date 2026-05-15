type AnyRecord = Record<string, any>;

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function normalizePct(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n < 2) return null;
  if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
  if (n > 100) return null;
  return Math.min(1, Math.max(0, n));
}

export function normalizeLegacyCollege(raw: unknown): AnyRecord {
  const row = (raw && typeof raw === 'object') ? (raw as AnyRecord) : {};
  const financial = Array.isArray(row.college_financial_data) ? row.college_financial_data[0] : null;

  const type = firstDefined(row.type, row.institution_type, row.trust_tier, 'Unknown');
  const officialWebsite = firstDefined(row.official_website, row.website_url, row.website, null);
  const acceptanceRate = normalizePct(firstDefined(row.acceptance_rate, row.acceptanceRate));

  return {
    ...row,
    id: Number(row.id) || 0,
    name: String(firstDefined(row.name, row.college_name, 'Unknown College')),
    country: firstDefined(row.country, null),
    state: firstDefined(row.state, null),
    city: firstDefined(row.city, null),
    type,
    institution_type: firstDefined(row.institution_type, type),
    official_website: officialWebsite,
    website_url: firstDefined(row.website_url, officialWebsite),
    acceptance_rate: acceptanceRate,
    acceptanceRate: acceptanceRate,
    size_category: firstDefined(row.size_category, null),
    ranking: firstDefined(row.ranking, row.ranking_us_news, row.ranking_qs, row.ranking_the, null),
    tuition_cost: firstDefined(
      row.tuition_cost,
      row.tuition_international,
      financial?.tuition_international,
      row.tuition_domestic,
      financial?.tuition_out_state,
      financial?.tuition_in_state,
      null
    ),
    college_financial_data: Array.isArray(row.college_financial_data) ? row.college_financial_data : [],
    programs: Array.isArray(row.programs) ? row.programs : [],
    majorCategories: Array.isArray(row.majorCategories) ? row.majorCategories : [],
  };
}

export function normalizeLegacyRecommendation(raw: unknown): AnyRecord {
  const row = (raw && typeof raw === 'object') ? (raw as AnyRecord) : {};
  const normalizedCollege = normalizeLegacyCollege(row.college ?? row);
  const tier = String(firstDefined(row.tier, row.classification, 'target')).toLowerCase();
  const reasoning = Array.isArray(row.reasoning)
    ? row.reasoning.filter((r) => typeof r === 'string')
    : Array.isArray(row.why_values)
      ? row.why_values.filter((r) => typeof r === 'string')
      : [];

  return {
    ...row,
    id: Number(firstDefined(row.id, row.college_id, normalizedCollege.id)) || 0,
    college_id: Number(firstDefined(row.college_id, row.id, normalizedCollege.id)) || 0,
    name: String(firstDefined(row.name, row.college_name, normalizedCollege.name, 'Unknown College')),
    college_name: String(firstDefined(row.college_name, row.name, normalizedCollege.name, 'Unknown College')),
    country: firstDefined(row.country, normalizedCollege.country, null),
    state: firstDefined(row.state, normalizedCollege.state, null),
    overall_fit: Number(firstDefined(row.overall_fit, row.overall_score, 0)) || 0,
    overall_score: Number(firstDefined(row.overall_score, row.overall_fit, 0)) || 0,
    admit_chance: Number(firstDefined(row.admit_chance, 0)) || 0,
    tier,
    classification: tier,
    reasoning,
    why_values: reasoning,
    college: normalizedCollege,
  };
}

export function normalizeLegacyApplication(raw: unknown): AnyRecord {
  const row = (raw && typeof raw === 'object') ? (raw as AnyRecord) : {};
  const normalizedCollege = normalizeLegacyCollege(row);

  return {
    ...row,
    id: Number(row.id) || 0,
    college_id: Number(firstDefined(row.college_id, row.canonical_institution_id, normalizedCollege.id)) || 0,
    canonical_institution_id: Number(firstDefined(row.canonical_institution_id, row.college_id, normalizedCollege.id)) || 0,
    college_name: String(firstDefined(row.college_name, normalizedCollege.name, 'Unknown College')),
    country: firstDefined(row.country, normalizedCollege.country, null),
    official_website: firstDefined(row.official_website, normalizedCollege.official_website, null),
    status: String(firstDefined(row.status, 'researching')),
    application_type: firstDefined(row.application_type, null),
    priority: firstDefined(row.priority, 'medium'),
    notes: firstDefined(row.notes, null),
    created_at: String(firstDefined(row.created_at, new Date(0).toISOString())),
  };
}
