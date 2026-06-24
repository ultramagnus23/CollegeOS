#!/usr/bin/env node
/**
 * benchmarkMastersBaseline.js
 *
 * Phase 0 of docs/MASTERS_TRACK_PLAN.md — capture undergrad-only API latency
 * BEFORE the masters migration/changes land, so the Phase 7 regression gate has
 * a real before/after comparison. Re-run this after each masters phase; a >~5%
 * regression on any of these undergrad-only endpoints is a stop-the-phase issue.
 *
 * Usage:
 *   node scripts/benchmarkMastersBaseline.js
 *   API_BASE_URL=https://api.example.com BENCH_ITERATIONS=50 node scripts/benchmarkMastersBaseline.js
 *
 * Endpoints are overridable via env so this doesn't hard-code route assumptions.
 * It measures wall-clock latency per request and reports p50/p95/min/max.
 * Read-only: issues GET requests only.
 */
const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const ITERATIONS = parseInt(process.env.BENCH_ITERATIONS, 10) || 30;
const TIMEOUT_MS = parseInt(process.env.BENCH_TIMEOUT_MS, 10) || 15000;

// Undergrad-only endpoints. Override any with env if the paths differ.
const ENDPOINTS = [
  { name: 'College search',   path: process.env.BENCH_SEARCH_PATH    || '/api/colleges/search?q=computer%20science&limit=20' },
  { name: 'Chancing predict', path: process.env.BENCH_CHANCING_PATH  || '/api/chancing/predict?collegeId=1' },
  { name: 'Dashboard load',   path: process.env.BENCH_DASHBOARD_PATH || '/api/dashboard' },
];

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
}

async function timeOne(url) {
  const start = process.hrtime.bigint();
  let ok = true;
  try {
    await axios.get(url, { timeout: TIMEOUT_MS, validateStatus: () => true });
  } catch {
    ok = false;
  }
  const end = process.hrtime.bigint();
  return { ms: Number(end - start) / 1e6, ok };
}

async function benchEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  const samples = [];
  let failures = 0;
  // One warmup request (excluded) to avoid cold-start skew.
  await timeOne(url);
  for (let i = 0; i < ITERATIONS; i += 1) {
    const { ms, ok } = await timeOne(url);
    if (!ok) failures += 1;
    samples.push(ms);
  }
  samples.sort((a, b) => a - b);
  return {
    name: endpoint.name,
    url,
    n: samples.length,
    failures,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    min: samples[0],
    max: samples[samples.length - 1],
  };
}

function fmt(n) {
  return n == null ? '—' : `${n.toFixed(1)}ms`;
}

async function main() {
  console.log(`Masters latency baseline — ${BASE_URL} — ${ITERATIONS} iterations/endpoint\n`);
  const results = [];
  for (const endpoint of ENDPOINTS) {
    /* eslint-disable no-await-in-loop */
    results.push(await benchEndpoint(endpoint));
  }
  const pad = (s, w) => String(s).padEnd(w);
  console.log(`${pad('Endpoint', 18)}${pad('p50', 12)}${pad('p95', 12)}${pad('min', 12)}${pad('max', 12)}fails`);
  console.log('-'.repeat(72));
  for (const r of results) {
    console.log(
      `${pad(r.name, 18)}${pad(fmt(r.p50), 12)}${pad(fmt(r.p95), 12)}${pad(fmt(r.min), 12)}${pad(fmt(r.max), 12)}${r.failures}/${r.n}`,
    );
  }
  console.log('\nPaste these p50/p95 numbers into Appendix B of docs/MASTERS_TRACK_PLAN.md.');
}

main().catch((err) => {
  console.error('Benchmark failed:', err.message);
  process.exit(1);
});
