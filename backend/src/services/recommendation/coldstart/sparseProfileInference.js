'use strict';

function inferFromSparseProfile(profile = {}) {
  const inferredMajors = [];
  const goals = String(profile.careerGoals || '').toLowerCase();
  if (!profile.intendedMajors || !profile.intendedMajors.length) {
    if (goals.includes('ai') || goals.includes('software') || goals.includes('tech')) inferredMajors.push('Computer Science');
    if (goals.includes('finance') || goals.includes('startup') || goals.includes('management')) inferredMajors.push('Business');
    if (!inferredMajors.length) inferredMajors.push('Computer Science', 'Business', 'Economics');
  }

  const inferredBudget = profile.maxBudgetUsd || ((profile.preferredCountries || []).includes('United States') ? 65000 : 42000);
  const inferredCountries = (profile.preferredCountries && profile.preferredCountries.length)
    ? profile.preferredCountries
    : ['United States', 'Canada', 'United Kingdom'];

  return {
    intendedMajors: profile.intendedMajors?.length ? profile.intendedMajors : inferredMajors,
    maxBudgetUsd: profile.maxBudgetUsd || inferredBudget,
    preferredCountries: inferredCountries,
    inferred: {
      majors: !profile.intendedMajors?.length,
      budget: !profile.maxBudgetUsd,
      countries: !profile.preferredCountries?.length,
    },
  };
}

module.exports = {
  inferFromSparseProfile,
};
