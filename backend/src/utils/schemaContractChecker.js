'use strict';

const fs = require('fs');
const path = require('path');

const MV_COLUMNS = [
  'id',
  'canonical_name',
  'country_code',
  'state_region',
  'city',
  'website',
  'logo_url',
  'description',
  'institution_type',
  'popularity_score',
  'global_rank',
  'acceptance_rate',
  'test_optional',
  'sat_50',
  'act_50',
  'tuition_international',
  'cost_of_attendance',
  'avg_financial_aid',
  'merit_scholarship_flag',
  'need_blind_flag',
  'graduation_rate_4yr',
  'employment_rate',
  'median_start_salary',
  'metadata'
];

const FRONTEND_SELECT_FIELDS = [...MV_COLUMNS];

const FRONTEND_ORDER_FIELDS = [
  'canonical_name',
  'acceptance_rate',
  'cost_of_attendance',
  'global_rank',
  'popularity_score'
];

const ORPHAN_JOIN_RELATIONS = [
  'canonical.institution_programs',
];

const FRONTEND_CONSUMER_PATHS = [
  'src/lib/collegeService.ts',
  'backend/src/routes/discovery.js',
  'backend/src/routes/search.js',
  'backend/src/routes/colleges.js',
  'backend/src/services/recommendation/recommendationPipelineService.js',
];

const BACKEND_SERIALIZER_FIELDS = [
  'id',
  'canonical_name',
  'country_code',
  'state_region',
  'city',
  'website',
  'logo_url',
  'description',
  'institution_type',
  'popularity_score',
  'global_rank',
  'acceptance_rate',
  'sat_50',
  'act_50',
  'tuition_international',
  'cost_of_attendance',
  'graduation_rate_4yr',
  'employment_rate',
  'median_start_salary',
  'metadata'
];

async function getColumns(pool, schema, table) {
  const query = `
    SELECT a.attname AS column_name
    FROM pg_attribute a
    JOIN pg_class c
      ON c.oid = a.attrelid
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    WHERE n.nspname = $1
      AND c.relname = $2
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `;

  const result = await pool.query(query, [schema, table]);

  return result.rows.map((r) => r.column_name);
}

function missingFrom(actualSet, expectedList) {
  return expectedList.filter((name) => !actualSet.has(name));
}

function buildRenameCandidates(missingColumn, actualColumns) {
  const tokens = missingColumn.split('_').filter(Boolean);

  return actualColumns.filter((candidate) =>
    tokens.some((token) => candidate.includes(token))
  );
}

async function checkSchemaContracts(pool) {
  const columns = await getColumns(
    pool,
    'canonical',
    'mv_college_cards'
  );

  const actual = new Set(columns);

  const missingRequiredColumns = missingFrom(
    actual,
    MV_COLUMNS
  );

  const missingFrontendFields = missingFrom(
    actual,
    FRONTEND_SELECT_FIELDS
  );

  const missingBackendSerializerFields = missingFrom(
    actual,
    BACKEND_SERIALIZER_FIELDS
  );

  const invalidOrderFields = FRONTEND_ORDER_FIELDS.filter(
    (name) => !actual.has(name)
  );

  const staleReferences = [
    ...new Set([
      ...missingFrontendFields,
      ...missingBackendSerializerFields
    ])
  ];

  const orphanJoinRelations = [];
  for (const relation of ORPHAN_JOIN_RELATIONS) {
    const { rows } = await pool.query(
      `SELECT to_regclass($1) AS relation`,
      [relation]
    );
    if (!rows[0] || !rows[0].relation) orphanJoinRelations.push(relation);
  }

  const projectRoot = path.resolve(__dirname, '../../..');
  const bypassRelations = [];
  for (const relPath of FRONTEND_CONSUMER_PATHS) {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    const matches = content.match(/canonical\.[a-zA-Z0-9_]+/g) || [];
    const disallowed = [...new Set(matches.filter((name) => name !== 'canonical.mv_college_cards'))];
    if (disallowed.length > 0) {
      bypassRelations.push({
        file: relPath,
        relations: disallowed,
      });
    }
  }

  const diagnostics = {
    ok: false,
    checkedAt: new Date().toISOString(),
    relation: 'canonical.mv_college_cards',

    columns,

    requiredColumns: MV_COLUMNS,

    frontend: {
      selectFields: FRONTEND_SELECT_FIELDS,
      orderFields: FRONTEND_ORDER_FIELDS,
      missingSelectFields: missingFrontendFields,
      invalidOrderFields
    },

    backend: {
      serializerFields: BACKEND_SERIALIZER_FIELDS,
      missingSerializerFields:
        missingBackendSerializerFields
    },

    drift: {
      missingRequiredColumns,
      staleReferences,

      renamedColumnsSuspected:
        missingRequiredColumns.map((column) => ({
          missing: column,
          candidates: buildRenameCandidates(
            column,
            columns
          )
        }))
    },

    diagnostics: {
      orphanJoinRelations,
      bypassRelations,
    },
  };

  diagnostics.ok =
    diagnostics.drift.missingRequiredColumns.length === 0 &&
    diagnostics.frontend.missingSelectFields.length === 0 &&
    diagnostics.frontend.invalidOrderFields.length === 0 &&
    diagnostics.backend.missingSerializerFields.length === 0 &&
    diagnostics.diagnostics.orphanJoinRelations.length === 0;

  return diagnostics;
}

function formatSchemaContractReport(report) {
  return {
    ok: report.ok,
    checkedAt: report.checkedAt,
    relation: report.relation,
    totalColumnsDetected: report.columns.length,

    missingRequiredColumns:
      report.drift.missingRequiredColumns,

    staleReferences:
      report.drift.staleReferences,

    invalidOrderFields:
      report.frontend.invalidOrderFields,

    missingFrontendFields:
      report.frontend.missingSelectFields,

    missingBackendFields:
      report.backend.missingSerializerFields,

    renamedColumnsSuspected:
      report.drift.renamedColumnsSuspected,

    orphanJoinRelations:
      report.diagnostics.orphanJoinRelations,

    bypassRelations:
      report.diagnostics.bypassRelations,
  };
}

module.exports = {
  MV_COLUMNS,
  FRONTEND_SELECT_FIELDS,
  FRONTEND_ORDER_FIELDS,
  BACKEND_SERIALIZER_FIELDS,
  checkSchemaContracts,
  formatSchemaContractReport
};
