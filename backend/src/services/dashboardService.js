// backend/src/services/dashboardService.js
//
// The command center. One service that composes the whole "what should I do next?"
// picture from the canonical pipeline — profile completeness, applications +
// reach/target/safety, upcoming deadlines, essay progress, document progress,
// this-week's tasks — and derives a single prioritized nextAction. Every section
// is best-effort: a failure degrades that one card to a safe default instead of
// 500-ing the dashboard. Reuses existing services/models; contains no persistence.

const dbManager = require('../config/database');
const logger = require('../utils/logger');
const profileService = require('./profileService');

function normRate(rate) {
  if (rate === null || rate === undefined) return null;
  const n = Number(rate);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

class DashboardService {
  static async getDashboard(userId) {
    const [profile, applications, deadlines, essays, documents, tasks] = await Promise.all([
      this._safe(() => this._profile(userId), { percentage: 0, missing_critical: [], missing_optional: [] }),
      this._safe(() => this._applications(userId), { total: 0, byStatus: {}, distribution: { reach: 0, target: 0, safety: 0, unclassified: 0 }, items: [] }),
      this._safe(() => this._deadlines(userId), { upcoming: [], overdue: 0 }),
      this._safe(() => this._essays(userId), { total: 0, byStatus: {}, remaining: 0 }),
      this._safe(() => this._documents(userId), { total: 0, byStatus: {}, missing: 0 }),
      this._safe(() => this._tasks(userId), { dueThisWeek: [], pending: 0 }),
    ]);

    const nextAction = this._nextAction({ profile, applications, deadlines, essays, documents, tasks });

    return {
      profile, applications, deadlines, essays, documents, tasks,
      nextAction,
      generatedAt: new Date().toISOString(),
    };
  }

  static async _safe(fn, fallback) {
    try { return await fn(); }
    catch (err) { logger.error('DashboardService section failed (non-fatal)', { error: err.message }); return fallback; }
  }

  static async _profile(userId) {
    const status = await profileService.getCompletionStatus(userId);
    return {
      percentage: status.percentage ?? 0,
      missing_critical: status.missing_critical ?? [],
      missing_optional: status.missing_optional ?? [],
      filled_critical: status.filled_critical ?? 0,
      total_critical: status.total_critical ?? 0,
    };
  }

  static async _applications(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT a.id, a.status, a.college_id, a.application_type, a.deadline,
              c.name AS college_name, c.acceptance_rate
       FROM applications a
       LEFT JOIN colleges_full c ON a.college_id = c.id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC`,
      [userId]
    );
    const byStatus = {};
    const distribution = { reach: 0, target: 0, safety: 0, unclassified: 0 };
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      const rate = normRate(r.acceptance_rate);
      if (rate === null) distribution.unclassified += 1;
      else if (rate < 0.15) distribution.reach += 1;
      else if (rate <= 0.4) distribution.target += 1;
      else distribution.safety += 1;
    }
    return {
      total: rows.length,
      byStatus,
      distribution,
      items: rows.slice(0, 10).map((r) => ({
        id: r.id, collegeId: r.college_id, collegeName: r.college_name,
        status: r.status, applicationType: r.application_type, deadline: r.deadline,
      })),
    };
  }

  static async _deadlines(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT id, title, deadline_type, deadline_date, application_id
       FROM deadlines
       WHERE user_id = $1 AND deadline_date IS NOT NULL
       ORDER BY deadline_date ASC`,
      [userId]
    );
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const upcoming = rows.filter((r) => new Date(r.deadline_date) >= today).slice(0, 8);
    const overdue = rows.filter((r) => new Date(r.deadline_date) < today).length;
    return { upcoming, overdue };
  }

  static async _essays(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int n FROM essays WHERE user_id = $1 GROUP BY status`,
      [userId]
    );
    const byStatus = {};
    let total = 0;
    for (const r of rows) { byStatus[r.status] = r.n; total += r.n; }
    const done = (byStatus.completed || 0) + (byStatus.submitted || 0);
    return { total, byStatus, remaining: Math.max(0, total - done) };
  }

  static async _documents(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT status, COUNT(*)::int n FROM documents WHERE user_id = $1 GROUP BY status`,
      [userId]
    );
    const byStatus = {};
    let total = 0;
    for (const r of rows) { byStatus[r.status] = r.n; total += r.n; }
    const have = (byStatus.uploaded || 0) + (byStatus.verified || 0);
    return { total, byStatus, missing: Math.max(0, total - have) };
  }

  static async _tasks(userId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `SELECT id, title, status, priority, deadline, college_id
       FROM tasks
       WHERE user_id = $1 AND status NOT IN ('completed','done')
       ORDER BY (deadline IS NULL), deadline ASC, priority ASC
       LIMIT 20`,
      [userId]
    );
    const weekFromNow = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const dueThisWeek = rows.filter((r) => r.deadline && new Date(r.deadline) <= weekFromNow);
    return { dueThisWeek: dueThisWeek.slice(0, 10), pending: rows.length };
  }

  // The single most important prioritized next step, in journey order.
  static _nextAction({ profile, applications, deadlines, essays, documents, tasks }) {
    if ((profile.percentage ?? 0) < 60) {
      const next = profile.missing_critical?.[0];
      return { label: next ? `Complete your profile — add ${next}` : 'Complete your profile', cta: 'profile', why: 'A complete profile powers accurate recommendations and chancing.', urgency: 'high' };
    }
    if ((applications.total ?? 0) === 0) {
      return { label: 'Add your first college', cta: 'explore', why: 'Adding a college auto-creates your deadlines, essays, documents and tasks.', urgency: 'high' };
    }
    const soon = deadlines.upcoming?.[0];
    if (soon) {
      const days = Math.ceil((new Date(soon.deadline_date) - Date.now()) / 86400000);
      if (days <= 14) return { label: `${soon.title} in ${days} day(s)`, cta: 'deadlines', why: 'This deadline is approaching — prioritize it.', urgency: days <= 5 ? 'critical' : 'high' };
    }
    if ((documents.missing ?? 0) > 0) {
      return { label: `Upload ${documents.missing} missing document(s)`, cta: 'documents', why: 'Documents are required to submit applications.', urgency: 'medium' };
    }
    if ((essays.remaining ?? 0) > 0) {
      return { label: `Work on ${essays.remaining} remaining essay(s)`, cta: 'essays', why: 'Essays take the longest — start early.', urgency: 'medium' };
    }
    if ((tasks.dueThisWeek?.length ?? 0) > 0) {
      return { label: `${tasks.dueThisWeek.length} task(s) due this week`, cta: 'tasks', why: 'Stay on track with this week’s checklist.', urgency: 'medium' };
    }
    return { label: 'You’re on track — review your timeline', cta: 'timeline', why: 'Keep momentum toward submission.', urgency: 'low' };
  }
}

module.exports = DashboardService;
