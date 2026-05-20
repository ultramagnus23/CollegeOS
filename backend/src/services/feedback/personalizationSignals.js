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
    console.log('SQL:', query);
    console.log('PARAMS:', payload);
    ({ rows } = await pool.query(query, payload));
    console.log('QUERY RESULT:', { count: rows?.length || 0, error: null });
  } catch (error) {
    console.log('QUERY RESULT:', {
      count: null,
      error: {
        message: error?.message || null,
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
      },
    });
    console.error('==============================');
    console.error('RECOMMENDATION PIPELINE ERROR');
    console.error('==============================');
    console.error('MESSAGE:', error?.message);
    console.error('STACK:', error?.stack);
    console.error('FULL ERROR:', error);
    if (error?.details) console.error('DETAILS:', error.details);
    if (error?.hint) console.error('HINT:', error.hint);
    if (error?.code) console.error('CODE:', error.code);
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
