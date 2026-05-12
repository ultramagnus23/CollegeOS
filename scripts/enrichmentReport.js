#!/usr/bin/env node
/**
 * Prints enrichment completeness report.
 * Usage: node scripts/enrichmentReport.js
 */

import { createClient } from '@supabase/supabase-js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : `${s}${' '.repeat(width - s.length)}`;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { count: total, error: totalErr } = await supabase
    .from('colleges')
    .select('*', { count: 'exact', head: true });
  if (totalErr) throw totalErr;

  const { data: avgRows, error: avgErr } = await supabase
    .rpc('execute_sql_avg_quality', {
      sql_query: 'SELECT AVG(data_quality_score)::numeric AS avg_quality FROM colleges',
    })
    .single()
    .catch(async () => {
      // fallback when custom RPC is unavailable: pull lightweight rows and compute client-side
      const { data, error } = await supabase.from('colleges').select('data_quality_score');
      if (error) throw error;
      const vals = (data || []).map((r) => Number(r.data_quality_score || 0));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      return { data: { avg_quality: avg }, error: null };
    });
  if (avgErr) throw avgErr;
  const avgQuality = Number(avgRows?.avg_quality || 0);

  const { count: needsEnrichment, error: needsErr } = await supabase
    .from('colleges')
    .select('*', { count: 'exact', head: true })
    .eq('needs_enrichment', true);
  if (needsErr) throw needsErr;

  const { count: quality70Plus, error: q70Err } = await supabase
    .from('colleges')
    .select('*', { count: 'exact', head: true })
    .gte('data_quality_score', 70);
  if (q70Err) throw q70Err;

  const { data: sourceRows, error: sourceErr } = await supabase
    .from('colleges')
    .select('data_source');
  if (sourceErr) throw sourceErr;

  const bySource = (sourceRows || []).reduce((acc, row) => {
    const key = row.data_source || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log('\nCollege Enrichment Report');
  console.log('='.repeat(72));
  console.log(`${pad('Metric', 44)} | ${pad('Value', 24)}`);
  console.log('-'.repeat(72));
  console.log(`${pad('Total colleges', 44)} | ${pad(total ?? 0, 24)}`);
  console.log(`${pad('Average data_quality_score', 44)} | ${pad(avgQuality.toFixed(2), 24)}`);
  console.log(`${pad('needs_enrichment = true', 44)} | ${pad(needsEnrichment ?? 0, 24)}`);
  console.log(`${pad('quality_score >= 70', 44)} | ${pad(quality70Plus ?? 0, 24)}`);
  console.log('-'.repeat(72));
  console.log('Counts by data_source');
  Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => {
      console.log(`  - ${pad(source, 28)} ${count}`);
    });
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error('Failed to generate enrichment report:', err.message);
  process.exit(1);
});

