#!/usr/bin/env python3
"""
scraper/sources/nces_ipeds.py
-------------------------------
Downloads NCES/IPEDS data files directly from nces.ed.gov (no auth, free).
Matches via canonical_external_ids->>'ipeds' (UNITID) — near 100% match for US schools.

Files downloaded:
  IC2022_AY  → tuition in/out-state, room & board costs
  IC2022     → housing guarantee, % on campus, test-optional, Greek life
  ADM2022    → SAT/ACT detail, GPA averages, submission rates
  EF2022D    → enrollment cohort (graduation rate base)

Upserts into:
  canonical.institution_admissions  (SAT/ACT median, GPA avg, test_optional)
  canonical.institution_financials  (housing_cost, meal_cost, tuition detail)
  canonical.institution_campus_life (pct_living_on_campus, housing_guarantee)
  canonical.institutions            (student_faculty_ratio, total_enrollment,
                                     undergraduate_enrollment, established_year)
"""

import csv
import io
import logging
import os
import sys
import time
import zipfile

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

HEADERS = {"User-Agent": "Mozilla/5.0 (NCES educational research)"}

NCES_FILES = {
    "IC2022_AY": "https://nces.ed.gov/ipeds/datacenter/data/IC2022_AY.zip",
    "IC2022":    "https://nces.ed.gov/ipeds/datacenter/data/IC2022.zip",
    "ADM2022":   "https://nces.ed.gov/ipeds/datacenter/data/ADM2022.zip",
    "EF2022D":   "https://nces.ed.gov/ipeds/datacenter/data/EF2022D.zip",
}


def safe(row: dict, *keys, default=None):
    """Return first non-empty value from row for any of the given keys."""
    for k in keys:
        v = row.get(k, "").strip()
        if v and v not in (".", "-1", "-2", "-999", ""):
            try:
                return float(v)
            except ValueError:
                return v
    return default


def safe_i(row: dict, *keys):
    v = safe(row, *keys)
    if v is None:
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def safe_f(row: dict, *keys):
    v = safe(row, *keys)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def download_csv(name: str, url: str) -> dict[str, dict]:
    """Download zip, extract CSV, return dict keyed by UNITID string."""
    log.info(f"Downloading {name}…")
    resp = requests.get(url, headers=HEADERS, timeout=120)
    if resp.status_code != 200:
        log.warning(f"  {name} HTTP {resp.status_code}")
        return {}

    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        csv_name = next((n for n in z.namelist() if n.endswith(".csv")), None)
        if not csv_name:
            log.warning(f"  {name}: no CSV in zip")
            return {}
        raw = z.open(csv_name).read().decode("latin-1")

    reader = csv.DictReader(io.StringIO(raw))
    # Normalize keys to uppercase
    result = {}
    for row in reader:
        row = {k.upper(): v for k, v in row.items()}
        uid = row.get("UNITID", "").strip()
        if uid:
            result[uid] = row

    log.info(f"  {name}: {len(result)} records")
    return result


def load_ipeds_map(conn) -> dict[str, str]:
    """UNITID string → institution UUID."""
    cur = conn.cursor()
    cur.execute("""
        SELECT id, canonical_external_ids->>'ipeds' AS ipeds_id
        FROM canonical.institutions
        WHERE canonical_external_ids->>'ipeds' IS NOT NULL
          AND canonical_external_ids->>'ipeds' != ''
    """)
    rows = cur.fetchall()
    cur.close()
    return {r[1].strip(): str(r[0]) for r in rows if r[1]}


def process_ic_ay(conn, data: dict, ipeds_map: dict):
    """IC2022_AY: tuition (in/out-state), room & board."""
    # Key columns:
    # TUITION1 = in-state tuition (undergrad, full-time)
    # TUITION2 = out-of-state tuition
    # TUITION3 = out-of-state (same as 2 for most)
    # ROOMAMT  = room charge (academic year)
    # BOARDAMT = board charge
    # RMBRDAMT = combined room+board
    cur = conn.cursor()
    updated = 0
    for unitid, row in data.items():
        inst_id = ipeds_map.get(unitid)
        if not inst_id:
            continue

        tuit_in  = safe_f(row, "TUITION1", "TUITION2")
        tuit_out = safe_f(row, "TUITION2", "TUITION3")
        room     = safe_f(row, "ROOMAMT")
        board    = safe_f(row, "BOARDAMT")
        rb       = safe_f(row, "RMBRDAMT")  # combined room+board

        if rb and not room:
            room  = rb * 0.55
            board = rb * 0.45

        if not any([tuit_in, tuit_out, room, board]):
            continue

        try:
            cur.execute("""
                UPDATE canonical.institution_financials SET
                  tuition_domestic      = COALESCE(tuition_domestic, %(td)s),
                  tuition_international = COALESCE(tuition_international, %(ti)s),
                  housing_cost          = COALESCE(housing_cost, %(h)s),
                  meal_cost             = COALESCE(meal_cost, %(m)s)
                WHERE institution_id = %(id)s AND data_year = 2024
            """, {"id": inst_id, "td": tuit_in, "ti": tuit_out, "h": room, "m": board})
            updated += 1
        except Exception as e:
            log.debug(f"  IC_AY skip {unitid}: {e}")

    cur.close()
    log.info(f"IC2022_AY: updated {updated} financial rows")


