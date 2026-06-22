'use strict';

const { extractFromHtml } = require('../../scripts/enrichFromWebsites');

describe('enrichFromWebsites.extractFromHtml (pure)', () => {
  test('meta description (name then content)', () => {
    const h = '<meta name="description" content="A leading liberal arts university in Sonipat, India.">';
    expect(extractFromHtml(h).description).toBe('A leading liberal arts university in Sonipat, India.');
  });

  test('og:description (content then property)', () => {
    const h = '<meta content="University of Canberra is a public research university." property="og:description">';
    expect(extractFromHtml(h).description).toBe('University of Canberra is a public research university.');
  });

  test('founding year variants', () => {
    expect(extractFromHtml('Established in 1969 as a public university.').established_year).toBe(1969);
    expect(extractFromHtml('Ashoka, since 2014.').established_year).toBe(2014);
    expect(extractFromHtml('Founded 1875.').established_year).toBe(1875);
  });

  test('rejects implausible / absent year', () => {
    expect(extractFromHtml('established in 3050').established_year).toBeUndefined();
    expect(extractFromHtml('no year here').established_year).toBeUndefined();
  });

  test('no extractable data → empty object (no fabrication)', () => {
    expect(extractFromHtml('<html><body><nav>Home About</nav></body></html>')).toEqual({});
  });

  test('decodes entities in description', () => {
    const h = '<meta name="description" content="Arts &amp; Sciences at a world-class campus.">';
    expect(extractFromHtml(h).description).toBe('Arts & Sciences at a world-class campus.');
  });

  test('extracts acceptance rate as a 0-1 fraction when stated', () => {
    expect(extractFromHtml('Our acceptance rate is 7%.').acceptance_rate).toBe(0.07);
    expect(extractFromHtml('With a 4.5% admit rate, admission is selective.').acceptance_rate).toBe(0.045);
    expect(extractFromHtml('A 32% acceptance rate.').acceptance_rate).toBe(0.32);
  });

  test('does not invent an acceptance rate from unrelated percentages', () => {
    expect(extractFromHtml('95% of graduates are employed within 6 months.').acceptance_rate).toBeUndefined();
  });
});
