// backend/scripts/scraperHealthCheck.js
// CI gate: fails (exit 1) if any scraper job in scraper_run_logs is 'failing'
// or 'stale' (no successful run in 14 days, per scraperHealthService.js).
// Usage: node scripts/scraperHealthCheck.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const dbManager = require('../src/config/database');
const { getScraperHealthSnapshot } = require('../src/services/scraperHealthService');

async function main() {
  dbManager.initialize();
  try {
    const snapshot = await getScraperHealthSnapshot();
    console.log(`Scraper health snapshot (${snapshot.totalJobs} jobs):`);
    console.log(JSON.stringify(snapshot.healthCounts, null, 2));

    const bad = snapshot.jobs.filter((j) => j.health === 'failing' || j.health === 'stale');
    if (bad.length > 0) {
      console.error(`\n${bad.length} job(s) failing or stale:`);
      for (const j of bad) {
        console.error(`  - ${j.jobName}: health=${j.health} lastStatus=${j.lastStatus} lastSuccessfulRun=${j.lastSuccessfulRun}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log('\nAll scraper jobs healthy or never-run (never-run is not a failure -- a new adapter with no history yet).');
  } finally {
    await dbManager.close();
  }
}

main().catch((err) => {
  console.error('scraperHealthCheck failed:', err.message);
  process.exit(1);
});