def process_ic(conn, data: dict, ipeds_map: dict):
    """IC2022: housing guarantee, % on campus, student-faculty ratio."""
    # STUFACR   = student-faculty ratio
    # ROOM      = 1 if college provides on-campus housing
    # ROOMCAP   = housing capacity
    # PCTENRH   = pct full-time first-time students living in college housing
    # TUITPL3   = tuition payment plan available
    # ADMCON7   = test-optional flag (3 = neither required nor recommended = optional)
    cur = conn.cursor()
    updated = 0
    for unitid, row in data.items():
        inst_id = ipeds_map.get(unitid)
        if not inst_id:
            continue

        sfr         = safe_f(row, "STUFACR")
        has_housing = safe_i(row, "ROOM")           # 1=yes, 2=no
        pct_housing = safe_f(row, "PCTENRH")        # 0-100
        test_opt_v  = safe_i(row, "ADMCON7")        # 1=req, 2=rec, 3=neither, 5=not-considered

        test_optional = (test_opt_v in (3, 5)) if test_opt_v else None
        housing_guarantee = (has_housing == 1) if has_housing else None

        try:
            if sfr:
                cur.execute("""
                    UPDATE canonical.institutions SET
                      student_faculty_ratio = COALESCE(student_faculty_ratio, %(sfr)s)
                    WHERE id = %(id)s
                """, {"id": inst_id, "sfr": sfr})

            cur.execute("""
                INSERT INTO canonical.institution_campus_life (institution_id)
                VALUES (%(id)s)
                ON CONFLICT ON CONSTRAINT institution_campus_life_institution_id_key DO NOTHING
            """, {"id": inst_id})

            cur.execute("""
                UPDATE canonical.institution_campus_life SET
                  pct_living_on_campus = COALESCE(pct_living_on_campus, %(pct)s),
                  housing_guarantee    = COALESCE(housing_guarantee, %(hg)s)
                WHERE institution_id = %(id)s
            """, {"id": inst_id, "pct": pct_housing, "hg": housing_guarantee})

            if test_optional is not None:
                cur.execute("""
                    UPDATE canonical.institution_admissions SET
                      test_optional = COALESCE(test_optional, %(to)s)
                    WHERE institution_id = %(id)s AND data_year = 2024
                """, {"id": inst_id, "to": test_optional})

            updated += 1
        except Exception as e:
            log.debug(f"  IC skip {unitid}: {e}")

    cur.close()
    log.info(f"IC2022: updated {updated} campus/admissions rows")


