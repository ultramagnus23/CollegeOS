#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');
const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const STALE_IDENTIFIERS = [
  'trackDuration',
  'track_duration',
  'durationTracker',
  'performanceTracker',
  'analyticsTracker',
  'measureDuration',
];

const issues = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (CODE_EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function fileExists(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, ...CODE_EXTENSIONS.map((ext) => `${base}${ext}`)];
  for (const ext of CODE_EXTENSIONS) {
    candidates.push(path.join(base, `index${ext}`));
  }
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

function findImports(content) {
  const imports = [];
  const importRe = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  const bareImportRe = /import\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRe.exec(content)) !== null) {
    imports.push({ clause: match[1].trim(), specifier: match[2] });
  }
  while ((match = bareImportRe.exec(content)) !== null) {
    imports.push({ clause: '', specifier: match[1] });
  }
  return imports;
}

function parseExportInfo(content) {
  const info = {
    hasDefault: /\bexport\s+default\b/.test(content),
    hasExportAll: /\bexport\s+\*\s+from\b/.test(content),
    named: new Set(),
  };

  for (const match of content.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) {
    info.named.add(match[1]);
  }

  for (const match of content.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    const parts = match[1].split(',');
    for (const part of parts) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const aliasSplit = cleaned.split(/\s+as\s+/);
      const exportedName = aliasSplit.length === 2 ? aliasSplit[1].trim() : aliasSplit[0].trim();
      if (exportedName) info.named.add(exportedName);
    }
  }

  return info;
}

function parseImportClause(clause) {
  const out = { defaultImport: false, namedImports: [] };
  if (!clause) return out;
  const trimmed = clause.trim();
  if (trimmed.startsWith('{')) {
    const inside = trimmed.replace(/^\{/, '').replace(/\}$/, '');
    for (const raw of inside.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const importedName = part.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (importedName) out.namedImports.push(importedName);
    }
    return out;
  }

  const braceStart = trimmed.indexOf('{');
  if (braceStart > 0) {
    out.defaultImport = true;
    const inside = trimmed.slice(braceStart + 1, trimmed.lastIndexOf('}'));
    for (const raw of inside.split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const importedName = part.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (importedName) out.namedImports.push(importedName);
    }
    return out;
  }

  if (!trimmed.startsWith('*')) {
    out.defaultImport = true;
  }
  return out;
}

function detectCycles(graph) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(node) {
    if (visiting.has(node)) {
      const loopStart = stack.indexOf(node);
      const cycle = [...stack.slice(loopStart), node]
        .map((item) => path.relative(PROJECT_ROOT, item))
        .join(' -> ');
      issues.push(`Circular import detected: ${cycle}`);
      return;
    }

    if (visited.has(node)) return;
    visited.add(node);
    visiting.add(node);
    stack.push(node);

    for (const next of graph.get(node) || []) {
      visit(next);
    }

    stack.pop();
    visiting.delete(node);
  }

  for (const node of graph.keys()) {
    visit(node);
  }
}

function hasLocalDefinition(content, identifier) {
  const declarationPattern = new RegExp(`(?:const|let|var|function|class)\\s+${identifier}\\b`);
  return declarationPattern.test(content);
}

function hasImportedIdentifier(content, identifier) {
  const importPattern = new RegExp(`import[\\s\\S]*\\b${identifier}\\b[\\s\\S]*from`);
  return importPattern.test(content);
}

const sourceFiles = walk(SRC_ROOT);
const exportMap = new Map();
const graph = new Map();

for (const filePath of sourceFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  exportMap.set(filePath, parseExportInfo(content));
}

for (const filePath of sourceFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = findImports(content);
  graph.set(filePath, []);

  for (const item of imports) {
    if (item.specifier.startsWith('.')) {
      const resolved = resolveImport(filePath, item.specifier);
      if (!resolved) {
        issues.push(`Unresolved import in ${path.relative(PROJECT_ROOT, filePath)}: ${item.specifier}`);
        continue;
      }
      graph.get(filePath).push(resolved);

      const exportInfo = exportMap.get(resolved);
      if (!exportInfo) continue;
      const parsed = parseImportClause(item.clause);
      if (parsed.defaultImport && !exportInfo.hasDefault && !exportInfo.hasExportAll) {
        issues.push(`Missing default export for import in ${path.relative(PROJECT_ROOT, filePath)} from ${item.specifier}`);
      }
      for (const importedName of parsed.namedImports) {
        if (!exportInfo.named.has(importedName) && !exportInfo.hasExportAll) {
          issues.push(`Missing named export "${importedName}" for import in ${path.relative(PROJECT_ROOT, filePath)} from ${item.specifier}`);
        }
      }
    }
  }

  for (const identifier of STALE_IDENTIFIERS) {
    const staleReferencePattern = new RegExp(`\\b${identifier}\\s*\\(`);
    if (!staleReferencePattern.test(content)) continue;
    if (hasLocalDefinition(content, identifier) || hasImportedIdentifier(content, identifier)) continue;
    issues.push(`Stale runtime reference "${identifier}" in ${path.relative(PROJECT_ROOT, filePath)}`);
  }
}

const utilsDir = path.join(SRC_ROOT, 'utils');
if (fs.existsSync(utilsDir)) {
  const utilityFiles = walk(utilsDir);
  const seenNames = new Map();
  for (const filePath of utilityFiles) {
    const baseName = path.basename(filePath, path.extname(filePath));
    if (!seenNames.has(baseName)) {
      seenNames.set(baseName, [filePath]);
      continue;
    }
    seenNames.get(baseName).push(filePath);
  }
  for (const [name, pathsForName] of seenNames.entries()) {
    if (pathsForName.length < 2) continue;
    const details = pathsForName.map((p) => path.relative(PROJECT_ROOT, p)).join(', ');
    issues.push(`Duplicate utility module name "${name}": ${details}`);
  }
}

detectCycles(graph);

if (issues.length > 0) {
  console.error('Runtime reference check failed:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.info('Runtime reference check passed.');
