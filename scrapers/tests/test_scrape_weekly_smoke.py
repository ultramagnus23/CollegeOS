from __future__ import annotations

import json
import os
import tempfile
import unittest

from scrapers.adapters.base_adapter import FetchResult
from scrapers.run_deadline_refresh import DIAGNOSTIC_FILES, bootstrap_diagnostics, validate_schema
from scrapers.schedulers.runner import run_scrape_cycle


class _FakeAdapter:
    def __init__(self, responses):
        self._responses = responses

    def fetch(self, url: str) -> FetchResult:
        return self._responses[url]


class _FakeCursor:
    def __init__(self, rows_by_table):
        self.rows_by_table = rows_by_table
        self.current = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, query, params):
        schema, table = params
        self.current = [(c,) for c in self.rows_by_table.get(f"{schema}.{table}", set())]

    def fetchall(self):
        return self.current


class _FakeConn:
    def __init__(self, rows_by_table):
        self.rows_by_table = rows_by_table

    def cursor(self):
        return _FakeCursor(self.rows_by_table)


class ScrapeWeeklySmokeTests(unittest.TestCase):
    def test_diagnostics_folder_bootstrap(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous = os.environ.get("SCRAPER_DIAGNOSTICS_DIR")
            os.environ["SCRAPER_DIAGNOSTICS_DIR"] = tmp
            try:
                out_dir = bootstrap_diagnostics()
                for filename in DIAGNOSTIC_FILES:
                    self.assertTrue((out_dir / filename).exists())
            finally:
                if previous is None:
                    os.environ.pop("SCRAPER_DIAGNOSTICS_DIR", None)
                else:
                    os.environ["SCRAPER_DIAGNOSTICS_DIR"] = previous

    def test_graceful_partial_failure_and_retry_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = os.path.join(tmp, "checkpoint.json")
            adapter = _FakeAdapter(
                {
                    "https://ok.edu": FetchResult(
                        success=True,
                        url="https://ok.edu",
                        status_code=200,
                        html="Early Action January 15, 2027 requires essay and transcript",
                        retries_attempted=1,
                    ),
                    "https://fail.edu": FetchResult(
                        success=False,
                        url="https://fail.edu",
                        status_code=429,
                        html="",
                        error="rate limited",
                        error_type="RateLimitError",
                        retryable=True,
                        retries_attempted=2,
                    ),
                }
            )
            result = run_scrape_cycle(
                [
                    {"institution_id": "1", "source_url": "https://ok.edu"},
                    {"institution_id": "2", "source_url": "https://fail.edu"},
                ],
                adapter=adapter,
                batch_size=1,
                checkpoint_path=checkpoint,
            )
            self.assertEqual(result["summary"]["targets"], 2)
            self.assertEqual(result["summary"]["success"], 1)
            self.assertEqual(result["summary"]["failures"], 1)
            self.assertEqual(result["summary"]["retry_count"], 3)
            self.assertTrue(os.path.exists(checkpoint))

    def test_schema_drift_detection(self):
        fake_conn = _FakeConn(
            {
                "canonical.institution_deadlines": {"institution_id"},
                "canonical.institution_requirements": {
                    "institution_id",
                    "requirement_type",
                    "requirement_text",
                },
            }
        )
        module_status, schema_errors = validate_schema(fake_conn)
        self.assertFalse(module_status["deadlines"])
        self.assertTrue(module_status["requirements"])
        self.assertGreaterEqual(len(schema_errors), 1)

    def test_resumable_batch_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            checkpoint = os.path.join(tmp, "checkpoint.json")
            with open(checkpoint, "w", encoding="utf-8") as fh:
                json.dump({"next_index": 1}, fh)
            adapter = _FakeAdapter(
                {
                    "https://one.edu": FetchResult(success=True, url="https://one.edu", status_code=200, html=""),
                    "https://two.edu": FetchResult(success=True, url="https://two.edu", status_code=200, html="Regular Decision 2027-02-01"),
                }
            )
            result = run_scrape_cycle(
                [
                    {"institution_id": "1", "source_url": "https://one.edu"},
                    {"institution_id": "2", "source_url": "https://two.edu"},
                ],
                adapter=adapter,
                batch_size=1,
                checkpoint_path=checkpoint,
            )
            self.assertEqual(result["summary"]["resume_index"], 1)
            self.assertEqual(result["summary"]["success"], 1)


if __name__ == "__main__":
    unittest.main()
