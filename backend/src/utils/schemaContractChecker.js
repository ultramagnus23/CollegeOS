'use strict';

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
  const { rows } = await pool.query(
    `
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
    `,
    [schema, table]
  );

  return rows.map((r) => r.column_name);
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
    }
  };

  diagnostics.ok =
    diagnostics.drift.missingRequiredColumns.length === 0 &&
    diagnostics.frontend.missingSelectFields.length === 0 &&
    diagnostics.frontend.invalidOrderFields.length === 0 &&
    diagnostics.backend.missingSerializerFields.length === 0;

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
      report.drift.renamedColumnsSuspected
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
