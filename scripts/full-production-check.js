#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const reportPath = path.join(root, 'production-validation-report.json');

const options = {
  skipDb: args.has('--skip-db'),
  skipScraper: args.has('--skip-scraper'),
  skipOnboardingE2E: args.has('--skip-onboarding-e2e'),
};

const report = {
  generatedAt: new Date().toISOString(),
  options,
  passedChecks: [],
  failedChecks: [],
  warnings: [],
  endpointTimings: [],
  schemaDiagnostics: {},
  recommendationDiagnostics: {},
  scraperDiagnostics: {},
  missingEnvVars: [],
  dbIntegritySummary: {},
};

function addPass(name, details = {}) {
  report.passedChecks.push({ name, details });
}
function addFail(name, details = {}) {
  report.failedChecks.push({ name, details });
}
function addWarn(name, details = {}) {
  report.warnings.push({ name, details });
}

function run(cmd, cmdArgs, cwd = root, env = process.env) {
  const started = Date.now();
  const result = spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'pipe', encoding: 'utf8' });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    durationMs: Date.now() - started,
  };
}

function writeReport() {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
}

function assertPathExists(relPath, name) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) {
    addFail(name, { missingPath: relPath });
    return false;
  }
  addPass(name, { path: relPath });
  return true;
}

function checkRequiredEnvVars() {
  const required = [];
  if (!options.skipOnboardingE2E) {
    required.push('JWT_SECRET', 'REFRESH_TOKEN_SECRET');
  }
  const recommended = ['SUPABASE_DB_URL', 'DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

  for (const key of required) {
    if (!process.env[key]) report.missingEnvVars.push(key);
  }
  if (!options.skipDb && !(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)) {
    report.missingEnvVars.push('DATABASE_URL|SUPABASE_DB_URL');
  }

  if (report.missingEnvVars.length > 0) {
    addFail('required_env_vars', { missing: report.missingEnvVars });
  } else {
    addPass('required_env_vars');
  }

  const missingRecommended = recommended.filter((k) => !process.env[k]);
  if (missingRecommended.length > 0) {
    addWarn('recommended_env_vars', { missing: missingRecommended });
  } else {
    addPass('recommended_env_vars');
  }
}

function checkWorkflows() {
  const wfDir = path.join(root, '.github', 'workflows');
  if (!fs.existsSync(wfDir)) {
    addFail('workflow_directory', { error: `${wfDir} missing` });
    return;
  }

  const requiredWorkflows = [
    'onboarding-smoke.yml',
    'frontend-runtime-validation.yml',
    'daily-data-refresh.yml',
    'enrich-colleges.yml',
  ];
  const files = fs.readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));

  for (const wf of requiredWorkflows) {
    if (!files.includes(wf)) addFail('required_workflow_missing', { workflow: wf });
  }

  for (const file of files) {
    const rel = path.join('.github', 'workflows', file);
    const text = fs.readFileSync(path.join(root, rel), 'utf8');

    const checks = [
      ['actions/checkout@v5', 'checkout_v5'],
      ['permissions:', 'permissions_block'],
      ['timeout-minutes:', 'job_timeout'],
      ['concurrency:', 'concurrency_guard'],
      ['workflow_dispatch:', 'workflow_dispatch'],
    ];

    for (const [needle, checkName] of checks) {
      if (!text.includes(needle)) addFail(`workflow_${checkName}`, { workflow: rel });
    }

    if (text.includes('actions/setup-node@') && !text.includes('actions/setup-node@v5')) {
      addFail('workflow_node_action_version', { workflow: rel });
    }
    if (text.includes('actions/setup-python@') && !text.includes('actions/setup-python@v6')) {
      addFail('workflow_python_action_version', { workflow: rel });
    }
    if (text.includes('actions/upload-artifact@') && !text.includes('actions/upload-artifact@v5')) {
      addFail('workflow_artifact_action_version', { workflow: rel });
    }
    if (text.includes('actions/upload-artifact@v5') && !text.includes('if: always()')) {
      addFail('workflow_artifact_missing_if_always', { workflow: rel });
    }
  }

  addPass('workflow_validation', { workflowCount: files.length });
}

