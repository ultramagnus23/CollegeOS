const { checkSchemaContracts } = require('../../src/utils/schemaContractChecker');

describe('schemaContractChecker', () => {
  test('returns ok when required columns exist', async () => {
    const columns = [
      'id', 'canonical_name', 'country_code', 'state_region', 'city', 'website', 'logo_url', 'description',
      'institution_type', 'popularity_score', 'global_rank', 'acceptance_rate', 'test_optional', 'sat_50', 'act_50',
      'tuition_international', 'cost_of_attendance', 'avg_financial_aid', 'merit_scholarship_flag', 'need_blind_flag',
      'graduation_rate_4yr', 'employment_rate', 'median_start_salary', 'metadata', 'updated_at',
    ];
    const pool = {
      query: jest.fn(async () => ({ rows: columns.map((column_name) => ({ column_name })) })),
    };

    const report = await checkSchemaContracts(pool);
    expect(report.ok).toBe(true);
    expect(report.drift.missingRequiredColumns).toEqual([]);
  });

  test('reports missing frontend/backend fields', async () => {
    const pool = {
      query: jest.fn(async () => ({ rows: [{ column_name: 'id' }, { column_name: 'canonical_name' }] })),
    };

    const report = await checkSchemaContracts(pool);
    expect(report.ok).toBe(false);
    expect(report.frontend.missingSelectFields.length).toBeGreaterThan(0);
    expect(report.backend.missingSerializerFields.length).toBeGreaterThan(0);
  });
});
