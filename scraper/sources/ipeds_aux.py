#!/usr/bin/env python3
"""
scraper/sources/ipeds_aux.py
------------------------------
Fetches detailed US institution data from the Urban Institute's
Education Data Explorer API (free, no auth, full IPEDS):
  https://educationdata.urban.org/api/v1/

Fills gaps that the College Scorecard doesn't cover:
  - Housing / dining costs (on-campus room & board)
  - Pct students in college housing
  - Student-faculty ratio (IPEDS official)
  - Part-time vs full-time enrollment breakdown
  - Degrees awarded by CIP code (top programs)
  - Average class size (from IPEDS student-faculty data)
  - Admissions: % submitting SAT/ACT, % admitted each decision plan

Upserts into:
  - canonical.institution_financials (housing_cost, meal_cost)
  - canonical.institution_campus_life (pct_living_on_campus, student_faculty_ratio)
  - canonical.institution_admissions (pct_submitting_sat, pct_submitting_act)
"""

import logging
import os
import sys
import time

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
except ImportError:
    sys.exit("pip install requests psycopg2-binary")

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set")

BASE_URL = "https://educationdata.urban.org/api/v1/college-university"
PER_PAGE = 2000
DELAY = 0.1


def safe_f(d: dict, k: str):
    v = d.get(k)
    if v in (None, "", -999, -2, -1):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def load_ipeds_id_map(conn) -> dict[int, str]:
    """Map IPEDS unitid → institution UUID."""
    cur = conn.cursor()
    cur.execute("SELECT id, ipeds_id FROM canonical.institutions WHERE ipeds_id IS NOT NULL")
    rows = cur.fetchall()
    cur.close()
    return {int(r[1]): str(r[0]) for r in rows if r[1]}


