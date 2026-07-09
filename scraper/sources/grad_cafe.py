#!/usr/bin/env python3
"""
scraper/sources/grad_cafe.py
------------------------------
Scrapes Grad Cafe (thegradcafe.com) admission results to extract:
  - Program-level acceptance rates
  - Average GPA, GRE Q/V/AW of admitted students
  - Average work experience years
  - Cohort size estimates

Uses the site's own server-rendered survey page (no auth required). The old
`/api/v1/results` REST endpoint was retired when the site was rebuilt on
Laravel + Inertia.js (now returns 404). Inertia server-renders the full page
props -- including the actual results array -- as JSON in the root div's
`data-page` attribute, so the real data is still readable without executing
any client-side JS; this scraper parses that JSON instead of the dead API.
Matches programs against canonical.masters_programs by university + program name.

Updates: canonical.masters_programs (acceptance_rate, avg_gpa, avg_gre_quant,
         avg_gre_verbal, avg_gre_awa, avg_work_exp_years, cohort_size)
"""

import json
import logging
import os
import re
import sys
import time
from collections import defaultdict
from statistics import median, mean

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
except ImportError:
    pass

try:
    import requests
    import psycopg2
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("pip install requests psycopg2-binary beautifulsoup4")

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.thegradcafe.com/",
}

GRADCAFE_SURVEY_URL = "https://www.thegradcafe.com/survey"
GRADCAFE_PAGE_SIZE = 20  # the site ignores the legacy `pp` param; fixed at 20/page now

# Top programs to fetch data for (matching institution + program keyword)
TARGET_PROGRAMS = [
    "computer science",
    "electrical engineering",
    "mechanical engineering",
    "data science",
    "machine learning",
    "artificial intelligence",
    "business administration",
    "finance",
    "economics",
    "mathematics",
    "statistics",
    "physics",
    "chemistry",
    "biology",
    "biomedical engineering",
    "civil engineering",
    "chemical engineering",
    "information systems",
    "public policy",
    "psychology",
    "neuroscience",
    "materials science",
    "aerospace engineering",
    "environmental science",
    "public health",
    "law",
    "medicine",
]


def load_programs(conn) -> list[dict]:
    cur = conn.cursor()
    cur.execute("""
        SELECT mp.id, mp.program_name, mp.degree_type,
               COALESCE(i.canonical_name, mp.institution_name) AS university
        FROM canonical.masters_programs mp
        LEFT JOIN canonical.institutions i ON i.id = mp.canonical_institution_id
        WHERE mp.avg_gpa IS NULL OR mp.avg_gre_quant IS NULL
        ORDER BY i.canonical_name, mp.program_name
    """)
    rows = cur.fetchall()
    cur.close()
    return [
        {"id": str(r[0]), "program": r[1], "degree": r[2], "university": r[3]}
        for r in rows
    ]


