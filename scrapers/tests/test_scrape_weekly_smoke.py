from __future__ import annotations

import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from scrapers.adapters.base_adapter import FetchResult
from scrapers.adapters.http_adapter import classify_http_status


def _ensure_test_stubs():
    if 'bs4' not in sys.modules:
        bs4_module = types.ModuleType('bs4')

        class _FakeSoup:
            def __init__(self, html, _parser):
                self._html = html or ''

            def get_text(self, _sep='\n'):
                return self._html

        bs4_module.BeautifulSoup = _FakeSoup
        sys.modules['bs4'] = bs4_module

    if 'psycopg2' not in sys.modules:
        psycopg2_module = types.ModuleType('psycopg2')
        psycopg2_module.connect = lambda *_args, **_kwargs: None
        psycopg2_module.OperationalError = Exception
        psycopg2_extras = types.ModuleType('psycopg2.extras')
        psycopg2_extras.execute_batch = lambda *_args, **_kwargs: None
        psycopg2_errors = types.ModuleType('psycopg2.errors')
        psycopg2_errors.InvalidAuthorizationSpecification = Exception
        psycopg2_errors.InvalidCatalogName = Exception
        psycopg2_errors.UndefinedColumn = Exception
        psycopg2_errors.UndefinedTable = Exception
        psycopg2_module.extras = psycopg2_extras
        psycopg2_module.errors = psycopg2_errors
        sys.modules['psycopg2'] = psycopg2_module
        sys.modules['psycopg2.extras'] = psycopg2_extras
        sys.modules['psycopg2.errors'] = psycopg2_errors


def _load_runner_module():
    _ensure_test_stubs()
    from scrapers.schedulers import runner

    return runner


def _load_refresh_module():
    _ensure_test_stubs()
    from scrapers import run_deadline_refresh

    return run_deadline_refresh


class _StubAdapter:
    def __init__(self, results):
        self._results = list(results)
        self._index = 0

    def fetch(self, _url: str) -> FetchResult:
        result = self._results[self._index]
        self._index += 1
        return result


class ScrapeWeeklySmokeTests(unittest.TestCase):
    def test_diagnostics_folder_creation_and_required_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir) / "scraper_diagnostics"
            _load_refresh_module().ensure_diagnostics_files(out_dir)
            required = {
                "run_summary.json",
                "scraper_metrics.json",
                "failed_colleges.json",
                "schema_errors.json",
            }
            self.assertTrue(required.issubset({p.name for p in out_dir.iterdir()}))

    def test_graceful_partial_failure_handling(self):
        runner = _load_runner_module()
        targets = [
            {"institution_id": "1", "source_url": "https://a.edu"},
            {"institution_id": "2", "source_url": "https://b.edu"},
        ]
        adapter = _StubAdapter(
            [
                FetchResult(success=True, url="https://a.edu", status_code=200, html="ok", retry_count=0),
                FetchResult(
                    success=False,
                    url="https://b.edu",
                    status_code=429,
                    html="",
                    error="http 429",
                    error_type="RateLimitError",
                    retryable=True,
                    retry_count=1,
                ),
            ]
        )

        checkpoints = []
        with patch.object(runner, "parse_deadlines", return_value=[{"deadline_type": "regular_decision", "deadline_date": "2026-01-01"}]), patch.object(
            runner,
            "parse_requirements",
            return_value=[{"requirement_type": "essay", "requirement_text": "Essay required"}],
        ):
            result = runner.run_scrape_cycle(targets, adapter=adapter, batch_size=1, checkpoint_callback=checkpoints.append)

        self.assertEqual(result["summary"]["institutions_processed"], 2)
        self.assertEqual(result["summary"]["success_count"], 1)
        self.assertEqual(result["summary"]["failure_count"], 1)
        self.assertEqual(result["summary"]["status"], "degraded")
        self.assertEqual(len(checkpoints), 2)

    def test_schema_drift_handling_disables_affected_modules(self):
        schema_errors = [
            {"table": "canonical.institution_deadlines", "missing_columns": ["deadline_date"]},
            {"table": "canonical.institution_financials", "missing_columns": ["last_verified"]},
        ]
        disabled = _load_refresh_module().derive_disabled_modules(schema_errors)
        self.assertIn("deadlines", disabled)
        self.assertIn("financials", disabled)
        self.assertNotIn("requirements", disabled)

    def test_retry_logic_classification(self):
        self.assertEqual(classify_http_status(429), ("RateLimitError", True))
        self.assertEqual(classify_http_status(503), ("NetworkError", True))
        self.assertEqual(classify_http_status(400), ("HttpError", False))

    def test_workflow_uses_node24_compatible_configuration(self):
        workflow = Path("/home/runner/work/CollegeOS/CollegeOS/.github/workflows/scrape-weekly.yml").read_text(encoding="utf-8")
        self.assertIn("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true", workflow)
        self.assertIn("actions/checkout@v5", workflow)
        self.assertIn("actions/setup-python@v6", workflow)
        self.assertIn("actions/upload-artifact@v5", workflow)
        self.assertIn("if: always()", workflow)

    def test_required_diagnostics_can_be_parsed(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            out_dir = Path(tmpdir) / "scraper_diagnostics"
            _load_refresh_module().ensure_diagnostics_files(out_dir)
            for filename in (
                "run_summary.json",
                "scraper_metrics.json",
                "failed_colleges.json",
                "schema_errors.json",
            ):
                payload = json.loads((out_dir / filename).read_text(encoding="utf-8"))
                self.assertIsNotNone(payload)


if __name__ == "__main__":
    unittest.main()
