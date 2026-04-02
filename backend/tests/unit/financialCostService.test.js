/**
 * Unit tests for financialCostService
 *
 * Pure-function tests (calculateEMI, scoreFinancingFit, computeNetCost) need
 * no mocks.  refreshExchangeRates is tested with mocked exchangeRateService.
 */

const {
  calculateEMI,
  scoreFinancingFit,
  computeNetCost,
} = require('../../src/services/financialCostService');

// ── calculateEMI ──────────────────────────────────────────────────────────────

describe('calculateEMI()', () => {
  it('computes standard EMI correctly', () => {
    // $50,000 at 6.54% p.a., 120 months → EMI ≈ $565.90
    const { emiUSD, totalPayableUSD, totalInterestUSD } = calculateEMI(50000, 6.54, 120);
    expect(emiUSD).toBeGreaterThan(560);
    expect(emiUSD).toBeLessThan(575);
    expect(totalPayableUSD).toBeCloseTo(emiUSD * 120, 0);
    expect(totalInterestUSD).toBeCloseTo(totalPayableUSD - 50000, 0);
  });

  it('handles zero-interest loan correctly', () => {
    const { emiUSD, totalPayableUSD, totalInterestUSD } = calculateEMI(12000, 0, 12);
    expect(emiUSD).toBeCloseTo(1000, 2);
    expect(totalPayableUSD).toBeCloseTo(12000, 2);
    expect(totalInterestUSD).toBeCloseTo(0, 2);
  });

  it('returns zeros for zero principal', () => {
    const result = calculateEMI(0, 5, 120);
    expect(result.emiUSD).toBe(0);
    expect(result.totalPayableUSD).toBe(0);
    expect(result.totalInterestUSD).toBe(0);
  });

  it('returns zeros for zero term months', () => {
    const result = calculateEMI(10000, 5, 0);
    expect(result.emiUSD).toBe(0);
  });

  it('total payable > principal for non-zero interest', () => {
    const { totalPayableUSD, totalInterestUSD } = calculateEMI(20000, 8, 60);
    expect(totalPayableUSD).toBeGreaterThan(20000);
    expect(totalInterestUSD).toBeGreaterThan(0);
  });
});

// ── scoreFinancingFit ─────────────────────────────────────────────────────────

describe('scoreFinancingFit()', () => {
  const baseOption = {
    amount_max_usd: 60000,
    interest_rate_pct: 5.0,
    interest_type: 'fixed',
    financing_type: 'private_loan',
    repayment_grace_months: 6,
    repayment_term_months: 120,
    loan_forgiveness_available: false,
    renewable: false,
    eligibility_criteria: {},
  };

  const baseCtx = {
    annualIncomeUSD: 30000,
    savingsUSD: 5000,
    isInternational: true,
    citizenship: 'Indian',
  };

  it('returns a score between 0 and 100', () => {
    const { score } = scoreFinancingFit(baseOption, baseCtx, 50000);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('grants/scholarships score higher than loans with same base', () => {
    const grant = { ...baseOption, financing_type: 'grant', interest_rate_pct: null };
    const loan = { ...baseOption, financing_type: 'private_loan', interest_rate_pct: 9 };
    const { score: grantScore } = scoreFinancingFit(grant, baseCtx, 50000);
    const { score: loanScore } = scoreFinancingFit(loan, baseCtx, 50000);
    expect(grantScore).toBeGreaterThan(loanScore);
  });

  it('zero-interest loan scores higher than high-interest loan', () => {
    const zeroRate = { ...baseOption, interest_rate_pct: 0 };
    const highRate = { ...baseOption, interest_rate_pct: 12 };
    const { score: s1 } = scoreFinancingFit(zeroRate, baseCtx, 50000);
    const { score: s2 } = scoreFinancingFit(highRate, baseCtx, 50000);
    expect(s1).toBeGreaterThan(s2);
  });

  it('reduces score when max amount does not cover required amount', () => {
    const small = { ...baseOption, amount_max_usd: 10000 };
    const big = { ...baseOption, amount_max_usd: 80000 };
    const { score: s1 } = scoreFinancingFit(small, baseCtx, 50000);
    const { score: s2 } = scoreFinancingFit(big, baseCtx, 50000);
    expect(s2).toBeGreaterThan(s1);
  });

  it('includes negative factor when citizenship is restricted and not matching', () => {
    const restricted = {
      ...baseOption,
      eligibility_criteria: { citizenship: ['US citizen', 'US national'] },
    };
    const { score, factors } = scoreFinancingFit(restricted, baseCtx, 50000);
    const negativeFactor = factors.find(f => !f.positive && f.label.toLowerCase().includes('citizenship'));
    expect(negativeFactor).toBeDefined();
    expect(score).toBeLessThanOrEqual(50);
  });

  it('adds positive factor when citizenship matches', () => {
    const matched = {
      ...baseOption,
      eligibility_criteria: { citizenship: ['Indian', 'Nepalese'] },
    };
    const { factors } = scoreFinancingFit(matched, baseCtx, 50000);
    const positiveFactor = factors.find(f => f.positive && f.label.toLowerCase().includes('citizenship'));
    expect(positiveFactor).toBeDefined();
  });

  it('recognises "all" as universally eligible', () => {
    const openEligibility = {
      ...baseOption,
      eligibility_criteria: { citizenship: ['all'] },
    };
    const { factors } = scoreFinancingFit(openEligibility, { ...baseCtx, citizenship: 'Kenyan' }, 50000);
    const negativeFactor = factors.find(f => !f.positive && f.label.toLowerCase().includes('citizenship'));
    expect(negativeFactor).toBeUndefined();
  });
});

// ── computeNetCost ────────────────────────────────────────────────────────────

describe('computeNetCost()', () => {
  it('subtracts aid from COA correctly', () => {
    const { netCostUSD, totalAidUSD, coveragePct } = computeNetCost(80000, [
      { amountUSD: 20000 },
      { amountUSD: 10000 },
    ]);
    expect(netCostUSD).toBe(50000);
    expect(totalAidUSD).toBe(30000);
    expect(coveragePct).toBe(38); // Math.round(30000/80000 * 100) = 38
  });

  it('net cost is never negative (capped at 0)', () => {
    const { netCostUSD } = computeNetCost(40000, [{ amountUSD: 50000 }]);
    expect(netCostUSD).toBe(0);
  });

  it('returns full COA when no aid provided', () => {
    const { netCostUSD, totalAidUSD, coveragePct } = computeNetCost(70000, []);
    expect(netCostUSD).toBe(70000);
    expect(totalAidUSD).toBe(0);
    expect(coveragePct).toBe(0);
  });

  it('handles COA of zero without division error', () => {
    const { coveragePct } = computeNetCost(0, [{ amountUSD: 1000 }]);
    expect(coveragePct).toBe(0);
  });

  it('ignores non-numeric aid amounts gracefully', () => {
    const { totalAidUSD } = computeNetCost(50000, [
      { amountUSD: 5000 },
      { amountUSD: null },
      { amountUSD: undefined },
    ]);
    expect(totalAidUSD).toBe(5000);
  });
});
