'use strict';

const { Client } = require('pg');
const dbManager = require('../../src/config/database');

const DEFAULT_TEST_DB_URL = 'postgres://collegeos:collegeos@127.0.0.1:55432/collegeos_test';

async function createClient() {
  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_TEST_DB_URL;
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function runMigrations(client) {
  void client;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_TEST_DB_URL;
  dbManager.initialize();
  await dbManager.runMigrations();
}

async function seedCanonicalFixtures(client) {
  await client.query(
    `
      INSERT INTO canonical.institutions (id, canonical_name, normalized_name, slug, country_code, state_region, city, website, institution_type, metadata)
      VALUES
      ('11111111-1111-1111-1111-111111111111', 'Test University', 'test university', 'test-university', 'US', 'CA', 'Los Angeles', 'https://test.example.edu', 'university', '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `
  );
  await client.query(
    `
      INSERT INTO canonical.popularity_index (institution_id, popularity_score, updated_at)
      VALUES ('11111111-1111-1111-1111-111111111111', 77.5, NOW())
      ON CONFLICT (institution_id) DO UPDATE SET popularity_score = EXCLUDED.popularity_score, updated_at = NOW()
    `
  );
}

async function resetDatabase(client) {
  await client.query('TRUNCATE TABLE migrations RESTART IDENTITY CASCADE');
}

module.exports = {
  createClient,
  resetDatabase,
  runMigrations,
  seedCanonicalFixtures,
};
