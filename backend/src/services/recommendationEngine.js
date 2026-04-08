// backend/services/recommendationEngine.js
// The brain of CollegeOS — scores colleges for Indian students using four
// components: academic fit (35 pts), financial fit (25 pts),
// values resonance (30 pts), and location preference (10 pts).

const { getUSDtoINR } = require('./exchangeRateService');

// ─── College archetypes ───────────────────────────────────────────────────────
// Used for values resonance and why_values sentence generation.
const ARCHETYPES = {
  'mit': {
    motto: 'Mens et Manus',
    motto_en: 'Mind and Hand',
    culture: 'builder culture; making things not just understanding them; deeply collaborative, allergic to pretension, intense but warm',
    values_strong: ['entrepreneurship', 'research', 'social_impact'],
    values_weak: ['prestige_career', 'creative_expression'],
  },
  'harvard': {
    motto: 'Veritas',
    motto_en: 'Truth',
    culture: 'the establishment university; produces presidents, senators, and CEOs; strong network effects; residential Houses',
    values_strong: ['prestige_career', 'social_impact', 'global_exposure'],
    values_weak: [],
  },
  'stanford': {
    motto: 'Die Luft der Freiheit weht',
    motto_en: 'The wind of freedom blows',
    culture: 'Silicon Valley dream school; entrepreneurship is in the soil; optimistic, future-oriented, comfortable with ambiguity and failure; California lifestyle',
    values_strong: ['entrepreneurship', 'academic_freedom', 'global_exposure'],
    values_weak: [],
  },
  'brown': {
    motto: 'In Deo Speramus',
    motto_en: 'In God We Hope',
    culture: 'open curriculum — no required courses; students design their own degree; strong match for students who feel constrained by traditional structures',
    values_strong: ['academic_freedom', 'creative_expression', 'personal_growth'],
    values_weak: [],
  },
  'university of edinburgh': {
    motto: 'Nec Temere Nec Timide',
    motto_en: 'Neither rashly nor timidly',
    culture: 'Gothic, intellectual, independent; European option for serious academic depth without American hustle; students who want to think slowly and carefully',
    values_strong: ['research', 'academic_freedom', 'global_exposure'],
    values_weak: [],
  },
  'technical university of munich': {
    motto: null,
    motto_en: 'Excellence without ego',
    culture: 'engineering-first, no frills, no tuition fees; Germany\'s answer to MIT; graduating debt-free is realistic; strong STEM research',
    values_strong: ['financial_pragmatism', 'research'],
    values_weak: [],
  },
  'tu munich': {
    motto: null,
    motto_en: 'Excellence without ego',
    culture: 'engineering-first, no frills, no tuition fees; Germany\'s answer to MIT; graduating debt-free is realistic; strong STEM research',
    values_strong: ['financial_pragmatism', 'research'],
    values_weak: [],
  },
  'university of toronto': {
    motto: null,
    motto_en: null,
    culture: 'Canada\'s intellectual anchor; diverse, large, urban; strong for global exposure, public service, and community diversity',
    values_strong: ['global_exposure', 'financial_pragmatism', 'social_impact'],
    values_weak: [],
  },
  'nus': {
    motto: 'Towards a Brighter World',
    motto_en: 'Towards a Brighter World',
    culture: 'strong industry links to Southeast Asian tech; match for global exposure and Asia-focused careers; lower cost than US',
    values_strong: ['global_exposure', 'financial_pragmatism', 'entrepreneurship'],
    values_weak: [],
  },
  'national university of singapore': {
    motto: 'Towards a Brighter World',
    motto_en: 'Towards a Brighter World',
    culture: 'strong industry links to Southeast Asian tech; match for global exposure and Asia-focused careers; lower cost than US',
    values_strong: ['global_exposure', 'financial_pragmatism', 'entrepreneurship'],
    values_weak: [],
  },
  'minerva': {
    motto: null,
    motto_en: null,
    culture: 'no fixed campus; rotates through seven global cities (San Francisco, Seoul, Hyderabad, Berlin, Buenos Aires, London, Taipei); all seminars, no lectures; challenges students in unfamiliar environments',
    values_strong: ['global_exposure', 'academic_freedom', 'personal_growth'],
    values_weak: [],
  },
};

