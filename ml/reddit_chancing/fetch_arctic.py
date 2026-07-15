"""Bounded fetch from Arctic Shift (no Reddit API key needed) -> scrub -> extract -> CSV.

Deliberately different from run.py's PRAW path: this hits a third-party mirror
of Reddit data, not Reddit's own API. Bound the volume (MAX_POSTS) and never
persist raw or scrubbed post TEXT to disk -- only the final structured,
de-identified rows leave memory.
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
from extract import extract

BASE = "https://arctic-shift.photon-reddit.com/api/posts/search"
SUBREDDIT = "collegeresults"
MAX_POSTS = 300          # bounded -- not a full-subreddit crawl
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
            # 422 with a "slow down"/timeout body is this mirror's soft rate-limit
            # signal, not a malformed-request error -- retry it like 429/5xx.
            retryable = e.code == 429 or e.code >= 500 or (
                e.code == 422 and re.search(r"slow down|timeout", body, re.I)
            )
            if retryable:
                time.sleep(2 ** attempt * 3)   # backoff and retry
                continue
            raise   # 4xx other than 429 (e.g. malformed request) -- don't retry blindly
        except (TimeoutError, urllib.error.URLError, OSError) as e:
            # raw socket/connection failures (not an HTTP status) -- also retryable
            print(f"Network error on attempt {attempt + 1}/{retries} for before={before}: {e}",
                  file=sys.stderr)
            time.sleep(2 ** attempt * 3)
            continue
    raise RuntimeError(f"fetch_page failed after {retries} retries (before={before})")


def completeness(a) -> float:
    core = [a.gpa_uw or a.gpa_w, a.sat_total or a.act_composite or a.test_optional_flag,
            bool(a.colleges), a.geography_region, a.ec_tier]
    return sum(1 for c in core if c) / len(core)


def main(out_path: str = "applicant_outcomes.csv", allow_llm: bool = False):
    rows, kept, dropped, before = [], 0, 0, None
    seen_hashes: set[str] = set()

    try:
        while kept < MAX_POSTS:
            try:
                page = fetch_page(before)
            except (urllib.error.HTTPError, RuntimeError) as e:
                print(f"Giving up on further pages after fetch error: {e}. "
                      f"Writing out the {len(rows)} rows collected so far.", file=sys.stderr)
                break
            if not page:
                break
            before = min(p["created_utc"] for p in page)   # page backward in time

            for post in page:
                if kept >= MAX_POSTS:
                    break
                raw_text = f"{post.get('title','')}\n{post.get('selftext','')}"
                if not raw_text.strip() or raw_text.strip() == "\n":
                    continue
                scrubbed = scrub_text(raw_text)             # PII stripped before anything else
                del raw_text                                # never referenced again

                aid = hash_id(post["id"])
                if aid in seen_hashes:
                    continue
                seen_hashes.add(aid)

                try:
                    appl, method = extract(scrubbed, allow_llm=allow_llm)
                except Exception:
                    dropped += 1
                    continue
                del scrubbed                                # scrubbed text also discarded post-extraction

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

            print(f"...{kept} posts processed, {len(rows)} decision rows so far", file=sys.stderr)
            time.sleep(3)   # be polite to the mirror -- it asked us to slow down earlier
    finally:
        # Always persist whatever we collected, even on a fetch error or Ctrl-C.
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            if rows:
                w = csv.DictWriter(f, fieldnames=rows[0].keys())
                w.writeheader()
                w.writerows(rows)
        print(f"DONE: posts kept={kept} dropped={dropped} -> {len(rows)} decision rows -> {out_path}")


if __name__ == "__main__":
    main(allow_llm="--llm" in sys.argv)
