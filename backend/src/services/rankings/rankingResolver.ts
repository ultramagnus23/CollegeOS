type Pool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

function normalizeName(raw: string) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function resolveInstitutionId(
  pool: Pool,
  input: { institutionName?: string; slug?: string; sourcePk?: string | number; alias?: string }
): Promise<string | null> {
  if (input.sourcePk != null) {
    const mapped = await pool.query(
      `SELECT institution_id
         FROM canonical.institution_identity_map
        WHERE source_pk = $1::text
        LIMIT 1`,
      [String(input.sourcePk)]
    );
    if (mapped.rows[0]?.institution_id) return String(mapped.rows[0].institution_id);
  }

  if (input.slug) {
    const bySlug = await pool.query(
      `SELECT id
         FROM canonical.institutions
        WHERE slug = $1
        LIMIT 1`,
      [input.slug]
    );
    if (bySlug.rows[0]?.id) return String(bySlug.rows[0].id);
  }

  const normalized = normalizeName(input.alias || input.institutionName || '');
  if (!normalized) return null;
  const byName = await pool.query(
    `SELECT id
       FROM canonical.institutions
      WHERE normalized_name = $1
         OR EXISTS (
           SELECT 1
             FROM jsonb_array_elements_text(COALESCE(aliases, '[]'::jsonb)) a
            WHERE lower(regexp_replace(a, '[^a-z0-9]+', ' ', 'g')) = $1
         )
      ORDER BY id
      LIMIT 1`,
    [normalized]
  );
  return byName.rows[0]?.id ? String(byName.rows[0].id) : null;
}

