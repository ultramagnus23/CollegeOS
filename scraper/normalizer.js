'use strict';

/**
 * School name normalizer.
 * Maps common name variants to canonical school names.
 * When a new variant is encountered it is added to the runtime map so
 * future occurrences in the same process are handled immediately.
 */

// Canonical name → array of known variants (all lower-cased)
const NORMALIZATION_MAP = {
  'Massachusetts Institute of Technology': [
    'mit', 'mass inst of tech', 'massachusetts institute of technology',
  ],
  'Harvard University': [
    'harvard', 'harvard university', 'harvard college',
  ],
  'Yale University': [
    'yale', 'yale university', 'yale college',
  ],
  'Princeton University': [
    'princeton', 'princeton university',
  ],
  'Columbia University': [
    'columbia', 'columbia university', 'columbia college', 'columbia in the city of new york',
  ],
  'University of Pennsylvania': [
    'upenn', 'u penn', 'u of penn', 'penn', 'university of pennsylvania',
    'university of penn',
  ],
  'Brown University': [
    'brown', 'brown university',
  ],
  'Dartmouth College': [
    'dartmouth', 'dartmouth college',
  ],
  'Cornell University': [
    'cornell', 'cornell university',
  ],
  'Stanford University': [
    'stanford', 'stanford university', 'stanford u',
  ],
  'University of Chicago': [
    'uchicago', 'u of chicago', 'u chicago', 'university of chicago', 'chicago university',
  ],
  'Duke University': [
    'duke', 'duke university',
  ],
  'Northwestern University': [
    'northwestern', 'northwestern university', 'nwu',
  ],
  'Johns Hopkins University': [
    'jhu', 'johns hopkins', 'johns hopkins university', 'j. hopkins',
  ],
  'Vanderbilt University': [
    'vandy', 'vanderbilt', 'vanderbilt university',
  ],
  'Rice University': [
    'rice', 'rice university',
  ],
  'Washington University in St. Louis': [
    'washu', 'wash u', 'wustl', 'washington university in st. louis',
    'washington university st louis', 'washington university',
  ],
  'University of Notre Dame': [
    'notre dame', 'nd', 'university of notre dame',
  ],
  'Emory University': [
    'emory', 'emory university',
  ],
  'Georgetown University': [
    'georgetown', 'georgetown university',
  ],
  'Carnegie Mellon University': [
    'cmu', 'carnegie mellon', 'carnegie mellon university',
  ],
  'University of California, Los Angeles': [
    'ucla', 'uc los angeles', 'university of california los angeles',
    'university of california, los angeles',
  ],
  'University of California, Berkeley': [
    'uc berkeley', 'ucb', 'cal', 'berkeley', 'university of california berkeley',
    'university of california, berkeley',
  ],
  'University of Michigan': [
    'umich', 'u of michigan', 'u michigan', 'university of michigan',
    'michigan', 'michigan ann arbor',
  ],
  'University of Virginia': [
    'uva', 'u of virginia', 'university of virginia', 'virginia',
  ],
  'University of North Carolina at Chapel Hill': [
    'unc', 'unc chapel hill', 'university of north carolina',
    'university of north carolina at chapel hill', 'chapel hill',
  ],
  'New York University': [
    'nyu', 'new york university',
  ],
  'Boston University': [
    'bu', 'boston university', 'boston u',
  ],
  'Boston College': [
    'bc', 'boston college',
  ],
  'Tufts University': [
    'tufts', 'tufts university',
  ],
  'University of Rochester': [
    'rochester', 'u of rochester', 'university of rochester',
  ],
  'Case Western Reserve University': [
    'case western', 'cwru', 'case western reserve', 'case western reserve university',
  ],
  'Wake Forest University': [
    'wake forest', 'wake forest university',
  ],
  'Tulane University': [
    'tulane', 'tulane university',
  ],
  'Lehigh University': [
    'lehigh', 'lehigh university',
  ],
  'Rensselaer Polytechnic Institute': [
    'rpi', 'rensselaer', 'rensselaer polytechnic institute',
  ],
  'University of Southern California': [
    'usc', 'u of southern california', 'university of southern california',
    'university of southern california (usc)',
  ],
  'University of Florida': [
    'uf', 'u of florida', 'university of florida', 'florida', 'gators',
  ],
  'Georgia Institute of Technology': [
    'georgia tech', 'gatech', 'georgia institute of technology', 'gt',
  ],
  'University of Wisconsin-Madison': [
    'uw madison', 'uw-madison', 'university of wisconsin madison',
    'university of wisconsin-madison', 'wisconsin', 'wisc',
  ],
  'University of Illinois Urbana-Champaign': [
    'uiuc', 'u of illinois', 'university of illinois', 'illinois',
    'university of illinois urbana-champaign', 'university of illinois at urbana-champaign',
  ],
  'Purdue University': [
    'purdue', 'purdue university',
  ],
  'Penn State University': [
    'penn state', 'psu', 'penn state university', 'pennsylvania state university',
  ],
  'Ohio State University': [
    'ohio state', 'osu', 'ohio state university', 'the ohio state university',
  ],
  'University of Texas at Austin': [
    'ut austin', 'ut', 'university of texas', 'university of texas at austin',
    'texas', 'longhorns',
  ],
  'University of Washington': [
    'uw', 'u of washington', 'university of washington', 'washington',
  ],
  'University of Maryland': [
    'umd', 'u of maryland', 'university of maryland', 'maryland',
  ],
  'Rutgers University': [
    'rutgers', 'rutgers university',
  ],
  'Northeastern University': [
    'northeastern', 'northeastern university', 'neu',
  ],
};

// Build a flat lookup table: lowercase-variant → canonical
const variantLookup = {};
for (const [canonical, variants] of Object.entries(NORMALIZATION_MAP)) {
  for (const variant of variants) {
    variantLookup[variant.toLowerCase()] = canonical;
  }
}

/**
 * Normalize a raw school name to its canonical form.
 * If the name is not in the map, it is title-cased and returned as-is.
 * @param {string} rawName
 * @returns {string} canonical school name
 */
function normalize(rawName) {
  if (!rawName) return '';
  const cleaned = rawName.trim().replace(/\s+/g, ' ');
  const key = cleaned.toLowerCase();

  // Exact lookup
  if (variantLookup[key]) return variantLookup[key];

  // Try stripping trailing punctuation / parenthetical
  const stripped = key.replace(/[\s,.()\-]+$/, '').replace(/\s*\(.*?\)\s*/g, '').trim();
  if (variantLookup[stripped]) return variantLookup[stripped];

  // Add the cleaned version as a new runtime variant pointing to itself
  const titleCase = toTitleCase(cleaned);
  variantLookup[key] = titleCase;
  return titleCase;
}

/**
 * Convert a string to title case.
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
  const lowercase = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on',
    'at', 'to', 'by', 'in', 'of', 'up', 'as'];
  return str
    .toLowerCase()
    .split(' ')
    .map((word, idx) => {
      if (idx === 0 || !lowercase.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');
}

module.exports = { normalize };
