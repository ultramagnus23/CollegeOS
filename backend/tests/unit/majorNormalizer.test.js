const { normalizeMajor } = require('../../src/services/majors/majorNormalizer');

jest.mock('../../src/services/majors/ontologyService', () => ({
  resolveMajor: jest.fn(async (major) => {
    if (String(major).includes('computer science') || String(major).trim() === 'cs') {
      return { canonicalMajor: 'Computer Science' };
    }
    return null;
  }),
}));

describe('majorNormalizer', () => {
  it('normalizes known aliases to canonical major', async () => {
    await expect(normalizeMajor('CS')).resolves.toBe('Computer Science');
  });

  it('falls back to title-cased cleaned major when ontology misses', async () => {
    await expect(normalizeMajor('human centered design')).resolves.toBe('Human Centered Design');
  });
});
