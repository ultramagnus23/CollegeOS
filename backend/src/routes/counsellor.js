// backend/src/routes/counsellor.js
// Counsellor <-> student consent-based roster and per-student progress view.
//
// Access model: a counsellor only ever sees a student after that student has
// an 'active' row in counsellor_student_links with them — either the
// counsellor invited the student and the student accepted, or the student
// requested a link and the counsellor accepted. Nothing here bypasses that;
// every roster/detail query is scoped to (counsellor_id = req.user.userId,
// status = 'active').

const express = require('express');
const router = express.Router();
const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { authenticate, counsellorOnly } = require('../middleware/auth');

router.use(authenticate);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Per-application completeness: blends task completion (both application_tasks
 * and the richer `tasks` table — two independently-populated sources, unioned
 * the same way routes/timeline.js already does) with essay status.
 */
async function getApplicationProgress(pool, applicationIds) {
  if (applicationIds.length === 0) return {};

  const { rows: taskRows } = await pool.query(
    `SELECT application_id,
            COUNT(*)::int AS total,
            SUM(CASE WHEN completed THEN 1 ELSE 0 END)::int AS done
     FROM application_tasks
     WHERE application_id = ANY($1)
     GROUP BY application_id
     UNION ALL
     SELECT application_id,
            COUNT(*)::int AS total,
            SUM(CASE WHEN status IN ('complete', 'completed') THEN 1 ELSE 0 END)::int AS done
     FROM tasks
     WHERE application_id = ANY($1)
     GROUP BY application_id`,
    [applicationIds]
  );

  const { rows: essayRows } = await pool.query(
    `SELECT application_id,
            COUNT(*)::int AS total,
            SUM(CASE WHEN status IN ('complete', 'completed', 'submitted') THEN 1 ELSE 0 END)::int AS done,
            ARRAY_AGG(title) FILTER (WHERE status NOT IN ('complete', 'completed', 'submitted')) AS incomplete_titles
     FROM essays
     WHERE application_id = ANY($1)
     GROUP BY application_id`,
    [applicationIds]
  );

  const { rows: missingTaskRows } = await pool.query(
    `SELECT application_id, title FROM application_tasks
     WHERE application_id = ANY($1) AND completed = false
     UNION ALL
     SELECT application_id, title FROM tasks
     WHERE application_id = ANY($1) AND status NOT IN ('complete', 'completed')`,
    [applicationIds]
  );

  const byApp = {};
  for (const id of applicationIds) {
    byApp[id] = { taskTotal: 0, taskDone: 0, essayTotal: 0, essayDone: 0, missing: [] };
  }
  for (const r of taskRows) {
    const a = byApp[r.application_id];
    if (!a) continue;
    a.taskTotal += r.total;
    a.taskDone += r.done;
  }
  for (const r of essayRows) {
    const a = byApp[r.application_id];
    if (!a) continue;
    a.essayTotal += r.total;
    a.essayDone += r.done;
    for (const t of (r.incomplete_titles || [])) if (t) a.missing.push(`Essay: ${t}`);
  }
  for (const r of missingTaskRows) {
    const a = byApp[r.application_id];
    if (!a) continue;
    a.missing.push(r.title);
  }

  const result = {};
  for (const [id, a] of Object.entries(byApp)) {
    const totalItems = a.taskTotal + a.essayTotal;
    const doneItems = a.taskDone + a.essayDone;
    result[id] = {
      completenessPercent: totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null,
      tasksTotal: a.taskTotal,
      tasksDone: a.taskDone,
      essaysTotal: a.essayTotal,
      essaysDone: a.essayDone,
      missingItems: [...new Set(a.missing)].slice(0, 10),
    };
  }
  return result;
}

// ── Linking (both directions, consent-based) ────────────────────────────────

/**
 * POST /api/counsellor/invite
 * Counsellor invites a student by email. Creates a 'pending' link the
 * student must accept via /respond before the counsellor can see anything.
 */
