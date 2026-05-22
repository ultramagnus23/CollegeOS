from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys
import types


def _ensure_psycopg2_stub():
    if "psycopg2" in sys.modules:
        return
    psycopg2_module = types.ModuleType("psycopg2")
    psycopg2_module.connect = lambda *_args, **_kwargs: None
    psycopg2_module.extensions = types.SimpleNamespace(connection=object)
    psycopg2_extras = types.ModuleType("psycopg2.extras")
    psycopg2_module.extras = psycopg2_extras
    sys.modules["psycopg2"] = psycopg2_module
    sys.modules["psycopg2.extras"] = psycopg2_extras


_ensure_psycopg2_stub()

if "dotenv" not in sys.modules:
    dotenv_module = types.ModuleType("dotenv")
    dotenv_module.load_dotenv = lambda *_args, **_kwargs: None
    sys.modules["dotenv"] = dotenv_module

if "tenacity" not in sys.modules:
    tenacity_module = types.ModuleType("tenacity")

    def _identity_decorator(*_args, **_kwargs):
        def _wrap(func):
            return func
        return _wrap

    tenacity_module.retry = _identity_decorator
    tenacity_module.stop_after_attempt = lambda *_args, **_kwargs: None
    tenacity_module.wait_exponential = lambda *_args, **_kwargs: None
    sys.modules["tenacity"] = tenacity_module

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
