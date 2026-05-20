'use strict';

function nextClarifyingQuestions(profile = {}) {
  const questions = [];
  if (!profile.maxBudgetUsd) {
    questions.push({ key: 'budget', prompt: 'What is your yearly tuition budget in USD?', priority: 'high' });
  }
  if (!profile.gpa && !profile.sat && !profile.act) {
    questions.push({ key: 'academics', prompt: 'Share GPA/SAT/ACT so we can tighten admit probability.', priority: 'high' });
  }
  if (!profile.intendedMajors || !profile.intendedMajors.length) {
    questions.push({ key: 'major', prompt: 'Which 2-3 majors are you currently considering?', priority: 'medium' });
  }
  if (!profile.preferredCountries || !profile.preferredCountries.length) {
    questions.push({ key: 'countries', prompt: 'Which countries are acceptable for your applications?', priority: 'medium' });
  }
  return questions;
}

module.exports = {
  nextClarifyingQuestions,
};
