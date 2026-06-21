'use strict';

const model = require('../../src/services/ml/chancingModel');

describe('chancingModel inference', () => {
  test('artifact is loaded', () => {
    expect(model.isLoaded()).toBe(true);
  });

  test('returns null when required stats are missing (→ heuristic fallback)', () => {
    expect(model.predictAdmitProbability({ sat: 1400 }, {})).toBeNull(); // no acceptanceRate/medianSat
    expect(model.predictAdmitProbability({}, { acceptanceRate: 0.3, medianSat: 1300 })).toBeNull(); // no sat/act
  });

  test('produces a probability in (0,1) when inputs present', () => {
    const r = model.predictAdmitProbability({ sat: 1300, gpa: 3.7 }, { acceptanceRate: 0.3, medianSat: 1300 });
    expect(r).not.toBeNull();
    expect(r.source).toBe('model');
    expect(r.probability).toBeGreaterThan(0);
    expect(r.probability).toBeLessThan(1);
  });

  test('higher SAT → higher admit probability at the same college', () => {
    const lo = model.predictAdmitProbability({ sat: 1100 }, { acceptanceRate: 0.3, medianSat: 1300 }).probability;
    const hi = model.predictAdmitProbability({ sat: 1500 }, { acceptanceRate: 0.3, medianSat: 1300 }).probability;
    expect(hi).toBeGreaterThan(lo);
  });

  test('more selective college → lower admit probability for the same student', () => {
    const selective = model.predictAdmitProbability({ sat: 1500 }, { acceptanceRate: 0.05, medianSat: 1500 }).probability;
    const accessible = model.predictAdmitProbability({ sat: 1500 }, { acceptanceRate: 0.6, medianSat: 1500 }).probability;
    expect(selective).toBeLessThan(accessible);
  });

  test('ACT is converted to SAT when SAT absent', () => {
    const r = model.predictAdmitProbability({ act: 34 }, { acceptanceRate: 0.3, medianSat: 1300 });
    expect(r).not.toBeNull();
  });
});
