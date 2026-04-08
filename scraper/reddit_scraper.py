#!/usr/bin/env python3
# CollegeOS Auto-generated scraper/reddit_scraper.py — do not edit manually
"""
Reddit Chance-Me Scraper
────────────────────────
Fetches posts from r/chanceme, r/ApplyingToCollege, r/collegeresults.
Extracts structured applicant + outcome data and upserts to chance_me_posts.

Authentication modes
────────────────────
1. OAuth (preferred, 60 req/min):
     Set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET.
     Register a free app at https://www.reddit.com/prefs/apps (type: script).

2. Public JSON API (no credentials required, ~10 req/min):
     Leave REDDIT_CLIENT_ID unset. No sign-up needed. The scraper will hit
     https://www.reddit.com/r/<sub>/top.json directly with a custom User-Agent.
     Slower but fully functional for data gathering.

Required environment variables
───────────────────────────────
    DATABASE_URL

Optional — OAuth path (leave unset to use public API)
────────────────────────────────────────────────────────
    REDDIT_CLIENT_ID
    REDDIT_CLIENT_SECRET
    REDDIT_USER_AGENT      (e.g. "CollegeOS/1.0 by YourUsername")
    REDDIT_USERNAME        (for script-auth)
    REDDIT_PASSWORD

Optional — tuning
─────────────────
    POSTS_PER_SUBREDDIT    (default 500)

Exit codes: 0 = success, 1 = failure.
"""

import os
import re
import sys
import time
import logging
import datetime
from typing import Optional

import psycopg2
import psycopg2.extras
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("reddit_scraper")

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.environ["DATABASE_URL"]
REDDIT_CLIENT_ID = os.environ.get("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.environ.get("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT = os.environ.get("REDDIT_USER_AGENT", "CollegeOS/1.0 (+https://github.com/ultramagnus23/CollegeOS)")
REDDIT_USERNAME = os.environ.get("REDDIT_USERNAME", "")
REDDIT_PASSWORD = os.environ.get("REDDIT_PASSWORD", "")
POSTS_PER_SUBREDDIT = int(os.environ.get("POSTS_PER_SUBREDDIT", "500"))

USE_OAUTH = bool(REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET)

SUBREDDITS = ["chanceme", "ApplyingToCollege", "collegeresults"]

MAJOR_CATEGORIES = {
    "cs": "CS", "computer science": "CS", "software": "CS", "coding": "CS",
    "engineering": "Engineering", "mechanical": "Engineering", "electrical": "Engineering",
    "civil": "Engineering", "chemical": "Engineering", "biomedical": "Engineering",
    "business": "Business", "finance": "Business", "accounting": "Business",
    "economics": "Business", "marketing": "Business", "management": "Business",
    "medicine": "PreMed", "premed": "PreMed", "pre-med": "PreMed",
    "biology": "PreMed", "biochemistry": "PreMed", "nursing": "PreMed",
    "physics": "STEM", "chemistry": "STEM", "math": "STEM",
    "mathematics": "STEM", "statistics": "STEM", "data science": "STEM",
    "humanities": "Humanities", "history": "Humanities", "english": "Humanities",
    "philosophy": "Humanities", "political science": "Humanities", "sociology": "Humanities",
    "psychology": "Humanities", "communications": "Humanities",
    "art": "Arts", "design": "Arts", "music": "Arts", "film": "Arts",
    "theater": "Arts", "architecture": "Arts",
    "undecided": "Undecided", "open": "Undecided",
}

US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}

# Pre-compiled regexes for performance
_RE_GPA_UW = re.compile(
    r'(?:uw(?:eighted)?[:\s]+|unweighted[:\s]+|gpa[:\s]+)([\d]+\.[\d]+)',
    re.I)
_RE_GPA_GENERIC = re.compile(r'([\d]+\.[\d]+)\s*(?:uw|gpa|unweighted)', re.I)
_RE_SAT = re.compile(
    r'(?:sat[:\s]+|combined[:\s]+)([\d]{3,4})'
    r'|(?:^|\s)(1[0-5]\d{2})\s*(?:sat|/1600)',
    re.I | re.M)
_RE_ACT = re.compile(
    r'(?:act[:\s]+)([\d]{1,2})'
    r'|(?:^|\s)([\d]{1,2})\s*act(?:\b)',
    re.I | re.M)
_RE_AP = re.compile(r'(\d+)\s*(?:ap\s*(?:classes|courses|exams)?)', re.I)
_RE_EC = re.compile(r'(\d+)\s*(?:ec[s]?|extracurricular[s]?)', re.I)
_RE_FIRST_GEN = re.compile(r'first[\s\-]?gen(?:eration)?', re.I)

# College decision keywords
_ACCEPT_WORDS = re.compile(
    r'\b(?:accepted|admitted|got in|acceptance|a\s*→|→\s*A)\b', re.I)
