// Repair pass: for every (survivor, loser) pair already recorded in
// canonical.institution_merge_history, re-run the exact same per-table FK
// reassignment logic dedupeInstitutions.js uses (imported directly, not
// reimplemented) against any rows that never got reassigned.
//
// Why this is needed: a broad live audit (2026-07-25) found 14 tables with
// rows still pointing at deprecated (loser) institution_id values — up to
// 9,162 in institution_programs alone. dedupeInstitutions.js's own
// reassignment logic is idempotent and safe to re-run (its UPDATE queries
// are scoped to `WHERE fk = loser_id`, a no-op once already reassigned), so
// replaying it against the recorded pairs is the correct, low-risk repair —
// same conflict/archive rules, not new ad-hoc SQL.
//
// Usage:
//   node repairOrphanedMergeReferences.js --dry-run   (default; report only)
//   node repairOrphanedMergeReferences.js --apply     (writes for real)

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const APPLY = process.argv.includes('--apply');

const COMPOSITE_NOARCHIVE = [
  { table: 'institution_programs', fk: 'institution_id', idCols: ['normalized_program_name', 'degree_type_key'], rowId: 'id' },
  { table: 'institution_demographics', fk: 'institution_id', idCols: ['data_year_key'], rowId: 'id' },
  { table: 'institution_outcomes', fk: 'institution_id', idCols: ['data_year_key'], rowId: 'id' },
  { table: 'institution_deadlines', fk: 'institution_id', idCols: ['cycle_year_key', 'applicant_type', 'degree_level', 'intake_term', 'deadline_type'], rowId: 'id' },
  { table: 'institution_requirements', fk: 'institution_id', idCols: ['cycle_year', 'degree_level', 'applicant_type'], rowId: 'id' },
  { table: 'institution_embeddings', fk: 'institution_id', idCols: ['model_name'], rowId: null },
  { table: 'institution_aliases', fk: 'institution_id', idCols: ['normalized_alias'], rowId: 'id' },
  { table: 'institution_placements', fk: 'institution_id', idCols: ['cycle_year'], rowId: 'id' },
  { table: 'institution_identity_map', fk: 'institution_id', idCols: ['source_table', 'source_pk'], rowId: 'id' },
  { table: 'masters_programs', fk: 'canonical_institution_id', idCols: ['program_name', 'degree_type', 'intake_term', 'intake_year'], rowId: 'id' },
];
const COMPOSITE_ARCHIVE = [
  { table: 'institution_financials', fk: 'institution_id', idCols: ['data_year_key', 'academic_year_key'], rowId: 'id', archive: 'institution_financials_merge_archive' },
  { table: 'institution_admissions', fk: 'institution_id', idCols: ['data_year', 'admissions_cycle'], rowId: 'id', archive: 'institution_admissions_merge_archive' },
  { table: 'institution_rankings', fk: 'institution_id', idCols: ['ranking_year_key', 'ranking_body'], rowId: 'id', archive: 'institution_rankings_merge_archive' },
];
const SINGLE_NOARCHIVE = [
  { table: 'institution_quality_scores', fk: 'institution_id' },
  { table: 'institution_search_index', fk: 'institution_id' },
  { table: 'popularity_index', fk: 'institution_id' },
  { table: 'eu_admissions_profile', fk: 'institution_id' },
  { table: 'india_admissions_profile', fk: 'institution_id' },
  { table: 'india_financial_aid', fk: 'institution_id' },
  { table: 'uk_admissions_profile', fk: 'institution_id' },
  { table: 'uk_financial_support', fk: 'institution_id' },
  { table: 'us_admissions_profile', fk: 'institution_id' },
  { table: 'us_financial_aid', fk: 'institution_id' },
  { table: 'institution_campus_life', fk: 'institution_id' },
];
const SINGLE_ARCHIVE = [
  { table: 'institution_completeness', fk: 'institution_id', archive: 'institution_completeness_merge_archive' },
];
const BLANKET = [
  { table: 'institution_source_registry', fk: 'institution_id' },
];

