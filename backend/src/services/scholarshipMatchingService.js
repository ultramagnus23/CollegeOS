/**
 * Scholarship Matching Service
 *
 * Pure-JavaScript implementation of the scholarship matching engine spec.
 * Called by POST /api/scholarships/match and POST /api/scholarships/explain.
 *
 * Matching pipeline (mirrors the spec exactly):
 *   Step 1 — Hard eligibility filter
 *   Step 2 — Relevance score (0-100)
 *   Step 3 — Net cost calculation in USD and INR
 *   Step 4 — match_reasons and watch_outs strings
 *
 * NEVER hardcodes an INR conversion rate.  Every INR figure uses liveRate
 * that is passed in from the route (fetched from exchangeRateService).
 */

'use strict';

const STALE_THRESHOLD_DAYS = 90;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v); } catch { return []; }
}

function includesAny(arr, values) {
  const a = arr.map(s => typeof s === 'string' ? s.toLowerCase().trim() : '');
  if (a.includes('all')) return true;
  for (const v of values) {
    if (a.includes(String(v).toLowerCase().trim())) return true;
  }
  return false;
}

function daysBetween(dateA, dateB) {
  return Math.round((new Date(dateA) - new Date(dateB)) / 86400000);
}

function isStale(scholarship, todayDate) {
  if (!scholarship.last_verified_at) return true;
  return daysBetween(todayDate, scholarship.last_verified_at) > STALE_THRESHOLD_DAYS;
}

function deadlineStatus(deadline, todayDate) {
  if (!deadline) return 'unknown';
  const days = daysBetween(deadline, todayDate);
  if (days < 0) return 'passed';
  if (days <= 30) return 'closing_soon';
  return 'open';
}

// ─── Step 1: Hard eligibility filter ─────────────────────────────────────────

/**
 * Returns { eligible, eligibilityUncertain, disqualifyingReason }
 */
