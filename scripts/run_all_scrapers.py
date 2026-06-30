#!/usr/bin/env python3
"""
scripts/run_all_scrapers.py
----------------------------
Runs all data enrichment scrapers in priority order.
Each scraper is independent and idempotent (safe to rerun).

Usage:
  DATABASE_URL=... COLLEGE_SCORECARD_API_KEY=... python scripts/run_all_scrapers.py

  Or run a specific scraper:
  python scripts/run_all_scrapers.py wikidata
  python scripts/run_all_scrapers.py qs_the
  python scripts/run_all_scrapers.py nirf
  python scripts/run_all_scrapers.py ipeds_aux
  python scripts/run_all_scrapers.py grad_cafe
"""

import subprocess
import sys
import os
import time
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
except ImportError:
    pass

SCRAPERS = [
    # (name, module_path, description)
    ("wikidata",  "scraper/sources/wikidata.py",       "Global metadata: lat/lng, enrollment, endowment, founded year"),
    ("qs_the",    "scraper/sources/qs_the_rankings.py", "QS + THE world rankings"),
    ("nirf",      "scraper/sources/nirf.py",            "India NIRF rankings"),
    ("ipeds_aux", "scraper/sources/ipeds_aux.py",       "US housing costs, SFR, admissions detail"),
    ("grad_cafe", "scraper/sources/grad_cafe.py",       "Masters GPA/GRE/acceptance data"),
]


def run_scraper(name: str, path: str, desc: str) -> bool:
    log.info(f"\n{'='*60}")
    log.info(f"  Running: {name} — {desc}")
    log.info(f"{'='*60}")
    start = time.time()
    env = os.environ.copy()
    result = subprocess.run(
        [sys.executable, path],
        env=env,
        capture_output=False,
    )
    elapsed = time.time() - start
    if result.returncode == 0:
        log.info(f"  ✓ {name} completed in {elapsed:.0f}s")
        return True
    else:
        log.error(f"  ✗ {name} failed (exit {result.returncode}) after {elapsed:.0f}s")
        return False


def main():
    target = sys.argv[1].lower() if len(sys.argv) > 1 else None

    results = {}
    for name, path, desc in SCRAPERS:
        if target and target not in (name, name.replace("_", "")):
            continue
        ok = run_scraper(name, path, desc)
        results[name] = ok
        if not target:
            time.sleep(2)

    log.info(f"\n{'='*60}")
    log.info("  Summary")
    log.info(f"{'='*60}")
    for name, ok in results.items():
        status = "✓" if ok else "✗"
        log.info(f"  {status} {name}")


if __name__ == "__main__":
    main()