function q(id) { return '"' + id.replace(/"/g, '""') + '"'; }

async function getAllColumns(client, table) {
  const r = await client.query(
    `select column_name from information_schema.columns where table_schema='canonical' and table_name=$1 order by ordinal_position`,
    [table]
  );
  return r.rows.map((x) => x.column_name);
}

async function countOrphaned(client, spec) {
  const r = await client.query(`select count(*)::int n from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [spec.__loserId]);
  return r.rows[0].n;
}

async function repairCompositeNoArchive(client, spec, survivorId, loserId, result, dryRun) {
  const before = (await client.query(`select count(*)::int n from canonical.${q(spec.table)} where ${q(spec.fk)}=$1`, [loserId])).rows[0].n;
  if (before === 0) return;
  const conflictQ = `
    select count(*)::int n from canonical.${q(spec.table)} l
    join canonical.${q(spec.table)} s
      on s.${q(spec.fk)} = $1
     and ${spec.idCols.map((c) => `s.${q(c)} is not distinct from l.${q(c)}`).join(' and ')}
    where l.${q(spec.fk)} = $2`;
  const conflicts = (await client.query(conflictQ, [survivorId, loserId])).rows[0].n;
  if (conflicts > 0) result.conflicts[spec.table] = (result.conflicts[spec.table] || 0) + conflicts;
  const reassignable = before - conflicts;
  if (reassignable > 0) {
    result.reassignable[spec.table] = (result.reassignable[spec.table] || 0) + reassignable;
    if (!dryRun) {
      const updateQ = `
        update canonical.${q(spec.table)} l
        set ${q(spec.fk)} = $1
        where l.${q(spec.fk)} = $2
          and not exists (
            select 1 from canonical.${q(spec.table)} s
            where s.${q(spec.fk)} = $1
              and ${spec.idCols.map((c) => `s.${q(c)} is not distinct from l.${q(c)}`).join(' and ')}
          )`;
      await client.query(updateQ, [survivorId, loserId]);
    }
  }
}

async function repairCompositeArchive(client, spec, survivorId, loserId, result, dryRun, allCols) {
  const before = (await client.query(`select count(*)::int n from canonical.${q(spec.table)} where ${q(spec.fk)}=$1`, [loserId])).rows[0].n;
  if (before === 0) return;
  const conflictQ = `
    select l.${q(spec.rowId)} as loser_row_id, s.${q(spec.rowId)} as survivor_row_id
    from canonical.${q(spec.table)} l
    join canonical.${q(spec.table)} s
      on s.${q(spec.fk)} = $1
     and ${spec.idCols.map((c) => `s.${q(c)} is not distinct from l.${q(c)}`).join(' and ')}
    where l.${q(spec.fk)} = $2`;
  const conflicts = (await client.query(conflictQ, [survivorId, loserId])).rows;
  if (conflicts.length > 0) result.conflicts[spec.table] = (result.conflicts[spec.table] || 0) + conflicts.length;
  const reassignable = before - conflicts.length;
  if (reassignable > 0) result.reassignable[spec.table] = (result.reassignable[spec.table] || 0) + reassignable;
  if (!dryRun) {
    const cols = allCols[spec.table];
    const colList = cols.map(q).join(', ');
    for (const row of conflicts) {
      await client.query(
        `insert into canonical.${q(spec.archive)} (${colList}, archived_at, archive_reason, winning_row_id)
         select ${colList}, now(), $1, $2 from canonical.${q(spec.table)} where ${q(spec.rowId)} = $3`,
        [`repair pass: conflicting ${spec.idCols.join('/')} on institution_id`, row.survivor_row_id, row.loser_row_id]
      );
      await client.query(`delete from canonical.${q(spec.table)} where ${q(spec.rowId)} = $1`, [row.loser_row_id]);
    }
    const updateQ = `update canonical.${q(spec.table)} l set ${q(spec.fk)} = $1 where l.${q(spec.fk)} = $2`;
    await client.query(updateQ, [survivorId, loserId]);
  }
}

async function repairSingleNoArchive(client, spec, survivorId, loserId, result, dryRun) {
  const loserHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [loserId]);
  if (loserHas.rowCount === 0) return;
  const survivorHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [survivorId]);
  if (survivorHas.rowCount > 0) {
    result.conflicts[spec.table] = (result.conflicts[spec.table] || 0) + 1;
    return;
  }
  result.reassignable[spec.table] = (result.reassignable[spec.table] || 0) + 1;
  if (!dryRun) {
    await client.query(`update canonical.${q(spec.table)} set ${q(spec.fk)} = $1 where ${q(spec.fk)} = $2`, [survivorId, loserId]);
  }
}

async function repairSingleArchive(client, spec, survivorId, loserId, result, dryRun, allCols) {
  const loserHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [loserId]);
  if (loserHas.rowCount === 0) return;
  const survivorHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [survivorId]);
  if (survivorHas.rowCount > 0) {
    result.conflicts[spec.table] = (result.conflicts[spec.table] || 0) + 1;
    if (!dryRun) {
      const cols = allCols[spec.table];
      const colList = cols.map(q).join(', ');
      await client.query(
        `insert into canonical.${q(spec.archive)} (${colList}, archived_at, archive_reason, winning_row_id)
         select ${colList}, now(), $1, $2 from canonical.${q(spec.table)} where ${q(spec.fk)} = $3`,
        ['repair pass: survivor already has a row for this institution', survivorId, loserId]
      );
      await client.query(`delete from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [loserId]);
    }
    return;
  }
  result.reassignable[spec.table] = (result.reassignable[spec.table] || 0) + 1;
  if (!dryRun) {
    await client.query(`update canonical.${q(spec.table)} set ${q(spec.fk)} = $1 where ${q(spec.fk)} = $2`, [survivorId, loserId]);
  }
}