_REJECT_WORDS = re.compile(
    r'\b(?:rejected|denial|denied|rej(?:ected)?\.?|r\s*→|→\s*R)\b', re.I)
_WAITLIST_WORDS = re.compile(
    r'\b(?:waitlisted|wait[\s\-]?list(?:ed)?|wl\s*→|→\s*WL)\b', re.I)
_DEFER_WORDS = re.compile(
    r'\b(?:deferred|defer(?:red)?|d\s*→|→\s*D)\b', re.I)

# ── Parsing helpers ───────────────────────────────────────────────────────────


def _parse_gpa(text: str) -> Optional[float]:
    for pat in [_RE_GPA_UW, _RE_GPA_GENERIC]:
        m = pat.search(text)
        if m:
            try:
                v = float(m.group(1))
                if 0.5 <= v <= 4.5:
                    return v
            except (ValueError, IndexError):
                pass
    return None


def _parse_sat(text: str) -> Optional[int]:
    for m in _RE_SAT.finditer(text):
        raw = m.group(1) or m.group(2)
        if raw:
            try:
                v = int(raw)
                if 400 <= v <= 1600:
                    return v
            except ValueError:
                pass
    return None


def _parse_act(text: str) -> Optional[int]:
    for m in _RE_ACT.finditer(text):
        raw = m.group(1) or m.group(2)
        if raw:
            try:
                v = int(raw)
                if 1 <= v <= 36:
                    return v
            except ValueError:
                pass
    return None


def _parse_ap_count(text: str) -> Optional[int]:
    m = _RE_AP.search(text)
    return int(m.group(1)) if m else None


def _parse_ec_count(text: str) -> Optional[int]:
    m = _RE_EC.search(text)
    return int(m.group(1)) if m else None


def _parse_state(text: str) -> Optional[str]:
    lower = text.lower()
    for name, code in US_STATES.items():
        if name in lower:
            return code
    # Look for 2-letter uppercase state codes like "TX" or "NY"
    m = re.search(r'\b([A-Z]{2})\b', text)
    if m and m.group(1) in US_STATES.values():
        return m.group(1)
    return None


def _parse_major(text: str) -> str:
    lower = text.lower()
    for keyword, category in MAJOR_CATEGORIES.items():
        if keyword in lower:
            return category
    return "Undecided"


def _parse_first_gen(text: str) -> Optional[bool]:
    return True if _RE_FIRST_GEN.search(text) else None


def _parse_ethnicity(text: str) -> Optional[str]:
    lower = text.lower()
    ethnicities = [
        "asian", "white", "black", "hispanic", "latino", "latina",
        "african american", "native american", "pacific islander", "multiracial",
    ]
    for eth in ethnicities:
        if eth in lower:
            return eth.title()
    return None


def _determine_outcome(snippet: str) -> Optional[str]:
    """Return outcome string based on decision keywords near a college name."""
    if _WAITLIST_WORDS.search(snippet):
        return "waitlisted"
    if _DEFER_WORDS.search(snippet):
        return "deferred"
    if _ACCEPT_WORDS.search(snippet):
        return "accepted"
    if _REJECT_WORDS.search(snippet):
        return "rejected"
    return None


# Known colleges to look for in posts
KNOWN_COLLEGES = [
    "MIT", "Harvard", "Stanford", "Yale", "Princeton", "Columbia", "UPenn",
    "Brown", "Dartmouth", "Cornell", "Duke", "Northwestern", "UChicago",
    "Johns Hopkins", "Vanderbilt", "Rice", "Notre Dame", "Georgetown",
    "Emory", "Carnegie Mellon", "CMU", "Michigan", "Virginia", "UVA",
    "UC Berkeley", "UCLA", "UCSD", "UC Davis", "UC Santa Barbara",
    "NYU", "Boston University", "BU", "Tufts", "Lehigh", "RPI",
    "Georgia Tech", "Gatech", "UT Austin", "Texas A&M", "Purdue",
    "Penn State", "Ohio State", "Wisconsin", "Minnesota", "Illinois",
    "Caltech", "Harvey Mudd", "Pomona", "Swarthmore", "Williams",
    "Amherst", "Wellesley", "Middlebury", "Colby", "Bowdoin", "Bates",
    "Wesleyan", "Trinity", "Hamilton", "Colgate", "Holy Cross",
    "Case Western", "Tulane", "Wake Forest", "SMU", "TCU",
    "Northeastern", "Fordham", "American University", "AU",
    "University of Washington", "UW", "University of Florida", "UF",
    "Florida State", "FSU", "NC State", "UNC", "Chapel Hill",
    "University of Maryland", "UMD", "University of Connecticut", "UCONN",
    "Rutgers", "Temple", "Drexel", "Villanova", "Marquette",
    "University of Rochester", "Rochester", "WashU", "Washington University",
    "Brandeis", "Worcester Polytechnic", "WPI",
    "University of Southern California", "USC",
    "University of Notre Dame",
    "London School of Economics", "LSE", "Oxford", "Cambridge",
    "Imperial College", "UCL", "King's College", "Edinburgh",
    "University of Toronto", "UofT", "McGill", "UBC", "Waterloo",
]

