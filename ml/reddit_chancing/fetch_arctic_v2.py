"""Bigger bounded fetch from Arctic Shift, with a dual output:

1. Templated posts -> regex extraction -> applicant_outcomes.csv (same as before,
   just a higher cap).
2. Prose posts (regex can't parse them) -> scrubbed text queued into
   prose_queue.jsonl, capped at MAX_PROSE. That file is a TEMPORARY hand-off so
   the extraction can be done by an LLM directly (Claude reading the queue and
   emitting structured JSON) instead of an API call -- no ANTHROPIC_API_KEY
   needed. Delete prose_queue.jsonl once it's been read and processed; it holds
   scrubbed (PII-stripped) text, not raw text, but shouldn't outlive its use.
"""
from __future__ import annotations
import csv
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.request

if not os.environ.get("CR_SALT"):
    os.environ["CR_SALT"] = secrets.token_hex(16)
    print(f"CR_SALT not set -- generated one for this run: {os.environ['CR_SALT']}", file=sys.stderr)

from scrub import hash_id, scrub_text, coarsen_income
from extract import extract, looks_templated

BASE = "https://arctic-shift.photon-reddit.com/api/posts/search"
SUBREDDIT = "collegeresults"
MAX_POSTS = 700          # templated (regex-matched) posts to keep -- bigger than before
MAX_PROSE = 60           # prose posts to queue for manual (in-conversation) LLM extraction
PAGE_SIZE = 100
MIN_COMPLETENESS = 0.5


def fetch_page(before: int | None, *, retries: int = 5) -> list[dict]:
    params = f"subreddit={SUBREDDIT}&limit={PAGE_SIZE}&sort=desc&fields=title,selftext,created_utc,id"
    if before:
        params += f"&before={before}"
    url = f"{BASE}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "cr-research/0.1"})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)["data"]
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:300]
            print(f"HTTP {e.code} on attempt {attempt + 1}/{retries} for before={before}: {body}",
                  file=sys.stderr)
            retryable = e.code == 429 or e.code >= 500 or (
                e.code == 422 and re.search(r"slow down|timeout", body, re.I)
            )
            if retryable:
                time.sleep(2 ** attempt * 3)
                continue
            raise
        except (TimeoutError, urllib.error.URLError, OSError) as e:
            print(f"Network error on attempt {attempt + 1}/{retries} for before={before}: {e}",
                  file=sys.stderr)
            time.sleep(2 ** attempt * 3)
            continue
    raise RuntimeError(f"fetch_page failed after {retries} retries (before={before})")


def completeness(a) -> float:
    core = [a.gpa_uw or a.gpa_w, a.sat_total or a.act_composite or a.test_optional_flag,
            bool(a.colleges), a.geography_region, a.ec_tier]
    return sum(1 for c in core if c) / len(core)


def main(out_path: str = "applicant_outcomes.csv", prose_out_path: str = "prose_queue.jsonl"):
    rows, kept, dropped, before = [], 0, 0, None
    prose_queue: list[dict] = []
    seen_hashes: set[str] = set()

    try:
        while kept < MAX_POSTS:
            try:
                page = fetch_page(before)
            except (urllib.error.HTTPError, RuntimeError) as e:
                print(f"Giving up on further pages after fetch error: {e}. "
                      f"Writing out {len(rows)} regex rows + {len(prose_queue)} prose posts so far.",
                      file=sys.stderr)
                break
            if not page:
                break
            before = min(p["created_utc"] for p in page)

            for post in page:
                if kept >= MAX_POSTS:
                    break
                raw_text = f"{post.get('title','')}\n{post.get('selftext','')}"
                if not raw_text.strip() or raw_text.strip() == "\n":
                    continue
                scrubbed = scrub_text(raw_text)
                del raw_text

                aid = hash_id(post["id"])
                if aid in seen_hashes:
                    continue
                seen_hashes.add(aid)

                if looks_templated(scrubbed):
                    try:
                        appl, method = extract(scrubbed, allow_llm=False)
                    except Exception:
                        dropped += 1
                        continue
                    appl.income_band = coarsen_income(appl.income_band)
                    comp = completeness(appl)
                    if not appl.colleges:
                        dropped += 1
                        continue
                    for col in appl.colleges:
                        rows.append({
                            "applicant_id": aid,
                            "university_raw": col.university_raw,
                            "decision": col.decision.value,
                            "round": col.round.value,
                            "gpa_uw": appl.gpa_uw, "gpa_w": appl.gpa_w,
                            "sat_total": appl.sat_total, "act_composite": appl.act_composite,
                            "num_ap": appl.num_ap, "ec_tier": appl.ec_tier,
                            "gender": appl.gender, "first_gen": appl.first_gen,
                            "income_band": appl.income_band, "geography_region": appl.geography_region,
                            "international_flag": appl.international_flag,
                            "extraction_method": method, "completeness": round(comp, 2),
                            "needs_review": comp < MIN_COMPLETENESS,
                        })
                    kept += 1
                elif len(prose_queue) < MAX_PROSE:
                    prose_queue.append({"applicant_id": aid, "scrubbed_text": scrubbed})
                del scrubbed

            print(f"...{kept} templated posts kept, {len(prose_queue)}/{MAX_PROSE} prose posts queued, "
                  f"{len(rows)} decision rows so far", file=sys.stderr)
            time.sleep(3)
    finally:
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            if rows:
                w = csv.DictWriter(f, fieldnames=rows[0].keys())
                w.writeheader()
                w.writerows(rows)
        with open(prose_out_path, "w", encoding="utf-8") as f:
            for entry in prose_queue:
                f.write(json.dumps(entry) + "\n")
        print(f"DONE: templated kept={kept} dropped={dropped} -> {len(rows)} decision rows -> {out_path}")
        print(f"DONE: {len(prose_queue)} prose posts (scrubbed) queued -> {prose_out_path}")


if __name__ == "__main__":
    main()
