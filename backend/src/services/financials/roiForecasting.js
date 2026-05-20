'use strict';

function projectRoi({ tuitionTotalUsd = 0, expectedSalaryUsd = 0, yearsToRecover = 6 }) {
  const tuition = Number(tuitionTotalUsd) || 0;
  const salary = Number(expectedSalaryUsd) || 0;
  const yearlyRecovery = salary * 0.24;
  const breakEvenYears = yearlyRecovery > 0 ? tuition / yearlyRecovery : 99;
  const roiScore = Math.max(0, Math.min(1, 1 - (breakEvenYears / Math.max(1, yearsToRecover * 2))));
  return {
    break_even_years: Number(breakEvenYears.toFixed(2)),
    roi_score: Number(roiScore.toFixed(6)),
    confidence: Number((0.45 + Math.min(0.45, salary / 200000)).toFixed(6)),
  };
}

module.exports = {
  projectRoi,
};
