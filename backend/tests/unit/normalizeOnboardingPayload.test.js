const { normalizeOnboardingPayload, safeInteger, safeFloat, safeBoolean } = require('../../src/utils/normalizeOnboardingPayload');

describe('normalizeOnboardingPayload helpers', () => {
  test('safeInteger handles boolean and malformed inputs', () => {
    expect(safeInteger(false)).toBeNull();
    expect(safeInteger('1450', { min: 400, max: 1600 })).toBe(1450);
    expect(safeInteger('')).toBeNull();
    expect(safeInteger(undefined)).toBeNull();
    expect(safeInteger('abc')).toBeNull();
  });

  test('safeFloat rejects NaN and Infinity', () => {
    expect(safeFloat('abc')).toBeNull();
    expect(safeFloat(Infinity)).toBeNull();
    expect(safeFloat('3.75', { min: 0, max: 4, precision: 2 })).toBe(3.75);
  });

  test('safeBoolean normalizes string booleans', () => {
    expect(safeBoolean('true')).toBe(true);
    expect(safeBoolean('false')).toBe(false);
    expect(safeBoolean('nope')).toBeNull();
  });
});

describe('normalizeOnboardingPayload', () => {
  test('normalizes malformed optional fields without crashing', () => {
    const result = normalizeOnboardingPayload({
      target_countries: ['USA'],
      intended_majors: ['Computer Science'],
      sat_score: false,
      act_score: 'abc',
      gpa: 'not-a-number',
      family_income_usd: false,
      need_financial_aid: 'true',
      can_take_loan: 'false',
      unknownField: 'drop-me',
    });

    expect(result.normalized.sat_score).toBeNull();
    expect(result.normalized.act_score).toBeNull();
    expect(result.normalized.gpa).toBeNull();
    expect(result.normalized.family_income_usd).toBeNull();
    expect(result.normalized.need_financial_aid).toBe(true);
    expect(result.normalized.can_take_loan).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.unknownFields).toContain('unknownField');
  });

  test('sanitizes arrays and trims values', () => {
    const result = normalizeOnboardingPayload({
      targetCountries: ['  USA ', '', 'USA', 'Canada'],
      intendedMajors: ['  Economics  ', ''],
      languagePreferences: [' English ', 'English', '  '],
    });

    expect(result.normalized.target_countries).toEqual(['USA', 'Canada']);
    expect(result.normalized.intended_majors).toEqual(['Economics']);
    expect(result.normalized.language_preferences).toEqual(['English']);
  });
});
