// Dedup canonical.institutions duplicate pairs (same canonical_name, same
// country) using a deterministic priority rule (same as
// docs/institution_merge_report.md): verification_status priority >
// completeness_score > updated_at. (institutions table has no
// last_verified_at column live; updated_at is the closest available
// tiebreak analog.)
//
// No hard deletes of institutions. Soft-mark via deprecated_duplicate_of /
// deprecated_at. FK reassignment across all institution-referencing tables.
// Conflicting provenance-bearing rows (same identity key on both sides) are
// archived into canonical.<table>_merge_archive where such a table exists;
// where none exists, the specific conflicting row is left untouched and the
// pair is flagged for manual review on that table (rest of the pair still
// proceeds if no other blocker).
//
// UGC guard: applications, application_tasks, recommendation_feedback,
// user_recommendation_events, scraper_failures, stg_institution_matches — if
// any reference the row about to be deprecated, skip the whole pair.
//
// Usage: node dedupeInstitutions.js [--countries=US,AU,FR] [--exclude=KR,CA,DE,GB]
// Defaults to every country with duplicates. Idempotent and safe to re-run --
// already-deprecated rows are excluded from candidate selection.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--(\w+)=(.*)$/);
  if (m) acc[m[1]] = m[2].split(',').filter(Boolean);
  return acc;
}, {});
const EXCLUDE_COUNTRIES = args.exclude || [];
const EXPLICIT_TARGET_COUNTRIES = args.countries || null; // null = all except excluded

const UGC_TABLES = [
  'applications',
  'application_tasks',
  'recommendation_feedback',
  'user_recommendation_events',
  'scraper_failures',
  'stg_institution_matches',
];

const VERIFICATION_PRIORITY = {
  government_verified: 6,
  verified: 5,
  scraped: 4,
  imported: 3,
  inferred: 2,
  estimated: 2,
  user_supplied: 2,
  unverified: 1,
  unknown: 1,
  deprecated: 0,
};

// Composite-key tables (institution_id + other identity cols), no archive table.
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

// Composite-key tables WITH an existing merge_archive table.
const COMPOSITE_ARCHIVE = [
  { table: 'institution_financials', fk: 'institution_id', idCols: ['data_year_key', 'academic_year_key'], rowId: 'id', archive: 'institution_financials_merge_archive' },
  { table: 'institution_admissions', fk: 'institution_id', idCols: ['data_year', 'admissions_cycle'], rowId: 'id', archive: 'institution_admissions_merge_archive' },
  { table: 'institution_rankings', fk: 'institution_id', idCols: ['ranking_year_key', 'ranking_body'], rowId: 'id', archive: 'institution_rankings_merge_archive' },
];

// Single-row-per-institution tables, no archive table.
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

// Single-row-per-institution table WITH archive table.
const SINGLE_ARCHIVE = [
  { table: 'institution_completeness', fk: 'institution_id', archive: 'institution_completeness_merge_archive' },
];

// No unique constraint on fk alone -> always safe to bulk reassign.
const BLANKET = [
  { table: 'institution_source_registry', fk: 'institution_id' },
];

