"""Phase 2 validated ingest — config-driven, university-agnostic, data-quality gated.

For every target in targets.json: live-fetch -> extract (requirements + deadline)
-> classify pathways -> VALIDATE (data-quality layer) -> dedup -> WRITE.

Gate 1/2 of the masters Phase 1 plan (memory masters_phase1_scope_2026-08-10):
this used to only emit tmp/scrape_inserts.sql for manual review — nobody ever
applied one. It now writes directly via scraper/masters/db.py, using the same
per-field-provenance / never-downgrade-confidence pattern already proven on
the UG deadline pipeline (scraper/db.py). Pass --dry-run to keep the old
emit-to-tmp/-only behavior for local debugging without touching the DB.

Run:  python -m scraper.masters.run_starter_ingest [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

from scraper.masters import db
from scraper.masters.adapters.http_program_adapter import fetch_program_text
from scraper.masters.extractors.deadline_extractor import extract_deadline
from scraper.masters.extractors.program_requirements_extractor import extract_requirements
from scraper.masters.normalizers.pathway_taxonomy import classify_pathways
from scraper.masters.starter_programs import load_targets
from scraper.masters.validators.program_validator import validate_program, dedupe_batch

TMP = os.path.join(os.path.dirname(__file__), "..", "..", "tmp")
INTAKE_TERM, INTAKE_YEAR = "fall", 2027
SCRAPER_NAME = "masters-starter-ingest"


async def run(dry_run: bool = False) -> dict:
    os.makedirs(TMP, exist_ok=True)
    started_at = datetime.now(timezone.utc)
    accepted_records, review_records = [], []
    metrics = {"targets": 0, "fetched": 0, "fetch_failed": 0, "accepted": 0,
               "rejected": 0, "flagged_pathways": 0, "missing_gre": 0, "deadlines_found": 0}
    rows_inserted = rows_updated = rows_skipped = 0

    pool = None if dry_run else await db.get_pool()
    conn_ctx = pool.acquire() if pool else None
    conn = await conn_ctx.__aenter__() if conn_ctx else None

    try:
        for ref, meta in load_targets():
            metrics["targets"] += 1
            fetched = fetch_program_text(ref.program_url)
            if not fetched.ok:
                metrics["fetch_failed"] += 1
                review_records.append({"institution": ref.institution_name, "program": ref.program_name,
                                       "url": ref.program_url, "status": "fetch_failed", "error": fetched.error})
                print(f"  [FETCH-FAIL] {ref.institution_name} - {fetched.error}")
                if conn:
                    await db.log_scrape(conn, {"program_url": ref.program_url, "institution_name": ref.institution_name,
                                               "program_name": ref.program_name, "status": "fetch_failed",
                                               "issues": [fetched.error], "http_bytes": 0})
                continue

            metrics["fetched"] += 1
            reqs = extract_requirements(fetched.text)
            deadline = extract_deadline(fetched.text, intake_year=INTAKE_YEAR)
            pathways = classify_pathways(fetched.text)
            pid = str(uuid.uuid4())

            institution_id = None
            if conn:
                institution_id = await db.resolve_institution_id(conn, ref.institution_name)

            program = {
                "id": pid, "canonical_institution_id": institution_id,
                "institution_name": ref.institution_name,
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
                      "detected_pathways": [p["pathway_type"] for p in vr.accepted_pathways],
                      "deadline": {"date": deadline.deadline_date.isoformat() if deadline.deadline_date else None,
                                   "is_rolling": deadline.is_rolling, "confidence": deadline.confidence}}

            if not vr.accepted:
                metrics["rejected"] += 1
                review_records.append({**record, "status": "rejected"})
                print(f"  [REJECT] {ref.institution_name:38s} conf={vr.confidence} issues={vr.issues[:2]}")
                if conn:
                    await db.log_scrape(conn, {"program_url": ref.program_url, "institution_name": ref.institution_name,
                                               "program_name": ref.program_name, "status": "rejected",
                                               "confidence": vr.confidence, "issues": vr.issues,
                                               "missing_fields": vr.missing_fields, "http_bytes": fetched.bytes_len})
                continue

            metrics["accepted"] += 1
            accepted_records.append(record)
            if vr.flagged_pathways:
                review_records.append({"institution": ref.institution_name, "program": ref.program_name,
                                       "status": "flagged_pathways", "flagged": vr.flagged_pathways})

            if conn:
                real_id, status = await db.upsert_program(conn, program)
                rows_inserted += status == "inserted"
                rows_updated += status == "updated"
                # On an UPDATE (row already existed from a prior run), upsert_program
                # returns the EXISTING row's id, which can differ from the pid
                # generated above. Every downstream write (pathways, deadline) must
                # key off the real id or it 23503s against the FK to masters_programs.
                if real_id != pid:
                    for pw in pathway_rows:
                        pw["masters_program_id"] = real_id
                    pid = real_id

                for pw in vr.accepted_pathways:
                    await db.upsert_pathway(conn, pw)

                if deadline.deadline_date or deadline.is_rolling:
                    # canonical.masters_program_deadlines.deadline_type is CHECK-constrained to
                    # priority|final|funding_consideration|round_1|round_2|round_3|rolling. The
                    # extractor only finds one clear deadline sentence per page (doesn't yet
                    # distinguish priority/round-based multi-deadline tables), so 'final' is the
                    # honest default for a single stated date.
                    d_status = await db.upsert_deadline(conn, {
                        "masters_program_id": pid,
                        "deadline_type": "rolling" if deadline.is_rolling else "final",
                        "deadline_date": deadline.deadline_date, "is_rolling": deadline.is_rolling,
                        "intake_term": INTAKE_TERM, "intake_year": INTAKE_YEAR,
                        "notes": deadline.raw_sentence, "source_url": ref.program_url,
                        "confidence_score": deadline.confidence,
                    })
                    if d_status in ("inserted", "updated"):
                        metrics["deadlines_found"] += 1
                    rows_inserted += d_status == "inserted"
                    rows_updated += d_status == "updated"
                    rows_skipped += d_status == "skipped_lower_confidence"

                await db.log_scrape(conn, {"program_url": ref.program_url, "institution_name": ref.institution_name,
                                           "program_name": ref.program_name, "status": "accepted",
                                           "confidence": vr.confidence, "issues": vr.issues,
                                           "missing_fields": vr.missing_fields, "http_bytes": fetched.bytes_len})

            print(f"  [ACCEPT] {ref.institution_name:38s} conf={vr.confidence} gre={program['gre_requirement']:8s} "
                  f"deadline={deadline.deadline_date or ('rolling' if deadline.is_rolling else 'none')} "
                  f"pathways={record['detected_pathways']}")
    finally:
        if conn_ctx:
            await conn_ctx.__aexit__(None, None, None)

    dups = dedupe_batch(accepted_records)
    metrics["duplicate_keys"] = len(dups)

    with open(os.path.join(TMP, "scrape_dryrun.json"), "w", encoding="utf-8") as f:
        json.dump(accepted_records, f, indent=2, default=str)
    with open(os.path.join(TMP, "scrape_review.json"), "w", encoding="utf-8") as f:
        json.dump(review_records, f, indent=2, default=str)

    # Gate 2 failure semantics: fail the run on rows_fetched/rows_attempted
    # hitting zero (source returned nothing / parse produced nothing), NOT on
    # rows_modified (inserted+updated) hitting zero — an idempotent rerun that
    # changes nothing is a legitimate no-op pass, not a failure. This is the
    # exact bug shape the UG deadline-cycle incident had (memory
    # audit_full_app_2026-08-08): don't reproduce it here.
    success = metrics["targets"] > 0 and metrics["fetched"] > 0
    failure_reason = None
    if metrics["targets"] == 0:
        failure_reason = "no targets configured"
    elif metrics["fetched"] == 0:
        failure_reason = "every target fetch failed"

    if conn := (pool and await pool.acquire()):
        try:
            await db.log_execution(
                conn, scraper_name=SCRAPER_NAME, started_at=started_at,
                rows_inserted=rows_inserted, rows_updated=rows_updated, rows_skipped=rows_skipped,
                success=success, failure_reason=failure_reason, diagnostics=metrics,
            )
        finally:
            await pool.release(conn)

    print("\n=== DATA QUALITY METRICS ===")
    print(json.dumps(metrics, indent=2))
    print(f"rows_inserted={rows_inserted} rows_updated={rows_updated} rows_skipped={rows_skipped} success={success}")
    if dry_run:
        print("[--dry-run] Wrote tmp/scrape_dryrun.json + tmp/scrape_review.json only. No DB writes.")
    else:
        print("Wrote tmp/scrape_dryrun.json (accepted, for debugging) + tmp/scrape_review.json (flagged/rejected).")

    return {"metrics": metrics, "rows_inserted": rows_inserted, "rows_updated": rows_updated,
            "rows_skipped": rows_skipped, "success": success, "failure_reason": failure_reason}


async def _main_async(dry_run: bool) -> dict:
    try:
        return await run(dry_run=dry_run)
    finally:
        if not dry_run:
            await db.close_pool()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip all DB writes; only emit tmp/scrape_dryrun.json + tmp/scrape_review.json for local debugging.")
    args = parser.parse_args()

    result = asyncio.run(_main_async(args.dry_run))

    if not result["success"]:
        raise SystemExit(f"masters ingest failed: {result['failure_reason']}")


if __name__ == "__main__":
    main()