_COLLEGE_PATTERNS = [(c, re.compile(r'\b' + re.escape(c) + r'\b', re.I))
                     for c in KNOWN_COLLEGES]


def _extract_college_outcomes(text: str) -> list[dict]:
    """
    Return a list of {college_name, outcome} dicts found in the post text.
    Uses a ±200-character window around each college mention to detect outcome.
    """
    results = []
    seen = set()
    for college_name, pattern in _COLLEGE_PATTERNS:
        for m in pattern.finditer(text):
            start = max(0, m.start() - 200)
            end = min(len(text), m.end() + 200)
            snippet = text[start:end]
            outcome = _determine_outcome(snippet)
            if outcome and college_name.lower() not in seen:
                seen.add(college_name.lower())
                results.append({"college_name": college_name, "outcome": outcome})
    return results


def parse_post(post) -> list[dict]:
    """
    Parse a PRAW submission into a list of DB row dicts (one per college).
    Returns empty list if nothing useful is found.
    """
    full_text = f"{post.title}\n\n{post.selftext}"

    gpa = _parse_gpa(full_text)
    sat = _parse_sat(full_text)
    act = _parse_act(full_text)
    num_aps = _parse_ap_count(full_text)
    num_ecs = _parse_ec_count(full_text)
    state = _parse_state(full_text)
    major = _parse_major(full_text)
    first_gen = _parse_first_gen(full_text)
    ethnicity = _parse_ethnicity(full_text)

    college_outcomes = _extract_college_outcomes(full_text)
    if not college_outcomes:
        return []

    post_date = datetime.datetime.utcfromtimestamp(post.created_utc)
    post_url = f"https://reddit.com{post.permalink}"

    rows = []
    for co in college_outcomes:
        # Validation
        if gpa is not None and not (0.5 <= gpa <= 4.5):
            continue
        if sat is not None and not (400 <= sat <= 1600):
            continue
        if act is not None and not (1 <= act <= 36):
            continue
        rows.append({
            "reddit_post_id": post.id,
            "college_name": co["college_name"],
            "gpa": gpa,
            "sat_score": sat,
            "act_score": act,
            "num_aps": num_aps,
            "num_ecs": num_ecs,
            "state": state,
            "intended_major": major,
            "ethnicity": ethnicity,
            "first_gen": first_gen,
            "outcome": co["outcome"],
            "post_url": post_url,
            "post_date": post_date,
        })
    return rows


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_connection():
    return psycopg2.connect(DATABASE_URL)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def upsert_rows(conn, rows: list[dict]) -> int:
    """Upsert rows into chance_me_posts. Returns count inserted/updated."""
    if not rows:
        return 0
    sql = """
        INSERT INTO chance_me_posts
          (reddit_post_id, college_name, gpa, sat_score, act_score,
           num_aps, num_ecs, state, intended_major, ethnicity, first_gen,
           outcome, post_url, post_date)
        VALUES
          (%(reddit_post_id)s, %(college_name)s, %(gpa)s, %(sat_score)s, %(act_score)s,
           %(num_aps)s, %(num_ecs)s, %(state)s, %(intended_major)s, %(ethnicity)s, %(first_gen)s,
           %(outcome)s, %(post_url)s, %(post_date)s)
        ON CONFLICT (reddit_post_id, college_name)
          DO UPDATE SET
            outcome    = EXCLUDED.outcome,
            updated_at = NOW()
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, rows)
    conn.commit()
    return len(rows)


# ── Reddit client ─────────────────────────────────────────────────────────────

def _make_session() -> requests.Session:
    """Return a requests.Session with the correct User-Agent header."""
    s = requests.Session()
    s.headers.update({"User-Agent": REDDIT_USER_AGENT})
    return s


def _public_fetch_listing(session: requests.Session, subreddit: str,
                          sort: str = "top", time_filter: str = "all",
                          limit: int = 100, after: Optional[str] = None) -> dict:
    """
    Fetch one page from Reddit's public .json endpoint (no credentials needed).
    Retries on 429 with the Retry-After header.
    """
    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json"
    params: dict = {"limit": limit, "raw_json": 1}
    if sort == "top":
        params["t"] = time_filter
    if after:
        params["after"] = after

    for attempt in range(5):
        resp = session.get(url, params=params, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 120))
            log.warning(f"Rate limited (public API), waiting {wait}s …")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Reddit public API failed after 5 attempts for r/{subreddit}/{sort}")


def fetch_posts_public(subreddit_name: str, limit: int):
    """
    Yield posts using the public JSON API.
    Fetches top-all-time (up to `limit` posts, paginating as needed) then new.
    Rate limit: ~10 req/min → 6-second delay between pages.
    """
    session = _make_session()
    seen_ids: set = set()
    delay = 6.5  # conservative for the ~10 req/min public limit

    for sort, time_filter in [("top", "all"), ("new", None)]:
        after = None
        collected = 0
        while collected < limit:
            time.sleep(delay)
            data = _public_fetch_listing(
                session, subreddit_name, sort=sort,
                time_filter=time_filter or "all",
                limit=min(100, limit - collected),
                after=after,
            )
            children = data.get("data", {}).get("children", [])
            if not children:
                break
            for child in children:
                if child.get("kind") != "t3":
                    continue
                post_data = child["data"]
                if post_data.get("stickied"):
                    continue
                post_id = post_data.get("id")
                if post_id and post_id not in seen_ids:
                    seen_ids.add(post_id)
                    yield _PublicPost(post_data)
                    collected += 1
            after = data.get("data", {}).get("after")
            if not after:
                break


class _PublicPost:
    """Thin wrapper so public-API post dicts look like PRAW Submission objects."""

    def __init__(self, data: dict):
        self.id = data.get("id", "")
        self.title = data.get("title", "")
        self.selftext = data.get("selftext", "")
        self.permalink = data.get("permalink", "")
        self.created_utc = data.get("created_utc", 0)
        self.subreddit = data.get("subreddit", "")


def fetch_posts_oauth(subreddit_name: str, limit: int):
    """Yield posts using PRAW (OAuth).  Requires REDDIT_CLIENT_ID etc."""
    import praw  # only imported when credentials are present

    kwargs = dict(
        client_id=REDDIT_CLIENT_ID,
        client_secret=REDDIT_CLIENT_SECRET,
        user_agent=REDDIT_USER_AGENT,
    )
    if REDDIT_USERNAME and REDDIT_PASSWORD:
        kwargs.update(username=REDDIT_USERNAME, password=REDDIT_PASSWORD)
    reddit = praw.Reddit(**kwargs)

    sub = reddit.subreddit(subreddit_name)
    seen_ids: set = set()

    for listing in [sub.new(limit=limit), sub.hot(limit=limit)]:
        for post in listing:
            if post.id not in seen_ids:
                seen_ids.add(post.id)
                yield post


def fetch_posts(subreddit_name: str, limit: int):
    """Dispatch to OAuth or public path depending on credentials."""
    if USE_OAUTH:
        yield from fetch_posts_oauth(subreddit_name, limit)
    else:
        yield from fetch_posts_public(subreddit_name, limit)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    log.info("Reddit scraper started.")
    if USE_OAUTH:
        log.info("Auth mode: OAuth (REDDIT_CLIENT_ID set)")
    else:
        log.info("Auth mode: public JSON API (no credentials — slower but no sign-up required)")

    conn = None
    total_posts = 0
    total_inserted = 0
    total_skipped_validation = 0
    total_skipped_duplicate = 0

    try:
        conn = get_connection()

        for subreddit_name in SUBREDDITS:
            log.info(f"Scraping r/{subreddit_name} (up to {POSTS_PER_SUBREDDIT} posts)...")
            sub_posts = 0
            sub_inserted = 0

            for post in fetch_posts(subreddit_name, POSTS_PER_SUBREDDIT):
                total_posts += 1
                sub_posts += 1

                try:
                    rows = parse_post(post)
                except Exception as e:
                    log.warning(f"Parse error on {post.id}: {e}")
                    total_skipped_validation += 1
                    continue

                if not rows:
                    total_skipped_validation += 1
                    continue

                try:
                    n = upsert_rows(conn, rows)
                    total_inserted += n
                    sub_inserted += n
                except psycopg2.errors.UniqueViolation:
                    conn.rollback()
                    total_skipped_duplicate += 1
                except Exception as e:
                    conn.rollback()
                    log.warning(f"DB error for post {post.id}: {e}")
                    total_skipped_validation += 1

            log.info(f"r/{subreddit_name}: {sub_posts} posts, {sub_inserted} rows inserted")

    except Exception as e:
        log.error(f"Fatal error: {e}", exc_info=True)
        return 1
    finally:
        if conn:
            conn.close()

    summary = (
        f"Scraped {total_posts} posts, inserted {total_inserted} rows, "
        f"skipped {total_skipped_validation} (validation failed), "
        f"skipped {total_skipped_duplicate} (duplicates)"
    )
    log.info(summary)
    print(f"ROWS_UPSERTED={total_inserted}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
