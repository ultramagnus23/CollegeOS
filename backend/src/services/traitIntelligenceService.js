const CATEGORY_MAP = {
  creative: ['Creative', 'Artistic', 'Experimental', 'Imaginative', 'Design-Oriented', 'Aesthetic Thinker'],
  leadership: ['Visionary', 'Organizer', 'Community Builder', 'Delegator', 'Strategic Leader', 'Persuasive'],
  technical: ['Analytical', 'Systems Thinker', 'Problem Solver', 'Logical', 'Detail-Oriented', 'Research-Oriented'],
  social: ['Empathetic', 'Collaborative', 'Mentor', 'Communicator', 'Diplomatic', 'Listener'],
  execution: ['Disciplined', 'Consistent', 'Competitive', 'Ambitious', 'Independent', 'Self-Starter'],
  innovation: ['Entrepreneurial', 'Risk-Taker', 'Builder', 'Inventor', 'Product Thinker', 'Futurist'],
  global: ['Humanitarian', 'Culturally Curious', 'Ethical Thinker', 'Sustainability-Oriented', 'Policy-Oriented'],
};

const toSet = (arr) => new Set((arr || []).map((v) => String(v).trim()).filter(Boolean));

const categoryScore = (traits, weights = {}) => {
  const selected = toSet(traits);
  const scores = {};
  Object.entries(CATEGORY_MAP).forEach(([category, list]) => {
    let score = 0;
    list.forEach((trait) => {
      if (selected.has(trait)) score += Number(weights[trait] || 3);
    });
    scores[category] = score;
  });
  return scores;
};

const topEntries = (obj, count = 3) =>
  Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([k]) => k);

function computeTraitIntelligence(traits = [], traitWeights = {}, pairings = []) {
  const scores = categoryScore(traits, traitWeights);
  const dominant = topEntries(scores, 2);

  const archetypeKey = dominant.join('-');
  const archetype = {
    'technical-social': 'Human-Centered Problem Solver',
    'innovation-execution': 'Builder-Operator',
    'leadership-social': 'Community Strategist',
    'creative-technical': 'Product Vision Architect',
    'global-leadership': 'Policy & Impact Leader',
  }[archetypeKey] || `${dominant.map((d) => d[0].toUpperCase() + d.slice(1)).join(' + ')} Profile`;

  const projectRecommendations = [
    dominant.includes('technical') ? 'Build a measurable technical portfolio project with public documentation.' : null,
    dominant.includes('social') ? 'Lead a peer mentorship or community impact initiative with outcomes.' : null,
    dominant.includes('innovation') ? 'Launch and iterate on a user-facing product or startup experiment.' : null,
    dominant.includes('global') ? 'Develop a policy/impact brief tied to a regional or global challenge.' : null,
    dominant.includes('creative') ? 'Create a design/media artifact series tied to a theme and measurable audience impact.' : null,
  ].filter(Boolean);

  const essayThemes = [
    `How ${dominant[0] || 'your'} strengths shaped your long-term direction`,
    `A turning point combining ${dominant.join(' and ')} strengths`,
    'Evidence-backed growth: from initiative to impact',
  ];

  const scholarshipFit = [
    dominant.includes('global') ? 'Impact and service scholarships' : null,
    dominant.includes('technical') ? 'STEM merit scholarships' : null,
    dominant.includes('leadership') ? 'Leadership fellowships' : null,
    dominant.includes('creative') ? 'Arts/design scholarships' : null,
  ].filter(Boolean);

  return {
    categoryScores: scores,
    dominantCategories: dominant,
    archetype,
    pairings: pairings.slice(0, 8),
    projectRecommendations,
    leadershipStyle: dominant.includes('leadership') ? 'Strategic' : dominant.includes('social') ? 'Collaborative' : 'Execution-focused',
    essayThemes,
    scholarshipFit,
    extracurricularRecommendations: projectRecommendations.slice(0, 3),
    careerAlignment: dominant,
  };
}

module.exports = {
  computeTraitIntelligence,
};