function q(id) {
  return '"' + id.replace(/"/g, '""') + '"';
}

async function getAllColumns(client, table) {
  const r = await client.query(
    `select column_name from information_schema.columns where table_schema='canonical' and table_name=$1 order by ordinal_position`,
    [table]
  );
  return r.rows.map((x) => x.column_name);
}

async function checkUgcReferences(client, loserId) {
  const hits = [];
  for (const t of UGC_TABLES) {
    const r = await client.query(`select count(*)::int c from canonical.${q(t)} where institution_id = $1`, [loserId]);
    if (r.rows[0].c > 0) hits.push({ table: t, count: r.rows[0].c });
  }
  return hits;
}

function priorityScore(inst) {
  return VERIFICATION_PRIORITY[inst.verification_status] ?? 0;
}

// Returns { survivor, loser, ambiguous }
function pickSurvivor(a, b) {
  const pa = priorityScore(a);
  const pb = priorityScore(b);
  if (pa !== pb) return pa > pb ? { survivor: a, loser: b } : { survivor: b, loser: a };
  const ca = Number(a.completeness_score) || 0;
  const cb = Number(b.completeness_score) || 0;
  if (ca !== cb) return ca > cb ? { survivor: a, loser: b } : { survivor: b, loser: a };
  const ua = a.updated_at ? new Date(a.updated_at).getTime() : 0;
  const ub = b.updated_at ? new Date(b.updated_at).getTime() : 0;
  if (ua !== ub) return ua > ub ? { survivor: a, loser: b } : { survivor: b, loser: a };
  return { ambiguous: true };
}

async function mergeCompositeNoArchive(client, spec, survivorId, loserId, result) {
  const idColsList = spec.idCols.map(q).join(', ');
  // conflicting rows: loser rows whose identity key already exists on survivor
  const conflictQ = `
    select ${spec.rowId ? `l.${q(spec.rowId)}` : "'x'"} as rid
    from canonical.${q(spec.table)} l
    join canonical.${q(spec.table)} s
      on s.${q(spec.fk)} = $1
     and ${spec.idCols.map((c) => `s.${q(c)} is not distinct from l.${q(c)}`).join(' and ')}
    where l.${q(spec.fk)} = $2`;
  const conflicts = await client.query(conflictQ, [survivorId, loserId]);
  if (conflicts.rows.length > 0) {
    result.conflictsFlagged[spec.table] = conflicts.rows.length;
  }
  // non-conflicting rows: bulk update
  const updateQ = `
    update canonical.${q(spec.table)} l
    set ${q(spec.fk)} = $1
    where l.${q(spec.fk)} = $2
      and not exists (
        select 1 from canonical.${q(spec.table)} s
        where s.${q(spec.fk)} = $1
          and ${spec.idCols.map((c) => `s.${q(c)} is not distinct from l.${q(c)}`).join(' and ')}
      )`;
  const upd = await client.query(updateQ, [survivorId, loserId]);
  if (upd.rowCount > 0) {
    result.touched.add(spec.table);
    result.reassigned[spec.table] = (result.reassigned[spec.table] || 0) + upd.rowCount;
  }
}

async function mergeCompositeArchive(client, spec, survivorId, loserId, result, allCols) {
  const cols = allCols[spec.table];
  const colList = cols.map(q).join(', ');
  // find conflicting loser rows + the survivor row id they collide with
  const conflictQ = `
    select l.${q(spec.rowId)} as loser_row_id, s.${q(spec.rowId)} as survivor_row_id
    from canonical.${q(spec.table)} l
    join canonical.${q(spec.table)} s
      on s.${q(spec.fk)} = $1
     and ${spec.idCols.map((c) => `s.${q(c)} is not distinct from l.${q(c)}`).join(' and ')}
    where l.${q(spec.fk)} = $2`;
  const conflicts = await client.query(conflictQ, [survivorId, loserId]);
  for (const row of conflicts.rows) {
    await client.query(
      `insert into canonical.${q(spec.archive)} (${colList}, archived_at, archive_reason, winning_row_id)
       select ${colList}, now(), $1, $2 from canonical.${q(spec.table)} where ${q(spec.rowId)} = $3`,
      [`duplicate institution merge: conflicting ${spec.idCols.join('/')} on institution_id`, row.survivor_row_id, row.loser_row_id]
    );
    await client.query(`delete from canonical.${q(spec.table)} where ${q(spec.rowId)} = $1`, [row.loser_row_id]);
  }
  if (conflicts.rows.length > 0) {
    result.archived[spec.table] = (result.archived[spec.table] || 0) + conflicts.rows.length;
    result.touched.add(spec.table);
  }
  const updateQ = `
    update canonical.${q(spec.table)} l
    set ${q(spec.fk)} = $1
    where l.${q(spec.fk)} = $2`;
  const upd = await client.query(updateQ, [survivorId, loserId]);
  if (upd.rowCount > 0) {
    result.touched.add(spec.table);
    result.reassigned[spec.table] = (result.reassigned[spec.table] || 0) + upd.rowCount;
  }
}

async function mergeSingleNoArchive(client, spec, survivorId, loserId, result) {
  const survivorHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [survivorId]);
  const loserHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [loserId]);
  if (loserHas.rowCount === 0) return;
  if (survivorHas.rowCount > 0) {
    result.conflictsFlagged[spec.table] = (result.conflictsFlagged[spec.table] || 0) + 1;
    return;
  }
  const upd = await client.query(`update canonical.${q(spec.table)} set ${q(spec.fk)} = $1 where ${q(spec.fk)} = $2`, [survivorId, loserId]);
  if (upd.rowCount > 0) {
    result.touched.add(spec.table);
    result.reassigned[spec.table] = (result.reassigned[spec.table] || 0) + upd.rowCount;
  }
}

