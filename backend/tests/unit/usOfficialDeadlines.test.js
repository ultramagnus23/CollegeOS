'use strict';

const { cleanHtml, extractDeadlines, yearForMonth, toISODate } = require('../../src/scrapers/adapters/usOfficialDeadlines');

describe('usOfficialDeadlines extraction (pure, no network)', () => {
  test('cleanHtml strips scripts/styles/tags and collapses whitespace', () => {
    const html = '<style>.x{color:red}</style><div>Early Action <b>(EA)</b>\n  November 1</div><script>var a=1</script>';
    expect(cleanHtml(html)).toBe('Early Action (EA) November 1');
  });

  test('cleanHtml strips whitespaced end tags and decodes entities once (no double-unescape)', () => {
    // </script > with a space must still be stripped; &amp;nbsp; must NOT collapse
    // to a real space (single-pass decode leaves the literal text intact).
    const html = '<script>x=1</script\t\n bar><p>Tufts &amp; Co. &nbsp; Early Action November 1</p>';
    const out = cleanHtml(html);
    expect(out).toContain('Tufts & Co.');          // &amp; -> & exactly once
    expect(out).not.toContain('x=1');               // malformed end tag still stripped
    expect(out).toContain('Early Action November 1');
  });

  test('extracts EA + RD with page-derived dates and correct cycle years', () => {
    const text = 'Early Action (EA) Deadline Application Component November 1 ... Regular Action (RA) Deadline January 5 ...';
    const out = extractDeadlines(text);
    const byType = Object.fromEntries(out.map((d) => [d.deadline_type, d.deadline_date]));
    expect(byType.early_action).toBe('2025-11-01');     // Nov -> cycle start year 2025
    expect(byType.regular_decision).toBe('2026-01-05');  // Jan -> entry year 2026
  });

  test('Restrictive Early Action is classified as early_action (non-binding)', () => {
    const out = extractDeadlines('Restrictive Early Action November 1 Regular Decision January 2');
    const ea = out.find((d) => d.deadline_type === 'early_action');
    expect(ea).toBeTruthy();
    expect(ea.deadline_date).toBe('2025-11-01');
    expect(ea.is_binding).toBe(false);
  });

  test('does NOT fabricate when no date sits next to an anchor (JS-rendered nav)', () => {
    // Anchors present but dates are detached (in a separate table/DOM region).
    const text = 'Early Action Regular Decision Application with Optional Arts Portfolio Learn more Apply now';
    expect(extractDeadlines(text)).toEqual([]);
  });

  test('rejects implausible months (e.g. a May reply date next to an anchor)', () => {
    const out = extractDeadlines('Regular Decision reply by May 1');
    expect(out).toEqual([]); // May is outside the Sep–Mar deadline window
  });

  test('yearForMonth + toISODate', () => {
    expect(yearForMonth(11)).toBe(2025);
    expect(yearForMonth(1)).toBe(2026);
    expect(toISODate(2025, 11, 1)).toBe('2025-11-01');
  });
});
