/**
 * Regression test for the "automatic application pipeline" (deadlines, essays,
 * tasks, timeline) on application create. Before this fix, 3 of 5 bootstrap
 * steps failed for EVERY application ever created, due to schema drift:
 *  - deadlines: a bare SELECT (no FROM) with a reused parameter made Postgres
 *    deduce conflicting types for the same placeholder -> insert always failed.
 *  - tasks: ApplicationBootstrapService wrote to `tasks` with columns
 *    (application_id, estimated_hours) the table didn't have.
 *  - timeline: queried colleges_full.deadline_templates, which doesn't exist.
 *  - essays: filtered institution_identity_map.legacy_id, a column that is 0%
 *    populated database-wide (8,329 rows use source_pk instead) -> "College not
 *    found" for every college, always.
 *
 * Gated behind ENABLE_DB_TESTS=true because it requires a live database.
 */
const dbManager = require('../../src/config/database');
const Application = require('../../src/models/Application');
const College = require('../../src/models/College');
const ApplicationBootstrapService = require('../../src/services/applicationBootstrapService');

const describeIfDb = process.env.ENABLE_DB_TESTS === 'true' ? describe : describe.skip;

describeIfDb('Application bootstrap pipeline (deadlines/tasks/timeline/essays)', () => {
  let pool;
  let userId;
  let applicationId;

  beforeAll(async () => {
    pool = dbManager.getDatabase();
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userRes = await pool.query(
      `INSERT INTO users (email, full_name, country, onboarding_complete)
       VALUES ($1, 'Bootstrap Test User', 'United States', 1) RETURNING id`,
      [`bootstrap-test-${seed}@example.com`],
    );
    userId = userRes.rows[0].id;
  });

  afterAll(async () => {
    if (applicationId) {
      await pool.query('DELETE FROM deadlines WHERE application_id=$1', [applicationId]);
      await pool.query('DELETE FROM tasks WHERE application_id=$1', [applicationId]);
      await pool.query('DELETE FROM applications WHERE id=$1', [applicationId]);
    }
    if (userId) {
      await pool.query('DELETE FROM essays WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM timeline_actions WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    }
  });

  it('creating an application generates deadlines, tasks, and a timeline with zero errors', async () => {
    const { rows: collegeRows } = await pool.query(
      "SELECT id FROM colleges_full WHERE country = 'United States' ORDER BY id LIMIT 1",
    );
    const collegeId = collegeRows[0].id;

    const application = await Application.create(userId, {
      collegeId,
      application_type: 'RD',
      status: 'researching',
    });
    applicationId = application.id;
    expect(applicationId).toBeTruthy();

    const college = await College.findById(application.college_id);
    const bootstrap = await ApplicationBootstrapService.bootstrap(userId, application, college);

    // The essays step may legitimately report 0 if essay_prompts (supplemental
    // prompts) has no data yet for this college — that's an honest data gap,
    // not a regression. deadlines/tasks/timeline must not error.
    const failedSteps = bootstrap.errors.map((e) => e.step);
    expect(failedSteps).not.toContain('deadlines');
    expect(failedSteps).not.toContain('tasks');
    expect(failedSteps).not.toContain('timeline');

    const deadlineCount = await pool.query(
      'SELECT COUNT(*)::int n FROM deadlines WHERE application_id=$1', [applicationId],
    );
    expect(deadlineCount.rows[0].n).toBeGreaterThan(0);

    const taskCount = await pool.query(
      'SELECT COUNT(*)::int n FROM tasks WHERE application_id=$1', [applicationId],
    );
    expect(taskCount.rows[0].n).toBeGreaterThan(0);

    const timelineCount = await pool.query(
      'SELECT COUNT(*)::int n FROM timeline_actions WHERE user_id=$1', [userId],
    );
    expect(timelineCount.rows[0].n).toBeGreaterThan(0);
  });
});
