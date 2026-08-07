'use strict';

// ============================================================================
// Admissions-cycle derivation, shared by every deadline adapter.
//
// Why this exists: the cycle used to be hardcoded (`const CYCLE_YEAR =
// '2025-2026'`) in each adapter. When the calendar rolled past the end of that
// cycle the scrapers kept running green — they still fetched live pages and
// still upserted rows — but every row was stamped into the EXPIRED cycle, and
// every scraped month was mapped onto a year in the past. The result was a
// table with zero future-dated deadlines and no visible failure anywhere: the
// workflow was green, `inserted`/`updated` counts were non-zero, and the app
// silently showed users nothing. Deriving the cycle from the clock removes that
// whole failure mode.
//
// Cycle convention (US undergraduate, and the UK/UCAS calendar too):
//   The "YYYY-(YYYY+1)" cycle opens in August of YYYY and closes in July of
//   YYYY+1, admitting students who ENTER in Fall YYYY+1. So early deadlines
//   (Nov/Dec) fall in the start year, and regular deadlines (Jan-Mar) fall in
//   the entry year.
// ============================================================================

/** Month (1-12) at or after which a new cycle has opened. August. */
const CYCLE_ROLLOVER_MONTH = 8;

/**
 * Derive the admissions cycle that is currently open.
 *
 * @param {Date} [now] - defaults to the current time. Injectable for tests.
 * @returns {{
 *   cycleYear: string,       // e.g. '2026-2027'
 *   cycleYearKey: number,    // entry year, e.g. 2027
 *   cycleStartYear: number,  // e.g. 2026
 * }}
 */
function getCurrentCycle(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // getUTCMonth() is 0-indexed
  const cycleStartYear = month >= CYCLE_ROLLOVER_MONTH ? year : year - 1;
  const cycleYearKey = cycleStartYear + 1;
  return {
    cycleYear: `${cycleStartYear}-${cycleYearKey}`,
    cycleYearKey,
    cycleStartYear,
  };
}

/**
 * Map a deadline month onto the correct calendar year within a cycle.
 * Aug-Dec belong to the cycle's start year; Jan-Jul to the entry year.
 *
 * @param {number} month - 1-12, as parsed off the source page.
 * @param {{cycleStartYear: number, cycleYearKey: number}} cycle
 * @returns {number} four-digit year
 */
function yearForMonthInCycle(month, cycle) {
  return month >= CYCLE_ROLLOVER_MONTH ? cycle.cycleStartYear : cycle.cycleYearKey;
}

module.exports = { getCurrentCycle, yearForMonthInCycle, CYCLE_ROLLOVER_MONTH };
