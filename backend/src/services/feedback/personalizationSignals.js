'use strict';

const dbManager = require('../../config/database');
const { scoreImplicitFeedback } = require('./implicitFeedback');

async function userPreferenceSignals(userId, lookbackDays = 60) {
  const pool = dbManager.getDatabase();
  const query = `SELECT
      ure.event_type,
      ure.event_value,
      ure.dwell_ms,
      i.country_code,
      COALESCE(
        ARRAY(
          SELECT jsonb_array_elements_text(
            COALESCE(i.metadata->'tags', '[]'::jsonb)
          )
        ),
        ARRAY[]::text[]
      ) AS semantic_tags
     FROM canonical.user_recommendation_events ure
     LEFT JOIN canonical.institutions i ON i.id = ure.institution_id
    WHERE ure.user_id = $1
      AND ure.created_at >= NOW() - ($2::text || ' days')::interval`;
  const payload = [userId, String(lookbackDays)];
  let rows = [];
  try {
    ({ rows } = await pool.query(query, payload));
  } catch (error) {
    console.error('Recommendation SQL failed', query);
    console.error('Payload:', payload);
    throw error;
  }

  const countryScores = new Map();
  const tagScores = new Map();
  const implicit = scoreImplicitFeedback(rows);

  rows.forEach((row) => {
    const score = (row.event_type === 'recommendation_dismiss' ? -0.3 : 0.2) + (Number(row.event_value) || 0);
    if (row.country_code) {
      countryScores.set(row.country_code, (countryScores.get(row.country_code) || 0) + score);
    }
    (row.semantic_tags || []).forEach((tag) => {
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
