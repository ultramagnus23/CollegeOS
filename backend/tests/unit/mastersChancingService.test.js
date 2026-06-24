'use strict';

const {
  MIN_SAMPLE,
  BAND,
  gpaToFourScale,
  bandsFromDatapoints,
  classifyAgainstBand,
  aggregateBands,
  pathwayApplies,
  assessProgram,
} = require('../../src/services/masters/mastersChancingService');

function makeDatapoints(n, gre_quant) {
  return Array.from({ length: n }, () => ({ gre_quant }));
}

describe('gpaToFourScale', () => {
  test('passes through a 4.0-scale GPA', () => {
    expect(gpaToFourScale(3.5, 4)).toBeCloseTo(3.5);
  });
  test('converts a 10-scale GPA proportionally', () => {
    expect(gpaToFourScale(8, 10)).toBeCloseTo(3.2);
  });
  test('converts a percentage (100-scale)', () => {
    expect(gpaToFourScale(90, 100)).toBeCloseTo(3.6);
  });
  test('null in -> null out', () => {
    expect(gpaToFourScale(null, 4)).toBeNull();
  });
});

describe('bandsFromDatapoints', () => {
  test('returns null below the minimum sample size', () => {
    expect(bandsFromDatapoints(makeDatapoints(MIN_SAMPLE - 1, 160), 'gre_quant')).toBeNull();
  });
  test('returns percentiles at/above the minimum sample size', () => {
    const band = bandsFromDatapoints(makeDatapoints(MIN_SAMPLE, 160), 'gre_quant');
    expect(band).not.toBeNull();
    expect(band.n).toBe(MIN_SAMPLE);
  });
});

describe('classifyAgainstBand', () => {
  const band = { p25: 155, p50: 160, p75: 165, n: 30 };
  test('below p25 -> below_typical', () => {
    expect(classifyAgainstBand(150, band)).toBe(BAND.BELOW);
  });
  test('between p25 and p75 -> within_typical', () => {
    expect(classifyAgainstBand(160, band)).toBe(BAND.WITHIN);
  });
  test('above p75 -> above_typical', () => {
    expect(classifyAgainstBand(168, band)).toBe(BAND.ABOVE);
  });
});

describe('aggregateBands', () => {
  test('any below dominates', () => {
    expect(aggregateBands([BAND.ABOVE, BAND.BELOW])).toBe(BAND.BELOW);
  });
  test('all above -> above', () => {
    expect(aggregateBands([BAND.ABOVE, BAND.ABOVE])).toBe(BAND.ABOVE);
  });
  test('mixed within/above -> within', () => {
    expect(aggregateBands([BAND.WITHIN, BAND.ABOVE])).toBe(BAND.WITHIN);
  });
});

describe('pathwayApplies', () => {
  test('work-experience pathway needs >= 3 years', () => {
    expect(pathwayApplies('work_experience_substitution', { work_experience_years: 5 })).toBe(true);
    expect(pathwayApplies('work_experience_substitution', { work_experience_years: 1 })).toBe(false);
  });
  test('standard-test pathway needs some test score', () => {
    expect(pathwayApplies('standard_test_based', { gre_quant: 160 })).toBe(true);
    expect(pathwayApplies('standard_test_based', {})).toBe(false);
  });
  test('holistic pathway always applies', () => {
    expect(pathwayApplies('test_waived_holistic', {})).toBe(true);
  });
});

describe('assessProgram', () => {
  test('below published minimum GPA -> below_typical via published_minimum', () => {
    const profile = { undergrad_gpa: 2.5, undergrad_gpa_scale: 4, gre_quant: 165 };
    const program = { id: 'p1', min_gpa: 3.0, min_gpa_scale: 4, gre_requirement: 'required' };
    const pathways = [{ pathway_type: 'standard_test_based', weighted_fields: ['gre_quant'] }];
    const out = assessProgram(profile, program, pathways, []);
    const std = out.pathways.find((p) => p.pathwayType === 'standard_test_based');
    expect(std.band).toBe(BAND.BELOW);
    expect(std.basis).toBe('published_minimum');
  });

  test('no data and no published minimum -> insufficient_data, with checklist + disclosures', () => {
    const profile = { gre_quant: 160 };
    const program = { id: 'p2', gre_requirement: 'optional' };
    const out = assessProgram(profile, program, [{ pathway_type: 'standard_test_based', weighted_fields: ['gre_quant'] }], []);
    expect(out.overall.band).toBe(BAND.INSUFFICIENT);
    expect(out.checklist.length).toBeGreaterThan(0);
    expect(out.disclosures.length).toBeGreaterThan(0);
    // band is a string enum, and we never emit a numeric percentage/probability value
    expect(typeof out.overall.band).toBe('string');
    expect(out.overall).not.toHaveProperty('admitChance');
    expect(JSON.stringify(out)).not.toMatch(/\b\d+(\.\d+)?\s*%/);
  });

  test('strong applicant within a self-reported band -> within/above (best pathway wins overall)', () => {
    const profile = { gre_quant: 168, undergrad_gpa: 3.9, undergrad_gpa_scale: 4 };
    const program = { id: 'p3', gre_requirement: 'required' };
    const datapoints = makeDatapoints(30, 160); // p75 ~160, applicant 168 -> above
    const out = assessProgram(profile, program, [{ pathway_type: 'standard_test_based', weighted_fields: ['gre_quant'] }], datapoints);
    expect([BAND.ABOVE, BAND.WITHIN]).toContain(out.overall.band);
    expect(out.sampleSize).toBe(30);
  });

  test('MBA work-experience pathway is assessed when 5+ yrs even without GRE', () => {
    const profile = { work_experience_years: 6, undergrad_gpa: 3.4, undergrad_gpa_scale: 4 };
    const program = { id: 'p4', gmat_requirement: 'waived' };
    const pathways = [
      { pathway_type: 'standard_test_based', weighted_fields: ['gmat_total'] },
      { pathway_type: 'work_experience_substitution', weighted_fields: ['work_experience_years'] },
    ];
    const out = assessProgram(profile, program, pathways, []);
    // standard pathway does NOT apply (no test score); work-experience one does.
    expect(out.pathways.some((p) => p.pathwayType === 'work_experience_substitution')).toBe(true);
    expect(out.pathways.some((p) => p.pathwayType === 'standard_test_based')).toBe(false);
  });
});