async function repairBlanket(client, spec, survivorId, loserId, result, dryRun) {
  const before = (await client.query(`select count(*)::int n from canonical.${q(spec.table)} where ${q(spec.fk)}=$1`, [loserId])).rows[0].n;
  if (before === 0) return;
  result.reassignable[spec.table] = (result.reassignable[spec.table] || 0) + before;
  if (!dryRun) {
    await client.query(`update canonical.${q(spec.table)} set ${q(spec.fk)} = $1 where ${q(spec.fk)} = $2`, [survivorId, loserId]);
  }
}

async function main() {
  const client = await pool.connect();
  const dryRun = !APPLY;
  try {
    const allCols = {};
    for (const spec of [...COMPOSITE_ARCHIVE, ...SINGLE_ARCHIVE]) {
      allCols[spec.table] = await getAllColumns(client, spec.table);
    }

    const pairs = await client.query(`
      select i.id as loser_id, i.deprecated_duplicate_of as survivor_id
      from canonical.institutions i
      where i.deprecated_at is not null and i.deprecated_duplicate_of is not null`);

    console.log(`${dryRun ? 'DRY RUN' : 'APPLYING'} — ${pairs.rows.length} deprecated institutions to repair against.`);

    const result = { conflicts: {}, reassignable: {} };
    let processed = 0;
    for (const { loser_id, survivor_id } of pairs.rows) {
      if (!dryRun) await client.query('BEGIN');
      try {
        for (const spec of COMPOSITE_NOARCHIVE) await repairCompositeNoArchive(client, spec, survivor_id, loser_id, result, dryRun);
        for (const spec of COMPOSITE_ARCHIVE) await repairCompositeArchive(client, spec, survivor_id, loser_id, result, dryRun, allCols);
        for (const spec of SINGLE_NOARCHIVE) await repairSingleNoArchive(client, spec, survivor_id, loser_id, result, dryRun);
        for (const spec of SINGLE_ARCHIVE) await repairSingleArchive(client, spec, survivor_id, loser_id, result, dryRun, allCols);
        for (const spec of BLANKET) await repairBlanket(client, spec, survivor_id, loser_id, result, dryRun);
        if (!dryRun) await client.query('COMMIT');
        processed++;
      } catch (err) {
        if (!dryRun) await client.query('ROLLBACK');
        console.error(`Pair ${loser_id} -> ${survivor_id} failed: ${err.message}`);
      }
    }

    console.log(`Processed ${processed}/${pairs.rows.length} pairs.`);
    console.log('Reassignable (no conflict):', JSON.stringify(result.reassignable, null, 2));
    console.log('Conflicts (left in place / archived):', JSON.stringify(result.conflicts, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
