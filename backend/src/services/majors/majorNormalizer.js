'use strict';

const { resolveMajor } = require('./ontologyService');

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/&/g, ' and ')
    .toLowerCase();
}

async function normalizeMajor(input) {
  const cleaned = normalizeText(input);
  if (!cleaned) return null;
  const resolved = await resolveMajor(cleaned);
  return resolved?.canonicalMajor || cleaned.replace(/\b\w/g, (m) => m.toUpperCase());
}

module.exports = {
  normalizeMajor,
};
