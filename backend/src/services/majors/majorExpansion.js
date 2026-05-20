'use strict';

const { resolveMajor } = require('./ontologyService');

async function expandMajorContext(major) {
  const resolved = await resolveMajor(major);
  if (!resolved) {
    return {
      canonicalMajor: major,
      relatedMajors: [],
      interdisciplinaryFields: [],
      careerMappings: [],
      subjectRankMappings: [],
    };
  }
  return resolved;
}

module.exports = {
  expandMajorContext,
};
