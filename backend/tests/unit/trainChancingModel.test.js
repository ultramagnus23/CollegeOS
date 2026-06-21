'use strict';

const { precisionRecall, featureImportance, buildRealDataset, ACT_TO_SAT } = require('../../ml/trainChancingModel');

describe('chancing trainer pure helpers', () => {
  test('precisionRecall — perfect separation', () => {
    const r = precisionRecall([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0], 0.5);
    expect(r).toMatchObject({ tp: 2, fp: 0, fn: 0, tn: 2, precision: 1, recall: 1, f1: 1 });
  });

  test('precisionRecall — mixed errors', () => {
    // preds at 0.5: [1,0,1,0]; labels [1,1,0,0] -> tp1 fn1 fp1 tn1
    const r = precisionRecall([0.9, 0.4, 0.6, 0.1], [1, 1, 0, 0], 0.5);
    expect(r).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 1, precision: 0.5, recall: 0.5 });
  });

  test('featureImportance — normalized to sum 1, sorted desc', () => {
    const imp = featureImportance([2, -1, 1], ['a', 'b', 'c']);
    expect(imp[0]).toMatchObject({ feature: 'a', importance: 0.5 });
    const total = imp.reduce((s, f) => s + f.importance, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });

  test('buildRealDataset — uses SAT, converts ACT, drops rows with neither', () => {
    const rows = [
      { gpa: 3.8, sat: 1500, act: null, outcome: 'accepted', msat: 1400, ar: 0.2 },
      { gpa: 3.0, sat: null, act: 30, outcome: 'rejected', msat: 1400, ar: 0.2 },
      { gpa: 3.0, sat: null, act: null, outcome: 'accepted', msat: 1400, ar: 0.2 }, // dropped
    ];
    const { X, y } = buildRealDataset(rows);
    expect(X).toHaveLength(2);
    expect(y).toEqual([1, 0]);
    // ACT 30 -> SAT 1370 -> sat_z = (1370-1400)/130
    expect(ACT_TO_SAT[30]).toBe(1370);
    expect(X[1][0]).toBeCloseTo((1370 - 1400) / 130, 5);
  });
});
