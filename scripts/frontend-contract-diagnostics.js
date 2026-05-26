#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const REPORT_DIR = path.join(PROJECT_ROOT, 'reports');
const STRICT_MODE = process.argv.includes('--strict');
const CANONICAL_RELATION = 'canonical.mv_college_cards';

const FLOW_FILES = [
  'src/pages/Colleges.tsx',
  'src/pages/Dashboard.tsx',
  'src/pages/Recommendations.tsx',
  'src/pages/Onboarding.tsx',
  'src/services/recommendationService.ts',
  'src/lib/collegeService.ts',
  'backend/src/routes/discovery.js',
  'backend/src/routes/search.js',
  'backend/src/routes/colleges.js',
  'backend/src/routes/recommendations.js',
  'backend/src/services/recommendation/recommendationPipelineService.js',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function read(relPath) {
  const fullPath = path.join(PROJECT_ROOT, relPath);
  if (!fs.existsSync(fullPath)) return '';
  return fs.readFileSync(fullPath, 'utf8');
}

function writeReport(name, content) {
  ensureDir(REPORT_DIR);
  fs.writeFileSync(path.join(REPORT_DIR, name), content, 'utf8');
}

function extractCanonicalRelations(content) {
  const sqlRelations = [...content.matchAll(/\b(?:FROM|JOIN|INTO)\s+canonical\.([a-zA-Z0-9_]+)/gi)]
    .map((m) => `canonical.${m[1]}`);
  const supabaseRelations = [...content.matchAll(/schema\('canonical'\)\.from\('([a-zA-Z0-9_]+)'\)/g)]
    .map((m) => `canonical.${m[1]}`);
  return [...new Set([...sqlRelations, ...supabaseRelations])];
}

function extractSelectBlocks(content) {
  return [...content.matchAll(/\.select\(([\s\S]*?)\)/g)].map((m) => m[1].trim());
}

function extractOrderColumns(content) {
  return [...content.matchAll(/order\('([a-zA-Z0-9_]+)'/g)].map((m) => m[1]);
}

const usage = FLOW_FILES.map((file) => {
  const content = read(file);
  const relations = extractCanonicalRelations(content);
  return {
    file,
    relations,
    bypassRelations: relations.filter((r) => r !== CANONICAL_RELATION),
    selectBlocks: extractSelectBlocks(content),
    orderColumns: extractOrderColumns(content),
  };
});

const bypassEntries = usage.filter((u) => u.bypassRelations.length > 0);
const selectBlocks = usage.flatMap((u) => u.selectBlocks.map((s) => ({ file: u.file, select: s })));
const allOrderColumns = [...new Set(usage.flatMap((u) => u.orderColumns))];

const dependencyGraph = [
  ['Discover/Colleges pages', '/api/search/colleges + /api/colleges/comprehensive + /api/discovery/*', 'backend/src/routes/search.js + backend/src/routes/colleges.js + backend/src/routes/discovery.js', `SQL FROM ${CANONICAL_RELATION}`],
  ['Dashboard', '/api/recommendations + /api/colleges/suggested', 'backend/src/routes/recommendations.js + backend/src/routes/colleges.js', `Recommendation pipeline + ${CANONICAL_RELATION}`],
  ['Onboarding recommendations', '/api/recommendations/generate', 'backend/src/routes/recommendations.js', `backend/src/services/recommendation/recommendationPipelineService.js -> ${CANONICAL_RELATION}`],
  ['Search', '/api/search/colleges + /api/search/suggestions', 'backend/src/routes/search.js', `${CANONICAL_RELATION} (+ canonical.institution_programs for suggestions)`],
  ['Compare/details', '/api/colleges/comprehensive/:id + /api/colleges/comprehensive/compare', 'backend/src/routes/colleges.js + backend/src/services/collegeService.js', 'canonical domain tables (detail path)'],
];

const driftReport = {
  checkedAt: new Date().toISOString(),
  canonicalRelation: CANONICAL_RELATION,
  bypassFiles: bypassEntries.map((entry) => ({
    file: entry.file,
    bypassRelations: entry.bypassRelations,
  })),
  potentialDriftSignals: bypassEntries.length,
};

const fieldUsageReport = {
  checkedAt: new Date().toISOString(),
  canonicalRelation: CANONICAL_RELATION,
  selectBlockCount: selectBlocks.length,
  selectBlocks: selectBlocks.slice(0, 200),
  orderColumnsUsed: allOrderColumns,
};

const unusedQueryReport = {
  checkedAt: new Date().toISOString(),
  canonicalRelation: CANONICAL_RELATION,
  flaggedBypassPaths: bypassEntries.map((entry) => ({
    file: entry.file,
    relations: entry.bypassRelations,
  })),
  note: 'Flagged paths should be reviewed for migration to canonical.mv_college_cards when they are frontend-card consumers.',
};

const perfRecommendations = [
  '- Validate btree index coverage for canonical.mv_college_cards(canonical_name).',
  '- Validate btree index coverage for canonical.mv_college_cards(country_code, global_rank).',
  '- Keep popularity/ranking sorts constrained with LIMIT + deterministic tiebreakers.',
  '- Avoid expanding joins in card-list endpoints; use card view fields first.',
  '- Monitor query latency p95 for /api/search/colleges and /api/discovery/*.',
].join('\n');

const schemaRiskLines = [
  '# Remaining Schema Risk Report',
  '',
  `- Canonical frontend relation: \`${CANONICAL_RELATION}\``,
  `- Files with relation bypasses detected: ${bypassEntries.length}`,
  '- High-risk drift vector: routes that combine canonical.mv_college_cards with canonical.institution_* joins.',
  '- Mitigation: keep card/list endpoints pinned to canonical.mv_college_cards contract fields.',
  '- Mitigation: run startup schema contract check and this diagnostics script in CI/runtime-check.',
];

writeReport(
  'frontend-dependency-graph.md',
  [
    '# Frontend Dependency Graph',
    '',
    '| Frontend Flow | API Route | Serializer/Route | DB Query |',
    '|---|---|---|---|',
    ...dependencyGraph.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
    '',
  ].join('\n')
);

writeReport('frontend-contract-drift-report.json', `${JSON.stringify(driftReport, null, 2)}\n`);
writeReport('frontend-field-usage-report.json', `${JSON.stringify(fieldUsageReport, null, 2)}\n`);
writeReport('frontend-unused-query-report.json', `${JSON.stringify(unusedQueryReport, null, 2)}\n`);
writeReport('frontend-performance-index-recommendations.md', `${perfRecommendations}\n`);
writeReport('frontend-schema-risk-report.md', `${schemaRiskLines.join('\n')}\n`);

if (STRICT_MODE && bypassEntries.length > 0) {
  console.error('Frontend contract diagnostics failed: canonical relation bypasses detected.');
  for (const entry of bypassEntries) {
    console.error(`- ${entry.file}: ${entry.bypassRelations.join(', ')}`);
  }
  process.exit(1);
}

console.info(`Frontend contract diagnostics generated in ${path.relative(PROJECT_ROOT, REPORT_DIR)}.`);
