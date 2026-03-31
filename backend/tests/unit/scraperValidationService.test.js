/**
 * Unit tests for scraperValidationService
 */

const {
  validate,
  validateBatch,
  markUnavailableFields,
  SCHEMAS,
} = require('../../src/services/scraperValidationService');

describe('scraperValidationService', () => {

  // ── validate() ─────────────────────────────────────────────────────────────

  describe('validate()', () => {
    const NOW = new Date().toISOString();

    it('accepts a valid college record', () => {
      const record = {
        name: 'MIT',
        country: 'United States',
        official_website: 'https://web.mit.edu',
        source_url: 'https://web.mit.edu/admissions',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('college', record);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('rejects a college record missing name', () => {
      const record = {
        country: 'United States',
        official_website: 'https://web.mit.edu',
        source_url: 'https://web.mit.edu/admissions',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('college', record);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('name'))).toBe(true);
    });

    it('rejects a college record with invalid official_website URL', () => {
      const record = {
        name: 'MIT',
        country: 'United States',
        official_website: 'not-a-url',
        source_url: 'https://web.mit.edu/admissions',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('college', record);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('official_website'))).toBe(true);
    });

    it('rejects a college record missing source_url (provenance requirement)', () => {
      const record = {
        name: 'Stanford',
        country: 'United States',
        official_website: 'https://www.stanford.edu',
        scraped_at: NOW,
        // source_url intentionally omitted
      };
      const { valid, errors } = validate('college', record);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('source_url'))).toBe(true);
    });

    it('rejects a college record missing scraped_at', () => {
      const record = {
        name: 'Harvard',
        country: 'United States',
        official_website: 'https://www.harvard.edu',
        source_url: 'https://college.harvard.edu/admissions',
      };
      const { valid, errors } = validate('college', record);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('scraped_at'))).toBe(true);
    });

    it('accepts a valid financing_option record', () => {
      const record = {
        name: 'Federal Direct Subsidized Loan',
        provider: 'US Department of Education',
        financing_type: 'federal_loan',
        source_url: 'https://studentaid.gov/understand-aid/types/loans/subsidized-unsubsidized',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('financing_option', record);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('rejects financing_option with invalid financing_type', () => {
      const record = {
        name: 'Fake Loan',
        provider: 'Some Bank',
        financing_type: 'barter_arrangement', // invalid
        source_url: 'https://example.com',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('financing_option', record);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('financing_type'))).toBe(true);
    });

    it('accepts a valid college_insight record', () => {
      const record = {
        reddit_post_id: 'abc123',
        subreddit: 'r/ApplyingToCollege',
        college_name_raw: 'MIT',
        content_snippet: 'I received a full scholarship and the cost was much less than expected.',
        insight_type: 'scholarship_success',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('college_insight', record);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('rejects college_insight with snippet too short', () => {
      const record = {
        reddit_post_id: 'xyz999',
        subreddit: 'r/ApplyingToCollege',
        college_name_raw: 'Stanford',
        content_snippet: 'ok',  // too short (< 10 chars)
        insight_type: 'general',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('college_insight', record);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('content_snippet'))).toBe(true);
    });

    it('rejects a financial record with no financial figures', () => {
      const record = {
        college_id: 1,
        source_url: 'https://example.edu/tuition',
        scraped_at: NOW,
        // no tuition_international, no cost_of_attendance, etc.
      };
      const { valid, errors } = validate('financial', record);
      expect(valid).toBe(false);
      expect(errors.some(e => e.includes('financial figure'))).toBe(true);
    });

    it('accepts a financial record with at least one financial figure', () => {
      const record = {
        college_id: 42,
        tuition_international: 58000,
        source_url: 'https://registrar.example.edu/tuition',
        scraped_at: NOW,
      };
      const { valid, errors } = validate('financial', record);
      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('returns an error for unknown record types', () => {
      const { valid, errors } = validate('unicorn', {});
      expect(valid).toBe(false);
      expect(errors[0]).toMatch(/Unknown record type/);
    });
  });

  // ── validateBatch() ────────────────────────────────────────────────────────

  describe('validateBatch()', () => {
    const NOW = new Date().toISOString();

    it('separates accepted from rejected records', () => {
      const records = [
        {
          name: 'Good College',
          country: 'USA',
          official_website: 'https://good.edu',
          source_url: 'https://good.edu/admissions',
          scraped_at: NOW,
        },
        {
          // Missing name — should be rejected
          country: 'UK',
          official_website: 'https://bad.edu',
          source_url: 'https://bad.edu/admissions',
          scraped_at: NOW,
        },
      ];

      const { accepted, rejected } = validateBatch('college', records);
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(accepted[0].name).toBe('Good College');
      expect(rejected[0].errors.length).toBeGreaterThan(0);
    });

    it('accepts all records when all are valid', () => {
      const records = [
        { name: 'A', country: 'US', official_website: 'https://a.edu', source_url: 'https://a.edu', scraped_at: NOW },
        { name: 'B', country: 'UK', official_website: 'https://b.edu', source_url: 'https://b.edu', scraped_at: NOW },
      ];
      const { accepted, rejected } = validateBatch('college', records);
      expect(accepted).toHaveLength(2);
      expect(rejected).toHaveLength(0);
    });

    it('rejects all records when all are invalid', () => {
      const records = [
        { country: 'US', source_url: 'https://a.edu', scraped_at: NOW }, // missing name
        { name: 'B', source_url: 'bad-url', scraped_at: NOW },           // bad url + missing country + bad official_website
      ];
      const { accepted, rejected } = validateBatch('college', records);
      expect(accepted).toHaveLength(0);
      expect(rejected).toHaveLength(2);
    });
  });

  // ── markUnavailableFields() ────────────────────────────────────────────────

  describe('markUnavailableFields()', () => {
    it('moves null/undefined/empty fields to unavailable list', () => {
      const record = {
        name: 'MIT',
        tuition: null,
        acceptance_rate: undefined,
        location: '',
        country: 'USA',
      };
      const { cleaned, unavailable } = markUnavailableFields(record);
      expect(cleaned).toEqual({ name: 'MIT', country: 'USA' });
      expect(unavailable).toContain('tuition');
      expect(unavailable).toContain('acceptance_rate');
      expect(unavailable).toContain('location');
      expect(unavailable).not.toContain('name');
    });

    it('returns empty unavailable list when all fields are present', () => {
      const record = { name: 'Stanford', country: 'USA' };
      const { cleaned, unavailable } = markUnavailableFields(record);
      expect(cleaned).toEqual(record);
      expect(unavailable).toHaveLength(0);
    });
  });

  // ── SCHEMAS export ─────────────────────────────────────────────────────────

  describe('SCHEMAS export', () => {
    it('exports schemas for all expected record types', () => {
      const expectedTypes = ['college', 'admissions', 'financial', 'scholarship', 'financing_option', 'college_insight'];
      for (const type of expectedTypes) {
        expect(SCHEMAS).toHaveProperty(type);
        expect(Array.isArray(SCHEMAS[type])).toBe(true);
      }
    });
  });
});
