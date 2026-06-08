from __future__ import annotations

import hashlib
import json
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Deque, Dict, List
from urllib.parse import urlparse

import yaml

from ..adapters.http_source_adapter import HttpSourceAdapter
from ..normalizers.indian_value_normalizer import IndianValueNormalizer
from ..parsers.config_institution_parser import ConfigInstitutionParser
from ..validators.indian_record_validator import IndianRecordValidator


@dataclass
class PipelineItem:
    institution_id: str
    source_url: str
    source_name: str


class CircuitBreaker:
    def __init__(self, threshold: int = 5, cooldown_seconds: int = 30):
        self.threshold = threshold
        self.cooldown_seconds = cooldown_seconds
        self.failures = 0
        self.open_until = 0.0

    def allow(self) -> bool:
        if time.time() < self.open_until:
            return False
        return True

    def mark_success(self):
        self.failures = 0
        self.open_until = 0.0

    def mark_failure(self):
        self.failures += 1
        if self.failures >= self.threshold:
            self.open_until = time.time() + self.cooldown_seconds


class IndiaIngestionPipeline:
    def __init__(self, source_config_path: str, diagnostics_dir: str = "scraper_diagnostics"):
        self.source_config = self._load_source_config(source_config_path)
        self.adapter = HttpSourceAdapter(
            timeout_seconds=int(self.source_config.get("rate_limit", {}).get("timeout_seconds", 25)),
            retries=int(self.source_config.get("retry_strategy", {}).get("max_attempts", 3)),
            min_delay_seconds=float(self.source_config.get("rate_limit", {}).get("request_delay_seconds", 0.25)),
        )
        self.parser = ConfigInstitutionParser()
        self.normalizer = IndianValueNormalizer()
        self.validator = IndianRecordValidator()
        self.circuit_breaker = CircuitBreaker(
            threshold=int(self.source_config.get("retry_strategy", {}).get("circuit_breaker_threshold", 5)),
            cooldown_seconds=int(self.source_config.get("retry_strategy", {}).get("circuit_breaker_cooldown_seconds", 30)),
        )
        self.diagnostics_dir = Path(diagnostics_dir)
        self.diagnostics_dir.mkdir(parents=True, exist_ok=True)
        self.processed_hashes = set()

    @staticmethod
    def _load_source_config(path: str) -> Dict:
        with open(path, "r", encoding="utf-8") as handle:
            return yaml.safe_load(handle)

    def _allowed_domain(self, url: str) -> bool:
        domain = urlparse(url).netloc.lower()
        allowed = [d.lower() for d in self.source_config.get("allowed_domains", [])]
        return any(domain == item or domain.endswith(f".{item}") for item in allowed)

    @staticmethod
    def _hash_payload(payload: Dict) -> str:
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _is_stale(last_seen_iso: str | None, stale_days: int) -> bool:
        if not last_seen_iso:
            return True
        try:
            delta = datetime.now(timezone.utc) - datetime.fromisoformat(last_seen_iso.replace("Z", "+00:00"))
        except ValueError:
            return True
        return delta.days >= stale_days

    def run(self, targets: List[Dict], mode: str = "weekly") -> Dict:
        queue: Deque[PipelineItem] = deque(
            PipelineItem(
                institution_id=str(row["institution_id"]),
                source_url=str(row["source_url"]),
                source_name=str(row.get("source_name", self.source_config.get("source_name", "shiksha"))),
            )
            for row in targets
            if row.get("source_url")
        )

        retry_counts: Dict[str, int] = {}
        parsed_rows: List[Dict] = []
        dead_letter: List[Dict] = []
        stale_rows: List[Dict] = []

        stale_days = int(self.source_config.get("stale_detection", {}).get("stale_days", 30))
        max_attempts = int(self.source_config.get("retry_strategy", {}).get("max_attempts", 3))

        while queue:
            item = queue.popleft()

            if not self.circuit_breaker.allow():
                dead_letter.append({"institution_id": item.institution_id, "source_url": item.source_url, "error": "circuit_open"})
                continue

            if not self._allowed_domain(item.source_url):
                dead_letter.append({"institution_id": item.institution_id, "source_url": item.source_url, "error": "domain_not_allowed"})
                continue

            fetch = self.adapter.fetch(item.source_url)
            if not fetch.success:
                self.circuit_breaker.mark_failure()
                current_retry = retry_counts.get(item.source_url, 0)
                if fetch.retryable and current_retry + 1 < max_attempts:
                    retry_counts[item.source_url] = current_retry + 1
                    queue.append(item)
                else:
                    dead_letter.append(
                        {
                            "institution_id": item.institution_id,
                            "source_url": item.source_url,
                            "error": fetch.error,
                            "error_type": fetch.error_type,
                        }
                    )
                continue

            self.circuit_breaker.mark_success()
            parsed = self.parser.parse(fetch.html, self.source_config)
            parsed["institution_id"] = item.institution_id
            parsed["source_url"] = item.source_url
            parsed["source_name"] = item.source_name
            parsed["source_confidence"] = float(self.source_config.get("confidence_weighting", {}).get("default", 0.7))
            parsed["parser_version"] = self.source_config.get("parser_version", "india_v1")
            parsed["extraction_timestamp"] = datetime.now(timezone.utc).isoformat()
            parsed.setdefault("compliance", {})
            parsed["compliance"]["contains_editorial"] = False
            parsed["compliance"]["contains_reviews"] = False

            normalized = self.normalizer.normalize(parsed)
            is_valid, errors = self.validator.validate(normalized)
            if not is_valid:
                dead_letter.append(
                    {
                        "institution_id": item.institution_id,
                        "source_url": item.source_url,
                        "error": "validation_failed",
                        "details": errors,
                    }
                )
                continue

            row_hash = self._hash_payload(normalized)
            if row_hash in self.processed_hashes:
                continue
            self.processed_hashes.add(row_hash)

            last_seen = normalized.get("raw_payload", {}).get("last_seen")
            if self._is_stale(last_seen, stale_days):
                stale_rows.append({"institution_id": item.institution_id, "source_url": item.source_url})

            parsed_rows.append(normalized)

        summary = {
            "mode": mode,
            "status": "degraded" if dead_letter else "success",
            "institutions_processed": len(parsed_rows),
            "dead_letter_count": len(dead_letter),
            "stale_count": len(stale_rows),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        (self.diagnostics_dir / "india_run_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        (self.diagnostics_dir / "india_dead_letter.json").write_text(json.dumps(dead_letter, indent=2), encoding="utf-8")
        (self.diagnostics_dir / "india_stale_records.json").write_text(json.dumps(stale_rows, indent=2), encoding="utf-8")

        return {
            "summary": summary,
            "records": parsed_rows,
            "dead_letter": dead_letter,
            "stale": stale_rows,
        }
