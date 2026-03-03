/**
 * runScraper.js
 *
 * Entry point for the CollegeOS scraper.
 * Reads pending jobs from scrape_queue and processes them in batches.
 *
 * Usage:
 *   node backend/scripts/runScraper.js           # drain entire queue
 *   node backend/scripts/runScraper.js --batches 5   # process 5 batches (25 colleges)
 *   node backend/scripts/runScraper.js --batches 1   # test single batch of 5 colleges
 */

'use strict';

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const scraperService = require('../src/services/scraperService');
const logger = require('../src/utils/logger');

// Parse CLI flags
const args = process.argv.slice(2);
let maxBatches = Infinity;
const batchIdx = args.indexOf('--batches');
if (batchIdx !== -1 && args[batchIdx + 1]) {
  maxBatches = parseInt(args[batchIdx + 1], 10);
  if (isNaN(maxBatches) || maxBatches < 1) {
    // eslint-disable-next-line no-console
    console.error('Invalid --batches value');
    process.exit(1);
  }
}

logger.info('Starting scraper', { maxBatches: maxBatches === Infinity ? 'unlimited' : maxBatches });

scraperService
  .run(maxBatches)
  .then(result => {
    logger.info('Scraper finished', result || {});
    // eslint-disable-next-line no-console
    console.log('\n✅ Scraper complete:', JSON.stringify(result || {}, null, 2));
    process.exit(0);
  })
  .catch(err => {
    logger.error('Scraper crashed', { error: err.message });
    // eslint-disable-next-line no-console
    console.error('❌ Scraper failed:', err.message);
    process.exit(1);
  });
