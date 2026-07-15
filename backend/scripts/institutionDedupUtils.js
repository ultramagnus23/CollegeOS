require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const cmd = process.argv[2];
  const client = await pool.connect();
  try {
    if (cmd === 'summary') {
      const r = await client.query(`
        select country_code, count(*) dup_groups, sum(cnt) dup_rows
        from (
          select country_code, canonical_name, count(*) cnt
          from canonical.institutions
          where deprecated_at is null
          group by 1,2 having count(*)>1
        ) x group by 1 order by 3 desc`);
      console.log(JSON.stringify(r.rows, null, 2));
    } else if (cmd === 'archives') {
      const r = await client.query(`select table_name from information_schema.tables where table_schema='canonical' and table_name like '%_merge_archive' order by 1`);
      console.log(JSON.stringify(r.rows, null, 2));
    } else if (cmd === 'fk-tables') {
      const r = await client.query(`
        select tc.table_name, kcu.column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
        join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
        where tc.constraint_type='FOREIGN KEY' and tc.table_schema='canonical' and ccu.table_name='institutions'
        order by 1,2`);
      console.log(JSON.stringify(r.rows, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
