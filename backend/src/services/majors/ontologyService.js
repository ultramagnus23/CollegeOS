'use strict';

const dbManager = require('../../config/database');

const DEFAULT_ONTOLOGY = [
  {
    canonical_major: 'Computer Science',
    alias: 'cs',
    related_majors: ['Artificial Intelligence', 'Machine Learning', 'Data Science', 'Software Engineering', 'Computational Mathematics', 'Human-Computer Interaction', 'Robotics'],
    interdisciplinary_fields: ['Computational Biology', 'Computational Social Science'],
    career_mappings: ['Software Engineer', 'ML Engineer', 'Data Scientist'],
    subject_rank_mappings: ['computer science', 'engineering and technology'],
  },
  {
    canonical_major: 'Business',
    alias: 'business administration',
    related_majors: ['Finance', 'Economics', 'Management', 'Entrepreneurship', 'Business Analytics'],
    interdisciplinary_fields: ['Behavioral Economics', 'FinTech'],
    career_mappings: ['Investment Banking', 'Consulting', 'Product Management'],
    subject_rank_mappings: ['business', 'economics and econometrics', 'management'],
  },
];

let cache = null;
let cacheAt = 0;

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

async function loadOntology(force = false) {
  const now = Date.now();
  if (!force && cache && now - cacheAt < 5 * 60 * 1000) return cache;

  const pool = dbManager.getDatabase();
  const { rows } = await pool.query(
    `SELECT canonical_major, alias, related_majors, interdisciplinary_fields, career_mappings, subject_rank_mappings
       FROM canonical.major_ontology`
  );

  const materialized = rows.length ? rows : DEFAULT_ONTOLOGY;
  cache = materialized.map((r) => ({
    canonical_major: r.canonical_major,
    alias: r.alias,
    related_majors: Array.isArray(r.related_majors) ? r.related_majors : [],
    interdisciplinary_fields: Array.isArray(r.interdisciplinary_fields) ? r.interdisciplinary_fields : [],
    career_mappings: Array.isArray(r.career_mappings) ? r.career_mappings : [],
    subject_rank_mappings: Array.isArray(r.subject_rank_mappings) ? r.subject_rank_mappings : [],
  }));
  cacheAt = now;
  return cache;
}

async function resolveMajor(inputMajor) {
  const major = normalize(inputMajor);
  if (!major) return null;
  const ontology = await loadOntology();
  const hit = ontology.find((o) => normalize(o.alias) === major || normalize(o.canonical_major) === major);
  if (!hit) return null;
  return {
    canonicalMajor: hit.canonical_major,
    aliases: [hit.alias],
    relatedMajors: hit.related_majors,
    interdisciplinaryFields: hit.interdisciplinary_fields,
    careerMappings: hit.career_mappings,
    subjectRankMappings: hit.subject_rank_mappings,
  };
}

async function expandMajors(majors = []) {
  const seen = new Set();
  const expanded = [];

  for (const major of majors) {
    const resolved = await resolveMajor(major);
    const values = resolved
      ? [resolved.canonicalMajor, ...resolved.relatedMajors, ...resolved.interdisciplinaryFields]
      : [major];
    for (const v of values) {
      const key = normalize(v);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      expanded.push(v);
    }
  }

  return expanded;
}

module.exports = {
  loadOntology,
  resolveMajor,
  expandMajors,
};
