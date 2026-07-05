#!/usr/bin/env python3
"""
scraper/sources/nirf_graduation_outcomes.py
----------------------------------------------
Indian graduate outcomes: real, government (Ministry of Education, National
Institutional Ranking Framework) data -- the actual per-institution "Data
Submitted by Institution" PDF that every NIRF-ranked institution's own ranking
profile links to. This is the institution's own placement/higher-studies
submission (self-reported to the Ministry, part of the official ranking
process), not a third-party estimate or a marketing brochure -- source is
nirfindia.org itself, a Government of India domain. No ToS/copyright issue:
these PDFs are published by NIRF specifically for public transparency of the
ranking process.

WHY THIS BEATS THE BROCHURE APPROACH: institution placement brochures have
zero standardization and often present numbers as un-OCR-able infographics
(see institutionPlacements.js). NIRF's per-institution PDF is a MANDATED,
STANDARDIZED template (same table layout for every institution, across
Overall/Engineering/Management/Pharmacy/Medical/Law categories) -- much
closer to the Common Data Set model that worked well for US deadlines.

SOURCE DISCOVERY: each NIRF category ranking page (e.g.
nirfindia.org/Rankings/2025/EngineeringRanking.html) lists every ranked
institution with a link to nirfindia.org/nirfpdfcdn/2025/pdf/{Category}/
{InstituteID}.pdf. This script scrapes those listing pages for institute IDs,
then fetches and parses each institution's PDF.

EXTRACTION: the "Placement & Higher Studies" table appears once per degree
program type (UG 4yr, UG 5yr, PG 1/2/3yr, PG-Integrated) with rows like:
  "2023-24 714 549 1750000(Seventeen Lakhs Fifty Thousand) 153"
  (graduating count, placed count, median salary INR, higher-studies count)
This regexes ALL such rows across the whole PDF, groups by academic year,
and aggregates (sum placed/graduating, median of salary figures) for the
MOST RECENT year found -- reasonably robust since the template is mandated,
but still per-PDF text extraction so some institutions' PDFs may not match
cleanly (skipped, never fabricated).

WHAT IT WRITES: canonical.institution_placements (highest table already
used by institutionPlacements.js) -- average_package_inr (median salary
across programs), placement_rate_pct. Additive only (ON CONFLICT DO NOTHING
via existing unique key institution_id+cycle_year).

USAGE
-----
    python scraper/sources/nirf_graduation_outcomes.py [--dry-run] [--categories Overall,Engineering]

Requires: requests, psycopg2-binary, python-dotenv (optional)
Requires DATABASE_URL in backend/.env or the environment.
"""

import argparse
import logging
import os
import re
import sys
import time
from pathlib import Path
from statistics import median

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

HERE = Path(__file__).parent
REPO_ROOT = HERE.parent.parent

try:
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / "backend" / ".env")
except ImportError:
    pass

try:
    import requests
    import psycopg2
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

try:
    import pypdf
except ImportError:
    sys.exit("pip install pypdf")

DB_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
HEADERS = {"User-Agent": "Mozilla/5.0 (CollegeOS educational research; +https://collegeos.app/bot)"}
YEAR = 2025

# Categories confirmed to resolve at nirfindia.org/Rankings/{YEAR}/{Category}Ranking.html
CATEGORIES = ["Overall", "Engineering", "Management", "Pharmacy", "Medical", "Law"]

ROW_RE = re.compile(r"(\d{4}-\d{2})\s+(\d+)\s+(\d+)\s+(\d+)\((?:[A-Za-z ]+)\)\s+(\d+)")


