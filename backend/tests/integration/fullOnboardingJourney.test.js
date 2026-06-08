const app = require('../../src/app');

const describeIfDb = process.env.ENABLE_DB_TESTS === 'true' ? describe : describe.skip;

function uniqueUserSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

describeIfDb('Full Onboarding Journey E2E', () => {
  let server;
  let baseUrl;
  let accessToken;
  let refreshToken;
  let userId;

  const seed = uniqueUserSeed();
  const googleId = `google-full-${seed}`;
  const email = `full-onboarding-${seed}@example.com`;

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
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    return { status: res.status, body: payload };
  }

  it('accepts Google auth and creates user', async () => {
    const login = await api('/api/auth/google', {
      method: 'POST',
      body: { googleId, email, name: 'Full Journey User' },
    });

    expect(login.status).toBe(200);
    expect(login.body?.success).toBe(true);
    expect(login.body?.data?.tokens?.accessToken).toBeTruthy();
    expect(login.body?.data?.tokens?.refreshToken).toBeTruthy();
    expect(login.body?.data?.user?.id).toBeTruthy();

    accessToken = login.body.data.tokens.accessToken;
    refreshToken = login.body.data.tokens.refreshToken;
    userId = login.body.data.user.id;
  });

  it('rejects malformed onboarding payloads gracefully', async () => {
    const malformed = await fetch(`${baseUrl}/api/auth/onboarding`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: '"bad-payload"',
    });
    const body = await malformed.json();
    expect(malformed.status).toBe(400);
    expect(body?.success).toBe(false);
  });

  it('handles missing optional onboarding fields safely', async () => {
    const minimal = await api('/api/auth/onboarding', {
      method: 'PUT',
      token: accessToken,
      body: {
        target_countries: ['USA'],
        intended_majors: ['Computer Science'],
      },
    });
    expect(minimal.status).toBe(200);
    expect(minimal.body?.success).toBe(true);
  });

  it('persists complete onboarding profile and restores via /me', async () => {
    const complete = await api('/api/auth/onboarding', {
      method: 'PUT',
      token: accessToken,
      body: {
        target_countries: ['USA', 'Canada'],
        intended_majors: ['Computer Science', 'Data Science'],
        sat_score: 1490,
        act_score: 34,
        gpa: 94,
        gpa_type: 'percentage',
        max_budget_per_year: 70000,
        need_financial_aid: true,
        can_take_loan: true,
        family_income_usd: 180000,
        grade_level: '12',
        graduation_year: 2027,
        preferred_location: 'urban',
        country: 'United States',
        career_goals: 'AI Engineer',
        subjects: ['Mathematics', 'Physics', 'Computer Science'],
        activities: [
          {
            name: 'Coding Club',
            type: 'Academic',
            tier: 2,
            yearsInvolved: 3,
            hoursPerWeek: 4,
            weeksPerYear: 32,
            leadership: 'President',
            achievements: 'Regional winner',
          },
        ],
      },
    });

    expect(complete.status).toBe(200);
    expect(complete.body?.success).toBe(true);

    const me = await api('/api/auth/me', { token: accessToken });
    expect(me.status).toBe(200);
    expect(me.body?.success).toBe(true);
    expect(me.body?.data?.id).toBe(userId);
    expect(me.body?.data?.onboarding_complete).toBeTruthy();
    expect(Array.isArray(me.body?.data?.intended_majors)).toBe(true);
  });

  it('supports logout + re-login with restored session state', async () => {
    const logout = await api('/api/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    });
    expect(logout.status).toBe(200);
    expect(logout.body?.success).toBe(true);

    const relogin = await api('/api/auth/google', {
      method: 'POST',
      body: { googleId, email, name: 'Full Journey User' },
    });
    expect(relogin.status).toBe(200);
    accessToken = relogin.body?.data?.tokens?.accessToken;
    refreshToken = relogin.body?.data?.tokens?.refreshToken;
    expect(accessToken).toBeTruthy();

    const me = await api('/api/auth/me', { token: accessToken });
    expect(me.status).toBe(200);
    expect(me.body?.data?.onboarding_complete).toBeTruthy();
  });

  it('returns recommendations and core dashboard/discovery APIs without 500s', async () => {
    const recommendations = await api('/api/recommendations?limit=25', { token: accessToken });
    expect(recommendations.status).toBeLessThan(500);

    const colleges = await api('/api/colleges?limit=10', { token: accessToken });
    expect(colleges.status).toBeLessThan(500);
    expect(Array.isArray(colleges.body?.data || colleges.body?.colleges || [])).toBe(true);

    const discovery = await api('/api/discovery/popular?limit=10');
    expect(discovery.status).toBe(200);
    expect(Array.isArray(discovery.body?.data)).toBe(true);
    expect(discovery.body.data.length).toBeGreaterThan(0);
  });
});
