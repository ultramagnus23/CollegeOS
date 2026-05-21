const { validateStartupSchema } = require('../../src/startup/schemaValidator');

describe('startup schema validator', () => {
  test('passes when required relations/columns/indexes exist', async () => {
    const pool = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM information_schema.tables') || sql.includes('FROM pg_matviews')) {
          if (params[0] === 'canonical' && params[1] === 'mv_college_cards') return { rows: [{ table_type: 'MATERIALIZED VIEW' }] };
          if (params[0] === 'public' && params[1] === 'mv_college_cards') return { rows: [{ table_type: 'VIEW' }] };
          return { rows: [{ table_type: 'BASE TABLE' }] };
        }
        if (sql.includes('FROM information_schema.columns')) {
          return {
            rows: [
              'id', 'canonical_name', 'country_code', 'state_region', 'city', 'website', 'logo_url', 'description',
              'institution_type', 'popularity_score', 'global_rank', 'acceptance_rate', 'test_optional', 'sat_50',
              'act_50', 'tuition_international', 'cost_of_attendance', 'avg_financial_aid', 'merit_scholarship_flag',
              'need_blind_flag', 'graduation_rate_4yr', 'employment_rate', 'median_start_salary', 'metadata',
            ].map((column_name) => ({ column_name })),
          };
        }
        if (sql.includes('FROM pg_indexes')) return { rows: [{ '?column?': 1 }] };
        return { rows: [] };
      }),
    };

    await expect(validateStartupSchema(pool, { info: jest.fn(), error: jest.fn() })).resolves.toBeTruthy();
  });

  test('throws when a required relation is missing', async () => {
    const pool = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('FROM information_schema.tables') || sql.includes('FROM pg_matviews')) {
          if (params[0] === 'canonical' && params[1] === 'institutions') return { rows: [] };
          if (params[0] === 'canonical' && params[1] === 'mv_college_cards') return { rows: [{ table_type: 'MATERIALIZED VIEW' }] };
          if (params[0] === 'public' && params[1] === 'mv_college_cards') return { rows: [{ table_type: 'VIEW' }] };
          return { rows: [{ table_type: 'BASE TABLE' }] };
        }
        if (sql.includes('FROM information_schema.columns')) return { rows: [] };
        if (sql.includes('FROM pg_indexes')) return { rows: [{ '?column?': 1 }] };
        return { rows: [] };
      }),
    };

    await expect(validateStartupSchema(pool, { info: jest.fn(), error: jest.fn() })).rejects.toThrow('Schema contract validation failed');
  });
});