router.post('/invite', counsellorOnly, async (req, res) => {
  try {
    const { studentEmail } = req.body;
    if (!studentEmail) {
      return res.status(400).json({ success: false, message: 'studentEmail is required' });
    }
    const pool = dbManager.getDatabase();
    const { rows: studentRows } = await pool.query(
      `SELECT id FROM users WHERE email = $1 AND role = 'student' LIMIT 1`,
      [studentEmail]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'No student found with that email' });
    }
    const studentId = studentRows[0].id;

    const { rows } = await pool.query(
      `INSERT INTO counsellor_student_links (counsellor_id, student_id, status, invited_by)
       VALUES ($1, $2, 'pending', 'counsellor')
       ON CONFLICT (counsellor_id, student_id) DO NOTHING
       RETURNING id, status`,
      [req.user.userId, studentId]
    );
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'A link with this student already exists' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    logger.error('counsellor/invite failed:', error);
    res.status(500).json({ success: false, message: 'Failed to send invite' });
  }
});

/**
 * POST /api/counsellor/request
 * Student requests a link to a counsellor by email. Creates a 'pending' link
 * the counsellor must accept via /respond.
 */
router.post('/request', async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can request a counsellor link' });
    }
    const { counsellorEmail } = req.body;
    if (!counsellorEmail) {
      return res.status(400).json({ success: false, message: 'counsellorEmail is required' });
    }
    const pool = dbManager.getDatabase();
    const { rows: counsellorRows } = await pool.query(
      `SELECT id FROM users WHERE email = $1 AND role = 'counsellor' LIMIT 1`,
      [counsellorEmail]
    );
    if (counsellorRows.length === 0) {
      return res.status(404).json({ success: false, message: 'No counsellor found with that email' });
    }
    const counsellorId = counsellorRows[0].id;

    const { rows } = await pool.query(
      `INSERT INTO counsellor_student_links (counsellor_id, student_id, status, invited_by)
       VALUES ($1, $2, 'pending', 'student')
       ON CONFLICT (counsellor_id, student_id) DO NOTHING
       RETURNING id, status`,
      [counsellorId, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(400).json({ success: false, message: 'A link with this counsellor already exists' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    logger.error('counsellor/request failed:', error);
    res.status(500).json({ success: false, message: 'Failed to send request' });
  }
});

/**
 * GET /api/counsellor/pending
 * List pending links awaiting *my* response (i.e. the other party invited
 * me). Works for both counsellors and students.
 */
router.get('/pending', async (req, res) => {
  try {
    const pool = dbManager.getDatabase();
    const isCounsellor = req.user.role === 'counsellor';
    const { rows } = await pool.query(
      isCounsellor
        ? `SELECT l.id, l.invited_at, u.full_name, u.email
           FROM counsellor_student_links l
           JOIN users u ON u.id = l.student_id
           WHERE l.counsellor_id = $1 AND l.status = 'pending' AND l.invited_by = 'student'`
        : `SELECT l.id, l.invited_at, u.full_name, u.email
           FROM counsellor_student_links l
           JOIN users u ON u.id = l.counsellor_id
           WHERE l.student_id = $1 AND l.status = 'pending' AND l.invited_by = 'counsellor'`,
      [req.user.userId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('counsellor/pending failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load pending links' });
  }
});

/**
 * POST /api/counsellor/respond
 * Respond to a pending link invite/request addressed to me.
 * body: { linkId, accept: boolean }
 */
router.post('/respond', async (req, res) => {
  try {
    const { linkId, accept } = req.body;
    if (!linkId || typeof accept !== 'boolean') {
      return res.status(400).json({ success: false, message: 'linkId and accept are required' });
    }
    const pool = dbManager.getDatabase();
    const isCounsellor = req.user.role === 'counsellor';
    const ownerCol = isCounsellor ? 'counsellor_id' : 'student_id';

    const { rows } = await pool.query(
      `UPDATE counsellor_student_links
       SET status = $1, responded_at = NOW()
       WHERE id = $2 AND ${ownerCol} = $3 AND status = 'pending'
       RETURNING id, status`,
      [accept ? 'active' : 'declined', linkId, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching pending link found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    logger.error('counsellor/respond failed:', error);
    res.status(500).json({ success: false, message: 'Failed to respond to link' });
  }
});

/**
 * DELETE /api/counsellor/link/:studentId
 * Revoke an active link. Either party can revoke.
 */
router.delete('/link/:studentId', async (req, res) => {
  try {
    const pool = dbManager.getDatabase();
    const isCounsellor = req.user.role === 'counsellor';
    const { rows } = await pool.query(
      isCounsellor
        ? `UPDATE counsellor_student_links SET status='revoked', responded_at=NOW()
           WHERE counsellor_id=$1 AND student_id=$2 AND status='active' RETURNING id`
        : `UPDATE counsellor_student_links SET status='revoked', responded_at=NOW()
           WHERE student_id=$1 AND counsellor_id=$2 AND status='active' RETURNING id`,
      [req.user.userId, req.params.studentId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active link found' });
    }
    res.json({ success: true });
  } catch (error) {
    logger.error('counsellor/link revoke failed:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke link' });
  }
});

// ── Roster + per-student detail (counsellor-only) ───────────────────────────

/**
 * GET /api/counsellor/roster
 * All actively-linked students, with an application-progress summary each.
 */
router.get('/roster', counsellorOnly, async (req, res) => {
  try {
    const pool = dbManager.getDatabase();
    const { rows: students } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.graduation_year, l.invited_at, l.responded_at
       FROM counsellor_student_links l
       JOIN users u ON u.id = l.student_id
       WHERE l.counsellor_id = $1 AND l.status = 'active'
       ORDER BY u.full_name ASC NULLS LAST`,
      [req.user.userId]
    );
    if (students.length === 0) {
      return res.json({ success: true, data: [] });
    }
    const studentIds = students.map((s) => s.id);

    const { rows: apps } = await pool.query(
      `SELECT a.id, a.user_id, a.status, a.deadline,
              COALESCE(ci.canonical_name, c.name) AS college_name
       FROM applications a
       LEFT JOIN colleges_full c ON a.college_id = c.id
       LEFT JOIN canonical.institutions ci ON ci.id = a.canonical_institution_id
       WHERE a.user_id = ANY($1)`,
      [studentIds]
    );
    const progress = await getApplicationProgress(pool, apps.map((a) => a.id));

    const appsByStudent = {};
    for (const a of apps) {
      (appsByStudent[a.user_id] ||= []).push({ ...a, progress: progress[a.id] || null });
    }

    const data = students.map((s) => {
      const studentApps = appsByStudent[s.id] || [];
      const completenessValues = studentApps.map((a) => a.progress?.completenessPercent).filter((v) => v != null);
      const avgCompleteness = completenessValues.length
        ? Math.round(completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length)
        : null;
      const nextDeadline = studentApps
        .map((a) => a.deadline)
        .filter(Boolean)
        .sort()[0] || null;
      return {
        studentId: s.id,
        name: s.full_name,
        email: s.email,
        graduationYear: s.graduation_year,
        linkedAt: s.responded_at || s.invited_at,
        applicationCount: studentApps.length,
        avgCompleteness,
        nextDeadline,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    logger.error('counsellor/roster failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load roster' });
  }
});

/**
 * GET /api/counsellor/student/:studentId
 * Detailed per-application progress for one student. 404s (not 403) if
 * there is no active link, to avoid confirming a student id exists.
 */
router.get('/student/:studentId', counsellorOnly, async (req, res) => {
  try {
    const pool = dbManager.getDatabase();
    const { studentId } = req.params;

    const { rows: linkRows } = await pool.query(
      `SELECT 1 FROM counsellor_student_links
       WHERE counsellor_id = $1 AND student_id = $2 AND status = 'active'`,
      [req.user.userId, studentId]
    );
    if (linkRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found in your roster' });
    }

    const { rows: studentRows } = await pool.query(
      `SELECT id, full_name, email, graduation_year, country, intended_major FROM users WHERE id = $1`,
      [studentId]
    );

    const { rows: apps } = await pool.query(
      `SELECT a.id, a.status, a.application_type, a.deadline, a.priority, a.round_type, a.created_at,
              COALESCE(ci.canonical_name, c.name) AS college_name,
              c.country AS college_country
       FROM applications a
       LEFT JOIN colleges_full c ON a.college_id = c.id
       LEFT JOIN canonical.institutions ci ON ci.id = a.canonical_institution_id
       WHERE a.user_id = $1
       ORDER BY a.deadline ASC NULLS LAST`,
      [studentId]
    );
    const progress = await getApplicationProgress(pool, apps.map((a) => a.id));

    const applications = apps.map((a) => ({
      ...a,
      progress: progress[a.id] || { completenessPercent: null, tasksTotal: 0, tasksDone: 0, essaysTotal: 0, essaysDone: 0, missingItems: [] },
    }));

    res.json({
      success: true,
      data: {
        student: studentRows[0] || null,
        applications,
      },
    });
  } catch (error) {
    logger.error('counsellor/student detail failed:', error);
    res.status(500).json({ success: false, message: 'Failed to load student detail' });
  }
});

module.exports = router;
