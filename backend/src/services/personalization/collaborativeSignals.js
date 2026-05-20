'use strict';

const dbManager = require('../../config/database');

async function similarUsersInstitutions(userId, limit = 30) {
  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `WITH user_vectors AS (
      SELECT institution_id, AVG(CASE WHEN event_type IN ('recommendation_save','shortlist_add','application_added') THEN 1.0 ELSE 0.0 END) AS affinity
      FROM canonical.user_recommendation_events
      WHERE user_id = $1
      GROUP BY institution_id
    ),
    peer_users AS (
      SELECT ure.user_id, SUM(uv.affinity) AS overlap
      FROM canonical.user_recommendation_events ure
      JOIN user_vectors uv ON uv.institution_id = ure.institution_id
      WHERE ure.user_id <> $1
      GROUP BY ure.user_id
      ORDER BY overlap DESC
      LIMIT 80
    )
    SELECT ure.institution_id, COUNT(*)::int AS support
    FROM canonical.user_recommendation_events ure
    JOIN peer_users pu ON pu.user_id = ure.user_id
    WHERE ure.event_type IN ('recommendation_save','shortlist_add','application_added')
    GROUP BY ure.institution_id
    ORDER BY support DESC
    LIMIT $2`,
    [userId, Math.max(10, Math.min(100, Number(limit) || 30))]
  );
  return rows;
}

module.exports = {
  similarUsersInstitutions,
};
