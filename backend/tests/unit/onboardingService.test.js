jest.mock('../../src/models/User', () => ({
  updateOnboarding: jest.fn(),
}));

jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn(),
}));

const User = require('../../src/models/User');
const dbManager = require('../../src/config/database');
const { OnboardingValidationError, processOnboardingPayload } = require('../../src/services/onboardingService');

describe('onboardingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    dbManager.getDatabase.mockReturnValue({
      query: jest.fn().mockResolvedValue({
        rows: [
          { table_name: 'users', column_name: 'target_countries', data_type: 'text', udt_name: 'text' },
          { table_name: 'users', column_name: 'intended_majors', data_type: 'text', udt_name: 'text' },
          { table_name: 'users', column_name: 'sat_score', data_type: 'integer', udt_name: 'int4' },
          { table_name: 'users', column_name: 'act_score', data_type: 'integer', udt_name: 'int4' },
          { table_name: 'users', column_name: 'gpa', data_type: 'numeric', udt_name: 'numeric' },
          { table_name: 'users', column_name: 'max_budget_per_year', data_type: 'numeric', udt_name: 'numeric' },
          { table_name: 'users', column_name: 'need_financial_aid', data_type: 'boolean', udt_name: 'bool' },
          { table_name: 'users', column_name: 'can_take_loan', data_type: 'boolean', udt_name: 'bool' },
          { table_name: 'users', column_name: 'family_income_usd', data_type: 'integer', udt_name: 'int4' },
          { table_name: 'users', column_name: 'grade_level', data_type: 'text', udt_name: 'text' },
          { table_name: 'users', column_name: 'graduation_year', data_type: 'integer', udt_name: 'int4' },
          { table_name: 'users', column_name: 'preferred_location', data_type: 'text', udt_name: 'text' },
          { table_name: 'users', column_name: 'country', data_type: 'text', udt_name: 'text' },
          { table_name: 'users', column_name: 'career_goals', data_type: 'text', udt_name: 'text' },
          { table_name: 'student_profiles', column_name: 'grade_level', data_type: 'text', udt_name: 'text' },
          { table_name: 'student_profiles', column_name: 'graduation_year', data_type: 'integer', udt_name: 'int4' },
          { table_name: 'student_profiles', column_name: 'country', data_type: 'text', udt_name: 'text' },
          { table_name: 'student_profiles', column_name: 'intended_majors', data_type: 'text', udt_name: 'text' },
        ],
      }),
    });

    User.updateOnboarding.mockResolvedValue({ id: 10, email: 'test@example.com' });
  });

  test('saves valid fields and returns warnings for invalid optional fields', async () => {
    const response = await processOnboardingPayload({
      payload: {
        target_countries: ['USA'],
        intended_majors: ['Computer Science'],
        sat_score: false,
        act_score: '32',
      },
      userId: 10,
      requestId: 'req-1',
    });

    expect(User.updateOnboarding).toHaveBeenCalledTimes(1);
    const updateArg = User.updateOnboarding.mock.calls[0][1];
    expect(updateArg.sat_score).toBeNull();
    expect(updateArg.act_score).toBe(32);
    expect(response.warnings.map((w) => w.field)).toContain('sat_score');
    expect(response.user.id).toBe(10);
  });

  test('rejects malformed payload objects with 400-style validation error', async () => {
    await expect(processOnboardingPayload({
      payload: 'not-an-object',
      userId: 10,
      requestId: 'req-2',
    })).rejects.toBeInstanceOf(OnboardingValidationError);

    expect(User.updateOnboarding).not.toHaveBeenCalled();
  });

  test('hard-fails when required identity fields are missing', async () => {
    await expect(processOnboardingPayload({
      payload: {
        target_countries: [],
        intended_majors: ['Engineering'],
      },
      userId: 10,
      requestId: 'req-3',
    })).rejects.toBeInstanceOf(OnboardingValidationError);

    expect(User.updateOnboarding).not.toHaveBeenCalled();
  });
});
