#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'workflow-diagnostics');

function requiredEnv(name) {
  return Boolean(process.env[name]);
}

function runCommand(label, command, args, options = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const proc = spawn(command, args, {
      cwd: options.cwd || ROOT,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (buf) => {
      const chunk = buf.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });
    proc.stderr.on('data', (buf) => {
      const chunk = buf.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    proc.on('close', (code) => {
      resolve({
        label,
        ok: code === 0,
        code,
        duration_ms: Date.now() - startedAt,
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const diagnostics = {
    generated_at: new Date().toISOString(),
    sections: [],
    failures: [],
    warnings: [],
  };

  const checks = [
    { section: 'workflows', label: 'validate-workflows', command: 'npm', args: ['run', 'validate-workflows'] },
    { section: 'frontend', label: 'frontend-lint', command: 'npm', args: ['run', 'lint'] },
    { section: 'frontend', label: 'frontend-typecheck', command: 'npx', args: ['tsc', '--noEmit'] },
    { section: 'frontend', label: 'frontend-build', command: 'npm', args: ['run', 'build'] },
    { section: 'backend', label: 'backend-lint', command: 'npm', args: ['run', 'lint'], cwd: path.join(ROOT, 'backend') },
    { section: 'backend', label: 'backend-test', command: 'npm', args: ['test'], cwd: path.join(ROOT, 'backend') },
  ];

  if (requiredEnv('SUPABASE_DB_URL')) {
    checks.push(
      {
        section: 'scrapers',
        label: 'scraper-weekly-dry-run',
        command: 'python',
        args: ['scrapers/run_deadline_refresh.py'],
        env: { SCRAPER_DRY_RUN: '1', SCRAPE_MODE: 'weekly', SCRAPER_DIAGNOSTICS_DIR: 'workflow-diagnostics/scraper-dry-run-weekly' },
      },
      {
        section: 'scrapers',
        label: 'scraper-india-dry-run',
        command: 'python',
        args: ['scraper/indian/pipelines/run_india_refresh.py'],
        env: { SCRAPER_DRY_RUN: '1', SCRAPE_MODE: 'weekly', SCRAPER_DIAGNOSTICS_DIR: 'workflow-diagnostics/scraper-dry-run-india' },
      }
    );
  } else {
    diagnostics.warnings.push('Skipping scraper execution checks: SUPABASE_DB_URL not set');
  }

  for (const check of checks) {
    const result = await runCommand(check.label, check.command, check.args, check);
    diagnostics.sections.push({ section: check.section, ...result });
    if (!result.ok) diagnostics.failures.push({ section: check.section, label: check.label, code: result.code });
  }

  const outputPath = path.join(OUT_DIR, 'production-check.json');
  await fs.writeFile(outputPath, `${JSON.stringify(diagnostics, null, 2)}\n`, 'utf8');

  const markdown = [
    '# Production Check',
    '',
    `Generated: ${diagnostics.generated_at}`,
    `Failures: ${diagnostics.failures.length}`,
    `Warnings: ${diagnostics.warnings.length}`,
    '',
  ];

  for (const item of diagnostics.sections) {
    markdown.push(`- [${item.ok ? 'x' : ' '}] ${item.section} :: ${item.label} (exit ${item.code}, ${item.duration_ms}ms)`);
  }
  if (diagnostics.warnings.length) {
    markdown.push('', '## Warnings');
    for (const warning of diagnostics.warnings) markdown.push(`- ${warning}`);
  }
  if (diagnostics.failures.length) {
    markdown.push('', '## Failures');
    for (const failure of diagnostics.failures) markdown.push(`- ${failure.section} :: ${failure.label} (exit ${failure.code})`);
  }

  await fs.writeFile(path.join(OUT_DIR, 'production-check.md'), `${markdown.join('\n')}\n`, 'utf8');

  if (diagnostics.failures.length > 0) {
    console.error(`production-check failed with ${diagnostics.failures.length} failing check(s).`);
    process.exit(1);
  }

  console.log('production-check passed.');
}

main().catch((error) => {
  console.error('production-check failed:', error);
  process.exit(1);
});
