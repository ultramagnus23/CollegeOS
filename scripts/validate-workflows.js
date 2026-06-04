#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseDocument } from 'yaml';

const ROOT = process.cwd();
const WORKFLOW_DIR = path.join(ROOT, '.github', 'workflows');
const OUT_DIR = path.join(ROOT, 'workflow-diagnostics');

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function isValidCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((part) => /^[\d\/*,-]+$/.test(part));
}

function parseSecrets(input) {
  const text = JSON.stringify(input);
  const matches = text.match(/secrets\.([A-Z0-9_]+)/g) || [];
  return [...new Set(matches.map((m) => m.replace('secrets.', '')))];
}

function parseRunScripts(runText) {
  const scripts = [];
  for (const line of String(runText || '').split('\n')) {
    const trimmed = line.trim();
    let match = trimmed.match(/^node\s+([\w./-]+\.js)\b/);
    if (match) scripts.push(match[1]);
    match = trimmed.match(/^python\s+([\w./-]+\.py)\b/);
    if (match) scripts.push(match[1]);
  }
  return scripts;
}

function hasVariableReference(v) {
  return /\$\{\{.*\}\}|\$\w+/.test(String(v || ''));
}

function normalizeWorkflowOn(rawOn) {
  if (!rawOn) return {};
  if (Array.isArray(rawOn)) return Object.fromEntries(rawOn.map((v) => [String(v), {}]));
  if (typeof rawOn === 'string') return { [rawOn]: {} };
  return rawOn;
}

async function existsAbsolute(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const entries = (await fs.readdir(WORKFLOW_DIR)).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml')).sort();

  const summary = {
    generated_at: new Date().toISOString(),
    root: ROOT,
    workflows_checked: entries.length,
    workflows: [],
    errors: [],
    warnings: [],
  };

  for (const fileName of entries) {
    const fullPath = path.join(WORKFLOW_DIR, fileName);
    const text = await fs.readFile(fullPath, 'utf8');
    const doc = parseDocument(text);
    const workflow = doc.toJSON() || {};
    const item = { file: fileName, errors: [], warnings: [], required_secrets: [] };

    if (doc.errors?.length) {
      for (const err of doc.errors) item.errors.push(`YAML parse error: ${err.message}`);
    }

    const permissions = workflow.permissions;
    if (!permissions || typeof permissions !== 'object') {
      item.errors.push('Missing top-level permissions block');
    }

    const onBlock = normalizeWorkflowOn(workflow.on);
    const schedules = toArray(onBlock.schedule);
    for (const schedule of schedules) {
      const cron = schedule?.cron;
      if (!cron || !isValidCron(cron)) {
        item.errors.push(`Invalid cron expression: ${cron ?? 'undefined'}`);
      }
    }

    const jobs = workflow.jobs || {};
    for (const [jobName, job] of Object.entries(jobs)) {
      if (!job['runs-on']) {
        item.errors.push(`Job '${jobName}' missing runs-on`);
      }
      if (!job['timeout-minutes']) {
        item.warnings.push(`Job '${jobName}' missing timeout-minutes`);
      }

      const matrix = job?.strategy?.matrix;
      if (matrix && typeof matrix === 'object') {
        const keys = Object.keys(matrix).filter((k) => k !== 'include' && k !== 'exclude');
        if (keys.length === 0) {
          item.errors.push(`Job '${jobName}' has empty strategy.matrix`);
        }
      }

      for (const step of toArray(job.steps)) {
        if (step?.uses && /upload-artifact/.test(step.uses)) {
          const artifactPath = step?.with?.path;
          if (!artifactPath) {
            item.errors.push(`Job '${jobName}' artifact upload missing with.path`);
          } else if (!hasVariableReference(artifactPath)) {
            const artifactAbs = path.resolve(ROOT, String(artifactPath));
            const artifactExists = await existsAbsolute(artifactAbs);
            if (!artifactExists) {
              item.warnings.push(`Job '${jobName}' artifact path does not currently exist: ${artifactPath}`);
            }
          }
        }

        const runScripts = parseRunScripts(step?.run);
        for (const scriptRel of runScripts) {
          const scriptAbs = path.resolve(ROOT, scriptRel);
          if (!(await existsAbsolute(scriptAbs))) {
            item.errors.push(`Referenced script does not exist: ${scriptRel}`);
          }
        }
      }
    }

    const branchScoped = onBlock.push || onBlock.pull_request;
    if (branchScoped && typeof branchScoped === 'object') {
      const branches = [...toArray(branchScoped.branches), ...toArray(branchScoped['branches-ignore'])].map(String);
      if (branches.length > 0 && !branches.some((b) => ['main', 'master', '**'].includes(b))) {
        item.warnings.push('No main/master branch compatibility in trigger branches');
      }
    }

    const requiredSecrets = parseSecrets(workflow);
    item.required_secrets = requiredSecrets;
    if (requiredSecrets.length === 0) {
      item.warnings.push('No GitHub secrets referenced in workflow');
    }

    for (const name of requiredSecrets) {
      if (!process.env[name]) {
        item.warnings.push(`Secret ${name} not set in local env (cannot verify repository secret) `);
      }
    }

    summary.workflows.push(item);
    for (const e of item.errors) summary.errors.push(`${fileName}: ${e}`);
    for (const w of item.warnings) summary.warnings.push(`${fileName}: ${w}`);
  }

  const outFile = path.join(OUT_DIR, 'workflow-validation-summary.json');
  await fs.writeFile(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  const md = [
    '# Workflow Validation Summary',
    '',
    `Generated: ${summary.generated_at}`,
    `Workflows checked: ${summary.workflows_checked}`,
    `Errors: ${summary.errors.length}`,
    `Warnings: ${summary.warnings.length}`,
    '',
  ];

  for (const wf of summary.workflows) {
    md.push(`## ${wf.file}`);
    md.push(`- Errors: ${wf.errors.length}`);
    md.push(`- Warnings: ${wf.warnings.length}`);
    md.push(`- Required secrets: ${wf.required_secrets.join(', ') || '(none)'}`);
    if (wf.errors.length) {
      md.push('- Error details:');
      for (const e of wf.errors) md.push(`  - ${e}`);
    }
    if (wf.warnings.length) {
      md.push('- Warning details:');
      for (const w of wf.warnings) md.push(`  - ${w}`);
    }
    md.push('');
  }

  await fs.writeFile(path.join(OUT_DIR, 'workflow-validation-summary.md'), `${md.join('\n')}\n`, 'utf8');

  if (summary.errors.length > 0) {
    console.error(`validate-workflows failed with ${summary.errors.length} error(s).`);
    process.exit(1);
  }

  console.log(`validate-workflows passed: ${summary.workflows_checked} workflow(s), ${summary.warnings.length} warning(s).`);
}

main().catch((error) => {
  console.error('validate-workflows failed:', error);
  process.exit(1);
});
