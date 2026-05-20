const { retrieveHybridCandidates } = require('../../src/services/recommendation/embedding/hybridRetrieval');

jest.mock('../../src/config/database', () => ({
  getDatabase: () => ({
    query: jest.fn(async () => ({
      rows: [
        {
          id: 'a',
          name: 'CMU',
          country: 'US',
          description: 'Top computer science university',
          tags: ['computer science', 'ai'],
          programs: ['Computer Science', 'Robotics'],
          embedding_similarity: 0.9,
          popularity_score: 0.7,
          search_volume_score: 0.8,
          subject_rank: 2,
          net_cost_usd: 55000,
          tuition_international: 60000,
        },
      ],
    })),
  }),
}));

describe('hybridRetrieval', () => {
  it('computes hybrid score and preserves subject relevance', async () => {
    const rows = await retrieveHybridCandidates({
      embeddingLiteral: '[0,0,0]',
      terms: ['computer', 'science'],
      subjectTargets: ['computer science'],
      metadataFilters: {},
      limit: 20,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].hybrid_score).toBeGreaterThan(0.6);
    expect(rows[0].subject_relevance).toBeGreaterThan(0);
  });
});