function _archetype(collegeName) {
  const key = (collegeName || '').toLowerCase().trim();
  if (ARCHETYPES[key]) return ARCHETYPES[key];
  // Partial match for common abbreviations / partial names
  for (const [k, v] of Object.entries(ARCHETYPES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

// ─── Living cost estimates by country (USD/year) ──────────────────────────────
function _livingCostUSD(country) {
  const c = (country || '').toLowerCase();
  if (c.includes('united states') || c === 'usa' || c === 'us') return 20000;
  if (c.includes('united kingdom') || c === 'uk') return 16000;
  if (c.includes('canada')) return 13000;
  if (c.includes('australia')) return 15000;
  if (c.includes('germany')) return 11000;
  if (c.includes('singapore')) return 13000;
  if (c.includes('france')) return 12000;
  if (c.includes('japan')) return 12000;
  if (c.includes('netherlands')) return 12000;
  return 13000; // default
}

// ─── Academic fit (0–35 points) ───────────────────────────────────────────────
function _scoreAcademic(student, college) {
  let pts = 0;
  let reasons = [];

  const studentGpa   = student.gpa || student.academic?.gpa || null;
  const studentPct   = student.percentage || student.academic?.percentage || null;
  const studentSat   = student.sat_score || student.academic?.sat_score || null;
  const studentIelts = student.ielts || null;
  const intendedMajor = student.preferences?.intended_major
    || (Array.isArray(student.intended_majors) && student.intended_majors[0])
    || null;

  const collegeGpa  = college.gpa50 || college.averageGPA || college.average_gpa || null;
  const collegeSat  = college.satAvg || college.sat_avg || null;
  const programs = [
    ...(Array.isArray(college.majorCategories) ? college.majorCategories : []),
    ...(Array.isArray(college.programs) ? college.programs : []),
    ...(Array.isArray(college.academicStrengths) ? college.academicStrengths : []),
  ].map(p => (typeof p === 'string' ? p : (p?.programName || p?.name || ''))).filter(Boolean);

  // GPA / percentage match (15 pts)
  if (studentGpa && collegeGpa) {
    const diff = studentGpa - collegeGpa;
    if (diff >= 0.3) { pts += 15; reasons.push(`Your GPA of ${studentGpa} is comfortably above the typical admit GPA of ${collegeGpa}`); }
    else if (diff >= 0) { pts += 12; reasons.push(`Your GPA of ${studentGpa} is in line with typical admits (avg ${collegeGpa})`); }
    else if (diff >= -0.3) { pts += 8; reasons.push(`Your GPA is slightly below the typical admit average of ${collegeGpa} — borderline`); }
    else if (diff >= -0.6) { pts += 4; reasons.push(`Your GPA is below the typical admit average — this is a reach academically`); }
    else { pts += 1; reasons.push(`Your GPA is well below the typical admit — academic reach`); }
  } else if (studentPct) {
    // Use percentage as proxy: top Indian boards context
    if (studentPct >= 90) { pts += 12; reasons.push(`${studentPct}% board score is highly competitive internationally`); }
    else if (studentPct >= 80) { pts += 8; reasons.push(`${studentPct}% board score is solid`); }
    else if (studentPct >= 70) { pts += 5; reasons.push(`${studentPct}% board score is acceptable for many programs`); }
    else { pts += 2; reasons.push(`${studentPct}% board score may be below expectations at competitive schools`); }
  } else {
    pts += 7; // No data — neutral
    reasons.push('Academic data incomplete — scores estimated');
  }

  // SAT / IELTS (10 pts)
  if (studentSat && collegeSat) {
    const diff = studentSat - collegeSat;
    if (diff >= 50)  { pts += 10; reasons.push(`Your SAT of ${studentSat} is above the college average of ${collegeSat}`); }
    else if (diff >= 0) { pts += 8; reasons.push(`Your SAT of ${studentSat} is at or near the college average`); }
    else if (diff >= -100) { pts += 5; reasons.push(`Your SAT of ${studentSat} is somewhat below the college average of ${collegeSat}`); }
    else { pts += 2; reasons.push(`Your SAT is below the competitive range for this college`); }
  } else if (studentIelts) {
    if (studentIelts >= 7.5) { pts += 10; reasons.push(`IELTS ${studentIelts} is highly competitive for English-medium programs`); }
    else if (studentIelts >= 7.0) { pts += 7; reasons.push(`IELTS ${studentIelts} meets requirements for most programs`); }
    else if (studentIelts >= 6.5) { pts += 4; reasons.push(`IELTS ${studentIelts} meets minimum requirements but may limit options`); }
    else { pts += 1; reasons.push(`IELTS ${studentIelts} may be below requirements for some programs`); }
  } else {
    pts += 5; // No data — neutral
  }

  // Intended major (10 pts)
  if (intendedMajor) {
    const ml = intendedMajor.toLowerCase();
    const strongMatch = programs.some(p => {
      const pl = p.toLowerCase();
      return pl.includes(ml) || ml.includes(pl);
    });
    const partialMatch = !strongMatch && programs.some(p => {
      const pl = p.toLowerCase();
      const words = ml.split(/\s+/);
      return words.some(w => w.length > 3 && pl.includes(w));
    });
    if (strongMatch) { pts += 10; reasons.push(`${college.name} has a strong program in ${intendedMajor}`); }
    else if (partialMatch) { pts += 5; reasons.push(`${college.name} offers related programs that overlap with ${intendedMajor}`); }
    else { pts += 2; reasons.push(`${intendedMajor} may not be a featured strength at ${college.name}`); }
  } else {
    pts += 6; // No declared major — neutral
  }

  return { pts: Math.min(35, pts), reasons };
}

// ─── Financial fit (0–25 points) ─────────────────────────────────────────────
function _scoreFinancial(student, college, usdToInr) {
  const budgetInr = student.financial?.max_budget_per_year || student.max_budget_per_year_inr || null;
  const fundingRows = Array.isArray(college.funding) ? college.funding : [];
  const country = (college.country || '').toLowerCase();

  // Tuition
  const tuitionUsd = college.tuitionInternational
    || college.cf_tuition_international
    || college.tuition_international
    || (country.includes('germany') ? 0 : 50000);

  const livingUsd = _livingCostUSD(college.country);
  const grossCostUsd = tuitionUsd + livingUsd;

  // Best available aid for international students
  const intlFunding = fundingRows.filter(f => f.international_students_eligible);
  const bestAidUsd = intlFunding.reduce((max, f) => {
    const award = parseFloat(f.average_award_usd) || 0;
    return award > max ? award : max;
  }, 0);

  const netCostUsd = Math.max(0, grossCostUsd - bestAidUsd);
  const netCostInr = Math.round(netCostUsd * usdToInr);
  const affordable = budgetInr ? netCostInr <= budgetInr : false;

  let pts = 0;
  const reasons = [];

  // Budget match (15 pts)
  if (budgetInr) {
    if (netCostInr <= budgetInr) {
      pts += 15;
      reasons.push(`Net cost of ₹${(netCostInr / 100000).toFixed(1)}L/year is within your budget`);
    } else if (netCostInr <= budgetInr * 1.2) {
      pts += 10;
      reasons.push(`Net cost of ₹${(netCostInr / 100000).toFixed(1)}L/year is ~${Math.round((netCostInr / budgetInr - 1) * 100)}% over budget — manageable gap`);
    } else if (netCostInr <= budgetInr * 1.5) {
      pts += 5;
      reasons.push(`Net cost of ₹${(netCostInr / 100000).toFixed(1)}L/year is ${Math.round((netCostInr / budgetInr - 1) * 100)}% over budget — significant stretch`);
    } else {
      pts += 0;
      reasons.push(`Net cost of ₹${(netCostInr / 100000).toFixed(1)}L/year is well above your stated budget`);
    }
  } else {
    pts += 7; // Unknown budget — neutral
    reasons.push('No budget specified — cost assessment is estimated');
  }

  // Full need bonus (5 pts)
  const meetsFullNeed = intlFunding.some(f => f.meets_full_demonstrated_need);
  if (meetsFullNeed) {
    pts += 5;
    reasons.push(`${college.name} meets 100% of demonstrated financial need for international students — this is rare and highly valuable`);
  }

  // Indian student scholarships (5 pts)
  // Germany charges no tuition — counts as a built-in grant for any student
  if (country.includes('germany') && tuitionUsd === 0) {
    pts += 5;
    reasons.push('Germany charges no tuition fees — you only pay a small semester contribution (~€150), which dramatically lowers the real cost');
  } else if (bestAidUsd > 0) {
    pts += 3;
    reasons.push(`Known institutional aid of $${bestAidUsd.toLocaleString()}/year is available for international students`);
  }

  return {
    pts: Math.min(25, pts),
    grossCostUsd,
    knownAidUsd: bestAidUsd,
    netCostUsd,
    netCostInr,
    affordable,
    reasons,
  };
}

// ─── Values resonance (0–30 points) ──────────────────────────────────────────
function _scoreValues(student, college) {
  const valuesVector = student.values_vector;
  if (!valuesVector || !Array.isArray(valuesVector.dominant_values)) {
    return { pts: 0, whyValues: [] };
  }

  const dominant = valuesVector.dominant_values.slice(); // all dominant values
  const top3 = dominant.slice(0, 3);
  const dimensions = valuesVector.dimensions || {};
  const arch = _archetype(college.name);
  const name = college.name || '';
  const country = (college.country || '').toLowerCase();
  const acceptanceRate = college.acceptance_rate || 0.5;
  const fundingRows = Array.isArray(college.funding) ? college.funding : [];
  const description = [
    college.description || '',
    (Array.isArray(college.academicStrengths) ? college.academicStrengths : []).join(' '),
  ].join(' ').toLowerCase();

  let pts = 0;
  const whyValues = [];

  // Each of the top 3 dominant values is worth up to 7 pts
  for (const value of top3) {
    const evidence = dimensions[value]?.evidence || null;
    let valuePts = 0;
    let statement = null;

    const signalText = arch
      ? `${arch.culture} ${description}`
      : description;

    if (arch && arch.values_strong.includes(value)) {
      valuePts = 7; // strong archetype match
    }

    switch (value) {
      case 'entrepreneurship':
        if (!valuePts) {
          if (/silicon valley|startup|entrepreneurship|innovation|venture|builder/i.test(signalText)) valuePts = 7;
          else if (country.includes('united states') && acceptanceRate > 0.20) valuePts = 4;
          else if (country.includes('singapore') || country.includes('canada')) valuePts = 3;
        }
        if (valuePts > 0) {
          const mottoNote = arch?.motto ? ` whose motto "${arch.motto}" (${arch.motto_en}) captures` : ' that captures';
          statement = `${name} is a place${mottoNote} the builder spirit${evidence ? `, matching what you wrote about "${evidence}"` : ' — building things rather than just studying them'}.`;
        }
        break;

      case 'research':
        if (!valuePts) {
          if (/r1|research university|phd|doctoral|laboratory|lab|research-intensive/i.test(signalText)) valuePts = 7;
          else if (acceptanceRate < 0.10) valuePts = 5;
        }
        if (valuePts > 0) {
          const mottoNote = arch?.motto ? ` (motto: "${arch.motto}" — ${arch.motto_en})` : '';
          statement = `${name}${mottoNote} is one of the world's leading research environments${evidence ? `, aligned with your stated goal to "${evidence}"` : ', for students who want to push the boundaries of knowledge'}.`;
        }
        break;

      case 'social_impact':
        if (!valuePts) {
          if (/liberal arts|public policy|social policy|development|community|civic|impact/i.test(signalText)) valuePts = 7;
          else if (arch?.values_strong.includes('social_impact')) valuePts = 5;
        }
        if (valuePts > 0) {
          statement = `${name}'s emphasis on public policy, community engagement, and civic leadership aligns with your motivation to ${evidence ? `"${evidence}"` : 'fix systems and help communities'}.`;
        }
        break;

      case 'prestige_career':
        if (!valuePts) {
          if (acceptanceRate < 0.10) valuePts = 7;
          else if (acceptanceRate < 0.15) valuePts = 5;
          else if (acceptanceRate < 0.25) valuePts = 3;
        }
        if (valuePts > 0) {
          const arRate = (acceptanceRate * 100).toFixed(1);
          statement = `${name}'s ${arRate}% acceptance rate and brand recognition means top recruiters — consulting, finance, and tech — actively hire from here${evidence ? `, which connects directly to "${evidence}"` : ''}.`;
        }
        break;

      case 'creative_expression':
        if (!valuePts) {
          if (/arts|design|music|film|creative|media|humanities|studio/i.test(signalText)) valuePts = 7;
        }
        if (valuePts > 0) {
          statement = `${name}'s arts and creative programs give you a place to ${evidence ? `"${evidence}"` : 'explore art, design, and cultural expression alongside a rigorous academic environment'}.`;
        }
        break;

      case 'community_belonging':
        if (!valuePts) {
          if (/community|campus life|tradition|spirit|athletics|residential|house/i.test(signalText)) valuePts = 6;
          else valuePts = 3; // most campuses have some community
        }
        if (valuePts > 0) {
          const cultureHint = arch?.culture?.includes('residential') ? 'its residential House system creates real community' : 'its campus culture';
          statement = `${name}'s ${cultureHint} creates the kind of close-knit belonging you described${evidence ? ` — "${evidence}"` : ''}.`;
        }
        break;

      case 'global_exposure':
        if (!valuePts) {
          if (country.includes('united states') || country.includes('united kingdom') ||
              country.includes('canada') || country.includes('australia') ||
              country.includes('germany') || country.includes('singapore')) valuePts = 7;
          else if (!country.includes('india')) valuePts = 5;
        }
        if (valuePts > 0) {
          const mottoNote = arch?.motto ? ` (motto: "${arch.motto}")` : '';
          statement = `${name}${mottoNote} puts you in an international classroom — meeting students from dozens of countries${evidence ? `, which is exactly what you meant by "${evidence}"` : ', building the global network you want'}.`;
        }
        break;

      case 'academic_freedom':
        if (!valuePts) {
          if (/open curriculum|design your own|no core|no required|flexible|interdisciplinary/i.test(signalText) ||
              name.toLowerCase().includes('brown')) valuePts = 7;
          else if (/liberal arts/i.test(signalText)) valuePts = 5;
        }
        if (valuePts > 0) {
          const freedomNote = arch?.culture?.includes('open curriculum')
            ? 'open curriculum — there are no required courses, so you truly design your own degree'
            : 'flexible, interdisciplinary curriculum';
          statement = `${name}'s ${freedomNote} directly addresses your desire to ${evidence ? `"${evidence}"` : 'explore broadly without being locked into a fixed track'}.`;
        }
        break;

      case 'financial_pragmatism': {
        if (!valuePts) {
          const meetsNeed = fundingRows.some(f => f.meets_full_demonstrated_need && f.international_students_eligible);
          if (meetsNeed) valuePts = 7;
          else if (country.includes('germany')) valuePts = 7;
          else if (country.includes('canada') || country.includes('singapore')) valuePts = 5;
        }
        if (valuePts > 0) {
          const meetsNeed = fundingRows.some(f => f.meets_full_demonstrated_need && f.international_students_eligible);
          const reason = meetsNeed
            ? 'meets 100% of demonstrated financial need — meaning your actual cost is tied to what your family can genuinely afford'
            : country.includes('germany')
              ? 'charges no tuition fees — you graduate debt-free, which is exactly the ROI-focused thinking you described'
              : 'offers lower-cost study compared to US programs';
          statement = `${name} ${reason}${evidence ? `, which speaks directly to "${evidence}"` : ''}.`;
        }
        break;
      }

      case 'personal_growth':
        if (!valuePts) {
          if (/wellness|counseling|support|mental health|holistic|liberal arts/i.test(signalText)) valuePts = 6;
          else valuePts = 3; // most universities offer some support
        }
        if (valuePts > 0) {
          const growthNote = arch?.culture?.includes('no fixed campus')
            ? 'rotating through seven global cities forces you out of your comfort zone and accelerates personal growth in ways a single-campus university cannot'
            : 'holistic approach to student development creates space for genuine self-discovery';
          statement = `${name}'s ${growthNote}${evidence ? ` — you described wanting to "${evidence}"` : ''}.`;
        }
        break;
    }

    if (valuePts > 0 && statement) {
      pts += valuePts;
      whyValues.push({ dimension: value, statement });
    }
  }

  // Motto / culture alignment bonus (9 pts)
  // Award 3 pts per strong archetype signal that matches any of the student's dominant values
  if (arch) {
    const bonusDimensions = dominant.filter(v => arch.values_strong.includes(v));
    const bonusPts = Math.min(9, bonusDimensions.length * 3);
    pts += bonusPts;
  } else {
    // Non-archetype: partial bonus based on acceptance rate and location signals
    if (acceptanceRate < 0.10) pts += 3; // elite school signal
    if (!country.includes('india')) pts += 3; // international exposure
  }

  return { pts: Math.min(30, pts), whyValues };
}

// ─── Location preference (10 points) ─────────────────────────────────────────
function _scoreLocation(student, college) {
  const preferred = (
    student.preferences?.preferred_countries ||
    student.target_countries ||
    []
  ).map(c => (c || '').toLowerCase().trim());

  const collegeCountry = (college.country || '').toLowerCase().trim();

  if (preferred.length === 0) return { pts: 5, reason: 'No country preference set — neutral score' };

  const directMatch = preferred.some(p =>
    collegeCountry.includes(p) || p.includes(collegeCountry)
  );

  if (directMatch) return { pts: 10, reason: `${college.country} is one of your preferred countries` };

  // Penalise India-only results (students want to study abroad)
  if (collegeCountry === 'india') return { pts: 0, reason: 'College is in India; student is seeking international options' };

  return { pts: 5, reason: `${college.country} is not in your preferred list but not excluded` };
}

// ─── Chance label ─────────────────────────────────────────────────────────────
function _chanceLabel(student, college, academicPts) {
  const acceptanceRate = (college.acceptance_rate || 0.5) * 100; // convert to %
  // Estimate student admission probability from academic fit (0–35 pts → 0–100%)
  const estimatedProb = Math.min(95, (academicPts / 35) * 100);
  const diff = estimatedProb - acceptanceRate;

  if (diff > 15) return 'Likely';
  if (diff >= -15) return 'Match';
  return 'Reach';
}

// ─── Watch-outs (genuine concerns only) ──────────────────────────────────────
function _watchOuts(student, college, financial, academic) {
  const concerns = [];
  const acceptanceRate = (college.acceptance_rate || 0.5) * 100;

  if (acceptanceRate < 10) {
    concerns.push(`Extremely selective at ${acceptanceRate.toFixed(1)}% — apply with eyes open and have backup options`);
  } else if (acceptanceRate < 15) {
    concerns.push(`Highly selective at ${acceptanceRate.toFixed(1)}% acceptance — treat as a reach even with a strong profile`);
  }

  if (!financial.affordable && financial.netCostInr > 0) {
    const budgetInr = student.financial?.max_budget_per_year || student.max_budget_per_year_inr;
    if (budgetInr && financial.netCostInr > budgetInr * 1.3) {
      concerns.push(`Net cost of ₹${(financial.netCostInr / 100000).toFixed(1)}L/year is significantly over your budget — explore loan options or negotiate aid before committing`);
    }
  }

  const country = (college.country || '').toLowerCase();
  if (country.includes('united states')) {
    const intendedMajor = student.preferences?.intended_major || '';
    if (!intendedMajor && !student.values_vector) {
      concerns.push('The US application requires strong essays and extracurriculars — start early (12–18 months before deadline)');
    }
  }

  return concerns.slice(0, 3);
}

// ─── Main: generateRecommendations ───────────────────────────────────────────
/**
 * Score all colleges for a student and return a structured result object.
 *
 * Returns { generated_at, exchange_rate_used, student_id, recommendations, summary }
 * or { error: 'exchange_rate_missing' } if the live rate is unavailable.
 */
async function generateRecommendations(studentProfile, allColleges) {
  let usdToInr = await getUSDtoINR().catch(() => null);
  const rateEstimated = !usdToInr || usdToInr <= 0;
  if (rateEstimated) {
    usdToInr = 83; // fallback rate — marked as estimated in response
  }

  const now = new Date().toISOString();
  const recs = [];

  for (const college of allColleges) {
    const academic  = _scoreAcademic(studentProfile, college);
    const financial = _scoreFinancial(studentProfile, college, usdToInr);
    const values    = _scoreValues(studentProfile, college);
    const location  = _scoreLocation(studentProfile, college);

    // Sum all four components; location can be 0–10 (no negative in this spec)
    const finalScore = Math.max(0, Math.min(100,
      academic.pts + financial.pts + values.pts + location.pts
    ));

    const chanceLabel = _chanceLabel(studentProfile, college, academic.pts);
    const watchOuts   = _watchOuts(studentProfile, college, financial, academic);
    const arPct       = (college.acceptance_rate || null) !== null
      ? parseFloat((college.acceptance_rate * 100).toFixed(1))
      : null;

    recs.push({
      college_id:            college.id,
      college_name:          college.name,
      country:               college.country,
      overall_score:         finalScore,
      score_breakdown: {
        academic_fit:         academic.pts,
        financial_fit:        financial.pts,
        values_resonance:     values.pts,
        location_preference:  location.pts,
      },
      gross_cost_usd_per_year: financial.grossCostUsd,
      known_aid_usd_per_year:  financial.knownAidUsd,
      net_cost_usd_per_year:   financial.netCostUsd,
      net_cost_inr_per_year:   financial.netCostInr,
      affordable:              financial.affordable,
      acceptance_rate_pct:     arPct,
      chance_label:            chanceLabel,
      why_academic:            academic.reasons.slice(0, 2).join('. '),
      why_financial:           financial.reasons.slice(0, 2).join('. '),
      why_values:              values.whyValues,
      watch_outs:              watchOuts,
      apply_by:                college.applicationDeadline || college.application_deadline || null,
    });
  }

  recs.sort((a, b) => b.overall_score - a.overall_score);

  const affordable = recs.filter(r => r.affordable);
  const byValues = recs.slice().sort(
    (a, b) => b.score_breakdown.values_resonance - a.score_breakdown.values_resonance
  );
  const byNetCost = affordable.slice().sort(
    (a, b) => a.net_cost_inr_per_year - b.net_cost_inr_per_year
  );

  return {
    generated_at:       now,
    exchange_rate_used: usdToInr,
    exchange_rate_estimated: rateEstimated,
    student_id:         studentProfile.id,
    recommendations:    recs,
    summary: {
      total_colleges_evaluated: allColleges.length,
      total_affordable:         affordable.length,
      best_values_match:        byValues[0]?.college_name || null,
      most_affordable_match:    byNetCost[0]?.college_name || null,
      exchange_rate_note:       rateEstimated
        ? `INR figures use estimated rate of ₹${usdToInr} per USD (live rate unavailable)`
        : `All INR figures use live rate of ₹${usdToInr.toFixed(1)} per USD as of today`,
    },
  };
}

// ─── Filter helper (kept for backward compatibility) ─────────────────────────
function filterRecommendations(recommendations, filters) {
  // Accept either raw array or the new structured result
  const recs = Array.isArray(recommendations)
    ? recommendations
    : (recommendations?.recommendations || []);

  let filtered = [...recs];

  if (filters.classification && filters.classification !== 'all') {
    const cl = filters.classification.toUpperCase();
    // Support both old REACH/TARGET/SAFETY and new Reach/Match/Likely
    filtered = filtered.filter(r =>
      (r.chance_label?.toUpperCase() === cl) ||
      (r.classification?.toUpperCase() === cl)
    );
  }

  if (filters.within_budget) {
    filtered = filtered.filter(r => r.affordable || r.financial_fit?.within_budget);
  }

  if (filters.country) {
    filtered = filtered.filter(r =>
      (r.country || r.college?.country || '').toLowerCase() === filters.country.toLowerCase()
    );
  }

  if (filters.sort === 'cost') {
    filtered.sort((a, b) =>
      (a.net_cost_inr_per_year || a.financial_fit?.total_per_year || 0) -
      (b.net_cost_inr_per_year || b.financial_fit?.total_per_year || 0)
    );
  } else if (filters.sort === 'ranking' || filters.sort === 'acceptance_rate') {
    filtered.sort((a, b) =>
      (a.acceptance_rate_pct || a.college?.acceptance_rate || 100) -
      (b.acceptance_rate_pct || b.college?.acceptance_rate || 100)
    );
  }

  return filtered;
}

module.exports = {
  generateRecommendations,
  filterRecommendations
};