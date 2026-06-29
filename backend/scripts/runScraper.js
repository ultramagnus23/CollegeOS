'use strict';

// Unified scraper runner. Every live scraper plugs into the same framework
// (fetch → validate → idempotent upsert with source metadata → logged counts).
//
// Usage:
//   node scripts/runScraper.js wikidata [--dry-run] [--limit=50]
//   node scripts/runScraper.js --list

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dbManager = require('../src/config/database');
const { runScraper } = require('../src/scrapers/scraperFramework');

const ADAPTERS = {
  wikidata: require('../src/scrapers/adapters/wikidataEnrichment'),
  usDeadlines: require('../src/scrapers/adapters/usOfficialDeadlines').adapter,
  usRequirements: require('../src/scrapers/adapters/usOfficialRequirements').adapter,
  nirfRankings: require('../src/scrapers/adapters/nirfRankings').adapter,
  institutionPlacements: require('../src/scrapers/adapters/institutionPlacements').adapter,
};

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list') || !args[0]) {
    console.log('Available adapters:', Object.keys(ADAPTERS).join(', '));
    return;
  }
  const name = args[0];
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  const adapter = ADAPTERS[name];
  if (!adapter) {
    console.error(`Unknown adapter "${name}". Available: ${Object.keys(ADAPTERS).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const stats = await runScraper(adapter, { dryRun, limit });
  console.log('RESULT:', JSON.stringify(stats));
}

main()
  .then(async () => { await dbManager.close(); process.exit(process.exitCode || 0); })
  .catch(async (err) => {
    console.error('scraper run failed:', err);
    try { await dbManager.close(); } catch (_e) { /* noop */ }
    process.exit(1);
  });
