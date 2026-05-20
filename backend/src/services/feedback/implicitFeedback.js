'use strict';

const WEIGHTS = {
  recommendation_click: 0.15,
  recommendation_save: 0.4,
  recommendation_compare: 0.2,
  application_added: 0.65,
  recommendation_dismiss: -0.3,
  time_spent: 0.2,
  shortlist_add: 0.5,
  profile_edit_after_recommendation: 0.1,
};

function scoreImplicitFeedback(events = []) {
  let total = 0;
  let count = 0;
  for (const event of events) {
    const weight = WEIGHTS[event.event_type] || 0;
    const eventValue = Number(event.event_value);
    const dwellBoost = event.event_type === 'time_spent'
      ? Math.min(1, (Number(event.dwell_ms) || 0) / 180000)
      : 0;
    const magnitude = Number.isFinite(eventValue) ? eventValue : 1;
    total += weight * (magnitude + dwellBoost);
    count += 1;
  }
  if (!count) return 0;
  return Math.max(-1, Math.min(1, total / count));
}

module.exports = {
  scoreImplicitFeedback,
};
