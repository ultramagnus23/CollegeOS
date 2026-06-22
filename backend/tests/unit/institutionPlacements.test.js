'use strict';

const { extractPlacements, toInr } = require('../../src/scrapers/adapters/institutionPlacements');

describe('institutionPlacements extraction (pure)', () => {
  test('toInr normalizes LPA / lakh / crore to absolute INR', () => {
    expect(toInr('35', 'LPA')).toBe(3500000);
    expect(toInr('11.6', 'lakh')).toBe(1160000);
    expect(toInr('1.2', 'crore')).toBe(12000000);
    expect(toInr('x', 'LPA')).toBeNull();
  });

  test('extracts highest + average from real Ashoka text structure (number-before-label)', () => {
    // The shape ashoka.edu.in/placements/ renders (verified live 2026-06-22).
    const text = 'Placements 35 LPA Highest salary offer 11.6 LPA Average salary package';
    const { fields } = extractPlacements(text);
    expect(fields.highest_package_inr).toBe(3500000);
    expect(fields.average_package_inr).toBe(1160000);
  });

  test('extracts label-before-number ordering too', () => {
    const { fields } = extractPlacements('Highest package: 42 LPA. Average CTC of 9.5 lakhs.');
    expect(fields.highest_package_inr).toBe(4200000);
    expect(fields.average_package_inr).toBe(950000);
  });

  test('extracts placement rate', () => {
    expect(extractPlacements('92% of students placed in 2024').fields.placement_rate_pct).toBe(92);
    expect(extractPlacements('Placement rate 88% this year').fields.placement_rate_pct).toBe(88);
  });

  test('does not fabricate: prose with no package figures yields no fields', () => {
    const { fields } = extractPlacements('Our graduates pursue careers across industries worldwide.');
    expect(fields.highest_package_inr).toBeUndefined();
    expect(fields.average_package_inr).toBeUndefined();
  });
});
