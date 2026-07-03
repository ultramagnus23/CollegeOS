// Safe parsing for date-only strings (e.g. "2026-01-05", the shape every
// deadline/expiry date in this app comes back as — canonical.institution_deadlines
// .deadline_date is a plain SQL `date` column, PostgREST serializes it as a bare
// ISO date, no time or timezone component).
//
// THE BUG THIS FIXES: `new Date("2026-01-05")` is parsed by the JS spec as UTC
// MIDNIGHT, not local midnight. When later formatted with .toLocaleDateString()
// or compared against `new Date()` (which IS local time), that UTC instant gets
// converted to the browser's local timezone — for any user west of UTC (all of
// the Americas), that shifts the displayed date one day EARLIER than the real
// deadline, and can make "days until" countdowns/urgency levels wrong by a day
// too. Appending 'T00:00:00' (no 'Z') anchors the string to LOCAL midnight
// instead, which is what every one of these call sites actually means.
//
// Reported live 2026-07-03: MIT's regular-decision deadline is genuinely
// 2026-01-05 (verified against the live admissions page and the DB's raw
// stored value), but several UI components were displaying 2026-01-04.

export function parseDateOnly(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;
  // Already a full timestamp (has a time component) — parse as-is, don't
  // double-anchor it.
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00` : trimmed;
  const parsed = new Date(anchored);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Convenience: days between now and a date-only string, rounded up (matches
// the Math.ceil(...) pattern already used at every "days until" call site).
export function daysUntilDateOnly(dateStr: string | null | undefined): number | null {
  const parsed = parseDateOnly(dateStr);
  if (!parsed) return null;
  return Math.ceil((parsed.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