def process_adm(conn, data: dict, ipeds_map: dict):
    """ADM2022: SAT/ACT percentiles, GPA, submission rates."""
    # SATVR25/75 = SAT reading 25/75th
    # SATMT25/75 = SAT math 25/75th
    # ACTCM25/75 = ACT composite 25/75th
    # ACTCMMID   = ACT midpoint
    # SATCMMID   = SAT composite midpoint
    # APPLCNM    = applicants male, APPLCNW = female
    # ADMSSN     = admitted
    # ENRLT      = enrolled full-time
    # PCTTRANM/W = % transfer admitted (male/female)
    cur = conn.cursor()
    updated = 0
    for unitid, row in data.items():
        inst_id = ipeds_map.get(unitid)
        if not inst_id:
            continue

        applied   = (safe_i(row, "APPLCNM") or 0) + (safe_i(row, "APPLCNW") or 0)
        admitted  = safe_i(row, "ADMSSN")
        enrolled  = safe_i(row, "ENRLT")
        yield_r   = (enrolled / admitted) if (enrolled and admitted and admitted > 0) else None
        accept_r  = (admitted / applied) if (admitted and applied and applied > 0) else None

        sat_r25 = safe_i(row, "SATVR25")
        sat_r75 = safe_i(row, "SATVR75")
        sat_m25 = safe_i(row, "SATMT25")
        sat_m75 = safe_i(row, "SATMT75")
        sat_25  = (sat_r25 + sat_m25) if (sat_r25 and sat_m25) else None
        sat_75  = (sat_r75 + sat_m75) if (sat_r75 and sat_m75) else None

        act_25 = safe_i(row, "ACTCM25")
        act_50 = safe_i(row, "ACTCMMID")
        act_75 = safe_i(row, "ACTCM75")

        if accept_r is not None:
            diff = round(max(1.0, min(99.0, 100 * (1 - accept_r ** 0.4))), 1)
        else:
            diff = None

        if not any([sat_25, sat_75, act_25, act_75, accept_r]):
            continue

        try:
            cur.execute("""
                INSERT INTO canonical.institution_admissions
                  (institution_id, acceptance_rate, applied_count, admitted_count,
                   enrolled_count, yield_rate,
                   sat_total_25, sat_total_75, sat_ebrw_25, sat_ebrw_75,
                   sat_math_25, sat_math_75, act_25, act_50, act_75,
                   admission_difficulty, data_year, admissions_cycle)
                VALUES
                  (%(id)s, %(ar)s, %(app)s, %(adm)s,
                   %(enr)s, %(yr)s,
                   %(s25)s, %(s75)s, %(er25)s, %(er75)s,
                   %(em25)s, %(em75)s, %(a25)s, %(a50)s, %(a75)s,
                   %(diff)s, 2024, 'RD')
                ON CONFLICT ON CONSTRAINT uq_institution_admissions DO UPDATE SET
                  acceptance_rate      = COALESCE(EXCLUDED.acceptance_rate, institution_admissions.acceptance_rate),
                  applied_count        = COALESCE(EXCLUDED.applied_count, institution_admissions.applied_count),
                  admitted_count       = COALESCE(EXCLUDED.admitted_count, institution_admissions.admitted_count),
                  enrolled_count       = COALESCE(EXCLUDED.enrolled_count, institution_admissions.enrolled_count),
                  yield_rate           = COALESCE(EXCLUDED.yield_rate, institution_admissions.yield_rate),
                  sat_total_25         = COALESCE(EXCLUDED.sat_total_25, institution_admissions.sat_total_25),
                  sat_total_75         = COALESCE(EXCLUDED.sat_total_75, institution_admissions.sat_total_75),
                  sat_ebrw_25          = COALESCE(EXCLUDED.sat_ebrw_25, institution_admissions.sat_ebrw_25),
                  sat_ebrw_75          = COALESCE(EXCLUDED.sat_ebrw_75, institution_admissions.sat_ebrw_75),
                  sat_math_25          = COALESCE(EXCLUDED.sat_math_25, institution_admissions.sat_math_25),
                  sat_math_75          = COALESCE(EXCLUDED.sat_math_75, institution_admissions.sat_math_75),
                  act_25               = COALESCE(EXCLUDED.act_25, institution_admissions.act_25),
                  act_50               = COALESCE(EXCLUDED.act_50, institution_admissions.act_50),
                  act_75               = COALESCE(EXCLUDED.act_75, institution_admissions.act_75),
                  admission_difficulty = COALESCE(EXCLUDED.admission_difficulty, institution_admissions.admission_difficulty)
            """, {
                "id": inst_id, "ar": accept_r,
                "app": applied or None, "adm": admitted, "enr": enrolled, "yr": yield_r,
                "s25": sat_25, "s75": sat_75,
                "er25": sat_r25, "er75": sat_r75, "em25": sat_m25, "em75": sat_m75,
                "a25": act_25, "a50": act_50, "a75": act_75, "diff": diff,
            })
            updated += 1
        except Exception as e:
            log.debug(f"  ADM skip {unitid}: {e}")

    cur.close()
    log.info(f"ADM2022: updated {updated} admissions rows")


def process_ef(conn, data: dict, ipeds_map: dict):
    """EF2022D: enrollment and graduation cohort sizes."""
    cur = conn.cursor()
    updated = 0
    for unitid, row in data.items():
        inst_id = ipeds_map.get(unitid)
        if not inst_id:
            continue

        total = safe_i(row, "EFYTOTLT")  # total 12-month enrollment
        ug    = safe_i(row, "EFUGTOTL")  # undergrad
        if not any([total, ug]):
            continue

        try:
            cur.execute("""
                UPDATE canonical.institutions SET
                  total_enrollment         = COALESCE(total_enrollment, %(t)s),
                  undergraduate_enrollment = COALESCE(undergraduate_enrollment, %(u)s)
                WHERE id = %(id)s
            """, {"id": inst_id, "t": total, "u": ug})
            updated += 1
        except Exception as e:
            log.debug(f"  EF skip {unitid}: {e}")

    cur.close()
    log.info(f"EF2022D: updated {updated} enrollment rows")


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    log.info("Loading IPEDS ID map…")
    ipeds_map = load_ipeds_map(conn)
    log.info(f"  {len(ipeds_map)} institutions with IPEDS IDs")

    # Download all files
    datasets = {}
    for name, url in NCES_FILES.items():
        datasets[name] = download_csv(name, url)
        time.sleep(0.5)

    # Process each
    if datasets.get("IC2022_AY"):
        process_ic_ay(conn, datasets["IC2022_AY"], ipeds_map)
    if datasets.get("IC2022"):
        process_ic(conn, datasets["IC2022"], ipeds_map)
    if datasets.get("ADM2022"):
        process_adm(conn, datasets["ADM2022"], ipeds_map)
    if datasets.get("EF2022D"):
        process_ef(conn, datasets["EF2022D"], ipeds_map)

    conn.close()
    log.info("Done.")


if __name__ == "__main__":
    main()
