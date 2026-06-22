'use strict';

const { parseNirfRankings, normalize } = require('../../src/scrapers/adapters/nirfRankings');

const SAMPLE = `
<table id="tbl_overall"><thead><tr><th>Institute ID</th><th>Name</th><th>City</th><th>State</th><th>Score</th><th>Rank</th></tr></thead>
<tbody>
<tr><td>IR-O-U-0456</td><td>Indian Institute of Technology Madras<div style="float:right;"><a>More Details</a></div></td><td>Chennai</td><td>Tamil Nadu</td><td>86.0</td><td>1</td></tr>
<tr><td>IR-O-U-0220</td><td>Indian Institute of Science, Bengaluru<div>More Details<table><tbody><tr><td>nested</td></tr></tbody></table></div></td><td>Bengaluru</td><td>Karnataka</td><td>83.0</td><td>2</td></tr>
<tr><td>IR-O-U-0306</td><td>Indian Institute of Technology Bombay<div>x</div></td><td>Mumbai</td><td>Maharashtra</td><td>82.0</td><td>3</td></tr>
</tbody></table>`;

describe('parseNirfRankings (pure)', () => {
  test('extracts institutions in rank order, names before the nested div', () => {
    const rows = parseNirfRankings(SAMPLE);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ institute_id: 'IR-O-U-0456', name: 'Indian Institute of Technology Madras', rank: 1 });
    expect(rows[1]).toMatchObject({ name: 'Indian Institute of Science, Bengaluru', rank: 2 });
    expect(rows[2]).toMatchObject({ name: 'Indian Institute of Technology Bombay', rank: 3 });
  });

  test('does not double-count nested sub-table rows (dedup by institute id)', () => {
    // The IISc row contains a nested <table><tbody><tr>; must not become extra rows.
    expect(parseNirfRankings(SAMPLE).map((r) => r.institute_id)).toEqual(['IR-O-U-0456', 'IR-O-U-0220', 'IR-O-U-0306']);
  });

  test('empty / non-NIRF html yields nothing', () => {
    expect(parseNirfRankings('<html><body>no rankings here</body></html>')).toEqual([]);
  });

  test('normalize strips punctuation/case for matching', () => {
    expect(normalize('Indian Institute of Science, Bengaluru')).toBe('indian institute of science bengaluru');
  });
});
