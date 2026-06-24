"""Phase 2 starter ingest — live-fetch the starter programs, classify pathways,
emit a dry-run JSON for review and a SQL file for the STAGING db only.

Run:  python -m scraper.masters.run_starter_ingest
Outputs (under tmp/, gitignored):
  tmp/scrape_dryrun.json   — rows for human review BEFORE anything touches prod
  tmp/scrape_inserts.sql   — INSERTs for the staging db (port 5433), never prod

This NEVER connects to a database itself — writing is a separate, explicit step
(psql -f against staging), so a scrape run can't accidentally mutate any DB.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

from scraper.masters.adapters.http_program_adapter import fetch_program_text
from scraper.masters.extractors.program_requirements_extractor import extract_requirements
from scraper.masters.normalizers.pathway_taxonomy import classify_pathways
from scraper.masters.starter_programs import STARTER_PROGRAMS

TMP = os.path.join(os.path.dirname(__file__), "..", "..", "tmp")
INTAKE_TERM, INTAKE_YEAR = "fall", 2027


def _sql(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (list, dict)):
        return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def _evidence(pathway, text):
    """A short, honest description: what was matched + a nearby excerpt."""
    matched = ", ".join(pathway.matched_phrases) if pathway.matched_phrases else "default (no alternate-pathway language found)"
    return f"Detected '{pathway.pathway_type}' from live page. Signals: {matched}."


def main():
    os.makedirs(TMP, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    records, program_sql, pathway_sql = [], [], []

    for ref in STARTER_PROGRAMS:
        fetched = fetch_program_text(ref.program_url)
        if not fetched.ok:
            records.append({"program": ref.program_name, "institution": ref.institution_name,
                            "url": ref.program_url, "fetch_ok": False, "error": fetched.error})
            print(f"  [FAIL] {ref.institution_name} - fetch failed: {fetched.error}")
            continue

        reqs = extract_requirements(fetched.text)
        pathways = classify_pathways(fetched.text)
        pid = str(uuid.uuid4())

        program = {
            "id": pid,
            "institution_name": ref.institution_name,
            "institution_country": ref.institution_country,
            "department": ref.department,
            "program_name": ref.program_name,
            "degree_type": ref.degree_type,
            "gre_requirement": reqs.gre_requirement or "unknown",
            "gmat_requirement": reqs.gmat_requirement or "unknown",
            "min_gpa": reqs.min_gpa,
            "is_stem_designated": reqs.is_stem_designated,
            "program_url": ref.program_url,
            "data_source": "official",
            "intake_term": INTAKE_TERM,
            "intake_year": INTAKE_YEAR,
        }
        pathway_rows = [{
            "id": str(uuid.uuid4()),
            "masters_program_id": pid,
            "pathway_type": p.pathway_type,
            "description": _evidence(p, fetched.text),
            "weighted_fields": p.weighted_fields,
            "confidence": round(p.confidence, 2),
            "source_url": ref.program_url,
        } for p in pathways]

        records.append({
            "program": program, "pathways": pathway_rows,
            "fetch_ok": True, "bytes": fetched.bytes_len,
            "detected_pathways": [p.pathway_type for p in pathways],
            "gre_requirement": program["gre_requirement"],
        })

        program_sql.append(
            "INSERT INTO canonical.masters_programs "
            "(id, canonical_institution_id, institution_name, institution_country, department, "
            "program_name, degree_type, gre_requirement, gmat_requirement, min_gpa, is_stem_designated, "
            "program_url, data_source, last_scraped_at, intake_term, intake_year) VALUES ("
            f"{_sql(pid)}, NULL, {_sql(program['institution_name'])}, {_sql(program['institution_country'])}, "
            f"{_sql(program['department'])}, {_sql(program['program_name'])}, {_sql(program['degree_type'])}, "
            f"{_sql(program['gre_requirement'])}, {_sql(program['gmat_requirement'])}, {_sql(program['min_gpa'])}, "
            f"{_sql(program['is_stem_designated'])}, {_sql(program['program_url'])}, {_sql(program['data_source'])}, "
            f"{_sql(now)}, {_sql(INTAKE_TERM)}, {INTAKE_YEAR});"
        )
        for pw in pathway_rows:
            pathway_sql.append(
                "INSERT INTO canonical.masters_program_pathways "
                "(id, masters_program_id, pathway_type, description, weighted_fields, confidence, source_url, scraped_at) VALUES ("
                f"{_sql(pw['id'])}, {_sql(pw['masters_program_id'])}, {_sql(pw['pathway_type'])}, "
                f"{_sql(pw['description'])}, {_sql(pw['weighted_fields'])}, {pw['confidence']}, "
                f"{_sql(pw['source_url'])}, {_sql(now)});"
            )
        print(f"  [OK] {ref.institution_name:42s} GRE={program['gre_requirement']:12s} "
              f"pathways={', '.join(p.pathway_type for p in pathways)}")

    with open(os.path.join(TMP, "scrape_dryrun.json"), "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    with open(os.path.join(TMP, "scrape_inserts.sql"), "w", encoding="utf-8") as f:
        f.write("-- STAGING ONLY (port 5433). Generated by run_starter_ingest.py.\nBEGIN;\n")
        f.write("\n".join(program_sql) + "\n" + "\n".join(pathway_sql) + "\nCOMMIT;\n")

    ok = sum(1 for r in records if r.get("fetch_ok"))
    print(f"\n{ok}/{len(STARTER_PROGRAMS)} fetched. Wrote tmp/scrape_dryrun.json and tmp/scrape_inserts.sql")


if __name__ == "__main__":
    main()
