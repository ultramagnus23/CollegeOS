const mockQuery = jest.fn();

jest.mock('../../src/config/database', () => ({
  getDatabase: () => ({ query: mockQuery }),
}));

const College = require('../../src/models/College');

describe('College model clean_colleges refactor', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('findAll queries clean_colleges with detail joins and returns slugged results', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 101,
          name: 'Example University',
          country: 'United States',
          state: 'CA',
          city: 'Los Angeles',
          official_website: 'https://example.edu',
          acceptance_rate: 0.42,
          tuition_in_state: 12000,
          tuition_international: 42000,
          total_enrollment: 12000,
          program_names: ['Computer Science'],
          program_count: 1,
        },
      ],
    });

    const rows = await College.findAll({ limit: 10, offset: 0 });

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('FROM public.clean_colleges c');
    expect(sql).toContain('LEFT JOIN public.college_admissions ca');
    expect(sql).toContain('LEFT JOIN public.college_financial_data cfd');
    expect(rows[0].slug).toBe('example-university-101');
  });

  test('findById returns nullable joined detail fields without crashing', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 7,
          name: 'Null Data College',
          country: 'US',
          state: null,
          city: null,
          official_website: null,
          acceptance_rate: null,
          sat_25: null,
          sat_75: null,
          tuition_in_state: null,
          tuition_international: null,
          graduation_rate_4yr: null,
          total_enrollment: null,
          majors: [],
          programs: [],
          deadlines: [],
        },
      ],
    });

    const row = await College.findById(7);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('FROM public.clean_colleges cc');
    expect(sql).toContain('LEFT JOIN public.college_admissions ca');
    expect(row.acceptanceRate).toBeNull();
    expect(row.tuitionInState).toBeNull();
    expect(row.slug).toBe('null-data-college-7');
  });
});
