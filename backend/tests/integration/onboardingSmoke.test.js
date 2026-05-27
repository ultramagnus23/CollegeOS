const app = require('../../src/app');

const describeIfDb = process.env.ENABLE_DB_TESTS === 'true' ? describe : describe.skip;

function uniqueUserSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describeIfDb('Onboarding E2E Smoke', () => {
  let server;
  let baseUrl;
  let authToken;
  let userId;
  const seed = uniqueUserSeed();
  const email = `onboarding-smoke-${seed}@example.com`;
  const googleId = `google-smoke-${seed}`;

  beforeAll(async () => {
    server = app.listen(0);
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
  });

  async function api(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json };
  }

  it('creates account and logs in through Google auth endpoint', async () => {
    const res = await api('/api/auth/google', {
      method: 'POST',
      body: { googleId, email, name: 'Onboarding Smoke' },
    });

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.data?.tokens?.accessToken).toBeTruthy();
    expect(res.body?.data?.user?.id).toBeTruthy();
    authToken = res.body.data.tokens.accessToken;
    userId = res.body.data.user.id;
  });

  it('rejects malformed onboarding payload', async () => {
    const malformed = await fetch(`${baseUrl}/api/auth/onboarding`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: '"not-json-object"',
    });

    const malformedBody = await malformed.json();
    expect(malformed.status).toBe(400);
    expect(malformedBody?.success).toBe(false);
  });

  it('completes onboarding and persists profile', async () => {
    const payload = {
      target_countries: ['USA'],
      intended_majors: ['Computer Science'],
      sat_score: 1450,
      act_score: 33,
      gpa: 92,
      gpa_type: 'percentage',
      max_budget_per_year: 60000,
      need_financial_aid: false,
      can_take_loan: true,
      family_income_usd: 140000,
      grade_level: '12',
      graduation_year: 2027,
      preferred_location: 'urban',
      country: 'United States',
      career_goals: 'Software Engineering',
      subjects: ['Mathematics', 'Computer Science'],
      activities: [
        {
          name: 'Robotics Club',
          type: 'STEM',
          tier: 2,
          yearsInvolved: 3,
          hoursPerWeek: 5,
          weeksPerYear: 36,
          leadership: 'Captain',
          achievements: 'State finalist',
        },
      ],
    };

    const onboardingRes = await api('/api/auth/onboarding', {
      method: 'PUT',
      token: authToken,
      body: payload,
    });

    expect(onboardingRes.status).toBe(200);
    expect(onboardingRes.body?.success).toBe(true);

    const meRes = await api('/api/auth/me', { token: authToken });
    expect(meRes.status).toBe(200);
    expect(meRes.body?.success).toBe(true);
    expect(meRes.body?.data?.id).toBe(userId);
    expect(meRes.body?.data?.onboarding_complete).toBeTruthy();
    expect(Array.isArray(meRes.body?.data?.intended_majors)).toBe(true);
  });

  it('survives reload-equivalent re-auth and avoids onboarding loop', async () => {
    const relogin = await api('/api/auth/google', {
      method: 'POST',
      body: { googleId, email, name: 'Onboarding Smoke' },
    });

    expect(relogin.status).toBe(200);
    const secondToken = relogin.body?.data?.tokens?.accessToken;
    expect(secondToken).toBeTruthy();

    const meRes = await api('/api/auth/me', { token: secondToken });
    expect(meRes.status).toBe(200);
    expect(meRes.body?.data?.onboarding_complete).toBeTruthy();
  });

  it('returns recommendations and dashboard-critical endpoints without server errors', async () => {
    const recRes = await api('/api/recommendations', { token: authToken });
    expect(recRes.status).toBeLessThan(500);

    const dashboardProbe = await api('/api/colleges?limit=5', { token: authToken });
    expect(dashboardProbe.status).toBeLessThan(500);
  });
});