function checkEligibility(scholarship, profile) {
  const eligNat    = toArray(scholarship.eligible_nationalities);
  const degLevels  = toArray(scholarship.degree_levels);
  const eligMajors = toArray(scholarship.eligible_majors);
  const eligGender = toArray(scholarship.eligible_genders);

  const nationality    = profile.identity?.nationality || 'Indian';
  const degreeLevel    = profile.academic?.degree_level || 'undergraduate';
  const intendedMajor  = profile.academic?.intended_major || null;
  const gender         = profile.identity?.gender || null;
  const gpa            = profile.academic?.gpa_4_scale ?? null;
  const percentage     = profile.academic?.percentage ?? profile.academic?.class_12_percentage ?? null;
  const sat            = profile.academic?.sat_total ?? null;
  const ielts          = profile.academic?.ielts_overall ?? null;
  const incomeInr      = profile.financial?.annual_family_income_inr ?? null;

  // a. Nationality
  if (!includesAny(eligNat, [nationality, 'Indian', 'All'])) {
    return {
      eligible: false, eligibilityUncertain: false,
      disqualifyingReason: `This scholarship is not open to ${nationality} nationals.`
    };
  }

  // b. Degree level
  if (degLevels.length > 0 && !includesAny(degLevels, [degreeLevel, 'All'])) {
    return {
      eligible: false, eligibilityUncertain: false,
      disqualifyingReason: `This scholarship is for ${degLevels.join(' or ')} students only.`
    };
  }

  // c. Major
  if (intendedMajor && !includesAny(eligMajors, [intendedMajor, 'All'])) {
    return {
      eligible: false, eligibilityUncertain: false,
      disqualifyingReason: `This scholarship is only for majors: ${toArray(scholarship.eligible_majors).join(', ')}.`
    };
  }

  // d. Gender
  if (gender && eligGender.length > 0 && !includesAny(eligGender, [gender, 'All'])) {
    return {
      eligible: false, eligibilityUncertain: false,
      disqualifyingReason: `This scholarship is restricted to ${eligGender.join('/')} applicants.`
    };
  }

  // e. GPA floor
  if (scholarship.min_gpa_4_scale != null) {
    const floor = parseFloat(scholarship.min_gpa_4_scale);
    let effectiveGpa = gpa != null ? parseFloat(gpa) : null;
    if (effectiveGpa == null && percentage != null) {
      effectiveGpa = parseFloat(percentage) / 25;
    }
    if (effectiveGpa == null) {
      // UNVERIFIABLE — do not disqualify
      return { eligible: true, eligibilityUncertain: true, disqualifyingReason: null };
    }
    if (effectiveGpa < floor) {
      return {
        eligible: false, eligibilityUncertain: false,
        disqualifyingReason: `Minimum GPA of ${floor.toFixed(1)} required; your GPA is ${effectiveGpa.toFixed(2)}.`
      };
    }
  }

  // f. Percentage floor
  if (scholarship.min_percentage != null) {
    const floor = parseFloat(scholarship.min_percentage);
    const pct = percentage != null ? parseFloat(percentage) : null;
    if (pct != null && pct < floor) {
      return {
        eligible: false, eligibilityUncertain: false,
        disqualifyingReason: `Minimum percentage of ${floor}% required; your score is ${pct}%.`
      };
    }
  }

  // g. SAT floor
  if (scholarship.min_sat != null) {
    const floor = parseInt(scholarship.min_sat);
    if (sat != null && parseInt(sat) < floor) {
      return {
        eligible: false, eligibilityUncertain: false,
        disqualifyingReason: `Minimum SAT of ${floor} required; your score is ${sat}.`
      };
    }
    // If no SAT — UNVERIFIABLE, not disqualified
  }

  // h. IELTS floor
  if (scholarship.min_ielts != null) {
    const floor = parseFloat(scholarship.min_ielts);
    if (ielts != null && parseFloat(ielts) < floor) {
      return {
        eligible: false, eligibilityUncertain: false,
        disqualifyingReason: `Minimum IELTS of ${floor} required; your score is ${ielts}.`
      };
    }
    if (ielts == null) {
      // Check TOEFL equivalent — if neither, treat as UNVERIFIABLE
      return { eligible: true, eligibilityUncertain: true, disqualifyingReason: null };
    }
  }

  // i. Income cap
  if (scholarship.max_family_income_usd != null && incomeInr != null) {
    // We receive liveRate through the outer call; use profile field instead
    // The profile already has live_usd_to_inr set by the route
    const liveRate = profile.live_usd_to_inr;
    if (liveRate && liveRate > 0) {
      const incomeUsd = parseFloat(incomeInr) / liveRate;
      const cap = parseFloat(scholarship.max_family_income_usd);
      if (incomeUsd > cap) {
        return {
          eligible: false, eligibilityUncertain: false,
          disqualifyingReason: `Your family income exceeds the $${cap.toLocaleString()} USD limit for this need-based scholarship.`
        };
      }
    }
  }

  // j. Country preference (only if student has preferences set)
  const prefCountries = toArray(profile.preferences?.preferred_countries);
  if (prefCountries.length > 0 && scholarship.country) {
    const country = scholarship.country.toLowerCase().trim();
    const matches = prefCountries.some(c => c.toLowerCase().trim() === country ||
      country === 'international' || country === 'all');
    if (!matches) {
      return {
        eligible: false, eligibilityUncertain: false,
        disqualifyingReason: `${scholarship.country} is not in your preferred countries list.`
      };
    }
  }

  return { eligible: true, eligibilityUncertain: false, disqualifyingReason: null };
}

// ─── Step 2: Relevance score 0–100 ───────────────────────────────────────────

