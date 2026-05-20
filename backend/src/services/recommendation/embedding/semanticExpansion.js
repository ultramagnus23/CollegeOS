'use strict';

const { expandMajors } = require('../../majors/ontologyService');

function tokenize(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

async function expandQueryFromProfile(profile = {}) {
  const majors = Array.isArray(profile.intendedMajors) ? profile.intendedMajors : [];
  const expandedMajors = await expandMajors(majors);
  const goals = Array.isArray(profile.careerGoals)
    ? profile.careerGoals
    : String(profile.careerGoals || '').split(',').map((v) => v.trim()).filter(Boolean);
  const countries = Array.isArray(profile.preferredCountries) ? profile.preferredCountries : [];

  const terms = new Set();
  [...majors, ...expandedMajors, ...goals, ...countries].forEach((item) => {
    tokenize(item).forEach((token) => terms.add(token));
  });

  return {
    expandedMajors,
    lexicalTerms: Array.from(terms),
  };
}

module.exports = {
  expandQueryFromProfile,
};
