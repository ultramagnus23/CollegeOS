'use strict';

const dbManager = require('../../config/database');
const { scoreImplicitFeedback } = require('./implicitFeedback');

async function userPreferenceSignals(userId, lookbackDays = 60) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT ure.event_type, ure.event_value, ure.dwell_ms, i.country_code, i.tags
       FROM canonical.user_recommendation_events ure
       LEFT JOIN canonical.institutions i ON i.id = ure.institution_id
      WHERE ure.user_id = $1
        AND ure.created_at >= NOW() - ($2::text || ' days')::interval`,
    [userId, String(lookbackDays)]
  );

  const countryScores = new Map();
  const tagScores = new Map();
  const implicit = scoreImplicitFeedback(rows);

  rows.forEach((row) => {
    const score = (row.event_type === 'recommendation_dismiss' ? -0.3 : 0.2) + (Number(row.event_value) || 0);
    if (row.country_code) {
      countryScores.set(row.country_code, (countryScores.get(row.country_code) || 0) + score);
    }
    (row.tags || []).forEach((tag) => {
      const key = String(tag).toLowerCase();
      tagScores.set(key, (tagScores.get(key) || 0) + score);
    });
  });

  return {
    implicit_score: implicit,
    countries: Object.fromEntries([...countryScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)),
    tags: Object.fromEntries([...tagScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)),
  };
}

module.exports = {
  userPreferenceSignals,
};
