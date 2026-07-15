"""End-to-end runner: fetch (official Reddit API) -> scrub -> extract -> validate -> CSV.

Collection stays inside Reddit's official API + rate limits. This does NOT bulk-
harvest full history; it pulls the public listings the API exposes to your app.
"""
from __future__ import annotations
import csv
import os
import sys
import time

from scrub import hash_id, scrub_text, coarsen_income
from extract import extract
from schema import Applicant

MIN_COMPLETENESS = 0.5   # rows below this are kept but flagged for review


def completeness(a: Applicant) -> float:
    core = [a.gpa_uw or a.gpa_w, a.sat_total or a.act_composite or a.test_optional_flag,
            bool(a.colleges), a.geography_region, a.ec_tier]
    return sum(1 for c in core if c) / len(core)


def iter_posts(limit_per_listing: int = 1000):
    """Yield (post_id, title, selftext) using PRAW under YOUR credentials.

    Env: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT
    The API caps each listing near 1000 items; we sweep several listings and
    dedupe by id. That realistically yields low-thousands of recent posts.
    """
    try:
        import praw  # noqa
    except ImportError:
        sys.exit("pip install praw   (and set REDDIT_* env vars) -- see README")
    reddit = praw.Reddit(
        client_id=os.environ["REDDIT_CLIENT_ID"],
        client_secret=os.environ["REDDIT_CLIENT_SECRET"],
        user_agent=os.environ.get("REDDIT_USER_AGENT", "cr-research/0.1 by <you>"),
    )
    sub = reddit.subreddit("collegeresults")
    seen: set[str] = set()
    listings = [
        sub.top(time_filter="all", limit=limit_per_listing),
        sub.top(time_filter="year", limit=limit_per_listing),
        sub.new(limit=limit_per_listing),
        sub.hot(limit=limit_per_listing),
    ]
    for listing in listings:
        for post in listing:
            if post.id in seen or not post.selftext:
                continue
            seen.add(post.id)
            yield post.id, post.title, post.selftext
            time.sleep(0.2)          # be polite; well under rate limit


def main(out_path: str = "applicant_outcomes.csv", allow_llm: bool = False,
         model: str = "claude-opus-4-8"):
    rows, kept, dropped = [], 0, 0
    for post_id, title, body in iter_posts():
        text = scrub_text(f"{title}\n{body}")
        try:
            appl, method = extract(text, allow_llm=allow_llm, model=model)
        except Exception:
            dropped += 1
            continue
        appl.income_band = coarsen_income(appl.income_band)
        comp = completeness(appl)
        aid = hash_id(post_id)
        for col in appl.colleges:                 # explode: one row per college
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
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        if rows:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader(); w.writerows(rows)
    print(f"posts kept={kept} dropped={dropped} -> {len(rows)} decision rows -> {out_path}")


if __name__ == "__main__":
    # --llm enables the LLM path for prose posts; --bulk uses cheap Haiku instead of Opus.
    main(allow_llm="--llm" in sys.argv,
         model="claude-haiku-4-5" if "--bulk" in sys.argv else "claude-opus-4-8")
