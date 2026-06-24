"""Phase 2 validated ingest — config-driven, university-agnostic, data-quality gated.

For every target in targets.json: live-fetch -> extract -> classify pathways ->
VALIDATE (data-quality layer) -> dedup. Emits, under tmp/ (gitignored):
  tmp/scrape_dryrun.json   — accepted rows for human review BEFORE prod
  tmp/scrape_inserts.sql   — INSERTs for STAGING (programs + accepted pathways + scrape_log)
  tmp/scrape_review.json   — flagged/rejected records (never silently ingested)
and prints data-quality metrics.

Run:  python -m scraper.masters.run_starter_ingest
This NEVER connects to a DB; writing is a separate explicit psql step on staging.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone

from scraper.masters.adapters.http_program_adapter import fetch_program_text
from scraper.masters.extractors.program_requirements_extractor import extract_requirements
from scraper.masters.normalizers.pathway_taxonomy import classify_pathways
from scraper.masters.starter_programs import load_targets
from scraper.masters.validators.program_validator import validate_program, dedupe_batch

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


def _log_sql(url, inst, prog, status, conf, issues, missing, http_bytes, now):
    return (
        "INSERT INTO canonical.masters_scrape_log "
        "(program_url, institution_name, program_name, status, confidence, issues, missing_fields, http_bytes, scraped_at) VALUES ("
        f"{_sql(url)}, {_sql(inst)}, {_sql(prog)}, {_sql(status)}, {_sql(conf)}, "
        f"{_sql(issues)}, {_sql(missing)}, {_sql(http_bytes)}, {_sql(now)});"
    )


def main():
    os.makedirs(TMP, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    accepted_records, review_records = [], []
    program_sql, pathway_sql, log_sql = [], [], []
    metrics = {"targets": 0, "fetched": 0, "fetch_failed": 0, "accepted": 0,
               "rejected": 0, "flagged_pathways": 0, "missing_gre": 0}

    for ref, meta in load_targets():
        metrics["targets"] += 1
        fetched = fetch_program_text(ref.program_url)
        if not fetched.ok:
            metrics["fetch_failed"] += 1
            log_sql.append(_log_sql(ref.program_url, ref.institution_name, ref.program_name,
                                    "fetch_failed", None, [fetched.error], [], 0, now))
            review_records.append({"institution": ref.institution_name, "program": ref.program_name,
                                   "url": ref.program_url, "status": "fetch_failed", "error": fetched.error})
            print(f"  [FETCH-FAIL] {ref.institution_name} - {fetched.error}")
            continue

        metrics["fetched"] += 1
        reqs = extract_requirements(fetched.text)
        pathways = classify_pathways(fetched.text)
        pid = str(uuid.uuid4())
        program = {
            "id": pid, "institution_name": ref.institution_name,
            "institution_country": ref.institution_country, "department": ref.department,
            "program_name": ref.program_name, "degree_type": ref.degree_type,
            "gre_requirement": reqs.gre_requirement or "unknown",
            "gmat_requirement": reqs.gmat_requirement or "unknown",
            "min_gpa": reqs.min_gpa, "is_stem_designated": meta.get("stem"),
            "program_url": ref.program_url, "data_source": "official",
            "intake_term": INTAKE_TERM, "intake_year": INTAKE_YEAR,
        }
        pathway_rows = [{
            "id": str(uuid.uuid4()), "masters_program_id": pid, "pathway_type": p.pathway_type,
            "description": f"Detected '{p.pathway_type}'. Signals: " +
                           (", ".join(p.matched_phrases) if p.matched_phrases else "default"),
            "weighted_fields": p.weighted_fields, "confidence": round(p.confidence, 2),
            "source_url": ref.program_url,
        } for p in pathways]

        vr = validate_program(program, pathway_rows)
        program["data_quality_score"] = vr.confidence
        if program["gre_requirement"] == "unknown":
            metrics["missing_gre"] += 1
        metrics["flagged_pathways"] += len(vr.flagged_pathways)

        record = {"program": program, "accepted_pathways": vr.accepted_pathways,
                  "flagged_pathways": vr.flagged_pathways, "confidence": vr.confidence,
                  "issues": vr.issues, "missing_fields": vr.missing_fields,
                  "expected_model": meta.get("expected_model"),
                  "detected_pathways": [p["pathway_type"] for p in vr.accepted_pathways]}

        if not vr.accepted:
            metrics["rejected"] += 1
            review_records.append({**record, "status": "rejected"})
            log_sql.append(_log_sql(ref.program_url, ref.institution_name, ref.program_name,
                                    "rejected", vr.confidence, vr.issues, vr.missing_fields, fetched.bytes_len, now))
            print(f"  [REJECT] {ref.institution_name:38s} conf={vr.confidence} issues={vr.issues[:2]}")
            continue

        metrics["accepted"] += 1
        accepted_records.append(record)
        if vr.flagged_pathways:
            review_records.append({"institution": ref.institution_name, "program": ref.program_name,
                                   "status": "flagged_pathways", "flagged": vr.flagged_pathways})
        program_sql.append(
            "INSERT INTO canonical.masters_programs "
            "(id, canonical_institution_id, institution_name, institution_country, department, "
            "program_name, degree_type, gre_requirement, gmat_requirement, min_gpa, is_stem_designated, "
            "program_url, data_source, data_quality_score, last_scraped_at, intake_term, intake_year) VALUES ("
            f"{_sql(pid)}, NULL, {_sql(program['institution_name'])}, {_sql(program['institution_country'])}, "
            f"{_sql(program['department'])}, {_sql(program['program_name'])}, {_sql(program['degree_type'])}, "
            f"{_sql(program['gre_requirement'])}, {_sql(program['gmat_requirement'])}, {_sql(program['min_gpa'])}, "
            f"{_sql(program['is_stem_designated'])}, {_sql(program['program_url'])}, {_sql(program['data_source'])}, "
            f"{_sql(program['data_quality_score'])}, {_sql(now)}, {_sql(INTAKE_TERM)}, {INTAKE_YEAR});"
        )
        for pw in vr.accepted_pathways:
            pathway_sql.append(
                "INSERT INTO canonical.masters_program_pathways "
                "(id, masters_program_id, pathway_type, description, weighted_fields, confidence, source_url, scraped_at) VALUES ("
                f"{_sql(pw['id'])}, {_sql(pw['masters_program_id'])}, {_sql(pw['pathway_type'])}, "
                f"{_sql(pw['description'])}, {_sql(pw['weighted_fields'])}, {pw['confidence']}, "
                f"{_sql(pw['source_url'])}, {_sql(now)});"
            )
        log_sql.append(_log_sql(ref.program_url, ref.institution_name, ref.program_name,
                                "accepted", vr.confidence, vr.issues, vr.missing_fields, fetched.bytes_len, now))
        print(f"  [ACCEPT] {ref.institution_name:38s} conf={vr.confidence} gre={program['gre_requirement']:8s} "
              f"pathways={record['detected_pathways']}")

    dups = dedupe_batch(accepted_records)
    metrics["duplicate_keys"] = len(dups)

    with open(os.path.join(TMP, "scrape_dryrun.json"), "w", encoding="utf-8") as f:
        json.dump(accepted_records, f, indent=2)
    with open(os.path.join(TMP, "scrape_review.json"), "w", encoding="utf-8") as f:
        json.dump(review_records, f, indent=2)
    with open(os.path.join(TMP, "scrape_inserts.sql"), "w", encoding="utf-8") as f:
        f.write("-- STAGING ONLY. Generated by run_starter_ingest.py.\nBEGIN;\n")
        f.write("\n".join(log_sql) + "\n" + "\n".join(program_sql) + "\n" + "\n".join(pathway_sql) + "\nCOMMIT;\n")

    print("\n=== DATA QUALITY METRICS ===")
    print(json.dumps(metrics, indent=2))
    print("Wrote tmp/scrape_dryrun.json (accepted), tmp/scrape_review.json (flagged/rejected), tmp/scrape_inserts.sql")


if __name__ == "__main__":
    main()
