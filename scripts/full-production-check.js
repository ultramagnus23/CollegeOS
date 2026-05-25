#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));

const options = {
  skipDb: args.has('--skip-db'),
  skipScraper: args.has('--skip-scraper'),
  skipOnboardingE2E: args.has('--skip-onboarding-e2e'),
};

const failures = [];
const warnings = [];

function run(cmd, cmdArgs, cwd = root) {
  const result = spawnSync(cmd, cmdArgs, { cwd, stdio: 'pipe', encoding: 'utf8' });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function fail(message, details = '') {
  failures.push(details ? `${message}: ${details}` : message);
}

function warn(message) {
  warnings.push(message);
}

function checkFileExists(relPath, label) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) fail(`${label} missing`, relPath);
}

function checkWorkflows() {
  const wfDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(wfDir)) {
    fail('workflow directory missing', wfDir);
    return;
  }

  const files = fs.readdirSync(wfDir).filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'));
  if (files.length === 0) fail('no workflow files found');

  for (const file of files) {
    const rel = path.join('.github', 'workflows', file);
    const full = path.join(root, rel);
    const text = fs.readFileSync(full, 'utf8');

    if (!text.includes('actions/checkout@v5')) fail(`workflow missing checkout@v5`, rel);
    if (text.includes('actions/setup-node@') && !text.includes('actions/setup-node@v5')) {
      fail(`workflow not using setup-node@v5`, rel);
    }
    if (text.includes('actions/setup-python@') && !text.includes('actions/setup-python@v6')) {
      fail(`workflow not using setup-python@v6`, rel);
    }
    if (text.includes('actions/upload-artifact@') && !text.includes('actions/upload-artifact@v5')) {
      fail(`workflow not using upload-artifact@v5`, rel);
    }

    const uploadBlocks = text.match(/uses:\s*actions\/upload-artifact@v5[\s\S]*?(?=\n\s*-\s+name:|\n\s*-\s+uses:|\n\s*[A-Za-z_]+:|\s*$)/g) || [];
    for (const block of uploadBlocks) {
      if (!/if:\s*always\(\)/.test(block) && !/if:\s*always\(\)/.test(text)) {
        fail(`artifact upload missing if: always()`, rel);
      }
    }

    if (/secrets\.[A-Z0-9_]+/.test(text) && !/env:\s*\n/.test(text)) {
      warn(`workflow references secrets without explicit env block in one or more steps (${rel})`);
    }
  }
}

function checkFrontend() {
  const runtime = run('npm', ['run', 'runtime-check']);
  if (!runtime.ok) fail('frontend runtime-check failed', runtime.stderr || runtime.stdout);

  const build = run('npm', ['run', 'build']);
  if (!build.ok) fail('frontend build failed', build.stderr || build.stdout);
}

function checkBackend() {
  const backendDir = path.join(root, 'backend');
  checkFileExists('backend/src/app.js', 'backend app entry');
  checkFileExists('backend/src/startup/schemaValidator.js', 'schema validator');
  checkFileExists('backend/src/routes', 'backend routes directory');

  const schemaValidatorUnit = run('npx', ['jest', 'tests/unit/schemaValidator.test.js', '--runInBand', '--coverage=false'], backendDir);
  if (!schemaValidatorUnit.ok) {
    fail('backend schema validator test failed', schemaValidatorUnit.stderr || schemaValidatorUnit.stdout);
  }

  const startupProbe = run('node', ['-e', "require('./src/app'); process.exit(0);"], backendDir);
  if (!startupProbe.ok) fail('backend startup import failed', startupProbe.stderr || startupProbe.stdout);
}

function checkDatabase() {
  if (options.skipDb) return;
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    fail('database check failed', 'DATABASE_URL/SUPABASE_DB_URL missing');
    return;
  }
  const checkScript = `
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    (async () => {
      await client.connect();
      await client.query('SELECT 1');
      await client.query("SELECT to_regclass('canonical.mv_college_cards')");
      await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='canonical' AND table_name='mv_college_cards' LIMIT 1");
      await client.query("SELECT 1 FROM pg_indexes WHERE schemaname='canonical' AND tablename='institution_deadlines' LIMIT 1");
      const dupes = await client.query("SELECT institution_id, deadline_type, deadline_date, COUNT(*) FROM canonical.institution_deadlines GROUP BY institution_id, deadline_type, deadline_date HAVING COUNT(*) > 1");
      if (dupes.rows.length > 0) {
        throw new Error('Duplicate deadline records detected in canonical.institution_deadlines');
      }
      await client.end();
    })().catch(async (err) => { console.error(err.stack || err.message); try { await client.end(); } catch {} process.exit(1); });
  `;
  const db = run('node', ['-e', checkScript], path.join(root, 'backend'));
  if (!db.ok) fail('database validation failed', db.stderr || db.stdout);
}

function checkScrapers() {
  if (options.skipScraper) return;
  checkFileExists('scraper/pipeline.py', 'primary scraper pipeline');
  checkFileExists('scraper/training_pipeline.py', 'training pipeline');
  checkFileExists('scrapers/run_deadline_refresh.py', 'deadline refresh runner');

  const diagDir = path.join(root, 'scraper_diagnostics_check');
  fs.mkdirSync(diagDir, { recursive: true });
  const probe = run('python', ['-c', "import pathlib, json; p=pathlib.Path('scraper_diagnostics_check/probe.json'); p.write_text(json.dumps({'ok': True}), encoding='utf-8')"], root);
  if (!probe.ok) fail('scraper diagnostics directory is not writable', probe.stderr || probe.stdout);

  const mappingCheck = run('python', ['-c', "import importlib; importlib.import_module('scraper.pipeline'); print('pipeline-import-ok')"], root);
  if (!mappingCheck.ok) fail('scraper pipeline import failed', mappingCheck.stderr || mappingCheck.stdout);
}

function checkOnboardingE2E() {
  if (options.skipOnboardingE2E) return;
  const backendDir = path.join(root, 'backend');
  const res = run('npx', ['jest', 'tests/integration/onboardingSmoke.test.js', '--runInBand', '--coverage=false'], backendDir);
  if (!res.ok) fail('onboarding E2E smoke test failed', res.stderr || res.stdout);
}

checkFrontend();
checkBackend();
checkDatabase();
checkScrapers();
checkWorkflows();
checkOnboardingE2E();

if (warnings.length > 0) {
  console.log('=== WARNINGS ===');
  for (const entry of warnings) console.log(`- ${entry}`);
}

if (failures.length > 0) {
  console.error('=== FULL PRODUCTION CHECK FAILED ===');
  for (const entry of failures) console.error(`- ${entry}`);
  process.exit(1);
}

console.log('=== FULL PRODUCTION CHECK PASSED ===');
