'use strict';

const { getCurrentCycle, yearForMonthInCycle } = require('../../src/scrapers/admissionsCycle');
const { extractDeadlines } = require('../../src/scrapers/adapters/usOfficialDeadlines');

// Regression suite for the silent cycle-expiry bug: the deadline adapters used
// to hardcode `CYCLE_YEAR = '2025-2026'`. Once the calendar passed that cycle
// the scrapers still ran green and still reported non-zero inserted/updated
// counts, but every freshly-scraped date was stamped into the closed cycle and
// mapped onto a past year — so canonical.institution_deadlines held zero
// future-dated rows and the app showed users nothing, with no failing signal.

describe('getCurrentCycle', () => {
  it('opens a new cycle on 1 August', () => {
    expect(getCurrentCycle(new Date('2026-08-01T00:00:00Z'))).toEqual({
      cycleYear: '2026-2027', cycleYearKey: 2027, cycleStartYear: 2026,
    });
  });

  it('still reports the old cycle on 31 July', () => {
    expect(getCurrentCycle(new Date('2026-07-31T23:59:59Z'))).toEqual({
      cycleYear: '2025-2026', cycleYearKey: 2026, cycleStartYear: 2025,
    });
  });

  it('reports the same cycle in the January regular-decision peak', () => {
    expect(getCurrentCycle(new Date('2027-01-15T00:00:00Z'))).toEqual({
      cycleYear: '2026-2027', cycleYearKey: 2027, cycleStartYear: 2026,
    });
  });

  it('rolls forward year over year without code changes', () => {
    expect(getCurrentCycle(new Date('2030-09-01T00:00:00Z')).cycleYear).toBe('2030-2031');
  });
});

describe('yearForMonthInCycle', () => {
  const cycle = getCurrentCycle(new Date('2026-08-07T00:00:00Z'));

  it('puts Aug–Dec deadlines in the cycle start year', () => {
    expect(yearForMonthInCycle(11, cycle)).toBe(2026); // Nov — early deadlines
  });

  it('puts Jan–Jul deadlines in the entry year', () => {
    expect(yearForMonthInCycle(1, cycle)).toBe(2027); // Jan — regular deadlines
  });
});

describe('usOfficialDeadlines.extractDeadlines', () => {
  const cycle = getCurrentCycle(new Date('2026-08-07T00:00:00Z'));
  const pageText =
    'First-year applicants Early Action deadline November 1 and '
    + 'Regular Action deadline January 1 for fall entry.';

  it('dates extracted deadlines into the currently-open cycle', () => {
    expect(extractDeadlines(pageText, { cycle })).toEqual([
      { deadline_type: 'early_action',     deadline_date: '2026-11-01', is_binding: false, snippet: 'Early Action … November 1' },
      { deadline_type: 'regular_decision', deadline_date: '2027-01-01', is_binding: false, snippet: 'Regular Action … January 1' },
    ]);
  });

  it('never emits a deadline that has already passed', () => {
    const asOf = '2026-08-07';
    for (const d of extractDeadlines(pageText, { cycle })) {
      expect(d.deadline_date > asOf).toBe(true);
    }
  });
});
