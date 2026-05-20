const { evaluateLoanFeasibility } = require('../../src/services/financials/loanFeasibility');

describe('loanFeasibility', () => {
  it('scores high for SBI-eligible country with collateral', () => {
    const result = evaluateLoanFeasibility({
      institution: { country: 'United States', global_rank: 30 },
      amountUsd: 45000,
      hasCollateral: true,
      profile: { usdInrRate: 83 },
    });

    expect(result.sbi_eligible).toBe(true);
    expect(result.feasibility_score).toBeGreaterThan(0.6);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it('requires collateral for high INR burden when collateral absent', () => {
    const result = evaluateLoanFeasibility({
      institution: { country: 'United States' },
      amountUsd: 70000,
      hasCollateral: false,
      profile: { usdInrRate: 83 },
    });

    expect(result.collateral_required).toBe(true);
    expect(result.risk_score).toBeGreaterThan(0.2);
  });
});
