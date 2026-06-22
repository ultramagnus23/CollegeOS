'use strict';

const { extractRequirements } = require('../../src/scrapers/adapters/usOfficialRequirements');

describe('usOfficialRequirements extraction (pure)', () => {
  test('test-optional + Common App + Coalition (Notre Dame shape)', () => {
    const { fields, signals } = extractRequirements(
      'Notre Dame is test-optional. Apply via the Common Application or the Coalition App.'
    );
    expect(fields.sat_policy).toBe('optional');
    expect(fields.act_policy).toBe('optional');
    expect(fields.common_app_supported).toBe(true);
    expect(fields.coalition_app_supported).toBe(true);
    expect(signals).toBeGreaterThanOrEqual(2);
  });

  test('transcript + counted recommendations (MIT shape)', () => {
    const { fields } = extractRequirements(
      'Submit your official transcript. Two letters of recommendation are required.'
    );
    expect(fields.transcript_required).toBe(true);
    expect(fields.teacher_recommendations_required).toBe(2);
  });

  test('test-blind beats test-optional; required sets sat_required', () => {
    expect(extractRequirements('We are test-blind this year.').fields.sat_policy).toBe('blind');
    const req = extractRequirements('The SAT is required for all applicants.').fields;
    expect(req.sat_policy).toBe('required');
    expect(req.sat_required).toBe(true);
  });

  test('English tests + interview optional', () => {
    const { fields } = extractRequirements(
      'International applicants submit TOEFL or IELTS or Duolingo. An interview is optional.'
    );
    expect(fields.toefl_required).toBe(true);
    expect(fields.ielts_required).toBe(true);
    expect(fields.duolingo_required).toBe(true);
    expect(fields.interview_optional).toBe(true);
  });

  test('does not fabricate: unrelated text yields 0 signals', () => {
    expect(extractRequirements('Welcome to our beautiful campus in the mountains.').signals).toBe(0);
  });

  test('only valid sat_policy values are produced', () => {
    const allowed = new Set([undefined, 'required', 'optional', 'blind', 'considered', 'not_used']);
    for (const txt of ['test-optional', 'test blind', 'SAT required', 'nothing here']) {
      expect(allowed.has(extractRequirements(txt).fields.sat_policy)).toBe(true);
    }
  });
});
