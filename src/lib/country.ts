const COUNTRY_NAME_BY_CODE: Record<string, string> = {
  US: 'United States',
  IN: 'India',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  CA: 'Canada',
  AU: 'Australia',
  SG: 'Singapore',
  AE: 'United Arab Emirates',
  NL: 'Netherlands',
  CH: 'Switzerland',
  CN: 'China',
  JP: 'Japan',
};

const COUNTRY_CODE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTRY_NAME_BY_CODE).map(([code, name]) => [name.toLowerCase(), code]),
);

const DEFAULT_THEME = {
  accent: '#3B9EFF',
  border: 'rgba(59,158,255,0.40)',
  chipBg: 'rgba(59,158,255,0.12)',
  hoverGlow: 'rgba(59,158,255,0.12)',
  gradient: 'from-blue-600 to-blue-800',
};

export const COUNTRY_THEME: Record<string, typeof DEFAULT_THEME> = {
  US: { accent: '#3B82F6', border: 'rgba(59,130,246,0.40)', chipBg: 'rgba(59,130,246,0.12)', hoverGlow: 'rgba(59,130,246,0.12)', gradient: 'from-blue-600 to-blue-900' },
  IN: { accent: '#F97316', border: 'rgba(249,115,22,0.40)', chipBg: 'rgba(249,115,22,0.12)', hoverGlow: 'rgba(249,115,22,0.12)', gradient: 'from-orange-500 to-orange-800' },
  GB: { accent: '#EF4444', border: 'rgba(239,68,68,0.40)', chipBg: 'rgba(239,68,68,0.12)', hoverGlow: 'rgba(239,68,68,0.12)', gradient: 'from-red-600 to-red-900' },
  DE: { accent: '#06B6D4', border: 'rgba(6,182,212,0.40)', chipBg: 'rgba(6,182,212,0.12)', hoverGlow: 'rgba(6,182,212,0.12)', gradient: 'from-emerald-600 to-emerald-900' },
  FR: { accent: '#8B5CF6', border: 'rgba(139,92,246,0.40)', chipBg: 'rgba(139,92,246,0.12)', hoverGlow: 'rgba(139,92,246,0.12)', gradient: 'from-emerald-600 to-emerald-900' },
  CA: { accent: '#DC2626', border: 'rgba(220,38,38,0.40)', chipBg: 'rgba(220,38,38,0.12)', hoverGlow: 'rgba(220,38,38,0.12)', gradient: 'from-red-500 to-rose-800' },
  AU: { accent: '#0D9488', border: 'rgba(13,148,136,0.40)', chipBg: 'rgba(13,148,136,0.12)', hoverGlow: 'rgba(13,148,136,0.12)', gradient: 'from-teal-600 to-teal-900' },
  SG: { accent: '#EC4899', border: 'rgba(236,72,153,0.40)', chipBg: 'rgba(236,72,153,0.12)', hoverGlow: 'rgba(236,72,153,0.12)', gradient: 'from-purple-600 to-purple-900' },
  CN: { accent: '#F97316', border: 'rgba(249,115,22,0.40)', chipBg: 'rgba(249,115,22,0.12)', hoverGlow: 'rgba(249,115,22,0.12)', gradient: 'from-purple-600 to-purple-900' },
  JP: { accent: '#E11D48', border: 'rgba(225,29,72,0.40)', chipBg: 'rgba(225,29,72,0.12)', hoverGlow: 'rgba(225,29,72,0.12)', gradient: 'from-purple-600 to-purple-900' },
};

const titleCase = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());

export function normalizeCountryCode(input: string | null | undefined): string | null {
  const value = String(input ?? '').trim();
  if (!value) return null;
  if (/^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
  return COUNTRY_CODE_BY_NAME[value.toLowerCase()] ?? null;
}

export function formatCountryName(input: string | null | undefined): string {
  const value = String(input ?? '').trim();
  if (!value) return 'Unknown';
  const code = normalizeCountryCode(value);
  if (code && COUNTRY_NAME_BY_CODE[code]) return COUNTRY_NAME_BY_CODE[code];
  return titleCase(value);
}

export function getCountryTheme(input: string | null | undefined) {
  const code = normalizeCountryCode(input);
  return (code && COUNTRY_THEME[code]) || DEFAULT_THEME;
}

