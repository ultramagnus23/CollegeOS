from __future__ import annotations

import tempfile
import unittest
from unittest.mock import patch

from scraper.indian.pipelines.india_ingestion_pipeline import IndiaIngestionPipeline


class _FakeFetch:
    def __init__(self, success, html="", error=None, retryable=False, error_type=None):
        self.success = success
        self.html = html
        self.error = error
        self.retryable = retryable
        self.error_type = error_type


class PipelineRetryTests(unittest.TestCase):
    def test_retry_and_dead_letter(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = """
source_name: shiksha
allowed_domains: [shiksha.com]
selectors: {}
retry_strategy:
  max_attempts: 2
  circuit_breaker_threshold: 5
  circuit_breaker_cooldown_seconds: 1
rate_limit:
  timeout_seconds: 1
  request_delay_seconds: 0
confidence_weighting:
  default: 0.7
stale_detection:
  stale_days: 45
"""
            config_path = f"{tmp}/source.yaml"
            with open(config_path, "w", encoding="utf-8") as handle:
                handle.write(config)

            pipeline = IndiaIngestionPipeline(config_path, diagnostics_dir=tmp)
            calls = {"count": 0}

            def _fetch(_url):
                calls["count"] += 1
                if calls["count"] == 1:
                    return _FakeFetch(False, error="429", retryable=True, error_type="RateLimitError")
                return _FakeFetch(True, html="<html><h1>IIT Delhi</h1></html>")

            with patch.object(pipeline.adapter, "fetch", side_effect=_fetch):
                result = pipeline.run(
                    [{"institution_id": "1", "source_url": "https://shiksha.com/college/iit-delhi", "source_name": "shiksha"}],
                    mode="weekly",
                )

            self.assertEqual(result["summary"]["institutions_processed"], 1)
            self.assertEqual(calls["count"], 2)


if __name__ == "__main__":
    unittest.main()
