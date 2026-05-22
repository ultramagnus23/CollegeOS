'use strict';

const REQUIRED_RELATIONS = [
  { schema: 'canonical', name: 'institutions', type: 'BASE TABLE' },
  { schema: 'canonical', name: 'popularity_index', type: 'BASE TABLE' },
  { schema: 'canonical', name: 'institution_rankings', type: 'BASE TABLE' },
  { schema: 'canonical', name: 'institution_admissions', type: 'BASE TABLE' },
  { schema: 'canonical', name: 'institution_financials', type: 'BASE TABLE' },
  { schema: 'canonical', name: 'institution_outcomes', type: 'BASE TABLE' },
  { schema: 'canonical', name: 'mv_college_cards', type: 'MATERIALIZED VIEW' },
  { schema: 'public', name: 'mv_college_cards', type: 'VIEW' },
];

const REQUIRED_COLUMNS = {
  'canonical.mv_college_cards': [
    'id', 'canonical_name', 'country_code', 'state_region', 'city', 'website', 'logo_url',
    'description', 'institution_type', 'popularity_score', 'global_rank', 'acceptance_rate',
    'test_optional', 'sat_50', 'act_50', 'tuition_international', 'cost_of_attendance',
    'avg_financial_aid', 'merit_scholarship_flag', 'need_blind_flag', 'graduation_rate_4yr',
    'employment_rate', 'median_start_salary', 'metadata',
  ],
  'public.mv_college_cards': [
    'id', 'canonical_name', 'country_code', 'state_region', 'city', 'website', 'logo_url',
    'description', 'institution_type', 'popularity_score', 'global_rank', 'acceptance_rate',
    'test_optional', 'sat_50', 'act_50', 'tuition_international', 'cost_of_attendance',
    'avg_financial_aid', 'merit_scholarship_flag', 'need_blind_flag', 'graduation_rate_4yr',
    'employment_rate', 'median_start_salary', 'metadata',
  ],
};

const REQUIRED_INDEXES = [
  { schema: 'canonical', name: 'mv_college_cards_idx_id' },
  { schema: 'canonical', name: 'mv_college_cards_idx_popularity' },
  { schema: 'canonical', name: 'mv_college_cards_idx_country_rank' },
];

async function listColumns(pool, schema, table) {
  const { rows } = await pool.query(
    `
      SELECT a.attname AS column_name
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relname = $2
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum
    `,
    [schema, table]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function validateStartupSchema(pool, logger = console) {
  const report = {
    checkedAt: new Date().toISOString(),
    missingRelations: [],
    wrongRelationType: [],
    missingColumns: [],
    missingIndexes: [],
  };

  for (const rel of REQUIRED_RELATIONS) {
    const { rows } = await pool.query(
      `
        SELECT table_type
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
        UNION ALL
        SELECT 'MATERIALIZED VIEW'::text AS table_type
        FROM pg_matviews
        WHERE schemaname = $1 AND matviewname = $2
      `,
      [rel.schema, rel.name]
    );

    if (!rows.length) {
      report.missingRelations.push(`${rel.schema}.${rel.name}`);
      continue;
    }

    const types = new Set(rows.map((r) => r.table_type));
    if (!types.has(rel.type)) {
      report.wrongRelationType.push({
        relation: `${rel.schema}.${rel.name}`,
        expected: rel.type,
        actual: [...types],
      });
    }
  }

  for (const [relation, required] of Object.entries(REQUIRED_COLUMNS)) {
    const [schema, table] = relation.split('.');
    const cols = await listColumns(pool, schema, table);
    for (const col of required) {
      if (!cols.has(col)) {
        report.missingColumns.push({ relation, column: col });
      }
    }
  }

  for (const idx of REQUIRED_INDEXES) {
    const { rows } = await pool.query(
      `
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = $1 AND indexname = $2
      `,
      [idx.schema, idx.name]
    );
    if (!rows.length) {
      report.missingIndexes.push(`${idx.schema}.${idx.name}`);
    }
  }

  const hasErrors =
    report.missingRelations.length > 0 ||
    report.wrongRelationType.length > 0 ||
    report.missingColumns.length > 0 ||
    report.missingIndexes.length > 0;

  if (hasErrors) {
    logger.error('Startup schema validation failed', report);
    const err = new Error('Schema contract validation failed');
    err.code = 'SCHEMA_CONTRACT_BROKEN';
    err.report = report;
    throw err;
  }

  logger.info('Startup schema validation passed', {
    checkedAt: report.checkedAt,
    relations: REQUIRED_RELATIONS.length,
    indexChecks: REQUIRED_INDEXES.length,
  });

  return report;
}

module.exports = {
  REQUIRED_COLUMNS,
  REQUIRED_INDEXES,
  REQUIRED_RELATIONS,
  validateStartupSchema,
};