async function mergeSingleArchive(client, spec, survivorId, loserId, result, allCols) {
  const survivorHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [survivorId]);
  const loserHas = await client.query(`select 1 from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [loserId]);
  if (loserHas.rowCount === 0) return;
  if (survivorHas.rowCount > 0) {
    const cols = allCols[spec.table];
    const colList = cols.map(q).join(', ');
    await client.query(
      `insert into canonical.${q(spec.archive)} (${colList}, archived_at, archive_reason, winning_row_id)
       select ${colList}, now(), $1, $2 from canonical.${q(spec.table)} where ${q(spec.fk)} = $3`,
      ['duplicate institution merge: survivor already has a row for this institution', survivorId, loserId]
    );
    await client.query(`delete from canonical.${q(spec.table)} where ${q(spec.fk)} = $1`, [loserId]);
    result.archived[spec.table] = (result.archived[spec.table] || 0) + 1;
    result.touched.add(spec.table);
    return;
  }
  const upd = await client.query(`update canonical.${q(spec.table)} set ${q(spec.fk)} = $1 where ${q(spec.fk)} = $2`, [survivorId, loserId]);
  if (upd.rowCount > 0) {
    result.touched.add(spec.table);
    result.reassigned[spec.table] = (result.reassigned[spec.table] || 0) + upd.rowCount;
  }
}

async function mergeBlanket(client, spec, survivorId, loserId, result) {
  const upd = await client.query(`update canonical.${q(spec.table)} set ${q(spec.fk)} = $1 where ${q(spec.fk)} = $2`, [survivorId, loserId]);
  if (upd.rowCount > 0) {
    result.touched.add(spec.table);
    result.reassigned[spec.table] = (result.reassigned[spec.table] || 0) + upd.rowCount;
  }
}

async function processPair(client, survivor, loser, allCols) {
  const result = { touched: new Set(), reassigned: {}, archived: {}, conflictsFlagged: {} };
  for (const spec of COMPOSITE_NOARCHIVE) await mergeCompositeNoArchive(client, spec, survivor.id, loser.id, result);
  for (const spec of COMPOSITE_ARCHIVE) await mergeCompositeArchive(client, spec, survivor.id, loser.id, result, allCols);
  for (const spec of SINGLE_NOARCHIVE) await mergeSingleNoArchive(client, spec, survivor.id, loser.id, result);
  for (const spec of SINGLE_ARCHIVE) await mergeSingleArchive(client, spec, survivor.id, loser.id, result, allCols);
  for (const spec of BLANKET) await mergeBlanket(client, spec, survivor.id, loser.id, result);
  return result;
}

async function main() {
  const client = await pool.connect();
  try {
    // Load all column lists for archive-target tables up front.
    const allCols = {};
    for (const spec of [...COMPOSITE_ARCHIVE, ...SINGLE_ARCHIVE]) {
      allCols[spec.table] = await getAllColumns(client, spec.table);
    }

    const groupsQ = EXPLICIT_TARGET_COUNTRIES
      ? await client.query(
          `select country_code, canonical_name, array_agg(id order by created_at) ids
           from canonical.institutions
           where deprecated_at is null and country_code = ANY($1) and not (country_code = ANY($2))
           group by 1,2 having count(*) > 1
           order by 1,2`,
          [EXPLICIT_TARGET_COUNTRIES, EXCLUDE_COUNTRIES]
        )
      : await client.query(
          `select country_code, canonical_name, array_agg(id order by created_at) ids
           from canonical.institutions
           where deprecated_at is null and not (country_code = ANY($1))
           group by 1,2 having count(*) > 1
           order by 1,2`,
          [EXCLUDE_COUNTRIES]
        );

    const report = { merged: [], flaggedUgc: [], flaggedAmbiguous: [], byCountry: {} };

    for (const g of groupsQ.rows) {
      if (EXCLUDE_COUNTRIES.includes(g.country_code)) {
        throw new Error(`SAFETY: excluded country ${g.country_code} appeared in query results — aborting`);
      }
      if (g.ids.length !== 2) {
        report.flaggedAmbiguous.push({ country: g.country_code, name: g.canonical_name, reason: `group size ${g.ids.length} != 2, needs manual review`, ids: g.ids });
        continue;
      }
      const instRows = await client.query(
        `select id, canonical_name, country_code, verification_status, completeness_score, updated_at
         from canonical.institutions where id = ANY($1)`,
        [g.ids]
      );
      const [a, b] = instRows.rows;
      const pick = pickSurvivor(a, b);
      if (pick.ambiguous) {
        report.flaggedAmbiguous.push({ country: g.country_code, name: g.canonical_name, reason: 'tied verification_status, completeness_score, and updated_at', ids: g.ids });
        continue;
      }
      const { survivor, loser } = pick;

      const ugcHits = await checkUgcReferences(client, loser.id);
      if (ugcHits.length > 0) {
        report.flaggedUgc.push({ country: g.country_code, name: g.canonical_name, loserId: loser.id, survivorId: survivor.id, ugcHits });
        continue;
      }

      await client.query('BEGIN');
      try {
        const result = await processPair(client, survivor, loser, allCols);

        await client.query(
          `update canonical.institutions set deprecated_duplicate_of = $1, deprecated_at = now() where id = $2`,
          [survivor.id, loser.id]
        );

        const notes = [
          `Survivor chosen by verification_status priority (${survivor.verification_status} vs ${loser.verification_status}) / completeness_score (${survivor.completeness_score} vs ${loser.completeness_score}) / updated_at tiebreak.`,
          Object.keys(result.reassigned).length ? `Reassigned: ${JSON.stringify(result.reassigned)}.` : null,
          Object.keys(result.archived).length ? `Archived conflicting rows: ${JSON.stringify(result.archived)}.` : null,
          Object.keys(result.conflictsFlagged).length ? `UNRESOLVED per-row conflicts left in place (no archive table / ambiguous), needs manual review: ${JSON.stringify(result.conflictsFlagged)}.` : null,
        ].filter(Boolean).join(' ');

        await client.query(
          `insert into canonical.institution_merge_history
             (canonical_institution_id, merged_institution_id, merged_institution_name, merged_institution_country, tables_touched, notes)
           values ($1, $2, $3, $4, $5, $6)`,
          [survivor.id, loser.id, loser.canonical_name, loser.country_code, Array.from(result.touched), notes]
        );

        await client.query('COMMIT');
        report.merged.push({
          country: g.country_code,
          name: g.canonical_name,
          survivorId: survivor.id,
          loserId: loser.id,
          reassigned: result.reassigned,
          archived: result.archived,
          conflictsFlagged: result.conflictsFlagged,
        });
        report.byCountry[g.country_code] = (report.byCountry[g.country_code] || 0) + 1;
      } catch (err) {
        await client.query('ROLLBACK');
        report.flaggedAmbiguous.push({ country: g.country_code, name: g.canonical_name, reason: `error during merge: ${err.message}`, ids: g.ids });
      }
    }

    require('fs').writeFileSync(
      require('path').join(__dirname, '_merge_report.json'),
      JSON.stringify(report, null, 2)
    );
    console.log('DONE');
    console.log('merged:', report.merged.length);
    console.log('flaggedUgc:', report.flaggedUgc.length);
    console.log('flaggedAmbiguous:', report.flaggedAmbiguous.length);
    console.log('byCountry:', report.byCountry);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
