// Single source of truth for per-page accent colors and purposeful multi-color
// systems (urgency, admission tier). Each page keeps ONE accent used for its
// own buttons/highlights/active states; anything that links to or represents
// that page elsewhere (e.g. Dashboard quick-action cards, nav icons) should
// pull the color from here instead of hardcoding its own hex, so the two
// never drift apart.
//
// Multi-color is only appropriate for two purposeful cases, not decoration:
//  - Deadlines: color by urgency (see URGENCY_COLORS)
//  - College recommendations/chancing: color by admission tier (see TIER_COLORS)

export const PAGE_ACCENTS = {
  dashboard: '#6C63FF',
  colleges: '#3B9EFF',
  chancing: '#3B9EFF',
  recommendations: '#6366F1',
  applications: '#3B9EFF',
  deadlines: '#6C63FF',
  essays: '#A855F7',
  documents: '#10B981',
  scholarships: '#A855F7',
  recommenders: '#F59E0B',
  timeline: '#6C63FF',
  settings: '#6C63FF',
} as const;

export type PageAccentKey = keyof typeof PAGE_ACCENTS;

// Overdue/imminent -> red, upcoming -> yellow, far out -> neutral green.
export const URGENCY_COLORS = {
  overdue: '#F87171',
  imminent: '#FB923C',
  upcoming: '#FBBF24',
  farOut: '#10B981',
} as const;

export function urgencyColorForDays(days: number): string {
  if (days < 0) return URGENCY_COLORS.overdue;
  if (days <= 7) return URGENCY_COLORS.imminent;
  if (days <= 30) return URGENCY_COLORS.upcoming;
  return URGENCY_COLORS.farOut;
}

// Reach/target/safety admission-chance tiers.
export const TIER_COLORS: Record<string, string> = {
  reach: '#F87171',
  target: '#FBBF24',
  safety: '#34D399',
  'long shot': '#A78BFA',
};

export function tierColor(classification?: string): string {
  return TIER_COLORS[classification?.toLowerCase() || ''] || TIER_COLORS.target;
}
