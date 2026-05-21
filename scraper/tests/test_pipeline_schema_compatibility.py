from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scraper import pipeline


class PipelineSchemaCompatibilityTests(unittest.TestCase):
    def test_diagnostics_generation_files_exist(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir) / 'scraper_diagnostics'
            pipeline.ensure_pipeline_diagnostics(out_dir)
            expected = {
                'run_summary.json',
                'scraper_metrics.json',
                'failed_colleges.json',
                'stale_colleges.json',
                'schema_errors.json',
            }
            self.assertTrue(expected.issubset({p.name for p in out_dir.iterdir()}))

    def test_college_upsert_plan_uses_only_existing_columns(self):
        with patch('scraper.pipeline._table_columns', return_value={'id', 'acceptance_rate', 'completion_rate', 'data_source'}):
            plan = pipeline._build_college_upsert_plan(conn=None)
        self.assertIn('acceptance_rate = COALESCE(%s, acceptance_rate)', plan.sql)
        self.assertIn('completion_rate = COALESCE(%s, completion_rate)', plan.sql)
        self.assertNotIn('median_sat_25', plan.sql)
        params = plan.params_builder(42, {'acceptance_rate': 0.5, 'completion_rate': 0.6, 'data_source': 'IPEDS'})
        self.assertEqual(params, (0.5, 0.6, 'IPEDS', 42))

    def test_admissions_upsert_plan_requires_keys(self):
        with patch('scraper.pipeline._table_columns', return_value={'acceptance_rate'}):
            with self.assertRaises(pipeline.SchemaError):
                pipeline._build_admissions_upsert_plan(conn=None)

    def test_admissions_upsert_plan_only_targets_available_columns(self):
        with patch(
            'scraper.pipeline._table_columns',
            return_value={'college_id', 'year', 'acceptance_rate', 'yield_rate', 'source'},
        ):
            plan = pipeline._build_admissions_upsert_plan(conn=None)
        self.assertIn('INSERT INTO college_admissions (college_id, year, acceptance_rate, yield_rate, source)', plan.sql)
        self.assertNotIn('act_25', plan.sql)


if __name__ == '__main__':
    unittest.main()
