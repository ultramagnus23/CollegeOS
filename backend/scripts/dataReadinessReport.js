'use strict';

// Data-readiness report: measures how usable the product's data actually is, per
// table, against the live DB. Honest coverage numbers — no estimates. Prints a
// table and writes backend/ml/data_readiness.json. Exit code is non-zero when any
// CRITICAL surface is empty, so this can gate a release check.
//
//   node scripts/dataReadinessReport.js
//   node scripts/dataReadinessReport.js --json   # machine-readable only

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const q1 = async (pool, sql) => {
  try { return (await pool.query(sql)).rows[0]; } catch (e) { return { error: e.message }; }
};

function status(value, { ok, warn }) {
  if (value >= ok) return 'OK';
  if (value >= warn) return 'SPARSE';
  return 'EMPTY';
}

async function main() {
  loadEnv();
  const jsonOnly = process.argv.includes('--json');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });

  const inst = await q1(pool, `SELECT count(*)::int n FROM canonical.institutions`);
  const totalInst = inst.n || 0;

  const deadlines = await q1(pool, `SELECT count(*)::int rows, count(DISTINCT institution_id)::int insts FROM canonical.institution_deadlines`);
  const requirements = await q1(pool, `SELECT count(*)::int rows, count(DISTINCT institution_id)::int insts FROM canonical.institution_requirements`);
  const programs = await q1(pool, `SELECT sum(c)::int rows, count(*)::int insts,
    round(avg(c)::numeric,1) avg_per_inst, count(*) FILTER (WHERE c>=30) insts_30plus
    FROM (SELECT institution_id, count(*) c FROM canonical.institution_programs GROUP BY 1) s`);
  const rankings = await q1(pool, `SELECT count(*)::int rows, count(DISTINCT institution_id)::int insts FROM canonical.institution_rankings`);
  const scholarships = await q1(pool, `SELECT count(*)::int rows FROM scholarships`);
  const chancingReady = await q1(pool, `SELECT count(*) FILTER (WHERE median_sat IS NOT NULL AND acceptance_rate IS NOT NULL)::int n FROM college_admissions_stats`);
  const realLabels = await q1(pool, `SELECT count(*) FILTER (WHERE outcome IN ('accepted','rejected'))::int n FROM ml_training_data`);
  const predLogs = await q1(pool, `SELECT count(*) FILTER (WHERE actual_outcome IS NOT NULL)::int n FROM prediction_logs`);

  const pct = (insts) => (totalInst ? `${Math.round((insts / totalInst) * 1000) / 10}%` : 'n/a');

  const surfaces = [
    { key: 'deadlines', label: 'Deadlines', rows: deadlines.rows, insts: deadlines.insts, coverage: pct(deadlines.insts), status: status(deadlines.rows, { ok: 1000, warn: 1 }), critical: true },
    { key: 'requirements', label: 'Requirements', rows: requirements.rows, insts: requirements.insts, coverage: pct(requirements.insts), status: status(requirements.rows, { ok: 1000, warn: 1 }), critical: true },
    { key: 'essays', label: 'Essay prompts', rows: 0, insts: 0, coverage: '0%', status: 'EMPTY (no table)', critical: false },
    { key: 'programs', label: 'Programs', rows: programs.rows, insts: programs.insts, coverage: pct(programs.insts), status: status(programs.insts, { ok: 4000, warn: 1 }), note: `avg ${programs.avg_per_inst}/inst, ${programs.insts_30plus} with >=30`, critical: false },
    { key: 'rankings', label: 'Rankings', rows: rankings.rows, insts: rankings.insts, coverage: pct(rankings.insts), status: status(rankings.rows, { ok: 2000, warn: 1 }), critical: false },
    { key: 'scholarships', label: 'Scholarships', rows: scholarships.rows, insts: null, coverage: 'n/a', status: status(scholarships.rows, { ok: 200, warn: 1 }), critical: false },
    { key: 'chancing_stats', label: 'Chancing stats (SAT+AR)', rows: chancingReady.n, insts: null, coverage: 'n/a', status: status(chancingReady.n, { ok: 500, warn: 1 }), critical: true },
    { key: 'ml_real_labels', label: 'Real ML labels', rows: realLabels.n, insts: null, coverage: 'n/a', status: status(realLabels.n, { ok: 200, warn: 1 }), note: `${predLogs.n} prediction_logs w/ outcome`, critical: false },
  ];

  const report = { generated_at: new Date().toISOString(), total_institutions: totalInst, surfaces };
  fs.writeFileSync(path.join(__dirname, '..', 'ml', 'data_readiness.json'), JSON.stringify(report, null, 2));

  if (!jsonOnly) {
    console.log(`\nData readiness — ${totalInst} institutions — ${report.generated_at}\n`);
    console.log('Surface'.padEnd(26) + 'Rows'.padStart(8) + 'Insts'.padStart(8) + 'Coverage'.padStart(10) + '  Status');
    console.log('-'.repeat(70));
    for (const s of surfaces) {
      console.log(
        s.label.padEnd(26) +
        String(s.rows).padStart(8) +
        String(s.insts ?? '-').padStart(8) +
        String(s.coverage).padStart(10) +
        `  ${s.critical && s.status.startsWith('EMPTY') ? '❌ ' : ''}${s.status}` +
        (s.note ? `  (${s.note})` : '')
      );
    }
    console.log('');
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  const criticalEmpty = surfaces.filter((s) => s.critical && s.status.startsWith('EMPTY'));
  if (criticalEmpty.length) {
    console.error(`CRITICAL surfaces empty: ${criticalEmpty.map((s) => s.label).join(', ')}`);
    process.exitCode = 1;
  }
  await pool.end();
}

main().catch((e) => { console.error('readiness report failed:', e.message); process.exitCode = 1; });