def normalize_program(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r'\b(ms|msc|m\.s\.|master of science in|master of|m\.eng\.?|meng)\b', '', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()


def fetch_gradcafe_results(query: str, program: str = "", page: int = 1) -> list[dict]:
    """Fetch one page of results from the live GradCafe survey page (real,
    current data -- see module docstring for why this replaced the API call).
    Normalizes field names to the schema the rest of this file already
    expects (institution/school, gpa, gre_q, gre_v, gre_aw, decision)."""
    try:
        resp = requests.get(
            GRADCAFE_SURVEY_URL,
            params={"q": query, "t": "m", "page": page},
            headers=HEADERS,
            timeout=20,
        )
        if resp.status_code != 200:
            return []
        soup = BeautifulSoup(resp.text, "html.parser")
        div = soup.find(attrs={"data-page": True})
        if not div:
            return []
        data = json.loads(div["data-page"])
        rows = data.get("props", {}).get("results", {}).get("data", [])
        out = []
        for r in rows:
            out.append({
                "school": r.get("school"),
                "program": r.get("program"),
                "decision": r.get("decision"),
                "gpa": r.get("ugpa"),
                "gre_q": r.get("greq"),
                "gre_v": r.get("grev"),
                "gre_aw": r.get("grew"),
            })
        return out
    except Exception as e:
        log.debug(f"  gradcafe fetch error: {e}")
        return []


def extract_stats(results: list[dict]) -> dict:
    """Aggregate GPA, GRE stats from a list of admission results."""
    admitted = [r for r in results if r.get("decision") in ("Accepted", "accepted", "A")]
    rejected = [r for r in results if r.get("decision") in ("Rejected", "rejected", "R")]
    total = len(admitted) + len(rejected)

    if total < 5:
        return {}

    accept_rate = len(admitted) / total if total > 0 else None

    gpas = [float(r["gpa"]) for r in admitted if r.get("gpa") and _is_valid_gpa(r["gpa"])]
    gre_q = [int(r["gre_q"]) for r in admitted if r.get("gre_q") and _is_valid_gre(r["gre_q"])]
    gre_v = [int(r["gre_v"]) for r in admitted if r.get("gre_v") and _is_valid_gre(r["gre_v"])]
    gre_aw = [float(r["gre_aw"]) for r in admitted if r.get("gre_aw") and _is_valid_aw(r["gre_aw"])]

    return {
        "acceptance_rate": round(accept_rate, 4) if accept_rate else None,
        "cohort_size": len(admitted),
        "total_applicants": total,
        "avg_gpa": round(mean(gpas), 2) if len(gpas) >= 3 else None,
        "avg_gre_quant": int(mean(gre_q)) if len(gre_q) >= 3 else None,
        "avg_gre_verbal": int(mean(gre_v)) if len(gre_v) >= 3 else None,
        "avg_gre_awa": round(mean(gre_aw), 1) if len(gre_aw) >= 3 else None,
    }


def _is_valid_gpa(v) -> bool:
    try:
        f = float(v)
        return 2.0 <= f <= 4.0
    except (ValueError, TypeError):
        return False


def _is_valid_gre(v) -> bool:
    try:
        i = int(float(v))
        return 130 <= i <= 170
    except (ValueError, TypeError):
        return False


def _is_valid_aw(v) -> bool:
    try:
        f = float(v)
        return 0.0 <= f <= 6.0
    except (ValueError, TypeError):
        return False


def match_program(program: dict, results_by_univ: dict) -> list[dict]:
    """Find Grad Cafe results matching this program's university."""
    univ = program["university"].lower()
    prog = normalize_program(program["program"])

    # Try common abbreviations
    keys = [univ]
    for word in ["university", "college", "institute"]:
        if word in univ:
            short = univ.replace(f" {word}", "").replace(f"{word} of ", "").strip()
            keys.append(short)

    for key in keys:
        if key in results_by_univ:
            # Filter to matching program
            matches = [
                r for r in results_by_univ[key]
                if prog[:15] in normalize_program(r.get("program", ""))
                or normalize_program(r.get("program", ""))[:15] in prog
            ]
            if matches:
                return matches
    return []


def upsert_program_stats(cur, prog_id: str, stats: dict):
    if not stats:
        return
    cur.execute("""
        UPDATE canonical.masters_programs SET
          acceptance_rate    = COALESCE(acceptance_rate, %(ar)s),
          cohort_size        = COALESCE(cohort_size, %(cs)s),
          avg_gpa            = COALESCE(avg_gpa, %(gpa)s),
          avg_gre_quant      = COALESCE(avg_gre_quant, %(greq)s),
          avg_gre_verbal     = COALESCE(avg_gre_verbal, %(grev)s),
          avg_gre_awa        = COALESCE(avg_gre_awa, %(grewa)s),
          updated_at         = NOW()
        WHERE id = %(id)s
    """, {
        "id": prog_id,
        "ar": stats.get("acceptance_rate"),
        "cs": stats.get("cohort_size"),
        "gpa": stats.get("avg_gpa"),
        "greq": stats.get("avg_gre_quant"),
        "grev": stats.get("avg_gre_verbal"),
        "grewa": stats.get("avg_gre_awa"),
    })


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    log.info("Loading masters programs needing enrichment…")
    programs = load_programs(conn)
    log.info(f"  {len(programs)} programs to enrich")

    cur = conn.cursor()
    updated = 0
    # Committed to the DB after EACH keyword (not batched to the end) so a
    # slow/stalled keyword never loses already-fetched progress from earlier
    # ones -- rerunning is also cheap since already-updated programs are
    # excluded by load_programs' WHERE clause.
    already_updated_ids: set[str] = set()

    for keyword in TARGET_PROGRAMS:
        log.info(f"Fetching Grad Cafe: {keyword}…")
        all_results = []

        for page in range(1, 6):  # max 5 pages * 20/page = 100 results (enough for stats)
            batch = fetch_gradcafe_results(keyword, "", page)
            if not batch:
                break
            all_results.extend(batch)
            if len(batch) < GRADCAFE_PAGE_SIZE:
                break
            time.sleep(0.3)

        by_univ: dict[str, list] = defaultdict(list)
        for r in all_results:
            univ = (r.get("institution") or r.get("school") or "").lower().strip()
            if univ:
                by_univ[univ].append(r)

        log.info(f"  {len(all_results)} results across {len(by_univ)} schools")

        keyword_updated = 0
        for prog in programs:
            if prog["id"] in already_updated_ids:
                continue
            prog_name = normalize_program(prog["program"])
            if not (keyword[:10] in prog_name or prog_name[:10] in keyword):
                continue
            matched_results = match_program(prog, by_univ)
            if not matched_results:
                continue
            stats = extract_stats(matched_results)
            if not stats:
                continue
            try:
                upsert_program_stats(cur, prog["id"], stats)
                already_updated_ids.add(prog["id"])
                updated += 1
                keyword_updated += 1
            except Exception as e:
                log.warning(f"  skip {prog['program']} @ {prog['university']}: {e}")
        log.info(f"  updated {keyword_updated} program(s) so far (running total {updated})")
        time.sleep(0.5)

    cur.close()
    conn.close()
    log.info(f"Done. Updated {updated}/{len(programs)} programs with Grad Cafe data.")


if __name__ == "__main__":
    main()
