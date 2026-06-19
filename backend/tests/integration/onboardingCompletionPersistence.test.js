/**
 * Regression test for the Phase 0 blocker: onboarding data was written only to
 * the `users` table while GET /api/profile/completion (and the recommendation /
 * chancing engines) read from `student_profiles`. Result: profile completion
 * showed a healthy number right after onboarding but reset to 0% on reload.
 *
 * This test completes onboarding, then proves the completion percentage is high
 * AND survives a logout + re-login (i.e. it is persisted in Postgres, not held
 * in memory), and that student_profiles actually carries the values.
 *
 * Gated behind ENABLE_DB_TESTS=true because it requires a live database.
 */
const app = require('../../src/app');
const dbManager = require('../../src/config/database');

const describeIfDb = process.env.ENABLE_DB_TESTS === 'true' ? describe : describe.skip;

function uniqueUserSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

describeIfDb('Onboarding completion persistence (Phase 0 regression)', () => {
  let server;
  let baseUrl;
  let accessToken;
  let refreshToken;
  let userId;

  const seed = uniqueUserSeed();
  const googleId = `google-completion-${seed}`;
  const email = `completion-persist-${seed}@example.com`;

  const fullOnboardingPayload = {
    name: 'Aarav Sharma',
    target_countries: ['USA', 'Canada'],
    intended_majors: ['Computer Science', 'Data Science'],
    intended_major: 'Computer Science',
    country: 'India',
    gpa: 92,
    gpa_type: 'percentage',
    sat_score: 1520,
    act_score: 34,
    max_budget_per_year: 60000,
    need_financial_aid: true,
    grade_level: '12th Grade (Senior)',
    graduation_year: 2027,
    preferred_location: 'urban',
    preferred_setting: 'urban',
    preferred_college_size: 'medium',
    phone: '+91 98765 43210',
    date_of_birth: '2008-05-12',
    school_name: 'Delhi Public School',
    curriculum_type: 'CBSE',
    career_goals: 'Become an ML research engineer working on applied AI for healthcare.',
    why_college: 'Access to research labs, a strong CS community, and global alumni network.',
    subjects: ['Mathematics', 'Physics', 'Computer Science', 'Chemistry'],
    interest_tags: ['Analytical', 'Builder', 'Curious'],
    trait_weights: { Analytical: 5, Builder: 4, Curious: 4 },
    activities: [
      { name: 'Robotics Club', type: 'Academic Club', tier: 2, yearsInvolved: 3, hoursPerWeek: 6, weeksPerYear: 40, leadership: 'President', achievements: 'State runner-up' },
      { name: 'Math Olympiad', type: 'Academic Club', tier: 1, yearsInvolved: 2, hoursPerWeek: 4, weeksPerYear: 30, leadership: 'Member', achievements: 'National qualifier' },
    ],
  };

  beforeAll(async () => {
    server = app.listen(0);
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (userId) {
      try {
        const pool = dbManager.getDatabase();
        await pool.query('DELETE FROM users WHERE id = $1', [userId]); // CASCADE clears student_profiles
      } catch (_err) { /* best-effort cleanup */ }
    }
    if (server) await new Promise((resolve) => server.close(resolve));
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
    try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
    return { status: res.status, body: payload };
  }

  it('creates a user via Google auth', async () => {
    const login = await api('/api/auth/google', {
      method: 'POST',
      body: { googleId, email, name: 'Aarav Sharma' },
    });
    expect(login.status).toBe(200);
    accessToken = login.body?.data?.tokens?.accessToken;
    refreshToken = login.body?.data?.tokens?.refreshToken;
    userId = login.body?.data?.user?.id;
    expect(accessToken).toBeTruthy();
    expect(userId).toBeTruthy();
  });

  it('starts at 0% completion before onboarding', async () => {
    const before = await api('/api/profile/completion', { token: accessToken });
    expect(before.status).toBe(200);
    expect(before.body?.data?.completionPercent).toBe(0);
  });

  it('completes onboarding successfully', async () => {
    const complete = await api('/api/auth/onboarding', {
      method: 'PUT',
      token: accessToken,
      body: fullOnboardingPayload,
    });
    expect(complete.status).toBe(200);
    expect(complete.body?.success).toBe(true);
  });

  it('reports a high completion percentage immediately after onboarding', async () => {
    const after = await api('/api/profile/completion', { token: accessToken });
    expect(after.status).toBe(200);
    expect(after.body?.data?.completionPercent).toBeGreaterThanOrEqual(80);
    // The core onboarding fields must no longer be reported as missing.
    const missing = after.body?.data?.missingFields || [];
    for (const field of ['Curriculum Type', 'Subjects', 'Intended Major', 'GPA', 'Activities', 'Traits']) {
      expect(missing).not.toContain(field);
    }
  });

  it('KEEPS the completion percentage after logout + re-login (persisted, not in-memory)', async () => {
    const logout = await api('/api/auth/logout', { method: 'POST', body: { refreshToken } });
    expect(logout.status).toBe(200);

    const relogin = await api('/api/auth/google', {
      method: 'POST',
      body: { googleId, email, name: 'Aarav Sharma' },
    });
    expect(relogin.status).toBe(200);
    accessToken = relogin.body?.data?.tokens?.accessToken;
    expect(accessToken).toBeTruthy();

    const afterReload = await api('/api/profile/completion', { token: accessToken });
    expect(afterReload.status).toBe(200);
    // This is the regression assertion: pre-fix this dropped to 0.
    expect(afterReload.body?.data?.completionPercent).toBeGreaterThanOrEqual(80);
  });

  it('persisted the onboarding values into student_profiles (the read-side table)', async () => {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM student_profiles WHERE user_id = $1', [userId]);
    expect(rows.length).toBe(1);
    const sp = rows[0];
    expect(sp.curriculum_type).toBe('CBSE');
    expect(sp.high_school_name).toBe('Delhi Public School');
    expect(Number(sp.board_exam_percentage)).toBeCloseTo(92, 1);
    expect(sp.sat_total).toBe(1520);
    expect(sp.graduation_year).toBe(2027);
    expect(JSON.parse(sp.subjects)).toEqual(expect.arrayContaining(['Mathematics', 'Physics']));
    expect(JSON.parse(sp.intended_majors)).toEqual(expect.arrayContaining(['Computer Science']));
    expect(JSON.parse(sp.interest_tags)).toEqual(expect.arrayContaining(['Analytical']));
    const extracurriculars = typeof sp.extracurriculars === 'string' ? JSON.parse(sp.extracurriculars) : sp.extracurriculars;
    expect(Array.isArray(extracurriculars)).toBe(true);
    expect(extracurriculars.length).toBe(2);
    expect(sp.career_goals).toContain('ML research');
  });

  it('exposes the persisted academic profile to the recommendation/chancing engine', async () => {
    const User = require('../../src/models/User');
    const academic = await User.getAcademicProfile(userId);
    expect(academic).toBeTruthy();
    // Core values the chancing engine relies on must reflect what was entered.
    expect(Array.isArray(academic.intended_majors) ? academic.intended_majors : []).toEqual(
      expect.arrayContaining(['Computer Science']),
    );
    expect(academic.sat_score || academic.sat_total).toBeTruthy();
  });
});
