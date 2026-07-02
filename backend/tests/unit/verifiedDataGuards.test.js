const { validateBeforeWrite } = require('../../src/utils/verifiedDataGuards');

describe('verifiedDataGuards.validateBeforeWrite', () => {
  // --- Rule 1: missing source -----------------------------------------
  it('rejects a write with no source at all', () => {
    const result = validateBeforeWrite({ tuition_domestic: 42000 });
    expect(result.decision).toBe('reject');
    expect(result.reasons.some((r) => r.includes("'source' is null/empty"))).toBe(true);
  });

  it('rejects a write with empty source_attribution ({}), the pre-provenance shape', () => {
    const result = validateBeforeWrite({
      tuition_domestic: 42000,
      source_attribution: {},
    });
    expect(result.decision).toBe('reject');
  });

  // --- Rule 2: verification_status === 'unknown' ------------------------
  it("rejects a write with verification_status = 'unknown'", () => {
    const result = validateBeforeWrite({
      source: 'college_scorecard',
      verification_status: 'unknown',
      tuition_domestic: 42000,
    });
    expect(result.decision).toBe('reject');
    expect(result.reasons.some((r) => r.includes('unknown'))).toBe(true);
  });

  // --- Rule 3: low confidence flags but does not reject -----------------
  it('flags (does not reject) a low-confidence value with a real source', () => {
    const result = validateBeforeWrite({
      source: 'manual_curation',
      verification_status: 'estimated',
      confidence: 0.3,
      tuition_domestic: 41250,
    });
    expect(result.decision).toBe('flag');
    expect(result.reasons.some((r) => r.includes('confidence'))).toBe(true);
  });

  it('does not flag confidence at/above the default threshold', () => {
    const result = validateBeforeWrite({
      source: 'college_scorecard',
      verification_status: 'government_verified',
      confidence: 0.9,
      tuition_domestic: 41250,
    });
    expect(result.decision).toBe('allow');
  });

  // --- Rule 4: known-fabricated exact values -----------------------------
  it('rejects admission_difficulty exactly 50.0 (the masters_enrichment.py baseline)', () => {
    const result = validateBeforeWrite({
      source: 'masters_enrichment',
      verification_status: 'inferred',
      admission_difficulty: 50.0,
    });
    expect(result.decision).toBe('reject');
    expect(result.reasons.some((r) => r.includes('admission_difficulty'))).toBe(true);
  });

  it('rejects funding_attractiveness exactly 0.0 (the masters_enrichment.py baseline)', () => {
    const result = validateBeforeWrite({
      source: 'masters_enrichment',
      verification_status: 'inferred',
      funding_attractiveness: 0.0,
    });
    expect(result.decision).toBe('reject');
  });

  it('flags (does not reject) acceptance_rate exactly 0.5 with a real source, per the honesty note', () => {
    const result = validateBeforeWrite({
      source: 'college_scorecard',
      verification_status: 'government_verified',
      confidence: 0.9,
      acceptance_rate: 0.5,
    });
    // 0.5 is a flag-only signal for acceptance_rate: a real college can have
    // exactly a 50% acceptance rate. The hard defense is the source/status
    // checks above, which this record legitimately passes.
    expect(result.decision).toBe('flag');
    expect(result.reasons.some((r) => r.includes('acceptance_rate'))).toBe(true);
  });

  it('rejects acceptance_rate = 0.5 with no source at all (the actual historical bug)', () => {
    const result = validateBeforeWrite({ acceptance_rate: 0.5 });
    expect(result.decision).toBe('reject');
  });

  it('does not flag admission_difficulty for an unrelated, non-baseline value', () => {
    const result = validateBeforeWrite({
      source: 'masters_enrichment',
      verification_status: 'inferred',
      confidence: 0.8,
      admission_difficulty: 63.4,
    });
    expect(result.decision).toBe('allow');
  });

  // --- Rule 5: round-number money heuristic (flag only) -------------------
  it('flags a round-number tuition value as a heuristic signal, not a reject', () => {
    const result = validateBeforeWrite(
      {
        source: 'manual_curation',
        verification_status: 'estimated',
        confidence: 0.9,
        tuition_domestic: 12000,
      },
      { moneyFields: ['tuition_domestic'] }
    );
    expect(result.decision).toBe('flag');
    expect(result.reasons.some((r) => r.includes('multiple of 1000'))).toBe(true);
  });

  it('does not flag a non-round tuition value', () => {
    const result = validateBeforeWrite(
      {
        source: 'college_scorecard',
        verification_status: 'government_verified',
        confidence: 0.95,
        tuition_domestic: 41873,
      },
      { moneyFields: ['tuition_domestic'] }
    );
    expect(result.decision).toBe('allow');
  });

  // --- Fully valid record passes clean ------------------------------------
  it('allows a normal, well-attributed real record with no issues', () => {
    const result = validateBeforeWrite({
      source: 'ipeds',
      verification_status: 'government_verified',
      confidence: 0.95,
      tuition_domestic: 38417,
      acceptance_rate: 0.27,
    });
    expect(result.decision).toBe('allow');
    expect(result.reasons).toHaveLength(0);
  });

  it('supports the standardized top-level source_attribution.source shape', () => {
    const result = validateBeforeWrite({
      source_attribution: { source: 'nirf', confidence: 0.8 },
      verification_status: 'scraped',
      tuition_domestic: 15750,
    });
    expect(result.decision).toBe('allow');
  });
});