function checkFrontend() {
  const runtime = run('npm', ['run', 'runtime-check']);
  if (!runtime.ok) addFail('frontend_runtime_check', { stderr: runtime.stderr, stdout: runtime.stdout });
  else addPass('frontend_runtime_check', { durationMs: runtime.durationMs });

  const build = run('npm', ['run', 'build']);
  if (!build.ok) addFail('frontend_build', { stderr: build.stderr, stdout: build.stdout });
  else addPass('frontend_build', { durationMs: build.durationMs });

  if ((build.stdout || '').includes('Some chunks are larger than 500 kB')) {
    addWarn('frontend_chunk_size_warning');
  }
}

function checkBackend() {
  const backendDir = path.join(root, 'backend');
  assertPathExists('backend/src/app.js', 'backend_entry');
  assertPathExists('backend/src/startup/schemaValidator.js', 'backend_schema_validator');
  assertPathExists('backend/src/routes', 'backend_routes_directory');

  const schemaTests = run('npx', ['jest', 'tests/unit/schemaValidator.test.js', '--runInBand', '--coverage=false'], backendDir);
  if (!schemaTests.ok) addFail('backend_schema_validator_test', { stderr: schemaTests.stderr, stdout: schemaTests.stdout });
  else addPass('backend_schema_validator_test', { durationMs: schemaTests.durationMs });

  const startupProbe = run('node', ['-e', "require('./src/app'); process.exit(0);"], backendDir);
  if (!startupProbe.ok) addFail('backend_startup_probe', { stderr: startupProbe.stderr, stdout: startupProbe.stdout });
  else addPass('backend_startup_probe', { durationMs: startupProbe.durationMs });
}

function checkDatabaseAndEndpoints() {
  if (options.skipDb) {
    addWarn('database_checks_skipped');
    return;
  }
  const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    addFail('database_url_missing', { message: 'DATABASE_URL/SUPABASE_DB_URL missing' });
    return;
  }

  const dbScript = `
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    (async () => {
      await client.connect();
      await client.query('SELECT 1');
      const mv = await client.query("SELECT to_regclass('canonical.mv_college_cards') AS mv");
      const cols = await client.query("SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema='canonical' AND table_name='mv_college_cards'");
      const idx = await client.query("SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname='canonical' AND tablename='institution_deadlines'");
      const dupes = await client.query("SELECT institution_id, deadline_type, deadline_date, COUNT(*) FROM canonical.institution_deadlines GROUP BY institution_id, deadline_type, deadline_date HAVING COUNT(*) > 1");
      const payload = { mv: mv.rows[0].mv, requiredColumns: cols.rows[0].count, indexCount: idx.rows[0].count, duplicateDeadlineGroups: dupes.rows.length };
      console.log(JSON.stringify(payload));
      await client.end();
      if (!payload.mv) process.exit(2);
      if (payload.requiredColumns <= 0) process.exit(3);
      if (payload.indexCount <= 0) process.exit(4);
      if (payload.duplicateDeadlineGroups > 0) process.exit(5);
    })().catch(async (err) => { console.error(err.stack || err.message); try { await client.end(); } catch {} process.exit(1); });
  `;
  const db = run('node', ['-e', dbScript], path.join(root, 'backend'));
  if (!db.ok) {
    addFail('database_integrity_checks', { stderr: db.stderr, stdout: db.stdout });
  } else {
    const line = db.stdout.trim().split('\n').pop();
    try {
      report.dbIntegritySummary = JSON.parse(line);
    } catch {
      report.dbIntegritySummary = { raw: line };
    }
    report.schemaDiagnostics = report.dbIntegritySummary;
    addPass('database_integrity_checks', report.dbIntegritySummary);
  }

  const endpointScript = `
    const app = require('./backend/src/app');
    (async () => {
      const server = app.listen(0);
      await new Promise(r => server.once('listening', r));
      const port = server.address().port;
      const base = 'http://127.0.0.1:' + port;
      const endpoints = ['/health','/status','/api/discovery/popular?limit=5','/api/recommendations?limit=5','/api/admin/scraper-health'];
      const timings = [];
      let failed = false;
      for (const endpoint of endpoints) {
        const start = Date.now();
        const res = await fetch(base + endpoint, { headers: { 'Content-Type': 'application/json' } });
        const durationMs = Date.now() - start;
        timings.push({ endpoint, status: res.status, durationMs });
        if (res.status >= 500) failed = true;
      }
      server.close();
      console.log(JSON.stringify({ timings, failed }));
      process.exit(failed ? 2 : 0);
    })().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
  `;
  const endpointProbe = run('node', ['-e', endpointScript], root, {
    ...process.env,
    DATABASE_URL: databaseUrl,
    SUPABASE_DB_URL: databaseUrl,
  });
  if (!endpointProbe.ok) {
    addFail('endpoint_health_checks', { stderr: endpointProbe.stderr, stdout: endpointProbe.stdout });
  } else {
    const parsed = JSON.parse(endpointProbe.stdout.trim().split('\n').pop());
    report.endpointTimings = parsed.timings || [];
    report.recommendationDiagnostics = {
      recommendationEndpoint: (report.endpointTimings || []).find((x) => x.endpoint.includes('/api/recommendations')) || null,
    };
    report.scraperDiagnostics = {
      scraperHealthEndpoint: (report.endpointTimings || []).find((x) => x.endpoint.includes('/api/admin/scraper-health')) || null,
    };
    addPass('endpoint_health_checks', { count: report.endpointTimings.length });
  }
}