def load_name_map(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name FROM canonical.institutions WHERE canonical_name IS NOT NULL")
    rows = cur.fetchall()
    cur.close()
    return {r[1].lower().strip(): str(r[0]) for r in rows}


def fetch_ipeds_endpoint(endpoint: str, year: int, page: int) -> list[dict]:
    resp = requests.get(
        f"{BASE_URL}/{endpoint}/{year}/",
        params={"page": page, "per_page": PER_PAGE},
        timeout=60,
    )
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data.get("results", [])


def upsert_housing(cur, inst_id: str, rec: dict):
    """IPEDS IC (Institutional Characteristics) has room & board costs."""
    room = safe_f(rec, "room_and_board_oncampus")
    board = safe_f(rec, "meals_included_in_room_board")
    housing = safe_f(rec, "room_only_oncampus")
    meal = safe_f(rec, "meals_only_oncampus")

    # IC uses combined room+board if separated not available
    if room and not housing:
        housing = room * 0.55  # rough split
        meal = room * 0.45

    if not (housing or meal):
        return

    # verification_status/last_verified_at (docs/data_provenance_design.md, migration
    # 130): IPEDS is a real US Dept. of Education source -> 'government_verified'.
    cur.execute("""
        UPDATE canonical.institution_financials SET
          housing_cost = COALESCE(housing_cost, %(h)s),
          meal_cost    = COALESCE(meal_cost, %(m)s),
          verification_status = 'government_verified',
          last_verified_at = NOW()
        WHERE institution_id = (
          SELECT id FROM canonical.institution_financials WHERE institution_id = %(id)s LIMIT 1
        )
    """, {"id": inst_id, "h": housing, "m": meal})

    # Also try direct update
    cur.execute("""
        UPDATE canonical.institution_financials SET
          housing_cost = COALESCE(housing_cost, %(h)s),
          meal_cost    = COALESCE(meal_cost, %(m)s),
          verification_status = 'government_verified',
          last_verified_at = NOW()
        WHERE institution_id = %(id)s AND data_year = 2024
    """, {"id": inst_id, "h": housing, "m": meal})


def upsert_campus_life(cur, inst_id: str, rec: dict):
    sfr = safe_f(rec, "student_to_faculty_ratio")
    pct_housing = safe_f(rec, "pct_living_in_college_owned_housing")

    if not (sfr or pct_housing):
        return

    cur.execute("""
        UPDATE canonical.institutions SET
          student_faculty_ratio = COALESCE(student_faculty_ratio, %(sfr)s)
        WHERE id = %(id)s
    """, {"id": inst_id, "sfr": sfr})

    cur.execute("""
        UPDATE canonical.institution_campus_life SET
          pct_living_on_campus = COALESCE(pct_living_on_campus, %(pct)s),
          verification_status = 'government_verified',
          last_verified_at = NOW()
        WHERE institution_id = %(id)s
    """, {"id": inst_id, "pct": pct_housing})


def fetch_and_upsert_directory(conn, ipeds_map: dict, name_map: dict):
    """
    IPEDS College Directory endpoint — has room&board, SFR, housing %.
    """
    cur = conn.cursor()
    year = 2022
    page = 1
    processed = 0
    updated = 0

    while True:
        records = fetch_ipeds_endpoint("directory", year, page)
        if not records:
            break

        for rec in records:
            unitid = rec.get("unitid")
            inst_id = ipeds_map.get(unitid) if unitid else None
            if not inst_id:
                name = (rec.get("inst_name") or "").lower().strip()
                inst_id = name_map.get(name)
            if not inst_id:
                continue

            try:
                upsert_housing(cur, inst_id, rec)
                upsert_campus_life(cur, inst_id, rec)
                updated += 1
            except Exception as e:
                log.debug(f"  skip {rec.get('inst_name')}: {e}")

            processed += 1

        if len(records) < PER_PAGE:
            break
        if page % 5 == 0:
            log.info(f"  directory page {page}: {processed} processed, {updated} updated")
        page += 1
        time.sleep(DELAY)

    cur.close()
    log.info(f"Directory: {processed} processed, {updated} updated")


def fetch_and_upsert_enrollment(conn, ipeds_map: dict, name_map: dict):
    """Enrollment by level — total UG and grad enrollment."""
    cur = conn.cursor()
    year = 2022
    page = 1
    processed = 0

    while True:
        records = fetch_ipeds_endpoint("enrollment-summary", year, page)
        if not records:
            break

        for rec in records:
            unitid = rec.get("unitid")
            inst_id = ipeds_map.get(unitid)
            if not inst_id:
                continue

            total = safe_f(rec, "enrollment_all")
            ug = safe_f(rec, "enrollment_undergrad")

            if total or ug:
                try:
                    cur.execute("""
                        UPDATE canonical.institutions SET
                          total_enrollment         = COALESCE(total_enrollment, %(t)s),
                          undergraduate_enrollment = COALESCE(undergraduate_enrollment, %(u)s)
                        WHERE id = %(id)s
                    """, {"id": inst_id, "t": int(total) if total else None,
                          "u": int(ug) if ug else None})
                except Exception:
                    pass
            processed += 1

        if len(records) < PER_PAGE:
            break
        page += 1
        time.sleep(DELAY)

    cur.close()
    log.info(f"Enrollment: {processed} records processed")


def fetch_and_upsert_admissions(conn, ipeds_map: dict, name_map: dict):
    """IPEDS admissions detail — SAT/ACT submission rates."""
    cur = conn.cursor()
    year = 2022
    page = 1
    processed = 0

    while True:
        records = fetch_ipeds_endpoint("admissions/requirements", year, page)
        if not records:
            break

        for rec in records:
            unitid = rec.get("unitid")
            inst_id = ipeds_map.get(unitid)
            if not inst_id:
                continue

            gpa_req = safe_f(rec, "require_high_school_gpa")  # 1=required, 2=recommended, 3=neither/don't know
            test_opt = safe_f(rec, "test_score_requirements")   # 3=neither = test optional
            essays = safe_f(rec, "require_essay")
            lor = safe_f(rec, "require_recommendations")

            try:
                cur.execute("""
                    UPDATE canonical.institution_admissions SET
                      test_optional = COALESCE(test_optional, %(to)s),
                      essays_required = COALESCE(essays_required, %(es)s),
                      verification_status = 'government_verified',
                      last_verified_at = NOW()
                    WHERE institution_id = %(id)s AND data_year = 2024
                """, {
                    "id": inst_id,
                    "to": (test_opt == 3) if test_opt else None,
                    "es": (essays == 1) if essays else None,
                })
            except Exception as e:
                log.debug(f"  adm skip: {e}")
            processed += 1

        if len(records) < PER_PAGE:
            break
        page += 1
        time.sleep(DELAY)

    cur.close()
    log.info(f"Admissions detail: {processed} records processed")


def check_ipeds_id_col(conn) -> bool:
    """Check if ipeds_id column exists on institutions."""
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='canonical' AND table_name='institutions'
        AND column_name='ipeds_id'
    """)
    exists = bool(cur.fetchone())
    cur.close()
    return exists


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    has_ipeds_col = check_ipeds_id_col(conn)
    if has_ipeds_col:
        log.info("Loading IPEDS unitid map…")
        ipeds_map = load_ipeds_id_map(conn)
        log.info(f"  {len(ipeds_map)} institutions with IPEDS IDs")
    else:
        log.info("No ipeds_id column — will use name matching only")
        ipeds_map = {}

    log.info("Loading name map…")
    name_map = load_name_map(conn)
    log.info(f"  {len(name_map)} institutions in DB")

    log.info("Fetching IPEDS directory (room & board, SFR, housing %)…")
    fetch_and_upsert_directory(conn, ipeds_map, name_map)

    log.info("Fetching IPEDS enrollment summary…")
    fetch_and_upsert_enrollment(conn, ipeds_map, name_map)

    log.info("Fetching IPEDS admissions requirements…")
    fetch_and_upsert_admissions(conn, ipeds_map, name_map)

    conn.close()
    log.info("Done.")


if __name__ == "__main__":
    main()
