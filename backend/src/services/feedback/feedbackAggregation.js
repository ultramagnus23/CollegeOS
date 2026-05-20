'use strict';

const dbManager = require('../../config/database');
const { scoreImplicitFeedback } = require('./implicitFeedback');

async function aggregateInstitutionFeedback(institutionId, lookbackDays = 45) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT event_type, event_value, dwell_ms
       FROM canonical.user_recommendation_events
      WHERE institution_id = $1
        AND created_at >= NOW() - ($2::text || ' days')::interval`,
    [institutionId, String(lookbackDays)]
  );

  const implicit = scoreImplicitFeedback(rows);
  const { rows: feedbackRows } = await pool.query(
    `SELECT AVG(explicit_rating) AS explicit_rating, AVG(fit_rating) AS fit_rating, AVG(affordability_rating) AS affordability_rating
       FROM canonical.recommendation_feedback
      WHERE institution_id = $1`,
    [institutionId]
  );

  const explicit = feedbackRows[0] || {};
  return {
    implicit_score: Number(implicit.toFixed(6)),
    explicit_rating: Number(explicit.explicit_rating) || null,
    fit_rating: Number(explicit.fit_rating) || null,
    affordability_rating: Number(explicit.affordability_rating) || null,
  };
}

module.exports = {
  aggregateInstitutionFeedback,
};
