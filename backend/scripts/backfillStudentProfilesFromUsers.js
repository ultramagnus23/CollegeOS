'use strict';

/**
 * One-time, idempotent backfill for the Phase 0 onboarding-persistence bug.
 *
 * Before the fix, onboarding wrote ONLY the `users` table while the rest of the
 * app (profile completion, Settings, recommendation/chancing engines) reads from
 * `student_profiles`. Users who onboarded before the fix therefore have data in
 * `users` but no `student_profiles` row, so their profile shows 0%.
 *
 * This script reconstructs an onboarding payload from each already-onboarded
 * user's `users` row and replays it through the (now fixed) User.updateOnboarding,
 * which mirrors the data into student_profiles. It only recovers fields that were
 * actually stored on `users` (countries, majors, gpa, test scores, budget, career
 * goals, grade, grad year, country) — fields the old flow never sent (subjects,
 * traits, activities, curriculum, phone, dob, school) cannot be recovered and stay
 * empty until the user edits their profile.
 *
 * SAFETY: only users with NO student_profiles row are touched. Users who already
 * have a profile row (populated via the other onboarding path or canonical-sync)
 * are left untouched, so this can never overwrite richer existing data.
 *
 * Usage:
 *   node scripts/backfillStudentProfilesFromUsers.js --dry-run
 *   node scripts/backfillStudentProfilesFromUsers.js [--limit=N]
 */

const dbManager = require('../src/config/database');
const User = require('../src/models/User');
const ProfileService = require('../src/services/profileService');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const limitArg = argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

function parseJson(v, def) {
  if (v == null) return def;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return def; }
}

async function run() {
  const pool = dbManager.getDatabase();

  const { rows: users } = await pool.query(
    `SELECT u.id, u.full_name, u.country, u.gpa, u.sat_score, u.act_score,
            u.intended_major, u.intended_majors, u.target_countries, u.career_goals,
            u.grade_level, u.graduation_year, u.max_budget_per_year, u.budget,
            u.need_financial_aid, u.can_take_loan, u.family_income_usd
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
      WHERE (u.onboarding_complete = 1 OR u.onboarding_completed = TRUE)
        AND sp.user_id IS NULL
      ORDER BY u.id ASC
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}`
  );

  console.log(`Found ${users.length} onboarded user(s).${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  let repaired = 0;
  let skipped = 0;
  for (const u of users) {
    const before = await ProfileService.getCompletionStatus(u.id);

    const payload = {
      name: u.full_name || null,
      country: u.country || null,
      target_countries: parseJson(u.target_countries, []),
      intended_majors: parseJson(u.intended_majors, []),
      intended_major: u.intended_major || null,
      gpa: u.gpa != null ? Number(u.gpa) : null,
      gpa_type: 'gpa', // users.gpa is already normalized to a 0-4 scale
      sat_score: u.sat_score != null ? Number(u.sat_score) : null,
      act_score: u.act_score != null ? Number(u.act_score) : null,
      max_budget_per_year: u.max_budget_per_year != null ? Number(u.max_budget_per_year)
        : (u.budget != null ? Number(u.budget) : null),
      need_financial_aid: u.need_financial_aid,
      can_take_loan: u.can_take_loan,
      family_income_usd: u.family_income_usd != null ? Number(u.family_income_usd) : null,
      career_goals: u.career_goals || null,
      grade_level: u.grade_level || null,
      graduation_year: u.graduation_year != null ? Number(u.graduation_year) : null,
    };

    if (DRY_RUN) {
      console.log(`user ${u.id}: before=${before.percentage}%  (would replay onboarding payload)`);
      continue;
    }

    try {
      await User.updateOnboarding(u.id, payload);
      const after = await ProfileService.getCompletionStatus(u.id);
      console.log(`user ${u.id}: ${before.percentage}% -> ${after.percentage}%`);
      repaired += 1;
    } catch (err) {
      console.error(`user ${u.id}: FAILED -> ${err.message}`);
      skipped += 1;
    }
  }

  console.log(`\nDone. repaired=${repaired} failed=${skipped} dryRun=${DRY_RUN}`);
  await dbManager.close();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('backfill failed', err);
  try { await dbManager.close(); } catch (_e) { /* noop */ }
  process.exit(1);
});