function checkScrapers() {
  if (options.skipScraper) {
    addWarn('scraper_checks_skipped');
    return;
  }
  assertPathExists('scraper/pipeline.py', 'scraper_pipeline');
  assertPathExists('scraper/training_pipeline.py', 'scraper_training_pipeline');
  assertPathExists('scrapers/run_deadline_refresh.py', 'deadline_refresh_runner');

  const diagDir = path.join(root, 'scraper_diagnostics_check');
  fs.mkdirSync(diagDir, { recursive: true });
  const writable = run('python', ['-c', "import pathlib, json; p=pathlib.Path('scraper_diagnostics_check/probe.json'); p.write_text(json.dumps({'ok': True}), encoding='utf-8')"], root);
  if (!writable.ok) addFail('scraper_diagnostics_writable', { stderr: writable.stderr, stdout: writable.stdout });
  else addPass('scraper_diagnostics_writable');

  const importProbe = run('python', ['-c', "import importlib; importlib.import_module('scraper.pipeline'); print('pipeline-import-ok')"], root);
  if (!importProbe.ok) addFail('scraper_pipeline_import', { stderr: importProbe.stderr, stdout: importProbe.stdout });
  else addPass('scraper_pipeline_import');
}

function checkOnboardingE2E() {
  if (options.skipOnboardingE2E) {
    addWarn('onboarding_e2e_skipped');
    return;
  }
  const backendDir = path.join(root, 'backend');
  const smoke = run('npx', ['jest', 'tests/integration/onboardingSmoke.test.js', 'tests/integration/fullOnboardingJourney.test.js', '--runInBand', '--coverage=false'], backendDir, process.env);
  if (!smoke.ok) addFail('onboarding_e2e_tests', { stderr: smoke.stderr, stdout: smoke.stdout });
  else addPass('onboarding_e2e_tests', { durationMs: smoke.durationMs });
}

checkRequiredEnvVars();
checkFrontend();
checkBackend();
checkDatabaseAndEndpoints();
checkScrapers();
checkWorkflows();
checkOnboardingE2E();

writeReport();

if (report.failedChecks.length > 0) {
  console.error('=== FULL PRODUCTION CHECK FAILED ===');
  for (const entry of report.failedChecks) console.error(`- ${entry.name}`);
  console.error(`Report: ${reportPath}`);
  process.exit(1);
}

console.log('=== FULL PRODUCTION CHECK PASSED ===');
console.log(`Report: ${reportPath}`);