def normalize(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def list_institutions(category: str) -> list[tuple[str, str]]:
    url = f"https://www.nirfindia.org/Rankings/{YEAR}/{category}Ranking.html"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        log.warning(f"  {category} ranking page HTTP {resp.status_code}; skipping category")
        return []
    ids = re.findall(r"<td>(IR-[A-Z]-[A-Z]-\d+)</td>\s*<td>\s*([^<\n\r]+)", resp.text)
    return [(iid, name.strip()) for iid, name in ids]


def fetch_pdf_text(category: str, institute_id: str) -> str | None:
    url = f"https://www.nirfindia.org/nirfpdfcdn/{YEAR}/pdf/{category}/{institute_id}.pdf"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200 or len(resp.content) < 2000:
            return None
        reader = pypdf.PdfReader(__import__("io").BytesIO(resp.content))
        return " ".join((p.extract_text() or "") for p in reader.pages).replace("\n", " ")
    except Exception as e:
        log.debug(f"  fetch/parse failed for {institute_id}: {e}")
        return None


def extract_placement_stats(text: str) -> dict | None:
    rows = ROW_RE.findall(text)
    if not rows:
        return None
    by_year: dict[str, list[tuple[int, int, int]]] = {}
    for year, grad, placed, salary, _higher in rows:
        by_year.setdefault(year, []).append((int(grad), int(placed), int(salary)))
    latest_year = max(by_year.keys())
    entries = by_year[latest_year]
    total_grad = sum(g for g, p, s in entries)
    total_placed = sum(p for g, p, s in entries)
    salaries = [s for g, p, s in entries if s > 0]
    if total_grad <= 0:
        return None
    return {
        "cycle_year": latest_year,
        "placement_rate_pct": round(100.0 * total_placed / total_grad, 1),
        "median_package_inr": median(salaries) if salaries else None,
    }


def load_institution_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE country_code = 'IN'")
    return {normalize(name): str(inst_id) for inst_id, name in cur.fetchall()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--categories", default=",".join(CATEGORIES))
    parser.add_argument("--limit", type=int, default=0, help="cap institutions processed (0 = no cap)")
    args = parser.parse_args()

    if not DB_URL:
        sys.exit("DATABASE_URL not set")

    categories = args.categories.split(",")
    all_pairs: dict[str, tuple[str, str]] = {}  # institute_id -> (category, name)
    for cat in categories:
        pairs = list_institutions(cat)
        log.info(f"{cat}: {len(pairs)} institutions listed")
        for iid, name in pairs:
            all_pairs.setdefault(iid, (cat, name))
        time.sleep(0.3)

    log.info(f"Total distinct institutions across categories: {len(all_pairs)}")

    conn = psycopg2.connect(DB_URL)
    inst_map = load_institution_map(conn)
    log.info(f"  {len(inst_map):,} Indian institutions indexed by normalized name")

    items = list(all_pairs.items())
    if args.limit:
        items = items[: args.limit]

    to_write = []
    matched = 0
    for i, (iid, (cat, name)) in enumerate(items):
        key = normalize(name)
        if key not in inst_map:
            continue
        text = fetch_pdf_text(cat, iid)
        if not text:
            continue
        stats = extract_placement_stats(text)
        if not stats:
            continue
        matched += 1
        to_write.append((inst_map[key], name, stats))
        if (i + 1) % 20 == 0:
            log.info(f"  ... processed {i + 1}/{len(items)}, matched with stats: {matched}")
        time.sleep(0.2)

    log.info(f"Institutions with usable placement stats: {len(to_write)}")

    if args.dry_run:
        for inst_id, name, stats in to_write[:10]:
            log.info(f"  {name}: {stats}")
        log.info("[DRY RUN] no writes performed")
        conn.close()
        return

    cur = conn.cursor()
    written = 0
    for inst_id, name, stats in to_write:
        cur.execute(
            """
            INSERT INTO canonical.institution_placements
                (id, institution_id, cycle_year, average_package_inr, placement_rate_pct,
                 currency, source_url, source_type, confidence_score, raw_payload,
                 created_at, updated_at)
            VALUES (gen_random_uuid(), %(inst_id)s, %(cycle)s, %(salary)s, %(rate)s,
                    'INR', %(source_url)s, 'official', 0.9, %(raw)s::jsonb, now(), now())
            ON CONFLICT (institution_id, cycle_year) DO NOTHING
            """,
            {
                "inst_id": inst_id,
                "cycle": stats["cycle_year"],
                "salary": stats["median_package_inr"],
                "rate": stats["placement_rate_pct"],
                "source_url": "https://www.nirfindia.org/ (Government of India, Ministry of Education)",
                "raw": '{"institution": "%s", "source": "NIRF institution submission data"}' % name.replace('"', ""),
            },
        )
        if cur.rowcount > 0:
            written += 1
    conn.commit()
    log.info(f"Done. Inserted {written} new institution_placements rows.")
    conn.close()


if __name__ == "__main__":
    main()