function computeRelevanceScore(scholarship, profile, todayDate) {
  let score = 0;

  const awardUsd = scholarship.award_usd_per_year != null
    ? parseFloat(scholarship.award_usd_per_year) : 0;
  const budget = profile.financial?.max_budget_per_year_inr ?? null;
  const liveRate = profile.live_usd_to_inr ?? 0;

  // +30: award covers >= 50% of budget
  if (awardUsd > 0 && budget && liveRate > 0) {
    const awardInr = awardUsd * liveRate;
    if (awardInr >= budget * 0.5) score += 30;
  }

  // +20: exact major match (not "All")
  const eligMajors = toArray(scholarship.eligible_majors).map(m => m.toLowerCase().trim());
  const major = (profile.academic?.intended_major || '').toLowerCase().trim();
  if (major && eligMajors.includes(major)) score += 20;

  // +15: scholarship country is student's first preference
  const prefCountries = toArray(profile.preferences?.preferred_countries);
  if (prefCountries.length > 0 && scholarship.country) {
    const country = scholarship.country.toLowerCase().trim();
    if (prefCountries[0].toLowerCase().trim() === country) score += 15;
  }

  // +15: scholarship type matches student's priority
  const schType = scholarship.scholarship_type || '';
  const priority = (profile.financial?.scholarship_priority || '').toLowerCase();
  if (
    (priority === 'merit' && ['merit', 'merit-need'].includes(schType)) ||
    (priority === 'need' && ['need-based', 'merit-need'].includes(schType)) ||
    (priority === 'high' && schType !== 'external')
  ) {
    score += 15;
  }

  // +10: student exceeds GPA floor by >= 0.3
  if (scholarship.min_gpa_4_scale != null) {
    const gpa = parseFloat(profile.academic?.gpa_4_scale ?? (profile.academic?.percentage ?? 0) / 25);
    if (gpa - parseFloat(scholarship.min_gpa_4_scale) >= 0.3) score += 10;
  }

  // +5: renewable with explicit conditions
  if (scholarship.renewable && scholarship.renewal_conditions) score += 5;

  // +5: deadline is 30–120 days from today
  if (scholarship.deadline) {
    const days = daysBetween(scholarship.deadline, todayDate);
    if (days >= 30 && days <= 120) score += 5;
    if (days < 0) score -= 50; // deadline passed → push to bottom
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Step 3: Net cost ─────────────────────────────────────────────────────────

function computeNetCost(scholarship, profile, liveRate) {
  const awardUsd = scholarship.award_usd_per_year != null
    ? parseFloat(scholarship.award_usd_per_year) : null;

  if (awardUsd == null) {
    return {
      netCostUsd: null, netCostInr: null,
      affordable: null,
      netCostNote: 'Award amount not verified — net cost cannot be calculated.'
    };
  }

  // Net cost requires tuition data from the university object.
  // The scholarships table doesn't join to a university cost row directly,
  // so we compute from award only when university cost is unavailable.
  const tuitionUsd  = scholarship.university_tuition_usd  ?? null;
  const livingUsd   = scholarship.university_living_usd   ?? null;
  const coversList  = toArray(scholarship.award_covers);
  const coversLiving = coversList.some(c => c.toLowerCase() === 'living');
  const coversTuition = coversList.some(c =>
    ['tuition', 'full-tuition', 'full tuition'].includes(c.toLowerCase()));

  if (tuitionUsd == null) {
    // Can't compute total cost without university data
    const budget = profile.financial?.max_budget_per_year_inr ?? null;
    const awardInr = liveRate > 0 ? Math.round(awardUsd * liveRate) : null;
    return {
      netCostUsd: null, netCostInr: null,
      affordable: null,
      awardUsd, awardInr,
      netCostNote: 'Net cost depends on university — verify separately.'
    };
  }

  let subtractUsd = 0;
  if (coversTuition) subtractUsd += Math.min(awardUsd, tuitionUsd);
  else if (coversLiving && livingUsd != null) subtractUsd += Math.min(awardUsd, livingUsd);
  else subtractUsd += awardUsd; // award applied to tuition by default

  const baseCostUsd = tuitionUsd + (livingUsd ?? 0);
  const netCostUsd  = baseCostUsd - subtractUsd;
  const netCostInr  = liveRate > 0 ? Math.round(netCostUsd * liveRate) : null;
  const budget      = profile.financial?.max_budget_per_year_inr ?? null;
  const affordable  = budget != null && netCostInr != null ? netCostInr <= budget : null;

  return { netCostUsd, netCostInr, affordable, awardUsd, awardInr: Math.round(awardUsd * liveRate) };
}

// ─── Step 4: Human-readable reasons and watch-outs ───────────────────────────

function generateMatchReasons(scholarship, profile, eligResult) {
  const reasons = [];

  // Nationality
  const nationality = profile.identity?.nationality || 'Indian';
  const eligNat = toArray(scholarship.eligible_nationalities).map(s => s.toLowerCase());
  if (eligNat.includes('all')) {
    reasons.push(`This scholarship is open to all nationalities including ${nationality} students.`);
  } else {
    reasons.push(`You are ${nationality} and this scholarship is open to ${nationality} nationals.`);
  }

  // Major
  const major = profile.academic?.intended_major;
  const eligMajors = toArray(scholarship.eligible_majors).map(m => m.toLowerCase());
  if (major && eligMajors.includes(major.toLowerCase())) {
    reasons.push(`${major} is explicitly listed as an eligible major.`);
  } else if (eligMajors.includes('all')) {
    reasons.push('All majors are eligible for this scholarship.');
  }

  // GPA
  if (scholarship.min_gpa_4_scale != null) {
    const floor = parseFloat(scholarship.min_gpa_4_scale);
    const gpa = profile.academic?.gpa_4_scale;
    if (gpa != null) {
      reasons.push(`Your GPA of ${parseFloat(gpa).toFixed(2)} meets the ${floor.toFixed(1)} minimum.`);
    }
  }

  // IELTS / TOEFL
  if (scholarship.min_ielts != null) {
    const floor = parseFloat(scholarship.min_ielts);
    const ielts = profile.academic?.ielts_overall;
    if (ielts != null) {
      reasons.push(`Your IELTS score of ${ielts} meets the ${floor} minimum.`);
    }
  }

  // Uncertainty
  if (eligResult.eligibilityUncertain) {
    reasons.push('Eligibility could not be fully verified — some requirements depend on scores not yet provided.');
  }

  return reasons.slice(0, 4);
}

function generateWatchOuts(scholarship, profile) {
  const outs = [];

  // Renewal GPA requirement
  if (scholarship.renewable && scholarship.renewal_conditions) {
    outs.push(`Renewal requires: ${scholarship.renewal_conditions}.`);
  }

  // Deadline urgency
  if (scholarship.deadline) {
    const todayDate = profile.today_date || new Date().toISOString().split('T')[0];
    const days = daysBetween(scholarship.deadline, todayDate);
    if (days >= 0 && days <= 30) {
      outs.push(`Deadline is in ${days} day${days === 1 ? '' : 's'} — apply soon.`);
    }
  }

  // Stale data
  const todayDate = profile.today_date || new Date().toISOString().split('T')[0];
  if (isStale(scholarship, todayDate)) {
    outs.push('Scholarship data may be outdated — verify details on the provider\'s website before applying.');
  }

  return outs.slice(0, 3);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the full matching pipeline.
 *
 * @param {Object} studentProfile  — merged profile from User.getAcademicProfile,
 *                                   plus today_date and live_usd_to_inr fields
 * @param {Array}  scholarships    — rows from Scholarship.findAllForMatching()
 * @returns {Object}               — { results, excluded, summary, generated_at, exchange_rate_used }
 */
function matchScholarships(studentProfile, scholarships) {
  const liveRate = studentProfile.live_usd_to_inr;
  if (!liveRate || liveRate <= 0) {
    throw Object.assign(new Error('exchange_rate_missing'), { code: 'EXCHANGE_RATE_MISSING' });
  }

  const todayDate = studentProfile.today_date || new Date().toISOString().split('T')[0];
  const results   = [];
  const excluded  = [];

  for (const s of scholarships) {
    const sid = String(s.id);

    // Spec rule 3: exclude discontinued/paused immediately
    if (['discontinued', 'paused', 'inactive', 'expired'].includes(s.status)) {
      excluded.push({ scholarship_id: sid, name: s.name, reason: 'discontinued' });
      continue;
    }

    const stale  = isStale(s, todayDate);
    const eligResult = checkEligibility(s, studentProfile);

    const awardUsd = s.award_usd_per_year != null ? parseFloat(s.award_usd_per_year) : null;
    const awardInr = (awardUsd != null && liveRate > 0) ? Math.round(awardUsd * liveRate) : null;
    const amountVerified = awardUsd != null;

    const deadline = s.deadline ? String(s.deadline).slice(0, 10) : null;
    const daysUntilDeadline = deadline ? daysBetween(deadline, todayDate) : null;
    const dStatus = deadlineStatus(deadline, todayDate);

    // Deadline passed without being in excluded list — show but note
    if (dStatus === 'passed' && !eligResult.eligible) {
      excluded.push({ scholarship_id: sid, name: s.name, reason: 'deadline_passed' });
      continue;
    }

    const relevanceScore = eligResult.eligible
      ? computeRelevanceScore(s, studentProfile, todayDate)
      : 0;

    const costResult = computeNetCost(s, studentProfile, liveRate);
    const matchReasons = eligResult.eligible
      ? generateMatchReasons(s, studentProfile, eligResult)
      : [];
    const watchOuts = generateWatchOuts(s, studentProfile);

    results.push({
      scholarship_id:      sid,
      name:                s.name,
      provider:            s.provider,
      country:             s.country || null,
      university_name:     s.university_name || null,
      scholarship_type:    s.scholarship_type || 'external',
      eligible:            eligResult.eligible,
      eligibility_uncertain: eligResult.eligibilityUncertain,
      disqualifying_reason: eligResult.disqualifyingReason,
      relevance_score:     relevanceScore,
      award_usd_per_year:  awardUsd,
      award_inr_per_year:  awardInr,
      award_covers:        toArray(s.award_covers),
      amount_verified:     amountVerified,
      renewable:           !!s.renewable,
      renewal_conditions:  s.renewal_conditions || null,
      net_cost_usd_per_year: costResult.netCostUsd ?? null,
      net_cost_inr_per_year: costResult.netCostInr ?? null,
      affordable:          costResult.affordable ?? null,
      application_deadline: deadline,
      days_until_deadline:  daysUntilDeadline,
      deadline_status:      dStatus,
      portal_url:           s.portal_url || s.application_url || null,
      data_stale:           stale,
      last_verified_at:     s.last_verified_at
        ? String(s.last_verified_at).slice(0, 10) : null,
      match_reasons: matchReasons,
      watch_outs:    watchOuts,
    });
  }

  // Sort eligible by relevance desc, then ineligible by relevance desc
  results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.relevance_score - a.relevance_score;
  });

  const eligible = results.filter(r => r.eligible);
  const affordable = eligible.filter(r => r.affordable === true);
  const awardInrValues = eligible.map(r => r.award_inr_per_year).filter(v => v != null);
  const netCostValues  = eligible.map(r => r.net_cost_inr_per_year).filter(v => v != null);

  return {
    generated_at:       new Date().toISOString(),
    exchange_rate_used: liveRate,
    student_id:         String(studentProfile.id || ''),
    results,
    excluded,
    summary: {
      total_matched:              results.length,
      total_eligible:             eligible.length,
      total_affordable_after_aid: affordable.length,
      best_award_inr_per_year:    awardInrValues.length ? Math.max(...awardInrValues) : null,
      lowest_net_cost_inr_per_year: netCostValues.length ? Math.min(...netCostValues) : null,
      currencies_note: `All INR figures use live rate of ₹${liveRate.toFixed(2)}/USD as of ${new Date().toISOString().split('T')[0]}`,
    },
  };
}

/**
 * Generate a plain-English eligibility explanation for a single scholarship.
 * Used by POST /api/scholarships/explain.
 *
 * @param {Object} scholarship  — single scholarship row
 * @param {Object} profile      — student profile with live_usd_to_inr + today_date
 * @returns {{ explanation: string }}
 */
function explainMatch(scholarship, profile) {
  const eligResult = checkEligibility(scholarship, profile);
  const todayDate  = profile.today_date || new Date().toISOString().split('T')[0];
  const awardUsd   = scholarship.award_usd_per_year != null
    ? parseFloat(scholarship.award_usd_per_year) : null;
  const liveRate   = profile.live_usd_to_inr ?? 0;
  const awardInr   = (awardUsd != null && liveRate > 0)
    ? `₹${Math.round(awardUsd * liveRate).toLocaleString('en-IN')} (at today's rate of ₹${liveRate.toFixed(2)}/USD)`
    : 'an unverified amount';

  let parts = [];

  if (eligResult.eligible) {
    const reasons = generateMatchReasons(scholarship, profile, eligResult);
    parts.push(`You ${eligResult.eligibilityUncertain ? 'tentatively qualify' : 'qualify'} for the ${scholarship.name} from ${scholarship.provider}.`);
    if (reasons.length) parts.push(reasons.join(' '));
    if (awardUsd != null) {
      parts.push(`The award is $${awardUsd.toLocaleString()} per year — ${awardInr} at today's exchange rate.`);
    }
    const wouts = generateWatchOuts(scholarship, profile);
    if (wouts.length) parts.push(`Note: ${wouts.join(' ')}`);
  } else {
    parts.push(`You do not currently qualify for the ${scholarship.name}.`);
    if (eligResult.disqualifyingReason) {
      parts.push(`The specific reason is: ${eligResult.disqualifyingReason}`);
    }
    parts.push('If your circumstances change — for example, after improving your scores — revisit this scholarship.');
    if (awardUsd != null) {
      parts.push(`For reference, this scholarship offers $${awardUsd.toLocaleString()} per year (${awardInr}).`);
    }
  }

  return { explanation: parts.join(' ') };
}

module.exports = { matchScholarships, explainMatch };
