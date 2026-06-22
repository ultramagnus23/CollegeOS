'use strict';

const { normalizeCountry } = require('../../src/services/timelineService');

describe('timelineService.normalizeCountry', () => {
  test('maps US display names + aliases to US', () => {
    for (const v of ['United States', 'USA', 'usa', 'US', 'u.s.a.', 'America']) {
      expect(normalizeCountry(v)).toBe('US');
    }
  });
  test('maps UK variants to UK', () => {
    for (const v of ['United Kingdom', 'UK', 'GB', 'Britain', 'England']) {
      expect(normalizeCountry(v)).toBe('UK');
    }
  });
  test('maps Canada / India', () => {
    expect(normalizeCountry('Canada')).toBe('Canada');
    expect(normalizeCountry('CA')).toBe('Canada');
    expect(normalizeCountry('India')).toBe('India');
    expect(normalizeCountry('IN')).toBe('India');
  });
  test('passes through unknown / empty', () => {
    expect(normalizeCountry('Germany')).toBe('Germany');
    expect(normalizeCountry('')).toBe('');
    expect(normalizeCountry(null)).toBe(null);
  });
  test('does not false-match (Australia is not US despite containing no us-token)', () => {
    expect(normalizeCountry('Australia')).toBe('Australia');
  });
});
